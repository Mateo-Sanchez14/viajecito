# Feature: M1 — proposals and link capture

- Feature id: `viajecito-m1-proposals` · Engram mirror: `odd/viajecito-m1-proposals/tasks` · Created 2026-10-01 · Wave A
- Contract (single source of truth for scope, ownership, API, tests): `docs/contracts/m1-proposals.md`
- Branches: `feat/m1-api` (worktree `~/Development/viajecito-worktrees/m1-api`) and
  `feat/m1-web` (worktree `~/Development/viajecito-worktrees/m1-web`), both from `main` after the
  core registries land; merged into `main` by the orchestrator.

## Objective and demo
Any link dropped in the group (or pasted on the web) becomes a proposal card with preview, category, votes, comments and a status that closes (proposed → discussing → chosen → booked, discarded). Demo: paste a link in the group, see the card in WhatsApp and the proposal on the web; vote; mark it chosen.

## Ownership (summary; the contract has the exact lists)
- api apps: `proposals`, `linkpreview` · web: `features/proposals` · sections: `proposals/` · messages: `web/messages/es-AR/proposals.json` · bot: link capture handler (order 30), quoted-card handler (order 20), `/viaje propuestas`

## Constraints
- Strict TDD (RED observed → GREEN → REFACTOR); runners `cd api && uv run pytest`, `cd web && pnpm test`.
- Rules for parallel work in `AGENTS.md` (append-only shared files, no edits to core or other milestones,
  `member_of_trip` on everything, snake_case, `{code,message}` errors, voseo copy only in copy files).
- Models: writers sonnet, verifiers opus (user decision). Delivery: merge to `main` + push per milestone.

## Tasks
- [x] **A1 api** — delegated (writer sonnet, worktree `m1-api`; verifier opus; one correction round).
- [x] **A2 web** — delegated (writer sonnet, worktree `m1-web`; verifier opus; one correction round).
  Builds against the contract's API table; generates types from a draft added to `contracts/openapi.json`
  in its branch; the orchestrator regenerates from the real api at integration.
- [x] **A3 integrate** — inline: merge api then web, regenerate contract/types, env parsing for the
  contract's settings, full checks, `make e2e` + `make bot-smoke`, merge to `main`, push.

## Acceptance (from the contract)
- Link in group → `accepted` → proposal created with unfurled preview (SSRF-guarded fetcher) → card reply with web URL.
- Same URL again in the trip → +1 and "ya estaba" reply.
- Web: list with filters, detail, vote, comment, status controls; majority suggestion.
- `proposal.status_changed` published on every transition.

## Progress
| Task | Status | Evidence |
|---|---|---|
| A1 | integrated/verified | adcc1cb; 1778 pytest + export/lint/migrations |
| A2 | integrated/verified | bd6c33d; 569 web tests/typecheck/lint/types/build |
| A3 | delivered | dece82f;1815 API/571 web; e2e8pass2production skips; bot-smoke passed |

## Resumption — 2026-10-01 (Codex)
- Baseline: clean `main`/`origin/main` at `fafb953`; handoff records A1/A2 verified and corrected, but existing checklist/mirror is stale. Do not mark complete until integration checks reproduce.
- A3 route: delegated preparation/mapping (4+ files), delegated bounded integration writers (2+ non-trivial files), orchestrator merges/spot checks and owns this document.
- Strict TDD source: AGENTS.md; API `uv run pytest`, web `pnpm test`; RED required for new integration behavior.
- Delivery: user explicitly authorizes direct-to-main merge/push (existing exception to PR chain), then Wave B only after M1 smoke and push. RDD: `off`, source `clone_local`; delivery disabled/unmanaged.
- Forecast: existing M1 branch >400 authored lines; preserve already verified work-unit slices and direct-main delivery. New integration corrections tracked separately.
- Integration checklist: API merge/export/pytest/lint-imports/ruff/migration drift; web union/regenerate/typecheck/lint/test/types drift/build; ski form; wave A env parsing; shared PersonRefOut; make e2e; make bot-smoke; push SHA.
- Shared-main protocol: clean main before every merge, no UU commit, no merge commit before API export and pytest pass. Stop on unexpected changes; never overwrite WAHA work.
- Current next step: finish and independently verify bounded integration corrections; run sequential e2e/bot smoke; push only after green.

### Reproduced integration evidence
- API merged `adcc1cb`: export succeeded; pytest 1778 passed (17.16s); import-linter 10 kept/0 broken; Ruff passed; makemigrations no changes.
- Web merged `bd6c33d`: conflicts resolved by directory-derived messages union, overview-card union, exported OpenAPI and generated TS. API re-export + pytest 1778 passed (13.20s) before merge commit; web typecheck/lint passed, 569 tests/95 files passed, api:types:check and production build passed.
- Additional structural `git diff --check --cached` warned about inherited new blank EOF lines in VoteButtons.test.tsx and ProposalBoard.tsx; no code changed merely for cosmetics. Functional gates passed.
- Bounded corrections (delegated; strict TDD; no push by writers): `codex/m1-settings` owns API env/test settings/shared PersonRefOut; `codex/m1-platform-env` owns root/deploy env and dev compose; `codex/m1-ski-form` owns ski form/tests. Independent verifier + one correction round + parent spot check pending for each.
- A1/A2 historical RED/GREEN proof remains the previous-session handoff; this session reproduced integration GREEN, not historical RED. A3 stays unchecked until smoke/push.

