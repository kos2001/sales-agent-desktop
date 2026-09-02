# Version Upgrade Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a skippable "version upgrade check" as the first onboarding gate that surfaces available upgrades for the Hermes agent engine (vs GitHub latest release tag) and Hermes Desktop (vs electron-updater) before the user reaches welcome/setup/main.

**Architecture:** A dependency-light main-process module `src/main/version-check.ts` holds pure version-parsing/comparison helpers plus a release fetcher (direct `fetch`, or an HTTP CONNECT tunnel when a corporate proxy is configured — same approach as `preflight.ts`, no new dependency). A new IPC `check-version-status` assembles engine + desktop status. The renderer bootstrap probe (`routes/index.tsx`) calls it first; if either component has an update, it routes to a new skippable `version-check` screen, otherwise the existing flow is unchanged. Network failure/timeout always degrades to "no update" so onboarding is never blocked.

**Tech Stack:** Electron main (Node), TypeScript strict, vitest, React 19 + TanStack file routes, i18next.

**Spec:** `docs/superpowers/specs/2026-06-15-version-upgrade-check-design.md`

---

## File Structure

- **Create** `src/main/version-check.ts` — version parsing, comparison, GitHub release fetch (engine logic only; no electron import). Exports `ComponentVersion`, `VersionStatus` types.
- **Create** `tests/version-check.test.ts` — unit tests for the pure helpers + injected fetcher.
- **Create** `src/shared/i18n/locales/en/versionCheck.ts` and `.../ko/versionCheck.ts` — UI strings.
- **Create** `src/renderer/src/screens/VersionCheck/VersionCheck.tsx` — the screen.
- **Create** `src/renderer/src/screens/VersionCheck/VersionCheck.test.tsx` — render test.
- **Create** `src/renderer/src/routes/version-check.tsx` — the file route.
- **Modify** `src/main/index.ts` — register `check-version-status` IPC (assembles engine via version-check + desktop via `app.getVersion()` + autoUpdater).
- **Modify** `src/preload/index.ts` — `checkVersionStatus` binding.
- **Modify** `src/preload/index.d.ts` — `VersionStatus`/`ComponentVersion` types + `checkVersionStatus` signature.
- **Modify** `src/shared/i18n/index.ts` — import + register the `versionCheck` namespace for `en` and `ko`.
- **Modify** `src/renderer/src/routes/index.tsx` — add `"version-check"` to `BootstrapResult.next`, call `checkVersionStatus()`, route when an update exists.

---

## Task 1: Pure version helpers + types in `version-check.ts`

**Files:**
- Create: `src/main/version-check.ts`
- Test: `tests/version-check.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/version-check.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  parseEngineVersion,
  compareCalVer,
  isEngineUpdateAvailable,
  isDesktopUpdateAvailable,
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/version-check.test.ts`
Expected: FAIL — cannot resolve `../src/main/version-check` / functions not exported.

- [ ] **Step 3: Write minimal implementation**

Create `src/main/version-check.ts`:

```ts
// Version reconciliation for the onboarding "upgrade check" gate. Pure
// helpers here have no electron/installer dependency so they unit-test under
// vitest's node pool. Network + assembly live in the check-version-status IPC
// handler (src/main/index.ts).

export interface ComponentVersion {
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
  const calver = text.match(/\((\d+(?:\.\d+)+)\)/)?.[1] ?? null;
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
 *  Returns <0 if a<b, 0 if equal, >0 if a>b. */
export function compareCalVer(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
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

/** Desktop update available when a different latest version is known.
 *  electron-updater only reports a version when an update exists. */
export function isDesktopUpdateAvailable(
  current: string | null,
  latest: string | null,
): boolean {
  return latest != null && current != null && latest !== current;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/version-check.test.ts`
Expected: PASS (all cases in Task 1).

- [ ] **Step 5: Commit**

```bash
git add src/main/version-check.ts tests/version-check.test.ts
git commit -m "Add version-check pure helpers (parse + compare engine/desktop versions)"
```

