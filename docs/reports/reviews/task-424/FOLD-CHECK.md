# Fold check: task-424 plan (PLAN-424-v1 as folded), plan review round 1

Checked by: Cairn-Ground-P424

On the board working tree (~/Buildo-wt-board, head 1397e3cb0), the task-424 card as it stands after the fold, the Description edit and `plan-prep post`. Read-only; every check ran in memory with node, the board's own `planHash` and `planGateErrors`. The review folder docs/reports/reviews/task-424/ is still untracked at this head, so the checks read it from the working tree. At a git HEAD `planGateErrors` would see an empty folder until the plan-prep commit adds it.

(1) PASS. All 60 folded-quote strings of TRIAGE-PLAN.md are present in the card's plan text. Each is 20 or more characters, none has a space as its 20th character, and none contains a backtick, asterisk or double quote. TRIAGE-PLAN.md has 64 outcome lines: 60 folded and 4 pile. No CONFIRMED CRITICAL, HIGH or MED has a pile outcome. The verdict quotes were checked by `planGateErrors` itself (Ruled lines, one quote per finding, a quote on the cited line, no lane-report cite, no space in a path). It raised nothing on them.

(2) PASS. The folded plan is internally consistent:
- The list text, the hook splice, the station replacement, T1 to T5, the moved pins, A1 to A9 and the section 7 sequence all describe the one design: six chain lines, with `step()`, `GATE_MODE` and `SUITE_ARGS` set by each caller.
- "push mode", "station mode", "die line", `<lane-wt>`, "sh .husky/pre-push-checks.sh" and "Q1)" occur 0 times.
- "T3" occurs 3 times, all deliberate: the planted-predicate row, "T3 green" in the red evidence line, and Q3's "the first draft's T3 is dropped".
- "UNVERIFIED" occurs once, in the 2026-11-22 incident paragraph that the fold did not touch.
- The station text keeps :41 `step()` and `rc=0`, replaces only :43-48, and A5 and rollback use `station.sh.pre-424`.
- The plan is 27,087 characters with the round block (24,909 before it).
- I replayed the shell semantics of the six lines under `/bin/sh` earlier. Failing each step stops the chain, and all-pass gives 0.

(3) PASS. The round block reads "Plan review round 1: 60 folded, 0 task, 0 ruling, 0 wontfix, 4 pile; grounder docs/reports/reviews/task-424/GROUNDER-PLAN.md; triage docs/reports/reviews/task-424/TRIAGE-PLAN.md". It equals TRIAGE-PLAN.md. The card carries the 5 references: GROUNDER-PLAN.md, TRIAGE-PLAN.md and the three seat reports.

(4) PASS. `filesEntries` on the card returns exactly the six entries (.husky/pre-push, .husky/pre-push-checks.sh, scripts/analysis/step-validate.mjs, the two tests, CLAUDE.md). The first `Files:` line is now the six-entry line, the same as the plan's section 6 line. The `Files:` token occurs 3 times in the card: the Description line, the plan's section 6 line, and the sentence in section 6 that tells the orchestrator to remove the stale first `Files:` line. The gate resolves 9 lists, the same nine as with the old one-entry line, so no second plan round is owed.

(5) PASS with one form correction to GROUNDER-PLAN.md. I ran `planGateErrors` for lane BL-ONE424 on the tree as it is. It resolves 9 lists and rules 85 findings. The compliance and engineering outputs, seats, outcomes, references and round block raise nothing. The only two refusals were the missing last Plan line in GROUNDER-PLAN.md and the missing FOLD-CHECK.md. With the Plan line appended to GROUNDER-PLAN.md and this file present, `planGateErrors` returns 0 errors. The hash from the checker's own `planHash` on this card is fe06800270f3.

Verdict: PASS

Plan: task-424 sha256:fe06800270f3
