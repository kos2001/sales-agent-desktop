import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export — no Node server required. The output in `out/` can be
  // dropped onto any static host (GitHub Pages, Cloudflare Pages, Netlify).
  output: "export",
  images: {
    // next/image's optimization endpoint requires a Node runtime; static
    // export needs unoptimized images.
    unoptimized: true,
  },
  reactStrictMode: true,
  trailingSlash: true,
  // Pin Turbopack's workspace root to this directory. Without this, Next
  // walks up looking for a lockfile and finds one in a parent directory.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