---

## Task 2: GitHub release fetcher with injection + proxy fallback

**Files:**
- Modify: `src/main/version-check.ts`
- Test: `tests/version-check.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/version-check.test.ts`:

```ts
import { parseReleaseTag, fetchLatestEngineRelease } from "../src/main/version-check";

describe("parseReleaseTag", () => {
  it("reads tag_name from a releases/latest payload", () => {
    expect(parseReleaseTag({ tag_name: "v2026.6.5" })).toBe("v2026.6.5");
  });
  it("returns null for missing/garbage payload", () => {
    expect(parseReleaseTag({})).toBeNull();
    expect(parseReleaseTag(null)).toBeNull();
    expect(parseReleaseTag("nope")).toBeNull();
  });
});

describe("fetchLatestEngineRelease", () => {
  it("returns the tag from an injected successful fetcher", async () => {
    const tag = await fetchLatestEngineRelease({
      getJson: async () => ({ tag_name: "v2026.6.5" }),
    });
    expect(tag).toBe("v2026.6.5");
  });

  it("returns null when the injected fetcher throws (network/timeout)", async () => {
    const tag = await fetchLatestEngineRelease({
      getJson: async () => {
        throw new Error("ENOTFOUND");
      },
    });
    expect(tag).toBeNull();
  });

  it("returns null when the payload has no tag", async () => {
    const tag = await fetchLatestEngineRelease({ getJson: async () => ({}) });
    expect(tag).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/version-check.test.ts`
Expected: FAIL — `parseReleaseTag` / `fetchLatestEngineRelease` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/main/version-check.ts`:

```ts
import { request as httpsRequest } from "https";
import { request as httpRequest } from "http";
import { getCorporateNetworkConfig, isValidHttpUrl } from "./corporate-net";

const ENGINE_RELEASE_URL =
  "https://api.github.com/repos/NousResearch/hermes-agent/releases/latest";
const FETCH_TIMEOUT_MS = 3000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h

let _cachedTag: string | null = null;
let _cachedAt = 0;

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

/** Latest engine release tag, or null on any failure. Cached for 1h. */
export async function fetchLatestEngineRelease(
  opts: ReleaseFetchOptions = {},
): Promise<string | null> {
  if (!opts.bypassCache && _cachedTag && Date.now() - _cachedAt < CACHE_TTL_MS) {
    return _cachedTag;
  }
  const getJson = opts.getJson ?? defaultGetJson;
  try {
    const payload = await getJson(ENGINE_RELEASE_URL, FETCH_TIMEOUT_MS);
    const tag = parseReleaseTag(payload);
    if (tag) {
      _cachedTag = tag;
      _cachedAt = Date.now();
    }
    return tag;
  } catch {
    return null; // network/timeout/proxy failure → "no update", never blocks
  }
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
    const connectReq = httpRequest({
      host: proxy.hostname,
      port: proxy.port || 80,
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
      const getReq = httpsRequest(
        {
          host: target.hostname,
          servername: target.hostname,
          port: Number(port),
          path: target.pathname + target.search,
          method: "GET",
          socket,
          agent: false,
          timeout: timeoutMs,
          headers: {
            Host: target.hostname,
            "User-Agent": "hermes-desktop",
            Accept: "application/json",
            Connection: "close",
          },
        },
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
        },
      );
      getReq.on("timeout", () => getReq.destroy(new Error("timeout")));
      getReq.on("error", reject);
      getReq.end();
    });
    connectReq.on("timeout", () => connectReq.destroy(new Error("timeout")));
    connectReq.on("error", reject);
    connectReq.end();
  });
}
```

> Note: the real `defaultGetJson`/`getJsonViaProxy` socket path is not unit-tested (like preflight's real `probeImpl`); tests cover the injected `getJson` seam + parsing.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/version-check.test.ts`
Expected: PASS (all Task 1 + Task 2 cases).

- [ ] **Step 5: Commit**

