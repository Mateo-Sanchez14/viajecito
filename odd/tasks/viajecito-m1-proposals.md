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
