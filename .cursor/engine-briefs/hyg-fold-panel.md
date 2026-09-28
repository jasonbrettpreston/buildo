---
write_scope:
- tasks/lessons.md
- scripts/hooks/check-partial-staging.sh
- src/tests/hook-partial-staging.infra.test.ts
---
# WF2 hygiene — output-panel fold (2 findings) — STOP BEFORE COMMIT

## F1 (HIGH, Regression Guardian) — `tasks/lessons.md` tells people to run `npx husky`, which REVERTS H6
H6 (committed) moved `core.hooksPath` from husky's generated `.husky/_` to the TRACKED `.husky`, set by `node scripts/hooks/install-hooks.mjs` (run by `prepare` and `npm run worktree:setup`). husky's own install unconditionally runs `git config core.hooksPath .husky/_`, so `npx husky` silently puts the hookless-worktree hole back. In `tasks/lessons.md`, section `## 2026-09-27 — A hook that reads the working tree ...`, the LAST bullet currently ends `After \`npm ci --ignore-scripts\`, run \`npx husky\` in the worktree and confirm \`ls .husky/_/pre-commit\` before the first commit.` Replace that final sentence with: `FIXED by WF2 hygiene H6: hooks now run from the TRACKED \`.husky\` (\`core.hooksPath=.husky\`, set by \`node scripts/hooks/install-hooks.mjs\`). In a fresh worktree run \`npm run worktree:setup\` (it verifies the hooks). NEVER run \`npx husky\` — it resets \`core.hooksPath\` to the generated \`.husky/_\` and reopens the hookless hole.` edit_file only; nothing else in the file.
Lock: in `src/tests/hook-partial-staging.infra.test.ts` add one test (new `describe('docs never instruct npx husky (H6)')`): read `tasks/lessons.md`; every line containing `npx husky` must also contain `NEVER` (case-sensitive). Prove RED by reasoning on the old sentence (it has no NEVER) — state it in a comment.

## F2 (MED, Code Reviewer) — the 50 MB cap fails OPEN on a `git cat-file` error
`scripts/hooks/check-partial-staging.sh`: `s="$(git cat-file -s ":$f" 2>/dev/null || echo 0)"` treats any error as size 0 (allowed). Make it fail CLOSED: if `git cat-file -s` fails, emit the line `<path> (size unreadable)` into the BIG list (so the commit is blocked and the file named). Keep POSIX sh; keep the existing message text; the `(size unreadable)` line flows through the same `if [ -n "$BIG" ]` block. Sketch: `if s="$(git cat-file -s ":$f" 2>/dev/null)"; then [ "$s" -gt "$MAX_BYTES" ] && printf '%s (%s bytes)\n' "$f" "$s"; else printf '%s (size unreadable)\n' "$f"; fi`. Note `--diff-filter=ACMR` means every listed path has an index entry, so the unreadable arm only fires on real corruption — say so in a one-line comment. No new test needed for the corruption arm (cannot be staged portably); existing 51 MB / 1 KB / spaced-path tests must stay green.

## Gate answers
Docs + hook script + test; no descriptor field, logic variable, check limit, emits key or counters source — no Spec 124 §5 R-BA gate reads it.

## Green
`npx vitest run src/tests/hook-partial-staging.infra.test.ts src/tests/hooks-composition.infra.test.ts`.

## Stop
UNCOMMITTED. No git_commit. Report the diff.
