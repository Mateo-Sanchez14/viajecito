# Feature: M0 — foundation (skeleton, WhatsApp OTP login, Gowa webhook, Pi deploy)

- Feature id: `viajecito-m0-foundation` · Engram mirror topic: `odd/viajecito-m0-foundation/tasks`
- Plan of record: `~/.claude/plans/quiero-que-hagamos-una-sprightly-wall.md` (outside the repo)
- Branch: `feat/m0-foundation` (from `main`). Parallel writer branches `feat/m0a-*` in worktrees under
  `~/Development/viajecito-worktrees/<name>`, merged by the orchestrator.
- Created: 2026-10-01

## Objective

Stand up the monorepo (Django Ninja api + Next.js web + platform), ship WhatsApp OTP login, the Gowa
webhook with an idempotent inbound ledger, and a deployable Raspberry Pi stack, all under strict TDD.

## Problem and why

The crew plans trips in a WhatsApp group where links get lost and nothing gets decided. viajecito
gives the group a planning hub that captures from the group they already use. M0 is the foundation
every later milestone (proposals, decisions, logistics, itinerary, ski, PWA) builds on.

## Scope

- M0a scaffolding: api skeleton with health endpoint and OpenAPI export; web skeleton with i18n
  (es-AR, voseo), typed API client and a health smoke feature; platform (Makefile, dev compose,
  fake Gowa, Dockerfiles, CI).
- M0b identity: `identity`, `crews`, Gowa client, OTP login flow, web login page and authenticated shell.
- M0c messaging + deploy: `/hooks/gowa/` with HMAC + `InboundMessage` ledger, `/viaje ping|ayuda`,
  `tick` skeleton, Pi compose, cloudflared, systemd timers, backup/restore scripts, smoke test.

Out of scope: proposals, link unfurling, decisions, logistics, itinerary, ski, PWA/push (M1–M6).

## Constraints

- **Strict TDD** (source: `~/.claude/CLAUDE.md`, "Strict TDD Mode: enabled"). Runners:
  api `cd api && uv run pytest`; web `cd web && pnpm test`; e2e `cd web && pnpm test:e2e`.
  RED must be observed before GREEN; evidence recorded per task.
- **RDD: disabled for this clone on 2026-10-01** (user decision after `lens_context_budget_exceeded`; global stays on). Verification = opus verifier per writer + checks + smoke. Historical rule kept for reference: after each integration commit on `feat/m0-foundation`:
  `gentle-ai review assess --cwd <repo> --agent claude-code --base-ref <last reviewed boundary> --committed-only --json`
  and follow `review_due`. First boundary: `main`.
- **Models** (user decision 2026-10-01): writers run on `sonnet`, verifiers on `opus`.
- **Delivery strategy**: `ask-on-risk`. Forecast exceeds ~400 authored lines → chained delivery; the
  chain strategy (`stacked-to-main` | `feature-branch-chain`) is asked once before the first PR.
  Local work-unit commits on the feature branch proceed; push/PR/merge remain the user's decisions.
- Conventions and the M0 runtime contract: `AGENTS.md`. Writers never touch `AGENTS.md` or `odd/`.
- Language: artifacts in English; UI/bot copy in Rioplatense Spanish (voseo) via i18n files only.

## Tasks

Legend: route = `inline` (orchestrator) | `delegated` (one bounded writer + one verifier).

### M0a — scaffolding (parallel, isolated worktrees)

