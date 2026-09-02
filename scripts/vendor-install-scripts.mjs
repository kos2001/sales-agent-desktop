/* eslint-disable @typescript-eslint/explicit-function-return-type */
// Vendors the upstream install scripts AND the uv binary into resources/ so
// the desktop app can install Hermes behind a corporate mirror/proxy (or fully
// offline once the mirror serves Python/wheels). Run on an internet-connected
// machine before packaging:
//
//   node scripts/vendor-install-scripts.mjs            # current platform's uv
//   node scripts/vendor-install-scripts.mjs --win      # also fetch Windows uv
//
// Why uv matters: the upstream install scripts download uv from a hardcoded
// astral.sh URL, which proxy/index env vars cannot redirect. Bundling uv on
// PATH makes the script detect it as already-installed and skip that hop.
import { writeFile, mkdir, chmod } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RES = join(ROOT, "resources");

const SCRIPTS = [
  [
    "install.sh",
    "https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh",
  ],
  [
    "install.ps1",
    "https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.ps1",
  ],
];

async function fetchText(name, url, dest) {
  const resp = await fetch(url);
  if (!resp.ok) {
    console.error(`Failed to fetch ${url}: ${resp.status}`);
    process.exitCode = 1;
    return;
  }
  const text = await resp.text();
  await writeFile(dest, text, "utf-8");
  console.log(`Vendored ${name} (${text.length} bytes)`);
}

// uv release asset names by Node platform/arch (astral-sh/uv GitHub releases).
const UV_ASSETS = {
  "darwin-arm64": "uv-aarch64-apple-darwin.tar.gz",
  "darwin-x64": "uv-x86_64-apple-darwin.tar.gz",
  "linux-x64": "uv-x86_64-unknown-linux-gnu.tar.gz",
  "linux-arm64": "uv-aarch64-unknown-linux-gnu.tar.gz",
  "win32-x64": "uv-x86_64-pc-windows-msvc.zip",
};

async function vendorUv(platform, arch) {
  const key = `${platform}-${arch}`;
  const asset = UV_ASSETS[key];
  if (!asset) {
    console.error(`No uv asset mapping for ${key}; skipping uv.`);
    process.exitCode = 1;
    return;
  }
  const url = `https://github.com/astral-sh/uv/releases/latest/download/${asset}`;
  const resp = await fetch(url, { redirect: "follow" });
  if (!resp.ok) {
    console.error(`Failed to fetch uv (${url}): ${resp.status}`);
    process.exitCode = 1;
    return;
  }
  const uvDir = join(RES, "uv");
  await mkdir(uvDir, { recursive: true });
  const archivePath = join(uvDir, asset);
  await writeFile(archivePath, Buffer.from(await resp.arrayBuffer()));
  // Extract: tar for *.tar.gz, unzip/tar for *.zip. The uv archive contains a
  // single `uv` (or `uv.exe`) binary; flatten it into resources/uv/.
  if (asset.endsWith(".tar.gz")) {
    spawnSync(
      "tar",
      ["-xzf", archivePath, "-C", uvDir, "--strip-components=0"],
      {
        stdio: "inherit",
      },
    );
  } else if (asset.endsWith(".zip")) {
    // bsdtar (tar) handles zip on macOS/Linux; on Windows use Expand-Archive.
    const r = spawnSync("tar", ["-xf", archivePath, "-C", uvDir], {
      stdio: "inherit",
    });
    if (r.status !== 0) {
      spawnSync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `Expand-Archive -Force -Path '${archivePath}' -DestinationPath '${uvDir}'`,
        ],
        { stdio: "inherit" },
      );
    }
  }
  const uvBin = join(uvDir, platform === "win32" ? "uv.exe" : "uv");
  try {
    if (platform !== "win32") await chmod(uvBin, 0o755);
  } catch {
    /* the binary may be nested; the app searches resources/uv/ for it */
  }
  console.log(`Vendored uv for ${key} into ${uvDir}`);
}

await mkdir(RES, { recursive: true });
for (const [name, url] of SCRIPTS) {
  await fetchText(name, url, join(RES, name));
}
await vendorUv(process.platform, process.arch);
if (process.argv.includes("--win") && process.platform !== "win32") {
  await vendorUv("win32", "x64");
}
