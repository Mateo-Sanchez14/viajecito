# linkpreview

Safe link unfurling shared by the apps: given a URL it returns a title, description, site, price,
coordinates and a local WebP thumbnail, and caches the result per canonical URL for 7 days. Failures
are stored as a status (`blocked`, `failed`, `partial`), never raised.

## Pieces

| Layer | Module | What it does |
|---|---|---|
| domain | `domain/urls.py` | `extract_urls`, `strip_tracking`, `canonicalize`, `normalize` (strip + canonicalize), Maps coordinates, `slug_title` |
| domain | `domain/ssrf.py` | `check_url`, `choose_address`, `is_blocked_address`: every SSRF rule, pure |
| domain | `domain/preview.py` | `PreviewData`, `finalize` (slug fallback, `ok`/`partial`/`blocked`) |
| adapters | `adapters/httpx_fetcher.py` | `GuardedClient` (DNS → validate every record → pin the connection to the IP) and `HttpxLinkPreviewFetcher` |
| adapters | `adapters/html_parser.py` | selectolax: Open Graph, Twitter, price meta, JSON-LD, coordinates |
| adapters | `adapters/thumbnail.py` | Pillow: ≤ 640 px WebP, no EXIF/ICC, decompression-bomb guard |
| adapters | `adapters/{fake,static}_fetcher.py` | `fake` (tests) and `static` (dev/e2e canned previews by host) |
| use cases | `prepare_preview`, `fetch_preview`, `resolve_preview`, `refresh_preview`, `retry_pending` | what other apps call (`ports.default_*()` pattern: no store argument) |

## Security rules (all covered by tests)

http/https only, ports 80/443, no userinfo, no IP literals or numeric host spellings, no
`localhost`/`*.local`/`*.internal`, every resolved address must be public (loopback, private,
link-local, CGNAT, multicast, reserved, IPv4-mapped IPv6, NAT64/6to4 are refused), the connection is
pinned to the validated IP (`Host` header and TLS `sni_hostname` keep the original name, so DNS
rebinding cannot redirect it), at most 4 manual redirects each re-validated, 5 s connect / 8 s total,
streamed body cut at `LINKPREVIEW_MAX_BYTES`, HTML only, environment proxies ignored. Images: JPEG/PNG/WebP/GIF
up to 5 MB and 25 megapixels, re-encoded, never SVG.

## Settings (`linkpreview/conf.py`, read with defaults)

| Setting | Default | Meaning |
|---|---|---|
| `LINKPREVIEW_FETCHER` | `httpx` | `httpx`, `static` (dev/e2e: canned previews from `tests/fixtures/static_previews.json`) or `fake` (tests) |
| `LINKPREVIEW_FETCH_SYNC` | `0` | `1` runs the off-request unfurl inline (tests) |
| `LINKPREVIEW_MAX_BYTES` | `1048576` | HTML body cap |

## Events and jobs

- Publishes `linkpreview.preview_fetched` (`preview_id`, `canonical_url`, `fetch_status`) after commit
  and isolated; `proposals` subscribes to refresh the proposals built on the preview.
- Tick job `linkpreview.retry_pending`: unfurls previews stuck `pending` for > 2 min and `failed` ones
  with attempts left (last attempt > 15 min ago), at most 3 per tick.

## Dev

```sh
uv run python manage.py unfurl "https://www.booking.com/hotel/ar/cabanas-del-sur.html"   # real fetcher; never in tests
LINKPREVIEW_FETCHER=static uv run python manage.py runserver                              # no network
```
