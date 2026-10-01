# Feature: premium playful travel UI

- Feature id: `viajecito-premium-ui`; mirror: `odd/viajecito-premium-ui/tasks`.
- Authorized by user 2026-10-01: faster parallel progress and a beautiful, fun, PREMIUM page redesign.
- Branch: `codex/premium-trip-ui`; isolated worktree `~/Development/viajecito-worktrees/premium-trip-ui` from main4f314bb.

## Objective and problem
Give the working group-trip product a distinctive, polished travel-club identity without changing business behavior. Source audit found neutral-only hierarchy, equally weighted bordered boxes, a utility shell, uncomposed home/login and incomplete focus/pressed/touch/reduced-motion treatments. This is a product UI, not a marketing landing page.

## Direction and constraints
Warm paper canvas, evergreen ink and terracotta accents; bold existing Geist type, subtle passport/route details, ticket-like trip rows and layered surfaces. Asymmetric desktop overview, single-column mobile. Keep contrast/readability above decoration. Preserve route names, form fields, accessible names, auth gates, props, fetching, actions, module/card behavior and existing Spanish i18n copy. No fake destinations, metrics or interactive promises; no new navigation or cinematic scroll gating. No framework/font/icon dependency churn. Support existing theme policy and reduced motion; do not introduce an unrequested theme toggle.

## Ownership (explicit core presentation exception)
Writer may edit only:
- web/src/app/globals.css; styling-only app/(app)/layout.tsx and page.tsx, app/(public)/layout.tsx.
- Existing ui/atoms/{Button,Input,Select,Textarea,Card,Badge,Avatar,Skeleton}.tsx.
- Existing ui/molecules/{PageHeader,SectionNav,EmptyState}.tsx and ui/organisms/{AppHeader,LoginCard,TripShell}.tsx.
- Presentation-only features/trips/containers/{CrewTrips,TripList,TripOverview,CreateTripForm,RsvpControl}.tsx.
- Presentation-only features/proposals/components/{ProposalCard,ProposalThumbnail}.tsx.
- Their directly related tests; messages/es-AR/{home,trips,auth,proposals}.json only if necessary (Spanish user copy only there).
Missing named files are not permission to invent an alternate subtree. Report any necessary extension.
Exclude M3/M4/map/push/PWA feature subtrees, cards registry, shared schema/contracts/package/lock, API/auth handlers/data hooks, AGENTS/odd (parent-owned). One visual writer only; no subagents. Other writers are active; never revert their work.

## Route, TDD and delivery
Delegated direct: audit needed4+files; visual implementation2+nontrivial files. Strict TDD ON from AGENTS, exact runner `cd web && pnpm test`; observed RED before production changes, GREEN then refactor. Keep meaningful behavior/interaction tests, not tautological CSS snapshots. Browser visual measurements supplement rather than replace tests.
RDD clone-local OFF: disabled/unmanaged, ordinary independent verification. Estimated900–1400 authored lines including tests; existing direct-main exception-ok delivery convention, coherent behavior commits (400 advisory only; no code golf). No remote access/push by writer; parent owns merge/delivery. Independent verifier, one correction to same author, parent spot and clean-main integration checks remain mandatory.

## Tasks
- [x] V0 — delegated read-only audit. Source evidence returned by wave_b_mapping; no screenshots/servers/source changes. Chosen bounded ownership above.
- [ ] V1 — delegated visual foundation: tokens, shared primitives, focus/pressed states, 44px touch targets, reduced-motion-safe skeleton/motion. RED/GREEN evidence, functional checks and Conventional Commit.
- [ ] V2 — delegated product composition: shell/login/home/trip overview/proposal surfaces with real data and unchanged behavior; mobile/desktop review, screenshots, tests/docs and Conventional Commit.
- [ ] V3 — independent read-only verification, one correction, parent spot, merge and final functional/visual checks. Do not complete until observed outcomes.

## Acceptance and checks
- Distinctive coherent premium/playful travel identity, not a recolored generic dashboard; preserved content/actions/routes.
- Real screenshots at390px and1440px for login/home/overview/proposals; existing theme variations and empty/loading/error states reviewed. No horizontal page overflow, clipped form controls or touch collisions.
- Keyboard navigation and visible focus; readable disabled/error states; contrast4.5:1 body text, non-color state cues, targets44px where interactive; reduced motion respected; axe zero serious violations.
- Frozen dependencies, typecheck/lint/full web tests/types drift/build; auth/logout/create-trip/RSVP/proposal behavior remains green.
- Preview isolated from shared Docker ports/data/.next. Own disposable sample-only local runtime permitted if needed; no real credentials/provider sends. No shared stack until parent grants exclusive window.
- Parent integration: clean main, no-ff/no-commit; export+pytest before merge commit per handoff; regenerate types if needed; web checks and applicable e2e/smoke. Report failed/skipped/pending checks honestly.

## Progress / next step
- V0 source audit complete. No source implementation yet; no browser appearance verified.
- Main concurrently coordinates M3/M4 independent API verification and M6 map writer. Visual writer will work in isolated premium-trip-ui subtree ownership above.
- Next: launch V1/V2 writer, then independent verifier when candidate ready. Record exact commits and observed checks before checking tasks off.
