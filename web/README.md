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
| `pnpm test:e2e` | Playwright against `E2E_BASE_URL` (default `http://localhost:3000`); run `pnpm exec playwright install chromium` once |
| `pnpm api:types` | Regenerate `src/shared/api/schema.d.ts` from `../contracts/openapi.json` |
| `pnpm api:types:check` | Fail if the committed schema types drift from the contract |

When running the standalone server locally, `.next/static` and `public/` must sit next to it
(copy them into `.next/standalone/.next/static` and `.next/standalone/public`, as the Dockerfile does).

## Environment

See `.env.example`.

- `API_INTERNAL_URL` (default `http://localhost:8000`): where the Next.js server reaches the api.
  Used by the server-side client and by the dev rewrite of `/api/:path*`.
- `E2E_BASE_URL` (default `http://localhost:3000`): target of the Playwright suite.

## Typed API client

`contracts/openapi.json` is exported by the api. `pnpm api:types` turns it into
`src/shared/api/schema.d.ts` (committed). `src/shared/api/client.ts` exposes
`createBrowserClient()` (same-origin) and `createServerClient(cookieHeader?)` (server components;
forwards the session cookie). Test handlers are typed with `openapi-msw` from the same `paths`.

## Layout

- `src/ui/{atoms,molecules,...}`: presentational, prop-driven, no fetching.
- `src/features/<capability>/{containers,components,hooks,api}`: fetch and wire.
- `src/shared/{api,i18n,lib}`: cross-cutting code.
