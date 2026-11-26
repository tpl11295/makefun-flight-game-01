// Dawn Run — controls. One job: read the keyboard and the mouse and
// turn them into a pilot's stick: pitch, roll and throttle changes.

export function createInput(canvas) {
  const keys = new Set();
  const state = {
    mouseX: 0,
    mouseY: 0,
    mouseActive: false,
    mouseDown: false,
  };

  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    keys.add(e.key.toLowerCase());
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    state.mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    state.mouseY = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    state.mouseActive = true;
  });
  canvas.addEventListener('mousedown', () => {
    state.mouseDown = true;
  });
  window.addEventListener('mouseup', () => {
    state.mouseDown = false;
  });

  return { keys, state };
}

// Read the stick this frame. Keyboard wins over the mouse when both
// are used; the mouse steers by where the pointer sits from centre.
export function readStick(input) {
  const { keys, state } = input;
  let pitch = 0;
  let roll = 0;
  let throttleDelta = 0;
  if (keys.has('arrowup') || keys.has('w')) pitch += 1;
  if (keys.has('arrowdown') || keys.has('s')) pitch -= 1;
  if (keys.has('arrowleft') || keys.has('a')) roll -= 1;
  if (keys.has('arrowright') || keys.has('d')) roll += 1;
  // W/S double as throttle when the arrows fly the plane; Shift/Ctrl
  // are the dedicated throttle keys.
  if (keys.has('shift')) throttleDelta += 0.5;
  if (keys.has('control')) throttleDelta -= 0.5;
  if (keys.has('w') && !keys.has('arrowup')) throttleDelta += 0.4;
  if (keys.has('s') && !keys.has('arrowdown')) throttleDelta -= 0.4;
  if (pitch === 0 && roll === 0 && state.mouseActive) {
    // Mouse: pointer above centre climbs, below descends; left/right banks.
    pitch = clamp(-state.mouseY * 1.4, -1, 1);
    roll = clamp(state.mouseX * 1.4, -1, 1);
    if (Math.abs(state.mouseX) < 0.06 && Math.abs(state.mouseY) < 0.06) {
      pitch = 0;
      roll = 0;
    }
  }
  return { pitch, roll, throttleDelta };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function pressed(input, ...names) {
  return names.some((n) => input.keys.has(n));
}
