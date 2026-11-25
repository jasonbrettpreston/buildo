# Review context for task-469 (no plan id) written 2026-11-25 by backlog-brief.mjs (round 3)

## Task
task-469 McFixV2 tooling: the generated phone picture copies join the review exempt list (unblocks the task-465 close)
status: RUNNING · milestone: m-1 · assignee: @lane-BL-MCFIX469 · labels: McFixV2

## Description
Opened by the operator's ruling RR-0502 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2613, verbatim '465 a'). The output review of task-465 cannot start: rule-lists.mjs lens-input refuses mobile/__tests__/fixtures/surfaces/mobile_parcel_search.goldens.json ('is 264565 characters of diff and cannot be split inside a file: at most 97828 fit one input', scripts/analysis/rule-lists.mjs:434, bound :29), and the close check requires every changed path outside the exempt list to be in the review chunks (scripts/hooks/check-lane-close.mjs:842). That file is the generated phone copy of the search page pictures, written by scripts/surfaces/emit-mobile-surfaces.mjs from src/tests/fixtures/surfaces/*/*.mobile.json, which are already exempt (scripts/analysis/rule-lists.json exempt list; precedent task-406: each exempt glob names the check that proves it). Change: add the phone generated picture copies (mobile/__tests__/fixtures/surfaces/*.goldens.json) to the exempt list, naming the existing check that proves a copy equals its sources. The exempt key is read from the board ref (check-lane-close.mjs:729, :787), so the change must land on the board before task-465 closes. Blocks: task-465 close. Tasks 267 and 317 name none of the phone picture copies on their Files lines, so this change does not touch them; task-313 names one new copy (mobile_parcel_opening.goldens.json), which the same glob will cover; an over-bound diff of some other file would be a separate card. Planned: PLAN-469-v1 (the Implementation Plan below).
Files: scripts/analysis/rule-lists.json, src/tests/backlog/rule-lists-table.logic.test.ts

## Acceptance criteria
- #1 The exempt list holds the phone generated picture copies, with the check that proves them named as the table requires
- #2 A test shows a diff of only such a file resolves as exempt, and that the proving check goes red on a copy that does not match its sources
- #3 task-465's output review input builds without the size refusal

## Implementation Plan
Planner: Cairn-Plan-469
Plan id: PLAN-469-v1

Head read: wf2/board d5e8bd0bf (~/Buildo-wt-board); the plan grounder re-read the lines cited for the close check, the table and the table test at 05026ae0a (board records only since) and they hold. Read-only. I wrote no files and ran no tests, generators or hooks. I ran `rule-lists.mjs resolve` (read-only) and a node one-liner on `matchesAny` to test the glob.

#### 1. Rule quoted first
- RR-0502, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2613-2615: "465 a". The option put to him: "A: add the phone generated picture copies to the skip list (one line in one table; own small card and review ...)". Recorded as backlog/decisions/decision-284.
- RR-0392, MD:1975-1976: "I don't think we need any other infastrcuture beyond this". So no new field, option or tool.
- The task-406 rule, scripts/analysis/rule-lists.json:9: "the `exempt` key (bare globs; no new field) also lists the golden snapshot files that one existing check validates, and each such glob names that check in the line below it (a test fails a golden glob with no named check)". It "exempts the REVIEW MATERIAL only ... list resolution is unchanged".
- Spec 08, docs/specs/00-architecture/08_agents.md:233: "a lane whose own table differs from the board's in any of those four keys is refused ... (a task that changes them is refused too: those changes land on the board first)".
- Locks are proven both ways, 08_agents.md:497: "Every lock is proven in BOTH directions (fails on the old shape, passes on the new)". The card's DoD cites :462 and :490; at this head the lines are :497 and :525. 124a:988 is now :992.

#### 2. What exists and is reused (no new check)
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
  - No hook calls either script directly: none in .husky/pre-commit, .husky/pre-push or .husky/pre-push-checks.sh (checked: no match for either name under .husky). The proof of a lane's copies is the station suite on its work commit (RR-0467), which runs mcfront-proof canary b on the real copies before the output review and before any fold; the close check only subtracts the path, as it does for the nine golden globs.
  - Where the real copies are checked in the suite (pre-push-checks.sh:14): src/tests/surfaces/mcfront-proof.infra.test.ts:169-174 (canary b control). It runs the real surface-validate gate on a tree copy that includes mobile/__tests__/fixtures/surfaces (COPY list :55-58).
- **There is no red proof for a phone copy today.**
  - The hand-edit red at mcfront-proof:178-183 plants in the report declaration, not in a phone copy.
  - surface-validate.logic.test.ts:137-148 only stubs the generator.
  - surface-conformance.logic.test.ts:1158-1168 covers GEN-STRAY of a slice only.
  - So this plan adds the red proof.
- **Test helpers:** src/tests/backlog/helpers.ts exports ROOT, run, script and tmp (tmp at :38). rule-lists-table.logic.test.ts already imports from scripts/surfaces (:8), so importing the emitter there follows existing practice.

#### 3. How the close check reads exempt, and what it means for both closes
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
  - Order: work commit on the lane → station suite on the work commit (RR-0467) → output review (the material is the range from L to HEAD; rule-lists.json and the test are in it) → the separate output grounder rules it (RR-0359) and every confirmed finding is fixed → fold the lane onto the local wf2/board (forced before the close by :772, and after the grounder, so RR-0359 holds) → the lane merges wf2/board (a fast-forward onto the fold) → then the closing commit, records only. Section 7 holds the full order.
  - The code needs the local ref only. A push is not required by the code; origin is read only when the local ref is missing.
  - Folding before close is supported: the F8 test at check-lane-close.logic.test.ts:512 folds the lane (branch -f of wf2/board to the lane head, :113) and closes after one fix commit, with coverage from the launch commit L, so the pre-fold file must still be in the chunks. No test pins an exempt-changing close (F7 at :570 pins only the refusal), and none was closed under :772 before (the exempt key last changed at c8efb23f5, before the :772 rule landed at 98c9f9a8e): this is the first. Before the closing commit, `git diff wf2/board -- scripts/analysis/rule-lists.json` must print nothing on the lane, else :772 refuses. The closing commit stages records only, and the range from L still holds the two Files-line paths, so it is not empty (:841).
