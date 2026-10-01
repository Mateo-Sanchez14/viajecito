# Credentials-file tunnel (alternative to the dashboard-managed token tunnel).
# Render with: sed -e 's/<TUNNEL_ID>/<id>/' -e 's/<HOST>/viajecito.example.com/' config.yml.tpl > config.yml
# and mount config.yml plus <TUNNEL_ID>.json into the cloudflared container (see README.md).
tunnel: <TUNNEL_ID>
credentials-file: /etc/cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: <HOST>
    path: ^/(api|hooks|media|admin|static)(/|$)
    service: http://api:8000
  - hostname: <HOST>
    service: http://web:3000
  # Required catch-all.
  - service: http_status:404