```bash
git add src/main/version-check.ts tests/version-check.test.ts
git commit -m "Add proxy-aware GitHub release fetcher with cache + injection seam"
```

---

## Task 3: `check-version-status` IPC handler + preload + types

**Files:**
- Modify: `src/main/index.ts` (add handler near the other version handlers, after `run-hermes-update` at line ~485)
- Modify: `src/preload/index.ts` (after `runHermesVersion`/`refreshHermesVersion` bindings, ~line 114)
- Modify: `src/preload/index.d.ts` (types + signature)

- [ ] **Step 1: Add the type to `src/preload/index.d.ts`**

Add these interfaces near the other shared types (e.g. just after the `InstallStatus`/`InstallProgress` interfaces around line 23):

```ts
interface ComponentVersion {
  current: string | null;
  latest: string | null;
  updateAvailable: boolean;
}
interface VersionStatus {
  engine: ComponentVersion;
  desktop: ComponentVersion;
}
```

Add to the `HermesAPI` interface (near `refreshHermesVersion`, ~line 159):

```ts
  checkVersionStatus: () => Promise<VersionStatus>;
```

- [ ] **Step 2: Add the preload binding in `src/preload/index.ts`**

After the `refreshHermesVersion` binding (~line 114):

```ts
  checkVersionStatus: (): Promise<import("./index.d").VersionStatus> =>
    ipcRenderer.invoke("check-version-status"),
```

> If the file already imports types differently, match it — the existing `runHermesUpdate` binding (line 117) is the reference for return-type style; use a plain `Promise<unknown>`-free typed return consistent with neighbors. If inline `import("./index.d")` is not used elsewhere, instead type it as `Promise<VersionStatus>` and add `import type { VersionStatus } from "./index.d";` near the top imports.

- [ ] **Step 3: Add the IPC handler in `src/main/index.ts`**

Add imports near the top installer/version imports:

```ts
import {
  parseEngineVersion,
  isEngineUpdateAvailable,
  isDesktopUpdateAvailable,
  fetchLatestEngineRelease,
  type VersionStatus,
} from "./version-check";
```

Register the handler immediately after the `run-hermes-update` handler (after line ~485). The desktop side reuses the in-scope `autoUpdater` only when packaged; in dev/portable it degrades to "no update" (matching the existing `check-for-updates` behavior):

```ts
  ipcMain.handle("check-version-status", async (): Promise<VersionStatus> => {
    const conn = getConnectionConfig();
    const localMode = conn.mode === "local";

    // Engine: only meaningful for a local, installed engine.
    let engine = { current: null, latest: null, updateAvailable: false } as
      VersionStatus["engine"];
    if (localMode) {
      const [versionOutput, latestTag] = await Promise.all([
        getHermesVersion(),
        fetchLatestEngineRelease(),
      ]);
      const calver = parseEngineVersion(versionOutput).calver;
      engine = {
        current: versionOutput,
        latest: latestTag,
        updateAvailable: isEngineUpdateAvailable(calver, latestTag),
      };
    }

    // Desktop: app version vs electron-updater. checkForUpdates is only
    // wired up in packaged, non-portable builds; elsewhere latest stays null.
    const currentDesktop = app.getVersion();
    let latestDesktop: string | null = null;
    try {
      latestDesktop = (await ipcCheckForUpdates()) ?? null;
    } catch {
      latestDesktop = null;
    }
    const desktop = {
      current: currentDesktop,
      latest: latestDesktop,
      updateAvailable: isDesktopUpdateAvailable(currentDesktop, latestDesktop),
    };

    return { engine, desktop };
  });
```

Where `ipcCheckForUpdates()` reuses the existing updater. The simplest wiring: extract the body of the existing `check-for-updates` handler into a local async function `checkForUpdatesImpl()` returning `string | null` (both the dev/portable stub at line ~1710 and the packaged version at line ~1755 already return `string | null`), and call it from both the existing `check-for-updates` handler and here. If extraction is awkward because the updater is set up later in `setupAutoUpdater()`, instead have `check-version-status` invoke the channel indirectly is not possible main-to-main; so define a module-scoped `let checkForUpdatesImpl: () => Promise<string | null> = async () => null;` assigned inside the updater setup, and call `checkForUpdatesImpl()` here.

