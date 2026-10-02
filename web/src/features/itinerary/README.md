# Itinerary planner

Member-scoped client planner with virtual days, unscheduled tray, preserved out-of-range entries,
local time forms, day title/notes editing and up/down ordering. Moves are optimistic within the server's
ordering class and roll back on errors. All mutations invalidate itinerary (including notes) and Today.
The feature routes call `requireMe()` before rendering. Response error messages are never displayed.

## API integration

Request and response types come from the real exported `@/shared/api/schema` paths. All itinerary,
notes and Today requests use the shared `createBrowserClient`, including same-origin cookies and CSRF
middleware. The contract-local draft and generator were removed after integrating the verified API.
Defaulted request fields are supplied explicitly in typed forms and fixtures.

The app layout owns the main landmark and the trip shell owns the primary heading. The planner and
Today render feature headings at level two; integrated landmark regressions protect this composition.

## Checks

`pnpm test src/features/itinerary src/features/today`; `pnpm typecheck`; `pnpm lint`; `pnpm build`;
`pnpm api:types:check`. Regenerate shared types with `pnpm api:types` after exporting the actual API.
