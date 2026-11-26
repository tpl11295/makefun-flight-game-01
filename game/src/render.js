// Dawn Run — everything the pilot sees. One job: turn the world state
// into a frame: dawn sky, perspective terrain, runway, rings, the
// aircraft, and a lit HUD. No physics, no input, no sound.

import { LOOK, PLANE, ROUTE, TERRAIN, VIEW } from './config.js';
import { headingDegrees, knots, feet, terrainHeight, riverX, roadX, onRunway, currentTarget, MODE_TITLE, MODE_LANDED, MODE_CRASHED, MODE_FUEL } from './world.js';
import { noise2, mulberry32 } from './random.js';

const W = VIEW.width;
const H = VIEW.height;
const FOCAL = H * 1.05;
const HORIZON = H * 0.42;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mix(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

function hex(rgb) {
  return `rgb(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0})`;
}

function parse(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}

const C = {};
for (const k of Object.keys(LOOK)) C[k] = parse(LOOK[k]);

// Town blocks, fixed by seed so the town never moves between frames.
const townRng = mulberry32(77);
const TOWN = [];
for (let i = 0; i < TERRAIN.town.blocks; i += 1) {
  TOWN.push({
    x: TERRAIN.town.x + (townRng() - 0.5) * TERRAIN.town.spread,
    z: TERRAIN.town.z + (townRng() - 0.5) * TERRAIN.town.spread,
    w: 8 + townRng() * 14,
    d: 8 + townRng() * 14,
    h: 4 + townRng() * 9,
  });
}

function makeCamera(world) {
  const p = world.plane;
  const fx = Math.sin(p.heading);
  const fz = Math.cos(p.heading);
  return {
    x: p.x - fx * 13,
    y: p.y + 4.2,
    z: p.z - fz * 13,
    heading: p.heading,
    fx,
    fz,
    rx: fz,
    rz: -fx,
  };
}

// Project a world point into screen space; null when behind the camera.
function project(cam, x, y, z) {
  const dx = x - cam.x;
  const dy = y - cam.y;
  const dz = z - cam.z;
  const forward = dx * cam.fx + dz * cam.fz;
  if (forward < 3) return null;
  const lateral = dx * cam.rx + dz * cam.rz;
  return {
    x: W / 2 + (lateral / forward) * FOCAL,
    y: HORIZON - (dy / forward) * FOCAL,
    s: FOCAL / forward,
    d: forward,
  };
}

function drawSky(ctx, world, cam) {
  const g = ctx.createLinearGradient(0, 0, 0, HORIZON + 40);
  g.addColorStop(0, LOOK.skyTop);
  g.addColorStop(0.55, LOOK.skyMid);
  g.addColorStop(1, LOOK.skyHorizon);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, HORIZON + 40);
  // Dawn sun, low on the horizon, ahead and to the right.
  const sunAngle = cam.heading + 0.55;
  const sunX = W / 2 + Math.tan(sunAngle - cam.heading) * FOCAL * 0.9;
  const sunY = HORIZON - 46;
  const glow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 190);
  glow.addColorStop(0, 'rgba(255, 243, 196, 0.95)');
  glow.addColorStop(0.25, 'rgba(255, 214, 140, 0.45)');
  glow.addColorStop(1, 'rgba(255, 214, 140, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sunX - 200, sunY - 200, 400, 400);
  ctx.fillStyle = LOOK.sun;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 26, 0, Math.PI * 2);
  ctx.fill();
}

function drawMountains(ctx, cam) {
  // Two ridges, far and near, their silhouette sliding with heading.
  for (let layer = 0; layer < 2; layer += 1) {
    const base = HORIZON + (layer === 0 ? 2 : 10);
    const amp = layer === 0 ? 54 : 84;
    const col = layer === 0 ? C.mountainFar : C.mountainNear;
    ctx.fillStyle = hex(col);
    ctx.beginPath();
    ctx.moveTo(-4, base + 4);
    for (let sx = -4; sx <= W + 4; sx += 16) {
      const h = noise2(sx * 0.004 + cam.heading * 2.2 + layer * 13.7, layer * 5.1, 31) * 0.5 + 0.5;
      ctx.lineTo(sx, base - h * amp);
    }
    ctx.lineTo(W + 4, base + 4);
    ctx.closePath();
    ctx.fill();
  }
}