- [x] **T1 api skeleton** — route: delegated (writer sonnet, worktree `m0a-api`, branch `feat/m0a-api`; verifier opus).
  Deliver: `api/` with uv project (Python 3.13, Django 5.2 LTS, Django Ninja, gunicorn, whitenoise,
  environs), `config/settings/{base,dev,prod,test}.py`, SQLite WAL + `transaction_mode=IMMEDIATE`,
  `shared/` (clock), `ops/` app with `GET /api/health` (200 ok / 503 degraded), OpenAPI export to
  `contracts/openapi.json`, ruff, import-linter (first contracts), pytest config (`pytest-socket`),
  `api/.env.example`, `api/README.md`.
  Acceptance: `uv run pytest` green incl. `ops/tests/test_health.py` (ok + degraded) and
  `tests/test_sqlite_pragmas.py` (journal_mode == wal on a file-based test DB); `uv run ruff check .`
  and `uv run lint-imports` clean; `export_openapi_schema` reproduces `contracts/openapi.json`.
- [x] **T2 web skeleton** — route: delegated (writer sonnet, worktree `m0a-web`, branch `feat/m0a-web`; verifier opus).
  Deliver: `web/` Next.js (current stable, App Router, TS, Tailwind v4, `src/`, `output: standalone`),
  `next-intl` single locale `es-AR` without routing + `messages/es-AR.json` (English keys, voseo),
  typed client (`openapi-typescript` from `../contracts/openapi.json` → `src/shared/api/schema.d.ts`,
  `openapi-fetch` browser + server clients), TanStack Query provider, atomic design folders with
  `HealthBadge` molecule + `features/ops` `HealthStatus` container on the home page, vitest + RTL +
  MSW tests, Playwright config + one smoke spec, scripts `lint typecheck test test:e2e api:types api:types:check`,
  dev rewrite `/api/:path*` → `API_INTERNAL_URL`, `web/.env.example`.
  Acceptance: `pnpm lint`, `pnpm typecheck`, `pnpm test` green (HealthBadge + HealthStatus with MSW);
  `pnpm api:types:check` clean; `pnpm build` succeeds.
- [x] **T3 platform** — route: delegated (writer sonnet, worktree `m0a-platform`, branch `feat/m0a-platform`; verifier opus).
  Deliver: `Makefile` (`up down logs test api-test web-test lint api-schema api-types api-types-check`
  + documented placeholders `replay deploy`), dev `docker-compose.yml` (api, web, fake-gowa; bind
  mounts; `./data`), `deploy/docker/{api,web}.Dockerfile` (+ `api-entrypoint.sh`; multi-stage, dev
  and prod targets, arm64-friendly, non-root), `deploy/dev/fake_gowa/` (FastAPI stub per AGENTS.md
  with pytest tests), `.github/workflows/{api,web,platform,images}.yml`, root `.env.example`,
  expanded `README.md` quickstart.
  Acceptance: fake-gowa `pytest` green; `docker compose config -q` passes; workflows valid YAML;
  Dockerfiles follow the AGENTS.md runtime contract (built for real in T4).
- [x] **T4 integrate M0a** — route: inline.
  Merge `feat/m0a-{api,web,platform}` → `feat/m0-foundation`; regenerate `contracts/openapi.json`
  from the real api and `pnpm api:types`; run all checks; `docker compose build` + `make up` smoke
  (`/api/health` via web rewrite and fake-gowa `/health`); RDD assess on the range `main..HEAD`.

### M0b — identity, crews, OTP

- [x] **T5 api identity + crews + OTP** — route: delegated. `identity` (Person, WhatsAppIdentity,
  OtpChallenge), `crews` (Crew, WhatsAppGroupLink, CrewMembership, Invite), `messaging/gowa/client.py`,
  endpoints `GET /api/auth/csrf`, `POST /api/auth/otp/request`, `POST /api/auth/otp/verify`,
  `POST /api/auth/logout`, `GET /api/me`; rate limits in DB; `bootstrap_crew` command.
  Acceptance: tests listed in the plan (phone normalization, OTP policy, request/verify APIs, Gowa client).
- [x] **T6 web login + authenticated shell** — route: delegated. Login page (phone step, code step,
  voseo copy), session-aware shell, redirect rules, `LoginForm.test.tsx` with MSW.
