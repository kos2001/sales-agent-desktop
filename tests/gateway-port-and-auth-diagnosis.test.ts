/**
 * Port resolution and 401 diagnosis for the local gateway.
 *
 * Both exist because of a real failure: a gateway belonging to a *different*
 * HERMES_HOME already owned 127.0.0.1:8642, so this app's gateway could not
 * bind, every chat request authenticated against a stranger's server, and the
 * only thing the user saw was "Invalid gateway API key (API_SERVER_KEY)" —
 * which reads as "the API key you just typed is wrong". It is not: the app
 * never even reached its own gateway.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCAL_API_PORT,
  diagnoseGatewayError,
  hasApiServerConfig,
  readGatewayPidFile,
  resolveLocalApiPort,
} from "../src/main/gateway-diagnosis";

describe("resolveLocalApiPort", () => {
  it("falls back to 8642 when nothing is configured", () => {
    expect(resolveLocalApiPort(() => null)).toBe(DEFAULT_LOCAL_API_PORT);
    expect(DEFAULT_LOCAL_API_PORT).toBe(8642);
  });

  it("reads platforms.api_server.extra.port, which is the key this app writes", () => {
    // ensureApiServerConfig() in hermes.ts appends `extra: { port: ... }`,
    // so a resolver that ignored it would miss the app's own config.
    const port = resolveLocalApiPort((key) =>
      key === "platforms.api_server.extra.port" ? "8644" : null,
    );
    expect(port).toBe(8644);
  });

  it("prefers the key this app writes over the other two", () => {
    const port = resolveLocalApiPort((key) =>
      key === "platforms.api_server.extra.port"
        ? "8644"
        : key === "platforms.api_server.port"
          ? "8643"
          : key === "api_server.port"
            ? "8650"
            : null,
    );
    expect(port).toBe(8644);
  });

  it("prefers the nested platforms.api_server.port the Python backend writes", () => {
    const port = resolveLocalApiPort((key) =>
      key === "platforms.api_server.port" ? "8643" : null,
    );
    expect(port).toBe(8643);
  });

  it("accepts the legacy top-level api_server.port", () => {
    const port = resolveLocalApiPort((key) =>
      key === "api_server.port" ? "8650" : null,
    );
    expect(port).toBe(8650);
  });

  it("lets the nested key win when both are present", () => {
    const port = resolveLocalApiPort((key) =>
      key === "platforms.api_server.port"
        ? "8643"
        : key === "api_server.port"
          ? "8650"
          : null,
    );
    expect(port).toBe(8643);
  });

  it("ignores values that are not a usable port", () => {
    for (const bad of ["", "   ", "not-a-port", "0", "-1", "70000", "80.5"]) {
      expect(
        resolveLocalApiPort(() => bad),
        `input ${bad}`,
      ).toBe(DEFAULT_LOCAL_API_PORT);
    }
  });
});

describe("diagnoseGatewayError", () => {
  const upstream = "Invalid gateway API key (API_SERVER_KEY)";

  it("explains the port conflict when our own gateway is not running", () => {
    const message = diagnoseGatewayError({
      status: 401,
      upstreamMessage: upstream,
      code: "gateway_auth_failed",
      isLocal: true,
      ourGatewayRunning: false,
      port: 8642,
    });

    // Must say the port is the problem, and must not be mistaken for a
    // provider-key problem.
    expect(message).toContain("8642");
    expect(message).toContain("another Hermes gateway");
    // The provider key the user just typed is not implicated.
    expect(message).not.toMatch(/provider (api )?key is (wrong|invalid)/i);
    // The raw upstream text is kept so the original is still greppable.
    expect(message).toContain(upstream);
  });

  it("points at token drift when our gateway IS running", () => {
    const message = diagnoseGatewayError({
      status: 401,
      upstreamMessage: upstream,
      code: "gateway_auth_failed",
      isLocal: true,
      ourGatewayRunning: true,
      port: 8642,
    });

    expect(message).toMatch(/restart/i);
    expect(message).not.toContain("another Hermes gateway");
  });

  it("leaves remote-mode auth failures alone — the user owns that gateway", () => {
    const message = diagnoseGatewayError({
      status: 401,
      upstreamMessage: upstream,
      code: "gateway_auth_failed",
      isLocal: false,
      ourGatewayRunning: false,
      port: 8642,
    });

    expect(message).toBe(upstream);
  });

  it("passes every other error straight through untouched", () => {
    for (const [status, code] of [
      [401, "invalid_api_key"],
      [429, "rate_limit"],
      [500, "server_error"],
    ] as const) {
      expect(
        diagnoseGatewayError({
          status,
          upstreamMessage: "some other failure",
          code,
          isLocal: true,
          ourGatewayRunning: false,
          port: 8642,
        }),
      ).toBe("some other failure");
    }
  });

  it("still diagnoses when the gateway sends no machine-readable code", () => {
    // The code field is a newer addition; match on the message as a fallback
    // so older gateways are covered too.
    const message = diagnoseGatewayError({
      status: 401,
      upstreamMessage: upstream,
      code: undefined,
      isLocal: true,
      ourGatewayRunning: false,
      port: 8642,
    });
    expect(message).toContain("another Hermes gateway");
  });
});

describe("readGatewayPidFile", () => {
  it("returns nothing when there is no pid file", () => {
    expect(readGatewayPidFile(null, "/home")).toEqual({
      pid: null,
      homeMatches: false,
    });
  });

  it("reads the JSON form the Python gateway writes, including its home", () => {
    const raw = JSON.stringify({
      pid: 113,
      kind: "hermes-gateway",
      hermes_home: "/Users/x/.hermes/profiles/lsi",
    });
    expect(readGatewayPidFile(raw, "/Users/x/.hermes/profiles/lsi")).toEqual({
      pid: 113,
      homeMatches: true,
    });
  });

  it("reports a pid file left behind by a DIFFERENT home as not ours", () => {
    // This is the whole point: a stale or foreign pid file must never be read
    // as "our gateway is up".
    const raw = JSON.stringify({
      pid: 113,
      hermes_home: "/Users/x/.hermes/profiles/lsi",
    });
    expect(readGatewayPidFile(raw, "/tmp/hermes-fresh.ABC")).toEqual({
      pid: 113,
      homeMatches: false,
    });
  });

  it("tolerates trailing separators and whitespace when comparing homes", () => {
    const raw = JSON.stringify({ pid: 7, hermes_home: "/a/b/" });
    expect(readGatewayPidFile(raw, "/a/b").homeMatches).toBe(true);
  });

  it("accepts the bare-integer form, which carries no home to check", () => {
    // Older gateways wrote just the pid. We cannot prove ownership, so we
    // trust it rather than accusing the user of a port conflict.
    expect(readGatewayPidFile("4321\n", "/anywhere")).toEqual({
      pid: 4321,
      homeMatches: true,
    });
  });

  it("returns no pid for malformed content", () => {
    for (const raw of ["", "   ", "{", "{}", '{"pid":"abc"}', "not-a-pid"]) {
      expect(readGatewayPidFile(raw, "/home").pid, `input ${raw}`).toBeNull();
    }
  });
});

describe("readGatewayPidFile — path canonicalisation", () => {
  // macOS resolves /var to /private/var, so the gateway records
  // "/private/var/folders/.../hermes-fresh.X" while HERMES_HOME is
  // "/var/folders/.../hermes-fresh.X". Comparing the raw strings marks our
  // OWN gateway as a stranger and produces the wrong advice.
  const recorded = "/private/var/folders/l4/T/hermes-fresh.X";
  const ourHome = "/var/folders/l4/T/hermes-fresh.X";
  const raw = JSON.stringify({ pid: 241, hermes_home: recorded });

  it("treats /var and /private/var as the same home when told how to resolve", () => {
    const canonical = (p: string): string =>
      p.startsWith("/var/") ? `/private${p}` : p;
    expect(readGatewayPidFile(raw, ourHome, canonical).homeMatches).toBe(true);
  });

  it("still distinguishes genuinely different homes after resolving", () => {
    const canonical = (p: string): string =>
      p.startsWith("/var/") ? `/private${p}` : p;
    expect(
      readGatewayPidFile(raw, "/var/folders/l4/T/hermes-fresh.OTHER", canonical)
        .homeMatches,
    ).toBe(false);
  });

  it("falls back to a plain comparison when no resolver is supplied", () => {
    expect(readGatewayPidFile(raw, recorded).homeMatches).toBe(true);
  });

  it("survives a resolver that throws on a path that no longer exists", () => {
    const boom = (): string => {
      throw new Error("ENOENT");
    };
    // Must not crash the diagnosis; falls back to the literal comparison.
    expect(readGatewayPidFile(raw, recorded, boom).homeMatches).toBe(true);
  });
});

describe("hasApiServerConfig", () => {
  it("does not count a mention inside a comment", () => {
    // This is the bug it exists for. Hermes' default config.yaml documents
    // `platforms.api_server.extra.model_routes` in comments, so a bare
    // /api_server/ test always matched and the desktop's own block was never
    // written — leaving a fresh install with no api_server config at all.
    const yaml = [
      "# Configure via the `platforms.api_server.extra.model_routes` gateway",
      "#   api_server:",
      "#     enabled: true",
      "database:",
      '  journal_mode: "wal"',
    ].join("\n");
    expect(hasApiServerConfig(yaml)).toBe(false);
  });

  it("finds a real nested platforms.api_server block", () => {
    const yaml = [
      "platforms:",
      "  api_server:",
      "    enabled: true",
      "    extra:",
      "      port: 8642",
    ].join("\n");
    expect(hasApiServerConfig(yaml)).toBe(true);
  });

  it("finds a top-level api_server block", () => {
    expect(hasApiServerConfig("api_server:\n  token: abc\n")).toBe(true);
  });

  it("ignores api_server appearing as a value rather than a key", () => {
    expect(hasApiServerConfig('note: "see api_server docs"\n')).toBe(false);
  });

  it("ignores a trailing comment on an unrelated line", () => {
    expect(hasApiServerConfig("database: wal  # unlike api_server:\n")).toBe(
      false,
    );
  });

  it("handles an empty or whitespace-only config", () => {
    expect(hasApiServerConfig("")).toBe(false);
    expect(hasApiServerConfig("\n  \n")).toBe(false);
  });
});
