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
- [x] **B0 proposals bridge** — delegated orchestrator-owned prerequisite: pure store-free get_proposal_snapshot/list_trip_proposals returning existing ProposalRecord, default store configured in proposals AppConfig. Strict RED/GREEN, independent verifier, parent spot/export/pytest before merge.
- [x] **B1 api** — delegated (writer sonnet; verifier opus).
- [x] **B2 web** — delegated (writer sonnet; verifier opus). Builds against the contract's API table with a draft
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
| B1 | integrated | Corrected48261d9, parent298c8f0, fullAPI1906 then2004 aftercore |
| B2 | integrated | Final95dcf7c independently665tests/9hydratedviews → parent3e98bf9 after2004API/665web/fullchecks |
| B3 | main integration in progress | Core86cf620/platformfb8e1d8/generator05a41ee/CIffcf36b; finalM3web/e2e/prod/push pending |

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

### B0 packing registry seam
- Additional required pure trips.use_cases.packing_templates(trip_type)->tuple[str,...] exposes registry templates through use-case boundary; M3 still applies generic plus returned plugin templates. No core plugin/model changes, unknown type follows registry semantics.
- Delegated bounded writer on bridge worktree (previous verifier role closed; new authored commit requires DIFFERENT independent verifier), strict TDD/full checks. Original snapshots5462b14/cc6f06e independently approved/full1836. Parent spot20passed; one initial wrong test filename ran0 and was corrected; concurrent focused/full same test DB caused verifier retry disk-I/O, final full green. Avoid concurrent same-worktree pytest.

### Current progress / product clarification pending
- B0 snapshot merge7c4aa56 parentexport/1836pytest13.06s; packing merge328a784 parentexport/1840pytest13.30s. Each independent reviewer approved; coherent commits5462b14/cc6f06e/58c1818. Both API writers authorized to ingest fixed328a784 with export+pytest before branch merge commit.
- M3 API task CRUD unitd934382: initialRED3endpoint404→GREEN9, full1825/Ruff/imports/migrations/export. Persistent numbering prevents deleted-number reuse. Packing/budget/vault continue.
- M3 web writer (actor wave_b_mapping) accepted role change to authorized writer, firstRED5missingmodule suites observed, feature-owned draft paths/client underway. M4 API/domain/CRUD underway; M4 web launched. M6 map queued behind runtime4child slots, not dropped.
- Required core integration remaining: OutboundMessage.subject_id TextField + migration/regression for >6 UUIDs; vault env parsing/stable dev/test keys/requiredprod/limits/MIME/examples. Parent must delegate bounded API core writer when slot opens; never allow milestone writer to edit core.
- Real contract conflict: nag says every due task in one message, core body max4000. Writer proposes bounded titles then, only if still oversized, owner/unowned grouped counts + board link with ALL exact task IDs in subject. This is UNACCEPTED pending one user question; do not silently implement fallback. M3 safe independent units continue.

### Candidate handoff and parallel verification
- B0 outcome observed and integrated: snapshots7c4aa56, packing328a784; independent1840 full API checks. B0 marked complete.
- B1 candidate feat/m3-api d363ed4 clean:1900 API tests, Ruff/imports10/export/migration checks; RED evidence per work unit. Independent verifier is former M4 author m4_api_writer (did not author M3). Pending one correction/parent spot/integration; not completed yet.
- B2 candidate feat/m3-web7f43ede clean:601 tests, frozen install/lint/typecheck/drift/build; draft schema/client cleanup remains parent integration. Independent verification/e2e not yet run.
- User requested faster parallel work and premium/fun visual redesign. UI audit runs separately; M3/M4 feature ownership stays exclusive. No changes to pending nag overflow product decision.

