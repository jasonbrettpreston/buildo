> **Role: standard.**

# Plan protocol: scenario slices on the existing plan (operator 2026-11-17 ~22:00)
Operator, verbatim: "re add the earlier increments and we can start there but I want to use the existing plan - with all the tasks which we can remove later depending if they fit the plan ... These early plans need to be reviewed, grounded with the panel. We need a build pass and then optimization. The biggest thing is this cant take forever ... simple and no scope creep ... Dont make more ungrounded recommendations."
Principles (buildo-grounded-rules): standardization, observability, scalability, accuracy, understandability; keep it simple; no scope creep.

## 0. One plan, no new plan
- The ONLY plan is ~/Buildo-scratch/plan-gen/sequence.json (and the board). Nothing is re-written from scratch. Every existing task stays until a step below removes it with a cited reason.
- Increments 1-5 are RE-OPENED in sequence.json as increments "1".."5", one per built scenario: 1-2 detached house, 3 houseplex 2-4, 4 house with secondary suite, 5 garden suite. Their engine work stays DONE (cited); only the missing slice parts are added as tasks.
- Every new task carries its SOURCE (the file:line of the gap, ruling or sweep row it comes from). A task with no source is not added.

## 1. Done = the scenario works for a customer (the slice definition)
An increment is done only when, on a real lot on the real page: (1) engine rows right (answer key); (2) stored as ruled (headline / on demand, per the storage sitting); (3) page section + binding; (4) display text; (5) public route; (6) cost line; (7) CoA per option; (8) search hand-off where the scenario needs one; (9) measured check on the page. Built ONCE with the first slice (detached house): the route (MB-44 W), the headline table (MB-38), the text registry, the cost capture, the CoA mechanism, the check. Later slices add data + one check.

## 2. Steps, in order (per increment, 1 first)
| Step | What | Gate |
|---|---|---|
| A. Merge | Add the slice tasks to sequence.json from the existing sources only: gap-register/REGISTER.md, resolve-design/items.json, replan SCENARIO-SLICES.md (18 slice items), CoA regression, storage-outcome. Duplicates merged, never doubled. Old tasks untouched. | every added task has a source line; board re-rendered |
| B. Fit check | Tag every task in the increment: SLICE part (1)-(9) / SUPPORT S1-S8 / NONE. NONE goes on a removal list with its evidence (grep), not deleted. | design-fit seat X |
| C. Panel | Seats R,C,I,D,G,O,W,X then F on the increment's task list (tasks, order, dependencies). Beyond-research parts GROUNDED / STRIPPED / STILL OPEN. | check.mjs, check-cites, check-quotes PASS |
| D. Build pass | Lenses on the artifacts each build task will touch (file:line), red-first tests named, exact commands. | PASS lines |
| E. Optimisation | Merge, fold into existing nights/pushes, drop the removal list items the operator approves; nothing new added here. | F on the final wording |
| F. One sitting | One page per increment: the task list, the removal list, rulings only where a rule is genuinely open (searched first). | operator's words logged |

## 3. Simplicity guards (to stop task growth)
- No new research topics. Only the sources in step A.
- A step may add a task only if it fills one of the nine slice parts or one supporting function, with a source.
- Every step reports: tasks before, added (with source), removed-candidate, after. The count must not grow without a source per task.
- Rulings: only when a search of the record finds none; the search is quoted.
- One lane per increment at a time; increment 1-2 (detached house) first, the others queue behind it.

## 4. Operator order, 2026-11-17 ~22:20 (supersedes the step order in section 2)
Operator, verbatim: "Build this increment by incrememt - add the tasks to the plan - ensure the increment plan is reviewed ie grounded, reality check, integration, context, compliance etc. (for every task) 2 - optimize all the tasks within the increment (we need to complete this quickly) and then runa build pass and review any potential pushes in advance. When you get to incremement six - need to incorporate all the relevant tasks from the current plan. Do all nine increments this way tonight. In the end like today this needs to be one plan... we know what we are working on.. keep it simple."
Per increment: 1. ADD the slice tasks (section 2 step A) and REVIEW every task (seats R,C,I,D,G,O,W,X then F; every task gets a verdict). 2. OPTIMISE the increment's tasks (merge, fold into existing nights/pushes, removal list; nothing new). 3. BUILD PASS on the artifacts + PUSH REVIEW in advance (each push's contents, suite, gates, commit-msg trailers, ids, operator tty step). Then the one-page sitting.
Increments: 1-2 detached house, 3 houseplex, 4 house with suite, 5 garden suite, 6 renovations (with 6c owner inputs; incorporate every relevant task already in the current plan), 7 semi renovation, 8 sixplex, 9 merged measure, 10 proof set (+ Launch gate L). Output per increment: ~/Buildo-scratch/lanes-20261117/inc-plan/<inc>/seq-patch.json (delta only: new items with source, folds, removal candidates, status/dependsOn changes with reason) + SITTING.md + PASS lines. The orchestrator applies each patch to sequence.json after checking, so the end result is ONE plan.

## 5. Joining steps (operator 2026-11-17 ~22:40, verbatim: "we need one plan - we can only execute one plan 1. i agree fill this gap 2. yes make a home - our objective is to finish a completed project ie a database that works and is ready 3. yes - this is the mess we created we need to clean it up 4. yes. 5. yes we need to finish this as quickly as possible today was a massive setback - we cant continue to make these mistakes - the infastrcuture may need to change as per your earlier grounding issues etc. yes add them")
1. INTEGRATION PASS (after the last increment, before the board is final): across all increments check ids/dependsOn exist, one DB job at a time (Spec 137 rule 9), one recapture per increment, push order and contents, storage room vs the ST-3 line, shared-piece ids from increment 1-2 used consistently. Panel R,C,I,D,G,W,X then F. Output: one sequence.json.
2. LAUNCH-SHARED home: work that serves the finished product but no single scenario (search fixes, McFrontend launch list MCFRONTEND-QUEUE.md:498 - billing, account, tracked lots, landing, lawyer check -, McTest harness, the shared pieces) lives in increment "1-2 shared" or the Launch gate, from the gap register and the launch list only. Objective: a completed project - a database that works and is ready, served to the customer.
3. ONE SITTING: the orchestrator merges every increment's SITTING.md and the pending sittings (6c, 7, 8, 9, 10, design, gaps, storage) into one, duplicates merged, anything already ruled recorded not asked (search quoted).
4. HELD MERGE: when the CoA regression and the storage review land, their items go into their increments and only those items are re-reviewed (seats + F).
5. TIME: every task carries an estimate (MEASURED with source, or GUESS labelled); the integration pass shows the critical path to the customer-ready product.
6. INFRASTRUCTURE that caused today's errors is fixed only where it blocks this plan (infra freeze rule) and is listed in the plan as tasks with sources: e.g. ground.mjs pack contention, the forbidden-name guard on command lines, lanes reading only seat tails, design-fit check in every panel (done: seat X).
