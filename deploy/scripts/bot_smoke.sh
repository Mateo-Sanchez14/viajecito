#!/usr/bin/env bash
# Local/CI end-to-end smoke of the bot loop against the dev stack (api + fake Gowa):
# bootstrap a crew, seed the fake group, replay `/viaje ping`, expect a `pong` reply, replay again
# expecting `duplicate`, run one `tick`. Always tears the stack down. Run from the repository root
# (normally through `make bot-smoke`). Needs docker compose, curl and python3.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

chat_id="120363000000000000@g.us"
chat_digits="${chat_id%@*}"
sender_digits="5491100000001"
fixture="api/messaging/tests/fixtures/gowa/group_command_ping.json"
fake_gowa="http://localhost:4000"
export DATA_DIR="./data/bot-smoke"

for cmd in docker curl python3; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "bot-smoke: required command not found: $cmd" >&2; exit 1; }
done
[[ -f .env ]] || { echo "bot-smoke: .env is missing (cp .env.example .env)" >&2; exit 1; }

step() { printf '\n== %s\n' "$*"; }
fail() { echo "bot-smoke FAILED: $*" >&2; exit 1; }

teardown() {
  local rc=$?
  if [[ $rc -ne 0 ]]; then
    echo "bot-smoke FAILED (exit $rc); last stack logs:" >&2
    docker compose logs --no-color --tail 80 >&2 || true
  else
    echo "bot-smoke passed"
  fi
  docker compose down -v >/dev/null 2>&1 || true
  exit "$rc"
}
trap teardown EXIT

json_get() { python3 -c 'import json, sys; print(json.load(sys.stdin)[sys.argv[1]])' "$1"; }

# replay FIXTURE: run replay_gowa inside the api container (it has the stack's GOWA_WEBHOOK_SECRET;
# ./api is bind-mounted at /app). Output is "<http status>\n<json body>"; print the body's "status".
replay_status() {
  local out code body
  out="$(docker compose exec -T api python manage.py replay_gowa "/app/${fixture#api/}" --url http://localhost:8000/hooks/gowa/)"
  code="$(printf '%s\n' "$out" | sed -n '1p')"
  body="$(printf '%s\n' "$out" | sed -n '2,$p')"
  [[ "$code" == "200" ]] || fail "webhook answered HTTP $code: $body"
  printf '%s' "$body" | json_get status
}

step "starting the dev stack on a fresh data dir ($DATA_DIR)"
rm -rf "$DATA_DIR"
docker compose up --build -d --wait --wait-timeout 300

step "migrate and bootstrap the crew"
docker compose exec -T api python manage.py migrate --noinput
docker compose exec -T api python manage.py bootstrap_crew --name "Crew de prueba" \
  --chat-id "$chat_id" --admin-phone "+$sender_digits"

step "seed the fake group roster"
curl -fsS -X PUT "$fake_gowa/__groups/$chat_id" -H 'Content-Type: application/json' \
  -d '[{"jid":"'"$sender_digits"'@s.whatsapp.net","phone_number":"'"$sender_digits"'@s.whatsapp.net","lid":null,"display_name":"Ana","is_admin":false,"is_super_admin":false}]' >/dev/null

step "replay /viaje ping"
status="$(replay_status)"
[[ "$status" == "accepted" ]] || fail "first replay expected status accepted, got '$status'"

step "wait for the pong reply (up to 20 s)"
expected_id="$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))["payload"]["id"])' "$fixture")"
found=0
for _ in $(seq 1 20); do
  if reply="$(curl -fsS "$fake_gowa/__sent/latest?phone=$chat_digits" 2>/dev/null)"; then
    message="$(printf '%s' "$reply" | json_get message)"
    reply_to="$(printf '%s' "$reply" | json_get reply_message_id)"
    if [[ "$message" == "pong" && "$reply_to" == "$expected_id" ]]; then found=1; break; fi
  fi
  sleep 1
done
[[ "$found" -eq 1 ]] || fail "no 'pong' reply to $expected_id within 20 s (last: ${reply:-none})"
echo "got pong replying to $expected_id"

step "replay the same fixture again"
status="$(replay_status)"
[[ "$status" == "duplicate" ]] || fail "second replay expected status duplicate, got '$status'"

step "tick"
tick_out="$(docker compose exec -T api python manage.py tick)"
printf '%s\n' "$tick_out"
printf '%s' "$tick_out" | python3 -c 'import json, sys; json.loads(sys.stdin.read().strip().splitlines()[-1])' \
  || fail "tick did not print a JSON summary"
