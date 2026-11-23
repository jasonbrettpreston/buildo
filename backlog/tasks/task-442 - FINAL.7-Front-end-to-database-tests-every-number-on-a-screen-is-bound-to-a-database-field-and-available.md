---
id: TASK-442
title: >-
  FINAL.7 Front end to database tests: every number on a screen is bound to a
  database field and available
status: RUNNING
assignee:
  - '@lane-BL-FEDB442'
created_date: '2026-11-22T20:24:00Z'
updated_date: '2026-11-23T18:29:00Z'
labels:
  - McFix
  - McFix Final
milestone: m-1
dependencies: []
references:
  - docs/reports/reviews/task-442/GROUNDER-PLAN.md
  - docs/reports/reviews/task-442/TRIAGE-PLAN.md
  - docs/reports/reviews/task-442/seat-integration-1.md
  - docs/reports/reviews/task-442/seat-reality-check-1.md
  - docs/reports/reviews/task-442/seat-regression-1.md
  - compliance:eng-all docs/specs/00_engineering_standards.md
  - compliance:surface-136 docs/specs/02-web-admin/136_mcfrontend_handbook.md
  - compliance:queue-137 docs/specs/00-architecture/137_mcqueue.md
  - compliance:agents-s7-s11 docs/specs/00-architecture/08_agents.md
  - >-
    compliance:surface-128
    docs/specs/02-web-admin/128_surface_standard_policy.md
  - >-
    compliance:surface-126
    docs/specs/02-web-admin/126_maxbld_surface_standard.md
  - compliance:bylaw-133 docs/specs/01-pipeline/133_bylaw_handbook.md
  - compliance:agents-s5-1to3 docs/specs/00-architecture/08_agents.md
  - >-
    compliance:orchestrator-doc17 backlog/docs/doc-17 -
    Orchestrator-readings-not-rulings.md
  - compliance:five-words docs/specs/01-pipeline/132_step_standard_handbook.md
  - compliance:plan-protocol docs/specs/00-architecture/plan-protocol.md
  - compliance:inc-S backlog/docs/increments/doc-2 - Increment-S-requirements.md
  - compliance:ms-S backlog/milestones/m-1 - increment-1·b-search-[s].md
type: build
ordinal: 142012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-22 by the orchestrator, Spec 137 rule 2, on the operator's ruling RR-0385 (MORNING-DECISIONS.md:1915 entry, RR-0385, decision-170). Operator, verbatim: "This is the focus for both compliance and engineering standards and interface between the frontend and databse". THIS TASK: tests of the interface between the front end and the database as ranked by FINAL.5 (what exists is reused first); each test is proven red on a planted defect before it counts. Scope and Files line at its plan review. Every build task of this plan follows the six steps, plan written and built on Opus (his words: "I want this plan for each task and built by opus").

Files: src/tests/admin-report-preview-live.logic.test.ts, src/tests/customer-report-read.logic.test.ts, scripts/surfaces/_schema/report-v2-seed/page-text.json, scripts/surfaces/_schema/report-presentation.json, scripts/surfaces/_schema/report-v2.decl.json, scripts/surfaces/parcel_product/F06/surfaces/web_landing.sample.json, src/tests/fixtures/report-page/, src/tests/fixtures/surfaces/report/, src/tests/surfaces/report-honest-k2.logic.test.ts, .cursor/MCFRONTEND-QUEUE.md, docs/reports/panels/, scripts/analysis/bylaw-validation/coa-expected/prereg-MF-97-1.json
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
# PLAN-442-v1

Task: task-442 (FINAL.7, build). Plan seat: Opus, read-only (RR-0385 item 1, MORNING-DECISIONS.md:1917). Build seat: Opus (RR-0385 items 1 and 8, MORNING-DECISIONS.md:1907-1926). Six steps: the card names them and does not list them; section 6 holds the lane's order. Scope amended at the plan review: RR-0402 (MD:2034), RR-0403 (MD:2040) and RR-0405 (MD:2052, verbatim: option a) put the circulation text fix inside this task; section 7b holds it. Board ~/Buildo-wt-board, read at 18cc2752e. The brief named cc584b87b. The five commits since then are task-424's and touch none of the files below (`git diff --stat cc584b87b..HEAD`). Commands run: git, grep, sed, the backlog viewer and small read-only node scripts. No test runner was run and nothing was written. Paths are relative to the board. MD = ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md.

## 0. Facts verified

What I searched first (the operator: "you are probaley rebuilding stuff that already exists"):
- The six files the brief named.
- src/tests/admin-report-preview-live.logic.test.ts, src/tests/customer-report-read.logic.test.ts and src/tests/surfaces/report-page.logic.test.ts.
- src/lib/report-projection/{project,read-stored}.ts and src/lib/parcels/consumer-lookup.ts.
- scripts/analysis/report-schema.mjs and scripts/analysis/src-sql-ledger.mjs.
- scripts/analysis/gates/consumer-registry.mjs and scripts/steps/_schema/consumer-registry.json.
- scripts/surfaces/_schema/seed-report-v2.mjs and the MaxBLD descriptors.
- `git grep` for: "not in the static parcels read", PARCEL_SELECTED, migrationColumns, vi.doMock, "shrink-only".

