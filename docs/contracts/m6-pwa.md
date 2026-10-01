# M6 — PWA, Web Push, proposals map, polish

Wave **A** (the proposals **map** task starts after M1 is merged). Branch `feat/m6-pwa`. Depends on core +
R-2 (`register_channel`, `register_reminder_rule`), R-5 (cards). Reads M1's proposals endpoint and, for the
offline cache, M4's Today and M3's documents endpoints (URL patterns only; those milestones land later and
the cache rules are written against their contracts).

## Scope & demo

Make viajecito installable and resilient on the trip: web app manifest, a Serwist service worker, an
install prompt (with the iOS "Add to Home Screen" path, since iOS Web Push works only for installed PWAs),
a trip countdown, an offline cache of **Today** and the **documents list** (risk R6: Pi/ISP down on trip
day). Web Push with VAPID (`pywebpush`): subscription endpoints, a `push` reminder channel that mirrors
group reminders to the people they concern, and countdown reminders (T-30/T-7/T-1). A proposals map
(Leaflet + OpenStreetMap) from M1's `lat/lng`. Polish: Cloudflare Access in front of `/admin`, an
accessibility pass, and a backup restore drill (checklists; deploy owns the scripts). **Demo: install on a
phone, receive a push, open Today with no signal.**

## Ownership

**Owns**
- api app `api/notifications/` (models, migrations, domain incl. payload builder, use_cases, ports,
  adapters incl. `adapters/webpush_sender.py`, api, schemas, copy, tests, management).
- channel `push` (`register_channel("push", …)`) and reminder rule `notifications.countdown`, both in
  `NotificationsConfig.ready()`; copy `api/notifications/copy/es_ar.py`.
- management command `notifications/management/commands/generate_vapid_keys.py` (prints a VAPID key pair).
- web:
  - `web/src/features/pwa/**` (install prompt, countdown, offline banner, SW registration helpers),
    `web/src/features/push/**` (permission + subscription flow, preferences),
    `web/src/features/map/**` (Leaflet map).
  - Service worker and manifest: `web/src/app/sw.ts`, `web/src/app/manifest.ts`, `web/public/icons/**`
    (192, 512, maskable 512, apple-touch 180), `web/src/app/~offline/page.tsx` (offline fallback).
  - Routes: `web/src/app/(app)/me/notifications/page.tsx`; map route
    `web/src/app/(app)/crews/[crewId]/trips/[tripId]/map/page.tsx` (not a nav module; reached from the
    proposals overview card link "Ver en el mapa" — M6 adds its own `MapOverviewCard`, `module: "proposals"`,
    `order: 11`).
  - `web/messages/es-AR/pwa.json`, `push.json`, `map.json`.
  - **Single exception to the shared-file rule** (orchestrator approval required; nobody else in Wave A
    touches them): `web/next.config.ts` (wrap with Serwist) and `web/package.json` + lockfile (add
    `@serwist/next` or the current Serwist package, `serwist`, `leaflet`, `react-leaflet`, `@types/leaflet`).
- docs: `docs/runbooks/restore-drill.md`, `docs/runbooks/cloudflare-access-admin.md`,
  `docs/runbooks/a11y-checklist.md` (M6 owns `docs/runbooks/**`).
- tests: `api/notifications/tests/**`, `web/src/features/{pwa,push,map}/test/**`, `web/e2e/pwa.spec.ts`,
  `web/e2e/offline-today.spec.ts`.
- One-line appends: `config/settings/apps.py`, `pyproject.toml` root_packages, `web/messages/es-AR/index.ts`
  (three files), `web/src/features/trips/cards/index.ts` (countdown, install, map cards).

**Reads**: `trips` use cases (trip, participants), `crews`, `identity`, `messaging.reminders`,
`shared/api_auth`, `shared/clock`; web: `GET /api/trips/{trip_id}/proposals` (M1, read-only),
`TripProvider`, `MeProvider`.

