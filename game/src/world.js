// Dawn Run — the world and the flight model. One job: hold the game
// state (plane, rings, score, phase) and step it forward one tick at a
// time from the pilot's inputs, with no drawing and no input handling.

import { PLANE, ROUTE, TERRAIN } from './config.js';
import { fbm2, mulberry32 } from './random.js';

export const MODE_TITLE = 'title';
export const MODE_FLY = 'fly';
export const MODE_LANDED = 'landed';
export const MODE_CRASHED = 'crashed';
export const MODE_FUEL = 'fuel';

const SEED = 20261126;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Smoothstep 0..1 between two edges.
function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function riverX(z) {
  const r = TERRAIN.river;
  return r.x0 + Math.sin(z * r.freq + r.phase) * r.amp;
}

export function roadX(z) {
  const r = TERRAIN.road;
  return r.x0 + Math.sin(z * r.freq + r.phase) * r.amp;
}

// Distance from a point to the nearer runway strip, in metres.
function runwayDistance(x, z) {
  let best = Infinity;
  for (const rw of [ROUTE.runway1, ROUTE.runway2]) {
    const dx = Math.max(Math.abs(x - rw.x) - rw.width / 2, 0);
    const dz = Math.max(rw.z0 - z, 0, z - rw.z1);
    best = Math.min(best, Math.hypot(dx, dz));
  }
  return best;
}

// Ground height at a point: rolling hills, flattened near the runways,
// dipped where the river runs.
export function terrainHeight(x, z) {
  const hills = fbm2(x * 0.004, z * 0.004, SEED) * 0.5 + 0.5;
  let h = hills * ROUTE.maxHill;
  const flat = 1 - smoothstep(0, 140, runwayDistance(x, z));
  h *= 1 - flat;
  const riverD = Math.abs(x - riverX(z));
  if (riverD < 60) h *= 0.25 + 0.75 * smoothstep(0, 60, riverD);
  return Math.max(0, h);
}

// Is this point on a runway strip (for a safe touchdown)?
export function onRunway(x, z) {
  for (const rw of [ROUTE.runway1, ROUTE.runway2]) {
    if (Math.abs(x - rw.x) <= rw.width / 2 && z >= rw.z0 && z <= rw.z1) return rw;
  }
  return null;
}

export function createWorld() {
  const rng = mulberry32(SEED);
  const clouds = [];
  for (let i = 0; i < 10; i += 1) {
    let cx = (rng() - 0.5) * 1600;
    // Keep the centre of the sky clear: a cloud dead ahead stacks
    // into a pale column over the runway, and the cover shot is the
    // one that suffers for it.
    if (Math.abs(cx) < 180) cx += cx >= 0 ? 320 : -320;
    clouds.push({
      x: cx,
      y: 260 + rng() * 220,
      z: rng() * 6000,
      s: 60 + rng() * 110,
    });
  }
  const trees = [];
  for (let i = 0; i < 240; i += 1) {
    const x = (rng() - 0.5) * 900;
    const z = rng() * 6200;
    if (onRunway(x, z)) continue;
    if (Math.abs(x - riverX(z)) < 26) continue;
    trees.push({ x, z, s: 3 + rng() * 4 });
  }
  return {
    seed: SEED,
    rng,
    clouds,
    trees,
    mode: MODE_TITLE,
    time: 0,
    message: '',
    messageUntil: 0,
    score: 0,
    ringsHit: 0,
    best: 0,
    plane: {
      x: 0,
      y: 0,
      z: 60,
      heading: 0,
      speed: 0,
      pitch: 0,
      roll: 0,
      throttle: 0,
      fuel: PLANE.fuelCapacity,
      gear: true,
      verticalSpeed: 0,
    },
    rings: ROUTE.rings.map((r) => ({ ...r, hit: false })),
    airborne: false,
  };
}

export function resetWorld(world, mode) {
  const fresh = createWorld();
  fresh.mode = mode || MODE_FLY;
  fresh.plane.throttle = 0.55;
  return fresh;
}

function showMessage(world, text, seconds) {
  world.message = text;
  world.messageUntil = world.time + seconds;
}

// The next thing the pilot is aiming at: the next unflown ring, then
// the landing runway.
export function currentTarget(world) {
  const ring = world.rings.find((r) => !r.hit);
  if (ring) return { kind: 'ring', x: ring.x, y: ring.y, z: ring.z, ring };
  const rw = ROUTE.runway2;
  return { kind: 'runway', x: rw.x, y: 0, z: (rw.z0 + rw.z1) / 2, runway: rw };
}

