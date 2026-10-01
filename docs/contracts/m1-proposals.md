# M1 — Proposals and link capture (the heart)

Wave **A**. Branch `feat/m1-proposals`. Depends on core + requests R-1 (events), R-2 (reminders),
R-3 (subcommands), R-4 (`send_card`, `quoted_subject`, `default_trip_for_crew`), R-5 (cards).

## Scope & demo

Someone pastes a link in the WhatsApp group; viajecito extracts the URL, strips tracking parameters,
dedupes it against the crew's default trip, unfurls it safely (SSRF-guarded), classifies it, saves a
`Proposal(proposed)` and replies in the thread with a card that links to the web. People vote (+1/0/−1)
and comment on the web or by quoting the card ("+1", "elegida", "descartar"); status moves
`proposed → discussing → chosen → booked`, with `discarded` from anywhere and reopen allowed. When a
majority of `in` participants voted +1, the bot suggests choosing it (choosing stays human). Every status
change publishes `proposal.status_changed` for Wave B. **Demo: paste a link in the group, see the card in
WhatsApp and the proposal on the web; quote the card with "+1" and see the vote on the web.**

## Ownership

**Owns**
- api apps: `api/proposals/`, `api/linkpreview/` (models, migrations, domain, use_cases, ports, adapters,
  api, schemas, copy, bot, tests, management).
- bot handler modules + registry order: `proposals/bot/quoted_card.py` → `register_handler(20, …)`;
  `proposals/bot/link_capture.py` → `register_handler(30, …)`; `proposals/bot/subcommands.py` →
  `register_subcommand("propuestas", …)`. All registered in `ProposalsConfig.ready()`.
- copy: `api/proposals/copy/es_ar.py`.
- reminder rule `proposals.majority` and tick job `linkpreview.retry_pending` (registered in `ready()`).
- web: `web/src/features/proposals/**`; routes
  `web/src/app/(app)/crews/[crewId]/trips/[tripId]/proposals/page.tsx` and
  `web/src/app/(app)/crews/[crewId]/trips/[tripId]/proposals/[proposalId]/page.tsx` (+ `loading.tsx`);
  `web/messages/es-AR/proposals.json`.
- fixtures/tests: `api/proposals/tests/**` (incl. `fixtures/gowa/group_link.json`,
  `fixtures/gowa/group_quote_plus_one.json`, `fixtures/gowa/group_quote_chosen.json`),
  `api/linkpreview/tests/**` (incl. `fixtures/html/*.html`, `fixtures/images/*`),
  `web/src/features/proposals/test/handlers.ts`, `web/e2e/proposals.spec.ts`.
- management command: `api/linkpreview/management/commands/unfurl.py` (`manage.py unfurl <url>` — dev
  diagnostic, prints the parsed preview; uses the real fetcher, never run in tests).
- One-line appends: `config/settings/apps.py` (`"linkpreview",` then `"proposals",` — two lines, one per
  app, allowed), `pyproject.toml` root_packages (both), `web/messages/es-AR/index.ts`,
  `web/src/features/trips/cards/index.ts`.

**Reads (consumes)**: core `trips` use cases (trip lookup, `default_trip_for_crew`, participants with
rsvp), `crews` use cases, `shared/api_auth.member_of_trip`, `messaging.handlers.types`,
`messaging.reminders`, `shared/events`, `shared/clock`.

**Must not touch**: `trips`, `crews`, `identity`, `messaging` (incl. `messaging/copy/es_ar.py`,
`router.py`, `handlers/commands.py`), `config/api.py`, `config/settings/*.py` (except the append),
existing `src/ui/**`, `features/trips|auth|ops`, `deploy/**` (incl. fake Gowa), every other milestone's
apps/folders, `AGENTS.md`, `odd/**`. The gastito change (risk R1: gastito must ignore `/viaje`, `/v ` and
link-only messages) lives in another repository and is an owner action, not this writer's.

## Models

All models have `id` (UUID pk, `uuid4`), `created_at` (auto_now_add), `updated_at` (auto_now) unless noted.

### `linkpreview.LinkPreview` (shared unfurl cache, not trip-scoped)