**Must not touch**: `features/proposals` (import nothing from it; use M1's exported MSW factories only in
tests), `features/today`, `features/documents`, `features/auth` (logout cache purge is done in the SW, see
below), `src/app/layout.tsx` and `src/app/(app)/layout.tsx` (the manifest is linked through
`app/manifest.ts`; the SW is registered from `features/pwa` mounted by a card — if a root-level mount turns
out to be required, request it), existing `src/ui/**`, `deploy/**` (Cloudflare Access is a dashboard action;
the restore script belongs to deploy), any core or other milestone app, `AGENTS.md`, `odd/**`.

## Models

`id` UUID pk, `created_at`, `updated_at` on every model.

### `notifications.PushSubscription`

| Field | Type | Null | Default | Notes |
|---|---|---|---|---|
| `person` | FK `AUTH_USER_MODEL` CASCADE | no | — | |
| `endpoint` | URLField(1000) | no | — | **unique**; https and allow-listed host (Security) |
| `p256dh` | CharField(200) | no | — | base64url |
| `auth` | CharField(64) | no | — | base64url |
| `user_agent` | CharField(300) | no | `""` | |
| `last_ok_at` | DateTime | yes | null | |
| `last_error_at` | DateTime | yes | null | |
| `failure_count` | PositiveSmallInt | no | 0 | pruned at 5 consecutive non-410 failures |

Index `person`.

### `notifications.NotificationPreference`

| Field | Type | Null | Default | Choices |
|---|---|---|---|---|
| `person` | FK `AUTH_USER_MODEL` CASCADE | no | — | |
| `channel` | CharField(8) | no | `push` | `push` |
| `category` | CharField(16) | no | `all` | `all \| reminders \| digest \| countdown \| proposals` |
| `enabled` | Bool | no | True | |

Unique `(person, channel, category)`. Missing row = enabled.

### `notifications.PushDelivery` (dedupe ledger)

| Field | Type | Null | Notes |
|---|---|---|---|
| `dedupe_key` | CharField(200) | no | the reminder draft's key |
| `person` | FK `AUTH_USER_MODEL` CASCADE | no | |
| `status` | CharField(8) | no | `sent \| failed \| skipped` |
| `subscriptions_ok` | PositiveSmallInt | no | |

Unique `(dedupe_key, person)`. Rows older than 30 days are deleted by tick job `notifications.prune`
(at most once per day, ≤ 1000 rows per run).

### Computed
- **Push payload** (pure `notifications/domain/payload.py::build_payload(draft, person) -> dict`):
  `{"title": draft.title or TITLE_DEFAULT, "body": plain-text body (mention tokens rendered as display
  names, ≤ 240 chars, ellipsis), "url": draft.url_path (must start with "/" and not "//", else "/"),
  "tag": draft.dedupe_key[:64], "ts": epoch seconds}`; serialized JSON ≤ 3000 bytes.
- **Category** of a draft from its `dedupe_key` prefix: `itinerary:digest:` → `digest`,
  `notifications:countdown:` → `countdown`, `proposals:` → `proposals`, else `reminders`.

## API

`django_auth`, snake_case, `{code,message}`; these are person-scoped (no trip), so authorization is
"authenticated, and only my own rows". Router `notifications/api.py`, tag `notifications`.

