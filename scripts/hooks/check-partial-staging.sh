#!/bin/sh
# SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-AG
#
# Hook tests the index (WF2 "conversion simplification" item 5). Every
# pre-commit check (step-validate, typecheck, lint, `vitest related`) reads the
# WORKING TREE, so a staged file that ALSO has unstaged edits is tested in a
# state that is not the one being committed — the "green hook, broken committed
# blob" failure of 2026-09-27. Stash-free: the commit is blocked instead, naming
# each such file. Run first in .husky/pre-commit, before any check reads a file.
# Second block (WF2 hygiene H2): the same preamble refuses a staged blob over
# 50 MB — GitHub warns at 50 MB and rejects at 100 MB, and history is never
# rewritten, so a big blob that lands is permanent.
PARTIAL="$(git diff --cached --name-only --diff-filter=ACMR | while IFS= read -r f; do
  git diff --quiet -- "$f" || printf '%s\n' "$f"
done)"
if [ -n "$PARTIAL" ]; then
  echo "pre-commit: BLOCKED — staged file(s) also have UNSTAGED edits, so the hook would test content you are not committing:"
  printf '%s\n' "$PARTIAL" | sed 's/^/  /'
  echo "Stage each file fully (git add <file>) or take the unstaged edits out of the working tree, then commit."
  exit 1
fi
MAX_BYTES=52428800  # 50 MB: GitHub warns at 50 MB and rejects at 100 MB
BIG="$(git diff --cached --name-only --diff-filter=ACMR | while IFS= read -r f; do
  s="$(git cat-file -s ":$f" 2>/dev/null || echo 0)"
  [ "$s" -gt "$MAX_BYTES" ] && printf '%s (%s bytes)\n' "$f" "$s"
done)"
if [ -n "$BIG" ]; then
  echo "pre-commit: BLOCKED — staged file(s) over the 50 MB cap (GitHub rejects at 100 MB; history is never rewritten, so a big blob is permanent):"
  printf '%s\n' "$BIG" | sed 's/^/  /'
  echo "Unstage it (git restore --staged <file>) and add an ignore rule for it to .gitignore."
  exit 1
fi
exit 0
