---
id: TASK-440
title: >-
  FINAL.5 Read-only look: the rules with no test, in three groups (handbook
  rules, engineering standards, front end to database), ranked by risk
status: DONE
assignee:
  - '@lane-BL-LOOK440'
created_date: '2026-11-22T20:24:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - McFix
  - McFix Final
  - dead
milestone: m-1
dependencies: []
references:
  - docs/reports/reviews/task-440/GROUNDER-PLAN.md
  - docs/reports/reviews/task-440/TRIAGE-PLAN.md
  - docs/reports/reviews/task-440/seat-integration-1.md
  - docs/reports/reviews/task-440/seat-reality-check-1.md
  - docs/reports/reviews/task-440/seat-regression-1.md
  - compliance:five-words docs/specs/01-pipeline/132_step_standard_handbook.md
  - compliance:plan-protocol docs/specs/00-architecture/plan-protocol.md
  - compliance:inc-S backlog/docs/increments/doc-2 - Increment-S-requirements.md
  - compliance:ms-S backlog/milestones/m-1 - increment-1·b-search-[s].md
  - docs/reports/reviews/task-440/RULE-CHECKS.md
  - docs/reports/lanes/2026-11-23/BL-LOOK440/REPORT.md
  - docs/reports/reviews/task-440/GROUNDER-LOOK.md
  - docs/reports/lanes/2026-11-23/BL-LOOK440/GROUNDER.md
  - docs/reports/lanes/2026-11-23/BL-LOOK440/TRIAGE.md
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
- [x] #1 The rule the task rests on is quoted with file:line in the task, or the task is a card for the missing rule — "Quote the rule first" (.cursor/MCBYLAWS-QUEUE.md:107)
- [ ] #2 The tests were written first and proven red, then green — "Every lock is proven in BOTH directions" (docs/specs/00-architecture/08_agents.md:462)
- [x] #3 The work is committed through the real hooks, none bypassed — "Red tests first, then the code, through the real hooks." (docs/specs/00-architecture/08_agents.md:490)
- [ ] #4 The named test is green before the task is called done — "Never declare a task done until" (CLAUDE.md:32)
- [ ] #5 Any operator ruling the task needed is recorded verbatim as a dated note or a decision-log row — "A ruling enters a row as a verbatim dated note." (docs/specs/00-architecture/137_mcqueue.md:109)
- [ ] #6 The task file and its queue row are updated in the same commit as the work — "The status line changes in the same commit as the work." (docs/specs/00-architecture/137_mcqueue.md:84)
- [ ] #7 DONE carries its evidence (commit sha, test, hook result) — "The work landed and the evidence exists" (docs/specs/00-architecture/137_mcqueue.md:63)
- [x] #8 Nothing was added that the card or ruling did not name — "no change adds a tool, field or rule its card or ruling did not name" (docs/specs/01-pipeline/124a_step_standard_policy_appendix.md:988)
- [x] #9 The principles the task serves are named — "Each task names the ones it serves." (.cursor/MCBYLAWS-QUEUE.md:104)
- [ ] #10 The close-out reply ends with one STATUS line and at most one question — "Every reply ends with one line" (docs/specs/00-architecture/08_agents.md:505)
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# PLAN-440-v1

Task-440 FINAL.5, type record (task-440 card, Status LATER). Plan seat: Opus (RR-0385 item 1, MORNING-DECISIONS.md:1917). Board read at eb7aad381 (wf2/board); the three seats and the grounder re-read at 77d54ecc7 (docs/specs/02-web-admin and docs/specs/00_engineering_standards.md are unchanged between the two). Plan protocol: plan-protocol.md has no section list for one task. Its note at :3 sends a lane task to the Spec 08 section 7 lens set, so this plan uses the section form of the recent plans (PLAN-446-v1, task-446 file :44-276).

## 0. What already exists (the look reads these; it does not count again)

