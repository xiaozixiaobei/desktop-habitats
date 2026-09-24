import * as THREE from 'three';
import { makeAnatomy, applySkin, createFishMaterials } from './fish-anatomy.js';

// Integrate the spine's tangent, preserving body length. A travelling angular wave
// builds along the trunk and peduncle; the head counter-moves only slightly.
const SWIM_GLSL = /* glsl */ `
  // Part ids come from fish-anatomy.js: 4 and 5 are the pectorals, 1-3, 6 and 12 the other fins.
  attribute vec4 aSwim; // x: wave phase, y: wave angle, z: turning curvature, w: pectoral brake
  attribute float aFinPhase;
  attribute float aPart;
  attribute float aFinProgress;
  varying vec3 vSkinPoint;
  varying vec2 vFishUV;
  varying float vFishPart;
  const float PIVOT = 0.12;
  vec3 gSwimPosition;
  float spineAngle(float s) {
    float along = clamp(s / 0.57, 0.0, 1.0);
    return aSwim.z * s * (s < 0.0 ? 0.18 : 1.0)
      - 0.025 * aSwim.y * sin(aSwim.x)
      + aSwim.y * pow(along, 1.35) * sin(aSwim.x - s * 7.5);
  }
  vec3 finMotion(vec3 p) {
    if (aPart > 3.5 && aPart < 5.5) {
      float side = aPart < 4.5 ? 1.0 : -1.0;
      float beat = sin(aFinPhase + side * 0.9);
      p.z += side * aFinProgress * (0.013 * beat + 0.018 * aSwim.w);
      p.x += aFinProgress * (0.008 * beat - 0.033 * aSwim.w);
      p.y += aFinProgress * 0.008 * cos(aFinPhase + side * 0.9);
    } else if (aPart > 0.5 && aPart < 1.5) {
      // The trailing membrane lags behind the peduncle instead of acting as a paddle.
      p.z += aSwim.y * 0.045 * aFinProgress * aFinProgress
        * sin(aSwim.x - (PIVOT - p.x) * 7.5 - 0.65);
    } else if ((aPart > 1.5 && aPart < 6.5) || aPart > 11.5) {
      p.z += sin(aFinPhase - p.x * 10.0) * aFinProgress * 0.004;
    }
    return p;
  }
  vec3 bendSpine(vec3 p, inout vec3 n) {
    float s = PIVOT - p.x;
    float theta = spineAngle(s);
    vec2 spine = vec2(PIVOT, 0.0);
    float kappa = (spineAngle(s + 0.001) - spineAngle(s - 0.001)) / 0.002;
    if (s < 0.0) {
      float mid = spineAngle(s * 0.5);
      spine += vec2(-cos(mid), sin(mid)) * s;
    } else {
      float ds = s / 8.0;
      for (int i = 0; i < 8; i++) {
        float mid = spineAngle((float(i) + 0.5) * ds);
        spine += vec2(-cos(mid), sin(mid)) * ds;
      }
    }
    float c = cos(theta), sn = sin(theta);
    vec3 local = vec3(n.x / max(0.3, 1.0 - p.z * kappa), n.y, n.z);
    n = normalize(vec3(local.x * c + local.z * sn, local.y, -local.x * sn + local.z * c));
    return vec3(spine.x + p.z * sn, p.y, spine.y + p.z * c);
  }
`;

function applySwimming(material, withColor = true) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>\n${SWIM_GLSL}`,
    );
    if (withColor) {
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <beginnormal_vertex>",
          /* glsl */ `
          vec3 objectNormal = vec3(normal);
          gSwimPosition = bendSpine(finMotion(position), objectNormal);
        `,
        )
        .replace(
          "#include <begin_vertex>",
          /* glsl */ `
          vec3 transformed = gSwimPosition;
          vSkinPoint = position;
          vFishUV = uv;
          vFishPart = aPart;
        `,
        );
      applySkin(shader);
    } else {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        /* glsl */ `
        vec3 swimNormal = vec3(0.0, 1.0, 0.0);
        vec3 transformed = bendSpine(finMotion(position), swimNormal);
      `,
      );
    }
  };
  // The livery is compiled into the fragment stage, so each species is its own program.
  // A key that does not name the species would let Three compile one and hand it to all
  // of them, which paints every fish like whichever was drawn first.
  material.customProgramCacheKey = () =>
    `streamscape-mahseer-${withColor ? "skin" : "depth"}`;
}


export function createFishView(scene, simulation) {
  const geometry = makeAnatomy(), count = simulation.fish.length;
  const swim = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4);
  const finPhase = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
  swim.setUsage(THREE.DynamicDrawUsage); finPhase.setUsage(THREE.DynamicDrawUsage);
  for (const g of [geometry.body, geometry.fins]) { g.setAttribute('aSwim', swim); g.setAttribute('aFinPhase', finPhase); }
  const { skin, fins } = createFishMaterials();
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  applySwimming(skin); applySwimming(fins); applySwimming(depth, false);
  const bodies = new THREE.InstancedMesh(geometry.body, skin, count);
  const membranes = new THREE.InstancedMesh(geometry.fins, fins, count);
  bodies.name = 'Red mahseer'; membranes.name = 'Mahseer translucent fins';
  bodies.castShadow = bodies.receiveShadow = true; bodies.customDepthMaterial = depth;
  for (const mesh of [bodies, membranes]) {
    mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(mesh);
  }
  const matrix = new THREE.Matrix4(), basis = new THREE.Matrix4(), rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3(), up = new THREE.Vector3(0,1,0), side = new THREE.Vector3(), vertical = new THREE.Vector3();
  function update() {
    simulation.fish.forEach((f, i) => {
      side.crossVectors(f.heading, up).normalize(); vertical.crossVectors(side, f.heading).normalize();
      basis.makeBasis(f.heading, vertical, side); rotation.setFromRotationMatrix(basis);
      scale.setScalar(f.scale * 2.6); matrix.compose(f.position, rotation, scale);
      bodies.setMatrixAt(i, matrix); membranes.setMatrixAt(i, matrix);
      swim.setXYZW(i, f.phase, (.18 + Math.min(1.6, f.energy) * .18) * f.stroke, f.bend, f.mode === 'hold' ? .45 : .12);
      finPhase.setX(i, f.phase * .72);
    });
    bodies.instanceMatrix.needsUpdate = membranes.instanceMatrix.needsUpdate = true;
    swim.needsUpdate = finPhase.needsUpdate = true;
  }
  update();
  return { update, mesh: bodies };
}
