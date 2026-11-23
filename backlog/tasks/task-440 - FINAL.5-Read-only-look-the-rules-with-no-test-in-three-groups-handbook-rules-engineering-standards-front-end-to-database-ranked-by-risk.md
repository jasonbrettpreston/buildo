---
id: TASK-440
title: >-
  FINAL.5 Read-only look: the rules with no test, in three groups (handbook
  rules, engineering standards, front end to database), ranked by risk
status: LATER
assignee: []
created_date: '2026-11-22T20:24:00Z'
updated_date: '2026-11-23T13:14:00Z'
labels:
  - McFix
  - McFix Final
milestone: m-1
dependencies: []
type: record
ordinal: 140012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-22 by the orchestrator, Spec 137 rule 2, on the operator's ruling RR-0385 (MORNING-DECISIONS.md:1915 entry, RR-0385, decision-170). Operator, verbatim: "We just want to focus on getting the right tests that mirror the engineering and compliance."; "This is the focus for both compliance and engineering standards and interface between the frontend and databse"; "I feel much more confident if you focus on getting the tests right". THIS TASK: a read-only look that lists every rule with no machine check in the three groups, what already exists, and a risk rank with known breaks first; a grounder checks the list; the operator sees it. No code. Scope and Files line at its plan review. Every build task of this plan follows the six steps, plan written and built on Opus (his words: "I want this plan for each task and built by opus").

Files: docs/reports/reviews/task-440/RULE-CHECKS.md, docs/reports/reviews/task-440/GROUNDER-LOOK.md
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
# PLAN-440-v1

Task-440 FINAL.5, type record (task-440 card, Status LATER). Plan seat: Opus (RR-0385 item 1, MORNING-DECISIONS.md:1917). Board read at eb7aad381 (wf2/board). Plan protocol: plan-protocol.md has no section list for one task. Its note at :3 sends a lane task to the Spec 08 section 7 lens set, so this plan uses the section form of the recent plans (PLAN-446-v1, task-446 file :44-276).

## 0. What already exists (the look reads these; it does not count again)

| # | Existing coverage | Where | What it gives the look |
|---|---|---|---|
| E1 | Handbook Status lines (generated from Spec 135) | docs/specs/02-web-admin/136_mcfrontend_handbook.md:34-203 | 57 lines fe.01-fe.57. 36 `Status: RULED`, 21 `Status: OWED`. 35 RULED lines name an `Enforced by:` path, and all 35 paths are tracked. fe.08 (136:55-56) is RULED with no check named. One OWED lock is already tracked: fe.39's src/tests/surfaces/engine-inputs-bind.logic.test.ts, listed in FLIP_PENDING at src/tests/surfaces/register-locks-resolve.infra.test.ts:30. |
| E2 | register-locks-resolve.infra.test.ts | :2-3 (rules 5, 3, 2), :18 (it reads Spec 135, not 136) | Proves that a RULED row's lock file exists and that an OWED row's lock does not exist yet. It does not prove that the lock covers the whole rule. |
| E3 | scripts/surfaces/_schema/surface-rule-map.json | `rules`: 57 entries, 36 `active`, 21 `owed` | Placement only. Its $comment says status lives in the register. It has no enforcement field, so it serves only as a cross-check of the counts. |
| E4 | Task-365 coverage table | docs/reports/lanes/2026-11-20/BL-COMPLY/FINDINGS.md:61-79 (scratch copy ~/Buildo-scratch/lanes-20261119/inc1b/comply/FINDINGS.md) | fe at 44 lines: 35 lock, 8 OWED, 1 other (fe.08). eng: "not tabulated" (:79). Group 2 is therefore the only truly new reading. |
| E5 | Task-365 grounder verdicts | docs/reports/lanes/2026-11-20/BL-COMPLY/GROUNDER.md:44-106 (D1-D12 CONFIRMED), :108-122 (C1-C4 CONFLICT) | The known breaks (section 4). |
| E6 | REPORT-429 section 3 | ~/Buildo-scratch/lanes-20261119/inc1b/inputs429/REPORT-429.md:116-223 (3A gaps ranked 1-9 then lower; 3B binding and enforced, :197-223) | Ungrounded: "Not yet grounded" (MORNING-DECISIONS.md:1905). It is not in the repo (docs/reports/lanes/2026-11-22/INPUTS429/ is an empty untracked folder). The look uses it only as a pointer and as a tie-break, never to set a status. |
| E7 | Design-fit and "bound + available" | scripts/analysis/proof-slices.json:12 (design-fit, "notbuilt", blocked by task-345 and task-67), :15 report-opens, :17 elements-number-or-word, :18 key-match (all notbuilt); memory rule design-fit-gate.md (outside the repo, not citable as a rule) | No design-fit test exists under src/tests (grep "design-fit" finds only the proof-slice files). These rows are recorded as checks that are not built. |
| E8 | Binding tests (file-only, "No DB, no network") | src/tests/surfaces/report-binding.logic.test.ts:1-8, contract-binding.logic.test.ts:1-12, binding-standard.logic.test.ts, engine-inputs-bind.logic.test.ts:1-9, report-generator-fields.logic.test.ts:1-9 | The "bound" side of group 3. |
| E9 | Engineering-standards citations in checks | `git grep -l 00_engineering_standards -- src/tests scripts .husky .github` finds 110 files; enforcement.logic.test.ts:1-9 (§6.1, §9.4, §3.2); eslint.config.mjs:53-61 and :70 | The search source for group 2. |

