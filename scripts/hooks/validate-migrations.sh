#!/usr/bin/env bash
# Enforces §3.2 Migration Rollback Safety:
# Every staged migrations/*.sql file MUST contain a "-- DOWN" block.

STAGED_MIGRATIONS=$(git diff --cached --name-only --diff-filter=ACM | grep '^migrations/.*\.sql$')

if [ -z "$STAGED_MIGRATIONS" ]; then
  exit 0
fi

FAILED=0
for FILE in $STAGED_MIGRATIONS; do
  if ! grep -q '^\-\- DOWN' "$FILE"; then
    echo "ERROR: Migration missing '-- DOWN' block: $FILE"
    echo "  Every migration MUST have both UP and DOWN blocks (§3.2)."
    FAILED=1
  fi
done

if [ "$FAILED" -eq 1 ]; then
  echo ""
  echo "Add a '-- DOWN' section with rollback SQL to each migration file."
  exit 1
fi

exit 0
