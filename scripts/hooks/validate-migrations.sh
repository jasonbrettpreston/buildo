#!/usr/bin/env bash
# Enforces §3.2 Migration Rollback Safety:
# Every staged migrations/*.sql file MUST contain explicit UP and DOWN blocks.

# Capture staged migrations. || true prevents set -e crash when no migrations match.
STAGED_MIGRATIONS=$(git diff --cached --name-only --diff-filter=ACM | grep -E '^migrations/.*\.sql$' || true)

if [ -z "$STAGED_MIGRATIONS" ]; then
  exit 0
fi

FAILED=0

# while read -r safely handles filenames with spaces
while IFS= read -r FILE; do
  # Check for UP block (case-insensitive, allows leading whitespace)
  if ! grep -qiE '^[[:space:]]*--[[:space:]]*UP' "$FILE"; then
    echo "ERROR: Migration missing '-- UP' block: $FILE"
    FAILED=1
  fi

  # Check for DOWN block (case-insensitive, allows leading whitespace)
  if ! grep -qiE '^[[:space:]]*--[[:space:]]*DOWN' "$FILE"; then
    echo "ERROR: Migration missing '-- DOWN' block: $FILE"
    FAILED=1
  fi
done <<< "$STAGED_MIGRATIONS"

if [ "$FAILED" -eq 1 ]; then
  echo ""
  echo "Every migration MUST have explicitly marked '-- UP' and '-- DOWN' sections (§3.2)."
  echo "Please update your staged files and try again."
  exit 1
fi

# Backstop: node-based safety checks (DROP guards, CONCURRENTLY, NOT NULL DEFAULT).
if command -v node >/dev/null 2>&1; then
  node scripts/validate-migration.js $STAGED_MIGRATIONS || exit 1
fi

exit 0
