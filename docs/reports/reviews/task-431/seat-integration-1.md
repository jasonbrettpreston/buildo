# Seat: integration: task-431 plan (PLAN-431-v4)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

Basis: board head 79f79322f. Grepped every tracked file (outside backlog/ and docs/reports/reviews) for rule-lists, resolveTask, seatOf, eng-all; read the call sites at the cited lines; ran `rule-lists.mjs validate`, `page --check` and `check-tasks` (read only) and re-derived every open task's lists in memory on a copy of the table with the plan's edit and the de-dup line. No tests run, no files written, no .env, no model calls, no git state change.

### ig#1 MED: the plan gives no order against task-430 (RUNNING) and task-439, and they share files and rows with this plan
- Plan sentence: none. The plan has a CUT-OVER and a LANDING section but no sequence against other cards; NOT IN SCOPE only says "Dropping the four surface specs (task-439)".
- Evidence:
  - task-430 (INPUTS.2, RUNNING, lane BL-HB430) has on its Files line `src/tests/backlog/rule-lists-table.logic.test.ts` and `docs/reports/generated/rule-lists-by-kind.md`, both also on 431's Files line. Its card text says it must change the test at "rule-lists-table.logic.test.ts:205-210 pins 'fe.01 to fe.44 (44 distinct ids)'" and grows section 2 of Spec 136 from 13,784 to about 28K characters, so the page rows for surface-136 (web and phone sections) change.
  - 431 regenerates the same page (phone section lines, adjacent to the surface-136 row) and edits the same test file; .husky/pre-commit:44 runs `page --check` on every commit, so whichever lands second must re-run `page --write` after merging.
  - task-439 (LATER, no Files line yet) is "Specs 126, 127, 128 and 135 leave the front-end and phone rows": it edits the mobile and surfaces rows, which this plan edits (mobile `lists` at rule-lists.json:147). Its card says "after task-430".
  - tasks 440, 441, 442 (read-only look, engineering tests, front-end-to-database tests) have no Files line and name no rule-lists file.
- What goes wrong: a merge conflict in the page and the table test, or a stale page that the hook refuses at the second landing, found at the close.
- Smallest correction: one line in LANDING: "no hard order against task-430; whichever lands second merges the board and re-runs `page --write` (and re-checks rule-lists-table.logic.test.ts) before its close; task-439 follows both and rewrites the mobile and surfaces rows as they stand after this plan".

### ig#2 LOW: CUT-OVER says the close judges by the range base's table; task-431's own close is the exception, and it lands on the same lists
- Plan sentence: "The close judges a lane by the range base's table (check-lane-close.mjs:839-841)."
- Evidence: scripts/hooks/check-lane-close.mjs:838 `const ownsTable = coveredBy(filesEntries(baseTask ?? mv.now), 'scripts/analysis/rule-lists.json');` and :840 `... : ownsTable ? { ...table, ...pin, every_task: baseTable.every_task } : { ...baseTable, ...pin }`. A task whose Files line names the table (431 does) is judged by its branch table. The new table gives 431's Files line the same 10 lists (agents-s5-1to3, agents-s7-s11, queue-137, eng-all, orchestrator-doc17, policy-124-s2-s5, five-words, plan-protocol, inc-S, ms-S; re-resolved), so nothing owed changes.
- Smallest correction: add "except task-431 itself (:838), judged by its own table; same lists".

### ig#3 NIT: the `Spec-diff:` trailer named in the plan is read by no hook for this change
- Plan sentence: "The work commit carries the trailer `Spec-diff: docs/specs/00-architecture/08_agents.md (dated note 2026-11-22 after section 7 rule 4)`."
- Evidence: scripts/hooks/check-spec-diff.mjs:50 reads only `Spec-diff: N-A <why>`, and :39-42 triggers only on scripts/steps/, scripts/lib/compute/ or *.descriptor.json; this plan stages none. The work commit of task-438 (8745ee6dc) carries no such trailer. The trailer is harmless.
- Smallest correction: drop the sentence, or keep it as a courtesy line.

### ig#4 NIT: the Spec 08 note shifts every later line of 08_agents.md by one, including the plan's own citations
- Evidence: the note is inserted after :352; the plan and the card DoD cite 08_agents.md:488 (both directions) and :490, which become :489 and :491. The 438 ruling already accepted this (QUESTIONS-RULED.md Q5(d): "no check pins them").
- Smallest correction: none needed; say it once so the builder does not "fix" the cites.

