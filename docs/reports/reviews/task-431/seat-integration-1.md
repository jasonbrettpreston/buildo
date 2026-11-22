# Seat: integration: task-431 plan (PLAN-431-v2)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

Basis: board head b0bd30ebf (plan was measured at 6c3f450c9; task-435's note is now in, commit c3144f4a2). Ran in memory only (node --input-type=module with resolveTask, headings, sectionText, wholeListText, buildLensInputs, joinLists, validateTable, checkTasks, complianceRefs, trackedFiles, imported as exported; a structuredClone of the table with the three lists and the five row edits). Read-only git and grep. No tests run, no files written, no .env, no model calls, no git state change.

Re-measured at this head (the plan's numbers moved because 435 added 537 characters to section 12):
- File 46,613 chars (46,897 bytes). The 14 level-2 headings are each matched by exactly one selector across the three lists (14 selectors, 14 distinct, each hits 1; none throws). `validateTable` on the edited copy returns [] (58 lists, 23 rows; today 55 lists). Every section lands in exactly one list.
- eng-front 3,214; eng-back 5,377 (3: 1,221, 9: 4,156); eng-shared 37,472 (section 12 is now 13,499, was 12,962); sum 46,063; eng-all 46,613; the other 550 is the title, banner and intro. Plan figures 36,935 / 45,526 are stale by 537 (it says so).
- Heading lines moved by +2 after 435: 13 is at 412, 14 at 454 (the plan lists 410 and 452).
- Files-line table (chars / per-list calls / joined calls), now then after:
- front `src/components/report/X.tsx`: 566,368 / 13 / 9 then 560,441 / 14 / 8 (-5,927, 1.05%)
- web example (adds a descriptor): 679,963 / 18 / 11 then 679,413 / 20 / 10 (-550; it also gets eng-back through the descriptor glob)
- phone `mobile/src/app/`: 766,953 / 18 / 12 then 761,026 / 19 / 12 (-5,927)
- pipeline: 197,778 / 10 / 3 then 194,014 / 11 / 3 (-3,764, 1.9%)
- API `src/app/api/parcels/search/route.ts`: 123,031 / 6 / 2 then 122,481 / 8 / 2 (-550; it resolves eng-front AND eng-back AND eng-shared because ui-app globs `src/app/**`)
- this task's own Files line: 293,200 / 11 / 5 then identical (eng-all once)
The plan's table is reproduced (+537 each) and correct.
- Open tasks: 311 now (plan 314). Resolved set changes for 30: same ids as the plan (18 RUNNING, 2 WAITS, 10 LATER). None became unresolvable. Double-sending set: the same 22 ids.

### ig#1 HIGH: the double-sending figures are incomplete, and for the 30 changed tasks the net direction is an increase
Plan sentence: "Extra sent per such task: 40,149 chars (front and shared) or 42,312 (back and shared)." and "Open tasks whose resolved list set changes: 30 of 314".
Evidence: the 22 split three ways: 9 tasks get front+shared+eng-all (+40,686 at this head: 345, 373, 382, 387, 389, 390, 393, 394, 395); 6 get back+shared+eng-all (+42,849: 366, 375, 379, 396, 406, 416); 7 get front AND back AND shared AND eng-all (+46,063, the whole file twice, 92,676 sent against 46,613 today: 267, 317, 357, 376, 378, 384, 411). The plan names only the first two figures. Real calls: a front file plus a test file goes 13 to 15 per-list calls (566,368 to 607,054 chars); a pipeline file plus a test 10 to 12 (197,778 to 240,627); front+pipeline+test 18 to 21 (679,963 to 726,026). Across all 30 changed tasks: 22 grow (+945,709 chars total), 8 shrink (-32,336 total: six by 3,764 to 5,927, two by 550; tasks 372, 374, 380, 381, 391, 392 and 354, 383). Net +913,373 characters. The real double is real: the resolver unions by list id (resolveTask `add`, byId map) and does not know eng-all contains the sections. A joined run (`--list rules`) carries the duplicate text too (joined calls 3 to 4 for pipeline+test).
What would go wrong: acceptance (e) reports the count but the saving the card promises goes the other way for 73% of the tasks the edit touches, and each of those reviews pays 1 to 3 more per-list calls at BOTH stages (plan and output), each carrying the material.
Smallest correction: state the three figures (40,686 / 42,849 / 46,063 at this head) and the 8-of-30 shrink and net +913,373 in the plan before it goes to the operator.

### ig#2 HIGH: T2 asserts something false on the real table, and the by-law row does not mean "no engineering lists"
Plan sentence: "By-law (ruled Q4): the `bylaw` row lists exactly ["bylaw-133"], and a path from the `layer23` key of mcbylaws/protected-paths.json resolves no eng-* list." and "by-law (first `layer23` glob) 335,345 / 11 / 5 | unchanged (ruled)".
Evidence: of the 2,378 tracked files that match the 14 layer23 globs, ALL 2,378 resolve an eng list today (via other rows: lane-tools for scripts/analysis/bylaw/**, step-pipeline for scripts/lib/maxbld-*.js, scripts/lib/bylaw-resolution.js, scripts/seeds/bylaw/**, tests row for src/tests/**/bylaw*). I resolved `scripts/analysis/bylaw/`, `scripts/lib/bylaw-resolution.js`, `scripts/seeds/bylaw/`: each gives bylaw-133 plus eng-all today. After the edit: 478 keep eng-all, 1,900 get eng-back + eng-shared. So T2's by-law assertion fails on the real table (red for the wrong reason, then cannot go green unless the test is weakened), and only the `scripts/analysis/bylaw/**` glob (the one the plan measured) is "unchanged".
What would go wrong: a builder follows T2 literally and cannot make it green, or weakens it silently; the 1,900 by-law-path files change set (eng-all to back+shared) without anyone ruling on that.
Smallest correction: rewrite T2's by-law clause to what is true (the `bylaw` row itself lists exactly ["bylaw-133"]; a by-law path gets whatever its other rows give) and say which by-law paths change.

### ig#3 MED: RUNNING lanes owe MORE than "in place of eng-all" for the double-sending ones
Plan sentence: "after it merges the board it owes out-compliance files for the new ids in place of eng-all".
Evidence: the close check judges a lane by the table at its range base (check-lane-close.mjs:829: `judge = ... { ...baseTable, ...pin }`), except a task whose own Files line names the table (`ownsTable`, same line) which is judged by its branch table. Correct as the plan says for 5 of 18 RUNNING lanes. But 13 of the 18 RUNNING changed tasks are in the double set (366, 373, 375, 376, 378, 384, 387, 389, 390, 395, 396, 406, 411): after their merge-base passes commit 1 they still resolve eng-all AND add up to three eng lists, so they owe eng-all plus 1 to 3 new out-compliance ids, not a replacement. Task-431 itself is `ownsTable` (its Files names rule-lists.json) and resolves eng-all only, so its own close is unaffected.
What would go wrong: the orchestrator tells 13 lanes "swap eng-all for the new ids" and the close check refuses them for the missing eng-all (or the new) outputs.
Smallest correction: say "in addition to eng-all" for the double-sending lanes, or fix ig#1 option so the replacement is true.

### ig#4 LOW: test line numbers: conclusions right, two citations wrong
Plan sentence: "Stay green ...: rule-lists-table.logic.test.ts:99, :112, :179 and backlog-lane.logic.test.ts:638 (lane-tools keeps eng-all)".
Evidence, read at head, plus in-memory resolves:
- Break, as the plan says: rule-lists-table.logic.test.ts:20-23 (mobile/x.ts and static-page.json no longer contain eng-all; the `for id of mobile, surfaces` row check at :23 fails); :161 (my resolve of the golden path gives exactly [surface-136, 126, 127, 128, 135, eng-front, eng-shared, eng-all, five-words, plan-protocol, inc-S, ms-S], the plan's order); :203 (`without` for `ReportPage.tsx` resolves [eng-front, eng-shared, five-words, plan-protocol, inc-S, ms-S], the plan's list); backlog-lane.logic.test.ts:343 (mobile+API route resolves mobile-98, eng-front, eng-shared, eng-back, storage-doc16, inc-F; `eng-all` absent, so `out-compliance-eng-all` fails). :331-337 of the same test are table-driven and stay green.
- Stay green, with the real reasons: rule-lists-table.logic.test.ts:44 (reference-docs keeps eng-all), :194 title only; rule-lists.logic.test.ts:59, :61, :63 (the spec rows resolve eng-all through specs-docs), :339 (eng-all still whole), :449 (`page --check`: red until the page is regenerated, which the plan does); backlog-lane.logic.test.ts:638 (default Files `scripts/analysis/thing.mjs` is lane-tools). Lines :99, :112 and :179 of the table test are the contract-routes and SURFACE-const lines; they hold no eng-all assertion, so they are not the evidence the plan says.
What would go wrong: nothing in the outcome; a reviewer checking the plan's lines finds no eng-all there.
Smallest correction: replace "99, 112, 179" with 44 and 194, and add rule-lists.logic.test.ts:449 to the "red until page regenerated" list. Tests were not run; this is a read of assertions plus in-memory resolves.

### ig#5 LOW: check-tasks cost is smaller than stated but buried
Plan sentence: "check-tasks ... prints a references add/remove command for each of the 30 tasks."
Evidence: `checkTasks` on the edited copy gives 30 tasks whose refs entry differs from today, all "add" commands (new compliance ids); no open task carries `compliance:eng-all` (only 8 BUILT tasks do), so there are no remove commands. check-tasks already prints 110 tasks with refs commands today, so the 30 are not separable in the output. 201 not-yet-resolvable tasks and 0 "bad" before and after.
What would go wrong: little; the cost is one command per task and noise.
Smallest correction: say "add only; 30 of 110 already-pending entries"; or accept.

### ig#6 LOW: "this task's own review" is not one of the 22
Plan sentence: "This task's own Files line (json under scripts/analysis, a test, a generated page) is one of them only through eng-all."
Evidence: resolving task-431's own body with the edited table gives eng-all only (lane-tools, tests, generated-reports); no front/back/shared list; it is not in the 22. Its own plan and output reviews are unchanged: 293,200 chars, 11 per-list calls.
What would go wrong: a reader takes the sentence as "431 itself pays the double".
Smallest correction: "this task's own review is unchanged (eng-all once)". Also: task-435 has landed (c3144f4a2), so Order step 1 is satisfied; 431's plan-prep review should run after regenerating the page (the page already shows 46,613).

### Close check as the plan states it (no finding)
Protected path: check-lane-close.mjs:738-740 is the self-edit rule; `protected_paths` in the table (line 22) holds rule-lists.json and rule-lists.mjs; a commit changing it may not also move a task to finished: stated correctly. Two-commit close: 137_mcqueue.md:100 and the closing commit "holds records only" (check-lane-close.mjs:822-823): stated correctly. `listProof` recomputes `listBlocks(table.lists[l.id])` per list id (check-lane-close.mjs:410-414): a sections list is proved the same as a whole one, so no new proof code. The plan's reading that the base keys base_ref, finished_statuses, protected_paths, exempt are unchanged holds (line 746 compares them).

### OPEN QUESTION A: what the code supports, measured (no ruling)
Counts for all three options are across the 311 open tasks at this head. Eng characters = sum of eng-* list text a task's reviews receive per stage.
- (1) Accept and report: no code. 22 tasks double (+40,686 / +42,849 / +46,063; ig#1). Net eng characters across changed tasks +913,373. The card's "infrastructure rows unchanged" is kept.
- (2) Give `tests` the eng-shared row: table only, but measured WORSE. The set that doubles grows from 22 to 26 (adds 385, 398, 400, 401, 402, 403, 407, 413, 415, 417; task-431 itself becomes a double through lane-tools+tests: eng-all plus eng-shared) because lane-tools (kept eng-all) plus tests now mixes the two. Net eng characters +999,274 (vs +913,373); 20 tasks' sets differ from option 1. Test-only tasks lose sections 1, 3, 9 (8,591 chars). Only the front/pipeline-plus-tests mixes stop doubling.
- (3) Resolver rule (a list whose file is attached whole is not added again as sections): removes every double by construction; net across the 30 becomes -32,336 (the 8 shrinks), the 22 stay at today's 46,613. Cost: a change inside `resolveTask`'s `add` in rule-lists.mjs, which is a protected path (self-edit rule: its own commit before the close), shared by the launch brief and the close check so both stay consistent, needs its own red-green test, and is not named by the card (124a:988). The code supports it as small and local; the record does not yet name it.

### Worth doing now? Evidence only
- Saving of the engineering split alone: 5,927 chars (1.05%) per front task, 3,764 (1.9%) per pipeline task, 550 (0.08 to 0.4%) for a web example or an API route; +1 to +2 per-list calls per review.
- Of the 30 tasks it touches, 22 pay 40,686 to 46,063 more, 8 pay less.
- The later surface-spec drop (RR-0380) changes 23 open tasks, all of them inside the same 30 (computed by dropping surface-126/127/128/135 from surfaces, mobile, surface-importers, surface-contract-routes). Both edits combined change the same 30 tasks once; separate they touch the 23 twice. Combined net eng+surface characters across open tasks: -7,898,386 (about -254,000 per changed task); engineering split alone: +913,373.
- Both edits are table edits of a protected path: each needs two commits, a "land one at a time" slot, a re-run of plan compliance for WAITS 267 and 317 and new out-compliance ids for the RUNNING lanes. Doing it twice repeats that for the 23.
- Against merging: the operator ruled order (b) at MORNING-DECISIONS.md:1866 as the orchestrator recorded it; the grounder and operator decide.
