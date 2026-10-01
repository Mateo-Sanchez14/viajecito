# Today

Client-side trip-timezone snapshot, polled every 20 seconds. The query caches both snapshot and ETag;
`If-None-Match` revalidates it and a 304 retains the prior snapshot. Network failure does not erase data.
The route contains no server data fetch beyond the authentication gate, enabling the existing M6
service worker to cache it. Offline status is politely announced.

Document shortcuts use M3's member-filtered HTTP list with `['documents', tripId, 'list', 'all']`;
download links are restricted to same-origin `/api/documents/<id>/file`. Ski conditions use the existing
M5 HTTP contract and shared query key. These components mount only when their modules are enabled.
No direct cross-feature persistence access is used. Notes poll every 20 seconds and initially fall back
to the Today snapshot's pinned/recent notes while the dedicated list loads.

At integration replace the temporary `Document` declaration in `api/external.ts` with the real
M3 generated endpoint response type and its raw list fetch with the shared typed client. M5 already
uses generated types. E2E `e2e/today.spec.ts` self-seeds a trip using shared authentication; it never
requests another OTP or clears the global fake Gowa ledger. Execute against the actual merged API.
