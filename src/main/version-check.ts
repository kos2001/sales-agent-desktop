// Version reconciliation for the onboarding "upgrade check" gate. Pure
// helpers here have no electron/installer dependency so they unit-test under
// vitest's node pool. Network + assembly live in the check-version-status IPC
// handler (src/main/index.ts).

import { request as httpsRequest, type RequestOptions } from "https";
import { request as httpRequest } from "http";
import { getCorporateNetworkConfig, isValidHttpUrl } from "./corporate-net";

export interface ComponentVersion {
  // For the engine, `current` is the raw `hermes --version` line while `latest`
  // is a short GitHub tag; a UI must not compare them as equal strings.
  current: string | null;
  latest: string | null;
  updateAvailable: boolean;
}

export interface VersionStatus {
  engine: ComponentVersion;
  desktop: ComponentVersion;
}

export interface ParsedEngineVersion {
  semver: string | null; // "0.16.0"
  calver: string | null; // "2026.6.5"
  upstreamSha: string | null; // "0d82060c"
}

/** Parse the first line of `hermes --version`, e.g.
 *  "Hermes Agent v0.16.0 (2026.6.5) · upstream 0d82060c". */
export function parseEngineVersion(output: string | null): ParsedEngineVersion {
  const text = output ?? "";
  const semver = text.match(/v(\d+\.\d+\.\d+)/)?.[1] ?? null;
  const calver = text.match(/\((\d{4}(?:\.\d+)+)\)/)?.[1] ?? null;
  const upstreamSha = text.match(/upstream\s+([0-9a-f]{7,40})/i)?.[1] ?? null;
  return { semver, calver, upstreamSha };
}

/** Strip a leading "v" and surrounding whitespace from a tag/version. */
function normalizeVersion(v: string | null): string | null {
  if (!v) return null;
  const t = v.trim().replace(/^v/i, "");
  return /^\d+(?:\.\d+)*$/.test(t) ? t : null;
}

/** Compare two dotted numeric versions segment-by-segment.
 *  Returns <0 if a<b, 0 if equal, >0 if a>b.
 *  Non-numeric segments (e.g. "6-rc1") are treated as equal to their
 *  counterpart so that a pre-release suffix never produces NaN. */
export function compareCalVer(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    // If either segment is non-numeric, treat as equal and keep comparing.
    if (Number.isNaN(da) || Number.isNaN(db)) continue;
    if (da !== db) return da - db;
  }
  return 0;
}

/** True only when the installed CalVer is strictly older than the latest
 *  release tag. Any unparseable input → false (never prompt unjustified). */
export function isEngineUpdateAvailable(
  installedCalVer: string | null,
  latestTag: string | null,
): boolean {
  const installed = normalizeVersion(installedCalVer);
  const latest = normalizeVersion(latestTag);
  if (!installed || !latest) return false;
  return compareCalVer(installed, latest) < 0;
}

/** True only when the installed desktop version is strictly older than the
 *  latest desktop release tag. Both inputs are normalized (leading "v" stripped)
 *  and compared numerically, so a build AHEAD of the latest release does not
 *  falsely prompt and "0.4.5" vs "v0.4.5" is treated as equal. Any unparseable
 *  input → false (never prompt unjustified). */
export function isDesktopUpdateAvailable(
  current: string | null,
  latest: string | null,
): boolean {
  const cur = normalizeVersion(current);
  const lat = normalizeVersion(latest);
  if (!cur || !lat) return false;
  return compareCalVer(cur, lat) < 0;
}

// ---------------------------------------------------------------------------
// GitHub release fetcher
// ---------------------------------------------------------------------------

const ENGINE_RELEASE_URL =
  "https://api.github.com/repos/NousResearch/hermes-agent/releases/latest";
const DESKTOP_RELEASE_URL =
  "https://api.github.com/repos/kos2001/hermes-desktop-release/releases/latest";
const FETCH_TIMEOUT_MS = 3000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h

interface TagCache {
  tag: string | null;
  at: number;
}
const _engineCache: TagCache = { tag: null, at: 0 };
const _desktopCache: TagCache = { tag: null, at: 0 };

/** Extract and return the release tag (`tag_name`) from a GitHub payload. */
export function parseReleaseTag(payload: unknown): string | null {
  if (payload && typeof payload === "object" && "tag_name" in payload) {
    const t = (payload as { tag_name?: unknown }).tag_name;
    return typeof t === "string" && t.length > 0 ? t : null;
  }
  return null;
}

export interface ReleaseFetchOptions {
  /** Injection seam for tests. Defaults to a real proxy-aware GET. */
  getJson?: (url: string, timeoutMs: number) => Promise<unknown>;
  /** Override the 1h cache (e.g. tests). */
  bypassCache?: boolean;
}