| # | Existing coverage | Where | What it gives the look |
|---|---|---|---|
| E1 | Handbook Status lines (generated from Spec 135) | docs/specs/02-web-admin/136_mcfrontend_handbook.md:34-203 | 57 lines fe.01-fe.57. 36 `Status: RULED`, 21 `Status: OWED`. 35 RULED lines name an `Enforced by:` path, and all 35 paths are tracked. fe.08 (136:55-56) names no path on its 136 Status line, but its Spec 135 Lock cell reads "Lock: see FE-16." (135:30) and FE-16 (135:38) names src/tests/surfaces/spec-paths.infra.test.ts, so fe.08 has a lock (register-locks-resolve.infra.test.ts:68 refuses a RULED row with neither a lock path nor a "see FE-nn"). One OWED lock is already tracked: fe.39's src/tests/surfaces/engine-inputs-bind.logic.test.ts, listed in FLIP_PENDING at src/tests/surfaces/register-locks-resolve.infra.test.ts:30. |
| E2 | register-locks-resolve.infra.test.ts | :2-3 (rules 5, 3, 2), :18 (it reads Spec 135, not 136) | Proves that a RULED row's lock file exists and that an OWED row's lock does not exist yet. It does not prove that the lock covers the whole rule. |
| E3 | scripts/surfaces/_schema/surface-rule-map.json | `rules`: 57 entries, 36 `active`, 21 `owed` | Placement only. Its $comment says status lives in the register. It has no enforcement field, so it serves only as a cross-check of the counts. |
| E4 | Task-365 coverage table | docs/reports/lanes/2026-11-20/BL-COMPLY/FINDINGS.md:61-79 (scratch copy ~/Buildo-scratch/lanes-20261119/inc1b/comply/FINDINGS.md) | fe at 44 lines: 35 lock, 8 OWED, 1 other (fe.08). eng: "not tabulated" (:79). The table covers fe.01-fe.44 only (FINDINGS.md:67); fe.45-fe.57 (13 lines, all OWED, no tracked lock) were never in it, and its "1 other" is fe.08 and its see-FE-16 lock. Group 2 is the only group with no earlier reading at all. |
| E5 | Task-365 grounder verdicts | docs/reports/lanes/2026-11-20/BL-COMPLY/GROUNDER.md:44-106 (D1-D12 CONFIRMED), :108-122 (C1-C4 CONFLICT); docs/reports/lanes/2026-11-20/BL-COMPLY3/GROUNDER-2.md :28 (D13), :34 (D14), :42-44 (C5 CONFLICT) and new members of D3 (BL-GROUND/GROUNDER-2.md is the same file) | The known breaks (section 4). |
| E6 | REPORT-429 section 3 | ~/Buildo-scratch/lanes-20261119/inc1b/inputs429/REPORT-429.md:116-223 (3A gaps ranked 1-9 then lower; 3B binding and enforced, :197-223) | Ungrounded: "Not yet grounded" (MORNING-DECISIONS.md:1905). It is not in the repo (docs/reports/lanes/2026-11-22/INPUTS429/ is an empty untracked folder). The look uses it only as a pointer and as a tie-break, never to set a status. |
| E7 | Design-fit and "bound + available" | scripts/analysis/proof-slices.json:12 (design-fit, "notbuilt", blocked by task-345 and task-67), :15 report-opens, :17 elements-number-or-word, :18 key-match (all notbuilt); memory rule design-fit-gate.md (outside the repo, not citable as a rule) | No design-fit test exists under src/tests (grep "design-fit" finds only the proof-slice files). These rows are recorded as checks that are not built. |
| E8 | Binding tests (file-only, "No DB, no network") | src/tests/surfaces/report-binding.logic.test.ts:1-8, contract-binding.logic.test.ts:1-12, binding-standard.logic.test.ts, engine-inputs-bind.logic.test.ts:1-9, report-generator-fields.logic.test.ts:1-9 | The "bound" side of group 3. |
| E9 | Engineering-standards citations in checks | `git grep -l 00_engineering_standards -- src/tests scripts .husky .github` finds 110 files; enforcement.logic.test.ts:1-9 (§6.1, §9.4, §3.2); eslint.config.mjs:53-61 and :70 | The search source for group 2, with the fixed inventory of section 3 (many checks cite no spec). |
| E10 | Report-only gates on the board (commit 6513119b0, an ancestor of the board head) | scripts/analysis/gates/compute-reach.mjs, mobile-literals.mjs:1 (SPEC LINK fe.05, fe.44) and mobile-never-do.mjs (Spec 90 section 5), tested by src/tests/gate-mobile-compliance.infra.test.ts:4 ("Report-only: nothing wires them."); also scripts/analysis/gates/red-evidence.mjs, owner-spec-diff.mjs, closed-bounds.mjs and compute-literals.mjs, run through step-validate.mjs (.husky/pre-commit:49, .husky/pre-push:41) | Check files for fe.05, fe.44 and Spec 90 section 5. A gate that only reports, or that nothing wires, is "partly" at most (section 3). |

Not read as existing checks: the 11 unlanded commits of branch wf1/inc1b-gates, which RR-0386 (MORNING-DECISIONS.md:1932) keeps untouched; the look does not read that branch. Its stage 1 is on the board (E10) and is read like any other check file.

