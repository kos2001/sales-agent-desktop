import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { readDesktopConfig, writeDesktopConfig } from "./config";

// Corporate-network install settings. For installs behind a company mirror or
// proxy (e.g. Artifactory/Nexus PyPI, an HTTP proxy, an internal git mirror),
// the upstream install scripts can't reach github.com/pypi.org directly. We
// don't fork those scripts — instead we feed the tools they invoke (uv, pip,
// git, npm) the standard proxy/index env vars they already honor.
export interface CorporateNetworkConfig {
  enabled: boolean;
  httpsProxy: string;
  noProxy: string;
  pypiIndexUrl: string;
  gitMirrorBase: string;
  pythonInstallMirror: string;
  playwrightDownloadHost: string;
}

export const EMPTY_CORPORATE_NETWORK_CONFIG: CorporateNetworkConfig = {
  enabled: false,
  httpsProxy: "",
  noProxy: "",
  pypiIndexUrl: "",
  gitMirrorBase: "",
  pythonInstallMirror: "",
  playwrightDownloadHost: "",
};

export function isValidHttpUrl(s: string): boolean {
  if (typeof s !== "string" || s.trim() === "") return false;
  try {
    const u = new URL(s.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function getCorporateNetworkConfig(): CorporateNetworkConfig {
  const data = readDesktopConfig();
  const raw = (data.corporateNetwork as Partial<CorporateNetworkConfig>) ?? {};
  return {
    enabled: Boolean(raw.enabled),
    httpsProxy: (raw.httpsProxy as string) || "",
    noProxy: (raw.noProxy as string) || "",
    pypiIndexUrl: (raw.pypiIndexUrl as string) || "",
    gitMirrorBase: (raw.gitMirrorBase as string) || "",
    pythonInstallMirror: (raw.pythonInstallMirror as string) || "",
    playwrightDownloadHost: (raw.playwrightDownloadHost as string) || "",
  };
}

export function setCorporateNetworkConfig(cfg: CorporateNetworkConfig): void {
  const data = readDesktopConfig();
  data.corporateNetwork = cfg;
  writeDesktopConfig(data);
}

// Translate the config into env vars for the install subprocess. Only valid,
// non-empty fields are emitted, so a half-filled form can't break an install
// with a bogus proxy/index. Returns an empty map when disabled.
export function buildCorporateEnv(
  cfg: CorporateNetworkConfig,
): Record<string, string> {
  const env: Record<string, string> = {};
  if (!cfg.enabled) return env;

  if (isValidHttpUrl(cfg.httpsProxy)) {
    const p = cfg.httpsProxy.trim();
    // Upper + lower case: native tools (git, curl) read the lowercase forms.
    env.HTTPS_PROXY = p;
    env.HTTP_PROXY = p;
    env.https_proxy = p;
    env.http_proxy = p;
    env.npm_config_proxy = p;
    env.npm_config_https_proxy = p;
    if (cfg.noProxy.trim() !== "") {
      env.NO_PROXY = cfg.noProxy.trim();
      env.no_proxy = cfg.noProxy.trim();
    }
  }

  if (isValidHttpUrl(cfg.pypiIndexUrl)) {
    const idx = cfg.pypiIndexUrl.trim();
    env.UV_INDEX_URL = idx;
    env.UV_DEFAULT_INDEX = idx;
    env.PIP_INDEX_URL = idx;
  }

  if (isValidHttpUrl(cfg.pythonInstallMirror)) {
    env.UV_PYTHON_INSTALL_MIRROR = cfg.pythonInstallMirror.trim();
  }

  if (isValidHttpUrl(cfg.playwrightDownloadHost)) {
    env.PLAYWRIGHT_DOWNLOAD_HOST = cfg.playwrightDownloadHost.trim();
  }

  return env;
}

// Returns a path to a temp gitconfig that rewrites github.com to the mirror,
// or null when no git mirror is configured. The caller injects this path via
// GIT_CONFIG_GLOBAL for the install subprocess only, so the user's real
// global gitconfig is never modified. The caller must call removeTempGitConfig
// after the install finishes.
export function writeTempGitConfig(cfg: CorporateNetworkConfig): string | null {
  if (!cfg.enabled || !isValidHttpUrl(cfg.gitMirrorBase)) return null;
  let base = cfg.gitMirrorBase.trim();
  if (!base.endsWith("/")) base += "/";
  const dir = mkdtempSync(join(tmpdir(), "hermes-gitconfig-"));
  const file = join(dir, ".gitconfig");
  const content = `[url "${base}"]\n\tinsteadOf = https://github.com/\n`;
  writeFileSync(file, content, "utf-8");
  return file;
}

// Best-effort cleanup of a temp gitconfig (and its temp dir) created by
// writeTempGitConfig.
export function removeTempGitConfig(path: string | null): void {
  if (!path) return;
  try {
    rmSync(dirname(path), { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}
