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
