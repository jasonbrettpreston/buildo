#!/usr/bin/env bash
# Enforces §3.2 Migration Rollback Safety:
# Every staged migrations/*.sql file MUST contain explicit UP and DOWN blocks.
#
# VALIDATES THE STAGED BLOB, NOT THE WORKTREE (WF3 2026-07-31).
# This script used to `grep "$FILE"` — the working-tree copy at that path. With
# `git status` showing `AM` (index holds one version, worktree another), a
# plain `git commit` records the INDEX version while this hook validated the
# other one. Reproduced: an unsafe `CREATE INDEX ON permits` with no `-- DOWN`
# committed clean because the worktree copy had been fixed.
#
# FAIL CLOSED. Every path out of this script that is not "the staged content
# was read and satisfied the rules" must be a rejection. A safety gate whose
# validator is missing, whose file list came from a failed git command, or
# whose blob could not be read has NOT validated anything, and must not pass.
#
# Companion: scripts/hooks/check-migration-down-comments.sh (same input, same
# posture, different invariant).
# Behavioural locks: src/tests/migration-hooks.behaviour.test.ts

# Run from the repo root regardless of how the hook was invoked (core.hooksPath,
# a wrapper, or a manual run from a subdirectory).
ROOT=$(git rev-parse --show-toplevel) || {
  echo "ERROR: not inside a git repository — cannot validate migrations." >&2
  exit 1
}
cd "$ROOT" || exit 1

# Separate the git call from the filter so a git failure is not swallowed by
# command substitution. Previously an index lock or corrupt index produced an
# empty list and the hook exited 0 having validated nothing.
if ! ALL_STAGED=$(git diff --cached --name-only --diff-filter=ACM); then
  echo "ERROR: 'git diff --cached' failed — cannot determine staged migrations." >&2
  exit 1
fi

STAGED_MIGRATIONS=$(printf '%s\n' "$ALL_STAGED" | grep -E '^migrations/.*\.sql$' || true)

if [ -z "$STAGED_MIGRATIONS" ]; then
  exit 0
fi

# The node validator carries the DROP guards, the CONCURRENTLY check and the
# NOT-NULL-DEFAULT check. It used to be behind `if command -v node`, i.e.
# OPTIONAL — a missing interpreter silently skipped the very check that catches
# an ACCESS EXCLUSIVE lock on a large table. Absence is now a rejection.
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node is required to validate migrations and was not found on PATH." >&2
  echo "  The DROP/CONCURRENTLY/NOT NULL checks cannot run, so this commit is refused." >&2
  exit 1
fi

FAILED=0

# NUL-delimited so filenames with spaces or newlines survive, and so
# core.quotePath cannot mangle a non-ASCII path into a silent skip.
while IFS= read -r -d '' FILE; do
  case "$FILE" in
    migrations/*.sql) ;;
    *) continue ;;
  esac

  # The bytes git would COMMIT, not the bytes on disk.
  if ! BLOB=$(git show ":$FILE" 2>/dev/null); then
    echo "ERROR: cannot read staged content for $FILE — refusing to validate the worktree instead." >&2
    FAILED=1
    continue
  fi

  # Anchored: a trailing delimiter is required so `-- UPDATE`, `-- DOWNGRADE`
  # or a stray `-- UPLOAD` cannot satisfy the marker check.
  if ! printf '%s\n' "$BLOB" | grep -qiE '^[[:space:]]*--[[:space:]]*UP([[:space:]:]|$)'; then
    echo "ERROR: Migration missing '-- UP' block: $FILE"
    FAILED=1
  fi

  if ! printf '%s\n' "$BLOB" | grep -qiE '^[[:space:]]*--[[:space:]]*DOWN([[:space:]:]|$)'; then
    echo "ERROR: Migration missing '-- DOWN' block: $FILE"
    FAILED=1
  fi

  # Hand the STAGED content to the node validator, telling it the real path so
  # its error messages stay meaningful. `filename` is display-only there
  # (validate-migration.js:164), so passing content on stdin loses nothing.
  if ! printf '%s\n' "$BLOB" | node -e '
    const { validateMigration } = require("./scripts/validate-migration.js");
    let content = "";
    process.stdin.on("data", (d) => { content += d; });
    process.stdin.on("end", () => {
      const { ok, errors, warnings } = validateMigration(content, process.argv[1]);
      for (const w of warnings || []) console.warn(`WARN: ${w}`);
      for (const e of errors || []) console.error(`ERROR: ${e}`);
      process.exit(ok ? 0 : 1);
    });
  ' "$FILE"; then
    FAILED=1
  fi
done < <(git diff --cached --name-only --diff-filter=ACM -z)

if [ "$FAILED" -eq 1 ]; then
  echo ""
  echo "Every migration MUST have explicitly marked '-- UP' and '-- DOWN' sections (§3.2),"
  echo "and must pass the safety checks in scripts/validate-migration.js."
  echo "NOTE: the STAGED content is validated. If you fixed the file after 'git add',"
  echo "re-stage it (git add <file>) so the fix is what gets committed."
  exit 1
fi

exit 0
