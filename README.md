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

`.env` additions (all in `.env.example`): `OTP_DELIVERY_ENABLED`, `OTP_PEPPER`, `OTP_CODE_TTL_SECONDS`,
`OTP_MAX_ATTEMPTS` (read by the api) and `E2E_PHONE`, `FAKE_GOWA_URL` (used by `make e2e` and Playwright).

End-to-end test (Playwright against the real stack):

```sh
make e2e        # up, bootstrap the dev crew, run Playwright, always tear down (down -v)
make e2e-keep   # same, but leave the stack running to debug
```

CI runs the same flow in `.github/workflows/e2e.yml`.

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
deploy/     docker/ Dockerfiles, dev/fake_gowa Gowa stub (Pi compose and scripts land in M0c)
odd/        feature documents and task tracking
.github/    CI: api, web, platform and arm64 image builds
```
