# M4 — Itinerary and live mode (Today)

Wave **B** (after M1 is on `main`; in parallel with M3). Branch `feat/m4-itinerary`. Depends on core +
R-1 (subscribes to `proposal.status_changed`), R-2 (reminders + `digest_sections`), R-3 (subcommands),
R-5 (cards), M1 `proposals.use_cases`. Reads M3's documents list and M5's ski conditions **over HTTP
from the web only**.

## Scope & demo

A day-by-day itinerary for the trip, with an **unscheduled tray** that fills itself when proposals are
chosen; entries can be scheduled on a day with times, marked as meeting points and reordered (up/down is
enough; drag & drop optional). A **Today** view computed in the trip's timezone shows the timeline, the
next meeting point, document shortcuts, snow conditions (ski trips), pinned and quick notes, polled every
20 s with ETag/`If-None-Match`. The bot answers `/viaje hoy` and posts a morning digest during the trip.
**Demo: open "Hoy" at the resort without scrolling the group chat.**

## Ownership

**Owns**
- api app `api/itinerary/` (models, migrations, domain incl. `today.py`, use_cases, ports, adapters, api,
  schemas, copy, bot, tests).
- bot: `itinerary/bot/subcommands.py` → `register_subcommand("hoy", …)`; reminder rule
  `itinerary.morning_digest`; event subscriber `itinerary.on_proposal_status_changed`.
- copy `api/itinerary/copy/es_ar.py`.
- web: `web/src/features/itinerary/**`, `web/src/features/today/**`; routes
  `…/[tripId]/itinerary/page.tsx`, `…/[tripId]/today/page.tsx` (+ `loading.tsx`);
  `web/messages/es-AR/itinerary.json`, `web/messages/es-AR/today.json`.
- tests: `api/itinerary/tests/**`, `web/src/features/{itinerary,today}/test/handlers.ts`,
  `web/e2e/today.spec.ts`.
- One-line appends: `config/settings/apps.py`, `pyproject.toml` root_packages, `web/messages/es-AR/index.ts`
  (two files), `web/src/features/trips/cards/index.ts`.

**Reads**: `proposals.use_cases.get_proposal_snapshot`, `trips` use cases (trip, participants),
`shared/events`, `messaging.reminders` (`register_reminder_rule`, `digest_sections`, `is_quiet_time`),
`messaging.handlers`, `shared/api_auth`, `shared/clock`. Web reads (no writes) M3's
`GET /api/trips/{trip_id}/documents` and M5's `GET /api/trips/{trip_id}/ski/conditions`.

**Must not touch**: `documents`, `logistics`, `budget` (M3, parallel — no FK, no import), `ski` (M5),
`proposals`, `linkpreview`, `trips`, `crews`, `identity`, `messaging`, `config/*` (except appends),
existing `src/ui/**`, `features/{documents,ski,proposals,trips}`, `AGENTS.md`, `odd/**`.

## Models

`id` UUID pk, `created_at`, `updated_at` on every model.

### `itinerary.ItineraryDay`

| Field | Type | Null | Default | Notes |
|---|---|---|---|---|
| `trip` | FK `trips.Trip` CASCADE | no | — | `related_name="itinerary_days"` |
| `date` | Date | no | — | |
| `title` | CharField(120) | no | `""` | e.g. "Día de traslado" |
| `notes` | TextField(2000) | no | `""` | |

Unique `(trip, date)`. Rows are created lazily (when a day gets a title/notes or an entry); the API also
returns **virtual days** for every date in `trip.start_on..end_on` without a row.

### `itinerary.ItineraryEntry`

| Field | Type | Null | Default | Choices / notes |
|---|---|---|---|---|
| `trip` | FK `trips.Trip` CASCADE | no | — | |
| `day` | FK `ItineraryDay` SET_NULL | yes | null | **null = unscheduled tray** |
| `starts_at` | DateTime (aware, stored UTC) | yes | null | composed from day + local time in trip tz |
| `ends_at` | DateTime | yes | null | `>= starts_at` |
| `kind` | CharField(12) | no | `activity` | `activity \| transport \| lodging \| meal \| meeting \| ski \| other` |
| `title` | CharField(200) | no | — | |
| `location_label` | CharField(200) | no | `""` | |
| `lat`, `lng` | Decimal(9,6) | yes | null | |
| `is_meeting_point` | Bool | no | False | |
| `proposal` | FK `proposals.Proposal` SET_NULL | yes | null | |
| `source` | CharField(10) | no | `manual` | `manual \| proposal` |
| `position` | PositiveInt | no | 0 | order within the day (or tray) |
| `notes` | TextField(1000) | no | `""` | |
| `created_by` | FK `AUTH_USER_MODEL` SET_NULL | yes | null | |

