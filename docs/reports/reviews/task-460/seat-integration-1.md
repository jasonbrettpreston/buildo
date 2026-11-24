# Seat: integration: task-460 plan (PLAN-460-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board wf2/board. Head was 0ab1aed72 when I started and 66ea5bb89 at the end (board-edit commits only). The plan's basis 5af0f7be2 is an ancestor. `git diff 5af0f7be2..HEAD` over scripts/analysis, .claude/review-templates, Spec 08, the generated page, src/tests/backlog and .husky is empty, so every file:line below was read at the plan's own basis.
Read: task-460 (whole file), GROUNDER-OUTSHAPE.txt, MD:2320-2385 (RR-0450, 0452, 0457, 0458, 0459), rule-lists.mjs :150-200, :300-310, :545-552, :648-662, rule-lists.json :5-25 and :236-240, backlog-lane.mjs :176-232, check-lane-close.mjs :145-200, :350-360, :468-583, :655-662, :850-857, the README table and items, Spec 08 :317-362, .husky/pre-commit :40-56, and the three test files at the cited lines. I also read the task-452 and task-461 cards and their review folders. Nothing was run. I made no edit. Spec 08 byte budget (spec-split-check arm iv): UNVERIFIED for this spec.

## Checked and clean
- rule-lists.mjs :160-161 (validate, "is not in every_task"), :193 plan and :194 out (the plan's correction of the grounder's :193 is right), :306 outputLists, :549 page sentence and :654 `type === 'build' ? r.lists : []` all match the plan's text.
- rule-lists.json :238 is `"output_off": ["plan-protocol"]`. `every_task` is `["plan-protocol"]`. `lists` has 58 keys, and the plan's 58-id order equals `Object.keys(lists)` (read by node -e). :23 `protected_paths` names both rule-lists files.
- backlog-lane.mjs :184 outLs, :188 per, :190 layout, :191 grounder, :228 merge marker regex (`Compliance lens, (ONCE PER RULE LIST|ONE JOINED RUN PER STAGE)`). The plan's :189 and :193 corrections of the grounder are right.
- check-lane-close.mjs :525 `(build ? outputLists(...) : r.lists)`, :526 `if (ls.length)`, :529-563 the lensSet.out loop, :353-358 the Ruled-line check, :147-153 SEAT_HEAD and SEAT_LINE, :855 F10 judge, and :657-661 the fix plan gate (plan lens files only).
- Only rule-lists.mjs, backlog-lane.mjs, check-lane-close.mjs, the three test files, the README, Spec 08, plan-protocol.md and the json read `lensSet`, `outputLists` or `output_off`. Nothing on phone, web or admin does. plan-protocol.md:3 stays true.
- README rows :99 and :100 (compliance and engineering), :102-104 (ux, error-paths, security), :146 (Task-453 sentence) and :154 (item 5 close list) are as the plan says. The grounder's ":101-104" was off by one. README :154 is the only place outside the code that lists `out-error-paths.txt`, `out-ux.txt` and `out-security.txt`. Spec 08 and plan-protocol.md hold none.
- Spec 08 :351 is rule 4 and :358 is the task-453 note, the last one before "5. **Panel sizing". .husky/pre-commit :44 is `page --check`. :55 is the related-tests filter, so a JSON-only commit skips them, as the plan says.
- Test pins at rule-lists.logic :709, :718, :732, :739, :1114-1118 and :1128, check-lane-close.logic :212, :216-217, :221, :224, :549 and :1268-1281, and backlog-lane.logic :278-279, :371, :385-387, :411-451, :589 and :983-990 are all as described.
- The harness writes `Ruled:` lines for every lane file after `mutate` (check-lane-close.logic :61, :158-159). Extra stale out-*.txt files therefore stay green, which supports the plan's :549 retarget and its "extra files need only Ruled lines" claim.
- :336-350 (A3) pins `lens-input --context \S+ --material <diff file>`. That string lives in `layout` (:190), which the plan keeps. The :332 regex ends at `. Compliance lens`, which the plan keeps through the marker.
- validate's new message "must be a list of list ids" still matches the existing /output_off: must be a list/ at :1129.
- Reuse: nothing the plan builds exists under another name. The close already accepts a seat file in close mode (:581-588), and `lens-code-review.md` exists unedited.
- Sequencing: task-451 is closed and an ancestor. task-452 is a LATER build with plan evidence on the board, and its plan gate is untouched by this card.

