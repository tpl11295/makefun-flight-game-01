// Dawn Run — the screenshot scenes. One job: fly the real game forward
// from a fresh world with a simple autopilot, so each screenshot is a
// frame a short game really reaches, and the same seed always gives the
// same frame. No input, no drawing — only the rules, stepped forward.

import { SHOT, ROUTE } from './config.js';
import { createWorld, resetWorld, stepWorld, currentTarget, terrainHeight } from './world.js';

const STEP = 1 / 60;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// A plain pilot: steer toward the current target, hold its altitude,
// keep the throttle at cruise, ease off near the runway.
function autopilot(world) {
  const p = world.plane;
  const t = currentTarget(world);
  const dx = t.x - p.x;
  const dz = Math.max(20, t.z - p.z);
  const wantHeading = Math.atan2(dx, dz);
  let dh = wantHeading - p.heading;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  const roll = clamp(-dh * 2.2, -1, 1);
  const wantAlt = t.kind === 'runway' ? Math.max(8, (t.z - p.z) * 0.045) : t.y;
  const altErr = wantAlt - p.y;
  const pitch = clamp(altErr * 0.02, -1, 1);
  let throttleDelta = 0;
  // Slow down early for the runway: a hot approach ends the sortie.
  let wantSpeed = 55;
  if (t.kind === 'runway') {
    const dist = t.z - p.z;
    wantSpeed = dist < 600 ? 30 : dist < 1200 ? 36 : 48;
  }
  if (p.speed < wantSpeed - 2) throttleDelta = 0.5;
  else if (p.speed > wantSpeed + 2) throttleDelta = -0.6;
  return { pitch, roll, throttleDelta, gear: t.kind === 'runway' };
}

function flyFor(world, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    stepWorld(world, autopilot(world), STEP);
    if (world.mode !== 'fly') break;
  }
  return world;
}

// Stage one named scene and return the world to draw. start: on the
// runway, engines spooling, dawn light on the strip. play: mid-route,
// a ring ahead, terrain below. end: final approach, gear down, the
// home runway ahead. rings: right behind a ring at cruise.
export function stageShot(name) {
  const world = createWorld();
  world.mode = 'fly';
  world.best = 0;
  if (name === 'play') {
    world.plane.throttle = 0.9;
    flyFor(world, SHOT.playSeconds);
    return { world, screen: world.mode === 'fly' ? 'play' : 'over' };
  }
  if (name === 'end') {
    // Join the final approach already lined up: the same rules, just
    // entered late, as a pilot joining the circuit would be.
    const p = world.plane;
    p.x = 40;
    p.y = 150;
    p.z = 4700;
    p.heading = 0;
    p.speed = 52;
    p.throttle = 0.45;
    p.gear = true;
    world.rings.forEach((r) => {
      r.hit = true;
    });
    world.ringsHit = world.rings.length;
    world.score = world.rings.length * ROUTE.ringScore;
    flyFor(world, SHOT.endSeconds);
    return { world, screen: world.mode === 'fly' ? 'play' : 'over' };
  }
  if (name === 'rings') {
    const p = world.plane;
    p.x = -30;
    p.y = 105;
    p.z = 1450;
    p.heading = 0;
    p.speed = 55;
    p.throttle = 0.7;
    world.rings[0].hit = true;
    world.ringsHit = 1;
    world.score = ROUTE.ringScore;
    flyFor(world, 6);
    return { world, screen: world.mode === 'fly' ? 'play' : 'over' };
  }
  // start: three seconds of takeoff roll, wheels still on the strip.
  world.plane.throttle = 0.85;
  const steps = Math.round(3 / STEP);
  for (let i = 0; i < steps; i += 1) {
    stepWorld(world, { pitch: 0, roll: 0, throttleDelta: 0, gear: true }, STEP);
    if (world.mode !== 'fly') break;
  }
  world.message = 'CLEARED FOR TAKEOFF';
  world.messageUntil = 999;
  return { world, screen: 'title' };
}

export { resetWorld, terrainHeight };
