const fs = require("fs");
const path = require("path");

const width = 900;
const height = 420;
const frameCount = 54;
const scale = 4;

const outPath = path.join(__dirname, "..", "assets", "forge-ai-readme.gif");

const palette = [
  [5, 7, 18],
  [8, 12, 30],
  [12, 20, 45],
  [16, 30, 62],
  [22, 46, 86],
  [0, 224, 255],
  [34, 255, 196],
  [146, 103, 255],
  [255, 61, 180],
  [255, 255, 255],
  [180, 210, 255],
  [74, 96, 145],
  [255, 205, 92],
  [73, 255, 116],
  [38, 50, 83],
  [0, 0, 0],
];

while (palette.length < 256) palette.push([0, 0, 0]);

const font = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10011", "10001", "10001", "01111"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "01010", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "01010", "00100", "00100", "00100", "01010", "10001"],
  Y: ["10001", "01010", "00100", "00100", "00100", "00100", "00100"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  ">": ["10000", "01000", "00100", "00010", "00100", "01000", "10000"],
};

function framePixels(t) {
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = Math.hypot(x - width * 0.58, y - height * 0.34);
      const wave = Math.sin((x + t * 10) / 46) + Math.cos((y - t * 7) / 38);
      pixels[y * width + x] = d < 260 + wave * 18 ? 2 : y > 280 ? 1 : 0;
    }
  }
  grid(pixels, t);
  halo(pixels, width * 0.5, height * 0.42, 168, 7, t);
  halo(pixels, width * 0.76, height * 0.2, 118, 8, t + 13);
  particles(pixels, t);
  panels(pixels, t);
  logoMark(pixels, t);
  text(pixels, "FORGE AI", 195, 116, 9, 5, 7);
  text(pixels, "BUILD. EXECUTE. VALIDATE.", 211, 216, 3, 10, 6);
  text(pixels, "PLAN -> CODE -> LIVE TRY -> REVIEW", 162, 330, 3, 10, 9);
  scanline(pixels, t);
  return pixels;
}

function set(pixels, x, y, color) {
  if (x >= 0 && x < width && y >= 0 && y < height) pixels[y * width + x] = color;
}

function rect(pixels, x, y, w, h, color) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) set(pixels, xx, yy, color);
  }
}

function line(pixels, x0, y0, x1, y1, color) {
  let dx = Math.abs(x1 - x0);
  let dy = -Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1;
  let sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  while (true) {
    set(pixels, x0, y0, color);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

function circle(pixels, cx, cy, r, color) {
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y <= r * r) set(pixels, cx + x, cy + y, color);
    }
  }
}

function grid(pixels, t) {
  const offset = (t * 5) % 36;
  for (let x = -36; x < width + 36; x += 36) {
    line(pixels, x + offset, 270, x - 70 + offset, height, 14);
  }
  for (let y = 270; y < height; y += 24) {
    const color = y % 48 === 0 ? 4 : 14;
    line(pixels, 0, y + Math.floor(offset / 3), width, y + Math.floor(offset / 3), color);
  }
}

function halo(pixels, cx, cy, radius, color, t) {
  for (let r = radius; r > 18; r -= 12) {
    if ((r + t) % 4 < 2) {
      for (let a = 0; a < 360; a += 3) {
        const rad = (a * Math.PI) / 180;
        set(pixels, Math.round(cx + Math.cos(rad) * r), Math.round(cy + Math.sin(rad) * r * 0.52), color);
      }
    }
  }
}

function particles(pixels, t) {
  for (let i = 0; i < 90; i++) {
    const x = Math.floor((i * 83 + t * (2 + (i % 4))) % width);
    const y = Math.floor((i * 47 + Math.sin((t + i) / 5) * 18) % 260);
    const color = [5, 6, 7, 8, 12][i % 5];
    set(pixels, x, y, color);
    if (i % 7 === 0) set(pixels, x + 1, y, color);
  }
}

function panels(pixels, t) {
  const progress = (t % frameCount) / frameCount;
  for (let i = 0; i < 4; i++) {
    const x = 105 + i * 176;
    const y = 292 + Math.round(Math.sin((t + i * 8) / 8) * 4);
    rect(pixels, x, y, 128, 2, 11);
    rect(pixels, x, y + 46, 128, 2, 11);
    rect(pixels, x, y, 2, 48, 11);
    rect(pixels, x + 126, y, 2, 48, 11);
    rect(pixels, x + 14, y + 16, 100, 5, 14);
    rect(pixels, x + 14, y + 16, Math.max(8, Math.floor(((progress + i * 0.22) % 1) * 100)), 5, [5, 6, 7, 13][i]);
    circle(pixels, x + 25, y + 32, 5, [5, 6, 8, 12][i]);
    line(pixels, x + 34, y + 32, x + 100, y + 32, 14);
  }
}

