# viajecito — conventions for agents and humans

viajecito is a trip-planning app for one friend group (the gastito crew): a web/PWA planning hub
(Next.js) + a Django backend + WhatsApp capture and reminders through gastito's Gowa instance.
Self-hosted on a Raspberry Pi (arm64). Task tracking lives in `odd/tasks/*.md`.

## Language

- Code, identifiers, comments, docstrings, commit messages, i18n keys, docs: **English**.
- User-facing copy (web UI, bot messages): **Rioplatense Spanish with voseo** ("Tirá el link acá",
  "¿La marcamos como elegida?"). It lives only in `web/messages/es-AR.json` and
  `api/messaging/copy/es_ar.py`. Never hardcode Spanish strings in components or handlers.

## Layout

```
api/        Django (Ninja) backend — apps by capability
web/        Next.js app (App Router, TypeScript, Tailwind v4)
contracts/  openapi.json snapshot exported from the api (owned by api)
deploy/     docker/ (Dockerfiles), dev/fake_gowa (Gowa stub), compose.pi.yml, systemd/, scripts/
odd/        ODD feature documents (owned by the orchestrator)
```

Per Django app: `models.py` (persistence adapter), `domain.py` (pure rules), `use_cases/<verb_noun>.py`,
`ports.py`, `adapters/`, `api.py` (Ninja router), `schemas.py`, `tests/`. Use cases and domain import
nothing from Django or HTTP. `import-linter` enforces: `shared` depends on no other project package;
`trips` never imports plugins (e.g. `ski`); `messaging` reaches other apps only through their `use_cases`.

Web: `src/ui/{atoms,molecules,organisms,templates}` are presentational and prop-driven (no fetching);
`src/features/<capability>/{containers,components,hooks,api}` fetch and wire (container/presentational);
`src/shared/{api,lib,i18n}` for cross-cutting code.

## API contract

- Django Ninja API mounted at `/api/`; `config/api.py` exports `api`. OpenAPI JSON at
  `/api/openapi.json`, docs at `/api/docs`.
- Snapshot committed at `contracts/openapi.json`, regenerated with
  `cd api && uv run python manage.py export_openapi_schema --api config.api.api --output ../contracts/openapi.json --indent 2`.
- Web generates `web/src/shared/api/schema.d.ts` from it (`pnpm api:types`, committed) and uses
  `openapi-fetch`. CI fails on drift (`pnpm api:types:check`).
- Health: `GET /api/health` → `200 {"status":"ok","version":"<semver>","checks":{"db":"ok","media":"ok"}}`;
  `503` with `status:"degraded"` and the failing check as `"error"`.

## TDD (strict)

RED observed → GREEN → REFACTOR for every work unit. No production code without a failing test first.
Runners: `cd api && uv run pytest` · `cd web && pnpm test` · `cd web && pnpm test:e2e` (Playwright).
Tests never touch the network (`pytest-socket` on the api, MSW on the web).

## Commits

Conventional Commits, English, imperative, scoped: `feat(api): …`, `test(web): …`, `chore(deploy): …`.
One work unit per commit: a behavior with its tests and docs. No attribution trailers of any kind.
Never push unless explicitly asked.

## Toolchain and runtime conventions (M0 contract)

- **api**: Python 3.13, `uv` (lockfile committed), Django 5.2 LTS, Django Ninja, gunicorn, whitenoise,
  `environs` for env parsing. Settings modules `config.settings.{base,dev,prod,test}`; default
  `DJANGO_SETTINGS_MODULE=config.settings.dev`. Env: `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`,
  `PUBLIC_ORIGIN` (e.g. `https://viajecito.example.com` → `ALLOWED_HOSTS` + `CSRF_TRUSTED_ORIGINS`),
  `DATABASE_PATH` (default `<repo>/data/db.sqlite3`), `MEDIA_ROOT` (default `<repo>/data/media`),
  `STATIC_ROOT` (default `<repo>/data/static`), `GOWA_BASE_URL`, `GOWA_BASIC_AUTH_USER`,
  `GOWA_BASIC_AUTH_PASS`, `GOWA_WEBHOOK_SECRET`. SQLite: WAL, `synchronous=NORMAL`,
  `busy_timeout=5000`, `foreign_keys=ON`, `transaction_mode=IMMEDIATE`. Dev run
  `python manage.py runserver 0.0.0.0:8000`; prod run
  `gunicorn config.wsgi:application -b 0.0.0.0:8000 --workers 2 --threads 4 --worker-class gthread`
  after `migrate` and `collectstatic --noinput`.
