# Session handoff — viajecito (written 2026-10-01, from the Claude Code orchestrator)

Read this first, then `AGENTS.md`, then the ODD feature documents in `odd/tasks/`. The plan of record is
`docs/plan-of-record.md`. Persistent memory (Engram) has everything under project `viajecito`
(`mem_search viajecito`, topics `odd/<feature>/tasks`, `product/decisions`).

## 1. Where the code is

- `origin/main` = `29b7615`: M0 (foundation), M-core, **M2** (decisions/dates), **M5** (ski), **M6**
  (notifications + PWA/push, map still pending) and the **WAHA provider** feature from a second session
  (see `odd/tasks/viajecito-waha-provider.md`; production WhatsApp goes through the WAHA container on the
  Pi, Gowa stays for dev/e2e). Checks on that sha: api `uv run pytest` 1195 passed, `lint-imports` 8 kept,
  web `pnpm test` 450 passed, `make bot-smoke` passed. The `e2e` CI workflow is red on that sha for a
  known reason (three specs logged in with the same phone in parallel).
- Local `main` ahead of origin (pushed together with this handoff): `34fae7d` wave B docs, `4f840dc`
  **E1** e2e fix (Playwright `setup` project with shared `storageState`, second e2e member seeded) — NOT yet
  verified with `make e2e` locally; CI verifies it.
- **Unmerged, verified and corrected, ready to integrate** (pushed as backup): `feat/m1-api` (`1edbdf9`,
  13 commits; 1778 tests on the branch after merging main) and `feat/m1-web` (`8606f28`, 18 commits; 273
  web tests, built against the draft contract — regenerate types after merging the api).
- Worktrees under `~/Development/viajecito-worktrees/` (one per branch; `m0*`, `mcore*`, `m2-*`, `m5-*`,
  `m6-*`, `waha-*`, `docs-contracts` are merged and can be removed with `git worktree remove`).

## 2. Next steps, in order

1. **Integrate M1** (`odd/tasks/viajecito-m1-proposals.md`):
   - `git merge --no-ff feat/m1-api`; conflicts expected in `api/config/settings/apps.py` and
     `api/pyproject.toml` (lists and import-linter contracts → UNION of both sides) and
     `contracts/openapi.json` (→ regenerate, never hand-merge):
     `cd api && uv sync --frozen && uv run python manage.py export_openapi_schema --api config.api.api --output ../contracts/openapi.json --indent 2`
     then `uv run pytest`, `uv run lint-imports`, `uv run ruff check .`, `makemigrations --check --dry-run`.
     Only commit the merge after those pass (a broken merge commit happened once; see §4).
   - `git merge --no-ff feat/m1-web`; conflicts expected in `web/messages/es-AR/index.ts` (regenerate it from
     the directory listing: one import + one argument line per `*.json`, alphabetical),
     `web/src/features/trips/cards/index.ts` (union of lines) and `web/src/shared/api/schema.d.ts`
     (→ `cd web && pnpm api:types`). Then `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm api:types:check`,
     `pnpm build`.
   - Enable `ski` in the create-trip form (`web/src/features/trips/containers/CreateTripForm.tsx`
     `TRIP_TYPES`) now that M5 registered the type; keep its test.
   - **Env parsing**: milestones read settings with `getattr(settings, NAME, default)`; parse them from env in
     `api/config/settings/base.py` (prod: require the VAPID keys only if push is wanted) and add them to
     `.env.example`, `api/.env.example`, `deploy/env/api.env.example`: `DECISIONS_NUDGE_WINDOW_HOURS`,
     `DECISIONS_NUDGE_AFTER_DAYS`, `SKI_TICK_BUDGET_SECONDS`, `SKI_MANUAL_REPORTS_PER_HOUR`,
     `NOTIFICATIONS_VAPID_PUBLIC_KEY`, `NOTIFICATIONS_VAPID_PRIVATE_KEY`, `NOTIFICATIONS_VAPID_SUBJECT`,
     `NOTIFICATIONS_PUSH_ENDPOINT_HOSTS`, `NOTIFICATIONS_PUSH_BUDGET_SECONDS`, and from M1
     `LINKPREVIEW_FETCHER` (`static` in dev/e2e), `LINKPREVIEW_FETCH_SYNC`, `LINKPREVIEW_MAX_BYTES`,
     `PROPOSALS_LLM_CLASSIFIER_ENABLED`, `PROPOSALS_LLM_BASE_URL`, `PROPOSALS_LLM_API_KEY`,
     `PROPOSALS_LLM_MODEL`. Move the M1 test settings (`LINKPREVIEW_FETCHER=fake`,
     `LINKPREVIEW_FETCH_SYNC=1`) into `config/settings/test.py`. `GOWA_MENTIONS_ENABLED` is already done.
   - Consolidate `PersonRefOut` (defined in `proposals`, `decisions`, `ski` with the same shape) into one
     shared schema: django-ninja keeps the LAST registered component silently, so drift would be invisible.
   - `make e2e` and `make bot-smoke` (docker required), then push `main`.
