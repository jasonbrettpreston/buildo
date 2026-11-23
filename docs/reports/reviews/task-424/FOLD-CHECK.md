# Fold check: task-424 plan (PLAN-424-v1 as folded, fold 1 and the RR-0398 glob fold 2), plan review round 1

Checked by: Cairn-Ground-P424

On the board working tree (~/Buildo-wt-board, head 7a3173e5e), the task-424 card as it stands after the first fold, the Description edit, `plan-prep post` and the star-entry fold. Read-only; every check ran in memory with node, the board's own `planHash`, `filesEntries`, `coveredBy` and `planGateErrors`. The review folder docs/reports/reviews/task-424/ is untracked at this head, so it was read from the working tree.

(1) PASS. All 60 folded-quote strings of TRIAGE-PLAN.md are present in the card's plan text. Each is 20 or more characters, none has a space as its 20th character, and none contains a backtick, asterisk or double quote. TRIAGE-PLAN.md has 64 outcome lines: 60 folded and 4 pile. No CONFIRMED CRITICAL, HIGH or MED has a pile outcome. No quote or verdict quote contains the old fork-cap test file name, so the glob fold lost none of them. The verdict checks (Ruled lines, one quote per finding, quote on the cited line, no lane-report cite, no space in a path) raise nothing.

(2) PASS. The folded plan is internally consistent. The list text, the hook splice, the station replacement (:43-48 only), T1 to T5, the moved pins, A1 to A9 and the section 7 sequence all describe the one design: six chain lines, with `step()`, `GATE_MODE` and `SUITE_ARGS` set by each caller. "push mode", "station mode", "die line" and `<lane-wt>` occur 0 times. "T3" occurs 3 times, all deliberate (the planted-predicate row, "T3 green" in the red evidence line, and Q3's "the first draft's T3 is dropped"). The old runner-named fork-cap test path occurs 0 times in the plan, and the glob `src/tests/step-validate-*-fork-cap.infra.test.ts` occurs 3 times (the section 5 fork-cap line, the section 6 Files line, and A1). The plan field is 27,221 characters by my extraction.

(3) PASS. The round block reads "Plan review round 1: 60 folded, 0 task, 0 ruling, 0 wontfix, 4 pile; grounder docs/reports/reviews/task-424/GROUNDER-PLAN.md; triage docs/reports/reviews/task-424/TRIAGE-PLAN.md". It equals TRIAGE-PLAN.md, and the 5 references are on the card.

(4) PASS. `filesEntries` on the card returns exactly six entries: .husky/pre-push, .husky/pre-push-checks.sh, scripts/analysis/step-validate.mjs, src/tests/hooks-composition.infra.test.ts, src/tests/step-validate-*-fork-cap.infra.test.ts, CLAUDE.md. The star entry is operator-approved under RR-0398 (decision-183, MORNING-DECISIONS.md:2012, "a approved. Let's get to work"). With `coveredBy` over the tracked files in src/tests it matches exactly one file, the existing fork-cap test, and no other. The Description's Files line is the same line as the plan's section 6 line. The `Files:` token occurs 3 times on the card: the Description line, the plan's section 6 line, and the sentence in section 6 that tells the orchestrator to remove the stale first `Files:` line. The gate resolves 9 lists, the same nine as before.

(5) PASS. `planGateErrors` for lane BL-ONE424 on the card as it stands resolves 9 lists and rules 85 findings. With the files as they are now it raises only two errors: the Plan line in GROUNDER-PLAN.md and the one in FOLD-CHECK.md still carry the old hash fe06800270f3, which is not the hash of the card after the glob fold. With the new Plan line below in both files, and this file in place, it returns 0 errors. The new hash is the one the board's `planHash` computes on this card.

Verdict: PASS

Plan: task-424 sha256:f5dd0e203793
