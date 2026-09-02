// Rasterize the source SVG (/tmp/hermes-icon.svg) into a macOS .iconset
// and a single 1024 PNG. One-shot helper — not wired into npm scripts;
// invoked manually whenever the icon needs to change.
import sharp from "sharp";
import { mkdirSync, readFileSync } from "fs";
import { join } from "path";

const SVG = readFileSync("/tmp/hermes-icon.svg");
const ICONSET = "/tmp/hermes-icon.iconset";
mkdirSync(ICONSET, { recursive: true });

const SIZES = [
  ["icon_16x16.png", 16],
  ["icon_16x16@2x.png", 32],
  ["icon_32x32.png", 32],
  ["icon_32x32@2x.png", 64],
  ["icon_128x128.png", 128],
  ["icon_128x128@2x.png", 256],
  ["icon_256x256.png", 256],
  ["icon_256x256@2x.png", 512],
  ["icon_512x512.png", 512],
  ["icon_512x512@2x.png", 1024],
];

for (const [name, size] of SIZES) {
  await sharp(SVG, { density: 300 })
    .resize(size, size)
    .png()
    .toFile(join(ICONSET, name));
}

await sharp(SVG, { density: 300 })
  .resize(1024, 1024)
  .png()
  .toFile("/tmp/hermes-icon-1024.png");

console.log("iconset + 1024 PNG written");
