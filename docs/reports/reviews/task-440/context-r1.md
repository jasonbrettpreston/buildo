# Review context for task-440 (no plan id) written 2026-11-23 by backlog-brief.mjs (round 1)

## Task
task-440 FINAL.5 Read-only look: the rules with no test, in three groups (handbook rules, engineering standards, front end to database), ranked by risk
status: RUNNING · milestone: m-1 · assignee: @lane-BL-LOOK440 · labels: McFix, McFix Final

## Description
Card opened 2026-11-22 by the orchestrator, Spec 137 rule 2, on the operator's ruling RR-0385 (MORNING-DECISIONS.md:1915 entry, RR-0385, decision-170). Operator, verbatim: "We just want to focus on getting the right tests that mirror the engineering and compliance."; "This is the focus for both compliance and engineering standards and interface between the frontend and databse"; "I feel much more confident if you focus on getting the tests right". THIS TASK: a read-only look that lists every rule with no machine check in the three groups, what already exists, and a risk rank with known breaks first; a grounder checks the list; the operator sees it. No code. Scope and Files line at its plan review. Every build task of this plan follows the six steps, plan written and built on Opus (his words: "I want this plan for each task and built by opus").

Files: docs/reports/reviews/task-440/RULE-CHECKS.md, docs/reports/reviews/task-440/GROUNDER-LOOK.md

## Acceptance criteria

## Implementation Plan
#### PLAN-440-v1

Task-440 FINAL.5, type record (task-440 card, Status LATER). Plan seat: Opus (RR-0385 item 1, MORNING-DECISIONS.md:1917). Board read at eb7aad381 (wf2/board); the three seats and the grounder re-read at 77d54ecc7 (docs/specs/02-web-admin and docs/specs/00_engineering_standards.md are unchanged between the two). Plan protocol: plan-protocol.md has no section list for one task. Its note at :3 sends a lane task to the Spec 08 section 7 lens set, so this plan uses the section form of the recent plans (PLAN-446-v1, task-446 file :44-276).

#### 0. What already exists (the look reads these; it does not count again)

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

#### 1. Scope

The look reads the board at one pinned sha. It lists every rule in three groups and, for each rule, which machine check already exists (file:line) or that none exists. It then ranks the rules with no check, or only part of one, by risk, open known breaks first. The three groups are:
1. the McFrontend handbook lines (Spec 136 section 2);
2. the engineering standards (docs/specs/00_engineering_standards.md);
3. the interface between the front end and the database.

A separate grounder checks the list, and the operator is shown one short table. The output feeds task-367 (group 1, its item (d), the OWED handbook locks; RR-0386 restarts them as handbook rule tests), task-441 (group 2) and task-442 (group 3). Group 3 is rule level: it says which rules lack a Bound or an Available check, and the number-level inventory of the screens is task-442's own first step. Items (a) to (c) of task-367's card (compute reach, numbers in mobile code, the Spec 90 section 5 never-do list) are not handbook rules and are outside the look; their report-only gates are already on the board (E10). The rulings behind it:
- RR-0385 item 6 (MORNING-DECISIONS.md:1922), operator verbatim: "We just want to focus on getting the right tests that mirror the engineering and compliance." (:1909) and "This is the focus for both compliance and engineering standards and interface between the frontend and databse" (:1910).
- Principles served: accurate, observable, understandable.

#### 2. NOT in scope

- No code, no test, no new tool, gate, script, field or rule list.
- No change to rule-lists.json.
- No new handbook line or rule. RR-0392 (:1976): "no other infrastructure is needed beyond this".
- No fix of a break that is found.
- No ruling on a conflict between two rules. A conflict is noted in its row, e.g. eng §12.3/§12.5/§12.7 against fe.46 (REPORT-429:7 item 7).
- No DB query, no test run. Whether a check runs is read from hooks, CI and package.json, never executed.

#### 3. The three groups: rule source, check source, status rule

Pin first: `S=$(git rev-parse wf2/board)`. The pin also fixes the hook text (.husky/pre-commit, .husky/pre-push), which task-424 changes later. Every read is `git show $S:<path>`, and every "tracked" test is `git ls-tree -r --name-only $S | grep -Fx <path>`.

