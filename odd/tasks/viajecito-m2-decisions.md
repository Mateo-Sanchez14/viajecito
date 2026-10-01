# Feature: M2 — decisions and dates

- Feature id: `viajecito-m2-decisions` · Engram mirror: `odd/viajecito-m2-decisions/tasks` · Created 2026-10-01 · Wave A
- Contract (single source of truth for scope, ownership, API, tests): `docs/contracts/m2-decisions.md`
- Branches: `feat/m2-api` (worktree `~/Development/viajecito-worktrees/m2-api`) and
  `feat/m2-web` (worktree `~/Development/viajecito-worktrees/m2-web`), both from `main` after the
  core registries land; merged into `main` by the orchestrator.

## Objective and demo
The group converges on dates: availability grid per person, a best-window suggestion, a dates decision that closes and writes the trip dates. Demo: three members fill the grid, the suggestion appears, an admin closes it and the trip shows its dates.

## Ownership (summary; the contract has the exact lists)
- api apps: `decisions` · web: `features/dates` · sections: `dates/` · messages: `web/messages/es-AR/dates.json` · bot: `/viaje fechas` summary + nudge rule for missing responses

## Constraints
- Strict TDD (RED observed → GREEN → REFACTOR); runners `cd api && uv run pytest`, `cd web && pnpm test`.
- Rules for parallel work in `AGENTS.md` (append-only shared files, no edits to core or other milestones,
  `member_of_trip` on everything, snake_case, `{code,message}` errors, voseo copy only in copy files).
- Models: writers sonnet, verifiers opus (user decision). Delivery: merge to `main` + push per milestone.

## Tasks
- [ ] **A1 api** — delegated (writer sonnet, worktree `m2-api`; verifier opus; one correction round).
- [ ] **A2 web** — delegated (writer sonnet, worktree `m2-web`; verifier opus; one correction round).
  Builds against the contract's API table; generates types from a draft added to `contracts/openapi.json`
  in its branch; the orchestrator regenerates from the real api at integration.
- [ ] **A3 integrate** — inline: merge api then web, regenerate contract/types, env parsing for the
  contract's settings, full checks, `make e2e` + `make bot-smoke`, merge to `main`, push.

## Acceptance (from the contract)
- Pure best-window function tested (ties, min length, maybe weighting, weekend tie-break).
- Closing a dates decision calls `trips.use_cases.update_trip` with `start_on`/`end_on`.
- Touch-friendly grid; only members respond.

## Progress
| Task | Status | Evidence |
|---|---|---|
| A1 | pending | — |
| A2 | pending | — |
| A3 | pending | — |
