# M3 web integration

Owned capabilities: logistics (tasks and personal packing), budget (forecast and manual FX), and
private document vault controls. Server sections authenticate before loading the trip. Queries share
contract keys and refetch intervals; task and packing toggles cancel/refetch with snapshot rollback.
Custom packing entries accept a section key and an optional positive quantity alongside their label.
Stored quantities remain visible and editable in each personal packing row; clearing the field removes
the optional quantity. Invalid quantities are not submitted. Capability sections preserve the existing
trip shell's single main landmark and level-one heading.

## Temporary parallel API schema

`api/draft-openapi.json` and generated `api/draft-schema.d.ts` describe the M3 contract while the API
writer works independently. `api/client.ts` uses the project's CSRF middleware and same-origin
credentials. Request bodies derive from generated operation `paths`, not schema names.

At integration regenerate the shared contract/types from the real API, swap draft `paths` imports to
`@/shared/api/schema`, replace `client()` with `createBrowserClient`, remove both draft files, and run
all type/test/drift checks. Document upload deliberately uses XHR for progress; it uses the shared CSRF
token, never displays developer error messages, and validates extension/size before submission.
Downloads only accept the same-origin authorized document file path, never `/media` or arbitrary URLs.

Checks: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm api:types:check`.
The `logistics.spec.ts` browser test requires the integrated M3 API and the parent's exclusive local
compose stack. It creates a unique trip/task/proposal using shared authenticated storage; it never
requests an OTP or clears the fake transport ledger. Its tick runs at local noon to avoid quiet hours.
