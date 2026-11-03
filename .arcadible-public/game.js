// Lampward: the simulation and the renderer, with no browser in them.
//
// Everything is drawn into a 320 x 180 pixel buffer through a tiny subset of
// the Canvas 2D API (fillStyle, globalAlpha, fillRect, and a polygon path), so
// the same code runs in the browser (main.js) and under Node against a
// software rasterizer (tools/raster.js), which is how the screenshots and the
// store art are made.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Lampward = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const W = 320;
  const H = 180;
  const TAU = Math.PI * 2;

  // The lamp, the reef, and the gap the ships must find.
  const LAMP = { x: 160, y: 149 };
  const REEF_Y = 138;
  const GAP = { l: 137, r: 183 };
  const HORIZON = 24;
  const BEAM_HALF = 0.11; // radians: what counts as lit
  const BEAM_MIN = -Math.PI + 0.1;
  const BEAM_MAX = -0.1;
  const TURN_RATE = 2.6; // keyboard aiming, radians per second

  const C = {
    skyTop: "#090d20",
    skyMid: "#111735",
    skyLow: "#1b2650",
    haze: "#263463",
    sea: "#132a4b",
    seaDeep: "#0f2140",
    streak: "#28487a",
    streakDim: "#1d3a63",
    foam: "#d6e7f5",
    beam: "#ffdf8a",
    white: "#f3f0e6",
    red: "#c43b3b",
    dark: "#2a2831",
    lamp: "#fff4b0",
    glow: "#ffd36b",
    rock: "#3b3f4a",
    rockLight: "#5b606d",
    rockDark: "#22242b",
    hull: "#6d4a2c",
    hullLight: "#93683f",
    hullDark: "#4a3220",
    sail: "#ece6d4",
    sailShade: "#b9b2a0",
    smoke: "#7d8290",
    text: "#f4efe2",
    dim: "#8f98ad",
    accent: "#ffd36b",
    danger: "#ff6b57",
    good: "#7ee0a2",
    fog: "#aab4c4",
    star: "#dfe6f5",
    moon: "#ece8d8",
    moonShade: "#c9c4b2",
    port: "#ff5a4e",
    starboard: "#4fe08a",
    quay: "#2b2f3b",
    quayTop: "#3d4253",
  };

  // --- a 3 x 5 pixel font ---------------------------------------------------

  const GLYPHS = {
    A: ["010", "101", "111", "101", "101"],
    B: ["110", "101", "110", "101", "110"],
    C: ["011", "100", "100", "100", "011"],
    D: ["110", "101", "101", "101", "110"],
    E: ["111", "100", "110", "100", "111"],
    F: ["111", "100", "110", "100", "100"],
    G: ["011", "100", "101", "101", "011"],
    H: ["101", "101", "111", "101", "101"],
    I: ["111", "010", "010", "010", "111"],
    J: ["001", "001", "001", "101", "010"],
    K: ["101", "101", "110", "101", "101"],
    L: ["100", "100", "100", "100", "111"],
    M: ["101", "111", "111", "101", "101"],
    N: ["110", "101", "101", "101", "101"],
    O: ["010", "101", "101", "101", "010"],
    P: ["110", "101", "110", "100", "100"],
    Q: ["010", "101", "101", "110", "011"],
    R: ["110", "101", "110", "101", "101"],
    S: ["011", "100", "010", "001", "110"],
    T: ["111", "010", "010", "010", "010"],
    U: ["101", "101", "101", "101", "111"],
    V: ["101", "101", "101", "101", "010"],
    W: ["101", "101", "111", "111", "101"],
    X: ["101", "101", "010", "101", "101"],
    Y: ["101", "101", "010", "010", "010"],
    Z: ["111", "001", "010", "100", "111"],
    0: ["111", "101", "101", "101", "111"],
    1: ["010", "110", "010", "010", "111"],
    2: ["110", "001", "010", "100", "111"],
    3: ["111", "001", "011", "001", "111"],
    4: ["101", "101", "111", "001", "001"],
    5: ["111", "100", "110", "001", "110"],
    6: ["011", "100", "111", "101", "111"],
    7: ["111", "001", "010", "010", "010"],
    8: ["111", "101", "111", "101", "111"],
    9: ["111", "101", "111", "001", "110"],
    " ": ["000", "000", "000", "000", "000"],
    ".": ["000", "000", "000", "000", "010"],
    ",": ["000", "000", "000", "010", "100"],
    "!": ["010", "010", "010", "000", "010"],
    "?": ["110", "001", "010", "000", "010"],
    ":": ["000", "010", "000", "010", "000"],
    "-": ["000", "000", "111", "000", "000"],
    "+": ["000", "010", "111", "010", "000"],
    "'": ["010", "010", "000", "000", "000"],
    "(": ["010", "100", "100", "100", "010"],
    ")": ["010", "001", "001", "001", "010"],
    "/": ["001", "001", "010", "100", "100"],
    "<": ["001", "010", "100", "010", "001"],
    ">": ["100", "010", "001", "010", "100"],
    "@": ["010", "101", "111", "100", "011"],
  };

  function textWidth(str, scale) {
    scale = scale || 1;
    return str.length * 4 * scale - scale;
  }

  function text(ctx, x, y, str, color, scale, align) {
    scale = scale || 1;
    str = String(str).toUpperCase();
    const w = textWidth(str, scale);
    if (align === "center") x -= Math.floor(w / 2);
    else if (align === "right") x -= w;
    ctx.fillStyle = color;
    for (let i = 0; i < str.length; i++) {
      const g = GLYPHS[str[i]] || GLYPHS["?"];
      for (let r = 0; r < 5; r++) {
        const row = g[r];
        for (let c = 0; c < 3; c++) {
          if (row[c] === "1") {
            ctx.fillRect(x + (i * 4 + c) * scale, y + r * scale, scale, scale);
          }
        }
      }
    }
  }

  // Text with a one-pixel shadow, for anything over the water.
  function label(ctx, x, y, str, color, scale, align) {
    scale = scale || 1;
    text(ctx, x + scale, y + scale, str, "#000000", scale, align);
    text(ctx, x, y, str, color, scale, align);
  }

  // --- deterministic randomness ----------------------------------------------

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  // The shortest signed turn from heading a to heading b.
  function angleDiff(a, b) {
    let d = (b - a) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  }

  // --- ship kinds ------------------------------------------------------------

  const KINDS = {
    sloop: { len: 7, beam: 3, speed: 24, turn: 1.7, points: 10, sail: 1 },
    barque: { len: 10, beam: 4, speed: 18, turn: 1.15, points: 20, sail: 2 },
    steamer: { len: 13, beam: 5, speed: 14, turn: 0.8, points: 30, sail: 0 },
  };

  // --- nights ----------------------------------------------------------------

  function nightParams(n) {
    return {
      ships: Math.min(16, 4 + n + Math.floor(n / 2)),
      interval: Math.max(1.5, 3.4 - 0.25 * n),
      concurrent: Math.min(6, 2 + n),
      rocks: n === 1 ? 0 : Math.min(7, n),
      fogs: n < 3 ? 0 : n < 5 ? 1 : n < 7 ? 2 : 3,
      current: Math.min(26, 5 + 2.5 * n),
      push: 1.5 + n * 0.45,
      barque: n < 2 ? 0 : 0.3,
      steamer: n < 4 ? 0 : 0.2,
    };
  }

  // --- state -----------------------------------------------------------------

  function makeStreaks(rng) {
    const out = [];
    for (let i = 0; i < 70; i++) {
      out.push({
        x: rng() * W,
        y: rng() * (REEF_Y - HORIZON - 4),
        len: 2 + Math.floor(rng() * 3),
        dim: rng() < 0.5,
        phase: rng() * TAU,
      });
    }
    return out;
  }

  function makeStars(rng) {
    const out = [];
    for (let i = 0; i < 46; i++) {
      out.push({
        x: Math.floor(rng() * W),
        y: Math.floor(rng() * (HORIZON - 3)),
        phase: rng() * TAU,
      });
    }
    return out;
  }

  // A rock's pixels, as offsets from its center, in three shades.
  function makeRockPixels(rng, r) {
    const harm = [];
    for (let k = 0; k < 4; k++) harm.push({ f: k + 2, a: rng() * 0.22, p: rng() * TAU });
    const px = [];
    const R = Math.ceil(r * 1.35) + 1;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const d = Math.hypot(dx, dy);
        const a = Math.atan2(dy, dx);
        let edge = r;
        for (const h of harm) edge += r * h.a * Math.sin(h.f * a + h.p);
        if (d <= edge) {
          const shade = d < edge * 0.55 && dy < 0 ? 2 : d > edge - 1.2 ? 0 : 1;
          px.push(dx, dy, shade);
        }
      }
    }
    return px;
  }

  function makeReef(rng) {
    const px = [];
    for (let x = 0; x < W; x++) {
      if (x >= GAP.l && x <= GAP.r) continue;
      const top = REEF_Y - 1 + Math.round(Math.sin(x * 0.7 + rng() * 0.6) * 1.2 + rng());
      const bottom = REEF_Y + 4 + Math.round(rng() * 1.5);
      for (let y = top; y <= bottom; y++) {
        const shade = y === top ? 2 : y >= bottom - 1 ? 0 : rng() < 0.12 ? 0 : 1;
        px.push(x, y, shade);
      }
    }
    return px;
  }

  function newGame(seed) {
    const rng = mulberry32(seed || 1);
    const s = {
      seed: seed || 1,
      rng: rng,
      mode: "title",
      paused: false,
      t: 0,
      night: 0,
      score: 0,
      combo: 0,
      lanterns: 3,
      best: { score: 0, night: 0 },
      beam: BEAM_MIN + (BEAM_MAX - BEAM_MIN) / 2,
      autoBeam: true,
      ships: [],
      rocks: [],
      fogs: [],
      floats: [],
      debris: [],
      events: [],
      current: { x: 0, y: 0, phase: rng() * TAU },
      flow: { x: 0, y: 0 },
      streaks: makeStreaks(rng),
      stars: makeStars(rng),
      reef: makeReef(rng),
      wave: null,
      msg: null,
      timer: 0,
      shake: 0,
      stats: { docked: 0, wrecked: 0 },
      hints: [],
    };
    return s;
  }

  function placeRocks(s, count) {
    s.rocks = [];
    let tries = 0;
    while (s.rocks.length < count && tries++ < 400) {
      const r = 3 + s.rng() * 3.5;
      const x = 16 + s.rng() * (W - 32);
      const y = 42 + s.rng() * 70;
      // keep the channel above the gap and the lamp's approach clear
      if (Math.abs(x - LAMP.x) < 28 && y > 95) continue;
      let ok = true;
      for (const o of s.rocks) {
        if (Math.hypot(o.x - x, o.y - y) < o.r + r + 22) ok = false;
      }
      if (!ok) continue;
      s.rocks.push({ x: x, y: y, r: r, px: makeRockPixels(s.rng, r), phase: s.rng() * TAU });
    }
  }

  function placeFogs(s, count) {
    s.fogs = [];
    for (let i = 0; i < count; i++) {
      s.fogs.push({
        x: 40 + s.rng() * (W - 80),
        y: 45 + s.rng() * 55,
        rx: 34 + s.rng() * 26,
        ry: 14 + s.rng() * 10,
        drift: (s.rng() - 0.5) * 6,
        phase: s.rng() * TAU,
      });
    }
  }

  function startNight(s, n) {
    s.night = n;
    const p = nightParams(n);
    s.wave = {
      toSpawn: p.ships,
      spawned: 0,
      nextSpawn: 1.2,
      wrecks: 0,
      params: p,
      done: false,
    };
    s.ships = [];
    placeRocks(s, p.rocks);
    placeFogs(s, p.fogs);
    s.current.phase = s.rng() * TAU;
    s.mode = "play";
    s.timer = 0;
    s.hints = [];
    if (n === 1) {
      s.hints.push({ text: "SHIPS FOLLOW YOUR LIGHT", from: 0.5, to: 5 });
      s.hints.push({ text: "LEAD THEM THROUGH THE GAP", from: 5, to: 9.5 });
      s.hints.push({ text: "DARK SHIPS COAST AND DRIFT", from: 9.5, to: 14 });
    } else if (n === 2) {
      s.hints.push({ text: "ROCKS. LOOK BEFORE YOU LIGHT", from: 0.5, to: 5 });
    } else if (n === 3) {
      s.hints.push({ text: "FOG HIDES SHIPS YOU DON'T LIGHT", from: 0.5, to: 5 });
    } else if (n === 4) {
      s.hints.push({ text: "STEAMERS TURN SLOWLY", from: 0.5, to: 5 });
    }
    s.events.push({ type: "night", night: n });
  }

  function begin(s) {
    s.score = 0;
    s.combo = 0;
    s.lanterns = 3;
    s.stats = { docked: 0, wrecked: 0 };
    s.floats = [];
    s.debris = [];
    s.autoBeam = false;
    startNight(s, 1);
  }

  function spawnShip(s) {
    const p = s.wave.params;
    const roll = s.rng();
    let kind = "sloop";
    if (roll < p.steamer) kind = "steamer";
    else if (roll < p.steamer + p.barque) kind = "barque";
    const k = KINDS[kind];
    let x, y, heading;
    const side = s.rng();
    if (side < 0.6) {
      x = 30 + s.rng() * (W - 60);
      y = HORIZON - 4;
      heading = Math.PI / 2 + (s.rng() - 0.5) * 0.8;
    } else if (side < 0.8) {
      x = -6;
      y = HORIZON + 10 + s.rng() * 50;
      heading = 0.35 + s.rng() * 0.3;
    } else {
      x = W + 6;
      y = HORIZON + 10 + s.rng() * 50;
      heading = Math.PI - 0.35 - s.rng() * 0.3;
    }
    s.ships.push({
      id: s.wave.spawned,
      kind: kind,
      x: x,
      y: y,
      heading: heading,
      speed: k.speed,
      turn: k.turn,
      len: k.len,
      beam: k.beam,
      points: k.points,
      sail: k.sail,
      lit: false,
      wasLit: false,
      state: "sailing", // sailing | docked | wrecked
      age: 0,
      wake: 0,
    });
    s.wave.spawned++;
  }

  function addFloat(s, x, y, str, color) {
    s.floats.push({ x: x, y: y, text: str, color: color, ttl: 1.6 });
  }

  function wreck(s, ship, why) {
    ship.state = "wrecked";
    ship.age = 0;
    s.combo = 0;
    s.lanterns--;
    s.wave.wrecks++;
    s.stats.wrecked++;
    s.shake = 0.35;
    for (let i = 0; i < 7; i++) {
      s.debris.push({
        x: ship.x + (s.rng() - 0.5) * 4,
        y: ship.y + (s.rng() - 0.5) * 4,
        vx: (s.rng() - 0.5) * 14,
        vy: (s.rng() - 0.5) * 14,
        ttl: 2 + s.rng() * 2,
        c: i < 3 ? C.foam : i < 5 ? C.hull : C.sail,
      });
    }
    addFloat(s, ship.x, ship.y - 8, why, C.danger);
    s.events.push({ type: "wreck" });
    if (s.lanterns <= 0) {
      s.mode = "over";
      s.timer = 0;
      s.best.score = Math.max(s.best.score, s.score);
      s.best.night = Math.max(s.best.night, s.night);
      s.events.push({ type: "over" });
    }
  }

  function dock(s, ship) {
    ship.state = "docked";
    ship.age = 0;
    ship.heading = Math.PI / 2;
    s.combo = Math.min(5, s.combo + 1);
    const pts = ship.points * s.combo;
    s.score += pts;
    s.stats.docked++;
    addFloat(s, ship.x, ship.y - 10, "+" + pts + (s.combo > 1 ? " X" + s.combo : ""), C.good);
    s.events.push({ type: "dock", combo: s.combo });
  }

  function inFog(s, x, y) {
    for (const f of s.fogs) {
      const dx = (x - f.x) / f.rx;
      const dy = (y - f.y) / f.ry;
      if (dx * dx + dy * dy < 1) return true;
    }
    return false;
  }

  function isLit(s, x, y) {
    const a = Math.atan2(y - LAMP.y, x - LAMP.x);
    return Math.abs(angleDiff(a, s.beam)) < BEAM_HALF && y < LAMP.y - 2;
  }

  // One fixed step of the simulation. `input` is { left, right, aim, aimX,
  // aimY, action } where action is a tap or key that starts or resumes.
  function update(s, dt, input) {
    s.t += dt;
    if (s.shake > 0) s.shake = Math.max(0, s.shake - dt);

    // the beam
    if (input.aim) {
      s.beam = clamp(Math.atan2(input.aimY - LAMP.y, input.aimX - LAMP.x), BEAM_MIN, BEAM_MAX);
      s.autoBeam = false;
    } else if (input.left || input.right) {
      s.beam = clamp(s.beam + ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * TURN_RATE * dt, BEAM_MIN, BEAM_MAX);
      s.autoBeam = false;
    } else if (s.autoBeam) {
      s.beam = -Math.PI / 2 + Math.sin(s.t * 0.45) * 1.05;
    }

    // the current turns slowly through the night, and always pushes a little
    // toward the reef
    const p = s.wave ? s.wave.params : { current: 6, push: 1.5 };
    s.current.x = p.current * Math.sin(s.t * 0.22 + s.current.phase);
    s.current.y = p.push + p.current * 0.15 * Math.sin(s.t * 0.31 + s.current.phase * 2);
    s.flow.x += s.current.x * dt;
    s.flow.y += s.current.y * dt;

    for (const f of s.fogs) {
      f.x += f.drift * dt;
      if (f.x < 20) f.drift = Math.abs(f.drift);
      if (f.x > W - 20) f.drift = -Math.abs(f.drift);
    }

    for (let i = s.floats.length - 1; i >= 0; i--) {
      const f = s.floats[i];
      f.ttl -= dt;
      f.y -= 9 * dt;
      if (f.ttl <= 0) s.floats.splice(i, 1);
    }
    for (let i = s.debris.length - 1; i >= 0; i--) {
      const d = s.debris[i];
      d.ttl -= dt;
      d.x += (d.vx + s.current.x * 0.6) * dt;
      d.y += (d.vy + s.current.y * 0.6) * dt;
      d.vx *= 0.96;
      d.vy *= 0.96;
      if (d.ttl <= 0) s.debris.splice(i, 1);
    }

    if (s.mode === "title") {
      if (input.action) begin(s);
      return;
    }
    if (s.mode === "over") {
      s.timer += dt;
      if (input.action && s.timer > 1.2) begin(s);
      return;
    }
    if (s.mode === "between") {
      s.timer += dt;
      if (s.timer > 3) startNight(s, s.night + 1);
      return;
    }
    if (s.mode !== "play") return;

    s.timer += dt;
    const w = s.wave;

    // spawning
    const active = s.ships.filter((sh) => sh.state === "sailing").length;
    w.nextSpawn -= dt;
    if (w.spawned < w.toSpawn && w.nextSpawn <= 0 && active < w.params.concurrent) {
      spawnShip(s);
      w.nextSpawn = w.params.interval * (0.75 + s.rng() * 0.5);
    }

    // ships
    for (const sh of s.ships) {
      sh.age += dt;
      if (sh.state === "docked") {
        sh.y += 14 * dt;
        continue;
      }
      if (sh.state === "wrecked") continue;

      const lit = isLit(s, sh.x, sh.y);
      if (lit && !sh.lit) s.events.push({ type: "lit" });
      sh.lit = lit;
      if (lit) sh.wasLit = true;

      if (lit) {
        // a lit ship steers for the harbor mouth, then for the lamp itself
        const ty = sh.y < REEF_Y - 18 ? REEF_Y - 12 : LAMP.y;
        const want = Math.atan2(ty - sh.y, LAMP.x - sh.x);
        const d = angleDiff(sh.heading, want);
        const step = sh.turn * dt;
        sh.heading += Math.abs(d) < step ? d : Math.sign(d) * step;
      }
      const speed = lit ? sh.speed : sh.speed * 0.5;
      const cur = lit ? 0.3 : 1;
      sh.x += (Math.cos(sh.heading) * speed + s.current.x * cur) * dt;
      sh.y += (Math.sin(sh.heading) * speed + s.current.y * cur) * dt;
      sh.wake += speed * dt;

      // off the map
      if (sh.x < -14 || sh.x > W + 14 || sh.y < HORIZON - 16) {
        sh.state = "lost";
        s.combo = 0;
        s.lanterns--;
        w.wrecks++;
        s.stats.wrecked++;
        addFloat(s, clamp(sh.x, 20, W - 20), clamp(sh.y, HORIZON + 6, REEF_Y), "LOST AT SEA", C.danger);
        s.events.push({ type: "wreck" });
        if (s.lanterns <= 0) {
          s.mode = "over";
          s.timer = 0;
          s.best.score = Math.max(s.best.score, s.score);
          s.best.night = Math.max(s.best.night, s.night);
          s.events.push({ type: "over" });
          return;
        }
        continue;
      }
      // rocks
      let hit = false;
      for (const r of s.rocks) {
        if (Math.hypot(r.x - sh.x, r.y - sh.y) < r.r + sh.beam * 0.5 + 0.5) hit = true;
      }
      if (hit) {
        wreck(s, sh, "WRECKED");
        if (s.mode === "over") return;
        continue;
      }
      // the reef and the gap
      if (sh.y >= REEF_Y - 1) {
        if (sh.x > GAP.l + 3 && sh.x < GAP.r - 3) dock(s, sh);
        else {
          wreck(s, sh, "ON THE REEF");
          if (s.mode === "over") return;
        }
      }
    }
    // drop ships that are done
    for (let i = s.ships.length - 1; i >= 0; i--) {
      const sh = s.ships[i];
      if (sh.state === "lost") s.ships.splice(i, 1);
      else if (sh.state === "docked" && sh.age > 1.4) s.ships.splice(i, 1);
      else if (sh.state === "wrecked" && sh.age > 2.2) s.ships.splice(i, 1);
    }

    // the night ends when every ship is home or gone
    if (w.spawned >= w.toSpawn && s.ships.every((sh) => sh.state !== "sailing")) {
      s.mode = "between";
      s.timer = 0;
      w.done = true;
      s.best.score = Math.max(s.best.score, s.score);
      s.best.night = Math.max(s.best.night, s.night);
      if (w.wrecks === 0 && s.lanterns < 5) {
        s.lanterns++;
        w.perfect = true;
      }
      s.events.push({ type: "cleared", perfect: w.wrecks === 0 });
    }
  }

  // --- rendering -------------------------------------------------------------

  function rect(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }

  function poly(ctx, pts, color, alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawSky(ctx, s) {
    rect(ctx, 0, 0, W, 9, C.skyTop);
    rect(ctx, 0, 9, W, 8, C.skyMid);
    rect(ctx, 0, 17, W, HORIZON - 17, C.skyLow);
    rect(ctx, 0, HORIZON - 1, W, 1, C.haze);
    for (const st of s.stars) {
      const tw = Math.sin(s.t * 1.7 + st.phase);
      if (tw > -0.6) {
        ctx.globalAlpha = 0.45 + tw * 0.4;
        rect(ctx, st.x, st.y, 1, 1, C.star);
      }
    }
    ctx.globalAlpha = 1;
    // the moon
    const mx = 268;
    const my = 10;
    rect(ctx, mx - 2, my - 4, 5, 9, C.moon);
    rect(ctx, mx - 4, my - 2, 9, 5, C.moon);
    rect(ctx, mx - 3, my - 3, 7, 7, C.moon);
    rect(ctx, mx + 1, my - 1, 2, 2, C.moonShade);
    rect(ctx, mx - 2, my + 1, 2, 1, C.moonShade);
    // moonlight shimmering on the water
    moonlight(ctx, mx, HORIZON, 40, 1, s.t);
  }

  // Short streaks of light down the water under the moon.
  function moonlight(ctx, mx, top, height, sc, t) {
    ctx.globalAlpha = 0.22;
    for (let i = 0; i < height / (3 * sc); i++) {
      const y = top + i * 3 * sc;
      const x = mx - 6 * sc + (((i * 7 + Math.floor(t * 3)) % 13) - 3) * sc;
      const fade = 1 - i / (height / (3 * sc));
      ctx.globalAlpha = 0.08 + 0.18 * fade;
      rect(ctx, x, y, (2 + (i % 2)) * sc, sc, C.moon);
    }
    ctx.globalAlpha = 1;
  }

  // A round glow, drawn row by row.
  function glow(ctx, x, y, r, color, alpha) {
    ctx.globalAlpha = alpha;
    for (let dy = -r; dy <= r; dy++) {
      const half = Math.round(Math.sqrt(r * r - dy * dy));
      rect(ctx, x - half, y + dy, half * 2 + 1, 1, color);
    }
    ctx.globalAlpha = 1;
  }

  function drawSea(ctx, s) {
    rect(ctx, 0, HORIZON, W, REEF_Y - HORIZON, C.sea);
    rect(ctx, 0, HORIZON, W, 6, C.seaDeep);
    rect(ctx, 0, REEF_Y - 2, W, H - REEF_Y + 2, C.seaDeep);
    const span = REEF_Y - HORIZON - 4;
    for (const st of s.streaks) {
      const speed = st.dim ? 0.55 : 1;
      let x = (st.x + s.flow.x * speed) % W;
      let y = (st.y + s.flow.y * speed) % span;
      if (x < 0) x += W;
      if (y < 0) y += span;
      const vis = Math.sin(s.t * 0.9 + st.phase);
      if (vis < -0.3) continue;
      rect(ctx, Math.floor(x), HORIZON + 2 + Math.floor(y), st.len, 1, st.dim ? C.streakDim : C.streak);
    }
  }

  function drawBeam(ctx, s) {
    const len = 300;
    const steps = [
      [0.17, 0.09],
      [0.11, 0.09],
      [0.05, 0.1],
    ];
    for (const [half, a] of steps) {
      const a1 = s.beam - half;
      const a2 = s.beam + half;
      poly(
        ctx,
        [
          [LAMP.x, LAMP.y],
          [LAMP.x + Math.cos(a1) * len, LAMP.y + Math.sin(a1) * len],
          [LAMP.x + Math.cos(a2) * len, LAMP.y + Math.sin(a2) * len],
        ],
        C.beam,
        a,
      );
    }
  }

  function drawFog(ctx, s) {
    for (const f of s.fogs) {
      const x0 = Math.floor(f.x - f.rx);
      const x1 = Math.ceil(f.x + f.rx);
      const y0 = Math.floor(f.y - f.ry);
      const y1 = Math.ceil(f.y + f.ry);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = (x - f.x) / f.rx;
          const dy = (y - f.y) / f.ry;
          const d = dx * dx + dy * dy;
          if (d < 1) {
            // dithered edge, lit by the beam a little
            const lit = isLit(s, x, y);
            if (d > 0.72 && (x + y) % 2 === 0) continue;
            if (d > 0.9 && (x + y) % 3 !== 0) continue;
            ctx.globalAlpha = lit ? 0.5 : 0.36;
            rect(ctx, x, y, 1, 1, C.fog);
          }
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawRockPixels(ctx, x, y, px) {
    for (let i = 0; i < px.length; i += 3) {
      const shade = px[i + 2];
      rect(ctx, x + px[i], y + px[i + 1], 1, 1, shade === 2 ? C.rockLight : shade === 1 ? C.rock : C.rockDark);
    }
  }

  function drawRocks(ctx, s) {
    for (const r of s.rocks) {
      // foam
      for (let k = 0; k < 5; k++) {
        const a = s.t * 0.6 + r.phase + (k * TAU) / 5;
        const rr = r.r + 1.5 + Math.sin(s.t * 2 + k) * 0.8;
        ctx.globalAlpha = 0.5 + 0.4 * Math.sin(s.t * 3 + k * 1.3);
        rect(ctx, Math.round(r.x + Math.cos(a) * rr * 1.25), Math.round(r.y + Math.sin(a) * rr), 2, 1, C.foam);
      }
      ctx.globalAlpha = 1;
      drawRockPixels(ctx, Math.round(r.x), Math.round(r.y), r.px);
    }
  }

  function drawReef(ctx, s) {
    // foam along the reef
    for (let x = 0; x < W; x += 3) {
      if (x > GAP.l - 2 && x < GAP.r + 2) continue;
      const v = Math.sin(x * 0.9 + s.t * 2.4);
      if (v > 0.2) {
        ctx.globalAlpha = 0.35 + v * 0.4;
        rect(ctx, x, REEF_Y - 3 + Math.round(v), 2, 1, C.foam);
      }
    }
    ctx.globalAlpha = 1;
    drawRockPixels(ctx, 0, 0, s.reef);
    // channel markers: red to port, green to starboard, as seen from the sea
    const blink = Math.sin(s.t * 4) > 0;
    rect(ctx, GAP.l - 1, REEF_Y - 6, 2, 6, C.dark);
    rect(ctx, GAP.r, REEF_Y - 6, 2, 6, C.dark);
    rect(ctx, GAP.l - 1, REEF_Y - 7, 2, 2, blink ? C.port : "#7a2a26");
    rect(ctx, GAP.r, REEF_Y - 7, 2, 2, blink ? "#2a7a4a" : C.starboard);
    if (blink) {
      ctx.globalAlpha = 0.25;
      rect(ctx, GAP.l - 3, REEF_Y - 9, 6, 6, C.port);
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = 0.25;
      rect(ctx, GAP.r - 2, REEF_Y - 9, 6, 6, C.starboard);
      ctx.globalAlpha = 1;
    }
  }

  function drawHarbor(ctx, s) {
    // the quay, with the harbor water inside the gap
    rect(ctx, 0, REEF_Y + 6, W, H - REEF_Y - 6, C.quay);
    rect(ctx, 0, REEF_Y + 6, W, 1, C.quayTop);
    rect(ctx, GAP.l + 2, REEF_Y + 6, GAP.r - GAP.l - 4, 20, C.seaDeep);
    rect(ctx, GAP.l + 2, REEF_Y + 26, GAP.r - GAP.l - 4, 1, C.quayTop);
    // harbor lights along the quay
    for (let x = 12; x < W; x += 36) {
      if (x > GAP.l - 12 && x < GAP.r + 12) continue;
      rect(ctx, x, REEF_Y + 12, 1, 5, C.dark);
      ctx.globalAlpha = 0.8 + 0.2 * Math.sin(s.t * 3 + x);
      rect(ctx, x, REEF_Y + 11, 1, 1, C.glow);
      ctx.globalAlpha = 1;
    }
    // a few roofs of the town
    const roofs = [
      [6, 10],
      [30, 7],
      [52, 12],
      [84, 8],
      [106, 11],
      [206, 9],
      [232, 12],
      [262, 7],
      [286, 11],
      [304, 8],
    ];
    for (const [x, w] of roofs) {
      rect(ctx, x, REEF_Y + 17, w, 8, C.dark);
      rect(ctx, x + 1, REEF_Y + 16, w - 2, 1, C.quayTop);
      if ((x * 7) % 3 === 0) rect(ctx, x + 2, REEF_Y + 20, 1, 1, C.glow);
    }
  }

  function drawLighthouse(ctx, s, lampOn) {
    const x = LAMP.x;
    const y = LAMP.y;
    // the islet it stands on, at the harbor mouth
    rect(ctx, x - 9, y + 10, 19, 6, C.rock);
    rect(ctx, x - 7, y + 9, 15, 1, C.rockLight);
    rect(ctx, x - 10, y + 13, 21, 4, C.rockDark);
    // the tower
    rect(ctx, x - 4, y + 2, 9, 9, C.white);
    rect(ctx, x - 4, y + 5, 9, 3, C.red);
    rect(ctx, x - 5, y + 11, 11, 1, C.dark);
    rect(ctx, x - 3, y - 2, 7, 4, C.white);
    rect(ctx, x - 4, y + 1, 9, 1, C.dark);
    // the gallery and the lantern room
    rect(ctx, x - 5, y - 3, 11, 1, C.dark);
    rect(ctx, x - 3, y - 6, 7, 3, C.dark);
    rect(ctx, x - 2, y - 5, 5, 2, lampOn ? C.lamp : C.sailShade);
    rect(ctx, x - 2, y - 7, 5, 1, C.dark);
    rect(ctx, x, y - 8, 1, 1, C.dark);
    // the glow
    if (lampOn) {
      glow(ctx, x, y - 4, 7, C.glow, 0.12);
      glow(ctx, x, y - 4, 4, C.glow, 0.22 + 0.08 * Math.sin(s.t * 6));
    }
    // the door, and a window
    rect(ctx, x, y + 8, 1, 3, C.dark);
    rect(ctx, x, y + 3, 1, 1, C.glow);
  }

  // A ship is a capsule pointing along its heading, with a sail (or a
  // funnel) amidships and a lantern that glows while it's lit.
  function drawShip(ctx, s, sh) {
    const cx = sh.x;
    const cy = sh.y;
    const hx = Math.cos(sh.heading);
    const hy = Math.sin(sh.heading);
    const half = sh.len / 2;
    const R = Math.ceil(half + sh.beam);
    const wrecked = sh.state === "wrecked";
    const sink = wrecked ? Math.min(1, sh.age / 2) : 0;
    const docked = sh.state === "docked";
    if (docked) ctx.globalAlpha = Math.max(0, 1 - sh.age / 1.4);
    else if (wrecked) ctx.globalAlpha = 1 - sink;

    // the wake
    if (sh.state === "sailing") {
      for (let k = 1; k <= 3; k++) {
        const d = half + k * 2.2 + (sh.wake % 2);
        const wx = Math.round(cx - hx * d);
        const wy = Math.round(cy - hy * d);
        ctx.globalAlpha = 0.5 - k * 0.12;
        rect(ctx, wx, wy, 1, 1, C.foam);
      }
      ctx.globalAlpha = 1;
    }

    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        // position along and across the hull
        const along = dx * hx + dy * hy;
        const across = -dx * hy + dy * hx;
        const t = clamp(along, -half + 1, half - 1);
        const d = Math.hypot(dx - hx * t, dy - hy * t);
        const width = sh.beam * 0.5 * (along > half * 0.45 ? 1 - (along - half * 0.45) / (half * 0.9) : 1);
        if (d <= width + 0.2) {
          let color = C.hull;
          if (across < -0.6) color = C.hullLight;
          else if (across > 0.9) color = C.hullDark;
          if (along > half - 1.6) color = C.hullLight;
          if (wrecked && (dx + dy) % 2 === 0) color = C.hullDark;
          rect(ctx, Math.round(cx) + dx, Math.round(cy) + dy, 1, 1, color);
        }
      }
    }
    // sails, or a funnel and smoke
    const px = Math.round(cx);
    const py = Math.round(cy);
    if (sh.sail > 0 && !wrecked) {
      for (let i = 0; i < sh.sail; i++) {
        const off = sh.sail === 1 ? 0 : i === 0 ? -2.2 : 2.2;
        const sx = Math.round(cx + hx * off);
        const sy = Math.round(cy + hy * off);
        // a sail is a short bar across the hull, billowing to leeward
        const lean = s.current.x > 0 ? 1 : -1;
        rect(ctx, sx - 1, sy - 1, 3, 3, C.sail);
        rect(ctx, sx + lean, sy, 1, 1, C.sailShade);
        rect(ctx, sx, sy, 1, 1, C.dark);
      }
    } else if (!wrecked) {
      rect(ctx, px - 1, py - 1, 2, 2, C.dark);
      rect(ctx, px - 1, py - 1, 1, 1, C.red);
      for (let k = 1; k <= 3; k++) {
        const t = s.t * 2 + sh.id;
        ctx.globalAlpha = 0.55 - k * 0.14;
        rect(ctx, px - 1 - Math.round(hx * k * 2.5 - Math.sin(t + k) * 1.2), py - 2 - k - Math.round(hy * k * 1.5), 2, 1, C.smoke);
      }
      ctx.globalAlpha = docked ? Math.max(0, 1 - sh.age / 1.4) : 1;
    }
    // the stern lantern
    if (sh.lit && sh.state === "sailing") {
      const lx = Math.round(cx - hx * (half - 1.5));
      const ly = Math.round(cy - hy * (half - 1.5));
      rect(ctx, lx, ly, 1, 1, C.lamp);
      ctx.globalAlpha = 0.35;
      rect(ctx, lx - 1, ly - 1, 3, 3, C.glow);
      ctx.globalAlpha = 1;
    }
    if (wrecked) {
      // foam where it went down
      for (let k = 0; k < 4; k++) {
        const a = sh.age * 3 + k * 1.57;
        ctx.globalAlpha = Math.max(0, 0.8 - sh.age * 0.35);
        rect(ctx, px + Math.round(Math.cos(a) * (2 + sh.age * 4)), py + Math.round(Math.sin(a) * (1.5 + sh.age * 2.5)), 2, 1, C.foam);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawLantern(ctx, x, y, on) {
    rect(ctx, x + 1, y, 3, 1, C.dark);
    rect(ctx, x, y + 1, 5, 4, C.dark);
    rect(ctx, x + 1, y + 2, 3, 2, on ? C.lamp : C.rockDark);
    rect(ctx, x + 2, y - 1, 1, 1, C.dark);
    if (on) {
      ctx.globalAlpha = 0.3;
      rect(ctx, x - 1, y, 7, 6, C.glow);
      ctx.globalAlpha = 1;
    }
  }

  function drawHud(ctx, s) {
    label(ctx, 4, 4, "SCORE " + s.score, C.text, 1, "left");
    if (s.combo > 1) label(ctx, 4, 12, "X" + s.combo, C.accent, 1, "left");
    label(ctx, W / 2, 4, "NIGHT " + s.night, C.text, 1, "center");
    for (let i = 0; i < 5; i++) {
      if (i < Math.max(s.lanterns, 0) || i < 3) drawLantern(ctx, W - 10 - i * 8, 5, i < s.lanterns);
    }
    if (s.wave) {
      const left = s.wave.toSpawn - s.wave.spawned;
      if (left > 0) label(ctx, 4, H - 10, left + " MORE AT SEA", C.dim, 1, "left");
      else label(ctx, 4, H - 10, "LAST SHIPS", C.dim, 1, "left");
    }
    for (const h of s.hints) {
      if (s.timer >= h.from && s.timer < h.to) {
        const fade = Math.min(1, (s.timer - h.from) * 3, (h.to - s.timer) * 3);
        ctx.globalAlpha = fade;
        label(ctx, W / 2, HORIZON + 8, h.text, C.accent, 1, "center");
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawFloats(ctx, s) {
    for (const f of s.floats) {
      ctx.globalAlpha = Math.min(1, f.ttl * 2);
      label(ctx, Math.round(f.x), Math.round(f.y), f.text, f.color, 1, "center");
    }
    ctx.globalAlpha = 1;
    for (const d of s.debris) {
      ctx.globalAlpha = Math.min(1, d.ttl);
      rect(ctx, Math.round(d.x), Math.round(d.y), 1, 1, d.c);
    }
    ctx.globalAlpha = 1;
  }

  function dimScreen(ctx, a) {
    ctx.globalAlpha = a;
    rect(ctx, 0, 0, W, H, "#000000");
    ctx.globalAlpha = 1;
  }

  function drawTitle(ctx, s, opts) {
    dimScreen(ctx, 0.25);
    label(ctx, W / 2, 36, "LAMPWARD", C.accent, 4, "center");
    label(ctx, W / 2, 62, "KEEP THE LIGHT. BRING THEM HOME.", C.text, 1, "center");
    const blink = Math.sin(s.t * 3) > -0.2;
    if (blink) label(ctx, W / 2, 96, opts.touch ? "TAP TO BEGIN" : "PRESS SPACE OR CLICK TO BEGIN", C.text, 1, "center");
    label(ctx, W / 2, 108, opts.touch ? "DRAG TO AIM THE LIGHT" : "AIM WITH THE MOUSE OR ARROW KEYS", C.dim, 1, "center");
    if (s.best.score > 0) label(ctx, W / 2, 122, "BEST " + s.best.score + "  NIGHT " + s.best.night, C.dim, 1, "center");
    if (!opts.touch) label(ctx, W - 4, H - 10, "M: SOUND " + (opts.muted ? "OFF" : "ON"), C.dim, 1, "right");
    label(ctx, 4, H - 10, "BY CLAUDE", C.dim, 1, "left");
  }

  function drawBetween(ctx, s) {
    dimScreen(ctx, 0.3);
    const w = s.wave;
    label(ctx, W / 2, 60, "NIGHT " + s.night + " CLEARED", C.accent, 2, "center");
    if (w && w.perfect) label(ctx, W / 2, 80, "PERFECT NIGHT: +1 LANTERN", C.good, 1, "center");
    else if (w) label(ctx, W / 2, 80, w.wrecks + " LOST THIS NIGHT", C.dim, 1, "center");
    if (s.timer > 1.6) {
      label(ctx, W / 2, 100, "NIGHT " + (s.night + 1), C.text, 1, "center");
      const n = nightParams(s.night + 1);
      label(ctx, W / 2, 110, n.ships + " SHIPS ARE COMING", C.dim, 1, "center");
    }
  }

  function drawOver(ctx, s) {
    dimScreen(ctx, 0.45);
    label(ctx, W / 2, 46, "THE LIGHT WENT OUT", C.danger, 2, "center");
    label(ctx, W / 2, 70, "SCORE " + s.score, C.text, 2, "center");
    label(ctx, W / 2, 88, "NIGHT " + s.night + "   " + s.stats.docked + " HOME   " + s.stats.wrecked + " LOST", C.dim, 1, "center");
    label(ctx, W / 2, 100, "BEST " + s.best.score + "  NIGHT " + s.best.night, C.dim, 1, "center");
    if (s.timer > 1.2 && Math.sin(s.t * 3) > -0.2) label(ctx, W / 2, 122, "TAP OR PRESS SPACE TO LIGHT IT AGAIN", C.text, 1, "center");
  }

  function drawPaused(ctx, s, opts) {
    dimScreen(ctx, 0.5);
    label(ctx, W / 2, 70, "PAUSED", C.text, 2, "center");
    label(ctx, W / 2, 92, opts.touch ? "TAP TO CARRY ON" : "PRESS ANY KEY TO CARRY ON", C.dim, 1, "center");
  }

  // Draw one frame. opts: { touch, muted }.
  function render(ctx, s, opts) {
    opts = opts || {};
    const shake = s.shake > 0 ? Math.round(Math.sin(s.t * 60) * s.shake * 4) : 0;
    ctx.globalAlpha = 1;
    drawSky(ctx, s);
    drawSea(ctx, s);
    if (shake) {
      // a jolt when a ship is lost: nudge the water line
      ctx.globalAlpha = 0.08;
      rect(ctx, 0, HORIZON + shake, W, 2, C.foam);
      ctx.globalAlpha = 1;
    }
    const lampOn = s.mode !== "over";
    if (lampOn) drawBeam(ctx, s);
    // unlit ships in fog are hidden: draw ships, then fog, then lit ships
    const sailing = s.ships.filter((sh) => sh.state !== "wrecked");
    for (const sh of sailing) {
      if (!(sh.lit && sh.state === "sailing")) drawShip(ctx, s, sh);
    }
    for (const sh of s.ships) if (sh.state === "wrecked") drawShip(ctx, s, sh);
    drawRocks(ctx, s);
    drawFog(ctx, s);
    for (const sh of sailing) {
      if (sh.lit && sh.state === "sailing") drawShip(ctx, s, sh);
    }
    drawReef(ctx, s);
    drawHarbor(ctx, s);
    drawLighthouse(ctx, s, lampOn);
    drawFloats(ctx, s);
    if (s.mode === "play" || s.mode === "between") drawHud(ctx, s);
    if (s.mode === "title") drawTitle(ctx, s, opts);
    else if (s.mode === "between") drawBetween(ctx, s);
    else if (s.mode === "over") drawOver(ctx, s);
    if (s.paused && s.mode === "play") drawPaused(ctx, s, opts);
  }

  // --- key art, for the store ------------------------------------------------

  // A composition at any size: the sea, the lamp, its beam, and a few ships,
  // drawn with the same pieces at a pixel scale that suits the size. Used by
  // tools/art.js for the icon, cover, banner, poster, and splash.
  function keyArt(ctx, w, h, variant, seed) {
    const rng = mulberry32(seed || 7);
    const s = newGame(seed || 7);
    s.t = 3.2;
    const horizon = Math.round(h * (variant === "icon" ? 0.3 : 0.26));
    const lampX = Math.round(w / 2);
    const lampY = Math.round(h * (variant === "icon" ? 0.5 : variant === "poster" ? 0.78 : 0.8));
    // sky
    rect(ctx, 0, 0, w, Math.round(horizon * 0.4), C.skyTop);
    rect(ctx, 0, Math.round(horizon * 0.4), w, Math.round(horizon * 0.35), C.skyMid);
    rect(ctx, 0, Math.round(horizon * 0.75), w, horizon - Math.round(horizon * 0.75), C.skyLow);
    rect(ctx, 0, horizon - 1, w, 1, C.haze);
    for (let i = 0; i < w * horizon * 0.004; i++) {
      ctx.globalAlpha = 0.4 + rng() * 0.6;
      rect(ctx, Math.floor(rng() * w), Math.floor(rng() * (horizon - 3)), 1, 1, C.star);
    }
    ctx.globalAlpha = 1;
    // moon
    const mx = Math.round(w * 0.87);
    const my = Math.round(horizon * 0.4);
    const mr = Math.max(3, Math.round(horizon * 0.14));
    for (let dy = -mr; dy <= mr; dy++) {
      for (let dx = -mr; dx <= mr; dx++) {
        if (dx * dx + dy * dy <= mr * mr) rect(ctx, mx + dx, my + dy, 1, 1, dx > mr * 0.3 && dy > -mr * 0.3 ? C.moonShade : C.moon);
      }
    }
    // sea
    rect(ctx, 0, horizon, w, h - horizon, C.sea);
    rect(ctx, 0, horizon, w, Math.max(2, Math.round(h * 0.03)), C.seaDeep);
    moonlight(ctx, mx, horizon, Math.round(h * 0.3), Math.max(1, Math.round(w / 320)), 3.2);
    for (let i = 0; i < w * (h - horizon) * 0.004; i++) {
      const y = horizon + 2 + Math.floor(rng() * (h - horizon - 4));
      rect(ctx, Math.floor(rng() * w), y, 2 + Math.floor(rng() * 3), 1, rng() < 0.5 ? C.streak : C.streakDim);
    }
    // beam
    const beam = -Math.PI / 2 - 0.38;
    const len = Math.max(w, h) * 1.5;
    for (const [half, a] of [
      [0.2, 0.09],
      [0.12, 0.09],
      [0.055, 0.1],
    ]) {
      poly(
        ctx,
        [
          [lampX, lampY],
          [lampX + Math.cos(beam - half) * len, lampY + Math.sin(beam - half) * len],
          [lampX + Math.cos(beam + half) * len, lampY + Math.sin(beam + half) * len],
        ],
        C.beam,
        a,
      );
    }
    // ships, one in the beam, two coasting
    const sc = variant === "icon" ? 1 : Math.max(1, Math.round(w / 200));
    const shipAt = function (x, y, heading, kind, lit) {
      const k = KINDS[kind];
      const sh = {
        x: x,
        y: y,
        heading: heading,
        len: k.len * sc,
        beam: k.beam * sc,
        sail: k.sail,
        lit: lit,
        state: "sailing",
        age: 0,
        wake: 0,
        id: 1,
      };
      drawShip(ctx, s, sh);
    };
    if (variant !== "icon") {
      shipAt(lampX + Math.cos(beam) * h * 0.42, lampY + Math.sin(beam) * h * 0.42, beam + Math.PI, "barque", true);
      shipAt(w * 0.78, horizon + (h - horizon) * 0.32, Math.PI * 0.72, "sloop", false);
      shipAt(w * 0.18, horizon + (h - horizon) * 0.55, 0.5, "sloop", false);
    }
    // rocks
    if (variant !== "icon") {
      for (let i = 0; i < 3; i++) {
        const r = (3 + rng() * 3) * sc;
        const x = w * (0.12 + rng() * 0.76);
        const y = horizon + (h - horizon) * (0.25 + rng() * 0.35);
        if (Math.abs(x - lampX) < w * 0.15) continue;
        drawRockPixels(ctx, Math.round(x), Math.round(y), makeRockPixels(rng, r));
      }
    }
    // the lighthouse, scaled up with nearest-neighbour by drawing a mini
    // buffer through a scaled rect shim
    const lsc = variant === "icon" ? 3 : Math.max(2, Math.round(h / 70));
    const shim = {
      fillStyle: "#000",
      globalAlpha: 1,
      fillRect: function (x, y, rw, rh) {
        ctx.globalAlpha = this.globalAlpha;
        ctx.fillStyle = this.fillStyle;
        ctx.fillRect(lampX + (x - LAMP.x) * lsc, lampY + (y - LAMP.y) * lsc, rw * lsc, rh * lsc);
        ctx.globalAlpha = 1;
      },
    };
    const fake = { t: 3.2 };
    drawLighthouse(shim, fake, true);
    // the islet's reflection
    ctx.globalAlpha = 0.12;
    rect(ctx, lampX - 10 * lsc, lampY + 17 * lsc, 21 * lsc, Math.round(h * 0.08), C.white);
    ctx.globalAlpha = 1;
    return { lampX: lampX, lampY: lampY, horizon: horizon, scale: lsc };
  }

  return {
    W: W,
    H: H,
    LAMP: LAMP,
    C: C,
    KINDS: KINDS,
    newGame: newGame,
    begin: begin,
    startNight: startNight,
    update: update,
    render: render,
    keyArt: keyArt,
    text: text,
    label: label,
    textWidth: textWidth,
    nightParams: nightParams,
    isLit: isLit,
    inFog: inFog,
  };
});