| Field | Type | Null | Default | Notes |
|---|---|---|---|---|
| `url` | URLField(2000) | no | — | first URL seen (tracking params already stripped) |
| `canonical_url` | CharField(2000) | no | — | **unique**; output of `canonicalize()` |
| `final_url` | URLField(2000) | no | `""` | after redirects |
| `site_name` | CharField(200) | no | `""` | |
| `title` | CharField(300) | no | `""` | falls back to the URL slug |
| `description` | CharField(1000) | no | `""` | |
| `image_url` | URLField(2000) | no | `""` | og/twitter image |
| `thumb_file` | ImageField(`upload_to="linkpreview/thumbs/"`) | yes | null | `<uuid4>.webp`, ≤ 640 px wide |
| `price_amount` | Decimal(12,2) | yes | null | |
| `price_currency` | CharField(3) | no | `""` | ISO 4217 upper |
| `lat`, `lng` | Decimal(9,6) | yes | null | from Maps URLs / `place:location:*` / JSON-LD `geo` |
| `fetch_status` | CharField(16) | no | `pending` | `pending \| ok \| partial \| blocked \| failed` |
| `fetch_error` | CharField(200) | no | `""` | reason code, never a stack trace |
| `fetch_attempts` | PositiveSmallInt | no | 0 | |
| `fetched_at` | DateTime | yes | null | |
| `raw` | JSON | no | `{}` | extracted meta only (≤ 32 KB), never full HTML |

Indexes: `fetch_status`. `partial` = page fetched but no title/image; `blocked` = 403/429/captcha or
non-HTML; both still render a slug title.

### `proposals.Proposal`

| Field | Type | Null | Default | Choices / notes |
|---|---|---|---|---|
| `trip` | FK `trips.Trip` CASCADE | no | — | `related_name="proposals"` |
| `author` | FK `AUTH_USER_MODEL` PROTECT | no | — | |
| `category` | CharField(16) | no | `other` | `lodging \| transport \| activity \| food \| gear \| destination \| other` |
| `status` | CharField(16) | no | `proposed` | `proposed \| discussing \| chosen \| booked \| discarded` |
| `title` | CharField(300) | no | — | from preview or user |
| `note` | TextField(2000) | no | `""` | text that came with the link, or user note |
| `link_preview` | FK `linkpreview.LinkPreview` SET_NULL | yes | null | |
| `canonical_url` | CharField(2000) | yes | null | denormalized for per-trip dedupe |
| `est_price` | Decimal(12,2) | yes | null | ≥ 0 |
| `price_basis` | CharField(16) | no | `total` | `total \| per_person \| per_night` |
| `currency` | CharField(3) | no | trip currency at creation | ISO 4217 upper |
| `starts_on`, `ends_on` | Date | yes | null | `ends_on >= starts_on` (check constraint) |
| `booking_ref` | CharField(120) | no | `""` | |
| `chosen_at`, `booked_at` | DateTime | yes | null | set on transition, cleared on reopen |
| `discarded_at` | DateTime | yes | null | |
| `source_message` | FK `"messaging.InboundMessage"` SET_NULL | yes | null | string reference, no import |
| `classified_by` | CharField(16) | no | `user` | `rules \| llm \| user` |

Constraints: unique `(trip, canonical_url)` **where `canonical_url IS NOT NULL`** (named
`unique_trip_canonical_url`); check `ends_on >= starts_on` when both set. Indexes: `(trip, status)`,
`(trip, category)`.

### `proposals.Vote`

| Field | Type | Null | Notes |
|---|---|---|---|
| `proposal` | FK Proposal CASCADE | no | `related_name="votes"` |
| `person` | FK `AUTH_USER_MODEL` CASCADE | no | |
| `value` | SmallInt | no | choices `-1 \| 0 \| 1` (check constraint) |
| `source_message` | FK `"messaging.InboundMessage"` SET_NULL | yes | |

Unique `(proposal, person)` — re-voting updates the row.

### `proposals.Comment`

| Field | Type | Null | Notes |
|---|---|---|---|
| `proposal` | FK Proposal CASCADE | no | `related_name="comments"` |
| `author` | FK `AUTH_USER_MODEL` PROTECT | no | |
| `body` | TextField | no | 1–2000 chars, stripped |
| `source_message` | FK `"messaging.InboundMessage"` SET_NULL | yes | |

Index `(proposal, created_at)`.

### Computed (not tables)
- **Tally** per proposal: `up`, `neutral`, `down`, `score = up − down`, `my_vote`.
- **Majority**: `up > in_count / 2` and `in_count >= 2`, counting only votes from participants with
  `rsvp = in`.
- **`allowed_transitions`** for the viewer (from the status graph below).

### Domain rules

#### Status graph (`proposals/domain.py::transition(current, to) -> Transition | raises InvalidTransition`)

| From | Allowed `to` |
|---|---|
| `proposed` | `discussing`, `chosen`, `discarded` |
| `discussing` | `chosen`, `discarded`, `proposed` (reopen) |
| `chosen` | `booked`, `discussing` (reopen), `discarded` |
| `booked` | `chosen` (unbook), `discarded` |
| `discarded` | `proposed` (reopen) |

