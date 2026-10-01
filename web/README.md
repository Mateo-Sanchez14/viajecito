# viajecito web

Next.js (App Router, TypeScript, Tailwind v4) front end. Single locale `es-AR` via
`next-intl` without routing; all user-facing copy lives in `messages/es-AR.json`.

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
