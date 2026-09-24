import * as THREE from 'three';

export function createFood(scene, simulation) {
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.032, 1), new THREE.MeshStandardMaterial({ color: '#d8ae6b', roughness: .85 }), 60);
  mesh.count = 0; mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(mesh);
  const matrix = new THREE.Matrix4();
  return {
    drop: simulation.drop,
    update() {
      mesh.count = simulation.pellets.length;
      simulation.pellets.forEach((p, i) => { matrix.makeTranslation(p.position.x, p.position.y, p.position.z); mesh.setMatrixAt(i, matrix); });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
