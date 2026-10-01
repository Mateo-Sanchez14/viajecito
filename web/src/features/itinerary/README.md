# Itinerary planner

Member-scoped client planner with virtual days, unscheduled tray, preserved out-of-range entries,
local time forms, day title/notes editing and up/down ordering. Moves are optimistic within the server's
ordering class and roll back on errors. All mutations invalidate itinerary (including notes) and Today.
The feature routes call `requireMe()` before rendering. Response error messages are never displayed.

## Parallel API draft

`api/draft.openapi.json` is derived from the M4 contract. Its generated `draft.schema.d.ts` provides
request/response types through `paths`; `api/itinerary.ts` uses same-origin cookies and the shared
CSRF middleware. At integration replace the local generated-path import with `@/shared/api/schema`,
replace the draft client factory with the shared `createBrowserClient`, then delete `generate-draft.py`,
`draft.openapi.json` and `draft.schema.d.ts`. Regenerate shared types from the real API first.

## Checks

`pnpm test src/features/itinerary src/features/today`; `pnpm typecheck`; `pnpm lint`; `pnpm build`.
The draft generator is deterministic: run `python3 src/features/itinerary/api/generate-draft.py`, then
`pnpm exec openapi-typescript src/features/itinerary/api/draft.openapi.json -o src/features/itinerary/api/draft.schema.d.ts`.
