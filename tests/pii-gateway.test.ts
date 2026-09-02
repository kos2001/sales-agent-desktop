import { describe, it, expect, vi } from "vitest";
import { spawnSync } from "child_process";

// Mock only the installer surface pii-gateway imports (python binary + PATH).
// child_process is NOT mocked — these are integration tests that run the real
// bundled toolkit scripts (resources/pii-gateway/scripts) via python3, so they
// verify the actual de-identify → re-identify round-trip end to end.
vi.mock("../src/main/installer", () => ({
  HERMES_PYTHON: "python3",
  getEnhancedPath: () => process.env.PATH || "",
}));

// Skip gracefully where python3 isn't available (some CI images).
const pythonOk =
  spawnSync("python3", ["--version"], { encoding: "utf-8" }).status === 0;
const itPy = pythonOk ? it : it.skip;

const { deidentifyText, reidentifyText } = await import(
  "../src/main/pii-gateway"
);

describe("pii-gateway (integration, real bundled scripts)", () => {
  it("returns an empty result for blank input", async () => {
    expect(await deidentifyText("   ")).toEqual({
      text: "   ",
      map: {},
      count: 0,
    });
  });

  itPy("de-identifies identifiers in free text", async () => {
    const r = await deidentifyText(
      "이메일 hong@example.com 전화 010-1234-5678 주민 900101-1234567",
    );
    expect(r).not.toBeNull();
    // identifiers replaced by [[TYPE:hash]] tokens
    expect(r!.text).not.toContain("hong@example.com");
    expect(r!.text).not.toContain("900101-1234567");
    expect(r!.text).toMatch(/\[\[EMAIL:[0-9a-f]+\]\]/);
    expect(r!.count).toBeGreaterThanOrEqual(3);
  });

  itPy("round-trips: re-identify restores the originals", async () => {
    const original = "연락처 hong@example.com / 010-1234-5678";
    const d = (await deidentifyText(original))!;
    expect(d.text).not.toContain("hong@example.com");
    const restored = (await reidentifyText(d.text, d.map)).trimEnd();
    expect(restored).toBe(original);
  });

  it("re-identify is a no-op with an empty map", async () => {
    expect(await reidentifyText("nothing to do", {})).toBe("nothing to do");
  });
});
