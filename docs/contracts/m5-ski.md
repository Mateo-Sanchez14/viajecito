# M5 — Ski module (trip-type plugin `ski`)

Wave **A**. Branch `feat/m5-ski`. Depends on core (plugin registry) + R-2 (tick job, digest section),
R-3 (subcommand), R-5 (cards, `trips.modules.ski` / `trips.types.ski` labels).

## Scope & demo

Registers the trip type `ski` (generic modules + `"ski"`). Seeds Chilean and Argentine resorts with
coordinates and elevations; a trip picks its resorts. Snow conditions come from a `SnowReportProvider`
port with an Open-Meteo adapter (hourly `snowfall`, `snow_depth`, daily `snowfall_sum`, `elevation=`; no API
key) refreshed every 3 h by a tick job for resorts on active trips, with backoff on failure; reports keep
history and render as stale after 12 h. Members can post a manual report with `/viaje nieve`. Each person
keeps a ski profile (discipline, level, sizes — sensitive); the trip tracks lift passes and a gear plan
(own / rent / borrow). **Demo: the ski page shows conditions and who still needs a pass or rental; Today
(M4, later) shows conditions.**

## Ownership

**Owns**
- api app `api/ski/` (models, migrations, domain, use_cases, ports, adapters incl.
  `adapters/open_meteo.py`, api, schemas, copy, bot, tests, fixtures, management).
- plugin registration in `SkiConfig.ready()`:
  `trips.plugins.register(TripTypePlugin(key="ski", label_key="trips.types.ski", modules=GENERIC.modules + ("ski",), packing_templates=("ski", "border"), reminder_rules=("ski.snow_refresh",)))`
  where `GENERIC = trips.plugins.get("generic")` (import from `trips` is allowed; `trips` never imports `ski`).
- bot: `ski/bot/subcommands.py` → `register_subcommand("nieve", …)`; tick job `ski.snow_refresh`; digest
  section `ski.snow` (`register_digest_section("ski.snow", …, order=20)`), consumed by M4's morning digest.
- copy `api/ski/copy/es_ar.py`.
- seed: `api/ski/fixtures/resorts.json` + management command `ski/management/commands/seed_resorts.py`
  (idempotent upsert by `slug`; also run from a data migration `0002_seed_resorts` that calls the same
  loader).
- web: `web/src/features/ski/**`; route `…/[tripId]/ski/page.tsx` (+ `loading.tsx`); profile route
  `web/src/app/(app)/me/ski/page.tsx`; `web/messages/es-AR/ski.json`.
- tests: `api/ski/tests/**` (incl. `fixtures/open_meteo/*.json`), `web/src/features/ski/test/handlers.ts`.
- One-line appends: `config/settings/apps.py`, `pyproject.toml` root_packages, `web/messages/es-AR/index.ts`,
  `web/src/features/trips/cards/index.ts`.

**Reads**: `trips` (plugins, trip lookup, participants), `crews`, `shared/api_auth`, `messaging.reminders`,
`messaging.handlers`, `shared/clock`.

**Must not touch**: `trips` (no edits to `plugins.py` or the generic plugin; labels `trips.modules.ski`
and `trips.types.ski` are core i18n — request R-5), `logistics` (M3 owns packing template **content**
incl. `ski` and `border`; M5 only lists the keys), `itinerary` (M4), `proposals`, `documents`, `crews`,
`identity`, `messaging`, `config/*` except appends, existing `src/ui/**`, other features, `AGENTS.md`,
`odd/**`.

## Models

`id` UUID pk, `created_at`, `updated_at` on every model.

### `ski.Resort`

| Field | Type | Null | Default | Notes |
|---|---|---|---|---|
| `slug` | SlugField(64) | no | — | **unique**, e.g. `cerro-catedral` |
| `name` | CharField(120) | no | — | proper noun (not copy) |
| `country` | CharField(2) | no | — | `AR \| CL` |
| `region` | CharField(80) | no | `""` | e.g. "Río Negro" |
| `lat`, `lng` | Decimal(9,6) | no | — | |
| `base_elev_m`, `summit_elev_m` | PositiveSmallInt | no | — | `summit > base` |
| `timezone` | CharField(64) | no | — | `America/Argentina/…` or `America/Santiago` |
| `provider` | CharField(16) | no | `open_meteo` | `open_meteo \| manual` |
| `provider_ref` | CharField(120) | no | `""` | reserved for scraping providers |
| `website_url` | URLField | no | `""` | |
| `active` | Bool | no | True | |

