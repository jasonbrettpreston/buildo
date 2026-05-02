#!/usr/bin/env bash
# Pre-commit hook — rejects any staged migrations/*.sql with uncommented DDL
# under `-- DOWN`.
#
# Background (tasks/lessons.md "Migration runner UP/DOWN convention"):
# scripts/migrate.js runs each .sql file as one transaction and treats
# `-- DOWN` as a SQL comment, NOT a section directive. Uncommented DROP /
# ALTER / DELETE / etc. statements under DOWN execute immediately after the
# UP work and silently undo the migration's effects while the file still
# gets recorded as applied in schema_migrations. The fresh-checkout DB ends
# up broken with no error.
#
# Spec 05 §4 Pattern Routing — 15 findings in WF5 audit (commit 634fd1f) ≫
# 3-finding threshold ⇒ destination upgrade from advisory tasks/lessons.md
# rule to enforced pre-commit lint rule. This hook is that enforcement.
#
# Companion to scripts/hooks/validate-migrations.sh — that script ensures
# `-- UP` and `-- DOWN` markers EXIST; this script ensures DDL under DOWN is
# COMMENTED OUT. Different invariants, same input.

# Capture staged migrations. || true prevents set -e crash on no match.
STAGED_MIGRATIONS=$(git diff --cached --name-only --diff-filter=ACM | grep -E '^migrations/.*\.sql$' || true)

if [ -z "$STAGED_MIGRATIONS" ]; then
  exit 0
fi

BAD_REPORT=""

# while read -r safely handles filenames with spaces (matches validate-migrations.sh).
while IFS= read -r FILE; do
  # awk discovery — same regex used in WF5 audit (634fd1f) and the
  # batch fix verification (1da51e4). Print ONLY THE FIRST hit per file
  # for a concise error; the developer fixes one, re-runs, sees the next.
  HIT=$(awk '
    BEGIN { in_down = 0 }
    /^-- DOWN|^-- [-=]+ DOWN/ { in_down = 1; next }
    in_down && /^[[:space:]]*(DROP|ALTER|DELETE|TRUNCATE|CREATE|INSERT|UPDATE|GRANT|REVOKE|COMMENT|REINDEX|REFRESH|RENAME)/ {
      print NR ": " $0
      exit
    }
  ' "$FILE")
  if [ -n "$HIT" ]; then
    BAD_REPORT="${BAD_REPORT}
  ${FILE}:${HIT}"
  fi
done <<< "$STAGED_MIGRATIONS"

if [ -n "$BAD_REPORT" ]; then
  echo ""
  echo "ERROR: Migration(s) staged with uncommented DDL under '-- DOWN':"
  echo "$BAD_REPORT"
  echo ""
  echo "  scripts/migrate.js runs each .sql file as one transaction and"
  echo "  treats '-- DOWN' as a SQL comment, NOT a section directive."
  echo "  An uncommented DROP/ALTER/DELETE/etc. under DOWN will execute"
  echo "  immediately after the UP work and silently undo the migration"
  echo "  while still recording it as applied in schema_migrations."
  echo ""
  echo "  Fix: comment out every line under '-- DOWN' (prefix each with '-- ')."
  echo "  Canonical example: migrations/114_user_profiles_mobile_columns.sql."
  echo "  Background: tasks/lessons.md 'Migration runner UP/DOWN convention'."
  echo ""
  exit 1
fi

exit 0
