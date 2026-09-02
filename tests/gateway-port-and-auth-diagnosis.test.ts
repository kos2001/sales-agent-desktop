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