### Delivery resumed — 2026-10-02
- User explicitly requested completing all previously authorized work and continuing execution. API48261d9 correction independently approved1906 full tests. Web7f43ede independent verification and real-schema cleanup remain required. No new product acceptance inferred.
- [x] **C0 integration core** — delegated writer (2+ nontrivial files): Outbound.subject_id TextField with migration/regression; vault env parsing, stable dev/test keys, required/validated prod rotation keys, MIME/limits, API env example/docs; global import-linter contracts for logistics/budget/documents/itinerary. Different verifier and one correction/spot required.
- Platform env examples/Chromium CI owned separately; API writer must not edit them. Strict TDD uv run pytest, RDD off, direct-main exception-ok remains. Nag overflow question still unanswered; unchanged behavior remains pending clarification.

### Observed API integration
- API corrected48261d9 merged298c8f0 after parent export/1906 full tests/imports/Ruff/migrations. Combined with M4:1980 full tests green. Core C0 and web/integration still pending.

- [x] **C1 platform integration** — env examples and CI browser provisioning; mechanical workflow candidate6653428 has RED absence/GREEN ordering evidence, awaiting independent diff/merge. Platform env examples append-only, preserve Pi raw-value conventions.
- [x] **C2 web integration** — delegated actual shared paths/client replacement and removal of owned draft files after independent web reports; functional checks and independent final review required.

### Independent web correction and actual-contract integration
- Candidate7f43ede independently reproduced601 tests/lint/types/build. Two P2: nestedmain/duplicateh1 in logistics/budget/documents under trip shell; packing quantity hidden on reload and lacks edit. Same author wave_b_mapping gets ONE correction round with integrated semantic/quantity regressions (proof Engram2872).
- Parent C2 integration delegation approved to same writer: ingest fixed parent27ffb0a on clean branch with no-ff/no-commit, export+pytest before merge commit; regenerate shared actual types, swap local draft paths/client to shared createBrowserClient, remove draft files. No manual schemas/guessed names. Any genuine actual-contract mismatch gets RED/GREEN in this integration unit. Core/API sources not edited beyond fixed parent ingestion. Independent final review required.

### Platform C1 dispatch scope
- Bounded platform writer owns root .env.example, deploy/env/api.env.example, associated deploy/helper tests/docs only. Append all M3settings with stable dev key sample vs empty requiredprodkey placeholder; preserve existing entries/provider env. Confirm Pi raw-value validation supports ordered rotation keys safely; comma-MIME defaults may remain comment-only if validation forbids lists. No weakening shell/env parsing or secret separation. StrictRED/GREEN, independent verifier, one correction/spot; no API/web/odd/AGENTS changes.

### Observed core/platform integration and real generator seam — 2026-10-02
- C0e506211 independently APPROVED2004tests/14importcontracts/frozen/Ruff/migrations/export; parent merged86cf620 after same complete API gate. C1662b249 independently APPROVED7envtests/33shell assertions/unchanged literal parser; parent mergedfb8e1d8 after2004API/export and focused tests.
- Test-only deterministic ski privacy correction0b984cc: actual UUID contains181, reproducedRED then exact private-field assertions GREEN/full1980; main mergeb64f4f8 after2004pytest. No production privacy code changed.
- [x] **C3 generated request defaults** — delegated bounded web toolchain writer (nontrivial regression plus shared config), isolated codex/openapi-request-defaults fromb64f4f8. Exact upstream pinned openapi-typescript7.13 defaultNonNullable=true incorrectly promotes optional defaulted referenced request fields: API PackingPatchIn has no required list and supports partial PATCH. Set --default-non-nullable false in BOTH api:types and drift script, regenerate only shared schema, compile-test four single-field path-derived PATCH bodies and assert shipped-body only given field. No API behavior/schema changes, no stale packed/position sends, no type casts. Independent verifier and parent regression/fullweb/API merge gate required. TDD strict pnpm test/typecheck; RDD off/direct-main exception-ok.
- Current B2 correctiona98685e plus real-parent ingestion68aeb9a passed1980API beforecommit and606webtests; waits C3 shared generator seam.

- [x] **C4 CI roster seeding** — independently confirmed CI bootstraps only admin while login spec uses a second eligible phone; it would wait for a nonexistent OTP. Delegated bounded platform writer in codex/e2e-ci-roster from current main. Own Makefile named seed-e2e-roster target wrapping existing SEED_E2E_ROSTER, .github/workflows/e2e.yml call after bootstrap, directlyrelated offline regression. Preserve one shared login/session, no real sends/ledger clearing, no recipe duplication. Strict observed RED→GREEN and focused checks; separate verifier, API export/pytest before merge.