/** Shared fetch-and-cache core. Returns the latest release tag for `url`, or
 *  null on any failure. Uses the passed per-repo `cache` (1h TTL). */
async function fetchLatestReleaseTag(
  url: string,
  cache: TagCache,
  opts: ReleaseFetchOptions = {},
): Promise<string | null> {
  if (!opts.bypassCache && cache.tag && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.tag;
  }
  const getJson = opts.getJson ?? defaultGetJson;
  try {
    const payload = await getJson(url, FETCH_TIMEOUT_MS);
    const tag = parseReleaseTag(payload);
    if (tag) {
      cache.tag = tag;
      cache.at = Date.now();
    }
    return tag;
  } catch {
    return null; // network/timeout/proxy failure -> "no update", never blocks
  }
}

/** Latest engine release tag, or null on any failure. Cached for 1h. */
export async function fetchLatestEngineRelease(
  opts: ReleaseFetchOptions = {},
): Promise<string | null> {
  return fetchLatestReleaseTag(ENGINE_RELEASE_URL, _engineCache, opts);
}

/** Latest desktop release tag (kos2001/hermes-desktop-release), or null on any
 *  failure. Cached for 1h. */
export async function fetchLatestDesktopRelease(
  opts: ReleaseFetchOptions = {},
): Promise<string | null> {
  return fetchLatestReleaseTag(DESKTOP_RELEASE_URL, _desktopCache, opts);
}

// Real GET: direct global fetch, or an HTTP CONNECT tunnel through the
// configured corporate proxy (same dependency-free approach as preflight.ts).
async function defaultGetJson(url: string, timeoutMs: number): Promise<unknown> {
  const cfg = getCorporateNetworkConfig();
  const proxyUrl =
    cfg.enabled && isValidHttpUrl(cfg.httpsProxy) ? cfg.httpsProxy.trim() : "";
  if (proxyUrl) return getJsonViaProxy(url, proxyUrl, timeoutMs);

  const resp = await fetch(url, {
    headers: { "User-Agent": "hermes-desktop", Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

// Open a CONNECT tunnel to the target host through the proxy, then issue the
// HTTPS GET over the tunneled socket and parse the JSON body.
function getJsonViaProxy(
  targetUrl: string,
  proxyUrl: string,
  timeoutMs: number,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const target = new URL(targetUrl);
    const proxy = new URL(proxyUrl);
    const port = target.port || "443";
    // I2: record start time so connectReq + getReq together stay within ~timeoutMs.
    const startedAt = Date.now();
    const connectReq = httpRequest({
      host: proxy.hostname,
      port: proxy.port || "80",
      method: "CONNECT",
      path: `${target.hostname}:${port}`,
      timeout: timeoutMs,
    });
    connectReq.on("connect", (res, socket) => {
      if (res.statusCode == null || res.statusCode >= 300) {
        socket.destroy();
        reject(new Error(`proxy CONNECT ${res.statusCode}`));
        return;
      }
      // I2: use remaining budget so total wait is ~timeoutMs, not 2×timeoutMs.
      const remaining = Math.max(500, timeoutMs - (Date.now() - startedAt));
      const getReq = httpsRequest(
        {
          host: target.hostname,
          servername: target.hostname,
          port: Number(port),
          path: target.pathname + target.search,
          method: "GET",
          socket,
          agent: false,
          timeout: remaining,
          headers: {
            Host: target.hostname,
            "User-Agent": "hermes-desktop",
            Accept: "application/json",
            Connection: "close",
          },
        } as RequestOptions & { socket: typeof socket },
        (resp) => {
          if ((resp.statusCode ?? 0) >= 300) {
            resp.resume();
            reject(new Error(`HTTP ${resp.statusCode}`));
            return;
          }
          let body = "";
          resp.setEncoding("utf8");
          resp.on("data", (c) => (body += c));
          resp.on("end", () => {
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              reject(e as Error);
            }
          });
          // C1: a mid-response socket drop emits 'error' on IncomingMessage;
          // without this listener Node throws an uncaught exception in main process.
          resp.on("error", (e) => {
            resp.resume();
            reject(e as Error);
          });
        },
      );
      getReq.on("timeout", () => getReq.destroy(new Error("timeout")));
      // I1: destroy the tunneled socket on getReq errors to prevent socket leak.
      getReq.on("error", (e) => {
        socket.destroy();
        reject(e as Error);
      });
      getReq.end();
    });
    connectReq.on("timeout", () => connectReq.destroy(new Error("timeout")));
    connectReq.on("error", reject);
    connectReq.end();
  });
}
