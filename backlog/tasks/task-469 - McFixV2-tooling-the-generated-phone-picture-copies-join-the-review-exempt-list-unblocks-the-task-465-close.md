---
id: TASK-469
title: >-
  McFixV2 tooling: the generated phone picture copies join the review exempt
  list (unblocks the task-465 close)
status: WAITS
assignee: []
created_date: '2026-11-25T20:33:00Z'
updated_date: '2026-11-25T20:39:00Z'
labels:
  - McFixV2
milestone: m-1
dependencies: []
type: fix
ordinal: 163210
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Opened by the operator's ruling RR-0502 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2613, verbatim '465 a'). The output review of task-465 cannot start: rule-lists.mjs lens-input refuses mobile/__tests__/fixtures/surfaces/mobile_parcel_search.goldens.json ('is 264565 characters of diff and cannot be split inside a file: at most 97828 fit one input', scripts/analysis/rule-lists.mjs:434, bound :29), and the close check requires every changed path outside the exempt list to be in the review chunks (scripts/hooks/check-lane-close.mjs:842). That file is the generated phone copy of the search page pictures, written by scripts/surfaces/emit-mobile-surfaces.mjs from src/tests/fixtures/surfaces/*/*.mobile.json, which are already exempt (scripts/analysis/rule-lists.json exempt list; precedent task-406: each exempt glob names the check that proves it). Change: add the phone generated picture copies (mobile/__tests__/fixtures/surfaces/*.goldens.json) to the exempt list, naming the existing check that proves a copy equals its sources. The exempt key is read from the board ref (check-lane-close.mjs:729, :787), so the change must land on the board before task-465 closes. Blocks: task-465 close; tasks 267 and 317 would meet the same refusal. Not planned yet: no plan, no Files line.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The exempt list holds the phone generated picture copies, with the check that proves them named as the table requires
- [ ] #2 A test shows a diff of only such a file resolves as exempt, and that the proving check goes red on a copy that does not match its sources
- [ ] #3 task-465's output review input builds without the size refusal
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 The rule the task rests on is quoted with file:line in the task, or the task is a card for the missing rule — "Quote the rule first" (.cursor/MCBYLAWS-QUEUE.md:107)
- [ ] #2 The tests were written first and proven red, then green — "Every lock is proven in BOTH directions" (docs/specs/00-architecture/08_agents.md:462)
- [ ] #3 The work is committed through the real hooks, none bypassed — "Red tests first, then the code, through the real hooks." (docs/specs/00-architecture/08_agents.md:490)
- [ ] #4 The named test is green before the task is called done — "Never declare a task done until" (CLAUDE.md:32)
- [ ] #5 Any operator ruling the task needed is recorded verbatim as a dated note or a decision-log row — "A ruling enters a row as a verbatim dated note." (docs/specs/00-architecture/137_mcqueue.md:109)
- [ ] #6 The task file and its queue row are updated in the same commit as the work — "The status line changes in the same commit as the work." (docs/specs/00-architecture/137_mcqueue.md:84)
- [ ] #7 DONE carries its evidence (commit sha, test, hook result) — "The work landed and the evidence exists" (docs/specs/00-architecture/137_mcqueue.md:63)
- [ ] #8 Nothing was added that the card or ruling did not name — "no change adds a tool, field or rule its card or ruling did not name" (docs/specs/01-pipeline/124a_step_standard_policy_appendix.md:988)
- [ ] #9 The principles the task serves are named — "Each task names the ones it serves." (.cursor/MCBYLAWS-QUEUE.md:104)
- [ ] #10 The close-out reply ends with one STATUS line and at most one question — "Every reply ends with one line" (docs/specs/00-architecture/08_agents.md:505)
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Planner: Cairn-Plan-469
Plan id: PLAN-469-v1

Head read: wf2/board d5e8bd0bf (~/Buildo-wt-board). Read-only. I wrote no files and ran no tests, generators or hooks. I ran `rule-lists.mjs resolve` (read-only) and a node one-liner on `matchesAny` to test the glob.

