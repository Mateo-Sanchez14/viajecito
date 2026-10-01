# viajecito api

Django 5.2 + Django Ninja backend. Python 3.13, managed with `uv`.

## Setup

```sh
cd api
uv sync
```

## Run

```sh
uv run python manage.py migrate
uv run python manage.py runserver 0.0.0.0:8000
```

Health: `curl localhost:8000/api/health`. Docs: `/api/docs`. OpenAPI: `/api/openapi.json`.

Production: `python manage.py migrate && python manage.py collectstatic --noinput`, then
`gunicorn config.wsgi:application -b 0.0.0.0:8000 --workers 2 --threads 4 --worker-class gthread`
with `DJANGO_SETTINGS_MODULE=config.settings.prod`.

## Checks

```sh
uv run pytest                  # no network (pytest-socket); file-based SQLite so WAL is tested
uv run ruff check . && uv run ruff format --check .
uv run lint-imports            # architecture contracts
uv run python manage.py check
```

## OpenAPI contract

The committed snapshot lives at `../contracts/openapi.json`. Regenerate after any API change:

```sh
uv run python manage.py export_openapi_schema --api config.api.api --output ../contracts/openapi.json --indent 2
```

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `DJANGO_SETTINGS_MODULE` | `config.settings.dev` | `dev`, `prod` or `test` |
| `DJANGO_SECRET_KEY` | insecure dev key | required in `prod` |
| `DJANGO_DEBUG` | `true` in dev | |
| `PUBLIC_ORIGIN` | `http://localhost:3000` | feeds `ALLOWED_HOSTS` and `CSRF_TRUSTED_ORIGINS` |
| `DATABASE_PATH` | `<repo>/data/db.sqlite3` | SQLite file (WAL, `IMMEDIATE` transactions) |
| `MEDIA_ROOT` | `<repo>/data/media` | |
| `STATIC_ROOT` | `<repo>/data/static` | served by whitenoise |
| `GOWA_BASE_URL`, `GOWA_BASIC_AUTH_USER`, `GOWA_BASIC_AUTH_PASS` | see `.env.example` | WhatsApp gateway (OTP delivery, replies, roster sync) |
| `GOWA_WEBHOOK_SECRET` | empty | HMAC key of `POST /hooks/gowa/`. Empty rejects every delivery (fails closed). **Required in `prod`** |
| `GOWA_DEVICE_ID` | empty | optional; the bot's JID (`<digits>@s.whatsapp.net`, not a free-form id). Sent as `X-Device-Id` and used to skip the bot in roster syncs; a value without `@` logs a warning |
| `MESSAGING_PROCESS_SYNC` | `0` (`1` in tests) | process inbound messages inline instead of on a worker thread |
| `INBOUND_STUCK_MINUTES` | `2` | `tick` requeues `processing` rows older than this |
| `ROSTER_SYNC_HOURS` | `24` | `tick` re-syncs a group roster older than this |
| `ROSTER_SYNC_MIN_INTERVAL_SECONDS` | `300` | minimum gap between on-demand roster syncs triggered by unresolved senders |
| `OTP_PEPPER` | dev value in `dev`; empty elsewhere | HMAC key for stored OTP codes. **Required in `prod`** (settings import fails without it) |
| `OTP_DELIVERY_ENABLED` | `1` | kill switch; `0` makes `POST /api/auth/otp/request` return `503 delivery_unavailable` |
| `OTP_CODE_TTL_SECONDS` | `300` | code lifetime |
| `OTP_MAX_ATTEMPTS` | `5` | wrong codes before a challenge locks |
| `TRUST_CF_CONNECTING_IP` | `0` (`1` in `prod`) | rate limits use `CF-Connecting-IP` only when trusted; otherwise `REMOTE_ADDR` |
| `OTP_SEND_SYNC` | `0` (`1` in tests) | send the WhatsApp message inline instead of on a worker thread |

Only `api/.env` is read (no parent-directory lookup); real environment variables always win.
Data directories are created on settings import if missing.

## Identity and existing databases