Not read as existing checks: the gates on branch wf1/inc1b-gates (gates A and B, 11 commits that are not on the board). RR-0386 (MORNING-DECISIONS.md:1932) keeps that branch untouched, and the board does not hold it.

## 1. Scope

The look reads the board at one pinned sha. It lists every rule in three groups and, for each rule, which machine check already exists (file:line) or that none exists. It then ranks the rules with no check, or only part of one, by risk, open known breaks first. The three groups are:
1. the McFrontend handbook lines (Spec 136 section 2);
2. the engineering standards (docs/specs/00_engineering_standards.md);
3. the interface between the front end and the database.

A separate grounder checks the list, and the operator is shown one short table. The output feeds task-367 (group 1), task-441 (group 2) and task-442 (group 3). The rulings behind it:
- RR-0385 item 6 (MORNING-DECISIONS.md:1922), operator verbatim: "We just want to focus on getting the right tests that mirror the engineering and compliance." (:1909) and "This is the focus for both compliance and engineering standards and interface between the frontend and databse" (:1910).
- Principles served: accurate, observable, understandable.

## 2. NOT in scope

- No code, no test, no new tool, gate, script, field or rule list.
- No change to rule-lists.json.
- No new handbook line or rule. RR-0392 (:1976): "no other infrastructure is needed beyond this".
- No fix of a break that is found.
- No ruling on a conflict between two rules. A conflict is noted in its row, e.g. eng §12.3/§12.5/§12.7 against fe.46 (REPORT-429:7 item 7).
- No DB query, no test run. Whether a check runs is read from hooks, CI and package.json, never executed.

## 3. The three groups: rule source, check source, status rule

Pin first: `S=$(git rev-parse wf2/board)`. Every read is `git show $S:<path>`, and every "tracked" test is `git ls-tree -r --name-only $S | grep -Fx <path>`.

