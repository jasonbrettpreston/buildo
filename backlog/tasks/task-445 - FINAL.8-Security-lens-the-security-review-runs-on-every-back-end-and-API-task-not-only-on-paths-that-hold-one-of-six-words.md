---
id: TASK-445
title: >-
  FINAL.8 Security lens: the security review runs on every back-end and API
  task, not only on paths that hold one of six words
status: LATER
assignee: []
created_date: '2026-11-23T01:50:00Z'
updated_date: '2026-11-23T01:58:00Z'
labels:
  - McFix
  - McFix Final
milestone: m-1
dependencies: []
type: build
ordinal: 145012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-22 by the orchestrator, Spec 137 rule 2, on the operator's ruling RR-0391 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1969). Operator, verbatim: "add it." and, on what he saw of today's reviews, "Teh missing one is security" (same entry, :1968). THE GAP, read at the board head bb3a94efa: a security lens exists (.claude/review-templates/lens-security.md) but lensSet attaches it only when the task's Files text matches /entitlement|auth|stripe|metered|admin|pii/i (scripts/analysis/rule-lists.mjs:186), so an API route whose path holds none of those words (example src/app/api/parcels/search/route.ts) gets no security review at the plan or at the output; it gets only section 4 of the engineering standards through the engineering seat. THIS TASK: the smallest change so the security lens runs on every back-end and API task (the paths the rule table's api-lib and step-pipeline rows govern), keeping the six words as they are; tests first, both directions. NOT in this task: a new lens, a new gate, a change to the lens template, front-end rows (unless the plan review rules them in with a named reason). McFix Final process (RR-0385): Opus plan, three Sonnet seats, compliance and engineering lenses, separate grounder, Opus build, output review, two rounds at most.

Files: scripts/analysis/rule-lists.mjs, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts, src/tests/backlog/check-lane-close.logic.test.ts, docs/specs/00-architecture/08_agents.md, .claude/review-templates/README.md
<!-- SECTION:DESCRIPTION:END -->

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
# PLAN-445-v1: the security lens runs on every API route and library task (one term in lensSet)

Planner: Opus, read-only. Read at board head e6093cff8; the head moved from fc299a829 during the read, and that commit only adds a card. Counts were made in memory with the table's own functions (checkTasks, resolveTask, lensSet, filesText). No file was written and no test was run.

