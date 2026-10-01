# Raspberry Pi runbook

Production runs on the Raspberry Pi as three containers (`api`, `web`, `cloudflared`) plus two systemd timers.
Everything here is executed **on the Pi**; nothing in this repository connects to it. The WAHA and `notify`
services already running there are not touched, and since no port is published there is nothing to collide with.

```
Internet -> Cloudflare -> cloudflared -> /api /hooks /media /admin /static -> api:8000
                                      -> everything else                  -> web:3000
```

## Prerequisites

- 64-bit Raspberry Pi OS (the images are `linux/arm64`) with Docker Engine and the compose plugin
  (`docker compose version`).
- `restic` (`sudo apt install restic`). `sqlite3` is **not** needed: the database snapshot is taken with
  Python's `sqlite3` backup API inside the api container.
- `curl` and `openssl` (preinstalled on Raspberry Pi OS).
- A Cloudflare account with a domain, a restic repository (S3/B2/USB disk), and the Gowa credentials from
  gastito's droplet.
- If the GHCR images are private: `docker login ghcr.io` with a token that has `read:packages`.

## Layout on the Pi

```
/srv/viajecito/
  compose.pi.yml      copy of deploy/compose.pi.yml
  pi.env              secrets, mode 600 (from deploy/env/pi.env.example)
  scripts/            copy of deploy/scripts/ (lib.sh, deploy.sh, backup.sh, restore.sh, smoke.sh)
  data/               bind-mounted at /data in the api (db.sqlite3, media/, static/); owned by uid 1000
  backups/            local SQLite snapshots (last 7 kept)
  restore/            scratch dir used by restore.sh
```

## First deploy

Copy the files from a checkout of this repo (use `scp`/`rsync` from your machine, or `git clone` on the Pi):

```sh
sudo mkdir -p /srv/viajecito/{scripts,data,backups}
sudo cp deploy/compose.pi.yml /srv/viajecito/compose.pi.yml
sudo cp deploy/scripts/*.sh /srv/viajecito/scripts/
sudo cp deploy/env/pi.env.example /srv/viajecito/pi.env
sudo chmod 600 /srv/viajecito/pi.env
sudo chown 1000:1000 /srv/viajecito/data      # the api container runs as uid 1000
sudoedit /srv/viajecito/pi.env                # fill every value, see comments inside
```

`pi.env` is read by compose (`--env-file`) and by the scripts, which parse it as plain `KEY=value` lines
(no quotes, no expansion). Note that `env_file` also hands these variables, including `TUNNEL_TOKEN`, to the
api container; nothing in the app reads them.

Create the tunnel and public hostname first: [`cloudflared/README.md`](cloudflared/README.md).

Initialize the restic repository once (same values as in `pi.env`):

```sh
sudo bash -c 'set -a; . /srv/viajecito/pi.env; set +a; RESTIC_REPOSITORY=$BACKUP_RESTIC_REPOSITORY RESTIC_PASSWORD=$BACKUP_RESTIC_PASSWORD restic init'
```

Install the timers:

```sh
sudo cp deploy/systemd/viajecito-*.service deploy/systemd/viajecito-*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now viajecito-tick.timer viajecito-backup.timer
```

Deploy:

```sh
sudo /srv/viajecito/scripts/deploy.sh
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
(`/srv/viajecito/backups/db-<UTC>.sqlite3`, `PRAGMA integrity_check`ed), runs `restic backup` for that file plus
`/srv/viajecito/data/media`, then `restic forget --keep-daily 7 --keep-weekly 4 --prune`, keeps the last 7
local snapshots, and pings `HEALTHCHECKS_URL` if set. Run it by hand any time:

```sh
sudo systemctl start viajecito-backup.service && journalctl -u viajecito-backup.service -n 30
sudo bash -c 'set -a; . /srv/viajecito/pi.env; set +a; RESTIC_REPOSITORY=$BACKUP_RESTIC_REPOSITORY RESTIC_PASSWORD=$BACKUP_RESTIC_PASSWORD restic snapshots'
```

Restore drill (do it once before relying on the backups, ideally on a spare copy of the stack):

```sh
sudo /srv/viajecito/scripts/restore.sh latest        # or a snapshot id
```

The script extracts the snapshot into `/srv/viajecito/restore/` while the stack keeps running, asks you to
type `restore`, then stops the stack, moves the current database and media aside as `*.pre-restore-<UTC>`
(never deleted), swaps in the restored copies, fixes ownership to uid 1000 and starts the stack. Verify with
`sudo /srv/viajecito/scripts/smoke.sh` and by logging in. Remove the `*.pre-restore-*` files and
`/srv/viajecito/restore/` once satisfied.

## Smoke checks

`smoke.sh` verifies: public `https://<host>/api/health` answers 200 with `status: ok`; a signed webhook POST
from a non-group chat to `/hooks/gowa/` is accepted by the signature check and answered `ignored`; both timers
are active; `restic snapshots --latest 1` works (skipped with a notice while the repository is not
initialized). `SMOKE_SKIP_SYSTEMD=1` / `SMOKE_SKIP_RESTIC=1` skip the last two.

## Go-live checklist (owner actions)

1. Cloudflare: create the tunnel and the public hostname with the path rules from
   [`cloudflared/README.md`](cloudflared/README.md); put the token in `TUNNEL_TOKEN`.
2. Fill `/srv/viajecito/pi.env`. `GOWA_BASE_URL`, `GOWA_BASIC_AUTH_USER`, `GOWA_BASIC_AUTH_PASS` and
   `GOWA_WEBHOOK_SECRET` must match gastito's Gowa on the droplet. `PUBLIC_ORIGIN=https://<host>`.
3. Run the first deploy (above); `smoke.sh` must pass.
4. On the droplet, add viajecito as the **second** webhook of gastito's Gowa and restart Gowa briefly:
   `WHATSAPP_WEBHOOK=http://bot:8000/webhooks/gowa/,https://<host>/hooks/gowa/` (gastito first). Gowa signs
   with its single webhook secret for every URL, which is why the secret must match.
5. Land the gastito change that makes it ignore `/viaje`, `/v` and link-only messages, so both bots do not
   answer the same message.
6. Create the crew with the real group id:
   `vdc exec api python manage.py bootstrap_crew --name "<crew>" --chat-id <id>@g.us --admin-phone <+E164>`.
7. Send `/viaje ping` in the group and expect `pong`. Check `vdc logs api` and
   `journalctl -u viajecito-tick.service` if it does not.
