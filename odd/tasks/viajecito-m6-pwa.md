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
- [ ] **A1 api** — delegated (writer sonnet, worktree `m6-api`; verifier opus; one correction round).
- [ ] **A2 web** — delegated (writer sonnet, worktree `m6-web`; verifier opus; one correction round).
  Builds against the contract's API table; generates types from a draft added to `contracts/openapi.json`
  in its branch; the orchestrator regenerates from the real api at integration.
- [ ] **A3 integrate** — inline: merge api then web, regenerate contract/types, env parsing for the
  contract's settings, full checks, `make e2e` + `make bot-smoke`, merge to `main`, push.

## Acceptance (from the contract)
- Manifest + service worker (Serwist), install prompt, countdown.
- `PushSubscription` endpoints authenticated; 410 prunes; VAPID keys from settings.
- Map renders proposals with lat/lng (read-only use of M1's endpoint; implemented after M1 merges).

## Progress
| Task | Status | Evidence |
|---|---|---|
| A1 | writer running (sonnet, launched 2026-10-01 after M-core bc1bece) | — |
| A2 | writer running (sonnet, launched 2026-10-01 after M-core bc1bece) | — |
| A3 | pending | — |