## BASIS
- RR-0391 (MORNING-DECISIONS.md:1966-1970, decision-176). The operator's words: "Teh missing one is security" (:1968) and "add it." (:1969). What he was shown: "the smallest change is one line so the lens runs on every back-end and API task".
- RR-0385 item 5 (:1921): gates already built are kept, and no gate is added. Item 6 (:1922): tests are the focus.
- Both directions: "Every lock is proven in BOTH directions (fails on the old shape, passes on the new) before red is claimed" (08_agents.md:489 at this head; the card's :462 is stale).
- Principles served: test first; reuse what exists (no new lens, gate or tool).

## FACTS
1. rule-lists.mjs:183-192 is `lensSet`. Line :185 is `surface` (a path regex). Line :186 is `sec = /entitlement|auth|stripe|metered|admin|pii/i`. Lines :189-190 add `security` to plan and out only when `code && sec`.
2. lensSet is used in exactly three places (git grep): the launch brief (backlog-lane.mjs:179), plan-prep for the plan lenses (rule-lists.mjs:653) and the close (check-lane-close.mjs:526). The launch gate (planGateInner, check-lane-close.mjs:613-660) does not read it.
3. lens-security.md is fit for an API route as written. Walk item 2 (:49) asks whether the caller's identity comes from the session or from the request, and every route has a caller. Two sentences make it answer NOT APPLICABLE on code with no caller and no money, auth, PII or admin:
   - :12 "If the change touches none of these, you say so and stop."
   - :48 "Fires only when the change touches money, auth, entitlements, PII or admin."
   On pure library compute that costs one cheap N/A line. It does not make the lens useless, so the template is not changed (as the card says).
4. Effect, measured. check-tasks finds 309 open tasks, of which 105 resolve and 42 of those are build or fix. Today 9 of those 42 get security at plan and at output. After the change 14 do, the same 14 at both stages because one term feeds both. The 5 newly covered:
   - task-372 (RUNNING, BL-FIXPROJ)
   - task-383 (RUNNING, BL-THINROUTE)
   - task-396 (RUNNING fix, BL-MASSING)
   - task-379 (LATER)
   - task-380 (LATER fix)
   None of them has plan evidence (0 plan files in docs/reports/reviews/<id>/), so no prepped-but-unlaunched task changes. Cost: one more DeepSeek call at plan-prep and one per diff chunk at output, plus the grounder's ruling on its findings.

## CODE (rule-lists.mjs:186, one line; the definition is the api-lib row's globs, src/app/api/** and src/lib/**)
```js
const sec = /entitlement|auth|stripe|metered|admin|pii/i.test(files) || (filesEntries(`Files: ${files}`) ?? []).some((e) => /^src\/(?:app\/api|lib)(?:\/|$)/.test(e)); // task-445 (RR-0391): an API route or library path (the api-lib row)
```
filesEntries (:172) is reused, so each entry is anchored and a leading `./` is stripped. mobile/src/lib does not fire, and the mobile front end stays out.

Alternatives rejected, one line each:
- (a) Pass the resolved lists and test for eng-back. The de-dup drops eng-back whenever the tests row brings in eng-all (measured: tasks 379 and 396 touch src/lib and carry no eng-back), and it changes 3 call sites.
- (b) Read the api-lib globs from the table inside lensSet. lensSet has no table or root, and the close reads a different table copy from the launch.
- (c) The CLAUDE.md Backend/Pipeline domain (`scripts/`). It takes in the lane tools, which he called infrastructure (:1968).
- (d) Copy the step-pipeline globs into a regex. A regex cannot carry the row's `not` list. Measured, it would add tasks 366, 375 and 406 through scripts/deepseek-review.js and scripts/lib/review-template.js, and task 384 through a surface descriptor. No pipeline step task is gained. See OPERATOR.
- (e) A bare regex in the same form as `surface`. It also fires on mobile/src/lib (34 files).

## TESTS (red first, each red at its designed assertion; red.out holds each red)
New tests:
- **S1** (rule-lists.logic.test.ts, new describe after :718). For types build and fix, these paths: src/app/api/parcels/search/route.ts (the card's example), src/lib/massing/geometry.ts, ./src/lib/x.ts, src/app/api/, src/lib/**.
  - plan equals ['plan-review-deepseek','error-paths','security'] and out equals ['code-review','error-paths','security'].
  - Red today at toEqual (no security).
- **S2** (survive-the-fix lock, green both ways, stated as such). The six words still fire off the back end: scripts/pii-scrub.mjs, src/app/admin/page.tsx, src/components/auth/LoginForm.tsx.
  - Planted defect: `sec` = the new term only. Red.
- **S3** (controls). No security for src/components/report/ReportView.tsx, mobile/src/lib/analytics.ts, mobile/app/(app)/x.tsx, src/library.ts, scripts/analysis/x.mjs, docs/specs/03-mobile/x.md, src/tests/x.test.ts.
  - Planted defects, each red: no anchor (mobile/src/lib fires); no boundary `src\/lib` (src/library.ts fires); `/scripts\//` (scripts/analysis fires).
- **S4** (type gate unchanged). On the API route, types record and '' give plan ['plan-review-deepseek'] and out [].
  - Planted defect: drop `code &&`. Red.
- **B1** (backlog-lane.logic.test.ts, the real script with --dry-run). `lensBrief('build','src/app/api/parcels/search/route.ts')` contains lens-security.md; the control `lensBrief('build','src/components/x.tsx')` does not. Red today at toContain.
- **B2** (plan-prep, real script, existing stub). `prepFixture({type:'fix', files:'src/app/api/parcels/search/route.ts'})`, then review. The plan file names equal ['plan-error-paths.txt','plan-plan-review-deepseek.txt','plan-security.txt']. Red today (2 names).
- **C1** (check-lane-close.logic.test.ts, next to :213-216).
  - `refused(scenario({ files: 'src/a.ts, src/app/api/x/route.ts' }), /out-security\.txt/)`. Red today: exit 0.
  - Control: the same scenario, with a mutate that adds `out-security.txt` = hdr('lens-security.md', <d>/.git/material.txt) + body(false), gives exit 0.

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

## SPEC 08 NOTE (owed: 00_engineering_standards.md:465 same commit; Spec 137 rule 10, 137_mcqueue.md:125)
Inserted after 08_agents.md:261, the end of §5.7. §5.7 is in no rule-list section, so no list changes size. Exact text:

Dated note 2026-11-22 (M-246, prior text kept; task-445 FINAL.8, McFix Final; RR-0391, decision-176; operator, verbatim, 2026-11-22, `~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md`, :1968 "Teh missing one is security" and :1969 "add it."): the DeepSeek security lens (`.claude/review-templates/lens-security.md`) of a build or fix task also runs, at plan and at output, when an entry of the task's `Files:` line is under `src/app/api/` or `src/lib/` (the api-lib row of `scripts/analysis/rule-lists.json`), as well as on the six words it ran on before (entitlement, auth, stripe, metered, admin, pii). `lensSet` in `scripts/analysis/rule-lists.mjs` decides it; the launch brief, plan-prep and the close read that one function. "Fires ONLY on" above, and the same limit in the A12 row and the section 3 line, now read with this addition. Other task types are unchanged.

README edits (.claude/review-templates/README.md):
- :105, the "when" cell becomes: "when the change touches money, auth, entitlements, PII or admin (Files line: entitlement, auth, stripe, metered, admin, pii) or an API route or library path (a Files entry under src/app/api/ or src/lib/; task-445)".
- :161: "`out-security.txt` on money/auth" becomes "`out-security.txt` on money/auth or an API or library path".

## GENERATED FILES
None expected. `page` prints lists, sizes and parts per kind (rule-lists.mjs:541), not lens sets. The note sits outside agents-s5-1to3 (5.1-5.3) and agents-s7-s11 (7 and 11). The README is in no list. The system map is built from titles, status and Target Files, none of which change. If `page --check` fails at the work commit anyway, the lane runs `page --write` and adds docs/reports/generated/rule-lists-by-kind.md to the first Files line of its own task file in that same commit, then reports the extra lists that brings for a ruling.

## CUT-OVER
- Running lanes: tasks 372, 383 and 396.
  - .husky/commit-msg:7 runs the lane's own check-lane-close.mjs, which imports ../analysis/rule-lists.mjs from the lane's own tree.
  - A merge commit returns 0 (:720-721), and only a commit that moves a task to a finished status is checked (:748). This is the same base-copy rule as task-438 Q4 and task-431 Q-F.
  - So these lanes owe nothing new unless they merge the board before closing; then they owe out-security.txt. The orchestrator tells them not to merge, or to run the lens if they do.
- Not launched: tasks 379 and 380 get plan-security at plan-prep and out-security in the brief. Nothing to re-prep.
- task-445 itself: its Files line matches neither the six words nor the new term, so its lens set is plan-review-deepseek and error-paths at plan, code-review and error-paths at output.

## LANDING
rule-lists.mjs is a protected path (rule-lists.json:22). The close refuses a commit that changes a protected path and also finishes a task. So two commits:
1. **Work commit:** the code line, the tests, the Spec 08 note (the staged spec satisfies check-spec-diff), the README lines and the task notes; `Task: task-445`.
2. **Close commit:** the lane records and the status change only.

## ACCEPTANCE (real inputs)
- `rule-lists.mjs validate` reports ok, and `page --check` is current.
- In memory at the build head: check-tasks resolving build or fix tasks with security move from 9 to 14, plan equal to out; the 5 newly covered are 372, 379, 380, 383, 396.
- `backlog-lane.mjs --dry-run` for a build task with `Files: src/app/api/parcels/search/route.ts` names lens-security.md.
- S1-S4, B1, B2 and C1 are green, each was red first, and every unchanged test listed above is green.

## NOT IN SCOPE
- Template wording (FACTS 3).
- Front-end rows, including mobile/src/lib.
- The looseness of the six words ("auth" also matches "author").
- A Files entry of a bare `src/` or `src/**` does not fire, the same limit `surface` has.
- Migrations and pipeline steps (see OPERATOR).

## OPERATOR
One question, because "back-end" can be read two ways (RR-0385 item 4(ii)):
- **A (built by this plan):** API routes and library code, src/app/api/ and src/lib/. +5 open tasks now. Closes the gap he was shown.
- **B:** A plus `migrations/`, where row-level security, grants and SECURITY DEFINER live. +0 open tasks now. One more word in the line and one test path.
- **C:** A plus every step-pipeline path, by-law steps included. +1 real task now (384, through a descriptor) and 3 false hits on review tooling unless the row's `not` list is copied in. Each by-law diff (2,000+ files) adds one call per chunk, and the template would mostly answer NOT APPLICABLE.

Recommendation: A now; B only if he wants database policy reviewed by this lens.

## UNVERIFIED
- Nothing was run: none of the reds or greens has been seen.
- B2: whether the plan-prep fixture resolves the API route at letter F.
- C1: whether the scenario accepts a Files entry naming a file that was not changed. The existing :215 does the same, but only on the refused side.
- How often the lens answers NOT APPLICABLE on library code.

Files: scripts/analysis/rule-lists.mjs, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts, src/tests/backlog/check-lane-close.logic.test.ts, docs/specs/00-architecture/08_agents.md, .claude/review-templates/README.md
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Dated note 2026-11-22 (M-246, prior text kept; RR-0391 · task-445 · Backlog; operator, verbatim: "add it. Then once these close move on to the Mcfix plan for the closed and built tasks with the new approach.")
<!-- SECTION:NOTES:END -->
