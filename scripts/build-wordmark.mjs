// Generate the splash-screen wordmark.
//
//     node scripts/build-wordmark.mjs
//
// The splash still read "HERMES AGENT" — the last piece of upstream branding
// a user sees, and the first thing they see on every launch. It shipped as a
// pre-rendered raster with no source, so changing the product name meant
// having no way to change the wordmark. This renders it from a bitmap font
// instead, so the text is a string in this file rather than pixels nobody can
// edit.
//
// No dependencies, same approach as build-icon.mjs: rasterise, then encode the
// PNG through zlib.
//
// Output:
//   src/renderer/src/assets/splashtext-w.png   white wordmark, transparent
//                                              ground, for the dark splash
import { deflateSync } from "zlib";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const TEXT = "SALES AGENT";

// ── Bitmap font ────────────────────────────────────────────────────
//
// 5x7 cells. Square, unrounded, no strokes — it has to stay legible when the
// splash is scaled down, and a geometric face matches the mark's flat bars.

const GLYPH_W = 5;
const GLYPH_H = 7;

const FONT = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  G: [".###.", "#...#", "#....", "#..##", "#...#", "#...#", ".###."],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  N: ["#...#", "##..#", "##..#", "#.#.#", "#..##", "#..##", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
};

// Pixel size and gaps, chosen to land near the 2392x213 the previous asset
// used so the splash CSS needs no change.
const PIXEL = 26;
const LETTER_GAP = 2; // in font pixels — 1 ran the glyphs together
const SPACE_SQUEEZE = 1; // trim the word space slightly, but keep it
// clearly wider than the letter gap

// ── Layout ─────────────────────────────────────────────────────────

const cells = [...TEXT].map((ch) => {
  const glyph = FONT[ch.toUpperCase()];
  if (!glyph) throw new Error(`No glyph for ${JSON.stringify(ch)}`);
  return { ch, glyph, width: ch === " " ? GLYPH_W - SPACE_SQUEEZE : GLYPH_W };
});

const widthCells =
  cells.reduce((sum, c) => sum + c.width, 0) + LETTER_GAP * (cells.length - 1);

const WIDTH = widthCells * PIXEL;
const HEIGHT = GLYPH_H * PIXEL;

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function render() {
  const pixels = Buffer.alloc(WIDTH * HEIGHT * 4); // transparent
  let cursor = 0;

  for (const { glyph, width } of cells) {
    for (let gy = 0; gy < GLYPH_H; gy++) {
      for (let gx = 0; gx < width && gx < GLYPH_W; gx++) {
        if (glyph[gy][gx] !== "#") continue;
        const x0 = (cursor + gx) * PIXEL;
        const y0 = gy * PIXEL;
        for (let y = y0; y < y0 + PIXEL; y++) {
          for (let x = x0; x < x0 + PIXEL; x++) {
            const i = (y * WIDTH + x) * 4;
            pixels[i] = 0xff;
            pixels[i + 1] = 0xff;
            pixels[i + 2] = 0xff;
            pixels[i + 3] = 0xff;
          }
        }
      }
    }
    cursor += width + LETTER_GAP;
  }

  return pixels;
}

// ── PNG ────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function encodePng(pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0);
  ihdr.writeUInt32BE(HEIGHT, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = WIDTH * 4;
  const raw = Buffer.alloc(HEIGHT * (stride + 1));
  for (let y = 0; y < HEIGHT; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter: None
    pixels.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── Main ───────────────────────────────────────────────────────────

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const png = encodePng(render());
const target = join(
  repoRoot,
  "src",
  "renderer",
  "src",
  "assets",
  "splashtext-w.png",
);
writeFileSync(target, png);
console.log(
  `wrote ${target} — "${TEXT}" at ${WIDTH}x${HEIGHT} (${(png.length / 1024).toFixed(1)} KB)`,
);
