#!/usr/bin/env bash
# Pulls the latest code and rebuilds the portal. Run on the VM from anywhere: ./scripts/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."

git pull --ff-only

# Behind Caddy when its container exists, plain HTTP otherwise.
files=(-f docker-compose.yml)
if docker compose -f docker-compose.yml -f docker-compose.https.yml ps -a --services 2>/dev/null | grep -qx caddy; then
	files+=(-f docker-compose.https.yml)
fi

docker compose "${files[@]}" up -d --build
docker image prune -f >/dev/null
# Build cache grows with every update (LibreOffice and Chromium layers) until the disk fills up.
# Only cache older than a week goes, so a quick second update still builds fast.
docker builder prune -f --filter until=168h >/dev/null
docker compose "${files[@]}" ps
