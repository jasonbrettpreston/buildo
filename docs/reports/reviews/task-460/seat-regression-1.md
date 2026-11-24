# Seat: regression: task-460 plan (PLAN-460-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board head 0ab1aed72 (branch wf2/board; the plan itself cites 5af0f7be2). Read: the whole task-460 file, the brief, GROUNDER-OUTSHAPE.txt, MD:2325-2385 and MD:1915-1925 and :1960-1970, git blame on every test and source line the plan edits, rule-lists.mjs:156-196, :305, :549, :648-662, backlog-lane.mjs:178-195, check-lane-close.mjs:518-575 and :650-664 and :848-858, Spec 08 :340-362 and :263, README :96-106 and :144-155. No FINDINGS-PLAN.md or GROUNDER-PLAN.md exists for task-460 yet (no reviews dir), so nothing is repeated. UNVERIFIED: no test run; whether a `type: 'check'` brief keeps the :411-451 strings; whether the check-lane-close scenario harness closes a check task.

Checked and clean:
- check-lane-close.logic.test.ts:549 (F3(h), commit 0b1c432d5, V2.WHOLE fix round). The retarget to out-code-review is a real lock. :548 already covers the zeroed hash on code-review. The retarget adds the wrong-hash branch for the lens that stays.
- check-lane-close.logic.test.ts:211-217 and :220-228 (add788e33, 5f18d8115, 39ccaad3c). The inversions are consistent with the card, AC #3 and RR-0459. The :212 error-paths part is a ruled loss.
- check-lane-close.logic.test.ts:1275 and :1278-1280 (828ee970e, task-453). They stay and prove emptying output_off puts every list back. The F10 pin (check-lane-close.mjs:855) still holds the range-base output_off, so a lane cannot widen its own switch.
- The rule-lists.logic.test.ts cap cases :932 and :980. They resolve the plan-stage lists, not output_off, so they are not touched by the output change.
- No unlanded wf2 branch conflicts. wf2/board-move differs from HEAD only by deleting both docs, so it is an old base and not a live conflict.
- The task-453 fail-closed intent (a typo in output_off is refused) is kept by `!table.lists?.[id]`. The widening of what output_off may name is ruled by RR-0457 and RR-0458 ("All spec rule lists"; "all front-end back end").
- backlog-lane.logic.test.ts:983-991 (828ee970e). The :990 check-task lock stays. The plan-protocol sentence it pins is replaced by the "none for this task" text, which is a deliberate rewrite.

## rg#1 HIGH: security lens at output is dropped, and the operator's standing RR-0391 order is not named or superseded
Plan: section 4 step 1 (lensSet :194 `out` becomes code-review only), step 5 (the Spec 08 note), section 6 "Known loss" ("for ux and security it is settled by the card").
Evidence: Spec 08 :263 (task-445, RR-0391): "also runs, at plan and at output, when an entry of the task's `Files:` line is under `src/app/api/` or `src/lib/`". MD:1968 and :1969: "Teh missing one is security" and "add it." RR-0391 is "Ruled: a card is opened to widen the security lens". RR-0457 to RR-0459 never mention security. RR-0459 rules only error paths out ("Ruled (RR-0459): error paths is NOT added at the output stage"). The planned note names the output half of rule 4, the task-438 note and the 6.4 OUTPUT column. It does not name the :263 note or RR-0391. After the edit, :263 still says "at plan and at output" while lensSet and the close no longer require it.
The tests that die: rule-lists.logic.test.ts :709, :718, :732 and :739 (D11b, 7b7d6f5f7 and task-445 S1, 39ccaad3c); check-lane-close.logic.test.ts :216-217 and :221-228 (C1(a), C1(b), C1(c)); backlog-lane.logic.test.ts :371 and :385-387 (B1).
Silent loss: money, auth, entitlement, PII, admin, API-route and src/lib code (stripe webhooks, entitlements) get no exploit review at output. The plan itself notes lens-code-review.md:16-21 says it is "NOT responsible for" exploit paths, and the grounder's duty sentences in step 3 do not cover security. The milestone and descriptor duties cover neither security nor ux.
Fix: either (a) have the Spec 08 note name the :263 task-445 note and RR-0391 and say "the output half of that note is superseded for these tasks", and add security to the grounder's duties (one clause: "read each changed file under src/app/api, src/lib or touching money, auth, PII or admin for exploit paths"), or (b) put a one-line question to the operator before the build (Q1-style: security at output on API, lib and money paths, keep or off). My recommendation is (a) with the clause. Do not rely on "settled by the card", because the card's AC #3 only lists the files and the operator did not word security in RR-0457 to RR-0459.

