# viajecito

Trip planning for one friend group: proposals from links, decisions that close, logistics with
owners, a live "today" view, and a ski module. A web/PWA hub (Next.js) plus a Django backend, with
WhatsApp capture and reminders through the group's existing bot. Self-hosted on a Raspberry Pi.

- Conventions for contributors and agents: [AGENTS.md](AGENTS.md)
- Task tracking: [odd/tasks](odd/tasks)
- API contract snapshot: [contracts/openapi.json](contracts/openapi.json)


## Development

Requires Docker, [uv](https://docs.astral.sh/uv/) and [pnpm](https://pnpm.io/) 12 (Node 24).

```sh
cp .env.example .env
make up          # builds and starts api, web and fake-gowa
```

| Service | URL |
| --- | --- |
| Web | http://localhost:3000 |
| API docs | http://localhost:8000/api/docs |
| API health | http://localhost:8000/api/health |
| fake-gowa (recorded sends at `/__sent`) | http://localhost:4000 |

Run `make help` for every target. Common ones: `make logs`, `make down`, `make test`, `make lint`, `make e2e`.

### Login with WhatsApp in dev

The api sends the one-time code through Gowa; in dev that is fake-gowa, so no real WhatsApp is involved.
Only phones with an active crew membership or a pending invite can log in, so create the dev crew first:

```sh
make bootstrap-dev-crew            # crew "Crew de prueba" with E2E_PHONE as admin
```

Then open http://localhost:3000/login, enter the phone and read the code from fake-gowa:

```sh
docker compose logs fake-gowa
curl "http://localhost:4000/__sent/latest?phone=5491155551234"
```

`.env` additions (in `.env.example`, read by the api): `OTP_DELIVERY_ENABLED`, `OTP_PEPPER`,
`OTP_CODE_TTL_SECONDS`, `OTP_MAX_ATTEMPTS`. The dev api container runs `migrate` on start.
The e2e phone is a Make/CLI override, not an `.env` setting: `make e2e E2E_PHONE=+56912345678`.

End-to-end test (Playwright against the real stack):

```sh
make e2e        # fresh stack on its own data dir (./data/e2e, wiped first), bootstrap, Playwright, always tear down
make e2e-keep   # same, but leave the stack running to debug
```

`make e2e` never touches your dev database (`./data`); the stack data is a bind mount, so `down -v` alone does not
reset it, which is why the e2e data dir is removed before each run. CI runs the same flow in `.github/workflows/e2e.yml`.

Changing the API contract:

```sh
make api-schema   # export api -> contracts/openapi.json
make api-types    # regenerate web/src/shared/api/schema.d.ts
```

CI fails when the committed types drift from the contract (`make api-types-check`).

## Repository map

```
api/        Django (Ninja) backend
web/        Next.js app
contracts/  openapi.json snapshot exported from the api
deploy/     docker/ Dockerfiles, dev/fake_gowa Gowa stub, Pi compose, systemd units, scripts (see deploy/README.md)
odd/        feature documents and task tracking
.github/    CI: api, web, platform, e2e (login flow) and arm64 image builds
```

## Production (Raspberry Pi)

Deployment, backups, restore and the go-live checklist: [deploy/README.md](deploy/README.md).
