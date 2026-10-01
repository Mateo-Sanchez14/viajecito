# trips

The core trip capability owns trip lifecycle, dates, currencies and participation. Trip types register
modules through `trips.plugins`; other capabilities reach trip data through `trips.use_cases`.

## Cross-app snapshot

Import `get_trip_snapshot` from `trips.use_cases.get_trip_snapshot` and call it with the string trip id.
It returns the existing pure `TripData` record, or `None` when the trip does not exist. All lifecycle
statuses are included (`idea`, `planning`, `booked`, `ongoing`, `done`), unlike `list_active_trips`,
which is intentionally restricted to trips that can receive reminders.

`TripsConfig.ready()` already configures the default `TripStore` factory. The reader imports neither
Django nor HTTP and needs no caller-side adapter construction. This is a trusted internal read: callers
must authorize the trip before exposing data to a person. No endpoint or schema changes are introduced.

## Cross-app packing templates

Import `packing_templates` from `trips.use_cases.packing_templates` to read a trip type's registered
packing template keys as an immutable tuple, preserving their order. The reader is pure and requires
no Django or adapter imports. `generic` returns an empty tuple; `ski` returns `("ski", "border")`.
Consumers apply their generic template plus these plugin-specific templates. Unknown trip types raise
`KeyError`, matching `trips.plugins.get`; the reader does not silently select another plugin.