- `to == current` is an idempotent no-op (200, no event).
- Automatic: the first comment or first non-zero vote on a `proposed` proposal moves it to `discussing`
  (publishes the event, `actor_id` = that person).
- Side effects inside the transition use case (`use_cases/transition_proposal.py`, one `atomic` block):
  `→ chosen` sets `chosen_at`; `→ booked` sets `booked_at` and stores `booking_ref` if given; leaving
  `chosen/booked` backwards clears the corresponding timestamps; `→ discarded` sets `discarded_at`;
  then `events.publish("proposal.status_changed", proposal_id, trip_id, from_status, to_status, actor_id,
  occurred_at)`. **Itinerary tray entry (M4), booking task (M3) and budget recompute (M3, computed on read)
  happen in subscribers, never here.** M1 imports neither.

#### URL extraction and canonicalization (`linkpreview/domain/urls.py`, pure)
- `extract_urls(text) -> list[str]`: `http(s)://…` and bare `www.…`; strip trailing `.,;:!?…'"»` and
  unbalanced closing `)]}`; dedupe preserving order; **max 3 per message** (the rest are ignored and the
  reply says so).
- Ignored hosts (not proposals): `wa.me`, `chat.whatsapp.com`, `api.whatsapp.com`, the app's own
  `PUBLIC_ORIGIN` host, gastito's host (`Crew.gastito_group_url` host).
- `strip_tracking(url)`: drop `utm_*`, `fbclid`, `gclid`, `gbraid`, `wbraid`, `dclid`, `msclkid`, `yclid`,
  `igshid`, `igsh`, `mc_cid`, `mc_eid`, `_hsenc`, `_hsmi`, `ref`, `ref_src`, `si`, `spm`; host-specific:
  `booking.com` → `aid, label, sid, srpvid, ucfs, arphpl, sb_price_type, srepoch, all_sr_blocks, highlighted_blocks`;
  `airbnb.*` → `source_impression_id, previous_page_section_name, federated_search_id, unique_share_id, guests_from_sharing`;
  `mercadolibre.*` → `tracking_id, searchVariation, position, search_layout, type`.
- `canonicalize(url)`: lowercase scheme/host, drop `www.`, drop default ports and fragment, IDNA host,
  sort remaining query params, remove trailing `/` except root. Maps short links (`maps.app.goo.gl`,
  `goo.gl/maps`) canonicalize **after** redirect resolution to the final `google.com/maps/...` URL.
- Maps coordinates: parse `@<lat>,<lng>`, `q=<lat>,<lng>`, `ll=`, `!3d<lat>!4d<lng>` → `lat/lng`;
  category `destination` unless the place name matches a lodging keyword.

#### Classifier
- Port `ProposalClassifier.classify(preview: PreviewData, text: str) -> Classification(category, confidence)`.
- `RuleBasedClassifier` (default): host table + keyword table (Spanish and English), e.g. lodging:
  `booking.com, airbnb.*, hotels.com, expedia.*, hostelworld.com, vrbo.com`, keywords
  `hotel|hostel|cabaña|depto|departamento|apart|refugio|alojamiento`; transport: `despegar.*,
  aerolineas.com.ar, latamairlines.com, flybondi.com, jetsmart.com, skyairline.com, plataforma10.com,
  turbus.cl, busbud.com, rentalcars.com`, keywords `vuelo|pasaje|bus|micro|auto|alquiler de auto|transfer`;
  gear: `rental|alquiler de equipo|esquíes|tabla|snowboard`; food: `restaurant|resto|parrilla|tripadvisor.*/Restaurant_Review`;
  activity: `excursion|clase|pase|lift|ticket|tour|entradas`; destination: maps URLs, `wikipedia.org`.
  Confidence 0.9 on host match, 0.6 on keyword, 0.0 → `other`.
- `LlmClassifier` (optional adapter, OpenAI-compatible like gastito): used only when
  `PROPOSALS_LLM_CLASSIFIER_ENABLED` and rule confidence < 0.5; 5 s timeout; any failure → rule result.
  Disabled in tests and dev by default.

#### Price extraction (parser)
`product:price:amount/currency`, `og:price:amount/currency`, JSON-LD `Product/Offer`
(`price`, `priceCurrency`, `lowPrice`), `Hotel/LodgingBusiness` `priceRange` ignored. A preview price
copies into `Proposal.est_price/currency` only if the proposal has none; `price_basis` stays `total`.

## API

All endpoints `django_auth`, snake_case, errors `{code,message}`; authorization = `member_of_trip` on the
proposal's trip (§1 rule 2). Router: `proposals/api.py` exposes `router` (mounted at `""`), tag `proposals`.

