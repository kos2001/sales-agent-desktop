/**
 * The brand assets must stay in step with the generators that produce them.
 *
 * They drifted once already: the rebrand regenerated build/icon.png and
 * resources/icon.png but not src/renderer/src/assets/icon.png, so the packaged
 * app wore a sales mark while the sidebar, the chat empty state and every
 * agent message row still showed an unrelated logo. Checking the bytes here is
 * what makes "regenerate everything from one definition" true rather than
 * aspirational.
 */

import { execFileSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..");

function generated(script: string, target: string): Buffer {
  // The generators write in place and are deterministic, so running them and
  // comparing to what is committed is the check.
  execFileSync("node", [join(REPO_ROOT, "scripts", script)], {
    cwd: REPO_ROOT,
    stdio: "pipe",
  });
  return readFileSync(join(REPO_ROOT, target));
}

describe("brand assets", () => {
  it("renders the same app icon everywhere it is consumed", () => {
    generated("build-icon.mjs", "build/icon.png");
    const targets = [
      "build/icon.png",
      "resources/icon.png",
      "src/renderer/src/assets/icon.png",
    ];
    const bytes = targets.map((t) => readFileSync(join(REPO_ROOT, t)));
    for (let i = 1; i < bytes.length; i++) {
      expect(
        bytes[i].equals(bytes[0]),
        `${targets[i]} differs from ${targets[0]}`,
      ).toBe(true);
    }
  });

  it("keeps the splash wordmark reproducible from its generator", () => {
    const target = "src/renderer/src/assets/splashtext-w.png";
    const before = readFileSync(join(REPO_ROOT, target));
    const after = generated("build-wordmark.mjs", target);
    expect(after.equals(before)).toBe(true);
  });

  it("no longer ships the upstream-branded assets", () => {
    // Dead weight and stale branding: none of these were imported anywhere,
    // and splash.png alone was 2 MB.
    for (const stale of [
      "src/renderer/src/assets/hermes.png",
      "src/renderer/src/assets/splash.png",
      "src/renderer/src/assets/splashtext.png",
      "src/renderer/src/assets/splashtext-w.webp",
    ]) {
      expect(existsSync(join(REPO_ROOT, stale)), `${stale} still present`).toBe(
        false,
      );
    }
  });

  it("names the product, not upstream, on the splash", () => {
    const src = readFileSync(
      join(REPO_ROOT, "src/renderer/src/screens/SplashScreen/SplashScreen.tsx"),
      "utf-8",
    );
    expect(src).toContain('alt="Sales Agent"');
    expect(src).not.toContain("Hermes Agent");
  });
});
