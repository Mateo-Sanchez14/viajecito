#!/usr/bin/env bash
# Run restic against the backup repository configured in pi.env, without sourcing the file.
# Usage: restic.sh init | snapshots | check | ...   (any restic arguments)
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source-path=SCRIPTDIR source=lib.sh
source "$here/lib.sh"

load_env "$PI_ENV_FILE"
require_cmd restic
export_restic
exec restic "$@"