Index `(country, active)`.

### `ski.TripResort`

| Field | Type | Null | Notes |
|---|---|---|---|
| `trip` | FK `trips.Trip` CASCADE | no | |
| `resort` | FK Resort PROTECT | no | |
| `nights` | PositiveSmallInt | yes | |
| `position` | PositiveSmallInt | no | default 0 |

Unique `(trip, resort)`.

### `ski.SnowReport` (history; never updated in place)

| Field | Type | Null | Notes |
|---|---|---|---|
| `resort` | FK Resort CASCADE | no | |
| `source` | CharField(16) | no | `open_meteo \| manual` |
| `observed_at` | DateTime | no | provider "current hour" or the manual report time |
| `fetched_at` | DateTime | no | when we stored it |
| `elevation_m` | PositiveSmallInt | yes | elevation used for the forecast |
| `base_cm` | PositiveSmallInt | yes | `snow_depth` (m → cm) or manual |
| `new_24h_cm` | Decimal(5,1) | yes | Σ hourly `snowfall` over the last 24 h |
| `forecast_72h_cm` | Decimal(5,1) | yes | Σ daily `snowfall_sum` for the next 3 days |
| `temp_c` | Decimal(4,1) | yes | `temperature_2m` at `observed_at` |
| `lifts_open`, `lifts_total`, `runs_open`, `runs_total` | PositiveSmallInt | yes | manual only (no free source) |
| `status_text` | CharField(280) | no | `""`; manual free text |
| `reporter` | FK `AUTH_USER_MODEL` SET_NULL | yes | manual reports |
| `raw` | JSON | no | `{}`; trimmed provider response (≤ 32 KB) |

Index `(resort, -observed_at)`. Retention: keep 30 days of `open_meteo` rows per resort (pruned by the tick
job); manual reports kept forever.

### `ski.SnowFetchState` (one per resort; refresh bookkeeping)

| Field | Type | Null | Notes |
|---|---|---|---|
| `resort` | OneToOne Resort CASCADE | no | |
| `last_attempt_at` | DateTime | yes | |
| `last_success_at` | DateTime | yes | |
| `consecutive_failures` | PositiveSmallInt | no | default 0 |
| `next_attempt_at` | DateTime | yes | |
| `last_error` | CharField(200) | no | reason code |

### `ski.SkiProfile` (per person, global across trips — **sensitive**)

| Field | Type | Null | Default | Choices / notes |
|---|---|---|---|---|
| `person` | OneToOne `AUTH_USER_MODEL` CASCADE | no | — | |
| `discipline` | CharField(12) | no | `ski` | `ski \| snowboard \| both` |
| `level` | CharField(12) | no | `beginner` | `first_time \| beginner \| intermediate \| advanced \| expert` |
| `owns_gear` | Bool | no | False | owns a full set |
| `boot_size_eu` | Decimal(3,1) | yes | null | 30.0–50.0 |
| `height_cm` | PositiveSmallInt | yes | null | 100–230 |
| `weight_kg` | PositiveSmallInt | yes | null | 25–200 |
| `share_sizes_with_trip` | Bool | no | False | consent to show sizes in a trip's rental roll-up |

### `ski.LiftPass`

| Field | Type | Null | Default | Choices / notes |
|---|---|---|---|---|
| `trip` | FK `trips.Trip` CASCADE | no | — | |
| `person` | FK `AUTH_USER_MODEL` CASCADE | no | — | |
| `resort` | FK Resort SET_NULL | yes | null | null = "any / not decided" |
| `product` | CharField(120) | no | `""` | e.g. "Pase 5 días" |
| `days` | PositiveSmallInt | yes | null | |
| `status` | CharField(12) | no | `needed` | `needed \| bought \| season_pass \| not_needed` |
| `price` | Decimal(12,2) | yes | null | |
| `currency` | CharField(3) | no | trip currency | |

