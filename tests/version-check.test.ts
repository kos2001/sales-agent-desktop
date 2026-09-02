import { describe, it, expect } from "vitest";
import {
  parseEngineVersion,
  compareCalVer,
  isEngineUpdateAvailable,
  isDesktopUpdateAvailable,
  parseReleaseTag,
  fetchLatestEngineRelease,
  fetchLatestDesktopRelease,
} from "../src/main/version-check";

const REAL = "Hermes Agent v0.16.0 (2026.6.5) · upstream 0d82060c";

describe("parseEngineVersion", () => {
  it("extracts semver, calver, upstream sha from real --version output", () => {
    expect(parseEngineVersion(REAL)).toEqual({
      semver: "0.16.0",
      calver: "2026.6.5",
      upstreamSha: "0d82060c",
    });
  });

  it("returns all nulls for garbled output", () => {
    expect(parseEngineVersion("totally unrelated text")).toEqual({
      semver: null,
      calver: null,
      upstreamSha: null,
    });
  });

  it("returns all nulls for empty / null input", () => {
    expect(parseEngineVersion("")).toEqual({
      semver: null,
      calver: null,
      upstreamSha: null,
    });
  });
});

describe("compareCalVer", () => {
  it("orders by numeric segments, not lexicographically", () => {
    expect(compareCalVer("2026.6.5", "2026.6.5")).toBe(0);
    expect(compareCalVer("2026.5.29", "2026.6.5")).toBeLessThan(0);
    expect(compareCalVer("2026.6.5", "2026.5.29")).toBeGreaterThan(0);
    // shorter is less when shared prefix is equal
    expect(compareCalVer("2026.5.29", "2026.5.29.2")).toBeLessThan(0);
  });

  it("does not produce NaN when a segment contains a pre-release suffix", () => {
    // "6-rc1" is not a clean number; the guard must skip it (treat as equal)
    // so the result is a defined number, not NaN.
    const result = compareCalVer("2026.6.5", "2026.6-rc1");
    expect(Number.isNaN(result)).toBe(false);
    // The year segment (2026 vs 2026) is equal; the pre-release segment is
    // skipped; the third segment (5 vs missing → 0) makes "2026.6.5" greater.
    expect(result).toBeGreaterThan(0);
  });
});

describe("isEngineUpdateAvailable", () => {
  it("true only when installed CalVer is older than latest tag", () => {
    expect(isEngineUpdateAvailable("2026.6.5", "v2026.6.5")).toBe(false);
    expect(isEngineUpdateAvailable("2026.5.29", "v2026.6.5")).toBe(true);
    expect(isEngineUpdateAvailable("2026.6.5", "v2026.5.29")).toBe(false);
  });

  it("returns false (safe default) on null / malformed input", () => {
    expect(isEngineUpdateAvailable(null, "v2026.6.5")).toBe(false);
    expect(isEngineUpdateAvailable("2026.6.5", null)).toBe(false);
    expect(isEngineUpdateAvailable("garbage", "v2026.6.5")).toBe(false);
  });
});

describe("isDesktopUpdateAvailable", () => {
  it("true when a different latest version is known", () => {
    expect(isDesktopUpdateAvailable("0.4.5", "0.5.0")).toBe(true);
  });
  it("false when equal or latest unknown", () => {
    expect(isDesktopUpdateAvailable("0.4.5", "0.4.5")).toBe(false);
    expect(isDesktopUpdateAvailable("0.4.5", null)).toBe(false);
  });
  it("false when current is null (no installed version reported)", () => {
    expect(isDesktopUpdateAvailable(null, "0.5.0")).toBe(false);
  });
  it("normalizes a leading-v tag before comparing", () => {
    expect(isDesktopUpdateAvailable("0.4.5", "v0.5.0")).toBe(true);
  });
  it("false when current build is ahead of latest release", () => {
    expect(isDesktopUpdateAvailable("0.5.0", "v0.4.5")).toBe(false);
  });
});

describe("parseReleaseTag", () => {
  it("reads tag_name from a releases/latest payload", () => {
    expect(parseReleaseTag({ tag_name: "v2026.6.5" })).toBe("v2026.6.5");
  });
  it("returns null for missing/garbage payload", () => {
    expect(parseReleaseTag({})).toBeNull();
    expect(parseReleaseTag(null)).toBeNull();
    expect(parseReleaseTag("nope")).toBeNull();
  });
  it("returns null for an empty tag_name", () => {
    expect(parseReleaseTag({ tag_name: "" })).toBeNull();
  });
});

describe("fetchLatestEngineRelease", () => {
  it("returns the tag from an injected successful fetcher", async () => {
    const tag = await fetchLatestEngineRelease({
      getJson: async () => ({ tag_name: "v2026.6.5" }),
      bypassCache: true,
    });
    expect(tag).toBe("v2026.6.5");
  });

  it("returns null when the injected fetcher throws (network/timeout)", async () => {
    const tag = await fetchLatestEngineRelease({
      getJson: async () => {
        throw new Error("ENOTFOUND");
      },
      bypassCache: true,
    });
    expect(tag).toBeNull();
  });

  it("returns null when the payload has no tag", async () => {
    const tag = await fetchLatestEngineRelease({
      getJson: async () => ({}),
      bypassCache: true,
    });
    expect(tag).toBeNull();
  });

  it("caches a successful tag and does not re-fetch within TTL", async () => {
    let calls = 0;
    const getJson = async () => {
      calls += 1;
      return { tag_name: "v2099.1.1" };
    };
    // bypassCache on the first call forces a real fetch and writes the cache.
    const first = await fetchLatestEngineRelease({ getJson, bypassCache: true });
    // Second call without bypassCache must be served from the cache (calls stays 1).
    const second = await fetchLatestEngineRelease({ getJson });
    expect(first).toBe("v2099.1.1");
    expect(second).toBe("v2099.1.1");
    expect(calls).toBe(1);
  });
});

describe("fetchLatestDesktopRelease", () => {
  it("returns the tag from an injected successful fetcher", async () => {
    const tag = await fetchLatestDesktopRelease({
      getJson: async () => ({ tag_name: "v0.5.0" }),
      bypassCache: true,
    });
    expect(tag).toBe("v0.5.0");
  });

  it("returns null when the injected fetcher throws (network/timeout)", async () => {
    const tag = await fetchLatestDesktopRelease({
      getJson: async () => {
        throw new Error("ENOTFOUND");
      },
      bypassCache: true,
    });
    expect(tag).toBeNull();
  });

  it("returns null when the payload has no tag", async () => {
    const tag = await fetchLatestDesktopRelease({
      getJson: async () => ({}),
      bypassCache: true,
    });
    expect(tag).toBeNull();
  });

  it("engine and desktop fetchers target different repos", async () => {
    const urls: string[] = [];
    const make = (tag: string) => async (url: string, _timeoutMs: number) => {
      urls.push(url);
      return { tag_name: tag };
    };
    const engine = await fetchLatestEngineRelease({ getJson: make("v2026.6.5"), bypassCache: true });
    const desktop = await fetchLatestDesktopRelease({ getJson: make("v0.5.0"), bypassCache: true });
    expect(engine).toBe("v2026.6.5");
    expect(desktop).toBe("v0.5.0");
    expect(urls.some((u) => u.includes("NousResearch/hermes-agent"))).toBe(true);
    expect(urls.some((u) => u.includes("kos2001/hermes-desktop-release"))).toBe(true);
  });
});
