import { describe, expect, it } from "vitest";
import {
  formatElapsed,
  formatStaleness,
  STALENESS_THRESHOLD_MS,
} from "./agentStatusFormat";

describe("formatElapsed", () => {
  it("returns 0s for negative/zero/sub-second values", () => {
    expect(formatElapsed(-100)).toBe("0s");
    expect(formatElapsed(0)).toBe("0s");
    expect(formatElapsed(999)).toBe("0s");
  });

  it("returns plain seconds under one minute", () => {
    expect(formatElapsed(1_000)).toBe("1s");
    expect(formatElapsed(47_500)).toBe("47s");
    expect(formatElapsed(59_999)).toBe("59s");
  });

  it("returns 'Nm SSs' (zero-padded) at one minute or more", () => {
    expect(formatElapsed(60_000)).toBe("1m 00s");
    expect(formatElapsed(65_000)).toBe("1m 05s");
    expect(formatElapsed(125_000)).toBe("2m 05s");
    expect(formatElapsed(60 * 12 * 1000 + 3_000)).toBe("12m 03s");
  });
});

describe("formatStaleness", () => {
  it("returns null while inside the activity window", () => {
    expect(formatStaleness(0)).toBeNull();
    expect(formatStaleness(STALENESS_THRESHOLD_MS - 1)).toBeNull();
  });

  it("returns an 'idle for Ns' label past the threshold", () => {
    expect(formatStaleness(STALENESS_THRESHOLD_MS)).toBe("idle for 3s");
    expect(formatStaleness(15_000)).toBe("idle for 15s");
    expect(formatStaleness(75_000)).toBe("idle for 1m 15s");
  });
});