- [ ] **T7 fake-gowa OTP exposure + Playwright login** — route: delegated. `GET /__sent` already
  exposes codes; `e2e/login.spec.ts` reads the code and logs in against the dev stack.
- [x] **T8 integrate M0b** — route: inline. Merge, regenerate contract/types, full checks, RDD assess.

### M0c — webhook, ledger, Pi deploy

- [ ] **T9 webhook + ledger + commands** — route: delegated. `messaging/gowa/{signature,parser}.py`
  (fail closed), `/hooks/gowa/` view (ACK fast, idempotent on `(device_id, gowa_message_id)`),
  `InboundMessage`/`OutboundMessage`, handler chain with `/viaje ping` and `/viaje ayuda`,
  `tick` + `JobLock` skeleton, `replay_gowa` command and captured fixtures.
- [x] **T10 Pi deploy** — route: delegated. `deploy/compose.pi.yml`, `cloudflared/config.yml.tpl`,
  `systemd/viajecito-{tick,backup}.{service,timer}`, `scripts/{deploy,backup,restore,smoke}.sh`,
  `env/pi.env.example`, `images.yml` publishing arm64 images to GHCR.
- [ ] **T11 integrate M0c + Pi smoke** — route: inline. Requires user input: public hostname,
  Cloudflare tunnel, adding the second webhook URL to gastito's Gowa env on the droplet (brief Gowa
  restart), and the gastito change that ignores `/viaje` and link-only messages.

## Acceptance criteria (M0 as a whole)

1. A crew member logs into the web on a phone with a code received on WhatsApp.
2. `/viaje ping` in the real group returns "pong" from the shared bot number; replaying the same
   Gowa payload creates exactly one ledger row.
3. `make up` runs api + web + fake-gowa locally; `make test` is green; CI is green.
4. The Pi stack deploys with `make deploy` and passes `smoke.sh`; nightly backup timer installed.

## Progress and evidence