The chain from a page number to the database, and the check that exists for each link:
1. A page value part names a declared field. Checked: report-page.logic.test.ts:45 (P1).
2. That field's source is in the closed set and resolves (catalogue row, parcels migration column). Checked: report-schema.mjs:148-203 (RS-1, RS-3), locked by report-binding.logic.test.ts:63-155.
3. Every parcels column the page binds is in the one static parcels read. Checked only by a throw when the module loads: read-stored.ts:21-29 (the throw is line 29; line 28 is the PARCEL_SELECTED list). No test proves that throw red (grep of its message in src/tests: 0 hits).
4. Every column a src/ SQL reads is in the committed catalog snapshot. Checked: src-sql-ledger.mjs:42-48 `--check`, run in pre-commit (.husky/pre-commit:23).
5. Every such column has a declared writer step. Checked: consumer-registry.mjs:24 (gate D, "unproduced" reads). It holds read-stored.ts rows, for example `parcels.is_corner_lot` with producer enrich_centreline.
6. The engine writes the catalogue field for the page section's building type. No static check. The G25 case (admin-report-preview-live.logic.test.ts:154-205) compares the golden-25 key with the producer payload only where the key states a value.
7. Every number shown comes from McBylaws, not from typed text (fe.05). report-no-maths.logic.test.ts scans for arithmetic only. No check covers content texts.

Other facts:
- The live REPORT page is report-page.json, bound through report-v2.decl.json. The producer reads `catalogue:` from parcel_maxbld_scenarios and `parcels:` from the parcels row (project.ts:8-10). The S-001 hand screen is retired (report-fields.decl.json `$comment`).
- `pageBindings(page, fields)` takes injected copies (project.ts:98-100). The admin test already loads the catalogue and switchboard seeds (admin-report-preview-live.logic.test.ts:44-52) and already holds the FE-05 page-rule case (:121).
- Effective-ON is defined in seed-report-v2.mjs:81-82: the row's formula switch and the type's switch are both on, and off beats on. The page producer reads a row by (building_type, field_id) (project.ts:199).
- Dry run (node, read-only) over the 17 (option section, catalogue field) pairs of the committed page: each row lists the section's type, its formula switch is on and the type switch is on. 0 misses.
- Content texts the page can show: 90 keys (report-presentation.json:281 `page`). Exactly 4 hold a digit:
  - :322 `row.unit_size_basis_value` "the basement; 10 % circulation" (used by o3, report-page.json:1580);
  - :336 `legal.line` "not 100% accurate";
  - :342 and :344, the input placeholders "e.g. 50" and "e.g. 120".
