#!/usr/bin/env bash
set -euo pipefail

# Supply the actual service name in the timer/cron environment or a wrapper.
: "${FAZE_API_SERVICE:?Set FAZE_API_SERVICE to the existing backend systemd service name}"
REPO=/opt/FazeClan-HackUTA26
WEB_SERVICE=faze-web
STATE_DIR=/var/lib/faze-deploy
SUCCESS_FILE="$STATE_DIR/successful-commit"
SITE_ORIGIN="${FAZE_SITE_ORIGIN:-http://manilovefaze.club}"

exec >> /var/log/faze-pull.log 2>&1
echo "----- $(date -Is) -----"
exec 9>/var/lock/faze-deploy.lock
if ! flock -n 9; then
    echo "another deployment is running"
    exit 0
fi
trap 'echo "deployment FAILED at line $LINENO; successful release marker unchanged"' ERR

# Validate configured services before changing the checkout.
systemctl cat "$FAZE_API_SERVICE" >/dev/null
systemctl cat "$WEB_SERVICE" >/dev/null
if [ -n "${FAZE_WORKER_SERVICE:-}" ]; then
    systemctl cat "$FAZE_WORKER_SERVICE" >/dev/null
fi
mkdir -p "$STATE_DIR"
cd "$REPO"
[ "$(git branch --show-current)" = main ] || { echo "expected main branch"; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "tracked local changes; preserve and resolve them first"; exit 1; }
git fetch origin main
TARGET=$(git rev-parse origin/main)
LAST_SUCCESS=$(cat "$SUCCESS_FILE" 2>/dev/null || true)
if [ "$(git rev-parse HEAD)" = "$TARGET" ] && [ "$LAST_SUCCESS" = "$TARGET" ]; then
    echo "already successfully deployed $TARGET"
    exit 0
fi
# Refuse unpublished/divergent local commits rather than resetting team work.
git merge-base --is-ancestor HEAD origin/main
# HEAD may already be current after a failed build: continue until all steps pass.
git pull --ff-only origin main
DEPLOYED=$(git rev-parse HEAD)

cd "$REPO/backend"
npm ci
npm run check
npm run migrate

cd "$REPO/web"
npm ci
VITE_DATA_SOURCE=live VITE_API_BASE_URL=/api npm run build

systemctl restart "$FAZE_API_SERVICE"
if [ -n "${FAZE_WORKER_SERVICE:-}" ]; then
    systemctl restart "$FAZE_WORKER_SERVICE"
fi
systemctl restart "$WEB_SERVICE"

cd "$REPO/backend"
# Let the API finish starting; these checks only read public endpoints.
READY=0
for ATTEMPT in 1 2 3 4 5; do
    if npm run verify:deployment -- http://127.0.0.1:3001; then READY=1; break; fi
    sleep 2
done
[ "$READY" = 1 ] || { echo "API verification failed"; exit 1; }
npm run verify:site -- "$SITE_ORIGIN"
# Write this only after builds, restarts and routing checks succeeded.
printf '%s\n' "$DEPLOYED" > "$SUCCESS_FILE.tmp"
mv "$SUCCESS_FILE.tmp" "$SUCCESS_FILE"
echo "successfully deployed $DEPLOYED"