## 1. Rule quoted first
- RR-0502, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2613-2615: "465 a". The option put to him: "A: add the phone generated picture copies to the skip list (one line in one table; own small card and review ...)". Recorded as backlog/decisions/decision-284.
- RR-0392, MD:1975-1976: "I don't think we need any other infastrcuture beyond this". So no new field, option or tool.
- The task-406 rule, scripts/analysis/rule-lists.json:9: "the `exempt` key (bare globs; no new field) also lists the golden snapshot files that one existing check validates, and each such glob names that check in the line below it (a test fails a golden glob with no named check)". It "exempts the REVIEW MATERIAL only ... list resolution is unchanged".
- Spec 08, docs/specs/00-architecture/08_agents.md:233: "a lane whose own table differs from the board's in any of those four keys is refused ... (a task that changes them is refused too: those changes land on the board first)".
- Locks are proven both ways, 08_agents.md:497: "Every lock is proven in BOTH directions (fails on the old shape, passes on the new)". The card's DoD cites :462 and :490; at this head the lines are :497 and :525. 124a:988 is now :992.

## 2. What exists and is reused (no new check)
- **The exempt list:** a bare array at rule-lists.json:231. It ends with the 9 golden globs from task-406, the last being `src/tests/fixtures/report-page/props/*.mobile.json`.
- **Where each glob names its check:** in `$comment` (rule-lists.json:10-18), one line per glob, in the form `exempt <glob>: proved by <check> (<file>: <how>; <where it runs in the suite>)`. The checks are not named in a table field, a spec or a doc.
- **Precedent commit c8efb23f5 (task-406):** it changed only rule-lists.json, src/tests/backlog/rule-lists-table.logic.test.ts and the task file. No spec, README or generated page was touched.
- **The test that pins the naming:** rule-lists-table.logic.test.ts:145-180, describe "V2.LIST round 7".
  - :146 has `CHECKS = ['goldenProblems','screenArm','report-page-capture.ts --check']`.
  - :149-155 checks that real goldens are exempt.
  - :156-162 checks that look-alikes are not exempt.
  - :170-179 checks that every non-docs exempt glob has a `$comment` line matching `<glob>...proved by...<check>`, and pins the count at :175 `expect(golden.length).toBe(9)`.
- **The check that proves a phone copy equals its sources** (it exists):
  - scripts/surfaces/emit-mobile-surfaces.mjs `--check`. `buildOutputs` (:97-125) rebuilds `mobile/__tests__/fixtures/surfaces/<id>.goldens.json` from `src/tests/fixtures/surfaces/<id>/*.mobile.json` (:112-115).
  - `checkOutputs` (:133-147) compares each copy byte for byte. A copy with the same input_sha is a hand edit (`GEN-HAND-EDIT`), otherwise it is stale (`GEN-STALE`). A file no surface owns is `GEN-STRAY` (:141-145). main exits 1 on any problem (:166-171).
  - Who runs it: scripts/surfaces/surface-validate.mjs, arm S-gen (:27, :28-36, :39), and proof slice `surface-validate` (scripts/analysis/proof-slices.json:4).
  - No hook calls either script directly: none in .husky/pre-commit, .husky/pre-push or .husky/pre-push-checks.sh.
  - Where the real copies are checked in the suite (pre-push-checks.sh:14): src/tests/surfaces/mcfront-proof.infra.test.ts:169-174 (canary b control). It runs the real surface-validate gate on a tree copy that includes mobile/__tests__/fixtures/surfaces (COPY list :55-58).
- **There is no red proof for a phone copy today.**
  - The hand-edit red at mcfront-proof:178-183 plants in the report declaration, not in a phone copy.
  - surface-validate.logic.test.ts:137-148 only stubs the generator.
  - surface-conformance.logic.test.ts:1158-1168 covers GEN-STRAY of a slice only.
  - So this plan adds the red proof.
- **Test helpers:** src/tests/backlog/helpers.ts exports ROOT, run, script and tmp (tmp at :38). rule-lists-table.logic.test.ts already imports from scripts/surfaces (:8), so importing the emitter there follows existing practice.

