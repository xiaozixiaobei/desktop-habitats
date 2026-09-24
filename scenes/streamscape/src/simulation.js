import * as THREE from 'three';
import { randomGenerator } from '../../shared/random.js';

// Rounded boulders leave a clear front swimming lane and a central gravel run.
export const ROCKS = [
  { x: -7.3, y: 1.5, z: -3.4, sx: 2.65, sy: 3.1, sz: 1.65 },
  { x: -4.7, y: .5, z: -3.4, sx: 2.0, sy: 1.5, sz: 1.65 },
  { x: -8.8, y: .35, z: .5, sx: 2.4, sy: 1.25, sz: 1.9 },
  { x: 6.5, y: .9, z: -3.1, sx: 3.0, sy: 1.65, sz: 1.7 },
  { x: 8.4, y: .55, z: -.6, sx: 2.35, sy: 1.15, sz: 1.7 },
  { x: 3.3, y: .25, z: -4.5, sx: 1.8, sy: .9, sz: 1.4 },
  { x: -4.3, y: .05, z: 3.1, sx: 1.55, sy: .55, sz: 1.0 },
  { x: 6.7, y: .2, z: 3.8, sx: 2.8, sy: .75, sz: 1.5 },
];

export function currentVelocity(p, t, out = new THREE.Vector3()) {
  const shelter = .5 + .5 * THREE.MathUtils.smoothstep(p.y, .2, 3);
  return out.set((.48 + .06 * Math.sin(t * .6 + p.z)) * shelter,
    .025 * Math.sin(t * .8 + p.x), .04 * Math.sin(p.x * .7 + t * .3));
}