`identity.Person` is the Django user model (`AUTH_USER_MODEL`). It replaced the default user model before
any real deployment, so a development database created earlier (`data/db.sqlite3`) must be deleted and
re-migrated: `rm data/db.sqlite3 && uv run python manage.py migrate`.

## Login with WhatsApp (OTP)

Flow: `GET /api/auth/csrf` -> `POST /api/auth/otp/request {"phone"}` -> `POST /api/auth/otp/verify
{"phone","code"}` (sets the session cookie, rotates the CSRF token) -> `GET /api/me`;
`POST /api/auth/logout` ends the session. Unsafe requests need `X-CSRFToken` matching the `csrftoken`
cookie. Error bodies are `{"code","message"}`; `message` is English and developer-facing.

- **Eligibility**: a phone may log in when it has an active crew membership or a pending invite.
- **Anti-enumeration**: `otp/request` always stores a challenge and always answers the same `202` body.
  The Gowa send happens only for eligible phones and off the request path: it is submitted to a
  small module-level `ThreadPoolExecutor` from `transaction.on_commit`, so latency does not depend on
  eligibility. A Gowa failure is logged and recorded on the `OutboundMessage` (`failed`) but never
  returned to the caller. **Deviation from the AGENTS.md table**: `503 delivery_unavailable` is
  returned only when `OTP_DELIVERY_ENABLED=0`, not when Gowa fails (that would leak eligibility).
- **Codes**: 6 digits from `secrets`, stored only as HMAC-SHA256(`phone:code`, pepper), 5 minutes,
  5 attempts, single use, constant-time compare. One live challenge per phone (a new request
  invalidates the previous one).
- **Rate limits** (counted from `OtpChallenge` rows): per phone 1/60 s and 5/h, per IP 10/h, global
  30/h -> `429 rate_limited` with `Retry-After`. The IP is `CF-Connecting-IP` only when
  `TRUST_CF_CONNECTING_IP=1` (the prod default: the api is only reachable through cloudflared, which
  always sets it); otherwise `REMOTE_ADDR`, because in dev the port is public and the header is forgeable.
- **Phones** are accepted in free form and normalized to E.164 with `phonenumbers` (default region AR).
- **WhatsApp copy** lives in `messaging/copy/es_ar.py`; the ledger (`OutboundMessage`) stores OTP
  bodies as `<redacted>`.

### Bootstrap the first crew

```sh
uv run python manage.py bootstrap_crew --name "Los Pibes" --chat-id 120363000000000001@g.us --admin-phone "+54 9 11 5555-1234"
```

Creates the crew, its WhatsApp group link and the admin membership (and the admin person, with a `WhatsAppIdentity` for their phone JID unless they already have one, so their first message in the group resolves without a roster sync). Re-running
it with the same `--chat-id` changes nothing. Invite more people from the Django admin (`Invite`).

### Accepted risks

- The global 30/h limit counts challenges for ineligible phones too. This is deliberate: excluding them
  would make rate-limit behavior reveal which phones are eligible (anti-enumeration).
- The rate-limit check and the challenge insert are not atomic, so a burst of parallel requests can
  slightly overshoot the hourly counts. The per-phone 1/60 s window bounds it, and one live challenge
  per phone means an overshoot never yields more than one usable code per phone.
- Anonymous unsafe routes (`otp/request`, `otp/verify`) are protected by a CSRF-only auth scheme
  (`CsrfCookie`), so a missing token returns `403 csrf_failed` before the body is validated. It shows up
  in the OpenAPI document as an `apiKey` cookie scheme named `csrftoken`.

## Gowa webhook, bot commands and tick

`POST /hooks/gowa/` is a plain Django view (`messaging/webhooks.py`, outside the Ninja mount, CSRF-exempt,
POST only). It never talks to the network: it verifies and stores, then hands off.

1. **Signature**: HMAC-SHA256 of the raw body with `GOWA_WEBHOOK_SECRET`, header `X-Hub-Signature-256`
   (`sha256=` prefix optional). Empty secret, missing or wrong signature: `403 {"code":"invalid_signature"}`.
   Not a JSON object: `400 {"code":"invalid_payload"}`.