## rg#2 MED: a fix task loses every list at output while its plan stage never had any (the plan builds the loss before it is ruled)
Plan: section 6 SURPRISE 1 and Q1 ("the plan builds A").
Evidence: rule-lists.mjs:654 `const lists = type === 'build' ? r.lists : [];` and check-lane-close.mjs:657-661, where the fix plan gate asks plan lenses only. Today a fix task is held to its output lists by check-lane-close.mjs:525 `(build ? outputLists(...) : r.lists)`, where `build` means code (build or fix). After the edit it gets none at either stage. RR-0457 ("stay on at the plan stage") assumed a plan stage that fix tasks do not have.
Silent loss: for a fix task, every compliance and engineering check disappears from the whole lifecycle, and the rule 2 and rule 4 compliance guarantee at both altitudes (08_agents.md :319 and :348) goes with it. This is unintended: RR-0458 says "applies to all cards" but does not cover a fix card losing its only list review.
Fix: make Q1 a pre-build gate and not an open choice. Either put the A against B one-liner to the operator and hold the build until it is answered, or state in the dated note that fix tasks carry no rule list at either stage as a recorded, accepted consequence. The 14 LATER and 2 RUNNING fix cards are the blast radius.

## rg#3 MED: the engineering seat is supersede-built while its ruling is still an open question
Plan: section 6 SURPRISE 2, Q2, and the note's "task-438 note (engineering at output)".
Evidence: MD:1918 RR-0385 item 2: "a review seat named `engineering`, separate from compliance, at plan and at output". Item 6 says "TESTS are the focus: tests that mirror compliance, the engineering standards". The eng-* lists ride in output_off. The lock at backlog-lane.logic.test.ts:419-437 (a870bdf41 task-431, RR-0385 item 7: eng-front, eng-back and eng-shared named, plus the planted ui-app `not` defect) is moved to a check brief, and the plan marks it UNVERIFIED that the check brief keeps those strings.
Silent loss: the ui-app `not` planted-defect guard (task-431) is lost for build tasks. If the check brief does not carry eng-* lists the same way, it is lost outright.
Fix: record RR-0457's "All spec rule lists" as the ruling for engineering-off (Q2 recommends it, which is fine). Prove the :419-437 lock on a check brief before the edit is called done (a red or green run in the evidence), or keep one `type: 'build'` assertion of the plan-stage engineering resolve (resolveTask lists) so the table row logic stays locked.

## rg#4 LOW: A3 and task-423(d) assertions weakened to presence checks in a way that loses the build-brief per-document lock
Plan: section 5 edits to backlog-lane.logic.test.ts :336-350 (A3), :411-451, :589.
Evidence: :345 `cmds.length ... toBeGreaterThanOrEqual(2)` and :349 `lens-input --list L --context ${ctx}` (a7e366cbb, task-423, RR-0374 "the per-document form is the default"). The plan moves the second to a check brief and weakens the first to `>= 1`.
Silent loss: the lock that a build brief tells the reviewer to pass the five sections and the committed context to every command is still there for the code-review command (cmds >= 1). The lock that a build brief still contains the per-list text is gone, and "ONCE PER RULE LIST" at :439 is also moved. This is a ruled loss (no lists at output), but AC #5 and T10 only check "none for this task", not that the marker survives for check tasks. The plan says the --spec merge at backlog-lane.mjs:228 reads the marker.
Fix: add to T10 one assertion that a build brief still contains "Compliance lens, ONCE PER RULE LIST" (the marker the --spec merge and the D2 regex read).

## rg#5 LOW: the table drift guard T5 and the pre-commit JSON skip
Plan: section 6 risks, T5.
Evidence: the plan itself states .husky/pre-commit:55 skips related tests when only JSON changes. T5 reads `Object.keys(lists)` equals output_off, so any later list added without an output_off id fails CI but may pass the commit.
Silent change: the old output_off list was a subset of every_task (small, stable). The new one is a full copy of the key set that must be kept in step by hand. Failure direction is toward more review, so it is safe.
Fix: none needed beyond the plan's own note; mention it in the PROTECTED FILES note so a later list card knows to add its id.

## rg#6 NIT: Spec 08 dated note and README text left false
Plan: section 4 step 4 and step 5.
Evidence: README :99-104 altitude cells and :154 are covered. README :96 row for `plan-review-deepseek.md` ("plan, and output on money or pipeline work") and the 6.4 footnote ("Sec only on money/auth/PII/admin") are not touched, and Spec 08 :263 (see rg#1) stays.
Fix: add the :263 note to the supersession clause (the rg#1 fix covers it).

STATUS: 6 findings (0 CRITICAL, 1 HIGH, 2 MED, 2 LOW, 1 NIT); the two real regressions are the output security lens dropped without naming RR-0391 and the fix task losing every list before Q1 is answered, and no other guard weakens beyond what RR-0457 to RR-0459 rule.