### Integration corrections and runtime gate
- Settings/schema work units: `60a705f`/`4b67c3b`, merged `8b83d7a`; independent approval, RED 35 failed/24 passed → GREEN 1815 passed; parent focused spot 62 passed. Ruff, 10 linter contracts, migrations and export pass.
- Platform work unit: `0a87594`, merged `f6fff4a`; independent approval, RED 43 assertions → GREEN 3 tests and 33 existing helper assertions; parent 3 tests passed. Append-only env examples, explicit static dev previews, optional VAPID preserved.
- Ski work unit: `10be55d`, merged `737f9c7`; independent approval, RED 2 failed/6 passed → GREEN 8 focused and 570 full; parent reproduced 570. Type/lint/types/build pass. No actionable verifier findings, so correction rounds were unnecessary.
- Each correction merge exported schema and passed 1815 pytest before commit (12.22s / 12.66s / 11.85s). Contract/types regenerated with no drift. Authored corrections: 454 additions+deletions across work units; direct-main delivery exception explicitly authorized, no PR chain.
- Runtime RED: `make e2e` on 737f9c7: 2 failed, 6 passed, 2 skipped. Failures: proposals immediate sent-card assertion; signed-in PWA heading missing. Root causes not yet verified. Dev skips cover production-only service worker/offline tests; those remain pending production verification.
- [x] **A3-E1** — delegated web e2e correction, branch `codex/m1-e2e-fix`, worktree `m1-e2e-fix`; observed runtime RED above; independent verification/correction/spot check then rerun full smoke required. No scope expansion.
- `make bot-smoke` is running sequentially after e2e stack cleanup. Push and Wave B remain blocked by e2e gate.

### A3-E1 independent verifier correction
- Writer `4a52e18`: self-contained webhook capture/shared auth and accessible home h1; unit RED2→GREEN2, 570 full checks pass; writer e2e8passed/2production-only skips. Parent CrewTrips spot2passed.
- Independent e2e reproduced 7passed/1failed/2skipped: axe `aria-prohibited-attr` on TripList loading div with aria-label but no role, confirmed by delayed trip-list response. No auth loss.
- Single correction round sent to SAME writer: valid loading status semantics + RED/GREEN regression; retain axe without suppressions/waits. Reverify then parent final integrated e2e/bot smoke before push.

### A3-E1 correction terminal verification
- Same-writer correction `b5278fb`: TripList named role=status with gated-MSW loader/removal regression; RED1failed/3passed→GREEN4passed. All571 tests and type/lint/types/build pass. Parent focused CrewTrips/TripList spot6passed.
- Same independent verifier terminal APPROVE `4a52e18` + `b5278fb`: deterministic axe exact original fails/corrected0violations; full571 tests/lint pass; e2e8passed/2production-only skips (11.4s). No unresolved findings.
- Parent merging corrected web candidate after API export/pytest, then final main `make e2e` and `make bot-smoke` sequentially. Push remains pending until both pass; Wave B not launched.

### Final integrated verification (2026-10-01)
- Corrected e2e merged `dece82f` only after API export/1815 pytest (12.11s).
- Parent final main `make e2e`: exit0, 8passed/2production-only skipped (20.3s). Parent sequential `make bot-smoke`: passed; pong, duplicate replay, tick errors0. Docker cleaned. Logs `/tmp/viajecito-m1-final-e2e.log`, `/tmp/viajecito-m1-final-bot.log`.
- Pending checks honestly retained: production SW registration and offline Today/documents; not executable in dev harness, deferred to production stack/M4 integration.
- Functional implementation A1/A2/A3/E1 complete; push is the next authorized delivery action. No native receipt (RDD disabled/unmanaged).
- Next feature work starts only after push succeeds: M3/M4 API+web and M6 map, each writer in isolated worktree, independent verifier, one correction round, spot check, API before web, regenerate/smoke/push.

### Delivery confirmation
- Initial push rejected because concurrent remote `5b1bc71` added production dependency regression. Preserved it with no-FF merge `ec96636`, union runtime dependencies, removed duplicate dev httpx, regenerated uv lock offline.
- Reverification:1816pytest12.04s,10importcontracts,Ruff/migrations/export/types pass; parent e2e8pass2production-only skips11.4s; bot-smoke passed.
- Successful `git push origin main`: `5b1bc71..ec96636`. M1 delivered, main clean. Wave B preparation begins from ec96636.
