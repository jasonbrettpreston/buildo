# Review context for task-448 (no plan id) written 2026-11-23 by backlog-brief.mjs (round 1)

## Task
task-448 FINAL.11 Review cost: each task is reviewed against the right rule lists only (rule table rows turned off), and the launch brief states the round-2 record form
status: LATER · milestone: m-1 · assignee: none · labels: McFix, McFix Final

## Description
Card opened 2026-11-23 by the orchestrator, Spec 137 rule 2, on the operator's rulings. RR-0418 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2140 and :2144, verbatim: "IT was these"): a front-end task is reviewed against the front-end handbook (Spec 136), the engineering standard, the four lenses and the four every-task lists; the back end the same with its own handbook; the queue, agent, policy and orchestrator-note lists and the old source specs are turned off in the existing table; nothing new is built. RR-0419 (:2149, verbatim: "Approved. Are there any other surprises in teh reviews that sonnet or anybody else does?"): one task. RR-0420 (:2155): the other review-cost problems join it. RR-0421 (:2161, verbatim: "1-4 recommendations approved"): 1 a old source specs 126, 127, 128, 135 off on every row (reverses RR-0383); 2 a phone rows keep mobile-90, mobile-98, mobile-99 and lose mobile-100, mobile-96; 3 a the four Airtight lists and storage-doc16 off; 4 a the lane-tools row keeps its process lists, every other row loses them. RR-0422 (:2166, verbatim: "Minimum and 1a. Let's add these small fixes to the cost review task."): the Minimum package; scripts/hooks/check-lane-close.mjs is NOT edited. RR-0423 (:2171, verbatim: "add teh first two.  Plan approved.  Move forward with the task"). WHY, measured: task-367's output review resolved 16 lists (961,597 characters, 78 DeepSeek calls, 285 findings to rule); with the table edit it resolves 6 lists (113,259 characters). THIS TASK, all of it turning things off or correcting text: (1) scripts/analysis/rule-lists.json: the row edits of PLAN-418-v1 section D as restated with RR-0421 in PLAN-418-part2-v2 (16 rows with a lists change; a not on the bylaw and lane-tools rows for prereg-MF files; the panel-records glob gains prereg-MF-*.json), and the why text of each changed row made true again (for example :152 and :140); (2) the tests that pin the table, edited first and seen red: src/tests/backlog/rule-lists.logic.test.ts, rule-lists-table.logic.test.ts, backlog-lane.logic.test.ts (including :552, named by the plan grounder); (3) the regenerated page docs/reports/generated/rule-lists-by-kind.md in the same commit; (4) scripts/analysis/backlog-lane.mjs:188, one sentence: a fix round re-makes every review file under the same names and round 1 is named by a history line (task-446, d04026fe5), with one test line; (5) dated notes in docs/specs/00-architecture/08_agents.md and 137_mcqueue.md for the rulings, including that the plan grounder writes the fold check itself, once, after the last fold (only if the plan grounder rules Spec 08 section 11.2 and the gate allow it). NOT in this task: any edit to check-lane-close.mjs or rule-lists.mjs, any new tool, hook, key or role. Inputs (outside the repo, saved verbatim): ~/Buildo-scratch/lanes-20261119/inc1b/lists418/PLAN-418-v1.md, GROUNDER-PLAN-418-v1.md (PASS WITH CORRECTIONS, nine corrections), PLAN-418-part2-v2.md. Known limit, told to the operator: tasks already launched are judged by the table at their own base; this helps every task launched after it lands. Principles served: simple, standardized, understandable.

Files: scripts/analysis/rule-lists.json, scripts/analysis/backlog-lane.mjs, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/rule-lists-table.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts, docs/reports/generated/rule-lists-by-kind.md, docs/specs/00-architecture/08_agents.md, docs/specs/00-architecture/137_mcqueue.md

## Acceptance criteria

## Implementation Plan
#### PLAN-448-v1