### Schemas

```
LinkPreviewOut   {url, final_url, site_name, title, description, image_url, has_thumbnail: bool,
                  price_amount: str|null, price_currency, lat: float|null, lng: float|null,
                  fetch_status, fetched_at: datetime|null}
VoteTallyOut     {up: int, neutral: int, down: int, score: int, my_vote: -1|0|1|null, majority: bool}
PersonRefOut     {person_id: uuid, display_name: str}
ProposalSummaryOut {id, trip_id, category, status, title, note, author: PersonRefOut,
                  est_price: str|null, currency, price_basis, starts_on, ends_on, booking_ref,
                  preview: LinkPreviewOut|null, tally: VoteTallyOut, comment_count: int,
                  allowed_transitions: [status], web_path: str, created_at, updated_at}
ProposalOut      ProposalSummaryOut + {votes: [{person: PersonRefOut, value}], chosen_at, booked_at,
                  discarded_at, source: "whatsapp"|"web"}
CommentOut       {id, proposal_id, author: PersonRefOut, body, source: "whatsapp"|"web", created_at, can_delete: bool}
ProposalsSummaryOut {counts: {<status>: int}, top: [ProposalSummaryOut] (≤3, open statuses by score)}
```
Money is a decimal **string** (`"1234.50"`). `web_path` = `/crews/<crew_id>/trips/<trip_id>/proposals/<id>`.
`lat/lng` are exposed for the M6 map (read-only consumer).

### Endpoints

| Method + path | Request | Success | Errors |
|---|---|---|---|
| `GET /api/trips/{trip_id}/proposals` | query `category` (repeatable), `status` (repeatable; default all except `discarded`), `include_discarded: bool=false`, `sort: "score"\|"recent"` (default `recent`) | `200 [ProposalSummaryOut]` (no pagination; max 500, newest first or score desc then newest) | `400 invalid_request` (unknown category/status), `404 not_found` |
| `GET /api/trips/{trip_id}/proposals/summary` | — | `200 ProposalsSummaryOut` | `404` |
| `POST /api/trips/{trip_id}/proposals` | `{url?: str, title?: str ≤300, category?, note?: ≤2000, est_price?: str, currency?: str(3), price_basis?, starts_on?, ends_on?}` — `url` or `title` required | `201 ProposalOut` (`preview.fetch_status = "pending"` when a URL was given; unfurl runs off-request) | `400 invalid_request` / `invalid_url` / `ignored_url` (wa.me etc.) / `invalid_dates`; `409 duplicate_proposal` + extra field `proposal_id`; `404` |
| `GET /api/proposals/{proposal_id}` | — | `200 ProposalOut` | `404` |
| `PATCH /api/proposals/{proposal_id}` | any of `title, note, category, est_price (null clears), currency, price_basis, starts_on, ends_on, booking_ref` | `200 ProposalOut`; editing `category` sets `classified_by="user"` | `400 invalid_request` / `invalid_dates`; `404` |
| `POST /api/proposals/{proposal_id}/transition` | `{to: status, booking_ref?: str}` | `200 ProposalOut` (no-op when `to == status`) | `409 invalid_transition`; `400 invalid_request`; `404` |
| `PUT /api/proposals/{proposal_id}/vote` | `{value: -1\|0\|1}` | `200 VoteTallyOut` | `400 invalid_request`; `409 proposal_closed` (status `discarded`); `404` |
| `DELETE /api/proposals/{proposal_id}/vote` | — | `200 VoteTallyOut` (idempotent) | `404` |
| `GET /api/proposals/{proposal_id}/comments` | — | `200 [CommentOut]` oldest first, max 500 | `404` |
| `POST /api/proposals/{proposal_id}/comments` | `{body: 1..2000}` | `201 CommentOut` | `400 invalid_request`; `404` |
| `DELETE /api/comments/{comment_id}` | — | `204` | `403 forbidden` (not the author); `404` |
| `POST /api/proposals/{proposal_id}/refresh_preview` | — | `202 {"status":"queued"}` (only when `fetch_status` ≠ `pending`; max once per 10 min per preview) | `409 refresh_too_soon`; `404 not_found` (also when the proposal has no URL) |
| `GET /api/proposals/{proposal_id}/thumbnail` | — | `200 image/webp` bytes; `Cache-Control: private, max-age=86400`; `X-Content-Type-Options: nosniff` | `404` (no thumb or not a member) |

