# Review context for task-442 (no plan id) written 2026-11-23 by backlog-brief.mjs (round 4)

## Task
task-442 FINAL.7 Front end to database tests: every number on a screen is bound to a database field and available
status: RUNNING · milestone: m-1 · assignee: @lane-BL-FEDB442 · labels: McFix, McFix Final

## Description
Card opened 2026-11-22 by the orchestrator, Spec 137 rule 2, on the operator's ruling RR-0385 (MORNING-DECISIONS.md:1915 entry, RR-0385, decision-170). Operator, verbatim: "This is the focus for both compliance and engineering standards and interface between the frontend and databse". THIS TASK: tests of the interface between the front end and the database as ranked by FINAL.5 (what exists is reused first); each test is proven red on a planted defect before it counts. Scope and Files line at its plan review. Every build task of this plan follows the six steps, plan written and built on Opus (his words: "I want this plan for each task and built by opus").

Files: src/tests/admin-report-preview-live.logic.test.ts, src/tests/customer-report-read.logic.test.ts, scripts/surfaces/_schema/report-v2-seed/page-text.json, scripts/surfaces/_schema/report-presentation.json, scripts/surfaces/_schema/report-v2.decl.json, scripts/surfaces/parcel_product/F06/surfaces/web_landing.sample.json, src/tests/fixtures/report-page/, src/tests/fixtures/surfaces/report/, src/tests/surfaces/report-honest-k2.logic.test.ts, .cursor/MCFRONTEND-QUEUE.md, docs/reports/panels/, scripts/analysis/bylaw-validation/coa-expected/prereg-MF-97-1.json

## Acceptance criteria

## Implementation Plan
#### PLAN-442-v1

Task: task-442 (FINAL.7, build). Plan seat: Opus, read-only (RR-0385 item 1, MORNING-DECISIONS.md:1917). Build seat: Opus (RR-0385 items 1 and 8, MORNING-DECISIONS.md:1907-1926). Six steps: the card names them and does not list them; section 6 holds the lane's order. Scope amended at the plan review: RR-0402 (MD:2034), RR-0403 (MD:2040) and RR-0405 (MD:2052, verbatim: option a) put the circulation text fix inside this task; section 7b holds it. Board ~/Buildo-wt-board, read at 18cc2752e. The brief named cc584b87b. The five commits since then are task-424's and touch none of the files below (`git diff --stat cc584b87b..HEAD`). Commands run: git, grep, sed, the backlog viewer and small read-only node scripts. No test runner was run and nothing was written. Paths are relative to the board. MD = ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md.

#### 0. Facts verified

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

#### 1. Scope

In:
- Three tests, each red on a planted defect, then green.
- Two existing test files are extended for T1, T2 and T3. No code change and no fix except the circulation text fix of section 7b (RR-0402, RR-0403, RR-0405), which also changes the K2 test.

Out:
- Any fix of a live break other than the circulation text (section 4 item 1).
- Any CI workflow change, new tool, gate, hook or card (RR-0392, MD:1976).
- OWED handbook locks (task-367): the task-367 card (:69) says it is the KEY card and that task-434 is merged into it, and task-434 (:43) records the merge; the look's Feeds column for ranks 1-7 reads task-442 and is stale against these cards. If the task-367 plan review finds a rule it does not carry, that gap is task-367's to take; this task takes none.
- Engineering rows (task-441): the card of task-441 (FINAL.6) is the engineering-standards tests, RULE-CHECKS.md:163 lists the group 3 engineering rows again, not counted twice, and group 2 gives them Feeds task-441.
- Anything that needs a database (a lane may not connect to one; the database side of fe.19, fe.20, fe.27 and fe.38 is the main-only db tests of section 4 item 3).

#### 2. Rows chosen, in the look's rank, and who owns each skipped row

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

#### 3. The tests

#### T1. Every number in an option section is a McBylaws row the engine writes for that section's building type (fe.05, fe.18)

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

#### T2. A parcels column the page binds but the stored read does not select fails at load (fe.27)