| Method + path | Request | Success | Errors |
|---|---|---|---|
| `GET /api/notifications/vapid_public_key` | — | `200 {"public_key": "<base64url uncompressed P-256>"}` | `401`; `503 push_unavailable` (keys not configured) |
| `POST /api/notifications/subscriptions` | `{endpoint, keys: {p256dh, auth}, user_agent?}` | `201 SubscriptionOut {id, endpoint_host, created_at}` (new) or `200` (same endpoint already mine; keys refreshed). An endpoint registered to another person is **re-assigned** to me (same browser, new login) | `400 invalid_subscription` (not https, host not allow-listed, bad base64url, key lengths); `401`; `403 csrf_failed`; `429 rate_limited` (> 10 per person per hour) |
| `DELETE /api/notifications/subscriptions` | `{endpoint}` | `204` (idempotent; only my rows) | `401`; `403` |
| `GET /api/notifications/subscriptions` | — | `200 [SubscriptionOut]` (mine) | `401` |
| `GET /api/notifications/preferences` | — | `200 {"push": {<category>: bool}}` | `401` |
| `PUT /api/notifications/preferences` | `{"push": {<category>: bool}}` | `200` same shape | `400 invalid_request`; `401` |
| `POST /api/notifications/test` | — | `202 {"sent": int}` (to my subscriptions, `TEST_PUSH` copy) | `401`; `429 rate_limited` (1 per minute); `503 push_unavailable` |

### Settings (`notifications/conf.py`)
`NOTIFICATIONS_VAPID_PUBLIC_KEY`, `NOTIFICATIONS_VAPID_PRIVATE_KEY` (required in prod for push; when empty
push is disabled and endpoints answer `503 push_unavailable`), `NOTIFICATIONS_VAPID_SUBJECT`
(`mailto:` or `https://<host>`), `NOTIFICATIONS_PUSH_ENDPOINT_HOSTS` (default allowlist below).

## Bot

No inbound handlers or subcommands. M6 adds one reminder channel, one reminder rule and one tick job.

### Push channel (`register_channel("push", deliver)`)

For every **newly queued** group reminder (core R-2 step 2):
- Recipients = `draft.mention_person_ids` if any; otherwise all participants of `draft.trip_id` with
  `rsvp in|maybe` (digests, countdowns, majority suggestions are for everyone).
- Skip people with the category (or `all`) disabled → `PushDelivery(status=skipped)`.
- `get_or_create PushDelivery(dedupe_key, person)`; existing → do nothing (idempotent).
- Send to each subscription with `pywebpush.webpush(subscription_info, data=json, vapid_private_key,
  vapid_claims={"sub": NOTIFICATIONS_VAPID_SUBJECT}, ttl=43200, timeout=5, headers={"Urgency": "normal"})`
  — the writer confirms the current `pywebpush` signature with Context7.
- Response `404`/`410` → delete the subscription. Other failures → `failure_count += 1`, `last_error_at`;
  at 5 → delete. Success → `last_ok_at`, `failure_count = 0`.
- Total budget per draft: ≤ 20 sends, 5 s each; exceptions never propagate to the tick.
- Push is a **mirror**: group delivery (core) remains the primary channel; quiet hours already applied by core.

### Reminder rule `notifications.countdown`
Trips `planning | booked` with `start_on` set: when `(start_on − local_today)` ∈ `{30, 7, 1}` yield one
draft, `dedupe_key = "notifications:countdown:<trip_id>:T-<n>"`, `timezone = trip.timezone`,
`url_path = /crews/<crew>/trips/<trip>`, `title = COUNTDOWN_TITLE`, body `COUNTDOWN_BODY` (group + push).

### Tick job `notifications.prune`
Deletes `PushDelivery` rows older than 30 days, at most once per day, ≤ 1000 rows per run.

### Copy (`api/notifications/copy/es_ar.py`, suggested)
`TITLE_DEFAULT = "viajecito"`, `TEST_PUSH = "¡Funciona! Así te van a llegar los avisos 🎒"`,
`COUNTDOWN_TITLE = "Cuenta regresiva"`, `COUNTDOWN_BODY = {30: "Falta un mes para {trip} ✈️", 7: "Falta una
semana para {trip}. ¿Ya tenés todo?", 1: "¡Mañana arrancamos {trip}! 🎒"}`.

## Web

### PWA shell
- `app/manifest.ts` (Next metadata route): `name` "viajecito", `short_name` "viajecito", `start_url` "/",
  `scope` "/", `display` "standalone", `background_color`/`theme_color` from the design tokens, `lang`
  "es-AR", icons incl. `purpose: "maskable"`. Copy for `name`/`description` comes from
  `messages/es-AR/pwa.json` read at build time (no hardcoded Spanish).