Unique `(trip, person, resort)` (nulls: one row with `resort IS NULL` per person — conditional unique).
`document` FK (plan) **deferred** (Documents are M3, Wave B).

### `ski.GearPlan`

| Field | Type | Null | Default | Choices / notes |
|---|---|---|---|---|
| `trip` | FK `trips.Trip` CASCADE | no | — | |
| `person` | FK `AUTH_USER_MODEL` CASCADE | no | — | |
| `item` | CharField(12) | no | — | `skis \| board \| boots \| poles \| helmet \| goggles \| jacket \| pants \| other` |
| `mode` | CharField(8) | no | `own` | `own \| rent \| borrow` |
| `price` | Decimal(12,2) | yes | null | |
| `currency` | CharField(3) | no | trip currency | |
| `note` | CharField(200) | no | `""` | e.g. rental shop name or URL |

Unique `(trip, person, item)`. `rental_proposal` FK (plan) **deferred** (Proposal is M1, Wave A peer).

### Computed (not tables)
- **Conditions**: latest report per trip resort + `stale = now − observed_at > 12 h` + `age_hours`.
- **Pass summary** ("quién no tiene pase"): participants `rsvp in|maybe` × trip resorts → missing (no row,
  or `needed`).
- **Rental roll-up**: count of `rent` per item; sizes (boot EU, height, weight) only for people with
  `share_sizes_with_trip = true` (others counted as "talle sin compartir").
- **Level grouping**: participants grouped by `(discipline, level)` for "who rides with whom".

### Snow provider

Port `SnowReportProvider.fetch(resort: ResortRef, now: datetime) -> SnowReading` (raises
`ProviderError(reason)`). Adapter `OpenMeteoProvider` (`httpx.Client`, no key):

```
GET https://api.open-meteo.com/v1/forecast
  ?latitude=<lat>&longitude=<lng>&elevation=<mid elevation m>
  &hourly=snowfall,snow_depth,temperature_2m
  &daily=snowfall_sum
  &past_days=1&forecast_days=3
  &timezone=<resort.timezone>
```
- Mid elevation = `round((base + summit) / 2)`. Units: `snowfall` cm/h, `snow_depth` **metres** (convert
  to cm), `snowfall_sum` cm, `temperature_2m` °C — the writer confirms units and parameter names with
  Context7/Open-Meteo docs before coding the parser and records the check in the feature document.
- `observed_at` = the last hourly timestamp ≤ `now`; `new_24h_cm` = Σ the 24 hourly `snowfall` values
  ending at `observed_at`; `forecast_72h_cm` = Σ `snowfall_sum` of the 3 days after today.
- Timeouts: 5 s connect / 10 s total; no in-request retries; response > 512 KB rejected; non-200 or
  malformed JSON → `ProviderError("http_<status>" | "malformed")`.
- Never called from a request path; only from the tick job (and the dev `manage.py` diagnostics below).

#### Tick job `ski.snow_refresh`
- Eligible resorts: linked by `TripResort` to trips with status `planning | booked | ongoing` and
  (`end_on` is null or `end_on >= today − 1`).
- Due when `next_attempt_at` is null or ≤ now, and the last success is ≥ 3 h old.
- On success: insert `SnowReport`, `consecutive_failures = 0`, `next_attempt_at = now + 3 h`.
- On failure: `consecutive_failures += 1`, `next_attempt_at = now + min(15 min × 2^(failures−1), 6 h)`,
  store `last_error`; never raises out of the job.
- At most **4 resorts per tick**, sequential, stopping when the tick deadline is near; returns
  `{"snow_fetched": n, "snow_failed": m}`. Also prunes old provider rows once a day.

#### Digest section `ski.snow`
`fn(trip_id, local_date) -> str | None`: one line per trip resort from the latest report
(`SNOW_LINE`), with the stale suffix; `None` for non-ski trips or no reports.

### Seed resorts (`api/ski/fixtures/resorts.json`)

