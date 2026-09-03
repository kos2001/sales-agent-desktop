import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../components/useI18n", () => ({
  useI18n: () => ({
    t: (key: string, o?: Record<string, unknown>) =>
      o && "count" in o ? `${key}:${String(o.count)}` : key,
    locale: "ko",
    setLocale: () => {},
  }),
}));

import Tasks from "./Tasks";
import {
  PLAYBOOK_GROUPS,
  PLAYBOOK_TASKS,
} from "../../../../shared/sales-playbooks";

describe("Tasks launcher — group identity", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("shows an overview chip per group, each linking to its section", () => {
    render(<Tasks onStartTask={vi.fn()} />);
    const chips = [...document.querySelectorAll(".tasks-overview-chip")];
    expect(chips).toHaveLength(PLAYBOOK_GROUPS.length);

    for (const group of PLAYBOOK_GROUPS) {
      const chip = document.querySelector(
        `.tasks-overview-chip[data-group="${group.id}"]`,
      );
      expect(chip, group.id).toBeTruthy();
      // The jump target must exist, or the chip is a dead link.
      expect(chip!.getAttribute("href")).toBe(`#task-group-${group.id}`);
      expect(document.getElementById(`task-group-${group.id}`)).toBeTruthy();
    }
  });

  it("counts each group the same way in the rail and the heading", () => {
    render(<Tasks onStartTask={vi.fn()} />);
    for (const group of PLAYBOOK_GROUPS) {
      const expected = PLAYBOOK_TASKS.filter(
        (t) => t.group === group.id,
      ).length;
      const chipCount = document.querySelector(
        `.tasks-overview-chip[data-group="${group.id}"] .tasks-overview-chip-count`,
      )?.textContent;
      const headingCount = document.querySelector(
        `#task-group-${group.id} .tasks-group-count`,
      )?.textContent;
      expect(chipCount, group.id).toBe(String(expected));
      expect(headingCount, group.id).toBe(String(expected));
    }
  });

  it("tags every card with its group so Recent and search stay colour-coded", () => {
    render(<Tasks onStartTask={vi.fn()} />);
    const cards = [...document.querySelectorAll(".task-card")];
    expect(cards).toHaveLength(PLAYBOOK_TASKS.length);
    const groups = new Set(PLAYBOOK_GROUPS.map((g) => g.id as string));
    for (const c of cards) {
      expect(groups).toContain(c.getAttribute("data-group"));
    }
  });

  it("names the playbook on each card so the task is traceable", () => {
    render(<Tasks onStartTask={vi.fn()} />);
    const shown = [...document.querySelectorAll(".task-card-playbook")].map(
      (el) => el.textContent,
    );
    expect(shown).toHaveLength(PLAYBOOK_TASKS.length);
    // Every chip must be a real playbook id, not a title.
    const ids = new Set(PLAYBOOK_TASKS.map((t) => t.id));
    for (const s of shown) expect(ids).toContain(s!);
  });

  it("hides the overview while searching — it would jump to filtered sections", () => {
    render(<Tasks onStartTask={vi.fn()} />);
    expect(document.querySelector(".tasks-overview")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("tasks.searchPlaceholder"), {
      target: { value: PLAYBOOK_TASKS[0].title },
    });
    expect(document.querySelector(".tasks-overview")).toBeNull();
  });
});