Notes: thumbnails are served only through this authorized endpoint; nothing is linked from `/media/`.
`POST …/proposals` on the web path enqueues the unfurl with `transaction.on_commit` onto a module-level
`ThreadPoolExecutor(max_workers=2)` in `linkpreview/adapters/executor.py`
(`LINKPREVIEW_FETCH_SYNC=1` in test settings runs inline, same pattern as `OTP_SEND_SYNC`). Previews
reused when `fetched_at` < 7 days and `fetch_status in (ok, partial)`.

### Settings (read via `linkpreview/conf.py` / `proposals/conf.py`; orchestrator adds env parsing)
`PUBLIC_ORIGIN` (exists; base for card links), `LINKPREVIEW_FETCHER` (`httpx` default, `static` for dev
e2e: canned previews by host from `linkpreview/tests/fixtures/static_previews.json`, `fake` in tests),
`LINKPREVIEW_FETCH_SYNC` (0; 1 in tests), `LINKPREVIEW_MAX_BYTES` (1_048_576),
`PROPOSALS_LLM_CLASSIFIER_ENABLED` (0), `PROPOSALS_LLM_BASE_URL`, `PROPOSALS_LLM_API_KEY`,
`PROPOSALS_LLM_MODEL`.

## Bot

### `link_capture` (order 30)
Claims a message only when `extract_urls(body)` yields ≥ 1 non-ignored URL. Steps (inside the messaging
executor, already off the request path):
1. Trip = `default_trip_for_crew(ctx.crew_id)`; none → reply `NO_ACTIVE_TRIP` (with `PUBLIC_ORIGIN`) and
   return `Handled("link_capture", {"reason": "no_trip"})`.
2. For each URL (≤ 3): strip tracking → resolve preview (cache hit or synchronous unfurl through the guard,
   8 s total budget per URL) → canonical URL → dedupe on `(trip, canonical_url)`.
   - **Existing**: if the sender has no vote, record `+1` (`source_message` = this inbound); if the message
     has text besides the URL, add it as a `Comment`; reply `ALREADY_THERE` threaded to the inbound.
   - **New**: classify, create `Proposal(proposed)` with `note` = text minus URLs, `source_message` = inbound;
     then `ctx.send_card(card_body, subject_type="proposal", subject_id=<id>, dedupe_key=f"card:proposal:{id}")`.
3. Outcome detail: `{"created": [ids], "existing": [ids], "ignored_urls": n}`. Replay of the same inbound
   cannot create a second proposal (unique constraint) or a second card (dedupe key).

### `quoted_card` (order 20)
Claims only when `ctx.quoted_subject` is `("proposal", <id>)` **and** the folded body matches a verb;
otherwise returns `None` (so a quoted card with a URL still reaches link capture, and chatter is ignored).

| Folded body (exact after trim, emoji allowed) | Action |
|---|---|
| `+1`, `👍`, `si`, `me gusta`, `va` | vote +1 |
| `-1`, `👎`, `no` | vote −1 |
| `0`, `meh`, `me da igual` | vote 0 |
| `elegida`, `elegido`, `la elegimos` | transition → `chosen` |
| `reservada`, `reservado`, `booked` | transition → `booked` (from `chosen` only) |
| `descartar`, `descartada`, `descartado` | transition → `discarded` |
| `reabrir` | transition → `proposed` (from `discarded`) / `discussing` (from `chosen`) |
| anything else starting with `comentario:` or `nota:` | add a `Comment` with the rest |

Reply copy keys: `VOTE_RECORDED`, `STATUS_CHANGED`, `INVALID_TRANSITION`, `COMMENT_ADDED`. Throttled
chats: record the action, skip the reply (same as core commands).

### `/viaje propuestas` (subcommand)
Top 5 open proposals (status `proposed|discussing|chosen`) of the default trip by score:
`1) <title> · <status label> · +<up>/-<down>` and the list URL. Help line `HELP_PROPUESTAS`.

### Reminder rule `proposals.majority`
Pure read over active trips: each `proposed|discussing` proposal with `majority = true` yields one draft
`MAJORITY_SUGGESTION` with `dedupe_key = "proposals:majority:<proposal_id>"`, `subject_type="proposal"`,
`url_path = web_path`, no mentions. Fires once per proposal ever (reopened proposals do not re-suggest).

### Tick job `linkpreview.retry_pending`
Previews in `pending` for > 2 min or `failed` with `fetch_attempts < 3` and last attempt > 15 min ago;
≤ 3 per tick; on success, if the owning proposal's card has not been sent yet nothing else happens (web
created proposals have no card).

