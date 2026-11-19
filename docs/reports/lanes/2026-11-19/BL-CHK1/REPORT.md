# REPORT BL-CHK1 (task-3, CHK.1, Increment 1·A)
Rules: re-use ruling MORNING-DECISIONS.md:750-751, build-in-repo :744, RR-0219 :871, 08_agents.md:490, PLAN-PROTOCOL.md:3. Worktree ~/Buildo-wt-chk1, branch wf1/inc1a-chk1. No push, no DB, no other worktree touched.

## What landed
- scripts/hooks/check-task-files.mjs (git mode; own glob matcher, no new dependency: package.json has no glob library; form documented in the script header lines 1-15 and on task-3 Files: line)
- src/tests/backlog/check-task-files.logic.test.ts (16 cases)
- .husky/commit-msg line after G3: `node scripts/hooks/check-task-files.mjs "$1" && \`
- task-3 carries its own `Files:` line (first use), plan and notes via the CLI.

## Evidence
- Plan review r1 (review mode): r1-plan.txt; TRIAGE.md KEEP/REJECT with opened lines; KEPT items folded into the tests (dot escaping, `[` literal, empty entries, `**` zero depth, rename/delete, first-Files:-line).
- RED (pre-commit related run refused the commit with only test + task file + context staged): red.out: "Tests  14 failed | 1 passed (14)... expected -1 to be 5" (wiring test).
- GREEN: commit 978e64e1c, commit.out: "Tests  15 passed (15)", "GATE OK", "POLICY CHECKS OK (commit-msg)". The new check ran in its own commit-msg chain and passed.
- Typecheck: `npm run typecheck` (tsc --noEmit) printed no errors.
- Output review r2 (one lens), r2-output.txt, triaged in TRIAGE.md: 2 KEPT (renamed and deleted task file). red2.out: delete case failed first ("expected +0 to be 1", test at check-task-files.logic.test.ts:134; the rename half already passed by accident of file order, so the rename fix is covered by the same test but was not shown red separately: say UNVERIFIED for rename-red). Green fix fb21775c6, green2.out: "Tests  16 passed (16)", "GATE OK".
- Note: red2 first showed the delete case red for a test-setup reason (git removes the empty backlog/tasks dir), fixed in the test, then green.

## Not checked
- UNVERIFIED: behaviour with real `git commit -- <paths>` partial commits beyond G3's shared assumption; full suite (push station only).
- The task's original AC #1, #3, #4, #5, #8 name plan-panel/brief/McFrontend parts the narrowing dropped: checked as not applicable with a note; #2, #6, #7 held with the evidence above.

STATUS: ready
