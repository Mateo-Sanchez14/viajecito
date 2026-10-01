# M2 — Decisions and dates

Wave **A**. Branch `feat/m2-decisions`. Depends on core + R-2 (reminders), R-3 (subcommands),
R-4 (`default_trip_for_crew`, `active_member_ids`), R-5 (cards), R-6 (`trips.use_cases.update_trip`).

## Scope & demo

The crew converges on dates. A member opens a **dates decision** with a candidate range (e.g. 1 Jul –
15 Aug), a trip length (min/max days) and an optional deadline. Everyone marks each day yes / maybe / no
on a touch-friendly grid; a pure best-window algorithm ranks windows (most yes, fewest no, tie-break
weekend overlap, min length, `maybe` weighting). Closing the decision writes `Trip.start_on/end_on`
through the core trips use case. The bot answers `/viaje fechas` with the leading windows and who has not
answered, and nudges non-responders ("falta votar") as the deadline approaches. RSVP (`Participation.rsvp`)
is core and already on the overview. **Demo: the group converges on dates and the trip shows them.**

## Ownership

**Owns**
- api app `api/decisions/` (models, migrations, domain incl. `best_window.py`, use_cases, ports, adapters,
  api, schemas, copy, bot, tests).
- bot: `decisions/bot/subcommands.py` → `register_subcommand("fechas", …, aliases=("fecha",))`.
- copy `api/decisions/copy/es_ar.py`; reminder rule `decisions.missing_votes`.
- web: `web/src/features/dates/**`; route `web/src/app/(app)/crews/[crewId]/trips/[tripId]/dates/page.tsx`
  (+ `loading.tsx`); `web/messages/es-AR/dates.json`.
- tests: `api/decisions/tests/**`, `web/src/features/dates/test/handlers.ts`, `web/e2e/dates.spec.ts`.
- One-line appends: `config/settings/apps.py`, `pyproject.toml` root_packages, `web/messages/es-AR/index.ts`,
  `web/src/features/trips/cards/index.ts`.

**Reads**: `trips` use cases (get trip, participants with rsvp, `update_trip`), `crews.use_cases.active_member_ids`,
`shared/api_auth`, `messaging.handlers`, `messaging.reminders`, `shared/clock`.

**Must not touch**: `trips` (RSVP endpoint and `RsvpControl` stay core; M2 never writes `Participation`),
`crews`, `identity`, `messaging`, `config/*` except the append, existing `src/ui/**`, `features/trips`,
other milestones, `AGENTS.md`, `odd/**`.

## Models

`id` UUID pk, `created_at`, `updated_at` on every model.

### `decisions.Decision`

| Field | Type | Null | Default | Choices / notes |
|---|---|---|---|---|
| `trip` | FK `trips.Trip` CASCADE | no | — | `related_name="decisions"` |
| `kind` | CharField(16) | no | `dates` | `dates` (M2). `destination \| lodging` reserved for after M1 integrates (they need `outcome_proposal`, deferred) |
| `status` | CharField(8) | no | `open` | `open \| closed` |
| `window_start`, `window_end` | Date | no | — | candidate range; `window_end >= window_start`; span ≤ 180 days |
| `min_days` | PositiveSmallInt | no | — | 1..60, trip length in **days** (inclusive) |
| `max_days` | PositiveSmallInt | no | = `min_days` | `min_days <= max_days <= 60` |
| `maybe_weight` | Decimal(3,2) | no | `0.50` | 0..1 |
| `deadline` | DateTime (aware) | yes | null | |
| `outcome_start`, `outcome_end` | Date | yes | null | set on close |
| `opened_by` | FK `AUTH_USER_MODEL` PROTECT | no | — | |
| `closed_by` | FK `AUTH_USER_MODEL` PROTECT | yes | null | |
| `closed_at` | DateTime | yes | null | |

Constraints: unique `(trip)` where `kind='dates' AND status='open'` (`one_open_dates_decision`); checks on
ranges above. Index `(trip, status)`.

### `decisions.AvailabilityResponse`

| Field | Type | Null | Notes |
|---|---|---|---|
| `trip` | FK `trips.Trip` CASCADE | no | responses belong to the trip so they survive reopening/recreating a decision |
| `person` | FK `AUTH_USER_MODEL` CASCADE | no | |
| `date` | Date | no | |
| `answer` | CharField(8) | no | `yes \| maybe \| no` |

Unique `(trip, person, date)`. Index `(trip, date)`. Clearing a day deletes the row.

