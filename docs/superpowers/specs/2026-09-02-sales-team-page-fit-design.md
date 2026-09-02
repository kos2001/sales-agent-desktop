# Fitting each page to a sales team's work

Date: 2026-09-02
Status: implemented

## Problem

The distribution was rebranded to Sales Agent and seeds seven sales skills into
`HERMES_HOME` on first launch (`sales-harness.ts`), but the UI was still the
general-purpose agent shell it started as. A salesperson opening the app saw:

- Chat suggestions offering to write a Python script and schedule a database
  backup cron — no route to any of the seeded playbooks.
- A flat 14-item sidebar mixing "Chat" with "Providers" and "Gateway", giving
  LLM plumbing the same prominence as the work.
- `Kanban` described as a "durable multi-agent board"; `Sessions`, `Schedules`
  and `Profiles` named after their subsystems rather than their use.
- `DEFAULT_SOUL` still opening "You are Hermes, a helpful AI assistant" — in two
  files, `soul.ts` and `ssh-remote.ts`, each with its own copy.
- `tools` and `office` panes mounted but unreachable: no nav entry pointed at
  them.

## Decision

Re-frame the existing screens; do not add new ones. Specifically:

1. **Split the sidebar into three groups** by *who a screen is for* —
   Selling / Workspace / Admin — with Admin collapsed by default.
2. **Wire Chat's empty state to the seeded playbooks**, one suggestion each.
3. **Replace the persona default** with a sales persona, from a single shared
   constant, and offer three motion presets.
4. **Sort the sales playbooks first** on the Skills screen.
5. **Rewrite screen copy** in sales vocabulary for the selling screens; leave
   admin screens in technical vocabulary, which suits their reader.

Rejected for this pass: mapping the Kanban board to deal stages, grouping
sessions by account, and a CRM connector panel. Each needs a data model the app
does not have yet, and each is a separate spec.

Locales: `en` and `ko` written by hand. `t()` falls back to `en`, which is
asserted in `tests/i18n-sales-copy.test.ts`, so the other seven locales degrade
to English rather than rendering key paths.

## Structure

- `src/shared/sales-persona.ts` — `DEFAULT_SOUL` and `SOUL_PRESETS`, the single
  source of truth for both `soul.ts` and `ssh-remote.ts`.
- `src/renderer/src/screens/Layout/SidebarNav.tsx` — extracted from
  `Layout.tsx`, which was over 500 lines. Owns `NAV_GROUPS`, the `View` union,
  and the persisted admin-group collapse state.
- `ChatEmptyState.tsx` — each suggestion carries the `skill` it reaches for, so
  a renamed playbook fails a test instead of failing silently.

## Consequences

- Existing users keep their `SOUL.md`. The new default applies only to fresh
  profiles and to an explicit reset or preset choice.
- `tools` and `office` become reachable for the first time.
- The test environment gained a Storage shim (`test/setup.ts`): Node 22+ defines
  a `globalThis.localStorage` getter returning `undefined`, which shadowed
  jsdom's under vitest and broke every test touching stored state.

## Verification

`npm run lint` (0 errors in touched files), `npm run typecheck`, `npm test`
(73 files, 780 passing), `npx electron-vite build`. Sidebar grid geometry was
checked against the real stylesheet in a browser in both expanded and collapsed
states.
