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
- [ ] **A1 api** — delegated (writer sonnet, worktree `m1-api`; verifier opus; one correction round).
- [ ] **A2 web** — delegated (writer sonnet, worktree `m1-web`; verifier opus; one correction round).
  Builds against the contract's API table; generates types from a draft added to `contracts/openapi.json`
  in its branch; the orchestrator regenerates from the real api at integration.
- [ ] **A3 integrate** — inline: merge api then web, regenerate contract/types, env parsing for the
  contract's settings, full checks, `make e2e` + `make bot-smoke`, merge to `main`, push.

## Acceptance (from the contract)
- Link in group → `accepted` → proposal created with unfurled preview (SSRF-guarded fetcher) → card reply with web URL.
- Same URL again in the trip → +1 and "ya estaba" reply.
- Web: list with filters, detail, vote, comment, status controls; majority suggestion.
- `proposal.status_changed` published on every transition.

## Progress
| Task | Status | Evidence |
|---|---|---|
| A1 | writer running (sonnet, launched 2026-10-01 after M-core bc1bece) | — |
| A2 | verifier APPROVE WITH MINORS → correction round running (es-AR price parsing, empty title PATCH, paths-derived input types, rollback test, link scheme guard) | writer: lint/typecheck/test/build/api:types:check green |
| A3 | pending | — |

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