**Values below are approximate starting points; the writer verifies each coordinate, elevation and
timezone against the resort's official site or OpenStreetMap before committing, and records the sources
in the feature document.** Tests never depend on these numbers (they use their own fixtures).

| slug | name | country | lat | lng | base m | summit m | timezone |
|---|---|---|---|---|---|---|---|
| `cerro-catedral` | Cerro Catedral | AR | −41.17 | −71.44 | 1030 | 2100 | America/Argentina/Salta* |
| `chapelco` | Chapelco | AR | −40.16 | −71.21 | 1250 | 1980 | America/Argentina/Salta* |
| `cerro-bayo` | Cerro Bayo | AR | −40.75 | −71.60 | 1050 | 1780 | America/Argentina/Salta* |
| `la-hoya` | La Hoya | AR | −42.83 | −71.25 | 1350 | 2050 | America/Argentina/Catamarca* |
| `caviahue` | Caviahue | AR | −37.88 | −71.05 | 1650 | 2050 | America/Argentina/Salta* |
| `las-lenas` | Las Leñas | AR | −35.15 | −70.08 | 2240 | 3430 | America/Argentina/Mendoza |
| `cerro-castor` | Cerro Castor | AR | −54.72 | −68.00 | 195 | 1060 | America/Argentina/Ushuaia |
| `valle-nevado` | Valle Nevado | CL | −33.36 | −70.25 | 2860 | 3670 | America/Santiago |
| `la-parva` | La Parva | CL | −33.33 | −70.29 | 2660 | 3630 | America/Santiago |
| `el-colorado` | El Colorado | CL | −33.35 | −70.29 | 2430 | 3330 | America/Santiago |
| `portillo` | Portillo | CL | −32.84 | −70.13 | 2580 | 3310 | America/Santiago |
| `nevados-de-chillan` | Nevados de Chillán | CL | −36.90 | −71.40 | 1530 | 2400 | America/Santiago |
| `corralco` | Corralco | CL | −38.37 | −71.57 | 1450 | 2400 | America/Santiago |

\* All Argentine zones are UTC−3 without DST; the writer picks the canonical IANA zone for each province
(Río Negro and Neuquén use `America/Argentina/Salta` in tzdata; Chubut uses `America/Argentina/Catamarca`)
— verify against tzdata.

## API

`django_auth`, snake_case, `{code,message}`. Trip routes use `member_of_trip` and return
`404 {"code":"module_not_enabled"}` when `"ski"` is not in the trip's plugin modules. Router `ski/api.py`,
tag `ski`.

### Schemas
```
ResortOut          {id, slug, name, country, region, lat, lng, base_elev_m, summit_elev_m, website_url}
SnowReportOut      {id, source, observed_at, fetched_at, base_cm, new_24h_cm: float|null, forecast_72h_cm: float|null,
                    temp_c: float|null, lifts_open, lifts_total, runs_open, runs_total, status_text,
                    reporter: PersonRefOut|null, stale: bool, age_hours: int}
TripResortOut      {resort: ResortOut, nights, position, latest_report: SnowReportOut|null}
SkiConditionsOut   {resorts: [{resort_id, name, latest_report: SnowReportOut|null}]}   # consumed by M4 Today
PassRowOut         {person: PersonRefOut, resort_id: uuid|null, product, days, status, price: str|null, currency}
PassSummaryOut     {rows: [PassRowOut], missing: [{person: PersonRefOut, resort_id: uuid|null}]}
GearRowOut         {person: PersonRefOut, item, mode, price: str|null, currency, note}
GearRollupOut      {rows: [GearRowOut], rent_counts: {<item>: int},
                    sizes: [{person: PersonRefOut, boot_size_eu, height_cm, weight_kg}], sizes_hidden: int}
LevelGroupOut      {discipline, level, people: [PersonRefOut]}
SkiOverviewOut     {resorts: [TripResortOut], passes: PassSummaryOut, gear: GearRollupOut, levels: [LevelGroupOut]}
SkiProfileOut/In   {discipline, level, owns_gear, boot_size_eu, height_cm, weight_kg, share_sizes_with_trip}
```

### Endpoints