## 3. How the close check reads exempt, and what it means for both closes
- **check-lane-close.mjs:**
  - :129 `BOARD_REFS = ['refs/heads/wf2/board','refs/remotes/origin/wf2/board']`. The local ref is read first.
  - :729-731 read the table from the board ref.
  - :772 refuses when the branch table's `base_ref`, `finished_statuses`, `protected_paths` or `exempt` differs from the board's.
  - :787 `const exempt = boardTable.exempt`.
  - :842 `expectedPaths = cov.filter((p) => !matchesAny(exempt, p))`.
  - :853-855 the one exception: a task whose Files line names the table is judged by its branch table for lists and rows, but `pin` always forces exempt and the other three keys from the board. So the exception never lets a lane apply its own exempt.
  - :766 forbids a closing commit that stages a protected path (rule-lists.json is protected, rule-lists.json:23).
- **This card's own close (task-469):**
  - While wf2/board lacks the new glob, any close on the 469 branch is refused at :772.
  - Order: work commit on the lane → output review (the material is the range from L to HEAD; rule-lists.json and the test are in it) → fold the work onto the local wf2/board → then the closing commit, records only.
  - The code needs the local ref only. A push is not required by the code; origin is read only when the local ref is missing.
  - Folding before close is supported: the F8 test at check-lane-close.logic.test.ts covers a lane folded into the base and closed afterwards.
