# Session handoff — viajecito (written 2026-10-01, from the Claude Code orchestrator)

Read this first, then `AGENTS.md`, then the ODD feature documents in `odd/tasks/`. The plan of record is
`docs/plan-of-record.md`. Persistent memory (Engram) has everything under project `viajecito`
(`mem_search viajecito`, topics `odd/<feature>/tasks`, `product/decisions`).

## Current checkpoint — 2026-10-02

M1 is already delivered at ec96636; do not remerge it. M3/M4 API then web, the M6 map and premium UI are integrated, independently reviewed and corrected and pushed to origin/main at d66c8534dc3629aaf7bbf1bab69d7c9f2b995633. Final source is f863d22; concurrent runtime fix5b1bc71 is preserved. Authoritative progress is in the four feature task documents below; older sections are historical, not the next instruction.

### Delivery verification checkpoint — 2026-10-02
- Final source: `f863d22`; final permission fix `b969336` independently approved and merged only after export + 2,010 API tests passed. Frozen dependencies, Ruff/587 formatted files, 14 import contracts and migration drift passed. Regenerated contract/types unchanged; 665 web tests, typecheck, lint, drift and production build passed.
- Native isolated final runtime: full Playwright 10 passed / 2 production-only skips; those two passed separately against the production build. Actual cached ticket remains listed offline; its unsaved file is unavailable. Fresh isolated bot database passed exact pong/reply, duplicate replay and tick with zero errors. Six mobile views had unique landmarks and no overflow. Actual upload and packing quantity edits persisted after reload.
- Final C5 proof on f863d22: three browser uploads plus a forced-private ID upload returned consistent can_delete=true for the uploader; another member cannot delete a crew document and receives 404 for private metadata/files. Own runtime processes stopped, local ports closed, tracked checkout and sample env unchanged.
- Docker final make e2e failed before browser tests because daemon storage became read-only/containerd metadata I/O failed. Scoped cleanup could not be confirmed. Final Docker bot/production targets were not run. Earlier Docker e2e (9 passed / 2 production skips) and bot smoke passed before final source integration. Native proof does not turn this failed Docker gate green; no daemon restart or unrelated service changes were attempted.
- Source push verified at `d66c8534dc3629aaf7bbf1bab69d7c9f2b995633`. Docker recovery/reverification remains open; Pi/T11 deployment, real provider captures, VAPID/production vault keys and backup/restore remain owner actions, not completed here.

### Remaining work
1. Repository source delivery is complete: non-force push d66c853 and identical remote SHA observed. Any later receipt commit is documentation-only. Do not repeat source writers or old merges.
2. Restore Docker only with explicit permission because other projects use it; rerun final make e2e, make bot-smoke and provider-neutral production offline checks, confirming scoped teardown. Do not call native checks a Docker pass.
3. Resolve M3 oversized-nag product decision: one message cannot list arbitrarily many tasks within 4000 chars. Existing safe failure remains; last-resort owner/unowned counts plus board link and all exact IDs is NOT accepted yet.
4. T11 Pi go-live remains owner/remote-authorized work under deploy/README.md and current WAHA contract. No Pi services, real credentials or existing WAHA session were touched.

## 1. Historical starting state — 2026-10-01

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

## 2. Original ordered execution plan — completed source work; see current checkpoint

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

## Codex continuation — 2026-10-01
- M1 API/web now merged (`adcc1cb`, `bd6c33d`) plus verified settings/shared PersonRefOut, platform env and ski form.
- Integrated correction merge `dece82f`: self-contained proposal e2e, shared login isolation and accessible home/loading headings. Final API1815 tests, web571 tests; final e2e8passed/2production-only skips; bot-smoke passed. Independent verification and one accessibility correction round completed.
- See `odd/tasks/viajecito-m1-proposals.md` for evidence/commits. Push pending immediately after this documentation commit; then §2 step2 (Wave B + M6 map). Do not remerge M1.
- RDD confirmed off clone-local. Source/functional checks green; production-only service worker/offline tests remain pending. Shared main remains no-FF/clean-only, export+pytest before merge commits.

## Historical Codex state — clarification boundary
- M1 successfully pushed ec96636 (after preserving concurrent5b1bc71); final1816API/571web, e2e8pass2production-onlyskip, bot-smoke green.
- Local main source now328a784 (unpublished Wave B proposal/trip/packing pure seams) + orchestration docs; fullAPI1840/exportgreen. See M3/M4/M6 task docs/mirrors for active work.
- Active isolated writers: m3_api_writer(m3-api), wave_b_mapping now M3web writer(m3-web), m4_api_writer(m4-api), m4_web_writer(m4-web). M6map queued (4child concurrent slots). Parent orchestrator must continue independent verification/one correction/spot and API-before-web integration.
- Pending one USER product clarification: nag >4000chars cannot list every due task. Proposed last-resort grouped owner/unowned counts+boardlink, ALL exact included IDs retained, after bounded titles. Not accepted yet; M3 writer told to defer unsafe choice and continue independent units.
- Pending core API integration writer: widen outbound.subject_id metadata + migration/regression, vault env parsing/stable keys/requiredprod/limits. Parent owns core; no milestone writer bypass.


## Historical parallel visual work — 2026-10-01
- User explicitly requested faster parallel progress and premium/fun styling. Source audit complete; isolated sole writer wave_b_mapping owns codex/premium-trip-ui worktree and exact presentation exception in odd/tasks/viajecito-premium-ui.md (mirror2817). Warm-paper/evergreen/terracotta travel-club direction, existing Geist, no business/auth/route changes. Screenshots/functional checks/independent verifier still pending.
- M6 map writer now m4_web_writer in m6-map (M4web candidate7891dea completed594 tests, awaiting separateverification/integration). Map package/lock exception approved; other core presentation excluded.
- M3 API candidate d363ed4(1900tests), web7f43ede(601tests); M4 API a2d90c1(1907tests). Independent API verifiers swapped authors (no self-verification). M4 review requested2 corrections: after/undated bot should omit pinned notes; inclusive date.max planner overflow. M3 verifier reporting owner-reset/stale-membership mentions/superscript command edge cases; exact final report pending. Same authors receive at most one correction round.
- M3 core settings/subject-id/global import-linter integration remains queued. Nag>4000 product clarification still unanswered; do not assume latest visual request accepts fallback. No new milestone merge/push after M1ec96636 yet; clean-main/export+pytest protocol unchanged.

### Observed source delivery
- Non-force push of `d66c8534dc3629aaf7bbf1bab69d7c9f2b995633` to `origin/main` succeeded; remote refs/heads/main independently read back with the same full SHA. Fresh fetch showed no remote-only commits, concurrent5b1bc71 retained, root main clean. Source remains f863d22; later receipt commits are documentation only.
- Source implementation, independent reviews, corrections, static checks and native functional verification are complete. Final Docker verification/cleanup remains explicitly open on infrastructure failure; do not repeat writer work or claim Docker passed. No Pi deployment or real provider operations performed.
