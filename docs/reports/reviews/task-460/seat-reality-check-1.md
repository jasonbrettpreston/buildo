# Seat: reality-check: task-460 plan (PLAN-460-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board head 0ab1aed72 (wf2/board). The plan says 5af0f7be2. Only task and board files changed since then. `git diff --stat 283cb3857 HEAD` over the Files-line paths shows only docs/reports/generated/rule-lists-by-kind.md, as the plan says. Read: the whole task-460 file, GROUNDER-OUTSHAPE.txt, MD:2325 and :2367-2377, rule-lists.json and .mjs, backlog-lane.mjs, check-lane-close.mjs, .husky/pre-commit, README.md, 08_agents.md and the four test files at the cited lines. I ran four read-only in-memory node calls. No database, no test runner, no writes. Not run: the brief-text and close-check scenarios (UNVERIFIED).

Checked and clean:
- The table has 58 list ids. `output_off` is `["plan-protocol"]` at :238 and `every_task` is `["plan-protocol"]`. The plan's 58-id list matches `Object.keys(lists)` exactly, same order, ending in policy-124-s2-s5.
- 43 attachable is right: 12 row lists, plan-protocol, 15 increment lists and 15 milestone lists. The 15 never attached are five-words, airtight x4, storage-doc16, surface-126/127/135/128, mobile-100, mobile-96, queue-137, orchestrator-doc17 and policy-124-s2-s5.
- Line numbers confirmed in rule-lists.mjs: :161 is the `output_off` validate line, :193 is plan, :194 is out (the plan's correction of the grounder is right), :306 is outputLists, :549 is the page sentence.
- Line numbers confirmed in backlog-lane.mjs: :184 outLs, :188 `per`, :190 layout, :191 grounder (the grounder said :189, the plan's correction is right).
- Line numbers confirmed in check-lane-close.mjs: :147-148 are SEAT_LINE and SEAT_HEAD, :468 `build = build||fix`, :525-526 `build ? outputLists : r.lists` then `if (ls.length)`, :530-563 the lensSet loop, :853-855 F10, :350-358 the Ruled check.
- Line numbers confirmed in other files: .husky/pre-commit :44 (page check) and :49 (step-validate); .github/workflows/test.yml:64-67; README :99-104, :146, :153, :154; 08_agents.md :351, :358 (task-453 note), :359 (Panel sizing). 08_agents.md section 7 is in agents-s7-s11.
- On resolve and lensSet for the card's own Files line, `resolveTask` gives agents-s5-1to3, agents-s7-s11, eng-all, plan-protocol, inc-S, ms-S, the same for fix and build. `lensSet` out is today ["code-review","error-paths"] for scripts/analysis, and plan is ["plan-review-deepseek","error-paths"]. The plan's output-close list (four compliance files plus out-engineering-eng-all) is correct.
- Cap arithmetic: the six lists total 143,119 characters (14,705 + 46,314 + 46,613 + 8,825 + 24,153 + 2,509). The plan's figure is right and the grounder's 141,443 was wrong. Adding about 730 characters leaves 2 joined files against the cap of 3. The `rule-lists.logic.test.ts` cap cases are at :932/:939 and :980/:986.
- Test pins confirmed in rule-lists.logic.test.ts: :1116, :1126-1128, :708-709, :718, :732, :738-739, :745-746 and S4 :749. S3/S4 stay green after the change. The pins the plan adds to the grounder's list are real: backlog-lane test :336-350 (`cmds.length >= 2`, `lens-input --list L`), :411-451, :589, :310 and :332.
- check-lane-close.logic.test.ts pins confirmed: :212, :216-217, :221, :224, :549 (attack 27), :1268-1281. The fixture TABLE has the lists first, inc-F, ev and msf, so T6's `tableEdit` ids are valid.
- Zero lists at close: `if (ls.length)` skips the compliance set. GROUNDER.md for build or fix is still required, and `outputLists` filters any id.

## rc#1 HIGH: SURPRISE 1 and Q1 are wrong on the code; a fix task gets lists at output today
Plan: section 6 SURPRISE 1 ("a fix task gets no rule list at either stage ... 'Stays on at the plan stage' is true for build tasks only"). Q1 ("A fix task has no rule list at either stage"; option B: "lists stay at output for fix tasks").
Evidence: check-lane-close.mjs:468 `const build = type === 'build' || type === 'fix';`. Line 525 is `const ls = (build ? outputLists(i.table, r.lists) : r.lists)`. Line 521 is `const phases = build ? ['out'] : ['plan','out']`. Together these require out-compliance and out-engineering files for fix tasks at output today. backlog-lane.mjs:213 passes `resolved.lists` to the brief for any type. backlog-lane.logic.test.ts:983-987 loops `['build','fix']` and expects fix briefs to hold the output-lists text. So the plan stage has no lists for fix (rule-lists.mjs:661, check-lane-close.mjs:658-662), but output does. This card removes the only stage where a fix task gets lists.
Fix: restate SURPRISE 1 and Q1 as "a fix task gets lists at output only; output_off all removes them; the plan stage never had them for fix". Put that to the operator as the real A or B choice. Drop the claim that option B edits :525 and :184 to "type === 'build'" as if that kept the lists. It would stop output_off applying to fix.

## rc#2 MED: the two reused-line citations that carry the "no check needed" claim are off
Plan: section 2 "GROUNDER.md is still required for build or fix (:569-571)" and "fix plan gate (check-lane-close.mjs:657-661)". Section 3: "rule-lists.mjs:654 `type === 'build' ? r.lists : []`".
Evidence: GROUNDER.md missing is checked at check-lane-close.mjs:579-580 (`const g = textOf('GROUNDER.md'); if (g === undefined) return [...errors, ...`). The fix plan branch is :658-662 (`a fix launch: at least one plan lens output`). The plan-prep line is rule-lists.mjs:661 (`const lists = type === 'build' ? r.lists : []`), not :654. :569-571 holds nothing about GROUNDER.md.
Fix: correct to :579-580, :658-662 and rule-lists.mjs:661. The "close needs nothing else" conclusion still holds.

## rc#3 MED: T8's claim that a stale out-error-paths.txt "would no longer be checked" is half true
Plan: section 3, "A stale out-error-paths.txt would no longer be checked, because the close verifies only lenses in set.out", and T8 retargeting :549 to out-code-review.
Evidence: `reviewErrors` and the file_sha256 binding run only inside `for (const lens of set.out)` (check-lane-close.mjs:531). The grounder step covers every `isLensOutput` file: `for (const f of lensFiles)` at :350-358 demands a `Ruled:` line, and `findingsIn(lensFiles)` at :564 counts its findings. The harness line :155 `lane['out-error-paths.txt'] = ...` always writes one. So a leftover file still needs a Ruled line and its findings still need verdicts. Also :548 already holds an out-code-review file_sha256 attack, so T8 duplicates it.
Fix: say "the hash binding is dropped, the Ruled and verdict rules still apply". In T6, state that the scenario either drops the file or keeps its Ruled line, and keep the :548 line as is.

## rc#4 LOW: note-size and reference slips
Plan: section 4 step 5 ("about 620 characters"); section 6 ("by-law gate (.husky/pre-commit:21)").
Evidence: the planned note line measures 731 characters including indent and quotes. The by-law gate is `.husky/pre-commit:19` (`node scripts/analysis/mcbylaws/gate.mjs --staged`); :21 is not the gate. The related-tests skip comment is at about :69-71, with `RELATED_FILES` set at :56, not :55.
Fix: write "about 730 characters"; the cap still holds (143,119 + 730 is far from the third-file figure of about 240k). Cite :19 and :56.

## rc#5 NIT: Basis head
Plan: Basis "board head 5af0f7be2".
Evidence: HEAD is 0ab1aed72; only task files changed since (git diff 5af0f7be2 HEAD touches 2 task files).
Fix: name 0ab1aed72, or keep it with "files unchanged since".

UNVERIFIED: that the `type: 'check'` brief keeps every :411-451 string (lens-code-review.md and lens-error-paths.md at :447-448 would be absent in a check brief, so those two lines must stay on a build brief); that T9 and T6 close in the harness; the page diff content; the 14 LATER fix count (I count 15 LATER fix cards including task-460, plus 2 RUNNING, so 14 excluding itself is right).

STATUS: 5 findings (1 HIGH, 2 MED, 1 LOW, 1 NIT); the counts, ids, line numbers and cap arithmetic are real, but the fix-task "no list at either stage" premise is false on the code.
