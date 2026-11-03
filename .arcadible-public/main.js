// Lampward: the browser side. Sizes the canvas, reads input, plays sound,
// keeps the best score in Arcadible saves, and drives the game in game.js.
const G = window.Lampward;
const W = G.W;
const H = G.H;
const STEP = 1 / 60;
const MAX_PIXEL_RATIO = 3;
const SAVE = "lampward";
const GAME_KEYS = new Set(["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyA", "KeyD", "KeyM", "KeyP", "Enter"]);

const canvas = document.getElementById("main");
const ctx = canvas.getContext("2d", { alpha: false });
const buffer = document.createElement("canvas");
buffer.width = W;
buffer.height = H;
const bctx = buffer.getContext("2d");

const state = G.newGame((Date.now() % 100000) + 1);
const input = { left: false, right: false, aim: false, aimX: 0, aimY: 0, action: false };
const view = { ox: 0, oy: 0, scale: 1, dpr: 1 };
const opts = { touch: matchMedia("(pointer: coarse)").matches, muted: false };
let last = 0;
let acc = 0;
let pointerDown = false;
let mouseAim = false;

// --- saves -------------------------------------------------------------------

// The best score and settings live in one save, through the Arcadible SDK
// when it's there (on Arcadible and under arc serve), and in localStorage
// when the game stands alone.
function readSaved() {
  try {
    if (window.arcadible) return arcadible.saves.readSync(SAVE);
    return localStorage.getItem(SAVE);
  } catch {
    return null;
  }
}

function parseSaved(raw) {
  try {
    const d = raw ? JSON.parse(raw) : null;
    return d && typeof d === "object" ? d : {};
  } catch {
    return {};
  }
}

function applySaved(d) {
  const best = d.best || {};
  state.best.score = Math.max(state.best.score, best.score | 0);
  state.best.night = Math.max(state.best.night, best.night | 0);
  if (typeof d.muted === "boolean") opts.muted = d.muted;
}

function save(gameOver) {
  // read before writing, so another tab's best isn't lost; settings are this
  // page's own
  const d = parseSaved(readSaved());
  const best = d.best || {};
  state.best.score = Math.max(state.best.score, best.score | 0);
  state.best.night = Math.max(state.best.night, best.night | 0);
  const next = {
    v: 1,
    best: { score: state.best.score, night: state.best.night },
    muted: opts.muted,
    games: (d.games | 0) + (gameOver ? 1 : 0),
  };
  const raw = JSON.stringify(next);
  try {
    if (window.arcadible) arcadible.saves.write(SAVE, raw).catch(() => {});
    else localStorage.setItem(SAVE, raw);
  } catch {
    // nothing to do: a best score isn't worth troubling the player over
  }
}

async function load() {
  try {
    if (window.arcadible) {
      await arcadible.ready;
      applySaved(parseSaved(await arcadible.saves.read(SAVE)));
    } else {
      applySaved(parseSaved(localStorage.getItem(SAVE)));
    }
  } catch {
    // the saves can't be reached: play on with no best score
  }
}

// --- sound -------------------------------------------------------------------

const sfx = {
  ac: null,
  master: null,
  ambient: null,
  start() {
    if (this.ac) {
      if (this.ac.state === "suspended") this.ac.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ac = new AC();
    this.master = this.ac.createGain();
    this.master.gain.value = opts.muted ? 0 : 0.8;
    this.master.connect(this.ac.destination);
    this.sea();
  },
  mute(m) {
    opts.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ac.currentTime, 0.05);
  },
  noise(seconds) {
    const n = Math.floor(this.ac.sampleRate * seconds);
    const b = this.ac.createBuffer(1, n, this.ac.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  },
  sea() {
    const src = this.ac.createBufferSource();
    src.buffer = this.noise(4);
    src.loop = true;
    const lp = this.ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 380;
    const g = this.ac.createGain();
    g.gain.value = 0.05;
    const lfo = this.ac.createOscillator();
    lfo.frequency.value = 0.12;
    const lfoGain = this.ac.createGain();
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain).connect(g.gain);
    src.connect(lp).connect(g).connect(this.master);
    src.start();
    lfo.start();
    this.ambient = src;
  },
  tone(type, freq, t0, dur, gain, slideTo) {
    const o = this.ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  },
  horn() {
    if (!this.ac) return;
    const t = this.ac.currentTime;
    const lp = this.ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 320;
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.25);
    g.gain.setValueAtTime(0.35, t + 1.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
    for (const f of [65.4, 98, 130.8]) {
      const o = this.ac.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.connect(lp);
      o.start(t);
      o.stop(t + 1.8);
    }
    lp.connect(g).connect(this.master);
  },
  bell(pitch) {
    if (!this.ac) return;
    const t = this.ac.currentTime;
    const f = pitch || 880;
    this.tone("sine", f, t, 0.9, 0.25);
    this.tone("sine", f * 1.5, t, 0.5, 0.12);
    this.tone("triangle", f * 2.01, t, 0.3, 0.06);
  },
  wreck() {
    if (!this.ac) return;
    const t = this.ac.currentTime;
    const src = this.ac.createBufferSource();
    src.buffer = this.noise(0.6);
    const lp = this.ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(1800, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + 0.6);
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t);
    this.tone("square", 90, t, 0.35, 0.12, 40);
  },
  lit() {
    if (!this.ac) return;
    this.tone("sine", 1320, this.ac.currentTime, 0.07, 0.05);
  },
  cleared() {
    if (!this.ac) return;
    const t = this.ac.currentTime;
    [660, 880, 1100].forEach((f, i) => {
      this.tone("sine", f, t + i * 0.18, 0.7, 0.18);
      this.tone("sine", f * 1.5, t + i * 0.18, 0.4, 0.07);
    });
  },
  over() {
    if (!this.ac) return;
    const t = this.ac.currentTime;
    this.tone("sawtooth", 220, t, 1.6, 0.12, 55);
    this.tone("sine", 110, t + 0.2, 1.8, 0.15, 40);
  },
};

