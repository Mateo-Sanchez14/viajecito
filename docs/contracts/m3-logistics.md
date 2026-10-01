# M3 — Logistics: tasks, packing, budget, documents vault

Wave **B** (after M1 is on `main`). Branch `feat/m3-logistics`. Depends on core + R-1 (subscribes to
`proposal.status_changed`), R-2 (reminders), R-3 (subcommands), R-5 (cards), R-6 (`fx_rates` in
`PATCH /api/trips/{id}`), and M1's `proposals.use_cases`.

Two sub-milestones, delivered in order on the same branch (separate PR slices if large):
**M3a** tasks + packing + nagging, **M3b** budget + documents vault.

## Scope & demo

M3a: trip tasks with owners and due dates (`todo | bring | booking`); choosing a proposal creates a
booking task automatically and booking it closes the task; packing lists per person seeded from templates
(generic, a "border" section for CL↔AR crossings, ski when the trip type lists it); `/viaje tareas` and
`/viaje listo <n>`; the tick nags owners of overdue/soon-due tasks in the group (backoff, quiet hours
22–09 trip time). M3b: a computed budget forecast (chosen + booked proposals × price basis × participants,
converted with the trip's manual FX rates, per-person split rounded to whole pesos) with a deep link to
gastito; an encrypted documents vault (reservations, tickets, insurance, IDs, photos) with `owner_only`
visibility. **Demo: the bot nags the owner of an open booking task; the web shows per-person cost.**

## Ownership

**Owns**
- api apps: `api/logistics/` (tasks, packing), `api/budget/` (no models; computed forecast), `api/documents/`
  (vault, encrypted storage).
- bot: `logistics/bot/subcommands.py` → `register_subcommand("tareas", …)`,
  `register_subcommand("listo", …, aliases=("hecho",))`.
- copy: `api/logistics/copy/es_ar.py` (bot copy **and** packing template labels), `api/budget/copy/es_ar.py`
  (none expected; create only if needed), `api/documents/copy/es_ar.py` (if a reminder is added).
- reminder rule `logistics.task_nag`; event subscriber `logistics.on_proposal_status_changed`.
- web: `web/src/features/logistics/**`, `web/src/features/budget/**`, `web/src/features/documents/**`;
  routes `…/[tripId]/logistics/page.tsx`, `…/[tripId]/budget/page.tsx`, `…/[tripId]/documents/page.tsx`
  (+ `loading.tsx` each); `web/messages/es-AR/logistics.json`, `budget.json`, `documents.json`.
- tests: `api/logistics/tests/**`, `api/budget/tests/**`, `api/documents/tests/**` (incl.
  `fixtures/files/{sample.pdf,sample.jpg,sample.png,sample.heic,fake.pdf.exe,svg.svg}`),
  `web/src/features/{logistics,budget,documents}/test/handlers.ts`, `web/e2e/logistics.spec.ts`.
- management command: `documents/management/commands/generate_vault_key.py` (prints a new Fernet key).
- One-line appends: `config/settings/apps.py` (three apps, one line each), `pyproject.toml` root_packages,
  `web/messages/es-AR/index.ts` (three files), `web/src/features/trips/cards/index.ts`.

**Reads**: `proposals.use_cases` (`get_proposal_snapshot`, `list_trip_proposals(statuses)`), `trips`
use cases (trip, participants, `update_trip` for `fx_rates`), `crews`, `shared/events`,
`messaging.reminders`, `messaging.handlers`, `shared/api_auth`, `shared/clock`.

**Must not touch**: `proposals`, `linkpreview` (M1 — request a use case if one is missing), `itinerary`
(M4, parallel), `trips`, `crews`, `identity`, `messaging`, `config/*` (except appends),
`config/urls.py`, existing `src/ui/**`, other milestones, `AGENTS.md`, `odd/**`, `deploy/**`.

## Models

`id` UUID pk, `created_at`, `updated_at` on every model.

### `logistics.Task`

| Field | Type | Null | Default | Choices / notes |
|---|---|---|---|---|
| `trip` | FK `trips.Trip` CASCADE | no | — | `related_name="tasks"` |
| `number` | PositiveInt | no | next per trip | human handle for `/viaje listo <n>`; never reused |
| `kind` | CharField(8) | no | `todo` | `todo \| bring \| booking` |
| `title` | CharField(200) | no | — | |
| `notes` | TextField(2000) | no | `""` | |
| `owner` | FK `AUTH_USER_MODEL` SET_NULL | yes | null | |
| `due_on` | Date | yes | null | in trip tz |
| `status` | CharField(8) | no | `open` | `open \| done \| blocked` |
| `quantity` | PositiveSmallInt | yes | null | for `bring` |
| `proposal` | FK `proposals.Proposal` SET_NULL | yes | null | booking tasks |
| `source` | CharField(12) | no | `manual` | `manual \| proposal \| template` |
| `nudge_count` | PositiveSmallInt | no | 0 | |
| `last_nudged_at` | DateTime | yes | null | |
| `done_at` | DateTime | yes | null | |
| `done_by` | FK `AUTH_USER_MODEL` SET_NULL | yes | null | |
| `created_by` | FK `AUTH_USER_MODEL` SET_NULL | yes | null | null for automatic tasks |

Constraints: unique `(trip, number)`; unique `(proposal, kind)` where `proposal IS NOT NULL`
(`one_task_per_proposal_kind`). Indexes `(trip, status)`, `(status, due_on)`.

### Packing templates — **code registry, not a table** (deviation, see Open questions)
`logistics/packing.py`: `PackingTemplate(key, sections: tuple[PackingSection, ...])`,
`PackingSection(key, items: tuple[PackingItem, ...])`, `PackingItem(key, per_person: bool,
default_quantity: int | None)`. Labels come from `logistics/copy/es_ar.py` (`PACKING_LABELS[<template>][<item_key>]`,
`PACKING_SECTION_LABELS`). Templates shipped by M3: `generic` (documents, money, health, clothes, tech),
`border` (one section: DNI/pasaporte, permiso del auto + cédula verde/azul, seguro del auto para el país
vecino (carta verde / SOAPEX), declaración jurada SAG (CL), cadenas, efectivo en la otra moneda), `ski`
(campera, pantalón, primera capa, guantes, antiparras, casco, cuello, protector solar y labial, crema,
mochila chica, ski/tabla y botas if not renting). Applied set = `("generic",) + plugin.packing_templates`
(the `ski` plugin from M5 lists `("ski", "border")`); `border` is offered as an opt-in for any trip.

### `logistics.PackingEntry`

| Field | Type | Null | Default | Notes |
|---|---|---|---|---|
| `trip` | FK `trips.Trip` CASCADE | no | — | |
| `person` | FK `AUTH_USER_MODEL` CASCADE | no | — | each person owns their list |
| `section` | CharField(32) | no | `custom` | template section key or `custom` |
| `item_key` | CharField(64) | yes | null | template item key; null for custom |
| `label` | CharField(120) | no | — | copied from the copy module at apply time (editable) |
| `quantity` | PositiveSmallInt | yes | null | |
| `packed` | Bool | no | False | |
| `position` | PositiveInt | no | 0 | |

Unique `(trip, person, item_key)` where `item_key IS NOT NULL`. Index `(trip, person)`.

### `documents.Document`

| Field | Type | Null | Default | Choices / notes |
|---|---|---|---|---|
| `trip` | FK `trips.Trip` CASCADE | no | — | `related_name="documents"` |
| `uploader` | FK `AUTH_USER_MODEL` PROTECT | no | — | |
| `owner` | FK `AUTH_USER_MODEL` SET_NULL | yes | uploader | required when `visibility=owner_only` |
| `title` | CharField(200) | no | original filename stem | |
| `kind` | CharField(16) | no | `other` | `reservation \| ticket \| insurance \| id \| photo \| other` |
| `file` | FileField(storage=`EncryptedFileSystemStorage`, `upload_to=vault_path`) | no | — | stored name `vault/<trip_id>/<uuid4>.<ext-from-sniffed-mime>.enc` |
| `original_name` | CharField(200) | no | `""` | sanitized, only for `Content-Disposition` |
| `mime` | CharField(64) | no | — | from **magic bytes**, never from the client |
| `size` | PositiveBigInt | no | — | plaintext bytes |
| `sha256` | CharField(64) | no | — | plaintext digest (integrity check on download) |
| `visibility` | CharField(12) | no | `crew` | `crew \| owner_only` |
| `valid_until` | Date | yes | null | passports, insurance |
| `proposal` | FK `proposals.Proposal` SET_NULL | yes | null | optional link to the booked proposal |

Constraint: `visibility='owner_only'` ⇒ `owner IS NOT NULL` (check). Index `(trip, kind)`.
`itinerary_entry` FK (plan) is **deferred** until M4 is merged (M3 and M4 run in parallel).

### Computed (not tables)
- **Budget forecast** (`budget/domain/forecast.py`, pure): input = chosen + booked proposals (snapshots
  from `proposals.use_cases`), trip currency, `fx_rates`, participant count, trip nights.
- **Task numbering**: `max(number)+1` under the trip row lock.

### Domain rules

#### Task ↔ proposal (subscriber `logistics.on_proposal_status_changed`, registered in `LogisticsConfig.ready()`)
| `to_status` | Effect (idempotent) |
|---|---|
| `chosen` | `get_or_create Task(kind=booking, proposal, source=proposal, title=BOOKING_TASK_TITLE.format(title), due_on = min(proposal.starts_on, trip.start_on) − 14 days if known, owner = actor)`; if it exists and is `done` (unbook path) → reopen to `open` |
| `booked` | booking task → `done`, `done_at = occurred_at`, `done_by = actor` (create it done if missing) |
| `discussing`, `proposed`, `discarded` | booking task with `status=open` and `source=proposal` → deleted; `done` tasks are kept |

#### Budget forecast
- Line amount (in the proposal currency): `total` → `est_price`; `per_person` → `est_price × participants`;
  `per_night` → `est_price × nights`, `nights = (ends_on − starts_on).days` of the proposal, else of the
  trip, else `1` with `nights_assumed = true`.
- `participants` = count of `Participation.rsvp = in`; if 0, use `in + maybe`; minimum 1 (flagged).
- Conversion: `fx_rates[X]` = **units of X per 1 unit of trip currency**; `amount_trip = amount_X / rate`.
  Same currency → rate 1. Missing rate → the line goes to `unconverted` and is excluded from totals.
- Rounding: currency minor units table `ARS 0, CLP 0, PYG 0, UYU 0, USD 2, EUR 2, BRL 2`, default 2.
  Totals are summed exactly (`Decimal`), then rounded `ROUND_HALF_UP`; `per_person = round(total / participants)`;
  `remainder = total − per_person × participants` is reported (never hidden). **Whole pesos** for ARS/CLP.
- Proposals without `est_price` go to `missing_price`.
- Grouping by `category` and by `status` (`booked` = committed, `chosen` = expected).

## API

`django_auth`, snake_case, `{code,message}`; `member_of_trip` on everything. Routers
`logistics/api.py` (tag `logistics`), `budget/api.py` (tag `budget`), `documents/api.py` (tag `documents`).

### Schemas
```
TaskOut          {id, trip_id, number, kind, title, notes, owner: PersonRefOut|null, due_on, status, quantity,
                  proposal_id: uuid|null, source, nudge_count, done_at, done_by: PersonRefOut|null,
                  overdue: bool, created_at, updated_at}
PackingEntryOut  {id, section, item_key, label, quantity, packed, position}
PackingListOut   {templates_available: [{key, label}], applied: [template_key], sections: [{key, label, entries: [PackingEntryOut]}],
                  progress: {packed: int, total: int}}
BudgetLineOut    {proposal_id, title, category, status, price_basis, original_amount: str, original_currency,
                  nights: int|null, nights_assumed: bool, amount: str|null, per_person: str|null}
BudgetOut        {currency, participants: int, participants_basis: "in"|"in_maybe"|"minimum",
                  lines: [BudgetLineOut], by_category: {<cat>: str}, committed: str, expected: str,
                  total: str, per_person: str, remainder: str, unconverted: [BudgetLineOut],
                  missing_price: [{proposal_id, title}], fx_rates: {code: str}, gastito_url: str|null}
DocumentOut      {id, trip_id, title, kind, mime, size, visibility, owner: PersonRefOut|null,
                  uploader: PersonRefOut, valid_until, proposal_id, created_at, download_path: str,
                  can_delete: bool}
```

### Endpoints — tasks
| Method + path | Request | Success | Errors |
|---|---|---|---|
| `GET /api/trips/{trip_id}/tasks` | query `status?` (repeatable), `kind?`, `owner?: "me"\|uuid` | `200 [TaskOut]` ordered open first, then `due_on` nulls last, then `number` | `404` |
| `POST /api/trips/{trip_id}/tasks` | `{kind?, title, notes?, owner_id?, due_on?, quantity?}` | `201 TaskOut` | `400 invalid_request` / `invalid_owner` (owner not an active crew member); `404` |
| `PATCH /api/tasks/{task_id}` | any of `title, notes, owner_id (null), due_on (null), quantity, kind, status` | `200 TaskOut` (`done` sets `done_at/done_by`; reopening clears them; changing `owner` or `due_on` resets `nudge_count` to 0) | `400`; `404` |
| `DELETE /api/tasks/{task_id}` | — | `204` | `404` |

Task status transitions: `open ↔ done`, `open ↔ blocked`, `blocked → done`; all by any member.

### Endpoints — packing
| Method + path | Request | Success | Errors |
|---|---|---|---|
| `GET /api/trips/{trip_id}/packing/me` | — | `200 PackingListOut` | `404` |
| `POST /api/trips/{trip_id}/packing/me/apply` | `{template_key}` | `200 PackingListOut` (idempotent: existing `item_key`s untouched) | `400 unknown_template`; `404` |
| `POST /api/trips/{trip_id}/packing/me/entries` | `{label, section?, quantity?}` | `201 PackingEntryOut` | `400`; `404` |
| `PATCH /api/packing_entries/{entry_id}` | `{label?, quantity?, packed?, position?}` | `200 PackingEntryOut` | `404` (also for another person's entry) |
| `DELETE /api/packing_entries/{entry_id}` | — | `204` | `404` |
| `GET /api/trips/{trip_id}/packing/summary` | — | `200 [{person: PersonRefOut, packed, total}]` (no item details of others) | `404` |

### Endpoints — budget
| Method + path | Request | Success | Errors |
|---|---|---|---|
| `GET /api/trips/{trip_id}/budget` | — | `200 BudgetOut` (computed on every request) | `404` |
| `PUT /api/trips/{trip_id}/budget/fx_rates` | `{rates: {"ARS": "1150.00", "CLP": "950"}}` (≤ 10 codes, decimal > 0, 3-letter upper, not the trip currency) | `200 BudgetOut`; writes `Trip.fx_rates` through `trips.use_cases.update_trip` | `400 invalid_fx_rates`; `404` |

`gastito_url` = the crew's `gastito_group_url` (deep link only; no integration).

### Endpoints — documents
| Method + path | Request | Success | Errors |
|---|---|---|---|
| `GET /api/trips/{trip_id}/documents` | query `kind?` | `200 [DocumentOut]`; `owner_only` documents of others are **omitted entirely** | `404` |
| `POST /api/trips/{trip_id}/documents` | `multipart/form-data`: `file`, `title?`, `kind?`, `visibility?`, `valid_until?`, `proposal_id?` | `201 DocumentOut` | `400 file_required` / `invalid_request`; `413 file_too_large`; `415 unsupported_type`; `507 quota_exceeded`; `404` |
| `GET /api/documents/{document_id}` | — | `200 DocumentOut` | `404` (also for others' `owner_only`) |
| `PATCH /api/documents/{document_id}` | `{title?, kind?, visibility?, valid_until?, proposal_id?}` (visibility change only by the owner) | `200 DocumentOut` | `403 forbidden`; `404` |
| `GET /api/documents/{document_id}/file` | query `inline: bool=false` | `200` decrypted stream; headers below | `404`; `500 integrity_error` if the digest does not match |
| `DELETE /api/documents/{document_id}` | — | `204` (uploader or owner); deletes the encrypted file | `403 forbidden`; `404` |

Download response headers: `Content-Type: <stored mime>`; `Content-Disposition: attachment; filename="<ascii
fallback>"; filename*=UTF-8''<percent-encoded original_name>` (`inline` only for `application/pdf` and
`image/*` when `inline=true`); `Content-Length`; `X-Content-Type-Options: nosniff`;
`Cache-Control: private, no-store`; `Content-Security-Policy: sandbox; default-src 'none'`;
`Cross-Origin-Resource-Policy: same-origin`.

### Settings (`documents/conf.py`, `logistics/conf.py`)
`DOCUMENTS_FERNET_KEYS` (comma-separated; first encrypts, all decrypt — `MultiFernet` for rotation;
**required in prod**, dev/test default generated per run in test settings), `DOCUMENTS_MAX_UPLOAD_BYTES`
(15 MiB), `DOCUMENTS_TRIP_QUOTA_BYTES` (1 GiB), `DOCUMENTS_ALLOWED_MIME` (default list below),
`LOGISTICS_NAG_LEAD_DAYS` (3). Orchestrator also sets `FILE_UPLOAD_MAX_MEMORY_SIZE = 2_621_440` (stream to
temp file above 2.5 MB) and `DATA_UPLOAD_MAX_MEMORY_SIZE` accordingly.

## Bot

### `/viaje tareas`
Open + blocked tasks of the default trip, max 15, ordered like the API:
`#<n> <title> — <owner name or "sin dueño"> · <due label>` (`vence hoy`, `venció hace 2 días`, `vence el vie 12/7`),
then the logistics URL. None → `NO_TASKS`. Help `HELP_TAREAS = "/viaje tareas — lo que falta hacer"`.

### `/viaje listo <n>`
`n` = task `number`. Marks it `done` (`done_by` = sender). Replies `TASK_DONE`; unknown number →
`TASK_NOT_FOUND`; already done → `TASK_ALREADY_DONE`; missing/invalid arg → `LISTO_USAGE`. If the task is a
booking task linked to a `chosen` proposal, the reply suggests marking the proposal as reserved (no
automatic transition — that is M1's call). Help `HELP_LISTO = "/viaje listo <n> — marcar la tarea #n como hecha"`.

### Reminder rule `logistics.task_nag`
- Candidates: tasks `status=open`, `owner` set **or not**, `due_on` ≤ local today + `LOGISTICS_NAG_LEAD_DAYS`
  (3), on trips `planning | booked | ongoing`.
- Backoff by `nudge_count`: a task is due for a nudge when `last_nudged_at` is null or local days since
  `last_nudged_at` ≥ `[1, 1, 2, 4, 7][min(nudge_count, 4)]`; after 8 nudges only weekly. Overdue tasks
  use the same table.
- **One draft per trip per local day** listing every due task (owners mentioned with `{@<person_id>}`,
  unowned tasks under "sin dueño"), `dedupe_key = "logistics:nag:<trip_id>:<local_date>"`,
  `timezone = trip.timezone`, `url_path = …/logistics`, `respect_quiet_hours = True` (core skips 22–09).
- `on_queued(draft)` increments `nudge_count` and sets `last_nudged_at = now` for exactly the tasks in the
  draft (task ids carried in `subject_id` as a comma-separated list, `subject_type = "task_batch"`).

### Copy (`api/logistics/copy/es_ar.py`, suggested)
`TASKS_HEADER = "📋 Lo que falta para {trip}:"`, `TASK_LINE = "#{number} {title} — {owner} · {due}"`,
`NO_OWNER = "sin dueño"`, `NO_TASKS = "No hay nada pendiente 🙌"`, `TASK_DONE = "✅ Listo: #{number} {title}."`,
`TASK_NOT_FOUND = "No encontré la tarea #{number}. Mandá /viaje tareas para ver la lista."`,
`TASK_ALREADY_DONE = "La #{number} ya estaba hecha 👌"`, `LISTO_USAGE = "Usalo así: /viaje listo 3"`,
`NAG_HEADER = "⏰ Recordatorio para {trip}:"`, `NAG_LINE = "{mention} {title} ({due})"`,
`NAG_UNOWNED = "Sin dueño: {titles}. ¿Alguien se lo pone al hombro?"`,
`BOOKING_TASK_TITLE = "Reservar: {title}"`, `SUGGEST_MARK_BOOKED = "Si ya está reservada, respondé \"reservada\" a la tarjeta."`,
`DUE_TODAY = "vence hoy"`, `DUE_ON = "vence el {day}"`, `OVERDUE = "venció hace {days} días"`,
`OVERDUE_ONE = "venció ayer"`, plus `PACKING_LABELS` and `PACKING_SECTION_LABELS`.

## Web

### Routes (all `requireMe()` first)
- `…/[tripId]/logistics/page.tsx` → `<LogisticsBoard tripId />` (tabs "Tareas" | "Valija").
- `…/[tripId]/budget/page.tsx` → `<BudgetView tripId crewId />`.
- `…/[tripId]/documents/page.tsx` → `<DocumentVault tripId />`.

### Containers
- logistics: `TaskList` (filters: mine / all / kind; grouped Overdue · This week · Later · No date · Done),
  `TaskForm` (create/edit sheet), `PackingList` (my list by section, apply template, progress),
  `PackingCrewProgress`, `LogisticsOverviewCard` (`module: "logistics"`, `order: 30`: "3 tareas vencidas ·
  2 tuyas").
- budget: `BudgetView` (per-person headline, lines by category, committed vs expected, unconverted and
  missing-price warnings), `FxRatesForm`, `BudgetOverviewCard` (`module: "budget"`, `order: 40`: per-person
  amount).
- documents: `DocumentVault` (list grouped by kind, upload, preview/download), `UploadDocumentForm`,
  `DocumentsOverviewCard` (`module: "documents"`, `order: 60`: count + next `valid_until`).

### Presentational
`TaskRow` (checkbox toggles done, owner avatar, due chip with overdue styling + text), `DueChip`,
`OwnerPicker` (participants from `TripProvider`), `PackingItemRow`, `ProgressBar`, `MoneyAmount`
(formats with `Intl.NumberFormat("es-AR", {style:"currency", currency, maximumFractionDigits: minorUnits})`),
`BudgetLine`, `FxRateInput`, `DocumentRow` (kind icon, size, visibility lock icon with text, valid-until),
`FileDropzone` (also a plain `<input type="file" accept=…>` with camera capture on mobile).

### Hooks + query keys
| Hook | Key | Interval |
|---|---|---|
| `useTasks(tripId, filters)` | `["logistics", tripId, "tasks", filters]` | 60 s |
| `usePacking(tripId)` | `["logistics", tripId, "packing", "me"]` | — (refetch on focus) |
| `usePackingSummary(tripId)` | `["logistics", tripId, "packing", "summary"]` | 60 s |
| `useBudget(tripId)` | `["budget", tripId]` | 60 s |
| `useDocuments(tripId, kind?)` | `["documents", tripId, "list", kind ?? "all"]` | 60 s |
| mutations | `useCreateTask`, `useUpdateTask` (optimistic toggle), `useDeleteTask`, `useApplyTemplate`, `useAddPackingEntry`, `useUpdatePackingEntry` (optimistic), `useSetFxRates` (invalidates `["budget", tripId]` and `["trips", tripId]`), `useUploadDocument` (progress via XHR; CSRF header), `useUpdateDocument`, `useDeleteDocument` | — |

Downloads use a plain link to `download_path` (`/api/documents/{id}/file`), same-origin, no blob URLs.

### Forms / validation
Task: title 1–200, due date optional, quantity ≥ 1 for `bring`. FX: decimal > 0, up to 6 decimals. Upload:
client-side check of size (≤ 15 MB) and extension against the allowlist before sending (the server is
authoritative); `owner_only` toggle with an explanation ("Solo vos lo vas a ver"); IDs default to `owner_only`.

### i18n (`logistics.*`, `budget.*`, `documents.*`)
logistics: `title` "Logística", `tabs.tasks` "Tareas", `tabs.packing` "Valija", `task.kind.todo` "Pendiente",
`task.kind.bring` "Llevar", `task.kind.booking` "Reserva", `task.status.open` "Abierta", `task.status.done`
"Hecha", `task.status.blocked` "Trabada", `task.noOwner` "Sin dueño", `task.add` "Nueva tarea",
`task.groups.overdue` "Vencidas", `task.groups.week` "Esta semana", `task.groups.later` "Más adelante",
`task.groups.noDate` "Sin fecha", `task.groups.done` "Hechas", `packing.apply` "Usar la lista {template}",
`packing.templates.generic` "Básica", `packing.templates.border` "Cruce de frontera", `packing.templates.ski`
"Ski", `packing.progress` "{packed} de {total} en la valija", `empty.tasks` "No hay tareas. ¡Qué
organizados!", `empty.packing` "Arrancá con una lista armada".
budget: `title` "Presupuesto", `perPerson` "{amount} por persona", `participants` "Somos {n}",
`committed` "Reservado", `expected` "Elegido, falta reservar", `remainder` "Sobran {amount} del redondeo",
`unconverted` "Falta la cotización de {currency}", `missingPrice` "Sin precio: {titles}", `fx.title`
"Cotizaciones", `fx.help` "¿Cuántos {currency} es 1 {tripCurrency}?", `gastito` "Cargá los gastos en
gastito", `empty` "Cuando elijan propuestas con precio, acá ves cuánto sale".
documents: `title` "Documentos", `upload` "Subir documento", `kind.reservation` "Reserva", `kind.ticket`
"Pasaje", `kind.insurance` "Seguro", `kind.id` "Documento de identidad", `kind.photo` "Foto",
`kind.other` "Otro", `visibility.crew` "Lo ve todo el grupo", `visibility.owner_only` "Solo vos",
`validUntil` "Vence el {date}", `download` "Descargar", `view` "Ver", `empty` "Subí reservas, pasajes y
seguros para tenerlos a mano en el viaje", `errors.file_too_large` "El archivo es muy pesado (máximo 15 MB)",
`errors.unsupported_type` "Solo PDF o fotos (JPG, PNG, WebP, HEIC)", `errors.quota_exceeded` "Se llenó el
espacio del viaje".

### Accessibility
Task checkbox labelled with the title; overdue conveyed by text, not only colour; upload control is a
real `<input type="file">`; upload progress announced (`aria-live="polite"`); money uses tabular numerals.

## Tests

### api (M3a first)
- `logistics/tests/test_nag_cadence.py` — `time-machine` over two weeks: backoff table, lead days, overdue,
  owner change resets, **one draft per trip per day**, `on_queued` increments only the included tasks.
- `logistics/tests/test_quiet_hours.py` — draft produced at 23:30 trip time is skipped by the core
  (integration with `messaging.reminders` using `is_quiet_time`), then queued at 09:00; AR (UTC−3) and CL
  (DST) trips.
- `logistics/tests/test_dedupe_key.py` — two ticks the same local day queue one message; next day a new one.
- `logistics/tests/test_tick_reentrancy.py` — concurrent `tick` under `JobLock`: the second exits, no
  duplicate nudges.
- `logistics/tests/test_owner_mention.py` — mention tokens rendered `@<digits>`; unowned section.
- `logistics/tests/test_proposal_subscriber.py` — `chosen` → booking task (idempotent on replay), `booked`
  → done, back to `discussing` → open auto task deleted, done task kept.
- `logistics/tests/test_tasks_api.py` — authz (non-member 404, anonymous 401, CSRF 403), numbering never
  reused, filters, invalid owner.
- `logistics/tests/test_packing.py` — apply idempotent, ski/border templates from the plugin, entries
  private to the person (another person's entry → 404), labels from the copy module.
- `logistics/tests/test_tareas_listo_commands.py` — list format, `listo 3`, unknown, already done, usage.

### api (M3b)
- `budget/tests/test_forecast.py` (pure) — bases, nights fallback, FX conversion and missing rate,
  **split rounds to whole pesos** (ARS/CLP) with the remainder reported, USD to cents, participants basis.
- `budget/tests/test_budget_api.py` — authz, fx_rates validation, write through the core use case.
- `documents/tests/test_encrypted_storage.py` — **encrypt/decrypt round-trip**, ciphertext on disk ≠
  plaintext, key rotation (old key decrypts, new key encrypts), tampered file → integrity error.
- `documents/tests/test_upload_validation.py` — **size + MIME allowlist** by magic bytes (PDF, JPEG, PNG,
  WebP, HEIC accepted; `fake.pdf.exe`, SVG, HTML, ZIP rejected even with a lying `Content-Type`), 413/415,
  quota 507.
- `documents/tests/test_documents_authz.py` — **non-member → 404** (list, detail, file, delete);
  **`owner_only` visible only to the owner** (absent from others' list, 404 on their detail/file).
- `documents/tests/test_path_safety.py` — **path traversal rejected**: `../../etc/passwd`,
  `..\\..\\x`, absolute paths and NUL bytes in the filename never reach the storage path; stored names are
  UUIDs under `vault/<trip_id>/`.
- `documents/tests/test_download_headers.py` — **`Content-Disposition` set** (attachment default, RFC 5987
  `filename*`, inline only for pdf/images), `nosniff`, `no-store`, CSP sandbox.

### web
- `features/logistics/containers/TaskList.test.tsx` — grouping, optimistic done toggle + rollback, owner
  filter (MSW).
- `features/logistics/containers/PackingList.test.tsx` — apply template, toggle packed, progress.
- `features/budget/containers/BudgetView.test.tsx` — per-person headline, unconverted warning, FX form.
- `features/budget/components/MoneyAmount.test.tsx` — ARS/CLP no decimals, USD two.
- `features/documents/containers/DocumentVault.test.tsx` — list, upload validation messages, owner_only
  badge, download link is same-origin.
- MSW handlers `features/{logistics,budget,documents}/test/handlers.ts` (exported for M4's Today tests).
- e2e `web/e2e/logistics.spec.ts` — create a task with an owner and a past due date → run `tick` in the
  dev stack → fake Gowa `__sent` shows one reminder mentioning the owner; budget page shows per-person cost.

## Security / robustness

- **Upload allowlist** by magic bytes (`filetype`/`puremagic` or a small in-app sniffer):
  `application/pdf`, `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif`. Everything else
  415. Size checked while streaming (abort at the limit, 413); per-trip quota 507.
- **Encrypted storage**: `documents/storage.py::EncryptedFileSystemStorage(FileSystemStorage)` under
  `MEDIA_ROOT/vault/`, Fernet via `MultiFernet` (keys from `DOCUMENTS_FERNET_KEYS`, never in the repo or DB);
  chunked encrypt into a temp file then atomic rename; `open()` decrypts; documented as protection against
  SD-card theft/disposal only (the key sits on the same host). Prod startup fails when the key list is
  empty. Key rotation command is out of scope (MultiFernet makes it possible later).
- **Never served from `/media/`**: vault paths are not URL-routable; downloads only through the
  authorized endpoint. The ingress `/media/*` rule must not expose `vault/` (orchestrator: Django serves no
  `/media/` in prod).
- **`owner_only`**: only the owner sees it in lists, details, files and the Today shortcuts (M4 consumes
  the list endpoint, so the filter applies automatically). Only the owner can change visibility.
- `original_name` sanitized (basename, strip control chars and path separators, ≤ 200 chars); never used
  in a filesystem path. Files decrypted with integrity check (`sha256`) before streaming.
- Thumbnails/previews of documents are not generated server-side (no image processing of IDs).
- Reminders: one message per trip per day caps spam; quiet hours enforced by core; mentions only crew
  members; no document names in reminders.
- Budget math in `Decimal` only; no floats.

## Open questions / assumptions

- **[default] Deviation**: `PackingTemplate` is a code registry with labels in the copy module, not a DB
  table (user-facing labels must live in copy files; templates are versioned with code). M3 owns the `ski`
  template content; M5's plugin only lists `("ski", "border")`.
- **[default] Deviation**: nag dedupe is per trip per day (`logistics:nag:<trip_id>:<date>`) instead of the
  plan's per task (`nag:<task>:<date>`) to send one grouped message instead of one per task.
- **[default]** Booking task due date = 14 days before the proposal/trip start when known.
- **[default]** Upload limit 15 MB, quota 1 GB per trip, HEIC accepted (iPhone photos of documents).
- **[default]** `Document.itinerary_entry`, `LiftPass.document` (M5) and an expiring-documents reminder are
  deferred; request them after Wave B.
- Open: should IDs (`kind=id`) be allowed at all (risk R5)? Default **yes, forced `owner_only`** for
  `kind=id` (the UI does not offer `crew` for IDs; the API rejects `visibility=crew` with `kind=id` →
  `400 id_must_be_private`).
