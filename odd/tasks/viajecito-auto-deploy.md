# Automatic Raspberry Pi deployment

## Objective and authorization
Automatically deploy main pushes to viajecito using SSH alias `pi` for installation.
User authorized local implementation and activation on the Pi. On 2026-10-06 the user explicitly
approved publishing all pending changes to main as one coherent delivery and deploying/verifying
that release through SSH alias `pi`. Do not touch WAHA or notify or read unrelated credentials.
No PR is requested; preserve existing viajecito env/data and exact-SHA successful-CI gates.

## Problem and approach
Images already publish independently of tests. All five push workflows need to run on every
main push. A Pi-local timer checks successful push runs for the exact main SHA, stages that
SHA's Compose/scripts and deploys immutable image tags. No GitHub runner or inbound SSH from CI.
Keep env/data paths stable, serialize updates, and record success only after health/smoke.
Fail closed on missing/failed checks or malformed archives. No automatic migration rollback.

## Execution configuration
- Route: delegated direct; preparation covers 4+ files and writer touches multiple platform files.
- TDD: strict ON, source AGENTS.md. Runner: `python3 -m unittest deploy/scripts/tests/test_autodeploy.py`.
- Regressions: `bash deploy/scripts/tests/test_lib.sh`, existing platform configuration tests.
- RDD: disabled/unmanaged, clone-local `gentle-ai review mode status` verified.
- Delivery: exception-ok, single coherent direct-main publication explicitly approved 2026-10-06.
  Actual existing authored count533 is advisory, not a code-golf or artificial-split trigger.
- Branch: `feat/pi-autodeploy`. Main merge and non-force push explicitly authorized; no PR.

## Tasks
- [x] T1: Implement exact-SHA gated updater, all-main workflow triggers, shared Compose overrides,
  timer/service, documentation and behavior-first tests. Route delegated (platform writer).
  Acceptance: five exact workflow paths must succeed for push/main and same SHA; reruns use
  latest attempt, idempotent state, exclusive lock, safe archive extraction, exact tag/Compose,
  failures never record success; secrets not printed. Existing lib tests stay green.
- [ ] T2: Install and activate only viajecito updater/timer over `ssh pi`; verify actual timer,
  gate output, source checks, and health. Route inline operations (single destination).
  Preserve env files and existing tick/backup configuration. Full update waits for eligible SHA.

## Evidence and next step
- SSH verified: raspberrypi aarch64, Python 3.11.2, sudo available, Compose 5.5.1.
- Existing api/web healthy; tick and backup timers present; root env files mode 600.
- Public GitHub API works unauthenticated; d66c853 has all five successful runs.
  Current local main 4cd3e51 is a documentation-only successor, without its own image/check runs.
- T1 implementation and RED/GREEN observed by delegated author. Parent reproduced 14 updater
  tests and 34 lib assertions; author also observed roster 5, Wave A 3, Wave B 4 and Ruff green.
  Actual authored count is 533 (ODD excluded); no code compressed or tests omitted.
- Historical delivery gate: publication/exception was pending on 2026-10-02, now granted 2026-10-06.
  A trigger-only slice is small, but leaves the updater/tests/docs coherent unit above 400;
  do not artificially split its behavior just to reach the advisory threshold.
- T2 operational progress: installed updater and new systemd units; systemd verify passed,
  timer enabled/active, first real service run exited 0 with waiting status. Existing env,
  Compose/scripts and tick/backup untouched. Public health, signed WAHA ignored probe,
  tick/backup active and restic snapshots all passed before activation.
- Actual deployment: pending. Current main 4cd3e51 has no exact-SHA checks/images, so safe
  updater waits; no fallback to an older SHA. Next poll in approximately five minutes.
- Next: obtain delivery exception and main publication authorization, commit verified source,
  publish only if explicitly authorized, observe CI and first exact-SHA deployment.
- Commit evidence: pending; tasks stay unchecked until work-unit commit and release proof.
  Rollback: disable only new timer/service; remove updater and revert
  workflow/shared helper changes. Do not blindly roll back deployed database migrations.

## Authorized delivery resumption — 2026-10-06
- Parent reconciled full observation3005 against the actual existing document and dirty branch.
  Existing implementation is preserved; no blanket reset or unrelated changes.
- T1 resumes delegated independent read-only audit (4+ files) before commit/publication. Any real
  correction needs a bounded writer with observed RED/GREEN and separate review. Strict TDD and
  existing runners retained; RDD disabled/unmanaged. Parent reproduces source checks before merge.
- T2 resumes inline authorized single-host operations over ssh pi only: observe current updater,
  publish eligible immutable SHA after all CI/images succeed, then health/smoke and running image
  identity. No gate bypass, real bot messages, WAHA/notify mutation or unrelated credentials.
- Current live state is unverified; 2026-10-02 activation evidence is historical, not a new claim.

### Observed source closure and production preflight
- T1 work-unit commit `1a8aa4b`: independent read-only APPROVE; exact workflow/SHA/main/push/latest
  attempts, archive safety, stable env/Compose overrides and atomic state verified. Parent repeated
  updater14 tests, shared lib34 assertions, roster/Wave A/Wave B12 tests and Ruff; syntax/ShellCheck
  and Python3.11 grammar independently passed. Prior author RED/GREEN retained. RDD off clone_local
  reconfirmed, disabled/unmanaged. No production source correction was necessary.
- Fresh fetch shows no remote-only changes against base4cd3e51. Clean-main no-ff/no-commit merge,
  frozen API export/fullpytest and applicable web checks must pass before merge commit/publication.
- Authorized sshpi preflight: host raspberrypi/aarch64, autodeploy/tick/backup timers active;
  current api/web latest healthy, updater exit0 waits for checks. No deployed-sha marker yet.
- [ ] T3: Complete required vault configuration before release. Route inline single-host operations:
  existing api.env600 has no nonempty DOCUMENTS_FERNET_KEYS; old deployed DB has no documents table.
  Verify no orphan encrypted vault files, guard against any existing key/data, generate random32-byte
  key ON Pi, preserve all existing config/ownership and atomic mode600 write, restricted local backup.
  No key printed/transferred to repository; optional VAPID remains disabled/unmodified. Independent
  read-only storage/guard challenge pending. Observe config RED missing → GREEN valid before deploy.
- T2 actual release still pending; source push and all5successful exact-SHA CI/images required.