| Method + path | Request | Success | Errors |
|---|---|---|---|
| `GET /api/ski/resorts` | query `country?` | `200 [ResortOut]` (any authenticated person) | `401` |
| `GET /api/trips/{trip_id}/ski` | — | `200 SkiOverviewOut` | `404 not_found` / `module_not_enabled` |
| `GET /api/trips/{trip_id}/ski/conditions` | — | `200 SkiConditionsOut` (cheap; for Today) | `404` |
| `POST /api/trips/{trip_id}/ski/resorts` | `{resort_id, nights?}` | `201 TripResortOut` | `409 resort_already_added`; `400 invalid_request`; `404` |
| `PATCH /api/trips/{trip_id}/ski/resorts/{resort_id}` | `{nights?, position?}` | `200 TripResortOut` | `404` |
| `DELETE /api/trips/{trip_id}/ski/resorts/{resort_id}` | — | `204` (reports are kept) | `404` |
| `GET /api/trips/{trip_id}/ski/resorts/{resort_id}/reports` | — | `200 [SnowReportOut]` newest first, last 10 | `404` |
| `POST /api/trips/{trip_id}/ski/resorts/{resort_id}/reports` | `{base_cm?, new_24h_cm?, temp_c?, lifts_open?, lifts_total?, runs_open?, runs_total?, status_text?}` (≥ 1 field) | `201 SnowReportOut` (`source=manual`, `observed_at=now`) | `400 invalid_request`; `429 rate_limited` (> 6 manual per resort per hour); `404` |
| `PUT /api/trips/{trip_id}/ski/passes/me` | `{resort_id?: uuid\|null, product?, days?, status, price?, currency?}` | `200 PassRowOut` (upsert on `(trip, me, resort)`) | `400`; `404` |
| `DELETE /api/trips/{trip_id}/ski/passes/me` | query `resort_id?` | `204` | `404` |
| `PUT /api/trips/{trip_id}/ski/gear/me` | `{items: [{item, mode, price?, currency?, note?}]}` (replaces my rows) | `200 [GearRowOut]` | `400`; `404` |
| `GET /api/me/ski_profile` | — | `200 SkiProfileOut` (defaults when none) | `401` |
| `PUT /api/me/ski_profile` | `SkiProfileIn` | `200 SkiProfileOut` | `400 invalid_request`; `401` |

Profile data of others is never returned by any endpoint except the consented sizes in `GearRollupOut`
and `(discipline, level)` in `levels`.

## Bot

### `/viaje nieve`
- No args: for each resort of the default trip (ski type only), `SNOW_LINE`; stale → `SNOW_STALE`
  suffix; none → `NO_RESORTS` / `NO_REPORT`; non-ski trip → `NOT_SKI_TRIP`.
- Manual report: `/viaje nieve <resort> <base_cm> [nuevos_cm]` — `<resort>` matched folded against the
  trip resorts' slug/name prefix (`catedral`, `valle`); creates a manual `SnowReport`; reply
  `MANUAL_SAVED`; ambiguous/unknown resort → `RESORT_UNKNOWN` listing the trip resorts; bad numbers →
  `NIEVE_USAGE`.
- Help `HELP_NIEVE = "/viaje nieve — cómo está la nieve (o /viaje nieve catedral 120 15 para reportar)"`.

### Copy (`api/ski/copy/es_ar.py`, suggested)
`SNOW_HEADER = "❄️ Nieve:"`, `SNOW_LINE = "{resort}: {base} cm de base · {new} cm nuevos en 24 h · {temp} °C ({age})"`,
`SNOW_FORECAST = " · pronóstico {forecast} cm en 3 días"`, `SNOW_STALE = " ⚠️ dato viejo"`,
`AGE_HOURS = "hace {hours} h"`, `AGE_MINUTES = "recién"`, `NO_RESORTS = "Este viaje todavía no tiene
centros de ski. Sumalos en {url}"`, `NO_REPORT = "{resort}: sin datos todavía"`, `NOT_SKI_TRIP = "Este
viaje no es de ski 🏖️"`, `MANUAL_SAVED = "Gracias {name}, anoté {base} cm en {resort} 🙌"`,
`RESORT_UNKNOWN = "No encontré ese centro. Los del viaje: {resorts}"`, `NIEVE_USAGE = "Usalo así:
/viaje nieve catedral 120 15"`.