### Group 1: McFrontend handbook rules
- **Rule list:** each line matching `^- \*\*fe\.` in 136 section 2 (136:32-203). The Status line is the line after it. Count: `git show $S:docs/specs/02-web-admin/136_mcfrontend_handbook.md | grep -c '^- \*\*fe\.'` gives 57 today, or 58 once task-446 lands.
- **Check source:** the `Enforced by:` or `lock owed:` path on the Status line, its tracked state (E1), the check file's own header, open known breaks (section 4), and E6 3B as a pointer.
- **Status rule:**
  - **enforced:** RULED, the path is tracked, no open known break, and no quoted line (the check's header, or a committed record) shows the check covers less than the rule.
  - **partly:** RULED with an open known break or a quoted scope gap; or OWED with the lock already tracked (fe.39 today).
  - **none:** OWED with the lock not tracked; or RULED with no check named (fe.08).

### Group 2: engineering standards
- **Rule list:** each numbered subsection `^### [0-9]+\.[0-9]+`, which gives 52 (`grep -c`), plus the 6 rows of the section 14 registry (00_engineering_standards.md:462-467). Total 58.
  - Section 11 (the 43 plan checklist items, :235-303) is left out because it restates sections 1-10 for plans (Q2).
  - A subsection with several "Rule:" bullets is one row. It is "partly" when any bullet is unchecked, and the row names the unchecked bullet (Q3).
- **Check source:** a file that fails when the rule is broken anywhere in its scope:
  - an ESLint or Biome rule (eslint.config.mjs, biome.json);
  - an ast-grep rule (scripts/ast-grep-rules/*.yml, scripts/hooks/ast-grep-leads.sh);
  - a hook (.husky/*, scripts/hooks/*);
  - a CI step (.github/workflows/*);
  - a src/tests test that asserts across the tree.

  A test of one function that obeys the rule is an instance, not a check. Candidates are found from the subsection's own text (e.g. §12.11 at :366-375 names its files) and from `git grep -n 00_engineering_standards $S -- src/tests scripts .husky .github eslint.config.mjs biome.json`, matched to `§N.M` on the hit line or in the file header. Match on the basename: enforcement.logic.test.ts:2 cites a wrong path, docs/specs/00-architecture/00_engineering_standards.md.
- **Wired:** a src/tests file runs in `npm run test` (pre-push and CI), except `*.db.test.ts`, which `npm test` leaves out (.husky/pre-commit:7-11). Lint runs at .husky/pre-commit:55.
- **Status rule:**
  - **enforced:** a wired check covers every bullet over the scope the bullet states.
  - **partly:** a wired check covers some bullets or a narrower scope (example: §12.11 "Initially scoped to `src/features/leads/`", :367); or the only check is a db test and its CI step is not shown.
  - **none:** no check.

### Group 3: front end to database
- **Rule list:** the rows of groups 1 and 2 whose text names a database table or column, a stored value, a route response or contract, or the producer, as the source of what a screen shows or writes. They are listed again in group 3, not counted twice in the totals. The planner's reading of that criterion:
  - fe.05, fe.18, fe.19, fe.20, fe.21, fe.24, fe.25, fe.27, fe.30, fe.32, fe.37, fe.38, fe.39, fe.40, fe.41, fe.42, fe.44, fe.45, fe.52 (19 lines);
  - eng §4.4, §10.1, §10.2, §10.3 and the section 14 row at :462 (5 rows);
  - 24 in all.

  The lane applies the criterion to every group 1 and 2 row. It records any row it adds or drops against this list, with a quote.
- **Check source, two columns:**
  - **Bound:** a file-only check proves that the displayed value's declared source resolves to a real field (E8; binding-sources.json; contract whitelist; schemas).
  - **Available:** a check against data proves the field is served and populated on a real lot: a tracked `*.db.test.ts` (144 tracked), the McTest layers (fe.40, src/tests/mctest/catalogue.infra.test.ts), or a proof-slice row that is not `notbuilt` (E7).
- **Status rule:** enforced when both are present, partly when one is, none when neither is. A rule's group 3 status may differ from its group 1 status, and that difference is the point of the group.

### Row form (one table per group, docs/reports/reviews/task-440/RULE-CHECKS.md)
`| Rank | Rule id | Rule (file:line, quote of 20 words or fewer) | Check that exists (file:line, or none) | Kind (test/lint/hook/CI/schema) | Bound | Available | Status | Why partly or none (file:line) | Known break (id, record file:line, open or fixed since file:line) | Feeds |`
Bound and Available are filled for group 3 only.

### Worked examples from the repo (the lane confirms each at the pin)
- **G1:** `| ? | fe.36 | 136:139 "a control that moves the user uses the platform router" | src/tests/surfaces/nav-by-route.logic.test.ts (136:140) | test | | | partly | the lock walks its DIRS only (nav-by-route header :10) | D7 F-229 HIGH, BL-COMPLY GROUNDER.md:84-86 (ReportPage.tsx:251 plain <a>): open or fixed is UNVERIFIED | task-367 |`
- **G2:** `| - | §12.12 | 00_engineering_standards.md:379 "MUST have at least one fast-check property test" | none: src/tests/property/*.property.test.ts are instances (report-sqft-rounding.property.test.ts:1-3), nothing fails when a new conversion has none | | | | none | | D6 F-188 HIGH, GROUNDER.md:80-82: fixed since report-sqft-rounding.property.test.ts:3 ("D6 of the BL-GROUND verdicts", task-372) | task-441 |`
- **G3:** `| ? | fe.18 | 136:85 "every displayed field binds to a source in the closed set" | report-binding.logic.test.ts (136:86) | test | yes (closed set, binding-sources.json; "No DB, no network" :8) | none (fe.25 lock answer-key-e2e.db.test.ts OWED 136:106-107; proof-slices.json:17 notbuilt) | | partly | available side unchecked | - | task-442 |`

## 4. Risk rank (within each group; enforced rows get "-")

1. **An open known break first, worst severity first (CRIT, HIGH, MED, LOW).** A known break is a CONFIRMED verdict by a separate grounder on product code (src/ outside src/tests, or mobile/) whose own cited rule is a row of the group. It comes from two sources:
   - **K1:** BL-COMPLY GROUNDER.md section D, :44-106 (D1-D12; C1-C4 are conflicts, not breaks).
   - **K2:** `find docs/reports/lanes docs/reports/reviews -name 'GROUNDER*.md' -print0 | xargs -0 grep -HE '^\S+ CONFIRMED (src|mobile)/' | grep -v ' CONFIRMED src/tests/'`. Today this gives 3 lines, all docs/reports/lanes/2026-11-20/BL-RULESACC/GROUNDER.md, on mobile/src/lib/maxbldHelp.ts:18-19, citing Specs 126 and 128.

   "Fixed since" means a later commit or test cites the finding id, or the cited code line reads fixed at the pin. Example: D6 above. A fixed-since row ranks by key 2. A break whose cited rule is in no group (D1 doc-16 P3; D5 Spec 99 B1; D10 tooling; the K2 lines unless a handbook line states their rule) goes in a short "Outside the three groups" list, unranked.
2. Status none before partly.
3. Named as a gap by an earlier record: the REPORT-429 3A order, then "with none" in E4.
4. Source order (line number).

## 5. Size and split

About 57-58 + 58 + 24 (24 listed again) = about 140 rows of reading, no runs. That fits one lane. If the lane's context runs short, it closes groups 1 and 3 first (the inputs of task-367 and task-442), then group 2, in the same file. One commit at the end either way.

## 6. Method (lane steps)

1. Pin S. Write the header with S and each counting command and its output.
2. Fill group 1, then group 2, then group 3 by section 3.
3. Map K1 and K2 to rows (section 4). Check "fixed since" with `git grep -n -e 'D<n> of the BL-GROUND' -e 'F-<nnn>' $S -- src mobile scripts` and by reading the cited code line.
4. Rank. Write "Outside the three groups" and an UNVERIFIED list.
5. Write section 1 "For the operator", one table: `| Group | Rules | Enforced | Partly | None | Open known breaks | Top three to test (ids) |`, with three rows.
6. Hand to the grounder (section 7).
7. Correct every WRONG verdict, then land (section 8).

## 7. Grounder

A separate grounder on Sonnet (RR-0385 item 1, :1917), not the lane. It writes docs/reports/reviews/task-440/GROUNDER-LOOK.md with one verdict per checked row (CONFIRMED or WRONG, with file:line).
- **Checked whole:** every count and every mechanical cell of group 1 (it re-runs the commands); every row marked enforced in groups 2 and 3; every known-break row and the "Outside" list.
- **Checked by sample:** 10 none or partly rows per group, named in the file. A false "enforced" silently takes a rule off task-441, task-442 or task-367. A false "none" costs at most one test that the build task's red-first step exposes.

## 8. Files, landing, close

Files: docs/reports/reviews/task-440/RULE-CHECKS.md, docs/reports/reviews/task-440/GROUNDER-LOOK.md

**Why this path:**
- Both paths are exempt (rule-lists.json `exempt`: docs/reports/reviews/**). A top-level docs/reports/<file> would match no row, and the resolver would refuse it (rule-lists.mjs:262, "no silent no rules apply"). A new row would be new infrastructure.
- With exempt-only entries, a record task resolves to every_task (five-words, plan-protocol) plus the m-1 lists (inc-S, ms-S) (rule-lists.mjs:263-276; resolution UNVERIFIED until the launch prints it).
- Review records live in docs/reports/reviews/<task>/ (08_agents.md:364-367 note).

**Commit (Rule 3 as written; one commit):**
- The status line moves in the same commit as the work (137_mcqueue.md:98). The two-commit close is for lane build and fix tasks only (137:100, :138).
- The task file is its own row (137:22).
- Subject: `docs(137_mcqueue): task-440 rule-check look, three groups ranked` (the form validate-commit-msg.sh requires).
- Trailers: `Task: task-440` and `Operator-Ruling: RR-0385 (2026-11-22, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1922)`.
- No `FE-nn` token in the message, because the McBylaws commit-msg arm refuses OWED ids (task-446 plan :233). Name lines as fe.NN.
- No hook is bypassed. A docs-only commit is exempt from G3 and CHK.1 (137:23; check-task-files.mjs:10-11).
- Any operator ruling on the look enters as a verbatim dated note (137:125) and a decision row.

**Close (check-lane-close.mjs, which runs on a move to BUILT, DONE or MERGED, :736-748):**
- **(a) No `@lane-` assignee:** a record task with no lane assignee and no code staged is exempt (:466-472, :815).
- **(b) Taken through backlog-lane.mjs** (record-only, compliance only: backlog-lane.mjs:190; no launch plan gate for a record task, check-lane-close.mjs:616). The close then needs:
  - a committed docs/reports/reviews/task-440/context-rN.md (:480);
  - docs/reports/lanes/<date>/<lane>/ holding TASK = task-440 (:501-503);
  - one compliance output per resolved list, `plan-` or `out-`, each with its `in-` input and REVIEW header (:517-522), or the joined form;
  - GROUNDER.md, only when a lens output holds a finding (header :32);
  - every changed path outside docs/reports and backlog covered by Files (:494-496; none here).
  - REPORT and GROUNDER references are required of build tasks only (:508).
- **Recommendation:** (b), so the lane report is in the repo. Which stage the outputs must hold when every Files path is exempt is UNVERIFIED (Q5).
- **DoD:** items #2-#4 (tests) are marked "not applicable: record task, no test (section 2)".

## 9. Acceptance (each checkable)

1. The RULE-CHECKS.md header names S and the commands. The group 1 row count equals `grep -c '^- \*\*fe\.'` at S. RULED and OWED totals equal the `grep -c 'Status: RULED'` and `grep -c 'Status: OWED'` counts. Group 2 has 52 + 6 = 58 rows. Group 3 is the 24 listed rows plus or minus recorded differences, each with a quote.
2. In each group, enforced + partly + none = rows.
3. Every check cell other than "none" is a path tracked at S, with a line.
4. Each of D1-D12 and each K2 line appears once, on a row or under "Outside", marked open or fixed since file:line.
5. Each group's ranked rows sort by the four keys of section 4.
6. The operator table has 3 rows and the columns of section 6 step 5.
7. GROUNDER-LOOK.md exists, written by a separate agent, covering section 7 in full. Every WRONG verdict is corrected in RULE-CHECKS.md.
8. `git diff --name-only <launch>..HEAD` shows only the Files paths, the task file and the lane or review records. Nothing under src/, scripts/, mobile/, migrations/ or docs/specs/ changes.
9. Task DONE in the landing commit, through the real hooks.

## 10. Order against open tasks

- **task-446 (planned)** changes what group 1 reads. It adds fe.58 (R-22) as OWED, so the counts become 58 lines and 22 OWED. Its plan drops R-03 and R-04 as already stated by fe.49 and fe.52 (task-446 :43-52, 136:178-188). By the stated order (MORNING-DECISIONS.md:1983, RR-0395 :1994), 446 lands before 439 and so before 440. If it is not on the board at S, the look counts 57 and 21 and adds one unranked "pending: Spec 128 R-22 (128:224), line via task-446" row.
- **task-445 (running)** changes nothing the look reads. It changes lensSet security for code tasks only (task-445 :90; rule-lists.mjs:183-191, `code &&`), and a record task is not a code task.
- **task-439 (planned)** changes nothing the look reads. It edits the rule-lists.json rows only (task-439 :30), not handbook lines or checks.
- **task-367 (RUNNING, @lane-BL-GATES):** the look does not read its branch (section 0). Its card's "8 OWED" (task-367 description (d)) is now 21 or 22. The look's group 1 table replaces that list.

## 11. Questions for the grounder

- **Q1.** "the interface between the front end and the database" (:1922). Planner's reading: group 1 and 2 rules seen as bound and available. Other reading: also rules of Specs 99, 100, 126 and 128 that have no handbook line (e.g. D5, Spec 99 B1). Which one applies?
- **Q2.** Should the section 11 plan checklist (43 items) be left out of group 2?
- **Q3.** Group 2 unit: subsection (planner) or each "Rule:" bullet?
- **Q4.** The card says "Every build task of this plan ... built by Opus". Does that cover this record lane? Planner: yes, Opus.
- **Q5.** For a record close with exempt-only Files, which stage of compliance output and what `in-` material does check-lane-close require (:445-456, :517-522)?
- **Q6.** Is a "known break" only a grounder CONFIRMED verdict (planner), or also an ungrounded REPORT-429 item?

## 12. UNVERIFIED

- Open or fixed for D7, D8 and D9, and for every K1 item except D6.
- Whether test:db runs in CI.
- The resolved list set for this task.
- The section 8 Q5 mechanics.
- The planner's group 3 list against the criterion. Not every line's full text was read.

## 13. GUESS estimate

One Opus lane, about 2-3 hours of reading. Grounder about 1 hour.
<!-- SECTION:PLAN:END -->
