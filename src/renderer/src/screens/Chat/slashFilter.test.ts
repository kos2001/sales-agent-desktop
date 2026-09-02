import { describe, expect, it } from "vitest";
import type { SlashCommand } from "./slashCommands";
import { filterSlashCommands, matchesSlashFilter } from "./slashFilter";

const SAMPLE: SlashCommand[] = [
  { name: "/new", description: "Start a new chat", category: "chat", local: true },
  { name: "/clear", description: "Clear conversation history", category: "chat", local: true },
  { name: "/usage", description: "Show token usage and cost", category: "info" },
  { name: "/memory", description: "Show agent memory", category: "info" },
  { name: "/model", description: "Show or switch the current model", category: "info" },
];

describe("matchesSlashFilter", () => {
  it("matches everything when filter is empty", () => {
    expect(SAMPLE.every((c) => matchesSlashFilter(c, ""))).toBe(true);
    expect(SAMPLE.every((c) => matchesSlashFilter(c, "   "))).toBe(true);
  });

  it("uses name prefix when filter begins with a slash", () => {
    expect(matchesSlashFilter(SAMPLE[1], "/cl")).toBe(true);
    // Substring of name but not a prefix → no match in slash-mode.
    expect(matchesSlashFilter(SAMPLE[1], "/ear")).toBe(false);
  });

  it("falls back to substring match on name OR description", () => {
    // "cost" only appears in /usage's description.
    expect(matchesSlashFilter(SAMPLE[2], "cost")).toBe(true);
    // "memory" matches its own name.
    expect(matchesSlashFilter(SAMPLE[3], "memory")).toBe(true);
    // "switch" only appears in /model's description.
    expect(matchesSlashFilter(SAMPLE[4], "switch")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(matchesSlashFilter(SAMPLE[2], "COST")).toBe(true);
    expect(matchesSlashFilter(SAMPLE[1], "/CL")).toBe(true);
  });

  it("returns false when nothing matches", () => {
    expect(matchesSlashFilter(SAMPLE[0], "zzz")).toBe(false);
  });
});

describe("filterSlashCommands", () => {
  it("returns everything for an empty filter", () => {
    expect(filterSlashCommands(SAMPLE, "")).toEqual(SAMPLE);
  });

  it("preserves source ordering", () => {
    const result = filterSlashCommands(SAMPLE, "show");
    expect(result.map((c) => c.name)).toEqual(["/usage", "/memory", "/model"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterSlashCommands(SAMPLE, "nosuchword")).toEqual([]);
  });
});
