# Cloudflare tunnel

The Pi publishes no ports. The `cloudflared` container dials out to Cloudflare and forwards requests to
`api:8000` and `web:3000` over the compose network.

## Routing rules (both options)

| Public hostname | Path (regex) | Service |
|---|---|---|
| `<host>` | `^/(api\|hooks\|media\|admin\|static)(/\|$)` | `http://api:8000` |
| `<host>` | *(empty, catch-all)* | `http://web:3000` |

The path-specific rule must come first. `/hooks/gowa/` (webhook) and `/api/*` go to the api, everything
else (pages, `/login`, `/_next/*`) goes to the web app.

## Option A: token tunnel (default, what `compose.pi.yml` runs)

Ingress is managed in the Cloudflare dashboard; the container only needs `TUNNEL_TOKEN`.

1. Cloudflare Zero Trust > Networks > Tunnels > Create a tunnel > Cloudflared. Name it `viajecito`.
2. Copy the token (the long string after `--token` in the install command) into `TUNNEL_TOKEN` in
   `/srv/viajecito/pi.env` (host-only file; only the cloudflared container receives it). Do not run the install command it shows: compose runs the connector.
3. Public hostname tab > Add a public hostname, twice, in this order:
   1. Subdomain/domain = your host, Path = `^/(api|hooks|media|admin|static)(/|$)`, Service type HTTP,
      URL `api:8000`.
   2. Same host, empty path, Service type HTTP, URL `web:3000`.
4. `PUBLIC_ORIGIN` in `pi.env` must be `https://<host>`.

The container runs `tunnel --no-autoupdate run` and reads `TUNNEL_TOKEN` from the environment.

## Option B: credentials-file tunnel (config in git)

Use this if you prefer ingress rules versioned in the repo.

1. On any machine with `cloudflared` logged in: `cloudflared tunnel create viajecito` (writes
   `~/.cloudflared/<TUNNEL_ID>.json`) and `cloudflared tunnel route dns viajecito <host>`.
2. Render the template and copy both files to the Pi:
   ```sh
   sed -e 's/<TUNNEL_ID>/<id>/g' -e 's/<HOST>/<host>/g' deploy/cloudflared/config.yml.tpl > config.yml
   scp config.yml <TUNNEL_ID>.json pi:/srv/viajecito/cloudflared/
   ```
   (Run `scp` yourself; nothing in this repo connects to the Pi.)
3. In `/srv/viajecito/compose.pi.yml`, replace the `cloudflared` service `command`, drop its `environment`
   block (`TUNNEL_TOKEN` is then unused, set it to any placeholder or remove it from `pi.env`), and add the mount:
   ```yaml
       command: tunnel --no-autoupdate --config /etc/cloudflared/config.yml run
       volumes:
         - /srv/viajecito/cloudflared:/etc/cloudflared:ro
   ```