function groundColor(x, z, y) {
  const n = noise2(x * 0.012, z * 0.012, 5) * 0.5 + 0.5;
  let col = mix(C.grassLow, C.grassHigh, clamp(y / ROUTE.maxHill, 0, 1) * 0.6 + n * 0.4);
  // Field patches with soft edges, kept subtle so the mesh never
  // reads as a checkerboard. The river and road are drawn as ribbons
  // over the mesh, not coloured into it.
  const fA = smoothstep(0.58, 0.74, n);
  col = mix(col, C.fieldA, fA * 0.3);
  const fB = smoothstep(0.42, 0.26, n);
  col = mix(col, C.fieldB, fB * 0.25);
  return col;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function drawTerrain(ctx, world, cam) {
  const dists = [12, 18, 26, 36, 50, 68, 90, 118, 152, 195, 245, 300, 360, 430];
  const COLS = 24;
  const rows = [];
  for (let ri = 0; ri < dists.length; ri += 1) {
    const d = dists[ri];
    const half = d * 0.85 + 24;
    const pts = [];
    for (let ci = 0; ci <= COLS; ci += 1) {
      const lat = -half + (2 * half * ci) / COLS;
      const wx = cam.x + cam.fx * d + cam.rx * lat;
      const wz = cam.z + cam.fz * d + cam.rz * lat;
      const wy = terrainHeight(wx, wz);
      pts.push({ p: project(cam, wx, wy, wz), x: wx, z: wz, y: wy, d });
    }
    rows.push(pts);
  }
  // Painter's order: far rows first.
  for (let ri = rows.length - 1; ri > 0; ri -= 1) {
    const far = rows[ri];
    const near = rows[ri - 1];
    for (let ci = 0; ci < COLS; ci += 1) {
      const a = far[ci].p;
      const b = far[ci + 1].p;
      const c = near[ci + 1].p;
      const d2 = near[ci].p;
      if (!a || !b || !c || !d2) continue;
      const mx = (far[ci].x + near[ci].x) / 2;
      const mz = (far[ci].z + near[ci].z) / 2;
      const my = (far[ci].y + near[ci].y) / 2;
      // Average the four corners' colours: one flat colour per quad
      // would draw the mesh as a checkerboard.
      const c00 = groundColor(far[ci].x, far[ci].z, far[ci].y);
      const c01 = groundColor(far[ci + 1].x, far[ci + 1].z, far[ci + 1].y);
      const c10 = groundColor(near[ci].x, near[ci].z, near[ci].y);
      const c11 = groundColor(near[ci + 1].x, near[ci + 1].z, near[ci + 1].y);
      const avg = [
        (c00[0] + c01[0] + c10[0] + c11[0]) / 4,
        (c00[1] + c01[1] + c10[1] + c11[1]) / 4,
        (c00[2] + c01[2] + c10[2] + c11[2]) / 4,
      ];
      const fog = clamp((far[ci].d - 200) / 450, 0, 0.4);
      const col = mix(avg, C.skyMid, fog);
      ctx.fillStyle = hex(col);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d2.x, d2.y);
      ctx.closePath();
      ctx.fill();
    }
  }
}

// A smooth ribbon laid over the terrain: the river, the road. Drawn
// as a strip, it follows its curve; coloured into the mesh it would
// come out as square blocks.
function drawRibbon(ctx, cam, centerAt, halfWidth, color) {
  let prev = null;
  for (let z = Math.max(0, cam.z + 8); z < cam.z + 440; z += 15) {
    const cx = centerAt(z);
    const l = project(cam, cx - halfWidth, terrainHeight(cx - halfWidth, z) + 0.4, z);
    const r = project(cam, cx + halfWidth, terrainHeight(cx + halfWidth, z) + 0.4, z);
    if (!l || !r) {
      prev = null;
      continue;
    }
    if (prev) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(prev.l.x, prev.l.y);
      ctx.lineTo(prev.r.x, prev.r.y);
      ctx.lineTo(r.x, r.y);
      ctx.lineTo(l.x, l.y);
      ctx.closePath();
      ctx.fill();
    }
    prev = { l, r };
  }
}

