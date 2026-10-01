# Proposals map

The map consumes the real M1 list HTTP contract with generated `paths` types. It imports no production
code from `features/proposals`. The query key is `['proposals', tripId, 'list', {map: true}]`; polling is
60 seconds with default endpoint filters. The route authenticates before rendering.

Leaflet loads only in a client-side dynamic component (`ssr: false`). Empty lists and proposals without
finite/in-range coordinates do not load tiles. A numbered, keyboard-accessible list includes every
proposal, even without location. Marker numbers match list positions; category colors also carry text
labels. Popups show status/title and a same-origin proposal link constructed from the current route.
Marker DOM labels use `textContent`, not interpolated HTML. A map/chunk failure leaves the list usable.
Automatic bounds fitting runs only when coordinates change and never animates.

## Dependencies and policy

Pinned `react-leaflet` 5.0.0, `leaflet` 1.9.4 and `@types/leaflet` 1.9.22 after Context7 documentation and
current registry peer-dependency checks (React 19 and Leaflet ^1.9). Leaflet's main-branch docs already
show 2.0 APIs: implementation uses the official 1.9.4 reference instead.

- https://react-leaflet.js.org/docs/start-installation/
- https://leafletjs.com/reference.html
- https://operations.osmfoundation.org/policies/tiles/

Tiles use `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, with linked visible attribution. Only viewport
requests: `keepBuffer=0`, update when idle, no prefetch, bulk downloading, offline tile cache, or altered
browser user-agent. Tile failure never prevents using proposal links. Revisit the provider if usage grows.

## Checks and ownership

`pnpm test src/features/map`, frozen install, typecheck, lint, full tests, build and api types drift check.
Leaflet is mocked in rendering tests; no tests request tiles or other live network services.
Owned map subtree, static map route, map copy, plus allowed overview/message registry appends. Package and
lock changes are the approved M6 dependency exception; no global styling, service-worker or API changes.