### Copy (`api/proposals/copy/es_ar.py`, suggested voseo)
- `CARD = "{emoji} *{title}*\n{category_label}{price_line}\n{site_line}👉 {url}\nRespondé a este mensaje con +1, -1, \"elegida\" o \"descartar\"."`
- `CATEGORY_LABELS` / `CATEGORY_EMOJI`: lodging "Alojamiento" 🏠, transport "Transporte" 🚌, activity
  "Actividad" 🎿, food "Comida" 🍽️, gear "Equipo" 🧤, destination "Destino" 📍, other "Otro" 🔗.
- `PRICE_LINE = " · {amount} {currency}{basis}"`, basis `" por persona"`, `" por noche"`, `""`.
- `ALREADY_THERE = "Ya estaba 👀 (la propuso {author}). Te sumé un +1."` (variant without the +1 when they
  had voted).
- `NO_ACTIVE_TRIP = "Todavía no hay un viaje activo. Creá uno en {url} y volvé a tirar el link."`
- `TOO_MANY_LINKS = "Guardé los primeros 3 links; el resto mandalo de a poco."`
- `VOTE_RECORDED = "Anotado: {vote_label} para {title} ({up} a favor, {down} en contra)."`
- `STATUS_CHANGED = "Listo, {title} quedó como {status_label}."`
- `INVALID_TRANSITION = "No puedo pasar {title} de {from_label} a {to_label}."`
- `MAJORITY_SUGGESTION = "Parece que ganó {title} ({up} de {in_count}). ¿La marcamos como elegida? Respondé \"elegida\" a la tarjeta o entrá a {url}."`
- `STATUS_LABELS`: proposed "propuesta", discussing "en discusión", chosen "elegida", booked "reservada",
  discarded "descartada".
- `HELP_PROPUESTAS = "/viaje propuestas — las más votadas"`.
Card formatting is a pure function `proposals/domain/card.py::format_card(snapshot, web_url) -> str`
(snapshot-tested).

## Web

### Routes / pages (server components call `requireMe()` first — auth gate rule)
- `…/[tripId]/proposals/page.tsx` → `<ProposalBoard tripId crewId />`.
- `…/[tripId]/proposals/[proposalId]/page.tsx` → `<ProposalDetail proposalId />`; unknown id → `notFound()`.

### Containers (`features/proposals/containers/`)
`ProposalBoard` (filters + list + add form), `ProposalDetail` (preview, price, dates, votes, status control,
comments), `AddProposalForm`, `CommentThread`, `ProposalsOverviewCard` (registered in `tripCards`,
`module: "proposals"`, `order: 10`: counts by status + top 3 with score).

### Presentational (`features/proposals/components/`)
`ProposalCard` (states: `pending` → skeleton thumbnail + URL; `blocked/partial/failed` → slug title +
site; `chosen` → badge; `booked` → badge + ref; `discarded` → muted, strikethrough title),
`ProposalThumbnail` (uses `/api/proposals/{id}/thumbnail` only when `has_thumbnail`), `PriceTag`,
`CategoryChip`, `StatusBadge`, `VoteButtons` (+1/0/−1, `aria-pressed`, counts), `StatusControl` (renders
only `allowed_transitions`; `discarded` and backwards moves go through `ConfirmDialog`),
`ProposalFilters` (category + status chips, `role="group"`), `CommentItem`, `CommentForm`.

### Hooks + query keys (`features/proposals/hooks/`, api in `features/proposals/api/`)
| Hook | Query key | Interval |
|---|---|---|
| `useProposals(tripId, filters)` | `["proposals", tripId, "list", filters]` | 60 s |
| `useProposalsSummary(tripId)` | `["proposals", tripId, "summary"]` | 60 s |
| `useProposal(id)` | `["proposals", "detail", id]` | 30 s |
| `useComments(id)` | `["proposals", "detail", id, "comments"]` | 30 s |
| `useVote(id)` | mutation; **optimistic** tally on detail + list caches, rollback on error | — |
| `useTransition(id)`, `useCreateProposal(tripId)`, `useUpdateProposal(id)`, `useAddComment(id)`, `useDeleteComment` | mutations; invalidate `["proposals", tripId]` and the detail key | — |

`409 duplicate_proposal` → toast + link to the existing proposal (`proposal_id`).

### Forms / validation
Add form: URL (must parse as http/https) **or** title; category select; optional price (decimal ≥ 0,
2 dp), currency (defaults to trip currency), basis, dates (end ≥ start). Comment: 1–2000 chars, counter.