## 1. Scope

The look reads the board at one pinned sha. It lists every rule in three groups and, for each rule, which machine check already exists (file:line) or that none exists. It then ranks the rules with no check, or only part of one, by risk, open known breaks first. The three groups are:
1. the McFrontend handbook lines (Spec 136 section 2);
2. the engineering standards (docs/specs/00_engineering_standards.md);
3. the interface between the front end and the database.

A separate grounder checks the list, and the operator is shown one short table. The output feeds task-367 (group 1, its item (d), the OWED handbook locks; RR-0386 restarts them as handbook rule tests), task-441 (group 2) and task-442 (group 3). Group 3 is rule level: it says which rules lack a Bound or an Available check, and the number-level inventory of the screens is task-442's own first step. Items (a) to (c) of task-367's card (compute reach, numbers in mobile code, the Spec 90 section 5 never-do list) are not handbook rules and are outside the look; their report-only gates are already on the board (E10). The rulings behind it:
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

Pin first: `S=$(git rev-parse wf2/board)`. The pin also fixes the hook text (.husky/pre-commit, .husky/pre-push), which task-424 changes later. Every read is `git show $S:<path>`, and every "tracked" test is `git ls-tree -r --name-only $S | grep -Fx <path>`.

### Group 1: McFrontend handbook rules
- **Rule list:** each line matching `^- \*\*fe\.` in 136 section 2 (136:32-203). The Status line is the line after it. Count: `git show $S:docs/specs/02-web-admin/136_mcfrontend_handbook.md | grep -c '^- \*\*fe\.'` gives 57 today, or 58 once task-446 lands.
- **Check source:** the Spec 135 row's Lock cell first, including `see FE-nn` followed to that row (FE-08 at 135:30 points to FE-16 at 135:38), because a Lock cell can name several paths (FE-13 at 135:35, FE-18 at 135:40, FE-31 at 135:53); then the `Enforced by:` or `lock owed:` path on the 136 Status line; their tracked state (E1); each check file's own header; the arms of scripts/surfaces/surface-validate.mjs with report-checks.mjs and screen-checks.mjs (SV-* ids); the schemas and binding-sources.json under scripts/surfaces/_schema/; scripts/analysis/mcbylaws/gate.mjs (.husky/pre-commit:19, .husky/pre-push:41); E10; open known breaks (section 4); and E6 3B as a pointer only. When a 136 line is cut short, read its Spec 135 row. scripts/ast-grep-rules/bylaw-literal.yml and scripts/analysis/mcbylaws/literal-scan.mjs are scoped to by-law files and are not a check of fe.47.
- **Status rule:**
  - **enforced:** RULED, the path is tracked and run (see Wired below), no open known break, and no scope gap. A scope gap is rule text that names more than the check's stated scope: the row quotes the rule words and the check's own words (its header or its Lock cell) side by side. A check that walks a list of directories is not "partly" for that reason alone; it is partly only when the rule names a path or case the walk does not reach.
  - **partly:** RULED with an open known break or a quoted scope gap; or RULED whose only check is report-only or unwired (E10); or OWED with the lock already tracked (fe.39 today).
  - **none:** OWED with the lock not tracked; or RULED with no path in the 136 Status line and none in the Spec 135 Lock cell (no such row today: fe.08's "see FE-16" is a lock).

### Group 2: engineering standards
- **Rule list:** each numbered subsection `grep -cE '^### [0-9]+\.[0-9]+'`, which gives 52, plus the 6 rows of the section 14 registry (00_engineering_standards.md:462-467). Total 58.
  - Section 11 (the 43 plan checklist items, :235-303) is left out because it restates sections 1-10 for plans (Q2).
  - The row is the subsection (Q3, ruled), not the bullet: outside section 11 the file has 149 `^- \*\*` bullets, 59 of them `**Rule**`, and a bullet-by-bullet comparison of all of them is not this look. A subsection is "partly" when the lane finds one bullet or scope that no wired check covers; the row quotes that one bullet as its "Why" (the first found, not a full list). The full bullet list of a subsection is task-441's first step when it takes that subsection.
- **Check source:** a file that fails when the rule is broken anywhere in its scope:
  - an ESLint or Biome rule (eslint.config.mjs, biome.json);
  - an ast-grep rule (scripts/ast-grep-rules/*.yml, scripts/hooks/ast-grep-leads.sh);
  - a hook (.husky/*, scripts/hooks/*);
  - a CI step (.github/workflows/*);
  - a src/tests test that asserts across the tree.

  A test of one function that obeys the rule is an instance, not a check. A descriptor JSON under scripts/surfaces/ that cites the file is not a check (about 40 of the 110 citing files). Candidates are found from the subsection's own text (e.g. §12.11 at :366-375 names its files) and from `git grep -n 00_engineering_standards $S -- src/tests scripts .husky .github eslint.config.mjs biome.json`, matched to `§N.M` on the hit line or in the file header. Many checks cite no spec, so the lane also searches this fixed inventory for every subsection: eslint.config.mjs and biome.json (biome runs through lint-staged on three directories only); .sqlfluff; scripts/hooks/validate-migrations.sh and scripts/hooks/check-migration-down-comments.sh (§3.1, §3.2; .husky/pre-commit:51-52); scripts/hooks/ast-grep-leads.sh, whose own rules are silent-catch-fallback, env-default-in-lib, comment-rot, silent-row-drop, pool-boundary, direct-advisory-lock, bare-mutation, multi-transaction, sql-now, loop-query, unbounded-push-in-stream and step-shape (the :255 summary line), with scripts/ast-grep-rules/*.yml; scripts/amnesty.json, which lists what those rules exempt and so narrows them; scripts/analysis/src-sql-ledger.mjs (§4.2); `npm run typecheck` (.husky/pre-commit:54; §8.2); scripts/hooks/check-spec-diff.mjs (§14 row 4); .github/workflows/test.yml, db-tests.yml, lighthouse.yml (§13.4) and mutation.yml with stryker.config.mjs (§12.13); and the src/tests files that cite a section (admin-route-guard.infra.test.ts, admin-mutation-audit.infra.test.ts, logger.logic.test.ts, api.infra.test.ts, enforcement.logic.test.ts). A check found outside this inventory is added to the row and named in the header. Match on the basename: enforcement.logic.test.ts:2 cites a wrong path, docs/specs/00-architecture/00_engineering_standards.md.
- **Wired:** a src/tests file runs in `npm run test` (pre-push and CI), except `*.db.test.ts`, which `npm test` leaves out (.husky/pre-commit:7-11). Lint runs at .husky/pre-commit:55. A db test counts as wired only where CI runs it: .github/workflows/db-tests.yml:90 runs `npm run test:db` on push to main, and on a pull request only when the change touches migrations/**, src/features/leads/lib/**, src/lib/db/**, src/tests/db/** or scripts/** (:9-17); .github/workflows/test.yml:67-68 excludes src/tests/db/**; and register-locks-resolve.infra.test.ts:7-8 says no workflow step names a surface test file. A db check whose path is in neither the filter nor a workflow step is "partly" and the row says "main only". A check nothing wires, or that only reports (E10), is "partly" at most and the row says "report-only".
- **Status rule:**
  - **enforced:** a wired check covers every bullet of the subsection that the lane compared, over the scope the bullet states (the first uncovered bullet the lane finds makes the row partly).
  - **partly:** a wired check covers some bullets or a narrower scope (example: §12.11 "Initially scoped to `src/features/leads/`", :367); or the only check is a db test that CI does not run on a pull request for the paths it guards (Wired, above); or the only check is report-only or unwired (E10).
  - **none:** no check.

### Group 3: front end to database
- **Rule list:** the rows of groups 1 and 2 that meet a fixed test, together with a seed list. The test is `grep -iE 'binding-sources|\.db\.test|database|column|producer|real writer'` on the 136 rule line, its Status line and the Spec 135 Lock cell for group 1, and the same words plus `SELECT|INSERT` on the subsection text for group 2. On the 136 rule and Status lines alone it gives fe.09, fe.18, fe.19, fe.22, fe.25, fe.26, fe.27, fe.39, fe.44 and fe.56. Group 3 is the union of the test hits and the seed; no row is dropped. The rows are listed again in group 3, not counted twice in the totals. The seed is the planner's reading of the same idea:
  - fe.05, fe.18, fe.19, fe.20, fe.21, fe.24, fe.25, fe.27, fe.30, fe.32, fe.37, fe.38, fe.39, fe.40, fe.41, fe.42, fe.44, fe.45, fe.52 (19 lines);
  - eng §4.4, §10.1, §10.2, §10.3 and the section 14 row at :462 (5 rows);
  - 24 in all.

  The lane runs the test on every group 1 and 2 row and records each row it adds to this seed, with a quote.
- **Check source, two columns:**
  - **Bound:** a file-only check proves that the displayed value's declared source resolves to a real field (E8; binding-sources.json; contract whitelist; schemas; the SV-* arms of surface-validate.mjs; report-tree.schema.json and report-page.schema.json).
  - **Available:** a check against data proves the field is served and populated on a real lot: a tracked `*.db.test.ts` (144 tracked), the McTest layers (fe.40, src/tests/mctest/catalogue.infra.test.ts), or a proof-slice row that is not `notbuilt` (E7).
- **Status rule:** enforced when both are present, partly when one is, none when neither is. A rule's group 3 status may differ from its group 1 status, and that difference is the point of the group. An Available mark that rests on a db test CI runs only on push to main (Wired, group 2) leaves the row "partly", with the words "main only".

### Row form (one table per group, docs/reports/reviews/task-440/RULE-CHECKS.md)
`| Rank | Rule id | Rule (file:line, quote of 20 words or fewer) | Check that exists (file:line, or none) | Kind (test/lint/hook/CI/schema) | Bound | Available | Status | Why partly or none (file:line) | Known break (id, record file:line, open or fixed since file:line) | Feeds |`
Bound and Available are filled for group 3 only.

### Worked examples from the repo (the lane confirms each at the pin)
- **G1:** `| - | fe.36 | 136:139 "a control that moves the user uses the platform router" | src/tests/surfaces/nav-by-route.logic.test.ts (136:140) | test | | | enforced | | D7 F-229 HIGH, BL-COMPLY GROUNDER.md:84-86: fixed since b01c90e60 (ReportPage.tsx:252 is now a Link element; nav-by-route.logic.test.ts:42 walks src/components/report) | task-367 |`
- **G1, Lock cell:** `| - | fe.08 | 136:55 "Doc set: specs in docs/specs/02-web-admin" | src/tests/surfaces/spec-paths.infra.test.ts (Spec 135 FE-08 at 135:30 "Lock: see FE-16.", FE-16 at 135:38) | test | | | enforced | | - | - |`
- **G1, partly:** `| ? | fe.39 | 136:148 "Engine inputs bind (EI-D2..EI-D8)" | src/tests/surfaces/engine-inputs-bind.logic.test.ts | test | | | partly | OWED with the lock tracked (register-locks-resolve.infra.test.ts:30 FLIP_PENDING) | C5 F-1061 is a CONFLICT (BL-COMPLY3 GROUNDER-2.md:42), not a break | task-367 |`
- **G2:** `| - | §12.12 | 00_engineering_standards.md:379 "MUST have at least one `fast-check` property test" | none: src/tests/property/*.property.test.ts are instances (report-sqft-rounding.property.test.ts:1-3), nothing fails when a new conversion has none | | | | none | | D6 F-188 HIGH, GROUNDER.md:80-82: fixed since report-sqft-rounding.property.test.ts:3 ("D6 of the BL-GROUND verdicts", task-372) | task-441 |`
- **G2, narrower scope:** `| ? | §14 row 3 | 00_engineering_standards.md:464 "privileged mutation + its audit row" | scripts/hooks/ast-grep-leads.sh:146-160 (bare-mutation) and src/tests/api.infra.test.ts:1049 (an admin_audit_log row per mutating export) | lint, test | | | partly | the rule extends to API routes; the lint reads `find scripts -maxdepth 1 -name '*.js'` only and the test does not assert one transaction | - | task-441 |`
- **G3:** `| ? | fe.18 | 136:85 "every displayed field binds to a source in the closed set" | report-binding.logic.test.ts (136:86) | test | yes (closed set, binding-sources.json; "No DB, no network" :8) | none (fe.25 lock answer-key-e2e.db.test.ts OWED 136:106-107; proof-slices.json:17 notbuilt) | | partly | available side unchecked | - | task-442 |`

## 4. Risk rank (within each group; enforced rows get "-")

1. **An open known break first, worst severity first (CRIT, HIGH, MED, LOW).** A known break is a CONFIRMED verdict by a separate grounder, on product code (src/ outside src/tests, or mobile/) or on spec or descriptor text (D3), whose own cited rule is a row of the group. A CONFIRMED verdict whose cited rule is a row of no group goes under "Outside the three groups", whatever it concerns. It comes from two sources:
   - **K1:** BL-COMPLY GROUNDER.md section D, :44-106 (D1-D12), and BL-COMPLY3 GROUNDER-2.md section D (D13, D14 and the new members of D3; BL-GROUND/GROUNDER-2.md is the same file). C1-C5 are conflicts, not breaks: a conflict is noted in the row of the rule it touches and is not ranked.
   - **K2:** `find docs/reports/lanes docs/reports/reviews -name 'GROUNDER*.md' -print0 | xargs -0 grep -HE '^\S+ CONFIRMED (src|mobile)/' | grep -v ' CONFIRMED src/tests/'`. Today this gives 3 lines, all docs/reports/lanes/2026-11-20/BL-RULESACC/GROUNDER.md, on mobile/src/lib/maxbldHelp.ts:18-19, citing Specs 126 and 128.

   "Fixed since" means a later commit or test cites the finding id, or the cited code line reads fixed at the pin. Examples: D6 above; D7 (ReportPage.tsx:252 is a Link element, commit b01c90e60); D8 (commit 49fb1bd92); D2 (format.ts holds no 10.7639); D9 (project.ts:79 reads `pinnedWindow` from the seed); the 60 s wait of D14 (semiQuestion.ts:18 reads `sliceNumber` from the slice config; its stale-time literal is unread: UNVERIFIED). A fixed-since row ranks by key 2. The "Outside the three groups" list is stated by rule, unranked: every CONFIRMED D whose cited rule is not a row of a group, namely D1 (doc-16 P3), D4, D5 and D12 (Spec 99), D9 and D10 (Spec 132 core.8), D11 (Spec 08 section 7) and D13 (Spec 126 0b item 7), and the K2 lines unless a handbook line states their rule. D3 is ranked on section 14 row 4 (now :465; its old cite :463 is stale) and D14 on fe.47.
2. Status none before partly.
3. Named as a gap by an earlier record: the REPORT-429 3A order, then "with none" in E4.
4. Source order (line number).

## 5. Size and split

About 57-58 group 1 rows, 58 group 2 rows (one per subsection or registry row, each compared with the fixed inventory) and about 24-45 group 3 rows listed again: about 140 to 160 rows, no runs. One lane. The work order is group 2 first (the only group with no earlier reading, and task-441's input), then group 1, then group 3 (derived from the other two). If the lane's context runs short it lands the finished groups in the same file, marks the unfinished group "not done" in the operator table, and says so in its close-out; that group is then a follow-up note, not a second plan. One commit at the end either way.

## 6. Method (lane steps)

1. Pin S. Write the header with S and each counting command and its output.
2. Fill group 2, then group 1, then group 3 by section 3 (section 5).
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
- No `FE-nn` token in the message, because the McBylaws commit-msg arm refuses OWED ids (task-446 plan :223). Name lines as fe.NN. No body line starts with HIGH or CRITICAL (check-lesson-routing.sh:24 then demands a Lesson-routing trailer).
- No hook is bypassed. A docs-only commit is exempt from G3 and CHK.1 (137:23; check-task-files.mjs:10-11).
- Any operator ruling on the look enters as a verbatim dated note (137:125) and a decision row.

**Close (check-lane-close.mjs, which runs on a move to BUILT, DONE or MERGED, :736-748):**
- **(a) No `@lane-` assignee:** a record task with no lane assignee and no code staged is exempt (:468-473, :815).
- **(b) Taken through backlog-lane.mjs** (record-only, compliance only: backlog-lane.mjs:190; no launch plan gate for a record task, check-lane-close.mjs:616). The close then needs:
  - a committed docs/reports/reviews/task-440/context-rN.md (:481);
  - docs/reports/lanes/<date>/<lane>/ holding TASK = task-440 (:504);
  - one compliance output per resolved list, `plan-` or `out-`, each with its `in-` input and REVIEW header (:518-522), or the joined form;
  - GROUNDER.md, only when a lens output holds a finding (header :32);
  - every changed path outside docs/reports and backlog covered by Files (:494-496; none here).
  - REPORT and GROUNDER references are required of build tasks only (:508).
- **Recommendation:** (b), so the lane report is in the repo. Q5 is ruled: `resolveTask`, run in memory with this Files line, type record and group S, gives four lists (five-words, plan-protocol, inc-S, ms-S), all the compliance seat's. One stage is enough (check-lane-close.mjs:518 accepts a list at plan or out, and the chunk check at :418 is skipped because no non-exempt path changes) and one joined set is enough: out-compliance-rules.txt with its input in-out-compliance-rules.txt (rule-lists.mjs:110, JOINED_ID = 'rules'), never both forms (:441).
- **DoD:** items #2-#4 (tests) are marked "not applicable: record task, no test (section 2)".

## 9. Acceptance (each checkable)

1. The RULE-CHECKS.md header names S and the commands. The group 1 row count equals `grep -c '^- \*\*fe\.'` at S. RULED and OWED totals equal the `grep -c 'Status: RULED'` and `grep -c 'Status: OWED'` counts. Group 2 has 52 + 6 = 58 rows. Group 3 is the union of the test hits and the 24 seed rows, each row the test adds recorded with a quote.
2. In each group, enforced + partly + none = rows.
3. Every check cell other than "none" is a path tracked at S, with a line.
4. Each of D1-D14 (D3 with its new members) and each K2 line appears once, on a row or under "Outside", marked open or fixed since file:line.
5. Each group's ranked rows sort by the four keys of section 4.
6. The operator table has 3 rows and the columns of section 6 step 5.
7. GROUNDER-LOOK.md exists, written by a separate agent, covering section 7 in full. Every WRONG verdict is corrected in RULE-CHECKS.md.
8. `git diff --name-only <launch>..HEAD` shows only the Files paths, the task file and the lane or review records. Nothing under src/, scripts/, mobile/, migrations/ or docs/specs/ changes.
9. Task DONE in the landing commit, through the real hooks.

## 10. Order against open tasks

- **task-446 (planned)** changes what group 1 reads. It adds fe.58 (R-22) as OWED, so the counts become 58 lines and 22 OWED. Its plan drops R-03 and R-04 as already stated by fe.49 and fe.52 (task-446 :43-52, 136:178-188). By the stated order (MORNING-DECISIONS.md:1983, RR-0395 :1994), 446 lands before 439 and so before 440. If it is not on the board at S, the look counts 57 and 21 and adds one unranked "pending: Spec 128 R-22 (128:224), line via task-446" row.
- **task-445 (running)** changes nothing the look reads. It changes lensSet security for code tasks only (task-445 :90; rule-lists.mjs:183-191, `code &&`), and a record task is not a code task.
- **task-439 (planned)** changes nothing the look reads. It edits the rule-lists.json rows only (task-439 :30), not handbook lines or checks.
- **task-367 (RUNNING, @lane-BL-GATES):** the look does not read its branch (section 0). Its card's "8 OWED" (task-367 description (d)) is now 21 or 22. The look's group 1 table replaces that list. Order: tasks 367, 441 and 442 carry `dependencies: []` and backlog-lane.mjs reads no dependency, so a card edit would hold nothing; the order stays by hand, the orchestrator launching 440 first (the orchestrator's reading, MORNING-DECISIONS.md:1983; RR-0392, no new infrastructure), and this plan edits none of the three cards.

## 11. Questions for the grounder (ruled in docs/reports/reviews/task-440/QUESTIONS-RULED.md: Q1 the planner's reading, Q2 left out, Q3 the subsection, Q4 Opus, Q5 section 8, Q6 a grounded verdict only)

- **Q1.** "the interface between the front end and the database" (:1910). Planner's reading: group 1 and 2 rules seen as bound and available. Other reading: also rules of Specs 99, 100, 126 and 128 that have no handbook line (e.g. D5, Spec 99 B1). Which one applies?
- **Q2.** Should the section 11 plan checklist (43 items) be left out of group 2?
- **Q3.** Group 2 unit: subsection (planner) or each "Rule:" bullet?
- **Q4.** The card says "Every build task of this plan ... built by Opus". Does that cover this record lane? Planner: yes, Opus.
- **Q5.** For a record close with exempt-only Files, which stage of compliance output and what `in-` material does check-lane-close require (:445-456, :517-522)?
- **Q6.** Is a "known break" only a grounder CONFIRMED verdict (planner), or also an ungrounded REPORT-429 item?

## 12. UNVERIFIED

- Open or fixed for D3, D4, D5, D10, D11, D12, D13 and the stale-time part of D14 (D2, D6, D7, D8, D9 and the 60 s wait of D14 read as fixed in section 4).
- Whether the PR filter of db-tests.yml (:9-17) still reads as in section 3 at the pin.
- The launch's own print of the resolved list set (four lists, section 8, read in memory only).
- Whether Spec 136 is stale at the pin (the RULESACC grounder saw `generate-surface-handbook.mjs --check` report it stale at its head; the look does not run it).
- The seed list of group 3 against the test; the fixed test of section 3 decides.

## 13. GUESS estimate

One Opus lane, about 4-6 hours of reading (GUESS; group 2 is a comparison against a fixed inventory). Grounder about 1-2 hours.

Plan review round 1: 19 folded, 0 task, 0 ruling, 0 wontfix, 3 pile; grounder docs/reports/reviews/task-440/GROUNDER-PLAN.md; triage docs/reports/reviews/task-440/TRIAGE-PLAN.md
rc#1 HIGH folded its Spec 135 Lock ce
rc#2 HIGH folded nav-by-route.logic.t
rc#3 HIGH folded BL-COMPLY3 GROUNDER-
rc#4 MED folded The row is the subse
rc#6 MED folded Group 3 is the union
in#2 MED folded the order stays by h
in#3 MED folded are not handbook rul
rg#1 HIGH folded E10 | Report-only ga
rg#2 HIGH folded the lane also search
rg#3 MED folded extends to API route
rg#4 MED folded counts as wired only
rg#5 MED folded scripts/analysis/mcb
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-23 taken on the board at lane launch (lane BL-LOOK440, worktree /Users/brettpreston_macmini/Buildo-wt-look440, branch wf1/inc1b-look440), RR-0240

2026-11-23 lane BL-LOOK440 (Opus): RULE-CHECKS.md written at pin S=ba4ac48fd (the launch head): group 2 (58 rows: 7 enforced, 22 partly, 29 none), group 1 (57 rows: 33 enforced, 4 partly, 20 none; fe.58 pending via task-446), group 3 (47 rows listed again: 0 enforced, 17 partly, 30 none). One open known break ranked (fe.54, K2 BL-RULESACC GROUNDER.md:136); D2, D3, D6, D7, D8, D14 read fixed; D1 and D10 open under Outside. Read-only: no code, test, tool or rule change. Task stays RUNNING: compliance lens next, then the separate grounder (GROUNDER-LOOK.md, RR-0359).

2026-11-23 lane BL-LOOK440: compliance lens run once per rule list (five-words, plan-protocol, inc-S, ms-S) on fresh context context-r2.md; 20 findings listed untriaged in docs/reports/lanes/2026-11-23/BL-LOOK440/FINDINGS.md. Lens material: the brief's diff command excludes docs/reports/reviews/** and so prints nothing for the two Files paths; the material is the same diff without those excludes (stated in REPORT.md). Task left RUNNING: grounder owed (GROUNDER.md for the lens findings, GROUNDER-LOOK.md for the look), RR-0359.

2026-11-23 landing (lane BL-LOOK440). Acceptance 7: GROUNDER-LOOK.md by the separate grounder Cairn-Ground-O440 copied unchanged (cmp of the grounder's file and docs/reports/reviews/task-440/GROUNDER-LOOK.md: no difference; same for GROUNDER.md and TRIAGE.md in docs/reports/lanes/2026-11-23/BL-LOOK440/); its 5 WRONG rows corrected in 7a60cc538 and the re-check items in 1e332d979, passed by the grounder at 1e332d979. Acceptance 8: git diff --name-only ba4ac48fd..HEAD lists only docs/reports/reviews/task-440/ (RULE-CHECKS.md, context-r1.md, context-r2.md), docs/reports/lanes/2026-11-23/BL-LOOK440/ records and the task file; nothing under src/, scripts/, mobile/, migrations/ or docs/specs/. Acceptance 9: DONE in the landing commit through the real hooks. check-lane-close.mjs --outcomes docs/reports/lanes/2026-11-23/BL-LOOK440: checked 7 ids.

2026-11-23 dated note (M-246, prior text kept): operator ruling RR-0399 (decision-184, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2017), operator, verbatim: "mark partly", on the grounder's fe.36 observation (GROUNDER-LOOK.md section 3). RULE-CHECKS.md: fe.36 group 1 enforced to partly (five named exceptions still owed, nav-by-route.logic.test.ts:300-311, MF-49 and MF-50); group 1 now 29 enforced, 8 partly, 20 none. Status stays DONE.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Read-only look (record task, RR-0385 item 6): docs/reports/reviews/task-440/RULE-CHECKS.md lists at pin ba4ac48fd every rule in three groups with the existing machine check (file:line) or none, status and risk rank. Group 1 McFrontend handbook 57 rows: 30 enforced, 7 partly, 20 none (fe.58 pending via task-446); group 2 engineering standards 58 rows: 7 enforced, 22 partly, 29 none; group 3 front end to database 47 rows listed again: 0 enforced, 18 partly, 29 none. Open known break ranked: fe.54 (failed Help open only logged, maxbldHelp.ts:19); open outside the groups: D1 (CRITICAL), D10 (HIGH), two K2 Help lines. Feeds task-367 (group 1), task-441 (group 2), task-442 (group 3). Compliance lens once per rule list (20 findings: 7 CONFIRMED and fixed or piled, 13 REJECTED); separate grounder Cairn-Ground-O440 checked the look (GROUNDER-LOOK.md), 5 WRONG rows corrected. DoD #2-#4 not applicable: record task, no test (plan section 2). No code, test, tool or rule change.
<!-- SECTION:FINAL_SUMMARY:END -->