### Computed (not tables)
- **Grid**: decision window × eligible people → answer or `null`.
- **Eligible people** = active crew members (`active_member_ids`) minus participants with `rsvp = out`.
- **Best windows** (pure, below). **Non-responders** = eligible people with zero answers inside the window.

### Domain: best-window algorithm (`decisions/domain/best_window.py`, pure)

```python
def best_windows(*, window_start: date, window_end: date, min_days: int, max_days: int,
                 people: Sequence[str], answers: Mapping[tuple[str, date], Literal["yes","maybe","no"]],
                 maybe_weight: Decimal = Decimal("0.5"), limit: int = 3) -> list[WindowScore]
```
- Candidates: every `[start, start + L − 1]` inside the range for each length `L` in `min_days..max_days`.
- Per candidate: `yes_score = Σ over people × days (yes=1, maybe=maybe_weight, no=0, missing=0)`;
  `avg_score = yes_score / L`; `no_count` = person-days answered `no`; `blocked_people` = people with at
  least one `no`; `full_people` = people with all days `yes|maybe`; `weekend_days` = Saturdays+Sundays in
  the window; `missing_people` = people with no answer for any day of the window.
- Ranking (descending unless noted): `avg_score`, then `no_count` **ascending**, then `weekend_days`,
  then `L`, then `start` **ascending**. Deterministic.
- Returns `WindowScore(start, end, days, avg_score, yes_score, no_count, blocked_people, full_people,
  weekend_days, missing_people)`; `limit` best, non-overlapping not required.
- No people or no answers → windows still ranked (ties resolved by weekend/length/start), flagged
  `has_data = False` on the API.
- Complexity: ≤ 180 starts × ≤ 60 lengths × ≤ 20 people × ≤ 60 days — computed on read, no cache.

## API

`django_auth`, snake_case, `{code,message}`; every route resolves the trip and calls `member_of_trip`.
Router `decisions/api.py`, tag `decisions`.

### Schemas
```
DecisionOut      {id, trip_id, kind, status, window_start, window_end, min_days, max_days, maybe_weight: str,
                  deadline: datetime|null, outcome_start, outcome_end, opened_by: PersonRefOut,
                  closed_by: PersonRefOut|null, closed_at, respondents: int, eligible: int}
WindowOut        {start, end, days, avg_score: float, no_count, blocked_people: [person_id],
                  full_people: [person_id], weekend_days, missing_people: [person_id]}
GridPersonOut    {person_id, display_name, rsvp: "in"|"maybe"|"out"|"pending"|null,
                  answers: {"YYYY-MM-DD": "yes"|"maybe"|"no"}}
AvailabilityOut  {decision: DecisionOut, dates: [date], people: [GridPersonOut], me: person_id,
                  best_windows: [WindowOut], has_data: bool, non_responders: [PersonRefOut]}
```

### Endpoints

