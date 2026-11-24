# Seat: integration: task-453 plan (PLAN-453-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board ~/Buildo-wt-board, branch wf2/board, head 9a10561ef (tree has unrelated task-449 edits). I read the whole task-453 file and task-453/FINDINGS-PLAN.md. In the code I read rule-lists.json, rule-lists.mjs, check-lane-close.mjs (:1-200, :300-460, :462-880), backlog-lane.mjs (:60-215), backlog-brief.mjs, review-template.js, proof-slice.mjs and proof-slices.json, plus the README and migrate.js. In tests I read check-lane-close, backlog-lane, rule-lists, rule-lists-table, backlog-brief, review-templates and proof-slice. I ran no test runner. I ran only `rule-lists.mjs resolve` (read-only) and small node regex checks.
Nothing was UNVERIFIED because of denied calls. The MERGE_HEAD harness question (plan section 9) I did not run.

## Checked and clean (no finding)
- rule-lists.json: :22 protected_paths, :163 lane-tools globs, :165 lane-tools lists, :236 every_task, :24/:44/:47 list definitions all match the plan. `resolve --files scripts/gemini-review.js` is refused today (matched by no row), so T2 is real. The card's own Files line resolves; its lists are agents-s5-1to3, agents-s7-s11, queue-137, eng-all, orchestrator-doc17, step-132, five-words, plan-protocol, inc-S, ms-S.
- rule-lists.mjs: :156-157, :270, :290-294 (verifyResolved), :582 CALL_MS, :600 sh, :654 plan-prep lists, :753, :134/:141 (null list or row throws today) are all as the plan says.
- Callers of every_task and verifyResolved. validate, resolveTask, check-tasks, backlog-lane.mjs:80, plan-prep :640 and check-lane-close :488 all use the shared guards, which stay green with every_task = ["plan-protocol"].
- check-lane-close.mjs: :144, :147, :359-376, :465, :494-496, :518, :521, :633-658, :665, :720-721, :731, :735, :736-745, :752-753, :759, :839-842 all match. :842 is the right place for an output_off pin. The `build` variable at :465 does mean build or fix.
- Only backlog-lane.mjs:96 calls planGateErrors. It passes the real ruleTable.
- Test cites match: rule-lists.logic :72, :346, :358, :377, :391-392, :465, :965, :993, :1105; rule-lists-table :30, :37, :38, :44, :49, :168, :210, :229, :243, :372; check-lane-close :23, :405-408, :656, :761; backlog-lane :684/:686; proof-slice.logic :228 (and ST5 does need that id removed).
- Spec 08: rule 3 is at :350, rule 6 at :359 today, and the note below rule 4's notes moves rule 6 to :360. The plan's T12 numbers are right (the code comments still say :346 and :350).
- DeepSeek ruled findings I can add facts to. `ac` is always an array (backlog-brief.mjs:40), so `ac.length === 0` cannot throw. `sh` does not run the review calls (they use runAsync with CALL_MS, rule-lists.mjs:690); it runs the brief, lens-input, backlog edit and the gate dry run. The proof-slice spawn uses encoding utf8 (:146). DEEPSEEK_REVIEW_TIMEOUT_MS is the name deepseek-review.js:36 reads.
- Historic seat ids are only in#, rc# and rg# (no hyphen), so widening SEAT_LINE drops nothing real.
- The page `--write` command exists (rule-lists.mjs:13). The `notbuilt` row with a reason is allowed (proof-slice.mjs:62-67).

## in#1 HIGH: two pinned plan-prep tests for fix tasks invert and the plan does not list them
Plan: section 3 item 1, "plan-prep :654 ... a fix task also gets the output_off lists at the plan stage"; section 5 backlog-lane tests list only :684/:686, D4, D16 and the brief ids.
Evidence: backlog-lane.logic.test.ts:739-744 "16: a fix task writes the plan lens outputs and no per-list inputs" expects `['plan-error-paths.txt','plan-plan-review-deepseek.txt']` and `names(f, /^in-/)` equal to `[]`. :746-751 "B2 (task-445)" expects the three-file list. plan-prep reads the real table (rule-lists.mjs:635 `readTable(DEFAULT_TABLE)`, :28), so after the plan's change both fix runs also write plan-compliance-plan-protocol.txt and an in- input. Both tests fail.
Fix: add "rewrite :739-751 (fix writes the output_off list's plan-compliance output and input too)" to section 5, with the new expected names.

