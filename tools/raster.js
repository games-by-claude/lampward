// A software rasterizer for the subset of Canvas 2D that game.js uses, and a
// PNG writer, so the game's own renderer can draw the screenshots and the
// store art under Node, with no browser.
"use strict";

const zlib = require("node:zlib");

function parseColor(c) {
  if (typeof c !== "string") return [0, 0, 0];
  if (c[0] === "#") {
    if (c.length === 4) return [parseInt(c[1] + c[1], 16), parseInt(c[2] + c[2], 16), parseInt(c[3] + c[3], 16)];
    return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  }
  const m = /rgba?\(([^)]+)\)/.exec(c);
  if (m) {
    const p = m[1].split(",").map(Number);
    return [p[0], p[1], p[2]];
  }
  return [0, 0, 0];
}

class Raster {
  constructor(w, h) {
    this.width = w;
    this.height = h;
    this.data = new Float32Array(w * h * 3);
    this.fillStyle = "#000000";
    this.globalAlpha = 1;
    this.imageSmoothingEnabled = false;
    this.path = [];
    this.cache = new Map();
  }

  color() {
    let c = this.cache.get(this.fillStyle);
    if (!c) {
      c = parseColor(this.fillStyle);
      this.cache.set(this.fillStyle, c);
    }
    return c;
  }

  blend(i, c, a) {
    const d = this.data;
    d[i] += (c[0] - d[i]) * a;
    d[i + 1] += (c[1] - d[i + 1]) * a;
    d[i + 2] += (c[2] - d[i + 2]) * a;
  }

  clearRect() {}

  fillRect(x, y, w, h) {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.width, Math.round(x + w));
    const y1 = Math.min(this.height, Math.round(y + h));
    if (x1 <= x0 || y1 <= y0) return;
    const c = this.color();
    const a = this.globalAlpha;
    for (let yy = y0; yy < y1; yy++) {
      let i = (yy * this.width + x0) * 3;
      for (let xx = x0; xx < x1; xx++, i += 3) this.blend(i, c, a);
    }
  }

  beginPath() {
    this.path = [];
  }
  moveTo(x, y) {
    this.path.push([x, y]);
  }
  lineTo(x, y) {
    this.path.push([x, y]);
  }
  closePath() {}

  // Scanline fill, even-odd, sampling pixel centers.
  fill() {
    const p = this.path;
    if (p.length < 3) return;
    const c = this.color();
    const a = this.globalAlpha;
    let yMin = Infinity;
    let yMax = -Infinity;
    for (const [, y] of p) {
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }
    const y0 = Math.max(0, Math.floor(yMin));
    const y1 = Math.min(this.height - 1, Math.ceil(yMax));
    const xs = [];
    for (let yy = y0; yy <= y1; yy++) {
      const sy = yy + 0.5;
      xs.length = 0;
      for (let i = 0; i < p.length; i++) {
        const [ax, ay] = p[i];
        const [bx, by] = p[(i + 1) % p.length];
        if (ay === by) continue;
        if (sy < Math.min(ay, by) || sy >= Math.max(ay, by)) continue;
        xs.push(ax + ((sy - ay) * (bx - ax)) / (by - ay));
      }
      xs.sort((m, n) => m - n);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, Math.round(xs[k]));
        const xb = Math.min(this.width, Math.round(xs[k + 1]));
        let i = (yy * this.width + xa) * 3;
        for (let xx = xa; xx < xb; xx++, i += 3) this.blend(i, c, a);
      }
    }
  }

  // The pixels, scaled up by a whole number with nearest neighbour.
  rgb(scale) {
    scale = scale || 1;
    const W = this.width * scale;
    const Hh = this.height * scale;
    const out = Buffer.alloc(W * Hh * 3);
    for (let y = 0; y < Hh; y++) {
      const sy = Math.floor(y / scale);
      for (let x = 0; x < W; x++) {
        const sx = Math.floor(x / scale);
        const i = (sy * this.width + sx) * 3;
        const o = (y * W + x) * 3;
        out[o] = Math.max(0, Math.min(255, Math.round(this.data[i])));
        out[o + 1] = Math.max(0, Math.min(255, Math.round(this.data[i + 1])));
        out[o + 2] = Math.max(0, Math.min(255, Math.round(this.data[i + 2])));
      }
    }
    return { width: W, height: Hh, data: out };
  }

  png(scale) {
    const img = this.rgb(scale);
    return encodePng(img.width, img.height, img.data);
  }
}

function crc32(buf) {
  if (zlib.crc32) return zlib.crc32(buf) >>> 0;
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePng(width, height, rgb) {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

module.exports = { Raster, encodePng };