2. **Wave B** (`odd/tasks/viajecito-m3-logistics.md`, `viajecito-m4-itinerary.md`) and the **M6 map task**
   (`docs/contracts/m6-pwa.md`, `features/map`, Leaflet, reads M1's proposals): create worktrees from main
   (`git worktree add -b feat/m3-api ~/Development/viajecito-worktrees/m3-api main`, same for `m3-web`,
   `m4-api`, `m4-web`, `m6-map`), launch one writer per side with the contract as the spec, then one
   independent verifier per writer, one correction round, orchestrator spot check, merge api then web,
   regenerate contract/types, env parsing, smoke, push. Writers must derive web request types from `paths`
   (never from guessed schema names) and the api must type enum fields on `*Out` schemas with `Literal`.
3. **T11 Pi go-live** with the WAHA provider: the runbook is `deploy/README.md` plus the WAHA section in
   `AGENTS.md`; owner inputs (tunnel/hostname, `api.env` + `pi.env` on the Pi, VAPID keys via
   `manage.py generate_vapid_keys`, `bootstrap_crew` with the real chat id). The droplet/gastito changes are
   no longer needed for production (WAHA has its own number); fake Gowa remains the dev transport.
4. Post-MVP backlog in `docs/plan-of-record.md` (memories/albums, AI concierge, reactions as votes).

## 3. How work was done (keep it)

- One writer per bounded task in its own worktree; strict TDD with RED/GREEN evidence in the report; one
  independent verifier (read-only, reproduces every check, reviews against the contract); one correction
  round sent back to the SAME writer; orchestrator spot check (re-run one reported command); merge; smoke.
  In Codex, map "writer = default model / verifier = high reasoning" to whatever profiles exist.
- Contracts are the spec: `docs/contracts/*.md` + the README addenda (they supersede §2). Append-only
  shared files and their resolution recipes are in `AGENTS.md` → "Rules for parallel milestone work".
- Delivery: merge to `main` and push directly (user decision); public repo `Mateo-Sanchez14/viajecito`;
  GHCR images build on `main` (`images.yml`, owner lowercased).
- A second session may still be active in this checkout (WAHA). Protocol: never commit when `git status`
  shows `UU` files; merges `--no-ff` only on a clean main; generated files by regeneration; env examples
  append-only; whoever pushes announces the sha.

## 4. Gotchas learned the hard way

- Never commit a merge before `uv run pytest` + the OpenAPI export pass: one merge commit landed with a
  duplicate `[tool.importlinter]` table and conflict markers inside `contracts/openapi.json` and had to be
  amended.
- `sd` multi-line replacements silently no-op; use a small Python script for structured edits.
- `eza` hangs without a TTY here; use `fd`.
- Writers working in parallel against a draft contract produce type mismatches at integration; the fix is
  structural (types from `paths`, `Literal` on `*Out`), not per-file patches.
- `pytest-django`'s default `django_db` never fires `on_commit` callbacks; use
  `django_capture_on_commit_callbacks(execute=True)` for `publish_after_commit` subscribers.
- The core `tick` summary test must stay inside `reminders.isolated()` (every milestone registers jobs).
- Display names fall back to the member's E.164 phone inside crew-scoped responses by design; bot replies
  and push payloads must never include phones (use "alguien"); snow reports from other crews are redacted.