2. **Filters** (nothing is stored): `200 {"status":"ignored","reason":...}` with `event` (not a `message`
   event), `invalid_message` (no id or chat), `own_message`, `not_group`, `unlinked_group` (no
   `WhatsAppGroupLink` for the chat).
3. **Ledger**: `InboundMessage` is unique on `(device_id, gowa_message_id)`, so Gowa's retries answer
   `200 {"status":"duplicate"}`. A new message answers `200 {"status":"accepted"}` and, after commit,
   `process_inbound` runs on a small thread pool (inline when `MESSAGING_PROCESS_SYNC=1`).

Processing resolves the sender through `identity` (`WhatsAppIdentity` by JID, then LID) and requires an
**active** `CrewMembership` in the crew linked to the chat. Otherwise it runs one roster sync (skipped when
the last one is younger than `ROSTER_SYNC_MIN_INTERVAL_SECONDS`) and retries; still failing means status
`ignored` with `outcome.reason` `unknown_sender` or `not_a_member` (removed, or a member of another crew).
If Gowa is down during that sync the row goes back to `received` for the tick (up to 3 attempts, then
`ignored` / `roster_unavailable`). Then the handler chain (registered in `messaging/router.py`, see below) runs (first match
wins). Commands: `/viaje <sub>` or `/v <sub>`, case, accent and whitespace tolerant: `ping` replies
`pong`, `ayuda` lists the commands, anything else replies with a hint; plain text has no handler
(`outcome.reason = "no_handler"`, status `done`). Replies go to the group as a threaded
`OutboundMessage(kind="reply")` with a dedupe key per inbound message, so a reprocessed row never
replies twice. Replies are throttled per chat (one every 3 s, 20 per 10 minutes, counted from the ledger);
a throttled command is recorded as `outcome.reply = "throttled"` and nothing is sent. Exceptions are recorded on the row (`failed` + `error`), never raised. Copy is in
`messaging/copy/es_ar.py`.

**Roster sync** (`crews/use_cases/sync_roster.py`): `GET /group/participants?group_id=` upserts `Person` by
E.164 phone, their `WhatsAppIdentity` (JID and LID) and a `member` / `group_sync` membership for new
phones. It never downgrades an admin, never reactivates a `removed` member and never removes members who
left the group. Participants without a phone (LID only) are skipped.

**`tick`** runs every minute (a systemd timer on the Pi). It takes the `JobLock("tick")` (120 s) and exits
silently when another tick holds it. A pass stops starting new work 15 s before the lock expires, and queued
outbound rows are claimed (`queued` -> `sending`) before sending, so a tick that overlaps a slow one never
sends the same message twice; `sending` rows stuck for `INBOUND_STUCK_MINUTES` go back to `queued` (delivery
is at-least-once in that crash case). Each pass requeues `processing` rows older
than `INBOUND_STUCK_MINUTES` (at most 3 attempts, then `failed`), processes `received` rows, sends `queued`
outbound messages older than 60 s (`attempts` < 3; redacted OTP rows are failed, never resent), refreshes
rosters older than `ROSTER_SYNC_HOURS`, and prints a one-line JSON summary.

```sh
uv run python manage.py tick
uv run python manage.py replay_gowa messaging/tests/fixtures/gowa/group_command_ping.json \
    --url http://localhost:8000/hooks/gowa/
```

`replay_gowa` signs the fixture bytes with `GOWA_WEBHOOK_SECRET` and prints the HTTP status and body. The
fixtures in `messaging/tests/fixtures/gowa/` are derived from the Gowa docs with fake phones until real
captures replace them.

Production requires `GOWA_WEBHOOK_SECRET` (settings import fails without it) and, for replies and roster
syncs, `GOWA_BASE_URL` plus the Basic-auth pair of the Gowa instance.

## Trips, trip-type plugins and how a new app plugs in

Core (`trips`, plus `crews`/`messaging` hooks) is the only place that knows about every app; milestone
apps plug in without editing it.

