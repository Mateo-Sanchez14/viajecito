# Milestone contracts (M1–M6)

These documents let six implementation milestones run in parallel without touching each other's
files. Each contract is the **single source of truth for its milestone's boundaries**: what it owns,
what it builds, the exact API it exposes, and the first tests. They extend, never replace, the root
`AGENTS.md` (conventions, M0 runtime contract, M0b auth, M0c webhook/tick, auth gate rule, and the
**M-core** contract). If a contract and `AGENTS.md` disagree, `AGENTS.md` wins and the writer
reports the conflict instead of picking a side.

| File | Milestone | Wave | Apps (api) | Web feature |
|---|---|---|---|---|
| [`m1-proposals.md`](m1-proposals.md) | M1 proposals + link capture | A | `proposals`, `linkpreview` | `features/proposals` |
| [`m2-decisions.md`](m2-decisions.md) | M2 decisions & dates | A | `decisions` | `features/dates` |
| [`m5-ski.md`](m5-ski.md) | M5 ski module | A | `ski` | `features/ski` |
| [`m6-pwa.md`](m6-pwa.md) | M6 PWA, push, map, polish | A (map task after M1 merges) | `notifications` | `features/pwa`, `features/push`, `features/map` |
| [`m3-logistics.md`](m3-logistics.md) | M3 tasks, packing, budget, documents | B | `logistics`, `budget`, `documents` | `features/logistics`, `features/budget`, `features/documents` |
| [`m4-itinerary.md`](m4-itinerary.md) | M4 itinerary & Today | B | `itinerary` | `features/itinerary`, `features/today` |

---

## 1. Cross-cutting rules (apply to every milestone)

1. **JSON is snake_case.** Every error body is `{"code": "<snake_case>", "message": "<English, developer-facing>"}`.
   The web never shows `message`; it maps `code` to an i18n key (`<feature>.errors.<code>`, falling back
   to `errors.unexpected`). A contract may add **one** extra field to an error body only where it says so
   (e.g. `proposal_id` on `409 duplicate_proposal`).
