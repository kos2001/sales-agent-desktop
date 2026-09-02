# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Hermes Desktop is an Electron + React (TypeScript) GUI for the [Hermes Agent](https://github.com/NousResearch/hermes-agent) CLI. The app wraps install/setup, provider configuration, chat, sessions, profiles, memory, skills, tools, scheduling, and messaging gateways. Hermes itself lives in `~/.hermes` (overridable via `HERMES_HOME`); the desktop app shells out to its CLI and parses its output.

## Commands

```sh
npm install                # also runs electron-builder install-app-deps
npm run dev                # electron-vite dev (renderer + main hot reload)
npm run dev:fresh          # dev with a throwaway HERMES_HOME under /tmp
npm run lint               # eslint --cache .
npm run typecheck          # node + web tsconfig projects, both must pass
npm run test               # vitest run (jsdom)
npm run test:watch         # vitest watch
npm run build              # typecheck + electron-vite build
npm run build:mac          # build + electron-builder --mac (similar :win, :linux, :rpm)
```

Packaging-adjacent scripts in `scripts/`: `vendor-install-scripts.mjs` (vendor install scripts + `uv` for offline/corporate installs — see Architecture), `generate-winget-manifests.mjs` (Windows winget manifests, contract-tested by `winget-generator.test.ts`), `build-icon.mjs`, `check-custom-headers.mjs`.

Single test: `npx vitest run tests/sse-parser.test.ts` or `npx vitest run -t "name pattern"`. Tests live in both `tests/**/*.test.ts` (main-process units) and `src/**/*.test.{ts,tsx}` (renderer components); both are picked up by `vitest.config.ts`.

Pre-push verification gate: `npm run lint && npm run typecheck && npm run test`. Run `npm run build` if you touch packaging, preload surface, or anything that affects bundling.

## Architecture

**Three-process Electron split** (`electron.vite.config.ts`):

- `src/main/` — main process. Owns all OS-level work: spawning the Hermes CLI, file I/O, SQLite (`better-sqlite3`, marked `external` in the rollup config — do not import it from the renderer), SSH tunnels, sudo askpass, auto-updates, IPC handlers. Entry point `src/main/index.ts` is large and registers most `ipcMain.handle` channels inline; new IPC should follow the existing pattern there.
- `src/preload/` — context-isolated bridge. Two entry points (`index.ts` for the main window, `askpass.ts` for the sudo prompt window). The renderer's typed surface lives in `src/preload/index.d.ts` — keep it in sync when adding IPC.
- `src/renderer/src/` — React 19 + Vite + Tailwind 4. Screens are organized by feature folder under `screens/` (Chat, Sessions, Providers, Models, Skills, Tools, Schedules, Gateway, Kanban, Memory, Office, Soul, Install, Setup, Welcome, Settings, Agents). Path alias `@renderer/*` → `src/renderer/src/*`; `@shared/*` → `src/shared/*` (vitest only — runtime uses relative imports).

**Hermes CLI integration.** Most main-process modules wrap a Hermes subcommand and parse its output: `installer.ts` (install/verify/doctor/update/backup/import/dump/mcp), `hermes.ts` + `sse-parser.ts` (chat streaming via SSE), `hermes-auth.ts` (device-code OAuth), `model-discovery.ts` (per-provider model lists, incl. OAuth providers), `sessions.ts`, `profiles.ts`, `providers.ts`, `skills.ts`, `tools.ts`, `kanban.ts`, `memory.ts`, `soul.ts`, `cronjobs.ts`, `office-start.ts`, `claw3d.ts`. When changing CLI invocation, also update the matching test in `tests/` — these tests are the contract for argv shape and output parsing.

**Remote / SSH mode.** `ssh-remote.ts`, `ssh-tunnel.ts`, `ssh-options.ts` let the app talk to a Hermes install on another host. `isRemoteMode` / `isRemoteOnlyMode` gate features; many handlers branch on this. Test coverage in `tests/ssh-remote*.test.ts`, `tests/remote-mode-url-and-spawn.test.ts`.

**Corporate-network / offline install.** For machines behind a company mirror/proxy (Artifactory/Nexus PyPI, HTTP proxy, internal git mirror), the upstream install scripts can't reach github.com/pypi.org/astral.sh directly. The design choice is *not to fork those scripts* — instead feed the tools they call (`uv`, `pip`, `git`, `npm`) the standard proxy/index env vars they already honor:
- `corporate-net.ts` — the `CorporateNetworkConfig` (proxy, PyPI index, git mirror, Python install mirror, Playwright download host), persisted in the desktop config (`config.ts`). `installer.ts` reads it via `getCorporateNetworkConfig()` and injects the env at spawn time.
- `preflight.ts` — connectivity probe targets (uv/astral.sh, GitHub, Playwright CDN) run *through the configured proxy* so the Install screen can show a concrete pass/fail table of what the network blocks.
- `scripts/vendor-install-scripts.mjs` — run on an internet-connected machine *before packaging* to vendor the upstream install scripts **and the `uv` binary** into `resources/`. Bundling `uv` on PATH is what closes the un-redirectable astral.sh hop (the script sees `uv` already installed and skips the download).
- IPC: `get-corporate-net` / `set-corporate-net` / `run-preflight` in `index.ts`; the renderer surface is the corporate-net panel on the Install screen.
- Tests: `corporate-net.test.ts`, `preflight.test.ts`, `installer-bundled-script.test.ts`.

