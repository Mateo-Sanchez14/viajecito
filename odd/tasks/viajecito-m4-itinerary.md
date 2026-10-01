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

## Codex resumption — 2026-10-01
- Baseline ec96636, M1 fully integrated/pushed; API1816 tests, web571, e2e8passed/2production-only skips, bot smoke passed. Current docs reconciled against full Engram wave-b observation2712 (stale pre-M1 status).
- Route B1/B2 delegated: 4+ source mapping and 2+ non-trivial source files. One writer per side in own worktree; one independent verifier; at most one correction round to same writer; parent spot check; API before web.
- Strict TDD ON from AGENTS; API `cd api && uv run pytest`, web `cd web && pnpm test`; observed RED required before each production work unit.
- Delivery strategy exception-ok: user explicitly requests direct main/push, not PR chains; forecast >400 authored lines, task/commit slices by coherent behavior (400 advisory only, no code golf). RDD off clone_local; disabled/unmanaged, no native review prompt.
- Writers use default available runtime model; verifier independent. Earlier sonnet/opus labels describe old runtime profiles, not available Codex models.
- Append-only shared registries union; schema/type regenerate; web request types from paths and output enums Literal. Runtime e2e share auth storage state, self-seed records, do not clear shared fake ledger. No remote execution/transfer.
- Mapping in progress; missing M1 get_proposal_snapshot/list_trip_proposals bridge identified, orchestrator owns core changes. Writers must not bypass boundaries by importing another app models/adapters.
- Checks: API frozen sync/export/pytest/Ruff/imports/migration drift; web frozen install/types/typecheck/lint/test/build/drift; local e2e/bot smoke sequential exclusive compose use then push SHA.