- **File:** src/tests/customer-report-read.logic.test.ts, a new describe "T11". Add fe.27 / FE-27 to the SPEC LINK (:1-3).
- **Cases:**
  - (a) Planted binding: `vi.resetModules()`, then `vi.doMock('@/lib/report-projection/project', async (orig) => ({ ...(await orig<typeof import('@/lib/report-projection/project')>()), pageBindings: () => [...] }))` so that `pageBindings` returns the real bindings plus one `{ section: 'lot', building_type: null, key: 'lot.fsi', unitPart: false, rule: 'int', field: 'max_build_fsi', source: { kind: 'parcels', column: 'max_build_fsi' } }`. Then `await import('@/lib/report-projection/read-stored')` rejects with the message "MB-93: page field source parcels:max_build_fsi is not in the static parcels read". The planted object is typed `Binding` (project.ts:75), and max_build_fsi is checked absent from the four selected columns (read-stored.ts:28) before the import. The whole case body (doMock, import, assertion) sits in a `try`; `vi.doUnmock('@/lib/report-projection/project')` and then `vi.resetModules()` run once, in its `finally`. A comment says T11 stays the last describe.
  - (b) Control: the real module imports, `readLotFacts` is a function, and the scripted read (the file's `script()`, :87-95) returns `columns` keys equal to the parcels columns of `pageBindings()`.
- **Red through the hooks:** the lane temporarily deletes the throwing line, read-stored.ts:29 (not :28, the PARCEL_SELECTED list: deleting that fails the whole file at collection). src/lib/report-projection is not a frontend path, and the SQL text is unchanged, so src-sql-ledger `--check` stays green. The commit attempt fails at (a)'s `rejects.toThrow`. The lane records red.out, puts the line back with the edit tool, character for character from `git show HEAD:src/lib/report-projection/read-stored.ts`, proves it with `git diff --quiet -- src/lib/report-projection/read-stored.ts` (exit 0), never stages that file, and commits green.
- **Reuses:** the existing guard, the file's hoisted mocks and scripted pool, and the doMock form of maxbld-web-pages.logic.test.ts:113-119. Gates 4 and 5 of section 0 already cover catalog membership and declared writers; T2 does not repeat them.

#### T3. No number reaches the page through a content text, except the listed exceptions (fe.05)

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

#### 4. Live breaks found (item 1 is fixed in this task, section 7b; the others are named for the orchestrator)

1. **The houseplex option shows "10 % circulation" as typed content** (report-presentation.json:322, used at report-page.json:1580). The engine reads the same number from `houseplex_circulation_share` (logic_variables.json:2; layer3-catalogue.json:264-268). So a number on the screen is not bound to its database field. This breaks fe.05 ("every number from McBylaws") and the binding ruling (MD:638). The setting is pinned at 0.1 (min = max), so the text is true today. It stops being true as soon as the setting is refitted, and its own description says a refit is owed. FIXED IN THIS TASK (RR-0402, RR-0403, RR-0405): the text drops the percent (section 7b), and T3 lands with 3 entries and no exception.
2. **A possible mismatch, UNVERIFIED as a break.** The S-001 consumer whitelist lists `parcel.parcelId` and three `parcel.lot.*` paths (mobile_parcel_detail.descriptor.json `inputs.field_whitelist`). The strict consumer payload has no key for any of them (src/app/api/parcels/lookup/types.ts:80-96). RS-2 passes because it reads the whitelist (report-schema.mjs:185-195). The three lot values do reach the page, through `readLotFacts` (read-stored.ts:48-55) and the `page` block of the lookup route. Ruled by the grounder (Q4): fe.27 fails a column that is not in the migrations and a path that is not on the whitelist; the four paths are on the whitelist (RS-2; report-binding.logic.test.ts:145), so fe.27 is met as written. Not a break; no test is planned on it.
3. **Main only.** The Available evidence for fe.19, fe.20, fe.27 and fe.38 rests on db tests that CI runs on a PR only when the PR touches the filter paths (db-tests.yml:9-17; test.yml:66-67 excludes src/tests/db/**). Closing that gap needs a workflow change. Ruled by the grounder (Q3): not done here, RR-0392 (MD:1975-1976) opens no new infrastructure without his word; the gap stays named here.

#### 5. Files

Files: src/tests/admin-report-preview-live.logic.test.ts, src/tests/customer-report-read.logic.test.ts, scripts/surfaces/_schema/report-v2-seed/page-text.json, scripts/surfaces/_schema/report-presentation.json, scripts/surfaces/_schema/report-v2.decl.json, scripts/surfaces/parcel_product/F06/surfaces/web_landing.sample.json, src/tests/fixtures/report-page/, src/tests/fixtures/surfaces/report/, src/tests/surfaces/report-honest-k2.logic.test.ts, .cursor/MCFRONTEND-QUEUE.md, docs/reports/panels/, scripts/analysis/bylaw-validation/coa-expected/prereg-MF-97-1.json

The backlog task file and the lane records under docs/reports/ are always allowed (check-task-files.mjs:10). read-stored.ts is touched only by the uncommitted plant in T2, which is never staged (check-task-files reads the staged paths, so the Files line holds). The ten added paths widen the resolved rule lists from 5 to 15 (resolveTask run in memory by the grounder adds surface-136, surface-126, surface-127, surface-128, surface-135, queue-137, agents-s7-s11, bylaw-133, agents-s5-1to3 and orchestrator-doc17): the orchestrator runs the plan compliance lens for each added list on a committed context holding this folded plan before launch.

#### 6. Landing

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

#### 7. Acceptance

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

#### 7b. The circulation text fix (RR-0402, RR-0403, RR-0405; folded by the plan grounder from the plan seat's section, checked against the repo)

The operator ruled the wording (RR-0405, MD:2052, verbatim: option a): the text of `row.unit_size_basis_value` becomes exactly: the basement, not shared stairs and halls. The row then reads: Size per unit includes: the basement, not shared stairs and halls. RR-0402 (MD:2034) dropped the percent and RR-0403 (MD:2040) put the fix inside task-442; task-447 is merged into it and gets no lane.
- **One hand-edited source:** scripts/surfaces/_schema/report-v2-seed/page-text.json:44 (checked: the only source line).
- **Regenerate, in this order, each with its own check:** (1) `node scripts/surfaces/_schema/seed-report-v2.mjs --write` rewrites report-presentation.json:322 and the provenance hash of report-v2.decl.json (seed-report-v2.mjs:21-22, :540, :674; a hand edit of the presentation fails with GEN-HAND-EDIT, :699). (2) `npx tsx scripts/surfaces/report-capture.ts` rewrites the fingerprints of the 72 goldens in src/tests/fixtures/surfaces/report/ (FP_FILES holds the presentation and the decl, report-checks.mjs:22-28); none holds the text. (3) `npx tsx scripts/surfaces/report-page-capture.ts` rewrites the 32 page goldens and the view of the 5 props goldens in src/tests/fixtures/report-page/ and the landing sample scripts/surfaces/parcel_product/F06/surfaces/web_landing.sample.json (header :10-15). Checks after: `seed-report-v2.mjs --check`, `report-capture.ts --check` and `report-page-capture.ts --check`, each exit 0.
- **Copies (checked by `git grep -l -F` of the old text):** 1 source, 1 presentation, 1 landing sample, 32 page goldens and 5 props goldens; the rest are records under docs/reports and the task cards, which stay. No renderer types its own copy: a grep of circulation over src, mobile and scripts finds engine code and tests only.
- **K2 test (src/tests/surfaces/report-honest-k2.logic.test.ts):** delete the LV const at :18 (its only use is :56, and an unused const fails lint); retitle the describe and the it at :46-47 to name the basement and the words, with no figure; replace :56-57 with `expect(t, 'no digit in the basis text (RR-0402)').not.toMatch(/\d/);` and `expect(t).toBe('the basement, not shared stairs and halls');`. Lines 48-55 stay as the control. No other test pins the old string; report-generated-only.infra.test.ts and report-golden-parity.logic.test.ts check that the copies are fresh and run in the pre-push suite.
- **Unchanged:** the engine, scripts/seeds/logic_variables.json:2, the catalogue, report-page.json and every other content key.
- **Standards boundary (engineering §10.2):** the rule keeps frontend work from changing how data enters the database (pipeline scripts, scripts/lib, migrations). scripts/surfaces/** is the McFrontend frontend estate (mcbylaws/protected-paths.json:20-21), not a pipeline path, and McFrontend content changes edit it (commit 46b194eb5); the text fix touches no pipeline script, no scripts/lib file and no migration. The reading is the grounder's; it is written here so the output review judges the diff against it.
- **T3 and the text move together:** T3 lands with 3 entries and no exception (section 3, T3). The text, the regenerated copies, the K2 change and T3 land in the same work commit; the red attempt is the one of T3 (section 3).
- UNVERIFIED: that the hooks accept commit 0 and the McFrontend arm on the trailers alone (precedents 62b2ffed6 and 0ae43e69c); the three regeneration commands were read, not run.

#### 8. Risks and rollback

- **T2 module reset.** The reset could leak into later describes. Mitigation: T2 runs last in the file, and it calls `vi.doUnmock` and `vi.resetModules()` in a `finally`. The later cases use static imports bound at load (the maxbld-web-pages precedent).
- **T1 repeats no rule.** It reads the engine's rows, so no copy of the generator's rule can drift (Q2 ruled by the grounder). Its stated limit: the design option of o1 and o2 is not checked.
- **T3 catches digits only.** A number written in words passes. This is stated in the test header.
- **The T2 plant touches src/lib.** It is never staged or committed. The lane puts the line back with the edit tool, character for character from `git show HEAD:src/lib/report-projection/read-stored.ts`, and A4 proves it with `git status --short -- src/lib`.
- **Rollback:** revert the work commit and the close commit, return the task to its prior status, and revert commit 0 if the MF-97 row should go. Nothing else depends on them.

#### 9. Questions for the plan grounder

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

## Implementation Notes
Dated note 2026-11-23 (M-246, prior text kept; RR-0401 (decision-186, MORNING-DECISIONS.md:2028) · task-442 · Backlog; operator, verbatim: "This needs to be investigated - it looks like an error to be corrected")

Dated note 2026-11-23 (M-246, prior text kept; RR-0402 (decision-187, MORNING-DECISIONS.md:2034, option A: drop the percent, words only) · task-442 · Backlog; operator, verbatim: "a")

Dated note 2026-11-23 (M-246, prior text kept; RR-0403 (decision-188, MORNING-DECISIONS.md:2040, option A: the text fix is done inside task-442) · task-442 · Backlog; operator, verbatim: "a")

Dated note 2026-11-23 (M-246, prior text kept; RR-0404 (decision-189, MORNING-DECISIONS.md:2046, the planner redirect) · task-442 · Backlog; operator, verbatim: "approved")

Dated note 2026-11-23 (M-246, prior text kept; RR-0405 (decision-190, MORNING-DECISIONS.md:2052, option A: the basement, not shared stairs and halls) · task-442 · Backlog; operator, verbatim: "option a")

2026-11-23 taken on the board at lane launch (lane BL-FEDB442, worktree /Users/brettpreston_macmini/Buildo-wt-fedb442, branch wf1/inc1b-fedb442), RR-0240

2026-11-23 commit 0 (plan section 6, alone and first): the MF-97 row under Phase 2 of .cursor/MCFRONTEND-QUEUE.md (next free id MF-98; FE rows owned: none), scripts/analysis/bylaw-validation/coa-expected/prereg-MF-97-1.json (round 202, rules FE-05, FE-18, FE-24, FE-27, FE-29, all RULED; totals copied from prereg-MF-96-1.json, nothing moves) and docs/reports/panels/MF-97.json (the MF-95.json form). Ids from ~/Buildo-scratch/ids/MF-97 and round-202 (owner lane BL-FEDB442).

2026-11-23 T1 red attempt (plan section 3): describe B1 in src/tests/admin-report-preview-live.logic.test.ts staged with one temporary line in (a) that drops the storeys_max rows of detached_house from a local copy; the commit is expected to be refused at (a) toEqual([]) (red-T1.out).

2026-11-23 T2 red attempt (plan section 3): describe T11 in src/tests/customer-report-read.logic.test.ts staged; the throwing line read-stored.ts:29 deleted in the working tree only (never staged); expected refusal at (a) rejects.toThrow (red-T2.out).

2026-11-23 T3 red attempt (plan section 3): describe B2 (3 entries, none of kind exception) in src/tests/admin-report-preview-live.logic.test.ts and the K2 change of section 7b staged together BEFORE the text fix, with one temporary line in B2 (a) that adds a digit to row.unit_size_basis; expected refusal at B2 (a) naming row.unit_size_basis and row.unit_size_basis_value, and at the K2 no-digit assertion (red-T3.out).

2026-11-23 work commit (plan sections 3, 6, 7b). Red evidence, each a refused commit through the real hooks, at the designed assertion: T1 B1 (a) toEqual([]) received ["o1 storeys_max detached_house", "o2 storeys_max detached_house"] (red-T1.out); T2 T11 (a) rejects.toThrow, "promise resolved ... instead of rejecting" (red-T2.out); T3 B2 (a) received ["unexplained: row.unit_size_basis (1 digit run)", "unexplained: row.unit_size_basis_value (1 digit run)"] and K2 "no digit in the basis text (RR-0402): expected 'the basement; 10 % circulation' not to match /\d/" (red-T3.out; B2 (b) also failed on the live text, as expected before the fix). Self-check before the green commit (5 items): binding closure PASS (40 bindings: catalogue 33, parcels 5, user_input 2); the 17 rows present PASS (17 pairs, o3 7, 0 misses on KEY[0]); parcels column set PASS (4 columns, max_build_fsi absent); no unlisted digit PASS (90 page keys, 3 digit texts, all listed); three seed reads non-vacuous PASS (catalogue 128 rows, switchboard 3 keys, logic variables 1085). Text of row.unit_size_basis_value is now: the basement, not shared stairs and halls (RR-0405); regenerated by seed-report-v2.mjs --write, report-capture.ts and report-page-capture.ts; checks: seed-report-v2 --check exit 0, report-capture --check "checked 72 goldens; 0 stale" exit 0, report-page-capture --check "page goldens current (40 and the landing sample)" exit 0. read-stored.ts restored (git diff --quiet exit 0), never staged. Status stays RUNNING: output review and its grounder owed (RR-0359).

2026-11-23 acceptance, lane items only (A1, A2); A3 to A10 are the orchestrator's and were not run by the lane.
A1 red-T1.out:
740:AssertionError: expected [ …(2) ] to deeply equal []
751: ❯ src/tests/admin-report-preview-live.logic.test.ts:177:22
A1 red-T2.out:
741:AssertionError: promise resolved "{ …(2), …(1) }" instead of rejecting
752: ❯ src/tests/customer-report-read.logic.test.ts:421:67
A1 red-T3.out:
748:AssertionError: expected [ …(2) ] to deeply equal []
755:+   "unexplained: row.unit_size_basis (1 digit run)",
756:+   "unexplained: row.unit_size_basis_value (1 digit run)",
759: ❯ src/tests/admin-report-preview-live.logic.test.ts:229:22
770:AssertionError: expected [ …(2) ] to deeply equal [ Array(1) ]
776:    "unexplained: row.unit_size_basis (1 digit run)",
777:+   "unexplained: row.unit_size_basis_value (1 digit run)",
780: ❯ src/tests/admin-report-preview-live.logic.test.ts:235:55
791:AssertionError: no digit in the basis text (RR-0402): expected 'the basement; 10 % circulation' not to match /\d/
799: ❯ src/tests/surfaces/report-honest-k2.logic.test.ts:55:59
A2:
Rule: FE-05, FE-18, FE-24, FE-27, FE-29
Red: docs/reports/lanes/2026-11-23/BL-FEDB442/red-T3.out
Task: task-442
McFrontend-Task: MF-97
3:GATE OK
740:      Tests  137 passed (137)
744:GATE OK
746:POLICY CHECKS OK (commit-msg): 3 file(s)

## References
- docs/reports/reviews/task-442/GROUNDER-PLAN.md
- docs/reports/reviews/task-442/TRIAGE-PLAN.md
- docs/reports/reviews/task-442/seat-integration-1.md
- docs/reports/reviews/task-442/seat-reality-check-1.md
- docs/reports/reviews/task-442/seat-regression-1.md
- compliance:eng-all docs/specs/00_engineering_standards.md
- compliance:surface-136 docs/specs/02-web-admin/136_mcfrontend_handbook.md
- compliance:queue-137 docs/specs/00-architecture/137_mcqueue.md
- compliance:agents-s7-s11 docs/specs/00-architecture/08_agents.md
- compliance:surface-128 docs/specs/02-web-admin/128_surface_standard_policy.md
- compliance:surface-126 docs/specs/02-web-admin/126_maxbld_surface_standard.md
- compliance:bylaw-133 docs/specs/01-pipeline/133_bylaw_handbook.md
- compliance:agents-s5-1to3 docs/specs/00-architecture/08_agents.md
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
- RR-0383 Plan 431 question 3: tasks that edit the surface specs keep those specs attached
- RR-0384 Task-430 scope approved: stop the handbook clipping, lines reflect their dated notes, add the 13 lines (item 9 a pointer)
- RR-0140 Operator: faster pushes and GOs asked
- RR-0385 McFix Final plan: Opus plans and builds, engineering seat, two rounds, validation without the operator, unbuilt gates withdrawn, tests are the focus — "proceed. Are there any more questions - Label all realted tasks McFix Final. Ensure the previously mentioned tasks outside this plan are either updated or deleted or kept" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1915)
- RR-0386 Task-367: gates parked, handbook tests start fresh; landing gates A and B is a later decision with its own card
- RR-0387 McFixReborn: each built task gets its own output review and confirmed findings are fixed by ordinary fix tasks; no new infrastructure; old findings dropped
- RR-0388 McFixReborn waits until the new tests are in place — "Let's wait for the McFixReborn until the new tests are in place - does that make sense?" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1947)
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
- RR-0401 investigate the typed 10 percent circulation text on the houseplex option — "This needs to be investigated - it looks like an error to be corrected" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2028)
- RR-0402 circulation text: option A, drop the percent; card opened — "a" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2034)
- RR-0403 circulation text fix merged into task-442; no separate process for task-447 — "a" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2040)
- RR-0404 planner redirect approved: task-447 planner returns a section for task-442 — "approved" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2046)
- RR-0143 Operator answer IMG-1: six lot-size bands
- RR-0405 houseplex size basis wording: the basement, not shared stairs and halls — "option a" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2052)
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
- RR-0385 McFix Final plan: Opus plans and builds, engineering seat, two rounds, validation without the operator, unbuilt gates withdrawn, tests are the focus (names RR-0385) — "proceed. Are there any more questions - Label all realted tasks McFix Final. Ensure the previously mentioned tasks outside this plan are either updated or deleted or kept" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1915)
- RR-0388 McFixReborn waits until the new tests are in place (names task-442, RR-0388) — "Let's wait for the McFixReborn until the new tests are in place - does that make sense?" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1947)
- RR-0392 one push for all four; no other infrastructure beyond this (names RR-0392) — "Push for all 4. I  don't think we need any other infastrcuture beyond this.. we are good to go!" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975)
- RR-0401 investigate the typed 10 percent circulation text on the houseplex option (names RR-0401) — "This needs to be investigated - it looks like an error to be corrected" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2028)
- RR-0402 circulation text: option A, drop the percent; card opened (names RR-0402) — "a" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2034)
- RR-0403 circulation text fix merged into task-442; no separate process for task-447 (names task-442, RR-0403) — "a" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2040)
- RR-0404 planner redirect approved: task-447 planner returns a section for task-442 (names task-442, RR-0404) — "approved" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2046)
- RR-0405 houseplex size basis wording: the basement, not shared stairs and halls (names task-442, RR-0405) — "option a" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2052)
- RR-0407 next push as soon as possible; does not wait for task-442 (names task-442) — "Yes, push as soon as possible." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2063)

## Prior reviews and lane reports
### task-442 (this task)
- docs/reports/reviews/task-442/FINDINGS-PLAN.md
- docs/reports/reviews/task-442/FOLD-CHECK.md
- docs/reports/reviews/task-442/GROUNDER-PLAN.md
- docs/reports/reviews/task-442/QUESTIONS-RULED.md
- docs/reports/reviews/task-442/TRIAGE-PLAN.md
- docs/reports/reviews/task-442/seat-integration-1.md
- docs/reports/reviews/task-442/seat-reality-check-1.md
- docs/reports/reviews/task-442/seat-regression-1.md

## Dependencies
- (none)
