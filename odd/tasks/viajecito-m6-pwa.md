# Feature: M6 — PWA, push, map and polish

- Feature id: `viajecito-m6-pwa` · Engram mirror: `odd/viajecito-m6-pwa/tasks` · Created 2026-10-01 · Wave A
- Contract (single source of truth for scope, ownership, API, tests): `docs/contracts/m6-pwa.md`
- Branches: `feat/m6-api` (worktree `~/Development/viajecito-worktrees/m6-api`) and
  `feat/m6-web` (worktree `~/Development/viajecito-worktrees/m6-web`), both from `main` after the
  core registries land; merged into `main` by the orchestrator.

## Objective and demo
Installable PWA with countdown and offline cache of Today and documents list, Web Push via VAPID mirroring group reminders, a proposals map (after M1 merges), a11y pass, Cloudflare Access note and the restore drill checklist. Demo: install on a phone, receive a push, open Today with no signal.

## Ownership (summary; the contract has the exact lists)
- api apps: `notifications` · web: `features/pwa`, `features/push`, `features/map` · sections: (none; overview card + settings) · messages: `web/messages/es-AR/pwa.json, push.json, map.json` · bot: reminder channel `push` registered via `register_channel`

## Constraints
- Strict TDD (RED observed → GREEN → REFACTOR); runners `cd api && uv run pytest`, `cd web && pnpm test`.
- Rules for parallel work in `AGENTS.md` (append-only shared files, no edits to core or other milestones,
  `member_of_trip` on everything, snake_case, `{code,message}` errors, voseo copy only in copy files).
- Models: writers sonnet, verifiers opus (user decision). Delivery: merge to `main` + push per milestone.

## Tasks
- [x] **A1 api** — done: 13 commits; verifier REQUEST CHANGES → fixed (no phones in payloads, config errors classified, per-person caps + fair budget, allowlist fallback, prune once/day, 307 regression test); 701 tests; merged into main locally.
- [x] **A2 web** — done: verifier REQUEST CHANGES (shared-device purge, subscription resync, click origin) → fixed; 274 tests; core files providers.tsx/TripOverview.tsx/ShellHeader.tsx edited with permission; merged b843de0. — delegated (writer sonnet, worktree `m6-web`; verifier opus; one correction round).
  Builds against the contract's API table; generates types from a draft added to `contracts/openapi.json`
  in its branch; the orchestrator regenerates from the real api at integration.
- [x] **A3 integrate** — api d160f71 + c23bcf0 (safe_path) + web b843de0 merged; map task still pending (after M1). — inline: merge api then web, regenerate contract/types, env parsing for the
  contract's settings, full checks, `make e2e` + `make bot-smoke`, merge to `main`, push.

