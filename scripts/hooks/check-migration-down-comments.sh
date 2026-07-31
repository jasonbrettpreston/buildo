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

# VALIDATES THE STAGED BLOB, NOT THE WORKTREE (WF3 2026-07-31) — and FAILS
# CLOSED. This script used to run awk against the working-tree file. Two
# consequences, both reproduced: an unsafe staged blob hidden behind a fixed
# worktree copy passed; and on the `AD` case (blob staged, worktree copy
# deleted — which `--diff-filter=ACM` does NOT exclude) awk errored, HIT came
# back empty, BAD_REPORT stayed empty, and the hook exited 0 having validated
# nothing. Its companion exits 1 on that same input, so the two hooks
# disagreed about whether the commit was safe.
# Behavioural locks: src/tests/migration-hooks.behaviour.test.ts

ROOT=$(git rev-parse --show-toplevel) || {
  echo "ERROR: not inside a git repository — cannot validate migrations." >&2
  exit 1
}
cd "$ROOT" || exit 1

# ONE source of truth, NUL-delimited, exit status observable. Same three
# constraints as the companion hook: git failure must not read as "nothing
# staged"; bash cannot hold NUL in a variable so -z goes to a temp file; and a
# second `git diff` inside a process substitution would have an unobservable
# exit status, re-opening the fail-open one layer down. Filtering happens in
# the loop because `core.quotePath` renders a non-ASCII path as
# "migrations/\303\251.sql", which `grep -E '^migrations/'` does not match —
# that silently skipped such a file entirely.
STAGED_LIST=$(mktemp) || {
  echo "ERROR: cannot create a temp file to list staged migrations." >&2
  exit 1
}
trap 'rm -f "$STAGED_LIST"' EXIT

if ! git diff --cached --name-only --diff-filter=ACM -z > "$STAGED_LIST"; then
  echo "ERROR: 'git diff --cached' failed — cannot determine staged migrations." >&2
  exit 1
fi

STAGED_MIGRATIONS=()
while IFS= read -r -d '' FILE; do
  case "$FILE" in
    migrations/*.sql) STAGED_MIGRATIONS+=("$FILE") ;;
  esac
done < "$STAGED_LIST"

if [ ${#STAGED_MIGRATIONS[@]} -eq 0 ]; then
  exit 0
fi

BAD_REPORT=""
FAILED=0

for FILE in "${STAGED_MIGRATIONS[@]}"; do
  # The bytes git would COMMIT, not the bytes on disk.
  if ! BLOB=$(git show ":$FILE" 2>/dev/null); then
    echo "ERROR: cannot read staged content for $FILE — refusing to validate the worktree instead." >&2
    FAILED=1
    continue
  fi

  # awk discovery — same regex used in WF5 audit (634fd1f) and the
  # batch fix verification (1da51e4). Print ONLY THE FIRST hit per file
  # for a concise error; the developer fixes one, re-runs, sees the next.
  HIT=$(printf '%s\n' "$BLOB" | awk '
    BEGIN { in_down = 0 }
    /^-- DOWN|^-- [-=]+ DOWN/ { in_down = 1; next }
    in_down && /^[[:space:]]*(DROP|ALTER|DELETE|TRUNCATE|CREATE|INSERT|UPDATE|GRANT|REVOKE|COMMENT|REINDEX|REFRESH|RENAME)/ {
      print NR ": " $0
      exit
    }
  ') || {
    # awk's exit status was previously unchecked — the same silent fail-open
    # shape as the AD case this WF fixed, one layer down. An analyser that
    # could not run has not cleared the file.
    echo "ERROR: awk failed while scanning $FILE — refusing to treat that as clean." >&2
    FAILED=1
    continue
  }
  if [ -n "$HIT" ]; then
    BAD_REPORT="${BAD_REPORT}
  ${FILE}:${HIT}"
    FAILED=1
  fi
done

if [ "$FAILED" -eq 1 ]; then
  echo ""
  # Only print the DDL report when there IS one — FAILED can also be set by a
  # git-show failure, and printing this header above an empty body told the
  # operator to fix a problem the hook had not actually found.
  if [ -n "$BAD_REPORT" ]; then
    echo "ERROR: Migration(s) staged with uncommented DDL under '-- DOWN':"
    echo "$BAD_REPORT"
  fi
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