- **task-465's close (lane BL-MCFIX465, ~/Buildo-wt-mcfix465, branch wf2/mcfix465 at 0aa1b011e, merge-base 1aee693d6, board at d5e8bd0bf):**
  - After 469 is folded, :787 subtracts the new glob. But wf2/mcfix465's own table still has the old exempt, so :772 refuses ("the exempt of this branch's table ... differs from the board's").
  - **Requirement: wf2/mcfix465 must merge wf2/board after 469 is folded, before the 465 output review input is built and before it closes.**
  - The diff command in 465's launch brief was printed with the launch-time table (scripts/analysis/backlog-lane.mjs:78, :193 `':(exclude,glob)<g>'` per exempt glob). So the 465 material must be rebuilt with the extra `':(exclude,glob)mobile/__tests__/fixtures/surfaces/*.goldens.json'`. No tool change.
  - This takes out both of 465's copies (search: 4843 lines changed; semi_question: 62).
- **Size check after the change (estimate):** what remains of 465 are the 20 `src/tests/fixtures/surfaces/mobile_parcel_search/*.json` sources and the semi sources. Those are already exempt. The largest non-exempt single file looks small next to the bound (scripts/analysis/rule-lists.mjs:29, :434). Unverified: I did not run lens-input.

## 4. The change (build order; every file is on the Files line)
1. **src/tests/backlog/rule-lists-table.logic.test.ts** (tests first, section 5).
2. **scripts/analysis/rule-lists.json:**
   - Add a comma at the end of :18, then append one `$comment` line after :18:
     `"exempt mobile/__tests__/fixtures/surfaces/*.goldens.json: proved by emit-mobile-surfaces.mjs --check (scripts/surfaces/emit-mobile-surfaces.mjs checkOutputs: each phone picture copy is rebuilt from src/tests/fixtures/surfaces/<id>/*.mobile.json and compared byte for byte, GEN-HAND-EDIT, GEN-STALE or GEN-STRAY otherwise; run by surface-validate.mjs S-gen; red proof in src/tests/backlog/rule-lists-table.logic.test.ts) (task-469, RR-0502 MORNING-DECISIONS.md:2613)"`
   - In :231, append `"mobile/__tests__/fixtures/surfaces/*.goldens.json"` as the last element of `exempt`.
   - No other key, row or field changes.
- Glob check (node, `matchesAny`): it matches mobile_parcel_search.goldens.json. It does not match a nested `x/a.goldens.json`, `a.json`, `evil.goldens.json.ts`, `mobile/src/generated/surfaces/*.json` or `mobile/__tests__/fixtures/parcelSearch.situations.json`.
- It matches 4 tracked files, so `rule-lists.mjs validate` (:153, "matches no tracked path") passes.
- Generated page: docs/reports/generated/rule-lists-by-kind.md does not change. `page` reads `kinds` and `lists` (rule-lists.mjs:544-582), never `exempt` or `$comment`. Pre-commit :44 `page --check` stays green.

## 5. Tests first (all in src/tests/backlog/rule-lists-table.logic.test.ts, describe at :145)
- **T1 (AC1; red today):**
  - :146 CHECKS gains `'emit-mobile-surfaces.mjs --check'`.
  - :175 becomes `toBe(10)`.
  - Red today because the count is 9. After the table edit, the `unnamed()` assertion is green only if the `$comment` line names the check; the existing planted glob `zzz` keeps the other direction.
- **T2 (AC2 "resolves as exempt"; red today):** :152's list gains the four real copies:
  - `mobile/__tests__/fixtures/surfaces/mobile_parcel_search.goldens.json`
  - `..._disambiguation_map.goldens.json`
  - `..._semi_question.goldens.json`
  - `..._wall.goldens.json`
  - Expected: `matchesAny(exempt, p)` is true, the same function the close check uses at :842. False today, so red.
- **T3 (control for T2; green today and after):** :159's list gains these, each expected false:
  - `mobile/src/generated/surfaces/mobile_parcel_search.json`
  - `mobile/__tests__/fixtures/surfaces/x/a.goldens.json`
  - `mobile/__tests__/fixtures/surfaces/notes.json`
  - `mobile/__tests__/fixtures/parcelSearch.situations.json`
  - `mobile/__tests__/parcelScreens.golden.test.ts`
- **T4 (AC2 red proof of the proving check; new `it` in the same describe), "the proving check goes red on a phone copy that does not match its sources; a clean copy is green":**
  - Setup: `root = tmp('emit')`, then `fs.cpSync` scripts/surfaces, scripts/seeds/logic_variables.json, src/tests/fixtures/surfaces, mobile/src/generated/surfaces and mobile/__tests__/fixtures/surfaces. This is the same set as the emitCopy helper at surface-conformance.logic.test.ts:1020-1026.
  - Run `node <root>/scripts/surfaces/emit-mobile-surfaces.mjs --check` (REPO is taken from the script's own place, :18). Expected per case:

| Case | Edit | Expected exit | Expected stderr |
| --- | --- | --- | --- |
| (a) control | none | 0 | none (stdout `surfaces ok`) |
| (b) hand edit | one value in the copy's `goldens` body changed, `$comment` kept | 1 | `GEN-HAND-EDIT mobile/__tests__/fixtures/surfaces/mobile_parcel_search.goldens.json` |
| (c) stale copy | one `src/tests/fixtures/surfaces/mobile_parcel_search/<first state>.mobile.json` source changed, copy not regenerated | 1 | `GEN-STALE mobile/__tests__/fixtures/surfaces/mobile_parcel_search.goldens.json` |
| (d) stray copy | `mobile/__tests__/fixtures/surfaces/zz.goldens.json` added | 1 | `GEN-STRAY` line for it |

  - T4 is green today and stays green. It is the both-ways proof the card asks for: red on the bad copy, green on the clean one.
- **Mapping:** AC1 → T1. AC2 → T2, T3, T4. AC3 → step 7 of section 7 (465's lens-input runs without the size refusal), recorded on 465.
- **Red run:** write T1-T4, run the one file, record T1 and T2 red. Edit the table, run again: all green. Then commit through the real hooks.

## 6. What the plan does NOT do, and how it could fail
- **Left out:** mobile/src/generated/surfaces/*.json (5 slices, 11,717 bytes in all). They carry the config values, content strings and page rows the binding reads, not pictures. They are small enough to review, and the ruling names the picture copies only.
- **Also left out:** mobile/__tests__/fixtures/parcelSearch.situations.json (hand-written inputs).
- **Inside the scope:** the other three copies (disambiguation_map, semi_question, wall) are the same kind as the search copy: the same generator line :115 and the same check. The ruling's plural "copies" covers all four, and one glob takes them.
- **Not touched:** no check, hook, bound, option, spec, dated note, README or generated page. Spec 08:231/:233 and .claude/review-templates/README.md:154 describe exempt in general and list no globs.
- **Risks:**
  - (a) T4's copy is about 9 MB (scripts/surfaces 7.6 MB, fixtures 1.2 MB), similar to emitCopy. Time goes up by about a second. Detected by the suite time.
  - (b) If 465 merges the board and the board has commits since 1aee693d6 that touch paths on 465's Files line, those paths join 465's coverage range (:836-842). The close names any path missing from the chunks (:124).
  - (c) If the 465 material is built from the old brief's command, lens-input still refuses at :434. Fix by rebuilding it with the new exclude.
  - (d) If 469's close is tried before the fold, it is refused at :772 with a clear message.
  - (e) If the `$comment` line breaks the regex at :178, T1 stays red.
  - (f) If a later surface's copy is hand-edited, `emit-mobile-surfaces --check` names it. That check runs through surface-validate in the suite (mcfront-proof canary b) and in the proof slice.

## 7. Order of landing, notes, lists
1. Launch 469 (lane via backlog-lane.mjs).
2. T1-T4 red, then the table edit, then green; commit on the lane.
3. Output review on the lane.
4. Fold the work onto the local wf2/board. Required by the code: :729/:787/:772, plus Spec 08:233 "land on the board first".
5. Close 469 (records-only commit).
6. wf2/mcfix465 merges wf2/board. Required: :772 refuses while 465's branch exempt differs.
7. Rebuild 465's output material with the new exclude; lens-input must pass its size bound (AC3); then review and close.

- **Push:** not needed for 469's own close; the local ref is used first (:129). The operator's push turn decides when it reaches origin.
- **Card notes (backlog CLI only, never a hand edit):**
  - On task-469: the plan, the red and green evidence, and the fold sha.
  - On task-465: one short note saying its lane must merge wf2/board after the 469 fold and rebuild its material.
  - Keep the notes short (RR-0429, MD:2203). No spec dated note is needed; the precedent added none.
- **Rule lists this card attaches** (run of `rule-lists.mjs resolve --type fix --letter S` on the Files line below):
  - rule-lists.json via the lane-tools row (rule-lists.json:163-167): agents-s5-1to3, agents-s7-s11, eng-all.
  - The test via the tests row (:225-227): eng-all.
  - Every task: plan-protocol, inc-S, ms-S.
  - The plan review gets all six. The output review of a fix task gets none (output_off, rule-lists.json:8), only its lenses (code-review etc.).
  - The diff is about 3 lines of table plus about 40 lines of test: one input, no split.
  - Putting the red proof in rule-lists-table.logic.test.ts rather than surface-conformance.logic.test.ts avoids attaching surface-136. It also avoids the file 465 edits (its hunk is at :263-266).

Files: scripts/analysis/rule-lists.json, src/tests/backlog/rule-lists-table.logic.test.ts

## 8. Open choices
- **Where T4 lives.**
  - A: rule-lists-table.logic.test.ts (recommended: one test file, no extra list, no overlap with 465).
  - B: surface-conformance.logic.test.ts next to the L8 test, reusing emitCopy :1020. This adds surface-136 to the review and is a file 465 also edits.
  - The precedent (c8efb23f5) used the table test only.
- **Push of the board before 465's review.** The code does not require it (:129). Recommendation: no extra push; follow the normal push turn.
- No operator question is needed.

## 9. GUESS estimate
About 45 minutes of build (tests, table, two runs) plus one output review round.

## 10. UNVERIFIED
- I did not run lens-input on 465's material after the exclude, so the largest remaining file size is an estimate (AC3).
- Whether `node <copy>/scripts/surfaces/emit-mobile-surfaces.mjs --check` on the copied tree returns `surfaces ok` today. It is inferred from mcfront-proof canary b and surface-conformance :1168; not run.
- The exact first state file name for case (c); the build reads the directory.
- The quote "It has to be simple and easy turning stuff off if at all possible" did not grep in MD (the wording may differ). Taken from the brief.
- That the 465 worktree shares refs with ~/Buildo-wt-board: `git worktree list` shows both as worktrees of one repo, so refs/heads/wf2/board is shared.
- The time T4's copy adds to the suite.
<!-- SECTION:PLAN:END -->
