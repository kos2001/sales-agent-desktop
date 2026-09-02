import { request as httpRequest } from "http";
import { type CorporateNetworkConfig, isValidHttpUrl } from "./corporate-net";

// A connectivity probe target. The Install screen runs these (through the
// configured proxy, if any) so the user can see exactly which install
// dependencies their corporate network blocks — turning "I'm not sure what
// our mirror allows" into a concrete pass/fail table.
export interface PreflightTarget {
  id: string;
  label: string;
  url: string;
}

export interface PreflightResult {
  id: string;
  label: string;
  host: string;
  ok: boolean;
  status?: number;
  hint?: string;
}

export function getPreflightTargets(
  cfg: CorporateNetworkConfig,
): PreflightTarget[] {
  const targets: PreflightTarget[] = [
    {
      id: "uv",
      label: "uv installer (astral.sh)",
      url: "https://astral.sh/uv/install.ps1",
    },
    {
      id: "github",
      label: "Hermes repo & Python builds (github.com)",
      url: "https://github.com/NousResearch/hermes-agent",
    },
    {
      id: "playwright",
      label: "Playwright browser CDN",
      url: "https://cdn.playwright.dev/",
    },
  ];
  if (isValidHttpUrl(cfg.pypiIndexUrl)) {
    targets.push({
      id: "pypi",
      label: "Corporate PyPI index",
      url: cfg.pypiIndexUrl.trim(),
    });
  }
  return targets;
}

export interface ProbeOptions {
  proxyUrl?: string;
  timeoutMs: number;
}

// Returns the HTTP status the endpoint answered with. Throws on a network
// failure (DNS, timeout, refused, proxy can't reach target). No new
// dependency: a direct probe uses the global fetch; a proxied probe opens an
// HTTP CONNECT tunnel and reports whether the proxy could reach the host.
export type ProbeImpl = (url: string, opts: ProbeOptions) => Promise<number>;

function proxyConnectProbe(
  targetUrl: string,
  proxyUrl: string,
  timeoutMs: number,
): Promise<number> {
  return new Promise((resolve, reject) => {
    let target: URL;
    let proxy: URL;
    try {
      target = new URL(targetUrl);
      proxy = new URL(proxyUrl);
    } catch (err) {
      reject(err as Error);
      return;
    }
    const port = target.port || (target.protocol === "https:" ? "443" : "80");
    const req = httpRequest({
      host: proxy.hostname,
      port: proxy.port || 80,
      method: "CONNECT",
      path: `${target.hostname}:${port}`,
      timeout: timeoutMs,
    });
    req.on("connect", (res, socket) => {
      socket.destroy();
      // A 2xx from the proxy means the tunnel to the target opened.
      resolve(res.statusCode ?? 200);
    });
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("ETIMEDOUT"));
    });
    req.on("error", (err) => reject(err));
    req.end();
  });
}

async function defaultProbe(url: string, opts: ProbeOptions): Promise<number> {
  if (opts.proxyUrl) {
    return proxyConnectProbe(url, opts.proxyUrl, opts.timeoutMs);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const resp = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
    });
    return resp.status;
  } finally {
    clearTimeout(timer);
  }
}

export interface RunPreflightOptions {
  probeImpl?: ProbeImpl;
  timeoutMs?: number;
}

// Probe every target. Any HTTP status (even 4xx/5xx) proves the host is
// reachable; only a thrown error (DNS failure, timeout, connection refused,
// proxy can't tunnel) counts as blocked. Failures are collected per-target,
// never thrown.
export async function runPreflight(
  cfg: CorporateNetworkConfig,
  opts: RunPreflightOptions = {},
): Promise<PreflightResult[]> {
  const probe = opts.probeImpl ?? defaultProbe;
  const timeoutMs = opts.timeoutMs ?? 5000;
  const proxyUrl =
    cfg.enabled && isValidHttpUrl(cfg.httpsProxy)
      ? cfg.httpsProxy.trim()
      : undefined;

  const targets = getPreflightTargets(cfg);
  return Promise.all(
    targets.map(async (t) => {
      let host = t.url;
      try {
        host = new URL(t.url).host;
      } catch {
        /* keep raw url as host */
      }
      try {
        const status = await probe(t.url, { proxyUrl, timeoutMs });
        return { id: t.id, label: t.label, host, ok: true, status };
      } catch (err) {
        return {
          id: t.id,
          label: t.label,
          host,
          ok: false,
          hint: (err as Error).message,
        };
      }
    }),
  );
}