- **task-465's close (lane BL-MCFIX465, ~/Buildo-wt-mcfix465, branch wf2/mcfix465 at 0aa1b011e, merge-base 1aee693d6, board at d5e8bd0bf):**
  - After 469 is folded, :787 subtracts the new glob. But wf2/mcfix465's own table still has the old exempt, so :772 refuses ("the exempt of this branch's table ... differs from the board's").
  - **Requirement: wf2/mcfix465 must merge wf2/board after 469 is folded, before the 465 output review input is built and before it closes.** The merge conflicts on the task-465 card only (both sides changed it since 1aee693d6: the board in 96556fb03, the lane in 0aa1b011e; two hunks, no other conflict, read with git merge-tree). Resolution: take the board's side of the card with git, then re-add with the backlog CLI the lane's own Files-line paths (the union of both Files lines) and its Build note; the card markdown is never edited by hand. After the merge `git diff wf2/board -- scripts/analysis/rule-lists.json` must print nothing on the lane (:772 compares the exempt key); the lane did not touch rule-lists.json or the table test, so the exempt array does not conflict. Every other lane must do the same before its own close (:772 refuses a lane whose exempt differs from the board's): today BL-MCFIX465 (~/Buildo-wt-mcfix465) is the only live lane worktree; tasks 267 and 317 are WAITS and 313 is LATER, none launched; a lane launched after the fold starts from the new table.
  - The diff command in 465's launch brief was printed with the launch-time table (scripts/analysis/backlog-lane.mjs:193 `':(exclude,glob)<g>'` per exempt glob of the table of the checkout the launch ran in). So the 465 material must be rebuilt with the extra `':(exclude,glob)mobile/__tests__/fixtures/surfaces/*.goldens.json'`. No tool change.
  - This takes out both of 465's copies (search: 4843 lines changed; semi_question: 62).
- **Size check after the change (measured by the plan grounder at 0aa1b011e: git diff of 2fd2f6042 to wf2/mcfix465, per file, minus the exempt globs and the new one):** the largest remaining non-exempt diffs are the task-267 card 44,304, the task-465 card 35,465, scripts/surfaces/_schema/bindings.json 25,865 and mobile/__tests__/parcelSearchScreen.behaviour.test.tsx 23,114 characters, against the 97,828 the tool printed for the refused file (scripts/analysis/rule-lists.mjs:29, :434); the refused file (264,507) is the only one over. lens-input itself was not run. **Gate:** if lens-input still refuses any other file, stop and return to the operator; RR-0502 names the phone picture copies only, so no other glob is added.

#### 4. The change (build order; every file is on the Files line)
1. **src/tests/backlog/rule-lists-table.logic.test.ts** (tests first, section 5).
2. **scripts/analysis/rule-lists.json:**
   - Add a comma at the end of :18, then append one `$comment` line after :18:
     `"exempt mobile/__tests__/fixtures/surfaces/*.goldens.json: proved by emit-mobile-surfaces.mjs --check (scripts/surfaces/emit-mobile-surfaces.mjs checkOutputs: each phone picture copy is rebuilt from src/tests/fixtures/surfaces/<id>/*.mobile.json and compared byte for byte, GEN-HAND-EDIT, GEN-STALE or GEN-STRAY otherwise; run by surface-validate.mjs S-gen; standing proof on the real copies: src/tests/surfaces/mcfront-proof.infra.test.ts canary b control, in the push suite; red proof on a bad copy: src/tests/backlog/rule-lists-table.logic.test.ts) (task-469, RR-0502 MORNING-DECISIONS.md:2613)"`
   - In :231, append `"mobile/__tests__/fixtures/surfaces/*.goldens.json"` as the last element of `exempt`.
   - Extend the rule sentence at :9 by half a line so it stays true: after "validates" add "(and the generated phone copies of those goldens, which the generator's own --check proves: task-469, RR-0502)" (no double quote inside the JSON string); the test header comment at rule-lists-table.logic.test.ts:144 gets the same half line. No test pins either text (git grep). No other key, row or field changes.
- Glob check (node, `matchesAny`): it matches mobile_parcel_search.goldens.json. It does not match a nested `x/a.goldens.json`, `a.json`, `evil.goldens.json.ts`, `mobile/src/generated/surfaces/*.json` or `mobile/__tests__/fixtures/parcelSearch.situations.json`.
- It matches 4 tracked files, so `rule-lists.mjs validate` (:153, "matches no tracked path") passes.
- Generated page: docs/reports/generated/rule-lists-by-kind.md does not change. `page` reads `kinds` and `lists` (rule-lists.mjs:544-582), never `exempt` or `$comment`. Pre-commit :44 `page --check` stays green.

#### 5. Tests first (all in src/tests/backlog/rule-lists-table.logic.test.ts, describe at :145)
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
  - Run `node <root>/scripts/surfaces/emit-mobile-surfaces.mjs --check` (REPO is taken from the script's own place, :18). Each of (b), (c) and (d) starts from a clean tree: restore the one touched file from the repo (or delete zz.goldens.json) before the next case, so (c) is judged on an unedited copy. Baseline: checkOutputs on the board tree returned no problem at 05026ae0a (the plan grounder, in memory), so a red (a) in the lane means the lane's tree changed, not today's baseline; stop and read the lines. Expected per case:

| Case | Edit | Expected exit | Expected stderr |
| --- | --- | --- | --- |
| (a) control | none | 0 | none (stdout `surfaces ok`) |
| (b) hand edit | one value in the copy's `goldens` body changed, `$comment` kept | 1 | `GEN-HAND-EDIT mobile/__tests__/fixtures/surfaces/mobile_parcel_search.goldens.json` |
| (c) stale copy | one `src/tests/fixtures/surfaces/mobile_parcel_search/<first state>.mobile.json` source changed, copy not regenerated | 1 | `GEN-STALE mobile/__tests__/fixtures/surfaces/mobile_parcel_search.goldens.json` |
| (d) stray copy | `mobile/__tests__/fixtures/surfaces/zz.goldens.json` added | 1 | `GEN-STRAY` line for it |

  - T4 is green today and stays green. It is the both-ways proof the card asks for: red on the bad copy, green on the clean one.
- **Mapping:** AC1 → T1. AC2 → T2, T3, T4. AC3 → step 10 of section 7 (465's lens-input runs without the size refusal), recorded on 465.
- **Red run:** write T1-T4, run the one file, record T1 and T2 red. Edit the table, run again: all green. Then commit through the real hooks.

#### 6. What the plan does NOT do, and how it could fail
- **Left out:** mobile/src/generated/surfaces/*.json (5 slices, 11,717 bytes in all). They carry the config values, content strings and page rows the binding reads, not pictures. They are small enough to review, and the ruling names the picture copies only.
- **Also left out:** mobile/__tests__/fixtures/parcelSearch.situations.json (hand-written inputs).
- **Inside the scope:** the other three copies (disambiguation_map, semi_question, wall) are the same kind as the search copy: the same generator line :115 and the same check. The ruling's plural "copies" covers all four, and one glob takes them.
- **Not touched:** no check, hook, bound, option, spec, dated note, README or generated page. Spec 08:231/:233 and .claude/review-templates/README.md:154 describe exempt in general and list no globs.
- **Risks:**
  - (a) T4's copy is about 10 MB (du: scripts/surfaces 7.6 MB, fixtures 1.2 MB, the rest 0.9 MB), similar to emitCopy. Time goes up by about a second. Detected by the suite time.
  - (b) If 465 merges the board and the board has commits since 1aee693d6 that touch paths on 465's Files line, those paths join 465's coverage range (:836-842). The close names any path missing from the chunks (:124).
  - (c) If the 465 material is built from the old brief's command, lens-input still refuses at :434. Fix by rebuilding it with the new exclude.
  - (d) If 469's close is tried before the fold, it is refused at :772 with a clear message.
  - (e) If the `$comment` line breaks the regex at :178, T1 stays red.
  - (f) If a later surface's copy is hand-edited, `emit-mobile-surfaces --check` names it. That check runs through surface-validate in the suite (mcfront-proof canary b) and in the proof slice.

#### 7. Order of landing, notes, lists
1. Launch 469 (lane via backlog-lane.mjs).
2. T1-T4 red, then the table edit, then green; commit on the lane.
3. Station suite on the work commit (RR-0467, the existing station, before the output review); a failure is fixed on the lane first.
4. Output review on the lane: the one code-review lens on the range from L to HEAD, input built by lens-input.
5. The separate output grounder rules it (RR-0359: nothing is folded before it has ruled); every confirmed finding is fixed on the lane (the lens input is rebuilt if a fix touches the two files); the review records are committed on the lane, records only.
6. Fold the lane onto the local wf2/board (a merge commit, as for task-464 at aca7d541d). Forced before the close: the exempt key is read from the board (:729/:787) and :772 refuses a lane whose own exempt differs; Spec 08:233 "land on the board first". It comes after step 5, so RR-0359 holds.
7. The lane merges wf2/board (a fast-forward onto the fold); `git diff wf2/board -- scripts/analysis/rule-lists.json` prints nothing.
8. Close 469: the closing commit stages records only; the close check reads exempt from the board, which now holds the glob (the F8 test pins fold then close). The closing commit reaches the board by the normal fold.
9. wf2/mcfix465 merges wf2/board (conflict on the 465 card only; section 3 gives the resolution). Required: :772 refuses while 465's branch exempt differs.
10. Rebuild 465's output material with the new exclude; lens-input must pass its size bound (AC3). Gate: if lens-input refuses any other file, stop and return to the operator; no other glob is added under RR-0502. Then review and close.

- **Push:** not needed for 469's own close; the local ref is used first (:129). The operator's push turn decides when it reaches origin.
- **Card notes (backlog CLI only, never a hand edit):**
  - On task-469: the plan, the red and green evidence, and the fold sha.
  - On task-465: one short note saying its lane must merge wf2/board after the 469 fold and rebuild its material, with the conflict resolution of section 3. It is the only other card that gets a note: it is the only open lane, and a note on a card not launched would go stale.
  - Keep the notes short (RR-0429, MD:2203). No spec dated note is needed; the precedent added none.
- **Rule lists this card attaches** (run of `rule-lists.mjs resolve --type fix --letter S` on the Files line below):
  - rule-lists.json via the lane-tools row (rule-lists.json:163-167): agents-s5-1to3, agents-s7-s11, eng-all.
  - The test via the tests row (:225-227): eng-all.
  - Every task: plan-protocol, inc-S, ms-S.
  - The plan review gets all six. The output review of a fix task gets none (output_off, rule-lists.json:8), only its lenses (code-review etc.).
  - The diff is about 3 lines of table plus about 40 lines of test: one input, no split.
  - Putting the red proof in rule-lists-table.logic.test.ts rather than surface-conformance.logic.test.ts avoids attaching surface-136. It also avoids the file 465 edits (its hunk is at :263-266).

Files: scripts/analysis/rule-lists.json, src/tests/backlog/rule-lists-table.logic.test.ts

#### 8. Open choices
- **Where T4 lives.**
  - A: rule-lists-table.logic.test.ts (recommended: one test file, no extra list, no overlap with 465).
  - B: surface-conformance.logic.test.ts next to the L8 test, reusing emitCopy :1020. This adds surface-136 to the review and is a file 465 also edits.
  - The precedent (c8efb23f5) used the table test only.
- **Push of the board before 465's review.** The code does not require it (:129). Recommendation: no extra push; follow the normal push turn.
- No operator question is needed.

#### 9. GUESS estimate
About 45 minutes of build (tests, table, two runs) plus one output review round.

#### 10. UNVERIFIED
- lens-input itself was not run on 465's material; the per-file sizes were measured (section 3) and the gate in step 10 stops the work if another file is refused.
- Settled by the plan grounder: checkOutputs on the board tree returned no problem at 05026ae0a (run in memory); the run on the copied tree in T4 is the lane's.
- Case (c) edits a value in src/tests/fixtures/surfaces/mobile_parcel_search/ambiguous.mobile.json (first in the sorted list); every value of a source reaches the copy (emit-mobile-surfaces.mjs:112-115), so the edit turns GEN-STALE.
- The standing word that the work be simple was not found by grep in MD; nothing in the plan rests on it.
- Settled by the plan grounder: git worktree list shows both worktrees of one bare repo, and git for-each-ref from the board worktree lists wf2/mcfix465, so the local wf2/board ref is the one the 465 close reads (:129).
- The time T4's copy adds to the suite.

Plan review round 1: 20 folded, 0 task, 0 ruling, 0 wontfix, 2 pile; grounder docs/reports/reviews/task-469/GROUNDER-PLAN.md; triage docs/reports/reviews/task-469/TRIAGE-PLAN.md
plan-error-paths#1 MED folded Each of (b), (c) and
plan-plan-review-deepseek#1 MED folded the largest remainin
in#1 HIGH folded Resolution: take the
in#2 MED folded the lane did not tou
rg#1 HIGH folded Station suite on the
rg#2 MED folded No test pins an exem
rg#3 MED folded Extend the rule sent
rg#4 MED folded Every other lane mus

## Implementation Notes
2026-11-25 taken on the board at lane launch (lane BL-MCFIX469, worktree /Users/brettpreston_macmini/Buildo-wt-mcfix469, branch wf2/mcfix469), RR-0240

Build (lane BL-MCFIX469, PLAN-469-v1 sections 4-5): tests T1-T4 written first in src/tests/backlog/rule-lists-table.logic.test.ts (V2.LIST round 7 describe); red proven by a commit attempt with only the test and task files staged (pre-commit related run refused it; lane record red.out).

Red (red.out, refused commit attempt): T1 (count 9 not 10) and T2 (mobile_parcel_search.goldens.json not exempt) red as planned; T4 also failed on the first attempt for a test defect, not a product one: the emitter runs main only when argv[1] equals its resolved path and the OS tmp dir is a symlink on macOS, so the copy root is now realpath'd (the stdout 'surfaces ok' assertion caught the silent exit 0). Green: rule-lists.json gains the glob mobile/__tests__/fixtures/surfaces/*.goldens.json (last exempt element), its $comment line naming emit-mobile-surfaces.mjs --check, and the half line on the round-7 rule sentence; rule-lists.mjs validate ok (58 lists, 23 rows); page --check current; emit-mobile-surfaces.mjs --check on the lane tree: surfaces ok (5 surfaces, 33 goldens). AC3 (465 lens-input without the size refusal) is proven after the fold, on task-465.

## References
- docs/reports/reviews/task-469/GROUNDER-PLAN.md
- docs/reports/reviews/task-469/TRIAGE-PLAN.md
- docs/reports/reviews/task-469/seat-integration-1.md
- docs/reports/reviews/task-469/seat-reality-check-1.md
- docs/reports/reviews/task-469/seat-regression-1.md
- compliance:agents-s5-1to3 docs/specs/00-architecture/08_agents.md
- compliance:agents-s7-s11 docs/specs/00-architecture/08_agents.md
- compliance:eng-all docs/specs/00_engineering_standards.md
- compliance:plan-protocol docs/specs/00-architecture/plan-protocol.md
- compliance:inc-S backlog/docs/increments/doc-2 - Increment-S-requirements.md
- compliance:ms-S backlog/milestones/m-1 - increment-1·b-search-[s].md

## Documents
- (none)

## Decisions in force (titles; the ones this task names carry the operator's words)
- RR-0005 2026-11-18 · Operator direction: page-level lot information in increme
- RR-0087 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0315 Plan: go on sections A and B; tasks added to Increment 1B
- RR-0316 Plan: close check folded as built
- RR-0317 Plan: review enforcement only
- RR-0318 Plan: section E accepted
- RR-0319 C2 failed compute: error screen with Try again, not counted
- RR-0320 C3 legal line at the bottom of the phone search page
- RR-0321 D13 semi page buttons 48 px is the operator ruling
- RR-0322 C5 engine numbers to every paying user at once
- RR-0323 D1 freshness compare left until stored records exist
- RR-0324 Semi page cache write accepted as built
- RR-0088 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0325 Phone keeps its 3 retries (reading)
- RR-0326 Web search legal line at the bottom (reading)
- RR-0327 Page structure to table-driven pages: the five items go ahead
- RR-0328 The app is not in use, in development
- RR-0329 Task 370 dropped from Increment 1B (reading of the answer)
- RR-0330 Six-row table as put, including task-348 answered (reading)
- RR-0331 Report meter stays in the lookup route
- RR-0332 A McFix task may file under the McFrontend row that built what it fixes
- RR-0333 A task is not complete until it works
- RR-0334 Five reviewer-input items agreed, existing mechanisms first
- RR-0092 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0335 Rule 3 two-commit close for lane build and fix tasks
- RR-0336 Items 0 to 8 approved for task-399 and task-375
- RR-0337 Two binding checks added to the existing tasks, full panel on them
- RR-0338 Low-priority findings go to a review pile; Reality-Check and Integration on the additions
- RR-0339 Hardening rounds are warranted and bounded
- RR-0340 Four uncovered parts of the six steps go into the plans, with a second pass
- RR-0341 Loading screen gives up after 60 seconds
- RR-0342 Regression and Reality-Check seats in the lane protocol, by their written triggers
- RR-0343 Compliance documents on a task are labelled as compliance
- RR-0344 Reviews re-run; BUILT needs an output review; seats on plans
- RR-0099 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0345 Pre-launch steps by hand for task-375 then scripted
- RR-0346 The lane fixes and closes a grounder verifies the orchestrator routes
- RR-0347 Reality-Check runs when it cannot be told that no figure changes
- RR-0348 The tool-having seats run on the plan only
- RR-0349 Starting shape compliance on plan and output
- RR-0350 Build authorized tonight open questions grounded and taken as approved
- RR-0351 The cross-read adversary pass is not needed
- RR-0352 Design gaps 1 and 2 resolved now, the plan reviewed first
- RR-0353 The 29 scorecards are resolved the right way
- RR-0354 The spec wording on the cross-read adversary is changed
- RR-0136 Operator: start Increment 1·A
- RR-0355 Scorecard plan agreed, push as soon as possible, gaps in parallel
- RR-0356 A plan for the output review of the built tasks, with a grounded recommendation
- RR-0357 GO for the scorecards, given in the chat before the rehearsal
- RR-0358 The scorecard rehearsal is waived if it gives no benefit
- RR-0359 Nothing is folded before the grounder has ruled — "That's ridiculous to fold before the grounder review - the focus is on getting it right" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1687)
- RR-0360 CLAUDE.md loses the cross check; the wording 'stays available on request' is approved
- RR-0361 Built tasks: ground the old findings and include them in a new pass; plan not approved
- RR-0362 GO on the queue row for migration 334 so the push can be retried
- RR-0363 The protocol shape: rules for the reviewer; plan review, grounding, fold, build, output review, grounding, fold; no review of paperwork
- RR-0364 Medium and low findings recorded not fixed; paperwork tasks get a grounder check, no review
- RR-0137 Operator: completeness, holistic and per-increment optimisation
- RR-0365 Cut the task-423 plan to the five adjustments; panel review, ground, present with tasks ready
- RR-0366 The tasks of the task-423 plan are pre-approved; output reviews limited to something reasonable
- RR-0367 Paperwork yes; plan findings ruled once yes; fix-only re-review held; important medium findings are fixed
- RR-0368 Go on step 1 of the rules sections: the check plus Spec 137, Spec 08 and the engineering standards
- RR-0369 Output round 1 fixes mediums with highs and criticals; round 2 is highs and criticals only
- RR-0370 Task-419 closing round approved on condition; station option C plus the one line; spec rules sections as later board tasks
- RR-0371 Round caps: two rounds on the plan, then to the operator; three rounds on the output
- RR-0372 Task-423 fix round; per-document form stays the default; joining decided by a three-run measure in task-427
- RR-0373 RR-0372 is withdrawn: the operator did not approve it
- RR-0374 Task-423 fix round approved (step 1); rules sections approved when they arrive (step 2)
- RR-0139 Operator: push 6, re-sort, answer page
- RR-0375 Task-423 closes if it is verified
- RR-0376 Step 2 re-scoped: Spec 137 and Spec 08 left as they are; engineering standards rule list and handbook; a look at what front-end tasks attach beside Spec 136
- RR-0377 RR-0376 is planning only: nothing starts on the step 2 re-scope
- RR-0378 Review-inputs plan approved and running: handbook plus relevant engineering sections; fresh context; rules-checked line; tasks 427 and 425 removed
- RR-0379 Step 1 runs in parallel; handbook rules are added over time
- RR-0380 Plan 431 questions: surface specs dropped once the handbook holds the critical items; engineering sent by parts now; sections 8, 10, 12 to both sides; by-law tasks gain no engineering rules
- RR-0381 Task-433: the lane reviews with a copy of the launch-commit compliance template (grounded fix approved)
- RR-0382 Engineering standards get a dated note: UI library lines superseded by Spec 126 for the front end
- RR-0383 Plan 431 question 3: tasks that edit the surface specs keep those specs attached
- RR-0384 Task-430 scope approved: stop the handbook clipping, lines reflect their dated notes, add the 13 lines (item 9 a pointer)
- RR-0140 Operator: faster pushes and GOs asked
- RR-0385 McFix Final plan: Opus plans and builds, engineering seat, two rounds, validation without the operator, unbuilt gates withdrawn, tests are the focus
- RR-0386 Task-367: gates parked, handbook tests start fresh; landing gates A and B is a later decision with its own card
- RR-0387 McFixReborn: each built task gets its own output review and confirmed findings are fixed by ordinary fix tasks; no new infrastructure; old findings dropped
- RR-0388 McFixReborn waits until the new tests are in place
- RR-0389 The model conflict is resolved by updating the key specs and docs themselves
- RR-0390 task-430 output review size: option A, one larger review message, tried once
- RR-0391 a card to widen the security lens; McFixReborn next once these close
- RR-0392 one push for all four; no other infrastructure beyond this — "Push for all 4. I  don't think we need any other infastrcuture beyond this.. we are good to go!" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975)
- RR-0393 McFixReborn next, continued after tasks 424 and 386
- RR-0394 security lens option A: API routes and library code
- RR-0141 Operator: Q-LT-1
- RR-0395 one small task adds the missing handbook lines before task-439 lands
- RR-0396 the handbook task adds the R-22 line only; no seam sentence on fe.49
- RR-0397 chain more pushes together: fewer, larger pushes
- RR-0398 the one-list task writes one Files entry with a star (option A)
- RR-0399 rule fe.36 is marked partly in the rule look
- RR-0400 R-22 only was not a limit; what is best governs
- RR-0401 investigate the typed 10 percent circulation text on the houseplex option
- RR-0402 circulation text: option A, drop the percent; card opened
- RR-0403 circulation text fix merged into task-442; no separate process for task-447
- RR-0404 planner redirect approved: task-447 planner returns a section for task-442
- RR-0143 Operator answer IMG-1: six lot-size bands
- RR-0405 houseplex size basis wording: the basement, not shared stairs and halls
- RR-0406 McFixReborn label on the tasks that process covers
- RR-0407 next push as soon as possible; does not wait for task-442
- RR-0408 McFixReborn in merged groups by shared files; map validated before anything proceeds
- RR-0409 McFixReborn map: the three hand-written schema files are reviewed; a plan is needed for the oversized files
- RR-0410 McFixReborn map: the script with no rule-list row is not reviewed
- RR-0411 McFixReborn label stays on task 349; merged groups move forward
- RR-0412 task 386 merged into McFixReborn; tasks 442 and 367 run once the push lands
- RR-0413 task-367: the three handbook rows flip to RULED with their tests; the operator confirms the three rows
- RR-0414 task 442 re-makes only its three changed lists; five McFixReborn map decisions
- RR-0012 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0144 Operator answer PRG-1: purge rule
- RR-0415 McFixReborn group reviews outside a lane: liked, to be grounded; tasks 442 and 367 to be running
- RR-0416 Operator pre-approves removing lane work folders to free disk space
- RR-0417 FE-51 tab switch may read RULED with its two named owned exceptions
- RR-0418 Rule lists per task are cut down by turning lists off in the table
- RR-0419 The rule-list table edit is approved as one task
- RR-0421 Rule-list decisions 1 to 4: all four recommendations approved
- RR-0420 Review-cost problems join the rule-list plan: plan, ground, then recommend
- RR-0422 Review-cost task: Minimum package, decision 1 stays at a
- RR-0423 Review-cost task: two small fixes added, plan approved, move forward
- RR-0424 Task 448 also corrects the close check's refusal-message sentence
- RR-0145 Operator answer TRK-1: tracked lots refresh
- RR-0425 Push order: 442 and 367 first, task 448 later
- RR-0426 Task 448: stale launch-script comment fixed; by-law pre-registrations unchanged
- RR-0427 DONE record moves for the pushed tasks, as one batch
- RR-0428 The seven pushed tasks stay BUILT; no review for the DONE word
- RR-0429 Dated notes are kept short — "Keep notes short." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2202)
- RR-0430 The six unlabelled running tasks join McFixReborn
- RR-0431 McFixReborn: each set of files reviewed once, output only
- RR-0432 McFixReborn: fold the six first; progress in the orchestrator's table
- RR-0433 The six fold as they are; the group review is their one output review
- RR-0434 McFixReborn proceeds as per the status table
- RR-0146 Operator answer PG-1: pushes and GOs
- RR-0435 The orchestrator may do the merge edits and the test fix for the six
- RR-0436 Option 1 confirmed for the remaining folds
- RR-0437 Task 388 left out of the folds; nine paperwork notes approved
- RR-0438 Task 349 D3: the public web report page is wired at launch
- RR-0439 McFixReborn review calls: 120,000 characters; each list reads only its own files
- RR-0440 plan to drop the planning and process lists from reviews
- RR-0441 McFixReborn reading seats: reality check and integration run, code review dropped
- RR-0442 the search opens a lot on an exact match
- RR-0443 report limit: top-up or higher-subscription screen; questions grounded before they reach the operator; partial address = pick from close addresses
- RR-0444 fold the McFixReborn findings
- RR-0147 Operator answer NAME-1
- RR-0445 limit and reactivate screens: mobile first, also on the web, follow the earlier process
- RR-0446 several-lots map stays as built; no-plan page joins the limit-screen task
- RR-0447 clean the board (label dead), review all tasks, then add the search-fix tasks
- RR-0448 the search-fix cards are created as 8 merged tasks
- RR-0450 queue rules and orchestrator note off for code reviews; step handbook for compute only; three questions replace the five principles
- RR-0452 tooling plan approved; the three questions are not added
- RR-0453 Real addresses stay in the task 449 test rows
- RR-0454 No switch on exact match; task 14 after launch; limit and no-plan screens wait for the buying work
- RR-0455 Task 452: web waits for switch-on; card split; spring is one card in Increment 1·C
- RR-0456 Semi question page gets a time limit; a zero-second rate limit retries once
- RR-0149 Increment 1·A tooling location
- RR-0457 Output review shape agreed: code review, mechanical checks, one validating grounder; plan to follow
- RR-0458 Output review shape applies to all cards; plan shown against the agreed actions as one small task
- RR-0459 Smaller output review: no error-paths review at output; task created with label ProcessImprovement
- RR-0460 Phone tests local first; inline report it link accepted; proof for new phone tests
- RR-0461 Card 461 clean seat report: run a fresh integration seat
- RR-0462 Phone checks quick plan approved; a dead card carries only the label dead
- RR-0463 Task 458 haptic feedback moves to Increment 1C
- RR-0464 Task 460: no separate security review at output; the validating grounder reads the sensitive files
- RR-0465 task 455 (a confidence word per reading) moves to Increment 1·D beside task 76
- RR-0466 task 452 limit screen keeps the notice box, first line emphasised, new wording
- RR-0150 Infra freeze named list
- RR-0467 task 452 line three is wording A; station runs on the fix commit before the review — "1 What is a lot service - doesnt make sense 2. a 3 what is this? 4 yes" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2424)
- RR-0468 task 452 failed-read notice on the limit screen: Something went wrong on our side. Please try again.
- RR-0469 task 452 the limit screen's own code file WallBinding.tsx is confirmed
- RR-0471 iPhone run: free Apple account, phone may reach the Mac on the home Wi-Fi, GO for a read-only test database check
- RR-0472 GO: bring the local test database up to the current migrations
- RR-0473 Yes: install CocoaPods and copy the Google settings file, local only
- RR-0474 External drive left alone; tasks 463, 456 and 454 worked overnight
- RR-0475 answers to the six morning questions
- RR-0476 phone test next; two process questions asked
- RR-0477 phone test now; batching rule adopted
- RR-0152 Increment 1·A re-use and drops
- RR-0478 sign-up allow-list entry confirmed (task-456)
- RR-0479 brief lines and the batching line, without the lane process
- RR-0480 phone test: onboarding flag for one test user on the local test database
- RR-0481 phone test: report switch on locally, onboarding flag for the at-limit test user
- RR-0482 phone walk findings: sort, rule, batch into larger cards; fold 454 and seed the test stack
- RR-0483 search box the Google way, Enter wired, a card for the report counter
- RR-0484 dev GO for the six task-454 settings rows
- RR-0485 phone walk rulings: semi inside the search card, range check 1.C, no onboarding question, no report without pricing, loading animation always, Enter opens the lot
- RR-0486 McFixV2: phone walk fixes go into five existing cards, relabelled; go given
- RR-0487 task-465 search box mock approved
- RR-0154 Work pulling
- RR-0488 dead label only for absorbed cards; pushed cards move on to done; phone walk a standing proof step; search proof split
- RR-0489 search proof reduced to four steps: phone walk, one database read, pointer to passing tests, known gaps list
- RR-0490 load failure: keep the built sentence; animation finishes before a failure shows; no-report screen with the address; give-up time pending a mock
- RR-0491 loading screen endings mock approved, loading line centred
- RR-0492 loading: a failure shows right away; lines stay on the ending screens for now; changes RR-0490 3 b
- RR-0493 loading: 60 seconds is the failure limit; the label Checks for this lot is shown; no-report shows at once (as read)
- RR-0494 loading: a lot with no report shows the no-report screen at once
- RR-0495 search box: the type-more prompt line is dropped; a too-short entry on Enter shows No lot found
- RR-0496 app first: the app tasks grouped as McApp (incl. saving a lot or report); McWeb pages; McLive and McNightlyTests proposed for later
- RR-0497 loading plan: 1 A, 2 A, 3 A; saving a lot is McApp; no cloud database move until the increments are complete
- RR-0156 Push 6 literal test
- RR-0498 McApp and McWeb: Account first version yes; nightly tests later; card for plans, success and cancel pages; 8 db test failures onto the loose-ends card; paid test user to its limit on the test database
- RR-0499 the MaxBLD app lives inside the one project (A); search page not converted to table rows; Expo upgrade yes
- RR-0500 saving a lot builds now with McApp
- RR-0501 Increment 1-C plan approved: McApp four cards first, then McWeb three with wiring; polish and later items to the last increment
- RR-0502 review skip list: add the generated phone picture copies (card 465 blocker) — "465 a" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2613)
- RR-0503 card 313 front door: no-plan user reaches search and sees the notice (1 A); start-up screen differences accepted (3 A)
- RR-0504 stay with A: the MaxBLD app stays inside the one project
- RR-0505 card 313: a deleted account reaches search with the no-plan notice until card 2 (A)
- RR-0506 McApp: the phone icon logo joins card 313; card 469 order: build, station, review, grounder, fold, close
- RR-0507 the phone icon is the approved House Mark with the MaxBLD brand name added at the top
- RR-0157 Push 6 R-MD
- RR-0508 phone icon: MaxBLD inside the square just above the house; BLD in the agreed colour
- RR-0509 phone icon: the mark alone, no name inside (replaces RR-0507 and RR-0508)
- RR-0510 card 313 title is stale; retitled to match RR-0499
- RR-0014 McSTORAGE-RULINGS.md:5
- RR-0159 Push 6 recapture; 1·A panel scope
- RR-0161 Work pulling
- RR-0162 Answer ONE-1
- RR-0163 Answer ONE-2
- RR-0164 Answer ONE-4
- RR-0165 Answer ONE-5
- RR-0166 Answer ONE-12
- RR-0167 Answer ONE-13
- RR-0168 Answer ONE-21
- RR-0169 Answer ONE-22
- RR-0028 open-questions.md:1088
- RR-0170 Answer ONE-35
- RR-0172 Search lot map street name
- RR-0174 Loading screen
- RR-0176 Loading screen
- RR-0178 MB-44 W timing
- RR-0179 Load-failure page
- RR-0180 Web recent-search chips
- RR-0182 Search identification and semi wiring
- RR-0184 Semi question page design
- RR-0186 Inc6 protection window
- RR-0044 2026-11-18 · Operator direction: page-level lot information in increme
- RR-0188 Push 6 recapture
- RR-0190 Enforcement
- RR-0192 Operator oversight scope
- RR-0193 McRecommendations
- RR-0195 Push CHK.5/CHK.3
- RR-0196 Push CHK.5/CHK.3
- RR-0198 Push 6 recapture
- RR-0200 Recommendation tracking tools
- RR-0202 Backlog working board
- RR-0203 Backlog working board
- RR-0060 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0205 Backlog home of the plan
- RR-0207 Backlog: use all features, bring content and process over, ensure use
- RR-0208 Gates: assess necessity; Backlog to make the process followed and reviews validated
- RR-0210 McLane is the lane policy name
- RR-0212 Backlog plan v8 scope: loader + three gates
- RR-0214 1·A not replaced; relevancy pass after the move
- RR-0215 Images round 4 directions
- RR-0217 Concept gallery scope
- RR-0219 Backlog plan v8 approved
- 2026-11-18 re-use ruling: drop INFRA.2 guard.mjs and CHK.4 (operator words)
- RR-0080 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- Q-H2 drop the J5 storeys backfill chain (7.7-7.9, 7.23)
- RR-0232 Open decisions: grounding and verified recommendation
- RR-0233 Operator expertise scope
- RR-0235 McLane brief: full context from milestone, reviews and decisions
- RR-0242 One-command lane launch
- RR-0248 Increment 1·A parallel lanes
- RR-0264 Semi page placeholder in 1·B
- RR-0270 Web search footer: once, approved
- RR-0273 Shared footer component
- RR-0271 LOAD.1 drives the report now, ST.P1 split
- RR-0081 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0277 Search fuzzy matching reuses the permit address spec
- RR-0278 Report meter counts on report production only
- RR-0281 No clear-search button (A.11 not required)
- RR-0282 Daylight restyle token substitutions stay as built
- RR-0284 Lot map: two data reads allowed (C.5 footprint, C.7 card line)
- RR-0299 SRCH.C12 support address is a placeholder until launch
- RR-0300 1·B blockers as OPERATOR tasks
- RR-0298 Status changes only by the launch script
- RR-0301 task-341 approved: run tasks 121, 122, 123 now, then LOAD.1, LOAD.2, LOAD.4
- RR-0302 Loose ends task per milestone
- RR-0086 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0303 design-elements file: produce now if not a big job
- RR-0306 task-342 answered: the proof tool does not wait for the design-fit check
- RR-0307 task-340 answered: A.6 is built now from the existing entitlement read, compliant and researched first
- RR-0308 Semi question mock approved (task-319)
- RR-0309 Regenerated semi mock approved (task-319 stage 2)
- RR-0310 A.6 reset date served as a Toronto-time label (task-320)
- RR-0311 A.6 zero reports left still shows the line (task-352 question 1)
- RR-0312 No plan: an error page with a way to sign up (task-352 question 2)
- RR-0313 Search box says Enter a Toronto address (task-352 question 3)
- RR-0314 Outside-Toronto notice stays

## Milestone
m-1 Increment 1·B Search [S]

### Description

Increment S (re-opened, scenario slice)

### Problems
- None named in the S brief (docs/reports/plan-import/raw/2026-11-19/search-brief.json carries inc, deliverable and specs only).
- Found by the R10 validation pass (task-316, 2026-11-19), text left as found: the first two Storage set-up lines below still say a 35 s loading screen and LOAD.3; RR-0176 (decision-43, supersedes RR-0174) rules no 35 s cap and LOAD.3 dropped (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:785) "yes that is correct"
- Found by the R10 validation pass: two Storage set-up lines and four Register rulings lines end with the word undefined where a quote belongs (generator defect, draft task on backlog-brief.mjs); doc-16 section 5 row S still reads LOAD.1 to LOAD.3 (backlog/docs/doc-16 - McStorage-policy-v2.md:108)

### Project objectives
- Objective: finish a completed project, a database that works and is ready (operator 2026-11-17) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:652) "our objective is to finish a completed project ie a database that works and is ready"
- The database exists to service the designed report, details and search page (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:635) "the database is created to service the existing report and details as clairfied in the McFrontend. This includes the search page"
- A task that serves neither a designed element nor a supporting function is most likely not relevant (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:635) "If the ultimate numbers are not servicing this... or a supporting function the task most likely is not relevant or feeds old code"
- Five principles, keep it simple, no scope creep (~/Buildo-scratch/panel-tools/PLAN-PROTOCOL.md:3) "standardization, observability, scalability, accuracy, understandability; keep it simple; no scope creep"
- One plan only (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:652) "we need one plan - we can only execute one plan"

### Increment objectives
- Search comes before increment 1: the search page, then (1) address confusion, (2) lot confusion (docs/reports/plan-import/raw/2026-11-19/search-brief.json inc; ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "because we have done this plan by increments what about the "This Lot" information (Main page) and details as well as t"
- The search identifies two-or-more parcels at one address, a mis-typed address, or a possible semi lot, and wires each to the report; the semi calculation stays in Increment 7 (7.25) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:796) "Maybe the search portion done now with the page."
- What the customer sees: the 65 designed search elements A (search page), B (address confusion), C (lot confusion, lot map), D (semi question page), E (web search pages), F (landing entry), G (hand-off to the report) (backlog/docs/increments/doc-2 - Increment-S-requirements.md:27) "| id | element | where | status | deliverers | built |"

### Objectives
- Search comes before increment 1: the search page, then (1) address confusion, (2) lot confusion; most of it is already built (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "Operator, verbatim: "because we have done this plan by increments what about the "This Lot" information (Main page) and details as well as t"

### Deliverable
- A user types any Toronto address, resolves address or lot confusion through the designed pages (choose your lot, and the three states: intersection, no lot linked, many lots), and lands on the report (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:682) "Readings: (1) Q-GAP-0 image hold R-IMG1..3 LIFTED (dated note owed, M-246 form). (2) Q-GAP-2 "Most space": every option, a tie goes to the l"
- The search pages follow the Daylight product standard (small pages v8); today they are still old dark on origin (mobile/src/constants/parcelSearch.ts:58) (~/Buildo-scratch/mcfrontend/phase1/open-questions.md:1100) "R-D1 Daylight is the product standard: small pages (v8), landing (v10+), report (B v3: summary + concept gallery), demo "

### Specs
- Spec 89 parcel cost model tool (search parser rules): origin:docs/specs/02-web-admin/89_parcel_cost_model_tool.md
- Spec 126 MaxBLD surface standard: origin:docs/specs/02-web-admin/126_maxbld_surface_standard.md
- Current search (latest rendering + later rulings): ~/Buildo-scratch/lanes-20261117/search-delta/CURRENT-SEARCH.md
- MORNING-DECISIONS.md: ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md
- McFrontend phase1 open-questions.md (search and small-pages rulings): ~/Buildo-scratch/mcfrontend/phase1/open-questions.md
- PROTOCOL.md: ~/Buildo-scratch/panel-tools/PROTOCOL.md

### Rulings
- Search pages come first in the plan, before increment 1 (RR-0005) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "the search pages should be even before the increment 1"
- Search parser: fix the street direction guard and the unit-token strip before launch (RR-0166) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-12 a"
- W5 choose your parcel on the web is deferred and the web live switch stays off (RR-0170) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-35 b"
- Lot map: the street name on the road comes from the map's own road labels (RR-0172) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:775) "Map's road labels (Recommended)"
- The 'faces the street' rule question was withdrawn by the operator (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:774) "why does this matter? do you not know how to do the lookup?"
- Loading screen: the animation keeps its own length and always runs to completion; the button waits for the report AND See details; LOAD.3 not needed (RR-0176, supersedes RR-0174 which said 35,000 ms) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:785) "yes that is correct"
- The customer read module W (1.3) is built now in Increment 1 (RR-0178) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "1. it has to happen now - read the objectives"
- A load-failure page is a task, built from the other small pages (RR-0179) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "2. Add it as a task using the othr mini pages as a template"
- Web recent-search chips (E.6) stay deferred (RR-0180) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "3. This can stay defferred for now"
- 1·B builds A.6 and C.12 as their own tasks and identifies the semi lot; the semi calculation stays in 7.25 (RR-0182) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:796) "Maybe the search portion done now with the page."
- The semi question page is designed like the other small pages: a v8 mock for approval, then built (RR-0184) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:801) "also need a semi question page similar to a min page"
- Small pages: Daylight ("modern") is the product standard (R-D1) (~/Buildo-scratch/mcfrontend/phase1/open-questions.md:1098) "Just looking at the small pages - love it! Let's go with modern."
- Increment 1·B starts as a validation pass of its tasks, the semi page placeholder, the McFrontend fields and page tasks, dependencies and the prior panel records (RR-0257) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1019) "This work has been done - just validation."

### Storage set-up
- McStorage policy v2: a lot's numbers (main page and See details) are computed on first open from the search page (behind the 35 s loading screen), on track, or on owner input; stored with the stamp (Layer 2 table_version, evaluator_version, settings sha); a stale record is never served and is recomputed; no record for unopened lots; no all-lot fill (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:704; ~/Buildo-scratch/lanes-20261117/storage-policy/McSTORAGE-POLICY-v2.md) "undefined"
- Loading screen: starts at the search pick, waits for the numbers up to 35,000 ms (LOAD.1 to LOAD.3); skipped for a re-opened lot (its record is read); no screen for owner input or the Tracked Lots list (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:696; ~/Buildo-scratch/mcfrontend/MF-62/plan.md:44) "undefined"
- Search shows addresses only; the pick (lookup hit) starts the one-lot compute (LOAD.1) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:696) "undefined"
- ST-5 AMENDED 2026-11-18 (store on first open; prior text kept, superseded where it conflicts) (~/Buildo-scratch/mcbylaws/McSTORAGE-RULINGS.md:126) "undefined"

### Register rulings of this group (operator words)
- RR-0005 2026-11-18: Search pages first in the plan, before increment 1 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "Operator, verbatim: "because we have done this plan by increments what about the "This Lot" information (Main page) and details as well as t"
- RR-0137 2026-11-18: For increments 1b-10: all tasks present to fulfil each increment's objectives and deliverables (rulings most relevant, McStorage policy, compliance, project objectives; ensure relevancy); tasks optimised holistically, then within each increment, updated in the plan (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:729) "ensure all tasks are present to fufill the increments objectives and deliverables"
- RR-0144 2026-11-18: Stored lot records are purged after 90 days unopened (operator answer PRG-1 a); tracked lots are never purged while tracked (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "PRG-1 a (purge after 90 days unopened)"
- RR-0145 2026-11-18: Tracked lots are refreshed in the background when the stamp moves (operator answer TRK-1 a) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "TRK-1 a (background refresh of tracked lots when the stamp moves)"
- RR-0154 2026-11-18: When a task completes the next ready task starts at once; a task blocked on an operator question goes to the answer page and work moves to the next unblocked task; nothing waits idle. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:754) "it should pull the next task as something completes or move to the next task if a question remains"
- RR-0166 2026-11-18: Search parser (1.4): fix the two defects before launch (street direction guard, unit-token strip), with two labels and one dated note on Spec 89 line 33 (ONE-12 a) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-12 a"
- RR-0170 2026-11-18: W5 (choose your parcel) on the web: deferred; the web live switch stays off (ONE-35 b) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-35 b"
- RR-0172 2026-11-18: Lot map: the street name on the road comes from the map's own road labels; no new data read or drawing code. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:775) "Map's road labels (Recommended)"
- RR-0174 2026-11-18: Loading screen: the animation always runs its full set length (report_check_min_ms = 35,000 ms, default and maximum); the button to open the report shows when the lot's numbers are ready, at any time after the animation completes. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:779) "the animation still needs to be complete.. the button shows when its ready - anytime after the animation completes"
- RR-0176 2026-11-18: Loading screen: the animation keeps its own length (23 s today, may change later) and always runs to completion; the button to open the report shows only when the report AND See details are loaded, however long that takes (no 35 s cap); the 35,000 ms setting change (LOAD.3) is not needed now. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:785) "yes that is correct"
- RR-0178 2026-11-18: MB-44: T now, per-increment checks now, and the customer read module W (1.3) built NOW in Increment 1 (not after J9 in increment 8), because McStorage policy v2 computes at the search pick (MD:704). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "1. it has to happen now - read the objectives"
- RR-0179 2026-11-18: New task: the load-failure page shown when a lot's report or See details fails to load, built from the other small pages (small-pages-v8) as its template. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "2. Add it as a task using the othr mini pages as a template"
- RR-0180 2026-11-18: Web recent-search chips (E.6) stay deferred. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "3. This can stay defferred for now"
- RR-0182 2026-11-18: Increment 1·B builds A.6 (reports-left line, app search page) and C.12 (help link) as their own tasks; the search identifies two-or-more parcels, a mis-typed address, or a possible semi lot; the search portion and the semi question page are done now with the wiring (link) to the report; the semi calculation stays in Increment 7 (7.25). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:796) "Maybe the search portion done now with the page."
- RR-0184 2026-11-18: The semi question page is designed like the other small pages (small-pages-v8 Daylight): a mock from the v8 template for operator approval, then built (SRCH.SEMI). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:801) "also need a semi question page similar to a min page"
- RR-0186 2026-11-18: Increment-6 protection rules 1, 3, 7 and 9 are closed (D7 done); suites and pushes only through the push station and the operator; DB jobs only on the operator typed GO; rules 2, 4, 5, 6, 8, 10, 11 stay until push 6 lands. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:805) "y and your not following the McQueue rules"
- RR-0190 2026-11-18: Lane launches need an authorized plan for any repo worktree they write; every register row is marked operator words or orchestrator reading and only operator words feed reviews as rulings; orchestrator replies that recommend or name a ruling must cite file:line, an RR id or UNVERIFIED (enforced by hooks). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:813) "close the gap.  fix teh register"
- RR-0192 2026-11-18: Questions come to the operator only on database structure, the frontend, the user experience and storage; everything else is decided under the six-criteria rule, reviewed and logged as a McRecommendation card for audit. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:819) "I dont provide oversight on questions beyond the databse strcuture, the frontend the user experience and storage"
- RR-0193 2026-11-18: McRecommendations: every recommendation is a card in the repo decision log with customer / UX / space / DB-logic framing, options, rulings (operator words only), sources, research kept separate from the recommendation status (judgment only, reviewed, proven), five principles, what it serves, computed confidence and outcome. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:817) "the recommendation should be framed with an explanation that speaks to what I know"
- RR-0202 2026-11-18: The increment plan moves into the repo queue rows (Spec 137); the Backlog board generated from them is the working board, showing per task its increment, decisions and research (review/run) IDs. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:837) "I need to be able to see the board and the categories and the decisions and the research ids for each"
- RR-0203 2026-11-18: The move of the increment plan into the repo queues is done by a committed generator with --check, from a committed raw snapshot; nothing hand-copied. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:839) "use a generator"
- RR-0205 2026-11-18: The increment plan lives in Backlog.md in the repo (milestones = increments, assignees = lanes, priority/ordinal, dependencies, decision and research refs per task); the operator organises on the board; queue rows stay and are linked by id; loaded once by an import script. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:843) "yes of course"
- RR-0207 2026-11-19: Backlog: every feature is used; each increment's objectives, rulings, citations and storage objectives move over; the existing process (handbooks, Spec 08) is carried over; process documents are updated; the move is structured so the system is actually used. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:847) "Make sure opus actually uses the system"
- RR-0208 2026-11-19: The board data exists in the artifact and the procedures in Spec 08; the failure is scratch work, made-up responses and wrong reviewer context; hence the gates and full Backlog use. Each new gate is assessed as necessary or not, with how to do it right. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:848) "determine if the new gates etc are necessary and how to do this right"
- RR-0210 2026-11-19: The lane policy is named McLane in the Spec 08 and Spec 137 dated notes of the Backlog-home plan; McDecision is not adopted. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:852) "Let's stick with McLane for a name."
- RR-0212 2026-11-19: The Backlog-home plan is the loader plus the three enforcement pieces, with Backlog's own browser as the board; the v7 board job, mirror synchroniser, import verifier and structural gate are dropped (simple, no scope creep). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:867) "we needd the loader and the three gates"
- RR-0214 2026-11-19: Increment 1·A is not replaced by the Backlog plan; after the move every task on the board is re-checked for relevancy against the plan (kept / merged / changed) before 1·B starts. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:857) "ensure the tasks are updated and relevancy determined in light of the plan"
- RR-0219 2026-11-19: Backlog-home plan v8 is authorized (PLAN LOCKED): loader + three gates + Backlog's browser; D1-D5, D7-D10 as recommended; every relevant spec note lands; every imported task carries all available information; the 1·A tasks are updated or removed against the plan through the panel. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:871) "approved. ensure that all the relevant specs are updated and all the increment tasks with all the new information that can be given to the tasks"

### Compliance codes in use
- None named: no 1·B task (task-12, 13, 14, 68, 69, 266, 267, 268, and the promoted and created task-317 to task-325) carries a comp: label (checked on the task files, 2026-11-19).

### Decisions
Every file in backlog/decisions whose Groups line names S or whose Tasks named line names a 1·B plan id (checked 2026-11-19, R10):
- decision-1: RR-0005 2026-11-18 · Operator direction: page-level lot information in increme
- decision-15: RR-0137 Operator: completeness, holistic and per-increment optimisation
- decision-20: RR-0144 Operator answer PRG-1: purge rule
- decision-21: RR-0145 Operator answer TRK-1: tracked lots refresh
- decision-27: RR-0154 Work pulling
- decision-36: RR-0166 Answer ONE-12
- decision-40: RR-0170 Answer ONE-35
- decision-41: RR-0172 Search lot map street name
- decision-42: RR-0174 Loading screen
- decision-43: RR-0176 Loading screen
- decision-44: RR-0178 MB-44 W timing
- decision-45: RR-0179 Load-failure page
- decision-46: RR-0180 Web recent-search chips
- decision-47: RR-0182 Search identification and semi wiring
- decision-48: RR-0184 Semi question page design
- decision-49: RR-0186 Inc6 protection window
- decision-51: RR-0190 Enforcement
- decision-52: RR-0192 Operator oversight scope
- decision-53: RR-0193 McRecommendations
- decision-58: RR-0202 Backlog working board
- decision-59: RR-0203 Backlog working board
- decision-60: RR-0205 Backlog home of the plan
- decision-61: RR-0207 Backlog: use all features, bring content and process over, ensure use
- decision-62: RR-0208 Gates: assess necessity; Backlog to make the process followed and reviews validated
- decision-63: RR-0210 McLane is the lane policy name
- decision-64: RR-0212 Backlog plan v8 scope: loader + three gates
- decision-65: RR-0214 1·A not replaced; relevancy pass after the move
- decision-68: RR-0219 Backlog plan v8 approved

### Documents
- Requirements: backlog/docs/increments/doc-2 - Increment-S-requirements.md
- McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-2 - Increment-S-requirements.md#L27) and docs/reports/plan-import/raw/2026-11-19/elements-by-inc.json#S
- McStorage policy for this increment: backlog/docs/doc-16 - McStorage-policy-v2.md#L108-L108 and docs/reports/plan-import/raw/2026-11-19/storage-by-group.json#S

## Document sections
Cap: 120 KB in total, 12 KB per block (document blocks below; an omitted block costs its notice against the total); a block that would pass the total is listed as omitted. Sections named in a link (#L<n>-<m> or a section title) are read; with none named, the first 12 KB.

### Requirements: backlog/docs/increments/doc-2 - Increment-S-requirements.md (not readable: ENOENT; read it at Requirements: backlog/docs/increments/doc-2 - Increment-S-requirements.md)

### McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-2 - Increment-S-requirements.md (not readable: ENOENT; read it at McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-2 - Increment-S-requirements.md)

### McStorage policy for this increment: backlog/docs/doc-16 - McStorage-policy-v2.md (not readable: ENOENT; read it at McStorage policy for this increment: backlog/docs/doc-16 - McStorage-policy-v2.md)

## Decisions naming this task
- RR-0359 Nothing is folded before the grounder has ruled (names RR-0359) — "That's ridiculous to fold before the grounder review - the focus is on getting it right" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1687)
- RR-0392 one push for all four; no other infrastructure beyond this (names RR-0392) — "Push for all 4. I  don't think we need any other infastrcuture beyond this.. we are good to go!" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975)
- RR-0429 Dated notes are kept short (names RR-0429) — "Keep notes short." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2202)
- RR-0467 task 452 line three is wording A; station runs on the fix commit before the review (names RR-0467) — "1 What is a lot service - doesnt make sense 2. a 3 what is this? 4 yes" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2424)
- RR-0502 review skip list: add the generated phone picture copies (card 465 blocker) (names RR-0502) — "465 a" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2613)
- RR-0506 McApp: the phone icon logo joins card 313; card 469 order: build, station, review, grounder, fold, close (names task-469) — "the only other missing piece on the McApp is the phone icon logo - this should be added as well to the existing task . add the order." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2633)

## Prior reviews and lane reports
### task-469 (this task)
- docs/reports/reviews/task-469/FINDINGS-PLAN.md
- docs/reports/reviews/task-469/FOLD-CHECK.md
- docs/reports/reviews/task-469/GROUNDER-PLAN.md
- docs/reports/reviews/task-469/QUESTIONS-RULED.md
- docs/reports/reviews/task-469/TRIAGE-PLAN.md
- docs/reports/reviews/task-469/seat-integration-1.md
- docs/reports/reviews/task-469/seat-reality-check-1.md
- docs/reports/reviews/task-469/seat-regression-1.md

## Dependencies
- (none)
