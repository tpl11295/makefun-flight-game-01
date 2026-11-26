// Dawn Run — the game loop and the screens. One job: own the frame:
// read the stick, step the world, draw it, and switch between the
// title, the flight and the endings. With ?shot= in the URL it stages
// one screenshot scene and draws exactly one frame instead.

import { VIEW } from './config.js';
import { createWorld, resetWorld, stepWorld, MODE_TITLE, MODE_FLY, MODE_LANDED, MODE_CRASHED, MODE_FUEL } from './world.js';
import { render } from './render.js';
import { createInput, readStick, pressed } from './input.js';
import { createAudio, startAudio, updateAudio, ringChime, touchdownThump, toggleMute } from './audio.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = VIEW.width;
canvas.height = VIEW.height;

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = params.get('seed');

if (shotName) {
  // Screenshot mode: one deterministic frame, no loop, no input.
  const { world } = stageShot(shotName, seedParam);
  render(ctx, world);
} else {
  const input = createInput(canvas);
  const audio = createAudio();
  let world = createWorld();
  world.mode = MODE_TITLE;
  let last = performance.now();
  let lastChime = -1;
  let lastThump = -1;

  function startFlight() {
    world = resetWorld(world, MODE_FLY);
    startAudio(audio);
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (pressed(input, 'enter') || (input.state.mouseDown && world.mode === MODE_TITLE)) {
      if (world.mode === MODE_TITLE) startFlight();
    }
    if (pressed(input, 'r') && world.mode !== MODE_FLY && world.mode !== MODE_TITLE) {
      world = resetWorld(world, MODE_FLY);
    }
    if (pressed(input, 'm')) {
      toggleMute(audio);
      input.keys.delete('m');
    }
    if (pressed(input, 'g') && world.mode === MODE_FLY) {
      world.plane.gear = !world.plane.gear;
      input.keys.delete('g');
    }

    if (world.mode === MODE_FLY) {
      const stick = readStick(input);
      stepWorld(world, { ...stick, gear: world.plane.gear }, dt);
      if (world.ringChime !== undefined && world.ringChime !== lastChime) {
        lastChime = world.ringChime;
        ringChime(audio);
      }
      if (world.touchdown !== undefined && world.touchdown !== lastThump) {
        lastThump = world.touchdown;
        touchdownThump(audio);
      }
      updateAudio(audio, world.plane.throttle, world.plane.speed, true);
    } else {
      updateAudio(audio, 0, 0, false);
    }

    render(ctx, world);
    requestAnimationFrame(frame);
  }

  canvas.addEventListener('click', () => {
    startAudio(audio);
    if (world.mode === MODE_TITLE) startFlight();
  });

  requestAnimationFrame(frame);
}
