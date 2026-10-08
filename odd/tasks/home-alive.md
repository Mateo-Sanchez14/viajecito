# home-alive — Home v2 (image-rich, alive "Mis viajes")

## Objective
Make the logged-in home feel alive and premium: destination-aware imagery, trip cards, grouping by
time, crew avatars, a clear create-trip flow, and entrance motion.

## Problem / why
User feedback (2026-10-08): sign-in and trip pages feel good, but the home "Mis viajes" feels rough.
Exploration `sdd/alive-inside/explore` (Engram #3389): hash-based arbitrary scenes, inverted heading
hierarchy, flat creation-ordered ticket list, buried 6-field create form, duplicated greeting, health
card shown to everyone, no motion beyond atmosphere.

## Scope
- In: web home (`src/app/(app)/page.tsx`, `features/trips` home containers, `src/ui`), keyword scene
  inference, `TripSummaryOut` enrichment (`member_count`, `members_preview`), contract regen.
- Out: new stock images (15 Pexels candidates need per-file approval — optional follow-up), section
  banners on other pages, proposal 16:9 cards, `Trip.scene` field, scroll-driven parallax.

## Constraints
- Only already-approved assets: 4 ambient clips + posters, user covers, own illustrations.
- Geometry asserted by browser tests lives in `globals.css`; 44px targets; contrast ≥ 4.5 (text on
  opaque panels, never on images); reduced motion + Save-Data honored; copy only in
  `web/messages/es-AR/*.json` (voseo).
- Members preview stays member-scoped (same rule as phones).
- TDD: OFF for this UI work (user's prior choice, source: conversation 2026-10-07); ordinary checks run.
  Runners: `cd api && uv run pytest`, `cd web && pnpm test`, `pnpm test:e2e`.

## Route
Delegated direct (one writer): 2+ non-trivial files across api and web (writer trigger).

## Tasks
- [ ] T1 Branch `feat/home-alive` from main e5c11c0.
- [ ] T2 API: `TripSummaryOut.member_count` + `members_preview` (≤ 4, `{person_id, display_name}`),
      tests, OpenAPI + `schema.d.ts` regen, web fixtures. Commit `feat(api): …`.
- [ ] T3 Web: keyword scene inference (name + destination → snow/beach/vineyard/road/city/lake/desert,
      fallback to hash), mapped to existing clip posters/illustrations; tests.
- [ ] T4 Web: `TripCard` (image top, opaque caption, countdown pill, avatar stack) and home sections
      Próximos (mobile scroll-snap rail, desktop grid) / Sin fecha / Pasados (muted), date-sorted.
- [ ] T5 Web: create-trip `Sheet` ("¿A dónde?" + scene hint, dates, name suggestion, "Más opciones"
      for type/currency); hero empty-state CTA; remove duplicate greeting; hide health card;
      crew heading only with ≥ 2 crews.
- [ ] T6 Web: entrance stagger + countdown count-up (reduced motion → final values); layout tests.
- [ ] T7 Full checks + fresh-stack e2e (update `home.spec.ts` order expectations).
- [ ] T8 Push, fast-forward main, verify Pi autodeploy (user-authorized 2026-10-08).

## Acceptance
Home shows destination-aware imagery, grouped date-sorted trip cards with avatars and countdown
pills, a one-tap create-trip sheet, no duplicated greeting or health card; all suites green; deployed.

## Progress / evidence
- (pending)

## Next step
T1–T6 via one delegated writer.
