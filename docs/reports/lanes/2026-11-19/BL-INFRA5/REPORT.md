# REPORT BL-INFRA5 (task-8, INFRA.5, Increment 1·A)
Rules: RR-0141 (lock, not a message channel), RR-0149/0150 (built in the repo), RR-0219, 08_agents.md:490 (red first), PLAN-PROTOCOL.md:3.

## What landed (evidence)
- Module scripts/analysis/lane-claims.mjs: claim, release, list, check, owner; segment-wise overlap; realpath resolve; mkdir pid lock + atomic write; registry LANES_FILE, default ~/Buildo-scratch/panel-tools/lanes.json (same JSON shape: lane, paths, expires, ts, pathTs). Commits: eb57bad40 (module + tests + context + task file), 961f69994 (r2 fixes).
- Test src/tests/backlog/lane-claims.logic.test.ts: 15 tests (claim/overlap refusal naming holder, release, expired ignored, check/owner, symlink same claim, symlink made after claim, 6 concurrent claimers one winner, dead-pid lock reclaimed, corrupt registry exit 3, usage exit 2, dot-dot, parent dir, ttl).
- Red (red.out): "Test Files  1 failed (1) / Tests  13 failed (13)" on the commit attempt with only test, task-8 file and context staged; commit refused (rc=1).
- Green (commit.out): "Tests  13 passed (13)", "GATE OK", "[wf1/inc1a-infra5 eb57bad40]". Fix commit (fix.out): "Tests  15 passed (15)", landed 961f69994.
- `npm run typecheck`: tsc --noEmit, no errors (run after eb57bad40; not re-run after 961f69994: UNVERIFIED for the fix commit beyond the pre-commit hook's own typecheck, which passed since the commit landed).
- Review r1 (plan, r1-plan.txt) and r2 (output, one lens, r2-output.txt), both triaged in TRIAGE.md; 7 plan and 7 output findings kept and fixed or built in, the rest rejected with reason.

## Notes
- Advisory lock, single host, cooperative callers; no hook edited; pack cache dropped (pass 2). The hook switch to this module is the orchestrator's step after the push.
- Deviation: red commit attempt included the task-8 file and context as the brief says; the module landed in one commit with the test (red was refused, so the test was never committed alone).
- Not checked: the real hook ~/.claude/hooks/lane-guard.mjs reading a file written by this module (shape is the same; UNVERIFIED by execution).
- Rejected follow-ups (TRIAGE.md r2): ownership-blind lock release on a double stale-reclaim, case folding on APFS, fsync/backup of the registry.
