// Dawn Run — sound. One job: every noise the game makes, synthesised
// live with WebAudio, so the game ships no audio files at all.

export function createAudio() {
  const audio = {
    ctx: null,
    engine: null,
    engineGain: null,
    wind: null,
    windGain: null,
    muted: false,
    started: false,
  };
  return audio;
}

// Browsers only let sound start after a gesture; call this from one.
export function startAudio(audio) {
  if (audio.started) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audio.ctx = new Ctx();
    // Engine: two detuned saws through a low-pass, pitched by throttle.
    audio.engine = audio.ctx.createOscillator();
    audio.engine.type = 'sawtooth';
    audio.engine.frequency.value = 52;
    const engine2 = audio.ctx.createOscillator();
    engine2.type = 'sawtooth';
    engine2.frequency.value = 55;
    audio.engineGain = audio.ctx.createGain();
    audio.engineGain.gain.value = 0.0;
    const filter = audio.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    audio.engine.connect(filter);
    engine2.connect(filter);
    filter.connect(audio.engineGain);
    audio.engineGain.connect(audio.ctx.destination);
    audio.engine.start();
    engine2.start();
    audio.engine2 = engine2;
    // Wind: looped noise through a band-pass, louder the faster you fly.
    const len = audio.ctx.sampleRate * 2;
    const buffer = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    const noise = audio.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const band = audio.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 700;
    band.Q.value = 0.6;
    audio.windGain = audio.ctx.createGain();
    audio.windGain.gain.value = 0.0;
    noise.connect(band);
    band.connect(audio.windGain);
    audio.windGain.connect(audio.ctx.destination);
    noise.start();
    audio.started = true;
  } catch {
    // No sound on this machine: the game plays on silently.
  }
}

// Called every frame with the plane's state; the drone follows it.
export function updateAudio(audio, throttle, speed, flying) {
  if (!audio.started || audio.muted) return;
  const t = audio.ctx.currentTime;
  const target = flying ? 0.05 + throttle * 0.06 : 0.03 + throttle * 0.03;
  audio.engineGain.gain.setTargetAtTime(target, t, 0.1);
  audio.engine.frequency.setTargetAtTime(48 + throttle * 46, t, 0.1);
  audio.engine2.frequency.setTargetAtTime(51 + throttle * 48, t, 0.1);
  audio.windGain.gain.setTargetAtTime(Math.min(0.09, (speed / 78) * 0.09), t, 0.15);
}

function blip(audio, freq, dur, gain, when) {
  if (!audio.started || audio.muted) return;
  const t = audio.ctx.currentTime + (when || 0);
  const osc = audio.ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const g = audio.ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g);
  g.connect(audio.ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

// Two-note chime when a ring is threaded.
export function ringChime(audio) {
  blip(audio, 880, 0.35, 0.16);
  blip(audio, 1318, 0.5, 0.14, 0.09);
}

// A soft thump on touchdown.
export function touchdownThump(audio) {
  if (!audio.started || audio.muted) return;
  const t = audio.ctx.currentTime;
  const osc = audio.ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(90, t);
  osc.frequency.exponentialRampToValueAtTime(38, t + 0.22);
  const g = audio.ctx.createGain();
  g.gain.setValueAtTime(0.3, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  osc.connect(g);
  g.connect(audio.ctx.destination);
  osc.start(t);
  osc.stop(t + 0.35);
}

export function toggleMute(audio) {
  audio.muted = !audio.muted;
  if (audio.started && audio.engineGain) {
    audio.engineGain.gain.value = audio.muted ? 0 : 0.05;
    audio.windGain.gain.value = audio.muted ? 0 : 0.02;
  }
  return audio.muted;
}
