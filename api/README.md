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
| `GOWA_BASE_URL`, `GOWA_BASIC_AUTH_USER`, `GOWA_BASIC_AUTH_PASS`, `GOWA_WEBHOOK_SECRET` | see `.env.example` | WhatsApp gateway (used from M0b) |

Data directories are created on settings import if missing.
