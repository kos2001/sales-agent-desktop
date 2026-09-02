// Generate the Sales Agent app icon: build/icon.svg plus the two 1024px
// PNGs the packager and the main process consume.
//
//     node scripts/build-icon.mjs
//
// No dependencies. The previous version shelled out to `sharp` and read a
// scratch file from /tmp, so it only ran on the one machine that happened
// to have both. The geometry below is now the single source of truth and
// every output is derived from it, which is why the SVG is generated
// rather than hand-maintained alongside the raster — two hand-written
// definitions of one icon drift.
//
// Outputs:
//   build/icon.svg      vector source, for anything that wants to scale
//   build/icon.png      electron-builder derives the Windows .ico and the
//                       macOS .icns from this, so no per-platform binaries
//                       are checked in
//   resources/icon.png  imported by the main process (`?asset`) for the
//                       BrowserWindow icon on Linux
import { deflateSync } from "zlib";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const SIZE = 1024;
// 4x4 samples per output pixel. Analytic coverage would be sharper still,
// but at 4x the corner arcs and the arrowhead's diagonals are already
// clean at 16px, which is the size that actually has to hold up.
const SUBSAMPLES = 4;

// ── Icon definition ────────────────────────────────────────────────
//
// Three ascending bars with the tallest resolving into an arrowhead: one
// mark reading as both a pipeline and its direction. Built to survive
// 16px — no strokes, no small detail, a single hue, and the focal element
// (tall bar + head) at full white while the shorter bars sit back, so the
// silhouette keeps depth when it is only a few pixels wide.
//
// Petrol green carries over from the security audit deck so the product
// and its documentation read as one thing.

const GROUND = {
  radius: 228, // 22%, the macOS/Windows app-icon convention
  top: [0x0e, 0x7a, 0x6e],
  bottom: [0x07, 0x46, 0x3f],
};

// The arrowhead is wider than the bar it crowns, so the mark's true right
// edge is the head at 798, not the last bar at 750. Bars start at 226 to
// put equal 226px margins either side of that full span.
const BARS = [
  { x: 226, y: 594, w: 124, h: 168, r: 26, alpha: 0.62 },
  { x: 426, y: 494, w: 124, h: 268, r: 26, alpha: 0.62 },
  { x: 626, y: 394, w: 124, h: 368, r: 26, alpha: 1 },
];

// Centred on the tallest bar (x = 626 + 124/2 = 688).
const ARROWHEAD = {
  points: [
    [688, 244],
    [798, 396],
    [578, 396],
  ],
  alpha: 1,
};

const MARK = [0xff, 0xff, 0xff];

// ── Geometry ───────────────────────────────────────────────────────

/** True when (px, py) lies inside a rounded rectangle. */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function inRoundedRect(px, py, x, y, w, h, r) {
  if (px < x || px > x + w || py < y || py > y + h) return false;
  const left = x + r;
  const right = x + w - r;
  const top = y + r;
  const bottom = y + h - r;
  // The cross through the middle covers everything but the four corners.
  if (px >= left && px <= right) return true;
  if (py >= top && py <= bottom) return true;
  const cx = px < left ? left : right;
  const cy = py < top ? top : bottom;
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

/** True when (px, py) lies inside the triangle, via consistent edge signs. */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function inTriangle(px, py, [[ax, ay], [bx, by], [cx, cy]]) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

// ── Raster ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function render() {
  const pixels = Buffer.alloc(SIZE * SIZE * 4);
  const step = 1 / SUBSAMPLES;
  const offset = step / 2;
  const samples = SUBSAMPLES * SUBSAMPLES;

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < SUBSAMPLES; sy++) {
        const py = y + offset + sy * step;
        for (let sx = 0; sx < SUBSAMPLES; sx++) {
          const px = x + offset + sx * step;

          // Outside the ground the icon is transparent.
          if (!inRoundedRect(px, py, 0, 0, SIZE, SIZE, GROUND.radius)) continue;

          // Vertical gradient, then the marks composited over it.
          const t = py / SIZE;
          let sr = GROUND.top[0] + (GROUND.bottom[0] - GROUND.top[0]) * t;
          let sg = GROUND.top[1] + (GROUND.bottom[1] - GROUND.top[1]) * t;
          let sb = GROUND.top[2] + (GROUND.bottom[2] - GROUND.top[2]) * t;

          const shapes = [];
          for (const bar of BARS) {
            if (inRoundedRect(px, py, bar.x, bar.y, bar.w, bar.h, bar.r)) {
              shapes.push(bar.alpha);
            }
          }
          if (inTriangle(px, py, ARROWHEAD.points)) {
            shapes.push(ARROWHEAD.alpha);
          }

          for (const alpha of shapes) {
            sr += (MARK[0] - sr) * alpha;
            sg += (MARK[1] - sg) * alpha;
            sb += (MARK[2] - sb) * alpha;
          }

          r += sr;
          g += sg;
          b += sb;
          a += 255;
        }
      }

      const i = (y * SIZE + x) * 4;
      if (a === 0) continue; // fully transparent, leave the zeroed pixel
      // Colour is averaged over covered samples only, so edge pixels keep
      // the shape's colour at partial alpha instead of darkening toward
      // the zeroed background.
      const covered = a / 255;
      pixels[i] = Math.round(r / covered);
      pixels[i + 1] = Math.round(g / covered);
      pixels[i + 2] = Math.round(b / covered);
      pixels[i + 3] = Math.round(a / samples);
    }
  }

  return pixels;
}

// ── PNG encoding ───────────────────────────────────────────────────

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
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function encodePng(pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // Filter type 0 (None) per scanline. The image is mostly smooth
  // gradient, so deflate carries the compression on its own.
  const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
  for (let y = 0; y < SIZE; y++) {
    const rowStart = y * (SIZE * 4 + 1);
    raw[rowStart] = 0;
    pixels.copy(raw, rowStart + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── SVG ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function toHex([r, g, b]) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function buildSvg() {
  const bars = BARS.map(
    (b) =>
      `    <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" ` +
      `rx="${b.r}" ry="${b.r}"${b.alpha === 1 ? "" : ` opacity="${b.alpha}"`}/>`,
  ).join("\n");
  const head = ARROWHEAD.points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`)
    .join(" ");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
  <!-- Generated by scripts/build-icon.mjs — edit the geometry there, not here. -->
  <defs>
    <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${toHex(GROUND.top)}"/>
      <stop offset="1" stop-color="${toHex(GROUND.bottom)}"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${SIZE}" height="${SIZE}" rx="${GROUND.radius}" ry="${GROUND.radius}" fill="url(#ground)"/>
  <g fill="${toHex(MARK)}">
${bars}
    <path d="${head} Z"/>
  </g>
</svg>
`;
}

// ── Main ───────────────────────────────────────────────────────────

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const png = encodePng(render());

for (const target of [
  join(repoRoot, "build", "icon.png"),
  join(repoRoot, "resources", "icon.png"),
]) {
  writeFileSync(target, png);
  console.log(`wrote ${target} (${(png.length / 1024).toFixed(1)} KB)`);
}

const svgPath = join(repoRoot, "build", "icon.svg");
writeFileSync(svgPath, buildSvg());
console.log(`wrote ${svgPath}`);