> Decision (make it explicit): add a module-scoped `let checkForUpdatesImpl: () => Promise<string | null> = async () => null;`. In the dev/portable branch leave it as-is (returns null). In the packaged branch, set `checkForUpdatesImpl = async () => { try { const r = await autoUpdater.checkForUpdates(); return r?.updateInfo?.version ?? null; } catch { return null; } };` and have the existing `check-for-updates` handler call it. Replace `ipcCheckForUpdates()` above with `checkForUpdatesImpl()`.

- [ ] **Step 4: Verify it compiles and tests still pass**

Run: `npm run typecheck && npx vitest run tests/version-check.test.ts`
Expected: typecheck passes (both projects); version-check tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts src/preload/index.ts src/preload/index.d.ts
git commit -m "Add check-version-status IPC assembling engine + desktop version status"
```

---

## Task 4: i18n `versionCheck` namespace (en + ko)

**Files:**
- Create: `src/shared/i18n/locales/en/versionCheck.ts`
- Create: `src/shared/i18n/locales/ko/versionCheck.ts`
- Modify: `src/shared/i18n/index.ts`

> Other locales fall back to `en` via i18next's `FALLBACK_LOCALE` (the `t` type is `(key: string) => string`, not key-checked, so missing namespaces don't break typecheck). Translating the remaining 7 locales is out of scope for this plan.

- [ ] **Step 1: Create the en namespace**

`src/shared/i18n/locales/en/versionCheck.ts`:

```ts
export default {
  title: "Check for updates",
  subtitle:
    "Before you continue, make sure your Hermes engine and desktop app are up to date.",
  componentColumn: "Component",
  currentColumn: "Installed",
  latestColumn: "Latest",
  statusColumn: "Status",
  engineName: "Hermes Agent engine",
  desktopName: "Hermes Desktop",
  upToDate: "Up to date",
  updateAvailable: "Update available",
  unknown: "Unknown",
  updateEngine: "Update engine",
  updatingEngine: "Updating engine…",
  downloadDesktop: "Download & install",
  downloadingDesktop: "Downloading…",
  restartToUpdate: "Restart to update",
  skip: "Skip and continue",
  recheck: "Check again",
  engineUpdateFailed: "Engine update failed",
} as const;
```

- [ ] **Step 2: Create the ko namespace**

`src/shared/i18n/locales/ko/versionCheck.ts`:

```ts
export default {
  title: "업데이트 확인",
  subtitle:
    "계속하기 전에 Hermes 엔진과 데스크톱 앱이 최신 상태인지 확인하세요.",
  componentColumn: "구성 요소",
  currentColumn: "설치됨",
  latestColumn: "최신",
  statusColumn: "상태",
  engineName: "Hermes Agent 엔진",
  desktopName: "Hermes Desktop",
  upToDate: "최신 상태",
  updateAvailable: "업데이트 가능",
  unknown: "알 수 없음",
  updateEngine: "엔진 업데이트",
  updatingEngine: "엔진 업데이트 중…",
  downloadDesktop: "다운로드 및 설치",
  downloadingDesktop: "다운로드 중…",
  restartToUpdate: "재시작하여 업데이트",
  skip: "건너뛰고 계속",
  recheck: "다시 확인",
  engineUpdateFailed: "엔진 업데이트 실패",
} as const;
```

- [ ] **Step 3: Register the namespace in `src/shared/i18n/index.ts`**

Add imports next to the other `en`/`ko` namespace imports:

```ts
import versionCheckEn from "./locales/en/versionCheck";
import versionCheckKo from "./locales/ko/versionCheck";
```

In `resources.en.translation` (after `kanban: kanbanEn,` ~line 216) add:

```ts
      versionCheck: versionCheckEn,
