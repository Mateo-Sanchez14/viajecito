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
| `GOWA_BASE_URL`, `GOWA_BASIC_AUTH_USER`, `GOWA_BASIC_AUTH_PASS`, `GOWA_WEBHOOK_SECRET` | see `.env.example` | WhatsApp gateway (OTP delivery uses the first three) |
| `OTP_PEPPER` | dev value in `dev`; empty elsewhere | HMAC key for stored OTP codes. **Required in `prod`** (settings import fails without it) |
| `OTP_DELIVERY_ENABLED` | `1` | kill switch; `0` makes `POST /api/auth/otp/request` return `503 delivery_unavailable` |
| `OTP_CODE_TTL_SECONDS` | `300` | code lifetime |
| `OTP_MAX_ATTEMPTS` | `5` | wrong codes before a challenge locks |
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
  30/h -> `429 rate_limited` with `Retry-After`. The IP is `CF-Connecting-IP` when present, else
  `REMOTE_ADDR`; the header is trusted because the api is only reachable through cloudflared, which
  always sets it.
- **Phones** are accepted in free form and normalized to E.164 with `phonenumbers` (default region AR).
- **WhatsApp copy** lives in `messaging/copy/es_ar.py`; the ledger (`OutboundMessage`) stores OTP
  bodies as `<redacted>`.

### Bootstrap the first crew

```sh
uv run python manage.py bootstrap_crew --name "Los Pibes" --chat-id 120363000000000001@g.us --admin-phone "+54 9 11 5555-1234"
```

Creates the crew, its WhatsApp group link and the admin membership (and the admin person). Re-running
it with the same `--chat-id` changes nothing. Invite more people from the Django admin (`Invite`).
