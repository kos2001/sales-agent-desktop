# Corporate-Network (Proxy/Mirror) Install Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Hermes Desktop install behind a corporate mirror/proxy on Windows (and bash platforms) without forking the upstream `install.ps1`/`install.sh`.

**Architecture:** A new `corporate-net.ts` persists proxy/mirror settings in `HERMES_HOME/desktop.json` and turns them into subprocess env vars (proxy + `UV_INDEX_URL`/`PIP_INDEX_URL` + `UV_PYTHON_INSTALL_MIRROR` + npm proxy) plus a temporary `GIT_CONFIG_GLOBAL` that rewrites `github.com` → the corporate git mirror. `installer.ts` merges that env into the install subprocess and prefers a bundled install script over the `raw.githubusercontent.com` download. A new `preflight.ts` probes each install endpoint through the configured proxy so the user can see exactly what their network blocks. The Install screen gains a settings panel + a "connection diagnostic" button.

**Tech Stack:** Electron main (Node 26, global `fetch` + `undici` `ProxyAgent`), TypeScript strict, React 19 renderer, Vitest. No new runtime dependencies (`undici` ships with Node).

---

## File Structure

- **Create** `src/main/corporate-net.ts` — config persistence (`get/setCorporateNetworkConfig`), `buildCorporateEnv`, `writeTempGitConfig`, `isValidHttpUrl`. Pure-function-first for testability.
- **Create** `src/main/preflight.ts` — `getPreflightTargets`, `runPreflight` (proxy-aware endpoint probes).
- **Create** `scripts/vendor-install-scripts.mjs` — downloads upstream `install.ps1`/`install.sh` into `resources/` (run when online; build-time vendoring helper).
- **Modify** `src/main/installer.ts` — `resolveBundledScript`, merge corporate env + `GIT_CONFIG_GLOBAL` into `runInstall`/`runInstallWindows`, prefer bundled script.
- **Modify** `src/main/index.ts` — IPC handlers `get-corporate-net`, `set-corporate-net`, `run-preflight`.
- **Modify** `src/preload/index.ts` + `src/preload/index.d.ts` — `getCorporateNetwork`, `setCorporateNetwork`, `runPreflight`.
- **Modify** `src/renderer/src/screens/Install/Install.tsx` — collapsible settings panel + diagnostic table.
- **Modify** `src/shared/i18n/locales/en/install.ts` + `src/shared/i18n/locales/ko/install.ts` — `corp.*` keys (other locales fall back to en).
- **Create** `tests/corporate-net.test.ts`, `tests/preflight.test.ts`.

Shared types live in `corporate-net.ts` and are imported by both main and (via structural duplication) preload `index.d.ts` (preload cannot import from `src/main`).

---

## Task 1: `corporate-net.ts` — types, config persistence, URL validation

**Files:**
- Create: `src/main/corporate-net.ts`
- Test: `tests/corporate-net.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/corporate-net.test.ts
import { describe, expect, it } from "vitest";
import { isValidHttpUrl } from "../src/main/corporate-net";

describe("isValidHttpUrl", () => {
  it("accepts http and https URLs", () => {
    expect(isValidHttpUrl("http://proxy.corp:8080")).toBe(true);
    expect(isValidHttpUrl("https://pypi.corp/simple/")).toBe(true);
  });

  it("rejects empty, non-URL, and non-http schemes", () => {
    expect(isValidHttpUrl("")).toBe(false);
    expect(isValidHttpUrl("   ")).toBe(false);
    expect(isValidHttpUrl("not a url")).toBe(false);
    expect(isValidHttpUrl("ftp://x")).toBe(false);
    expect(isValidHttpUrl("file:///etc")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/corporate-net.test.ts`
Expected: FAIL — cannot find module `../src/main/corporate-net`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/main/corporate-net.ts
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { readDesktopConfig, writeDesktopConfig } from "./config";

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/corporate-net.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/corporate-net.ts tests/corporate-net.test.ts
git commit -m "feat(install): add corporate-net config store and URL validation"
```

---

## Task 2: `buildCorporateEnv` — config → subprocess env

**Files:**
- Modify: `src/main/corporate-net.ts`
- Test: `tests/corporate-net.test.ts`

- [ ] **Step 1: Write the failing test (append to existing file)**

```ts
import { buildCorporateEnv } from "../src/main/corporate-net";
import type { CorporateNetworkConfig } from "../src/main/corporate-net";

const base: CorporateNetworkConfig = {
  enabled: true,
  httpsProxy: "http://proxy.corp:8080",
  noProxy: "localhost,.corp",
  pypiIndexUrl: "https://pypi.corp/simple/",
  gitMirrorBase: "https://gitmirror.corp/",
  pythonInstallMirror: "https://pymirror.corp/python",
  playwrightDownloadHost: "https://pw.corp",
};