- **web**: Node 24, pnpm (lockfile committed), current stable Next.js (App Router, TypeScript,
  Tailwind v4, `src/` dir), `output: "standalone"`. Dev `pnpm dev -H 0.0.0.0 -p 3000`; build
  `pnpm build`; start `node .next/standalone/server.js`. Env: `API_INTERNAL_URL` (default
  `http://localhost:8000`; in compose `http://api:8000`) used by server components and the dev
  rewrite of `/api/:path*`. Scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:e2e`,
  `api:types`, `api:types:check`.
- **ports**: api 8000, web 3000, fake-gowa 4000.
- **fake Gowa (dev)**: `deploy/dev/fake_gowa` mimics Gowa's `POST /send/message`
  (body `{"phone","message","reply_message_id"?}`, optional Basic auth, response
  `{"code":"SUCCESS","message":"Message sent","results":{"message_id":"<id>","status":"<text>"}}`),
  records sends at `GET /__sent`, clears with `DELETE /__sent`, `GET /health`.
- **docker**: images from `deploy/docker/api.Dockerfile` and `deploy/docker/web.Dockerfile` with
  build context = repo root; dev compose `docker-compose.yml` (api, web, fake-gowa, bind mounts,
  `./data` volume); Pi compose `deploy/compose.pi.yml` (M0c). Images target `linux/arm64`.

## Boundaries for parallel writers

Each writer owns one subtree and never writes outside it:
- **api writer**: `api/**` and `contracts/openapi.json`.
- **web writer**: `web/**`.
- **platform writer**: `Makefile`, `docker-compose.yml`, `.env.example`, `.github/**`, `deploy/**`, `README.md`.
Nobody edits `AGENTS.md` or `odd/**` (orchestrator-owned). Writers never spawn sub-agents. Confirm
current library versions and APIs with Context7 before pinning; do not rely on memory.

## M0b contract: login with WhatsApp (identity + crews)

JSON is **snake_case** (Django Ninja default). Error bodies are `{"code": "<snake_case_code>", "message": "<English, developer-facing>"}`;
the web never shows `message`, it maps `code` to an i18n key. Phone numbers are accepted in free form and
normalized with `phonenumbers` (default region `AR`; AR mobiles normalize to `+549…`, CL to `+569…`); every
response carries E.164.

| Endpoint | Request | Success | Errors |
|---|---|---|---|
| `GET /api/auth/csrf` | — | `200 {"csrf_token": str}` and sets the `csrftoken` cookie | — |
| `POST /api/auth/otp/request` | `{"phone": str}` | `202 {"status": "sent", "retry_after_seconds": 60, "expires_in_seconds": 300}` — **identical body and latency whether or not the phone is eligible** (no enumeration); eligible = active `CrewMembership` or pending `Invite` | `400 invalid_phone`; `429 rate_limited` + `Retry-After` header; `503 delivery_unavailable` (kill switch off or Gowa send failed) |
| `POST /api/auth/otp/verify` | `{"phone": str, "code": str}` | `200 {"person": PersonOut}` and sets the session cookie; rotates the CSRF token | `400 invalid_phone` / `invalid_code` / `expired_code` / `too_many_attempts` (challenge locked after 5 wrong codes) |
| `POST /api/auth/logout` | — | `204` | `401 unauthenticated` |
| `GET /api/me` | — | `200 {"person": PersonOut, "crews": [CrewSummaryOut]}` | `401 unauthenticated` |

Schemas: `PersonOut {id: uuid, phone: E.164, display_name: str, locale: str}`;
`CrewSummaryOut {id: uuid, name: str, role: "admin"|"member", gastito_group_url: str|null, default_trip_id: uuid|null}`.

Rules the api enforces (and tests): one live `OtpChallenge` per phone; 6-digit code from `secrets`, stored only as
HMAC-SHA256 with the server pepper; expiry 5 minutes; 5 attempts then locked; single use; constant-time compare.
Rate limits counted in the DB: per phone 1/60 s and 5/h; per IP 10/h (IP from `CF-Connecting-IP`, else
`REMOTE_ADDR`); global 30/h. Delivery: synchronous `POST {GOWA_BASE_URL}/send/message` with Basic auth, body
`{"phone": "<digits>@s.whatsapp.net", "message": <copy from api/messaging/copy/es_ar.py>}`; log an
`OutboundMessage(kind="otp")` with the body redacted. Unsafe requests must send `X-CSRFToken` matching the
`csrftoken` cookie (the webhook in M0c is the only `csrf_exempt` route).

Env (api): `OTP_DELIVERY_ENABLED` (default `1`), `OTP_PEPPER` (required; dev default in `.env.example`),
`OTP_CODE_TTL_SECONDS` (300), `OTP_MAX_ATTEMPTS` (5). Bootstrap: `python manage.py bootstrap_crew --name <name>
--chat-id <...@g.us> --admin-phone <phone>` creates the crew, its WhatsApp link and the admin membership.

Web (M0b): `/login` under `src/app/(public)/` (phone step → code step → redirect to `next` or `/`);
everything under `src/app/(app)/` is behind a server-side `GET /api/me` check that redirects to `/login` on
`401`; a logout action; copy in `messages/es-AR.json` keyed `auth.*`. Playwright `e2e/login.spec.ts` reads the
code from fake Gowa (`GET /__sent?phone=`) against the dev stack.

Fake Gowa (M0b): add `GET /__sent/latest?phone=<E.164 digits>` returning the newest send for that phone (404 if none).

## Auth gate rule (web, from M1 on)

The `(app)` layout calls `requireMe()` and redirects anonymous visitors to `/login`, but Next.js layouts do
not re-run on client navigation and do not stop a page segment from rendering. Any server page or server
component under `(app)` that fetches data itself must call `requireMe()` (wrapped in React `cache()` so the
call is deduplicated per request) before fetching. The api enforces auth on every endpoint regardless.

### M0b contract amendments (accepted after T5 verification, 2026-10-01)

- `503 delivery_unavailable` is returned only when `OTP_DELIVERY_ENABLED` is off. A Gowa send failure
  is recorded on the `OutboundMessage` row (`status=failed`) and logged, and the caller still gets the
  identical `202`, because surfacing it would reveal which phones are eligible.
- Delivery runs off the request path: the send is submitted from `transaction.on_commit` to a small
  module-level thread pool. `OTP_SEND_SYNC=1` (test settings) runs it inline. Queued sends are lost on a
  worker restart; the user simply requests a new code.
- Extra error codes: `403 csrf_failed` on any unsafe route without a valid CSRF token, and
  `400 invalid_request` for validation errors on fields other than `phone`/`code`.
- Django Ninja 1.x has no `NinjaAPI(csrf=True)`; CSRF is checked automatically only for cookie-auth
  routes (`django_auth`). Anonymous unsafe routes (`otp/request`, `otp/verify`) call Django's CSRF
  check explicitly through `shared/api_errors.enforce_csrf`.
- `OTP_PEPPER` is required in prod (fails at settings import when empty) and has a dev-only fallback.
- `TRUST_CF_CONNECTING_IP` (env; `1` in prod, `0` elsewhere) decides whether the per-IP rate limit reads
  `CF-Connecting-IP` or `REMOTE_ADDR`.
- Accepted risks: the global 30/h limit counts ineligible phones (deliberate); the rate-limit check and
  insert are not atomic (bounded by the per-phone 1/60 s window).

## M0c contract: Gowa webhook, inbound ledger, bot commands, tick, Pi deploy

### Webhook (api)
- `POST /hooks/gowa/` is a plain Django view (`csrf_exempt`, outside the Ninja `/api` mount) that reads the
  RAW body, verifies `X-Hub-Signature-256: sha256=<hex>` (HMAC-SHA256 with `GOWA_WEBHOOK_SECRET`; the
  `sha256=` prefix is optional; `hmac.compare_digest`), and **fails closed**: empty secret or bad/missing
  signature → `403 {"code":"invalid_signature"}`. Never does network I/O in the request path and answers
  in well under a second. Gowa retries up to 5 times per URL with a 30 s budget, so idempotency is mandatory.
- Payload shape follows `go-whatsapp-web-multidevice/docs/webhook-payload.md` (top-level `event`,
  `device_id`, `payload` with `id`, `chat_id`, `from`, `from_lid`, `from_name`, `body`, `replied_to_id`,
  `quoted_body`, `timestamp`, `is_from_me`). `messaging/gowa/parser.py` turns it into a `GroupMessage`
  dataclass; `normalize_jid` strips the `:device` suffix.
- Filtering before any insert: `event != "message"` → `200 {"status":"ignored","reason":"event"}`;
  `is_from_me` → ignored `own_message`; `chat_id` not ending in `@g.us` → ignored `not_group`; no
  `WhatsAppGroupLink` for the chat → ignored `unlinked_group` (nothing stored). Otherwise
  `InboundMessage.get_or_create` on **unique (device_id, gowa_message_id)**: existing → `200
  {"status":"duplicate"}`; new → `200 {"status":"accepted"}` and, on commit, `process_inbound(id)` is
  submitted to the messaging executor (same pattern as the OTP sender; `OTP_SEND_SYNC`-style
  `MESSAGING_PROCESS_SYNC=1` in tests).
- `InboundMessage` fields per the plan (`device_id`, `gowa_message_id`, `event`, `chat_id`, `sender_jid`,
  `sender_lid`, `sender_name`, `person` nullable, `body`, `replied_to_id`, `raw` JSON, `status`
  received|processing|done|ignored|failed, `attempts`, `error`, `outcome` JSON, `received_at`, `processed_at`).
- Processing: resolve the sender (`WhatsAppIdentity` by `jid`, then by `lid`, then trigger a roster sync for
  that crew once and retry; unresolved → status `ignored`, reason `unknown_sender`), then run the handler
  chain, first match wins: `commands` (`/viaje <sub>` or `/v <sub>`, accent- and case-insensitive) → later
  handlers (quoted card, link capture) are M1. Unknown subcommand → the help text. Replies go to the group
  through `OutboundMessage(kind="reply")` + `GowaClient.send_text(chat_id, body, reply_to=gowa_message_id)`.
- Commands in M0c: `/viaje ping` → `"pong"`; `/viaje ayuda` → the command list. Copy lives in
  `api/messaging/copy/es_ar.py` (voseo).
- Roster sync: `GET {GOWA_BASE_URL}/group/participants?group_id=<chat_id>` returns participants with
  `jid`, `phone_number`, `lid`, `display_name`; `sync_roster(crew)` upserts `Person` (by phone),
  `WhatsAppIdentity` (jid/lid) and `CrewMembership(role=member, source=group_sync)` for every participant;
  members no longer in the group are NOT removed automatically (removal is manual). Record
  `WhatsAppGroupLink.last_synced_at`.
- `tick` management command (idempotent, safe to run every minute): takes `JobLock(name="tick",
  locked_until)` and exits 0 silently when another tick holds it; sweeps `InboundMessage` rows stuck in
  `processing` longer than `INBOUND_STUCK_MINUTES` (default 2) back to `received` (≤ 3 attempts, else
  `failed`); re-processes `received` rows; dispatches `OutboundMessage` rows with status `queued`
  (`attempts` < 3); runs `sync_roster` for crews whose `last_synced_at` is older than `ROSTER_SYNC_HOURS`
  (24). Prints a one-line JSON summary.
- `replay_gowa` management command: `python manage.py replay_gowa <fixture.json> [--url
  http://localhost:8000/hooks/gowa/]` signs the file's bytes with `GOWA_WEBHOOK_SECRET` and POSTs them,
  printing status and body. Fixtures in `api/messaging/tests/fixtures/gowa/` are derived from the Gowa docs
  with redacted phones until real captures replace them (T11).
- Env (api): `GOWA_WEBHOOK_SECRET` (required in prod), `GOWA_DEVICE_ID` (optional; sent as `X-Device-Id`),
  `INBOUND_STUCK_MINUTES` (2), `ROSTER_SYNC_HOURS` (24), `MESSAGING_PROCESS_SYNC` (0; 1 in tests).

### Pi deployment (platform)
- `deploy/compose.pi.yml` (project `viajecito`): `api` from `ghcr.io/${GHCR_OWNER}/viajecito-api:${IMAGE_TAG:-latest}`
  with `env_file: /srv/viajecito/pi.env`, volume `/srv/viajecito/data:/data`, healthcheck on
  `/api/health`, `restart: unless-stopped`; `web` from `ghcr.io/${GHCR_OWNER}/viajecito-web:${IMAGE_TAG:-latest}`
  with `API_INTERNAL_URL=http://api:8000`; `cloudflared` (`cloudflare/cloudflared`) running
  `tunnel --no-autoupdate run` with `TUNNEL_TOKEN` from the env file. **No published ports**: cloudflared
  reaches `api:8000` and `web:3000` on the compose network, so nothing collides with the WAHA/`notify`
  services already on the Pi, which are never touched.
- Ingress (configured in the Cloudflare dashboard for a token tunnel, or in
  `deploy/cloudflared/config.yml.tpl` for a credentials-file tunnel): `https://<host>/api/*`, `/hooks/*`,
  `/media/*`, `/admin/*`, `/static/*` → `http://api:8000`; everything else → `http://web:3000`.
- `deploy/env/pi.env.example`: `DJANGO_SECRET_KEY`, `PUBLIC_ORIGIN=https://<host>`, `DATABASE_PATH=/data/db.sqlite3`,
  `MEDIA_ROOT=/data/media`, `STATIC_ROOT=/data/static`, `OTP_PEPPER`, `OTP_DELIVERY_ENABLED=1`,
  `TRUST_CF_CONNECTING_IP=1`, `GOWA_BASE_URL=https://<gowa-host>`, `GOWA_BASIC_AUTH_USER`,
  `GOWA_BASIC_AUTH_PASS`, `GOWA_WEBHOOK_SECRET`, `GOWA_DEVICE_ID`, `TUNNEL_TOKEN`, `GHCR_OWNER`, `IMAGE_TAG`,
  `BACKUP_RESTIC_REPOSITORY`, `BACKUP_RESTIC_PASSWORD`, `HEALTHCHECKS_URL` (optional).
- systemd units in `deploy/systemd/`: `viajecito-tick.service` + `.timer` (every minute:
  `docker compose -f /srv/viajecito/compose.pi.yml exec -T api python manage.py tick`) and
  `viajecito-backup.service` + `.timer` (daily 04:00 local, runs `backup.sh`).
- Scripts in `deploy/scripts/` (run ON the Pi, never over ssh from this repo): `deploy.sh` (pull images,
  `up -d`, wait for health, run `smoke.sh`), `backup.sh` (SQLite online `.backup` into
  `/srv/viajecito/backups/db-<date>.sqlite3`, then `restic backup` of the snapshot + `/srv/viajecito/data/media`,
  `restic forget --keep-daily 7 --keep-weekly 4 --prune`, optional healthchecks ping), `restore.sh`
  (restore a snapshot into a stopped stack), `smoke.sh` (public `/api/health` 200; a signed POST from a
  fake chat to `/hooks/gowa/` returns `ignored`; `systemctl list-timers` shows both timers; `restic
  snapshots` lists at least one after the first backup).
- `Makefile`: `replay FIXTURE=<path>` → `cd api && uv run python manage.py replay_gowa ../$(FIXTURE)`;
  `deploy` prints the runbook pointer (deployment is executed on the Pi).
- Go-live checklist (owner actions, documented in `deploy/README.md`): create the Cloudflare tunnel and
  hostname; fill `/srv/viajecito/pi.env`; add the second URL to gastito's Gowa env on the droplet
  (`WHATSAPP_WEBHOOK=http://bot:8000/webhooks/gowa/,https://<host>/hooks/gowa/`, gastito first, brief Gowa
  restart); land the gastito change that ignores `/viaje`, `/v` and link-only messages; run
  `bootstrap_crew` with the real `chat_id`; send `/viaje ping` in the group.
