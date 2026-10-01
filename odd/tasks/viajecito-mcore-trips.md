# Feature: M-core — trips, trip-type plugins, trip shell, parallel-work scaffolding

- Feature id: `viajecito-mcore-trips` · Engram mirror: `odd/viajecito-mcore-trips/tasks` · Created 2026-10-01
- Branch: `feat/mcore-trips` (worktree `~/Development/viajecito-worktrees/mcore`), merged into `main`.
- Contract: `AGENTS.md` → "Core contract: trips, trip-type plugins and parallel milestone work".

## Objective
Give every milestone the shared foundation it needs: `Trip` + `Participation` + plugin registry + member
authorization helpers + router/handler auto-registration (api); split i18n, trip shell with data-driven
section nav, `TripProvider` and shared UI (web). Unblocks M1–M6 running in parallel.

## Tasks
- [ ] **C1 api core** — delegated (writer sonnet; verifier opus). trips app, crews.default_trip, authz
  helpers, router auto-discovery, handler registry, PROJECT_APPS split, endpoints + tests, contract export.
- [ ] **C2 web core** — delegated (same writer, same worktree, after C1 or in parallel inside the worktree).
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
| C1 | writer done (390 tests; commits 74e5688…0e43aa1); C1b (events + reminders registries, participants shape) running; verifier after C1b | `uv run pytest` 390 passed, ruff/lint-imports clean, fresh migrate ok, export idempotent (writer) |
| C2 | writer done (142 tests; commits eee79e3…1209bcb); opus verifier running | `pnpm test` 142 passed, lint/typecheck/build/api:types:check green (writer) |
| C3 | opus design writer running | — |
| C4 | pending | — |
