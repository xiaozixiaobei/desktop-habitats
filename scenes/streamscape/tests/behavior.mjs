// Verify upstream station holding, safe bounds, rock clearance and reachable food.
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('../../riverscape/tests/three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { createSimulation, currentVelocity, ROCKS } = await import('../src/simulation.js');
for (const [seed, feedX] of [[71, 0], [2026, -5], [904, 5]]) {
  const sim = createSimulation(seed);
  assert.equal(sim.fish.length, 6, 'Streamscape has six red mahseer');
  let upstream = 0, samples = 0;
  const journeys = sim.fish.map(f => ({previous: f.position.clone(), distance: 0, minX: f.position.x, maxX: f.position.x, minY: f.position.y, maxY: f.position.y}));
  for (let i = 0; i < 60 * 150; i++) {
    sim.update(1 / 60);
    for (const [index, fish] of sim.fish.entries()) {
      const p = fish.position;
      const journey = journeys[index];
      journey.distance += p.distanceTo(journey.previous); journey.previous.copy(p);
      journey.minX = Math.min(journey.minX,p.x); journey.maxX = Math.max(journey.maxX,p.x);
      journey.minY = Math.min(journey.minY,p.y); journey.maxY = Math.max(journey.maxY,p.y);
      assert([p.x, p.y, p.z, fish.heading.x, fish.phase].every(Number.isFinite));
      assert(Math.abs(p.x) <= 8.5 && p.y >= 1.3 && p.y <= 7.7 && p.z >= -4.2 && p.z <= 3);
      for (const rock of ROCKS) {
        const distance = Math.hypot((p.x - rock.x) / (rock.sx + .48), (p.y - rock.y) / (rock.sy + .36), (p.z - rock.z) / (rock.sz + .48));
        assert(distance > .98, 'fish must stay outside rock safety envelopes');
      }
      if (i > 600 && fish.mode === 'hold') { samples++; if (fish.heading.x < -.5) upstream++; }
    }
  }
  for (const journey of journeys) {
    assert(journey.distance > 50, 'each fish actively cruises instead of remaining at its anchor');
    assert(journey.maxX - journey.minX > 8, 'each fish explores the width of the tank');
    assert(journey.maxY - journey.minY > 1.5, 'each fish changes depth in the water column');
  }
  assert(upstream / samples > .5, 'resting fish predominantly face into the current');
  const before = sim.fish[0].position.clone();
  sim.update(0);
  assert(before.equals(sim.fish[0].position), 'pause does not advance motion');
  sim.drop(new THREE.Vector3(feedX, 0, 1));
  assert.equal(sim.stats.dropped, 6, 'one pinch gives each fish one pellet');
  let peakForagers = 0, distinctTargets = 0;
  for (let i = 0; i < 60 * 65; i++) {
    sim.update(1 / 60);
    const targets = sim.fish.map(f => f.food).filter(Boolean);
    peakForagers = Math.max(peakForagers, targets.length);
    distinctTargets = Math.max(distinctTargets, new Set(targets).size);
    assert(sim.fish.every(f => !f.food || f.position.y > 2.3), 'feeding must not drag a forager to the streambed');
  }
  assert(peakForagers >= 1 && peakForagers <= 4, 'only nearby fish respond to a pinch');
  assert(distinctTargets >= 2, 'foragers spread among pellets');
  assert.equal(sim.stats.eaten, 6, 'the entire pinch is eaten');
  assert(sim.fish.every(f => f.meals === 1), 'each fish eats exactly once before returning to cruising');
  assert(sim.fish.every(f => !f.food), 'foraging ends once the food is gone');
  assert(sim.fish.some(f => f.position.y > 3.4), 'fish resume midwater cruising after a pinch');
  assert.equal(sim.pellets.length, 0);
  sim.drop(new THREE.Vector3(-feedX, 0, 1));
  for (let i = 0; i < 60 * 65; i++) sim.update(1 / 60);
  assert.equal(sim.stats.eaten, 12, 'a second pinch is also fully eaten');
  assert(sim.fish.every(f => f.meals === 2), 'each fish eats once in each pinch');
}
assert(currentVelocity(new THREE.Vector3(0, 4, 0), 0).x > 0, 'current flows left to right');

// A fresh scene should not replay one fixed itinerary on every launch.
const firstVisit = createSimulation(), secondVisit = createSimulation();
assert.notDeepEqual(firstVisit.fish.map(f => f.home.toArray()), secondVisit.fish.map(f => f.home.toArray()),
  'independent launches need different starting stations and route seeds');

// The glass interaction uses two responses: slow movement gives room, while a
// fast incoming pointer fires a short escape that can spread to a neighbour.
const calmPointer = createSimulation(71), calmControl = createSimulation(71);
for (let i = 0; i < 480; i++) { calmPointer.update(1 / 60); calmControl.update(1 / 60); }
const slow = { position: calmPointer.fish[0].position.clone().add(new THREE.Vector3(.7, 0, 1)),
  velocity: new THREE.Vector3(-.12, 0, -.16) };
for (let i = 0; i < 180; i++) {
  slow.position.addScaledVector(slow.velocity, 1 / 60);
  calmPointer.update(1 / 60, slow);
  calmControl.update(1 / 60);
}
assert(calmPointer.fish[0].position.distanceTo(slow.position) >
  calmControl.fish[0].position.distanceTo(slow.position) + .25,
  'a slowly approaching cursor gets room without startling the fish');
assert(calmPointer.fish.every(f => f.alarmUntil === 0), 'slow movement does not trigger escape');

const startled = createSimulation(71);
for (let i = 0; i < 480; i++) startled.update(1 / 60);
startled.fish[1].position.copy(startled.fish[0].position).add(new THREE.Vector3(1.5, 0, -.8));
const lunge = { position: startled.fish[0].position.clone().add(new THREE.Vector3(0, 0, 2.4)),
  velocity: new THREE.Vector3(0, 0, -9) };
for (let i = 0; i < 15; i++) {
  if (i < 4) {
    lunge.position.addScaledVector(lunge.velocity, 1 / 60);
    startled.update(1 / 60, lunge);
  } else startled.update(1 / 60);
}
assert(startled.fish[0].alarmUntil > startled.time, 'fast approach startles the nearby fish');
assert(startled.fish[1].alarmUntil > startled.time, 'alarm reaches a nearby fish');
for (let i = 0; i < 300; i++) startled.update(1 / 60);
assert(startled.fish.every(f => f.alarmUntil < startled.time), 'startled fish recover and resume their route');

// A one-way current must not pin reserved pellets against the downstream glass
// where their assigned fish can see them but never trigger the bite distance.
for (const [seed, warm, x] of [[71, 0, 1.2], [71, 60, 2.4], [904, 300, 0]]) {
  const scenario = createSimulation(seed);
  for (let i = 0; i < warm * 60; i++) scenario.update(1 / 60);
  scenario.drop(new THREE.Vector3(x, 0, 0));
  for (let i = 0; i < 90 * 60; i++) scenario.update(1 / 60);
  assert.equal(scenario.stats.eaten, 6, `all fish eat near the downstream side after ${warm}s`);
  assert(scenario.fish.every(f => f.meals === 1));
  assert.equal(scenario.pellets.length, 0);
}
console.log('PASS: Streamscape 3 seeds, 450s cruising coverage, upstream rests, rock clearance, bounds, pause and feeding');

// A 180-degree turn must preserve the dorsal side, not roll the fish upside down.
const { createFishView } = await import('../src/fish-model.js');
const sim = createSimulation();
const view = createFishView(new THREE.Scene(), sim);
const matrix = new THREE.Matrix4();
for (let i = 0; i < sim.fish.length; i++) {
  view.mesh.getMatrixAt(i, matrix);
  assert(matrix.elements[5] > 0, 'left-facing fish keep their dorsal fin up');
}
for (const attribute of Object.values(view.mesh.geometry.attributes)) {
  assert(Array.from(attribute.array).every(Number.isFinite), 'model attributes are finite');
}