- Service worker `app/sw.ts` with Serwist (writer confirms the current Serwist + Next.js integration with
  Context7 — Turbopack support may require a specific package or webpack for the SW build — and records the
  decision in the feature document):
  - precache the app shell and `~offline`;
  - **runtime caching**: `NetworkFirst` (3 s network timeout, cache `today-v1`, max 10 entries) for
    `GET /api/trips/*/today` and the page route `/crews/*/trips/*/today`; `NetworkFirst` (cache
    `documents-list-v1`, max 10) for `GET /api/trips/*/documents` (**list only**); `StaleWhileRevalidate`
    for static assets; `NetworkOnly` for every other `/api/**`, for `/api/documents/*/file`, `/hooks/**`,
    `/admin/**`;
  - never cache non-GET, non-200, or opaque responses; strip nothing (responses are already `private`);
  - **logout purge**: on a `POST /api/auth/logout` fetch that succeeds, delete `today-v1`,
    `documents-list-v1` and `documents-files-v1`; also on a `401` from `/api/me`;
  - `push` event → `showNotification(title, {body, tag, data: {url}, icon, badge})`;
    `notificationclick` → focus an existing client on `url` or `openWindow(url)` (same-origin paths only).
- Document files offline: **opt-in per document** ("Guardar sin conexión") stores the file response in
  `documents-files-v1` (M6 adds the button through `features/pwa` exported hook `useOfflineDocument(id,
  download_path)`; M3's `DocumentRow` does not change — the button lives in an M6 card
  `OfflineDocumentsCard` listing downloadable docs). Purged on logout.

### Containers / components
- `features/pwa/containers/InstallPrompt` (captures `beforeinstallprompt`; on iOS Safari shows the "Compartir
  → Agregar a inicio" steps; dismiss remembered in `localStorage` 30 days), `CountdownCard` (`tripCards`,
  no module, `order: 1`: "Faltan 23 días" from `trip.start_on` in trip tz; hidden when undated or past),
  `InstallCard` (`order: 2`, only when not installed), `OfflineBanner` (used on the `~offline` fallback
  page; Today's own offline indicator is M4's, built on `navigator.onLine` — no cross-feature import),
  `OfflineDocumentsCard` (`module: "documents"`, `order: 61`).
- `features/push/containers/PushSettings` (`/me/notifications`: enable push → `Notification.requestPermission()`
  → `pushManager.subscribe({userVisibleOnly: true, applicationServerKey})` → `POST` subscription; disable →
  `unsubscribe()` + `DELETE`; category toggles; "Mandarme una de prueba"), `PushOptInCard` (`order: 3`,
  shown once when installed and permission is `default`).
