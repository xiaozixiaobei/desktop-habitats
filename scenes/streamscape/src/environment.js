import * as THREE from 'three';
import { randomGenerator } from '../../shared/random.js';
import { noise } from '../../riverscape/src/math.js';
import { waterLitShader, waterTime } from '../../riverscape/src/water.js';
import { rockGeometry, mossLayer, plantFronds } from '../../riverscape/src/environment.js';
import { ROCKS } from './simulation.js';

export async function createEnvironment(scene) {
  const random = randomGenerator(33871), range = (a, b) => a + random() * (b - a);
  const loader = new THREE.TextureLoader();
  const load = async (name, repeat, color = false) => {
    const map = await loader.loadAsync(new URL(`../../riverscape/assets/${name}`, import.meta.url).href);
    map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(repeat, repeat);
    if (color) map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    return map;
  };
  const [sand, sandNormal, stone, stoneNormal] = await Promise.all([
    load('sand_01_diff.jpg', 8, true), load('sand_01_nor_gl.jpg', 8),
    load('rock_boulder_dry_diff.jpg', 2, true), load('rock_boulder_dry_nor_gl.jpg', 2),
  ]);
  function wet(material) {
    material.onBeforeCompile = shader => {
      waterLitShader(shader);
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        vec2 causticUV = vWaterPosition.xz;
        float waveA = sin(causticUV.x * 3.1 + sin(causticUV.y * 2.4 + waterTime * .6) + waterTime * .9);
        float waveB = sin(causticUV.y * 3.9 + sin(causticUV.x * 1.8 - waterTime * .4));
        float caustic = pow(max(0., 1. - abs(waveA + waveB) * 2.), 7.);
        diffuseColor.rgb *= 1. + caustic * .2;
      `);
    };
    material.customProgramCacheKey = () => 'stream-wet';
    return material;
  }
  function floorY(x, z) {
    const channel = Math.exp(-Math.pow((x - .2 + z * .25) / (1.7 + Math.max(0, z) * .2), 2));
    return -.12 + .06 * Math.sin(x * 1.2 + z) + .03 * noise(x * 3, 0, z * 3) + .22 * (1-channel);
  }
  const ground = new THREE.PlaneGeometry(38, 24, 160, 100);
  ground.rotateX(-Math.PI / 2);
  const gp = ground.attributes.position;
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i), z = gp.getZ(i);
    gp.setY(i, floorY(x,z));
  }
  const groundColors = [];
  for (let i = 0; i < gp.count; i++) {
    const shade = .1 + .9 * THREE.MathUtils.smoothstep(gp.getZ(i), -7, 2);
    groundColors.push(shade, shade, shade);
  }
  ground.setAttribute('color', new THREE.Float32BufferAttribute(groundColors, 3));
  ground.computeVertexNormals();
  const bed = new THREE.Mesh(ground, wet(new THREE.MeshStandardMaterial({ map: sand, normalMap: sandNormal, normalScale: new THREE.Vector2(.4, .4), color: '#c9c4b0', vertexColors: true, roughness: .88 })));
  bed.name = 'Pale gravel streambed'; bed.receiveShadow = true; scene.add(bed);
  const rockMaterial = mossLayer(new THREE.MeshStandardMaterial({ map: stone, normalMap: stoneNormal,
    vertexColors: true, normalScale: new THREE.Vector2(.65, .65), color: '#696e61', roughness: .9 }), '#38482b', '#14230f');
  const mossSamples = [];
  const distant = Array.from({length: 9}, (_, i) => ({x: -12 + i * 3, y: .8, z: -8.3, sx: range(1.6,2.7), sy: range(1.6,3.3), sz: 1.25}));
  for (const [i, r] of [...ROCKS, ...distant].entries()) {
    const g = rockGeometry(5 + i * 3.17, i < ROCKS.length ? 80 : 32), p = g.attributes.position;
    // Water wears the sharpest facets down, retaining the stone's individual planes.
    for (let j = 0; j < p.count; j++) {
      const radius = Math.hypot(p.getX(j), p.getY(j), p.getZ(j));
      const erosion = (.6 * Math.min(radius, 1.08) + .4) / radius;
      p.setXYZ(j, p.getX(j) * erosion, p.getY(j) * erosion, p.getZ(j) * erosion);
    }
    g.computeVertexNormals();
    const rock = new THREE.Mesh(g, rockMaterial);
    rock.position.set(r.x, r.y, r.z); rock.scale.set(r.sx, r.sy, r.sz);
    rock.updateMatrix();
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(rock.matrix);
    const point = new THREE.Vector3(), normal = new THREE.Vector3(), coverage = [];
    const uv = g.attributes.uv;
    for (let j = 0; j < p.count; j++) {
      point.fromBufferAttribute(p,j).applyMatrix4(rock.matrix);
      normal.fromBufferAttribute(g.attributes.normal,j).applyMatrix3(normalMatrix).normalize();
      const age = noise(point.x * 1.3, point.y * 1.3, point.z * 1.3);
      const fine = noise(point.x * 4, point.y * 4, point.z * 4);
      const moss = THREE.MathUtils.smoothstep(age * .7 + fine * .3 + Math.max(0,normal.y)*.2, .48, .8);
      coverage.push(moss);
      uv.setXY(j, uv.getX(j) * 1.4, uv.getY(j) * 1.4);
      if (moss > .4 && point.y > .2 && point.y < 4 && i < ROCKS.length)
        mossSamples.push({position:point.clone(), normal:normal.clone(), coverage:moss});
    }
    g.setAttribute('moss',new THREE.Float32BufferAttribute(coverage,1));
    rock.castShadow = rock.receiveShadow = true; scene.add(rock);
  }
  if (mossSamples.length) plantFronds(scene, [{samples:mossSamples, count:1500, scale:.38}]);
  // Soft contact occlusion anchors boulders to the sediment beneath their overhangs.
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  const shade = context.createRadialGradient(64,64,8,64,64,64);
  shade.addColorStop(0,'rgba(0,0,0,.8)'); shade.addColorStop(.5,'rgba(0,0,0,.35)'); shade.addColorStop(1,'rgba(0,0,0,0)');
  context.fillStyle=shade; context.fillRect(0,0,128,128);
  const shadowMaterial = new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(canvas), transparent:true, depthWrite:false, opacity:.6});
  for (const r of ROCKS) {
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(r.sx*3, r.sz*3), shadowMaterial);
    shadow.rotation.x=-Math.PI/2; shadow.position.set(r.x,floorY(r.x,r.z)+.014,r.z); scene.add(shadow);
  }
  // Instanced, water-rounded cobbles: dense on the banks, sparse on the central run.
  const pebbleGeometry = rockGeometry(37, 12);
  const pebbleMaterial = wet(new THREE.MeshStandardMaterial({ map: stone, normalMap: stoneNormal, normalScale: new THREE.Vector2(.2, .2), roughness: .78 }));
  const gravel = new THREE.InstancedMesh(pebbleGeometry, pebbleMaterial, 1200);
  const object = new THREE.Object3D(), tint = new THREE.Color();
  for (let i = 0; i < gravel.count; i++) {
    const x = range(-14, 14), z = range(-7, 6);
    const channel = Math.exp(-Math.pow((x + z * .25) / 2,2));
    const radius = (.025 + Math.pow(random(),3) * .22) * (1.5 - channel);
    object.position.set(x, floorY(x,z) + radius * .25, z);
    object.scale.set(radius * range(1, 1.7), radius * range(.5, .9), radius);
    object.rotation.set(range(0, .4), range(0, Math.PI), range(0, .3)); object.updateMatrix();
    gravel.setMatrixAt(i, object.matrix);
    tint.setHSL(range(.07, .14), range(.04, .18), range(.12, .40)); gravel.setColorAt(i, tint);
  }
  gravel.receiveShadow = true; gravel.castShadow = true; scene.add(gravel);
  const grit = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0), wet(new THREE.MeshStandardMaterial({color:'#afa28b',roughness:1})),6000);
  for (let i=0;i<grit.count;i++) {
    const x=range(-12,12), z=range(-6,6), size=range(.007,.024);
    object.position.set(x,floorY(x,z)+size*.3,z); object.scale.set(size,size*.5,size); object.updateMatrix();
    grit.setMatrixAt(i,object.matrix); grit.setColorAt(i,tint.setHSL(range(.08,.16),range(.08,.22),range(.2,.65)));
  }
  grit.receiveShadow=true;scene.add(grit);

}

export function createParticles(scene) {
  const random = randomGenerator(429), count = 150;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(Array.from({ length: count * 3 }, (_, i) => i % 3 === 0 ? random() * 24 - 12 : i % 3 === 1 ? random() * 9 : random() * 11 - 6), 3));
  const material = new THREE.ShaderMaterial({
    uniforms: { time: waterTime, pixelScale: { value: 600 } },
    vertexShader: `uniform float time; uniform float pixelScale; varying float opacity;
      void main() { vec3 p = position; p.x = mod(p.x + 12. + time * .5, 24.) - 12.;
        p.y += sin(time * .8 + p.x) * .025;
        vec4 view = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * view;
        gl_PointSize = clamp(pixelScale * .012 / -view.z, 1., 2.5); opacity = .16; }`,
    fragmentShader: `varying float opacity; void main(){ float d = length(gl_PointCoord - .5); gl_FragColor = vec4(.74,.86,.80,opacity * (1. - smoothstep(.15,.5,d))); }`,
    transparent: true, depthWrite: false,
  });
  const points = new THREE.Points(geometry, material); points.frustumCulled = false; scene.add(points);
  return { update: scale => { material.uniforms.pixelScale.value = scale; } };
}