## in#2 HIGH: the S5 test case cannot go red to green
Plan: item 5 S5 and section 5 "S5: reason 'NIT-picking aside ...' with pile on a CRITICAL → refused".
Evidence: I ran the old regex `/\b(CRITICAL|CRIT|HIGH|MEDIUM|MED|LOW|NIT)\b/` and the new `/^\W*(…)\b/` on "NIT-picking aside, this is a real bug that breaks close". Both return NIT, because `\b` falls between NIT and "-". The anchored form still lowers the severity, so the test is green before the fix. The only existing use is check-lane-close.mjs:193.
Fix: use a reason with the word mid-sentence, such as "a real bug, not a NIT" (old gives NIT, new gives none), and keep :733 "LOW: cosmetic only" as the control.

## in#3 HIGH: the card edits a test file outside its Files line, so its own close is refused
Plan: item 6 ST5 and section 5 mark src/tests/proof-slice.logic.test.ts :228 "OUTSIDE FILES LINE" (also for the T4 stub test). Nothing says to add it to the Files line.
Evidence: check-lane-close.mjs:494 `outside = i.changed.filter(... !coveredBy(entries, p))` refuses any changed path outside `docs/reports` and `backlog` that is not covered. The Files line at task-453:35 does not name src/tests/proof-slice.logic.test.ts. Without the edit, ST5 turns the test at :228 red (it expects `expect` on chk3-nothing-new).
Fix: add a step in section 7 to run `backlog task edit 453 --files ...` and add this file to the Files line before launch. The close reads the union of the launch and staged Files (:844-845).

## in#4 HIGH: editing migration 334 changes its checksum, and the plan contradicts itself on whether to do it
Plan: item 6 "T12 migration 334 (b): add the pre-334 description to the commented DOWN line"; section 8 item 4 "Recommend the runbook"; section 9 checks only validate-migrations.sh and check-migration-down-comments.sh.
Evidence: scripts/migrate.js:12 "checksum — SHA-256 of the file contents at apply time"; :19 "--verify exit non-zero if any checksum differs from what was applied"; :59-69 only normalises CRLF, so comment text is hashed. migrations/334_…sql was applied (last commits b341e374b, 0e5f82f00). A comment edit gives a DRIFT on every database that has 334 applied.
Fix: drop 334 from item 6 and the Files line and put the note in the runbook (the section 8 recommendation). Otherwise the plan must name the reconcile step (`scripts/analysis/reconcile-migration-checksums.js`) and the checksum verify as the check. The plan cannot both do it and recommend not doing it.

## in#5 MED: S2's "table = boardTable after :731" is unreachable
Plan: item 5 S2 "return 0 only when the board ref has no table either ... `table = boardTable` after :731".
Evidence: check-lane-close.mjs:726-727 `try { table = readTable(tableFile); } catch (e) { return fail([...cannot read ...]) }` runs before :731. For a branch with no table file, the close already refuses at :727 once the :725 return is removed, and the board copy is never used. AC #3 says "still reads the board". The boardRef is also computed only at :729, after the return at :725.
Fix: say which is meant. Either (a) refuse with the board named, which is a simpler 2-line change, or (b) move the boardRef and board table reads above :725, skip readTable when the file is absent, and set `table = boardTable`. Add a test that distinguishes them (the close judged by board lists).

## in#6 MED: the ST4 data line refuses every in-flight lane at close, not only this card
Plan: ST4 adds backlog-lib.mjs to protected_paths at rule-lists.json:22; section 6 covers only this card's own close.
Evidence: check-lane-close.mjs:759 `for (const k of ['base_ref','finished_statuses','protected_paths','exempt']) if (JSON.stringify(table[k]) !== JSON.stringify(boardTable[k])) errors.push(...)`. After the fold, any lane whose branch table lacks the new line (RUNNING cards such as task-395 and task-396 are open) gets "differs from the board's" at its close until it merges the board.
Fix: add one sentence to section 6 and a note on the open lanes that they must merge the board before closing. This is separate from FINDINGS-PLAN #9, which is about Files lines.

