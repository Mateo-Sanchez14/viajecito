# viajecito web

Next.js (App Router, TypeScript, Tailwind v4) front end. Single locale `es-AR` via
`next-intl` without routing; all user-facing copy lives in `messages/es-AR/*.json` (one file per feature).

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Dev server on `0.0.0.0:3000` (proxies `/api/*` to `API_INTERNAL_URL`) |
| `pnpm build` / `pnpm start` | Production build (`output: "standalone"`); `start` runs `node .next/standalone/server.js` |
| `pnpm lint` / `pnpm typecheck` | ESLint / `tsc --noEmit` |
| `pnpm test` / `pnpm test:watch` | Vitest + Testing Library + MSW (no network) |
| `pnpm test:e2e` | Playwright against `E2E_BASE_URL` (default `http://localhost:3000`); run `pnpm exec playwright install chromium` once. `e2e/login.spec.ts` needs the dev stack with fake Gowa |
| `pnpm api:types` | Regenerate `src/shared/api/schema.d.ts` from `../contracts/openapi.json` |
| `pnpm api:types:check` | Fail if the committed schema types drift from the contract |

When running the standalone server locally, `.next/static` and `public/` must sit next to it
(copy them into `.next/standalone/.next/static` and `.next/standalone/public`, as the Dockerfile does).

## Environment

See `.env.example`.

- `API_INTERNAL_URL` (default `http://localhost:8000`): where the Next.js server reaches the api.
  Used by the server-side client and by the dev rewrite of `/api/:path*`.
- `E2E_BASE_URL` (default `http://localhost:3000`): target of the Playwright suite.
- `E2E_PHONE` (default `+54 9 11 5555 1234`): phone the login e2e signs in with; it must be an
  eligible phone on the stack under test (e.g. the `bootstrap_crew` admin).
- `FAKE_GOWA_URL` (default `http://localhost:4000`): where the login e2e reads the sent code
  (`GET /__sent/latest?phone=<digits>`).

## Auth flow

- `/login` (`src/app/(public)/`): phone step, then the 6-digit code step (resend is disabled for
  `retry_after_seconds`), then `router.replace(next ?? "/")`. `next` is honored only if it is a
  same-origin relative path (`features/auth/lib/safeNext.ts`).
- `src/app/(app)/layout.tsx` calls `requireMe()` (`features/auth/server/requireMe.ts`): `GET /api/me`
  with the request cookies; on `401` it redirects to `/login?next=<path>`. The path comes from
  `src/proxy.ts`, which sets the `x-next-path` request header. `me` is shared with client
  components through `MeProvider` / `useMe()`.
- The browser client (`src/shared/api/client.ts`) sends `X-CSRFToken` on unsafe methods; the token is
  fetched once from `GET /api/auth/csrf`, cached in memory and dropped after login/logout (the api
  rotates it).
- api errors become `ApiError` with the `{"code"}` of the body; `errorCodeToMessageKey` maps it to
  `auth.errors.*` (fallback `unknown`).

## Typed API client

`contracts/openapi.json` is exported by the api. `pnpm api:types` turns it into
`src/shared/api/schema.d.ts` (committed). `src/shared/api/client.ts` exposes
`createBrowserClient()` (same-origin) and `createServerClient(cookieHeader?)` (server components;
forwards the session cookie). Test handlers are typed with `openapi-msw` from the same `paths`.

## Layout

- `src/ui/{atoms,molecules,...}`: presentational, prop-driven, no fetching.
- `src/features/<capability>/{containers,components,hooks,api}`: fetch and wire.
- `src/shared/{api,i18n,lib}`: cross-cutting code.

## i18n split

Copy lives in `messages/es-AR/<feature>.json` (`common`, `auth`, `errors`, `home`, `ops`, `trips`, ...).
Each file has one top-level namespace named after the feature. `messages/es-AR/index.ts` imports every
file (one line each, alphabetical) and deep-merges them with `messages/merge.ts`; `src/shared/i18n/config.ts`,
`src/test/render.tsx` and the tests import that index, never a single file. Components never hardcode
Spanish and tests read their expectations from the messages.

## Trips and the trip shell

- `/` (`src/app/(app)/page.tsx`): per crew from `MeProvider`, `TripList` plus a collapsible `CreateTripForm`.
- `/crews/[crewId]/trips/[tripId]/layout.tsx` (server): `requireMe()`, then `getTripServer()`
  (`GET /api/trips/{id}` with the session cookie). A 404, a non-member or a crew that does not match the URL
  is `notFound()`. It renders `TripProvider` (client context: `trip`, `modules`, `participants`, `myRsvp`,
  `refetch`; the trip lives in the query cache under `["trips", id]`) and `TripShellContainer`, which feeds
  the presentational `ui/organisms/TripShell` (`PageHeader` + `SectionNav`).
- The section nav is data-driven: an "overview" entry plus one entry per `trip.modules` item, linking to
  `/crews/{crewId}/trips/{tripId}/{module}`. Labels come from `trips.sections.<module>` (a module without
  copy shows its key). The current section (and its sub-pages) is highlighted via `usePathname`.
- `[tripId]/page.tsx` is the overview (dates, destination, participants with RSVP badges, `RsvpControl`,
  module cards). `[tripId]/[module]/page.tsx` is the "coming soon" fallback for modules without a page.
- Shared UI for trip pages: atoms `Card`, `Avatar`, `Select`, `Textarea`, `Skeleton`; molecules `PageHeader`,
  `EmptyState`, `SectionNav`, `ConfirmDialog` (native `<dialog>`).

### Adding a milestone section

1. Add `messages/es-AR/<feature>.json` with a `<feature>` namespace and append one import line plus the
   argument to `messages/es-AR/index.ts`. Section labels (`trips.sections.<module>`) are core-owned and
   already exist for every known module (`proposals`, `dates`, `logistics`, `itinerary`, `today`,
   `budget`, `documents`, `ski`); a module without copy shows its key.
2. Create `src/features/<capability>/{api,hooks,containers}` and read the current trip with
   `useTripContext()` (from `@/features/trips/TripProvider`); never refetch it yourself.
3. Add the static page `src/app/(app)/crews/[crewId]/trips/[tripId]/<module>/page.tsx`; a static segment
   wins over `[module]`, so the placeholder disappears by itself. Use `params: Promise<...>` for any
   nested dynamic segment.
4. The nav entry already exists once the api lists the module in `trip.modules`.

### Trip types

Trip types come from the api's plugin registry (`trips/plugins.py`). Core registers only `generic`, so
`CreateTripForm` offers only that (the `<Select>` stays so a milestone can extend `TRIP_TYPES` and add
`trips.types.<key>` copy once its api registers the type). A `/api/trip-types` endpoint that lets the web
read the registry instead of hardcoding it is a future core request.
