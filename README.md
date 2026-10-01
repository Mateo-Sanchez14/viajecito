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

Run `make help` for every target. Common ones: `make logs`, `make down`, `make test`, `make lint`.

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
