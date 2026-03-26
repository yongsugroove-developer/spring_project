#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/var/www/my-planner}"
RELEASE_ID="${1:?release id is required}"
RELEASE_DIR="$APP_ROOT/releases/$RELEASE_ID"
CURRENT_LINK="$APP_ROOT/current"

if [[ ! -d "$RELEASE_DIR" ]]; then
  echo "Release directory does not exist: $RELEASE_DIR" >&2
  exit 1
fi

ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"
pm2 startOrReload "$CURRENT_LINK/ecosystem.config.cjs" --update-env
pm2 save
echo "Rolled back to release ${RELEASE_ID}."