export function createSimulation(seed = Math.floor(Math.random() * 0x7fffffff)) {
  const random = randomGenerator(seed);
  const range = (a, b) => a + (b - a) * random();
  let time = 0, batch = 0;
  const fish = Array.from({ length: 6 }, (_, i) => {
    const home = new THREE.Vector3(-6 + (i % 3) * 5.3 + (i >= 3 ? 2.3 : 0) + range(-.5, .5), range(2.4, 5.8), i < 3 ? range(.5, 2.4) : range(-2.1, -.5));
    return {
      position: home.clone(), velocity: new THREE.Vector3(), heading: new THREE.Vector3(-1, 0, 0), home,
      scale: range(.85, 1.17), phase: range(0, Math.PI * 2), energy: .35,
      offset: range(0, Math.PI * 2), mode: 'hold', until: range(.2, 4),
      goal: home.clone(), cruiseSpeed: range(1.25, 1.75), bend: 0, stroke: .4, trip: i, boostUntil: 0,
      id: i, food: null, meals: 0, lastMealBatch: 0, feedUntil: 0,
      nextFeed: 0, nextScan: range(0, .7), returnTo: home.clone(),
      alarmUntil: 0, refractoryUntil: 0, pendingAlarm: 0,
      flight: new THREE.Vector3(), pendingFrom: home.clone(),
    };
  });
  const pellets = [], stats = { dropped: 0, eaten: 0 };
  const interaction = { startles: 0, spread: 0 };
  const target = new THREE.Vector3(), desired = new THREE.Vector3(), delta = new THREE.Vector3();
  const flow = new THREE.Vector3(), swimming = new THREE.Vector3();
  function leaveFood(f) {
    f.food = null;
    f.mode = 'cruise';
    f.goal.copy(f.returnTo);
    f.goal.y = Math.max(2.8, f.goal.y);
    f.until = time + 12;
    f.nextFeed = time + range(4, 8);
  }
  function chooseGoal(f) {
    for (let attempt = 0; attempt < 16; attempt++) {
      target.set(range(-7.2, 7.2), range(2.4, 6.4), range(-2.4, 2.6));
      if (target.distanceToSquared(f.position) < 12) continue;
      if (ROCKS.some(rock => Math.hypot(
        (target.x - rock.x) / (rock.sx + .7),
        (target.y - rock.y) / (rock.sy + .6),
        (target.z - rock.z) / (rock.sz + .7),
      ) < 1.2)) continue;
      f.goal.copy(target);
      f.until = time + f.position.distanceTo(target) / f.cruiseSpeed + range(3, 7);
      return;
    }
    f.goal.set(-f.position.x, Math.max(2.8, f.position.y), 1.8);
    f.until = time + 14;
  }
  function startle(f, from, source = 'pointer') {
    interaction[source === 'pointer' ? 'startles' : 'spread']++;
    if (f.food) leaveFood(f);
    f.flight.subVectors(f.position, from);
    f.flight.y *= .35;
    if (f.flight.lengthSq() < .01) f.flight.copy(f.heading).negate();
    f.flight.normalize();
    f.mode = 'escape';
    f.alarmUntil = time + 1.1;
    f.refractoryUntil = time + 3;
    f.pendingAlarm = 0;
    f.goal.copy(f.position).addScaledVector(f.flight, 3);
    f.goal.x = THREE.MathUtils.clamp(f.goal.x, -7.2, 7.2);
    f.goal.y = THREE.MathUtils.clamp(f.goal.y, 2.4, 6.4);
    f.goal.z = THREE.MathUtils.clamp(f.goal.z, -2.4, 2.6);
    f.until = f.alarmUntil;
    for (const other of fish) {
      if (other === f || other.alarmUntil > time || other.pendingAlarm || time < other.refractoryUntil) continue;
      if (other.position.distanceToSquared(f.position) >= 2.2 ** 2) continue;
      other.pendingAlarm = time + range(.05, .13);
      other.pendingFrom.copy(f.position);
    }
  }
  function drop(point) {
    if (pellets.length + fish.length > 60) return;
    batch++;
    for (let i = 0; i < fish.length; i++) {
      pellets.push({ position: new THREE.Vector3(THREE.MathUtils.clamp(point.x + range(-1.4, 1.4), -7, 6), 6.7 + range(-.1, .1), range(.2, 2.4)), age: 0, wetAt: range(1.5, 4.5), batch, assignedTo: i });
      stats.dropped++;
      fish[i].nextFeed = Math.max(fish[i].nextFeed, time + i * 1.0 + range(0, .8));
    }
  }
  function update(dt, pointer) {
    dt = Math.max(0, Math.min(dt, .05));
    if (!dt) return;
    time += dt;
    for (let i = pellets.length - 1; i >= 0; i--) {
      const p = pellets[i];
      p.age += dt;
      currentVelocity(p.position, time, flow);
      // As the pellet sinks into the slow lower layer it stops washing toward
      // the downstream glass, where a fish cannot make its final approach.
      p.position.addScaledVector(flow, dt * THREE.MathUtils.smoothstep(p.position.y, 3.2, 6.7));
      if (p.age > p.wetAt) p.position.y = Math.max(3.2, p.position.y - dt * .28);
      p.position.x = Math.min(7, p.position.x);
    }
    for (const f of fish) {
      if (f.pendingAlarm && time >= f.pendingAlarm) startle(f, f.pendingFrom, 'neighbor');
      if (pointer && time >= f.refractoryUntil && !f.pendingAlarm) {
        delta.subVectors(f.position, pointer.position);
        const distance = delta.length();
        if (distance > .01 && distance < 3.8 &&
            f.heading.dot(delta) < .6 * distance) {
          const closing = pointer.velocity?.dot(delta) / distance || 0;
          if (closing > 1.2) startle(f, pointer.position);
        }
      }
      if (f.food && (!pellets.includes(f.food) || time > f.feedUntil)) {
        leaveFood(f);
      }
      if (!f.food && f.mode !== 'escape' && time >= f.nextFeed && time >= f.nextScan &&
          fish.filter(other => other.food).length < 3) {
        f.nextScan = time + range(.35, .7);
        // Each surface splash draws one fish, staggered by its own scan clock.
        // A pellet remains reserved for that fish until it can approach and eat.
        const best = pellets.find(pellet => pellet.assignedTo === f.id && pellet.batch > f.lastMealBatch);
        if (best) {
          f.food = best;
          f.feedUntil = time + 20;
          f.returnTo.copy(f.position);
        }
      }
      if (f.mode === 'escape' && time >= f.alarmUntil) {
        f.mode = 'cruise';
        chooseGoal(f);
      } else if (!f.food && f.mode !== 'escape' &&
          (time > f.until || (f.mode === 'cruise' && f.position.distanceTo(f.goal) < .7))) {
        if (f.mode === 'cruise') {
          f.mode = 'hold'; f.until = time + range(2, 5);
          f.home.copy(f.position);
        } else {
          f.mode = 'cruise';
          f.trip++;
          f.boostUntil = time + range(.5,1.3);
          chooseGoal(f);
        }
      }
      target.copy(f.mode === 'hold' ? f.home : f.goal);
      target.y += Math.sin(time * .55 + f.offset) * .18;
      target.z += Math.sin(time * .3 + f.offset) * .22;
      const meal = f.food;
      const distance = meal ? meal.position.distanceToSquared(f.position) : Infinity;
      if (meal) target.copy(meal.position);
      desired.subVectors(target, f.position);
      f.stroke = .55 + .45 * Math.sin(time * 2.1 + f.offset) ** 2;
      if (meal) desired.multiplyScalar(1.4);
      else if (f.mode === 'escape') desired.copy(f.flight).multiplyScalar(3.8);
      else if (f.mode === 'cruise') desired.setLength(f.cruiseSpeed * (.82 + .18 * f.stroke) * (time < f.boostUntil ? 1.4 : 1));
      else desired.multiplyScalar(.45);
      // Like Reefscape, resolve a bite at a fraction of body length. The old
      // centre-only 0.3 radius left a pellet visibly touching a fish uneaten.
      if (meal && distance < (f.scale * .7) ** 2) {
        pellets.splice(pellets.indexOf(meal), 1);
        f.meals++;
        f.lastMealBatch = meal.batch;
        leaveFood(f);
        stats.eaten++;
      }
      // Separation is weaker around a pinch, but mouths never converge on one point.
      for (const other of fish) {
        if (other === f) continue;
        delta.subVectors(f.position, other.position);
        const d = delta.length();
        if (d > .001 && d < 1.9) desired.addScaledVector(delta, (1.9 - d) * 1.3 / d);
      }
      if (pointer?.position) {
        delta.subVectors(f.position, pointer.position);
        const d = delta.length();
        if (d > .001 && d < 3.1) desired.addScaledVector(delta, (3.1 - d) * 1.5 / d);
      }
      for (const rock of ROCKS) {
        delta.set((f.position.x - rock.x) / (rock.sx + .65), (f.position.y - rock.y) / (rock.sy + .55), (f.position.z - rock.z) / (rock.sz + .65));
        const d = delta.length();
        if (d < 1.35 && d > .001) desired.addScaledVector(delta.normalize(), (1.35 - d) * 3.5);
      }
      desired.clampLength(0, f.mode === 'escape' ? 3.8 : meal ? 2.6 : f.mode === 'cruise' ? 2.35 : .8);
      f.velocity.lerp(desired, 1 - Math.exp(-dt * (f.mode === 'escape' ? 8 : 2)));
      f.position.addScaledVector(f.velocity, dt);
      f.position.x = THREE.MathUtils.clamp(f.position.x, -8.5, 8.5);
      f.position.y = THREE.MathUtils.clamp(f.position.y, 1.3, 7.7);
      f.position.z = THREE.MathUtils.clamp(f.position.z, -4.2, 3);
      // Project rare large disturbances back outside each rock's clearance envelope.
      for (const rock of ROCKS) {
        const sx = rock.sx + .48, sy = rock.sy + .36, sz = rock.sz + .48;
        delta.set((f.position.x - rock.x) / sx, (f.position.y - rock.y) / sy, (f.position.z - rock.z) / sz);
        if (delta.lengthSq() < 1) {
          delta.normalize();
          f.position.set(rock.x + delta.x * sx, rock.y + delta.y * sy, rock.z + delta.z * sz);
        }
      }
      // Ground velocity minus water velocity is the fish's real swimming direction.
      currentVelocity(f.position, time, flow);
      swimming.copy(f.velocity).sub(flow);
      f.energy = swimming.length();
      if (f.energy > .03) {
        const yaw = Math.atan2(f.heading.z, f.heading.x);
        const wanted = Math.atan2(swimming.z, swimming.x);
        const difference = Math.atan2(Math.sin(wanted-yaw), Math.cos(wanted-yaw));
        const turn = THREE.MathUtils.clamp(difference * 3.4, -2.1, 2.1);
        const next = yaw + turn * dt;
        const pitch = Math.asin(THREE.MathUtils.clamp(f.heading.y,-1,1));
        const aimPitch = Math.atan2(swimming.y, Math.hypot(swimming.x,swimming.z));
        const nextPitch = THREE.MathUtils.lerp(pitch, THREE.MathUtils.clamp(aimPitch,-.70,.70), 1-Math.exp(-dt*3));
        f.heading.set(Math.cos(next)*Math.cos(nextPitch),Math.sin(nextPitch),Math.sin(next)*Math.cos(nextPitch));
        f.bend = THREE.MathUtils.lerp(f.bend, -turn * .7, 1-Math.exp(-dt*4));
      }
      f.phase += dt * (6.5 + Math.min(2.5, f.energy) * 4);
    }
  }
  return { fish, pellets, stats, interaction, drop, update, get time() { return time; } };
}
