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
