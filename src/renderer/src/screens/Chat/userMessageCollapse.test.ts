import { describe, expect, it } from "vitest";
import {
  COLLAPSE_CHAR_THRESHOLD,
  COLLAPSE_LINE_THRESHOLD,
  getMeta,
  getPreview,
  PREVIEW_LINES,
  shouldCollapse,
} from "./userMessageCollapse";

describe("shouldCollapse", () => {
  it("returns false for empty content", () => {
    expect(shouldCollapse("")).toBe(false);
  });

  it("returns false for short single-line content", () => {
    expect(shouldCollapse("hello world")).toBe(false);
  });

  it("returns false at exactly the line threshold", () => {
    const content = Array(COLLAPSE_LINE_THRESHOLD).fill("line").join("\n");
    expect(shouldCollapse(content)).toBe(false);
  });

  it("returns true when line count exceeds the threshold", () => {
    const content = Array(COLLAPSE_LINE_THRESHOLD + 1).fill("line").join("\n");
    expect(shouldCollapse(content)).toBe(true);
  });

  it("returns true when char count exceeds the threshold on one line", () => {
    expect(shouldCollapse("x".repeat(COLLAPSE_CHAR_THRESHOLD + 1))).toBe(true);
  });
});

describe("getMeta", () => {
  it("counts lines including a final partial line", () => {
    expect(getMeta("a\nb\nc")).toEqual({ lines: 3, chars: 5 });
  });

  it("returns zeros for empty content", () => {
    expect(getMeta("")).toEqual({ lines: 0, chars: 0 });
  });
});

describe("getPreview", () => {
  it("returns the first PREVIEW_LINES lines", () => {
    const content = Array(20)
      .fill(0)
      .map((_, i) => `line${i}`)
      .join("\n");
    const preview = getPreview(content);
    expect(preview.split("\n")).toHaveLength(PREVIEW_LINES);
    expect(preview).toContain("line0");
    expect(preview).toContain(`line${PREVIEW_LINES - 1}`);
    expect(preview).not.toContain(`line${PREVIEW_LINES}`);
  });

  it("returns the whole content when shorter than the preview window", () => {
    expect(getPreview("a\nb")).toBe("a\nb");
  });
});
