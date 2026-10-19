#!/bin/bash
# Run all D1 migrations against local and/or remote
# Usage:
#   ./scripts/migrate.sh          # local only
#   ./scripts/migrate.sh --remote # remote only
#   ./scripts/migrate.sh --both   # both local and remote

TARGET="${1:---local}"

for f in migrations/*.sql; do
  echo "▸ Applying $f..."
  if [ "$TARGET" = "--both" ]; then
    npx wrangler d1 execute lixblogs --local --file="$f" 2>/dev/null
    npx wrangler d1 execute lixblogs --remote --file="$f" 2>/dev/null
  else
    npx wrangler d1 execute lixblogs $TARGET --file="$f" 2>/dev/null
  fi
done

echo "✓ Done"
