#!/usr/bin/env bash
# Pull the latest code and restart. Migrations run automatically before the app starts.
set -euo pipefail
cd /opt/reelkar
git pull --ff-only
cd story-film/deploy
docker compose up -d --build
docker image prune -f >/dev/null
docker compose ps