function playEvents() {
  for (const e of state.events) {
    if (e.type === "night") sfx.horn();
    else if (e.type === "dock") sfx.bell(760 + e.combo * 60);
    else if (e.type === "wreck") sfx.wreck();
    else if (e.type === "lit") sfx.lit();
    else if (e.type === "cleared") {
      sfx.cleared();
      save();
    } else if (e.type === "over") {
      sfx.over();
      save(true);
    }
  }
  state.events.length = 0;
}

// --- input -------------------------------------------------------------------

function toBuffer(e) {
  const x = (e.clientX * view.dpr - view.ox) / view.scale;
  const y = (e.clientY * view.dpr - view.oy) / view.scale;
  return { x, y };
}

function gesture() {
  sfx.start();
}

function resume() {
  if (state.paused) {
    state.paused = false;
    last = 0;
    return true;
  }
  return false;
}

function press(e) {
  if (GAME_KEYS.has(e.code)) e.preventDefault();
  if (e.repeat) return;
  gesture();
  if (resume()) return;
  if (e.code === "ArrowLeft" || e.code === "KeyA") input.left = true;
  else if (e.code === "ArrowRight" || e.code === "KeyD") input.right = true;
  else if (e.code === "Space" || e.code === "Enter") input.action = true;
  if (input.left || input.right) {
    // the keys take the beam until the mouse moves again
    input.aim = false;
    mouseAim = false;
  }
  else if (e.code === "KeyM") {
    sfx.mute(!opts.muted);
    save();
  } else if (e.code === "KeyP" || e.code === "Escape") {
    if (state.mode === "play") state.paused = true;
  }
}

function lift(e) {
  if (e.code === "ArrowLeft" || e.code === "KeyA") input.left = false;
  else if (e.code === "ArrowRight" || e.code === "KeyD") input.right = false;
}

function pointerdown(e) {
  canvas.setPointerCapture(e.pointerId);
  opts.touch = e.pointerType !== "mouse";
  mouseAim = e.pointerType === "mouse";
  gesture();
  if (resume()) return;
  pointerDown = true;
  const p = toBuffer(e);
  input.aim = true;
  input.aimX = p.x;
  input.aimY = p.y;
  input.action = true;
}

function pointermove(e) {
  if (e.pointerType === "mouse" && !pointerDown) mouseAim = true;
  if (!pointerDown && !mouseAim) return;
  const p = toBuffer(e);
  if (p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > H + 40) return;
  input.aim = true;
  input.aimX = p.x;
  input.aimY = p.y;
}

function pointerup() {
  pointerDown = false;
  if (!mouseAim) input.aim = false;
}

// --- the loop ----------------------------------------------------------------

function resize() {
  const style = getComputedStyle(document.documentElement);
  const inset = (name) => parseFloat(style.getPropertyValue(name)) || 0;
  view.dpr = Math.min(devicePixelRatio || 1, MAX_PIXEL_RATIO);
  canvas.width = Math.max(1, Math.round(canvas.clientWidth * view.dpr));
  canvas.height = Math.max(1, Math.round(canvas.clientHeight * view.dpr));
  const safe = {
    l: inset("--safe-left") * view.dpr,
    r: inset("--safe-right") * view.dpr,
    t: inset("--safe-top") * view.dpr,
    b: inset("--safe-bottom") * view.dpr,
  };
  const availW = canvas.width - safe.l - safe.r;
  const availH = canvas.height - safe.t - safe.b;
  let scale = Math.floor(Math.min(availW / W, availH / H));
  if (scale < 1) scale = Math.min(availW / W, availH / H);
  view.scale = scale;
  view.ox = Math.round(safe.l + (availW - W * scale) / 2);
  view.oy = Math.round(safe.t + (availH - H * scale) / 2);
  draw();
}

function draw() {
  G.render(bctx, state, opts);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#05070f";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(buffer, 0, 0, W, H, view.ox, view.oy, W * view.scale, H * view.scale);
}

function frame(time) {
  if (!last) last = time;
  let dt = Math.min((time - last) / 1000, 0.25);
  last = time;
  if (!state.paused) {
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 6) {
      G.update(state, STEP, input);
      input.action = false;
      acc -= STEP;
      steps++;
    }
    if (steps === 6) acc = 0;
    playEvents();
  }
  draw();
  requestAnimationFrame(frame);
}

function hidden() {
  if (state.mode === "play") state.paused = true;
  save();
}

addEventListener("contextmenu", (e) => e.preventDefault());
addEventListener("keydown", press);
addEventListener("keyup", lift);
addEventListener("blur", hidden);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) hidden();
});
addEventListener("pagehide", save);
canvas.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
canvas.addEventListener("pointerdown", pointerdown);
canvas.addEventListener("pointermove", pointermove);
canvas.addEventListener("pointerup", pointerup);
canvas.addEventListener("pointercancel", pointerup);
new ResizeObserver(resize).observe(canvas);
resize();
const loading = document.getElementById("loading");
if (loading) loading.remove();
requestAnimationFrame(frame);
// The best score arrives when the saves have loaded; the title shows it then.
load().then(() => {
  if (sfx.master) sfx.mute(opts.muted);
});