Constraints: unique `(proposal)` where `proposal IS NOT NULL` (`one_entry_per_proposal`); check
`ends_at >= starts_at`. Indexes `(trip, day, position)`, `(trip, starts_at)`.

### `itinerary.Note`

| Field | Type | Null | Default | Notes |
|---|---|---|---|---|
| `trip` | FK `trips.Trip` CASCADE | no | — | |
| `author` | FK `AUTH_USER_MODEL` PROTECT | no | — | |
| `body` | TextField | no | — | 1–1000 chars |
| `pinned` | Bool | no | False | max 5 pinned per trip (409 beyond) |

Index `(trip, pinned, created_at)`.

### Computed (not tables)
- **Today** snapshot (`itinerary/domain/today.py`, pure).
- **Out of range** entries: scheduled on a day outside the current trip dates (after M2 changes dates) —
  listed separately, never deleted.

### Domain rules

#### Ordering (pure `order_entries(entries)`)
Within a day: `(starts_at is None, starts_at, position, created_at)` — timed entries by time, untimed after
them by `position`. Tray: `(position, created_at)`. `move(entry, "up"|"down")` swaps `position` with the
neighbour **in the same ordering class** (two timed entries with the same time, or two untimed ones);
moving a timed entry past a different time is rejected (`409 cannot_reorder_timed`) — change its time
instead. Positions are renumbered `0..n` on every write of that day.

#### Proposal subscriber (`itinerary.on_proposal_status_changed`, registered in `ItineraryConfig.ready()`)
| `to_status` | Effect (idempotent, keyed by `proposal`) |
|---|---|
| `chosen` / `booked` | `get_or_create` entry with `source=proposal`, `title`, `kind` from category (`lodging→lodging`, `transport→transport`, `food→meal`, `activity→activity`, `gear→other`, `destination→activity`, `other→other`), `location_label/lat/lng` from the preview; `day` = the `ItineraryDay` of `proposal.starts_on` if inside the trip dates, else **tray** |
| `proposed`, `discussing`, `discarded` | delete the entry only if `source=proposal` **and** still in the tray; a scheduled entry stays (the plan was made) |

#### Today selector (`today.py::build_today(trip, entries, days, notes, now_utc) -> TodaySnapshot`)
- `local_now = now_utc.astimezone(ZoneInfo(trip.timezone))`, `local_date = local_now.date()`.
- `mode`: `undated` (no trip dates) · `before` (`local_date < start_on`; `countdown_days = (start_on − local_date).days`)
  · `during` · `after` (`local_date > end_on`).
- `day` = the day for `local_date` (virtual if no row); `entries` ordered; `now_entry` = timed entry with
  `starts_at <= now < ends_at` (or `starts_at <= now` and no `ends_at`, within 2 h); `next_entry` = first
  timed entry with `starts_at > now`.
- `next_meeting_point` = first `is_meeting_point` entry with `starts_at >= now` today or on a later day;
  else the latest meeting point of today; else null.
- In `before` mode `day` is the first trip day (preview); in `after` mode entries are empty.
- Midnight handling uses the trip timezone, never the server's; CL observes DST, AR does not.

## API

`django_auth`, snake_case, `{code,message}`; `member_of_trip` on everything. Router `itinerary/api.py`,
tag `itinerary`.

### Schemas
```
EntryOut     {id, trip_id, day_date: date|null, starts_at: datetime|null, ends_at: datetime|null,
              start_time: "HH:MM"|null, end_time: "HH:MM"|null, kind, title, location_label,
              lat: float|null, lng: float|null, is_meeting_point, proposal_id: uuid|null, source,
              position, notes}
DayOut       {date, title, notes, is_virtual: bool, entries: [EntryOut]}
ItineraryOut {timezone, start_on, end_on, days: [DayOut], tray: [EntryOut], out_of_range: [EntryOut]}
NoteOut      {id, author: PersonRefOut, body, pinned, created_at, can_delete: bool}
TodayOut     {mode: "undated"|"before"|"during"|"after", local_date, local_time: "HH:MM", timezone,
              countdown_days: int|null, day: DayOut|null, now_entry: EntryOut|null, next_entry: EntryOut|null,
              next_meeting_point: EntryOut|null, pinned_notes: [NoteOut], recent_notes: [NoteOut] (≤5),
              generated_at}
```
`start_time/end_time` are local trip times. Writes accept **`day_date` + `start_time`/`end_time`** (local),
and the server composes aware datetimes in the trip timezone; clients never send UTC instants.

