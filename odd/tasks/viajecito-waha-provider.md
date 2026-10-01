# Feature: WAHA as the WhatsApp provider (Pi go-live)

- Feature id: `viajecito-waha-provider` · Engram mirror: `odd/viajecito-waha-provider/tasks` · Created 2026-10-01
- Branches: `feat/waha-api` (worktree `~/Development/viajecito-worktrees/waha-api`) and
  `feat/waha-platform` (worktree `~/Development/viajecito-worktrees/waha-platform`), both from `main`;
  merged into `main` by the orchestrator.

## Objective
Production talks to WhatsApp through the WAHA container already running on the Pi (dedicated bot number,
compose project `waha`, network `waha_default`, alias `waha`, port 3000 inside), not through gastito's Gowa.

## Why
User decision 2026-10-01: "tenemos que usar el contenedor de WAHA que ya está andando en la raspberry"; the
WAHA session uses the bot's own number. Replaces decision D5 (reuse gastito's Gowa) for production: no droplet
change, no gastito change, no double replies. The webhook travels over the Docker network, not the tunnel.

## Scope and constraints
- Keep the Gowa adapter (dev stack and e2e use fake Gowa); add a WAHA adapter selected by
  `WHATSAPP_PROVIDER` (`gowa` default | `waha`). Ports (`messaging/ports.py`) and use cases unchanged.
- Strict TDD (RED observed → GREEN → REFACTOR); runner `cd api && uv run pytest`; platform tests under
  `deploy/scripts/tests` with their existing runner. No network in tests.
- Writers sonnet, verifiers opus, one correction round. Confirm WAHA API details with Context7
  (`/devlikeapro/waha-docs`) before coding; the WAHA image on the Pi was built 2026-09-22 (`gows-arm` engine,
  so the GOWS engine applies).
- Advisory size: about 400 authored lines per task; not a gate.

## Contract (also recorded in AGENTS.md)
See AGENTS.md → "WAHA provider contract (2026-10-01)".

## Tasks
- [ ] **W1 api** — delegated (writer sonnet, worktree `waha-api`; verifier opus). Trigger: 2+ non-trivial files.
- [x] **W2 platform** — delegated (writer sonnet, worktree `waha-platform`; verifier opus). Trigger: 2+ files.
- [ ] **W3 integrate** — inline: merge W1 then W2, env parsing, full checks, merge to `main`, push.
- [ ] **W4 Pi go-live** — inline over `ssh pi` (authorized 2026-10-01): fill env, configure the WAHA session
  webhook (preserving its existing config; needs explicit OK before touching WAHA), restic init, timers,
  `deploy.sh`, `bootstrap_crew`, `/viaje ping`.

## Acceptance
- `POST /hooks/waha/` verifies `X-Webhook-Hmac` (HMAC-SHA512 hex of the raw body) and fails closed.
- Group `message` events from linked groups are stored once per (session, message id) and processed by the
  same handler chain; own messages, non-group chats and unlinked groups are ignored.
- Replies, OTP DMs and roster sync work through WAHA with `X-Api-Key`.
- Prod compose attaches the api to `waha_default` with alias `viajecito-api`; smoke signs with sha512.

## Progress
| Task | Status | Evidence |
|---|---|---|
| Pi prep | done 2026-10-01 | /srv/viajecito layout, env files 600 with generated secrets, restic 0.14, units installed (timers off), images pulled, compose config OK |
| W1 | pending | — |
| W2 | done (correction round applied; ready to merge) | `feat/waha-platform` 6c3b125..3f4b9d3; opus verifier: 1 blocker (smoke dropped last header) + minors, fixed in ccceb0f/3f4b9d3; test_lib.sh 33 ok, shellcheck clean, compose config OK; parent spot check test_lib.sh 0 FAIL |
| W3 | pending | — |
| W4 | pending (needs TUNNEL_TOKEN, host, WAHA api key handling) | — |
