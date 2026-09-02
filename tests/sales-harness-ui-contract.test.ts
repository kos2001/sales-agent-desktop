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
  it("ships the sales playbooks the app is built around", () => {
    expect(shippedSkillNames()).toEqual([
      "account-brief",
      "competitive-battlecard",
      "contract-review",
      "customer-data-handling",
      "deal-qualification",
      "deal-risk-review",
      "discovery-notes",
      "followup-email",
      "objection-handling",
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

  it("keeps the chat suggestions to the six everyday tasks", () => {
    // Not every playbook earns a suggestion. customer-data-handling is
    // deferred to by the others rather than invoked directly, and the three
    // added later (qualification, battlecards, objections) are asked for by
    // name mid-deal rather than reached for from an empty chat. Six is what
    // fits the empty state without becoming a menu.
    expect(suggestionSkills()).toHaveLength(6);
    const shipped = new Set(shippedSkillNames());
    for (const skill of suggestionSkills()) {
      expect(shipped, skill).toContain(skill);
    }
    expect(suggestionSkills()).not.toContain("customer-data-handling");
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

  it("gives every persona preset the shared conduct rules and the playbooks", async () => {
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
      // Every motion inherits the same honesty and data-handling rules.
      expect(preset.content, preset.id).toContain("없는 사실을 만들지 않는다");
      expect(preset.content, preset.id).toContain("대신 약속하지 않는다");
    }
    expect(DEFAULT_SOUL).toBe(SOUL_PRESETS[0].content);
    expect(DEFAULT_SOUL).not.toContain("You are Hermes");
  });

  it("routes every shipped playbook from the persona", async () => {
    // SOUL.md is what the agent reads on every conversation. A playbook the
    // persona never names is one the agent has no reason to reach for, so a
    // newly shipped skill that nothing routes to is a bug.
    const { SOUL_PRESETS, REFERENCED_PLAYBOOKS } =
      await import("../src/shared/sales-persona");
    expect([...REFERENCED_PLAYBOOKS].sort()).toEqual(shippedSkillNames());
    for (const preset of SOUL_PRESETS) {
      for (const skill of REFERENCED_PLAYBOOKS) {
        expect(preset.content, `${preset.id} never names ${skill}`).toContain(
          skill,
        );
      }
    }
  });

  it("speaks the language the playbooks are written in", async () => {
    // The seeded skills are Korean and encode Korean business conventions.
    // An English persona would have the agent switching register mid-reply.
    const { DEFAULT_SOUL } = await import("../src/shared/sales-persona");
    expect(DEFAULT_SOUL).toMatch(/[가-힣]/);
    expect(DEFAULT_SOUL).toContain("기본 언어는 한국어");
  });
});
