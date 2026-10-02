# M3 web integration

Owned capabilities: logistics (tasks and personal packing), budget (forecast and manual FX), and
private document vault controls. Server sections authenticate before loading the trip. Queries share
contract keys and refetch intervals; task and packing toggles cancel/refetch with snapshot rollback.
Custom packing entries accept a section key and an optional positive quantity alongside their label.
Stored quantities remain visible and editable in each personal packing row; clearing the field removes
the optional quantity. Invalid quantities are not submitted. Capability sections preserve the existing
trip shell's single main landmark and level-one heading. Completed tasks offer reopening rather than
the invalid direct transition to blocked.

## Integrated API contract

The three capability clients use `createBrowserClient` and derive response/request types from the
shared generated operation `paths`. The temporary parallel schema and local client are removed.
Regenerate shared types from the API export at integration and run all type/test/drift checks.
Document upload deliberately uses XHR for progress; it uses the shared CSRF
token, never displays developer error messages, and validates extension/size before submission.
Downloads only accept the same-origin authorized document file path, never `/media` or arbitrary URLs.

Checks: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm api:types:check`.
The `logistics.spec.ts` browser test requires the integrated M3 API and the parent's exclusive local
compose stack. It creates a unique trip/task/proposal using shared authenticated storage; it never
requests an OTP or clears the fake transport ledger. Its tick runs at local noon to avoid quiet hours.