**Trips.** `Trip(crew, name, type, status, start_on, end_on, destination_label, timezone, currency,
fx_rates)` and `Participation(trip, person, rsvp)` (unique per trip and person). Rules live in
`trips/domain.py` (`end_on >= start_on`, 3-letter uppercased currency, closed status and RSVP sets);
`timezone` defaults to the crew's on creation; `crews.Crew.default_trip` (nullable FK, `SET_NULL`, a string
reference so `crews` never imports `trips`) is set by the first `POST` when empty and shown as
`default_trip_id` by `/api/me`. All endpoints use `django_auth` and the `{code, message}` error envelope:

| Endpoint | Success | Notes |
|---|---|---|
| `GET /api/crews/{crew_id}/trips` | `200 [TripSummaryOut]` | |
| `POST /api/crews/{crew_id}/trips` | `201 TripOut` | creator gets `rsvp=in`; `type` must be a registered plugin |
| `GET /api/trips/{trip_id}` | `200 TripOut` | `modules` from the plugin registry; `participants` lists every active crew member (`pending` without a row; `display_name` falls back to the phone); `my_rsvp` likewise |
| `PATCH /api/trips/{trip_id}` | `200 TripOut` | any active member; partial; `null` clears a date; dates validated after merging |
| `PUT /api/trips/{trip_id}/participation` | `200 ParticipantOut` | sets the caller's own RSVP (creates the row) |

Errors: `400 invalid_request`, `401 unauthenticated`, `403 csrf_failed`, `404 not_found` (non-members,
removed members, unknown ids: existence is never revealed).

**Plugin registry** (`trips/plugins.py`). `TripTypePlugin(key, label_key, modules, packing_templates=(),
reminder_rules=())`; `register`, `get`, `all`, `modules_for(type)` (unknown keys fall back to `generic` and
log a warning). Registering an existing key raises `DuplicatePluginError`. Core registers `generic`
(`proposals, dates, logistics, itinerary, today, budget, documents`) in `TripsConfig.ready()`; another app
registers its own type the same way (`ski` = generic modules + `"ski"`). `trips` never imports a plugin app
(import-linter).

**Authorization helpers.** Every milestone endpoint goes through one of them:

- `crews.api_auth.member_of_crew(request, crew_id)` -> the caller's active `CrewMembership`.
- `trips.api_auth.member_of_trip(request, trip_id)` -> `TripAccess(trip, membership)`.

Anonymous callers get `401 unauthenticated`; everyone else without an active membership gets
`404 not_found`. **Deviation from the AGENTS.md contract**: it names `shared/api_auth.py`, but `shared` may
not depend on any other project package (import-linter), and the helpers need the membership and trip
models, so they live in `crews/api_auth.py` and `trips/api_auth.py`. The pure rule is
`crews.use_cases.authz.require_active_member(person_id, crew_id, store)` (raises `crews.domain.NotMember`).

**Router auto-discovery.** `config/api.py` mounts, for every app in `PROJECT_APPS`, `<app>.api.router` at
`<app>.api.PREFIX` (default `""`). Apps without an `api` module are skipped; an `api` module that fails to
import raises. Never edit `config/api.py`.

**Handler registry.** `messaging.router.register_handler(order, handler)` from `AppConfig.ready()`;
the chain runs by ascending order (stable for ties), registering the same `(order, handler)` twice is a
no-op. Orders: commands 10 (registered by `MessagingConfig`), quoted card 20, link capture 30, fallback 100.

**Adding an app.** Append it to `PROJECT_APPS` in `config/settings/apps.py` (one per line), to
`root_packages` and the `known-first-party`/`testpaths` lists in `pyproject.toml`, expose `api.router`
(and optionally `PREFIX`), and register plugins/handlers in `ready()`.

## Domain events

`shared/events.py` is a tiny in-process bus: `subscribe(event_name, callback)`, `publish(event_name,
**payload)` and `clear()` (tests). Subscribers run in registration order; one that raises is logged
(`logger.exception`) and never stops the others; publishing with no subscribers does nothing. Subscribe
from `AppConfig.ready()`.

- **Names**: `"<app>.<entity>_<past_tense>"`, e.g. `proposals.status_changed`.
- **Payload**: keyword arguments with ids and plain values only (never model instances).
- **Inside a transaction** use `shared.events_django.publish_after_commit(...)`: it defers through
  `transaction.on_commit` (dropped on rollback) and publishes immediately outside an atomic block.