### i18n (`web/messages/es-AR/proposals.json`, keys `proposals.*`)
`title` "Propuestas", `add.title` "Sumá una propuesta", `add.url` "Link", `add.urlHint` "Pegá el link o
tiralo en el grupo", `add.titleField` "Título", `add.submit` "Guardar", `filters.category` "Categoría",
`filters.status` "Estado", `filters.showDiscarded` "Mostrar descartadas", `category.<key>` (same labels as
bot), `status.<key>`, `vote.up` "Me copa", `vote.neutral` "Me da igual", `vote.down` "Paso",
`vote.count` "{up} a favor · {down} en contra", `transition.<to>` ("Discutir", "Elegir", "Marcar
reservada", "Descartar", "Reabrir"), `transition.confirmDiscard` "¿La descartamos?", `price.perPerson`
"por persona", `price.perNight` "por noche", `comments.title` "Comentarios", `comments.placeholder`
"Escribí algo…", `comments.submit` "Comentar", `comments.delete` "Borrar", `empty.title` "Todavía no hay
propuestas", `empty.body` "Tirá un link en el grupo de WhatsApp o sumalo acá.", `preview.pending`
"Buscando la info del link…", `preview.blocked` "No pudimos leer la página", `overview.title`
"Propuestas", `overview.counts` "{proposed} nuevas · {chosen} elegidas", `errors.duplicate_proposal`
"Esa propuesta ya estaba", `errors.invalid_transition` "No se puede cambiar a ese estado",
`errors.invalid_url` "Ese link no parece válido", `errors.ignored_url` "Ese link no es una propuesta",
`errors.invalid_dates` "La fecha de fin tiene que ser después del inicio", `errors.refresh_too_soon`
"Esperá un rato antes de reintentar".

### Empty states / accessibility
Empty list: `EmptyState` with the WhatsApp hint. Filters result empty: "No hay propuestas con esos
filtros" + clear button. Vote buttons: `aria-pressed`, `aria-label` with the count; status changes
announce via a polite live region; thumbnails have `alt=""` (decorative, title is adjacent); touch
targets ≥ 44 px; all controls keyboard reachable; no colour-only status (badge text).

## Tests

### api (first tests, in this order)
- `linkpreview/tests/test_url_extraction.py` — multiple URLs, trailing punctuation and parens, `www.`,
  max 3, `wa.me`/`chat.whatsapp.com` ignored, Maps short and long links, text without URLs.
- `linkpreview/tests/test_canonical_url.py` — tracking params (global + per host), sort, `www.`, default
  ports, fragment, trailing slash, IDNA.
- `linkpreview/tests/test_ssrf_guard.py` — **table-driven** over every rule in Security below (incl.
  hypothesis for numeric host spellings); DNS resolution faked via a resolver port.
- `linkpreview/tests/test_httpx_fetcher.py` — `respx`: redirect chain ≤ 4 validated per hop, 5th hop
  rejected, non-HTML rejected, 1 MB cap stops the stream, `Host` header + `sni_hostname` set to the
  original host while connecting to the pinned IP.
- `linkpreview/tests/test_html_parser.py` — fixtures `booking.html`, `airbnb.html`, `plain.html`,
  `jsonld_offer.html`, `maps_place.html`: title/description/image/site, JSON-LD price, OG price, slug
  fallback for blocked pages.
- `linkpreview/tests/test_thumbnail.py` — resize to ≤ 640 px WebP, EXIF stripped, SVG/oversize/decompression
  bomb rejected.
- `proposals/tests/test_classifier.py` — host and keyword rules, confidence, LLM path only below 0.5
  (fake port), LLM failure falls back.
- `proposals/tests/test_status_graph.py` — every allowed and forbidden edge, idempotent same-state,
  timestamps set/cleared, auto `discussing` on first comment/vote.
- `proposals/tests/test_transition_publishes_event.py` — `events.isolated()`; one event with the exact
  payload; no event on no-op; subscriber exception rolls back the transition.
- `proposals/tests/test_votes.py` — uniqueness per person, re-vote updates, delete, tally, majority only
  counts `rsvp=in`, discarded → 409.
- `proposals/tests/test_dedupe.py` — same canonical URL in the trip → +1 and comment, not a new row;
  same URL in another trip → new proposal.
- `proposals/tests/test_card_formatter.py` — snapshot of `format_card` for each category, with/without
  price, voseo copy.
- `proposals/tests/test_link_capture_integration.py` — signed webhook POST of `fixtures/gowa/group_link.json`
  with the fake fetcher and `respx` on Gowa: one proposal, **exactly one** `/send/message` with
  `reply_message_id` = the inbound id; replaying the same fixture creates no second proposal and no second
  send.
- `proposals/tests/test_quoted_card.py` — `group_quote_plus_one.json` and `group_quote_chosen.json` with a
  seeded card `OutboundMessage`: vote recorded / status changed; quote of a non-card ignored.
- `proposals/tests/test_majority_rule.py` — rule yields one draft at majority, none below, dedupe key.
- `proposals/tests/test_proposals_api.py` — non-member → 404 on every route, anonymous 401, CSRF 403,
  filters, sort, 409 duplicate with `proposal_id`, 409 invalid_transition, comment delete by non-author 403.

### web
- `features/proposals/components/ProposalCard.test.tsx` — every preview/status state.
- `features/proposals/components/VoteButtons.test.tsx` — optimistic update and rollback on 500 (MSW).
- `features/proposals/containers/ProposalBoard.test.tsx` — list from MSW, filters change the query,
  empty state, add-form validation and 409 handling.
- `features/proposals/components/StatusControl.test.tsx` — only allowed transitions; confirm on discard.
- `features/proposals/containers/CommentThread.test.tsx` — add, delete own, counter.
- MSW handlers: `features/proposals/test/handlers.ts` (`openapi-msw`, typed from `schema.d.ts`) exporting
  `proposalsHandlers` and factories `makeProposal()`, `makeComment()` for reuse by M6 (map) tests.
- e2e `web/e2e/proposals.spec.ts` — dev stack with `LINKPREVIEW_FETCHER=static`: `make replay
  FIXTURE=api/proposals/tests/fixtures/gowa/group_link.json` → log in → proposal visible on the trip's
  proposals page; fake Gowa `GET /__sent` shows one card with `reply_message_id`.

## Security / robustness

Link unfurling (copied from the plan; every bullet is a test row in `test_ssrf_guard.py` /
`test_httpx_fetcher.py`):
- `linkpreview/adapters/httpx_fetcher.py`: http/https only, ports 80/443; manual redirects ≤4 hops
  validating each; resolve DNS and reject loopback, private, link-local, CGNAT 100.64/10, IPv6 ULA,
  IPv4-mapped IPv6, numeric/decimal hosts; pin the connection to the validated IP (IP in URL, `Host`
  header, `extensions={"sni_hostname": host}`) to kill DNS rebinding; 5 s connect / 8 s total;
  stream and stop at ~1 MB; `text/html` only; browser-like UA with `Accept-Language: es`.
- Parser: `selectolax` (fallback `beautifulsoup4`+`lxml` if arm64 wheels misbehave): OG/Twitter
  meta, `product:price:*`, JSON-LD `Product/Offer`. Blocked sites (Booking/Airbnb often) degrade to
  a title from the URL slug.
- Thumbnails: fetch `og:image` through the same guard, resize ~640 px WebP (Pillow), store locally.

Additional M1 rules:
- Also reject: userinfo in URLs (`user:pass@`), multicast/reserved/unspecified (`0.0.0.0`, `::`),
  `169.254.169.254`, hosts resolving to **any** blocked address (check every A/AAAA record, pin the first
  allowed only if all are allowed), hostnames without a dot, and `localhost`/`*.localhost`/`*.local`/
  `*.internal`. Each redirect `Location` is resolved relative to the current URL and re-validated.
- Image fetch: `image/jpeg|png|webp|gif` only, ≤ 5 MB, `Image.MAX_IMAGE_PIXELS = 25_000_000`, `verify()`
  then reopen, drop EXIF/ICC, never SVG.
- Never store full HTML; `raw` keeps extracted meta only, capped at 32 KB; strings truncated to field
  sizes; titles stripped of control characters before going into the card.
- Card text never includes the full original URL's query string (only the canonical URL or the web link),
  so stripped tracking params never come back.
- Fetch failures are values (`fetch_status`, `fetch_error` code), never exceptions out of the handler.
- Thumbnail endpoint authorizes like every other trip read; thumbnail filenames are random UUIDs.
- `PUBLIC_ORIGIN` must be an absolute `https://` URL in prod for card links (dev `http://localhost:3000`).

## Open questions / assumptions

- **[default]** Multiple `chosen` proposals per category are allowed (two lodgings for two legs). No
  automatic discarding of siblings.
- **[default]** `0` votes count as "me da igual" and do not move a proposal to `discussing`.
- **[default]** Up to 3 URLs per message, one card per new proposal (cards are exempt from the 3 s reply
  gap, request R-4).
- **[default]** Previews are cached globally by canonical URL for 7 days; per-trip data (title edits,
  price) lives on `Proposal`.
- **[default]** The dev/e2e stack uses `LINKPREVIEW_FETCHER=static`; nothing in CI hits the internet.
- **[default]** Proposal deletion is not exposed in the API (discard instead); admins can delete in
  Django admin.
- **[default]** Comments are not editable in M1.
- Open: whether reactions (`message.reaction`) should count as votes — post-MVP per the plan.
