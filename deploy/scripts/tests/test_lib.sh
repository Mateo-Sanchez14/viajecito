#!/usr/bin/env bash
# Tests for the pure helpers in lib.sh. Run: bash deploy/scripts/tests/test_lib.sh
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source-path=SCRIPTDIR source=../lib.sh
source "$here/../lib.sh"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
fails=0
assert_eq() { if [[ "$2" == "$3" ]]; then echo "ok   $1"; else echo "FAIL $1: expected [$2] got [$3]"; fails=$((fails + 1)); fi; }

# load_env: comments, blanks, quotes, CRLF, spaces and shell metacharacters are taken literally.
cat >"$tmp/pi.env" <<'ENV'
# comment
PLAIN=abc
QUOTED="with space"
SINGLE='single q'
EMPTY=
DOLLAR=a$HOME$(echo pwned)`id`
EQ=a=b=c

  INDENTED=yes
CRLF=win
ENV
printf 'CRLF=win\r\n' >>"$tmp/pi.env"
(
  load_env "$tmp/pi.env"
  assert_eq "plain" "abc" "$PLAIN"
  assert_eq "double quotes kept literally" '"with space"' "$QUOTED"
  assert_eq "single quotes kept literally" "'single q'" "$SINGLE"
  assert_eq "empty" "" "$EMPTY"
  # shellcheck disable=SC2016
  assert_eq "no expansion" 'a$HOME$(echo pwned)`id`' "$DOLLAR"
  assert_eq "equals in value" "a=b=c" "$EQ"
  assert_eq "indented key" "yes" "$INDENTED"
  assert_eq "crlf stripped" "win" "$CRLF"
) || fails=$((fails + 1))

# prune_local_snapshots keeps the newest N.
mkdir "$tmp/b"
for d in 01 02 03 04 05 06 07 08 09 10; do : >"$tmp/b/db-2026-01-${d}T000000Z.sqlite3"; done
: >"$tmp/b/.lock"
prune_local_snapshots "$tmp/b" 7
remaining="$(printf '%s\n' "$tmp/b"/db-*.sqlite3 | wc -l | tr -d ' ')"
assert_eq "keeps 7" "7" "$remaining"
assert_eq "oldest removed" "no" "$([[ -e "$tmp/b/db-2026-01-01T000000Z.sqlite3" ]] && echo yes || echo no)"
assert_eq "newest kept" "yes" "$([[ -e "$tmp/b/db-2026-01-10T000000Z.sqlite3" ]] && echo yes || echo no)"
prune_local_snapshots "$tmp/empty-does-not-exist" 7
assert_eq "empty dir ok" "0" "$?"

# Webhook probe helpers: the provider decides path, secret variable, signature and headers.
assert_eq "gowa path" "/hooks/gowa/" "$(webhook_path gowa)"
assert_eq "waha path" "/hooks/waha/" "$(webhook_path waha)"
assert_eq "default provider is gowa" "gowa" "$(provider_of "")"
assert_eq "provider passthrough" "waha" "$(provider_of waha)"
assert_eq "gowa secret var" "GOWA_WEBHOOK_SECRET" "$(webhook_secret_var gowa)"
assert_eq "waha secret var" "WAHA_WEBHOOK_HMAC_KEY" "$(webhook_secret_var waha)"
body='{"event":"message","payload":{"id":"x"}}'
expected_waha="$(printf '%s' "$body" | python3 -c 'import hashlib,hmac,sys; print(hmac.new(b"k3y", sys.stdin.buffer.read(), hashlib.sha512).hexdigest())')"
expected_gowa="$(printf '%s' "$body" | python3 -c 'import hashlib,hmac,sys; print(hmac.new(b"k3y", sys.stdin.buffer.read(), hashlib.sha256).hexdigest())')"
assert_eq "waha sha512 signature" "$expected_waha" "$(WEBHOOK_SECRET=k3y webhook_signature waha "$body")"
assert_eq "gowa sha256 signature" "$expected_gowa" "$(WEBHOOK_SECRET=k3y webhook_signature gowa "$body")"
# The curl args are consumed exactly as smoke.sh does (webhook_curl_header_args), so count and values are asserted.
webhook_curl_header_args waha "$expected_waha"
assert_eq "waha curl arg count" "4" "${#WEBHOOK_CURL_HEADER_ARGS[@]}"
assert_eq "waha curl arg 0" "-H" "${WEBHOOK_CURL_HEADER_ARGS[0]}"
assert_eq "waha curl arg 1" "X-Webhook-Hmac: $expected_waha" "${WEBHOOK_CURL_HEADER_ARGS[1]}"
assert_eq "waha curl arg 2" "-H" "${WEBHOOK_CURL_HEADER_ARGS[2]}"
assert_eq "waha curl arg 3" "X-Webhook-Hmac-Algorithm: sha512" "${WEBHOOK_CURL_HEADER_ARGS[3]}"
webhook_curl_header_args gowa "$expected_gowa"
assert_eq "gowa curl arg count" "2" "${#WEBHOOK_CURL_HEADER_ARGS[@]}"
assert_eq "gowa curl arg 0" "-H" "${WEBHOOK_CURL_HEADER_ARGS[0]}"
assert_eq "gowa curl arg 1" "X-Hub-Signature-256: sha256=$expected_gowa" "${WEBHOOK_CURL_HEADER_ARGS[1]}"
assert_eq "waha header lines end with newline" "2" "$(webhook_headers waha abc | wc -l | tr -d ' ')"
assert_eq "gowa header lines end with newline" "1" "$(webhook_headers gowa abc | wc -l | tr -d ' ')"
waha_payload="$(webhook_payload waha 123)"
assert_eq "waha payload is a non-group message" "message|c.us|False" "$(printf '%s' "$waha_payload" | python3 -c 'import json,sys; d=json.load(sys.stdin); p=d["payload"]; print(d["event"], p["from"].split("@")[1], p["fromMe"], sep="|")')"
assert_eq "waha payload id" "smoke-123" "$(printf '%s' "$waha_payload" | python3 -c 'import json,sys; print(json.load(sys.stdin)["payload"]["id"])')"
assert_eq "gowa payload id" "smoke-123" "$(webhook_payload gowa 123 | python3 -c 'import json,sys; print(json.load(sys.stdin)["payload"]["id"])')"

# Release overrides survive pi.env loading and are shared by deploy and smoke.
docker() { printf '%s|%s' "${IMAGE_TAG:-}" "$*"; }
export IMAGE_TAG=old DEPLOY_IMAGE_TAG=release VIAJECITO_COMPOSE_FILE=/release/compose.pi.yml
assert_eq "release compose overrides" "release|compose --env-file $PI_ENV_FILE --project-directory $VIAJECITO_ROOT -f /release/compose.pi.yml config -q" "$(dc config -q)"

exit "$fails"
