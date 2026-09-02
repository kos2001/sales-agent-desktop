/**
 * Locale guards for the sales re-framing.
 *
 * Only `en` and `ko` were written by hand; the other seven locales fall back to
 * `en` through `t()`. That fallback is what makes the two-locale decision safe,
 * so it is asserted here rather than assumed.
 */

import { describe, expect, it } from "vitest";
import { resources, t } from "../src/shared/i18n";

type Node = Record<string, unknown>;

function flatten(node: Node, prefix = ""): string[] {
  return Object.entries(node).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") return flatten(value as Node, path);
    return [path];
  });
}

describe("sales copy — locales", () => {
  it("gives ko every key en has, so no screen falls back mid-sentence", () => {
    const en = new Set(flatten(resources.en.translation as Node));
    const ko = new Set(flatten(resources.ko.translation as Node));
    const missing = [...en].filter((k) => !ko.has(k));
    expect(missing).toEqual([]);
  });

  it("falls back to en for locales that were left untranslated", () => {
    // es has no `kanban` namespace at all — the fallback is what keeps the
    // Pipeline screen from rendering raw key paths.
    expect(t("kanban.title", "es")).toBe("Pipeline");
    expect(t("navigation.groupAdmin", "ja")).toBe("Admin");
  });

  it("labels navigation in sales vocabulary, not agent-plumbing vocabulary", () => {
    expect(t("navigation.kanban", "en")).toBe("Pipeline");
    expect(t("navigation.skills", "en")).toBe("Playbooks");
    expect(t("navigation.sessions", "en")).toBe("Accounts");
    expect(t("navigation.schedules", "en")).toBe("Reminders");

    expect(t("navigation.kanban", "ko")).toBe("파이프라인");
    expect(t("navigation.skills", "ko")).toBe("플레이북");
  });

  it("defines a title for each sidebar group", () => {
    for (const locale of ["en", "ko"] as const) {
      for (const key of [
        "navigation.groupSales",
        "navigation.groupWorkspace",
        "navigation.groupAdmin",
      ]) {
        expect(t(key, locale), `${locale}/${key}`).not.toBe(key);
      }
    }
  });

  it("interpolates the preset name into the persona confirmation", () => {
    const message = t("soul.presetConfirm", "en", { preset: "Enterprise" });
    expect(message).toContain("Enterprise");
    expect(message).not.toContain("{{preset}}");
  });

  it("no longer describes the app as a general coding assistant", () => {
    expect(t("chat.emptyHint", "en")).not.toContain("write code");
    expect(t("agents.subtitle", "en")).not.toContain("Hermes workspace");
  });
});
