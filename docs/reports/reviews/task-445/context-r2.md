# Review context for task-445 (no plan id) written 2026-11-23 by backlog-brief.mjs (round 2)

## Task
task-445 FINAL.8 Security lens: the security review runs on every back-end and API task, not only on paths that hold one of six words
status: RUNNING · milestone: m-1 · assignee: @lane-BL-SEC445 · labels: McFix, McFix Final

## Description
Card opened 2026-11-22 by the orchestrator, Spec 137 rule 2, on the operator's ruling RR-0391 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1969). Operator, verbatim: "add it." and, on what he saw of today's reviews, "Teh missing one is security" (same entry, :1968). THE GAP, read at the board head bb3a94efa: a security lens exists (.claude/review-templates/lens-security.md) but lensSet attaches it only when the task's Files text matches /entitlement|auth|stripe|metered|admin|pii/i (scripts/analysis/rule-lists.mjs:186), so an API route whose path holds none of those words (example src/app/api/parcels/search/route.ts) gets no security review at the plan or at the output; it gets only section 4 of the engineering standards through the engineering seat. THIS TASK: the smallest change so the security lens runs on every back-end and API task (the paths the rule table's api-lib and step-pipeline rows govern), keeping the six words as they are; tests first, both directions. NOT in this task: a new lens, a new gate, a change to the lens template, front-end rows (unless the plan review rules them in with a named reason). McFix Final process (RR-0385): Opus plan, three Sonnet seats, compliance and engineering lenses, separate grounder, Opus build, output review, two rounds at most.

Files: scripts/analysis/rule-lists.mjs, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts, src/tests/backlog/check-lane-close.logic.test.ts, docs/specs/00-architecture/08_agents.md, .claude/review-templates/README.md

## Acceptance criteria

## Implementation Plan
#### PLAN-445-v1: the security lens runs on every API route and library task (one term in lensSet)

Planner: Opus, read-only. Read at board head e6093cff8; the head moved from fc299a829 during the read, and that commit only adds a card. Counts were made in memory with the table's own functions (checkTasks, resolveTask, lensSet, filesText). No file was written and no test was run.