- The engine reads circulation from the setting `houseplex_circulation_share`, default 0.1, min 0.1, max 0.1 (logic_variables.json:2), through lv() (layer3-catalogue.json:264-277: basement_livable_m2, units_flat, units_pitched_a and b, unit_area_m2 at :271, units_fit at :277).
- The repo's form for known exceptions is a fail-closed list: each entry has a count and a kind, the reason reads "owed: <row>", a stale entry fails, and the list only shrinks (src/tests/surfaces/nav-by-route.logic.test.ts:13-16, :296-311).
- The repo's form for planting a defect at module load is `vi.resetModules` + `vi.doMock(orig)` + a dynamic import, then `vi.doUnmock` (src/tests/maxbld-web-pages.logic.test.ts:113-119).
- McFrontend trailers apply only to `frontend` paths (mcbylaws/protected-paths.json:20-31, which includes src/tests/surfaces/**; cite-arms.mjs:173-178). The two test files below are not frontend, layer23 or protected paths.

UNVERIFIED:
- Traced by the grounder: the engine writes a row whose switch is off as not_evaluated with reason switched_off:<id> (maxbld/rows.js:402); only a row with an increment other than 1 that is off and not_evaluated is dropped (rows.js:511); a missing switch reads on (compute-maxbld-scen*.js:213-216). T1 reads the engine rows, so it copies none of these rules.
- Found by the grounder: the closed binding set is fe.18 (136:85) and scripts/surfaces/_schema/binding-sources.json: catalogue, content (the label, help-text and legal-copy registry), user_input, ad_slot, external_embed and parcels. Labels, help text and legal copy are content fields, not an exception.

## 1. Scope

In:
- Three tests, each red on a planted defect, then green.
- Two existing test files are extended for T1, T2 and T3. No code change and no fix except the circulation text fix of section 7b (RR-0402, RR-0403, RR-0405), which also changes the K2 test.

Out:
- Any fix of a live break other than the circulation text (section 4 item 1).
- Any CI workflow change, new tool, gate, hook or card (RR-0392, MD:1976).
- OWED handbook locks (task-367): the task-367 card (:69) says it is the KEY card and that task-434 is merged into it, and task-434 (:43) records the merge; the look's Feeds column for ranks 1-7 reads task-442 and is stale against these cards. If the task-367 plan review finds a rule it does not carry, that gap is task-367's to take; this task takes none.
- Engineering rows (task-441): the card of task-441 (FINAL.6) is the engineering-standards tests, RULE-CHECKS.md:163 lists the group 3 engineering rows again, not counted twice, and group 2 gives them Feeds task-441.
- Anything that needs a database (a lane may not connect to one; the database side of fe.19, fe.20, fe.27 and fe.38 is the main-only db tests of section 4 item 3).

## 2. Rows chosen, in the look's rank, and who owns each skipped row

The rank is from docs/reports/reviews/task-440/RULE-CHECKS.md:169-215. I did not re-rank. A row is skipped only when another task owns it or cannot be tested without a database.

| Rank | Row | Taken? | Owner or reason |
|---|---|---|---|
| 1-7 | fe.45, fe.52, fe.56, fe.21, fe.25, fe.26, fe.44 | no | OWED, lock path reserved: task-367 (RR-0385 item 6, MD:1922: "Task 367 is the key card"; task-434 merged into it; FE-45 row 135:67 "the lock is task-434's"). fe.58 (task-446) is OWED too; its lock is task-367's (task-446 plan, acceptance 6). |
| 8 | fe.05 | **yes, T1 and T3** | |
| 9 | fe.09 | no | Not a front-end to database rule. "Lock column" (136:58) is a column of the register table; it entered group 3 only through the keyword test (RULE-CHECKS.md:177). Enforced in group 1 (:136). |
| 10 | fe.40 | no | Its Available side runs against a local test stack, which is a database (136:151). Lanes may not connect. |
| 11-29, 46, 47 | §2.1 … §14 rows 1-2 | no | Engineering rows. Group 2 lists them with Feeds task-441 (RULE-CHECKS.md:39 onward). Q1 ruled by the grounder: they are task-441's. |
| 30 | fe.39 | no | OWED (136:149): task-367. |
| 31 | fe.13 | no, this round | A file-only Available check needs descriptor `tables[].columns` read against the migrations. Dry run on parcel_product: 12 misses of 286, all false or unbuilt: a view (parcel_lot_form, types.ts:132), a rename (imagery_roof_*, migrations/201), an unbuilt table (user_tracked_lots). migrationColumns reads neither views nor renames, so this would need new parsing. |
| 32 | fe.15 | no | Its Available side is canary f, owned by FE-25 (OWED, 135:37): task-367. |
| 33 | fe.18 | **yes, T1** | |
| 34, 35 | fe.19, fe.20 | no | User inputs are the design exception. Their Available side is a db test that runs on main only (see section 4, item 3). |
| 36 | fe.22 | no | Ads are the design exception. |
| 37 | fe.24 | later round | |
| 38 | fe.27 | **yes, T2** | |
| 39-45 | fe.30, fe.31, fe.32, fe.37, fe.38, fe.41, fe.42 | later rounds | Left for later rounds of this card, taken in the look's rank order, each round with its own plan review (the search surfaces fe.31, fe.32, fe.37 and fe.38 are in those rounds). fe.38 is already file-checked by customer-report-read.logic.test.ts:366-374 (T8). |

Rule texts, quoted:
- fe.05 (136:46): "P4 Single source: the front end may show more, never derive differently; every number from McBylaws; no maths in the UI."
- fe.18 (136:85): "every displayed field binds to a source in the closed set … Labels, help text and legal copy are content fields, not an exception."
- fe.27 (136:112): "parcels is a source in the closed binding set: a field bound to a column of the parcels table (a DB field the consumer payload reads, Spec 100 §3.2 whitelist). A column that is not in the migrations, or a path not on the whitelist, fails."
- Earlier ruling (MD:638): "the report fields and the details and the search pages to the databse and ensure they are available."

## 3. The tests

### T1. Every number in an option section is a McBylaws row the engine writes for that section's building type (fe.05, fe.18)

- **File:** src/tests/admin-report-preview-live.logic.test.ts, a new describe "B1". The file header already cites FE-05 (:1); add FE-18 to the SPEC LINK.
- **Checker:** a pure helper in the test, `unwritten(bindings, rows)`. The rows are the engine's own stored rows from the file's harness, `storedRowsOf(KEY[0])` (:84-90). The helper reads no switch and copies no rule of the generator. pageBindings emits three source kinds: catalogue (this test), parcels (T2) and user_input (the lot-size entry, a design exception by fe.18). For each `pageBindings()` entry with `building_type !== null` and `source.kind === 'catalogue'`, it reports a finding when:
  - the engine wrote no row for (building_type, field_id) (a catalogue row that is missing, does not list the type, or is switched off with an increment other than 1 leaves no row); or
  - the written row carries a reason starting `switched_off:` (rows.js:402: an increment-1 row that is off is still written, as not_evaluated).
  - Not checked, and stated in the test header: RS-1 and RS-3 (report-schema.mjs:148-203) already hold the declared half, report-generator-fields.logic.test.ts:83 holds one field per effective-ON row, and the design option of o1 and o2 is not checked (the type before the slash only, as project.ts does).
- **No copy of a rule:** the test repeats no line of seed-report-v2.mjs; it asserts on what the engine wrote (Q2 ruled by the grounder).
- **Cases:**
  - (a) Control: the committed page and seeds give `[]`, and the checked (section, field) pairs number at least 17 (non-vacuous).
  - (b) A copy of the rows without the `gfa_max_m2` row of `detached_houseplex` gives exactly one finding, naming `o3 gfa_max_m2 detached_houseplex` (gfa_max_m2 is bound in o3 only).
  - (c) A copy of the rows in which the `storeys_max` row of `detached_house` has reason `switched_off:formula:storeys_max` gives findings for o1 and o2 (both detached_house).
  - (d) A copy of the rows without any `detached_houseplex` row gives one finding per o3 pair; the count equals the o3 pair count (7) and is at least 1.
- **Red through the hooks:** while writing (a), the lane adds one temporary line inside (a)'s control that drops the `storeys_max` rows of `detached_house` from a local copy of the rows (never from SEEDS: other cases read it). It stages the file and commits. The pre-commit related run (.husky/pre-commit:85) fails at (a)'s `toEqual([])`. The lane records red.out, removes the line and commits green.
- **Reuses:** `pageBindings` (project.ts:100), the file's `storedRowsOf` (:84-90) and `KEY`. No new file and no new read.

### T2. A parcels column the page binds but the stored read does not select fails at load (fe.27)

- **File:** src/tests/customer-report-read.logic.test.ts, a new describe "T11". Add fe.27 / FE-27 to the SPEC LINK (:1-3).
- **Cases:**
  - (a) Planted binding: `vi.resetModules()`, then `vi.doMock('@/lib/report-projection/project', async (orig) => ({ ...(await orig<typeof import('@/lib/report-projection/project')>()), pageBindings: () => [...] }))` so that `pageBindings` returns the real bindings plus one `{ section: 'lot', building_type: null, key: 'lot.fsi', unitPart: false, rule: 'int', field: 'max_build_fsi', source: { kind: 'parcels', column: 'max_build_fsi' } }`. Then `await import('@/lib/report-projection/read-stored')` rejects with the message "MB-93: page field source parcels:max_build_fsi is not in the static parcels read". The planted object is typed `Binding` (project.ts:75), and max_build_fsi is checked absent from the four selected columns (read-stored.ts:28) before the import. The whole case body (doMock, import, assertion) sits in a `try`; `vi.doUnmock('@/lib/report-projection/project')` and then `vi.resetModules()` run once, in its `finally`. A comment says T11 stays the last describe.
  - (b) Control: the real module imports, `readLotFacts` is a function, and the scripted read (the file's `script()`, :87-95) returns `columns` keys equal to the parcels columns of `pageBindings()`.
- **Red through the hooks:** the lane temporarily deletes the throwing line, read-stored.ts:29 (not :28, the PARCEL_SELECTED list: deleting that fails the whole file at collection). src/lib/report-projection is not a frontend path, and the SQL text is unchanged, so src-sql-ledger `--check` stays green. The commit attempt fails at (a)'s `rejects.toThrow`. The lane records red.out, puts the line back with the edit tool, character for character from `git show HEAD:src/lib/report-projection/read-stored.ts`, proves it with `git diff --quiet -- src/lib/report-projection/read-stored.ts` (exit 0), never stages that file, and commits green.
- **Reuses:** the existing guard, the file's hoisted mocks and scripted pool, and the doMock form of maxbld-web-pages.logic.test.ts:113-119. Gates 4 and 5 of section 0 already cover catalog membership and declared writers; T2 does not repeat them.

### T3. No number reaches the page through a content text, except the listed exceptions (fe.05)

- **File:** src/tests/admin-report-preview-live.logic.test.ts, a new describe "B2", beside F (:101).
- **Checker:** every key of the report-presentation.json `page` block is scanned, all 90 today, so a key no part names (the lot-size error texts with {lo} and {hi}, summary.not_evaluated) is covered too. Each text matching `/\d/` is a finding keyed by the content key. The test asserts the scanned count equals the key count of `page` and is at least 90. The other blocks of the registry (status_text, display_label, disclosure_texts, trust_label and the rest) are the next round of this card for fe.05; today their digits are notes, ids and ruling labels, plus one shown status text (not_evaluated:coa_factor_unfitted:suite) that cites Q-4; the test header says so.
- **Fail-closed list** (the nav-by-route form), keyed by content key, each with a count, a kind and a `why`:
  - `legal.line`, count 1, kind `legal`. Why: legal copy is a content field (136:85).
  - `sheet.width_placeholder` and `sheet.depth_placeholder`, count 1 each, kind `input_hint`. Why: an example hint of the lot-size entry box; it shows no value of the lot and is help text, a content field by fe.18 (136:85).
  - No entry for `row.unit_size_basis_value`: the circulation text fix of section 7b removes its digit in the same work commit, so T3 lands with no entry of kind `exception` and needs no owner row.
  - That is 3 entries, none of kind `exception`.
- **Cases:**
  - (a) Every finding is explained by an entry, and every entry matches exactly its count. A stale entry (0 matches) fails.
  - (b) A page-text copy with "5 m" added to `row.unit_size_basis` fails at (a)'s assertion and names `row.unit_size_basis`.
  - (c) The list has exactly 3 entries (`legal.line`, `sheet.width_placeholder`, `sheet.depth_placeholder`), 0 of kind `exception`, and each has a `why`. The list only shrinks.
- **Red through the hooks:** the lane stages T3 (3 entries) and the K2 change of section 7b together, before the text fix, in one commit attempt, with one temporary line in (a)'s control that checks the planted page-text copy of case (b) (a digit added to `row.unit_size_basis`). The related run fails at T3 (a), naming `row.unit_size_basis` (the planted defect) and `row.unit_size_basis_value` (the live tree, break evidence), and at the K2 no-digit assertion. The lane records red-T3.out, removes the temporary line and commits green with the text fix.
- **Reuses:** `PAGE` and the presentation registry the file already reads, and the exception-list form of nav-by-route. No scan of renderer code: digits in mobile or web code belong to task-367 (its card, item b) and to fe.45.

## 4. Live breaks found (item 1 is fixed in this task, section 7b; the others are named for the orchestrator)

1. **The houseplex option shows "10 % circulation" as typed content** (report-presentation.json:322, used at report-page.json:1580). The engine reads the same number from `houseplex_circulation_share` (logic_variables.json:2; layer3-catalogue.json:264-268). So a number on the screen is not bound to its database field. This breaks fe.05 ("every number from McBylaws") and the binding ruling (MD:638). The setting is pinned at 0.1 (min = max), so the text is true today. It stops being true as soon as the setting is refitted, and its own description says a refit is owed. FIXED IN THIS TASK (RR-0402, RR-0403, RR-0405): the text drops the percent (section 7b), and T3 lands with 3 entries and no exception.
2. **A possible mismatch, UNVERIFIED as a break.** The S-001 consumer whitelist lists `parcel.parcelId` and three `parcel.lot.*` paths (mobile_parcel_detail.descriptor.json `inputs.field_whitelist`). The strict consumer payload has no key for any of them (src/app/api/parcels/lookup/types.ts:80-96). RS-2 passes because it reads the whitelist (report-schema.mjs:185-195). The three lot values do reach the page, through `readLotFacts` (read-stored.ts:48-55) and the `page` block of the lookup route. Ruled by the grounder (Q4): fe.27 fails a column that is not in the migrations and a path that is not on the whitelist; the four paths are on the whitelist (RS-2; report-binding.logic.test.ts:145), so fe.27 is met as written. Not a break; no test is planned on it.
3. **Main only.** The Available evidence for fe.19, fe.20, fe.27 and fe.38 rests on db tests that CI runs on a PR only when the PR touches the filter paths (db-tests.yml:9-17; test.yml:66-67 excludes src/tests/db/**). Closing that gap needs a workflow change. Ruled by the grounder (Q3): not done here, RR-0392 (MD:1975-1976) opens no new infrastructure without his word; the gap stays named here.

## 5. Files

Files: src/tests/admin-report-preview-live.logic.test.ts, src/tests/customer-report-read.logic.test.ts, scripts/surfaces/_schema/report-v2-seed/page-text.json, scripts/surfaces/_schema/report-presentation.json, scripts/surfaces/_schema/report-v2.decl.json, scripts/surfaces/parcel_product/F06/surfaces/web_landing.sample.json, src/tests/fixtures/report-page/, src/tests/fixtures/surfaces/report/, src/tests/surfaces/report-honest-k2.logic.test.ts, .cursor/MCFRONTEND-QUEUE.md, docs/reports/panels/, scripts/analysis/bylaw-validation/coa-expected/prereg-MF-97-1.json

The backlog task file and the lane records under docs/reports/ are always allowed (check-task-files.mjs:10). read-stored.ts is touched only by the uncommitted plant in T2, which is never staged (check-task-files reads the staged paths, so the Files line holds). The ten added paths widen the resolved rule lists from 5 to 15 (resolveTask run in memory by the grounder adds surface-136, surface-126, surface-127, surface-128, surface-135, queue-137, agents-s7-s11, bylaw-133, agents-s5-1to3 and orchestrator-doc17): the orchestrator runs the plan compliance lens for each added list on a committed context holding this folded plan before launch.

## 6. Landing

The same order as task-424 (task-424 plan section 7).
- **Commit 0 (records, alone and first):** subject `docs(135_mcfrontend_decisions_register): MF-97 queue row, prereg and panel record` (the precedents 62b2ffed6 and 0ae43e69c name 135, not 136). It holds the MF-97 row under Phase 2 of .cursor/MCFRONTEND-QUEUE.md with the next-free-id line moved to MF-98, prereg-MF-97-1.json (round 202, totals copied from the newest prereg, the form of prereg-MF-96-1.json, with `rules` set to FE-05, FE-18, FE-24, FE-27 and FE-29, all RULED: the frontend arm refuses a prereg with no rules, cite-arms.mjs:99), docs/reports/panels/MF-97.json (the MF-95.json form) and the task file. Before launch the orchestrator appends the M-246 dated notes for RR-0402 (decision-187), RR-0403 (decision-188), RR-0404 (decision-189, the planner redirect that supplied section 7b) and RR-0405 (decision-190) with `backlog task edit task-442 --append-notes` in the form of datedNote in scripts/analysis/backlog-decision.mjs; the decisions exist and that script refuses a duplicate, so it is not re-run, and the Plan hash covers the body, so the notes come before the Plan line. Trailers: `Task: task-442`, `McFrontend-Task: MF-97`, `Operator-Ruling:` RR-0402 (MD:2034, verbatim: a), RR-0403 (MD:2040, verbatim: a) and RR-0405 (MD:2052, verbatim: option a), and `Spec-diff: queue row and records only, no spec rule text moves` (the form of 0ae43e69c). The orchestrator claims MF-97 and round-202 in ~/Buildo-scratch/ids before launch (MF-96 and round-201 are BL-HB446's). Commit 0 is the parent of the work commit, because the gate reads the prereg from the parent tree.
- **Commit 1 (work):**
  - Subject: `test(136_mcfrontend_handbook): front end to database tests for fe.05, fe.18 and fe.27 (task-442)`. validate-commit-msg wants type(NN_spec); precedent: ba0892689.
  - Trailer: `Task: task-442`. The work commit also carries `Rule: FE-05, FE-18, FE-24, FE-27, FE-29` (the register cite that Spec 127 §4.3, dated note 2026-11-04, asks of a golden refresh: fe.05, fe.18 and fe.27 are tested here, fe.24 and fe.29 are the golden rules report-capture.ts cites) and `Red: docs/reports/lanes/<date>/<lane>/red-T3.out`.
  - Trailers on the work commit: `Task: task-442`, `McFrontend-Task: MF-97`, the same `Operator-Ruling:` line and `Spec-diff: one content text changed; generated copies regenerated; no spec rule text moves`. The work commit touches frontend paths (scripts/surfaces/**, src/tests/surfaces/**, src/tests/fixtures/surfaces/**: protected-paths.json:20-31), so the McFrontend arm runs (cite-arms.mjs:173-178) and the owner is prompted at push. No hook is bypassed.
  - The task file goes in the same diff, status RUNNING (137:84, :100).
  - Red evidence is recorded first: three red.out files, each from a blocked commit through the real hooks, each failing at its designed assertion. The runner is never run directly. T3's attempt also stages the K2 change (section 7b). Before the red run the lane writes a 5-item PASS or FAIL self-check in its reply: binding closure, the 17 rows present, the parcels column set, no unlisted digit, the three seed reads non-vacuous. The work commit holds T1, T2, T3, the K2 change, the text and every regenerated copy; T1 and T2 may land in a commit before it.
- **Output review:**
  - DeepSeek compliance and engineering lenses on the lists the Files line resolves to, then a separate grounder before any fold (RR-0359, MD:1687).
  - Two rounds at most: round 1 fixes CRITICAL, HIGH and MED; round 2 CRITICAL and HIGH (RR-0385 item 3, MD:1919).
- **Close:** the two-commit close, records only (137:100, :136): REPORT.md, TRIAGE.md, GROUNDER.md and the lens outputs; task BUILT. The lane never pushes.
- **Other tasks:** task-367 and task-441 share no file with this task and are kept; task-446 is kept; task-447 is merged into this task (RR-0403) and gets no lane; McFixReborn waits for the tests (RR-0388). Landing order, from a diff of the unlanded branches against the board: wf1/inc1b-thinroute (task-383, RUNNING) edits the end of customer-report-read.logic.test.ts (T9 and T10) and wf1/inc1b-areafactor (task-411, RUNNING) edits describe F of the admin test and the formatter names in report-presentation.json; both are built and unfolded, so they fold onto the board first and this lane then branches from the board head. wf1/inc1b-hb446 (task-446) edits .cursor/MCFRONTEND-QUEUE.md line 5 (next free id MF-97), so its commit 0 (0ae43e69c, MF-96) folds before this task's commit 0 (MF-97). If task-367 later moves fe.05 checks into a surfaces lock, T1 and T3 can move with them.

## 7. Acceptance

| # | Who | Command | Expected |
|---|---|---|---|
| A1 | lane | read docs/reports/lanes/<date>/<lane>/red-T1.out, red-T2.out, red-T3.out | each holds the pre-commit related-run failure at the named assertion: T1 (a) `toEqual([])`; T2 (a) `rejects.toThrow`; T3 (a), naming `row.unit_size_basis` (the planted digit), and the K2 no-digit assertion |
| A2 | lane | `git log -1 --format=%B <work sha>` | holds `Task: task-442`, `McFrontend-Task: MF-97` and the `Rule:` line above; the commit passed the hooks |
| A3 | orchestrator | read green.out in the lane folder, the hook tail of the work commit | the related run passes both test files and the K2 test |
| A4 | orchestrator | `git diff --stat <launch>..HEAD -- src/lib src/app mobile migrations .github` and `git status --short -- src/lib` | both empty (scripts is left out: the text fix regenerates files under scripts/surfaces, section 7b) |
| A5 | orchestrator | `grep -c "kind: 'exception'" src/tests/admin-report-preview-live.logic.test.ts` | 0 (T3 lands with no entry of that kind) |
| A6 | orchestrator | `git diff <launch>..HEAD -- src/tests/customer-report-read.logic.test.ts \| grep -c "vi.doUnmock('@/lib/report-projection/project')"` | 1 (written once, in the finally of T2 (a)) |
| A7 | orchestrator | the pre-push check list at push (.husky/pre-push-checks.sh) | PASS |
| A8 | orchestrator | `git grep -l -F "10 % circulation" -- scripts src` and `node scripts/surfaces/_schema/seed-report-v2.mjs --check` | the grep prints nothing; the check exits 0 |
| A9 | orchestrator | `grep -c "the basement, not shared stairs and halls" scripts/surfaces/_schema/report-presentation.json scripts/surfaces/_schema/report-v2-seed/page-text.json` | 1 for each file |
| A10 | orchestrator | `npx tsx scripts/surfaces/report-capture.ts --check` and `npx tsx scripts/surfaces/report-page-capture.ts --check` | both exit 0 |

## 7b. The circulation text fix (RR-0402, RR-0403, RR-0405; folded by the plan grounder from the plan seat's section, checked against the repo)

The operator ruled the wording (RR-0405, MD:2052, verbatim: option a): the text of `row.unit_size_basis_value` becomes exactly: the basement, not shared stairs and halls. The row then reads: Size per unit includes: the basement, not shared stairs and halls. RR-0402 (MD:2034) dropped the percent and RR-0403 (MD:2040) put the fix inside task-442; task-447 is merged into it and gets no lane.
- **One hand-edited source:** scripts/surfaces/_schema/report-v2-seed/page-text.json:44 (checked: the only source line).
- **Regenerate, in this order, each with its own check:** (1) `node scripts/surfaces/_schema/seed-report-v2.mjs --write` rewrites report-presentation.json:322 and the provenance hash of report-v2.decl.json (seed-report-v2.mjs:21-22, :540, :674; a hand edit of the presentation fails with GEN-HAND-EDIT, :699). (2) `npx tsx scripts/surfaces/report-capture.ts` rewrites the fingerprints of the 72 goldens in src/tests/fixtures/surfaces/report/ (FP_FILES holds the presentation and the decl, report-checks.mjs:22-28); none holds the text. (3) `npx tsx scripts/surfaces/report-page-capture.ts` rewrites the 32 page goldens and the view of the 5 props goldens in src/tests/fixtures/report-page/ and the landing sample scripts/surfaces/parcel_product/F06/surfaces/web_landing.sample.json (header :10-15). Checks after: `seed-report-v2.mjs --check`, `report-capture.ts --check` and `report-page-capture.ts --check`, each exit 0.
- **Copies (checked by `git grep -l -F` of the old text):** 1 source, 1 presentation, 1 landing sample, 32 page goldens and 5 props goldens; the rest are records under docs/reports and the task cards, which stay. No renderer types its own copy: a grep of circulation over src, mobile and scripts finds engine code and tests only.
- **K2 test (src/tests/surfaces/report-honest-k2.logic.test.ts):** delete the LV const at :18 (its only use is :56, and an unused const fails lint); retitle the describe and the it at :46-47 to name the basement and the words, with no figure; replace :56-57 with `expect(t, 'no digit in the basis text (RR-0402)').not.toMatch(/\d/);` and `expect(t).toBe('the basement, not shared stairs and halls');`. Lines 48-55 stay as the control. No other test pins the old string; report-generated-only.infra.test.ts and report-golden-parity.logic.test.ts check that the copies are fresh and run in the pre-push suite.
- **Unchanged:** the engine, scripts/seeds/logic_variables.json:2, the catalogue, report-page.json and every other content key.
- **Standards boundary (engineering §10.2):** the rule keeps frontend work from changing how data enters the database (pipeline scripts, scripts/lib, migrations). scripts/surfaces/** is the McFrontend frontend estate (mcbylaws/protected-paths.json:20-21), not a pipeline path, and McFrontend content changes edit it (commit 46b194eb5); the text fix touches no pipeline script, no scripts/lib file and no migration. The reading is the grounder's; it is written here so the output review judges the diff against it.
- **T3 and the text move together:** T3 lands with 3 entries and no exception (section 3, T3). The text, the regenerated copies, the K2 change and T3 land in the same work commit; the red attempt is the one of T3 (section 3).
- UNVERIFIED: that the hooks accept commit 0 and the McFrontend arm on the trailers alone (precedents 62b2ffed6 and 0ae43e69c); the three regeneration commands were read, not run.

## 8. Risks and rollback

- **T2 module reset.** The reset could leak into later describes. Mitigation: T2 runs last in the file, and it calls `vi.doUnmock` and `vi.resetModules()` in a `finally`. The later cases use static imports bound at load (the maxbld-web-pages precedent).
- **T1 repeats no rule.** It reads the engine's rows, so no copy of the generator's rule can drift (Q2 ruled by the grounder). Its stated limit: the design option of o1 and o2 is not checked.
- **T3 catches digits only.** A number written in words passes. This is stated in the test header.
- **The T2 plant touches src/lib.** It is never staged or committed. The lane puts the line back with the edit tool, character for character from `git show HEAD:src/lib/report-projection/read-stored.ts`, and A4 proves it with `git status --short -- src/lib`.
- **Rollback:** revert the work commit and the close commit, return the task to its prior status, and revert commit 0 if the MF-97 row should go. Nothing else depends on them.

## 9. Questions for the plan grounder

- **Q1.** Group 3 repeats the engineering rows that group 2 gives to task-441 (RULE-CHECKS.md:39 onward: "task-441"; group 3 says "task-442"). I read them as task-441's. Is that right, or does task-442 own the front-end to database engineering rows (§4.3, §10.3, §14 row 1)? The cards do not settle it. If it is not plain, the orchestrator reads both cards; the operator's word is needed only if the cards conflict (RR-0385 item 4(ii), MD:1920). Ruled by the grounder: they are task-441's; the cards do not conflict (RULE-CHECKS.md:163 lists them again, not counted twice, and group 2 gives §4.3, §10.3 and §14 row 1 Feeds task-441).
- **Q2.** Ruled by the grounder: moot. T1 asserts on the engine's rows from the file's own harness and repeats no rule; no export and no copy.
- **Q3.** The main-only Available gap (section 4, item 3) can be closed only by a CI workflow change (db-tests.yml path filter). The card does not name one. Ruled by the grounder: not done here; RR-0392 (MD:1975-1976) opens no new infrastructure without his word, and the gap stays named in section 4 item 3.
- **Q4.** Section 4, item 2: does fe.27's "a DB field the consumer payload reads" cover values sent through the lookup route's `page` block? Ruled by the grounder: the question does not arise. fe.27 names two failures, a column that is not in the migrations and a path that is not on the whitelist (136:112), and the four paths are on the whitelist, so they are not a break (section 4 item 2). No operator word is needed.
- **Q5.** T1 and T3 sit in src/tests/admin-report-preview-live.logic.test.ts, which already holds the FE-05 case (:121), and not in src/tests/surfaces/report-page.logic.test.ts. Ruled by the grounder: T1 and T3 stay in the admin test file (the card names it). The merged text fix does bring this task inside the frontend paths, so commit 0 and the MF-97 trailer of section 6 apply for that reason, not for T1 and T3. If the grounder wanted them in the surfaces file, the landing adds an MF id, a commit 0 with prereg, panel record and queue row, and a `McFrontend-Task` trailer (the task-446 form, section 7 of its plan).
- **Q6.** T3's `exception` entry cites no owner row, because no card exists and this task may not open one (RR-0392). Ruled by the grounder: moot. The operator ruled the correction (RR-0402, MD:2034) and RR-0403 (MD:2040) puts it in this task, so there is no entry and no card is needed.

Plan review round 1: 47 folded, 0 task, 18 ruling, 0 wontfix, 27 pile; grounder docs/reports/reviews/task-442/GROUNDER-PLAN.md; triage docs/reports/reviews/task-442/TRIAGE-PLAN.md
plan-compliance-agents-s5-1to3#1 MED ruling RR-0385
plan-compliance-bylaw-133-p1#3 MED folded are the next round o
plan-compliance-bylaw-133-p2#2 MED ruling RR-0385
plan-compliance-bylaw-133-p3#1 HIGH folded Ruled by the grounde
plan-compliance-five-words#1 MED ruling RR-0385
plan-compliance-five-words#2 HIGH folded Ruled by the grounde
plan-compliance-inc-S#3 MED folded are the next round o
plan-compliance-ms-S#1 MED folded Ruled by the grounde
plan-compliance-orchestrator-doc17#2 MED folded Ruled by the grounde
plan-compliance-plan-protocol#1 MED ruling RR-0385
plan-compliance-plan-protocol#4 MED folded Ruled by the grounde
plan-compliance-plan-protocol#5 MED ruling RR-0385
plan-compliance-plan-protocol#6 MED folded are the next round o
plan-compliance-queue-137#1 HIGH folded Before launch the or
plan-compliance-queue-137#3 HIGH folded Ruled by the grounde
plan-compliance-queue-137#4 MED folded Before launch the or
plan-compliance-queue-137#5 MED ruling RR-0385
plan-compliance-surface-126-p1#2 MED ruling RR-0385
plan-compliance-surface-126-p1#3 MED folded Ruled by the grounde
plan-compliance-surface-126-p1#4 MED folded Before launch the or
plan-compliance-surface-127#1 HIGH folded The work commit also
plan-compliance-surface-127#2 MED ruling RR-0385
plan-compliance-surface-127#6 MED ruling RR-0385
plan-compliance-surface-128-p1#1 HIGH folded are the next round o
plan-compliance-surface-128-p1#3 MED ruling RR-0385
plan-compliance-surface-128-p1#4 MED ruling RR-0385
plan-compliance-surface-128-p2#2 MED ruling RR-0385
plan-compliance-surface-135-p1#5 MED ruling RR-0385
plan-compliance-surface-135-p3#1 MED ruling RR-0385
plan-compliance-surface-136#1 MED folded are the next round o
plan-engineering-eng-all#1 HIGH folded Standards boundary (
plan-engineering-eng-all#2 MED folded Standards boundary (
plan-error-paths#2 MED ruling RR-0385
plan-plan-review-deepseek#4 MED ruling RR-0385
plan-plan-review-deepseek#5 MED ruling RR-0385
plan-plan-review-deepseek#9 MED ruling RR-0385
plan-plan-review-deepseek#12 MED folded are the next round o
rc#1 HIGH folded the throw is line 29
rc#2 MED folded Traced by the ground
rc#3 MED folded the look's Feeds col
rc#4 MED folded every key of the rep
in#1 HIGH folded puts the line back w
in#2 MED folded git status --short -
in#3 MED folded (never from SEEDS: o
in#4 MED folded read green.out in th
in#9 MED folded they fold onto the b
rg#1 MED folded FIXED IN THIS TASK (
rg#2 MED folded the count equals the
rg#3 MED folded every key of the rep

Plan review round 2: 44 folded, 0 task, 20 ruling, 0 wontfix, 28 pile; grounder docs/reports/reviews/task-442/GROUNDER-PLAN.md; triage docs/reports/reviews/task-442/TRIAGE-PLAN.md
plan-compliance-agents-s7-s11#4 MED ruling RR-0385
plan-compliance-queue-137#1 MED ruling RR-0385
plan-compliance-queue-137#3 MED ruling RR-0385
plan-compliance-queue-137#5 MED folded Before launch the or
plan-compliance-surface-136#2 MED folded are the next round o
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Dated note 2026-11-23 (M-246, prior text kept; RR-0401 (decision-186, MORNING-DECISIONS.md:2028) · task-442 · Backlog; operator, verbatim: "This needs to be investigated - it looks like an error to be corrected")

Dated note 2026-11-23 (M-246, prior text kept; RR-0402 (decision-187, MORNING-DECISIONS.md:2034, option A: drop the percent, words only) · task-442 · Backlog; operator, verbatim: "a")

Dated note 2026-11-23 (M-246, prior text kept; RR-0403 (decision-188, MORNING-DECISIONS.md:2040, option A: the text fix is done inside task-442) · task-442 · Backlog; operator, verbatim: "a")

Dated note 2026-11-23 (M-246, prior text kept; RR-0404 (decision-189, MORNING-DECISIONS.md:2046, the planner redirect) · task-442 · Backlog; operator, verbatim: "approved")

Dated note 2026-11-23 (M-246, prior text kept; RR-0405 (decision-190, MORNING-DECISIONS.md:2052, option A: the basement, not shared stairs and halls) · task-442 · Backlog; operator, verbatim: "option a")

2026-11-23 taken on the board at lane launch (lane BL-FEDB442, worktree /Users/brettpreston_macmini/Buildo-wt-fedb442, branch wf1/inc1b-fedb442), RR-0240

2026-11-23 commit 0 (plan section 6, alone and first): the MF-97 row under Phase 2 of .cursor/MCFRONTEND-QUEUE.md (next free id MF-98; FE rows owned: none), scripts/analysis/bylaw-validation/coa-expected/prereg-MF-97-1.json (round 202, rules FE-05, FE-18, FE-24, FE-27, FE-29, all RULED; totals copied from prereg-MF-96-1.json, nothing moves) and docs/reports/panels/MF-97.json (the MF-95.json form). Ids from ~/Buildo-scratch/ids/MF-97 and round-202 (owner lane BL-FEDB442).
<!-- SECTION:NOTES:END -->
