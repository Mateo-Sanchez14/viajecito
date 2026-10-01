# Itinerary

Member-scoped days, ordered entries, notes and the timezone-aware Today snapshot.
Days are persisted lazily; trip dates produce virtual days without inserting rows.
An entry whose day becomes out of range remains in the itinerary's separate list.

Local input times are composed in the trip timezone and stored in UTC. Nonexistent
spring-forward times return `invalid_times`; ambiguous fall-back times use the first
occurrence (`fold=0`). Moving an entry into the tray clears both times.

Every bucket write renumbers positions. Timed entries sort chronologically before
untimed entries; moves cannot cross a time boundary. Notes allow five pinned rows
per trip. Any active member can edit a note; deletion belongs to the author while
they remain active, otherwise to any active member.

Run `uv run pytest itinerary`, `uv run ruff check itinerary`, and
`uv run python manage.py makemigrations --check` from `api`.

## Proposal integration

The synchronous `proposal.status_changed` subscriber copies chosen/booked proposals
once, keyed by proposal id. A valid proposal start date selects its day; otherwise
it remains in the tray. Reopening/discarding only removes an untouched proposal
entry in the tray. Scheduled or manually sourced entries remain.

`PreviewSummary` does not expose a location label. The copy uses `site_name`, then
preview `title`, otherwise empty, preserving coordinates. Proposal titles and
location labels are bounded to the itinerary's 200-character fields. Later edits
to the proposal do not update this copy.

## Today and delivery

Today returns a weak SHA256 ETag of canonical sorted JSON (UTF-8, compact
separators) excluding only `generated_at`. Membership is checked before any 304.
Minute precision in `local_time` keeps unchanged 20-second polls conditional.

`/viaje hoy` uses the crew's default trip. The morning rule yields read-only drafts
for active trips during the trip and the day before its start. It does not queue
or deliver itself: core tick enforces quiet hours and persists the globally unique
key `itinerary:digest:<trip_id>:<local_date>` verbatim. Registered digest sections
supply snow/other contributions without parallel-app imports. Replies and drafts
are limited to 4000 characters and retain the Today link; no person-phone fallback
is used. No new environment settings are introduced.
