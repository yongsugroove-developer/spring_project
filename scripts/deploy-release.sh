#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/var/www/my-planner}"
RELEASE_ID="${1:?release id is required}"
RELEASE_DIR="$APP_ROOT/releases/$RELEASE_ID"
CURRENT_LINK="$APP_ROOT/current"
SHARED_ENV="$APP_ROOT/shared/.env"

if [[ ! -d "$RELEASE_DIR" ]]; then
  echo "Release directory does not exist: $RELEASE_DIR" >&2
  exit 1
fi

if [[ ! -f "$SHARED_ENV" ]]; then
  echo "Shared .env file does not exist: $SHARED_ENV" >&2
  exit 1
fi

cd "$RELEASE_DIR"
cp "$SHARED_ENV" .env
npm ci --omit=dev
ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"
pm2 startOrReload "$CURRENT_LINK/ecosystem.config.cjs" --update-env

PORT_VALUE="$(grep -E '^PORT=' .env | tail -n 1 | cut -d '=' -f 2 || true)"
PORT_VALUE="${PORT_VALUE:-3000}"

sleep 3
curl --fail --silent "http://127.0.0.1:${PORT_VALUE}/api/health" >/dev/null
echo "Release ${RELEASE_ID} is live on port ${PORT_VALUE}."
