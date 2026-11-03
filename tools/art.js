// Draws the store art and the screenshots with the game's own renderer.
//
//   node tools/art.js            # writes everything under .arcadible/
//   node tools/art.js shots      # only the screenshots
//   node tools/art.js art        # only the icon, cover, banner, poster, splash
//
// Screenshots are frames of the real simulation, played by a small
// auto-player, so they show what the game looks like rather than a mock-up.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Raster } = require("./raster");
const G = require("../.arcadible-public/game.js");

const ROOT = path.join(__dirname, "..");
const ART = path.join(ROOT, ".arcadible");
const GALLERY = path.join(ART, "gallery");
const W = G.W;
const H = G.H;

function write(file, buf) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  console.log("wrote", path.relative(ROOT, file), buf.length, "bytes");
}

// --- the auto-player ----------------------------------------------------------

// Aims the beam at the sailing ship that most needs it: the one nearest the
// reef whose heading isn't already toward the lamp, holding each target for a
// moment so ships get turned rather than flickered at.
function autoplay(s, input, hold) {
  const sailing = s.ships.filter((sh) => sh.state === "sailing");
  if (!sailing.length) {
    input.aim = false;
    return hold;
  }
  if (hold.ship && hold.until > s.t && sailing.includes(hold.ship)) {
    input.aim = true;
    input.aimX = hold.ship.x;
    input.aimY = hold.ship.y;
    return hold;
  }
  let best = null;
  let bestScore = -Infinity;
  for (const sh of sailing) {
    const want = Math.atan2(G.LAMP.y - sh.y, G.LAMP.x - sh.x);
    let d = Math.abs(((sh.heading - want + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    const score = sh.y * 0.02 + d * 2;
    if (score > bestScore) {
      bestScore = score;
      best = sh;
    }
  }
  hold = { ship: best, until: s.t + 0.9 };
  input.aim = true;
  input.aimX = best.x;
  input.aimY = best.y;
  return hold;
}

function run(s, seconds, input, hold) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) {
    hold = autoplay(s, input, hold);
    G.update(s, 1 / 60, input);
    input.action = false;
    s.events.length = 0;
  }
  return hold;
}

function frame(s, opts) {
  const r = new Raster(W, H);
  G.render(r, s, opts || {});
  return r;
}

function shots() {
  // 1. night 1, the first ships, with the hint on screen
  let s = G.newGame(11);
  s.best = { score: 1480, night: 5 };
  G.begin(s);
  let input = { left: false, right: false, aim: false, aimX: 0, aimY: 0, action: false };
  let hold = run(s, 6.4, input, {});
  write(path.join(GALLERY, "screenshot_01.png"), frame(s).png(6));

  // 2. night 3: fog, rocks, a combo going
  s = G.newGame(23);
  G.begin(s);
  s.score = 310;
  G.startNight(s, 3);
  s.combo = 3;
  input = { left: false, right: false, aim: false, aimX: 0, aimY: 0, action: false };
  hold = run(s, 9.5, input, {});
  write(path.join(GALLERY, "screenshot_02.png"), frame(s).png(6));

  // 3. night 5: a steamer, more rocks, a stronger current
  s = G.newGame(5);
  G.begin(s);
  s.score = 1180;
  s.lanterns = 4;
  G.startNight(s, 5);
  input = { left: false, right: false, aim: false, aimX: 0, aimY: 0, action: false };
  hold = run(s, 11, input, {});
  write(path.join(GALLERY, "screenshot_03.png"), frame(s).png(6));

  // 4. the title, as the game opens
  s = G.newGame(3);
  s.best = { score: 1480, night: 5 };
  input = { left: false, right: false, aim: false, aimX: 0, aimY: 0, action: false };
  for (let i = 0; i < 60 * 2.1; i++) G.update(s, 1 / 60, input);
  write(path.join(GALLERY, "screenshot_04.png"), frame(s, { touch: false, muted: false }).png(6));
}

function titleOn(r, w, h, scale, y, color) {
  G.label(r, Math.round(w / 2), y, "LAMPWARD", color || G.C.accent, scale, "center");
}

function art() {
  // icon 1024 x 1024: the lamp, centered, no text
  let r = new Raster(128, 128);
  G.keyArt(r, 128, 128, "icon", 7);
  write(path.join(ART, "icon.png"), r.png(8));

  // cover 1536 x 1024 (3:2): the scene with the title
  r = new Raster(192, 128);
  G.keyArt(r, 192, 128, "cover", 8);
  titleOn(r, 192, 128, 4, 20);
  write(path.join(ART, "cover.png"), r.png(8));

  // banner 3360 x 1680 (2:1)
  r = new Raster(420, 210);
  G.keyArt(r, 420, 210, "banner", 9);
  titleOn(r, 420, 210, 6, 30);
  write(path.join(ART, "banner.png"), r.png(8));

  // poster 1024 x 1536 (2:3)
  r = new Raster(128, 192);
  G.keyArt(r, 128, 192, "poster", 10);
  titleOn(r, 128, 192, 3, 38);
  write(path.join(ART, "poster.png"), r.png(8));

  // splash 1920 x 1080 (16:9): no text, it sits behind the store's own
  r = new Raster(320, 180);
  G.keyArt(r, 320, 180, "splash", 12);
  write(path.join(ART, "splash.png"), r.png(6));
}

const what = process.argv[2] || "all";
if (what === "all" || what === "shots") shots();
if (what === "all" || what === "art") art();