```

In `resources.ko.translation` (after `kanban: kanbanKo,` ~line 410) add:

```ts
      versionCheck: versionCheckKo,
```

- [ ] **Step 4: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS (both projects).

- [ ] **Step 5: Commit**

```bash
git add src/shared/i18n/locales/en/versionCheck.ts src/shared/i18n/locales/ko/versionCheck.ts src/shared/i18n/index.ts
git commit -m "Add versionCheck i18n namespace (en, ko)"
```

---

## Task 5: `VersionCheck` screen + route

**Files:**
- Create: `src/renderer/src/screens/VersionCheck/VersionCheck.tsx`
- Create: `src/renderer/src/screens/VersionCheck/VersionCheck.test.tsx`
- Create: `src/renderer/src/routes/version-check.tsx`

- [ ] **Step 1: Write the failing render test**

`src/renderer/src/screens/VersionCheck/VersionCheck.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "../../components/I18nProvider";
import VersionCheck from "./VersionCheck";

const status = {
  engine: { current: "Hermes Agent v0.16.0 (2026.5.29)", latest: "v2026.6.5", updateAvailable: true },
  desktop: { current: "0.4.5", latest: null, updateAvailable: false },
};

function renderScreen(onSkip = vi.fn()) {
  render(
    <I18nProvider>
      <VersionCheck status={status} onSkip={onSkip} onUpdated={vi.fn()} />
    </I18nProvider>,
  );
  return onSkip;
}

