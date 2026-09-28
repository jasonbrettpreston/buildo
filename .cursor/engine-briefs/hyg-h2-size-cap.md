---
write_scope:
- scripts/hooks/check-partial-staging.sh
- src/tests/hook-partial-staging.infra.test.ts
- docs/specs/01-pipeline/124_step_standard_policy.md
---
# WF2 hygiene H2 — 50 MB staged-blob cap in the EXISTING pre-commit preamble — STOP BEFORE COMMIT

## Goal
GitHub warns at 50 MB and rejects at 100 MB; three 92 MB before-image files reached history. Close the class in the staged-content preamble that already runs first in `.husky/pre-commit` (`scripts/hooks/check-partial-staging.sh`, POSIX sh). No new hook file, no `.husky/*` edit.

## Red first — extend `src/tests/hook-partial-staging.infra.test.ts`
Add a `describe('pre-commit refuses a staged blob over 50 MB')` reusing the file's own `git`/`runCheck`/`write` helpers and throwaway repo (never the real repo):
- RED: write `big.bin` = `Buffer.alloc(51 * 1024 * 1024)`, `git add big.bin`, `runCheck()` → status 1; stdout contains `big.bin`, `50 MB` and `.gitignore`. Then `git reset -q` and delete the file.
- GREEN: a 1 KB `small.bin` staged → status 0. Clean up.
- EDGE: a staged path with a space (`big file.bin`, 51 MB) is named intact.
Run it and confirm the RED case fails before the fix.

## Fix — `scripts/hooks/check-partial-staging.sh`
Before the final `exit 0`, add a second block (keep the partial-staging block byte-identical):
```
MAX_BYTES=52428800  # 50 MB: GitHub warns at 50 MB and rejects at 100 MB
BIG="$(git diff --cached --name-only --diff-filter=ACMR | while IFS= read -r f; do
  s="$(git cat-file -s ":$f" 2>/dev/null || echo 0)"
  [ "$s" -gt "$MAX_BYTES" ] && printf '%s (%s bytes)\n' "$f" "$s"
done)"
```
If non-empty: print `pre-commit: BLOCKED — staged file(s) over the 50 MB cap (GitHub rejects at 100 MB; history is never rewritten, so a big blob is permanent):`, the list indented two spaces, then `Unstage it (git restore --staged <file>) and add an ignore rule for it to .gitignore.` and `exit 1`. Update the header comment: the preamble now refuses (1) partial staging and (2) a staged blob > 50 MB (WF2 hygiene H2). Must stay POSIX sh (no bash arrays); the `while` subshell output capture as shown avoids the lost-exit-status trap.

## Spec row
In `docs/specs/01-pipeline/124_step_standard_policy.md`, row `| R-AG |`, insert immediately before the text `Both directions locked by \`src/tests/hooks-composition.infra.test.ts\`` this sentence: `The pre-commit preamble \`scripts/hooks/check-partial-staging.sh\` runs first and refuses (1) a staged file that also has unstaged edits and (2) a staged blob over 50 MB (WF2 hygiene H2, 2026-09-27; locked by \`src/tests/hook-partial-staging.infra.test.ts\`). ` edit_file only; change nothing else.

## Gate answers
No descriptor field, logic variable, check limit, emits key or counters source — a git hook script + its test + spec prose; no Spec 124 §5 R-BA gate reads it.

## Green
`npx vitest run src/tests/hook-partial-staging.infra.test.ts src/tests/hooks-composition.infra.test.ts`; `node scripts/analysis/spec-split-check.mjs --check`.

## Stop
UNCOMMITTED. Do not call git_commit. Report the diff.
