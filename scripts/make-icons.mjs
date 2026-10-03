// Draws the Readela icon at every manifest size and writes PNG files to
// src/icons/. The icon is original geometry (three text lines aligned to the
// right on a rounded square); no third-party artwork or font is involved.
// Run with `npm run icons`; the generated files are committed.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";

const SIZES = [16, 32, 48, 64, 96, 128];
const SAMPLES = 4; // supersampling per axis, for smooth edges
const BACKGROUND = [11, 92, 173];
const FOREGROUND = [255, 255, 255];

// Geometry on a unit square.
const CORNER = 0.2;
const LINES = [
  { top: 0.25, left: 0.2 },
  { top: 0.44, left: 0.34 },
  { top: 0.63, left: 0.52 },
].map((line) => ({ ...line, right: 0.8, height: 0.12 }));

function insideRoundedRect(x, y, left, top, right, bottom, radius) {
  if (x < left || x > right || y < top || y > bottom) return false;
  const cx = Math.min(Math.max(x, left + radius), right - radius);
  const cy = Math.min(Math.max(y, top + radius), bottom - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function colourAt(x, y) {
  if (!insideRoundedRect(x, y, 0, 0, 1, 1, CORNER)) return null;
  for (const line of LINES) {
    if (insideRoundedRect(x, y, line.left, line.top, line.right, line.top + line.height, line.height / 2)) {
      return FOREGROUND;
    }
  }
  return BACKGROUND;
}

function render(size) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let covered = 0;
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const colour = colourAt((px + (sx + 0.5) / SAMPLES) / size, (py + (sy + 0.5) / SAMPLES) / size);
          if (colour === null) continue;
          red += colour[0];
          green += colour[1];
          blue += colour[2];
          covered += 1;
        }
      }
      const offset = (py * size + px) * 4;
      if (covered > 0) {
        pixels[offset] = Math.round(red / covered);
        pixels[offset + 1] = Math.round(green / covered);
        pixels[offset + 2] = Math.round(blue / covered);
      }
      pixels[offset + 3] = Math.round((covered / SAMPLES ** 2) * 255);
    }
  }
  return pixels;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA, no interlace

  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    pixels.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); // filter byte 0
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const outputDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "icons");
mkdirSync(outputDirectory, { recursive: true });
for (const size of SIZES) {
  writeFileSync(path.join(outputDirectory, `icon-${size}.png`), encodePng(size, render(size)));
}
console.log(`wrote ${SIZES.length} icons to src/icons/`);