| Task | Status | Route | Branch / commits | Checks observed |
|---|---|---|---|---|
| T1 | **done** 2026-10-01 (verifier opus: APPROVE WITH MINORS → 5 minors fixed in one correction round) | delegated | `feat/m0a-api`: 88ddcdd, 3ecc6a7, d89d7cb, 1e28b08, f7840ca, 9f6edab | writer: `uv run pytest` 23 passed; `ruff check` + `ruff format --check` clean; `lint-imports` 1 kept/0 broken; `manage.py check` ok; `migrate` ok on fresh path; schema export idempotent (same md5 twice). RED observed per unit (collection errors before implementation). Verifier reproduced all checks; after corrections `uv run pytest` 27 passed, contract unchanged. Orchestrator spot check: `uv run pytest` 27 passed in 0.29s; `lint-imports` 1 kept/0 broken; tree clean. |
| T2 | **done** 2026-10-01 (verifier opus: REQUEST CHANGES → 1 blocker, 2 majors, minors fixed in one correction round) | delegated | `feat/m0a-web`: 1cfd2d6, 982219c, b2acb63, db2f519, 458df7e, d00d114, 05894a9, 2ebf413, eaf6582 | writer: `pnpm lint` clean; `pnpm typecheck` clean (also from fresh checkout); `pnpm test` 5 files / 14 passed; `pnpm api:types:check` exit 0 (exit 1 on drift); `pnpm build` ok (Next 16.3.8, standalone server.js present); no Spanish outside es-AR.json. RED observed per unit (unresolved imports before implementation). Not run: Playwright. Verifier blockers/majors fixed: `public/` added, `fetchHealth` throws on non-200/503 (RED 3 failed → GREEN 19 passed) + ErrorBoundary, `start` runs standalone server, rewrite only outside production, server-only client. Orchestrator spot check: `pnpm test` 19 passed; `pnpm typecheck` clean; tree clean. |
| T3 | **done** 2026-10-01 (verifier opus: REQUEST CHANGES → 3 blockers, 1 major, 5 minors fixed in one correction round) | delegated | `feat/m0a-platform`: 531058f, 1d2f473, 7990fb6, 02f50b1, fa9e762, 67d7c70, 29160b7, e8d63a4 | writer: fake-gowa `uv run pytest` 13 passed; `docker build` fake-gowa ok + `/health` answers; `docker compose config -q` ok; 4 workflows parse; `make help` 15 targets; `make -n up/test` ok. RED observed (ModuleNotFoundError app before implementation). Not built: api/web images (no api/web in that worktree). Verifier blockers fixed: pnpm version conflict in web.yml, pnpm-workspace.yaml copied into web image, recursive .dockerignore globs; env_file optional; healthcheck-based depends_on. Orchestrator spot check: fake-gowa `uv run pytest` 13 passed; `docker compose config -q` without .env ok; tree clean. |
| T4 | **done** 2026-10-01 | inline | `feat/m0-foundation`: d6d7199 (merge api), 031fff6 (merge platform), a6bfe23 (merge web), edbf2cc (types from real contract), 93d253b (M0b contract draft) | integrated tree: api `uv run pytest` 27 passed, ruff + lint-imports clean; fake-gowa 13 passed; web lint/typecheck clean, `pnpm test` 19 passed, `api:types:check` no drift, `pnpm build` ok; images built: api prod+dev, web runner; api prod image: entrypoint migrates + collectstatic + gunicorn, `/api/health` 200; web runner `GET /` 200; `docker compose up --build`: api healthy, fake-gowa healthy, web `GET /` 200, rewrite `/api/health` 200. Follow-up: api entrypoint ignores CMD args (use `--entrypoint python` for ad-hoc `manage.py`). |
| T5 | **done** 2026-10-01 (verifier opus: REQUEST CHANGES → 1 major + 6 minors fixed in one correction round) | delegated | `feat/m0b-api`: e25d7ee, a8f95e3, d2c716f, 17c944e, 3a04979, 49442d5, 16e7400, 89afa8b, a99e349, e08a659, 493312c, 7f892b6 | writer: `uv run pytest` 135 passed; ruff check/format clean; `lint-imports` 4 kept/0 broken; `manage.py check` ok; `makemigrations --check` clean; fresh migrate ok; OpenAPI export idempotent + `test_openapi_contract.py` guards staleness. RED observed per unit (collection ImportErrors). Declared deviations: 503 only when delivery disabled; send via on_commit executor (`OTP_SEND_SYNC` for tests); Ninja 1.7 has no `csrf=True` → manual `enforce_csrf()` on anonymous routes; extra codes `403 csrf_failed`, `400 invalid_request`; `OTP_PEPPER` dev fallback. Correction round: guarded `reserve_attempt` before comparing (stub-repo test: of 20 stale attempts exactly 5 compared), `TRUST_CF_CONNECTING_IP` (off outside prod), inactive person → invalid_code, prod fails at import on empty pepper, admin phones normalized, invites cancelled on removal (`cancelled_at`), CSRF-only auth scheme before body validation + 403 documented. Orchestrator spot check: `uv run pytest` 151 passed; `lint-imports` 4 kept; export matches committed contract; tree clean. |
| T6 | **done** 2026-10-01 (verifier opus: APPROVE WITH MINORS → minors fixed in one correction round) | delegated | `feat/m0b-web`: ced438c, 4bd281f, 6f3e5da, 208a50c, 761d63d, c21dcce, cc0d6f0, 1bef2cf, d46b489 | writer: `pnpm lint`/`typecheck` clean; `pnpm test` 12 files / 65 passed; `pnpm build` ok (`/`, `/login` dynamic, proxy registered); `api:types:check` clean; RED observed per unit except `safeNextPath` (admitted). Not run: Playwright. Deviations: CSRF cache in `src/shared/api/csrf.ts`; new `src/proxy.ts` sets `x-next-path`; `next` read server-side. Correction round: CSRF retry once on 403 csrf_failed + generation counter (RED 3 failed → GREEN), root `error.tsx`, 429-on-resend countdown from Retry-After, a11y hints, initialPhone, copy fixes, e2e clears sends + waits for the code field + parses `message`, retries 0. Orchestrator spot check: `pnpm test` 73 passed; typecheck ok; no Spanish outside messages; tree clean. |
| T7 | **done** 2026-10-01 (verifier opus: REQUEST CHANGES → 1 blocker, 3 majors, minors fixed in one correction round) | delegated | `feat/m0b-platform`: 68c0ba6, 48d9cae, 132ac6a, c737d94, 9a8a703, 455262a | writer: fake-gowa `uv run pytest` 18 passed (5 new RED first); image builds, `/__sent/latest?phone=123` → 404 JSON; `docker compose config -q` ok (no .env / --env-file .env.example); `e2e.yml` parses; `make -n e2e|e2e-keep|bootstrap-dev-crew` ok. Not run: `make e2e` (needs api/web). Verifier blocker fixed: dev api now migrates on start and `bootstrap-dev-crew` migrates first; e2e uses `DATA_DIR=./data/e2e`; help regex; CI installs web deps before the stack; `--reporter=github,html` + test-results artifact; trap teardown. Orchestrator spot check: fake-gowa 18 passed; compose config ok; help lists e2e targets; tree clean. |
| T8 | **done** 2026-10-01 | inline | `feat/m0-foundation`: e9c1867 (merge web), d738667 (merge platform), 7bcd712 (merge api), 4e48dfa (types), 084f6a4 (merge api corrections), f6ab364 (types) | integrated tree: api `uv run pytest` 151 passed, ruff + lint-imports clean, contract export unchanged; web lint/typecheck clean, `pnpm test` 73 passed, types regenerated from the real contract; fake-gowa 18 passed; `make e2e` run 1 (before the last api corrections): fresh stack healthy, migrate + bootstrap ok, Playwright 2 passed (anonymous → /login; login with the WhatsApp code from fake Gowa) in 6.9s. Run 2 on the final state (after the api correction merge + types f6ab364): Playwright 2 passed in 5.2s; stack torn down; tree clean. |
| T9 | verified + corrected 2026-10-01 (verifier opus: APPROVE WITH MINORS + 1 major → all fixed); follow-up T9b (bootstrap admin identity) running | delegated | `feat/m0c-api`: f9379bd, c3c22b7, aef2e8c, ec481dd, 73ddfce, 7a347f6, 5373d4b, bba2087, ff3e953, 70f3f72, 341093d, cf98947, 5096c41, ff68e92 | writer: `uv run pytest` 279 passed (201 before); ruff check/format clean; `lint-imports` 4 kept/0 broken; `manage.py check` ok; `makemigrations --check` clean; fresh migrate ok; OpenAPI unchanged. RED observed per unit. Declared deviations: import-linter relaxation for gateway adapters; `apps.get_model` in crews store; `claimed_at`; `invalid_message` ignore reason; reply dedupe; tick lock release + 60 s skip; bot excluded from roster; prod requires GOWA_WEBHOOK_SECRET. Open: payload shape doc-derived (verifier cross-checked against Gowa source `event_message.go`: all fields match). Correction: active crew membership required (`not_a_member`), queued outbound claimed `queued→sending` before send + 15 s deadline + sweep, roster failure requeues (≤3) then `roster_unavailable`, on-demand sync throttled (300 s), per-chat reply throttle (1/3 s, 20/10 min), `sent_at` stored, concurrent-delivery test (two threads → one row). Orchestrator spot check: `uv run pytest` 303 passed; `lint-imports` 4 kept; integrated tree 303 passed, contract unchanged. |
| T10 | **done** 2026-10-01 (verifier opus: REQUEST CHANGES → 3 majors + 10 minors fixed in one correction round) | delegated | `feat/m0c-platform`: 6745be7, 27253bb, 0ca3585, d502500, 0beb4de, 21e4703, ec30ef3, 7209c71, 3ed256b, 9cfd5e6 | writer: `compose.pi.yml config -q` ok with scratch env (no ports); `shellcheck` clean; `test_lib.sh` 12/12; unit files parse; `make -n replay|deploy`, `make help` ok; `images.yml` parses (+ optional `tag` input). Not run against real Cloudflare/restic/Pi. Self-reported risks: pi.env passed whole to api (TUNNEL_TOKEN, restic creds); webhook secret on `openssl` cmdline; docs for cloudflared/restic/systemd not checked (verifier confirmed them). Correction: api.env + pi.env split (cloudflared gets only TUNNEL_TOKEN, pinned 2026.9.3), restic stable path `backups/current/db.sqlite3`, HMAC via python3 with the secret in env, `format: raw` + literal env parser + `restic.sh` wrapper, per-timer smoke checks, snapshot assertion, umask 077, latest tag only from main, network-online ordering, wal/shm preserved on restore, Compose >= 2.30 documented. Orchestrator spot check: compose config per-service env verified (cloudflared only TUNNEL_TOKEN; api no TUNNEL_TOKEN/BACKUP_*; no ports); shellcheck clean; test_lib 12/12; tree clean. |
| T11 | pending (needs user input) | inline | — | — |

