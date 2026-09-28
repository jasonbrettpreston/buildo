#!/bin/sh
# SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-AG
#
# Hook tests the index (WF2 "conversion simplification" item 5). Every
# pre-commit check (step-validate, typecheck, lint, `vitest related`) reads the
# WORKING TREE, so a staged file that ALSO has unstaged edits is tested in a
# state that is not the one being committed — the "green hook, broken committed
# blob" failure of 2026-09-27. Stash-free: the commit is blocked instead, naming
# each such file. Run first in .husky/pre-commit, before any check reads a file.
PARTIAL="$(git diff --cached --name-only --diff-filter=ACMR | while IFS= read -r f; do
  git diff --quiet -- "$f" || printf '%s\n' "$f"
done)"
if [ -n "$PARTIAL" ]; then
  echo "pre-commit: BLOCKED — staged file(s) also have UNSTAGED edits, so the hook would test content you are not committing:"
  printf '%s\n' "$PARTIAL" | sed 's/^/  /'
  echo "Stage each file fully (git add <file>) or take the unstaged edits out of the working tree, then commit."
  exit 1
fi
exit 0