## Web

### Routes
- `…/[tripId]/ski/page.tsx` (`requireMe()` first) → `<SkiDashboard tripId />`.
- `src/app/(app)/me/ski/page.tsx` → `<SkiProfileForm />` (linked from the ski page: "Tu perfil de ski").

### Containers (`features/ski/containers/`)
`SkiDashboard` (resort picker + conditions + passes + gear + levels), `ResortPicker` (search the resort
list, add/remove), `ConditionsPanel`, `PassTracker` (my pass form + crew table with missing highlighted),
`GearPlanner` (my items × mode; crew rental roll-up), `SkiProfileForm`, `SkiOverviewCard`
(`module: "ski"`, `order: 15`: latest base/new snow of the first resort + "{n} sin pase").

### Presentational (`features/ski/components/`)
`SnowCard` (base, 24 h, forecast, temp, stale badge with text, source "Open-Meteo" or reporter name),
`ResortChip`, `PassStatusBadge`, `PassRow`, `GearModeSelect`, `RentalRollup`, `LevelGroups`,
`ManualReportForm` (sheet).

### Hooks + query keys
| Hook | Key | Interval |
|---|---|---|
| `useSkiOverview(tripId)` | `["ski", tripId]` | 60 s |
| `useSkiConditions(tripId)` | `["ski", tripId, "conditions"]` | 5 min (shared with M4 Today) |
| `useResorts(country?)` | `["ski", "resorts", country ?? "all"]` | none (staleTime 1 h) |
| `useSkiProfile()` | `["ski", "profile", "me"]` | none |
| mutations | `useAddTripResort`, `useRemoveTripResort`, `useManualReport`, `useSetMyPass` (optimistic), `useSetMyGear`, `useSaveSkiProfile`; invalidate `["ski", tripId]` | — |

### Forms / validation
Profile: ranges above, boot size step 0.5; the sizes block explains why ("para alquilar equipos") and the
consent toggle defaults off. Manual report: integers ≥ 0, base ≤ 1000, new ≤ 300, temp −40..30.

### i18n (`web/messages/es-AR/ski.json`, `ski.*`)
`title` "Ski", `resorts.title` "Centros", `resorts.add` "Sumar centro", `resorts.search` "Buscá un
centro", `conditions.base` "Base", `conditions.new24h` "Nuevos en 24 h", `conditions.forecast`
"Pronóstico 3 días", `conditions.temp` "Temperatura", `conditions.stale` "Dato de hace {hours} h",
`conditions.source.open_meteo` "Pronóstico Open-Meteo", `conditions.source.manual` "Reportó {name}",
`conditions.report` "Reportar nieve", `passes.title` "Pases", `passes.status.needed` "Falta comprar",
`passes.status.bought` "Comprado", `passes.status.season_pass` "Pase de temporada",
`passes.status.not_needed` "No esquía", `passes.missing` "{n} sin pase", `gear.title` "Equipo",
`gear.item.<item>` ("Esquíes", "Tabla", "Botas", "Bastones", "Casco", "Antiparras", "Campera",
"Pantalón", "Otro"), `gear.mode.own` "Propio", `gear.mode.rent` "Alquilo", `gear.mode.borrow` "Me
prestan", `gear.rollup` "A alquilar: {summary}", `gear.sizesHidden` "{n} no compartieron talles",
`levels.title` "Niveles", `profile.title` "Tu perfil de ski", `profile.discipline` "¿Ski o snow?",
`profile.level` "Nivel", `profile.level.<level>` ("Primera vez", "Principiante", "Intermedio",
"Avanzado", "Experto"), `profile.sizes` "Talles para alquilar", `profile.share` "Compartir mis talles con
el viaje", `profile.save` "Guardar", `empty.resorts` "Elegí a qué centro van", `notSki` "Este viaje no es
de ski", `errors.module_not_enabled` "Este viaje no es de ski", `errors.resort_already_added` "Ese
centro ya está en el viaje", `errors.rate_limited` "Esperá un rato antes de reportar de nuevo".