### Endpoints

| Method + path | Request | Success | Errors |
|---|---|---|---|
| `GET /api/trips/{trip_id}/itinerary` | — | `200 ItineraryOut` | `404` |
| `PUT /api/trips/{trip_id}/itinerary/days/{date}` | `{title?, notes?}` | `200 DayOut` (creates the row) | `400 day_out_of_range` (outside trip dates or trip undated); `404` |
| `POST /api/trips/{trip_id}/itinerary/entries` | `{title, kind?, day_date?: date\|null, start_time?, end_time?, location_label?, lat?, lng?, is_meeting_point?, notes?}` | `201 EntryOut` (appended at the end of its day/tray) | `400 invalid_request` / `day_out_of_range` / `invalid_times` (end before start, time without day); `404` |
| `PATCH /api/itinerary_entries/{entry_id}` | any POST field; `day_date: null` moves it to the tray (clears times) | `200 EntryOut` | `400` as above; `404` |
| `POST /api/itinerary_entries/{entry_id}/move` | `{direction: "up"\|"down"}` | `200 DayOut` (or the tray as `DayOut` with `date=null`) | `409 cannot_reorder_timed` / `at_edge`; `404` |
| `DELETE /api/itinerary_entries/{entry_id}` | — | `204` | `404` |
| `GET /api/trips/{trip_id}/notes` | query `pinned?` | `200 [NoteOut]` pinned first, then newest, max 50 | `404` |
| `POST /api/trips/{trip_id}/notes` | `{body, pinned?: bool}` | `201 NoteOut` | `400`; `409 too_many_pinned`; `404` |
| `PATCH /api/notes/{note_id}` | `{body?, pinned?}` | `200 NoteOut` | `409 too_many_pinned`; `404` |
| `DELETE /api/notes/{note_id}` | — | `204` (author, or anyone when the author is no longer an active member) | `403 forbidden`; `404` |
| `GET /api/trips/{trip_id}/today` | header `If-None-Match?` | `200 TodayOut` with `ETag: W/"<16 hex of sha256(canonical JSON without generated_at)>"`, `Cache-Control: private, no-cache`; `304` (empty body, same `ETag`) when it matches | `404` |

The ETag hashes the canonical JSON of the response **without** `generated_at`. `local_time` is truncated
to the minute, so with unchanged data the ETag changes at most once per minute and most 20 s polls get a
`304`. The overview card reads `GET …/today` (no extra endpoint).

## Bot

### `/viaje hoy`
`mode=during`: `HOY_HEADER` + one line per entry (`{time} {title}{ @ location}`, meeting points with 📍),
pinned notes, link to Today. `before`: `HOY_BEFORE` ("Faltan {n} días…") + first-day preview.
`after`/`undated`: short line + link. Help `HELP_HOY = "/viaje hoy — el plan de hoy"`.

### Reminder rule `itinerary.morning_digest`
For trips with `mode=during` today (and the day before start: "mañana arrancamos"): one draft per trip per
local day at or after **09:00** local (the core skips earlier ticks via quiet hours, so the rule simply
yields every tick and the dedupe key keeps it single), `dedupe_key = "itinerary:digest:<trip_id>:<local_date>"`,
`timezone = trip.timezone`, `url_path = …/today`, `title = DIGEST_TITLE`. Body = today's plan (as `/viaje hoy`)
+ the blocks returned by `messaging.reminders.digest_sections(trip_id, local_date)` (M5 registers the snow
line there) + the next meeting point. No mentions.

