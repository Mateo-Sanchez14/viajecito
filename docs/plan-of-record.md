# Viajecito — trip planner for the gastito crew

## Context

- Same friend group that uses **gastito** (`~/Development/gastito`): shared expenses loaded from
  natural-language WhatsApp messages. gastito = vendored spliit (Next.js + Prisma + tRPC + Postgres),
  Python FastAPI bot with LLM parsing, **Gowa** (go-whatsapp-web-multidevice) as WhatsApp transport,
  docker compose behind Caddy on the DigitalOcean droplet (`msanchez.me`).
- What made gastito work: **zero friction**. Nobody opens an app to log an expense; they type in the
  group they already use. The same principle drives viajecito.
- Goal: the best trip app for this friend group. Plan trips together (mostly ski, but generic):
  proposals from links, decisions that actually close, logistics with owners, a live "today" view.
  The bar is "epic".
- Status: discovery done (8 decisions below), architecture designed, ready to implement.
  Empty repo at `~/Development/viajecito` (not yet a git repo).

## Decisions (closed with the user)

- **D1 Product home**: web/PWA is the planning hub; the WhatsApp bot captures links/ideas from the
  group, replies with cards, and sends reminders. Nobody is forced to open the app to contribute.
- **D2 Identity: login with WhatsApp.** Phone (E.164) is the identity. Web asks for the number, the
  bot DMs a one-time code, session created. No passwords, no email. Group messages are attributed
  by sender phone.
- **D3 First real trip: ski, winter 2027** (~Jun–Sep). Ski module ships inside the MVP.
- **D4 Infra & stack: self-hosted on a Raspberry Pi (arm64). Next.js frontend + Django backend.**
  DB-agnostic via Django ORM: SQLite (WAL) first, Postgres only if needed. Media on the Pi's disk.
  Public access via Cloudflare Tunnel. Backups leave the SD card. The Pi's existing WAHA + `notify`
  are never touched.
- **D5 WhatsApp bot: reuse gastito's bot number.** Gowa fans events out to viajecito's webhook too.
- **D6 Pain points: all four are real** (lost links / no decisions; dates & attendance; pre-trip
  logistics; chaos during the trip). MVP = "before" + "during". "After" (memories) is post-MVP but
  the data model must not block it.
- **D7 Resorts: the crew alternates Chile and Argentina.** Multi-resort, multi-currency
  (CLP/ARS/USD), border crossing is a normal case (car permit, insurance, IDs in the vault).
- **D8 Copy register: Rioplatense Spanish with voseo**, like gastito's bot. Code, identifiers,
  comments, i18n keys and commit messages stay in English.
- Assumptions (not asked, override anytime): gastito integration is a deep link only; roles are
  flat in the MVP (any member edits; admins link the group / delete trips); FX rates are manual per
  trip in the MVP; documents (including IDs) are allowed, stored encrypted at rest on the Pi.

## Verified technical facts

