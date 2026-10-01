# Feature: M4 — itinerary and Today

- Feature id: `viajecito-m4-itinerary` · Engram mirror: `odd/viajecito-m4-itinerary/tasks` · Created 2026-10-01 · Wave B
- Contract (single source of truth): `docs/contracts/m4-itinerary.md` (+ `docs/contracts/README.md` addenda)
- Branches: `feat/m4-api` (worktree `~/Development/viajecito-worktrees/m4-api`) and
  `feat/m4-web` (worktree `~/Development/viajecito-worktrees/m4-web`), both from `main` AFTER M1
  (proposals) is integrated; merged into `main` by the orchestrator.

## Objective and demo
Day-by-day itinerary with an unscheduled tray, meeting points and quick notes; the Today view (timeline, next meeting point, document shortcuts, snow section) selected in the trip timezone; `/viaje hoy` and the morning digest. Demo: open Hoy at the resort without scrolling the group chat.

## Ownership (summary; the contract has the exact lists)
- api apps: `itinerary` · web: `features/itinerary`, `features/today` · sections: `itinerary/`, `today/` · messages: `itinerary.json`, `today.json` · bot: `/viaje hoy`, reminder rule `itinerary.morning_digest` composed from `digest_sections`; subscriber to `proposal.status_changed` (tray entry on `chosen`)
- Wave B may reference `proposals.Proposal` (and `documents.Document` for M4) through use cases / FKs as the contract allows.

## Constraints
- Strict TDD (RED observed → GREEN → REFACTOR); runners `cd api && uv run pytest`, `cd web && pnpm test`.
- Rules for parallel work in `AGENTS.md`; web request types derived from `paths`, never from guessed schema names;
  `*Out` enum fields typed with `Literal` on the api; e2e specs never log in themselves (shared storage state).
- Models: writers sonnet, verifiers opus (one correction round). Delivery: merge to `main` + push per milestone.

## Tasks
- [ ] **B1 api** — delegated (writer sonnet; verifier opus).
- [ ] **B2 web** — delegated (writer sonnet; verifier opus). Builds against the contract's API table with a draft
  added to `contracts/openapi.json` (orchestrator regenerates from the real api at integration).
- [ ] **B3 integrate** — inline: merge api then web, regenerate contract/types, env parsing for the contract's
  settings, full checks, `make e2e` + `make bot-smoke`, merge to `main`, push.

## Acceptance (from the contract)
- Today selector across midnight in the trip timezone (AR UTC-3; CL DST); ETag/`If-None-Match` on the today endpoint.
- Chosen proposal → tray entry (idempotent subscriber); entries ordered; notes pinned.
- Web Today view polls every 20 s; itinerary editing with up/down ordering (drag optional).

## Progress
| Task | Status | Evidence |
|---|---|---|
| B1 | pending | — |
| B2 | pending | — |
| B3 | pending | — |