## Forecast (authored changed lines, lockfiles and generated files excluded)

M0a ≈ 1800 · M0b ≈ 1600 · M0c ≈ 1400 → ≈ 4800 for M0. Exceeds the ~400 heuristic → chained delivery;
chain strategy to be asked before the first PR. Slice boundaries will be recorded here.

## Next step

M0a and M0b done (login with a WhatsApp code works end to end against fake Gowa). Launch T9 (api: webhook, ledger, commands, tick, replay) and T10 (platform: Pi compose, cloudflared, systemd timers, backup/restore/smoke scripts) writers in parallel in worktrees `m0c-api`, `m0c-platform` (branches `feat/m0c-*` from `feat/m0-foundation`), then one opus verifier each, then T11 (needs user input for the Pi).

## RDD log

- 2026-10-01 — workspace candidate (this document only): START → `approved`, risk `low`
  (`non_executable_only`), no lenses; acknowledged, authority burned (lineage `review-5563843267c76319`).
- 2026-10-01 — committed range `main..HEAD` (docs + `.gitignore`): assess → risk `medium`
  (`executable_change` .gitignore), `review_due: false`, reason `under_budget`; boundary stays `main`.
- 2026-10-01 — M0a integrated range `main..HEAD` (98 paths, 10652 lines incl. lockfiles): assess →
  risk `high` (`executable_mode` api/manage.py, `process_boundary`, `shell_source` api.yml),
  `review_due: true`. STATUS → START with consent relay; user answered `granted`; START failed in
  preflight with `lens_context_budget_exceeded` (no authority created). User decision: disable RDD
  for this clone (`gentle-ai review mode disable --scope clone`). From here delivery follows ordinary
  repository policy (`disabled/unmanaged`); verification = opus verifiers + checks + smoke.

### M0c follow-ups (added 2026-10-01 after verification)

- [x] **T9b** (api, delegated, commit 539a642, 306 tests; merged): `bootstrap_crew` also creates the admin's `WhatsAppIdentity` so the admin can
  `/viaje ping` before the first roster sync.
- [ ] **T10b** (platform, delegated): fake Gowa `GET /group/participants` + seeding (`PUT /__groups/{id}`),
  `deploy/scripts/bot_smoke.sh` + `make bot-smoke` (replay `/viaje ping` → `pong` reply, duplicate → `duplicate`,
  `tick` runs), CI job.
