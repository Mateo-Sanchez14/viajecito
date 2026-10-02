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
- [x] **B1 api** — delegated (writer sonnet; verifier opus).
- [x] **B2 web** — delegated (writer sonnet; verifier opus). Builds against the contract's API table with a draft
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
| B1 | integrated | Corrected78ceef6 → mainb44754f after1980API |
| B2 | integrated | Corrected174a84f independently597tests+6hydratedviewports, maine33ce43 after2004API/621web/fullchecks |
| B3 | source integrated; native runtime verified | f863d22; native E2E10 plus production offline2 passed; Docker infrastructure gate remains failed; push next |

## Codex resumption — 2026-10-01
- Baseline ec96636, M1 fully integrated/pushed; API1816 tests, web571, e2e8passed/2production-only skips, bot smoke passed. Current docs reconciled against full Engram wave-b observation2712 (stale pre-M1 status).
- Route B1/B2 delegated: 4+ source mapping and 2+ non-trivial source files. One writer per side in own worktree; one independent verifier; at most one correction round to same writer; parent spot check; API before web.
- Strict TDD ON from AGENTS; API `cd api && uv run pytest`, web `cd web && pnpm test`; observed RED required before each production work unit.
- Delivery strategy exception-ok: user explicitly requests direct main/push, not PR chains; forecast >400 authored lines, task/commit slices by coherent behavior (400 advisory only, no code golf). RDD off clone_local; disabled/unmanaged, no native review prompt.
- Writers use default available runtime model; verifier independent. Earlier sonnet/opus labels describe old runtime profiles, not available Codex models.
- Append-only shared registries union; schema/type regenerate; web request types from paths and output enums Literal. Runtime e2e share auth storage state, self-seed records, do not clear shared fake ledger. No remote execution/transfer.
- Mapping in progress; missing M1 get_proposal_snapshot/list_trip_proposals bridge identified, orchestrator owns core changes. Writers must not bypass boundaries by importing another app models/adapters.
- Checks: API frozen sync/export/pytest/Ruff/imports/migration drift; web frozen install/types/typecheck/lint/test/build/drift; local e2e/bot smoke sequential exclusive compose use then push SHA.

### Dispatch decisions
- Reconciled actual file/full observation before dispatch; task file locator in root checkout is authoritative for Codex resumption notes (worktrees predate docs commits).
- Web parallel draft JSON/generated paths stay feature-owned, not contracts/openapi.json; feature-local openapi-fetch client uses exported CSRF middleware/credentials. At API integration replace with shared generated paths/client and remove draft artifacts (parent-owned integration). M4 contract-local document types allowed until M3 types exist.
- Record coherent work-unit slices from contract test list, with RED/GREEN/checks/rollback in reports. Estimates: M3 3000–5000, M4 2000–3500 authored lines; direct-main exception-ok authorized (no PR chain).
- M3 task numbers require persistent app-owned sequence, never reuse after deleting highest. M4 nullable tray DayOut.date; no bot/push phone fallback.

### Current progress
- B1 API actor m4_api_writer in m4-api: selectorcommit12c05f8 REDmissingmodule→GREEN10 timezone/DST tests; CRUDRED11→GREEN21focused, fullchecks running. Parent snapshots approved main7c4aa56/packing328a784 ready for fixed-SHA ingestion.
- B2 web actor m4_web_writer launched m4-web with contract-local draft paths/client + external document types strategy, strictTDD and own boundaries.
- Product clarification for M3 long nag affects neither M4 safe work nor its contract. No milestone merge/push yet.

### Candidate handoff and parallel verification
- B1 candidate feat/m4-api a2d90c1 clean:71 focused/1907 full tests, frozen sync/Ruff/imports/export/migrations. Independent verifier is former M3 author m3_api_writer (did not author M4). Pending one correction/parent spot/integration; not completed yet.
- Parent-owned integration request: extend global import-linter contracts to itinerary and new M3 apps; milestone writers only appended allowed app lists.
- B2 writer m4_web_writer candidate7891dea:23 focused tests, typecheck/lint/build/drift green; final full checks pending. Runtime browser e2e deferred until integrated API/exclusive compose window.
- User authorized faster parallel progress and separate premium/fun visual redesign; audit underway without touching itinerary/Today ownership.