2. **Authorization: `member_of_trip` on everything trip-scoped.** Every endpoint that touches trip data
   resolves the trip (directly from `{trip_id}` or through the object's `trip_id`) and calls
   `shared/api_auth.member_of_trip(request, trip_id)`. Non-member, unknown id, or an object from another
   trip → `404 {"code":"not_found"}` (never reveal existence). Anonymous → `401 unauthenticated`. Unsafe
   methods require CSRF (`403 csrf_failed`). Endpoints addressed by a child id (`/api/proposals/{id}`)
   look up the object, then authorize against its trip; the lookup and the 404 must be indistinguishable.
3. **Roles are flat** (plan assumption): any active member may create and edit trip data. Only the
   exceptions each contract names (e.g. comment deletion = author; `owner_only` documents) narrow it.
4. **Copy.** User-facing text is Rioplatense Spanish with voseo and lives only in copy files:
   web → `web/messages/es-AR/<feature>.json`; bot → **each milestone's own** `api/<app>/copy/es_ar.py`
   (not `api/messaging/copy/es_ar.py`, which stays core-owned). This per-app copy module is an amendment
   to the AGENTS.md "Language" rule that the orchestrator must record (request R-6 below). Never hardcode
   Spanish in components, handlers, use cases, or seeds; seed data whose labels are user-facing reads them
   from the copy module.
5. **English artifacts**: code, identifiers, comments, i18n keys, commit messages, docs, test names.
6. **Strict TDD**: RED observed → GREEN → REFACTOR for every work unit. Runners: `cd api && uv run pytest`,
   `cd web && pnpm test`, `cd web && pnpm test:e2e`. No network in tests (`pytest-socket`, MSW). Record
   the RED/GREEN evidence in the milestone's ODD feature document.
7. **Hexagonal layout per app** (`models.py`, `domain.py`, `use_cases/`, `ports.py`, `adapters/`, `api.py`,
   `schemas.py`, `tests/`). Domain and use cases import nothing from Django or HTTP. Bot handlers live in
   `api/<app>/bot/` and call the app's own use cases. An app reaches another milestone's app **only
   through that app's `use_cases`** (never its models), and only where its wave allows it (§3).
8. **Shared files.** You may APPEND exactly one line (one line per app or per feature file you add) to each of: `api/config/settings/apps.py`
   (`PROJECT_APPS`), `api/pyproject.toml` (`[tool.importlinter] root_packages`),
   `web/messages/es-AR/index.ts`, and — once the orchestrator adds it (request R-5) —
   `web/src/features/trips/cards/index.ts`. Nothing else shared is edited: not `config/api.py`
   (router auto-discovery mounts your `api.router`), not `messaging/router.py` (use `register_handler`),
   not `src/ui/**` files that already exist, not `AGENTS.md`, not `odd/**`, not another milestone's files.
   New *shared* UI you need goes into your own `features/<capability>/components/` first; promote it to
   `src/ui` only through an orchestrator request.
9. **Settings and env.** A milestone that needs new settings reads them with
   `getattr(settings, "NAME", <default>)` inside its own `conf.py` and tests them with
   `override_settings`. The orchestrator adds the `environs` parsing lines to `config/settings/*.py`,
   `.env.example` and `deploy/env/*.example` at integration. Each contract lists its settings.
10. **OpenAPI.** Regenerate `contracts/openapi.json` and `web/src/shared/api/schema.d.ts` in your branch
    (`export_openapi_schema …` then `pnpm api:types`) so CI is green; the orchestrator regenerates both
    again at integration and resolves conflicts in them by regeneration, never by hand.
11. **Polling, not push, for freshness**: TanStack Query `refetchInterval` 60 s by default, 20 s on Today.
12. **Commits**: Conventional Commits, English, one work unit per commit, no attribution trailers, never
    push. Branch `feat/m<N>-<slug>` in its own worktree under `~/Development/viajecito-worktrees/`.
13. **Migrations** live only in your own apps. Never create a migration in a core app; a core field you
    need is a request.

## 2. Core additions the orchestrator must land BEFORE Wave A starts

The M-core contract does not yet provide these. Milestone writers code against the APIs below exactly;
if the orchestrator changes a signature, it updates this section first.

### R-1 `api/shared/events.py` — in-process domain events

Lets Wave A publish facts that Wave B reacts to, without Wave A importing Wave B.

```python
# api/shared/events.py  (pure Python; imports no project package and no Django)
from collections.abc import Callable, Iterator
from contextlib import contextmanager

Subscriber = Callable[..., None]

def subscribe(event_name: str, callback: Subscriber) -> None:
    """Register ``callback`` for ``event_name``. Registering the same callable twice is a no-op."""

def publish(event_name: str, **payload: object) -> None:
    """Call every subscriber of ``event_name`` synchronously, in registration order, with ``**payload``.
    No subscribers → no-op. A subscriber exception propagates to the publisher."""

def subscribers(event_name: str) -> tuple[Subscriber, ...]:
    """Introspection for tests."""

@contextmanager
def isolated() -> Iterator[None]:
    """Tests only: swap in an empty registry for the duration of the block, then restore it."""
```

Rules (all milestones):
- **Synchronous and transactional.** The publisher calls `publish` inside its own `transaction.atomic()`
  block *after* its writes. Subscribers run in the same thread and transaction; if one raises, the whole
  change (including the publisher's write) rolls back and the API returns 500. Rationale: the side effects
  of "chosen" (tray entry, booking task) are part of the same user action; a half-applied transition is
  worse than a failed one. Tradeoff: a bug in a Wave B subscriber blocks M1 transitions — mitigated by
  subscribers being small, idempotent and tested.
- **Idempotent subscribers.** Use `get_or_create`/conditional updates keyed by the subject id; an event may
  be delivered again after a retry.
- **Payload** values are `str`, `int`, `bool`, `None`, `date` or aware `datetime`; ids are `str(uuid)`.
- **Subscribe** only from `AppConfig.ready()`. Event names are `<noun>.<past_participle>`.
- Event catalog (owner → payload):

| Event | Published by | Payload | Subscribers |
|---|---|---|---|
| `proposal.status_changed` | M1 `proposals.use_cases.transition_proposal` (web and bot) | `proposal_id`, `trip_id`, `from_status`, `to_status`, `actor_id` (`str \| None`), `occurred_at` (aware UTC) | M3 (`logistics`: booking task), M4 (`itinerary`: tray entry) |

### R-2 `api/messaging/reminders.py` — reminder rules, channels, tick jobs, digest sections

```python
# api/messaging/reminders.py
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import date, datetime, time

QUIET_START = time(22, 0)   # local trip time, inclusive
QUIET_END = time(9, 0)      # local trip time, exclusive

@dataclass(frozen=True)
class ReminderDraft:
    crew_id: str                       # core resolves the group chat from WhatsAppGroupLink
    trip_id: str | None
    body: str                          # final voseo copy (≤ 4000 chars); may contain {@<person_id>} tokens
    dedupe_key: str                    # ≤ 200 chars; becomes OutboundMessage.dedupe_key (globally unique)
    timezone: str                      # IANA name used for quiet hours (normally Trip.timezone)
    subject_type: str = ""
    subject_id: str = ""
    mention_person_ids: tuple[str, ...] = ()
    title: str = ""                    # short title for non-group channels (push)
    url_path: str = ""                 # same-origin path to open, e.g. "/crews/<c>/trips/<t>/logistics"
    respect_quiet_hours: bool = True

@dataclass(frozen=True)
class ReminderContext:
    now: datetime                      # aware UTC; tests pass a FrozenClock instant

RuleFn = Callable[[ReminderContext], Iterable[ReminderDraft]]
OnQueued = Callable[[ReminderDraft], None]
ChannelFn = Callable[[ReminderDraft], None]
TickJob = Callable[[datetime], dict[str, int] | None]
DigestSection = Callable[[str, date], str | None]        # (trip_id, local_date) -> one block of copy

def register_reminder_rule(key: str, fn: RuleFn, *, on_queued: OnQueued | None = None) -> None: ...
def register_channel(name: str, deliver: ChannelFn) -> None: ...
def register_tick_job(key: str, fn: TickJob) -> None: ...
def register_digest_section(key: str, fn: DigestSection, *, order: int = 100) -> None: ...
def digest_sections(trip_id: str, local_date: date) -> list[str]: ...   # ordered, Nones dropped, errors logged+skipped
def is_quiet_time(now: datetime, tz: str) -> bool: ...
```

Core `tick` behavior to add (order inside one pass, all under the existing lock and deadline):
1. existing sweep + reprocess inbound;
2. **reminder rules**, each in its own `try/except` (a failing rule is logged, counted in `errors`, and
   never stops the pass). For each draft: if `respect_quiet_hours` and `is_quiet_time(now, draft.timezone)`
   → skip (`reminders_quiet += 1`; rules are re-evaluated next tick, so date-based dedupe keys make the
   reminder go out at 09:00). Else resolve the crew chat (no link → skip), render `{@<person_id>}` tokens to
   `@<E.164 digits>` (unknown person → display name, no `@`), and reserve
   `OutboundMessage(kind="reminder", status="queued", dedupe_key=…)`. **Only when the row is new**: call the
   rule's `on_queued(draft)` in the same transaction, then every registered channel's `deliver(draft)`
   (each in its own `try/except`; a channel failure never un-queues the group message);
3. existing dispatch of queued outbound (so reminders queued in step 2 go out in the same pass);
4. existing roster sync;
5. **tick jobs** in registration order, each in its own `try/except`, skipped once the deadline is reached.
Summary JSON gains `reminders_queued`, `reminders_quiet`, `jobs_run`.

Rules (all milestones): rules are **pure reads** that return drafts; all writes happen in `on_queued`.
Rules only look at trips with status `planning | booked | ongoing`. Dedupe keys are namespaced
`<app>:<rule>:<subject>:<local-date>` and documented per contract. Group messages only (DMs are for OTP).

### R-3 Subcommand registry for `/viaje <sub>`

The core `commands` handler (order 10) claims every `/viaje …` and answers unknown subcommands with help,
so milestone subcommands cannot be separate handlers. Request: in `messaging/handlers/commands.py`

```python
SubcommandHandler = Callable[[HandlerContext, str], Handled | None]   # (ctx, args) where args = text after
                                                                      # the subcommand, original casing, stripped
def register_subcommand(name: str, handler: SubcommandHandler, *, aliases: tuple[str, ...] = (),
                        help_line: str = "") -> None: ...
```
`name`/aliases are matched folded (accent- and case-insensitive). `HELP` becomes core lines + registered
`help_line`s in registration order (help lines come from the milestone's copy module). Throttling stays
in core: when `ctx.reply_allowed()` is false the core records `throttled` and does not call the handler.
`ping` and `ayuda` stay core.

### R-4 `HandlerContext` additions (messaging core)

```python
@dataclass(frozen=True)
class SentCard:
    status: str                  # "sent" | "failed" | "duplicate"
    gowa_message_id: str | None  # None unless sent (or the existing row's id on duplicate)

# new HandlerContext fields
send_card: Callable[..., SentCard]
#   send_card(body: str, *, subject_type: str, subject_id: str, dedupe_key: str) -> SentCard
#   kind="card", threaded to the inbound message; exempt from the 3 s MIN_GAP but counted in the
#   20-per-10-minutes window; stores subject_type/subject_id on the OutboundMessage row.
quoted_subject: tuple[str, str] | None
#   (subject_type, subject_id) of the bot OutboundMessage whose gowa_message_id equals
#   message.replied_to_id in the same chat; None when the message quotes nothing we sent.
```
Plus a trips use case `trips.use_cases.default_trip_for_crew(crew_id) -> str | None` (the
`crew.default_trip` id) if core does not already expose one, and
`crews.use_cases.active_member_ids(crew_id) -> list[str]`.

### R-5 Web: overview card registry and nav labels

- `web/src/features/trips/cards/index.ts`: an append-only array
  `export const tripCards: TripCard[] = [/* one line per milestone */]` with
  `type TripCard = { key: string; module?: string; order: number; Component: ComponentType<{ tripId: string; crewId: string }> }`.
  The overview renders cards whose `module` is in `trip.modules` (or that have no `module`), sorted by
  `order`. Each milestone appends one line pointing to its own `features/<x>/containers/<X>OverviewCard`.
  Add this file to the allowed-append list in AGENTS.md.
- `SectionNav` labels resolve as `trips.modules.<module_key>`; core `messages/es-AR/trips.json` must hold
  every module key including `ski` ("Ski") and every type label `trips.types.<key>` including `ski`.

### R-6 Smaller core requests

- `PATCH /api/trips/{trip_id}` also accepts `fx_rates` (`{ "<ISO 4217>": "<decimal string > 0>" }`, ≤ 10 keys)
  and exposes `fx_rates` in `TripOut` (M3 budget). The core use case behind PATCH is callable from other
  apps as `trips.use_cases.update_trip(trip_id: str, actor_id: str, **fields) -> TripRef` (M2 writes dates).
- Amend AGENTS.md "Language": bot copy lives in `api/messaging/copy/es_ar.py` **and** per-app
  `api/<app>/copy/es_ar.py`.
- Amend AGENTS.md shared-append list with `web/src/features/trips/cards/index.ts`.

## 3. Wave plan

```
core (M-core + R-1..R-6) ──► Wave A: M1 ║ M2 ║ M5 ║ M6(minus map) ──► integrate M1 first ──► Wave B: M3 ║ M4
                                                                    └► M6 map task          (+ M6 leftovers)
```

- **Wave A — M1, M2, M5, M6 in parallel.** They FK only core models (`Trip`, `Participation`, `Person`,
  `Crew`, plus `messaging.InboundMessage` by string reference where a contract says so). None reads
  another Wave A milestone's tables. M6's proposals **map** reads M1's endpoint, so that single task starts
  after M1 is merged (until then M6 can build it against MSW handlers written from the M1 contract, but it
  does not merge before M1).
- **Wave B — M3, M4 after M1 integrates.** Both FK `proposals.Proposal` (`Task.proposal`,
  `ItineraryEntry.proposal`) and subscribe to `proposal.status_changed`; Django migrations need the
  `proposals` migration on `main` to declare the dependency. M3 and M4 run in parallel with each other:
  M4 consumes M3's documents list **over HTTP from the web only** (no FK, no import), so it builds against
  MSW handlers derived from `m3-logistics.md` and the orchestrator swaps in generated types at integration.
- **Integration order inside a wave** does not matter for migrations (each app owns its migrations); it
  matters for `openapi.json` and `schema.d.ts`, which the orchestrator regenerates after each merge.
- Deferred cross-wave links (added after Wave B, by request, never by a milestone writer):
  `Document.itinerary_entry` (M3↔M4 parallel), `LiftPass.document` and `GearPlan.rental_proposal` (M5 is
  Wave A), `Decision.outcome_proposal` (M2 is Wave A).

## 4. How a writer uses a contract

1. Read `AGENTS.md` in full, then your contract, then the contracts of the milestones you consume
   (listed in your contract's "Ownership → reads").
2. Create your ODD feature document (orchestrator-owned path; the orchestrator creates it from the
   contract's "Tests" and "Ownership" sections) and confirm the TDD runner.
3. Work only inside "Ownership". If you need anything in "Must not touch", stop and put it in your report
   as a request with the exact proposed change.
4. Implement in the order of the contract's test list; each first test is RED before its code.
5. Copy from the contract exactly: paths, field names, choices, status codes, error codes, query keys,
   dedupe keys, handler orders. If a value is marked **[default]** in "Open questions / assumptions", use
   it and say so in your report.
6. Before handing back: regenerate OpenAPI + TS types, run api `pytest`, `ruff check`, `lint-imports`,
   `makemigrations --check`; web `lint`, `typecheck`, `test`, `build`, `api:types:check`; and the e2e spec
   your contract names.
7. Report: files, commits, RED/GREEN evidence, deviations, and requests for the orchestrator.

## 5. Handler orders and command names (global view)

| Order | Handler | Owner |
|---|---|---|
| 10 | `commands` (`/viaje`, `/v`) + registered subcommands | core |
| 20 | `proposals.bot.quoted_card` (reply to a bot card) | M1 |
| 30 | `proposals.bot.link_capture` (message contains a URL) | M1 |
| 100 | fallback | core |

| Subcommand | Owner | Purpose |
|---|---|---|
| `ping`, `ayuda` | core | health, help |
| `propuestas` | M1 | top open proposals |
| `fechas` | M2 | best dates + who has not answered |
| `tareas`, `listo <n>` | M3 | open tasks, mark one done |
| `hoy` | M4 | today's plan |
| `nieve [resort base nuevos]` | M5 | snow conditions / manual report |

## 6. Reminder rules and tick jobs (global view)

| Key | Owner | Kind | Dedupe key |
|---|---|---|---|
| `proposals.majority` | M1 | rule | `proposals:majority:<proposal_id>` |
| `decisions.missing_votes` | M2 | rule | `decisions:missing:<decision_id>:<local_date>` |
| `logistics.task_nag` | M3 | rule | `logistics:nag:<trip_id>:<local_date>` |
| `itinerary.morning_digest` | M4 | rule | `itinerary:digest:<trip_id>:<local_date>` |
| `ski.snow_refresh` | M5 | tick job | — (per-resort fetch state) |
| `linkpreview.retry_pending` | M1 | tick job | — |
| `notifications.countdown` | M6 | rule | `notifications:countdown:<trip_id>:T-<n>` |
| `notifications.prune` | M6 | tick job | — |
| `ski.snow` | M5 | digest section | — |
| `push` | M6 | channel | `PushDelivery (dedupe_key, person)` |

---

## Addendum — final core API as implemented (2026-10-01, supersedes §2 where they differ)

Writers code against these facts; read `api/README.md` for examples.

- **Dedupe keys**: `ReminderDraft.dedupe_key` is persisted verbatim as `OutboundMessage.dedupe_key`
  (no tick prefix). Namespace your keys as the contracts show (`<app>:<rule>:<ids>`).
- **Mentions**: `{@person_id}` renders as `@<digits>` (E.164 without `+`); with `GOWA_MENTIONS_ENABLED=1`
  the JIDs are also passed to Gowa. Unknown ids render as an empty string.
- **Tick summary keys**: `reminders_queued`, `reminders_quiet`, `jobs_run`; failures are counted in
  `errors`. Counters returned by a tick job appear as `<job key>.<counter>`. Reminders queued in a pass are
  dispatched in the same pass.
- **Help text**: `/viaje ayuda` lists subcommands sorted by name (not registration order).
- **Subcommand handlers**: returning `None` leaves the message unclaimed so later handlers may run.
- **`trips.use_cases.update_trip(trip_id, actor_id, **fields) -> TripData`**: the caller authorizes
  (`actor_id` is recorded, not checked). Import as `from trips.use_cases.update_trip import update_trip`;
  likewise `from crews.use_cases.active_member_ids import active_member_ids` and
  `from trips.use_cases.default_trip_for_crew import default_trip_for_crew` (modules, not package re-exports).
  `fx_rates` accepts decimal strings or numbers and returns decimal strings.
- **`send_card`**: returns `SentCard("failed", None)` when the chat is over its 20-per-10-minutes budget
  (cards count against the reply budget but skip the 3 s gap). Statuses: `sent`, `failed`, `duplicate`.
- **Events**: `shared.events.publish` is synchronous and propagates subscriber exceptions (rollback);
  `shared.events_django.publish_after_commit` isolates subscribers and runs after commit. Tests use
  `events.isolated()`. `pytest-django`'s default `django_db` never fires `on_commit` callbacks: tests of
  `publish_after_commit` subscribers use `django_capture_on_commit_callbacks(execute=True)`.
- **Settings added by core**: `GOWA_MENTIONS_ENABLED` (default 0).

### Addendum 2 (after the registries verification)

- `fx_rates`: rates are quantized to 8 decimals and must have an exponent within [-9, 12]; at most 10 keys.
- The reminders phase respects the tick deadline (`reminders_deadline_skipped` in the summary); work left
  over runs in the next pass.
- Test helpers: `shared.events.isolated()`, `messaging.reminders.isolated()`, and the subcommand
  registry's `isolated()` context managers. Use them instead of touching private registries.
- Store-free core use cases for milestones: `trips.use_cases.list_active_trips()`,
  `trips.use_cases.trip_participants(trip_id)` (person_id, display_name with phone fallback, rsvp),
  `identity.use_cases.display_names(person_ids)`.
- `OutboundMessage.subject_id` is 255 characters (M3 may carry comma-separated task ids).
- `send_card` re-attempts a `failed` row with attempts left and returns the real status; `duplicate` is
  returned only for rows already `sent`/`queued`/`sending`.
- Unknown `/viaje` subcommands get the full help text (hint line first).
- `update_trip(..., actor_id=...)`: `actor_id` is accepted for future auditing and not persisted yet.
- A channel skipped because of the tick deadline is not retried in a later pass (its row is no longer
  new); keep channels fast.