function drawRunway(ctx, world, cam) {
  for (const rw of [ROUTE.runway1, ROUTE.runway2]) {
    const near = Math.max(rw.z0, cam.z + 4);
    const far = Math.min(rw.z1, cam.z + 620);
    if (far <= near) continue;
    const left = rw.x - rw.width / 2;
    const right = rw.x + rw.width / 2;
    const p1 = project(cam, left, 0.15, near);
    const p2 = project(cam, right, 0.15, near);
    const p3 = project(cam, right, 0.15, far);
    const p4 = project(cam, left, 0.15, far);
    if (!p1 || !p2 || !p3 || !p4) continue;
    ctx.fillStyle = LOOK.runway;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.lineTo(p4.x, p4.y);
    ctx.closePath();
    ctx.fill();
    // Centreline dashes and threshold bars.
    ctx.strokeStyle = LOOK.runwayMark;
    ctx.lineWidth = Math.max(1, p1.s * 0.35);
    ctx.setLineDash([Math.max(4, p1.s * 2.4), Math.max(4, p1.s * 2.4)]);
    ctx.beginPath();
    const c1 = project(cam, rw.x, 0.3, near + 6);
    const c2 = project(cam, rw.x, 0.3, far - 6);
    if (c1 && c2) {
      ctx.moveTo(c1.x, c1.y);
      ctx.lineTo(c2.x, c2.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    // Edge lights, glowing amber.
    ctx.fillStyle = '#ffd27a';
    for (let z = near + 20; z < far; z += 60) {
      for (const ex of [left - 1.5, right + 1.5]) {
        const lp = project(cam, ex, 0.6, z);
        if (!lp) continue;
        ctx.beginPath();
        ctx.arc(lp.x, lp.y, Math.max(1.2, lp.s * 0.35), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawRing(ctx, cam, ring, index, total, isNext) {
  const N = 28;
  const pts = [];
  for (let i = 0; i <= N; i += 1) {
    const a = (i / N) * Math.PI * 2;
    const p = project(cam, ring.x + Math.cos(a) * ring.r, ring.y + Math.sin(a) * ring.r, ring.z);
    if (p) pts.push(p);
  }
  if (pts.length < 8) return;
  const col = ring.hit ? LOOK.ringHit : LOOK.ring;
  ctx.save();
  ctx.strokeStyle = col;
  ctx.shadowColor = col;
  ctx.shadowBlur = 14;
  ctx.lineWidth = Math.max(2, pts[0].s * 1.1);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
  // Label only the next ring: every ring's label at once piles up
  // into an unreadable cluster on the horizon.
  const top = project(cam, ring.x, ring.y + ring.r + 8, ring.z);
  if (top && !ring.hit && isNext) {
    ctx.fillStyle = col;
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`RING ${index + 1}/${total}`, top.x, top.y);
  }
}

function drawTown(ctx, cam) {
  for (const b of TOWN) {
    const dz = b.z - cam.z;
    if (dz < 0 || dz > 420) continue;
    const base = project(cam, b.x, terrainHeight(b.x, b.z), b.z);
    if (!base) continue;
    const w = b.w * base.s;
    const h = b.h * base.s;
    if (w < 2) continue;
    ctx.fillStyle = '#8a7f74';
    ctx.fillRect(base.x - w / 2, base.y - h, w, h);
    ctx.fillStyle = '#5d5348';
    ctx.fillRect(base.x - w / 2, base.y - h, w, Math.max(1.5, h * 0.18));
  }
}

function drawTrees(ctx, world, cam) {
  ctx.fillStyle = '#2f5d33';
  for (const t of world.trees) {
    const dz = t.z - cam.z;
    if (dz < 4 || dz > 260) continue;
    const p = project(cam, t.x, terrainHeight(t.x, t.z) + t.s, t.z);
    if (!p) continue;
    const s = t.s * p.s;
    if (s < 1.5) continue;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - s);
    ctx.lineTo(p.x - s * 0.7, p.y);
    ctx.lineTo(p.x + s * 0.7, p.y);
    ctx.closePath();
    ctx.fill();
  }
}

function drawClouds(ctx, world, cam) {
  for (const c of world.clouds) {
    const p = project(cam, c.x, c.y, c.z);
    if (!p || p.d < 20 || p.d > 3000) continue;
    const s = c.s * p.s * 0.8;
    if (s < 4) continue;
    // A soft cluster of puffs, never one hard ellipse.
    ctx.fillStyle = 'rgba(255, 252, 246, 0.82)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, s, s * 0.3, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x - s * 0.55, p.y + s * 0.1, s * 0.55, s * 0.22, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x + s * 0.55, p.y + s * 0.08, s * 0.6, s * 0.24, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x, p.y - s * 0.14, s * 0.5, s * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// The aircraft, drawn in screen space as a rear three-quarter chase view.
function drawPlane(ctx, world) {
  const p = world.plane;
  const cx = W / 2;
  const cy = H * 0.74;
  const S = 1.15;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-p.roll * 0.55);
  ctx.scale(S, S);
  // Ground shadow is drawn separately in world space; here is the machine.
  // Wings: wide, slightly swept, with a warm dawn edge.
  ctx.fillStyle = '#c8442c';
  ctx.beginPath();
  ctx.moveTo(-118, 6);
  ctx.lineTo(-96, -8);
  ctx.lineTo(96, -8);
  ctx.lineTo(118, 6);
  ctx.lineTo(96, 16);
  ctx.lineTo(-96, 16);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e8b64a';
  ctx.fillRect(-118, 4, 236, 3);
  // Fuselage: tapering from the tail (bottom) to the nose (top).
  const body = ctx.createLinearGradient(0, 64, 0, -96);
  body.addColorStop(0, '#8a2f1d');
  body.addColorStop(0.5, '#c8442c');
  body.addColorStop(1, '#e8703f');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-16, 66);
  ctx.lineTo(-11, -58);
  ctx.quadraticCurveTo(-8, -92, 0, -98);
  ctx.quadraticCurveTo(8, -92, 11, -58);
  ctx.lineTo(16, 66);
  ctx.quadraticCurveTo(0, 74, -16, 66);
  ctx.closePath();
  ctx.fill();
  // Canopy glass.
  ctx.fillStyle = '#bfe3f2';
  ctx.beginPath();
  ctx.ellipse(0, -52, 8, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.beginPath();
  ctx.ellipse(-2, -60, 3, 9, 0.2, 0, Math.PI * 2);
  ctx.fill();
  // Roundel on the fuselage.
  ctx.fillStyle = '#274b8f';
  ctx.beginPath();
  ctx.arc(0, -18, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2f2e8';
  ctx.beginPath();
  ctx.arc(0, -18, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c8442c';
  ctx.beginPath();
  ctx.arc(0, -18, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // Tailplane and fin.
  ctx.fillStyle = '#a83a26';
  ctx.beginPath();
  ctx.moveTo(-34, 52);
  ctx.lineTo(34, 52);
  ctx.lineTo(22, 62);
  ctx.lineTo(-22, 62);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, 46);
  ctx.lineTo(-7, 72);
  ctx.lineTo(7, 72);
  ctx.closePath();
  ctx.fill();
  // Propeller blur at the nose.
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#d8d8d8';
  ctx.beginPath();
  ctx.ellipse(0, -100, 5, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Navigation lights, lit.
  ctx.fillStyle = '#ff3b30';
  ctx.beginPath();
  ctx.arc(-118, 6, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#34e07a';
  ctx.beginPath();
  ctx.arc(118, 6, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Prop wash line and the aircraft's shadow on the ground.
  const cam = makeCamera(world);
  const sh = project(cam, p.x, terrainHeight(p.x, p.z) + 0.4, p.z);
  if (sh && p.y > 1) {
    const alpha = clamp(0.34 - p.y / 900, 0.05, 0.34);
    ctx.fillStyle = `rgba(10, 14, 20, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(sh.x, sh.y, Math.max(6, 42 * sh.s * 0.4), Math.max(2, 10 * sh.s * 0.4), 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function tape(ctx, x, y, h, value, step, unit, format) {
  ctx.save();
  ctx.fillStyle = 'rgba(8, 16, 28, 0.72)';
  ctx.fillRect(x - 34, y - h / 2, 68, h);
  ctx.strokeStyle = 'rgba(125, 249, 255, 0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 34, y - h / 2, 68, h);
  const pxPerUnit = (h * 0.7) / (step * 6);
  const base = Math.round(value / step) * step;
  ctx.fillStyle = LOOK.hud;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'right';
  for (let i = -3; i <= 3; i += 1) {
    const v = base + i * step;
    if (v < 0) continue;
    const yy = y - (v - value) * pxPerUnit;
    if (yy < y - h / 2 + 4 || yy > y + h / 2 - 4) continue;
    ctx.fillRect(x + 24, yy - 0.5, 10, 1);
    ctx.fillText(format(v), x + 20, yy + 4);
  }
  // Current value box.
  ctx.fillStyle = '#0a2030';
  ctx.fillRect(x - 34, y - 13, 68, 26);
  ctx.lineWidth = 1;
  ctx.strokeStyle = LOOK.hud;
  ctx.strokeRect(x - 34, y - 13, 68, 26);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(format(value) + unit, x, y + 5);
  ctx.restore();
}

function drawCompass(ctx, world) {
  const hdg = headingDegrees(world);
  const cx = W / 2;
  const y = 30;
  ctx.save();
  ctx.fillStyle = 'rgba(8, 16, 28, 0.72)';
  ctx.fillRect(cx - 210, y - 16, 420, 32);
  // The line width is whatever the runway and rings left behind
  // (wide, for close geometry); a HUD stroke needs its own width.
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(125, 249, 255, 0.5)';
  ctx.strokeRect(cx - 210, y - 16, 420, 32);
  const pxPerDeg = 420 / 60;
  ctx.fillStyle = LOOK.hud;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (let d = -30; d <= 30; d += 5) {
    let deg = Math.round(hdg + d);
    deg = ((deg % 360) + 360) % 360;
    const x = cx + d * pxPerDeg;
    const major = deg % 30 === 0;
    ctx.fillRect(x - 0.5, y + (major ? 2 : 8), 1, major ? 10 : 5);
    if (major) {
      const label = deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : String(deg).padStart(3, '0');
      ctx.fillText(label, x, y - 4);
    }
  }
  // Centre caret and digital heading.
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(cx - 6, y + 16);
  ctx.lineTo(cx + 6, y + 16);
  ctx.lineTo(cx, y + 24);
  ctx.closePath();
  ctx.fill();
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText(String(Math.round(hdg)).padStart(3, '0') + '°', cx, y + 40);
  ctx.restore();
}

function drawHorizonGauge(ctx, world) {
  const p = world.plane;
  const cx = 92;
  const cy = H - 92;
  const r = 52;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-p.roll * 0.55);
  const pitchPx = clamp(p.pitch * 90, -40, 40);
  ctx.translate(0, pitchPx);
  ctx.fillStyle = '#3f7fc4';
  ctx.fillRect(-r, -r * 2, r * 2, r * 2);
  ctx.fillStyle = '#7a5230';
  ctx.fillRect(-r, 0, r * 2, r * 2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.lineTo(r, 0);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = LOOK.hud;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  // Fixed aircraft symbol.
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx - 22, cy);
  ctx.lineTo(cx + 22, cy);
  ctx.moveTo(cx, cy - 4);
  ctx.lineTo(cx, cy + 4);
  ctx.stroke();
  ctx.fillStyle = LOOK.hud;
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ATTITUDE', cx, cy + r + 16);
  ctx.restore();
}

function drawBars(ctx, world) {
  const p = world.plane;
  const x = W - 210;
  const y = H - 108;
  ctx.save();
  ctx.fillStyle = 'rgba(8, 16, 28, 0.72)';
  ctx.fillRect(x - 10, y - 10, 200, 96);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(125, 249, 255, 0.5)';
  ctx.strokeRect(x - 10, y - 10, 200, 96);
  // Throttle bar.
  ctx.fillStyle = LOOK.hud;
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('THR', x, y + 12);
  ctx.fillStyle = '#12303f';
  ctx.fillRect(x + 44, y, 130, 12);
  ctx.fillStyle = '#2ec4d8';
  ctx.fillRect(x + 44, y, 130 * p.throttle, 12);
  // Fuel bar.
  const fuelCol = p.fuel > 25 ? '#37d67a' : p.fuel > 10 ? LOOK.hudWarn : LOOK.hudBad;
  ctx.fillStyle = LOOK.hud;
  ctx.fillText('FUEL', x, y + 34);
  ctx.fillStyle = '#12303f';
  ctx.fillRect(x + 44, y + 22, 130, 12);
  ctx.fillStyle = fuelCol;
  ctx.fillRect(x + 44, y + 22, 130 * (p.fuel / PLANE.fuelCapacity), 12);
  ctx.fillStyle = '#ffffff';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText(`${Math.round(p.fuel)}%`, x + 44, y + 52);
  ctx.fillText(p.gear ? 'GEAR DOWN' : 'GEAR UP', x + 110, y + 52);
  ctx.restore();
}

function drawHUD(ctx, world) {
  const p = world.plane;
  drawCompass(ctx, world);
  tape(ctx, 52, H / 2, 220, knots(world), 10, ' kt', (v) => String(Math.round(v)));
  tape(ctx, W - 52, H / 2, 220, feet(world), 100, ' ft', (v) => String(Math.round(v)));
  drawHorizonGauge(ctx, world);
  drawBars(ctx, world);
  // Ring counter and score.
  ctx.save();
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 17px system-ui, sans-serif';
  ctx.fillText(`RINGS ${world.ringsHit}/${world.rings.length}`, W - 24, 52);
  ctx.fillStyle = LOOK.hud;
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText(`SCORE ${world.score}`, W - 24, 76);
  // Next target distance.
  const t = currentTarget(world);
  const dist = Math.hypot(t.x - p.x, t.z - p.z);
  ctx.fillStyle = LOOK.ring;
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillText(t.kind === 'ring' ? `NEXT RING ${Math.round(dist)} m` : `RUNWAY ${Math.round(dist)} m — LAND`, W - 24, 100);
  ctx.restore();
  // Centre flight-path marker.
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(W / 2, H * 0.52, 9, 0, Math.PI * 2);
  ctx.moveTo(W / 2 - 16, H * 0.52);
  ctx.lineTo(W / 2 - 9, H * 0.52);
  ctx.moveTo(W / 2 + 9, H * 0.52);
  ctx.lineTo(W / 2 + 16, H * 0.52);
  ctx.moveTo(W / 2, H * 0.52 - 16);
  ctx.lineTo(W / 2, H * 0.52 - 9);
  ctx.restore();
  // Transient message.
  if (world.message && world.time < world.messageUntil) {
    ctx.save();
    ctx.fillStyle = LOOK.ring;
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = LOOK.ring;
    ctx.shadowBlur = 12;
    ctx.fillText(world.message, W / 2, 132);
    ctx.restore();
  }
  // Low fuel warning.
  if (p.fuel <= 15 && world.mode === 'fly') {
    ctx.save();
    ctx.fillStyle = LOOK.hudBad;
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('LOW FUEL', W / 2, 168);
    ctx.restore();
  }
}

function overlay(ctx, lines, accent) {
  ctx.save();
  ctx.fillStyle = 'rgba(6, 12, 22, 0.62)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  let y = H * 0.3;
  for (const line of lines) {
    ctx.fillStyle = line.color || '#ffffff';
    ctx.font = line.font || 'bold 44px system-ui, sans-serif';
    ctx.fillText(line.text, W / 2, y);
    y += line.gap || 56;
  }
  ctx.restore();
}

export function render(ctx, world) {
  const cam = makeCamera(world);
  ctx.clearRect(0, 0, W, H);
  drawSky(ctx, world, cam);
  // Ground under the nearest terrain row: without this the strip
  // between the last row and the bottom edge stays unpainted.
  ctx.fillStyle = hex(C.grassLow);
  ctx.fillRect(0, HORIZON, W, H - HORIZON);
  drawMountains(ctx, cam);
  drawClouds(ctx, world, cam);
  drawTerrain(ctx, world, cam);
  drawRibbon(ctx, cam, riverX, TERRAIN.river.halfWidth, LOOK.water);
  drawRibbon(ctx, cam, roadX, TERRAIN.road.halfWidth, LOOK.road);
  drawTown(ctx, cam);
  drawTrees(ctx, world, cam);
  drawRunway(ctx, world, cam);
  const nextIdx = world.rings.findIndex((r) => !r.hit);
  const rings = [...world.rings].sort((a, b) => {
    const da = Math.hypot(a.x - cam.x, a.z - cam.z);
    const db = Math.hypot(b.x - cam.x, b.z - cam.z);
    return db - da;
  });
  rings.forEach((ring) => drawRing(ctx, cam, ring, world.rings.indexOf(ring), world.rings.length, world.rings.indexOf(ring) === nextIdx));
  drawPlane(ctx, world);
  drawHUD(ctx, world);

  if (world.mode === MODE_TITLE) {
    overlay(ctx, [
      { text: 'DAWN RUN', font: 'bold 72px system-ui, sans-serif', color: '#ffd9a0', gap: 84 },
      { text: 'Take off at dawn. Thread six rings. Bring her home.', font: '22px system-ui, sans-serif', gap: 40 },
      { text: '↑ ↓ pitch      ← → bank      W / S throttle      G gear', font: '18px system-ui, sans-serif', color: LOOK.hud, gap: 34 },
      { text: 'Mouse steers too — click or press ENTER to fly', font: '18px system-ui, sans-serif', color: LOOK.hud },
    ]);
  } else if (world.mode === MODE_CRASHED) {
    overlay(ctx, [
      { text: 'CRASHED', font: 'bold 64px system-ui, sans-serif', color: LOOK.hudBad, gap: 76 },
      { text: world.crashReason || '', font: '24px system-ui, sans-serif', gap: 44 },
      { text: `Score ${world.score}   •   Rings ${world.ringsHit}/${world.rings.length}`, font: '20px system-ui, sans-serif', color: LOOK.hud, gap: 40 },
      { text: 'Press R to fly again', font: '18px system-ui, sans-serif' },
    ]);
  } else if (world.mode === MODE_FUEL) {
    overlay(ctx, [
      { text: 'OUT OF FUEL', font: 'bold 64px system-ui, sans-serif', color: LOOK.hudBad, gap: 76 },
      { text: 'She glided down over rough ground.', font: '24px system-ui, sans-serif', gap: 44 },
      { text: `Score ${world.score}   •   Rings ${world.ringsHit}/${world.rings.length}`, font: '20px system-ui, sans-serif', color: LOOK.hud, gap: 40 },
      { text: 'Press R to fly again', font: '18px system-ui, sans-serif' },
    ]);
  } else if (world.mode === MODE_LANDED) {
    const l = world.landing || { fuelBonus: 0, timeBonus: 0, rings: 0 };
    overlay(ctx, [
      { text: 'MISSION COMPLETE', font: 'bold 56px system-ui, sans-serif', color: '#37d67a', gap: 70 },
      { text: `Rings ${l.rings}/${world.rings.length}  •  Landing +${ROUTE.landScore}`, font: '22px system-ui, sans-serif', gap: 40 },
      { text: `Fuel bonus +${l.fuelBonus}  •  Time bonus +${l.timeBonus}`, font: '22px system-ui, sans-serif', color: LOOK.hud, gap: 48 },
      { text: `FINAL SCORE ${world.score}`, font: 'bold 30px system-ui, sans-serif', color: '#ffd9a0', gap: 44 },
      { text: 'Press R to fly again', font: '18px system-ui, sans-serif' },
    ]);
  }
}