- **Gowa multi-webhook**: `WHATSAPP_WEBHOOK` is comma-separated
  (`go-whatsapp-web-multidevice/src/cmd/root.go:127`), every URL receives every event
  (`src/infrastructure/whatsapp/webhook_forward.go:155-166`), one shared `WHATSAPP_WEBHOOK_SECRET`
  (HMAC sha256, header `X-Hub-Signature-256`). Each event is dispatched in its own goroutine with a
  30 s budget and up to 5 attempts per URL, no catch-up → a Pi outage loses events, so idempotency
  on message id is mandatory. Wiring = one env change on the droplet:
  `WHATSAPP_WEBHOOK=http://bot:8000/webhooks/gowa/,https://<viajecito-host>/hooks/gowa/`
  (gastito's URL first). gastito's compose already sets `WHATSAPP_WEBHOOK_EVENTS=message` and
  `WHATSAPP_WEBHOOK_INCLUDE_OUTGOING=false`.
- **Gowa REST API is public on the droplet** behind Caddy at `${GOWA_HOST}` with
  `APP_BASIC_AUTH` (`gastito/docker-compose.prod.yml:40,66-67`). The Pi sends OTP codes and cards
  with `POST https://$GOWA_HOST/send/message` + Basic auth.
- **gastito's bot processes every message of a linked group**: reacts 👂 (`bot/processor.py:125`)
  and runs the LLM extractor (`:188`). A `/viaje` command or a link-only message would also hit
  gastito → a small gastito change is required before go-live (see Risks R1).
- **Snow data: Open-Meteo forecast API** (verified 2026-10-01): hourly `snowfall` (cm) and
  `snow_depth`, daily `snowfall_sum`, `elevation=` param, lat/lon based (covers CL + AR), no API key
  for non-commercial use. Rate limits not stated → refresh per resort on a schedule, never per request.

## Patterns to reuse from gastito (read, do not copy blindly)

| gastito file | Reuse | viajecito destination |
|---|---|---|
| `bot/whatsapp/signature.py` | HMAC verify over raw body, `sha256=` prefix optional, `hmac.compare_digest` | `api/messaging/gowa/signature.py` — **fail closed** when secret is empty (gastito skips) |
| `bot/whatsapp/channel.py` | `parse_group_message`, `normalize_jid` (strips `:device`), `@g.us` filter, ignore `is_from_me` | `api/messaging/gowa/parser.py` |
| `bot/whatsapp/gowa_client.py` | Basic auth `_post`, `send_text(to, body, reply_to)` → `/send/message` `{phone, message, reply_message_id}` reads `results.message_id`; `react`, `send_chat_presence`, `fetch_media` path whitelist | `api/messaging/gowa/client.py` (sync `httpx.Client`) |
| `bot/processor.py:99-101` | ignore messages from groups with no link row | `crews.get_by_chat_id` before inserting anything |
| `bot/processor.py` (~770) | `record_message_ref` ties a bot message to an entity so quoted replies act on it | `OutboundMessage.gowa_message_id` → proposal |
| `bot/commands.py` | accent-insensitive command normalization | `api/messaging/handlers/commands.py` |
| `bot/llm/*`, `bot/config.py` | OpenAI-compatible primary + fallback behind an interface | optional `LlmClassifier` |
| `bot/fx/provider.py` | dolarapi FX | later, if manual FX gets annoying |

## Architecture

### Choices
- **Django 5.2 LTS** (confirm current LTS at M0a), Python 3.12+, `uv`. **Django Ninja** (typed
  schemas, OpenAPI, built-in session auth + CSRF) over DRF.
- **SQLite**: WAL, `synchronous=NORMAL`, `busy_timeout=5000`, `transaction_mode=IMMEDIATE`;
  gunicorn `--workers 2 --threads 4` (gthread, no gevent).
- **One public origin**, split by path in `cloudflared` ingress: `/api`, `/hooks`, `/media`,
  `/admin`, `/static` → `api:8000`; everything else → `web:3000`. No CORS, no BFF, no Caddy.
- **Session**: Django DB session cookie (HttpOnly, Secure, SameSite=Lax, 30-day sliding).
  **CSRF**: Django `csrftoken` cookie echoed in `X-CSRFToken`; `GET /api/auth/csrf` to prime it;
  webhook is `csrf_exempt` and HMAC-authenticated.
- **Next.js → Django**: server components fetch `http://api:8000` forwarding the `Cookie` header;
  client components call same-origin `/api/...`; dev uses `rewrites()` to `localhost:8000`.
- **Typed client**: `manage.py export_openapi_schema` → `openapi-typescript` + `openapi-fetch`;
  `openapi-msw` for mocks; CI fails on schema drift.
- **Realtime**: short polling with TanStack Query (`refetchInterval` 20 s on Today, 60 s elsewhere)
  + ETag. SSE would pin gunicorn threads on a Pi for <10 people.
- **Background work, no Celery/Redis**: the `InboundMessage` ledger is the queue. Webhook inserts
  the row, ACKs, and on-commit submits to a bounded `ThreadPoolExecutor`. A host **systemd timer**
  runs `manage.py tick` every minute (sweeps stuck rows, reminders, snow refresh, roster sync) under
  a `JobLock` row.
- **Services on the Pi**: `api`, `web`, `cloudflared` + host timers. Separate compose project
  `viajecito` and network. Images built for `linux/arm64` in GitHub Actions → GHCR; the Pi only
  `pull && up -d`.
- **i18n**: web `next-intl` with `messages/es-AR.json` (English keys, voseo values); bot copy in
  `api/messaging/copy/es_ar.py`. Bot command prefix `/viaje` (alias `/v`) to avoid gastito collisions.
- **Encryption at rest for media**: custom Django `Storage` wrapping files with Fernet (key in env,
  outside the repo); protects against SD disposal/theft only, documented as such. Prefer a USB SSD.
- **Trip-type plugins**: `trips/plugins.py` → `TripTypePlugin{key, label, packing_templates,
  modules, reminder_rules}`; `ski` registers in `AppConfig.ready()`; `GET /api/trips/{id}` returns
  `modules` and the web nav is data-driven. Beach/city/road trip are later plugins.
- **Hexagonal, pragmatic**: per app `models.py` (persistence adapter), `domain.py` (pure rules),
  `use_cases/<verb_noun>.py`, `ports.py`, `adapters/`, `api.py`, `schemas.py`, `tests/`.
  `import-linter` contracts: everyone may depend on `identity/crews/trips/shared`; `trips` never
  imports a plugin; `messaging` talks to other apps only through `use_cases`.
- **Frontend**: atomic design in `src/ui/{atoms,molecules,organisms,templates}` (presentational,
  prop-driven, no fetching); `src/features/<capability>/{containers,components,hooks,api}` do data
  and wiring (container/presentational).

### Repo layout
```
viajecito/
  Makefile  README.md  .github/workflows/{api,web,images}.yml
  docker-compose.yml                       # dev: api, web, fake-gowa
  api/
    pyproject.toml  uv.lock  manage.py  importlinter.ini  pytest.ini
    config/{settings/{base,dev,prod,test}.py, urls.py, api.py, wsgi.py}
    shared/                                # clock, ids, phone, money, tz
    identity/ crews/ trips/ proposals/ linkpreview/ decisions/ itinerary/
    logistics/ budget/ documents/ ski/ reminders/ notifications/
    messaging/
      gowa/{client,signature,parser}.py   router.py
      handlers/{commands,link_capture,quoted_card}.py
      copy/es_ar.py   jobs.py   management/commands/{tick,replay_gowa,bootstrap_crew}.py
  web/
    package.json (pnpm)  next.config.ts  vitest.config.ts  playwright.config.ts
    messages/es-AR.json
    src/app/(public)/login/
    src/app/(app)/crews/[crewId]/trips/[tripId]/{proposals,dates,logistics,itinerary,today,ski,budget,documents}/
    src/ui/{atoms,molecules,organisms,templates}/
    src/features/<capability>/{containers,components,hooks,api}/
    src/shared/{api,lib,i18n}/   e2e/
  deploy/
    compose.pi.yml  cloudflared/config.yml.tpl  env/pi.env.example
    systemd/viajecito-{tick,backup}.{service,timer}
    scripts/{deploy.sh,backup.sh,restore.sh,smoke.sh,replay_gowa.py}
    dev/fake_gowa/                         # records sends, exposes OTP codes, replays webhooks
```

### Domain model (fields abbreviated; all rows have id, created_at, updated_at)
- **identity**: `Person(phone E.164 unique, display_name, locale)`; `WhatsAppIdentity(person, jid,
  lid)`; `OtpChallenge(phone, code_hmac, expires_at +5m, attempts, max 5, consumed_at, ip)` — one
  live challenge per phone, plaintext never stored; Django DB sessions.
- **crews**: `Crew(name, timezone, gastito_group_url, default_trip)`; `WhatsAppGroupLink(crew 1:1,
  chat_id @g.us unique)`; `CrewMembership(crew, person, role admin|member, source, status)` — login
  eligibility = active membership or `Invite(crew, phone, invited_by, accepted_at)`.
- **trips**: `Trip(crew, name, type=ski|…, status idea|planning|booked|ongoing|done, start_on,
  end_on, destination_label, timezone, currency, fx_rates JSON)`; `Participation(trip, person,
  rsvp in|maybe|out|pending)` unique.
- **proposals**: `LinkPreview(url, canonical_url, final_url, site_name, title, description,
  image_url, thumb_file, price_amount, price_currency, lat, lng, fetch_status, raw)`;
  `Proposal(trip, author, category lodging|transport|activity|food|gear|destination|other, status
  proposed|discussing|chosen|booked|discarded, title, note, link_preview?, est_price, price_basis
  total|per_person|per_night, currency, starts_on, ends_on, booking_ref, chosen_at, booked_at,
  source_message?)`; `Vote(proposal, person, value −1|0|+1)` unique; `Comment(proposal, author,
  body, source_message?)`.
- **decisions**: `AvailabilityResponse(trip, person, date, yes|maybe|no)` unique;
  `Decision(trip, kind dates|destination|lodging, status open|closed, deadline, outcome_proposal?,
  outcome_start, outcome_end, closed_by)`.
- **itinerary**: `ItineraryDay(trip, date, title, notes)`; `ItineraryEntry(day? (null = unscheduled
  tray), trip, starts_at, ends_at, kind, title, location_label, lat, lng, is_meeting_point,
  proposal?, position)`; `Note(trip, author, body, pinned)`.
- **logistics**: `Task(trip, kind todo|bring|booking, title, owner?, due_on, status
  open|done|blocked, quantity, proposal?, nudge_count, last_nudged_at)`; `PackingTemplate` (seed per
  trip type, incl. a "border" section); `PackingEntry(trip, person, label, packed)`.
  **Budget forecast is a computed view** (chosen+booked proposals × price_basis × participants, in
  trip currency, manual FX).
- **documents**: `Document(trip, uploader, title, kind reservation|ticket|insurance|id|photo|other,
  file (uuid name, encrypted), mime, size, visibility crew|owner_only, owner?, valid_until,
  itinerary_entry?)` — `kind=photo` keeps the post-MVP album free of remodeling.
- **ski**: `Resort(slug, name, country AR|CL, lat, lng, base_elev, summit_elev, provider,
  provider_ref)`; `TripResort(trip, resort, nights)`; `SnowReport(resort, observed_at, fetched_at,
  base_cm, new_24h_cm, temp_c, lifts_open/total, runs_open/total, status_text, source, raw)` — keep
  history, >12 h renders as stale; `SkiProfile(person, discipline, level, owns_gear, boot_size,
  height_cm, weight_kg)` (sensitive); `LiftPass(trip, person, resort, product, days, status
  needed|bought|season_pass|not_needed, price, document?)`; `GearPlan(trip, person, item, mode
  own|rent|borrow, rental_proposal?, price)`.
- **messaging**: `InboundMessage(device_id, gowa_message_id, event, chat_id, sender_jid,
  sender_lid, sender_name, person?, body, replied_to_id, raw, status
  received|processing|done|ignored|failed, attempts, error, outcome JSON, received_at,
  processed_at)` **unique (device_id, gowa_message_id)**; unlinked groups never inserted.
  `OutboundMessage(to_jid, kind otp|card|reminder|reply, body (redacted for otp), dedupe_key unique?,
  status queued|sent|failed, attempts, gowa_message_id, reply_to_message_id, subject_type,
  subject_id, sent_at)`.
- **notifications (M6)**: `PushSubscription(person, endpoint, p256dh, auth, user_agent,
  last_ok_at)`; `NotificationPreference(person, channel, enabled)`.

### Key flows
1. **OTP login**: `GET /api/auth/csrf` → `POST /api/auth/otp/request {phone}`; normalize with
   `phonenumbers` (default region AR; AR mobiles are `549…`, CL `569…`); rate limits counted in DB:
   1/60 s and 5/h per phone, 10/h per IP (`CF-Connecting-IP`, safe only because `api` is reachable
   solely through cloudflared), global ~30/h to protect the shared number; ineligible phone → same
   200 body, same latency, no send (no enumeration); eligible → challenge + synchronous Gowa DM
   "Tu código de viajecito es 123456. Vence en 5 minutos." → `POST /api/auth/otp/verify {phone,
   code}` constant-time HMAC compare, lock at 5 attempts, single use, `login()` + CSRF rotation →
   `GET /api/me`. Kill switch `OTP_DELIVERY_ENABLED`.
2. **Link in group → proposal → card**: Gowa POSTs `/hooks/gowa/` → verify HMAC (403 on fail) →
   ignore non-`message`, `is_from_me`, non-`@g.us`, unlinked groups (200, no insert) →
   `get_or_create` ledger row on (device_id, id); duplicate → 200 no-op → ACK → on-commit
   `process(id)`: resolve sender (jid → lid → roster) → handler chain first-match:
   `commands` (`/viaje …`) → `quoted_card` (reply to a bot card: "+1", "elegida") → `link_capture`
   (extract URLs, strip tracking params, canonical URL; same URL in `default_trip` → +1/comment and
   "ya estaba"; else `Proposal(proposed)`) → unfurl via `LinkPreviewFetcher` port → classify
   (`RuleBasedClassifier`, optional `LlmClassifier`) → `OutboundMessage(card,
   dedupe_key="card:<id>")` sent with `reply_message_id` → store `message_id` → ledger `done`.
3. **Vote → status → itinerary**: `domain.transition(proposal, to, actor)` enforces
   proposed → discussing → chosen → booked (discarded from anywhere, reopen allowed); majority of
   `in` participants at +1 → bot suggests "Parece que ganó X, ¿la marcamos como elegida?" (choosing
   stays human); on `chosen`: `ItineraryEntry` (dated day or unscheduled tray) + `Task(booking)` +
   budget recompute; on `booked`: close task, store `booking_ref`.
4. **Reminders**: systemd timer → `docker compose exec -T api python manage.py tick` → `JobLock`
   → sweep stuck ledger rows (processing >2 min, ≤3 attempts) → reminder rules per active trip in
   trip tz (tasks overdue / due ≤3 days with backoff by `nudge_count`; polls missing votes before
   deadline; countdown T-30/T-7/T-1; morning digest during the trip with plan + snow) → quiet hours
   22:00–09:00 → `OutboundMessage(reminder, dedupe_key="nag:<task>:<date>")` → dispatch to the
   **group** mentioning owners (DMs only for OTP) → snow refresh every 3 h for resorts on active
   trips → daily roster sync via `GET /group/participants`.

### Link unfurling (security matters here)
- `linkpreview/adapters/httpx_fetcher.py`: http/https only, ports 80/443; manual redirects ≤4 hops
  validating each; resolve DNS and reject loopback, private, link-local, CGNAT 100.64/10, IPv6 ULA,
  IPv4-mapped IPv6, numeric/decimal hosts; pin the connection to the validated IP (IP in URL, `Host`
  header, `extensions={"sni_hostname": host}`) to kill DNS rebinding; 5 s connect / 8 s total;
  stream and stop at ~1 MB; `text/html` only; browser-like UA with `Accept-Language: es`.
- Parser: `selectolax` (fallback `beautifulsoup4`+`lxml` if arm64 wheels misbehave): OG/Twitter
  meta, `product:price:*`, JSON-LD `Product/Offer`. Blocked sites (Booking/Airbnb often) degrade to
  a title from the URL slug.
- Thumbnails: fetch `og:image` through the same guard, resize ~640 px WebP (Pillow), store locally.

## Roadmap (each milestone = one ODD feature document; chunks ≈ 400 changed lines, heuristic only)

### M0 — skeleton, auth, webhook, deploy
- **M0a scaffolding**: `git init` (main), tooling (`uv`, ruff, pytest, import-linter, pnpm, vitest,
  CI), Django config with SQLite WAL, `/api/health`, OpenAPI export + TS client pipeline, dev
  compose with `fake-gowa`, Next shell with `es-AR.json`.
  First tests: `test_health.py`, `test_sqlite_pragmas.py` (asserts `journal_mode=wal`), vitest smoke
  on the generated client wrapper.
- **M0b identity, crews, OTP**: `identity`, `crews`, `messaging/gowa/client.py`, `bootstrap_crew
  --name --chat-id --admin-phone`; web login page + authenticated shell.
  First tests: `test_phone_normalization.py` ("+54 9 11 5555-1234", "011 15 5555 1234",
  "+56 9 8765 4321" → E.164); `test_otp_policy.py` (6 digits, 5-min expiry with `time-machine`,
  lock at 5, single use, only HMAC stored); `test_request_otp_api.py` (429 + `Retry-After` for
  per-phone/per-IP/global; ineligible phone → identical 200, zero Gowa calls);
  `test_verify_otp_api.py` (CSRF required, session set, wrong code 400); `test_gowa_client.py`
  (`respx`: payload, Basic auth, DM JID format); web `LoginForm.test.tsx` (phone step, code step,
  voseo error copy, redirect; MSW); Playwright `login.spec.ts` reads the code from `fake-gowa`.
  Demo: log in on a phone with a WhatsApp code.
- **M0c webhook, ledger, Pi deploy**: `/hooks/gowa/`, `InboundMessage`, `/viaje ping` + `/viaje
  ayuda`, `deploy/compose.pi.yml`, cloudflared, `tick` skeleton, backups.
  First tests: `test_signature.py` (valid/invalid/missing/empty-secret-fails-closed/with and without
  `sha256=`); `test_webhook_view.py` (403 bad sig; duplicate → 200 + one row; unlinked group and
  `is_from_me` ignored; non-`message` ignored; no network in view via `pytest-socket`);
  `test_parser.py` on captured fixtures (incl. `@lid` sender, device suffix).
  Demo: `/viaje ping` in the real group → "pong".

### M1 — proposals (the heart)
- `proposals`, `linkpreview`, Trip stub, flow 2, web list/detail/vote/comment + status controls,
  **gastito change (R1)**.
- First tests: URL extraction (multiple URLs, trailing punctuation, tracking params, `wa.me`, Maps);
  SSRF table; OG fixtures (Booking, Airbnb, plain page), JSON-LD price, classifier rules; same-URL
  dedupe; status graph; vote uniqueness; card formatter snapshot (voseo); integration webhook →
  proposal with fake unfurler + fake Gowa asserting exactly one send with `reply_message_id` and
  replay creates no second card; web `ProposalCard` states, `VoteButtons` optimistic update,
  `ProposalList` container with MSW; Playwright replay → proposal appears.
- Demo: paste a link in the group, see the card in WhatsApp and the proposal on the web.

### M2 — decisions & dates
- RSVP, availability grid (touch-friendly), best-window algorithm (most `yes`, fewest `no`,
  tie-break weekend overlap, min length), closing a `Decision` writes trip dates, bot "falta votar".
- First tests: pure best-window (ties, min length, `maybe` weighting); closing sets dates; only
  members respond; web `AvailabilityGrid` interaction.
- Demo: the group converges on dates.

### M3 — logistics, budget, documents
- **M3a tasks, packing, nagging**: `Task`, templates (ski + border section), owners, `/viaje tareas`,
  `/viaje listo <n>`, `tick` v1 with reminder rules.
  First tests: cadence under `time-machine`, quiet hours, `dedupe_key` uniqueness, tick re-entrancy
  via `JobLock`, owner mention formatting.
- **M3b budget + documents vault**: computed forecast, encrypted uploads.
  First tests: split rounds to whole pesos; size + MIME allowlist; non-member → 404; `owner_only`
  visible only to owner; path traversal rejected; `Content-Disposition` set; encrypt/decrypt
  round-trip.
- Demo: the bot nags the owner of an open booking task; the web shows per-person cost.

### M4 — itinerary & live mode
- `ItineraryDay/Entry`, unscheduled tray, **Today** view (timeline, next meeting point, document
  shortcuts, quick notes), `/viaje hoy`, morning digest, ETag polling.
- First tests: Today selector across midnight in trip tz (AR UTC-3; CL observes DST → per-trip
  `timezone`); entry ordering; chosen → tray; `/viaje hoy` formatting.
- Stretch: PDFs forwarded in the group saved to the vault (media path whitelist from gastito).
- Demo: open "Hoy" at the resort without scrolling the group chat.

### M5 — ski module
- `ski` models, `SnowProvider` port + Open-Meteo adapter, manual report (`/viaje nieve`), refresh
  job, `SkiProfile` forms, lift-pass tracker, gear plan, ski packing template; registered as plugin.
- First tests: provider parsing from fixtures; 12 h staleness; lift-pass summary ("quién no tiene
  pase"); rental size roll-up; level grouping; refresh touches only active-trip resorts and backs
  off on failure; `/viaje nieve` reply.
- Demo: Today shows conditions; trip page shows who needs a pass or rental.

### M6 — PWA, push, polish
- Manifest + service worker (Serwist), install prompt, countdown, Web Push (VAPID, `pywebpush`),
  offline cache of Today + document list, proposals map (Leaflet + OSM), Cloudflare Access on
  `/admin`, accessibility pass, backup **restore drill**.
- First tests: push payload builder; subscription registration authenticated; 410 prunes
  subscription; Playwright offline Today; Lighthouse PWA audit.
- Demo: install on a phone, receive a push, open Today with no signal.

### Post-MVP
- "After" phase: albums on `Document(kind=photo)`, trip history cards (status `done` exists).
- AI concierge behind a `ConciergePort` with `trips.export_context` as the seam.
- Reactions as votes (`message.reaction` event; safe for gastito, which ignores non-`message`).

## Verification

- **Test stack**: API `pytest`, `pytest-django`, `factory_boy`, `respx`, `time-machine`,
  `pytest-socket` (no network by default), `import-linter`, `ruff` (+ `hypothesis` for phone/SSRF
  edge cases). Web `vitest`, React Testing Library, `user-event`, MSW 2 + `openapi-msw`; Playwright
  for 3 flows: login, link → proposal, Today.
- **Commands**:
  ```
  cd api && uv run pytest                      # all
  cd api && uv run pytest proposals -k ssrf    # focused
  cd api && uv run lint-imports && uv run ruff check .
  cd web && pnpm test && pnpm test:e2e
  make api-types                               # regenerate TS client; CI fails on drift
  ```
- **Local stack**: `make up` (api, web, fake-gowa) → `docker compose exec api python manage.py
  bootstrap_crew --name "…" --chat-id 120363…@g.us --admin-phone +54911…` → OTP code appears in
  `docker compose logs fake-gowa`.
- **Webhook replay**: `make replay FIXTURE=api/messaging/tests/fixtures/gowa/group_link.json`
  (computes HMAC, POSTs to `localhost:8000/hooks/gowa/`). Capture real fixtures from Gowa logs,
  redact phones.
- **Pi smoke** (`deploy/scripts/smoke.sh`): `/api/health` (DB write in WAL, media writable, last
  tick age, Gowa reachable) → signed payload from a fake chat → 200 + "ignored" row → `/viaje ping`
  in the real group → real OTP login → `systemctl list-timers` + `restic snapshots`.
- **Deploy/backup**: `make deploy` = `pull && up -d` + migrate + smoke. Nightly timer: `sqlite3
  .backup` + `restic backup` (DB snapshot + media) to R2/B2 or rsync over Tailscale; `restic forget
  --keep-daily 7 --keep-weekly 4 --prune`; healthchecks.io ping; `restore.sh` rehearsed in M6.

## Execution protocol (ODD)

- One `odd/tasks/viajecito-m<N>-<slug>.md` feature document per milestone (+ Engram mirror
  `odd/viajecito-m<N>-<slug>/tasks`), created before the first write of that milestone.
- **Strict TDD**: RED observed → GREEN → REFACTOR for every work unit. Runners: `uv run pytest`
  (api), `pnpm test` (web), `pnpm test:e2e` (Playwright).
- Work-unit commits on a feature branch, Conventional Commits, no attribution lines. Push/PR/merge
  are the user's call.
- Delegation: one writer per chunk; mapping/exploration delegated when 4+ files; parent spot-checks
  one reported command before delivery.
- Artifacts in English (code, identifiers, comments, commit messages, i18n keys); UI/bot copy in
  Rioplatense Spanish (voseo).

## Risks

- **R1 gastito overlap (confirmed)**: gastito's bot reacts 👂 and runs the LLM on every linked-group
  message. Before viajecito's webhook goes live, a small gastito PR must skip messages starting with
  `/viaje` or `/v ` and messages that are only URLs. Needs a brief Gowa restart on the droplet to
  add the second webhook URL (R9).
- **R2 sender identity**: group senders may arrive only as `@lid`. Mitigation: daily roster sync
  (phone ↔ lid); fallback `/viaje soy +54…`.
- **R3 Gowa delivery**: per-event goroutine, 30 s budget, no catch-up → Pi outage loses events.
  Idempotency + optional later backfill from Gowa chat storage.
- **R4 shared bot number**: a WhatsApp ban takes down both apps. OTP DMs to non-contacts are the
  exposure → crew-only recipients, rate limits, kill switch.
- **R5 sensitive data on the Pi**: IDs/passports and ski profile (height/weight). Encrypted at rest,
  USB SSD preferred, `owner_only` visibility; user may still decide to disallow ID scans.
- **R6 trip-day SPOF**: Pi/power/ISP down → offline PWA cache of Today + documents (M6).
- **R7 iOS Web Push** only for installed PWAs → onboarding step.
- **R8 Cloudflare Tunnel** needs a domain on Cloudflare; terms limit heavy non-HTML media proxying
  (photos fine).

## Open questions (not blocking M0–M2)

- Which specific resorts to seed first (Open-Meteo is the baseline; per-resort scraping is a
  later, fragile provider). Road status (Paso Los Libertadores, chains) has no source yet → manual
  note/link.
- Gowa send details to confirm at M0b against the live API: whether `X-Device-Id` is needed, exact
  `mentions` field on `/send/message`, is-on-WhatsApp check for AR numbers with the extra 9.
- Public hostname for the Pi (e.g. a subdomain of a domain already on Cloudflare).
