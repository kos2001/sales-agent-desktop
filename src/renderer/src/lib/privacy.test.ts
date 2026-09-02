import { describe, it, expect } from "vitest";
import { PROTECT_DEFAULT } from "./privacy";

describe("PROTECT_DEFAULT", () => {
  // This is a policy assertion, not a behaviour test. It exists because the
  // default is a single boolean that a refactor can flip without any test
  // failing — and flipping it silently sends customer data to the model
  // provider unmasked.
  it("starts personal-info protection on for a new conversation", () => {
    expect(PROTECT_DEFAULT).toBe(true);
  });
});