| Method + path | Request | Success | Errors |
|---|---|---|---|
| `GET /api/trips/{trip_id}/decisions` | query `status?` | `200 [DecisionOut]` newest first | `404` |
| `POST /api/trips/{trip_id}/decisions` | `{kind: "dates", window_start, window_end, min_days, max_days?, maybe_weight?, deadline?}` | `201 DecisionOut` | `400 invalid_request` / `invalid_window` (end < start, span > 180, max < min, min > span); `409 decision_already_open`; `404` |
| `GET /api/decisions/{decision_id}` | — | `200 DecisionOut` | `404` |
| `PATCH /api/decisions/{decision_id}` | any of the POST fields except `kind` | `200 DecisionOut` (answers outside a narrowed window are kept, just not shown) | `409 decision_closed`; `400 invalid_window`; `404` |
| `GET /api/decisions/{decision_id}/availability` | — | `200 AvailabilityOut` | `404` |
| `PUT /api/decisions/{decision_id}/availability` | `{answers: [{date, answer: "yes"\|"maybe"\|"no"\|null}]}` (1..366 items; `null` clears; **my** answers only) | `200 AvailabilityOut` | `400 date_out_of_range` / `invalid_request`; `409 decision_closed`; `404` |
| `POST /api/decisions/{decision_id}/close` | `{start_on?: date, end_on?: date}` (default = best window #1; must lie inside the window) | `200 DecisionOut`; side effect: `trips.update_trip(trip_id, actor, start_on, end_on)` in the same transaction | `409 decision_closed`; `400 invalid_window` / `no_window`; `404` |
| `POST /api/decisions/{decision_id}/reopen` | — | `200 DecisionOut` (status `open`, outcome cleared; **trip dates untouched**) | `409 decision_already_open` (another open dates decision exists) / `decision_open`; `404` |

Status rules: `open → closed` (close), `closed → open` (reopen). Closing is allowed for any member (flat
roles). Closing when the trip already has dates overwrites them (the UI confirms). `GET /api/trips/{id}`
(core) is the source of truth for the trip's dates after closing; the web invalidates `["trips", id]`.

## Bot

### `/viaje fechas` (subcommand on the default trip)
- No open dates decision and trip has dates → `DATES_FIXED` ("Ya tenemos fechas: {start} al {end}.").
- No open decision and no dates → `NO_DECISION` with the dates page URL.
- Open decision → `SUMMARY`: top 3 windows (`{start}–{end} · {full} pueden, {blocked} no`), the
  non-responders by display name (no mentions in replies), deadline if any, and the URL.
- Help line `HELP_FECHAS = "/viaje fechas — cómo vamos con las fechas"`.

### Reminder rule `decisions.missing_votes`
For each open dates decision on an active trip with a `deadline` within the next 48 h (and not past): one
draft per trip per local day listing non-responders with mention tokens `{@<person_id>}`,
`dedupe_key = "decisions:missing:<decision_id>:<local_date>"`, `timezone = trip.timezone`,
`url_path = …/dates`. Without a deadline: one draft when the decision has been open 3 days and ≥ 1
non-responder, `dedupe_key = "decisions:missing:<decision_id>:day3"`. At most one draft per decision per day.

### Copy (`api/decisions/copy/es_ar.py`, suggested)
- `SUMMARY_HEADER = "📅 Fechas para {trip}:"`, `WINDOW_LINE = "{rank}) {start} al {end} · {full} pueden, {blocked} no"`,
  `MISSING_LINE = "Falta que marquen: {names}"`, `DEADLINE_LINE = "Cerramos el {deadline}."`,
  `LINK_LINE = "Marcá tus días acá 👉 {url}"`.
- `MISSING_VOTES = "⏰ Falta votar fechas: {mentions}. Cerramos {when}. 👉 {url}"`.
- `NO_DECISION = "Todavía no abrimos la votación de fechas. Arrancala en {url}."`
- `DATES_FIXED = "Ya tenemos fechas: {start} al {end} 🙌"`.
- Dates are formatted `"sáb 12/7"` via a pure `format_day(date)` in the copy module (weekday abbreviations
  `lun mar mié jue vie sáb dom`).

## Web

### Route
`…/[tripId]/dates/page.tsx` (`requireMe()` first) → `<DatesPlanner tripId />`.

### Containers (`features/dates/containers/`)
- `DatesPlanner`: loads the open (or latest) decision; no decision → `OpenDecisionForm`; open →
  `AvailabilityEditor` + `BestWindowsPanel` + `NonResponders`; closed → outcome summary + "Reabrir".
- `OpenDecisionForm`, `AvailabilityEditor` (owns my answers, debounced batch `PUT` 800 ms, optimistic),
  `DatesOverviewCard` (`module: "dates"`, `order: 20`: "Votaron 5 de 8 · mejor: 12–19 jul", or the fixed dates).

### Presentational (`features/dates/components/`)
- `AvailabilityGrid` — **touch-friendly**: one row per week (Mon–Sun columns), cells ≥ 44 px; tap cycles
  `empty → yes → maybe → no → empty`; drag/long-press paint mode applies the current paint value to every
  cell crossed (pointer events); a paint picker (yes / maybe / no / clear) for one-handed use; weekends
  shaded; my row editable, others shown in `CrewHeatmap` (count of yes/maybe per day, tap a day for names).
  Keyboard: grid semantics (`role="grid"`, arrow keys move, Space/Enter cycles, Shift+arrows extend), each
  cell `aria-label="sáb 12 de julio: puedo"`; state never colour-only (✓ / ~ / ✕ glyphs).
- `BestWindowsPanel` (top 3, metrics, "Cerrar con estas fechas"), `WindowBadge`, `NonResponders`,
  `DecisionOutcome`.
- Close and reopen go through `ConfirmDialog` (closing warns when the trip already has dates).

### Hooks + query keys
| Hook | Key | Interval |
|---|---|---|
| `useDecisions(tripId)` | `["dates", tripId, "decisions"]` | 60 s |
| `useAvailability(decisionId)` | `["dates", "decision", decisionId, "availability"]` | 60 s (paused while a local edit is pending) |
| `useSetAvailability`, `useOpenDecision`, `useUpdateDecision`, `useCloseDecision`, `useReopenDecision` | mutations; close also invalidates `["trips", tripId]` | — |

### Forms / validation
Open form: range (end ≥ start, ≤ 180 days), min/max days (1..60, max ≥ min, min ≤ range span), optional
deadline (future), "maybe" weight hidden under "Avanzado" (default 0.5).

### i18n (`web/messages/es-AR/dates.json`, `dates.*`)
`title` "Fechas", `open.title` "¿Cuándo viajamos?", `open.range` "Entre", `open.minDays` "Días de viaje
(mínimo)", `open.maxDays` "Máximo", `open.deadline` "Cerramos la votación el", `open.submit` "Abrir
votación", `grid.legend.yes` "Puedo", `grid.legend.maybe` "Capaz", `grid.legend.no` "No puedo",
`grid.legend.clear` "Borrar", `grid.paint` "Pintar", `grid.cellLabel` "{day}: {answer}",
`best.title` "Las mejores fechas", `best.line` "{start} al {end} · {full} pueden", `best.close` "Cerrar
con estas fechas", `best.noData` "Cuando marquen sus días, acá aparecen las mejores opciones",
`missing.title` "Falta que marquen", `closed.title` "Fechas cerradas", `closed.line` "{start} al {end}",
`closed.reopen` "Reabrir votación", `confirm.close` "¿Cerramos con {start} al {end}?",
`confirm.overwrite` "El viaje ya tiene fechas, las vamos a reemplazar", `overview.voted` "Votaron {n} de
{total}", `errors.decision_already_open` "Ya hay una votación abierta", `errors.decision_closed` "La
votación ya está cerrada", `errors.invalid_window` "Revisá el rango de fechas", `errors.date_out_of_range`
"Ese día está fuera del rango".

### Empty states
No decision: `EmptyState` "Todavía no votamos fechas" + `OpenDecisionForm`. Trip with dates and no
decision: show the dates and a secondary "Votar otras fechas".

## Tests

### api
- `decisions/tests/test_best_window.py` (pure, first): single best window; **ties** broken by no_count →
  weekend → length → start; **min length** enforced and windows of each length in `min..max`; **maybe
  weighting** (0, 0.5, 1 change the ranking); a single `no` outranks missing data correctly; no answers
  (`has_data=False`); range shorter than `min_days` → empty.
- `decisions/tests/test_decision_rules.py` — one open dates decision per trip; window validation; patch
  closed → 409.
- `decisions/tests/test_close_sets_trip_dates.py` — closing calls the core use case with the chosen
  window (default best #1), same transaction (failure rolls back the close); reopen leaves trip dates.
- `decisions/tests/test_availability_api.py` — **only members respond** (non-member 404, anonymous 401,
  CSRF 403); I can only write my answers; `null` clears; out-of-range 400; closed 409; `out` participants
  excluded from eligible.
- `decisions/tests/test_fechas_command.py` — three reply shapes, voseo copy, non-responders listed.
- `decisions/tests/test_missing_votes_rule.py` — `FrozenClock` / `time-machine`: within 48 h of the
  deadline one draft per local day with mention tokens; none after the deadline; day-3 variant; dedupe key.

### web
- `features/dates/components/AvailabilityGrid.test.tsx` — tap cycles, paint mode across cells (pointer
  events), keyboard navigation and Space, aria labels, weekend shading class.
- `features/dates/containers/AvailabilityEditor.test.tsx` — debounced batch PUT body (MSW), optimistic
  state, rollback on 409.
- `features/dates/containers/DatesPlanner.test.tsx` — no decision → form; open → grid + best windows;
  closed → outcome; close confirm invalidates the trip.
- MSW handlers `features/dates/test/handlers.ts`.
- e2e `web/e2e/dates.spec.ts` — open a decision, mark days, close, the overview shows the dates.

## Security / robustness

- Only my answers are writable; the person id is never taken from the body.
- Request size bounded (≤ 366 answers); window span ≤ 180 days keeps the algorithm bounded.
- Closing is transactional with the trip update; concurrent closes: the second sees `status=closed` →
  409 (`select_for_update` on the decision row under SQLite `IMMEDIATE`).
- Reminder mentions only eligible crew members; never phone numbers in the body text except through the
  core mention renderer.

## Open questions / assumptions

- **[default]** Eligible respondents = active crew members minus `rsvp=out`, independent of whether a
  `Participation` row exists (core may or may not create rows for every member).
- **[default]** Lengths are inclusive **days** (a 7-day trip Sat→Fri), not nights.
- **[default]** `destination`/`lodging` decisions are out of M2 scope; they need `Decision.outcome_proposal`
  (FK to M1), added by request after Wave A.
- **[default]** Any member may close or reopen (flat roles).
- Open: should closing also set every non-`out` member's RSVP? Default **no** (RSVP stays explicit, core).
