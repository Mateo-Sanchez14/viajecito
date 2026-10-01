# Feature: M5 — ski module

- Feature id: `viajecito-m5-ski` · Engram mirror: `odd/viajecito-m5-ski/tasks` · Created 2026-10-01 · Wave A
- Contract (single source of truth for scope, ownership, API, tests): `docs/contracts/m5-ski.md`
- Branches: `feat/m5-api` (worktree `~/Development/viajecito-worktrees/m5-api`) and
  `feat/m5-web` (worktree `~/Development/viajecito-worktrees/m5-web`), both from `main` after the
  core registries land; merged into `main` by the orchestrator.

## Objective and demo
Trip type `ski` with resorts (CL + AR), snow reports from Open-Meteo behind a provider port, lift passes, gear plans and ski profiles. Demo: a ski trip shows current conditions on its overview card and the ski page shows who still needs a pass or a rental.

## Ownership (summary; the contract has the exact lists)
- api apps: `ski` · web: `features/ski` · sections: `ski/` · messages: `web/messages/es-AR/ski.json` · bot: `/viaje nieve`; tick job `ski.refresh_snow` every 3 h for resorts on active trips

## Constraints
- Strict TDD (RED observed → GREEN → REFACTOR); runners `cd api && uv run pytest`, `cd web && pnpm test`.
- Rules for parallel work in `AGENTS.md` (append-only shared files, no edits to core or other milestones,
  `member_of_trip` on everything, snake_case, `{code,message}` errors, voseo copy only in copy files).
- Models: writers sonnet, verifiers opus (user decision). Delivery: merge to `main` + push per milestone.

## Tasks
- [ ] **A1 api** — delegated (writer sonnet, worktree `m5-api`; verifier opus; one correction round).
- [ ] **A2 web** — delegated (writer sonnet, worktree `m5-web`; verifier opus; one correction round).
  Builds against the contract's API table; generates types from a draft added to `contracts/openapi.json`
  in its branch; the orchestrator regenerates from the real api at integration.
- [ ] **A3 integrate** — inline: merge api then web, regenerate contract/types, env parsing for the
  contract's settings, full checks, `make e2e` + `make bot-smoke`, merge to `main`, push.

## Acceptance (from the contract)
- Plugin registers type `ski` (generic modules + `ski`, packing template keys).
- Open-Meteo adapter parses fixtures; 12 h staleness; backoff on failure; no API key.
- Seeded resorts with coordinates/elevations checked against sources (marked approximate otherwise).

## Progress
| Task | Status | Evidence |
|---|---|---|
| A1 | writer running (sonnet, launched 2026-10-01 after M-core bc1bece) | — |
| A2 | writer done (8 commits baf88cc…17bd947 + refactor; 211 web tests; dashboard, pass tracker, gear planner, profile, resort picker, conditions, overview card, /me/ski); opus verifier running | writer: lint/typecheck/test/build/api:types:check green at 17bd947 |
| A3 | pending | — |