## in#1 MED: Q4 "Seat: validate" cannot carry a clean validation, and its findings need the validator's own verdict
Plan: section 2, last bullet; section 4 step 3 (the "plus the Q4 sentence"); section 8 Q4 (recommends the seat form); section 9 (UNVERIFIED: does close mode accept another seat name).
Evidence: check-lane-close.mjs outcomeErrors, `if (found.length === 0) { errors.push(\`Seat ${s.name}: ${s.path} holds no finding line ... a seat file with no finding line is not a seat report\`)`. So a validator that finds nothing cannot file a seat file. Any `validate#N` finding is a BUG-kind id (`seatFindings`, :152, joined into grounderErrors at :582) and needs a verdict line in GROUNDER.md plus a TRIAGE outcome. The grounder would be ruling its own findings, which the brief's :191 sentence "a separate grounder rules on every finding" forbids for lens authors. Close mode does accept any seat name (the name is only a label), so the UNVERIFIED item resolves to "accepted, but not for zero findings".
Fix: answer Q4 as the prose-in-GROUNDER.md alternative (no new close-check surface, nothing tracked beyond the Ruled and verdict lines), or edit the Q4 text to "a seat file only when the validator has findings; none means none". Do not build the seat form into the :191 sentence.

## in#2 LOW: "Surprise 1" is true only after this card; today a fix task does get the lists at output
Plan: section 6 SURPRISE 1 and Q1.
Evidence: check-lane-close.mjs:468 `const build = type === 'build' || type === 'fix'`, and :525 uses `outputLists(...)` for both. check-lane-close.logic.test.ts:1268-1269 "output_off [ev] and no out-compliance-ev closes a build task and a fix task" shows fix is asked the lists at output. Plan-prep and the fix plan gate (:654, :657-661) give a fix task none. So this card removes the only stage where a fix task meets a rule list (16 cards per the plan). The plan words it as if that already holds. The Q1 option B edit sites (:525 and backlog-lane :184 to `type === 'build'`) are correct, but they sit in a protected hook outside the Files line.
Fix: reword SURPRISE 1 to "today a fix task gets rule lists at output only; this card ends that" and say in Q1 that B is a hook edit (RR-0450 line: switches or text only).

## in#3 LOW: the "what 452 and 461 see" paragraph is half right
Plan: section 6 Sequencing, "A later board merge into its lane only lowers what the close asks".
Evidence: check-lane-close.mjs:855 judges a lane by the range base's table (`{ ...baseTable, ...pin }`), while lensSet runs from the lane's own hook code. A lane that launched before this lands and then merges the board gets the narrower lensSet, but its range-base table still has output_off = ["plan-protocol"]. It is still asked every `out-compliance-*` and `out-engineering-*` file, which the plan itself requires for 452's inputs. Only the ux, error-paths and security files drop. task-461 (LATER, type fix, Files `mobile/__tests__/lotForm.test.ts`, a `mobile/` path so it is a surface) launched before the landing is asked code-review, ux, error-paths plus the lists. Launched after, it is asked code-review only. task-452 launched after gets plan evidence on the board and code-review plus the grounder only.
Fix: replace the sentence with "a merge lowers the lens files only; the list files stay while the range base table is the launch one". Keep the recommendation to land before 452 and 461 launch.

## in#4 LOW: the dated note is longer than stated, and AC #6 names the wrong tests
Plan: section 4 step 5 ("about 620 characters"); section 5 T4 and the Locks line; AC #6 in the card.
Evidence: the note text in the plan is 726 characters (node). The task-453 note at Spec 08 :358 is 607. I found no test in src/tests/backlog that caps the length of a dated note. The "cap" cases at rule-lists.logic.test.ts :932-939 and :980-988 cap the number of compliance files (at most 3) for the tooling kind. They change only through agents-s7-s11 size, which the plan reasons about correctly.
Fix: write "about 730 characters" and word AC #6 as "the compliance-file cap cases (:932, :980) stay green". Nothing else changes.

## in#5 LOW: T7 leaves C1(c) and the :156 harness line unmentioned, so they will silently stop being locks
Plan: section 5 T7.
Evidence: check-lane-close.logic.test.ts:226-228, "C1(c) control ... the src/lib scenario with out-security.txt passes", and :156 `lane['out-error-paths.txt'] = hdr(...)`. After the lensSet cut both still pass (the extra files need only Ruled lines), but they no longer prove a required file. :1268-1281 and T6 carry the real lock.
Fix: add one line to T7: C1(c) is relabelled as an extra-file control, and :156 stays only so T6 can show an extra stale file is tolerated.

## in#6 NIT: stale line citations in the plan and in the code the plan does not edit
Plan: section 2 ("GROUNDER.md is still required for build or fix (:569-571)") and section 6.
Evidence: the grounder-required check is check-lane-close.mjs :576-579 (`GROUNDER.md is missing ... a build or fix task always needs a separate grounder verdict`). :569-571 is the loose-versus-strict finding-count loop. The comment at rule-lists.mjs:654 cites `check-lane-close.mjs:604`, but the fix gate is at :655-661. The plan does not touch :654.
Fix: cite :576-579. Leave :654 alone.

STATUS: 6 findings (0 CRITICAL, 0 HIGH, 1 MED, 4 LOW, 1 NIT); the plan matches the real code on every cited file:line and seam, so the fold is Q4 (use prose, not a seat file), the Surprise 1 and 452/461 wording, and three small text corrections.
