#!/usr/bin/env bash
# Tests for the pure helpers in lib.sh. Run: bash deploy/scripts/tests/test_lib.sh
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091,SC2016
# shellcheck source=../lib.sh
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
  assert_eq "double quotes stripped" "with space" "$QUOTED"
  assert_eq "single quotes stripped" "single q" "$SINGLE"
  assert_eq "empty" "" "$EMPTY"
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

exit "$fails"