describe("VersionCheck", () => {
  it("shows both components and an engine update affordance", () => {
    renderScreen();
    expect(screen.getByText(/Hermes Agent engine/i)).toBeInTheDocument();
    expect(screen.getByText(/Hermes Desktop/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /update engine/i })).toBeInTheDocument();
  });

  it("fires onSkip when the user chooses to continue", () => {
    const onSkip = renderScreen();
    fireEvent.click(screen.getByRole("button", { name: /skip and continue/i }));
    expect(onSkip).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/screens/VersionCheck/VersionCheck.test.tsx`
Expected: FAIL — cannot resolve `./VersionCheck`.

- [ ] **Step 3: Write the screen**

`src/renderer/src/screens/VersionCheck/VersionCheck.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../hooks/useI18n";
import type { VersionStatus } from "../../../../preload/index.d";

interface Props {
  status: VersionStatus;
  onSkip: () => void;
  onUpdated: () => void; // re-run the check after an engine update completes
}

export default function VersionCheck({
  status,
  onSkip,
  onUpdated,
}: Props): React.JSX.Element {
  const { t } = useI18n();
  const [engineBusy, setEngineBusy] = useState(false);
  const [desktopBusy, setDesktopBusy] = useState(false);
  const [desktopReady, setDesktopReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const off = window.hermesAPI.onUpdateDownloaded(() => {
      setDesktopBusy(false);
      setDesktopReady(true);
    });
    return off;
  }, []);

  const onUpdateEngine = useCallback(async () => {
    setError(null);
    setEngineBusy(true);
    const result = await window.hermesAPI.runHermesUpdate();
    setEngineBusy(false);
    if (result.success) onUpdated();
    else setError(result.error ?? t("versionCheck.engineUpdateFailed"));
  }, [onUpdated, t]);

  const onUpdateDesktop = useCallback(async () => {
    if (desktopReady) {
      await window.hermesAPI.installUpdate();
      return;
    }
    setDesktopBusy(true);
    await window.hermesAPI.downloadUpdate();
  }, [desktopReady]);

  const rows = [
    {
      key: "engine",
      name: t("versionCheck.engineName"),
      data: status.engine,
      busy: engineBusy,
      busyLabel: t("versionCheck.updatingEngine"),
      actionLabel: t("versionCheck.updateEngine"),
      onAction: onUpdateEngine,
    },
    {
      key: "desktop",
      name: t("versionCheck.desktopName"),
      data: status.desktop,
      busy: desktopBusy,
      busyLabel: t("versionCheck.downloadingDesktop"),
      actionLabel: desktopReady
        ? t("versionCheck.restartToUpdate")
        : t("versionCheck.downloadDesktop"),
      onAction: onUpdateDesktop,
    },
  ];

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">{t("versionCheck.title")}</h1>
        <p className="mt-2 max-w-md text-sm text-neutral-400">
          {t("versionCheck.subtitle")}
        </p>
      </div>

      <table className="w-full max-w-2xl border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-700 text-left text-neutral-400">
            <th className="py-2">{t("versionCheck.componentColumn")}</th>
            <th className="py-2">{t("versionCheck.currentColumn")}</th>
            <th className="py-2">{t("versionCheck.latestColumn")}</th>
            <th className="py-2">{t("versionCheck.statusColumn")}</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-neutral-800">
              <td className="py-3 font-medium">{r.name}</td>
              <td className="py-3 text-neutral-300">{r.data.current ?? "—"}</td>
              <td className="py-3 text-neutral-300">
                {r.data.latest ?? t("versionCheck.unknown")}
              </td>
              <td className="py-3">
                {r.data.updateAvailable
                  ? t("versionCheck.updateAvailable")
                  : t("versionCheck.upToDate")}
              </td>
              <td className="py-3 text-right">
                {r.data.updateAvailable && (
                  <button
                    type="button"
                    disabled={r.busy}
                    onClick={r.onAction}
                    className="rounded bg-blue-600 px-3 py-1.5 text-white disabled:opacity-50"
                  >
                    {r.busy ? r.busyLabel : r.actionLabel}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="button"
        onClick={onSkip}
        className="text-sm text-neutral-400 underline hover:text-neutral-200"
      >
        {t("versionCheck.skip")}
      </button>
    </div>
  );
}
```

> If `useI18n` lives at a different path, match `routes/welcome.tsx`'s sibling screens. The import `../../../../preload/index.d` for the `VersionStatus` type mirrors how other screens reference preload types; if the repo re-exports these types from a shared location, use that instead.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/src/screens/VersionCheck/VersionCheck.test.tsx`
Expected: PASS.

- [ ] **Step 5: Create the route**

`src/renderer/src/routes/version-check.tsx`:

```tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import VersionCheck from "../screens/VersionCheck/VersionCheck";

function VersionCheckRouteComponent(): React.JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["version-status"],
    queryFn: () => window.hermesAPI.checkVersionStatus(),
  });

  // Where to go when the user skips: the bootstrap stored the resolved
  // "normal next" under this query key.
  const next =
    (queryClient.getQueryData(["bootstrap-next"]) as string | undefined) ??
    "main";

  const onSkip = useCallback(() => {
    navigate({ to: `/${next}` });
  }, [navigate, next]);

  const onUpdated = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["version-status"] });
  }, [queryClient]);

  if (!data) return <div className="min-h-screen" />;

  return <VersionCheck status={data} onSkip={onSkip} onUpdated={onUpdated} />;
}

export const Route = createFileRoute("/version-check")({
  component: VersionCheckRouteComponent,
});
```

- [ ] **Step 6: Verify typecheck + tests**

Run: `npm run typecheck && npx vitest run src/renderer/src/screens/VersionCheck/VersionCheck.test.tsx`
Expected: PASS. (The generated `routeTree.gen.ts` updates on dev/build; typecheck of the route relies on it — if typecheck complains about the missing generated route, run `npm run build` once or start `npm run dev` to regenerate, then re-run typecheck.)

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/screens/VersionCheck/ src/renderer/src/routes/version-check.tsx
git commit -m "Add VersionCheck screen + route (skippable update gate)"
```

---

## Task 6: Bootstrap integration — route to `version-check` first

**Files:**
- Modify: `src/renderer/src/routes/index.tsx`

- [ ] **Step 1: Extend `BootstrapResult` and compute version status**

Edit `src/renderer/src/routes/index.tsx`. Change the union (line 10) to:

```ts
  next: "welcome" | "setup" | "main" | "version-check";
```

Add a field to carry the resolved normal-next:

```ts
  normalNext: "welcome" | "setup" | "main";
```

In `runBootstrap()`, the local-mode branch (lines 52-62) becomes:

```ts
    const status = await window.hermesAPI.checkInstall();
    const normalNext: "welcome" | "setup" | "main" = !status.installed
      ? "welcome"
      : !status.hasApiKey
        ? "setup"
        : "main";

    // First gate: surface available upgrades (engine vs GitHub latest
    // release, desktop vs electron-updater). Never blocks — any failure
    // inside the main process degrades to updateAvailable:false.
    let next: BootstrapResult["next"] = normalNext;
    try {
      const vs = await window.hermesAPI.checkVersionStatus();
      if (vs.engine.updateAvailable || vs.desktop.updateAvailable) {
        next = "version-check";
      }
    } catch {
      /* leave next = normalNext */
    }

    return {
      next,
      normalNext,
      error: null,
      connectionMode: "local",
      isRemote: false,
    };
```

Update the other three `return` sites (ssh success, ssh fail, remote, the final catch) to include `normalNext`. For ssh/remote successes use `normalNext: "main"`; for failures and the catch use `normalNext: "welcome"`.

- [ ] **Step 2: Stash `normalNext` so the version-check route can read it on skip**

In `SplashRouteComponent`, get the query client and store `normalNext` before navigating. Add at the top of the component:

```ts
  const queryClient = useQueryClient();
```

(import `useQueryClient` from `@tanstack/react-query`).

In the `useEffect`, before the `setTimeout`, add:

```ts
    queryClient.setQueryData(["bootstrap-next"], data.normalNext);
```

The existing `navigate({ to: '/${data.next}' })` now also handles `"version-check"`.

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/routes/index.tsx
git commit -m "Wire version-check as first onboarding gate in bootstrap"
```

---

## Task 7: Full verification gate + manual smoke

**Files:** none (verification only)

- [ ] **Step 1: Run the full pre-push gate**

Run: `npm run lint && npm run typecheck && npm run test`
Expected: all pass. (If `npm run test` reports the new tests, confirm `version-check.test.ts` and `VersionCheck.test.tsx` are green.)

- [ ] **Step 2: Build (preload/route surface changed)**

Run: `npm run build`
Expected: typecheck + electron-vite build succeed; `routeTree.gen.ts` regenerates with the `/version-check` route.

- [ ] **Step 3: Manual smoke in dev**

Run: `npm run dev`
Drive it:
- On a machine whose engine is behind the latest **release** tag (or temporarily force `engine.updateAvailable` by editing the handler), confirm the app lands on the version-check screen first, shows the engine row with "Update available", and the "Skip and continue" button proceeds to the normal next screen.
- On an up-to-date machine, confirm the app bypasses version-check entirely and lands on welcome/setup/main as before.
- Disconnect the network and relaunch: confirm the app still boots straight through (no block) within the splash time.

- [ ] **Step 4: Final commit (if any manual fixups were needed)**

```bash
git add -A
git commit -m "Polish version upgrade check after manual smoke"
```

---

## Self-Review Notes

- **Spec coverage:** engine-vs-release (Tasks 1-3), desktop-vs-updater (Task 3), recommend-but-skip screen (Task 5), bootstrap-first placement (Task 6), proxy/offline graceful fallback (Task 2 + handler try/catch), module isolation in `version-check.ts` (Tasks 1-2), tests mirroring `tests/` contract (Tasks 1-2, 5). All spec sections map to a task.
- **Type consistency:** `ComponentVersion`/`VersionStatus` defined identically in `version-check.ts` (main) and `index.d.ts` (renderer); `checkVersionStatus` returns `VersionStatus` end-to-end; engine `current` carries the raw `--version` string while comparison uses the parsed `calver`.
- **Out of scope (per spec):** persisting "skip this version", hard-block gate, commits-behind-main signal, 7 untranslated locales (fall back to en).