#### Group 1: McFrontend handbook rules
- **Rule list:** each line matching `^- \*\*fe\.` in 136 section 2 (136:32-203). The Status line is the line after it. Count: `git show $S:docs/specs/02-web-admin/136_mcfrontend_handbook.md | grep -c '^- \*\*fe\.'` gives 57 today, or 58 once task-446 lands.
- **Check source:** the Spec 135 row's Lock cell first, including `see FE-nn` followed to that row (FE-08 at 135:30 points to FE-16 at 135:38), because a Lock cell can name several paths (FE-13 at 135:35, FE-18 at 135:40, FE-31 at 135:53); then the `Enforced by:` or `lock owed:` path on the 136 Status line; their tracked state (E1); each check file's own header; the arms of scripts/surfaces/surface-validate.mjs with report-checks.mjs and screen-checks.mjs (SV-* ids); the schemas and binding-sources.json under scripts/surfaces/_schema/; scripts/analysis/mcbylaws/gate.mjs (.husky/pre-commit:19, .husky/pre-push:41); E10; open known breaks (section 4); and E6 3B as a pointer only. When a 136 line is cut short, read its Spec 135 row. scripts/ast-grep-rules/bylaw-literal.yml and scripts/analysis/mcbylaws/literal-scan.mjs are scoped to by-law files and are not a check of fe.47.
- **Status rule:**
  - **enforced:** RULED, the path is tracked and run (see Wired below), no open known break, and no scope gap. A scope gap is rule text that names more than the check's stated scope: the row quotes the rule words and the check's own words (its header or its Lock cell) side by side. A check that walks a list of directories is not "partly" for that reason alone; it is partly only when the rule names a path or case the walk does not reach.
  - **partly:** RULED with an open known break or a quoted scope gap; or RULED whose only check is report-only or unwired (E10); or OWED with the lock already tracked (fe.39 today).
  - **none:** OWED with the lock not tracked; or RULED with no path in the 136 Status line and none in the Spec 135 Lock cell (no such row today: fe.08's "see FE-16" is a lock).

#### Group 2: engineering standards
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

#### Group 3: front end to database
- **Rule list:** the rows of groups 1 and 2 that meet a fixed test, together with a seed list. The test is `grep -iE 'binding-sources|\.db\.test|database|column|producer|real writer'` on the 136 rule line, its Status line and the Spec 135 Lock cell for group 1, and the same words plus `SELECT|INSERT` on the subsection text for group 2. On the 136 rule and Status lines alone it gives fe.09, fe.18, fe.19, fe.22, fe.25, fe.26, fe.27, fe.39, fe.44 and fe.56. Group 3 is the union of the test hits and the seed; no row is dropped. The rows are listed again in group 3, not counted twice in the totals. The seed is the planner's reading of the same idea:
  - fe.05, fe.18, fe.19, fe.20, fe.21, fe.24, fe.25, fe.27, fe.30, fe.32, fe.37, fe.38, fe.39, fe.40, fe.41, fe.42, fe.44, fe.45, fe.52 (19 lines);
  - eng §4.4, §10.1, §10.2, §10.3 and the section 14 row at :462 (5 rows);
  - 24 in all.

  The lane runs the test on every group 1 and 2 row and records each row it adds to this seed, with a quote.
- **Check source, two columns:**
  - **Bound:** a file-only check proves that the displayed value's declared source resolves to a real field (E8; binding-sources.json; contract whitelist; schemas; the SV-* arms of surface-validate.mjs; report-tree.schema.json and report-page.schema.json).
  - **Available:** a check against data proves the field is served and populated on a real lot: a tracked `*.db.test.ts` (144 tracked), the McTest layers (fe.40, src/tests/mctest/catalogue.infra.test.ts), or a proof-slice row that is not `notbuilt` (E7).
- **Status rule:** enforced when both are present, partly when one is, none when neither is. A rule's group 3 status may differ from its group 1 status, and that difference is the point of the group. An Available mark that rests on a db test CI runs only on push to main (Wired, group 2) leaves the row "partly", with the words "main only".

#### Row form (one table per group, docs/reports/reviews/task-440/RULE-CHECKS.md)
`| Rank | Rule id | Rule (file:line, quote of 20 words or fewer) | Check that exists (file:line, or none) | Kind (test/lint/hook/CI/schema) | Bound | Available | Status | Why partly or none (file:line) | Known break (id, record file:line, open or fixed since file:line) | Feeds |`
Bound and Available are filled for group 3 only.

#### Worked examples from the repo (the lane confirms each at the pin)
- **G1:** `| - | fe.36 | 136:139 "a control that moves the user uses the platform router" | src/tests/surfaces/nav-by-route.logic.test.ts (136:140) | test | | | enforced | | D7 F-229 HIGH, BL-COMPLY GROUNDER.md:84-86: fixed since b01c90e60 (ReportPage.tsx:252 is now a Link element; nav-by-route.logic.test.ts:42 walks src/components/report) | task-367 |`
- **G1, Lock cell:** `| - | fe.08 | 136:55 "Doc set: specs in docs/specs/02-web-admin" | src/tests/surfaces/spec-paths.infra.test.ts (Spec 135 FE-08 at 135:30 "Lock: see FE-16.", FE-16 at 135:38) | test | | | enforced | | - | - |`
- **G1, partly:** `| ? | fe.39 | 136:148 "Engine inputs bind (EI-D2..EI-D8)" | src/tests/surfaces/engine-inputs-bind.logic.test.ts | test | | | partly | OWED with the lock tracked (register-locks-resolve.infra.test.ts:30 FLIP_PENDING) | C5 F-1061 is a CONFLICT (BL-COMPLY3 GROUNDER-2.md:42), not a break | task-367 |`
- **G2:** `| - | §12.12 | 00_engineering_standards.md:379 "MUST have at least one `fast-check` property test" | none: src/tests/property/*.property.test.ts are instances (report-sqft-rounding.property.test.ts:1-3), nothing fails when a new conversion has none | | | | none | | D6 F-188 HIGH, GROUNDER.md:80-82: fixed since report-sqft-rounding.property.test.ts:3 ("D6 of the BL-GROUND verdicts", task-372) | task-441 |`
- **G2, narrower scope:** `| ? | §14 row 3 | 00_engineering_standards.md:464 "privileged mutation + its audit row" | scripts/hooks/ast-grep-leads.sh:146-160 (bare-mutation) and src/tests/api.infra.test.ts:1049 (an admin_audit_log row per mutating export) | lint, test | | | partly | the rule extends to API routes; the lint reads `find scripts -maxdepth 1 -name '*.js'` only and the test does not assert one transaction | - | task-441 |`
- **G3:** `| ? | fe.18 | 136:85 "every displayed field binds to a source in the closed set" | report-binding.logic.test.ts (136:86) | test | yes (closed set, binding-sources.json; "No DB, no network" :8) | none (fe.25 lock answer-key-e2e.db.test.ts OWED 136:106-107; proof-slices.json:17 notbuilt) | | partly | available side unchecked | - | task-442 |`

#### 4. Risk rank (within each group; enforced rows get "-")

1. **An open known break first, worst severity first (CRIT, HIGH, MED, LOW).** A known break is a CONFIRMED verdict by a separate grounder, on product code (src/ outside src/tests, or mobile/) or on spec or descriptor text (D3), whose own cited rule is a row of the group. A CONFIRMED verdict whose cited rule is a row of no group goes under "Outside the three groups", whatever it concerns. It comes from two sources:
   - **K1:** BL-COMPLY GROUNDER.md section D, :44-106 (D1-D12), and BL-COMPLY3 GROUNDER-2.md section D (D13, D14 and the new members of D3; BL-GROUND/GROUNDER-2.md is the same file). C1-C5 are conflicts, not breaks: a conflict is noted in the row of the rule it touches and is not ranked.
   - **K2:** `find docs/reports/lanes docs/reports/reviews -name 'GROUNDER*.md' -print0 | xargs -0 grep -HE '^\S+ CONFIRMED (src|mobile)/' | grep -v ' CONFIRMED src/tests/'`. Today this gives 3 lines, all docs/reports/lanes/2026-11-20/BL-RULESACC/GROUNDER.md, on mobile/src/lib/maxbldHelp.ts:18-19, citing Specs 126 and 128.

   "Fixed since" means a later commit or test cites the finding id, or the cited code line reads fixed at the pin. Examples: D6 above; D7 (ReportPage.tsx:252 is a Link element, commit b01c90e60); D8 (commit 49fb1bd92); D2 (format.ts holds no 10.7639); D9 (project.ts:79 reads `pinnedWindow` from the seed); the 60 s wait of D14 (semiQuestion.ts:18 reads `sliceNumber` from the slice config; its stale-time literal is unread: UNVERIFIED). A fixed-since row ranks by key 2. The "Outside the three groups" list is stated by rule, unranked: every CONFIRMED D whose cited rule is not a row of a group, namely D1 (doc-16 P3), D4, D5 and D12 (Spec 99), D9 and D10 (Spec 132 core.8), D11 (Spec 08 section 7) and D13 (Spec 126 0b item 7), and the K2 lines unless a handbook line states their rule. D3 is ranked on section 14 row 4 (now :465; its old cite :463 is stale) and D14 on fe.47.
2. Status none before partly.
3. Named as a gap by an earlier record: the REPORT-429 3A order, then "with none" in E4.
4. Source order (line number).

#### 5. Size and split

About 57-58 group 1 rows, 58 group 2 rows (one per subsection or registry row, each compared with the fixed inventory) and about 24-45 group 3 rows listed again: about 140 to 160 rows, no runs. One lane. The work order is group 2 first (the only group with no earlier reading, and task-441's input), then group 1, then group 3 (derived from the other two). If the lane's context runs short it lands the finished groups in the same file, marks the unfinished group "not done" in the operator table, and says so in its close-out; that group is then a follow-up note, not a second plan. One commit at the end either way.

#### 6. Method (lane steps)

1. Pin S. Write the header with S and each counting command and its output.
2. Fill group 2, then group 1, then group 3 by section 3 (section 5).
3. Map K1 and K2 to rows (section 4). Check "fixed since" with `git grep -n -e 'D<n> of the BL-GROUND' -e 'F-<nnn>' $S -- src mobile scripts` and by reading the cited code line.
4. Rank. Write "Outside the three groups" and an UNVERIFIED list.
5. Write section 1 "For the operator", one table: `| Group | Rules | Enforced | Partly | None | Open known breaks | Top three to test (ids) |`, with three rows.
6. Hand to the grounder (section 7).
7. Correct every WRONG verdict, then land (section 8).

#### 7. Grounder

A separate grounder on Sonnet (RR-0385 item 1, :1917), not the lane. It writes docs/reports/reviews/task-440/GROUNDER-LOOK.md with one verdict per checked row (CONFIRMED or WRONG, with file:line).
- **Checked whole:** every count and every mechanical cell of group 1 (it re-runs the commands); every row marked enforced in groups 2 and 3; every known-break row and the "Outside" list.
- **Checked by sample:** 10 none or partly rows per group, named in the file. A false "enforced" silently takes a rule off task-441, task-442 or task-367. A false "none" costs at most one test that the build task's red-first step exposes.

#### 8. Files, landing, close

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

#### 9. Acceptance (each checkable)

1. The RULE-CHECKS.md header names S and the commands. The group 1 row count equals `grep -c '^- \*\*fe\.'` at S. RULED and OWED totals equal the `grep -c 'Status: RULED'` and `grep -c 'Status: OWED'` counts. Group 2 has 52 + 6 = 58 rows. Group 3 is the union of the test hits and the 24 seed rows, each row the test adds recorded with a quote.
2. In each group, enforced + partly + none = rows.
3. Every check cell other than "none" is a path tracked at S, with a line.
4. Each of D1-D14 (D3 with its new members) and each K2 line appears once, on a row or under "Outside", marked open or fixed since file:line.
5. Each group's ranked rows sort by the four keys of section 4.
6. The operator table has 3 rows and the columns of section 6 step 5.
7. GROUNDER-LOOK.md exists, written by a separate agent, covering section 7 in full. Every WRONG verdict is corrected in RULE-CHECKS.md.
8. `git diff --name-only <launch>..HEAD` shows only the Files paths, the task file and the lane or review records. Nothing under src/, scripts/, mobile/, migrations/ or docs/specs/ changes.
9. Task DONE in the landing commit, through the real hooks.

#### 10. Order against open tasks

- **task-446 (planned)** changes what group 1 reads. It adds fe.58 (R-22) as OWED, so the counts become 58 lines and 22 OWED. Its plan drops R-03 and R-04 as already stated by fe.49 and fe.52 (task-446 :43-52, 136:178-188). By the stated order (MORNING-DECISIONS.md:1983, RR-0395 :1994), 446 lands before 439 and so before 440. If it is not on the board at S, the look counts 57 and 21 and adds one unranked "pending: Spec 128 R-22 (128:224), line via task-446" row.
- **task-445 (running)** changes nothing the look reads. It changes lensSet security for code tasks only (task-445 :90; rule-lists.mjs:183-191, `code &&`), and a record task is not a code task.
- **task-439 (planned)** changes nothing the look reads. It edits the rule-lists.json rows only (task-439 :30), not handbook lines or checks.
- **task-367 (RUNNING, @lane-BL-GATES):** the look does not read its branch (section 0). Its card's "8 OWED" (task-367 description (d)) is now 21 or 22. The look's group 1 table replaces that list. Order: tasks 367, 441 and 442 carry `dependencies: []` and backlog-lane.mjs reads no dependency, so a card edit would hold nothing; the order stays by hand, the orchestrator launching 440 first (the orchestrator's reading, MORNING-DECISIONS.md:1983; RR-0392, no new infrastructure), and this plan edits none of the three cards.

#### 11. Questions for the grounder (ruled in docs/reports/reviews/task-440/QUESTIONS-RULED.md: Q1 the planner's reading, Q2 left out, Q3 the subsection, Q4 Opus, Q5 section 8, Q6 a grounded verdict only)

- **Q1.** "the interface between the front end and the database" (:1910). Planner's reading: group 1 and 2 rules seen as bound and available. Other reading: also rules of Specs 99, 100, 126 and 128 that have no handbook line (e.g. D5, Spec 99 B1). Which one applies?
- **Q2.** Should the section 11 plan checklist (43 items) be left out of group 2?
- **Q3.** Group 2 unit: subsection (planner) or each "Rule:" bullet?
- **Q4.** The card says "Every build task of this plan ... built by Opus". Does that cover this record lane? Planner: yes, Opus.
- **Q5.** For a record close with exempt-only Files, which stage of compliance output and what `in-` material does check-lane-close require (:445-456, :517-522)?
- **Q6.** Is a "known break" only a grounder CONFIRMED verdict (planner), or also an ungrounded REPORT-429 item?

#### 12. UNVERIFIED

- Open or fixed for D3, D4, D5, D10, D11, D12, D13 and the stale-time part of D14 (D2, D6, D7, D8, D9 and the 60 s wait of D14 read as fixed in section 4).
- Whether the PR filter of db-tests.yml (:9-17) still reads as in section 3 at the pin.
- The launch's own print of the resolved list set (four lists, section 8, read in memory only).
- Whether Spec 136 is stale at the pin (the RULESACC grounder saw `generate-surface-handbook.mjs --check` report it stale at its head; the look does not run it).
- The seed list of group 3 against the test; the fixed test of section 3 decides.

#### 13. GUESS estimate

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

## Implementation Notes
2026-11-23 taken on the board at lane launch (lane BL-LOOK440, worktree /Users/brettpreston_macmini/Buildo-wt-look440, branch wf1/inc1b-look440), RR-0240

## References
- docs/reports/reviews/task-440/GROUNDER-PLAN.md
- docs/reports/reviews/task-440/TRIAGE-PLAN.md
- docs/reports/reviews/task-440/seat-integration-1.md
- docs/reports/reviews/task-440/seat-reality-check-1.md
- docs/reports/reviews/task-440/seat-regression-1.md
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
- RR-0386 Task-367: gates parked, handbook tests start fresh; landing gates A and B is a later decision with its own card — "a" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1930)
- RR-0387 McFixReborn: each built task gets its own output review and confirmed findings are fixed by ordinary fix tasks; no new infrastructure; old findings dropped
- RR-0388 McFixReborn waits until the new tests are in place
- RR-0389 The model conflict is resolved by updating the key specs and docs themselves
- RR-0390 task-430 output review size: option A, one larger review message, tried once
- RR-0391 a card to widen the security lens; McFixReborn next once these close
- RR-0392 one push for all four; no other infrastructure beyond this — "Push for all 4. I  don't think we need any other infastrcuture beyond this.. we are good to go!" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975)
- RR-0393 McFixReborn next, continued after tasks 424 and 386
- RR-0394 security lens option A: API routes and library code
- RR-0141 Operator: Q-LT-1
- RR-0395 one small task adds the missing handbook lines before task-439 lands — "Agreed. Plan approved" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1993)
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
- RR-0386 Task-367: gates parked, handbook tests start fresh; landing gates A and B is a later decision with its own card (names RR-0386) — "a" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1930)
- RR-0392 one push for all four; no other infrastructure beyond this (names RR-0392) — "Push for all 4. I  don't think we need any other infastrcuture beyond this.. we are good to go!" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975)
- RR-0395 one small task adds the missing handbook lines before task-439 lands (names RR-0395) — "Agreed. Plan approved" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1993)

## Prior reviews and lane reports
### task-440 (this task)
- docs/reports/reviews/task-440/FOLD-CHECK.md
- docs/reports/reviews/task-440/GROUNDER-PLAN.md
- docs/reports/reviews/task-440/QUESTIONS-RULED.md
- docs/reports/reviews/task-440/TRIAGE-PLAN.md
- docs/reports/reviews/task-440/seat-integration-1.md
- docs/reports/reviews/task-440/seat-reality-check-1.md
- docs/reports/reviews/task-440/seat-regression-1.md

## Dependencies
- (none)