describe("buildCorporateEnv", () => {
  it("returns an empty map when disabled", () => {
    expect(buildCorporateEnv({ ...base, enabled: false })).toEqual({});
  });

  it("maps proxy to upper and lower case env vars", () => {
    const env = buildCorporateEnv(base);
    expect(env.HTTPS_PROXY).toBe("http://proxy.corp:8080");
    expect(env.HTTP_PROXY).toBe("http://proxy.corp:8080");
    expect(env.https_proxy).toBe("http://proxy.corp:8080");
    expect(env.http_proxy).toBe("http://proxy.corp:8080");
    expect(env.NO_PROXY).toBe("localhost,.corp");
    expect(env.no_proxy).toBe("localhost,.corp");
    expect(env.npm_config_proxy).toBe("http://proxy.corp:8080");
    expect(env.npm_config_https_proxy).toBe("http://proxy.corp:8080");
  });

  it("maps the PyPI index to uv and pip vars", () => {
    const env = buildCorporateEnv(base);
    expect(env.UV_INDEX_URL).toBe("https://pypi.corp/simple/");
    expect(env.UV_DEFAULT_INDEX).toBe("https://pypi.corp/simple/");
    expect(env.PIP_INDEX_URL).toBe("https://pypi.corp/simple/");
  });

  it("maps python and playwright mirrors", () => {
    const env = buildCorporateEnv(base);
    expect(env.UV_PYTHON_INSTALL_MIRROR).toBe("https://pymirror.corp/python");
    expect(env.PLAYWRIGHT_DOWNLOAD_HOST).toBe("https://pw.corp");
  });

  it("omits fields that are blank or not valid URLs", () => {
    const env = buildCorporateEnv({
      ...base,
      httpsProxy: "not a url",
      pypiIndexUrl: "",
      pythonInstallMirror: "ftp://nope",
    });
    expect(env.HTTPS_PROXY).toBeUndefined();
    expect(env.UV_INDEX_URL).toBeUndefined();
    expect(env.UV_PYTHON_INSTALL_MIRROR).toBeUndefined();
    // noProxy is a list, not a URL — still passes through when proxy invalid?
    // noProxy only emitted alongside a valid proxy:
    expect(env.NO_PROXY).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/corporate-net.test.ts`
Expected: FAIL — `buildCorporateEnv` is not exported.

- [ ] **Step 3: Add implementation to `corporate-net.ts`**

```ts
export function buildCorporateEnv(
  cfg: CorporateNetworkConfig,
): Record<string, string> {
  const env: Record<string, string> = {};
  if (!cfg.enabled) return env;

  if (isValidHttpUrl(cfg.httpsProxy)) {
    const p = cfg.httpsProxy.trim();
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/corporate-net.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/corporate-net.ts tests/corporate-net.test.ts
git commit -m "feat(install): map corporate-net config to subprocess env vars"
```

---

## Task 3: `writeTempGitConfig` — github.com → mirror rewrite

**Files:**
- Modify: `src/main/corporate-net.ts`
- Test: `tests/corporate-net.test.ts`

- [ ] **Step 1: Write the failing test (append)**

```ts
import { readFileSync, existsSync } from "fs";
import { writeTempGitConfig } from "../src/main/corporate-net";

describe("writeTempGitConfig", () => {
  it("returns null when disabled or no git mirror set", () => {
    expect(writeTempGitConfig({ ...base, enabled: false })).toBeNull();
    expect(writeTempGitConfig({ ...base, gitMirrorBase: "" })).toBeNull();
    expect(writeTempGitConfig({ ...base, gitMirrorBase: "not a url" })).toBeNull();
  });

  it("writes an insteadOf rewrite and returns the file path", () => {
    const path = writeTempGitConfig(base);
    expect(path).not.toBeNull();
    expect(existsSync(path as string)).toBe(true);
    const content = readFileSync(path as string, "utf-8");
    expect(content).toContain('[url "https://gitmirror.corp/"]');
    expect(content).toContain("insteadOf = https://github.com/");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/corporate-net.test.ts -t writeTempGitConfig`
Expected: FAIL — `writeTempGitConfig` is not exported.

- [ ] **Step 3: Add implementation to `corporate-net.ts`**

```ts
// Returns a path to a temp gitconfig that rewrites github.com to the mirror,
// or null when no git mirror is configured. The caller injects this path via
// GIT_CONFIG_GLOBAL for the install subprocess only, so the user's real
// global gitconfig is never modified. The caller is responsible for deleting
// the file (and its temp dir) after the install finishes.
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

// Best-effort cleanup of a temp gitconfig created by writeTempGitConfig.
export function removeTempGitConfig(path: string | null): void {
  if (!path) return;
  try {
    rmSync(join(path, ".."), { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/corporate-net.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/corporate-net.ts tests/corporate-net.test.ts
git commit -m "feat(install): add temp GIT_CONFIG_GLOBAL github->mirror rewrite"
```

---

## Task 4: `preflight.ts` — target list

**Files:**
- Create: `src/main/preflight.ts`
- Test: `tests/preflight.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/preflight.test.ts
import { describe, expect, it } from "vitest";
import { getPreflightTargets } from "../src/main/preflight";
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/preflight.test.ts`
Expected: FAIL — cannot find module `../src/main/preflight`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/main/preflight.ts
import { ProxyAgent } from "undici";
import {
  type CorporateNetworkConfig,
  isValidHttpUrl,
} from "./corporate-net";

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
    { id: "uv", label: "uv installer (astral.sh)", url: "https://astral.sh/uv/install.ps1" },
    { id: "github", label: "Hermes repo & Python builds (github.com)", url: "https://github.com/NousResearch/hermes-agent" },
    { id: "playwright", label: "Playwright browser CDN", url: "https://cdn.playwright.dev/" },
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/preflight.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/preflight.ts tests/preflight.test.ts
git commit -m "feat(install): add preflight target list for corporate-net"
```

---

## Task 5: `runPreflight` — proxy-aware probes

**Files:**
- Modify: `src/main/preflight.ts`
- Test: `tests/preflight.test.ts`

- [ ] **Step 1: Write the failing test (append)**

The probe takes an injectable `fetchImpl` so the test can stub network calls without real I/O.

```ts
import { runPreflight } from "../src/main/preflight";

describe("runPreflight", () => {
  it("marks a target ok on a 2xx/3xx response", async () => {
    const fetchImpl = async () =>
      ({ ok: true, status: 200 }) as unknown as Response;
    const results = await runPreflight(
      { ...EMPTY_CORPORATE_NETWORK_CONFIG },
      { fetchImpl },
    );
    expect(results.length).toBeGreaterThanOrEqual(3);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results[0]).toHaveProperty("host");
  });

  it("marks a target blocked when fetch rejects", async () => {
    const fetchImpl = async () => {
      throw new Error("ETIMEDOUT");
    };
    const results = await runPreflight(
      { ...EMPTY_CORPORATE_NETWORK_CONFIG },
      { fetchImpl },
    );
    expect(results.every((r) => !r.ok)).toBe(true);
    expect(results[0].hint).toContain("ETIMEDOUT");
  });

  it("treats a 4xx as reachable (endpoint answered)", async () => {
    const fetchImpl = async () =>
      ({ ok: false, status: 403 }) as unknown as Response;
    const results = await runPreflight(
      { ...EMPTY_CORPORATE_NETWORK_CONFIG },
      { fetchImpl },
    );
    // A 403 means the host is reachable; only network failures count as blocked.
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results[0].status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/preflight.test.ts -t runPreflight`
Expected: FAIL — `runPreflight` is not exported.

- [ ] **Step 3: Add implementation to `preflight.ts`**

```ts
type FetchImpl = (
  url: string,
  init: { method: string; signal: AbortSignal; dispatcher?: ProxyAgent },
) => Promise<{ ok: boolean; status: number }>;

export interface RunPreflightOptions {
  fetchImpl?: FetchImpl;
  timeoutMs?: number;
}

export async function runPreflight(
  cfg: CorporateNetworkConfig,
  opts: RunPreflightOptions = {},
): Promise<PreflightResult[]> {
  const fetchImpl = (opts.fetchImpl ??
    (globalThis.fetch as unknown as FetchImpl)) as FetchImpl;
  const timeoutMs = opts.timeoutMs ?? 5000;
  const dispatcher =
    cfg.enabled && isValidHttpUrl(cfg.httpsProxy)
      ? new ProxyAgent(cfg.httpsProxy.trim())
      : undefined;

  const targets = getPreflightTargets(cfg);
  return Promise.all(
    targets.map(async (t) => {
      const host = (() => {
        try {
          return new URL(t.url).host;
        } catch {
          return t.url;
        }
      })();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const resp = await fetchImpl(t.url, {
          method: "HEAD",
          signal: controller.signal,
          dispatcher,
        });
        // Any HTTP response (even 4xx/5xx) proves the host is reachable.
        // Only a thrown error (DNS/timeout/refused) means blocked.
        return {
          id: t.id,
          label: t.label,
          host,
          ok: true,
          status: resp.status,
        };
      } catch (err) {
        return {
          id: t.id,
          label: t.label,
          host,
          ok: false,
          hint: (err as Error).message,
        };
      } finally {
        clearTimeout(timer);
      }
    }),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/preflight.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/preflight.ts tests/preflight.test.ts
git commit -m "feat(install): add proxy-aware preflight connectivity probes"
```

---

## Task 6: Bundled-script resolver in `installer.ts`

**Files:**
- Modify: `src/main/installer.ts` (add helper near top, after imports)
- Test: `tests/corporate-net.test.ts` is unaffected; add a focused unit test in a new describe block in `tests/installer-utils.test.ts` is NOT required — instead test via the resolver's exported function.

Add an exported helper and test it directly.

- [ ] **Step 1: Write the failing test**

```ts
// tests/installer-bundled-script.test.ts
import { describe, expect, it } from "vitest";
import { resolveBundledScript } from "../src/main/installer";

describe("resolveBundledScript", () => {
  it("returns null for a script that is not vendored", () => {
    // A name that will never exist in resources/.
    expect(resolveBundledScript("definitely-missing-xyz.sh")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/installer-bundled-script.test.ts`
Expected: FAIL — `resolveBundledScript` is not exported.

- [ ] **Step 3: Add implementation to `installer.ts`**

Add near the other path helpers (after `getEnhancedPath`, around line 200). Import `app` from electron is already used elsewhere; if not, use `process.resourcesPath`.

```ts
// Locate a vendored install script bundled under resources/. In production
// these live next to the app (process.resourcesPath/resources); in dev they
// live in the repo's resources/ folder. Returns the absolute path if present,
// or null so callers fall back to downloading from raw.githubusercontent.com.
export function resolveBundledScript(name: string): string | null {
  const candidates = [
    join(process.resourcesPath ?? "", "resources", name),
    join(process.resourcesPath ?? "", name),
    join(__dirname, "..", "..", "resources", name),
    join(process.cwd(), "resources", name),
  ];
  for (const c of candidates) {
    try {
      if (c && existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return null;
}
```

Confirm `join` and `existsSync` are already imported at the top of `installer.ts` (they are — used throughout). If `process.resourcesPath` typing complains under the node tsconfig, it is a standard Electron-augmented global; cast via `(process as NodeJS.Process & { resourcesPath?: string }).resourcesPath` if `npm run typecheck` flags it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/installer-bundled-script.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/installer.ts tests/installer-bundled-script.test.ts
git commit -m "feat(install): add bundled install-script resolver"
```

---

## Task 7: Wire corporate env + bundled script into `runInstall` (bash)

**Files:**
- Modify: `src/main/installer.ts` (`runInstall`, lines ~932-997)

No new unit test — covered by typecheck/build and existing installer tests. Verify existing tests still pass after.

- [ ] **Step 1: Add imports at top of `installer.ts`**

```ts
import {
  getCorporateNetworkConfig,
  buildCorporateEnv,
  writeTempGitConfig,
  removeTempGitConfig,
} from "./corporate-net";
```

- [ ] **Step 2: In `runInstall`, before building `installCmd`, compute corporate settings**

Insert just inside the `new Promise` executor, before `const shellProfile`:

```ts
      const corpCfg = getCorporateNetworkConfig();
      const corpEnv = buildCorporateEnv(corpCfg);
      const tempGitConfig = writeTempGitConfig(corpCfg);
```

Prefer the bundled script. Replace the `installCmd` construction:

```ts
      const bundled = resolveBundledScript("install.sh");
      const scriptInvocation = bundled
        ? `bash "${bundled}" --skip-setup`
        : "curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash -s -- --skip-setup";
      const installCmd = [
        shellProfile ? `source "${shellProfile}" 2>/dev/null;` : "",
        scriptInvocation,
      ].join(" ");
```

- [ ] **Step 3: Merge `corpEnv` and `GIT_CONFIG_GLOBAL` into the spawn env**

Change the `env:` object in the `spawn("bash", ...)` call to:

```ts
        env: {
          ...process.env,
          PATH: askpass ? `${askpass.pathPrepend}:${basePath}` : basePath,
          HOME: home,
          TERM: "dumb",
          ...(askpass?.env ?? {}),
          ...corpEnv,
          ...(tempGitConfig ? { GIT_CONFIG_GLOBAL: tempGitConfig } : {}),
        },
```

- [ ] **Step 4: Clean up the temp gitconfig in the `finally` block**

In the existing `finally { askpass?.cleanup(); sudoPrecache.stop(); }`, the `tempGitConfig` is scoped inside the Promise executor, so lift it: declare `let tempGitConfig: string | null = null;` just before `return await new Promise(...)`, assign inside, and add to finally:

```ts
  } finally {
    askpass?.cleanup();
    sudoPrecache.stop();
    removeTempGitConfig(tempGitConfig);
  }
```

(Adjust: move the `const corpCfg/corpEnv/tempGitConfig` lines out to before the Promise so `tempGitConfig` is visible in `finally`; keep `corpEnv` there too.)

- [ ] **Step 5: Verify build + existing tests**

Run: `npm run typecheck && npx vitest run tests/installer-platform.test.ts tests/installer-target.test.ts tests/installer-utils.test.ts`
Expected: PASS (typecheck clean; installer tests unaffected).

- [ ] **Step 6: Commit**

```bash
git add src/main/installer.ts
git commit -m "feat(install): route bash install through corporate proxy/mirror env"
```

---

## Task 8: Wire corporate env + bundled script into `runInstallWindows`

**Files:**
- Modify: `src/main/installer.ts` (`runInstallWindows`, lines ~1024-1147)

- [ ] **Step 1: Compute corporate settings at the top of `runInstallWindows`**

After `const installDir = HERMES_REPO;`:

```ts
  const corpCfg = getCorporateNetworkConfig();
  const corpEnv = buildCorporateEnv(corpCfg);
  const tempGitConfig = writeTempGitConfig(corpCfg);
```

- [ ] **Step 2: Prefer the bundled `install.ps1`**

Replace the wrapper script's download section. When a bundled script exists, run it directly instead of `Invoke-WebRequest`:

```ts
  const bundledPs1 = resolveBundledScript("install.ps1");
  const invokeLine = bundledPs1
    ? `& ${psQuote(bundledPs1)} -SkipSetup -HermesHome ${psQuote(hermesHome)} -InstallDir ${psQuote(installDir)}`
    : [
        "$url = 'https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.ps1'",
        `$installer = Join-Path $env:TEMP ("hermes-install-script-" + [guid]::NewGuid().ToString() + ".ps1")`,
        "$resp = Invoke-WebRequest -Uri $url -UseBasicParsing",
        "$text = if ($resp.Content -is [byte[]]) { [System.Text.Encoding]::UTF8.GetString($resp.Content) } else { [string]$resp.Content }",
        "if ($text.Length -gt 0 -and $text[0] -eq [char]0xFEFF) { $text = $text.Substring(1) }",
        "[System.IO.File]::WriteAllText($installer, $text, (New-Object System.Text.UTF8Encoding $true))",
        `& $installer -SkipSetup -HermesHome ${psQuote(hermesHome)} -InstallDir ${psQuote(installDir)}`,
        "$exit = $LASTEXITCODE",
        "Remove-Item -Force -ErrorAction SilentlyContinue $installer",
        "exit $exit",
      ].join("\r\n");
```

Then build `wrapperScript` from the common prefix + `invokeLine`. When bundled, append `$exit = $LASTEXITCODE` / `exit $exit` after the `&` line:

```ts
  const wrapperScript = [
    "$ErrorActionPreference = 'Stop'",
    "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}",
    invokeLine,
    ...(bundledPs1 ? ["$exit = $LASTEXITCODE", "exit $exit"] : []),
    "",
  ].join("\r\n");
```

- [ ] **Step 3: Merge `corpEnv` + `GIT_CONFIG_GLOBAL` into the spawn env**

Change the `env:` in the `spawn(psExe, ...)` call:

```ts
        env: {
          ...process.env,
          PATH: basePath,
          HERMES_HOME: hermesHome,
          NO_COLOR: "1",
          ...corpEnv,
          ...(tempGitConfig ? { GIT_CONFIG_GLOBAL: tempGitConfig } : {}),
        },
```

- [ ] **Step 4: Remove the temp gitconfig on close/error**

In both `proc.on("close", ...)` and `proc.on("error", ...)`, after the existing `unlinkSync(wrapperPath)` best-effort blocks, add:

```ts
      removeTempGitConfig(tempGitConfig);
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/installer.ts
git commit -m "feat(install): route Windows install through corporate proxy/mirror env"
```

---

## Task 9: IPC handlers in `index.ts`

**Files:**
- Modify: `src/main/index.ts` (imports + handlers near the install handlers, ~line 405)

- [ ] **Step 1: Add imports**

```ts
import {
  getCorporateNetworkConfig,
  setCorporateNetworkConfig,
  type CorporateNetworkConfig,
} from "./corporate-net";
import { runPreflight } from "./preflight";
```

- [ ] **Step 2: Register handlers** (after the `adopt-hermes-home` handler)

```ts
  ipcMain.handle("get-corporate-net", () => getCorporateNetworkConfig());
  ipcMain.handle(
    "set-corporate-net",
    (_event, cfg: CorporateNetworkConfig) => {
      setCorporateNetworkConfig(cfg);
      return true;
    },
  );
  ipcMain.handle("run-preflight", (_event, cfg: CorporateNetworkConfig) =>
    runPreflight(cfg),
  );
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(install): add IPC for corporate-net config and preflight"
```

---

## Task 10: Preload surface

**Files:**
- Modify: `src/preload/index.ts`, `src/preload/index.d.ts`
- Test: `tests/preload-api-surface.test.ts` (already verifies preload ↔ type parity — must stay in sync)

- [ ] **Step 1: Add to `src/preload/index.ts`** (inside `hermesAPI`, near `adoptHermesHome`)

Note: preload cannot import from `src/main`, so the config type is structural. Define it inline.

```ts
  getCorporateNetwork: (): Promise<{
    enabled: boolean;
    httpsProxy: string;
    noProxy: string;
    pypiIndexUrl: string;
    gitMirrorBase: string;
    pythonInstallMirror: string;
    playwrightDownloadHost: string;
  }> => ipcRenderer.invoke("get-corporate-net"),

  setCorporateNetwork: (cfg: {
    enabled: boolean;
    httpsProxy: string;
    noProxy: string;
    pypiIndexUrl: string;
    gitMirrorBase: string;
    pythonInstallMirror: string;
    playwrightDownloadHost: string;
  }): Promise<boolean> => ipcRenderer.invoke("set-corporate-net", cfg),

  runPreflight: (cfg: {
    enabled: boolean;
    httpsProxy: string;
    noProxy: string;
    pypiIndexUrl: string;
    gitMirrorBase: string;
    pythonInstallMirror: string;
    playwrightDownloadHost: string;
  }): Promise<
    Array<{
      id: string;
      label: string;
      host: string;
      ok: boolean;
      status?: number;
      hint?: string;
    }>
  > => ipcRenderer.invoke("run-preflight", cfg),
```

- [ ] **Step 2: Add matching declarations to `src/preload/index.d.ts`**

First add shared interfaces above `interface HermesAPI`:

```ts
interface CorporateNetworkConfig {
  enabled: boolean;
  httpsProxy: string;
  noProxy: string;
  pypiIndexUrl: string;
  gitMirrorBase: string;
  pythonInstallMirror: string;
  playwrightDownloadHost: string;
}

interface PreflightResult {
  id: string;
  label: string;
  host: string;
  ok: boolean;
  status?: number;
  hint?: string;
}
```

Then inside `interface HermesAPI` (near `adoptHermesHome`):

```ts
  getCorporateNetwork: () => Promise<CorporateNetworkConfig>;
  setCorporateNetwork: (cfg: CorporateNetworkConfig) => Promise<boolean>;
  runPreflight: (cfg: CorporateNetworkConfig) => Promise<PreflightResult[]>;
```

- [ ] **Step 3: Run the surface-parity test**

Run: `npx vitest run tests/preload-api-surface.test.ts`
Expected: PASS (preload methods and type methods match).

- [ ] **Step 4: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/preload/index.ts src/preload/index.d.ts
git commit -m "feat(install): expose corporate-net + preflight on preload surface"
```

---

## Task 11: i18n keys

**Files:**
- Modify: `src/shared/i18n/locales/en/install.ts`, `src/shared/i18n/locales/ko/install.ts`

- [ ] **Step 1: Add a `corp` block to `en/install.ts`** (inside the exported object)

```ts
  corp: {
    sectionTitle: "Corporate network / proxy",
    sectionHint:
      "For installs behind a company mirror or proxy. Leave blank for normal internet.",
    proxyLabel: "HTTPS proxy URL",
    noProxyLabel: "No-proxy hosts (comma separated)",
    pypiLabel: "Internal PyPI index URL",
    gitMirrorLabel: "Git mirror base (replaces github.com)",
    pythonMirrorLabel: "Python build mirror URL",
    enableLabel: "Use these settings for installation",
    diagnose: "Test connection",
    diagnosing: "Testing…",
    reachable: "Reachable",
    blocked: "Blocked",
    invalidUrl: "Enter a valid http(s) URL.",
  },
```

- [ ] **Step 2: Add the same block translated to `ko/install.ts`**

```ts
  corp: {
    sectionTitle: "사내망 / 프록시",
    sectionHint:
      "사내 미러나 프록시 뒤에서 설치할 때 사용합니다. 일반 인터넷이면 비워 두세요.",
    proxyLabel: "HTTPS 프록시 URL",
    noProxyLabel: "프록시 제외 호스트(콤마 구분)",
    pypiLabel: "사내 PyPI 인덱스 URL",
    gitMirrorLabel: "Git 미러 베이스(github.com 대체)",
    pythonMirrorLabel: "Python 빌드 미러 URL",
    enableLabel: "설치에 이 설정 사용",
    diagnose: "연결 진단",
    diagnosing: "진단 중…",
    reachable: "연결됨",
    blocked: "차단됨",
    invalidUrl: "올바른 http(s) URL을 입력하세요.",
  },
```

- [ ] **Step 3: Verify typecheck and i18n test**

Run: `npm run typecheck && npx vitest run src/shared/i18n/index.test.ts`
Expected: PASS. (Other locales fall back to en for `corp.*` — acceptable per spec scope.)

- [ ] **Step 4: Commit**

```bash
git add src/shared/i18n/locales/en/install.ts src/shared/i18n/locales/ko/install.ts
git commit -m "feat(install): add corporate-net i18n strings (en, ko)"
```

---

## Task 12: Install screen UI — settings panel + diagnostic

**Files:**
- Modify: `src/renderer/src/screens/Install/Install.tsx`
- Test: rendering test optional; verified manually + typecheck.

- [ ] **Step 1: Add state and load existing config**

Inside the `Install` component, after the existing `useState` calls, add:

```tsx
  type CorpCfg = {
    enabled: boolean;
    httpsProxy: string;
    noProxy: string;
    pypiIndexUrl: string;
    gitMirrorBase: string;
    pythonInstallMirror: string;
    playwrightDownloadHost: string;
  };
  type Probe = {
    id: string;
    label: string;
    host: string;
    ok: boolean;
    status?: number;
    hint?: string;
  };
  const [corp, setCorp] = useState<CorpCfg>({
    enabled: false,
    httpsProxy: "",
    noProxy: "",
    pypiIndexUrl: "",
    gitMirrorBase: "",
    pythonInstallMirror: "",
    playwrightDownloadHost: "",
  });
  const [showCorp, setShowCorp] = useState(false);
  const [probes, setProbes] = useState<Probe[] | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);

  useEffect(() => {
    let mounted = true;
    window.hermesAPI.getCorporateNetwork().then((c) => {
      if (mounted) setCorp(c);
    });
    return () => {
      mounted = false;
    };
  }, []);

  function updateCorp(patch: Partial<CorpCfg>): void {
    setCorp((prev) => {
      const next = { ...prev, ...patch };
      window.hermesAPI.setCorporateNetwork(next);
      return next;
    });
  }

  async function handleDiagnose(): Promise<void> {
    setDiagnosing(true);
    try {
      const results = await window.hermesAPI.runPreflight(corp);
      setProbes(results);
    } finally {
      setDiagnosing(false);
    }
  }
```

- [ ] **Step 2: Render the panel inside the `phase === "confirm"` block**

Insert before the closing `</div>` of `install-confirm` (after `install-confirm-hint`/error, before `</div>`):

```tsx
          <div className="install-corp">
            <button
              type="button"
              className="install-corp-toggle"
              onClick={() => setShowCorp((v) => !v)}
            >
              {t("install.corp.sectionTitle")}
            </button>
            {showCorp && (
              <div className="install-corp-body">
                <p className="install-corp-hint">
                  {t("install.corp.sectionHint")}
                </p>
                <label className="install-corp-check">
                  <input
                    type="checkbox"
                    checked={corp.enabled}
                    onChange={(e) =>
                      updateCorp({ enabled: e.target.checked })
                    }
                  />
                  {t("install.corp.enableLabel")}
                </label>
                <label>{t("install.corp.proxyLabel")}
                  <input
                    type="text"
                    value={corp.httpsProxy}
                    placeholder="http://proxy.corp:8080"
                    onChange={(e) =>
                      updateCorp({ httpsProxy: e.target.value })
                    }
                  />
                </label>
                <label>{t("install.corp.noProxyLabel")}
                  <input
                    type="text"
                    value={corp.noProxy}
                    placeholder="localhost,.corp"
                    onChange={(e) => updateCorp({ noProxy: e.target.value })}
                  />
                </label>
                <label>{t("install.corp.pypiLabel")}
                  <input
                    type="text"
                    value={corp.pypiIndexUrl}
                    placeholder="https://pypi.corp/simple/"
                    onChange={(e) =>
                      updateCorp({ pypiIndexUrl: e.target.value })
                    }
                  />
                </label>
                <label>{t("install.corp.gitMirrorLabel")}
                  <input
                    type="text"
                    value={corp.gitMirrorBase}
                    placeholder="https://gitmirror.corp/"
                    onChange={(e) =>
                      updateCorp({ gitMirrorBase: e.target.value })
                    }
                  />
                </label>
                <label>{t("install.corp.pythonMirrorLabel")}
                  <input
                    type="text"
                    value={corp.pythonInstallMirror}
                    placeholder="https://pymirror.corp/python"
                    onChange={(e) =>
                      updateCorp({ pythonInstallMirror: e.target.value })
                    }
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleDiagnose}
                  disabled={diagnosing}
                >
                  {diagnosing
                    ? t("install.corp.diagnosing")
                    : t("install.corp.diagnose")}
                </button>
                {probes && (
                  <ul className="install-corp-probes">
                    {probes.map((p) => (
                      <li
                        key={p.id}
                        className={
                          p.ok ? "probe-ok" : "probe-blocked"
                        }
                      >
                        {p.ok ? "✅" : "❌"} {p.label} ({p.host})
                        {p.ok
                          ? ` — ${t("install.corp.reachable")}`
                          : ` — ${t("install.corp.blocked")}${
                              p.hint ? `: ${p.hint}` : ""
                            }`}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
```

- [ ] **Step 3: Verify typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/screens/Install/Install.tsx
git commit -m "feat(install): add corporate-net settings panel and diagnostic to Install screen"
```

---

## Task 13: Vendoring helper for install scripts

**Files:**
- Create: `scripts/vendor-install-scripts.mjs`

This lets an operator (or CI on an internet-connected machine) drop the upstream scripts into `resources/` so offline installs use the bundled copy.

- [ ] **Step 1: Write the script**

```js
// scripts/vendor-install-scripts.mjs
// Downloads upstream install scripts into resources/ so the desktop app can
// run them offline (when raw.githubusercontent.com is blocked). Run on an
// internet-connected machine before packaging:  node scripts/vendor-install-scripts.mjs
import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  ["install.sh", "https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh"],
  ["install.ps1", "https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.ps1"],
];

await mkdir(join(ROOT, "resources"), { recursive: true });
for (const [name, url] of FILES) {
  const resp = await fetch(url);
  if (!resp.ok) {
    console.error(`Failed to fetch ${url}: ${resp.status}`);
    process.exitCode = 1;
    continue;
  }
  const text = await resp.text();
  await writeFile(join(ROOT, "resources", name), text, "utf-8");
  console.log(`Vendored ${name} (${text.length} bytes)`);
}
```

- [ ] **Step 2: Verify it runs (only when online; otherwise skip)**

Run: `node scripts/vendor-install-scripts.mjs`
Expected (online): "Vendored install.sh ..." / "Vendored install.ps1 ...". If offline, it errors — that is fine; the runtime loader falls back to download and IT can vendor later.

- [ ] **Step 3: Commit (script only — do NOT commit the downloaded scripts if their license/size is a concern; decide per repo policy)**

```bash
git add scripts/vendor-install-scripts.mjs
git commit -m "chore(install): add helper to vendor upstream install scripts into resources/"
```

---

## Task 14: Full verification gate

**Files:** none (verification only)

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 2: Typecheck (node + web)**

Run: `npm run typecheck`
Expected: both projects pass.

- [ ] **Step 3: Tests**

Run: `npm run test`
Expected: all pass, including `corporate-net`, `preflight`, `installer-bundled-script`, `preload-api-surface`.

- [ ] **Step 4: Build (preload surface changed)**

Run: `npm run build`
Expected: electron-vite build succeeds.

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "test(install): verification gate for corporate-net install support"
```

---

## Self-Review Notes

- **Spec coverage:** §3.1 corporate-net.ts → Tasks 1-3; §3.2 installer changes → Tasks 6-8; §3.3 preflight → Tasks 4-5; §3.4 IPC → Task 9; §3.5 UI → Tasks 10-12; bundled-script loader → Task 6; vendoring → Task 13; verification gate §8 → Task 14. i18n covered in Task 11.
- **Type consistency:** `CorporateNetworkConfig` fields are identical across `corporate-net.ts`, preload `index.ts`/`index.d.ts`, and `Install.tsx` `CorpCfg`. `PreflightResult` fields (`id,label,host,ok,status?,hint?`) match across `preflight.ts`, preload, and UI `Probe`.
- **Reachability semantics:** preflight treats any HTTP response (incl. 4xx/5xx) as reachable; only thrown network errors are "blocked". Tested in Task 5.
- **Cleanup:** temp `GIT_CONFIG_GLOBAL` removed in `finally` (bash) and on close/error (Windows) — Tasks 7-8.
- **Scope:** Settings-screen post-edit, full offline bundle, and non-en/ko locales are intentionally out of scope per spec §7.
