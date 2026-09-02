import { describe, expect, it } from "vitest";
import { getPreflightTargets, runPreflight } from "../src/main/preflight";
import { EMPTY_CORPORATE_NETWORK_CONFIG } from "../src/main/corporate-net";

describe("getPreflightTargets", () => {
  it("always probes uv, github, and playwright hosts", () => {
    const ids = getPreflightTargets({
      ...EMPTY_CORPORATE_NETWORK_CONFIG,
    }).map((t) => t.id);
    expect(ids).toContain("uv");
    expect(ids).toContain("github");
    expect(ids).toContain("playwright");
  });

  it("adds the PyPI target only when a PyPI index is configured", () => {
    const without = getPreflightTargets({
      ...EMPTY_CORPORATE_NETWORK_CONFIG,
    }).map((t) => t.id);
    expect(without).not.toContain("pypi");

    const withIdx = getPreflightTargets({
      ...EMPTY_CORPORATE_NETWORK_CONFIG,
      enabled: true,
      pypiIndexUrl: "https://pypi.corp/simple/",
    });
    const pypi = withIdx.find((t) => t.id === "pypi");
    expect(pypi).toBeDefined();
    expect(pypi?.url).toBe("https://pypi.corp/simple/");
  });
});

describe("runPreflight", () => {
  it("marks a target ok on a 2xx response", async () => {
    const probeImpl = async () => 200;
    const results = await runPreflight(
      { ...EMPTY_CORPORATE_NETWORK_CONFIG },
      { probeImpl },
    );
    expect(results.length).toBeGreaterThanOrEqual(3);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results[0]).toHaveProperty("host");
  });

  it("marks a target blocked when the probe rejects", async () => {
    const probeImpl = async () => {
      throw new Error("ETIMEDOUT");
    };
    const results = await runPreflight(
      { ...EMPTY_CORPORATE_NETWORK_CONFIG },
      { probeImpl },
    );
    expect(results.every((r) => !r.ok)).toBe(true);
    expect(results[0].hint).toContain("ETIMEDOUT");
  });

  it("treats a 4xx as reachable (endpoint answered)", async () => {
    const probeImpl = async () => 403;
    const results = await runPreflight(
      { ...EMPTY_CORPORATE_NETWORK_CONFIG },
      { probeImpl },
    );
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results[0].status).toBe(403);
  });

  it("passes the configured proxy through to the probe", async () => {
    const seen: (string | undefined)[] = [];
    const probeImpl = async (_url: string, o: { proxyUrl?: string }) => {
      seen.push(o.proxyUrl);
      return 200;
    };
    await runPreflight(
      {
        ...EMPTY_CORPORATE_NETWORK_CONFIG,
        enabled: true,
        httpsProxy: "http://proxy.corp:8080",
      },
      { probeImpl },
    );
    expect(seen.every((p) => p === "http://proxy.corp:8080")).toBe(true);
  });
});
