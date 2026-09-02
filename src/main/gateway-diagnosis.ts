/**
 * Local-gateway port resolution and 401 diagnosis.
 *
 * Both halves come from the same incident. The app hardcoded
 * `http://127.0.0.1:8642` as *the* local gateway, but the port belongs to
 * whichever Hermes gateway bound it first — and that may be a gateway from a
 * different profile or a different HERMES_HOME entirely. When that happens:
 *
 *   1. Our gateway logs `Could not bind 127.0.0.1:8642: address already in use`
 *      and exits. That log lands in the gateway's own file, not the UI.
 *   2. Every chat request still goes to 8642, carrying *our* API_SERVER_KEY.
 *   3. The stranger's gateway rejects it, and the app relays the upstream text
 *      verbatim: "Invalid gateway API key (API_SERVER_KEY)".
 *
 * Step 3 is the damaging part. A user who has just typed a provider API key
 * reads that as "your key is wrong" and starts re-pasting a key that was never
 * the problem. These functions are kept free of I/O so the message logic is
 * testable without a live gateway.
 */

export const DEFAULT_LOCAL_API_PORT = 8642;

/** Reads a dotted config key, e.g. `getConfigValue` bound to a profile. */
export type ConfigReader = (key: string) => string | null;

/**
 * The port the local gateway serves on.
 *
 * `platforms.api_server.port` is where the Python backend nests it; the
 * top-level `api_server.port` is the older layout. Anything unparseable falls
 * back to the default rather than throwing — a malformed config should not
 * make the app unable to talk to a gateway that is running on the default.
 */
export function resolveLocalApiPort(getConfigValue: ConfigReader): number {
  // `extra.port` first: that is the key ensureApiServerConfig() in hermes.ts
  // writes, so it is what an app-configured install actually carries. The
  // other two cover a config the user or `hermes setup` wrote by hand.
  for (const key of [
    "platforms.api_server.extra.port",
    "platforms.api_server.port",
    "api_server.port",
  ]) {
    const raw = getConfigValue(key);
    if (raw == null) continue;
    const trimmed = raw.trim();
    // Integers only: "80.5" and "8642abc" are configuration mistakes, not
    // ports, and silently truncating them would route traffic somewhere the
    // user did not ask for.
    if (!/^\d+$/.test(trimmed)) continue;
    const port = Number(trimmed);
    if (port >= 1 && port <= 65535) return port;
  }
  return DEFAULT_LOCAL_API_PORT;
}

export interface GatewayErrorContext {
  status: number;
  /** `error.message` as sent by the gateway. */
  upstreamMessage: string;
  /** `error.code` as sent by the gateway; absent on older versions. */
  code?: string;
  /** False for remote/SSH mode, where the user administers the gateway. */
  isLocal: boolean;
  /** Whether *this* app's gateway process is alive. */
  ourGatewayRunning: boolean;
  port: number;
}

/** Matches the gateway's auth rejection on versions that predate `error.code`. */
const AUTH_FAILURE_TEXT = /invalid gateway api key|API_SERVER_KEY/i;

function isGatewayAuthFailure(ctx: GatewayErrorContext): boolean {
  if (ctx.status !== 401) return false;
  if (ctx.code === "gateway_auth_failed") return true;
  // Only fall back to text matching when no code was supplied at all —
  // a gateway that sent some *other* code meant some other failure.
  return ctx.code === undefined && AUTH_FAILURE_TEXT.test(ctx.upstreamMessage);
}

/**
 * Turn a gateway error into something the user can act on.
 *
 * Everything except a local gateway-auth rejection passes through unchanged;
 * this deliberately does not editorialise on provider errors, rate limits, or
 * anything from a remote gateway the user runs themselves.
 */
export function diagnoseGatewayError(ctx: GatewayErrorContext): string {
  if (!ctx.isLocal || !isGatewayAuthFailure(ctx)) return ctx.upstreamMessage;

  if (!ctx.ourGatewayRunning) {
    return [
      `Port ${ctx.port} is being served by another Hermes gateway — one from a ` +
        `different profile or HERMES_HOME — so this app never reached its own.`,
      `This is not a problem with your provider API key.`,
      `Stop the other gateway, or set platforms.api_server.port in this ` +
        `profile's config.yaml to a free port.`,
      `Gateway said: ${ctx.upstreamMessage}`,
    ].join("\n");
  }

  return [
    `The gateway on port ${ctx.port} rejected this app's API_SERVER_KEY, which ` +
      `usually means the two fell out of sync.`,
    `This is not a problem with your provider API key.`,
    `Restart the gateway so it picks up the current token.`,
    `Gateway said: ${ctx.upstreamMessage}`,
  ].join("\n");
}

export interface GatewayPidInfo {
  /** The pid the file names, or null when there is no usable pid. */
  pid: number | null;
  /**
   * Whether the file claims to belong to the HERMES_HOME we are asking about.
   * False for a foreign or stale file — the case that made the diagnosis lie.
   */
  homeMatches: boolean;
}

function sameHome(a: string, b: string): boolean {
  const norm = (v: string): string => v.trim().replace(/\/+$/, "");
  return norm(a) === norm(b);
}

/**
 * Interpret `gateway.pid`.
 *
 * The in-memory ChildProcess handle is NOT a usable "is our gateway up?"
 * signal: send-message spawns the gateway and issues the HTTP request
 * immediately, so for the first second or two the handle is alive even when
 * the gateway is about to die on a bind conflict. That race made the 401
 * diagnosis blame token drift for what was actually a port conflict.
 *
 * The pid file is written by the gateway once it is actually up, and the JSON
 * form carries `hermes_home`, so it answers the question that matters: is the
 * gateway that is up *ours*?
 */
export function readGatewayPidFile(
  raw: string | null,
  ourHome: string,
): GatewayPidInfo {
  const absent: GatewayPidInfo = { pid: null, homeMatches: false };
  if (raw == null) return absent;
  const trimmed = raw.trim();
  if (!trimmed) return absent;

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const pid =
        typeof parsed.pid === "number" && Number.isFinite(parsed.pid)
          ? parsed.pid
          : null;
      if (pid == null) return absent;
      const home = parsed.hermes_home;
      return {
        pid,
        // No hermes_home recorded: an older gateway. Trust it rather than
        // accusing the user of a conflict we cannot actually prove.
        homeMatches: typeof home === "string" ? sameHome(home, ourHome) : true,
      };
    } catch {
      return absent;
    }
  }

  if (!/^\d+$/.test(trimmed)) return absent;
  // Bare-integer form carries no home; nothing to contradict, so trust it.
  return { pid: Number(trimmed), homeMatches: true };
}