### Copy (`api/itinerary/copy/es_ar.py`, suggested)
`HOY_HEADER = "☀️ Hoy {weekday} {day} en {trip}:"`, `ENTRY_LINE = "{time} {title}{location}"`,
`MEETING_POINT_LINE = "📍 Punto de encuentro: {title} a las {time}{location}"`, `NO_PLAN = "Hoy no hay
nada armado. Sumalo en {url}"`, `HOY_BEFORE = "Faltan {days} días para {trip} ✈️"`, `HOY_AFTER = "{trip}
ya terminó. ¡Qué viajecito!"`, `HOY_UNDATED = "{trip} todavía no tiene fechas."`, `DIGEST_TITLE =
"El plan de hoy"`, `DIGEST_TOMORROW = "Mañana arrancamos {trip} 🎒"`, `PINNED_HEADER = "📌 Para tener en
cuenta:"`, `LINK_LINE = "👉 {url}"`.

## Web

### Routes (`requireMe()` first)
- `…/[tripId]/itinerary/page.tsx` → `<ItineraryPlanner tripId />`.
- `…/[tripId]/today/page.tsx` → `<TodayView tripId crewId />`. This route must render well offline
  from the M6 service-worker cache: no server-only data beyond `requireMe` and the trip layout; Today data
  is fetched client-side through `useToday`.

### Containers
- itinerary: `ItineraryPlanner` (days list + tray + out-of-range), `EntryForm` (sheet: day select, local
  times, kind, meeting point, location), `DayHeaderEditor`, `ItineraryOverviewCard` (`module: "itinerary"`,
  `order: 50`: "{n} cosas en la bandeja").
- today: `TodayView` (mode switch), `TodayTimeline`, `NextMeetingPoint`, `DocumentShortcuts` (reads M3
  `GET /api/trips/{trip_id}/documents`, shows `ticket | reservation | insurance` first, each a same-origin
  link to its `download_path`; hidden when `"documents"` not in `trip.modules`), `SnowStrip` (reads M5
  `GET /api/trips/{trip_id}/ski/conditions`; rendered only when `"ski"` in `trip.modules`), `QuickNotes`
  (add note in one tap, pin/unpin), `TodayOverviewCard` (`module: "today"`, `order: 5`: countdown or the
  next item).

### Presentational
`DayColumn`, `EntryRow` (time, kind icon + text, meeting-point badge, up/down buttons with
`aria-label="Subir {title}"`), `TrayList`, `TimelineItem` (now/next highlight with text "Ahora" /
"Después"), `MeetingPointCard` (map link `https://www.openstreetmap.org/?mlat=…&mlon=…` when lat/lng),
`CountdownBadge`, `NoteItem`, `NoteComposer`. Drag & drop is optional; up/down is required.

### Hooks + query keys
| Hook | Key | Interval |
|---|---|---|
| `useItinerary(tripId)` | `["itinerary", tripId]` | 60 s |
| `useToday(tripId)` | `["today", tripId]` | **20 s**; the fetcher sends `If-None-Match` with the last ETag and keeps cached data on `304` |
| `useNotes(tripId)` | `["itinerary", tripId, "notes"]` | 20 s while on Today, 60 s elsewhere |
| `useTripDocuments(tripId)` (read-only, local to `features/today/api`) | `["documents", tripId, "list", "all"]` (same key as M3 so caches are shared) | 60 s |
| `useSkiConditions(tripId)` (read-only, local) | `["ski", tripId, "conditions"]` (same key as M5) | 5 min |
| mutations | `useCreateEntry`, `useUpdateEntry`, `useMoveEntry` (optimistic), `useDeleteEntry`, `useSaveDay`, `useAddNote`, `useUpdateNote`, `useDeleteNote`; all invalidate `["itinerary", tripId]` and `["today", tripId]` | — |

Until M3/M5 types are in `schema.d.ts` on `main`, `features/today/api/external.ts` declares local types
copied from `m3-logistics.md` (`DocumentOut`) and `m5-ski.md` (`SkiConditionsOut`); the orchestrator
replaces them with generated types at integration.

### Forms / validation
Entry: title 1–200; time requires a day; end ≥ start; lat/lng ranges. Note: 1–1000 chars.

