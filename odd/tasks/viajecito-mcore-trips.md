# Feature: M-core — trips, trip-type plugins, trip shell, parallel-work scaffolding

- Feature id: `viajecito-mcore-trips` · Engram mirror: `odd/viajecito-mcore-trips/tasks` · Created 2026-10-01
- Branch: `feat/mcore-trips` (worktree `~/Development/viajecito-worktrees/mcore`), merged into `main`.
- Contract: `AGENTS.md` → "Core contract: trips, trip-type plugins and parallel milestone work".

## Objective
Give every milestone the shared foundation it needs: `Trip` + `Participation` + plugin registry + member
authorization helpers + router/handler auto-registration (api); split i18n, trip shell with data-driven
section nav, `TripProvider` and shared UI (web). Unblocks M1–M6 running in parallel.

## Tasks
- [x] **C1 api core** — delegated (writer sonnet; verifier opus). trips app, crews.default_trip, authz
  helpers, router auto-discovery, handler registry, PROJECT_APPS split, endpoints + tests, contract export.
- [x] **C2 web core** — delegated (same writer, same worktree, after C1 or in parallel inside the worktree).
  i18n split, home trips list + create trip, trip layout/shell/overview/placeholder, TripProvider, shared UI,
  tests, types regenerated.
- [ ] **C3 contracts M1–M6** — delegated (writer opus, docs only, worktree `docs-contracts`):
  `docs/contracts/{parallel-work,m1-proposals,m2-decisions,m3-logistics,m4-itinerary,m5-ski,m6-pwa}.md`.
- [ ] **C4 integrate** — inline: merge, regenerate contract/types, full checks, `make e2e` + `make bot-smoke`,
  merge to main, push; then launch wave A (M1, M2, M5, M6) and later wave B (M3, M4).

## Checks
api `uv run pytest`, ruff, lint-imports, `makemigrations --check`; web `pnpm lint/typecheck/test/build`,
`api:types:check`; `make e2e`; `make bot-smoke`.

## Progress
| Task | Status | Evidence |
|---|---|---|
| C1 | **done** (verifier REQUEST CHANGES → minors fixed; commits 74e5688…9639cf8; 438 tests; merged into main locally) | `uv run pytest` 390 passed, ruff/lint-imports clean, fresh migrate ok, export idempotent (writer) |
| C2 | **done** (verifier REQUEST CHANGES → 3 majors + 6 minors fixed; commits eee79e3…25175a0; merged into main locally) | `pnpm test` 142 passed, lint/typecheck/build/api:types:check green (writer) |
| C3 | opus design writer running | — |
| C4 | code integration **done** and pushed: api 438, web 150, fake-gowa 26, contract unchanged, types match; `make e2e` 2 passed; `make bot-smoke` passed (tick summary now includes reminders_queued/reminder_errors). Pending: merge C3 contracts, then wave A |