**Security-sensitive surfaces.** `security.ts`, `askpass.ts` (+ `src/preload/askpass.ts`, `src/shared/askpass.ts`), `sudoCreds.ts`, `hermes-auth.ts`, `process-options.ts`. Don't loosen these without reading their tests (`electron-security.test.ts`, `askpass-security.test.ts`, `connection-config-security.test.ts`, `process-options.test.ts`). `process-options.ts` centralizes spawn-arg/env sanitization — new shell-outs should route through it.

**i18n.** `src/shared/i18n/` holds translations; `src/renderer/src/components/I18nProvider.tsx` + `useI18n.ts` are the entrypoints. `src/main/locale.ts` persists the selection. Renderer tests use `I18nProvider.test.tsx` as the pattern.

**Test setup.** `src/renderer/src/test/setup.ts` is the vitest setup file (jest-dom matchers, jsdom). Main-process tests under `tests/` do not use it directly but share the same vitest config. Use `forks` is *not* configured here (unlike the openclaw sibling repo) — default pool.

## Companion web site (`web/`)

`web/` is a **separate Next.js 16 project** (App Router, static export — `output: "export"`) that serves as the project's public marketing/docs site. It is intentionally isolated from the Electron app: its own `package.json`, its own `node_modules`, no shared deps with the desktop renderer. Build with `cd web && npm run build` → static `out/` directory deployable to any static host.

Don't confuse this with the desktop renderer. The Electron renderer is Vite + TanStack Router (see "Renderer patterns" below) because Electron has no HTTP server, only IPC — Next.js's server-side features don't run there. The companion site is the right home for Next.js: file-based routing, static export, public web hosting.

## Renderer patterns

- **Routing.** The renderer uses TanStack Router with **file-based routes** (Next.js-style DX) under `src/renderer/src/routes/`. The `@tanstack/router-plugin/vite` plugin (configured in `electron.vite.config.ts`) watches that directory and regenerates `src/renderer/src/routeTree.gen.ts` on save — the generated file is gitignored. `createMemoryHistory` is used because Electron has no URL bar; `lib/router.tsx` just wires the generated tree to the router. Each route file exports `Route = createFileRoute("/path")({ component })`; the root layout is `routes/__root.tsx`. `autoCodeSplitting: true` splits each route into its own chunk. The bootstrap probe (install/connection check) runs as a one-shot `useQuery(['bootstrap'])` inside `routes/index.tsx`, then `navigate()`s when both the probe and the splash min-time complete. New top-level screens are added by dropping a new file into `routes/`. `Layout.tsx` still owns sub-screen switching as an internal tab state — converting those to nested routes is a separate task.
- **Server state.** Every IPC read should be a `useQuery`. `QueryClient` lives in `src/renderer/src/lib/queryClient.ts` with Electron defaults (`networkMode: "always"`, no window-focus refetch, no retry, 5s default `staleTime`). Mutations should `queryClient.invalidateQueries({ queryKey })` rather than calling a sibling component's reload helper. Reference example: `screens/Models/Models.tsx` (exports `modelsQueryKey` so cross-screen writes — Providers, chat model picker — can invalidate it).
- **Cross-route ephemeral state.** Truly ephemeral cross-route UI state (transient install error string, soft verify-warning banner flag) lives in `src/renderer/src/lib/app-context.tsx` (`useAppState`). Anything that's actually derived from the main process belongs in a query, not the context.

## Conventions

- TypeScript strict; project references split node (`tsconfig.node.json`) vs. web (`tsconfig.web.json`). `npm run typecheck` runs both — both must pass before commit.
- ESLint flat config in `eslint.config.mjs`; Prettier for formatting (`npm run format`).
- The renderer never imports from `src/main/**` directly. All cross-process calls go through preload-exposed APIs declared in `src/preload/index.d.ts`.
- `better-sqlite3` is main-process only and externalized in the bundle. Don't try to use it from the renderer.
- New IPC channel: handler in `src/main/index.ts` (or a domain module re-exported from there), preload binding in `src/preload/index.ts`, type in `src/preload/index.d.ts`, then consume via `window.api.*` in the renderer.
- When parsing Hermes CLI output, add a fixture-style unit test in `tests/` mirroring the existing files; these protect against upstream CLI drift.
