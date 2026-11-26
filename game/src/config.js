// Dawn Run — tuning and world layout. One job: every number the game
// is tuned from, in one place, so the flight model, the route and the
// look can each be changed without touching the code that uses them.

export const VIEW = { width: 1280, height: 720 };

export const PLANE = {
  // Speeds are metres per second; the HUD shows knots (1 m/s = 1.944 kt).
  takeoffSpeed: 34,
  minFlySpeed: 26,
  cruiseSpeed: 55,
  maxSpeed: 78,
  // How fast the speed chases the throttle's target speed.
  speedResponse: 0.55,
  // Pitch and roll are fractions of full deflection, -1..1.
  maxPitch: 0.38,
  maxRoll: 0.85,
  // Turn rate at full bank, radians per second.
  turnRate: 0.42,
  // Fuel: 100 units, drained per second at full throttle.
  fuelCapacity: 100,
  fuelDrain: 0.42,
  // Landing is safe below this sink rate (m/s) and speed.
  safeSink: 4.5,
  safeLandSpeed: 48,
};

export const ROUTE = {
  // Two runways: depart from the first, land on the second.
  runway1: { x: 0, z0: -40, z1: 420, width: 26, heading: 0 },
  runway2: { x: 0, z0: 5600, z1: 6040, width: 26, heading: Math.PI },
  // Rings to fly through, in order. y is altitude in metres.
  rings: [
    { x: -40, z: 900, y: 70, r: 18 },
    { x: 90, z: 1600, y: 110, r: 18 },
    { x: -110, z: 2300, y: 90, r: 18 },
    { x: 60, z: 3000, y: 140, r: 18 },
    { x: -80, z: 3700, y: 100, r: 18 },
    { x: 30, z: 4400, y: 130, r: 18 },
  ],
  ringScore: 500,
  landScore: 1000,
  // The route's terrain: hills stay below this, rings stay above it.
  maxHill: 50,
};

export const TERRAIN = {
  // The river and the road wander across the route as smooth curves.
  river: { x0: -260, amp: 150, freq: 0.00042, phase: 1.7, halfWidth: 16 },
  road: { x0: 190, amp: 110, freq: 0.00055, phase: 4.1, halfWidth: 5 },
  // A small town of flat-roofed blocks near this point.
  town: { x: -210, z: 1250, blocks: 26, spread: 150 },
  // Distant ridge, drawn as a silhouette, not geometry.
  ridgeHeight: 90,
};

export const LOOK = {
  skyTop: '#1d3a6e',
  skyMid: '#7fa8d8',
  skyHorizon: '#ffd9a0',
  sun: '#fff3c4',
  mountainFar: '#5d6f96',
  mountainNear: '#3d4f74',
  snow: '#eef3fa',
  grassLow: '#5d8a46',
  grassHigh: '#7fae5e',
  fieldA: '#8aa84f',
  fieldB: '#6f9a52',
  water: '#3f7fb8',
  road: '#5a5a60',
  runway: '#33343a',
  runwayMark: '#f2f2e8',
  ring: '#ffb52e',
  ringHit: '#37d67a',
  hud: '#7df9ff',
  hudWarn: '#ffb52e',
  hudBad: '#ff5a5a',
};

export const SHOT = {
  // Seconds the autopilot flies before the play and end frames are taken.
  playSeconds: 42,
  endSeconds: 14,
};
