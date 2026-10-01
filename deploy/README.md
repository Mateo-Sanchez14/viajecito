# Raspberry Pi runbook

Production runs on the Raspberry Pi as three containers (`api`, `web`, `cloudflared`) plus two systemd timers.
Everything here is executed **on the Pi**; nothing in this repository connects to it. The WAHA and `notify`
services already running there are not touched, and since no port is published there is nothing to collide with.
WhatsApp goes through that existing WAHA container (`WHATSAPP_PROVIDER=waha`): the `api` also joins WAHA's
Docker network (`WAHA_NETWORK`, default `waha_default`) with the alias `viajecito-api`, so WAHA posts webhooks to
`http://viajecito-api:8000/hooks/waha/` and the api calls `http://waha:3000`. It keeps its default network too.

```
Internet -> Cloudflare -> cloudflared -> /api /hooks /media /admin /static -> api:8000
                                      -> everything else                  -> web:3000
```

## Prerequisites

- 64-bit Raspberry Pi OS (the images are `linux/arm64`) with Docker Engine and the compose plugin,
  **Docker Compose >= 2.30** (`docker compose version`): `compose.pi.yml` uses `env_file` with `format: raw`,
  added in v2.30.0 (release notes: "Add support for raw env_file format").
- `restic` (`sudo apt install restic`). `sqlite3` is **not** needed: the database snapshot is taken with
  Python's `sqlite3` backup API inside the api container.
- `curl`, `flock` (util-linux) and `python3` (all preinstalled on Raspberry Pi OS).
- A Cloudflare account with a domain, a restic repository (S3/B2/USB disk), and the WAHA stack running
  (compose project `waha`, container `waha`, network `waha_default`, dedicated bot number, API key).
- If the GHCR images are private: `docker login ghcr.io` with a token that has `read:packages`.

## Layout on the Pi

```
/srv/viajecito/
  compose.pi.yml      copy of deploy/compose.pi.yml
  api.env             api container variables and secrets, mode 600 (from deploy/env/api.env.example)
  pi.env              host-only values (images, tunnel token, backups, PUBLIC_HOST), mode 600
  scripts/            copy of deploy/scripts/ (lib.sh, deploy.sh, backup.sh, restore.sh, smoke.sh, restic.sh)
  data/               bind-mounted at /data in the api (db.sqlite3, media/, static/); owned by uid 1000
  backups/            current/db.sqlite3 (what restic stores) + db-<UTC>.sqlite3 local copies (last 7 kept), mode 700
  restore/            scratch dir used by restore.sh, mode 700
```

## First deploy

Copy the files from a checkout of this repo (use `scp`/`rsync` from your machine, or `git clone` on the Pi):

```sh
sudo mkdir -p /srv/viajecito/{scripts,data,backups,restore}
sudo cp deploy/compose.pi.yml /srv/viajecito/compose.pi.yml
sudo cp deploy/scripts/*.sh /srv/viajecito/scripts/
sudo cp deploy/env/api.env.example /srv/viajecito/api.env
sudo cp deploy/env/pi.env.example /srv/viajecito/pi.env
sudo chmod 600 /srv/viajecito/api.env /srv/viajecito/pi.env
sudo chmod 700 /srv/viajecito/backups /srv/viajecito/restore
sudo chown 1000:1000 /srv/viajecito/data      # the api container runs as uid 1000
sudoedit /srv/viajecito/api.env               # app variables, see comments inside
sudoedit /srv/viajecito/pi.env                # host-only values, see comments inside
```

Two env files keep secrets scoped: only the api container reads `api.env` (Django, OTP, WAHA); `cloudflared`
receives only `TUNNEL_TOKEN` from `pi.env`; the restic password never enters a container. Both files are
plain `KEY=value` lines with **unquoted** values limited to `[A-Za-z0-9._~+/=:-]`: compose reads them with
`format: raw` and the scripts parse them literally (`lib.sh`), never with shell `source`.

