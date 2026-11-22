# REPORT BL-SIMPLE423 (task-423, card A) - final, output round 2 grounded

1. What task-423 now does: plan findings are ruled once (when GROUNDER-PLAN.md at the launch commit is non-empty with a Plan line, the close needs no plan-*.txt and reads only the out-*.txt findings); the generated brief runs no plan lens and orders the compliance review once per rule list at the output stage (the per-document form is the default); a joined form (the resolved lists joined whole into one packed input set, `lens-input --list rules --lists <ids>`) stays in the code as an accepted form that nothing orders, because it was measured at 10 of 15 findings against 14 of 15 for the per-document form (RR-0374); the close and the plan gate accept either form and refuse a mix; a joined round file (-rN, -rN-pN) is read as joined.
2. Acceptance (f) is NOT met (5 of 12 distinct confirmed findings of the task-412 plan stage re-found, the HIGH queue-137#1 missed); it is not claimed and is moved to the later comparison (RR-0374, task-427).
3. Rounds 1 and 2 of the output review are done (RR-0371: at most three): round 1 ruled 49 findings (1 HIGH, 8 MED = one defect, fixed in fix round 1 except p1#3, then fixed by item A); round 2 ruled 87 findings plus the grounder's own: 34 CONFIRMED, all LOW or NIT, 54 REJECTED, no CRITICAL, HIGH or MED open. Outcomes check: "checked 34 ids", no refusal.
4. Calls made: plan-stage replay of task-412 (acceptance (f)) 4; output round 1 14 (12 joined compliance parts, code-review, error-paths); output round 2 21 (18 per-document compliance parts, code-review, error-paths, plus one re-run of out-compliance-ms-S-p1 that failed with "terminated").
5. UNVERIFIED: the full suite was never run by this lane (only the hook's related tests per commit); acceptance (f) hand counts; the hook on the Files-line edit was accepted by the real commit.

Order of work and test counts as the logs print them:
- Build (commit 740ade03d): code first, then the tests; the red was reconstructed (scripts restored from HEAD by git show for the attempt): 21 failed, 284 passed; green 305 passed in 4 files.
- Fix round 1: tests first (red-fix1.out: 12 failed, 226 passed of 238); that red commit did not land; the real commit a7e366cbb printed 13 passed (1 file) + 300 passed (3 files) = 313. (322 passed in 5 files was printed by an earlier attempt that check-task-files then refused over a test file outside the Files line; it never landed.)
- Item A: tests first (red-fix2.out: 2 failed, 20 passed of 22); real commit 5d554f459 printed 13 passed (1 file) + 22 passed (2 files).
- Round 2 review records and this close are records only (no code commit after 5d554f459).

STATUS: ready

---
## Round 1 history (superseded where the lines above differ)

## Commits (all through the real hooks, none bypassed)
- red: a commit attempt with only the four test files and the task file staged, scripts restored to HEAD by `git show` for that attempt: 21 failing assertions at the designed places (red.out; first red attempts stopped at typecheck on a cast, fixed in the test).
- work 740ade03d: build and tests, 305 tests passed in the four files (commit.out).
- docs f5ca453ff: dated notes (08_agents.md section 5.3 and rule 4, 137_mcqueue.md), README items 3 to 5, regenerated page; no code staged.
- records: the output review inputs, outputs, TASK, FINDINGS.md, context-r2.md.

## Pre-Review Self-Checklist (00_engineering_standards.md:287)
1. joinLists returns a copy of the table with one list `rules` (members whole, table order, generated_by joined): PASS (rule-lists.mjs joinLists; test "joinLists: one extra list named rules").
2. listBlocks reads members in order, nothing cut, no table key, no lines/count key: PASS (rule-lists.mjs listBlocks; stitched-parts test).
3. A table list named rules is refused by validate: PASS (test "list rules: the id rules").
4. lens-input --list rules --lists a,b,c writes in-<phase>-compliance-rules[-pN].txt through the existing code: PASS (3 files for the task-419 plan).
5. planPrep runs one lens-input call and reads in-plan-compliance-rules(-pN): PASS (lane tests 5, 7, 15).
6. The close and the plan gate decide the form per phase (joined, per-list, both refused, neither refused naming the joined file first): PASS (check-lane-close tests task-423 (b)).
7. The recompute of the whole list comes from the lists the task resolves now (a different resolved list refused): PASS.
8. GROUNDER-PLAN.md at L non-empty with a Plan line: no plan-*.txt required, none read for findings; absent keeps the old rule: PASS (tests (c)).
9. The brief names the joined command, no longer says copy plan-*.txt; backlog-brief drops the own-plan-lens sentence: PASS (lane and brief tests).
10. Later-card work (card B, rules index, station, round caps, adjustment 5) not built: PASS (diff --stat shows only the Files line paths plus the page).

## Facts verified in the code before relying on them (plan cites are dated 36a2c2d63)
- listBlocks, renderLensInput, buildLensInputs/partsFor, parseLensInput, listProof and planGateInner were opened in rule-lists.mjs and check-lane-close.mjs at the lines they now sit at; the join is read by those unchanged functions. `L` in check() (git log -S<lane assignee>) is the board commit that took the task; GROUNDER-PLAN.md is read there with `git show L:docs/reports/reviews/<id>/GROUNDER-PLAN.md`.
- the brief per-list sentence is backlog-lane.mjs:183 and its merge match :223 (now matches both sentences); backlog-brief.mjs:177 sentence replaced; the brief layout sentence and the parity test fragment were left as they were.
- one design choice: joinLists sorts the given ids into table order (so the order is the table's whatever order --lists gives).

## F. Acceptance (f) replay of the task-412 plan stage (scratch git clone --shared, deleted afterwards)
- Calls: 4 (plan-compliance-rules-p1, -p2 over the nine lists of task-412's Files line; plan-plan-review-deepseek; plan-error-paths), where 11 were made. Plan material: docs/reports/reviews/task-412/context-r1.md (its plan sections equal the stamped material of the original inputs). Outputs: ~/Buildo-scratch/lanes-20261119/inc1b/simple423-lane/replay-clone/replay/ (kept in scratch, not committed: plan-*.txt files in the lane folder are not wanted).
- Findings: compliance 12 (p1 7, p2 5), plan-review 8, error-paths 6.
- plan-compliance-queue-137#1 (HIGH, commit A leaves the task file out of the diff, check-backlog-task G3): NOT re-found. The nearest joined finding is about commit B naming no lane report, compliance set, GROUNDER.md or TRIAGE.md (HIGH).
- Distinct CONFIRMED compliance findings of docs/reports/reviews/task-412/GROUNDER-PLAN.md: 27 lines in about 18 distinct points. Re-found by the joined set (hand count, UNVERIFIED): the "after task-375" gate (HIGH), the tracked-path premise unshown, the rule citation without sha (:350), the missing acceptance criteria, and the commit B close contents (three lines); about 7 of 18, roughly 40 percent, below the 80 percent bar. Not re-found: commit A task file, the self-checklist, the why string RR-0338, the false stated reason, the panel record row, the describe citing Spec 08 without section, the plan-task row, the no-estimate point.
- Points the joined set raised beyond the list above (whether the original eleven outputs raised them too is UNVERIFIED, no full comparison made): no plan evidence set (FOLD-CHECK, seat reports) planned; no TRIAGE step; no push review.
- Reading (not a ruling): the two joined parts are 104,064 and 111,962 characters of rules and plan; one reply per part is shorter per list than nine separate replies, so fewer findings per list; whether that is a loss of coverage or removed duplication is for the grounder and the operator. Plan section 5 said "Not a pass bar on the count of findings"; the 80 percent bar is the task's own acceptance (f) and is recorded as not met.

## Pre-close check on a throwaway clone (real check-lane-close.mjs, task staged BUILT, lane records committed)
    check-lane-close: task-423: the task's references lack the repo copy docs/reports/lanes/2026-11-21/BL-SIMPLE423/REPORT.md: backlog task edit task-423 --add-ref docs/reports/lanes/2026-11-21/BL-SIMPLE423/REPORT.md
    check-lane-close: task-423: the task's references lack the repo copy docs/reports/lanes/2026-11-21/BL-SIMPLE423/GROUNDER.md: backlog task edit task-423 --add-ref docs/reports/lanes/2026-11-21/BL-SIMPLE423/GROUNDER.md
    check-lane-close: task-423: GROUNDER.md is missing in docs/reports/lanes/<date>/BL-SIMPLE423/ (a build or fix task always needs a separate grounder verdict)

No line is about the review material (range, chunks, compliance output, REVIEW header, plan-stage output): the joined out-compliance-rules set, out-code-review-p1 and out-error-paths-p1 pass; the three remaining lines are the references and GROUNDER.md, owed after the grounder rules.

## Files
- Review outputs and inputs: docs/reports/lanes/2026-11-21/BL-SIMPLE423/ (out-compliance-rules-p1..p12, out-code-review-p1, out-error-paths-p1, in- beside each, TASK, FINDINGS.md).
- Task left RUNNING, grounder owed (RR-0359). No plan lens was run by this lane and no plan-*.txt is filed (the plan evidence is on the board).

## Fix round 1 (RR-0374, 2026-11-22)
- Order I worked in: (1) the changed and new tests FIRST, a commit attempt with only tests and the task file staged: 12 failing assertions (red-fix1.out; it did not land); (2) the code; (3) the real commit a7e366cbb (commit-fix1.out: 322 passed in the five test files; the first green attempt was refused by check-task-files because src/tests/backlog/backlog-brief-context.logic.test.ts is outside the Files line, so that test and backlog-brief.mjs were left as they were and the commit repeated). The red test edits and the code landed in the same commit because the red commit never landed.
- Acceptance (f) is NOT met (5 of 12 distinct confirmed findings, the HIGH queue-137#1 missed); the per-document form is the default again; nothing here claims (f) met.
- 1a (D2): backlog-lane.mjs: the compliance sentence is output stage only, the Plan review lenses clause, the plan-<lens>.txt output sentence and the extra plan "Review (review mode ...)" entry are gone. NOT DONE: backlog-brief.mjs:178 "Review (plan or output): ... plan-review-deepseek.md" stays, because the test that pins it (src/tests/backlog/backlog-brief-context.logic.test.ts:43) is outside the Files line of task-423 and check-task-files refused the commit; needs the Files line to name that test, then one line and one test line change. out-compliance-rules-p1#3 (MED) is therefore open.
- 1c: the per text now orders one run per rule list at the output stage and names the joined run in one clause as an accepted form that is not the default (RR-0374, measured). plan-prep produces the per-list inputs again (rule-lists.mjs planPrep; no flag added); joinLists, JOINED_ID, members, --lists, complianceSetErrors and the validate refusal stay.
- 1b (D1): isJoined accepts -rN and -rN-pN; test: joined round 1 plus joined round 2 closes, a per-list file beside the joined set is refused.
- Piled with reasons (RR-0364): all LOW and NIT except p8#4, fixed (header comment line in a file touched).
- Notes in Spec 08 (two), Spec 137 and README items 3 and 5 now say the join is accepted, not the default; page regenerated.
- Outcomes check: see outcomes.out in the lane directory of the scratch folder (one refusal: p1#3).
