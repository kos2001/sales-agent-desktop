/**
 * The renderer dev server must be on a pinned, project-specific port.
 *
 * Without a `server` block Vite takes 5173 and, when something else already
 * holds it, silently walks to the next free port. On a machine running several
 * of these projects the dev server then lands somewhere different every
 * launch. That silence produced a genuinely confusing failure: the renderer
 * came up on 5174 because a sibling project held 5173, the dev server was
 * later killed while its Electron child survived as an orphan reparented to
 * launchd, and the window sat pointing at a dead 5174 rendering nothing. A
 * blank app with no error message is the worst symptom a silent port change
 * can produce.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const CONFIG = readFileSync(
  join(__dirname, "..", "electron.vite.config.ts"),
  "utf-8",
);

describe("renderer dev server", () => {
  it("pins the port instead of letting Vite pick one", () => {
    expect(CONFIG).toMatch(/port:\s*\d{4}/);
  });

  it("uses strictPort so a conflict fails loudly rather than drifting", () => {
    expect(CONFIG).toMatch(/strictPort:\s*true/);
  });

  it("does not sit on Vite's default 5173, which siblings compete for", () => {
    const port = CONFIG.match(/port:\s*(\d{4})/)?.[1];
    expect(port).toBeDefined();
    expect(Number(port)).not.toBe(5173);
    // Sanity: a real, unprivileged port.
    expect(Number(port)).toBeGreaterThan(1024);
    expect(Number(port)).toBeLessThan(65536);
  });
});
