#!/usr/bin/env bash
# Nightly backup: database dump plus finished videos/songs, keeping the last 7 days.
# Copy /var/backups/reelkar off the server too (e.g. rclone to Cloudflare R2 or Google Drive).
set -euo pipefail
cd /opt/reelkar/story-film/deploy
DEST=/var/backups/reelkar
STAMP=$(date +%F)
mkdir -p "$DEST"
docker compose exec -T postgres pg_dump -U reelkar -d reelkar --format=custom > "$DEST/db-$STAMP.dump"
docker run --rm -v reelkar_output:/data:ro -v "$DEST":/backup mirror.gcr.io/library/alpine:3.20 \
  tar czf "/backup/output-$STAMP.tgz" -C /data .
find "$DEST" -type f -mtime +7 -delete
echo "$(date -Is) backup ok"
