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

# ONE source of truth for the file list, NUL-delimited, with an OBSERVABLE exit
# status. Three constraints force this shape:
#   · git failure must not masquerade as "nothing staged" — command
#     substitution swallows it, and an index lock then produced a clean exit 0
#     having validated nothing;
#   · bash cannot hold NUL bytes in a variable, so `-z` output cannot be
#     captured with $(...) — it goes to a temp file;
#   · `done < <(git diff …)` would run git a SECOND time inside a process
#     substitution whose exit status is unobservable, re-opening the same
#     fail-open one layer down. It is read from the file instead.
STAGED_LIST=$(mktemp) || {
  echo "ERROR: cannot create a temp file to list staged migrations." >&2
  exit 1
}
trap 'rm -f "$STAGED_LIST"' EXIT

if ! git diff --cached --name-only --diff-filter=ACM -z > "$STAGED_LIST"; then
  echo "ERROR: 'git diff --cached' failed — cannot determine staged migrations." >&2
  exit 1
fi

# Filter in the loop, never with grep on a newline list: `core.quotePath` renders
# a non-ASCII path as "migrations/\303\251.sql" (leading quote), which
# `grep -E '^migrations/'` does NOT match — so a non-ASCII migration silently
# skipped validation entirely. -z output is never quoted.
STAGED_MIGRATIONS=()
while IFS= read -r -d '' FILE; do
  case "$FILE" in
    migrations/*.sql) STAGED_MIGRATIONS+=("$FILE") ;;
  esac
done < "$STAGED_LIST"

if [ ${#STAGED_MIGRATIONS[@]} -eq 0 ]; then
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

for FILE in "${STAGED_MIGRATIONS[@]}"; do
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
    // setEncoding BEFORE reading: without it each Buffer chunk is stringified
    // separately, so a multi-byte UTF-8 character split across a 64 KB pipe
    // boundary is corrupted. The old fs.readFileSync(file, "utf8") decoded the
    // whole buffer at once. Inert today (largest migration is ~48 KB) and live
    // the moment one exceeds the pipe chunk size.
    process.stdin.setEncoding("utf8");
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
done

if [ "$FAILED" -eq 1 ]; then
  echo ""
  echo "Every migration MUST have explicitly marked '-- UP' and '-- DOWN' sections (§3.2),"
  echo "and must pass the safety checks in scripts/validate-migration.js."
  echo "NOTE: the STAGED content is validated. If you fixed the file after 'git add',"
  echo "re-stage it (git add <file>) so the fix is what gets committed."
  exit 1
fi

exit 0
