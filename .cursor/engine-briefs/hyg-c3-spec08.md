---
write_scope:
- docs/specs/00-architecture/08_agents.md
---
# WF2 hygiene H5/C3 — Spec 08 §C.1.9 sentence for the POSIX process-group kill — STOP BEFORE COMMIT

## Goal
The orchestrator changed `scripts/lib/exec-tools.js` (already in the working tree, uncommitted — READ it, never edit it): on POSIX the bash-tool child is spawned `detached: true` (its own process group) and the timeout SIGKILLs the whole group with `process.kill(-child.pid, 'SIGKILL')` (falling back to `child.kill('SIGKILL')` if the group is already gone); the post-kill settle poll checks the group (`-pid`). Reason: `npm run <script>` makes npm the direct child and the script its grandchild; SIGKILL to the direct child alone left the grandchild running (CI red on Linux; reproduced red in a node:20-bookworm container, green after). Windows is unchanged (killProcessTreeWin32).

## Fix (edit_file only — the spec is large)
In `docs/specs/00-architecture/08_agents.md`, item `9. **Budgets (G6/G8).**` (§C.1, line ~60), replace the words `` `SIGKILL` on POSIX; `` with: `` `SIGKILL` to the child's whole process group on POSIX (the child is spawned `detached`, so `process.kill(-pid, 'SIGKILL')` reaches npm's grandchild too — a direct-child-only kill orphaned it, WF2 hygiene H5/C3 2026-09-27; locked by `deepseek-exec-fences.infra.test.ts` commit 9 on Linux CI); `` Change nothing else in the file.

## Gate answers
Spec prose only; sets no descriptor field, logic variable, check limit, emits key or counters source — no Spec 124 §5 R-BA gate reads it.

## Green
`node scripts/analysis/spec-split-check.mjs --check`.

## Stop
UNCOMMITTED. Do not call git_commit. Report the diff.