#### BASIS
- RR-0391 (MORNING-DECISIONS.md:1966-1970, decision-176). The operator's words: "Teh missing one is security" (:1968) and "add it." (:1969). What he was shown: "the smallest change is one line so the lens runs on every back-end and API task".
- SCOPE, a recorded deviation from the card's wording (plan review round 1). The card says "the paths the rule table's api-lib and step-pipeline rows govern"; that parenthesis is the card author's reading (Spec 137 rule 2), not words he was shown or said (:1967-1970). This plan builds the api-lib row, src/app/api/ and src/lib/, and not the step-pipeline row, because every reading of "back-end and API" contains the api-lib row and the card's example is a route, while the step-pipeline row adds migrations/ and 1,891 seed files and cannot be copied into one regex without drifting from the table; widening later is additive, so A cannot be wrong, only incomplete. No ruling names the path set (record search under OPERATOR), so the rest is his to order.
- RR-0385 item 5 (:1921): gates already built are kept, and no gate is added. Item 6 (:1922): tests are the focus.
- Both directions: "Every lock is proven in BOTH directions (fails on the old shape, passes on the new) before red is claimed" (08_agents.md:489 at this head; the card's :462 is stale).
- Principles served: test first; reuse what exists (no new lens, gate or tool).

#### FACTS
1. rule-lists.mjs:183-192 is `lensSet`. Line :185 is `surface` (a path regex). Line :186 is `const sec = /entitlement|auth|stripe|metered|admin|pii/i.test(files);`, kept as it is. `surface` (:185) matches src/app/, so a route path already gets the ux lens today; that is existing behaviour and is not changed here. Lines :189-190 add `security` to plan and out only when `code && sec`.
2. lensSet is used in exactly three places (git grep): the launch brief (backlog-lane.mjs:179), plan-prep for the plan lenses (rule-lists.mjs:653) and the close (check-lane-close.mjs:526). The launch gate (planGateInner, check-lane-close.mjs:613-660) does not read it.
3. lens-security.md is fit for an API route as written. Walk item 2 (:49) asks whether the caller's identity comes from the session or from the request, and every route has a caller. Two sentences make it answer NOT APPLICABLE on code with no caller and no money, auth, PII or admin:
   - :12 "If the change touches none of these, you say so and stop."
   - :48 "Fires only when the change touches money, auth, entitlements, PII or admin."
   On pure library compute that costs one cheap N/A line. It does not make the lens useless, so the template is not changed (as the card says).
4. Effect, measured. check-tasks finds 309 open tasks, of which 106 resolve and 43 of those are build or fix (task-445 itself is the extra one and gets no security; re-measured by the grounder at 6b3fc4ddf). Today 9 of those 43 get security at plan and at output. After the change 14 do, the same 14 at both stages because one term feeds both. The 5 newly covered:
   - task-372 (RUNNING, BL-FIXPROJ)
   - task-383 (RUNNING, BL-THINROUTE)
   - task-396 (RUNNING fix, BL-MASSING)
   - task-379 (LATER)
   - task-380 (LATER fix)
   None of them has plan evidence (0 plan files in docs/reports/reviews/<id>/), so no prepped-but-unlaunched task changes. Cost: one more DeepSeek call at plan-prep and one per diff chunk at output, plus the grounder's ruling on its findings.

#### CODE (rule-lists.mjs:186, one line; the definition is the api-lib row's globs, src/app/api/** and src/lib/**, a row with no `not` list, rule-lists.json:98-102)
```js
const sec = /entitlement|auth|stripe|metered|admin|pii/i.test(files) || (filesEntries(`Files: ${files}`) ?? []).some((e) => /^src\/(?:app\/api|lib)(?:\/|$)/.test(e)); // task-445 (RR-0391, 08_agents.md section 5.7): an API route or library path (the api-lib row)
```
filesEntries (:172) is reused, so each entry is anchored and a leading `./` is stripped. mobile/src/lib does not fire, and the mobile front end stays out.

Alternatives rejected, one line each:
- (a) Pass the resolved lists and test for eng-back. The de-dup drops eng-back whenever the tests row brings in eng-all (measured: tasks 379 and 396 touch src/lib and carry no eng-back), and it changes 3 call sites.
- (b) Read the api-lib globs from the table inside lensSet. lensSet has no table or root, and the close reads a different table copy from the launch.
- (c) The CLAUDE.md:165 Backend/Pipeline list (`scripts/`, `migrations/`, `src/app/api/`, `src/lib/db/`), a third reading of "back-end": narrower than A on src/lib, wider on scripts/ (lane tools, which the record calls "Infrastructure tasks", :1851). It stays out because "smallest" is his word (:1967) and the api-lib row is the one place the table names API and library paths.
- (d) Copy the step-pipeline row's globs into a regex. It cannot carry the row's `not` list or the directory entries the resolver expands (scripts/surfaces/ reaches the row through its descriptors), so it would drift from the table. See SCOPE and OPERATOR.
- (e) A bare regex in the same form as `surface`. It also fires on mobile/src/lib (34 files).

#### TESTS (red first, each red at its designed assertion; the observed red of each goes in red.out before its green)
New tests. The reds are predictions: nothing was run; the grounder evaluated lensSet in memory at 6b3fc4ddf (a route path gets ux and no security; a src/lib path gets neither). Per 08_agents.md:489 each lock is proven in both directions (a planted defect for each control) and a survive-the-fix lock (green both ways) is labelled.
- **S1** (rule-lists.logic.test.ts, new describe after :718). For types build and fix.
  - (a) src/lib/massing/geometry.ts, ./src/lib/x.ts, src/lib/** and 'src/a.ts, src/lib/b.ts': plan toEqual ['plan-review-deepseek','error-paths','security'] and out toEqual ['code-review','error-paths','security']; red today at toEqual (no security).
  - (b) the card's example src/app/api/parcels/search/route.ts and src/app/api/: plan and out toContain 'security'; red today at toContain. It is toContain, not toEqual, because those paths also get ux today and the test does not pin that.
- **S2** is not written. D11b (rule-lists.logic.test.ts:704-710: scripts/pii-scrub.mjs and src/app/admin/page.tsx, plan and out) already is the survive-the-fix lock for the six words, green both ways; with `sec` = the new term only it goes red (measured in memory).
- **S3** (controls, green before and after the change, each proven by a planted defect). No security for src/components/report/ReportView.tsx, mobile/src/lib/analytics.ts, mobile/app/(app)/x.tsx, src/library.ts, src/app/apiary/x.ts, scripts/analysis/x.mjs, docs/specs/03-mobile/x.md, src/tests/x.test.ts.
  - Planted defects, each red: no anchor (mobile/src/lib fires); no boundary `src\/lib` (src/library.ts and src/app/apiary/x.ts fire); `/scripts\//` (scripts/analysis fires).
- **S4** (type gate unchanged; survive-the-fix lock, green both ways: it locks `code &&` at :189-190, which the new line does not touch). On the API route, types record and '' give plan ['plan-review-deepseek'] and out [].
  - Planted defect: drop `code &&`. Red.
- **B1** (backlog-lane.logic.test.ts, the real script with --dry-run). for each of src/app/api/parcels/search/route.ts and src/lib/massing/geometry.ts, `lensBrief('build', path)` contains lens-security.md (the route's brief names lens-ux.md today as well, untouched); the control `lensBrief('build','src/components/x.tsx')` does not (green both ways, survive-the-fix). Red today at toContain.
- **B2** (plan-prep, real script, existing stub). `prepFixture({type:'fix', files:'src/lib/massing/geometry.ts'})`, then review. The plan file names equal ['plan-error-paths.txt','plan-plan-review-deepseek.txt','plan-security.txt']. Red today at toEqual (2 names). A route path would also write plan-ux.txt (four names), so the route is covered at plan by S1(b), not here.
- **C1** (check-lane-close.logic.test.ts, next to :213-216).
  - (a) `refused(scenario({ files: 'src/a.ts, src/lib/x.ts' }), /out-security\.txt/)`; red today at status toBe(1) (exit 0: no ux, no security).
  - (b) the card's route at the output: `refused(scenario({ files: 'src/a.ts, src/app/api/x/route.ts' }), /out-security\.txt/)`; today the close is refused for out-ux.txt only, so red at toMatch; the route needs out-ux.txt as well, which is why (c) uses the src/lib path.
  - (c) Control (green both ways, survive-the-fix): the (a) scenario with `mutate: (l, d) => ({ ...l, 'out-security.txt': hdr('lens-security.md', fs.readFileSync(path.join(d, '.git/material.txt'), 'utf8')) + body(false) })` gives exit 0. hdr takes the material text, not a path (check-lane-close.logic.test.ts:49).

Changed (existing tests): none. Simulated in memory against the new line.

Unchanged, and must stay green:
- rule-lists.logic.test.ts:699-718 (D11b: admin and PII paths, the proof-slice control, stripe)
- backlog-lane.logic.test.ts:
  - :268-283 (mobile plus src/tests: no security)
  - :360-364 (six-word paths)
  - :365-369
  - :370-374 (record: no security)
  - :386-424 and :561-575 (these use the API route and now also get lens-security.md; none of them asserts it is absent)
  - :673-688 and :731-736 (default scripts/analysis/thing.mjs: two plan files)
- check-lane-close.logic.test.ts:208-216, plus every scenario with files 'src/', 'src/a.ts' or the default; :215 is the only src/lib path in that file.
- review-templates.logic.test.ts and review-lens-template.infra.test.ts (the template is unchanged).

How the search was done (git grep over src/tests, scripts/tests and tests):
- `lensSet`: 3 consumers and 1 test.
- `-i security`: the backlog hits listed above.
- `src/lib/|src/app/api|migrations/` in src/tests/backlog/*.ts: fixtures that would newly fire.
- `plan-error-paths|plan-security|lens-error-paths`: tests that pin plan names exactly.
- `review-templates/README|metered route`: README text pins (none).

#### SPEC 08 NOTE (owed by the same-commit rule, 00_engineering_standards.md:465, and Spec 137 rule 10, 137_mcqueue.md:125; that standards file states no limit on the security lens, so it is not edited)
Inserted after 08_agents.md:261, the end of §5.7, as its own paragraph: a blank line, the note, then the blank line already at :262. §5.7 is in no rule-list section: sectionText of the five selectors of agents-s5-1to3 and agents-s7-s11 is identical with the note inserted (grounder, in memory). Exact text, final (a dated note is not edited later):

Dated note 2026-11-22 (M-246, prior text kept; task-445 FINAL.8, McFix Final; RR-0391, decision-176; operator, verbatim, 2026-11-22, `~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md`, :1968 "Teh missing one is security" and :1969 "add it. Then once these close move on to the Mcfix plan for the closed and built tasks with the new approach."): the DeepSeek security lens (`.claude/review-templates/lens-security.md`) of a build or fix task also runs, at plan and at output, when an entry of the task's `Files:` line is under `src/app/api/` or `src/lib/` (the api-lib row of `scripts/analysis/rule-lists.json`), as well as on the six words it ran on before (entitlement, auth, stripe, metered, admin, pii). `lensSet` in `scripts/analysis/rule-lists.mjs` decides it; the launch brief, plan-prep and the close read that one function. Every statement in this document that limits Security to money, auth, PII and admin (section 3: the A12 row and the "Not every agent runs" line; section 5.7: "Fires ONLY on" above; section 6: the Security line, and the footnote of 6.4; section 7: the note of 2026-11-19 under rule 4, and rule 7; section 10: the Security lens of 10.2 and the sentence of 10.3) is unchanged for the Claude A12 panel seat and reads with this addition for the DeepSeek lens. Other task types are unchanged.

README edits (.claude/review-templates/README.md):
- :105, the "when" cell gains an ending after its closing parenthesis, so it reads: "only when the change touches money, auth, entitlements, PII or admin (Files line: entitlements, auth, stripe, a metered route), or a Files entry is under src/app/api/ or src/lib/ (task-445)".
- :161: "`out-security.txt` on money/auth" becomes "`out-security.txt` on money/auth or an API or library path".

#### GENERATED FILES
None expected. `page` prints lists, sizes and parts per kind (rule-lists.mjs:541), not lens sets. The note sits outside agents-s5-1to3 (5.1-5.3) and agents-s7-s11 (7 and 11). The README is in no list. The system map is built from titles, status and Target Files, none of which change. `page --check` is current today and stays so (measured: sectionText of the five selectors is identical with the note inserted); no Files line is edited and no generated file is written by this card.

#### CUT-OVER
- Running lanes: tasks 372, 383 and 396.
  - .husky/commit-msg:7 runs the lane's own check-lane-close.mjs, which imports ../analysis/rule-lists.mjs from the lane's own tree.
  - A merge commit returns 0 (:720-721), and only a commit that moves a task to a finished status is checked (:748). This is the same base-copy rule as task-438 Q4 and task-431 Q-F.
  - So these lanes owe nothing new unless they merge the board before closing; then they owe out-security.txt. The orchestrator tells them not to merge, or to run the lens if they do.
- Not launched: tasks 379, 380 and 409 (409 once it has a milestone) get plan-security at plan-prep and out-security in the brief. Nothing to re-prep.
- task-445 itself: its Files line matches neither the six words nor the new term, so its lens set is plan-review-deepseek and error-paths at plan, code-review and error-paths at output.

#### LANDING
rule-lists.mjs is a protected path (rule-lists.json:22). The close refuses a commit that changes a protected path and also finishes a task. So two commits:
1. **Work commit:** the code line, the tests, the Spec 08 note (check-spec-diff is not triggered by this change; the note is owed by 00_engineering_standards.md:465), the README lines and the task notes; `Task: task-445`.
2. **Close commit:** the lane records and the status change only.
Order against other cards: none is required. Task-430 shares no file; the LATER cards 403, 404, 414, 415, 417 and 428 each name a file this card edits and merge after it lands; 439 to 442 have no Files line yet.
Estimate (GUESS, labelled, not measured): one lane session for the line, the tests and the two document edits.

#### ACCEPTANCE (real inputs)
- `rule-lists.mjs validate` reports ok, and `page --check` is current.
- In memory at the build head: check-tasks resolving build or fix tasks with security move from 9 to 14, plan equal to out, excluding task-445 itself (not security); the 5 newly covered are 372, 379, 380, 383, 396. The grounder measured exactly this at 6b3fc4ddf.
- `backlog-lane.mjs --dry-run` for a build task with `Files: src/app/api/parcels/search/route.ts` names lens-security.md.
- S1, B1, B2 and C1 (a) and (b) were red first and are green; S3, S4 and the controls are green both ways, each proven by its planted defect; every unchanged test listed above, and the whole src/tests/backlog folder, is green.

#### NOT IN SCOPE
- Template wording (FACTS 3).
- Front-end rows, including mobile/src/lib.
- The ux lens on API routes: `surface` (:185) already matches src/app/, so a route gets ux today; unchanged.
- Task types other than build and fix (lensSet's `code` gate).
- The looseness of the six words ("auth" also matches "author").
- A Files entry of a bare `src/` or `src/**` does not fire, the same limit `surface` has; no open build or fix task has such an entry.
- Migrations and the card's step-pipeline half (see SCOPE in BASIS and OPERATOR).

#### OPERATOR
One question, because "back-end" reads two ways (RR-0385 item 4(ii)). Search of the record (grep -i "back-end|backend|back end" of MORNING-DECISIONS.md): :1851 and :1864 (put to him: "Pipeline and by-law tasks get their handbook plus the back-end and shared sections"), :1913 and :1923 (his "front-end vs backend", built by task-431 as eng-back on the api-lib and step-pipeline rows), :1967 and :1970 (this card). No ruling names the path set and the record's "back-end" includes pipeline steps, so A is not settled and C is the card's wording. The build is A until he answers:
- **A (built by this plan):** API routes and library code, src/app/api/ and src/lib/. +5 open tasks now. Closes the gap he was shown.
- **B:** A plus `migrations/`, where row-level security, grants and SECURITY DEFINER live. +1 open task now (task-406, RUNNING: migration 334, a budget re-pin). One more word in the line and one test path.
- **C (the card's wording):** A plus the whole step-pipeline row (migrations/ and 1,891 seed files included). By the table's own resolution it adds 5 open tasks (354, 366, 375, 384, 406, all RUNNING). A copied regex gives a different set, so C means passing the resolver's row ids into lensSet (my estimate, not measured: about six lines in four places) and a plan v2. Each by-law or seed diff adds one call per chunk, mostly NOT APPLICABLE.

Recommendation: A now, because it is what he was shown (one line) and it is inside B and C; B or C only on his word, as a follow-up card he orders (RR-0392 reading: no new infrastructure card without it).

#### UNVERIFIED
- Nothing was run: none of the reds or greens has been seen (the grounder evaluated lensSet in memory only).
- B2 and C1 fixtures: the grounder read them: B2 resolves a src/lib path at letter F (the fixture titles its milestone [F]) and C1's scenario accepts a Files entry the lane did not change (check-lane-close.logic.test.ts:615-616). Neither was run.
- The pass of the C1 control is read, not run.
- How often the lens answers NOT APPLICABLE on library code.

Files: scripts/analysis/rule-lists.mjs, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts, src/tests/backlog/check-lane-close.logic.test.ts, docs/specs/00-architecture/08_agents.md, .claude/review-templates/README.md

Plan review round 1: 46 folded, 0 task, 0 ruling, 0 wontfix, 6 pile; grounder docs/reports/reviews/task-445/GROUNDER-PLAN.md; triage docs/reports/reviews/task-445/TRIAGE-PLAN.md
plan-compliance-agents-s5-1to3#1 HIGH folded This plan builds the
plan-compliance-agents-s7-s11#1 MED folded The reds are predict
plan-compliance-agents-s7-s11#2 MED folded Every statement in t
plan-compliance-agents-s7-s11#3 MED folded A plus the whole ste
plan-compliance-five-words#1 HIGH folded This plan builds the
plan-compliance-five-words#2 MED folded reads two ways (RR-0
plan-compliance-five-words#3 MED folded goes in red.out befo
plan-compliance-inc-S#1 HIGH folded recorded deviation f
plan-compliance-inc-S#3 MED folded goes in red.out befo
plan-compliance-ms-S#1 HIGH folded the card author's re
plan-compliance-ms-S#2 MED folded because it is what h
plan-compliance-orchestrator-doc17#1 HIGH folded the card author's re
plan-compliance-orchestrator-doc17#2 MED folded is current today and
plan-compliance-plan-protocol#1 HIGH folded This plan builds the
plan-compliance-plan-protocol#2 MED folded reads two ways (RR-0
plan-compliance-queue-137#1 HIGH folded recorded deviation f
plan-compliance-queue-137#5 MED folded is current today and
rc#1 HIGH folded It is toContain, not
rc#4 MED folded Every statement in t
rg#1 HIGH folded It is toContain, not
rg#2 HIGH folded Red today at toEqual
rg#3 HIGH folded so red at toMatch; t
rg#4 MED folded hdr takes the materi

## Implementation Notes
Dated note 2026-11-22 (M-246, prior text kept; RR-0391 · task-445 · Backlog; operator, verbatim: "add it. Then once these close move on to the Mcfix plan for the closed and built tasks with the new approach.")

2026-11-23 taken on the board at lane launch (lane BL-SEC445, worktree /Users/brettpreston_macmini/Buildo-wt-sec445, branch wf1/inc1b-sec445), RR-0240

## References
- docs/reports/reviews/task-445/GROUNDER-PLAN.md
- docs/reports/reviews/task-445/TRIAGE-PLAN.md
- docs/reports/reviews/task-445/seat-integration-1.md
- docs/reports/reviews/task-445/seat-reality-check-1.md
- docs/reports/reviews/task-445/seat-regression-1.md
- compliance:agents-s5-1to3 docs/specs/00-architecture/08_agents.md
- compliance:agents-s7-s11 docs/specs/00-architecture/08_agents.md
- compliance:queue-137 docs/specs/00-architecture/137_mcqueue.md
- compliance:eng-all docs/specs/00_engineering_standards.md
- compliance:orchestrator-doc17 backlog/docs/doc-17 - Orchestrator-readings-not-rulings.md
- compliance:five-words docs/specs/01-pipeline/132_step_standard_handbook.md
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
- RR-0359 Nothing is folded before the grounder has ruled
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
- RR-0385 McFix Final plan: Opus plans and builds, engineering seat, two rounds, validation without the operator, unbuilt gates withdrawn, tests are the focus — "proceed. Are there any more questions - Label all realted tasks McFix Final. Ensure the previously mentioned tasks outside this plan are either updated or deleted or kept" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1915)
- RR-0386 Task-367: gates parked, handbook tests start fresh; landing gates A and B is a later decision with its own card
- RR-0387 McFixReborn: each built task gets its own output review and confirmed findings are fixed by ordinary fix tasks; no new infrastructure; old findings dropped
- RR-0388 McFixReborn waits until the new tests are in place
- RR-0389 The model conflict is resolved by updating the key specs and docs themselves
- RR-0390 task-430 output review size: option A, one larger review message, tried once
- RR-0391 a card to widen the security lens; McFixReborn next once these close — "add it. Then once these close move on to the Mcfix plan for the closed and built tasks with the new approach." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1969)
- RR-0392 one push for all four; no other infrastructure beyond this — "Push for all 4. I  don't think we need any other infastrcuture beyond this.. we are good to go!" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975)
- RR-0393 McFixReborn next, continued after tasks 424 and 386
- RR-0394 security lens option A: API routes and library code
- RR-0141 Operator: Q-LT-1
- RR-0143 Operator answer IMG-1: six lot-size bands
- RR-0012 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0144 Operator answer PRG-1: purge rule
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
- RR-0385 McFix Final plan: Opus plans and builds, engineering seat, two rounds, validation without the operator, unbuilt gates withdrawn, tests are the focus (names RR-0385) — "proceed. Are there any more questions - Label all realted tasks McFix Final. Ensure the previously mentioned tasks outside this plan are either updated or deleted or kept" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1915)
- RR-0391 a card to widen the security lens; McFixReborn next once these close (names task-445, RR-0391) — "add it. Then once these close move on to the Mcfix plan for the closed and built tasks with the new approach." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1969)
- RR-0392 one push for all four; no other infrastructure beyond this (names RR-0392) — "Push for all 4. I  don't think we need any other infastrcuture beyond this.. we are good to go!" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975)
- RR-0394 security lens option A: API routes and library code (names task-445) — "Security a" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1987)

## Prior reviews and lane reports
### task-445 (this task)
- docs/reports/reviews/task-445/FINDINGS-PLAN.md
- docs/reports/reviews/task-445/FOLD-CHECK.md
- docs/reports/reviews/task-445/GROUNDER-PLAN.md
- docs/reports/reviews/task-445/QUESTIONS-RULED.md
- docs/reports/reviews/task-445/TRIAGE-PLAN.md
- docs/reports/reviews/task-445/seat-integration-1.md
- docs/reports/reviews/task-445/seat-reality-check-1.md
- docs/reports/reviews/task-445/seat-regression-1.md

## Dependencies
- (none)
