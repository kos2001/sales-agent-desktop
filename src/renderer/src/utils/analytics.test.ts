import { describe, it, expect, vi, beforeEach } from "vitest";

// posthog-js must never actually initialize in tests.
vi.mock("posthog-js", () => ({
  default: {
    init: vi.fn(),
    capture: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
    opt_out_capturing: vi.fn(),
  },
}));

const { getAnalyticsConsent, setAnalyticsConsent } =
  await import("./analytics");

const CONSENT_KEY = "hermes-analytics-enabled";

describe("analytics consent", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("is off on a fresh install", () => {
    // The regression this guards: the previous default returned true
    // whenever VITE_POSTHOG_KEY was baked into the build, and the Settings
    // control that could turn it back off was removed — leaving collection
    // running with no in-app opt-out.
    expect(getAnalyticsConsent()).toBe(false);
  });

  it("stays off until the user explicitly consents", () => {
    setAnalyticsConsent(true);
    expect(localStorage.getItem(CONSENT_KEY)).toBe("true");
    expect(getAnalyticsConsent()).toBe(true);
  });

  it("can be withdrawn", () => {
    setAnalyticsConsent(true);
    setAnalyticsConsent(false);
    expect(getAnalyticsConsent()).toBe(false);
  });

  it("treats a stored value other than the string true as no", () => {
    localStorage.setItem(CONSENT_KEY, "1");
    expect(getAnalyticsConsent()).toBe(false);
  });
});