## Acceptance (from the contract)
- Manifest + service worker (Serwist), install prompt, countdown.
- `PushSubscription` endpoints authenticated; 410 prunes; VAPID keys from settings.
- Map renders proposals with lat/lng (read-only use of M1's endpoint; implemented after M1 merges).

## Progress
| Task | Status | Evidence |
|---|---|---|
| A1 | **done** (verifier REQUEST CHANGES → corrected; 701 tests; merged) | writer: notifications 122 passed; full suite 666 + 1 core test fixed on main (209110c, reminders.isolated()); ruff/lint-imports clean; export idempotent |
| A2 | done | Corrected and merged b843de0; Wave A delivered |
| A3 | done (Wave A) | Prior export/types/e2e/bot-smoke/push; map tracked separately |

## Map continuation — 2026-10-01
- M1 delivered main ec96636; created feat/m6-map worktree ~/Development/viajecito-worktrees/m6-map. Prior full observation2708 is stale for already integrated PWA/push; actual document/core state preserved.
- [ ] **M1 map** — delegated web writer (2+non-trivial files), strict TDD from AGENTS `pnpm test`; contract m6-pwa.md/README addenda, reads M1 endpoint through paths types. Independent verifier, one correction round, parent spot/checks, regenerate/smoke/push.
- Forecast >400 authored lines allowed via user direct-main exception-ok delivery; coherent work-unit commits, no code golf. RDD off clone_local disabled/unmanaged. No remote operations, dependency APIs/version evidence via Context7 before pinning.
- Map insertion into core overview/routes only through orchestrator request; writer owns contract files/appends and must not write others. New work starts after mapping, no unsafe draft contracts.

- Map writer may edit package.json and lockfile for Leaflet/react-leaflet/types as explicit contract exception; confirm versions/APIs via Context7 before pinning. Own map static route + overview card module=proposals/order11; no new nav module. Estimate400–800 authored lines direct-main exception-ok.

### Map dispatch — parallel acceleration
- M1 map writer m4_web_writer launched in m6-map after completing M4web7891dea. Ownership remains map-only/static route/map copy/tests and allowed registry appends; explicit package/lock dependency exception approved. Different independent map verifier required (author cannot self-verify).
- Strict TDD ON from AGENTS with pnpm test, Context7 dependency evidence, full web checks; no Docker/push/remote/subagents. Reads existing real M1 paths; no feature-local draft needed.
- Global premium/fun visual foundation is a separate workstream; map uses shared primitives and does not edit them.

### Final map correction — 2026-10-02
- Independent map review8a751c5 reproduced two P2 gaps: nested main/secondh1 under trip shell and Leaflet popup-close24px instead of44px. Full582 tests/build pass; actual mocked-tile browser proof in /tmp/m6-map-verifier.
- Same author m4_web_writer receives its ONE correction round, scoped map source/tests only. RED/GREEN plus integrated landmark/touch measurements, independent corrected-diff recheck/parent spot then merge required.

### Observed map integration — 2026-10-02
- ONE correctiondd6409d independently APPROVED: focused13/full584, types/lint/drift/build; real390/1440 mocked tiles, main1/h1one/axe0,44px close fully inside popup after Leaflet auto-pan settles.
- Parent merged2244443 after export1980pytest, frozen deps/actual regenerated types/typecheck/lint595webtests/drift/build green. Parent map spot inspected corrected scope and independent browser proof.
- Map source/review/main integration complete; M1 map checkbox remains open for final combined smoke and push only. Production offline Today/documents check will run after M4 web integration.

### Delivery verification checkpoint — 2026-10-02
- Final source: `f863d22`; final permission fix `b969336` independently approved and merged only after export + 2,010 API tests passed. Frozen dependencies, Ruff/587 formatted files, 14 import contracts and migration drift passed. Regenerated contract/types unchanged; 665 web tests, typecheck, lint, drift and production build passed.
- Native isolated final runtime: full Playwright 10 passed / 2 production-only skips; those two passed separately against the production build. Actual cached ticket remains listed offline; its unsaved file is unavailable. Fresh isolated bot database passed exact pong/reply, duplicate replay and tick with zero errors. Six mobile views had unique landmarks and no overflow. Actual upload and packing quantity edits persisted after reload.
- Final C5 proof on f863d22: three browser uploads plus a forced-private ID upload returned consistent can_delete=true for the uploader; another member cannot delete a crew document and receives 404 for private metadata/files. Own runtime processes stopped, local ports closed, tracked checkout and sample env unchanged.
- Docker final make e2e failed before browser tests because daemon storage became read-only/containerd metadata I/O failed. Scoped cleanup could not be confirmed. Final Docker bot/production targets were not run. Earlier Docker e2e (9 passed / 2 production skips) and bot smoke passed before final source integration. Native proof does not turn this failed Docker gate green; no daemon restart or unrelated service changes were attempted.
- Authorized source push is next. Docker recovery/reverification remains open; Pi/T11 deployment, real provider captures, VAPID/production vault keys and backup/restore remain owner actions, not completed here.