- `features/map/containers/ProposalsMap` (client-only `dynamic(() => import(…), {ssr: false})`; Leaflet
  with OSM tiles `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, attribution "© OpenStreetMap
  contributors"; markers for proposals with `preview.lat/lng`, coloured by category **and** labelled; popup
  with title, status, link to the proposal; a list fallback below the map for keyboard/screen-reader users
  and for proposals without coordinates), `MapOverviewCard`.
- Presentational: `CountdownBadge`, `InstallSteps`, `PermissionState`, `CategoryToggle`, `MapLegend`.

### Hooks + query keys
| Hook | Key | Interval |
|---|---|---|
| `useVapidKey()` | `["push", "vapid"]` | none |
| `usePushSubscriptions()` | `["push", "subscriptions"]` | none |
| `usePushPreferences()` | `["push", "preferences"]` | none |
| `useMapProposals(tripId)` | `["proposals", tripId, "list", {map: true}]` (calls M1's list endpoint with default filters) | 60 s |
| `useOnlineStatus()`, `useInstallState()`, `useOfflineDocument()` | local state | — |

### i18n (`pwa.*`, `push.*`, `map.*`)
pwa: `name` "viajecito", `description` "Planeá viajes con tu grupo", `install.title` "Instalá viajecito",
`install.body` "Tenelo a mano en el viaje, incluso sin señal", `install.cta` "Instalar",
`install.ios` "Tocá Compartir y después \"Agregar a inicio\"", `install.dismiss` "Ahora no",
`countdown.days` "Faltan {days} días", `countdown.tomorrow` "¡Mañana arrancamos!", `countdown.today`
"¡Hoy arranca el viaje!", `offline.banner` "Sin conexión: mostrando lo último que bajamos",
`offline.page.title` "Estás sin conexión", `offline.page.body` "Abrí Hoy o tus documentos guardados",
`offlineDocs.save` "Guardar sin conexión", `offlineDocs.saved` "Disponible sin conexión".
push: `title` "Notificaciones", `enable` "Activar notificaciones", `disable` "Desactivar",
`denied` "Bloqueaste las notificaciones en el navegador; activalas desde los ajustes",
`iosNeedsInstall` "En iPhone primero instalá la app", `test` "Mandarme una de prueba",
`categories.reminders` "Recordatorios de tareas", `categories.digest` "Resumen de cada mañana",
`categories.countdown` "Cuenta regresiva", `categories.proposals` "Propuestas", `errors.push_unavailable`
"Las notificaciones no están disponibles por ahora", `errors.invalid_subscription` "No pudimos activar las
notificaciones en este navegador".
map: `title` "Mapa", `noCoordinates` "{n} propuestas sin ubicación", `listFallback` "Lista de lugares",
`openProposal` "Ver propuesta", `attribution` "© OpenStreetMap contributors".

### Accessibility pass (`docs/runbooks/a11y-checklist.md`, executed across all pages at the end of M6)
Keyboard-only walk of every route; visible focus; contrast ≥ 4.5:1; touch targets ≥ 44 px; landmarks and
one `h1` per page; form errors linked with `aria-describedby`; live regions for async results; no
colour-only states; `prefers-reduced-motion` honoured; Lighthouse accessibility ≥ 95 on Today, proposals and
dates; axe (`@axe-core/playwright`) run in `pwa.spec.ts` on the main routes with zero serious violations.
Findings in other milestones' files are **reported** as follow-ups, not fixed by M6.

## Tests

### api
- `notifications/tests/test_payload_builder.py` (first) — **push payload builder**: title fallback,
  mention tokens → names, 240-char truncation, unsafe `url_path` (`//evil`, `https://…`) → `/`, JSON size
  ≤ 3000, category from dedupe prefix.
- `notifications/tests/test_subscriptions_api.py` — **subscription registration authenticated** (401
  anonymous, 403 without CSRF), endpoint allowlist and https, re-assignment to the current person, delete
  only mine, rate limit.
- `notifications/tests/test_push_channel.py` — fake sender port: recipients (mentions vs trip participants),
  preferences skip, `PushDelivery` dedupe, **410 prunes subscription**, 404 prunes, 5 failures prune,
  exceptions contained.
- `notifications/tests/test_webpush_adapter.py` — `pywebpush` call shape with `respx`/monkeypatch (no
  network): VAPID claims, TTL, timeout.
- `notifications/tests/test_countdown_rule.py` — T-30/T-7/T-1 in trip tz across midnight; dedupe keys;
  undated/started trips yield nothing.

### web
- `features/pwa/containers/CountdownCard.test.tsx` — days in trip tz, tomorrow/today copy, hidden states.
- `features/pwa/containers/InstallPrompt.test.tsx` — `beforeinstallprompt` flow, iOS steps, dismissal.
- `features/push/containers/PushSettings.test.tsx` — permission states, subscribe → POST body, unsubscribe →
  DELETE (mocked `PushManager`, MSW).
- `features/map/containers/ProposalsMap.test.tsx` — markers only for proposals with coordinates, list
  fallback, "sin ubicación" count (Leaflet mocked; data from M1's `makeProposal()` factory).
- `src/app/sw.test.ts` (or `features/pwa/sw/routes.test.ts` if the route table is extracted) — the route
  table matches Today/documents-list and excludes `/api/documents/*/file`, non-GET, `/admin`.
- e2e `web/e2e/offline-today.spec.ts` — **Playwright offline Today**: production build, open Today online,
  `context.setOffline(true)`, reload → cached Today with the offline banner; documents list cached; file
  download not cached unless saved.
- e2e `web/e2e/pwa.spec.ts` — manifest served and valid, SW registered, axe checks on main routes.
- **Lighthouse PWA audit**: `pnpm dlx @lhci/cli` (or `lighthouse` CLI) against the production build in CI
  job `web-lighthouse` (platform adds the job by request); assertions: installable, SW controls start URL,
  accessibility ≥ 95. Record the run in the feature document.

## Security / robustness

- **Push subscription auth**: all endpoints require the session + CSRF; a person can only list/delete their
  own subscriptions; re-assignment on register is by exact endpoint only.
- **Endpoint SSRF guard**: `endpoint` must be `https://`, no userinfo, default port, and its host must match
  the allowlist `fcm.googleapis.com`, `updates.push.services.mozilla.com`, `*.push.apple.com`,
  `*.notify.windows.com`, `push.services.mozilla.com` (configurable). The sender never follows redirects.
- **VAPID**: private key only in env (`NOTIFICATIONS_VAPID_PRIVATE_KEY`), never logged or exposed; public key
  served by its own endpoint; `generate_vapid_keys` prints both once. Rotating keys invalidates existing
  subscriptions — documented.
- Payloads contain no secrets, no document names, no phone numbers; ≤ 3 KB; encrypted by Web Push.
- `notificationclick` opens same-origin paths only.
- Offline caches hold only GET JSON for Today and the documents **list**; files only on explicit opt-in;
  all purged on logout and on a `401` from `/api/me`. Shared-device risk documented in the PWA settings page.
- OSM tiles: respect the tile usage policy (no prefetch/bulk download, attribution shown, default
  user-agent from the browser); if usage grows, switch to a hosted tile provider.
- **Cloudflare Access on `/admin`** (`docs/runbooks/cloudflare-access-admin.md`): Zero Trust → Access →
  Application for `https://<host>/admin*`, policy "emails in {owner list}" with one-time PIN or GitHub
  IdP; session 24 h; verify `/api/*`, `/hooks/*` and the web are **not** covered; test with a private
  window. Owner action in the Cloudflare dashboard, no repo change.
- **Restore drill** (`docs/runbooks/restore-drill.md`, checklist only; scripts are deploy-owned): pick a
  `restic snapshots` entry → stop the stack → `restore.sh <snapshot>` into a scratch dir → verify
  `PRAGMA integrity_check` = ok, row counts for trips/proposals/documents, a sample encrypted document
  decrypts with the current `DOCUMENTS_FERNET_KEYS` → start the stack → `smoke.sh` → record date, snapshot
  id, duration and issues; repeat every 3 months.

## Open questions / assumptions

- **[default]** Push mirrors group reminders (never replaces them); no push-only reminders in the MVP.
- **[default]** Countdown messages go to the group and push (T-30/T-7/T-1 from the plan's flow 4).
- **[default]** M6 edits `web/next.config.ts` and `web/package.json` (Serwist, Leaflet) as the only Wave A
  writer of those files — needs orchestrator approval; if denied, M6 delivers the config diff as a request.
- **[default]** The map is a separate route, not a nav module; it gets a card on the overview.
- **[default]** iOS: push only after installation (R7); the settings page explains it.
- Open: whether the SW should also cache the trip overview and proposals list for offline reading. Default
  **no** (keep the cache small and the security story simple).