### Accessibility
Numbers with units in text ("45 cm"), stale state as text + icon, form fields labelled, selects native.

## Tests

### api
- `ski/tests/test_open_meteo_parsing.py` (first) — **provider parsing from fixtures**
  (`fixtures/open_meteo/catedral_snowy.json`, `valle_dry.json`, `malformed.json`): m → cm, 24 h sum,
  3-day forecast, observed hour selection, malformed → `ProviderError`.
- `ski/tests/test_open_meteo_adapter.py` — `respx`: exact query params (incl. `elevation`), timeouts,
  non-200, oversize response.
- `ski/tests/test_staleness.py` — **12 h staleness** boundary (11:59 vs 12:01), `age_hours`.
- `ski/tests/test_snow_refresh_job.py` — **refresh touches only active-trip resorts** (done/idea trips
  and past trips skipped); 3 h cadence; **backs off on failure** (15 min, 30 min, … cap 6 h) and resets on
  success; ≤ 4 per tick; deadline respected; never raises.
- `ski/tests/test_pass_summary.py` — **lift-pass summary ("quién no tiene pase")**: rsvp in/maybe only,
  per resort and resort-less rows, `season_pass`/`not_needed` not missing.
- `ski/tests/test_rental_rollup.py` — **rental size roll-up**: counts per item, sizes only with consent,
  `sizes_hidden` count.
- `ski/tests/test_level_grouping.py` — **level grouping** by discipline and level.
- `ski/tests/test_nieve_command.py` — **`/viaje nieve` reply** (snapshot), stale suffix, non-ski trip,
  manual report parsing (resort prefix, ambiguous, bad numbers).
- `ski/tests/test_plugin_registration.py` — `trips.plugins.get("ski").modules == generic + ("ski",)`,
  packing templates `("ski", "border")`.
- `ski/tests/test_ski_api.py` — authz (404 non-member, `module_not_enabled` on generic trips, 401, 403
  CSRF), profile privacy (no endpoint leaks another person's sizes without consent), manual report rate
  limit.
- `ski/tests/test_seed_resorts.py` — idempotent upsert, every row has a valid IANA timezone and
  `summit > base`.

### web
- `features/ski/components/SnowCard.test.tsx` — fresh vs stale, manual vs provider source.
- `features/ski/containers/PassTracker.test.tsx` — missing list, optimistic status change (MSW).
- `features/ski/containers/GearPlanner.test.tsx` — roll-up, hidden sizes copy.
- `features/ski/containers/SkiProfileForm.test.tsx` — validation ranges, consent default off.
- MSW handlers `features/ski/test/handlers.ts` exporting `skiConditionsHandler` for M4's Today tests.

## Security / robustness

- **Provider**: fixed host `api.open-meteo.com` (no user-controlled URLs), 5 s / 10 s timeouts, response
  size cap, exponential backoff per resort (15 min → 6 h), at most 4 calls per tick ≈ ≤ 100 calls/day for a
  handful of resorts — well under any fair-use limit; never called per web request.
- **Sensitive profile data** (height, weight, boot size): only the owner reads them; sizes leave the owner
  only with explicit consent and only to members of a trip where the owner rents gear; never in bot
  messages or logs; excluded from Django admin list displays.
- Manual reports rate-limited (6 per resort per hour) and bounded fields; `status_text` stripped of
  control characters.
- Provider `raw` trimmed (no unbounded JSON).

## Open questions / assumptions

- **[default]** One forecast per resort at mid-mountain elevation (not base and summit separately).
- **[default]** Boot size stored as EU size (common in AR/CL rentals); mondopoint conversion later if needed.
- **[default]** Pass and gear rows are self-service only (`/me`); organizers editing others' rows is later.
- **[default]** `LiftPass.document` and `GearPlan.rental_proposal` deferred to a post-Wave-B request.
- **[default]** Lifts/runs open have no free provider; manual only.
- Open (plan): which resorts to seed first — default the 13 above; road status (Paso Los Libertadores,
  chains) has no source → manual note on the trip (M4 notes) for now.
