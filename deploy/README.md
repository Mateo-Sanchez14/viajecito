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
The sole list exception documented here is `DOCUMENTS_FERNET_KEYS`: ordered base64url keys separated
by commas, with no spaces or quotes. This does not expand the general env-value alphabet.

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

### Automatic deployment from main

All five workflows run on every main push; pull-request path filters remain. The Pi polls the public
GitHub API every five minutes (normally two requests/check, below the unauthenticated 60/hour budget).
It deploys only the current main SHA when the latest push attempts of the exact API, web, platform,
e2e and images workflows all succeeded. Missing, pending or failed checks wait; an older successful
SHA is never used as a fallback. Publication alone does not deploy untested `latest` images.

Install on the Pi after copying these files from the approved checkout:

```sh
sudo install -m 700 deploy/scripts/autodeploy.py /srv/viajecito/autodeploy.py
sudo install -m 644 deploy/systemd/viajecito-autodeploy.{service,timer} /etc/systemd/system/
sudo python3 /srv/viajecito/autodeploy.py --check
sudo systemctl daemon-reload
sudo systemctl enable --now viajecito-autodeploy.timer
systemctl list-timers viajecito-autodeploy.timer
journalctl -u viajecito-autodeploy.service -n 30
```

Requires Python 3.11+, public repository access and existing Docker/GHCR pull access. No SSH key,
GitHub runner or new application secret is installed. The updater validates and stages that SHA's
Compose/scripts under `/srv/viajecito/releases/`, preserving env/data paths, and deploys both images
with the exact SHA. `deployed-sha` is replaced atomically only after health and smoke checks succeed.
Deploys are serialized; failed bundles remain for diagnosis and are retried on a later tick.
The updater bootstrap and systemd units themselves are updated manually, not executed from an archive.
Existing tick/backup units remain unchanged and target the same `viajecito` Compose project.

Disable the timer **and stop its service** before a manual deploy or restore:

```sh
sudo systemctl disable --now viajecito-autodeploy.timer
sudo systemctl stop viajecito-autodeploy.service
```