function logoMark(pixels, t) {
  const cx = 122;
  const cy = 142;
  for (let i = 0; i < 6; i++) {
    const a = ((i / 6) * Math.PI * 2 + t / 12);
    const x = Math.round(cx + Math.cos(a) * 50);
    const y = Math.round(cy + Math.sin(a) * 32);
    circle(pixels, x, y, 8, i % 2 ? 6 : 5);
    line(pixels, cx, cy, x, y, 11);
  }
  circle(pixels, cx, cy, 17, 9);
  circle(pixels, cx, cy, 10, 5);
}

function text(pixels, value, x, y, size, shadowColor, color) {
  let cursor = x;
  for (const char of value) {
    if (char === " ") {
      cursor += size * 4;
      continue;
    }
    const glyph = font[char] || font["."];
    drawGlyph(pixels, glyph, cursor + size, y + size, size, shadowColor);
    drawGlyph(pixels, glyph, cursor, y, size, color);
    cursor += size * 6;
  }
}

function drawGlyph(pixels, glyph, x, y, size, color) {
  for (let gy = 0; gy < glyph.length; gy++) {
    for (let gx = 0; gx < glyph[gy].length; gx++) {
      if (glyph[gy][gx] === "1") rect(pixels, x + gx * size, y + gy * size, size, size, color);
    }
  }
}

function scanline(pixels, t) {
  const y = (t * 9) % height;
  rect(pixels, 0, y, width, 2, 5);
  for (let yy = 0; yy < height; yy += 4) {
    for (let x = 0; x < width; x++) {
      if (pixels[yy * width + x] < 5) pixels[yy * width + x] = 1;
    }
  }
}

function gifHeader() {
  const bytes = [];
  writeString(bytes, "GIF89a");
  word(bytes, width);
  word(bytes, height);
  bytes.push(0xf7, 0, 0);
  for (const [r, g, b] of palette) bytes.push(r, g, b);
  bytes.push(0x21, 0xff, 0x0b);
  writeString(bytes, "NETSCAPE2.0");
  bytes.push(0x03, 0x01, 0x00, 0x00, 0x00);
  return bytes;
}

function gifFrame(pixels, delay) {
  const bytes = [0x21, 0xf9, 0x04, 0x04];
  word(bytes, delay);
  bytes.push(0, 0);
  bytes.push(0x2c);
  word(bytes, 0);
  word(bytes, 0);
  word(bytes, width);
  word(bytes, height);
  bytes.push(0);
  bytes.push(8);
  const imageData = lzwEncode(pixels);
  for (let i = 0; i < imageData.length; i += 255) {
    const block = imageData.slice(i, i + 255);
    bytes.push(block.length, ...block);
  }
  bytes.push(0);
  return bytes;
}

function lzwEncode(indices) {
  const minCodeSize = 8;
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let nextCode = endCode + 1;
  let dict = new Map();
  const out = [];
  let bitBuffer = 0;
  let bitCount = 0;

  function resetDict() {
    dict = new Map();
    for (let i = 0; i < clearCode; i++) dict.set(String(i), i);
    codeSize = minCodeSize + 1;
    nextCode = endCode + 1;
  }

  function emit(code) {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      out.push(bitBuffer & 0xff);
      bitBuffer >>= 8;
      bitCount -= 8;
    }
  }

  resetDict();
  emit(clearCode);
  let phrase = String(indices[0]);

  for (let i = 1; i < indices.length; i++) {
    const current = String(indices[i]);
    const combined = `${phrase},${current}`;
    if (dict.has(combined)) {
      phrase = combined;
    } else {
      emit(dict.get(phrase));
      if (nextCode < 4096) {
        dict.set(combined, nextCode++);
        if (nextCode === 1 << codeSize && codeSize < 12) codeSize++;
      } else {
        emit(clearCode);
        resetDict();
      }
      phrase = current;
    }
  }
  emit(dict.get(phrase));
  emit(endCode);
  if (bitCount > 0) out.push(bitBuffer & 0xff);
  return out;
}

function word(bytes, value) {
  bytes.push(value & 0xff, (value >> 8) & 0xff);
}

function writeString(bytes, value) {
  for (const char of value) bytes.push(char.charCodeAt(0));
}

const bytes = gifHeader();
for (let i = 0; i < frameCount; i++) {
  bytes.push(...gifFrame(framePixels(i), 5));
}
bytes.push(0x3b);

fs.writeFileSync(outPath, Buffer.from(bytes));
console.log(`Wrote ${outPath} (${Math.round(bytes.length / 1024)} KB)`);