- C3 bounded presentation normalization extension authorized after verified API evidence: only web/src/features/ski/lib/passes.ts and its new passes.test.ts. PassIn.product defaults empty string and replacing a pass writes it, so normalize omitted input with product??''; do not preserve stale previous product or weaken PassRow output. Regression omitted clears prior/nonempty explicit preserved/unrelated member unchanged. No other ski/production/schema changes.

### Observed generator/CI/runtime correction integration
- C3c5e5817 independently603tests/8focused/generation audit approved; parent05a41ee after2004API/export and629combinedweb/type/lint/drift/build. C4c9963ed independently5offline regressions approved; mainffcf36b after2004API and5focusedtests. Initial parent focusedtest wrongfilename failedimport; corrected exacttest passed beforecommit.
- Bot-smoke sample-only API-identical750df78 PASS: pong replies exact message, duplicate replay, tick0errors; fullteardown. Todaye2e oldh1 expectation actualRED8pass1fail, parenttest-only1926ff5 observedGREEN9pass2production-onlyskips and independentlyapproved; main4c6b3e9 after2004API gate. No productionpagechange.
- M3web ingested fixed05a41ee as5e642e4 AFTER export/full2004pytest, appended cards union, restored exactownedstash; finalC2cleanSHA checks/review next. Overflow productdecision remains unanswered/unchanged safe failure; not silently accepted.

### Final source integration checkpoint
- B2/C2 final95dcf7c independently APPROVED:36focused/665full127suites/fullwebchecks; ninehydrated320/390/1440 logistics/budget/documents views axe0/nooverflow/1main/1h1; actualquantity-only PATCH edit/reload/clear/32767bound retainedpackedstate. Author correctiona98685e and realcontract95dcf7c; no drafts/casts/stalefields.
- Parent merged3e98bf9 after frozenAPI/export2004pytest/Ruff587/import14/migrationcheck and frozenweb/regeneratedtypes/type/lint665tests/drift/build. Allsource mainclean.
- Exact3e98bf9 sample-only deliveryworktree delegated finalexclusive runtime window: makee2e, bot-smoke, actualproductionSW/offlineToday+seededticket/doclist/no implicitfilecache; no rootambientenv/realprovider/Pi/remote. B3 remains open until proof and observedpush.
- [ ] **P1 oversized nag decision** — awaiting explicit product acceptance of fallback when all tasks cannot fit4000chars. Current safe failure/IDs preserved; no fallback silentlyaccepted. Does not block safe sourceintegration/checks/delivery.

### Final runtime discovery and C5 correction
- Final Docker make e2e failed before browser tests: daemon storage read-only/containerd metadata I/O; scoped teardown unconfirmed. No restart or unrelated-service changes authorized. Final Docker bot/prod targets not run.
- Exact3e98bf9 isolated native equivalent services:10Playwright passed/2production skips; production build/authsetup and2offline tests passed; real cached ticket listed and unsaved actual file unavailable offline; isolated fresh bot DB ping/pong/duplicate/tick passed. Six hydrated mobile views, upload and packing reload passed. All own native runtimes stopped. Native evidence is NOT a Docker target pass.
- [ ] **C5 upload permission metadata** — delegated bounded writer, original M3API author, in codex/doc-upload-permissions fromc86a3d5. Own api/documents/api.py plus directly related API regressions. Actual POST201 returns can_delete:false for its authenticated uploader/owner, persisted GET returns true (UUID/string identity mismatch). Strict observed RED then canonical identity comparison GREEN, preserve actual ACLs and other-member/admin semantics; no extra query or authorization weakening. Independent different verifier, parent spot/export/fullpytest before merge commit, regenerate types/checks, focused actual native upload proof. RDD disabled/unmanaged; exception-ok direct-main/push authorized.