function stepPhysics(world, input, dt) {
  const p = world.plane;
  // Throttle: W/S (or Shift/Ctrl) nudge it; it stays where left.
  p.throttle = clamp(p.throttle + (input.throttleDelta || 0) * dt, 0, 1);
  const fuelOut = p.fuel <= 0;
  if (fuelOut) p.throttle = 0;
  // Speed chases the throttle's target; drag grows past cruise.
  const targetSpeed = 18 + p.throttle * 62;
  p.speed += (targetSpeed - p.speed) * Math.min(1, PLANE.speedResponse * dt);
  if (p.speed > PLANE.maxSpeed) p.speed = PLANE.maxSpeed;
  // Pitch and roll ease toward the stick, so the plane feels weighted.
  p.pitch += (clamp(input.pitch || 0, -1, 1) * PLANE.maxPitch - p.pitch) * Math.min(1, 3.2 * dt);
  p.roll += (clamp(input.roll || 0, -1, 1) * PLANE.maxRoll - p.roll) * Math.min(1, 3.2 * dt);
  // Banking turns the plane; the turn rate grows with speed.
  const turnAuthority = clamp(p.speed / PLANE.cruiseSpeed, 0.3, 1.2);
  p.heading += -p.roll * PLANE.turnRate * turnAuthority * dt;
  // Climb only while fast enough to fly; on the ground the plane rolls.
  const flying = p.y > 0.5 || p.speed >= PLANE.takeoffSpeed;
  const vy = flying ? Math.sin(p.pitch) * p.speed : 0;
  p.verticalSpeed = vy;
  p.y += vy * dt;
  p.x += Math.sin(p.heading) * p.speed * dt;
  p.z += Math.cos(p.heading) * p.speed * dt;
  if (!flying) p.y = 0;
  // Fuel drains with throttle; full throttle burns the sortie fastest.
  p.fuel = Math.max(0, p.fuel - p.throttle * PLANE.fuelDrain * dt);
  return flying;
}

// One simulation tick. input: {pitch, roll, throttleDelta, gear}.
export function stepWorld(world, input, dt) {
  if (world.mode !== MODE_FLY) return;
  world.time += dt;
  const p = world.plane;
  if (input.gear !== undefined) p.gear = input.gear;
  const flying = stepPhysics(world, input, dt);
  const ground = terrainHeight(p.x, p.z);
  const rw = onRunway(p.x, p.z);
  // Once the wheels have left the ground, the sortie counts as flown:
  // only then can a runway touch be a landing (or a bad one).
  if (p.y > 5) world.airborne = true;

  // Rings: flying through the hoop scores, with a chime-worthy message.
  for (const ring of world.rings) {
    if (ring.hit) continue;
    const dx = p.x - ring.x;
    const dy = p.y - ring.y;
    const dz = p.z - ring.z;
    if (dx * dx + dy * dy + dz * dz < ring.r * ring.r) {
      ring.hit = true;
      world.ringsHit += 1;
      world.score += ROUTE.ringScore;
      showMessage(world, `RING ${world.ringsHit} OF ${world.rings.length}  +${ROUTE.ringScore}`, 2.5);
      world.ringChime = world.time;
    }
  }

  // Touchdown: on a runway, slow and gentle, gear down — but only once
  // the plane has actually flown; a takeoff roll is not a landing.
  if (p.y <= 0.6 && rw && world.airborne) {
    const sink = -p.verticalSpeed;
    if (p.speed <= PLANE.safeLandSpeed && sink <= PLANE.safeSink && p.gear) {
      p.y = 0;
      world.mode = MODE_LANDED;
      const fuelBonus = Math.round(p.fuel * 4);
      const ringBonus = world.ringsHit * ROUTE.ringScore;
      const timeBonus = Math.max(0, 2400 - Math.round(world.time * 8));
      world.score += ROUTE.landScore + fuelBonus + timeBonus;
      world.landing = { fuelBonus, ringBonus, timeBonus, rings: world.ringsHit };
      showMessage(world, 'TOUCHDOWN — MISSION COMPLETE', 6);
      world.touchdown = world.time;
      return;
    }
    if (p.speed > PLANE.safeLandSpeed + 12 || sink > PLANE.safeSink + 3) {
      world.mode = MODE_CRASHED;
      world.crashReason = sink > PLANE.safeSink + 3 ? 'HARD LANDING' : 'TOO FAST TO LAND';
      return;
    }
    p.y = 0;
  }

  // Terrain strike, anywhere but a runway.
  if (p.y <= ground && !rw) {
    world.mode = MODE_CRASHED;
    world.crashReason = 'TERRAIN STRIKE';
    return;
  }
  // Out of fuel over rough ground: glide it down or it ends here.
  if (p.fuel <= 0 && p.y <= ground + 0.5 && !rw) {
    world.mode = MODE_FUEL;
    return;
  }
  // Flew past the far runway with no landing: the sortie is over.
  if (p.z > ROUTE.runway2.z1 + 800) {
    world.mode = MODE_CRASHED;
    world.crashReason = 'OVERSHOT THE AIRFIELD';
  }
}

// Heading in degrees, 0 = north (up the route), shown on the compass.
export function headingDegrees(world) {
  let deg = (-world.plane.heading * 180) / Math.PI;
  deg = ((deg % 360) + 360) % 360;
  return deg;
}

export function knots(world) {
  return world.plane.speed * 1.944;
}

export function feet(world) {
  return world.plane.y * 3.281;
}
