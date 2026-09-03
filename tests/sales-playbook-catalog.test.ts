/**
 * Contract between the shipped playbooks and the Tasks launcher.
 *
 * The launcher is now the landing screen, so a playbook missing from the
 * catalogue is a playbook no one can find, and a catalogue entry pointing at
 * a renamed directory is a card that opens a request nothing routes.
 * Same failure mode as `sales-harness-ui-contract.test.ts`, one screen over.
 */

import { readdirSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  PLAYBOOK_GROUPS,
  PLAYBOOK_TASKS,
  PLAYBOOK_TASK_BY_ID,
  searchTasks,
  tasksInGroup,
} from "../src/shared/sales-playbooks";

const SALES_SKILLS_DIR = join(
  __dirname,
  "..",
  "resources",
  "sales-skills",
  "sales",
);

/**
 * A rule the other playbooks defer to, not a task anyone starts — so it is
 * deliberately absent from the launcher. Named here so removing it from the
 * catalogue stays a decision rather than an omission.
 */
const NOT_A_TASK = ["customer-data-handling"];

function shippedSkillNames(): string[] {
  return readdirSync(SALES_SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

describe("playbook catalogue ↔ shipped playbooks", () => {
  it("gives every shipped playbook a task card, except the rules-only one", () => {
    const expected = shippedSkillNames().filter(
      (name) => !NOT_A_TASK.includes(name),
    );
    expect(PLAYBOOK_TASKS.map((t) => t.id).sort()).toEqual(expected);
  });

  it("points every task at a playbook that actually ships", () => {
    const shipped = new Set(shippedSkillNames());
    for (const task of PLAYBOOK_TASKS) {
      expect(shipped, `task "${task.id}" has no playbook`).toContain(task.id);
    }
  });

  it("puts every task in a declared group, and leaves no group empty", () => {
    const groupIds = new Set(PLAYBOOK_GROUPS.map((g) => g.id));
    for (const task of PLAYBOOK_TASKS) {
      expect(groupIds, `${task.id} has unknown group`).toContain(task.group);
    }
    for (const group of PLAYBOOK_GROUPS) {
      expect(
        tasksInGroup(group.id).length,
        `group "${group.id}" renders as an empty section`,
      ).toBeGreaterThan(0);
    }
  });

  it("gives every task the copy the card renders", () => {
    for (const task of PLAYBOOK_TASKS) {
      for (const field of ["title", "summary", "prep", "prompt"] as const) {
        expect(task[field].trim().length, `${task.id}.${field}`).toBeGreaterThan(
          0,
        );
      }
      // The prompt is what reaches the agent. A one-liner like "재고" would
      // not route anywhere, so hold it to a real sentence.
      expect(task.prompt.length, `${task.id} prompt too short`).toBeGreaterThan(
        20,
      );
    }
  });

  it("keeps task titles unique, so two cards never read the same", () => {
    const titles = PLAYBOOK_TASKS.map((t) => t.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("indexes every task by id", () => {
    expect(PLAYBOOK_TASK_BY_ID.size).toBe(PLAYBOOK_TASKS.length);
    expect(PLAYBOOK_TASK_BY_ID.get("eol-management")?.group).toBe("quality");
  });

  it("searches titles, summaries and keywords", () => {
    // Empty query is the unfiltered list — the launcher uses one code path.
    expect(searchTasks("").length).toBe(PLAYBOOK_TASKS.length);
    expect(searchTasks("   ").length).toBe(PLAYBOOK_TASKS.length);

    // Keyword hit: "LTB" appears only in eol-management's keywords.
    expect(searchTasks("LTB").map((t) => t.id)).toContain("eol-management");
    // Case-insensitive.
    expect(searchTasks("ltb").map((t) => t.id)).toContain("eol-management");
    // Title hit.
    expect(searchTasks("재고").map((t) => t.id)).toContain(
      "inventory-management",
    );
    expect(searchTasks("zzzznope")).toEqual([]);
  });

  it("writes the launcher copy in the language the playbooks are written in", () => {
    // Same reasoning as the persona: the playbooks encode Korean business
    // conventions, so a card that reads in English would open a request the
    // user cannot check before sending.
    for (const task of PLAYBOOK_TASKS) {
      expect(task.title, task.id).toMatch(/[가-힣]/);
      expect(task.prompt, task.id).toMatch(/[가-힣]/);
    }
    for (const group of PLAYBOOK_GROUPS) {
      expect(group.title, group.id).toMatch(/[가-힣]/);
    }
  });
});