Task: task-448 (FINAL.11, build, milestone m-1). Plan seat: Opus, read-only (RR-0385 item 1, MD:1917).
- Board: ~/Buildo-wt-board, read at a75713110 ("docs(137_mcqueue): board edits 2026-11-23 15:11").
- Commands run: git, grep, sed, the backlog viewer, `rule-lists.mjs check-tasks` (it only prints), and in-memory node runs of resolveTask, validateTable, checkTasks, listBlocks and buildLensInputs on a copy of the table with the edits below. No test runner was run and nothing was written.
- Paths are relative to the board. MD = ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md.
- Inputs: PLAN-418-v1.md; GROUNDER-PLAN-418-v1.md (nine corrections, all applied); PLAN-418-part2-v2; GROUNDER-PLAN-418-part2.md (corrections 1-3, 6 and 7 applied; the C3, P4, C2 and FULL corrections do not apply to MINIMUM). All in ~/Buildo-scratch/lanes-20261119/inc1b/lists418/.
- Principles served: simple (data and text only), standardized (task-439's form), understandable (each changed row says what it now attaches).
- It adds no infrastructure (RR-0392, MD:1975).

#### 0. Facts verified

Rulings, with the verbatim words at these MD lines:
- RR-0418: :2140 "TWe only want to run these tings off not rewrite a new feature. This is simple." and :2144 "IT was these". decision-203.
- RR-0419: :2149 "Approved. Are there any other surprises in teh reviews that sonnet or anybody else does?". decision-204.
- RR-0420: :2155. decision-206.
- RR-0421: :2161 "1-4 recommendations approved". decision-205. This is 1a, 2a (keep 90, 98, 99), 3a and 4a.
- RR-0422: :2166 "Minimum and 1a. Let's add these small fixes to the cost review task." decision-207.
- RR-0423: :2171 "add teh first two.  Plan approved.  Move forward with the task". decision-208.

Where each judge reads its table:
- **Launch gate:** the board's table (backlog-lane.mjs:78).
- **Close:** the range base's table (check-lane-close.mjs:766-767, :842).
- **A task whose Files line names the table** is judged by its own branch table, with exempt, base_ref, finished_statuses, protected_paths and every_task pinned (:840-842).
- **Self-edit rule:** a commit that changes a protected path may not also close a task (:753). rule-lists.json is protected (rule-lists.json protected_paths).

Measured in memory (edited table, letter S unless named):

| Files line | before | after |
|---|---|---|
| task-367 | 16 lists, 962k characters | 6 lists, 113k: surface-136, eng-all, five-words, plan-protocol, inc-S, ms-S |
| task-442 | 13 lists, 707k | the same 6, 113k |
| mobile/src/app/ | 12 lists, 307,917 | 10 lists, 216,326 |
| docs/specs/03-mobile/100_mobile_parcel_cost_tool.md | 13 lists, 395,116 | 9 lists, 222,253 |

Other measurements:
- `validate` on the edited table returns [].
- `check-tasks`: 102 resolve, 0 bad, before and after.
- The record-only default row (queue-records) attaches no list.
- **Task-367 output calls per round: 78 → 18,** measured on the committed kept outputs. It would be 13 only if the context file is smaller. Round-1 findings to rule: 285 → 63.

Known loss under RR-0421 item 1a and 4a (part-2 grounder correction 1):
- **Task-442:** its one fixed finding (the stale `next:` field of the MF-97 status line, out-compliance-orchestrator-doc17#2) came from a list now off. It would no longer be caught.
- **Task-367:**
  - The FE-51 defect was also raised by 20 kept-list findings, so a fix would still be forced.
  - Its other three wording defects (agents-s7-s11, policy-124 and surface-126/135 findings) would no longer be caught.

#### 1. Scope

1. scripts/analysis/rule-lists.json:
   - lists changed on 16 rows;
   - a `not` on the bylaw and lane-tools rows;
   - one glob added on panel-records;
   - the `why` text of each changed row, and of the surfaces row, made true again;
   - one `$comment` phrase corrected.
2. Test edits in three files, written first and seen red.
3. The regenerated page docs/reports/generated/rule-lists-by-kind.md, in the work commit (pre-commit :44 runs `page --check`).
4. One sentence in scripts/analysis/backlog-lane.mjs:188 (the round-2 record form), with one test line.
5. Dated notes:
   - one under Spec 08 section 7 rule 4;
   - one under Spec 08 section 11.2 (the fold check);
   - one in Spec 137.

#### 2. NOT in scope

- No edit to scripts/hooks/check-lane-close.mjs or scripts/analysis/rule-lists.mjs (RR-0422).
- No new key, tool, hook, file kind or role.
- No change to `exempt`, `every_task`, `kinds` or any list definition. The lists stay defined; they are only unattached.
- Not fixed, known stale texts:
  - rule-lists.mjs:257 says a record task "defaults to the queue lists" (the file may not be edited);
  - the comment at backlog-lane.mjs:12 says the same (the card names one sentence in that file).
- The refusal text at check-lane-close.mjs:502 stays as it is. See section 8.

#### 3. The exact texts

#### 3.1 rule-lists.json: lists, `not` and glob

Line numbers are as read at a75713110, before any insert. Edit by the unique old text. Lines :163, :182 and :188 are identical, so those three are anchored with their row's globs line.

| row | line | old | new |
|---|---|---|---|
| step-pipeline | :88 | `"lists": ["step-132", "airtight-124a", "airtight-v3-122", "airtight-v2-122", "airtight-122a", "eng-back", "eng-shared"],` | `"lists": ["step-132", "eng-back", "eng-shared"],` |
| bylaw | after :93 | — | insert `      "not": ["scripts/analysis/bylaw-validation/coa-expected/prereg-MF-**"],` |
| surface-importers | :120 | `"lists": ["surface-126", "surface-128"],` | `"lists": [],` |
| surface-contract-routes | :126 | `"lists": ["surface-126", "surface-128", "surface-135", "surface-136"],` | `"lists": ["surface-136"],` |
| storage | :132 | `"lists": ["storage-doc16"],` | `"lists": [],` |
| compute-import | :139 | `"lists": ["step-132", "airtight-124a", "airtight-v3-122", "airtight-v2-122", "airtight-122a"],` | `"lists": ["step-132"],` |
| mobile | :151 | `"lists": ["mobile-90", "mobile-98", "mobile-99", "mobile-100", "mobile-96", "surface-136", "eng-front", "eng-shared"],` | `"lists": ["mobile-90", "mobile-98", "mobile-99", "surface-136", "eng-front", "eng-shared"],` |
| queue-records | :157 | `"lists": ["queue-137", "agents-s7-s11"],` | `"lists": [],` |
| lane-tools | after :162 | — | insert `      "not": ["scripts/analysis/bylaw-validation/coa-expected/prereg-MF-**"],` (lists :163 unchanged) |
| generated-reports | :170 | `"lists": ["policy-124-s2-s5", "agents-s5-1to3", "agents-s7-s11", "queue-137", "eng-all", "orchestrator-doc17"],` | `"lists": ["eng-all"],` |
| generated-127 | :176 | `"lists": ["surface-127", "policy-124-s2-s5", "agents-s5-1to3", "agents-s7-s11", "queue-137", "eng-all", "orchestrator-doc17"],` | `"lists": ["eng-all"],` |
| policy-reports | :181-182 | `"globs": ["docs/reports/policy/**"],` + next line `"lists": ["agents-s5-1to3", "agents-s7-s11", "queue-137", "eng-all", "orchestrator-doc17"],` | same globs line + `"lists": ["eng-all"],` |
| reference-docs | :187-188 | `"globs": ["docs/reference/**"],` + the same lists line | same globs line + `"lists": ["eng-all"],` |
| panel-records | :193-194 | `"globs": ["docs/reports/panels/**"],` / `"lists": ["surface-128", "surface-126", "agents-s7-s11", "queue-137"],` | `"globs": ["docs/reports/panels/**", "scripts/analysis/bylaw-validation/coa-expected/prereg-MF-*.json"],` / `"lists": [],` |
| review-followups | :200 | `"lists": ["agents-s7-s11", "queue-137"],` | `"lists": [],` |
| specs-docs | :206 | `"lists": ["eng-all", "agents-s7-s11", "queue-137"],` | `"lists": ["eng-all"],` |
| specs-mobile | :212 | `"lists": ["mobile-90", "mobile-98", "mobile-99", "mobile-100", "mobile-96", "surface-136"],` | `"lists": ["mobile-90", "mobile-98", "mobile-99", "surface-136"],` |
| specs-web-admin | :218 | `"lists": ["surface-136", "surface-126", "surface-127", "surface-128", "surface-135"],` | `"lists": ["surface-136"],` |

Why each special edit is needed:
- **The bylaw `not`** is needed under every option (part-1 grounder correction 3).
- **The lane-tools `not` and the panel-records glob** are needed under 4a: without them, a front-end MF pre-registration pulls in the by-law and lane-tools lists.
- **The `**` form is required:** the resolver also probes `<path>/x` (PLAN-418 section B).

#### 3.2 rule-lists.json: `why` and `$comment`

For each row, insert the text after the arrow immediately before the closing `"` of the old anchor. Every anchor is unique in the file, except the one replaced on two lines. Nothing is deleted, so the test-pinned phrases stay: "nearest lists, no governing spec: operator ruling owed", "no governing spec found: operator ruling owed", "left out for Increment 1·B", "The client is just glass", "one API route".

- **:89, anchor `are sent by side: the back-end lists eng-back and eng-shared replace eng-all on this row"`** → `. task-448 (RR-0421 item 3 a, decision-205): the four Airtight lists are off; this row attaches step-132, eng-back and eng-shared (every Airtight rule id has a line in Spec 132)`
- **:95, anchor `Spec 133 R-LD) are governed by the by-law handbook rules"`** → `. task-448 (RR-0418, decision-203): an MF pre-registration (coa-expected/prereg-MF-**, a front-end record) is excluded by not and takes no by-law list`
- **:121, anchor `the surface contract (Spec 126) and the surface policy (Spec 128)"`** → `. task-448 (RR-0421 item 1 a, decision-205, reverses RR-0383): Specs 126 and 128 are off; this row attaches no list`
- **:127, anchor `a drift test (rule-lists-table.logic.test.ts) fails when they differ"`** → `. task-448 (RR-0421 item 1 a, decision-205, reverses RR-0383): Specs 126, 128 and 135 are off; this row attaches surface-136 only`
- **:133, anchor `DRAFT, attached anyway: the operator confirms it binds)"`** → `. task-448 (RR-0421 item 3 a, decision-205): doc-16 is off; this row attaches no list`
- **:140, anchor `because the compute gates scan scripts/lib/compute by path only"`** → `. task-448 (RR-0421 item 3 a, decision-205): the four Airtight lists are off; this row attaches step-132 only`
- **:146 and :152, replace both occurrences:**
  - old: `gets them through the specs-web-admin row (RR-0383, decision-168)"`
  - new: `got them through the specs-web-admin row until task-448 (RR-0383, decision-168); RR-0421 item 1 a (decision-205) reverses RR-0383, so no row attaches them now"`
- **:152, opening:**
  - old: `"why": "the mobile app is governed by Specs 90, 98, 99, 100, 96 and Spec 136;`
  - new: `"why": "the mobile app is governed by Specs 90, 98, 99 and Spec 136 (Specs 100 and 96 were attached until task-448; RR-0421 item 2 a, decision-205, keeps the three protocols);`
- **:158, anchor `governed by Spec 137 and Spec 08 sections 7 and 11"`** → `. task-448 (RR-0418, decision-203; RR-0421 item 4 a, decision-205): Spec 137 and Spec 08 are off on this row and on the record-only default; this row attaches no list (the every-task lists still apply)`
- **:164, anchor `coverage review 2026-11-20: unmatched); the engineering standards are attached whole (eng-all)"`** → `. task-448 (RR-0421 item 4 a, decision-205): the only row that keeps these lists; an MF pre-registration under scripts/analysis/** is excluded by not and takes none of them`
- **:171, anchor `sections 2 and 5 of Spec 124), with the lane-tools lists as before"`** → `. task-448 (RR-0421 item 4 a, decision-205): the Spec 124 and lane-tools lists are off; this row attaches eng-all only (Rule 13 stays enforced by gate J)`
- **:177, anchor `also get the Spec 124 Rule 13 list and the lane-tools lists"`** → `. task-448 (RR-0421 items 1 a and 4 a, decision-205): surface-127, the Spec 124 list and the lane-tools lists are off; this row attaches eng-all only`
- **:183, anchor `not a spec). The lane-tools lists are attached as the nearest and are NOT presented as governing"`** → `. task-448 (RR-0421 item 4 a, decision-205): the lane-tools lists are off; this row attaches eng-all only`
- **:189, anchor `two of them (a Files path that matched no row); the lane-tools lists are attached as the nearest and are NOT presented as governing"`** → the same text as :183.
- **:195, anchor `Spec 08 sections 7 and 11 and Spec 137 govern it"`** → `. task-448 (RR-0421 items 1 a and 4 a, decision-205): Specs 128 and 126, Spec 08 and Spec 137 are off; this row attaches no list and also matches the MF pre-registration files (coa-expected/prereg-MF-*.json) so they resolve`
- **:201, anchor `before this row a lane could not write the file"`** → `. task-448 (RR-0421 item 4 a, decision-205): Spec 08 and Spec 137 are off; this row attaches no list and still lets a lane write the file`
- **:207, anchor `attached whole (eng-all), replacing the section lists"`** → `. task-448 (RR-0421 item 4 a, decision-205): Spec 08 and Spec 137 are off; this row attaches eng-all only`
- **:213, anchor `checked against the rules it must not contradict)"`** → `. task-448 (RR-0421 item 2 a, decision-205): Specs 100 and 96 are off; this row attaches mobile-90, mobile-98, mobile-99 and surface-136`
- **:219, anchor `so an edit to a surface spec is reviewed with that spec"`** → `. task-448 (RR-0421 item 1 a, decision-205, reverses RR-0383): Specs 126, 127, 128 and 135 are off; this row attaches surface-136 only, so the sentence above no longer holds`
- **:6, `$comment`:**
  - old: `(record-only tasks get the queue lists)`
  - new: `(record-only tasks: the queue-records row, which attaches no list since task-448, RR-0418; such a task gets the every-task, increment and milestone lists only)`

#### 3.3 backlog-lane.mjs:188 (one sentence, inside the `layout` template literal; no backtick in the new text)

- **Old:** `the second (fix) round (r2; two output rounds at most, RR-0385) is filed beside them as out-<lens>[-<list id>]-rN.txt with its in-<same name>: the close check reads it for findings like any out- file (each finding needs a verdict) and the round-1 file stays;`
- **New:** `the second (fix) round (r2; two output rounds at most, RR-0385): the fix commit changes the diff, so no round-1 input or output still matches it; round 2 re-makes ALL of them under the SAME names (overwrite out-<lens>[-<list id>][-pN].txt and in-<same name>, then a new GROUNDER.md and TRIAGE.md); the round-1 GROUNDER.md and TRIAGE.md are kept outside the folder and named by one line "Review round 1: <counts>; grounder <path>; triage <path>" added to the Final Summary before the close (task-446, d04026fe5); a file out-<lens>[-<list id>]-rN.txt is read for findings like any out- file but never stands in for a round-1 name;`
- The parity fragment `out-<lens>[-<list id>]-rN.txt` is kept, so backlog-lane.logic.test.ts:290 and :298 stay green.
- The history line matches the round count the close reads (check-lane-close.mjs:274-275).

#### 3.4 Dated note, Spec 08 section 7 rule 4 (insert after 08_agents.md:356, before :357 "5. **Panel sizing**", with the same 3-space indent)

`   Dated note 2026-11-23 (M-246, prior text kept; task-448 FINAL.11, McFix Final; RR-0418, decision-203; RR-0421, decision-205; RR-0422, decision-207; RR-0423, decision-208; operator, verbatim, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md, :2140 "TWe only want to run these tings off not rewrite a new feature. This is simple.", :2144 "IT was these", :2161 "1-4 recommendations approved", :2166 "Minimum and 1a. Let's add these small fixes to the cost review task." and :2171 "add teh first two.  Plan approved.  Move forward with the task"): rule lists are turned off in scripts/analysis/rule-lists.json; no code, key or tool changes. A front-end task is reviewed against Spec 136 section 2, its engineering lists, the four lenses and the four every-task lists (plan protocol, five words, increment requirements, milestone objectives); a back-end task the same with its own handbook. Off on every row: Specs 126, 127, 128 and 135 (RR-0421 item 1 a reverses RR-0383: the specs-web-admin row now attaches surface-136 only), Specs 100 and 96 (the phone rows keep 90, 98 and 99), the four Airtight lists and the McStorage draft policy (doc-16). Spec 08 sections 5.1 to 5.3, 7 and 11, Spec 137, doc-17 and the Spec 124 list stay on the lane-tools row only. The queue-records row attaches no list, so a record-only task with no Files line gets the every-task, increment and milestone lists only. MF pre-registration files (coa-expected/prereg-MF-*) resolve through the panel-records row and no longer take the by-law or lane-tools lists. This supersedes the words "(a record-only task gets the queue lists)" in the task-366 note of section 5.3 (:229), and in the task-439 note above (:356) the words "the mobile row keeps its five mobile lists" and "The specs-web-admin row keeps all five surface lists, so a task that edits a spec under docs/specs/02-web-admin/ is reviewed with that spec". Known loss, measured on tasks 367 and 442: findings that only the turned-off lists raised are no longer raised (442's stale next field; three of 367's four wording defects). A task launched before this landing is judged at close by the table at its own range base, so it keeps its old lists unless it merges the board. The launch brief (scripts/analysis/backlog-lane.mjs) now says that a fix round re-makes every review file under the same names and that round 1 is named by a "Review round 1:" line in the Final Summary (task-446, d04026fe5); the close check's refusal text still names the -rN form until a later task.`

#### 3.5 Dated note, Spec 08 section 11.2 (insert after 08_agents.md:489, with a blank line before and after)

`Dated note 2026-11-23 (M-246, prior text kept; task-448 FINAL.11; RR-0423, decision-208; operator, verbatim, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2171 "add teh first two.  Plan approved.  Move forward with the task"): for a plan launch, the plan grounder itself writes FOLD-CHECK.md, once, after the last edit of the fold; no separate fold-check agent is run. Its scope, in these words: it re-executes every claim the fold added or changed, which are the claims named by the folded: lines of TRIAGE-PLAN.md and the plan text that differs between the plan as the grounder ruled it and the plan as folded; claims the fold did not touch were executed when the grounder ruled them and are not run again. This narrows "re-executes every claim in the fold" (:486) to the claims the fold changed. The launch gate is unchanged: it reads only the form of FOLD-CHECK.md and that its checker is not the lane or an assignee (scripts/hooks/check-lane-close.mjs:692-712).`

#### 3.6 Dated note, Spec 137 (insert after 137_mcqueue.md:136, with a blank line after)

`Dated note 2026-11-23 (M-246, prior text kept; task-448 FINAL.11, McFix Final; RR-0418, RR-0421, RR-0422, RR-0423 (decisions 203, 205, 207, 208); operator, verbatim, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2161 "1-4 recommendations approved" and :2171 "add teh first two.  Plan approved.  Move forward with the task"): the importer, census-route, panel-record, generated-127 and specs-web-admin rows of scripts/analysis/rule-lists.json no longer attach Specs 126, 127, 128 and 135 (RR-0421 item 1 a reverses RR-0383). The queue-records row, and with it a record-only task with no Files line, no longer attaches Spec 137 or Spec 08; only the lane-tools row keeps them (RR-0421 item 4 a). The words of the task-439 note above, "the specs-web-admin row and the importer, census-route, panel-record and generated-127 rows keep them", no longer hold. The Spec 08 section 7 rule 4 note of task-448 has the whole account.`

#### 3.7 Spec 08 :361 (the task-437 rounds note): not stale

- Nothing in this plan changes the round cap, the round-2 MED form `ruling:RR-0385`, MEDIUM-LATER-ROUNDS.md, or what the close check counts.
- The new brief sentence names round 1 in the Final Summary. That agrees with :361, where the grounder's verdict line names the round, and with the close's "Review round N" count. No correction is owed.

#### 4. TESTS FIRST

The lane writes these edits first. It stages only the three test files and the task file, and attempts the commit. The pre-commit related run (.husky/pre-commit:56) fails; that output is saved as red.out. Then the lane adds the table, brief, page and notes and commits green.

**src/tests/backlog/rule-lists.logic.test.ts**
- **:38-39**
  - old: `    const doc16 = res.lists.find((l) => l.id === 'storage-doc16');` and `    expect(doc16?.status).toMatch(/draft, operator to confirm it binds/);`
  - new (one line): `    expect(ids(res)).not.toContain('storage-doc16'); // task-448 (RR-0421 item 3 a)`
- **:49, title**
  - old: `'a src file that imports from scripts/lib/compute gets the step and Airtight lists (import row)'`
  - new: `'a src file that imports from scripts/lib/compute gets the step handbook list and no Airtight list (import row; task-448, RR-0421 item 3 a)'`
- **:53**
  - old: `    expect(ids(res)).toContain('airtight-v3-122');`
  - new: `    for (const l of ['airtight-124a', 'airtight-v3-122', 'airtight-v2-122', 'airtight-122a']) expect(ids(res)).not.toContain(l);`
- **:55, title:** `and a surfaces importer gets Specs 126 and 128'` becomes `and a surfaces importer no longer gets Specs 126 and 128 (task-448, RR-0421 item 1 a)'`
- **:61**
  - old: `    expect(ids(imp)).toEqual(expect.arrayContaining(['surface-126', 'surface-128']));`
  - new: `    for (const l of ['surface-126', 'surface-128']) expect(ids(imp)).not.toContain(l);`
- **:67**
  - old: `    for (const l of ['eng-all', 'agents-s7-s11', 'queue-137', 'mobile-100', 'mobile-90', 'surface-136']) expect(mobile).toContain(l);`
  - new, line 1: `    for (const l of ['eng-all', 'mobile-90', 'mobile-98', 'mobile-99', 'surface-136']) expect(mobile).toContain(l);`
  - new, line 2: `    for (const l of ['agents-s7-s11', 'queue-137', 'mobile-100', 'mobile-96']) expect(mobile).not.toContain(l);`
- **:69**
  - old: `    for (const l of ['eng-all', 'agents-s7-s11', 'queue-137', 'surface-128', 'surface-135']) expect(web).toContain(l);`
  - new, line 1: `    for (const l of ['eng-all', 'surface-136']) expect(web).toContain(l);`
  - new, line 2: `    for (const l of ['agents-s7-s11', 'queue-137', 'surface-128', 'surface-135']) expect(web).not.toContain(l);`
- **:71**
  - old: `    for (const l of ['eng-all', 'agents-s7-s11', 'queue-137']) expect(pipe).toContain(l);`
  - new: `    expect(pipe).toEqual(['eng-all', 'five-words', 'plan-protocol', 'inc-1', 'ms-1']);` (resolved in memory, this order)
- **:73:** `.toContain('queue-137');` becomes `.not.toContain('queue-137');`
- **Unchanged:** :146, which still resolves agents-s5-1to3 through lane-tools; and FILES_423 at :919, where `toHaveLength(9)` at :934 still holds (resolved in memory).

**src/tests/backlog/rule-lists-table.logic.test.ts**
- **:29, title**
  - old: `'a panel record (docs/reports/panels/**) gets Specs 128, 126, 08 sections 7 and 11, and 137'`
  - new: `'a panel record and an MF pre-registration get the four every-task lists only (task-448, RR-0421 items 1 a and 4 a); a by-law pre-registration keeps bylaw-133'`
- **:30**
  - old: `    expect(lists('docs/reports/panels/MF-94.json')).toEqual(expect.arrayContaining(['surface-128', 'surface-126', 'agents-s7-s11', 'queue-137']));`
  - new:
    - `    const four = ['five-words', 'plan-protocol', 'inc-S', 'ms-S'];`
    - `    expect(lists('docs/reports/panels/MF-94.json')).toEqual(four);`
    - `    expect(lists('scripts/analysis/bylaw-validation/coa-expected/prereg-MF-96-1.json')).toEqual(four);`
    - `    expect(lists('scripts/analysis/bylaw-validation/coa-expected/prereg-MB-18-1.json')).toContain('bylaw-133');`
  - Both pre-registration files are tracked at the head.
- **:32, title**
  - old: `'a generated report gets the Spec 124 list (Rule 13, R-GW) and not surface-127; a 127-* generated file keeps surface-127 and gets it too'`
  - new: `'a generated report and a 127-* generated file get eng-all and the four every-task lists only (task-448, RR-0421 items 1 a and 4 a)'`
- **:34-37**
  - old: `    expect(g).toContain('policy-124-s2-s5');`, `    expect(g).not.toContain('surface-127');`, `    const g127 = lists('docs/reports/generated/127-surface-registry.md');`, `    expect(g127).toEqual(expect.arrayContaining(['surface-127', 'policy-124-s2-s5']));`
  - new: `    expect(g).toEqual(['eng-all', 'five-words', 'plan-protocol', 'inc-S', 'ms-S']);` and `    expect(lists('docs/reports/generated/127-surface-registry.md')).toEqual(['eng-all', 'five-words', 'plan-protocol', 'inc-S', 'ms-S']);`
  - :38-40 (the policy list definition) unchanged.
- **:43:** `.toContain('queue-137');` becomes `.toEqual(['eng-all', 'five-words', 'plan-protocol', 'inc-S', 'ms-S']);`
- **:48:** `.toEqual(expect.arrayContaining(['queue-137', 'eng-all']));` becomes `.toEqual(['eng-all', 'five-words', 'plan-protocol', 'inc-S', 'ms-S']);`
- **:100, title:** `, and attaches Specs 126, 128, 135 and 136 (operator "1-5 y", MORNING-DECISIONS.md:1520, item 2)'` becomes `, and attaches surface-136 only (task-448, RR-0421 item 1 a; the four specs came from the operator's "1-5 y", MORNING-DECISIONS.md:1520, item 2)'`
- **:103:** `toEqual(['surface-126', 'surface-128', 'surface-135', 'surface-136']);` becomes `toEqual(['surface-136']);`
- **:115, title:** `gain all four surface lists;` becomes `get surface-136 and none of Specs 126, 128, 135 (task-448, RR-0421 item 1 a);`
- **:117-118**
  - old: the two lines `    expect(lists('src/app/api/parcels/lookup/route.ts')).toEqual(expect.arrayContaining(four));` and `    expect(lists('src/app/api/admin/media/route.ts')).toEqual(expect.arrayContaining(four));`
  - new:
    - `    for (const p of ['src/app/api/parcels/lookup/route.ts', 'src/app/api/admin/media/route.ts']) {`
    - `      expect(lists(p), p).toContain('surface-136');`
    - `      for (const l of four.slice(0, 3)) expect(lists(p), `${p}: ${l}`).not.toContain(l);`
    - `    }`
  - :116 and :119 unchanged.
- **:239, title:** `'the real table: the file resolves agents-s7-s11 and queue-137 through exactly one row'` becomes `'the real table: the file resolves through exactly one row, which attaches no list since task-448 (RR-0421 item 4 a)'`
- **:240:** `toEqual(expect.arrayContaining(['agents-s7-s11', 'queue-137']));` becomes `toEqual(['five-words', 'plan-protocol', 'inc-S', 'ms-S']);`
- **:243:** `toEqual(expect.arrayContaining(['agents-s7-s11', 'queue-137']));` becomes `toEqual([]);`
- **:336**
  - old: `  const MOBILE = ['mobile-90', 'mobile-98', 'mobile-99', 'mobile-100', 'mobile-96', 'surface-136', 'eng-front', 'eng-shared'];`
  - new: `  const MOBILE = ['mobile-90', 'mobile-98', 'mobile-99', 'surface-136', 'eng-front', 'eng-shared']; // task-448 (RR-0421 item 2 a): 100 and 96 off`
- **:344:** the comment `keeps its other eight lists` becomes `keeps its six lists`. After :345, insert `    for (const l of ['mobile-100', 'mobile-96']) expect(lists('mobile/x.ts'), l).not.toContain(l);`
- **:353-354 unchanged:** the planted defect "mobile-99 dropped" still holds.
- **:356, title**
  - old: `'N2 (survive-the-fix, RR-0383): an edit to a surface spec still gets the four specs and Spec 136 through the specs-web-admin row (planted: that row on surface-136 only)'`
  - new: `'N2 (task-448, RR-0421 item 1 a reverses RR-0383): an edit to a surface spec gets Spec 136 and none of the four specs (planted: the four back on the specs-web-admin row)'`
- **:358:** `expect(lists(f), f).toEqual(expect.arrayContaining([...FOUR, 'surface-136']));` becomes `handbookOnly(lists(f), f);`
- **:359:** `.toEqual(expect.arrayContaining([...FOUR, 'surface-136']));` becomes `.toEqual(['surface-136']);`
- **:360:** `(r) => ({ ...r, lists: ['surface-136'] })` becomes `(r) => ({ ...r, lists: [...r.lists, ...FOUR] })`
- **:361**
  - old: `    expect(planted, 'planted: specs-web-admin on surface-136 only').not.toContain('surface-128');`
  - new: `    expect(planted, 'planted: the four back on specs-web-admin').toContain('surface-128');`

**src/tests/backlog/backlog-lane.logic.test.ts**
- **After :298, insert:** `      expect(e).toContain('under the SAME names'); // task-448 (RR-0422): a fix round re-makes the review files under the same names`
- **:400**
  - old: `    expect(inputs).toContain('draft, operator to confirm it binds');`
  - new: `    expect(inputs).not.toContain('storage-doc16'); // task-448 (RR-0421 item 3 a)`
- **:405**
  - old: `    for (const l of ['mobile-98', 'storage-doc16', 'inc-F']) {`
  - new: `    expect(extra).not.toContain('out-compliance-storage-doc16'); // task-448 (RR-0421 item 3 a)` followed by `    for (const l of ['mobile-98', 'inc-F']) {`
- **:548, title:** `but a record-only task gets the queue lists'` becomes `but a record-only task gets the every-task lists (the queue lists are off since task-448, RR-0418)'`
- **:552** (part-1 grounder correction 1)
  - old: `    expect(inputs).toContain('137_mcqueue.md');`
  - new: `    expect(inputs).not.toContain('137_mcqueue.md');` and `    expect(inputs).toContain('plan-protocol.md');`
- **:575:** `    expect(brief).toContain('storage-doc16');` becomes `    expect(brief).not.toContain('storage-doc16');`
- **Unchanged:** :574 and :576 (mobile-98 stays, 2a) and :681-683 (the prep fixture's lane-tools file still gets queue-137, 4a).

**Not pinned:** check-lane-close.logic.test.ts uses its own table (:94). hooks-composition only runs `page --check`.

**Designed red:** every edited `not.toContain` and `toEqual` line, the inserted mobile-100/96 line and the new `under the SAME names` line fail on the unchanged table and brief. The lane records which ones failed.

#### 5. Ids

None. No FE row, no MF queue row, no prereg and no panel record: no Files path is a frontend, layer23 or protected path of mcbylaws/protected-paths.json. Decisions 203 to 208 already exist.

#### 6. Files

**The Files line to add to the task description before plan-prep:**

Files: scripts/analysis/rule-lists.json, scripts/analysis/backlog-lane.mjs, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/rule-lists-table.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts, docs/reports/generated/rule-lists-by-kind.md, docs/specs/00-architecture/08_agents.md, docs/specs/00-architecture/137_mcqueue.md

Always allowed: the task file, docs/reports/reviews/task-448/, docs/reports/lanes/.

**Lists this task resolves:**
- Plan stage (board table): 10 lists — agents-s5-1to3, agents-s7-s11, queue-137, eng-all, orchestrator-doc17, policy-124-s2-s5, five-words, plan-protocol, inc, ms.
- Output stage (its own branch table, :840-842): 9 lists, the same without policy-124-s2-s5.

#### 7. LANDING

**Commit 1 (work), after the red attempt of section 4.** In order:
1. The test edits (already written).
2. The table edits (3.1, 3.2).
3. The brief sentence (3.3).
4. `node scripts/analysis/rule-lists.mjs page --write`, then `--check`.
5. The three dated notes (3.4-3.6).
6. The task file with status RUNNING.

- **Subject:** `feat(08_agents): task-448 FINAL.11 each review gets the right rule lists only; the brief states the round-2 record form`
- **Trailers:** `Task: task-448`; `Spec-diff: Spec 08 section 7 rule 4 and section 11.2 and Spec 137 gain one dated note each (M-246, prior text kept); no rule text moves`. This is the task-439 form (48f251d38, b32ea9b4c).
- No hook is bypassed. check-spec-diff is not triggered: no scripts/steps, scripts/lib/compute or descriptor path is staged.

**Output review (lane).**
- DeepSeek, one compliance or engineering output per list, plus code-review and error-paths: about 11-12 calls, about 20 if the diff chunks.
- Then a separate grounder before any fold (RR-0359, MD:1687).
- Two rounds at most (RR-0385 item 3, MD:1919).
- Round 2, if any, uses the form of 3.3.

**Close.** A separate records-only commit: lane report, review context, task file BUILT, grounder files. It must be separate because the work commit touches protected rule-lists.json (check-lane-close.mjs:753). check-lane-close runs at BUILT. The lane never pushes.

**Other open tasks:**
- No branch holds unlanded edits to rule-lists.json (PLAN-418 F).
- Any task that regenerates the page re-runs `page --write` if it lands second.

#### 8. Acceptance

| # | Who | Command | Expected |
|---|---|---|---|
| A1 | lane | read docs/reports/lanes/<date>/<lane>/red.out | the pre-commit related run fails at the edited assertions of the three files, including `under the SAME names` and the mobile-100/96 line |
| A2 | lane | `node scripts/analysis/rule-lists.mjs validate` | exit 0, no problem line |
| A3 | lane | `node scripts/analysis/rule-lists.mjs resolve --files "mobile/src/app/" --type build --letter S` | ids mobile-90, mobile-98, mobile-99, surface-136, eng-front, eng-shared, five-words, plan-protocol, inc-S, ms-S |
| A4 | lane | the same with `--files "docs/specs/02-web-admin/128_surface_standard_policy.md"` | eng-all, surface-136, five-words, plan-protocol, inc-S, ms-S |
| A5 | lane | the same with `--files "scripts/analysis/bylaw-validation/coa-expected/prereg-MF-96-1.json"`, then with `prereg-MB-18-1.json` | the four every-task ids only; then a list holding bylaw-133 |
| A6 | lane | `node scripts/analysis/rule-lists.mjs check-tasks` | 102 resolve, 0 bad (re-measure at the work head) |
| A7 | lane | `node scripts/analysis/rule-lists.mjs page --check` | exit 0 |
| A8 | orchestrator | `npx vitest run src/tests/backlog/rule-lists.logic.test.ts src/tests/backlog/rule-lists-table.logic.test.ts src/tests/backlog/backlog-lane.logic.test.ts` | all pass |
| A9 | orchestrator | `git diff --stat <launch>..HEAD -- scripts/hooks scripts/analysis/rule-lists.mjs .claude` | empty |
| A10 | orchestrator | `grep -c 'under the SAME names' scripts/analysis/backlog-lane.mjs` | 1 |
| A11 | orchestrator | the pre-push check list at push (.husky/pre-push-checks.sh) | PASS |

**Known limits, stated, not fixed:**
- Tasks already launched are judged at close by the table at their own range base (check-lane-close.mjs:766-767, :842). This helps every task launched after the landing. Tasks 367 and 442 gain nothing unless they merge the board, and a fold is a merge that the check skips (:720-721).
- **The brief and the refusal disagree until a later task:** the brief (3.3) says round 2 overwrites the base names, while the refusal at check-lane-close.mjs:502 still says "a later round (r2, r3, ...) is out-<lens>[-<list id>]-rN.txt" (RR-0422: not edited).
- The record-only message at rule-lists.mjs:257 and the comment at backlog-lane.mjs:12 still say "queue lists".
- The known loss of section 0.

#### 9. Questions for the plan grounder

- **Q1.** Is the scope sentence of 3.5 ("the claims the fold added or changed ... are not run again") an acceptable narrowing of "re-executes every claim in the fold" (:486) under RR-0423? Or must it stay "every claim in the fold"? The part-2 grounder found the condition met (08_agents.md:486 and :489; gate :692-712).
- **Q2.** Are the appended `why` suffixes (prior text kept, current state appended) "made true again" in the sense of RR-0423 item 1? Or must the false clauses be rewritten? Rewriting would risk the pinned phrases.
- **Q3.** Should the comment at backlog-lane.mjs:12 ("a record-only task gets the queue lists") be corrected here, since the file is already edited? The card names one sentence, so I left it.

#### 10. UNVERIFIED

- Every red and green above is predicted from in-memory resolves. No test was run.
- The exact set of assertions that go red, and that the fixture boards of backlog-lane.logic.test.ts read the repo table for :400, :405, :552 and :575 (the part-1 grounder read them so).
- The page diff size.
- The call counts of this task's own reviews.
- That `check-tasks` stays at 102 and 0 if the board moves before the work commit.

#### 11. GUESS estimate

About 2 agent-hours of lane time: about 45 test-line edits, 18 table lines, about 20 `why` insertions, one brief sentence, three notes, one regeneration, the red attempt and the work commit. Plus the plan review and the close.

## Implementation Notes
(none)

## References
- (none)

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
- RR-0383 Plan 431 question 3: tasks that edit the surface specs keep those specs attached — "1. what is your recommendation. I approve it" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1895)
- RR-0384 Task-430 scope approved: stop the handbook clipping, lines reflect their dated notes, add the 13 lines (item 9 a pointer)
- RR-0140 Operator: faster pushes and GOs asked
- RR-0385 McFix Final plan: Opus plans and builds, engineering seat, two rounds, validation without the operator, unbuilt gates withdrawn, tests are the focus — "proceed. Are there any more questions - Label all realted tasks McFix Final. Ensure the previously mentioned tasks outside this plan are either updated or deleted or kept" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1915)
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
- RR-0418 Rule lists per task are cut down by turning lists off in the table — "IT was these" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2144)
- RR-0419 The rule-list table edit is approved as one task — "Approved. Are there any other surprises in teh reviews that sonnet or anybody else does?" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2149)
- RR-0421 Rule-list decisions 1 to 4: all four recommendations approved — "1-4 recommendations approved" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2161)
- RR-0420 Review-cost problems join the rule-list plan: plan, ground, then recommend — "What a mess? This is why we are burnng through tokens." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2155)
- RR-0422 Review-cost task: Minimum package, decision 1 stays at a — "Minimum and 1a. Let's add these small fixes to the cost review task." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2166)
- RR-0423 Review-cost task: two small fixes added, plan approved, move forward — "add teh first two.  Plan approved.  Move forward with the task" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2171)
- RR-0145 Operator answer TRK-1: tracked lots refresh
- RR-0146 Operator answer PG-1: pushes and GOs
- RR-0147 Operator answer NAME-1
- RR-0149 Increment 1·A tooling location
- RR-0150 Infra freeze named list
- RR-0152 Increment 1·A re-use and drops
- RR-0154 Work pulling
- RR-0156 Push 6 literal test
- RR-0157 Push 6 R-MD
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
- RR-0383 Plan 431 question 3: tasks that edit the surface specs keep those specs attached (names RR-0383) — "1. what is your recommendation. I approve it" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1895)
- RR-0385 McFix Final plan: Opus plans and builds, engineering seat, two rounds, validation without the operator, unbuilt gates withdrawn, tests are the focus (names RR-0385) — "proceed. Are there any more questions - Label all realted tasks McFix Final. Ensure the previously mentioned tasks outside this plan are either updated or deleted or kept" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1915)
- RR-0392 one push for all four; no other infrastructure beyond this (names RR-0392) — "Push for all 4. I  don't think we need any other infastrcuture beyond this.. we are good to go!" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975)
- RR-0418 Rule lists per task are cut down by turning lists off in the table (names RR-0418) — "IT was these" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2144)
- RR-0419 The rule-list table edit is approved as one task (names RR-0419) — "Approved. Are there any other surprises in teh reviews that sonnet or anybody else does?" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2149)
- RR-0421 Rule-list decisions 1 to 4: all four recommendations approved (names RR-0421) — "1-4 recommendations approved" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2161)
- RR-0420 Review-cost problems join the rule-list plan: plan, ground, then recommend (names RR-0420) — "What a mess? This is why we are burnng through tokens." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2155)
- RR-0422 Review-cost task: Minimum package, decision 1 stays at a (names RR-0422) — "Minimum and 1a. Let's add these small fixes to the cost review task." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2166)
- RR-0423 Review-cost task: two small fixes added, plan approved, move forward (names RR-0423) — "add teh first two.  Plan approved.  Move forward with the task" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2171)

## Prior reviews and lane reports
### task-448 (this task)
- (none)

## Dependencies
- (none)
