import { describe, expect, it } from "vitest";
import {
  resolveBundledScript,
  resolveBundledToolBins,
} from "../src/main/installer";

describe("resolveBundledScript", () => {
  it("returns null for a script that is not vendored", () => {
    expect(resolveBundledScript("definitely-missing-xyz.sh")).toBeNull();
  });
});

describe("resolveBundledToolBins", () => {
  it("returns an empty list when no tools are vendored", () => {
    // resources/uv is not vendored in the repo (it's produced on an online
    // machine before packaging), so this is [] in CI/dev.
    expect(resolveBundledToolBins()).toEqual([]);
  });
});