### Consumers, one by one (none unless noted)
- scripts/analysis/backlog-lane.mjs: resolveTask :78, verifyResolved :80, the brief's rule block prints each resolved list (`- ${l.id}: ${l.file} ...`), the lens line splits by seat (:183-184: `lists.filter((l) => seatOf(l) === 'compliance')` and 'engineering') and orders one run per engineering list. Two or three engineering lists are handled; nothing is hard-coded to one. (The brief lists the lists after the de-dup, so a task that resolves eng-all no longer names eng-front there: see the regression seat, rg#1, for the test that reads it.)
- scripts/hooks/check-lane-close.mjs: resolveTask :476 and :620, verifyResolved :488, per-seat loop :519-522 (`r.lists.filter((l) => (split ? seatOf(l) : 'compliance') === seat)`), launch gate :649-650, `complianceSetErrors` :432-435 takes the seat and its own lists, so `out-engineering-rules` joins only that seat's lists. Handles several lists per seat and the joined form. In memory: `joinLists(table, ['eng-front','eng-shared'])` then `buildLensInputs` with lens-engineering.md gives 1 part, `parseLensInput` ok with id `rules`, and `seatOf` of the joined list is compliance (so the explicit seat argument is what makes it work, as plan fact 1 says).
- scripts/analysis/rule-lists.mjs plan-prep :636-669: names `in-plan-${seatOf(l)}-${l.id}[-pN].txt` per list. Handles 2 or 3.
- check-tasks (:502-526) and `complianceRefs` (:489): report only; exit 0. renderPage (:535-560) resolves each kind through resolveTask, so the page picks up the de-dup; its per-kind sections print each list as a row, three engineering rows are fine. validateTable kinds check (:163-165) runs verifyResolved on each kind.
- docs/reports/reviews/task-375/plant-evidence.mjs: loops `r.lists`, names by `rl.seatOf(l)`, copies `l.file` (the standards file) once; generic, needs no edit and is not on the Files line (right).
- scripts/hooks/check-task-files.mjs only imports filesEntries. scripts/lib/review-template.js, scripts/analysis/gates/generated-docs.mjs (lists the page as a generated file with a check, :53) and mcbylaws/protected-paths.json (layer23/protected paths only) are unaffected. backlog-brief.mjs does not read the table.
- verifyResolved after the de-dup: can the filter ever drop an every_task, increment or milestone list? Not on this table. The only way is a whole list and a sections list on one file. I scanned all 55 lists: no file has both. every_task = five-words (a sections list of the 132 file, alone) and plan-protocol (whole, its own file); increment docs are whole files of their own; milestone lists are sections of their own milestone files. The filter sits inside resolveTask, so all five readers (launch :80, close :488, plan-prep :638, check-tasks :512, validate :165) see the filtered set. The plan cites only validate and check-tasks; all five hold.
- Running lanes and prepped tasks: re-derived over all open tasks. Only task-372 (RUNNING, @lane-BL-FIXPROJ; to eng-back+eng-shared), task-380 (LATER; same) and task-381 (RUNNING, @lane-BL-HOOKS3; to eng-front+eng-shared) change set; every other open task keeps its engineering set (task-430 stays eng-all). docs/reports/reviews/ has no folder for 372, 380 or 381, and task-430's folder holds eng-all evidence that stays valid. So no plan folder goes stale except task-431's own, as the plan says.
- Protected-path two-commit landing: rule-lists.mjs and rule-lists.json are in protected_paths (rule-lists.json:22); check-lane-close.mjs:751-753 refuses a close in a commit that changes them; the plan's two-commit text is right. The lane does not touch base_ref, finished_statuses, protected_paths or exempt (:759).
- Generated page and system map: `page --check` is current today. docs/specs/00-architecture/00_system_map.md names no rule-lists file (0 matches); the claim holds.
- Files line: every path the plan changes is on it (rule-lists.json, rule-lists.mjs, the two tests, 08_agents.md, .claude/review-templates/README.md, the page); the task file and docs/reports/reviews/task-431/ are always allowed (exempt, rule-lists.json:224). Nothing on the Files line goes unchanged. `resolve` over the line gives the 10 lists above.

### Could not verify
- The behaviour of a lane that merges the board before closing (the plan's "they owe `out-engineering-<id>`"): read at check-lane-close.mjs:521 and :839-841, not driven.
- Whether spec-split-check budgets hold with the note (see reality-check seat).