### Delivery resumed — 2026-10-02
- API78ceef6 independently approved1910 full/74 focused after its one correction. Parent spot and clean-main merge next. Web7891dea independent verification/actual generated paths-client cleanup still pending. No new milestone delivered yet.

### Observed API integration
- API corrected78ceef6 mergedb44754f after union app/TOML lists, regenerated export and parent1980 tests/imports/Ruff/migrations. Web/integration still pending.

### Independent web correction and real-contract integration
- Web7891dea independently reproduced594 tests/focused23/lint/types/build. One P2: ItineraryPlanner/TodayView main+h1 duplicate parent appmain/tripheaderh1; external integrated regressions reproduced2/2. Same author m4_web_writer receives ONE correction, wrapperssection/div andh2 with meaningful RED/GREEN.
- Approved C2 integration scope: clean fixed parent27ffb0a ingestion --no-ff/no-commit with export+pytest before mergecommit, regenerate actual sharedtypes/client, delete itinerary draftgenerator/JSON/schema and replace temporary Todaydocumenttypes/rawfetch with sharedgeneratedpaths/client. Preserve20s/ETag304, permissions/localtime/order behavior. Different independent final review required; no API/core edits beyond controlled parent ingestion.

### Observed web and runtime integration — 2026-10-02
- Final corrected174a84f independentAPPROVE:597web/26focused/fullchecks; actualhydrated320/390/1440 itinerary+Today main1/h1one/nooverflow/noJSerrors. Actual sharedpaths/client-only,20s/ETag304/CSRF/auth kept, all drafts removed.
- Parentmaine33ce43 after2004API/export and621web/types/lint/drift/build. Generator C3 later05a41ee passed629combinedweb unchangedresponses.
- Actualsample-onlymakee2e exposed test-only oldTodayh1selector (8pass1fail/2production skips); correction1926ff5 h2+1main/1h1 observedGREEN9pass/2production-onlyskips. Different independent spotapproved; parentmerge4c6b3e9 after2004API/export. Productionserviceworker/offlineToday/documents checks and finalcombineddelivery/push remain.

### Delivery verification checkpoint — 2026-10-02
- Final source: `f863d22`; final permission fix `b969336` independently approved and merged only after export + 2,010 API tests passed. Frozen dependencies, Ruff/587 formatted files, 14 import contracts and migration drift passed. Regenerated contract/types unchanged; 665 web tests, typecheck, lint, drift and production build passed.
- Native isolated final runtime: full Playwright 10 passed / 2 production-only skips; those two passed separately against the production build. Actual cached ticket remains listed offline; its unsaved file is unavailable. Fresh isolated bot database passed exact pong/reply, duplicate replay and tick with zero errors. Six mobile views had unique landmarks and no overflow. Actual upload and packing quantity edits persisted after reload.
- Final C5 proof on f863d22: three browser uploads plus a forced-private ID upload returned consistent can_delete=true for the uploader; another member cannot delete a crew document and receives 404 for private metadata/files. Own runtime processes stopped, local ports closed, tracked checkout and sample env unchanged.
- Docker final make e2e failed before browser tests because daemon storage became read-only/containerd metadata I/O failed. Scoped cleanup could not be confirmed. Final Docker bot/production targets were not run. Earlier Docker e2e (9 passed / 2 production skips) and bot smoke passed before final source integration. Native proof does not turn this failed Docker gate green; no daemon restart or unrelated service changes were attempted.
- Authorized source push is next. Docker recovery/reverification remains open; Pi/T11 deployment, real provider captures, VAPID/production vault keys and backup/restore remain owner actions, not completed here.