Failures appear in the journal; there is no automatic database-migration rollback. A failed rollout
may already have changed containers or schema; restore requires the existing deliberate runbook.
Do not edit `deployed-sha` to claim a failed deployment succeeded. Re-enable the timer when returning
to main tracking. Run offline checks with `python3 -m unittest deploy/scripts/tests/test_autodeploy.py`
and `bash deploy/scripts/tests/test_lib.sh`; platform CI executes both.

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
   `notify`, and `PUT /api/sessions/<session>` **replaces the whole config**, so the script below reads the
   current session first, keeps `name` and all of `config`, and only appends viajecito's webhook (skipped if its
   URL is already there; `config.webhooks: null` counts as `[]`). WAHA is published on the Pi at
   `127.0.0.1:3000` (host only), so run it on the Pi. It needs `sudo` to read `api.env` (mode 600), parses that
   file literally (no shell sourcing), keeps the API key and the existing webhooks' HMAC keys out of argv, shell
   history and temp files, and never prints any secret. Without arguments it is a dry run that prints the
   webhook URLs the session would have; pass `apply` to send the `PUT`.
   ```sh
   sudo python3 - <<'PY'
   import json, re, sys, urllib.request
   env = {}
   for line in open("/srv/viajecito/api.env"):
       m = re.match(r"\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$", line.rstrip("\r\n"))
       if m:
           env[m.group(1)] = m.group(2)
   base, session = "http://127.0.0.1:3000", env["WAHA_SESSION"]
   url = f"{base}/api/sessions/{session}"
   hook = "http://viajecito-api:8000/hooks/waha/"
   def call(method, data=None):
       req = urllib.request.Request(url, data=data, method=method, headers={"X-Api-Key": env["WAHA_API_KEY"], "Content-Type": "application/json"})
       return json.load(urllib.request.urlopen(req, timeout=30))
   current = call("GET")
   body = {"name": current["name"], "config": current.get("config") or {}}  # drops status, me, engine (read-only)
   hooks = body["config"].get("webhooks") or []
   if not any(h.get("url") == hook for h in hooks):
       hooks.append({"url": hook, "events": ["message"], "hmac": {"key": env["WAHA_WEBHOOK_HMAC_KEY"]}})
   body["config"]["webhooks"] = hooks
   print("webhooks after update:", [h["url"] for h in hooks])
   if "apply" in sys.argv[1:]:
       call("PUT", json.dumps(body).encode())
       print("session updated")
   PY
   ```
   Check the dry run lists every URL the session had plus `http://viajecito-api:8000/hooks/waha/`, then rerun
   with `sudo python3 - apply <<'PY'` (same script). If your WAHA exposes other read-only fields in `config`
   that the `PUT` rejects, remove them from `body` and retry. Heads-up: if the session is not `STOPPED`, WAHA
   stops and restarts it to apply the new config, so `notify` has a short gap; do it at a quiet moment. The
   request shapes are documented in WAHA's
   [session update](https://github.com/devlikeapro/waha-docs/blob/main/content/docs/how-to/sessions/api-session-update.md)
   and [webhooks/HMAC](https://github.com/devlikeapro/waha-docs/blob/main/content/docs/how-to/events/index.md) pages
   (WAHA's prose also mentions `PUT /api/sessions/{session}/config`; confirm against your WAHA version's
   Swagger if the first form answers 404).
5. Add the bot's number (the dedicated WAHA number) to the WhatsApp group.
6. Create the crew with the real group id:
   `vdc exec api python manage.py bootstrap_crew --name "<crew>" --chat-id <id>@g.us --admin-phone <+E164>`.
7. Send `/viaje ping` in the group and expect `pong`. Check `vdc logs api` and
   `journalctl -u viajecito-tick.service` if it does not.

## Wave A runtime settings

`env/api.env.example` documents decisions reminder windows, ski limits, push budgets and proposal
preview/LLM settings. Defaults match the app configuration. Browser push is optional: empty VAPID
keys disable it; generate a matching pair with `vdc exec api python manage.py generate_vapid_keys`
and set a `mailto:` contact or HTTPS subject (blank falls back to the HTTPS public origin).
Leave `NOTIFICATIONS_PUSH_ENDPOINT_HOSTS` empty to use the documented built-in push-service allowlist.

Production uses `LINKPREVIEW_FETCHER=httpx` for SSRF-guarded live previews. The development compose
stack forces `static` canned previews, including `make e2e` and `make bot-smoke`, even without `.env`.
LLM classification stays disabled unless explicitly configured and enabled.

Offline platform configuration checks (no containers started):

```sh
python3 -m unittest deploy/scripts/tests/test_wave_a_config.py
bash deploy/scripts/tests/test_lib.sh
```

## Wave B vault settings and key rotation

`env/api.env.example` adds the task nag lead time (3 days), maximum document size (15 MiB),
per-trip vault quota (1 GiB), and Django memory thresholds (2.5 MiB). The six allowed MIME defaults
are documented as a comment; leave `DOCUMENTS_ALLOWED_MIME` unset to use those defaults. Changing
that allowlist does not add new supported file signatures.

The development example contains a public, stable sample key for **development only**. Production
`DOCUMENTS_FERNET_KEYS` is deliberately empty and must be filled before starting the api. Generate
an independent 32-byte base64url key locally (not a shell-quoted string in the env file):

```sh
python3 -c 'import base64,secrets; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())'
```

Keep `api.env` mode 600 and back up its encryption keys separately from the encrypted vault. Losing
all keys makes the stored documents and their backups unreadable. Never use the public development
sample in production, put secrets in command-line arguments, or commit real keys.

For rotation, prepend the fresh key to the retained keys: `DOCUMENTS_FERNET_KEYS=new,old` (replace
both labels with generated keys). The first key encrypts new uploads; every configured key may decrypt
existing files. Use no spaces or quotes. This comma separator is a narrow exception for this setting;
the existing literal parser remains unchanged and never executes or expands env contents. Restart the
api after updating its env file. Rotation does **not** re-encrypt old documents automatically: retain
old keys while any current files or retained backups need them. Do not remove an old key until those
files have been safely re-encrypted or deleted and the corresponding backups have expired.

Offline Wave B configuration regressions (no Docker, containers, or network), using the API's
locked `cryptography` dependency to validate the development key:

```sh
uv run --project api python -m unittest deploy/scripts/tests/test_wave_b_config.py
```
