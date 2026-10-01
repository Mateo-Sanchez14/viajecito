# Feature: M3 — logistics, budget and documents

- Feature id: `viajecito-m3-logistics` · Engram mirror: `odd/viajecito-m3-logistics/tasks` · Created 2026-10-01 · Wave B
- Contract (single source of truth): `docs/contracts/m3-logistics.md` (+ `docs/contracts/README.md` addenda)
- Branches: `feat/m3-api` (worktree `~/Development/viajecito-worktrees/m3-api`) and
  `feat/m3-web` (worktree `~/Development/viajecito-worktrees/m3-web`), both from `main` AFTER M1
  (proposals) is integrated; merged into `main` by the orchestrator.

## Objective and demo
Tasks with owners and due dates (todo / bring / booking), packing templates per trip type (incl. the border section), per-person budget forecast from chosen proposals, and an encrypted documents vault with owner-only visibility. Demo: the bot nags the owner of an open booking task in the group; the web shows the per-person cost and the documents at hand.

## Ownership (summary; the contract has the exact lists)
- api apps: `logistics`, `budget`, `documents` · web: `features/logistics`, `features/budget`, `features/documents` · sections: `logistics/`, `budget/`, `documents/` · messages: `logistics.json`, `budget.json`, `documents.json` · bot: `/viaje tareas`, `/viaje listo <n>` (alias `hecho`), reminder rule `logistics.task_nag` (grouped per trip per day), digest section; subscriber to `proposal.status_changed` (booking task on `chosen`)
- Wave B may reference `proposals.Proposal` (and `documents.Document` for M4) through use cases / FKs as the contract allows.

## Constraints
- Strict TDD (RED observed → GREEN → REFACTOR); runners `cd api && uv run pytest`, `cd web && pnpm test`.
- Rules for parallel work in `AGENTS.md`; web request types derived from `paths`, never from guessed schema names;
  `*Out` enum fields typed with `Literal` on the api; e2e specs never log in themselves (shared storage state).
- Models: writers sonnet, verifiers opus (one correction round). Delivery: merge to `main` + push per milestone.

## Tasks
- [ ] **B0 proposals bridge** — delegated orchestrator-owned prerequisite: pure store-free get_proposal_snapshot/list_trip_proposals returning existing ProposalRecord, default store configured in proposals AppConfig. Strict RED/GREEN, independent verifier, parent spot/export/pytest before merge.
- [ ] **B1 api** — delegated (writer sonnet; verifier opus).
- [ ] **B2 web** — delegated (writer sonnet; verifier opus). Builds against the contract's API table with a draft
  added to `contracts/openapi.json` (orchestrator regenerates from the real api at integration).
- [ ] **B3 integrate** — inline: merge api then web, regenerate contract/types, env parsing for the contract's
  settings, full checks, `make e2e` + `make bot-smoke`, merge to `main`, push.

## Acceptance (from the contract)
- Task CRUD with owners, due dates, nudges; packing templates from the registry; `/viaje tareas|listo`.
- Budget forecast computed from chosen+booked proposals × price basis × participants with manual FX.
- Documents: upload allowlist + size limits, Fernet-encrypted storage, `owner_only`, `kind=id` forced owner-only, authorized download with `Content-Disposition`, thumbnails never from `/media`.

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

### B0 seam decision
- Add get_proposal_snapshot(proposal_id:str)->ProposalRecord|None and list_trip_proposals(trip_id:str,statuses:Collection[str]|None=None)->list[ProposalRecord] through existing ProposalStore.get/list_for_trip and default-store factory pattern from trips. No crossapp models/adapters imports; preserve current bounded list500. M4 derives location label from preview.site_name/title or empty (preview has no location_label).
- Core bridge writer owns api/proposals ports/AppConfig/use_cases/tests only; API writers defer budget/subscribers until bridge integrated. Default-store setup is framework adapter work; use cases stay pure.

### Dispatch decisions
- Reconciled actual file/full observation before dispatch; task file locator in root checkout is authoritative for Codex resumption notes (worktrees predate docs commits).
- Web parallel draft JSON/generated paths stay feature-owned, not contracts/openapi.json; feature-local openapi-fetch client uses exported CSRF middleware/credentials. At API integration replace with shared generated paths/client and remove draft artifacts (parent-owned integration). M4 contract-local document types allowed until M3 types exist.
- Record coherent work-unit slices from contract test list, with RED/GREEN/checks/rollback in reports. Estimates: M3 3000–5000, M4 2000–3500 authored lines; direct-main exception-ok authorized (no PR chain).
- M3 task numbers require persistent app-owned sequence, never reuse after deleting highest. M4 nullable tray DayOut.date; no bot/push phone fallback.

### B0 supplemental prerequisite and launch
- M4 bot requires pure get_trip_snapshot(trip_id:str)->TripData|None for all-status trips, not get_trip requiring injected store. Extended bridge writer ownership to new trips use case/tests/README only; separate RED/GREEN and work-unit commit.
- Proposal bridge writer commit5462b14: RED missing module → GREEN11 focused; full1827pytest,Ruff/format,10importcontracts,migration drift/export unchanged. Independent verification pending before parent merge.
- Launched B1 M3 API writer in m3-api and B1 M4 API writer in m4-api. M3 web writer launched in m3-web using completed mapping actor due runtime thread limit; all retain exact writer ownership/no-subagent rules. M4 web/map queued until slot available, not dropped.
- Vault storage decision: bounded whole-file Fernet with atomic temp-save (15MiB upload cap), avoids unsafe unauthenticated chunk framing; persistent TaskSequence prevents deleted-number reuse. cryptography direct runtime dependency to confirm with Context7.