## in#7 MED: the new fix plan gate hits the sibling SEARCHFIX cards; the section 6 sentence is garbled
Plan: section 6 "A fix card launched before this lands without it is refused at launch only; RUNNING cards are not re-gated."
Evidence: task-449 (9 files) and task-450 (6 files) are type fix, LATER, ordinal 150010 and 150020 (before this card's 150030), and have plan evidence folders with no plan-compliance file. plan-prep builds none for a fix card today (rule-lists.mjs:654). Launching them after this lands makes backlog-lane.mjs:96 refuse them. task-451, task-454, task-455 and task-456 have no folders yet. The sentence says "launched before this lands ... refused", which is backwards. (FINDINGS-PLAN already covers RUNNING cards at close; this is about launch.)
Fix: reword to "a fix card launching after this lands needs plan-compliance-plan-protocol in its folder; task-449 and task-450 already have evidence without it and must either launch before this lands or be re-run through plan-prep".

## in#8 MED: the brief filter is unconditional but the close filter is for build and fix only
Plan: item 1 "backlog-lane.mjs:183, filter the output-stage ids through outputLists"; "check-lane-close.mjs :521, for a build or fix task".
Evidence: backlog-lane.mjs:177-183 `lensLine(task, ctx, lists)` is called for every task type (:211). For a `check` task, closeErrors uses `phases = build ? ['out'] : ['plan','out']` (:518) with no filter, so the close still requires the plan-protocol output that the brief now tells the lane not to write. A lane assignee is required for check tasks (:469).
Fix: apply outputLists in lensLine only when the type is build or fix, with the same predicate as :521, and add a check-type case to the tests.

## in#9 MED: T1's existing test breaks and its ":187" claim is false
Plan: item 6 T1 "backlog-brief.mjs:176 ... Rule 3 as amended (Spec 137 Rule 3 note ...). :187 says 'two commits'."
Evidence: backlog-brief.logic.test.ts:47 `expect(r.stdout).toMatch(/Spec 137 rule 3/)` runs on a `--type build` fixture (:15). The replacement text "Spec 137 Rule 3" (capital R) fails that case-sensitive match. The plan lists no edit of :47. `grep -n "two commits" backlog-brief.mjs` returns nothing, and :187 is the Close line with no such text; the ticket never says "two commits". The plan's test "names the two-commit close" is therefore new text, not a fix of a quoted one.
Fix: say "the Status line (:176) is replaced for build and fix; keep the substring `Spec 137 rule 3` or edit :47". Drop the ":187 says two commits" claim, or name the real line.

## in#10 LOW: citations that do not match the file
Plan: item 5 T10, T9, S9, T12 and item 2 text lines.
Evidence:
- "T10 :558 the catch" is at rule-lists.mjs:555 (`catch { p = 0; }`); :558 is a closing brace.
- "T9 backlog-lane.mjs:109" is a comment; the `fail` function is at :113.
- "S9 ... the existing id-versus-number check (:791)" is at :784; :791 sets boardType.
- Item 2 text lines "rule-lists.mjs :12, :287" and "check-lane-close.mjs :12" contain no "five words" (:156, :270, :293, :543 and check-lane-close :486/:489 do). backlog-lane.mjs:80 does and is not listed.
- T12 ":200" has no spec citation (only :139 and :199 do). check-lane-close.mjs:507 cites "08_agents.md:357 note", which also moves.
Fix: correct these numbers so the builder does not edit the wrong lines.

## in#11 LOW: test seams the plan assumes are missing
Plan: section 5 "review-templates.logic.test.ts: context-r2 only → next round 3"; "the T4 head with a stub spawn ... exit 2" (section 9 marks the first UNVERIFIED).
Evidence: review-templates.logic.test.ts imports only vitest, fs, path and ./helpers (:3-6) and never requires review-template.js; no test calls contextRound (it is exercised only through backlog-lane tests :523-528). proof-slice.mjs:140-146 `realIo()` computes head eagerly with no injection point; the existing empty-head case already exists at proof-slice.logic.test.ts:217.
Fix: say the T7 test needs a new `createRequire` of the CJS module, and that T4 needs `vi.doMock('node:child_process')`, or drop the T4 test since :217 already pins exit 2.

## in#12 LOW: seatFindings can throw on a missing or edited seat file
Plan: item 5 S1 "seatFindings(seats) → [{id, line}] ... add its findings at :577 and :665".
Evidence: seatLines returns `text: null` for a missing file (:150), and outcomeErrors guards null text, a wrong sha and a seat path outside the root (:171-175). At :665 `seats` is built later (:670), and at :577 closeErrors has no try/catch (only planGateErrors is wrapped, :611), so a null text would crash the close.
Fix: state that seatFindings skips seats with null text, a wrong sha or a path outside the root (outcomeErrors already refuses those), and that at :665 seatLines is computed first.

STATUS: 12 findings (4 HIGH, 5 MED, 3 LOW); plan's citations are mostly accurate, but it breaks two pinned fix-task tests, needs an untestable S5 case replaced, and cannot close on its own Files line or migration edit as written.
