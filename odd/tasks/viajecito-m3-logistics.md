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
