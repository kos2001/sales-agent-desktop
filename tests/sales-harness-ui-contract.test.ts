/**
 * Contracts between the sales harness (what `sales-harness.ts` seeds into
 * HERMES_HOME) and the UI that points at it.
 *
 * These are the things that break silently: a skill gets renamed in
 * `resources/sales-skills/` and the chat suggestion that reaches for it keeps
 * rendering, just no longer landing on a playbook. Fixture-style, in the same
 * spirit as the CLI-output parsers in this directory.
 */

import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..");
const SALES_SKILLS_DIR = join(REPO_ROOT, "resources", "sales-skills", "sales");

function shippedSkillNames(): string[] {
  return readdirSync(SALES_SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/**
 * The chat empty state is a .tsx importing an image, so it cannot be imported
 * from a node-side test. Reading the `skill:` fields out of the source keeps
 * the assertion honest without pulling the renderer in.
 */
function suggestionSkills(): string[] {
  const src = readFileSync(
    join(REPO_ROOT, "src/renderer/src/screens/Chat/ChatEmptyState.tsx"),
    "utf-8",
  );
  return [...src.matchAll(/skill: "([^"]+)"/g)].map((m) => m[1]).sort();
}

describe("sales harness ↔ UI contract", () => {
  it("ships the seven sales playbooks the app is built around", () => {
    expect(shippedSkillNames()).toEqual([
      "account-brief",
      "customer-data-handling",
      "deal-risk-review",
      "discovery-notes",
      "followup-email",
      "pipeline-hygiene",
      "proposal-outline",
    ]);
  });

  it("points every chat suggestion at a playbook that actually ships", () => {
    const shipped = new Set(shippedSkillNames());
    for (const skill of suggestionSkills()) {
      expect(
        shipped,
        `suggestion references missing skill "${skill}"`,
      ).toContain(skill);
    }
  });

  it("surfaces every user-facing playbook as a suggestion", () => {
    // customer-data-handling is deferred to by the others rather than invoked
    // directly, so it is deliberately not a suggestion.
    expect(suggestionSkills()).toEqual(
      shippedSkillNames().filter((n) => n !== "customer-data-handling"),
    );
  });

  it("keeps the local and remote SOUL defaults on one shared constant", () => {
    // These two files each carried their own copy, and the copies drifted:
    // both still said "You are Hermes, a helpful AI assistant" after the
    // rebrand. Neither may reintroduce a literal.
    for (const file of ["src/main/soul.ts", "src/main/ssh-remote.ts"]) {
      const src = readFileSync(join(REPO_ROOT, file), "utf-8");
      expect(src, `${file} should not redeclare DEFAULT_SOUL`).not.toMatch(
        /const DEFAULT_SOUL\s*=/,
      );
      expect(src, `${file} should import the shared persona`).toContain(
        'from "../shared/sales-persona"',
      );
    }
  });

  it("gives every persona preset non-empty content and the shared conduct rules", async () => {
    const { SOUL_PRESETS, DEFAULT_SOUL } =
      await import("../src/shared/sales-persona");
    expect(SOUL_PRESETS.map((p) => p.id)).toEqual([
      "default",
      "enterprise",
      "smb",
      "partner",
    ]);
    for (const preset of SOUL_PRESETS) {
      expect(preset.content.length).toBeGreaterThan(200);
      // Every motion inherits the data-handling and no-invented-facts rules.
      expect(preset.content).toContain("customer-data-handling");
      expect(preset.content).toContain("Never invent a customer fact");
    }
    expect(DEFAULT_SOUL).toBe(SOUL_PRESETS[0].content);
    expect(DEFAULT_SOUL).not.toContain("You are Hermes");
  });
});