### i18n (`itinerary.*`, `today.*`)
itinerary: `title` "Itinerario", `tray.title` "Sin día", `tray.help` "Lo que eligieron y todavía no tiene
día", `outOfRange.title` "Fuera de las fechas", `day.untitled` "Día {n}", `entry.add` "Agregar",
`entry.kind.<kind>` ("Actividad", "Traslado", "Alojamiento", "Comida", "Encuentro", "Ski", "Otro"),
`entry.meetingPoint` "Punto de encuentro", `entry.moveUp` "Subir {title}", `entry.moveDown` "Bajar {title}",
`entry.time` "Hora", `entry.location` "Dónde", `empty` "Armá el día a día o elegí propuestas para llenar
la bandeja", `errors.day_out_of_range` "Ese día está fuera del viaje", `errors.invalid_times` "Revisá los
horarios", `errors.cannot_reorder_timed` "Para moverlo, cambiale la hora".
today: `title` "Hoy", `now` "Ahora", `next` "Después", `meetingPoint` "Punto de encuentro",
`countdown` "Faltan {days} días", `countdownOne` "¡Mañana arrancamos!", `after` "El viaje terminó",
`undated` "Todavía no hay fechas", `documents.title` "Documentos a mano", `snow.title` "Nieve",
`snow.stale` "Dato de hace {hours} h", `notes.title` "Notas", `notes.placeholder` "Anotá algo rápido…",
`notes.pin` "Fijar", `notes.unpin` "Desfijar", `offline` "Sin conexión: mostrando lo último que bajamos",
`empty` "Hoy no hay nada armado".

### Accessibility / UX
Today is phone-first: big type for the next item, meeting point card at the top, single column, no
horizontal scroll; the timeline uses an ordered list; "now" conveyed by text; offline banner announced
politely; up/down buttons ≥ 44 px.

## Tests

### api
- `itinerary/tests/test_today_selector.py` (pure, first) — **across midnight in trip tz**: 23:59 and
  00:01 local for AR (`America/Argentina/Buenos_Aires`, UTC−3, no DST) and CL (`America/Santiago`, both
  DST and standard offsets, incl. the DST switch day); modes before/during/after/undated; countdown;
  now/next entry; next meeting point rules.
- `itinerary/tests/test_entry_ordering.py` — **entry ordering**: timed vs untimed, ties, move up/down,
  reject reordering across times, renumbering.
- `itinerary/tests/test_chosen_to_tray.py` — **chosen → tray** via `events.publish` with a seeded M1
  proposal: dated proposal lands on its day, undated in the tray, replay idempotent, back to discussing
  removes tray entry but keeps a scheduled one.
- `itinerary/tests/test_hoy_command.py` — **`/viaje hoy` formatting** in each mode (snapshot, voseo).
- `itinerary/tests/test_morning_digest_rule.py` — one draft per trip per local day, digest sections
  appended in order (fake section registered in an isolated registry), tomorrow variant, dedupe key.
- `itinerary/tests/test_today_etag.py` — same data → same ETag and `304`; a new note changes it;
  `generated_at` excluded.
- `itinerary/tests/test_itinerary_api.py` — authz (404/401/403), local time composition in trip tz,
  `day_out_of_range`, out-of-range listing after trip dates change, pinned cap.

### web
- `features/today/containers/TodayView.test.tsx` — each mode, next meeting point card, documents
  shortcuts hidden without the module, snow strip only for ski trips (MSW using M3/M5 handlers or local ones).
- `features/today/hooks/useToday.test.ts` — sends `If-None-Match`, keeps data on 304, 20 s interval.
- `features/itinerary/containers/ItineraryPlanner.test.tsx` — tray, move up/down optimistic, entry form
  validation.
- MSW handlers `features/{itinerary,today}/test/handlers.ts`.
- e2e `web/e2e/today.spec.ts` — seed a trip whose dates include "today", add an entry with a meeting point,
  open Today, see it; (M6 extends this spec with an offline assertion — coordinate via the orchestrator).

## Security / robustness

- Every write authorizes against the entry's/note's trip; ids from another trip → 404.
- ETag computed server-side from canonical JSON; no user input in headers.
- Subscriber is idempotent and never fails the M1 transition for data reasons (missing preview fields are
  fine); it raises only on genuine errors (by design of R-1).
- Today endpoint is cheap (one trip, ≤ ~100 entries): no caching layer needed; polling 20 s × ≤ 10 people.
- Document shortcuts inherit M3's `owner_only` filtering because they use M3's list endpoint.

## Open questions / assumptions

- **[default]** Up/down ordering only; drag & drop is a stretch.
- **[default]** Proposal → entry kind mapping as in the table; editing the proposal later does not update
  the entry (it is a copy).
- **[default]** Entries are never deleted when trip dates change; they show as "Fuera de las fechas".
- **[default]** Morning digest also on the day before the trip starts.
- Stretch (plan): PDFs forwarded in the group saved to the vault — needs M3 + Gowa media whitelist; not in
  M4 scope.