Check the WAHA network name with `docker network ls` and set `WAHA_NETWORK` in `pi.env` if it is not
`waha_default`. Create the tunnel and public hostname first: [`cloudflared/README.md`](cloudflared/README.md);
nothing is installed on the Pi or your Mac for it, you only copy the token (do not run the install command
the dashboard shows).

Initialize the restic repository once (`restic.sh` runs restic with `BACKUP_RESTIC_*` from `pi.env`):

```sh
sudo /srv/viajecito/scripts/restic.sh init
```

Install the timers:

```sh
sudo cp deploy/systemd/viajecito-*.service deploy/systemd/viajecito-*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now viajecito-tick.timer viajecito-backup.timer
```

Deploy:

```sh
sudo SMOKE_SKIP_RESTIC=1 /srv/viajecito/scripts/deploy.sh   # first time only: no snapshot exists yet
```

It pulls the images, runs `up -d`, waits for `api` and `web` to be healthy (`DEPLOY_TIMEOUT`, default 240 s),
then runs `smoke.sh` and exits non-zero on any failure. The api entrypoint applies migrations and
`collectstatic` on every start.

## Updating

Merging to `main` publishes `ghcr.io/<owner>/viajecito-{api,web}:latest` and `:<commit sha>` (workflow
`images`). To release a named tag, run the workflow manually (Actions > images > Run workflow) with the `tag`
input, e.g. `v0.1.0`. Then on the Pi:

```sh
sudo /srv/viajecito/scripts/deploy.sh                 # follows IMAGE_TAG in pi.env (latest by default)
```

To pin or roll back, set `IMAGE_TAG` in `pi.env` to a sha or tag and run `deploy.sh` again. Update the copies
of `compose.pi.yml`, `scripts/` and the unit files when they change in the repo
(`sudo systemctl daemon-reload` after unit changes).

Useful commands (always with the env file):

```sh
alias vdc='docker compose --env-file /srv/viajecito/pi.env -f /srv/viajecito/compose.pi.yml'
vdc ps
vdc logs -f api
vdc exec api python manage.py bootstrap_crew --help
journalctl -u viajecito-tick.service -n 20
```

## Backups and restore drill

`viajecito-backup.timer` runs `backup.sh` daily at 04:00 (+ up to 15 min random delay; `Persistent=true`
catches up after downtime). It takes a consistent SQLite snapshot inside the api container
(`PRAGMA integrity_check`ed) into `/srv/viajecito/backups/current/db.sqlite3` (a stable path, so restic groups all
snapshots together and retention and parent detection work), keeps a timestamped copy
`backups/db-<UTC>.sqlite3`, runs `restic backup` for `current/db.sqlite3` plus
`/srv/viajecito/data/media`, then `restic forget --keep-daily 7 --keep-weekly 4 --prune`, keeps the last 7
local snapshots, and pings `HEALTHCHECKS_URL` if set. Run it by hand any time:

```sh
sudo systemctl start viajecito-backup.service && journalctl -u viajecito-backup.service -n 30
sudo /srv/viajecito/scripts/restic.sh snapshots
```

Restore drill (do it once before relying on the backups, ideally on a spare copy of the stack):

```sh
sudo /srv/viajecito/scripts/restore.sh latest        # or a snapshot id
```

The script extracts the snapshot into `/srv/viajecito/restore/` while the stack keeps running, asks you to
type `restore`, then stops the stack, moves the current database and media aside as `*.pre-restore-<UTC>`
(never deleted; the `-wal`/`-shm` files move aside too), swaps in the restored copies, fixes ownership to uid 1000 and starts the stack. Verify with
`sudo /srv/viajecito/scripts/smoke.sh` and by logging in. Remove the `*.pre-restore-*` files and
`/srv/viajecito/restore/` once satisfied.

## Smoke checks

