import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const { TEST_HOME, TEST_REPO } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("path");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require("os");
  const base = path.join(os.tmpdir(), `hermes-skillpath-${Date.now()}`);
  return {
    TEST_HOME: path.join(base, "home"),
    TEST_REPO: path.join(base, "repo"),
  };
});

vi.mock("../src/main/installer", () => ({
  HERMES_HOME: TEST_HOME,
  HERMES_PYTHON: "/usr/bin/python3",
  HERMES_REPO: TEST_REPO,
  hermesCliArgs: () => ["/dev/null"],
  getEnhancedPath: () => process.env.PATH || "",
}));

const { getSkillContent } = await import("../src/main/skills");

/** Write `<dir>/SKILL.md` with the given body. */
function placeSkill(dir: string, body: string): string {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), body, "utf-8");
  return dir;
}

const outsideDir = join(tmpdir(), `hermes-outside-${Date.now()}`);

beforeAll(() => {
  placeSkill(join(TEST_HOME, "skills", "sales", "followup"), "# Follow-up");
  placeSkill(
    join(TEST_HOME, "profiles", "team_a", "skills", "crm", "notes"),
    "# CRM notes",
  );
  placeSkill(join(TEST_REPO, "skills", "bundled", "base"), "# Bundled");
  // Stands in for anything the renderer could point at outside the app's
  // own directories.
  placeSkill(outsideDir, "# SECRET");
  // A sibling whose name merely starts with an allowed root's name.
  placeSkill(join(`${TEST_HOME}-evil`, "skills", "x"), "# ALSO SECRET");
});

afterAll(() => {
  for (const dir of [TEST_HOME, TEST_REPO, outsideDir, `${TEST_HOME}-evil`]) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("getSkillContent path containment", () => {
  it("reads a skill under the profile skills directory", () => {
    const content = getSkillContent(
      join(TEST_HOME, "skills", "sales", "followup"),
    );
    expect(content).toBe("# Follow-up");
  });

  it("reads a skill under a named profile", () => {
    const content = getSkillContent(
      join(TEST_HOME, "profiles", "team_a", "skills", "crm", "notes"),
    );
    expect(content).toBe("# CRM notes");
  });

  it("reads a bundled skill from the hermes repo", () => {
    const content = getSkillContent(
      join(TEST_REPO, "skills", "bundled", "base"),
    );
    expect(content).toBe("# Bundled");
  });

  it("refuses a path outside every allowed root", () => {
    // The handler takes its argument straight from the renderer, so an
    // arbitrary directory holding a SKILL.md must not be readable.
    expect(getSkillContent(outsideDir)).toBe("");
  });

  it("refuses a traversal that climbs out of an allowed root", () => {
    const escape = join(TEST_HOME, "skills", "..", "..", "outside");
    placeSkill(join(TEST_HOME, "..", "outside"), "# ESCAPED");
    expect(getSkillContent(escape)).toBe("");
  });

  it("refuses a sibling directory that shares an allowed root's prefix", () => {
    expect(getSkillContent(join(`${TEST_HOME}-evil`, "skills", "x"))).toBe("");
  });

  it("returns empty for junk input rather than throwing", () => {
    expect(getSkillContent("")).toBe("");
    expect(getSkillContent(undefined as unknown as string)).toBe("");
  });
});
