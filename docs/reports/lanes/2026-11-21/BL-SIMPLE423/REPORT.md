# REPORT BL-SIMPLE423 (task-423, card A, stage 1: build)

1. What changed: the resolved rule lists are now joined whole, in table order, into one list named `rules` and packed by size, so one compliance call set per stage covers all of them (`lens-input --list rules --lists <ids>`); the close check and the plan gate accept the joined set or the old per-list set and refuse a stage holding both; plan findings are ruled once: when GROUNDER-PLAN.md at the launch commit is non-empty with a Plan line the close needs no plan-*.txt and reads only the out-*.txt findings. The brief says so; dated notes, README items 3 to 5 and the page follow.
2. Measured calls: task-419 plan stage 9 compliance calls become 3 (3 files); task-412 plan stage replay: 11 calls (9 compliance + 2 lenses) became 4 (2 joined compliance parts + plan-review + error-paths); this lane's own output review of an 88,835 character diff took 14 calls (12 joined compliance parts: 4 diff chunks x 3 list parts, plus code-review and error-paths); the 29,700-character pin is at most 3 compliance files.
3. Acceptance printed: (a) 3 files for the task-419 plan, 10 files with --max 60000 each under the bound, stitched parts equal the nine lists; (b) joined accepted, per-list accepted, both/gap/different-list refused, plan gate accepts both forms; (c) plan once, four refusals and the old-rule control; (d) validate refuses a list named rules, page --check current, brief names the joined command; (e) counts pinned at most 3 and 3 for the tooling kind, task-419 and task-412; (f) NOT MET, see item F; (g) below. Full text is on the task (--append-notes).
4. Could not be built as the plan says: nothing stopped. Plan section 1 predicted 3 compliance calls for an output stage of 29,700 characters; this lane's own diff is 88,835 characters, so it needed 12 (the plan lists "a 48,000 character diff: 5"). Acceptance (f) failed its 80 percent bar (item F).
5. Unverified: the hand count of acceptance (f) (below, UNVERIFIED by a second reader); every output finding is untriaged (49 findings in FINDINGS.md: 0 CRIT, 5 HIGH, 17 MED, 27 LOW or NIT); the grounder is owed, the task stays RUNNING.

STATUS: blocked (grounder owed; acceptance (f) not met)

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