`smoke.sh` verifies: public `https://<host>/api/health` answers 200 with `status: ok`; a signed webhook POST
from a non-group chat to the provider's webhook (`/hooks/waha/` signed with HMAC-SHA512 in `X-Webhook-Hmac`,
or `/hooks/gowa/` when `WHATSAPP_PROVIDER=gowa`) is accepted by the signature check and answered `ignored` (the HMAC is
computed with the secret in the environment, never in argv); each timer is active; restic is initialized and
holds at least one snapshot. Run `SMOKE_SKIP_RESTIC=1` before the first backup (a fresh deploy runs
`deploy.sh` before any snapshot exists) and `SMOKE_SKIP_SYSTEMD=1` before the timers are installed.

## Go-live checklist (owner actions)

1. Cloudflare: create the tunnel and the public hostname with the path rules from
   [`cloudflared/README.md`](cloudflared/README.md); put the token in `TUNNEL_TOKEN`. Only copy the token.
2. Fill `/srv/viajecito/api.env` and `/srv/viajecito/pi.env` (both `chmod 600`). In api.env keep
   `WHATSAPP_PROVIDER=waha`, set `WAHA_API_KEY` (the key WAHA runs with), `WAHA_SESSION`, a fresh random
   `WAHA_WEBHOOK_HMAC_KEY` and `EXTRA_ALLOWED_HOSTS=viajecito-api`. `PUBLIC_ORIGIN=https://<host>` in api.env
   and `PUBLIC_HOST=<host>` in pi.env.
3. Run the first deploy (above; `sudo SMOKE_SKIP_RESTIC=1 /srv/viajecito/scripts/deploy.sh` until the first backup exists, then take one
   with `systemctl start viajecito-backup.service`); `smoke.sh` must pass.
4. Configure the WAHA session webhook. The session may already carry other webhooks or settings used by
   `notify`, and `PUT /api/sessions/<session>` **replaces the whole config**, so read it first and send it back
   with only viajecito's webhook added. Run this on the Pi (the key is read from `api.env`, never typed on a
   command line that lands in shell history):
   ```sh
   set -a; . <(grep -E '^(WAHA_API_KEY|WAHA_SESSION|WAHA_WEBHOOK_HMAC_KEY)=' /srv/viajecito/api.env); set +a
   curl -fsS -H "X-Api-Key: $WAHA_API_KEY" "http://127.0.0.1:3000/api/sessions/$WAHA_SESSION" > /tmp/waha-session.json
   cat /tmp/waha-session.json   # review: note every existing webhook and setting
   ```
   Build the new body from that JSON: keep `name` and everything in `config` (proxy, debug, existing
   `webhooks` entries with their `hmac`, `retries`, `customHeaders`...), and append:
   ```json
   {"url": "http://viajecito-api:8000/hooks/waha/", "events": ["message"], "hmac": {"key": "<WAHA_WEBHOOK_HMAC_KEY>"}}
   ```
   ```sh
   curl -fsS -X PUT -H "X-Api-Key: $WAHA_API_KEY" -H 'Content-Type: application/json' \
     --data @/tmp/waha-session-new.json "http://127.0.0.1:3000/api/sessions/$WAHA_SESSION"
   shred -u /tmp/waha-session.json /tmp/waha-session-new.json
   ```
   Heads-up: if the session is not `STOPPED`, WAHA stops and restarts it to apply the new config, so there is a
   short gap in `notify` delivery; do it at a quiet moment. The same shape is documented in WAHA's
   [session update](https://github.com/devlikeapro/waha-docs/blob/main/content/docs/how-to/sessions/api-session-update.md)
   and [webhooks/HMAC](https://github.com/devlikeapro/waha-docs/blob/main/content/docs/how-to/events/index.md) pages
   (WAHA's prose also mentions `PUT /api/sessions/{session}/config`; confirm against your WAHA version's
   Swagger at `/` if the first form answers 404).
5. Add the bot's number (the dedicated WAHA number) to the WhatsApp group.
6. Create the crew with the real group id:
   `vdc exec api python manage.py bootstrap_crew --name "<crew>" --chat-id <id>@g.us --admin-phone <+E164>`.
7. Send `/viaje ping` in the group and expect `pong`. Check `vdc logs api` and
   `journalctl -u viajecito-tick.service` if it does not.
