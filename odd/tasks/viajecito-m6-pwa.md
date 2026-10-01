# Feature: M6 — PWA, push, map and polish

- Feature id: `viajecito-m6-pwa` · Engram mirror: `odd/viajecito-m6-pwa/tasks` · Created 2026-10-01 · Wave A
- Contract (single source of truth for scope, ownership, API, tests): `docs/contracts/m6-pwa.md`
- Branches: `feat/m6-api` (worktree `~/Development/viajecito-worktrees/m6-api`) and
  `feat/m6-web` (worktree `~/Development/viajecito-worktrees/m6-web`), both from `main` after the
  core registries land; merged into `main` by the orchestrator.

## Objective and demo
Installable PWA with countdown and offline cache of Today and documents list, Web Push via VAPID mirroring group reminders, a proposals map (after M1 merges), a11y pass, Cloudflare Access note and the restore drill checklist. Demo: install on a phone, receive a push, open Today with no signal.

## Ownership (summary; the contract has the exact lists)
- api apps: `notifications` · web: `features/pwa`, `features/push`, `features/map` · sections: (none; overview card + settings) · messages: `web/messages/es-AR/pwa.json, push.json, map.json` · bot: reminder channel `push` registered via `register_channel`

## Constraints
- Strict TDD (RED observed → GREEN → REFACTOR); runners `cd api && uv run pytest`, `cd web && pnpm test`.
- Rules for parallel work in `AGENTS.md` (append-only shared files, no edits to core or other milestones,
  `member_of_trip` on everything, snake_case, `{code,message}` errors, voseo copy only in copy files).
- Models: writers sonnet, verifiers opus (user decision). Delivery: merge to `main` + push per milestone.

## Tasks
- [x] **A1 api** — done: 13 commits; verifier REQUEST CHANGES → fixed (no phones in payloads, config errors classified, per-person caps + fair budget, allowlist fallback, prune once/day, 307 regression test); 701 tests; merged into main locally.
- [x] **A2 web** — done: verifier REQUEST CHANGES (shared-device purge, subscription resync, click origin) → fixed; 274 tests; core files providers.tsx/TripOverview.tsx/ShellHeader.tsx edited with permission; merged b843de0. — delegated (writer sonnet, worktree `m6-web`; verifier opus; one correction round).
  Builds against the contract's API table; generates types from a draft added to `contracts/openapi.json`
  in its branch; the orchestrator regenerates from the real api at integration.
- [x] **A3 integrate** — api d160f71 + c23bcf0 (safe_path) + web b843de0 merged; map task still pending (after M1). — inline: merge api then web, regenerate contract/types, env parsing for the
  contract's settings, full checks, `make e2e` + `make bot-smoke`, merge to `main`, push.

## Acceptance (from the contract)
- Manifest + service worker (Serwist), install prompt, countdown.
- `PushSubscription` endpoints authenticated; 410 prunes; VAPID keys from settings.
- Map renders proposals with lat/lng (read-only use of M1's endpoint; implemented after M1 merges).

## Progress
| Task | Status | Evidence |
|---|---|---|
| A1 | **done** (verifier REQUEST CHANGES → corrected; 701 tests; merged) | writer: notifications 122 passed; full suite 666 + 1 core test fixed on main (209110c, reminders.isolated()); ruff/lint-imports clean; export idempotent |
| A2 | writer running (sonnet, launched 2026-10-01 after M-core bc1bece) | — |
| A3 | pending | — |

## Map continuation — 2026-10-01
- M1 delivered main ec96636; created feat/m6-map worktree ~/Development/viajecito-worktrees/m6-map. Prior full observation2708 is stale for already integrated PWA/push; actual document/core state preserved.
- [ ] **M1 map** — delegated web writer (2+non-trivial files), strict TDD from AGENTS `pnpm test`; contract m6-pwa.md/README addenda, reads M1 endpoint through paths types. Independent verifier, one correction round, parent spot/checks, regenerate/smoke/push.
- Forecast >400 authored lines allowed via user direct-main exception-ok delivery; coherent work-unit commits, no code golf. RDD off clone_local disabled/unmanaged. No remote operations, dependency APIs/version evidence via Context7 before pinning.
- Map insertion into core overview/routes only through orchestrator request; writer owns contract files/appends and must not write others. New work starts after mapping, no unsafe draft contracts.
