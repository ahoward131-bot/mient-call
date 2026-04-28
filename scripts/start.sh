#!/usr/bin/env bash
# Render startup script.
# - On Render, DB_PATH is set to the persistent-disk path (e.g. /var/data/data.db).
# - First boot: that file doesn't exist yet, so we copy the seeded baseline in.
# - Subsequent boots: leave the live DB alone.
set -e

SEED_FILE="data.seed.db"
TARGET="${DB_PATH:-data.db}"

if [ ! -f "$TARGET" ]; then
  echo "[start.sh] No DB at $TARGET — seeding from $SEED_FILE"
  mkdir -p "$(dirname "$TARGET")"
  cp "$SEED_FILE" "$TARGET"
else
  echo "[start.sh] Existing DB found at $TARGET — leaving it alone"
fi

exec node dist/index.cjs
