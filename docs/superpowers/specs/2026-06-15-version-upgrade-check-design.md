# Version Upgrade Check — Onboarding First Step

**Date:** 2026-06-15
**Status:** Approved (design)
**Branch:** `feature/version-upgrade-check`

## Problem

When a user opens Hermes Desktop, there is no version-reconciliation step.
Two independent components can drift out of date:

- **Hermes agent engine** — the CLI in `~/.hermes/hermes-agent`. Today
  `getHermesVersion()` reports the installed version but nothing compares it
  against a reference, so an onboarding user can proceed on a stale engine.
- **Hermes Desktop** — the Electron app itself. `electron-updater` can check
  GitHub releases, but the check only runs 5s after startup as a background
  notification, not as a gating onboarding step.

We want a **version upgrade check as the very first onboarding gate**: before
the user reaches welcome/setup/main, surface any available upgrade for either
component and let them update — or skip and continue.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Engine "needs upgrade" source of truth | GitHub **latest release tag** of `NousResearch/hermes-agent` |
| Desktop "needs upgrade" source of truth | GitHub **latest release tag** of `kos2001/hermes-desktop-release` (not electron-updater's check) |
| Gate policy | **Recommend but allow skip** (never hard-block) |
| Placement | **Bootstrap step** — first gate on every launch |
| Code location | New module `src/main/version-check.ts` (do not bloat `installer.ts`) |

### Why GitHub latest release (not engine's built-in behind-count)

`hermes --version` already prints `Update available: N commits behind` — but
that is measured against `upstream/main` HEAD, not against published releases.
On a machine sitting exactly at the latest release tag this still reports
"855 commits behind". We deliberately compare against the **latest release
tag** so only stable releases trigger the upgrade prompt; we ignore the
commits-behind-main signal.

## Architecture

### New module: `src/main/version-check.ts`

Single responsibility: determine version status for both components. Pure,
testable functions plus one network/IPC-facing aggregator.

```ts
// Pure parsing — given `hermes --version` stdout
parseEngineVersion(output: string): {
  semver: string | null;     // "0.16.0"
  calver: string | null;     // "2026.6.5"  (from the "(…)" group)
  upstreamSha: string | null;// "0d82060c"
}

// Pure numeric CalVer comparison. Returns false on any malformed input
// (safe default — never prompt an upgrade we can't justify).
isEngineUpdateAvailable(installedCalVer: string | null, latestTag: string | null): boolean

// Network: GET https://api.github.com/repos/NousResearch/hermes-agent/releases/latest
// - routed through the corporate-net proxy (buildCorporateEnv / fetch agent)
// - 3s timeout; on any failure returns null (→ treated as "no update")
// - 1h in-memory TTL cache to avoid rate limits / repeated launches
fetchLatestEngineRelease(): Promise<{ tag: string } | null>

// Aggregate both components into one result for the bootstrap probe.
getVersionStatus(): Promise<VersionStatus>
```

`VersionStatus` shape:

```ts
interface ComponentVersion {
  current: string | null;     // installed / running version
  latest: string | null;      // latest known (null if unreachable)
  updateAvailable: boolean;   // false when unknown — never blocks
}
interface VersionStatus {
  engine: ComponentVersion;   // only meaningful in local mode + installed
  desktop: ComponentVersion;  // always evaluated
}
```

### Engine evaluation rules

- Engine is only evaluated when connection mode is **local** AND an engine is
  installed (there is nothing to "upgrade" on a fresh, not-yet-installed box —
  install flow handles that). In remote/ssh mode the engine lives on another
  host; skip engine evaluation (`updateAvailable: false`).
- `current` ← CalVer parsed from `getHermesVersion()` output.
- `latest` ← `fetchLatestEngineRelease().tag` with leading `v` stripped.
- `updateAvailable` ← `isEngineUpdateAvailable(current, latest)`.

### Desktop evaluation rules

The desktop `latest` is the latest **GitHub release tag of
`kos2001/hermes-desktop-release`**, parsed via `fetchLatestDesktopRelease`
(same proxy-aware fetcher + 3s timeout + 1h cache as the engine fetch), and
compared numerically against `app.getVersion()`. We deliberately do *not* use
electron-updater's `checkForUpdates()` result for this comparison — that path
is reserved for the actual download/install action. `electron-builder.yml`'s
`publish` block is pointed at the same `kos2001/hermes-desktop-release` repo so
the comparison source and the download/install target stay consistent.

- `current` ← `app.getVersion()`.
- `latest` ← `fetchLatestDesktopRelease()` (GitHub latest release tag of
  `kos2001/hermes-desktop-release`); null on any network/timeout/proxy failure.
- `updateAvailable` ← `isDesktopUpdateAvailable(current, latest)`: both
  normalized (leading "v" stripped) and compared numerically, so a build
  *ahead* of the latest release does not falsely prompt and `0.4.5` vs `v0.4.5`
  is treated as equal.

### IPC

- **New:** `check-version-status` → `getVersionStatus()` → `VersionStatus`.
  - handler in `src/main/index.ts`
  - preload binding `window.hermesAPI.checkVersionStatus()` in `src/preload/index.ts`
  - type in `src/preload/index.d.ts`
- **Reused (no change):**
  - engine update action → existing `run-hermes-update`
  - desktop update action → existing `download-update` / `install-update`
    and the existing `update-download-progress` / `update-downloaded` events

### Bootstrap integration — `src/renderer/src/routes/index.tsx`

`BootstrapResult.next` union gains `"version-check"`.

In `runBootstrap()`, after the connection mode is resolved and the existing
SSH/remote/local install checks decide the "normal" next screen, call
`checkVersionStatus()` (in parallel with the existing splash min-time). If
either component reports `updateAvailable`, route to `"version-check"` and
carry the resolved normal-next so the screen knows where "Skip & continue"
should go. Otherwise keep the existing next.

- The network call is bounded by the 3s timeout inside the main process and
  overlaps the 1.3s splash; cache hits are instant. A failure or timeout
  yields `updateAvailable: false`, so the user proceeds exactly as today.

### New screen — `src/renderer/src/screens/VersionCheck/VersionCheck.tsx` + `routes/version-check.tsx`

- A `component | current | latest | status` table for engine and desktop.
- Per-row action only when `updateAvailable`:
  - **Update engine** → `runHermesUpdate()` with streamed log; on success
    re-run `checkVersionStatus()` and clear the row.
  - **Download & install** (desktop) → existing download/install flow with
    progress, then `installUpdate()` (app restarts).
- **Skip & continue** → `navigate()` to the carried normal-next
  (welcome/setup/main). Skip is per-launch; no persistence (YAGNI).
- Follows existing screen patterns (`useQuery` for reads via the new IPC,
  TanStack file route, i18n strings).

## Error Handling

- GitHub unreachable / proxy blocked / non-200 / timeout → `fetchLatestEngineRelease()`
  returns null → engine `updateAvailable: false`. Onboarding is never blocked
  by a network failure (corporate/offline requirement).
- Malformed `--version` output → `parseEngineVersion` returns nulls →
  `isEngineUpdateAvailable` returns false.
- Desktop update check error → desktop `updateAvailable: false`; existing
  `update-error` event handling is unchanged.

## Testing — `tests/version-check.test.ts`

Mirrors the fixture-style contract tests in `tests/`.

- `parseEngineVersion` against the real line:
  `"Hermes Agent v0.16.0 (2026.6.5) · upstream 0d82060c"` →
  `{ semver: "0.16.0", calver: "2026.6.5", upstreamSha: "0d82060c" }`;
  plus a garbled-output case → all nulls.
- `isEngineUpdateAvailable`:
  - equal (`2026.6.5` vs `2026.6.5`) → false
  - older installed (`2026.5.29` vs `2026.6.5`) → true
  - newer installed → false
  - null / malformed inputs → false (safe default)
- `fetchLatestEngineRelease`: mocked fetch — parses `releases/latest` JSON
  `{ tag_name: "v2026.6.5" }` → `{ tag: "v2026.6.5" }`; network error / non-200
  / timeout → null.

## Out of Scope (YAGNI)

- Persisting "skip this version" across launches.
- Hard-blocking / mandatory upgrade gate.
- Comparing against `upstream/main` commits-behind.
- Auto-applying updates without user action.
- Remote/ssh engine upgrade orchestration (engine eval is skipped there).

## Files Touched

- **New:** `src/main/version-check.ts`,
  `src/renderer/src/screens/VersionCheck/VersionCheck.tsx`,
  `src/renderer/src/routes/version-check.tsx`,
  `tests/version-check.test.ts`
- **Edit:** `src/main/index.ts` (IPC), `src/preload/index.ts` (binding),
  `src/preload/index.d.ts` (type), `src/renderer/src/routes/index.tsx`
  (bootstrap), i18n strings under `src/shared/i18n/`.
