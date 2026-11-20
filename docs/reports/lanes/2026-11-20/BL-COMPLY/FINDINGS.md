# FINDINGS (untriaged): task-365 COMPLY.1, handbook compliance pass on git diff 9f04d9074..3a36e8b26 (src, mobile, scripts)

Lane BL-COMPLY. Nothing here is adjudicated or fixed. A finding is a BUG or DEFER line returned by the DeepSeek compliance lens (.claude/review-templates/lens-compliance.md), copied as returned. The only line added by this lane per finding is "Opened:" (file:line opened at 3a36e8b26: the quoted code is there / is not there). Every finding goes to a separate grounder (Spec 08 section 5.3).

## Question for the grounder (stated, not answered by this lane)

The new route-side entry `src/lib/parcels/report-compute.ts` (LOAD.1, task-266) and the changes it needed inside `scripts/lib/compute` or the core: which McDonald's Airtight gates SCAN those files? A file outside `scripts/lib/compute` may be outside every purity gate. No file under `scripts/lib/` changed in the range (`git diff --name-only 9f04d9074 3a36e8b26 | grep ^scripts/lib` printed nothing), so the question is about `src/lib/parcels/report-compute.ts` itself. The table is the scope glob of each gate, read at the line shown, and whether that glob matches the path `src/lib/parcels/report-compute.ts` (a path match only; whether the file is reachable from a scanned compute module is not claimed):

| Gate | Scope glob or set, file:line | Matches report-compute.ts by path |
|---|---|---|
| ast-grep compute-shape rules (console, bare fetch, wall clock, process.env, forbidden require, literals) | scripts/ast-grep-rules/compute-shape.yml:22-24 `files: 'scripts/lib/compute/**/*.js', 'scripts/steps/_schema/fixtures/compute/**/*.js'` | does not scan |
| check-step-shape.mjs (A2, pre-commit; Spec 122 5.1) | scripts/hooks/check-step-shape.mjs:61 `COMPUTE_DIR = process.env.BUILDO_COMPUTE_DIR // 'scripts/lib/compute'` | does not scan |
| compute-literals.mjs (tunable literals in compute) | scripts/analysis/gates/compute-literals.mjs:34 `COMPUTE_DIR = 'scripts/lib/compute'` | does not scan |
| compute-closure.mjs (G0, what compute can reach) | scripts/analysis/gates/compute-closure.mjs:50 `COMPUTE_GLOB_DIR = 'scripts/lib/compute'`; runner entries :53 `scripts/lib/step/index.js`, `scripts/lib/pipeline.js` | does not scan (it walks outward from scripts/lib/compute; a file that calls into compute is not in the closure by this glob) |
| compute-purity.mjs G1-G13 (SQL and JS halves) | scripts/analysis/gates/compute-purity.mjs:94-106 `scanPurity`: scan set = computeEntries() plus computeClosure().modules, .js/.cjs only (:11 header text) | does not scan (.ts, outside the closure by this definition) |
| ast-grep step-shape.yml | scripts/ast-grep-rules/step-shape.yml:51 and :159 `'scripts/**/*.js'` | does not scan |
| ast-grep bylaw-literal.yml (M-61 no by-law id literal) | scripts/ast-grep-rules/bylaw-literal.yml:21-28 (scripts/analysis/bylaw/**, scripts/lib/maxbld-*.js, scripts/lib/bylaw-*.js, scripts/lib/compute/ files, and the by-law resolver script) | does not scan |
| estate-literals.mjs (R-LA estate scopes) | scripts/analysis/gates/estate-literals.mjs:44 `ESTATE_SCOPES = ['scripts/analysis/gates', 'scripts/lib/step']` | does not scan |
| ast-grep-leads.sh silent-catch-fallback (a footgun rule, not a purity gate) | scripts/hooks/ast-grep-leads.sh:47 `scope_lib="src/lib"`, :59 `ast-grep scan --rule scripts/ast-grep-rules/silent-catch-fallback.yml "$scope_lib"` (run at .husky/pre-commit:52) | scans (src/lib/**) |
| src-sql-ledger.mjs --check (src SQL catalog and closed interpolated set; .husky/pre-commit:23) | scripts/analysis/src-sql-ledger.mjs:82-111 `CLOSED_INTERPOLATED_SET` names src/lib/parcels/report-compute.ts at :111 | scans (named in the closed set) |
| report-no-maths.logic.test.ts (FE-05 AST scan) | src/tests/surfaces/report-no-maths.logic.test.ts:28 `DIRS = ['src/lib/surfaces/report', 'src/components/report', 'src/app/admin/report-preview', 'src/lib/surfaces/report-images']` | does not scan (src/lib/parcels is not in DIRS) |

Not examined by this lane (UNVERIFIED): whether `report-compute.ts` imports a module that a gate scans (reachability is not the glob), the run-time scope of `step-validate.mjs` fast invariants beyond the gates named, and any gate not named in the brief.

## How a task's touched files map to rules, mechanically (asked by the coordinator; facts read in this lane)

| Artifact | What it maps (key to value) | Could it select the rules for a diff with no human choice |
|---|---|---|
| scripts/surfaces/_schema/surface-rule-map.json | `lines[]` = `{id: fe.NN, section}` (44) and `rules[]` = `{id: FE-NN, kind, status, handbook_line, source{file, anchor}}` (44). Rule id to handbook line to register row. No path, glob or file field. | No. It cannot take a file as input. |
| scripts/steps/_schema/rule-map.json | `rules[]` (444): `{id, kind, status, handbook_line, enforcement{kind, ref}, statement, source{file, anchor}}`. Rule id to its handbook line and to the lock file (`enforcement.ref`) that enforces it; `unenforced[]` (100 entries). Rule to file direction only (lock file). | No. No file-to-rule key. |
| scripts/analysis/bylaw/_schema/bylaw-rule-map.json | `rules[]` (546): `{id, kind, status, handbook_line, source{file, anchor}}`; no `enforcement` field on any entry. Rule id to handbook line and register row. | No. |
| src/tests/handbook-rule-map.logic.test.ts, src/tests/surfaces/handbook-rule-map.logic.test.ts | Locks that the committed rule map and handbook equal what the generator builds from the register (Spec 132 and 136); every lock named in a rule entry exists and mentions its rule id. Map to generated text, not to code files. | No. |
| Each spec's "Target Files" section (Spec 126 :1218, Spec 132 :658, Spec 135 :78) | The files that the spec's own change touches (documents, generators, tests). A spec to its own files. | No. It is not a code-file to rule map. |
| Task `Files:` line (read by scripts/hooks/check-task-files.mjs, CHK.1) | task to the files it may change (commit scope), not to rules | No. |
| scripts/surfaces/_schema/bindings.json `modules`, scripts/surfaces/_schema/binding-sources.json, scripts/ast-grep-rules/*.yml `files:` | The scope of individual gates: a gate to its files (globs). This is the only file-to-gate direction in the repo; it is per gate, not per handbook rule. | Partly: for the gates only, by glob (see the table above). Not for the handbook rules. |

Searches behind this answer: opened the three rule maps with `node -e` (keys and one entry each), grep `glob|path` in surface-rule-map.json (no path or glob field), grep "Target Files" in Specs 122, 124, 126, 132 (Spec 122 and 124 have none; 126 and 132 list their own files).

## Method and tool limits found (stated so the grounder can judge coverage)

- The pass ran the compliance lens (`scripts/deepseek-review.js review <diff part> --context <pack> --template .claude/review-templates/lens-compliance.md`), one run per (pack part, diff part). The brief's form (pack and diff in one file) was not usable: `scripts/lib/review-template.js` substitutes the plan placeholder twice in the template (the file is sent twice) and the 120000-character bound is on the doubled prompt. Pack therefore goes in `--context` (once), the diff part in the file (twice); diff parts are cut to 38000 characters or less at file boundaries.
- `substitutePlaceholders` uses `String.replace` with the text as the replacement, so a `$` sequence in a diff or pack (`$&`, `$'`) expands into other text and the placeholder tokens inside a diff are re-substituted. To keep the lens input equal to the real text, every `$` was doubled before the call (so the model sees the original) and the literal placeholder tokens in `diffs/diff-scripts-1.patch` (written with a zero-width space between the braces) were neutralised. A tool defect for the grounder to list: unescaped, the first run of `airtight-p1` on `scripts-1` built a 213932-character prompt.
- The Opened line is a mechanical check: the cited file is read with `git show 3a36e8b26:<path>`, the quote (leading + removed, whitespace collapsed) is searched within 3 lines of the cited line, then in the whole file; a quote the lens wrote with an internal elision (...) or as diff text across lines reads "not there" even if the code exists, so the grounder opens it. Lines where the lens wrote only "none" (no finding of that kind) are not counted as findings.
- The lens returns at most 8 findings per run (its own output format). A run that hit 8 may have had more; the count of BUG/DEFER lines per run is in the run table. MET and REJECT lines are not findings; they are in the pass files.
- Packs are copied whole; where a pack is more than 33000 characters it is split by heading into parts and every part meets every diff part named for it.
- Excluded from the diff (not sent): goldens and fixtures (160 files, 341596 characters of diff: `*.goldens.json`, `*/fixtures/*`, `coa-expected/*`), generated registries (`scripts/steps/_schema/consumer-registry.json`, `scripts/steps/_schema/src-sql-ledger.json`), and test files except the mobile tests (33 test files, 204806 characters of diff in all). Reason: size bound; the test files are the locks, not the product behaviour.

Diff parts sent (each is `git diff 9f04d9074 3a36e8b26 -- <files>`):

- route-1 (36213 characters): src/app/admin/report-preview/page.tsx ; src/app/api/parcels/entitlement/route.ts ; src/app/api/parcels/entitlement/types.ts ; src/app/api/parcels/lookup/route.ts ; src/app/api/parcels/lookup/types.ts ; src/components/report/ReportPage.tsx ; src/lib/admin/report-preview-live/stored-page.ts ; src/lib/entitlements/index.ts ; src/lib/parcels/lot-size-entry.ts ; src/lib/parcels/report-compute.ts
- route-2 (37284 characters): src/lib/parcels/report-page.ts ; src/lib/report-projection/format.ts ; src/lib/report-projection/project.ts ; src/lib/report-projection/read-stored.ts ; src/lib/report-projection/seed-shas.ts ; src/lib/surfaces/maxbld-landing.ts
- mobile-1 (36438 characters): mobile/app/(app)/parcel-tool/[parcelId].tsx ; mobile/app/(app)/parcel-tool/disambiguate.tsx ; mobile/app/(app)/parcel-tool/index.tsx ; mobile/app/(app)/parcel-tool/semi-question.tsx ; mobile/src/components/surfaces/LotMapBinding.tsx ; mobile/src/components/surfaces/SearchBinding.tsx ; mobile/src/components/surfaces/SemiQuestionBinding.tsx ; mobile/src/components/surfaces/SurfaceRenderer.tsx ; mobile/src/constants/lotMap.ts ; mobile/src/constants/parcelSearch.ts
- mobile-2 (18478 characters): mobile/src/hooks/useParcelLookup.ts ; mobile/src/lib/lotForm.ts ; mobile/src/lib/maxbldHelp.ts ; mobile/src/lib/parcelSearchCore.ts ; mobile/src/lib/parcelSearchMatch.ts ; mobile/src/lib/persistFilter.ts ; mobile/src/lib/schemas.ts ; mobile/src/lib/semiQuestion.ts
- mobile-tests-1 (37410 characters): mobile/__tests__/lotMapPage.behaviour.test.tsx ; mobile/__tests__/lotMapScreens.golden.test.ts ; mobile/__tests__/maxbldHelp.test.ts ; mobile/__tests__/parcelScreens.golden.test.ts ; mobile/__tests__/parcelSearchScreen.behaviour.test.tsx ; mobile/__tests__/reportScreen.mount.behaviour.test.tsx ; mobile/__tests__/reportScreens.golden.test.ts ; mobile/__tests__/semiQuestionPage.behaviour.test.tsx ; mobile/__tests__/semiQuestionScreens.golden.test.ts ; mobile/__tests__/useParcelLookup.test.ts
- surface-1 (38215 characters): mobile/src/generated/surfaces/mobile_parcel_disambiguation_map.json ; mobile/src/generated/surfaces/mobile_parcel_search.json ; scripts/surfaces/_schema/bindings.json ; scripts/surfaces/_schema/census/contracts.json ; scripts/surfaces/_schema/census/mobile-product.json ; scripts/surfaces/_schema/report-presentation.json ; scripts/surfaces/_schema/seed-report-v2.mjs ; scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_disambiguation_map.content.json ; scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.content.json
- surface-2 (31310 characters): scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.descriptor.json ; scripts/surfaces/parcel_product/F02/contracts/contract_parcels_entitlement.descriptor.json ; scripts/surfaces/parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json ; scripts/surfaces/parcel_product/F06/surfaces/web_landing.sample.json ; src/components/surfaces/web/SearchBinding.tsx ; src/components/surfaces/web/StaticBinding.tsx ; src/components/surfaces/web/footerNode.ts
- scripts-1 (24020 characters): scripts/analysis/backlog-lane.mjs ; scripts/analysis/proof-slice.mjs ; scripts/analysis/proof-slices.json ; scripts/analysis/src-sql-ledger.mjs ; scripts/deepseek-review.js
- load1-1 (35735 characters): src/lib/parcels/report-compute.ts ; src/app/api/parcels/lookup/route.ts ; src/tests/customer-report-compute.logic.test.ts
- load1-2 (7709 characters): src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts ; src/tests/steps/compute_maxbld_scenarios/runtime-loader.logic.test.ts

## Coverage table

Rules total = rules in the whole copied list; sent = rules sent to the lens (every part of the pack meets every diff part named for it in the run table); with a machine check and with none are as the source itself says (named enforcer in the list, rule-map enforcement kind, or the check's own header); "not tabulated" = the source holds no per-rule enforcement field, so this lane did not invent one.

| Handbook (pack) | Source | Rules total | Rules sent | With a machine check | With none |
|---|---|---|---|---|---|
| fe (McFrontend handbook, Spec 136 section 2) | docs/specs/02-web-admin/136_mcfrontend_handbook.md:32-165 | 44 | 44 | 35 name a lock (Enforced by: path); 8 are OWED (lock still to land); 1 other line | 8 OWED + 1 other |
| step (Spec 132 sections 2, 3, 4, 6) | docs/specs/01-pipeline/132_step_standard_handbook.md:122-463, 503-591 | 65 handbook lines (rule-map ids on those lines: 427 of 444) | 65 lines (427 ids) | 363 ids on the sent lines: 324 lock, 37 check, 1 hook, 1 lock-db (of 444: 325 lock, 37 check, 1 hook, 1 lock-db = 364) | 64 ids on the sent lines (of 444: 80 none); the section 6 table lists the 80 and 30 partial |
| bylaw (Spec 133 section 2) | docs/specs/01-pipeline/133_bylaw_handbook.md:28-1826 | 543 | 543 | 426 lines name an enforcer | 117 lines read "Enforced by: OWED" |
| storage (doc-16, whole) | backlog/docs/doc-16 - McStorage-policy-v2.md:1-141 | 12 rules P1-P12 | 12 | 3 named by scripts/analysis/policy-checks/chk5-mcstorage.mjs:1 (P3, P4, P6) | 9 (P1, P2, P5, P7-P12); doc-16 is DRAFT |
| queue (Spec 137 sections 2-6) | docs/specs/00-architecture/137_mcqueue.md:33-176 | 14 numbered rules | 14 | 2 (rule 3 and rule 4 for plan tasks: scripts/hooks/check-backlog-task.mjs, scripts/analysis/backlog-decision.mjs, named in the McLane note 137:23-24) | 12 (stated by Spec 137 section 6 "Deferred": the commit check is not built) |
| spec08 (sections 7 and 11) | docs/specs/00-architecture/08_agents.md:330-346, 453-516 | 34 items by pattern | 34 | not tabulated (source has no per-rule enforcement field) | not tabulated |
| airtight (V1 R-BA, V2 R-BF, V3 R-BZ/R-CA/R-DT/R-EY, 122 5.5, 122a A26/A27) | docs/specs/01-pipeline/124a_step_standard_policy_appendix.md:240,245,254,280-281,511,943; 122:800-850, :1040-1053; 122a:753-818 | 6 register rows by pattern | 6 | the pack IS the gate specification: gates named in its text (compute-shape.yml, check-step-shape.mjs, step-validate.mjs, gates/compute-*.mjs) | not tabulated |
| mobile-core (Spec 90 all, Spec 98 all, .claude/domain-admin.md) | docs/specs/03-mobile/90_*.md, 98_*.md; .claude/domain-admin.md | 29 headings | 29 | not tabulated (no per-rule enforcement field) | not tabulated |
| mobile-99 (Spec 99 whole) | docs/specs/03-mobile/99_mobile_state_architecture.md | 10 sections | 10 | not tabulated | not tabulated |
| mobile-100 (Spec 100 whole) | docs/specs/03-mobile/100_mobile_parcel_cost_tool.md | 7 sections | 7 | not tabulated | not tabulated |
| mobile-96 (Spec 96 whole) | docs/specs/03-mobile/96_mobile_subscription.md | 11 sections | 11 | not tabulated | not tabulated |
| eng (docs/specs/00_engineering_standards.md whole) | docs/specs/00_engineering_standards.md | 14 sections | 14 | not tabulated | not tabulated |

Not in a pack, named so the gap is visible: the Spec 135 register rows in full (the Spec 136 line is the one-line form of each row; the row text is the authority), McProof rows M-436..M-447 in Spec 69a, Spec 132 sections 1, 5, 7 and the glossary, Spec 133 sections 3 and 4, Spec 126 and Spec 128 text.

## Runs

| Pack part | Diff part | Prompt chars (pack + 2 x diff + template estimate) | BUG | DEFER | MET | REJECT | Verdict line | Clauses checked line |
|---|---|---|---|---|---|---|---|---|
| airtight-p1 | load1-1 | 108726 | 3 | 2 | 3 | 2 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 22   Unmet: 5 |
| airtight-p1 | load1-2 | 52644 | 0 | 0 | 0 | 6 | VERDICT: PASS on compliance with the pasted clauses | Clauses checked: 6   Unmet: 0 |
| airtight-p1 | route-1 | 109684 | 2 | 2 | 2 | 2 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 9   Unmet: 2 |
| airtight-p1 | route-2 | 111826 | 1 | 3 | 0 | 3 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 9   Unmet: 2 |
| airtight-p1 | scripts-1 | 85300 | 1 | 2 | 3 | 2 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 12   Unmet: 2 |
| airtight-p2 | load1-1 | 84264 | 2 | 3 | 4 | 1 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 7   Unmet: 2 |
| airtight-p2 | load1-2 | 28182 | 0 | 1 | 3 | 3 | VERDICT: PASS on compliance with the pasted clauses | Clauses checked: 18   Unmet: 0 |
| airtight-p2 | route-1 | 85222 | 2 | 3 | 6 | 1 | VERDICT: PASS on compliance with the pasted clauses | Clauses checked: 13   Unmet: 2 |
| airtight-p2 | route-2 | 87364 | 4 | 1 | 3 | 2 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 19   Unmet: 3 |
| airtight-p2 | scripts-1 | 60838 | 1 | 3 | 1 | 2 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 6   Unmet: 1 |
| bylaw-p1 | load1-1 | 109779 | 0 | 5 | 4 | 0 | VERDICT: PASS on compliance with the pasted clauses | Clauses checked: 6   Unmet: 0 |
| bylaw-p1 | load1-2 | 53697 | 0 | 2 | 3 | 2 | VERDICT: PASS on compliance with the pasted clauses | Clauses checked: 6   Unmet: 0 |
| bylaw-p1 | route-1 | 110737 | 0 | 5 | 4 | 1 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 8   Unmet: 3 |
| bylaw-p1 | route-2 | 112879 | 0 | 4 | 3 | 2 | VERDICT: PASS on compliance with the pasted clauses | Clauses checked: 10   Unmet: 0 |
| bylaw-p2 | load1-1 | 109946 | 1 | 4 | 5 | 2 | VERDICT: PASS on compliance with the pasted clauses | Clauses checked: 10   Unmet: 0 |
| bylaw-p2 | load1-2 | 53864 | 0 | 3 | 3 | 2 | VERDICT: PASS on compliance with the pasted clauses | Clauses checked: 7   Unmet: 0 |
| bylaw-p2 | route-1 | 110904 | 0 | 5 | 4 | 2 | VERDICT: PASS on compliance with the pasted clauses | Clauses checked: 8   Unmet: 0 |
| bylaw-p2 | route-2 | 113046 | 1 | 4 | 2 | 1 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 12   Unmet: 4 |
| bylaw-p3 | load1-1 | 109783 | 0 | 4 | 4 | 0 | VERDICT: PASS on compliance with the pasted clauses | Clauses checked: 8   Unmet: 0 |
| bylaw-p3 | load1-2 | 53701 | 0 | 3 | 2 | 0 | VERDICT: PASS on compliance with the pasted clauses | Clauses checked: 4   Unmet: 0 |
| bylaw-p3 | route-1 | 110741 | 0 | 2 | 3 | 1 | VERDICT: PASS on compliance with the pasted clauses | Clauses checked: 6   Unmet: 0 |
| bylaw-p3 | route-2 | 112883 | 3 | 3 | 4 | 1 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 11   Unmet: 6 |
| bylaw-p4 | load1-1 | 101720 | 0 | 3 | 4 | 1 | VERDICT: PASS on compliance with the pasted clauses | Clauses checked: 6   Unmet: 0 |
| bylaw-p4 | load1-2 | 45638 | 0 | 3 | 3 | 3 | VERDICT: PASS on compliance with the pasted clauses | Clauses checked: 14   Unmet: 0 |
| bylaw-p4 | route-1 | 102678 | 2 | 3 | 3 | 1 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 9   Unmet: 4 |
| bylaw-p4 | route-2 | 104820 | 2 | 4 | 3 | 2 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 22   Unmet: 6 |
| eng-p1 | load1-1 | 108772 | 1 | 6 | 5 | 1 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 14   Unmet: 5 |
| eng-p1 | load1-2 | 52690 | 1 | 4 | 5 | 0 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 9   Unmet: 2 |
| eng-p1 | mobile-1 | 110156 | 2 | 5 | 4 | 2 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 12   Unmet: 2 |
| eng-p1 | mobile-2 | 74504 | 1 | 2 | 5 | 1 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 15   Unmet: 3 |
| eng-p1 | mobile-tests-1 | 112120 | 2 | 3 | 4 | 1 | VERDICT: FAIL | Clauses checked: 15   Unmet: 5 |
| eng-p1 | route-1 | 109730 | 5 | 3 | 5 | 0 | VERDICT: FAIL | Clauses checked: 14   Unmet: 5 |
| eng-p1 | route-2 | 111872 | 2 | 4 | 4 | 2 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 22   Unmet: 4 |
| eng-p1 | scripts-1 | 85346 | 2 | 3 | 3 | 1 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 11   Unmet: 2 |
| eng-p1 | surface-1 | 113840 | 1 | 7 | 5 | 0 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 11   Unmet: 1 |
| eng-p1 | surface-2 | 99956 | 4 | 4 | 5 | 2 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 14   Unmet: 4 |
| eng-p2 | load1-1 | 90523 | 1 | 2 | 3 | 2 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 22   Unmet: 3 |
| eng-p2 | load1-2 | 34441 | 0 | 3 | 3 | 0 | VERDICT: PASS on compliance with the pasted clauses | Clauses checked: 6   Unmet: 0 |
| eng-p2 | mobile-1 | 91907 | 0 | 4 | 3 | 2 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 12   Unmet: 3 |
| eng-p2 | mobile-2 | 56255 | 0 | 4 | 6 | 1 | VERDICT: PASS on compliance with the pasted clauses, no CRIT and no HIGH | Clauses checked: 14   Unmet: 3 |
| eng-p2 | mobile-tests-1 | 93871 | 1 | 3 | 3 | 2 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 9   Unmet: 4 |
| eng-p2 | route-1 | 91481 | 1 | 4 | 3 | 1 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 14   Unmet: 5 |
| eng-p2 | route-2 | 93623 | 2 | 3 | 4 | 1 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 18   Unmet: 4 |
| eng-p2 | scripts-1 | 67097 | 0 | 5 | 4 | 1 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 11   Unmet: 5 |
| eng-p2 | surface-1 | 95591 | 5 | 1 | 4 | 0 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 10   Unmet: 6 |
| eng-p2 | surface-2 | 81707 | 2 | 2 | 2 | 2 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 8   Unmet: 2 |
| fe | load1-1 | 90535 | 4 | 1 | 5 | 3 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 18   Unmet: 3 |
| fe | load1-2 | 34453 | 0 | 2 | 3 | 2 | VERDICT: PASS on compliance with the pasted clauses | Clauses checked: 44   Unmet: 0 |
| fe | mobile-1 | 91919 | 2 | 3 | 4 | 2 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 13   Unmet: 5 |
| fe | mobile-2 | 56267 | 0 | 3 | 2 | 2 | VERDICT: PASS on compliance with the pasted clauses | Clauses checked: 8   Unmet: 0 |
| fe | mobile-tests-1 | 93883 | 0 | 6 | 4 | 0 | VERDICT: PASS on compliance with the pasted clauses | Clauses checked: 8   Unmet: 0 |
| fe | route-1 | 91493 | 2 | 3 | 2 | 1 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 13   Unmet: 3 |
| fe | route-2 | 93635 | 2 | 5 | 3 | 1 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 16   Unmet: 6 |
| fe | surface-1 | 95603 | 2 | 3 | 3 | 0 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 16   Unmet: 2 |
| fe | surface-2 | 81719 | 3 | 1 | 3 | 0 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 44   Unmet: 3 |
| mobile-100-p1 | mobile-1 | 91435 | 0 | 5 | 2 | 1 | VERDICT: PASS on compliance with the pasted clauses | Clauses checked: 18   Unmet: 0 |
| mobile-100-p1 | mobile-2 | 55783 | 2 | 2 | 3 | 3 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 8   Unmet: 2 |
| mobile-100-p1 | mobile-tests-1 | 93399 | 1 | 4 | 1 | 1 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 5   Unmet: 1 |
| mobile-100-p2 | mobile-1 | 109565 | 4 | 5 | 4 | 1 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 12   Unmet: 4 |
| mobile-100-p2 | mobile-2 | 73913 | 1 | 6 | 4 | 1 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 12   Unmet: 3 |
| mobile-100-p2 | mobile-tests-1 | 111529 | 1 | 4 | 4 | 0 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 9   Unmet: 1 |
| mobile-100-p3 | mobile-1 | 80871 | 1 | 3 | 2 | 2 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 7   Unmet: 1 |
| mobile-100-p3 | mobile-2 | 45219 | 1 | 5 | 5 | 2 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 6   Unmet: 2 |
| mobile-100-p3 | mobile-tests-1 | 82835 | 5 | 2 | 3 | 1 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 11   Unmet: 5 |
| mobile-96-p1 | mobile-1 | 99819 | 0 | 5 | 1 | 1 | VERDICT: PASS on compliance with the pasted clauses | Clauses checked: 6   Unmet: 0 |
| mobile-96-p1 | mobile-2 | 64167 | 0 | 5 | 2 | 1 | VERDICT: PASS on compliance with the pasted clauses | Clauses checked: 4   Unmet: 0 |
| mobile-96-p1 | mobile-tests-1 | 101783 | 0 | 6 | 2 | 0 | VERDICT: PASS on compliance with the pasted clauses | Clauses checked: 3   Unmet: 0 |
| mobile-96-p2 | mobile-1 | 93724 | 0 | 3 | 3 | 0 | VERDICT: PASS on compliance with the pasted clauses | Clauses checked: 4   Unmet: 0 |
| mobile-96-p2 | mobile-2 | 58072 | 2 | 2 | 3 | 1 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 6   Unmet: 2 |
| mobile-96-p2 | mobile-tests-1 | 95688 | 0 | 6 | 1 | 1 | VERDICT: PASS on compliance with the pasted clauses | Clauses checked: 11   Unmet: 0 |
| mobile-99-p1 | mobile-1 | 111006 | 2 | 4 | 3 | 2 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 10   Unmet: 3 |
| mobile-99-p1 | mobile-2 | 75354 | 6 | 1 | 4 | 1 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 10   Unmet: 4 |
| mobile-99-p1 | mobile-tests-1 | 112970 | 1 | 4 | 3 | 0 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 13   Unmet: 3 |
| mobile-99-p2 | mobile-1 | 110507 | 0 | 4 | 5 | 1 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 14   Unmet: 1 |
| mobile-99-p2 | mobile-2 | 74855 | 3 | 3 | 5 | 1 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 12   Unmet: 3 |
| mobile-99-p2 | mobile-tests-1 | 112471 | 0 | 5 | 3 | 1 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 6   Unmet: 1 |
| mobile-99-p3 | mobile-1 | 97281 | 3 | 2 | 2 | 1 | VERDICT: FAIL on compliance with the pasted clauses, no pasted clause is violated, but three substantive added behaviours rest on rulings absent from the pasted context so their compliance cannot be established | Clauses checked: 5   Unmet: 3 |
| mobile-99-p3 | mobile-2 | 61629 | 0 | 3 | 4 | 2 | VERDICT: PASS on compliance with the pasted clauses | Clauses checked: 12   Unmet: 0 |
| mobile-99-p3 | mobile-tests-1 | 99245 | 0 | 1 | 3 | 0 | VERDICT: PASS on compliance with the pasted clauses | Clauses checked: 3   Unmet: 0 |
| mobile-core | mobile-1 | 110980 | 0 | 5 | 5 | 2 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 16   Unmet: 1 |
| mobile-core | mobile-2 | 75328 | 1 | 5 | 5 | 1 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 15   Unmet: 2 |
| mobile-core | mobile-tests-1 | 112944 | 0 | 3 | 5 | 0 | VERDICT: PASS on compliance with the pasted clauses | Clauses checked: 9   Unmet: 0 |
| mobile-core | surface-1 | 114664 | 3 | 4 | 3 | 0 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 7   Unmet: 3 |
| mobile-core | surface-2 | 100780 | 2 | 5 | 3 | 2 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 11   Unmet: 2 |
| queue | scripts-1 | 71542 | 0 | 4 | 4 | 1 | VERDICT: PASS on compliance with the pasted clauses | Clauses checked: 17   Unmet: 0 |
| spec08 | scripts-1 | 80773 | 3 | 2 | 6 | 2 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 16   Unmet: 3 |
| step-p1 | load1-1 | 106399 | 5 | 0 | 3 | 1 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 7   Unmet: 5 |
| step-p1 | load1-2 | 50317 | 1 | 2 | 3 | 2 | VERDICT: PASS on compliance with the pasted clauses | Clauses checked: 12   Unmet: 1 |
| step-p1 | route-1 | 107357 | 6 | 1 | 2 | 0 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 8   Unmet: 6 |
| step-p1 | route-2 | 109499 | 1 | 3 | 2 | 4 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 14   Unmet: 3 |
| step-p1 | scripts-1 | 82973 | 2 | 2 | 2 | 1 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 9   Unmet: 2 |
| step-p2 | load1-1 | 94979 | 1 | 3 | 3 | 0 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 10   Unmet: 3 |
| step-p2 | load1-2 | 38897 | 0 | 4 | 1 | 0 | VERDICT: PASS on compliance with the pasted clauses | Clauses checked: 5   Unmet: 0 |
| step-p2 | route-1 | 95937 | 1 | 4 | 2 | 1 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 14   Unmet: 1 |
| step-p2 | route-2 | 98079 | 4 | 2 | 0 | 0 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 10   Unmet: 4 |
| step-p2 | scripts-1 | 71553 | 0 | 3 | 3 | 2 | VERDICT: PASS on compliance with the pasted clauses | Clauses checked: 7   Unmet: 0 |
| storage-p1 | load1-1 | 107299 | 2 | 2 | 3 | 1 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 11   Unmet: 4 |
| storage-p1 | load1-2 | 51217 | 1 | 3 | 2 | 1 | VERDICT: PASS on compliance with the pasted clauses | Clauses checked: 6   Unmet: 0 |
| storage-p1 | route-1 | 108257 | 2 | 5 | 4 | 2 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 11   Unmet: 5 |
| storage-p1 | route-2 | 110399 | 1 | 6 | 4 | 1 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 11   Unmet: 5 |
| storage-p2 | load1-1 | 80333 | 0 | 3 | 2 | 1 | VERDICT: PASS on compliance with the pasted clauses | Clauses checked: 6   Unmet: 0 |
| storage-p2 | load1-2 | 24251 | 0 | 2 | 0 | 3 | VERDICT: PASS on compliance with the pasted clauses | Clauses checked: 18   Unmet: 0 |
| storage-p2 | route-1 | 81291 | 0 | 5 | 2 | 1 | VERDICT: PASS on compliance with the pasted clauses | Clauses checked: 18   Unmet: 0 |
| storage-p2 | route-2 | 83433 | 1 | 4 | 4 | 0 | VERDICT: FAIL on compliance with the pasted clauses | Clauses checked: 9   Unmet: 1 |

## Findings count per handbook

| Handbook | Runs | BUG | DEFER | Findings (BUG + DEFER) | MET | REJECT |
|---|---|---|---|---|---|---|
| airtight | 10 | 16 | 20 | 36 | 25 | 24 |
| bylaw | 16 | 9 | 57 | 66 | 54 | 21 |
| eng | 20 | 33 | 72 | 105 | 80 | 22 |
| fe | 9 | 15 | 27 | 42 | 29 | 11 |
| mobile-100 | 9 | 16 | 36 | 52 | 28 | 12 |
| mobile-96 | 6 | 2 | 27 | 29 | 12 | 4 |
| mobile-99 | 9 | 15 | 27 | 42 | 32 | 9 |
| mobile-core | 5 | 6 | 22 | 28 | 21 | 5 |
| queue | 1 | 0 | 4 | 4 | 4 | 1 |
| spec08 | 1 | 3 | 2 | 5 | 6 | 2 |
| step | 10 | 21 | 24 | 45 | 21 | 11 |
| storage | 8 | 7 | 30 | 37 | 21 | 10 |

## Findings (as returned)

### F-001 · airtight (airtight-p1) · diff part load1-1 · BUG severity=HIGH
- Clause: R-BF "every step-registry and cross-step-ledger row generated or witnessed, never hand-kept; declared == observed"
- Diff: src/lib/parcels/report-compute.ts:35 "const UNITS_SQL = 'SELECT unit_key, unit_id FROM bylaw_resolution_units';"
- Lens claim: the entry hand-copies the step descriptor's two role-lookup reads as static SQL and becomes a new `src/` reader of the step's tables ("CONSUMERS (every reader of the step's tables/columns and `records_meta` keys, across all chains and `src/`)"), with no registry or consumer row generated or regenerated in the diff, so declared==observed for this new reader is hand-kept
- Lens fix or rationale: derive the two statements from the descriptor's declared `inputs.reads.tables` (or call the step library's own lookup reader) and record the src consumer in the step registry.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:35 the quoted code is there

### F-002 · airtight (airtight-p1) · diff part load1-1 · BUG severity=MED
- Clause: 122 §6.6.1(b) "An executed-SQL witness during golden captures, every statement parsed with the real Postgres grammar (`libpg-query`), touched ≡ declared"
- Diff: src/lib/parcels/report-compute.ts:93 "const row = (await pool.query<Json>(plan.batch_sql, [lot.id - 1, 1])).rows[0];"
- Lens claim: a new runtime web path executes descriptor-generated SQL plus two hand-written statements, and the witness "records every SQL statement a step runs ... loaded only on a capture's run 1", so nothing establishes touched ≡ declared for what this path reads
- Lens fix or rationale: run this path's statements through the witness once (or derive them from the descriptor so the declared set is exact) before the path is called compliant.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:93 the quoted code is there

### F-003 · airtight (airtight-p1) · diff part load1-1 · BUG severity=MED
- Clause: 122 §5.5 item 6 "freezes, and stamps the resolved values into `records_meta.config`"
- Diff: src/lib/parcels/report-compute.ts:88 "const plan = buildSourceSql(descriptor, { ...config, [POPULATION_SETTING]: [String(lot.id)] }, {});"
- Lens claim: the population list is written into the config object after `resolveConfig`, so the core runs on an unfrozen extension that never passed `min`/`max` + `on_invalid` and is not the set stamped, contra "an undeclared name is *unreachable*, not merely unvalidated"
- Lens fix or rationale: pass the one-lot population through the declared variable at resolution time, or through the step library's own argument, never a post-projection override.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:88 the quoted code is there

### F-006 · airtight (airtight-p1) · diff part route-1 · BUG severity=HIGH
- Clause: R-BF §6.6.1(a) "are **100% mechanical**: generated from code/runtime or witnessed from executed SQL, never hand-authored"
- Diff: src/lib/parcels/report-compute.ts:36 "const UNITS_SQL = 'SELECT unit_key, unit_id FROM bylaw_resolution_units';" and the file's own "A drift from the descriptor's declared lookup tables and columns fails src/tests/customer-report-compute.logic.test.ts (C2)"
- Lens claim: the new compute entry hand-writes relation SQL and its only declared==observed guard is a test name, which the walk rule says is UNMET
- Lens fix or rationale: fix: have the entry reuse the descriptor/core's own lookup read (generated), or move the relation reads inside the gated scope so a closed-answer gate witnesses them.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:36 the quoted code is not there (not found in the file at 3a36e8b26)

### F-007 · airtight (airtight-p1) · diff part route-1 · BUG severity=MED
- Clause: Spec 122 §5.5 item 6 "Every tunable goes through `ctx.config` ... applies `min`/`max` + `on_invalid` ... an undeclared name is *unreachable*, not merely unvalidated"
- Diff: src/lib/parcels/report-compute.ts "const plan = buildSourceSql(descriptor, { ...config, [POPULATION_SETTING]: [String(lot.id)] }, {});"
- Lens claim: the value that selects the batch row is injected into the resolved config after the projection, so min/max/on_invalid and the declared-name check never see it
- Lens fix or rationale: fix: resolve the population setting through the declared config path, or pass the lot id as a plan opt/bind instead of overriding config.
- Opened: file opened: src/lib/parcels/report-compute.ts no line number was given; the quoted code is there (line 87)

### F-010 · airtight (airtight-p1) · diff part route-2 · BUG severity=HIGH
- Clause: procedure rule (walk step 3) "A clause satisfied only by a comment, a TODO or a test name is UNMET."
- Diff: src/lib/parcels/report-page.ts:9 "+// MB-44 W (task-123, 1.3; operator "1. it has to happen now - read the objectives", MORNING-DECISIONS.md:789, and "task 341 approved", :1160)"
- Lens claim: the entire new customer read path (stored read, freshness serving rule, LOAD.1 miss rule) rests on operator rulings that exist only as a self-quote inside the changed file; none of MORNING-DECISIONS.md:789, :1160, task-123 or task-266 LOAD.1 is pasted in the context, so no clause authorizing this behaviour can be checked clause by clause
- Lens fix or rationale: fix: paste MORNING-DECISIONS.md:789 and :1160 plus the LOAD.1 (task-266) ruling into the review context, or revert the producer until they are pasted.
- Opened: file:line opened: src/lib/parcels/report-page.ts:9 the quoted code is there

### F-014 · airtight (airtight-p1) · diff part scripts-1 · BUG severity=HIGH
- Clause: Spec 122 §6.6.1(c) "Until this programme lands, no registry or ledger row may be described as accurate unless it is generated, enforced or witnessed."
- Diff: scripts/analysis/src-sql-ledger.mjs:111 "'src/lib/parcels/report-compute.ts', // LOAD.1 (task-266, dated note 2026-11-19): ... passed as a variable; no request text enters it"
- Lens claim: the 30th interpolated-SQL ledger row is justified by hand-written prose, and the pasted text says the ledger's own check is "enforced only for statically parsed `src/` SQL (not interpolated statements)", so this row is neither generated, enforced nor witnessed
- Lens fix or rationale: fix: attach a witness trace for the statement (docs/reports/witness/, §6.6.1(e)) or make the statement static so it enters the parsed set, and drop the prose claim in scripts/analysis/src-sql-ledger.mjs:78-80 that says the row is safe.
- Opened: file:line opened: scripts/analysis/src-sql-ledger.mjs:111 the quoted code is not there (not found in the file at 3a36e8b26)

### F-017 · airtight (airtight-p2) · diff part load1-1 · BUG severity=HIGH
- Clause: no pasted clause (the pasted rule list holds only ledger, witness and trap rules; no pasted operator ruling names a meter change)
- Diff: src/app/api/parcels/lookup/route.ts:180 "else if (access === 'parcel_tool' && body.parcel && parcelRef !== null && body.lotForm?.unsure === true && semi !== 'answered') meter = 'semi_pending';"
- Lens claim: the change moves who is charged (an unsure lot now counts on the retry instead of staying semi_pending) and its only justification is a code comment naming task-360/RR-0278, which the pasted context does not contain, so per "a clause satisfied only by a comment ... is UNMET" this behaviour is unruled
- Lens fix or rationale: paste RR-0278/task-360 verbatim into the review context, or drop the meter condition from this change.
- Opened: file:line opened: src/app/api/parcels/lookup/route.ts:180 the quoted code is there

### F-018 · airtight (airtight-p2) · diff part load1-1 · BUG severity=HIGH
- Clause: no pasted clause names the new `semi` request parameter, and the schema that must declare it is not in the diff
- Diff: src/app/api/parcels/lookup/route.ts:90 "semi: sp.get('semi') ?? undefined,"
- Lens claim: `ConsumerParcelLookupQuerySchema` is untouched by the diff and the repo's Zod objects strip undeclared keys, so cannot see that `semi` survives the parse; if it is stripped, `held` is true for every unsure lot on every request, the Continue call can never produce a page (meter can never leave semi_pending) and "semi_answered: semi === 'answered'" always logs false
- Lens fix or rationale: include the schema diff that declares `semi`, or read the flag from `sp` before the parse.
- Opened: file:line opened: src/app/api/parcels/lookup/route.ts:90 the quoted code is there

### F-023 · airtight (airtight-p2) · diff part route-1 · BUG severity=MED
- Clause: A27 #5 "Emits: every key the compute emits is a declared `emits[]` entry (gate C, measured at capture)."
- Diff: src/lib/parcels/report-compute.ts:51 "function toStoredRow(r: Json): StoredRow {"
- Lens claim: the core's output is re-mapped at a second caller by a hand-written 14-field list, so an emits key added after the capture is silently dropped here and gate C, which measures at capture only, never witnesses this path
- Lens fix or rationale: build the row from the descriptor's declared emits[] and throw on a key the core emits that the list does not consume.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:51 the quoted code is there

### F-024 · airtight (airtight-p2) · diff part route-1 · BUG severity=MED
- Clause: A27 #13 "A test that needs Postgres is `*.db.test.ts` ... under `src/tests/db/`, or beside its step under `src/tests/steps/<slug>/`."
- Diff: src/lib/parcels/report-compute.ts:32 "fails src/tests/customer-report-compute.logic.test.ts (C2)"
- Lens claim: the only test named for this module that runs three live statements is a logic test outside both DB paths, and the diff adds no `*.db.test.ts`, so UNITS_SQL, TEXTS_SQL and plan.batch_sql have no DB witness
- Lens fix or rationale: add a `*.db.test.ts` under `src/tests/db/` (or `src/tests/steps/`) covering the three reads, or state in the file that the logic test never reaches Postgres.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:32 the quoted code is there

### F-028 · airtight (airtight-p2) · diff part route-2 · BUG severity=HIGH
- Clause: step 4 (behaviour no pasted clause names) "A change that adds behaviour no pasted clause or ruling names is a finding (nothing added that the card or ruling did not name)"
- Diff: src/lib/surfaces/maxbld-landing.ts:147 "const report: StaticReport = { sample: view, footer: pickFooterText(SEARCH_CONTENT), ...(demo ? { demo } : {}), ...(picture ? { picture } : {}) };"
- Lens claim: the landing footer text is new runtime behaviour in a file this change otherwise does not touch for its stated purpose; no pasted clause or ruling names a landing footer, and the comment above it justifies only the sample picture
- Lens fix or rationale: split the footer line into the card that names it, or drop it from this diff
- Opened: file:line opened: src/lib/surfaces/maxbld-landing.ts:147 the quoted code is there

### F-029 · airtight (airtight-p2) · diff part route-2 · BUG severity=HIGH
- Clause: no pasted clause (the miss rule is cited as "doc-16 section 4", "D2" and "LOAD.1 (task-266)"; none of those is in the pasted context, cannot see) "current and gated serve the page (a gated lot is a deliberate all-not-evaluated page, not a miss); out_of_date is a miss"
- Diff: src/lib/parcels/report-page.ts:44 "return stored.response as unknown as Json;" and :46 "return null;"
- Lens claim: the serve-or-miss decision for every stored record rests on clauses that are not pasted, so compliance with them cannot be established from the material given
- Lens fix or rationale: paste doc-16 section 4, D2 and LOAD.1 verbatim, or hold this hunk until its ruling is in the context
- Opened: file:line opened: src/lib/parcels/report-page.ts:44 the quoted code is not there (not found in the file at 3a36e8b26)

### F-030 · airtight (airtight-p2) · diff part route-2 · BUG severity=MED
- Clause: rule 3 in the walk list (a clause satisfied only by a comment is UNMET) "A clause satisfied only by a comment, a TODO or a test name is UNMET."
- Diff: src/lib/parcels/report-page.ts:9 "It is gated by the one web live switch (MAXBLD_WEB_LIVE, pinned false until LS.12), so with the switch off it answers" vs :57 "if (!MAXBLD_WEB_LIVE) return null;"
- Lens claim: the pin that keeps the customer read dark until LS.12 exists only as a comment plus an import; src/lib/surfaces/maxbld-web.ts is not in the diff, so the pinned value cannot be seen
- Lens fix or rationale: paste the maxbld-web.ts definition of MAXBLD_WEB_LIVE (value and pin) with the ruling that pins it
- Opened: file:line opened: src/lib/parcels/report-page.ts:9 the quoted code is not there (not found in the file at 3a36e8b26)

### F-031 · airtight (airtight-p2) · diff part route-2 · BUG severity=MED
- Clause: Ledger key and locks (unparsed SQL closed set, orphan rule) "a listed literal that now parses or is gone is RED (orphan)"
- Diff: src/lib/report-projection/read-stored.ts:7 "Moved here unchanged from stored-page.ts (MB-93): the four statements, the K2 lineage CASE, the column check." with :21 "const PARCEL_SQL = `SELECT id, parcel_id, zoning_zn_string, lot_size_sqm, is_corner_lot,"
- Lens claim: four SQL literals move into a new file and the diff carries no ledger-row change, so either the stored-page.ts rows are now orphans or the four new sites are unlisted; the claim "the src SQL ledger witnesses it" (:18) is a comment only
- Lens fix or rationale: paste the ledger diff, or the same-commit proof that the four keys are unchanged
- Opened: file:line opened: src/lib/report-projection/read-stored.ts:7 the quoted code is not there (not found in the file at 3a36e8b26)

### F-033 · airtight (airtight-p2) · diff part scripts-1 · BUG severity=HIGH
- Clause: Ledger key and locks, "literals that do not parse go into a closed set generated by the gate's own `sql-lineage.mjs` render (with a retry), never hand-listed
- Diff: the `CLOSED_INTERPOLATED_SET` precedent"
- Lens claim: scripts/analysis/src-sql-ledger.mjs:111 "src/lib/parcels/report-compute.ts', // LOAD.1 (task-266, dated note 2026-11-19): the batch statement text is built by the Layer 3 step's own core"
- Lens fix or rationale: the closed set is hand-edited with no gate render shown, so the generated-never-hand-listed precedent the clause names is unmet — regenerate CLOSED_INTERPOLATED_SET with the gate's own sql-lineage render and commit that output, or paste the render that produced this entry.
- Opened: no file:line in the field as returned: the `CLOSED_INTERPOLATED_SET` precedent"

### F-053 · bylaw (bylaw-p2) · diff part load1-1 · BUG severity=<none raised>
- Clause: m.64 "Only permitted scenarios are shown; every other scenario is recorded, counted and never displayed."
- Diff: the display arm is met (report-compute.ts:98,104 "const stored = projectStoredPage({ … return pageForVerdict(stored);") but see the DEFER below for the record/count arm
- Lens claim: no blocking breach found in the pasted clauses.
- Opened: file:line opened: (report-compute.ts does not exist at 3a36e8b26 (cannot open)

### F-066 · bylaw (bylaw-p2) · diff part route-2 · BUG severity=HIGH
- Clause: m.64 "Only permitted scenarios are shown; every other scenario is recorded, counted and never displayed."
- Diff: src/lib/report-projection/project.ts:206 "if (shownAs === 'not_evaluated') notEvaluated.push(o.id);"
- Lens claim: every non-permitted option (stored not_evaluated, an unknown status, no row, a gated lot) is put in the rendered not_evaluated list and project.ts:219 "if (typeof sentence === 'string' && sentence !== '') values[b.key] = sentence;" writes its sentence into values, so a non-permitted scenario is displayed rather than counted
- Lens fix or rationale: route every non-permitted status into the counted hidden channel (or a counted list the page does not render) and keep the reason in lineage only.
- Opened: file:line opened: src/lib/report-projection/project.ts:206 the quoted code is there

### F-080 · bylaw (bylaw-p3) · diff part route-2 · BUG severity=HIGH
- Clause: m.386 "Flags propagate (R3-02)."
- Diff: src/lib/report-projection/project.ts:68 "export interface PageResponse { page: string; values: Record<string, string>; hidden: string[]; not_evaluated: string[] }"
- Lens claim: the producer serves the customer page (report-page.ts returns only `stored.response`) and the response has no flags carrier, so the stored row `flags` and the lot-size flag ("outside them the banner flags it", project.ts:75-76, held only in the admin-only lineage `lot_size_implausible`) never reach the page
- Lens fix or rationale: a flagged number is shown without its flag — add a flags field to PageResponse and pass row flags plus lot_size_implausible through to report-page.ts
- Opened: file:line opened: src/lib/report-projection/project.ts:68 the quoted code is there

### F-081 · bylaw (bylaw-p3) · diff part route-2 · BUG severity=MED
- Clause: m.341 "Layer 3 not-applicable reasons are a closed list."
- Diff: src/lib/report-projection/project.ts:141 "export const NOT_IN_ENGINE_POPULATION = 'not_in_engine_population';"
- Lens claim: the web producer invents a not-evaluated reason token and feeds it to STATUS_TEXT lookup, a token that is not a stored reason from the closed list, and the diff adds no fixture for the new NOT_EVALUATED code (m.339 "Every NOT_EVALUATED code the evaluator can emit has a test fixture that produces it.")
- Lens fix or rationale: cite the ruling that admits the token or read the stored reason only, and land its fixture
- Opened: file:line opened: src/lib/report-projection/project.ts:141 the quoted code is there

### F-082 · bylaw (bylaw-p3) · diff part route-2 · BUG severity=MED
- Clause: m.384 "Phase 3 is tables, not code (CARD P3-DATA-MODEL and the narrowed CARD-L3-REBUILD)."
- Diff: src/lib/report-projection/seed-shas.ts:26 "export const CURRENT_SEED_SHAS: SeedShas = Object.freeze({ catalogue_sha: sha256(catalogue), switchboard_sha: sha256(switchboard) });"
- Lens claim: the current hashes that decide current vs out_of_date are recomputed in code by a hand twin of catalogue.js canonicalJson+sha256, and the parity is claimed only in a comment ("src/tests/admin-report-preview-live.logic.test.ts asserts both give the same hex"), not in this diff
- Lens fix or rationale: read the current hashes from a stored record, or land the parity test here
- Opened: file:line opened: src/lib/report-projection/seed-shas.ts:26 the quoted code is there

### F-092 · bylaw (bylaw-p4) · diff part route-1 · BUG severity=HIGH
- Clause: lc.53 "Verified by named lock; no partial green."
- Diff: src/lib/parcels/report-compute.ts "a drift from the descriptor's declared lookup tables and columns fails src/tests/customer-report-compute.logic.test.ts (C2)"
- Lens claim: the new compute entry lands with every lock named only in a comment, no test file appears in the diff, so the path is unverified
- Lens fix or rationale: add src/tests/customer-report-compute.logic.test.ts to this diff, red first, covering C1 to C9 as the header asserts.
- Opened: file opened: src/lib/parcels/report-compute.ts no line number was given; the quoted code is not there (not found in the file at 3a36e8b26)

### F-093 · bylaw (bylaw-p4) · diff part route-1 · BUG severity=HIGH
- Clause: m.449 "An unseeded setting makes the run refuse to start (SB-4); no silent default."
- Diff: src/lib/parcels/report-compute.ts "const plan = buildSourceSql(descriptor, { ...config, [POPULATION_SETTING]: [String(lot.id)] }, {})"
- Lens claim: the population setting is supplied by the route even when the resolved config never seeded it, so the run cannot refuse on an unseeded setting, it defaults silently
- Lens fix or rationale: resolve the one-lot population through the validated config path and refuse when that setting is absent.
- Opened: file opened: src/lib/parcels/report-compute.ts no line number was given; the quoted code is there (line 87)

### F-097 · bylaw (bylaw-p4) · diff part route-2 · BUG severity=HIGH
- Clause: m.481 "Each reading row of the switchboard carries a confidence (high, medium, medium-low or low) and an evidence pointer, and every result shows the confidence beside each reading it rests on."
- Diff: src/lib/report-projection/project.ts "switches?: Array<{ id?: string; confidence?: string | null }> | null;" and "return CONFIDENCE_ORDER.find((w) => words.includes(w)) ?? null;"
- Lens claim: the evidence pointer is never selected or carried and the page gets one collapsed weakest word, not the confidence beside each reading it rests on
- Lens fix or rationale: carry the evidence pointer and the per-reading confidence pairs into the response (a value part per reading) instead of one reduced word.
- Opened: file opened: src/lib/report-projection/project.ts no line number was given; the quoted code is there (line 41)

### F-098 · bylaw (bylaw-p4) · diff part route-2 · BUG severity=HIGH
- Clause: m.467 "When one roof form or arm is not evaluated, the headline is the evaluated one as \"at least X\", flagged headline_lower_bound."
- Diff: src/lib/report-projection/project.ts "flags: Array.isArray(r.flags) ? [...r.flags] : [],"
- Lens claim: flags reach only the admin lineage, the customer PageResponse is "values: Record<string, string>; hidden: string[]; not_evaluated: string[]" with no flag channel, so a stored headline_lower_bound cannot reach the page W now serves and the headline reads as an exact number
- Lens fix or rationale: add a ruled flag channel (or a bound flag part) so a lower-bound headline renders as "at least X" flagged.
- Opened: file opened: src/lib/report-projection/project.ts no line number was given; the quoted code is there (line 275)

### F-103 · eng (eng-p1) · diff part load1-1 · BUG severity=MED
- Clause: §11 "Unhappy-path test cases listed: 400, 404, 500 (§2.1)"
- Diff: src/app/api/parcels/lookup/route.ts:140 "A compute error throws to the catch below (500): no page, no meter."
- Lens claim: the modified API route ships no route-level test in the diff, so the new 500 path and the held branch are unproven at the envelope level, and the catch block itself is not pasted (cannot see whether it logs via logError and returns no err.message)
- Lens fix or rationale: add infra cases to the route's *.infra.test.ts: held (page null, meter semi_pending), semi=answered (page sent, counted once), compute throw (500, no page, no meter).
- Opened: file:line opened: src/app/api/parcels/lookup/route.ts:140 the quoted code is there

### F-110 · eng (eng-p1) · diff part load1-2 · BUG severity=HIGH
- Clause: §2.3 "Before accessing nested object properties, explicitly check for `null` or `undefined`"
- Diff: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts:135-146 "const line = lines.find((l) => l.case === e.case) as Json;" ... "abutters: (line.abutments || []).map((a: Json, i: number) =>"
- Lens claim: `line` and `e` are unguarded `find()` results now consumed by two suites, so a fixture miss crashes both instead of one
- Lens fix or rationale: change to "const line = lines.find((l) => l.case === e.case) as Json | undefined; if (!line) throw new Error(...)" and same for `e` before `e.case`
- Opened: file:line opened: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts:135 the quoted code is not there (not found in the file at 3a36e8b26)

### F-115 · eng (eng-p1) · diff part mobile-1 · BUG severity=HIGH
- Clause: §5.2 "`*.ui.test.tsx` | React component rendering, interactions | Any new/changed component"
- Diff: mobile/src/components/surfaces/SearchBinding.tsx:99 "const reportsLeft = (s: SearchSituation): PropsNode[] =>" (also LotMapBinding helpLink/helpRow/pickHint, SemiQuestionBinding busy/loading, semi-question.tsx continueToReport)
- Lens claim: four changed components ship in the pasted file list with no `*.ui.test.tsx` anywhere in it, so the changed renderings and interactions are untested
- Lens fix or rationale: add ui tests for reports-left, help link/pick hint/help row, and semi busy, submit-error and loading states
- Opened: file:line opened: mobile/src/components/surfaces/SearchBinding.tsx:99 the quoted code is there

### F-116 · eng (eng-p1) · diff part mobile-1 · BUG severity=HIGH
- Clause: §5.3 "You MUST write and run a failing test (Red Light) BEFORE writing any feature or fix code. Code may not be written until the test demonstrably fails."
- Diff: NONE (no failing-test run or red test file in the pasted material)
- Lens claim: the feature code (entitlement line, help links, answered lookup on Continue) is pasted with no red-light evidence
- Lens fix or rationale: paste the failing test run before lock/merge
- Opened: no code line cited (NONE (no failing-test run or red test file in the pasted mat)

### F-122 · eng (eng-p1) · diff part mobile-2 · BUG severity=HIGH
- Clause: Spec 00 §5.3 (with §5.2) "You MUST write and run a **failing test** (Red Light) BEFORE writing any feature or fix code. Code may not be written until the test demonstrably fails."
- Diff: parcelSearchCore.ts "+export function reportsLeftShown(e: EntitlementLine | null | undefined): e is ShownEntitlement {" (also parcelLookupParams, boundedWait, the new `busy` field, the entitlement spread in buildSearchSituation)
- Lens claim: five new pure/derivation behaviours ship in a diff whose file list contains no test file, so neither the Red Light step nor the §5.2 row "Any pure/derivation logic" is met
- Lens fix or rationale: add parcelSearchCore.logic.test.ts, semiQuestion.logic.test.ts and useParcelLookup.logic.test.ts covering reportsLeftShown (0 counts as present, empty label, null), parcelLookupParams (semi only when exactly 'answered'), boundedWait (reject path) and busy, written and run failing first.
- Opened: file opened: mobile/src/lib/parcelSearchCore.ts no line number was given; the quoted code is there (line 78)

### F-125 · eng (eng-p1) · diff part mobile-tests-1 · BUG severity=HIGH
- Clause: walk step 4 (no pasted clause names the behaviour)
- Diff: "A change that adds behaviour no pasted clause or ruling names is a finding (nothing added that the card or ruling did not name)."
- Lens claim: mobile/__tests__/parcelScreens.golden.test.ts:246 "+    expect(SEARCH_SLICE.content['search.input.placeholder']).toBe('Enter a Toronto address');"
- Lens fix or rationale: the diff retires a previously pinned operator-verbatim string ("Enter lot address", small pages v7.1 item 9) on the strength of a note that is not in the pasted context (RR-0313, MORNING-DECISIONS.md:1216), so the supersession cannot be checked — paste RR-0313 (and RR-0314) verbatim into the context, or leave the pinned copy unchanged.
- Opened: no file:line in the field as returned: "A change that adds behaviour no pasted clause or ruling names is a fi

### F-126 · eng (eng-p1) · diff part mobile-tests-1 · BUG severity=MED
- Clause: Spec 00 §2.3
- Diff: "Do NOT use the non-null assertion operator (!) unless the value's existence is mathematically guaranteed by a prior validation step. If using !, you must document why in an inline comment."
- Lens claim: mobile/__tests__/lotMapScreens.golden.test.ts:142 "const hint = byTestID(t, 'parcel-lotmap-pick-hint')!;"
- Lens fix or rationale: a new ! on a lookup that can return undefined, with no inline comment, repeated at reportScreens.golden.test.ts:90 "if (!touch[n.component]!.some((x) => tk.includes(x)) || mins.length !== 1)" and reportScreen.mount.behaviour.test.tsx "screen.getByText(LIFE.loading!)" — guard each with an explicit expect(...).toBeTruthy() before dereference, or add the required inline comment.
- Opened: no file:line in the field as returned: "Do NOT use the non-null assertion operator (!) unless the value's exi

### F-130 · eng (eng-p1) · diff part route-1 · BUG severity=HIGH
- Clause: Spec 00 §1.1 "All interactive elements (buttons, links, toggles, icons) MUST have a minimum tappable area of 44px x 44px."
- Diff: src/components/report/ReportPage.tsx:241 "link: 'text-report-soft underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-report-amber'"
- Lens claim: the three new footer links (terms, privacy, help) render through this class with no 44px minimum
- Lens fix or rationale: add min-h-[44px] min-w-[44px] inline-flex items-center to the link class.
- Opened: file:line opened: src/components/report/ReportPage.tsx:241 the quoted code is there

### F-131 · eng (eng-p1) · diff part route-1 · BUG severity=HIGH
- Clause: Spec 00 §4.4 "Do not embed UI-specific logic (pagination styles, component-shaped responses) in the API layer. Return normalized data; let each client transform it."
- Diff: src/app/api/parcels/entitlement/types.ts:18 "resetsOnDisplay: z.string().nullable(),"
- Lens claim: a pre-formatted display date now enters the strict public contract beside the ISO instant it is derived from
- Lens fix or rationale: serve the normalized instant only and format on the client, or paste the ruling that authorises a display field.
- Opened: file:line opened: src/app/api/parcels/entitlement/types.ts:18 the quoted code is there

### F-132 · eng (eng-p1) · diff part route-1 · BUG severity=HIGH
- Clause: Spec 00 §5.3 "You MUST write and run a failing test (Red Light) BEFORE writing any feature or fix code."
- Diff: diff file list "files: ... src/lib/parcels/report-compute.ts" (no test file in the ten changed paths)
- Lens claim: new pure logic (formatDateDmyFixed), the new 400 branch (semi without parcelId), the held-page branch and the changed component all land with no red-first test
- Lens fix or rationale: add the .logic, .infra and .ui tests before the code.
- Opened: file opened: src/lib/parcels/report-compute.ts no line number was given; the quoted code is not there (not found in the file at 3a36e8b26)

### F-133 · eng (eng-p1) · diff part route-1 · BUG severity=MED
- Clause: Spec 00 §10.3 "API routes must be thin, validate input, call a lib function, return the result. Business logic belongs in `src/lib/`, not in route handlers."
- Diff: src/app/api/parcels/lookup/route.ts:146 "const held = lotForm?.unsure === true && semi !== 'answered';"
- Lens claim: the page-source selection rule and the hold rule (stored, then compute, then null) sit inline in the handler
- Lens fix or rationale: extract one lib function and have the route call it.
- Opened: file:line opened: src/app/api/parcels/lookup/route.ts:146 the quoted code is there

### F-134 · eng (eng-p1) · diff part route-1 · BUG severity=MED
- Clause: Spec 00 §11 "Request/Response TypeScript interface in `src/lib/[feature]/types.ts` (§10.3)"
- Diff: src/app/api/parcels/lookup/types.ts:45 "semi: z.literal('answered').optional(),"
- Lens claim: the new request field is declared in the route-local types file, not src/lib
- Lens fix or rationale: declare the contract in src/lib/parcels/types.ts and re-export from the route-local file.
- Opened: file:line opened: src/app/api/parcels/lookup/types.ts:45 the quoted code is there

### F-138 · eng (eng-p1) · diff part route-2 · BUG severity=HIGH
- Clause: Spec 00 §5.2 test-layer map: "`*.logic.test.ts` | Pure functions, scoring, classification | Any pure/derivation logic"
- Diff: src/lib/report-projection/project.ts:180 "export function projectStoredPage(input: ProjectInput): { response: PageResponse; lineage: Lineage }" (and format.ts:36 "export function formatPageRule(rule: string, n: number): Formatted | null")
- Lens claim: the diff's six files contain no test file, yet it adds pure derivation (formatter, freshness verdict, projection) and a new gated read path (report-page.ts:57 "if (!MAXBLD_WEB_LIVE) return null;"); the only evidence of coverage is comment text, and §5.3 "You MUST write and run a failing test ... BEFORE writing any feature or fix code" cannot be shown
- Lens fix or rationale: add a `*.logic.test.ts` in this change (switch-off returns null, pageForVerdict per verdict, formatPageRule refusals) red first, or the clause is unmet.
- Opened: file:line opened: src/lib/report-projection/project.ts:180 the quoted code is not there (not found in the file at 3a36e8b26)

### F-139 · eng (eng-p1) · diff part route-2 · BUG severity=MED
- Clause: Spec 00 §12.10 cross-layer contracts: "Any numeric threshold that crosses spec ↔ SQL ↔ Zod ↔ migration is sourced from `docs/specs/_contracts.json`, not duplicated as a literal across files"
- Diff: src/lib/report-projection/format.ts:15 "export const SQFT_PER_M2 = 10.7639;" and project.ts:114 "export const LOT_SIZE_PLAUSIBLE_M2 = Object.freeze({ min: 50, max: 5000 });"
- Lens claim: the diff introduces two thresholds as literals and says itself the factor is a duplicate of another file (format.ts:13 "It shares only the 10.7639 factor ... of mobile/src/lib/parcelCostFormat.ts"), with no `_contracts.json` row and no `contracts.infra.test.ts` entry in the diff
- Lens fix or rationale: add the keys to `_contracts.json` and map them in `src/tests/contracts.infra.test.ts` in the same commit, or source the values.
- Opened: file:line opened: src/lib/report-projection/format.ts:15 the quoted code is not there (not found in the file at 3a36e8b26)

### F-144 · eng (eng-p1) · diff part scripts-1 · BUG severity=HIGH
- Clause: Spec 00 §4.2 "String concatenation for dynamic queries (especially via `order by` or search terms) is forbidden unless rigorously validated against a static whitelist."
- Diff: scripts/analysis/src-sql-ledger.mjs:111 "+   'src/lib/parcels/report-compute.ts', // LOAD.1 (task-266, dated note 2026-11-19): the batch statement text is built by the Layer 3 step's own core (buildSourceSql: checked-literal settings ... no request text enters it"
- Lens claim: the §4.2 whitelist exception for a newly interpolated-SQL src file is asserted only in the ledger comment; the builder and the whitelist check are not in the pasted diff, so the clause is satisfied by prose (UNMET by the rules)
- Lens fix or rationale: fix: paste src/lib/parcels/report-compute.ts buildSourceSql plus the static whitelist branch and its test into the diff, or cite the file:line where the whitelist is enforced.
- Opened: file:line opened: scripts/analysis/src-sql-ledger.mjs:111 the quoted code is not there (not found in the file at 3a36e8b26)

### F-145 · eng (eng-p1) · diff part scripts-1 · BUG severity=HIGH
- Clause: Spec 00 §5.2 "`*.logic.test.ts` | Pure functions, scoring, classification | Any pure/derivation logic" with §5.3 "You MUST write and run a failing test (Red Light) BEFORE writing any feature or fix code."
- Diff: scripts/analysis/proof-slice.mjs:30 "export function checkSpec(spec, slice) {"
- Lens claim: new pure derivation logic (checkSpec shape problems, runSlice exit-code derivation 0/1/2/3, GAP-on-missing-expect) lands with no `*.logic.test.ts` anywhere in the pasted diff
- Lens fix or rationale: fix: add proof-slice.logic.test.ts pinning exit 2 for each shape problem, exit 1 on one FAIL row, exit 3 on NOT BUILT/GAP, GAP when a clean exit lacks the `expect` line.
- Opened: file:line opened: scripts/analysis/proof-slice.mjs:30 the quoted code is there

### F-149 · eng (eng-p1) · diff part surface-1 · BUG severity=HIGH
- Clause: §5.2 parity battery "Two surfaces that MUST agree stay in lockstep: dual code paths (§7), seed JSON ↔ TS LOGIC_VAR_DEFAULTS, and generated doc ↔ its generator"
- Diff: scripts/surfaces/_schema/census/contracts.json:22970 "+\"resetsOnDisplay\""
- Lens claim: the same descriptor's under_126 line at :22894 still reads "its response is an explicit `.strict()` whitelist of six fields", so descriptor prose and whitelist have drifted by one field, and the diff removes nothing
- Lens fix or rationale: change the under_126 count to seven fields in the same commit
- Opened: file:line opened: scripts/surfaces/_schema/census/contracts.json:22970 the quoted code is not there (not found in the file at 3a36e8b26)

### F-157 · eng (eng-p1) · diff part surface-2 · BUG severity=HIGH
- Clause: §10.2/§11 Frontend Boundary Check "Frontend WFs must NOT modify files in `scripts/`, `migrations/`, or `scripts/lib/` (§10.2)"
- Diff: diff header "diff --git a/scripts/surfaces/parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json" (also F01 mobile_parcel_search.descriptor.json, F02 contract_parcels_entitlement.descriptor.json, F06 web_landing.sample.json)
- Lens claim: a frontend WF edits four files under scripts/, which the pasted checklist forbids for every frontend WF
- Lens fix or rationale: split the descriptor/sample edits into a surface-spec WF, or record the waiver in the plan before lock.
- Opened: file opened: a/scripts/surfaces/parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json does not exist at 3a36e8b26 (cannot open); no line number was given

### F-158 · eng (eng-p1) · diff part surface-2 · BUG severity=HIGH
- Clause: §5.2 "`*.ui.test.tsx` | React component rendering, interactions | Any new/changed component"
- Diff: src/components/surfaces/web/SearchBinding.tsx:270 "...(reportsLeftShown(s.entitlement) ? { [ENTITLEMENT]: { reportsLeft: s.entitlement.reportsLeft" (no test file appears anywhere in the diff)
- Lens claim: the changed search and static bindings ship with no ui test for the reports-left line, the footer or the new Button href branch
- Lens fix or rationale: add *.ui.test.tsx cases for the drawn and not-drawn line and the footer tree before merge.
- Opened: file:line opened: src/components/surfaces/web/SearchBinding.tsx:270 the quoted code is there

### F-159 · eng (eng-p1) · diff part surface-2 · BUG severity=MED
- Clause: contract_parcels_entitlement.descriptor.json under_126 "its response is an explicit `.strict()` whitelist of six fields" vs the same hunk adding "resetsOn" , "resetsOnDisplay"
- Diff: the descriptor's own projection clause still says six fields while the projected list now names seven
- Lens claim: update the under_126 count or the projection so the two halves of the same artifact agree.
- Opened: no file:line in the field as returned: the descriptor's own projection clause still says six fields while the

### F-160 · eng (eng-p1) · diff part surface-2 · BUG severity=MED
- Clause: contract_parcels_lookup.descriptor.json data_story "It reads 9 tables"
- Diff: same paragraph, dated 2026-11-19 note "the Layer 2 results `bylaw_resolution_results` and `bylaw_resolution_option_results`, the lookups `bylaw_resolution_units` and `bylaw_resolution_texts`, `parcel_abutments`, `parcel_maxbld_population`"
- Lens claim: six further tables are named that are not in the declared nine, so the declared read set is not the read set
- Lens fix or rationale: enumerate every table once in the reads list, or state the count as "9 plus the Layer 3 set below".
- Opened: no file:line in the field as returned: same paragraph, dated 2026-11-19 note "the Layer 2 results `bylaw_reso

### F-165 · eng (eng-p2) · diff part load1-1 · BUG severity=HIGH
- Clause: §14 "A **behavior-changing ruling updates ALL cited specs + runbooks in the SAME commit**"
- Diff: src/app/api/parcels/lookup/route.ts (hunk @@ -15,6 +15,8 @@) "+//   SRCH.METER-2 (task-360, 2026-11-19): that unsure lot's `page` is not sent either (null; neither the stored read nor the compute runs, meter semi_pending) until"
- Lens claim: the ruling changes the mobile response contract (an unsure lot's `page` was sent, now null) and the compute now serves a page where none existed, yet no file under docs/specs/ (Spec 100 §3.2, Spec 126 §11b.2) or any runbook appears in the pasted diff
- Lens fix or rationale: add the Spec 100 §3.2 dated note and the affected runbook edits to this same commit
- Opened: no file:line in the field as returned: src/app/api/parcels/lookup/route.ts (hunk @@ -15,6 +15,8 @@) "+//   SR

### F-179 · eng (eng-p2) · diff part mobile-tests-1 · BUG severity=HIGH
- Clause: §13.3 "All catch blocks use `logError(tag, err, context)`. NEVER bare `console.error`. ESLint enforces."
- Diff: mobile/__tests__/maxbldHelp.test.ts "const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);" and "expect(warn).toHaveBeenCalledTimes(1);"
- Lens claim: the new case pins a bare console.warn as the caught-error channel of openHelp instead of the logger the clause names, so merging it enshrines a violation of the catch-block rule
- Lens fix or rationale: mock and assert the logger (logWarn/logError from src/lib/logger.ts, or the mobile equivalent with a justified suppression) in place of console.warn.
- Opened: file opened: mobile/__tests__/maxbldHelp.test.ts no line number was given; the quoted code is there (line 37)

### F-183 · eng (eng-p2) · diff part route-1 · BUG severity=HIGH
- Clause: §14 registry "A behavior-changing ruling updates ALL cited specs + runbooks in the SAME commit"
- Diff: src/app/api/parcels/lookup/route.ts:18 "SRCH.METER-2 (task-360, 2026-11-19): that unsure lot's `page` is not sent either ... Prior text: the page was sent and only the meter said semi_pending."
- Lens claim: the diff states the prior behaviour differs, yet it cites docs/specs/100 §3.2, 126 §11a.7/§11b.2, 69a M-384 and updates none of them in this commit
- Lens fix or rationale: update those cited spec sections (and any runbook) in this same commit, or remove the now-stale citation
- Opened: file:line opened: src/app/api/parcels/lookup/route.ts:18 the quoted code is not there (not found in the file at 3a36e8b26)

### F-188 · eng (eng-p2) · diff part route-2 · BUG severity=HIGH
- Clause: 12.12 "MUST have at least one `fast-check` property test asserting the invariant" (unit conversions, key normalizers)
- Diff: src/lib/report-projection/format.ts:35 "const sqft = grouped(Math.round(n * SQFT_PER_M2));"
- Lens claim: the new m2 to sq ft conversion/rounding (and src/lib/report-projection/seed-shas.ts:16 "Object.keys(o).sort()") lands with no property test file in the diff, only comments citing test names ("a parity test pins the two", "logic.test.ts asserts both give the same hex"), which the walk rule counts as UNMET
- Lens fix or rationale: add src/tests/property/report-projection-format.property.test.ts (non-negative, monotone, int-rule integrality) and one order-invariance test for canonicalJson.
- Opened: file:line opened: src/lib/report-projection/format.ts:35 the quoted code is there

### F-189 · eng (eng-p2) · diff part route-2 · BUG severity=HIGH
- Clause: card scope ruling "the customer producer is W below" (report-page.ts:8, operator "task 341 approved")
- Diff: src/lib/surfaces/maxbld-landing.ts:147 "const report: StaticReport = { sample: view, footer: pickFooterText(SEARCH_CONTENT), ...(demo ? { demo } : {}), ...(picture ? { picture } : {}) };"
- Lens claim: the diff also changes the web landing report (new footer, new imports from components/ and maxbld-web) and no pasted clause or ruling names a landing footer
- Lens fix or rationale: split this hunk into its own card/diff or cite the ruling that names it.
- Opened: file:line opened: src/lib/surfaces/maxbld-landing.ts:147 the quoted code is there

### F-198 · eng (eng-p2) · diff part surface-1 · BUG severity=HIGH
- Clause: no pasted operator ruling names the new copy (walk item 4, "A change that adds behaviour no pasted clause or ruling names is a finding")
- Diff: mobile/src/generated/surfaces/mobile_parcel_search.json:9 "\"footer.copyright\": \"© MaxBLD\"," and mobile_parcel_disambiguation_map.content.json "\"help.address.link\": \"Get help with an address\""
- Lens claim: four footer keys, two help keys, select.hint and the placeholder rewrite "Enter lot address" -> "Enter a Toronto address" are added with no pasted spec clause and no pasted operator ruling naming them; the only support in the change is its own $comment quote "All recommendations accepted ... Ensure the least amount of code and use schema's", which names no footer or help copy and no placeholder
- Lens fix or rationale: cite the ruling id (RR/decision) for each key or drop the keys.
- Opened: file:line opened: mobile/src/generated/surfaces/mobile_parcel_search.json:9 the quoted code is not there (not found in the file at 3a36e8b26)

### F-199 · eng (eng-p2) · diff part surface-1 · BUG severity=HIGH
- Clause: bindings touch_targets authority, the change's own stated basis
- Diff: scripts/surfaces/_schema/bindings.json:73 "\"Button\": [\"min-h-[44px]\", \"min-h-[48px]\"]" against its own note "(not an operator ruling)" and "The check C-9m still requires exactly one min-h- token on the list"
- Lens claim: a closed list is extended on a self-declared orchestrator decision, nothing pasted authorises min-h-[48px], and the same $comment now asserts "exactly one min-h- token on the list" while the list carries two, so C-9m cannot pass as described
- Lens fix or rationale: either get the operator ruling pasted for the 48 px value or keep touch_targets.mobile.Button at ["min-h-[44px]"] and reword the C-9m sentence to say one token per usage.
- Opened: file:line opened: scripts/surfaces/_schema/bindings.json:73 the quoted code is not there (not found in the file at 3a36e8b26)

### F-200 · eng (eng-p2) · diff part surface-1 · BUG severity=MED
- Clause: §13.5 Feature Flags "Any new user-facing feature MUST be wrapped in a feature flag check at the route level."
- Diff: mobile/src/generated/surfaces/mobile_parcel_search.json:31 "\"search.reports_left\": \"{left} of {allowance} reports left until {reset}\"" plus the four footer navigation keys
- Lens claim: a new user-facing line and new navigation are added to the search surface with no flag anywhere in the diff file list
- Lens fix or rationale: add the route-level flag check (or paste the clause exempting copy-only additions) before merge.
- Opened: file:line opened: mobile/src/generated/surfaces/mobile_parcel_search.json:31 the quoted code is not there (not found in the file at 3a36e8b26)

### F-201 · eng (eng-p2) · diff part surface-1 · BUG severity=MED
- Clause: §14 "A behavior-changing ruling updates ALL cited specs + runbooks in the SAME commit"
- Diff: scripts/surfaces/_schema/bindings.json:1 "task-353 SUITE.FIX-2 ... Spec 126 line 351, Spec 128 line 265 ... MORNING-DECISIONS.md:1199 ... MORNING-DECISIONS.md:1227" and seed-report-v2.mjs:600 "Spec 126 11a.3 dated note 2026-11-12 (R-2 literal)"
- Lens claim: every cited spec and runbook line is absent from the diff file list, so the same-commit update rule is unmet in the change as presented (cannot see whether those files already carry the notes)
- Lens fix or rationale: add the Spec 126/Spec 128/decision-file edits to this commit or cite the commit that landed them.
- Opened: file:line opened: scripts/surfaces/_schema/bindings.json:1 the quoted code is not there (not found in the file at 3a36e8b26)

### F-202 · eng (eng-p2) · diff part surface-1 · BUG severity=MED
- Clause: contracts descriptor self-description, "its response is an explicit `.strict()` whitelist of six fields"
- Diff: scripts/surfaces/_schema/census/contracts.json:22971 "+        \"resetsOnDisplay\"" while the same descriptor's under_126 still reads "whitelist of six fields"
- Lens claim: the whitelist gains one entry and the declared count is unchanged, so the descriptor now contradicts its own shape
- Lens fix or rationale: update the count to seven (and the a11y/consumers text that repeats it) in the same edit.
- Opened: file:line opened: scripts/surfaces/_schema/census/contracts.json:22971 the quoted code is not there (not found in the file at 3a36e8b26)

### F-204 · eng (eng-p2) · diff part surface-2 · BUG severity=HIGH
- Clause: §14 registry row "A behavior-changing ruling updates ALL cited specs + runbooks in the SAME commit"
- Diff: scripts/surfaces/parcel_product/F02/contracts/contract_parcels_entitlement.descriptor.json, under_126 pasted line "its response is an explicit `.strict()` whitelist of six fields" vs the same file's hunk `+      "resetsOnDisplay"`
- Lens claim: the descriptor's own statement of its response shape is left stale while the commit adds a response field and touches no cited spec doc under docs/specs/
- Lens fix or rationale: fix: change "six fields" to seven and name `resetsOnDisplay` on that line in this same commit
- Opened: no file:line in the field as returned: scripts/surfaces/parcel_product/F02/contracts/contract_parcels_entitle

### F-205 · eng (eng-p2) · diff part surface-2 · BUG severity=HIGH
- Clause: walk step 4, "A change that adds behaviour no pasted clause or ruling names is a finding"
- Diff: src/components/surfaces/web/StaticBinding.tsx "const footerOf2 = (report: StaticReport): FooterText => report.footer ?? fail('no footer text (the server leaves this part out)');" against scripts/surfaces/parcel_product/F06/surfaces/web_landing.sample.json, whose only changed line is `"scripts/surfaces/_schema/report-presentation.json": "e151b5ccd11cd137"`
- Lens claim: every static page's ReportPage now hard-requires a new footer string set, and the landing sample adds no `report.footer` (its report block is unchanged, cannot see it supplying the key), so that golden's render throws
- Lens fix or rationale: fix: supply `report.footer` in the landing sample in this commit, or keep the footer input optional at the ReportPage call
- Opened: file opened: src/components/surfaces/web/StaticBinding.tsx no line number was given; the quoted code is not there (not found in the file at 3a36e8b26)

### F-208 · fe (fe) · diff part load1-1 · BUG severity=MED
- Clause: fe.04 "a REPORT performance budget (load, payload); a new field ships in hours. Payload is mechanical; load time and "hours" are PROSE-ONLY. Numbers are measured first, then ruled (Q-MF5)."
- Diff: src/app/api/parcels/lookup/route.ts:151 "pageResponse = await computeCustomerPageResponse(parcelRef);" plus src/tests/customer-report-compute.logic.test.ts "the other golden lots take 7 to 16 s each, measured by the lane scan"
- Lens claim: the change puts a measured 4 to 16 second load on the report path inside the lookup request, and no load number is ruled anywhere in the pasted context, so the clause's measured-then-ruled order is not met
- Lens fix or rationale: rule the load number (or a miss-path budget) before the switch can serve it, and record that ruling beside the gate at report-compute.ts:75.
- Opened: file:line opened: src/app/api/parcels/lookup/route.ts:151 the quoted code is not there (not found in the file at 3a36e8b26)

### F-209 · fe (fe) · diff part load1-1 · BUG severity=MED
- Clause: fe.25 "The 25 golden lots render end to end the McBylaws answer-key numbers on every target. Runs as a db-type test in a named CI step."
- Diff: src/tests/customer-report-compute.logic.test.ts "No database: the pool is a scripted fake."
- Lens claim: the computed page that is served to a customer is proven only on one lot (428050) through a fake pool, so the answer-key numbers on the 25 golden lots are never shown for this new production path
- Lens fix or rationale: add a db-type run of computeCustomerPageResponse over the 25 golden lots, or a test-stack journey, before the path serves.
- Opened: file opened: src/tests/customer-report-compute.logic.test.ts no line number was given; the quoted code is there (line 6)

### F-210 · fe (fe) · diff part load1-1 · BUG severity=MED
- Clause: fe.39 "Size, status, reason and the CoA size come from Layer 3; cost comes from the Spec 88 scenario lines, joined by the producer (M-67 kept, EI-D8)."
- Diff: src/tests/customer-report-compute.logic.test.ts "expect(Object.keys((computed as { values: Json }).values).some((k) => k.startsWith('o1.size'))).toBe(true);"
- Lens claim: the only value asserted in the computed page is a Layer 3 size, and the parity fixture is built from the core's own rows (CORE_ROWS.map(asStored)), so the Spec 88 cost that the producer joins is never asserted or compared for the computed path
- Lens fix or rationale: assert at least one cost value in the computed page against the stored path's real producer rows, not against the core's own output.
- Opened: file opened: src/tests/customer-report-compute.logic.test.ts no line number was given; the quoted code is there (line 153)

### F-211 · fe (fe) · diff part load1-1 · BUG severity=MED
- Clause: fe.40 "the real app is proven wired by layers run against a separate local test stack, never the dev DB (API journeys, a dead-wire crawler, a lot sweep, stress, failure drills, phone runs). The cases are rows of one catalogue, tests/e2e/scenarios.json (data; no test code names a case)."
- Diff: src/tests/customer-report-compute.logic.test.ts "the route is the only importer of the entry; the entry is imported by nothing else outside the tests"
- Lens claim: the new wiring (stored miss falls to the compute, unsure lot holds the page until semi=answered) is proven only by a source-level import check, with no scenario row added to tests/e2e/scenarios.json
- Lens fix or rationale: add journey rows for lookup-with-stored-miss and unsure-lot-hold so the wired path runs on the test stack.
- Opened: file opened: src/tests/customer-report-compute.logic.test.ts no line number was given; the quoted code is there (line 243)

### F-215 · fe (fe) · diff part mobile-1 · BUG severity=HIGH
- Clause: fe.31 "one props golden per reachable state per declared target"
- Diff: mobile/src/components/surfaces/SemiQuestionBinding.tsx "@@ -102,15 +104,12 @@ ... +      return [node('Text', { key: 'loading-text', testID: 'parcel-semi-loading', className: L.semiLoadingText, role: 'status' }, [content('state.loading')])];"
- Lens claim: the props tree of every touched state changed (spinner node and testID `parcel-semi-spinner` deleted, new `help` node in five lot-map states, new `pick-hint` and `help-row` in multi_parcel, new busy branch on Continue, new reports-left node) yet the changed file list is "files: mobile/app/(app)/parcel-tool/[parcelId].tsx, ... mobile/src/constants/parcelSearch.ts", no golden and no descriptor, so no reachable state has a golden matching its tree
- Lens fix or rationale: regenerate and commit one props golden per touched state per declared target in this change.
- Opened: file opened: mobile/src/components/surfaces/SemiQuestionBinding.tsx no line number was given; the quoted code is not there (not found in the file at 3a36e8b26)

### F-216 · fe (fe) · diff part mobile-1 · BUG severity=HIGH
- Clause: fe.33 "every displayed string, library default strings and form error messages included, comes from content"
- Diff: mobile/src/components/surfaces/LotMapBinding.tsx "+  }, [node('Text', { key: 'help-text', className: L.helpLinkText }, [content('help.address.link')])]);"
- Lens claim: four content keys are newly referenced (`help.address.link`, `help.lot.prompt`, `select.hint` at "node('Text', { key: 'pick-hint', testID: 'parcel-lotmap-pick-hint', className: L.pickHint }, [content('select.hint')])", `search.reports_left` at "text: content('search.reports_left')") and no content source file or generated slice is in the changed list, so the keys cannot be seen to exist
- Lens fix or rationale: add the four keys to the content sources and regenerate the mobile slices in this change.
- Opened: file opened: mobile/src/components/surfaces/LotMapBinding.tsx no line number was given; the quoted code is there (line 105)

### F-229 · fe (fe) · diff part route-1 · BUG severity=HIGH
- Clause: fe.36 "a control that moves the user uses the platform router (web <Link>, redirect(), router.push/replace after an action;"
- Diff: src/components/report/ReportPage.tsx "case 'Button': return <a key={key} href={String(p.href)} className={cls}>{kids}</a>;"
- Lens claim: the new footer links (/terms, /privacy, /help) navigate with a plain anchor, not the platform router
- Lens fix or rationale: render them with next/link Link on web (mobile keeps its own router control)
- Opened: file opened: src/components/report/ReportPage.tsx no line number was given; the quoted code is there (line 251)

### F-230 · fe (fe) · diff part route-1 · BUG severity=HIGH
- Clause: fe.02 "P1 Declared, not coded: a screen is a descriptor; the only code is the shared archetype components."
- Diff: src/components/report/ReportPage.tsx "const section: FooterSection = { id: s.id, parts: ["
- Lens claim: the footer's parts, its three link contents and their hrefs are coded in the component, not declared in the page table
- Lens fix or rationale: move the footer parts and hrefs into the declared page table and have ReportFooter read only s
- Opened: file opened: src/components/report/ReportPage.tsx no line number was given; the quoted code is in the file (not on one line)

### F-234 · fe (fe) · diff part route-2 · BUG severity=HIGH
- Clause: fe.44 "the conversion factor is content/settings, never code"
- Diff: src/lib/report-projection/format.ts:14 "export const SQFT_PER_M2 = 10.7639;"
- Lens claim: the sq ft factor is hardcoded in code, so the clause is unmet for every area rule the new customer producer formats
- Lens fix or rationale: read the factor from content/settings and pass it into formatPageRule.
- Opened: file:line opened: src/lib/report-projection/format.ts:14 the quoted code is there

### F-235 · fe (fe) · diff part route-2 · BUG severity=HIGH
- Clause: fe.01 "the build starts after McBylaws increment 2 closes, with the 2026-11-02 infra freeze lifted for it by name"
- Diff: src/lib/parcels/report-page.ts:9 "MB-44 W (task-123, 1.3; operator '1. it has to happen now - read the objectives', MORNING-DECISIONS.md:789, and 'task 341 approved', :1160)"
- Lens claim: the lift by name rests only on this code comment; the cited operator ruling is not in the pasted context, so fe.01 is unmet on the material shown
- Lens fix or rationale: paste the ruling that lifts the freeze by name or hold the build code.
- Opened: file:line opened: src/lib/parcels/report-page.ts:9 the quoted code is not there (not found in the file at 3a36e8b26)

### F-241 · fe (fe) · diff part surface-1 · BUG severity=HIGH
- Clause: bindings.json dated note 2026-11-19 (task-353 SUITE.FIX-2) "The check C-9m still requires exactly one min-h- token on the list; nothing under 44 is listed."
- Diff: scripts/surfaces/_schema/bindings.json "Button": ["min-h-[44px]", "min-h-[48px]"]
- Lens claim: the list now carries two min-h- tokens while the note and the unchanged C-9m check (screen-checks.mjs is not in this diff) demand exactly one, so the binding file contradicts itself and its own enforcing check fails
- Lens fix or rationale: fix: either teach C-9m to accept the paired token in this same change or list a single token per component, and rewrite the note to match.
- Opened: file opened: scripts/surfaces/_schema/bindings.json no line number was given; the quoted code is there (line 73)

### F-242 · fe (fe) · diff part surface-1 · BUG severity=HIGH
- Clause: fe.36 "a control that moves the user uses the platform router (web <Link>, redirect(), router.push/replace after an action; mobile expo-router with canGoBack() before back()); a view is never swapped by local state"
- Diff: scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.content.json "footer.privacy": "Privacy Policy" (with footer.help, footer.terms, and the map's "help.address.link": "Get help with an address")
- Lens claim: three mobile link labels are added with no destination declared: bindings.json mounts the static pages only on web ("src/app/(maxbld)/parcel-tool/(static)/") and the mobile-product.json hunk adds no route or state for them, so each link either never renders or moves the user outside the router
- Lens fix or rationale: fix: declare the mobile expo-router route (or the mount) for each new link label, or remove the labels.
- Opened: file opened: scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.content.json no line number was given; the quoted code is not there (not found in the file at 3a36e8b26)

### F-246 · fe (fe) · diff part surface-2 · BUG severity=HIGH
- Clause: fe.37 "a failed read leaves its part out (never a 500, never a"
- Diff: src/components/surfaces/web/StaticBinding.tsx:392 "const footerOf2 = (report: StaticReport): FooterText => report.footer ?? fail('no footer text (the server leaves this part out)');"
- Lens claim: the sample report's footer strings are read at render time with no tree part gating them, so a failed footer read throws and fails the whole page instead of leaving that part out, the opposite of the clause
- Lens fix or rationale: render ReportPage without the footer prop (or drop the ReportPage node) when ctx.report.footer is absent.
- Opened: file:line opened: src/components/surfaces/web/StaticBinding.tsx:392 the quoted code is there

### F-247 · fe (fe) · diff part surface-2 · BUG severity=MED
- Clause: fe.32 "the member must exist in that descriptor; any other value fails"
- Diff: scripts/surfaces/parcel_product/F02/contracts/contract_parcels_entitlement.descriptor.json:6 "its response is an explicit `.strict()` whitelist of six fields", against the added "resetsOnDisplay"
- Lens claim: the pasted field list grows to seven while the descriptor still declares six, and the pasted material does not show the strict projection or the mobile EntitlementLine gaining resetsOnDisplay, so the contract binding cannot be confirmed to resolve
- Lens fix or rationale: add resetsOnDisplay to the strict projection and change the under_126 text from six to seven fields.
- Opened: file:line opened: scripts/surfaces/parcel_product/F02/contracts/contract_parcels_entitlement.descriptor.json:6 the quoted code is not there (not found in the file at 3a36e8b26)

### F-248 · fe (fe) · diff part surface-2 · BUG severity=MED
- Clause: fe.02 "a screen is a descriptor; the only code is the shared archetype components"
- Diff: src/components/surfaces/web/SearchBinding.tsx:143 "export const SEARCH_FOOTER: FooterSection = {" with part "{ role: 'link', content: 'footer.terms', href: '/terms' }"
- Lens claim: the web search footer's five parts and the reports-left part exist only in binding code; the whole diff of mobile_parcel_search.descriptor.json adds the entitlement contract_ref, one golden entry and note text, no part or block for either
- Lens fix or rationale: declare the footer section (roles, content keys, hrefs) and the reports-left part in the F01 descriptor and have searchWebTree read them.
- Opened: file:line opened: src/components/surfaces/web/SearchBinding.tsx:143 the quoted code is not there (not found in the file at 3a36e8b26)

### F-255 · mobile-100 (mobile-100-p1) · diff part mobile-2 · BUG severity=HIGH
- Clause: dated note 2026-11-11 item 2 "a hit for a `parcel_tool` user writes one `property_view` row keyed on the matched `parcels.parcel_id` (`parcel_ref`), after the response has passed its `.strict()` parse"
- Diff: mobile/src/hooks/useParcelLookup.ts:84 "return semi === 'answered' ? { parcelId, semi: 'answered' } : { parcelId };"
- Lens claim: the plan makes the ledger write client-optional (only the semi page sends the flag, and per lotForm.ts "clear semis and clear detached lots go straight to the report"), so hits reached without that one screen write nothing, while the clause writes on every hit
- Lens fix or rationale: fix: the server counts every parcelId-path hit on a real parcel and `semi` is not a metering input.
- Opened: file:line opened: mobile/src/hooks/useParcelLookup.ts:84 the quoted code is there

### F-256 · mobile-100 (mobile-100-p1) · diff part mobile-2 · BUG severity=MED
- Clause: same dated note, "a hit ... writes one `property_view` row"
- Diff: mobile/src/hooks/useParcelLookup.ts:95 "queryKey: ['parcel-lookup', parcelId]," vs :96 "fetchParcelLookup(parcelLookupParams(parcelId!, semi))" with staleTime 60_000 and :111 "queryClient.setQueryData(['parcel-lookup', parcelId], result)"
- Lens claim: the request varies by `semi` but the key does not, so a fresh non-counted entry for that parcel is served and the counted request never reaches the server inside the 60 s window
- Lens fix or rationale: fix: put `semi` in the key or set staleTime 0 / refetchOnMount 'always' for the counted request.
- Opened: file:line opened: mobile/src/hooks/useParcelLookup.ts:95 the quoted code is not there (not found in the file at 3a36e8b26)

### F-259 · mobile-100 (mobile-100-p1) · diff part mobile-tests-1 · BUG severity=HIGH
- Clause: §3 "GET /api/parcels/lookup?q=<address> | ?parcelId=<id>" and "Exactly one of q / parcelId (400 otherwise)"
- Diff: mobile/__tests__/useParcelLookup.test.ts "expect(mockFetch).toHaveBeenLastCalledWith('/api/parcels/lookup?parcelId=PIN-777&semi=answered');"
- Lens claim: the request now carries a semi param the frozen endpoint definition does not name, so the client sends a query the pasted contract does not define
- Lens fix or rationale: land a §3 amendment naming semi (request grammar and the 400 rule) before merge, or source the hold flag another way.
- Opened: file opened: mobile/__tests__/useParcelLookup.test.ts no line number was given; the quoted code is there (line 109)

### F-264 · mobile-100 (mobile-100-p2) · diff part mobile-1 · BUG severity=HIGH
- Clause: §4 report mount states "a page shows the v21 page; a settled lookup with no page (every lot until MB-44, a miss, a dangling id) shows the approved miss text; pending with nothing cached shows loading"
- Diff: mobile/app/(app)/parcel-tool/[parcelId].tsx "const { view, lifecycle } = reportScreenState({ data: data && !ask ? { page: data.page ?? null } : undefined, isError });"
- Lens claim: a SETTLED lookup is now drawn as loading whenever the question is owed, contradicting both halves of the clause (settled with a page shows the page, settled with no page shows the miss text), on a rationale ("the server holds an unsure lot's page (null) until the answer") that no pasted clause states
- Lens fix or rationale: paste the ruling that withholds an unsure lot's page and amend this clause, or drop the `!ask` guard — Fix: drop `!ask` or attach the ruling.
- Opened: file opened: mobile/app/(app)/parcel-tool/[parcelId].tsx no line number was given; the quoted code is there (line 36)

### F-265 · mobile-100 (mobile-100-p2) · diff part mobile-1 · BUG severity=HIGH
- Clause: MF-48 dated note 2026-11-12 "then `useParcelLookup(parcelId)` (same query key)" and §4 "the detail depends **only** on `['parcel-lookup', parcelId]` (query-key hygiene, Spec 99 §4)"
- Diff: mobile/app/(app)/parcel-tool/[parcelId].tsx "const { data, isError, isFetching, refetch } = useParcelLookup(parcelId, semiParam);"
- Lens claim: the report's request/key gains a `semi` dimension the pasted clauses do not allow, while the pasted SEMI-B note says "(2) The answer is a route param applied in the app"
- Lens fix or rationale: Fix: paste the ruling that changes the report's query key, or keep the report's read on `parcelId` alone.
- Opened: file opened: mobile/app/(app)/parcel-tool/[parcelId].tsx no line number was given; the quoted code is there (line 23)

### F-266 · mobile-100 (mobile-100-p2) · diff part mobile-1 · BUG severity=HIGH
- Clause: "1 b) The meter" dated note 2026-11-12 "a lookup counts against the monthly allowance (the MF-45 `usage_events` row through `openReport`) only when at least one option has an evaluated value" and "While the legacy menu is withheld no lookup counts"
- Diff: mobile/app/(app)/parcel-tool/semi-question.tsx "result = await boundedWait(fetchParcelLookup({ parcelId: id, semi: 'answered' }), SEMI_CONTINUE_WAIT_MS);" with its comment "which lets the server count the lot once its report is produced"
- Lens claim: counting is decided by the payload's evaluated option in the pasted rule, not by a client flag, and MF-53 note (3) "the chosen lot opens through the metered parcelId path" makes this an extra, non-metered lookup before the report
- Lens fix or rationale: Fix: paste the ruled server change that reads `semi`, or do not issue a second lookup and let the report's own parcelId lookup meter.
- Opened: file opened: mobile/app/(app)/parcel-tool/semi-question.tsx no line number was given; the quoted code is not there (not found in the file at 3a36e8b26)

### F-267 · mobile-100 (mobile-100-p2) · diff part mobile-1 · BUG severity=HIGH
- Clause: MF-58 dated note 2026-11-10 "the search page shows the legal line ... directly under the address input, before the recent-search chips and every result block, in every state" and 2026-11-11 "MF-58 placement unchanged: under the address input, before results"
- Diff: mobile/src/components/surfaces/SearchBinding.tsx "      ...reportsLeft(s),\n      legal(),"
- Lens claim: the reports-left line is inserted between the address input and the legal line, so the legal line is no longer directly under the input
- Lens fix or rationale: Fix: draw the reports-left line after `legal()`, or paste a ruling amending the MF-58 placement.
- Opened: file opened: mobile/src/components/surfaces/SearchBinding.tsx no line number was given; the quoted code is not there (not found in the file at 3a36e8b26)

### F-273 · mobile-100 (mobile-100-p2) · diff part mobile-2 · BUG severity=HIGH
- Clause: Spec 100 §3.2 dated note 2026-11-12, "1 b" meter rule: "A lookup counts against the monthly allowance (the MF-45 `usage_events` row through `openReport`) only when at least one option has an evaluated value" and "While the legacy menu is withheld no lookup counts"
- Diff: mobile/src/hooks/useParcelLookup.ts "`semi: 'answered'` is the one optional flag the semi question page sends at Continue, so the server counts the lot once its report is produced"
- Lens claim: the diff adds a second counting trigger for a parcelId lookup that the pasted 1 b rule does not name and that contradicts the evaluated-option test, so the clause is not satisfied as written
- Lens fix or rationale: paste the operator ruling that authorises the answered-lot count (RR-0278 is not in the pasted context) or drop the flag and keep the 1 b rule.
- Opened: file opened: mobile/src/hooks/useParcelLookup.ts no line number was given; the quoted code is not there (not found in the file at 3a36e8b26)

### F-280 · mobile-100 (mobile-100-p2) · diff part mobile-tests-1 · BUG severity=HIGH
- Clause: Spec 100 §4 dated note 2026-11-12 (MF-48 Stage B) "a settled lookup with no page (every lot until MB-44, a miss, a dangling id) shows the approved miss text" and dated note 2026-11-19 (LOAD.1) "it is, so every customer still sees the miss"
- Diff: mobile/__tests__/reportScreen.mount.behaviour.test.tsx:104 "expect(screen.queryByText(LIFE.miss!)).toBeNull();"
- Lens claim: the new case pins a settled no-page lookup to the loading state, so the pasted miss rule is unmet for the unsure no-page render, and the ruling it rests on (SRCH.METER-2, RR-0278/SE-1 per the case comment) is not pasted
- Lens fix or rationale: paste RR-0278/SE-1 or keep the miss text for the settled no-page render.
- Opened: file:line opened: mobile/__tests__/reportScreen.mount.behaviour.test.tsx:104 the quoted code is not there; it is at line 111

### F-285 · mobile-100 (mobile-100-p3) · diff part mobile-1 · BUG severity=HIGH
- Clause: Spec 100 §8 Future reserved "no v1 code beyond the null placeholder" and "a distinct home-looker persona, entitlement, and pricing (and an optional `parcel_view_events` trial counter) are a later product decision"
- Diff: mobile/app/(app)/parcel-tool/index.tsx:56 "const { data: entitlementData, isError: entitlementFailed, refetch: refetchEntitlement } = useParcelEntitlement();"
- Lens claim: this change ships a v1 entitlement surface (the served reports-left line) and, on Continue, a lookup flag that "lets the server count the lot"; the ruling it cites (task-320, RR-0307) is not pasted, so the reserve clause stands unmet on the material shown
- Lens fix or rationale: paste the operator ruling that authorizes the entitlement read and the per-report count, or drop the reports-left line and the `semi: 'answered'` fetch.
- Opened: file:line opened: mobile/app/(app)/parcel-tool/index.tsx:56 the quoted code is there

### F-289 · mobile-100 (mobile-100-p3) · diff part mobile-2 · BUG severity=HIGH
- Clause: Spec 100 Known Failure Modes, "**No-match-is-a-result**
- Diff: treating a miss or an unknown `parcelId` as a 404 breaks the client state machine. Guard: the §2.6 200-with-null contract + the `.db` unknown-`parcelId` case."
- Lens claim: mobile/src/hooks/useParcelLookup.ts:36 "params: { q: string } | { parcelId: string; semi?: 'answered' }"
- Lens fix or rationale: the only pasted clause governing /api/parcels/lookup fixes it as a §2.6 200-with-null read, and the diff adds a request parameter whose stated effect is a server side count ("the server counts the lot once its report is produced"), a write the pasted contract does not name, on the authority of RR-0278 which is not pasted — paste the RR-0278 / contract_parcels_lookup clause into the context, or move the counting call out of this diff.
- Opened: no file:line in the field as returned: treating a miss or an unknown `parcelId` as a 404 breaks the client st

### F-295 · mobile-100 (mobile-100-p3) · diff part mobile-tests-1 · BUG severity=HIGH
- Clause: Spec 100 whole list, "this is part 3 of 3", the SRCH clauses the diff cites are not in the pasted part
- Diff: mobile/__tests__/parcelScreens.golden.test.ts "expect(SEARCH_SLICE.content['search.input.placeholder']).toBe('Enter a Toronto address');"
- Lens claim: the ruled placeholder is replaced on the authority of "RR-0313, MORNING-DECISIONS.md:1216", not pasted, and the superseded wording exists only as a comment ("should be enter lot address"), so nothing pasted authorizes the new copy
- Lens fix or rationale: fix: paste RR-0313 verbatim into the context, or keep the previous key value
- Opened: file opened: mobile/__tests__/parcelScreens.golden.test.ts no line number was given; the quoted code is there (line 246)

### F-296 · mobile-100 (mobile-100-p3) · diff part mobile-tests-1 · BUG severity=HIGH
- Clause: Spec 100 whole list, "this is part 3 of 3", no pasted clause names the mobile Help exit
- Diff: mobile/__tests__/maxbldHelp.test.ts "it('openHelp opens that URL in the in-app browser sheet and does not leave the app through Linking', async () => {"
- Lens claim: the exit from Linking to expo-web-browser is pinned only against a comment citing "small-pages-v8 search.html:235" and task-362 AC1/AC5, neither pasted, so the behaviour change has no pasted authority
- Lens fix or rationale: fix: paste search.html:235 and AC1/AC5, or revert openHelp to Linking until they are pasted
- Opened: file opened: mobile/__tests__/maxbldHelp.test.ts no line number was given; the quoted code is there (line 26)

### F-297 · mobile-100 (mobile-100-p3) · diff part mobile-tests-1 · BUG severity=HIGH
- Clause: Spec 100 whole list, "this is part 3 of 3", no pasted clause names a pick hint or its accessibility binding
- Diff: mobile/__tests__/lotMapScreens.golden.test.ts "expect(keys.slice(-3)).toEqual(['continue', 'pick-hint', 'help-row']);"
- Lens claim: a new node, a new content key "select.hint" and an accessibilityHint on Continue are added on the authority of "choose-lot.html:278" and "task-362 AC2, AC6", not pasted
- Lens fix or rationale: fix: paste AC2/AC6 and the choose-lot.html line, or drop the hint node
- Opened: file opened: mobile/__tests__/lotMapScreens.golden.test.ts no line number was given; the quoted code is there (line 148)

### F-298 · mobile-100 (mobile-100-p3) · diff part mobile-tests-1 · BUG severity=HIGH
- Clause: Spec 100 whole list, "this is part 3 of 3", no pasted clause names the Continue flow added here
- Diff: mobile/__tests__/semiQuestionPage.behaviour.test.tsx "expect(mockFetchLookup.mock.calls).toEqual([[{ parcelId: 'PCL-S1', semi: 'answered' }]]);"
- Lens claim: a fetch on Continue, a cache write, a bounded-wait "(SEMI_CONTINUE_WAIT_MS)" error state and a double-press guard are added on the authority of task-319, task-361 and "UX-4, CR-1, LX-R2, LX-E1 of BL-TRIAGE/VERDICTS.md", none pasted
- Lens fix or rationale: fix: paste the SRCH.SEMI stage-2 clause and the triage items, or scope the diff to behaviour the pasted clauses name
- Opened: file opened: mobile/__tests__/semiQuestionPage.behaviour.test.tsx no line number was given; the quoted code is there (line 85)

### F-299 · mobile-100 (mobile-100-p3) · diff part mobile-tests-1 · BUG severity=HIGH
- Clause: Spec 100 whole list, "this is part 3 of 3", no pasted clause allows a second Button min height
- Diff: mobile/__tests__/semiQuestionScreens.golden.test.ts "some((c) => c === 'min-h-[44px]' || c === 'min-h-[48px]')" with the comment "SRCH.SEMI stage 2: Continue and Try again are 48 px (the mock)"
- Lens claim: a golden guard is loosened to accept a token on comment-only authority, so the exception is unmet
- Lens fix or rationale: fix: paste the mock rule that draws 48 px, or keep the single allowed token
- Opened: file opened: mobile/__tests__/semiQuestionScreens.golden.test.ts no line number was given; the quoted code is not there (not found in the file at 3a36e8b26)

### F-321 · mobile-96 (mobile-96-p2) · diff part mobile-2 · BUG severity=HIGH
- Clause: Spec 96 limit-state scope "Mobile subscription (Spec 96, whole; governs the no-plan and limit states)"
- Diff: mobile/src/hooks/useParcelLookup.ts (SRCH.A6 block) "the caller's plan and this month's report count, read from GET /api/parcels/entitlement (the line "N of M reports left until <date>")" and mobile/src/lib/parcelSearchCore.ts "GET /api/parcels/entitlement serves the count ... the page only prints them"
- Lens claim: the pasted limit-state clauses name only the PaywallScreen for 'expired' and the inline blur banners; this change adds a second in-screen limit-state surface (reportsLeft, reportsLimit, resetsOnDisplay, reportsLimitReached) that no pasted clause names
- Lens fix or rationale: drop the entitlement line from this change, or paste the ruling (SRCH.A6 / RR-0307 / FE-05 / RR-0310) that authorises it.
- Opened: file opened: mobile/src/lib/parcelSearchCore.ts no line number was given; the quoted code is not there (not found in the file at 3a36e8b26)

### F-322 · mobile-96 (mobile-96-p2) · diff part mobile-2 · BUG severity=HIGH
- Clause: Spec 96 §11 Out of scope "Pricing tier display in-app
- Diff: managed on web only"
- Lens claim: mobile/src/lib/parcelSearchCore.ts "export type EntitlementLine = { reportsLeft: number | null; reportsLimit: number | null; resetsOnDisplay: string | null }"
- Lens fix or rationale: the line draws the caller's plan allowance and reset date inside the app, the surface the pasted scope clause assigns to the web — remove reportsLimit and resetsOnDisplay from the in-app line, or paste an operator ruling that overrides the scope clause.
- Opened: no file:line in the field as returned: managed on web only"

### F-331 · mobile-99 (mobile-99-p1) · diff part mobile-1 · BUG severity=HIGH
- Clause: Spec 99 §B1 query-key registry, "Adding a new server query requires a row here"
- Diff: mobile/app/(app)/parcel-tool/index.tsx "const { data: entitlementData, isError: entitlementFailed, refetch: refetchEntitlement } = useParcelEntitlement();"
- Lens claim: a new account-scoped server read (GET /api/parcels/entitlement) is introduced with no registry row in the pasted list (rows stop at "['parcel-lookup', parcelId]"), so the normative registry is unmet
- Lens fix or rationale: fix: add the row (key, owner hook `useParcelEntitlement`, note) to Spec 99 §B1 in this change, or do not add the read.
- Opened: file opened: mobile/app/(app)/parcel-tool/index.tsx no line number was given; the quoted code is there (line 55)

### F-332 · mobile-99 (mobile-99-p1) · diff part mobile-1 · BUG severity=HIGH
- Clause: Spec 99 §B1 "Every server fetch MUST go through TanStack Query, never raw `fetch()` in components."
- Diff: mobile/app/(app)/parcel-tool/semi-question.tsx "result = await boundedWait(fetchParcelLookup({ parcelId: id, semi: 'answered' }), SEMI_CONTINUE_WAIT_MS);"
- Lens claim: the answered lookup is issued imperatively from a screen's callback and hand-written via "storeLookup(id, result)", i.e. outside the owner query's lifecycle, which is the seventh flow §4 does not enumerate
- Lens fix or rationale: fix: drive the answered read through the owner hook (gated `useParcelLookup` with the answered request) or add a dated spec amendment naming this flow.
- Opened: file opened: mobile/app/(app)/parcel-tool/semi-question.tsx no line number was given; the quoted code is there (line 64)

### F-337 · mobile-99 (mobile-99-p1) · diff part mobile-2 · BUG severity=HIGH
- Clause: Spec 99 §4 B1 "Adding a new server query requires a row here:"
- Diff: mobile/src/hooks/useParcelLookup.ts "queryKey: ['parcel-entitlement'],"
- Lens claim: the diff introduces a new server query and no registry row for ['parcel-entitlement'] appears anywhere in the diff or the pasted clause, so the clause is unmet
- Lens fix or rationale: add the row "| ['parcel-entitlement'] | useParcelEntitlement | ... |" to the Spec 99 §4 query-key registry.
- Opened: file opened: mobile/src/hooks/useParcelLookup.ts no line number was given; the quoted code is there (line 134)

### F-338 · mobile-99 (mobile-99-p1) · diff part mobile-2 · BUG severity=HIGH
- Clause: Spec 99 §4 B1 "`queryKey` MUST be a stable, parameterized array" and the registry row "the parcel detail; depends ONLY on `parcelId`"
- Diff: mobile/src/hooks/useParcelLookup.ts "queryFn: () => fetchParcelLookup(parcelLookupParams(parcelId!, semi)),"
- Lens claim: the request now varies with `semi` while the key stays "['parcel-lookup', parcelId]", so two different requests share one cache slot, and the key no longer parameterizes the query, so the clause is unmet
- Lens fix or rationale: put semi in the key (['parcel-lookup', parcelId, semi ?? null]) and align useSetParcelLookup to the same key, or fetch the answered lookup outside this query.
- Opened: file opened: mobile/src/hooks/useParcelLookup.ts no line number was given; the quoted code is there (line 96)

### F-339 · mobile-99 (mobile-99-p1) · diff part mobile-2 · BUG severity=MED
- Clause: Spec 99 §4 "These are the only allowed cross-layer flows. A seventh pattern requires a spec amendment."
- Diff: mobile/src/hooks/useParcelLookup.ts "queryClient.setQueryData(['parcel-lookup', parcelId], result);"
- Lens claim: a second writer of the ['parcel-lookup', parcelId] cache entry from app code, matching none of the six bridge patterns and carrying no amendment, so the clause is unmet
- Lens fix or rationale: route the answered result through the query's own queryFn (B1) or record the seeding as a §4 amendment.
- Opened: file opened: mobile/src/hooks/useParcelLookup.ts no line number was given; the quoted code is there (line 111)

### F-340 · mobile-99 (mobile-99-p1) · diff part mobile-2 · BUG severity=MED
- Clause: no pasted clause names an in-app browser sheet; the file's only authority is "task-362 SRCH.LOTMAP-2 (small-pages-v8 search.html:235 ...)"
- Diff: mobile/src/lib/maxbldHelp.ts "import * as WebBrowser from 'expo-web-browser';"
- Lens claim: the move from Linking.openURL to WebBrowser.openBrowserAsync, and the void to Promise<void> return change, rest entirely on a ruling that is not pasted, so compliance cannot be checked
- Lens fix or rationale: paste the task-362 / small-pages-v8 clause (and Spec 126 §11b.3/§11b.7 it links) into the context.
- Opened: file opened: mobile/src/lib/maxbldHelp.ts no line number was given; the quoted code is there (line 10)

### F-341 · mobile-99 (mobile-99-p1) · diff part mobile-2 · BUG severity=MED
- Clause: no pasted clause names a Continue wait bound; the only authority is "SRCH.SEMI-3 (task-361, LX-E1)"
- Diff: mobile/src/lib/semiQuestion.ts "export const SEMI_CONTINUE_WAIT_MS = 60_000;"
- Lens claim: a 60 s bound and a new required busy field are added against an unpasted ruling, so whether 60 s and the ask-only busy rule are the ruled behaviour cannot be seen
- Lens fix or rationale: paste the task-361 clause.
- Opened: file opened: mobile/src/lib/semiQuestion.ts no line number was given; the quoted code is there (line 16)

### F-342 · mobile-99 (mobile-99-p1) · diff part mobile-2 · BUG severity=LOW
- Clause: Spec 99 §4 B1 "`enabled` gates: use `!!user` for user-scoped queries"
- Diff: mobile/src/hooks/useParcelLookup.ts "enabled: !!accessToken,"
- Lens claim: the new user-scoped entitlement query gates on the token rather than the auth user the clause names, so the clause is unmet as written
- Lens fix or rationale: gate on the auth user per the clause, or record the deviation as §4 requires for a pattern change.
- Opened: file opened: mobile/src/hooks/useParcelLookup.ts no line number was given; the quoted code is there (line 136)

### F-344 · mobile-99 (mobile-99-p1) · diff part mobile-tests-1 · BUG severity=HIGH
- Clause: Spec 99 §4 B1 query-key registry "| `['parcel-lookup', parcelId]` | `useParcelLookup` (Spec 100) | the parcel detail; depends ONLY on `parcelId` (query-key hygiene)"
- Diff: mobile/__tests__/semiQuestionPage.behaviour.test.tsx:88 "expect(mockSetQueryData.mock.calls).toEqual([[['parcel-lookup', 'PCL-S1'], data(form(true))]])" and mobile/__tests__/useParcelLookup.test.ts:107 "await fetchParcelLookup({ parcelId: 'PIN-777', semi: 'answered' })"
- Lens claim: the answered page and the held (no-semi, page null) response now share one cache entry under a key that no longer identifies the request the server sees
- Lens fix or rationale: put the variant into the key (`['parcel-lookup', parcelId, semi]`) with a registry row, or keep the answered page out of the shared entry.
- Opened: file:line opened: mobile/__tests__/semiQuestionPage.behaviour.test.tsx:88 the quoted code is not there (not found in the file at 3a36e8b26)

### F-353 · mobile-99 (mobile-99-p2) · diff part mobile-2 · BUG severity=HIGH
- Clause: prompt rule "A change that adds behaviour no pasted clause or ruling names is a finding"
- Diff: mobile/src/hooks/useParcelLookup.ts:@@ -68,17 +76,65 @@ "SRCH.A6 (task-320; RR-0307): the caller's plan and this month's report count, read from GET /api/parcels/entitlement"
- Lens claim: the entire entitlement feature (fetchParcelEntitlement, useParcelEntitlement, ParcelToolEntitlementSchema, the ['parcel-entitlement'] cache key, the persistFilter entry, SearchSituation.entitlement) is authorized only by SRCH.A6/RR-0307 references written into code comments, which are not in the pasted context, so no pasted clause is met or checkable
- Lens fix or rationale: paste SRCH.A6 and operator ruling RR-0307 verbatim before merge, or hold these hunks
- Opened: file opened: mobile/src/hooks/useParcelLookup.ts no line number was given; the quoted code is there (line 117)

### F-354 · mobile-99 (mobile-99-p2) · diff part mobile-2 · BUG severity=HIGH
- Clause: prompt rule "A clause satisfied only by a comment, a TODO or a test name is UNMET" plus deleted constraint "_// it leaves the app for the browser (Linking.openURL, a leave-the-origin move, never a router push)_"
- Diff: mobile/src/lib/maxbldHelp.ts:@@ -1,18 +1,28 @@ "task-362 SRCH.LOTMAP-2 (small-pages-v8 search.html:235 ...): the page opens in the in-app browser sheet through expo-web-browser"
- Lens claim: the diff switches leave-the-origin Linking.openURL to WebBrowser.openBrowserAsync and deletes the leave-the-origin constraint, and the only authority cited is unpasted task-362 plus Spec 126 §11b.3/§11b.7 which are not pasted
- Lens fix or rationale: paste SRCH.LOTMAP-2 and the §11b.3 dated note, or keep Linking.openURL
- Opened: file opened: mobile/src/lib/maxbldHelp.ts no line number was given; the quoted code is not there (not found in the file at 3a36e8b26)

### F-355 · mobile-99 (mobile-99-p2) · diff part mobile-2 · BUG severity=HIGH
- Clause: prompt rule "A change that adds behaviour no pasted clause or ruling names is a finding"
- Diff: mobile/src/lib/semiQuestion.ts:@@ -12,6 +12,27 @@ "SRCH.SEMI-3 (task-361, LX-E1): how long Continue waits for the answered lookup before it ends in the built error state (a timeframe; operator item in the lane report)"
- Lens claim: SEMI_CONTINUE_WAIT_MS, SemiContinueTimeoutError, boundedWait and the new busy field rest on an unpasted task and on an operator item the comment itself says is only "in the lane report", so no pasted clause fixes 60s or requires the timeout; the consuming mount file is not in the diff, cannot see whether submitting is passed
- Lens fix or rationale: paste SRCH.SEMI-3 and the operator item, or drop the boundedWait hunk
- Opened: file opened: mobile/src/lib/semiQuestion.ts no line number was given; the quoted code is there (line 15)

### F-364 · mobile-99 (mobile-99-p3) · diff part mobile-1 · BUG severity=HIGH
- Clause: no pasted clause (the diff cites SRCH.A6, task-320, RR-0307, RR-0310, search.html:267; none is in the pasted context) "SRCH.A6 (task-320; RR-0307): the reports-left line reads the served count ... printed as served"
- Diff: mobile/app/(app)/parcel-tool/index.tsx "entitlement: entitlement ? { reportsLeft: entitlement.reportsLeft, reportsLimit: entitlement.reportsLimit, resetsOnDisplay: entitlement.resetsOnDisplay } : null,"
- Lens claim: a new server read plus a new visible line is added and no pasted clause names it, so the required shape (served-vs-computed values, no line on loading/failure/no-plan, Toronto reset date) is unverifiable
- Lens fix or rationale: paste SRCH.A6, RR-0307, RR-0310 and the contract_parcels_entitlement fields before merge, or drop the line.
- Opened: file opened: mobile/app/(app)/parcel-tool/index.tsx no line number was given; the quoted code is there (line 78)

### F-365 · mobile-99 (mobile-99-p3) · diff part mobile-1 · BUG severity=HIGH
- Clause: no pasted clause (the diff cites SRCH.SEMI stage 2, task-319, MF-93, RR-0278; none is pasted) "SRCH.SEMI stage 2 (task-319, MF-93; RR-0278): Continue first fetches the same lookup with the one flag `semi: 'answered'`, which lets the server count the lot once its report is produced"
- Diff: mobile/app/(app)/parcel-tool/semi-question.tsx "result = await boundedWait(fetchParcelLookup({ parcelId: id, semi: 'answered' }), SEMI_CONTINUE_WAIT_MS);"
- Lens claim: the counting semantics, the ordering (answered lookup before report) and the cache-write key are asserted only by a comment; the pasted clauses say nothing about them, so compliance cannot be established
- Lens fix or rationale: paste RR-0278 and the SRCH.SEMI stage 2 clause.
- Opened: file opened: mobile/app/(app)/parcel-tool/semi-question.tsx no line number was given; the quoted code is there (line 64)

### F-366 · mobile-99 (mobile-99-p3) · diff part mobile-1 · BUG severity=HIGH
- Clause: no pasted clause (the diff cites SRCH.METER-2, task-360, UX-2c; none is pasted) "SRCH.METER-2 (task-360, UX-2c): the server holds an unsure lot's page (null) until the answer, so while the question is owed the screen shows the loading state, never the miss text"
- Diff: mobile/app/(app)/parcel-tool/[parcelId].tsx "const { view, lifecycle } = reportScreenState({ data: data && !ask ? { page: data.page ?? null } : undefined, isError });"
- Lens claim: suppressing the not-found view while a question is owed is new behaviour with no pasted clause behind it, and I cannot see whether an error path still renders correctly under it
- Lens fix or rationale: paste SRCH.METER-2 and the report-screen state clause.
- Opened: file opened: mobile/app/(app)/parcel-tool/[parcelId].tsx no line number was given; the quoted code is there (line 36)

### F-378 · mobile-core (mobile-core) · diff part mobile-2 · BUG severity=HIGH
- Clause: .claude/domain-admin.md Rules "No `console.log` in committed code
- Diff: use `Sentry.captureException()` for errors."
- Lens claim: mobile/src/lib/maxbldHelp.ts "console.warn(`[maxbldHelp] could not open Help & Support (topic ${topic})`);"
- Lens fix or rationale: the caught openBrowserAsync failure is written to console and never reaches Sentry, so the rule's error path is unmet — replace with Sentry.captureException(e, { extra: { topic } }) inside the catch, keep the non-throwing signature.
- Opened: no file:line in the field as returned: use `Sentry.captureException()` for errors."

### F-387 · mobile-core (mobile-core) · diff part surface-1 · BUG severity=HIGH
- Clause: bindings note "The check C-9m still requires exactly one min-h- token on the list; nothing under 44 is listed." plus "orchestrator decision under the pre-approved criteria, MORNING-DECISIONS.md:1227 (not an operator ruling)"
- Diff: scripts/surfaces/_schema/bindings.json:73 "Button": ["min-h-[44px]", "min-h-[48px]"], "Input": ["min-h-[44px]"]
- Lens claim: the same added note pins one min-h- token per entry and disclaims operator authority for the 48 px variant, and Button now lists two tokens, so the lock the note cites cannot pass and the allowance rests on a decision the note says is not an operator ruling
- Lens fix or rationale: hold min-h-[48px] until an operator ruling is recorded, and keep one token per entry or amend C-9m in the same change.
- Opened: file:line opened: scripts/surfaces/_schema/bindings.json:73 the quoted code is there

### F-388 · mobile-core (mobile-core) · diff part surface-1 · BUG severity=HIGH
- Clause: no pasted clause or ruling names footer content on the mobile search surface; the mobile notes enumerate "mounts gains the search screen", "mounts gains the map page", "non_display_keys gains the react-native-maps prop names that carry no display text" and never a mobile footer
- Diff: mobile/src/generated/surfaces/mobile_parcel_search.json:9 "footer.help": "Help & Support" (with footer.copyright, footer.privacy, footer.terms)
- Lens claim: four new content keys enter a live surface, and their link targets are the web STATIC pages, with nothing naming them for mobile
- Lens fix or rationale: remove them or add the ruling that names them and their route targets.
- Opened: file:line opened: mobile/src/generated/surfaces/mobile_parcel_search.json:9 the quoted code is there

### F-389 · mobile-core (mobile-core) · diff part surface-1 · BUG severity=HIGH
- Clause: the MF-53 note names only "modules gains mobile/src/components/surfaces/LotMapBinding.tsx ... mounts gains the map page; non_display_keys gains the react-native-maps prop names"
- Diff: scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_disambiguation_map.content.json:14 "select.hint": "Pick a lot on the map or in the list." and :25-26 "help.lot.prompt", "help.address.link"
- Lens claim: three content keys and a help link land on S-071 with no naming clause
- Lens fix or rationale: drop them or name them in the surface's dated note.
- Opened: file:line opened: scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_disambiguation_map.content.json:14 the quoted code is not there (not found in the file at 3a36e8b26)

### F-394 · mobile-core (mobile-core) · diff part surface-2 · BUG severity=HIGH
- Clause: domain-admin.md Rule 6 "Do not change the response shape without a contract note."
- Diff: scripts/surfaces/parcel_product/F02/contracts/contract_parcels_entitlement.descriptor.json docs.under_126 "its response is an explicit `.strict()` whitelist of six fields" vs the same diff adding `"resetsOnDisplay"` to evidence.fields
- Lens claim: the served response gains a seventh field while the descriptor's own contract statement still says six, and the data_story note names only the new caller, never the new field or its Toronto-time formatting
- Lens fix or rationale: fix: raise under_126 to seven fields (or "six plus resetsOnDisplay") and add a dated note in data_story naming resetsOnDisplay, RR-0310 and task-351.
- Opened: no file:line in the field as returned: scripts/surfaces/parcel_product/F02/contracts/contract_parcels_entitle

### F-395 · mobile-core (mobile-core) · diff part surface-2 · BUG severity=HIGH
- Clause: pasted context names no ruling for the footer work, the only authority being a code comment
- Diff: src/components/surfaces/web/footerNode.ts:7 "MF-91 (SRCH.FOOTER, task-332; operator, verbatim, 2026-11-19: "1. once  -approved" (MORNING-DECISIONS.md:1061) and "this is a shared component" (MORNING-DECISIONS.md:1066))"
- Lens claim: none of the pasted spec clauses or operator rulings mentions MF-91, SRCH.FOOTER or RR-0270, so the new shared module, the search-page footer, the `footer` prop forced onto ReportPage and the static-page footer gaining `line`/`copyright` parts are behaviour no pasted clause names
- Lens fix or rationale: fix: paste MORNING-DECISIONS.md:1061/1066 and RR-0270 into the governing context, or split the footer out of this change.
- Opened: file:line opened: src/components/surfaces/web/footerNode.ts:7 the quoted code is not there (not found in the file at 3a36e8b26)

### F-405 · spec08 (spec08) · diff part scripts-1 · BUG severity=HIGH
- Clause: Spec 08 §7 rule 4 dated note 2026-11-19 "run with `scripts/deepseek-review.js review <file> --template <lens> --context <pasted context>`"
- Diff: scripts/analysis/backlog-lane.mjs:145 "each \`${cmd} ${ctx} --template .claude/review-templates/<lens file>\` (the context file is the plan and its pasted rulings)"
- Lens claim: the plan-altitude lens commands pass the context file as the file under review and pass no --context, so deepseek-review.js:185 "specs: context ?? '(no pasted context provided)'" hands every plan lens the placeholder instead of the pasted clauses and the compliance lens, whose driver is "judge against the pasted clauses only", returns a vacuous result
- Lens fix or rationale: build the plan command as `${cmd} ${ctx} --template .claude/review-templates/<lens file> --context ${ctx}` so {{SPECS}} is populated.
- Opened: file:line opened: scripts/analysis/backlog-lane.mjs:145 the quoted code is there

### F-406 · spec08 (spec08) · diff part scripts-1 · BUG severity=MED
- Clause: Spec 08 §7 rule 2 "Ground-truth gates Compliance (§5.1/§5.2): validate the spec against reality before checking code against the spec"
- Diff: scripts/analysis/backlog-lane.mjs:145 "then triage every finding as round 2 (one grounder, KEEP or REJECT with the opened file:line, TRIAGE.md)"
- Lens claim: the added review line names DeepSeek lenses first and its only grounder after them in round 2, so no reality check is named before compliance runs, inverting rule 2 for a diff whose own citations (08_agents.md:490, Spec 127 rows) are spec claims
- Lens fix or rationale: name the ground-truth seat ahead of the compliance lens in the plan-review line.
- Opened: file:line opened: scripts/analysis/backlog-lane.mjs:145 the quoted code is there

### F-407 · spec08 (spec08) · diff part scripts-1 · BUG severity=MED
- Clause: Spec 08 §7 rule 7 "Security fires only on money/auth/PII/admin"
- Diff: scripts/analysis/backlog-lane.mjs:140 "const sec = /entitlement|auth|stripe|metered/i.test(files);"
- Lens claim: two of the four named trigger domains (admin, PII) never fire lens-security.md, so a task whose Files line names src/app/api/admin/... or a PII surface gets no security lens
- Lens fix or rationale: add the missing domains to the regex.
- Opened: file:line opened: scripts/analysis/backlog-lane.mjs:140 the quoted code is there

### F-410 · step (step-p1) · diff part load1-1 · BUG severity=HIGH
- Clause: core.9 "The runner owns every read set-up, write, transaction, session GUC (`execution.read_gucs`), catalog probe (`guards.requires` / `ctx.catalog`), calendar date (`ctx.clock` in `pipeline_timezone`) and the verdict."
- Diff: src/lib/parcels/report-compute.ts:87 "const plan = buildSourceSql(descriptor, { ...config, [POPULATION_SETTING]: [String(lot.id)] }, {});"
- Lens claim: the step's source statement is built here and executed at line 93 by a web route, a read set-up the runner does not own and no pasted clause or ruling names, so `execution.read_gucs`, the catalog probe and the check rows are all skipped on that path
- Lens fix or rationale: make the one-lot read a runner-owned operation the route calls, or declare this second executor and its read set in the step's data.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:87 the quoted code is there

### F-411 · step (step-p1) · diff part load1-1 · BUG severity=MED
- Clause: core.14 "Declared equals witnessed. Acquisition reads go in `inputs.reads`"
- Diff: src/lib/parcels/report-compute.ts:33 "const UNITS_SQL = 'SELECT unit_key, unit_id FROM bylaw_resolution_units';"
- Lens claim: the step's declared lookup reads are re-typed as string literals in a second file and run there, so declared and witnessed can drift with only a test guard and #44 blind to the second path
- Lens fix or rationale: derive both statements from the descriptor's `inputs.reads.tables` columns, or move them behind one shared reader both callers use.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:33 the quoted code is there

### F-412 · step (step-p1) · diff part load1-1 · BUG severity=MED
- Clause: core.8 "Every number a step, gate, admin surface or tool uses is a registered logic variable or an exact zero."
- Diff: src/lib/parcels/report-compute.ts:93 "const row = (await pool.query<Json>(plan.batch_sql, [lot.id - 1, 1])).rows[0];"
- Lens claim: the batch size bound on the step's statement is the literal 1, not a registered or pinned variable, so the operator can neither see nor change it
- Lens fix or rationale: read the declared batch-size variable and fail closed unless it is 1, or register a pinned tooling_ variable for it.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:93 the quoted code is there

### F-413 · step (step-p1) · diff part load1-1 · BUG severity=MED
- Clause: core.5 "Where a machine can derive a descriptor value, it is gated rather than trusted"
- Diff: src/lib/parcels/report-compute.ts:29 "const POPULATION_SETTING = 'compute_maxbld_scenarios_population_parcel_ids';"
- Lens claim: the setting name is a descriptor value re-typed in code and trusted; the C2 gate covers only the two lookup statements, so a renamed setting surfaces only at run time as an ordinary miss
- Lens fix or rationale: derive the name from the descriptor's config declaration and throw when it is absent.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:29 the quoted code is there

### F-414 · step (step-p1) · diff part load1-1 · BUG severity=MED
- Clause: core.7 "A rule kept inside compute is still written down: as a check's `why`, or as an Intent Ledger row naming where it lives, never only as a code comment"
- Diff: src/lib/parcels/report-compute.ts:14 "// Null = a miss: the switch is off, no such parcel, no Layer 2 stamp for the lot, no batch row for it."
- Lens claim: the one-lot population rule and the four miss rules live only in that header comment and the code at lines 87 and 94, with no check `why` and no Intent Ledger row
- Lens fix or rationale: add the Intent Ledger row (or check why) naming these rules and where they live.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:14 the quoted code is there

### F-415 · step (step-p1) · diff part load1-2 · BUG severity=MED
- Clause: core.14 "Declared equals witnessed" and the diff's own claim "**LOAD.1 (task-266): moved here unchanged from runtime-loader.logic.test.ts**"
- Diff: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts:124 "const expected = readJsonl(`${G25}/expected.jsonl`);"
- Lens claim: the moved body is not unchanged: the removed block contained no `expected` declaration (it read a module-level `expected` at "const e = expected.find((x) => x.parcel_id === lot.parcel_id) as Json;"), so the shared harness now performs its own per-call parse and the two tests no longer provably read the same array
- Lens fix or rationale: either keep one source of `expected` for both files or amend the "unchanged" declaration so declared equals witnessed
- Opened: file:line opened: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts:124 the quoted code is there

### F-418 · step (step-p1) · diff part route-1 · BUG severity=HIGH
- Clause: core.9 "The runner owns every read set-up, write, transaction, session GUC (execution.read_gucs), catalog probe (guards.requires / ctx.catalog), calendar date (ctx.clock in pipeline_timezone) and the verdict."
- Diff: src/lib/parcels/report-compute.ts:93 "const row = (await pool.query<Json>(plan.batch_sql, [lot.id - 1, 1])).rows[0];" (with :85 "const { values: config } = await resolveConfig(pool, descriptor);")
- Lens claim: a web route performs the runner's read set-up, config read and source-statement execution outside the runner
- Lens fix or rationale: fix: expose a runner-owned single-lot read and call that, or run the compute through the runner seam.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:93 the quoted code is not there (not found in the file at 3a36e8b26)

### F-419 · step (step-p1) · diff part route-1 · BUG severity=HIGH
- Clause: core.14 "Declared equals witnessed. Acquisition reads go in inputs.reads ... Fast invariant #44 traces what the step really runs and fails any gap"
- Diff: src/lib/parcels/report-compute.ts:33 "const UNITS_SQL = 'SELECT unit_key, unit_id FROM bylaw_resolution_units';" and :32 "fails src/tests/customer-report-compute.logic.test.ts (C2)"
- Lens claim: two SQL statements the step now runs are re-typed in the caller and witnessed only by a test name, with no descriptor or ledger line in this diff declaring them
- Lens fix or rationale: fix: declare these reads in the descriptor/ledger, or read them through the runner's declared lookup path.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:33 the quoted code is not there (not found in the file at 3a36e8b26)

### F-420 · step (step-p1) · diff part route-1 · BUG severity=MED
- Clause: core.1 "Behaviour lives in descriptor data, a declared check, a shape rule or (last resort) a new schema field, never only in code (Rule 1)."
- Diff: src/lib/parcels/report-compute.ts:87 "const plan = buildSourceSql(descriptor, { ...config, [POPULATION_SETTING]: [String(lot.id)] }, {});"
- Lens claim: the one-lot population override and its keyset window exist only in this code, not in descriptor data
- Lens fix or rationale: fix: declare the single-lot scope in descriptor/config, or record an Intent Ledger row naming where it lives.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:87 the quoted code is there

### F-421 · step (step-p1) · diff part route-1 · BUG severity=MED
- Clause: core.10 "Compute reads the ctx shape the runner's dispatch for its descriptor actually builds ... builds that ctx through the real dispatch, stubbing only DB and network answers."
- Diff: src/lib/parcels/report-compute.ts:96 "const out = materializeRows([row], { config, lookups });"
- Lens claim: the ctx is hand-built outside dispatch, so a field the runner later adds diverges silently
- Lens fix or rationale: fix: build ctx through the real dispatch and stub only DB and network.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:96 the quoted code is there

### F-422 · step (step-p1) · diff part route-1 · BUG severity=MED
- Clause: core.8 "Every number a step, gate, admin surface or tool uses is a registered logic variable or an exact zero."
- Diff: src/lib/parcels/report-compute.ts:93 "plan.batch_sql, [lot.id - 1, 1]"
- Lens claim: the batch size 1 is a bare literal in a tool path, not a registered logic variable
- Lens fix or rationale: fix: bind the batch size from the declared config variable instead of the literal.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:93 the quoted code is there

### F-423 · step (step-p1) · diff part route-1 · BUG severity=MED
- Clause: core.7 "A rule kept inside compute is still written down: as a check's why, or as an Intent Ledger row naming where it lives, never only as a code comment"
- Diff: src/lib/parcels/report-compute.ts:88 "if (plan.batch_binds.join() !== 'last_key,batch_size') throw new Error('report-compute: the core batch statement no longer binds last_key and batch_size');"
- Lens claim: the bind-shape invariant lives in code plus a header comment only
- Lens fix or rationale: fix: add the Intent Ledger row (or a declared check) naming it.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:88 the quoted code is there

### F-425 · step (step-p1) · diff part route-2 · BUG severity=HIGH
- Clause: core.8 "Every number a step, gate, admin surface or tool uses is a registered logic variable or an exact zero."
- Diff: src/lib/report-projection/project.ts:78 "export const LOT_SIZE_PLAUSIBLE_M2 = Object.freeze({ min: 50, max: 5000 });"
- Lens claim: the implausible-lot-size window that drives the admin lineage flag (`lot_size_implausible`) is two code literals, min not equal max so it is not a pinned definitional window and it is not a registered logic variable, the operator cannot see or tune it
- Lens fix or rationale: register the two bounds as logic variables (pinned or tunable) and read them in project.ts, or pin min = max with a declared deviation.
- Opened: file:line opened: src/lib/report-projection/project.ts:78 the quoted code is there

### F-429 · step (step-p1) · diff part scripts-1 · BUG severity=HIGH
- Clause: core.8 "Every number a step, gate, admin surface or tool uses is a registered logic variable or an exact zero... Runner and gate numbers are pinned `step_*` / `gate_*` / `tooling_*` variables"
- Diff: scripts/analysis/proof-slice.mjs:21 "const DEFAULT_TIMEOUT_MS = 120000;" (also "maxBuffer: 16 * 1024 * 1024" and "const ID_RE = /^[a-z0-9-]{1,40}$/")
- Lens claim: an operator-tunable tool number and two bounds live only as literals in code, no `tooling_*` variable is declared anywhere in the diff
- Lens fix or rationale: register the per-row timeout default and the id-length bound as `tooling_proof_slice_*` variables (or pin them as exact zeros/units) and read them from config in `commandRow`/`checkSpec`
- Opened: file:line opened: scripts/analysis/proof-slice.mjs:21 the quoted code is not there (not found in the file at 3a36e8b26)

### F-430 · step (step-p1) · diff part scripts-1 · BUG severity=MED
- Clause: core.7 "A rule kept inside compute is still written down: as a check's `why`, or as an Intent Ledger row naming where it lives, never only as a code comment"
- Diff: scripts/analysis/src-sql-ledger.mjs:111 "'src/lib/parcels/report-compute.ts', // LOAD.1 (task-266...): the batch statement text is built by the Layer 3 step's own core...; no request text enters it"
- Lens claim: the justification for the newly counted interpolated SQL (no request text enters it, lot id is an integer, binds are last_key/batch_size) exists only as a trailing `//` comment, no declared check `why` and no Intent Ledger row carries it
- Lens fix or rationale: move that sentence into the check `why` (or an Intent Ledger row naming where it lives) and leave the comment pointing at it
- Opened: file:line opened: scripts/analysis/src-sql-ledger.mjs:111 the quoted code is not there (not found in the file at 3a36e8b26)

### F-433 · step (step-p2) · diff part load1-1 · BUG severity=HIGH
- Clause: x-rulings.1 "the same commit adds the both-directions test and amends the spec"
- Diff: src/app/api/parcels/lookup/route.ts "+    else if (access === 'parcel_tool' && body.parcel && parcelRef !== null && body.lotForm?.unsure === true && semi !== 'answered') meter = 'semi_pending';"
- Lens claim: this diff part changes the page and the meter for every unsure lot (hold until semi=answered) but adds no test for either direction; the new test file covers only computeCustomerPageResponse C1 to C9
- Lens fix or rationale: add a route-level logic test for held (page null, semi_pending) and lifted (page produced, counted once), or cite the part that carries it.
- Opened: file opened: src/app/api/parcels/lookup/route.ts no line number was given; the quoted code is there (line 182)

### F-441 · step (step-p2) · diff part route-1 · BUG severity=HIGH
- Clause: x-verify.1 "Before an integrate-N branch is built, a fresh lane that did not write the work verifies every landing lane's claims read-only ... The report lives at `docs/reports/verification/<branch>.md` and every integrate commit cites it"
- Diff: src/lib/parcels/report-compute.ts:17 "Integrated with the board head (2026-11-19, merge ba7953933): the related run of the merge commit re-proves C1 to C9 on that head."
- Lens claim: the integration and re-proof claims are satisfied only by a code comment, no verification report path or cited report appears anywhere in the diff
- Lens fix or rationale: cite docs/reports/verification/<branch>.md in the header and the commit trailer, or delete the claim.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:17 the quoted code is there

### F-446 · step (step-p2) · diff part route-2 · BUG severity=HIGH
- Clause: x-rulings.1 "Cited ids must resolve."
- Diff: src/lib/report-projection/format.ts:53 "K2 (operator 2026-11-13"
- Lens claim: the id K2 resolves in the pasted handbook (section 6 table) to "K2 | none | x-tooling.3 | no machine check: programme stop criterion; UNCERTAIN who checks", not to a yes/no page-rule ruling, so the citation that justifies TEXT_RULES does not resolve to the pasted id
- Lens fix or rationale: fix: cite the decisions-log stem and decision id for the 2026-11-13 yes/no ruling, and stop labelling it K2.
- Opened: file:line opened: src/lib/report-projection/format.ts:53 the quoted code is there

### F-447 · step (step-p2) · diff part route-2 · BUG severity=HIGH
- Clause: x-rulings.4 "each set of rulings ... is committed verbatim as docs/reports/decisions/<date>-<slug>.json" and "every approved decision becomes a register row ... that cites <log stem>#<decision id>"
- Diff: src/lib/parcels/report-page.ts:9 "MORNING-DECISIONS.md:789"
- Lens claim: the operator words and the 2026-11-11/11-12/11-13 dated rulings are cited as raw file line refs, and no decisions log or register row appears in the six files (the same pattern recurs at project.ts:6 and format.ts:53)
- Lens fix or rationale: fix: cite <log stem>#<decision id> and land the docs/reports/decisions log plus register row in the same commit, or the pre-commit --check fails on an uncovered decision.
- Opened: file:line opened: src/lib/parcels/report-page.ts:9 the quoted code is there

### F-448 · step (step-p2) · diff part route-2 · BUG severity=HIGH
- Clause: x-rulings.1 "the same commit adds the both-directions test and amends the spec"
- Diff: src/lib/report-projection/format.ts:56 "export const TEXT_RULES = ['yes_no', 'confidence'] as const;"
- Lens claim: two new page rules are added off a bare operator quote with no spec amendment and no both-directions test anywhere in the diff (no test file among the six)
- Lens fix or rationale: fix: add the spec clause/register row and the two-direction test in this commit, or drop TEXT_RULES from this change.
- Opened: file:line opened: src/lib/report-projection/format.ts:56 the quoted code is there

### F-449 · step (step-p2) · diff part route-2 · BUG severity=HIGH
- Clause: x-rulings.2 "add a both-directions test and re-run the golden capture"
- Diff: src/lib/report-projection/seed-shas.ts:6 "src/tests/admin-report-preview-live.logic.test.ts asserts both give the same hex."
- Lens claim: the hex-parity lock and the L1 lock are asserted only by comments naming tests that are not in the diff, which is UNMET by the walk rule, and the new pageForVerdict miss branch has no both-directions test
- Lens fix or rationale: fix: land the named tests (or the diff hunks that add them) and the golden capture in this commit.
- Opened: file:line opened: src/lib/report-projection/seed-shas.ts:6 the quoted code is there

### F-455 · storage (storage-p1) · diff part load1-1 · BUG severity=HIGH
- Clause: P1 / A-ST5 "Compute on first open: the pure core ... runs once when a lot is first opened from the search page, behind the loading screen" / "are computed by the pure core when the lot is first opened from the search page, tracked, or given an owner input, and are then stored with their stamp"
- Diff: src/lib/parcels/report-compute.ts:12 "Nothing is written (the record write is ST.P1, task-265)" (also A-MF62 "still skips for a re-opened lot (its record is read)")
- Lens claim: the compute builds a page and discards it, so no lot ever holds a record and every open, including a re-open, recomputes the full core (0.1 to 33.6 s)
- Lens fix or rationale: write the record with this compute (ST.P1) or keep this entry unreachable from any live switch until the store lands.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:12 the quoted code is not there (not found in the file at 3a36e8b26)

### F-456 · storage (storage-p1) · diff part load1-1 · BUG severity=HIGH
- Clause: P4 "if the compute fails it shows the closed not_evaluated:<reason> (lifecycle `error`); never blank, 0 or the old number" (also A-126 "a failed compute is the lifecycle `error` with a closed not_evaluated:<reason>")
- Diff: src/app/api/parcels/lookup/route.ts:141 "A compute error throws to the catch below (500): no page, no meter", and report-compute.ts:16 "A thrown query or a core error propagates (the route's error boundary makes it a 500 with no page and no meter); it is never read as a miss"
- Lens claim: a failed compute is a 500 with no page, not the closed not_evaluated:<reason> page the clause names
- Lens fix or rationale: catch the compute failure at the route and return the closed not_evaluated:<reason> page (lifecycle error), or land a pasted ruling that a 500 is the failed-compute form.
- Opened: file:line opened: src/app/api/parcels/lookup/route.ts:141 the quoted code is not there (not found in the file at 3a36e8b26)

### F-459 · storage (storage-p1) · diff part load1-2 · BUG severity=CRIT
- Clause: NONE
- Diff: NONE
- Lens claim: 
- Opened: no code line cited (NONE)

### F-463 · storage (storage-p1) · diff part route-1 · BUG severity=CRIT
- Clause: P4 "if the compute fails it shows the closed not_evaluated:<reason> (lifecycle `error`); never blank, 0 or the old number."
- Diff: src/lib/parcels/report-compute.ts:14 "A thrown query or a core error propagates (the route's error boundary makes it a 500 with no page and no meter); it is never read as a miss."
- Lens claim: the clause's failed-compute path is a closed not_evaluated reason, the code makes it a 500 with no page, and A-126 repeats "a failed compute is the lifecycle `error` with a closed not_evaluated:<reason>"
- Lens fix or rationale: catch in the entry and return the closed not_evaluated reason so the report renders lifecycle error with a reason instead of a 500.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:14 the quoted code is not there (not found in the file at 3a36e8b26)

### F-464 · storage (storage-p1) · diff part route-1 · BUG severity=HIGH
- Clause: P1 "the pure core ... runs once when a lot is first opened from the search page" and P3 "every stored record carries Layer 2 table_version, evaluator_version and the settings sha"
- Diff: src/lib/parcels/report-compute.ts:9 "Nothing is written (the record write is ST.P1, task-265)."
- Lens claim: the served page comes from a compute that writes no record and no stamp, so the compute runs again on every open (P1 "once" unmet) and P6 "ONE record per (parcel, option) ... read by every user" has no record to read
- Lens fix or rationale: land this diff together with the ST.P1 record write and its stamp, or do not serve the computed page until the record exists.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:9 the quoted code is there

### F-470 · storage (storage-p1) · diff part route-2 · BUG severity=CRIT
- Clause: P3 "Stamp: every stored record carries Layer 2 table_version, evaluator_version and the settings sha" and A-ST5 "A stored record whose stamp differs from the current stamp is never served; it is recomputed"
- Diff: src/lib/report-projection/project.ts "if (rows.some((r) => r.layer2_table_version !== stamp.table_version)) moved.push('layer2'); if (rows.some((r) => r.catalogue_sha !== current.catalogue_sha)) moved.push('catalogue');" with src/lib/report-projection/seed-shas.ts "Object.freeze({ catalogue_sha: sha256(catalogue), switchboard_sha: sha256(switchboard) })"
- Lens claim: the stamp comparison never checks evaluator_version or the settings sha, so a record computed by an older evaluator or under older settings is judged 'current' and served, which is the stale number P4 forbids
- Lens fix or rationale: add the evaluator version and current settings sha to SeedShas/StoredRow and compare both in freshnessOf.
- Opened: file opened: src/lib/report-projection/project.ts no line number was given; the quoted code is not there (not found in the file at 3a36e8b26)

### F-487 · storage (storage-p2) · diff part route-2 · BUG severity=HIGH
- Clause: doc-16 section 6 (whole list) plus the only pasted operator lines name nothing for the web landing page
- Diff: src/lib/surfaces/maxbld-landing.ts:38 "+import { pickFooterText } from '@/components/surfaces/web/footerNode';" and :147 "+  const report: StaticReport = { sample: view, footer: pickFooterText(SEARCH_CONTENT), ..."
- Lens claim: this diff adds customer-facing landing footer behaviour that no pasted clause or ruling names (the cited MORNING-DECISIONS.md:789 and :1160 are not pasted)
- Lens fix or rationale: move the landing footer change out of the MB-44 W diff, or paste the clause that names it
- Opened: file:line opened: src/lib/surfaces/maxbld-landing.ts:38 the quoted code is not there (not found in the file at 3a36e8b26)

### F-004 · airtight (airtight-p1) · diff part load1-1 · DEFER severity=MED
- Clause: 122 §5.5 "a bare numeric or SQL literal deciding a check's outcome, a hard-coded `INTERVAL`/date/numeric bound or `UPPER_SNAKE` constant is Rule 3 (tunables externalized) violated from inside compute rather than the descriptor"
- Diff: src/lib/parcels/report-compute.ts:89 "if (plan.batch_binds.join() !== 'last_key,batch_size') throw new Error('report-compute: the core batch statement no longer binds last_key and batch_size');"
- Lens claim: the two bind names and the keyset value are bare literals deciding whether the compute runs and which row it reads, and `compute-literals.mjs` scans only `scripts/lib/compute/**`, so no gate sees them
- Lens fix or rationale: take binds and bind values from the built plan object instead of literals.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:89 the quoted code is there

### F-005 · airtight (airtight-p1) · diff part load1-1 · DEFER severity=LOW
- Clause: 122a G11 "`require.resolve`, template `require`, `import(`" and G12 "A `*.descriptor.json` require"
- Diff: src/lib/parcels/report-compute.ts:72 "const descriptorModule = await import('../../../scripts/compute-maxbld-scenarios.descriptor.json');"
- Lens claim: the entry reaches the step by the exact constructs the closed answer set closes as FAIL, and because G0 limits scope to compute plus its require closure the src side is judged by nothing except the hand-written import allow-list in the test
- Lens fix or rationale: extend the shape rule (or a consumer-set gate) to the entry rather than a source-scan test.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:72 the quoted code is not there; it is at line 80

### F-008 · airtight (airtight-p1) · diff part route-1 · DEFER severity=LOW
- Clause: Spec 122 §5.5 "a bare numeric or SQL literal deciding a check's outcome
- Diff: a hard-coded `INTERVAL`/date/numeric bound or `UPPER_SNAKE` constant is Rule 3 (tunables externalized) violated from inside compute rather than the descriptor"
- Lens claim: src/lib/parcels/report-compute.ts "if (plan.batch_binds.join() !== 'last_key,batch_size') throw new Error(...)" and "pool.query<Json>(plan.batch_sql, [lot.id - 1, 1])"
- Lens fix or rationale: the entry hard-codes the core's bind names and the keyset window with no declared variable and no ledger row — fix: derive the bind names from the plan object and take the window from the descriptor.
- Opened: no file:line in the field as returned: a hard-coded `INTERVAL`/date/numeric bound or `UPPER_SNAKE` constant i

### F-009 · airtight (airtight-p1) · diff part route-1 · DEFER severity=LOW
- Clause: R-BF (e) "fails on any column the ledger records as read or written on a table that `docs/reports/witness/_catalog.json` lists but whose column list lacks it"
- Diff: src/lib/parcels/report-compute.ts:36 "SELECT text_key, text FROM bylaw_resolution_texts"
- Lens claim: these statements now enter the statically parsed src SQL ledger, and whether `_catalog.json` carries unit_key/unit_id/text_key/text cannot see
- Lens fix or rationale: rationale: pre-commit `src-sql-ledger.mjs --check` may red on a catalog table missing a listed column.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:36 the quoted code is there

### F-011 · airtight (airtight-p1) · diff part route-2 · DEFER severity=MED
- Clause: procedure rule (walk step 4) "A change that adds behaviour no pasted clause or ruling names is a finding"
- Diff: src/lib/surfaces/maxbld-landing.ts:147 "+const report: StaticReport = { sample: view, footer: pickFooterText(SEARCH_CONTENT), ...(demo ? { demo } : {}), ...(picture ? { picture } : {}) };"
- Lens claim: a landing footer text change in a file the rest of the diff never touches, named by no pasted clause and by no comment in the diff
- Lens fix or rationale: fix: split the footer change into its own diff with its governing ruling cited, or drop it from this one.
- Opened: file:line opened: src/lib/surfaces/maxbld-landing.ts:147 the quoted code is there

### F-012 · airtight (airtight-p1) · diff part route-2 · DEFER severity=MED
- Clause: Spec 122 §6.6.1 (e) "fails on any column the ledger records as read or written on a table that `docs/reports/witness/_catalog.json` lists but whose column list lacks it"
- Diff: src/lib/report-projection/read-stored.ts:44 "FROM parcel_maxbld_scenarios WHERE parcel_id = $1 ORDER BY building_type, field_id" and src/lib/report-projection/read-stored.ts:32 "CASE WHEN heritage_dataset_version_when_enriched IS NULL THEN NULL ELSE is_heritage_designated END"
- Lens claim: four new statically parsed src/ SQL statements read columns (switches, content_sha, heritage_dataset_version_when_enriched, ravine_dataset_version_when_enriched, address_number, linear_name_full); the src SQL ledger rows and catalog membership for them are not in the diff and cannot see
- Lens fix or rationale: fix: run `scripts/analysis/src-sql-ledger.mjs --check`, land the ledger rows for these columns, or state why the table/columns are outside the catalog.
- Opened: file:line opened: src/lib/report-projection/read-stored.ts:44 the quoted code is not there (not found in the file at 3a36e8b26)

### F-013 · airtight (airtight-p1) · diff part route-2 · DEFER severity=LOW
- Clause: Spec 122 §6.6.1 (c) "no registry or ledger row may be described as accurate unless it is generated, enforced or witnessed"
- Diff: src/lib/report-projection/read-stored.ts:27 "The parcels read is ONE static statement (the src SQL ledger" / ":28 witnesses it; no interpolated text)"
- Lens claim: the comment claims the ledger "witnesses" the statement, while the witness programme this clause names is recorded as NOT MET; the accurate word is recorded/enforced by `src-sql-ledger.mjs --check`
- Lens fix or rationale: fix: reword to "recorded in the src SQL ledger and checked by src-sql-ledger.mjs --check".
- Opened: file:line opened: src/lib/report-projection/read-stored.ts:27 the quoted code is not there (not found in the file at 3a36e8b26)

### F-015 · airtight (airtight-p1) · diff part scripts-1 · DEFER severity=MED
- Clause: R-BA ACCURATE "gate K red-first proof is a committed vitest JSON artifact, never the bare word RED"
- Diff: scripts/analysis/proof-slice.mjs:89 "if (field('RESULT') === 'PASS') return { ...base, status: 'PASS' };"
- Lens claim: the new runner turns the bare word RESULT: PASS in a text pass file into a PASS row of a compliance table, which is the bare-word shortcut the pasted standard excludes
- Lens fix or rationale: rationale: require the committed station artifact's structured fields (sha, RESULT, counts) and reject a lone PASS line.
- Opened: file:line opened: scripts/analysis/proof-slice.mjs:89 the quoted code is there

### F-016 · airtight (airtight-p1) · diff part scripts-1 · DEFER severity=MED
- Clause: scope rule "A change that adds behaviour no pasted clause or ruling names is a finding (nothing added that the card or ruling did not name)"
- Diff: scripts/analysis/backlog-lane.mjs:135 "// task-358 (REVIEW.LENSES): the review line names the Spec 08 lens set (08_agents.md:334 "NEVER run one generic pass"; section 7 rules 4, 7)"
- Lens claim: the lens line and the new --template mode rest on 08_agents.md:334 and .claude/review-templates/README.md, neither pasted, so compliance with the cited ruling cannot be established here
- Lens fix or rationale: rationale: paste Spec 08 section 7 rules 4 and 7 with the next submission, or hold the lens line until they are in the context (cannot see the cited clause).
- Opened: file:line opened: scripts/analysis/backlog-lane.mjs:135 the quoted code is there

### F-019 · airtight (airtight-p2) · diff part load1-1 · DEFER severity=MED
- Clause: "THE GATE is the existing web live switch ALONE ... decision D-1 (who sees numbers before launch, task-348) is not ruled" is a claim inside the diff, not a pasted clause
- Diff: src/lib/parcels/report-compute.ts:75 "if (!MAXBLD_WEB_LIVE) return null;"
- Lens claim: the ruling the gate rests on (D-1 / task-348) is not in the pasted context, so whether the web switch alone is the sanctioned gate is cannot see
- Lens fix or rationale: paste the D-1 ruling text; until then this clause cannot be marked met.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:75 the quoted code is there

### F-020 · airtight (airtight-p2) · diff part load1-1 · DEFER severity=MED
- Clause: "excluded[] is judged at table level against the declared reads/writes" (witness attribution, pasted)
- Diff: src/lib/parcels/report-compute.ts:33-34 "const UNITS_SQL = 'SELECT unit_key, unit_id FROM bylaw_resolution_units'; / const TEXTS_SQL = 'SELECT text_key, text FROM bylaw_resolution_texts';"
- Lens claim: the entry's two lookup reads live in src/lib and are outside the declared-reads trace check the pasted clause describes, so a descriptor change to the declared lookup tables or columns is caught only by a test regex, not by the gate
- Lens fix or rationale: take the table and column list from the descriptor at request time instead of restating it as literals.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:33 the quoted code is not there (not found in the file at 3a36e8b26)

### F-021 · airtight (airtight-p2) · diff part load1-1 · DEFER severity=LOW
- Clause: no pasted clause names new audit log fields
- Diff: src/app/api/parcels/lookup/route.ts:208-210 "semi_answered: semi === 'answered', ... page_source: pageSource, ... compute_ms: computeMs,"
- Lens claim: three fields are added to the lookup log line with no pasted clause or ruling asking for them, so an audit-surface change is shipped unverified
- Lens fix or rationale: cite the ruling that asks for these fields or leave them out of this change.
- Opened: file:line opened: src/app/api/parcels/lookup/route.ts:208 the quoted code is not there (not found in the file at 3a36e8b26)

### F-022 · airtight (airtight-p2) · diff part load1-2 · DEFER severity=MED
- Clause: diff LOAD.1 declaration (no pasted spec clause governs fixture parity) "moved here unchanged from runtime-loader.logic.test.ts so the customer compute test builds the same batch rows"
- Diff: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts:124 "const expected = readJsonl(`${G25}/expected.jsonl`);"
- Lens claim: the new body is not unchanged: the removed block (runtime-loader.logic.test.ts:48-93) opens with "const MZ = req(...)" and uses a module-scope "expected", so this read is an addition and the "same batch rows" premise is unverified (the old module-level declaration cannot see from this diff)
- Lens fix or rationale: say where the test got `expected` and reuse that exact declaration, or drop the added line and export the test's existing one.
- Opened: file:line opened: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts:124 the quoted code is there

### F-025 · airtight (airtight-p2) · diff part route-1 · DEFER severity=LOW
- Clause: not pasted (RR-0278, SRCH.METER-2, task-360)
- Diff: src/app/api/parcels/lookup/route.ts:144 "const held = lotForm?.unsure === true && semi !== 'answered';"
- Lens claim: the ruling that makes an unsure lot's page held and countable on a caller-supplied flag is not in the pasted context, so the metering change cannot be judged clause by clause
- Lens fix or rationale: paste RR-0278/task-360 before lock.
- Opened: file:line opened: src/app/api/parcels/lookup/route.ts:144 the quoted code is there

### F-026 · airtight (airtight-p2) · diff part route-1 · DEFER severity=LOW
- Clause: not pasted (SRCH.A6, RR-0310)
- Diff: src/lib/entitlements/index.ts:625 "/** resetsOn as the Toronto calendar date, "9 Dec 2026" (SRCH.A6, RR-0310)"
- Lens claim: the field is additive on a `.strict()` response, but the ruling that fixes the exact label is not pasted
- Lens fix or rationale: paste RR-0310 and check "9 Dec 2026" against it.
- Opened: file:line opened: src/lib/entitlements/index.ts:625 the quoted code is there

### F-027 · airtight (airtight-p2) · diff part route-1 · DEFER severity=LOW
- Clause: not pasted (MF-91/SRCH.FOOTER, MORNING-DECISIONS.md:1066)
- Diff: src/components/report/ReportPage.tsx:404 "export function ReportPage({ view, footer }: { view: PageView; footer: FooterText }): ReactElement {"
- Lens claim: a now-required prop on a shared component rests on operator words that are not in the pasted context
- Lens fix or rationale: paste the MORNING-DECISIONS.md:1066 line if the shared-footer clause is meant to bind.
- Opened: file:line opened: src/components/report/ReportPage.tsx:404 the quoted code is there

### F-032 · airtight (airtight-p2) · diff part route-2 · DEFER severity=LOW
- Clause: no pasted clause names the text rules (the K2 operator ruling of 2026-11-13 and the M-481 words are cited in comments only, cannot see) "K2 (operator 2026-11-13, \"a new yes/no page rule ... the existing formatter pattern\")"
- Diff: src/lib/report-projection/format.ts:56 "export const TEXT_RULES = ['yes_no', 'confidence'] as const;"
- Lens claim: the yes/no rule, the confidence words and the weakest-first order (CONFIDENCE_ORDER, :59) are operator rulings not in the pasted context, so the word set and the weakest-of-several selection cannot be checked
- Lens fix or rationale: paste the K2 ruling and the M-481 word list with this diff
- Opened: file:line opened: src/lib/report-projection/format.ts:56 the quoted code is there

### F-034 · airtight (airtight-p2) · diff part scripts-1 · DEFER severity=MED
- Clause: Ledger key and locks, "a listed literal that now parses or is gone is RED (orphan)"
- Diff: scripts/analysis/src-sql-ledger.mjs:111 "the binds are last_key and batch_size), passed as a variable; no request text enters it"
- Lens claim: src/lib/parcels/report-compute.ts is not in this diff, so cannot see whether the statement still interpolates; if it is static now the listing is a stale orphan and RED
- Lens fix or rationale: include the file or a gate render showing it still interpolates.
- Opened: file:line opened: scripts/analysis/src-sql-ledger.mjs:111 the quoted code is there

### F-035 · airtight (airtight-p2) · diff part scripts-1 · DEFER severity=MED
- Clause: no pasted clause or ruling names PROOF.TOOL
- Diff: scripts/analysis/proof-slice.mjs:1 "task-68 PROOF.TOOL, stage 2 (minimum). Plan: docs/reports/lanes/2026-11-19/BL-PROOF/PLAN.md sections 4 and 5."
- Lens claim: the runner plus scripts/analysis/proof-slices.json add new behaviour no pasted clause names
- Lens fix or rationale: paste the governing task-68 plan or operator ruling as the clause, or drop the tool from this change.
- Opened: file:line opened: scripts/analysis/proof-slice.mjs:1 the quoted code is not there; it is at line 6

### F-036 · airtight (airtight-p2) · diff part scripts-1 · DEFER severity=LOW
- Clause: no pasted clause or ruling names REVIEW.LENSES or --template
- Diff: scripts/analysis/backlog-lane.mjs:136 "// task-358 (REVIEW.LENSES): the review line names the Spec 08 lens set"
- Lens claim: new review behaviour no pasted clause names
- Lens fix or rationale: paste the Spec 08 section 7 ruling or task-358 card as the governing clause, or drop it.
- Opened: file:line opened: scripts/analysis/backlog-lane.mjs:136 the quoted code is there

### F-037 · bylaw (bylaw-p1) · diff part load1-1 · DEFER severity=MED
- Clause: RR-0278 / task-360 / task-319 / LOAD.1 task-266 (cited, text not pasted) "SRCH.METER-2 (task-360, RR-0278): an unsure lot's page is HELD until the semi answer (semi=answered, the task-319 flag)"
- Diff: src/app/api/parcels/lookup/route.ts:145 "const held = lotForm?.unsure === true && semi !== 'answered';"
- Lens claim: the only authority quoted for withholding a customer page and for the new `semi` query flag is a task id; I cannot read the ruling text, so the hold and the `semi=answered` lift are unverifiable here
- Lens fix or rationale: paste RR-0278, task-360 and task-319's verbatim text (or the Spec 100 §3.2 dated line) before merge.
- Opened: file:line opened: src/app/api/parcels/lookup/route.ts:145 the quoted code is there

### F-038 · bylaw (bylaw-p1) · diff part load1-1 · DEFER severity=MED
- Clause: Spec 100 §3.2 / D-1 gate claim "THE GATE is the existing web live switch ALONE ... the compute is dark code at landing, as W is."
- Diff: src/lib/parcels/report-compute.ts:75 "if (!MAXBLD_WEB_LIVE) return null;"
- Lens claim: cannot see the switch's current value in the pasted context, and the diff says the same switch already governs W, which serves customer pages today, so "dark at landing" holds only if that switch is off in production at merge
- Lens fix or rationale: state the switch's launch value in the plan, or land the entry behind the D-1 ruling (not pasted).
- Opened: file:line opened: src/lib/parcels/report-compute.ts:75 the quoted code is there

### F-039 · bylaw (bylaw-p1) · diff part load1-1 · DEFER severity=MED
- Clause: m.256 "Averaging with a missing or excluded neighbour estimate answers \"needs survey\", never the zone default." and m.245 "No zone-default floor under the averaged front yard."
- Diff: src/lib/parcels/report-compute.ts:93 "const row = (await pool.query<Json>(plan.batch_sql, [lot.id - 1, 1])).rows[0];"
- Lens claim: cannot see whether the core's batch statement, run over a single-element population, still carries the neighbour/ring inputs the front-yard average needs; the parity test compares the entry to a projection of the same single-row output, so a divergence from the pipeline's stored rows would not surface
- Lens fix or rationale: add one assertion against the pipeline's stored e1 rows for a golden lot, not against the compute's own output re-projected.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:93 the quoted code is there

### F-040 · bylaw (bylaw-p1) · diff part load1-1 · DEFER severity=LOW
- Clause: route.ts header ruling "SRCH.METER-2 ... a page that is sent must be a page that is counted"
- Diff: src/app/api/parcels/lookup/route.ts:180 "if (access === 'parcel_tool' && body.parcel && parcelRef !== null && !hasEvaluatedOption(body.parcel)) meter = 'not_evaluated';"
- Lens claim: the stated invariant is already false for the operator "1 b 2 a" arm (a page is sent and nothing is counted), so the rationale for the hold reads absolute where the meter is not
- Lens fix or rationale: reword the comment to except the not_evaluated arm.
- Opened: file:line opened: src/app/api/parcels/lookup/route.ts:180 the quoted code is there

### F-041 · bylaw (bylaw-p1) · diff part load1-1 · DEFER severity=LOW
- Clause: m.169 "A condition no data can decide is taken as not holding, and its impact is disclosed."
- Diff: src/app/api/parcels/lookup/route.ts:145 "const held = lotForm?.unsure === true && semi !== 'answered';"
- Lens claim: for an unsure lot the diff withholds the whole page instead of serving it with the condition disclosed; this may be exactly what RR-0278 rules (not pasted), so it cannot be judged
- Lens fix or rationale: cite the ruling text so the disclosure clause and the hold are shown to be reconciled.
- Opened: file:line opened: src/app/api/parcels/lookup/route.ts:145 the quoted code is there

### F-042 · bylaw (bylaw-p1) · diff part load1-2 · DEFER severity=LOW
- Clause: no pasted clause
- Diff: the docstring provenance golden25-harness.ts:121 "LOAD.1 (task-266)"
- Lens claim: the cited card is not in the pasted context, so the "unchanged" claim cannot be tied to a governing line
- Lens fix or rationale: safe to defer: the substantive claim is verifiable from the diff itself and no pasted clause depends on the citation.
- Opened: file:line opened: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts:121 the quoted code is there

### F-043 · bylaw (bylaw-p1) · diff part load1-2 · DEFER severity=LOW
- Clause: no pasted clause
- Diff: golden25-harness.ts:123 "const expected = readJsonl(`${G25}/expected.jsonl`);"
- Lens claim: this line does not appear in the removed block, so "moved here unchanged" is not literally true
- Lens fix or rationale: safe to defer: behaviour is equivalent, and comment accuracy is not a pasted-clause obligation.
- Opened: file:line opened: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts:123 the quoted code is there

### F-044 · bylaw (bylaw-p1) · diff part route-1 · DEFER severity=MED
- Clause: m.214 "Forms not modelled are disclosed."
- Diff: src/lib/parcels/report-compute.ts "flags: (r.flags ?? null) as string[] | null," beside "switches: (typeof r.switches === 'string' ? JSON.parse(r.switches) : r.switches ?? null),"
- Lens claim: the computed path parses `switches` from JSON text but casts `flags` bare, so if the core hands flags the same JSON-text shape the disclosure flags reach the projection as a string and the disclosed rows vanish, leaving m.214 and m.169 unmet on the computed path
- Lens fix or rationale: parse `flags` through the same branch as `switches`, or throw when its type is not an array of strings.
- Opened: file opened: src/lib/parcels/report-compute.ts no line number was given; the quoted code is not there (not found in the file at 3a36e8b26)

### F-045 · bylaw (bylaw-p1) · diff part route-1 · DEFER severity=MED
- Clause: RR-0278 / SRCH.METER-2, not pasted, cannot see
- Diff: src/app/api/parcels/lookup/route.ts "SRCH.METER-2 (task-360, RR-0278): an unsure lot's page is HELD until the semi answer,"
- Lens claim: the only statement of the clause this hold implements is the diff's own comment, so by rule 3 the hold is UNMET against the pasted context: I cannot check which lots are held, nor that "a page that is sent is a page that is counted" is the ruled sentence
- Lens fix or rationale: paste RR-0278 (and task-319 / MF-93 stage 2) verbatim before lock.
- Opened: file opened: src/app/api/parcels/lookup/route.ts no line number was given; the quoted code is not there (not found in the file at 3a36e8b26)

### F-046 · bylaw (bylaw-p1) · diff part route-1 · DEFER severity=MED
- Clause: RR-0310 / SRCH.A6, not pasted, cannot see
- Diff: src/lib/parcels/lot-size-entry.ts "SRCH.A6 reset label (task-351, RR-0310): the Toronto calendar date as the v8 draws it, \"9 Dec 2026\""
- Lens claim: the served label's exact shape (no leading zero, fixed month table, Toronto calendar) rests on a comment citing a ruling that is not in the pasted context, so the new wire field `resetsOnDisplay` cannot be judged clause by clause
- Lens fix or rationale: paste RR-0310 with its exact required string form.
- Opened: file opened: src/lib/parcels/lot-size-entry.ts no line number was given; the quoted code is not there (not found in the file at 3a36e8b26)

### F-047 · bylaw (bylaw-p1) · diff part route-1 · DEFER severity=MED
- Clause: D-1 (task-348), unruled, quoted in the diff, cannot see a pasted authorisation
- Diff: src/lib/parcels/report-compute.ts "decision D-1 (who sees numbers before launch, task-348) is not ruled, so this adds no session gate, no admin condition and no new switch."
- Lens claim: the change ships a request-time page-serving compute whose own governing decision it declares unruled, and no pasted clause or ruling authorises that path, so the behaviour is added unnamed
- Lens fix or rationale: paste the operator ruling behind LOAD.1 / "task 341 approved" or hold the entry until D-1 is ruled.
- Opened: file opened: src/lib/parcels/report-compute.ts no line number was given; the quoted code is not there (not found in the file at 3a36e8b26)

### F-048 · bylaw (bylaw-p1) · diff part route-1 · DEFER severity=LOW
- Clause: m.455 "post-signing edits to the MB-64 increment-1 key from the McProof sign-off, as one ledger row (cases PERM-10, FY-1, ... FOOT-14, FOOT-16, FOOT-18, ...)."
- Diff: src/components/report/ReportPage.tsx "{ role: 'link', content: 'footer.terms', href: '/terms' }, { role: 'link', content: 'footer.privacy', href: '/privacy' }, { role: 'link', content: 'footer.help', href: '/help' },"
- Lens claim: the rendered footer content changes (three links added, copyright re-parented) while the pasted footer cases FOOT-14/FOOT-16/FOOT-18 are still OWED to MB-80 lane T, and the diff names none of them
- Lens fix or rationale: name the FOOT cases this render touches and confirm they move with the m.455 ledger row.
- Opened: file opened: src/components/report/ReportPage.tsx no line number was given; the quoted code is there (line 262)

### F-049 · bylaw (bylaw-p1) · diff part route-2 · DEFER severity=MED
- Clause: m.183 "An exemption that removes every candidate answers "does not apply", never "not evaluated"."
- Diff: src/lib/report-projection/project.ts:203 "if (!gated && status !== null && HIDDEN_STATES.includes(status)) shownAs = 'hidden'; else if (!gated && status === PERMITTED) shownAs = 'shown';"
- Lens claim: for a gated lot the stored status is never consulted at all and every option defaults to 'not_evaluated' (the same for any status not in HIDDEN_STATES), so a stored does-not-apply/gate answer reaches the page as "not evaluated"
- Lens fix or rationale: route the does-not-apply answer to its own counted state (and do not discard the stored status on a gated lot) before the not_evaluated default.
- Opened: file:line opened: src/lib/report-projection/project.ts:203 the quoted code is there

### F-050 · bylaw (bylaw-p1) · diff part route-2 · DEFER severity=MED
- Clause: m.214 "Forms not modelled are disclosed."
- Diff: src/lib/report-projection/project.ts:275 "flags: Array.isArray(r.flags) ? [...r.flags] : [],"
- Lens claim: the stored disclosure flags go only into the admin lineage, and the customer page response (src/lib/report-projection/project.ts:68 "export interface PageResponse { page: string; values: Record<string, string>; hidden: string[]; not_evaluated: string[] }") has no channel for them, so a disclosure stored on a shown card never reaches the customer surface
- Lens fix or rationale: carry the stored disclosure sentence in a page value part, not in lineage only.
- Opened: file:line opened: src/lib/report-projection/project.ts:275 the quoted code is there

### F-051 · bylaw (bylaw-p1) · diff part route-2 · DEFER severity=MED
- Clause: m.457 "Increment 2 builds the roof forms: increment 6b's flat set-back storey and pitched roof with attic move into increment 2, with the main-wall share caps; the larger is headlined."
- Diff: src/lib/report-projection/project.ts:194 "const rowOf = (bt: string, field: string): StoredRow | undefined => stored.find((r) => r.building_type === bt && r.field_id === field);"
- Lens claim: the row is picked by building_type and field_id only, with the read ordered "ORDER BY building_type, field_id" (src/lib/report-projection/read-stored.ts), so the increment dimension the clause names (and the lineage itself lists as a set) never selects the row: when a lot carries rows from more than one increment the page shows whichever sorts first
- Lens fix or rationale: pick the governing increment explicitly or fail closed when more than one row matches.
- Opened: file:line opened: src/lib/report-projection/project.ts:194 the quoted code is there

### F-052 · bylaw (bylaw-p1) · diff part route-2 · DEFER severity=LOW
- Clause: no pasted clause names a landing footer
- Diff: src/lib/surfaces/maxbld-landing.ts:147 "const report: StaticReport = { sample: view, footer: pickFooterText(SEARCH_CONTENT), ...(demo ? { demo } : {}), ...(picture ? { picture } : {}) };"
- Lens claim: this adds footer behaviour that no pasted clause or operator ruling names, inside a change about the stored report read
- Lens fix or rationale: split it out of this diff or cite the clause that names it.
- Opened: file:line opened: src/lib/surfaces/maxbld-landing.ts:147 the quoted code is there

### F-054 · bylaw (bylaw-p2) · diff part load1-1 · DEFER severity=MED
- Clause: m.64 "Only permitted scenarios are shown; every other scenario is recorded, counted and never displayed."
- Diff: src/lib/parcels/report-compute.ts:9 "Nothing is written (the record write is ST.P1, task-265)."
- Lens claim: the compute path suppresses non-permitted scenarios through the shared projection but records and counts none of them at the lookup, so the clause's "recorded, counted" arm rests entirely on a later task
- Lens fix or rationale: log the count of suppressed scenarios (or cite task-265's coverage of computed pages) before MAXBLD_WEB_LIVE goes on.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:9 the quoted code is there

### F-055 · bylaw (bylaw-p2) · diff part load1-1 · DEFER severity=LOW
- Clause: m.71 "No live report column moves before its shadow passes."
- Diff: src/app/api/parcels/lookup/route.ts:151 "pageResponse = await computeCustomerPageResponse(parcelRef);"
- Lens claim: lots that had no stored page are now served a computed page live with no shadow round or round record naming that content, the only brake is the web live switch (report-compute.ts:75 "if (!MAXBLD_WEB_LIVE) return null;")
- Lens fix or rationale: state where the shadow/round record for a computed page lives, or hold LOAD.1 behind the switch until it exists.
- Opened: file:line opened: src/app/api/parcels/lookup/route.ts:151 the quoted code is there

### F-056 · bylaw (bylaw-p2) · diff part load1-1 · DEFER severity=LOW
- Clause: m.0 "Every field, gate, file and mode names the mistake it prevents or the reader it serves"
- Diff: src/app/api/parcels/lookup/route.ts:90 "semi: sp.get('semi') ?? undefined,"
- Lens claim: ConsumerParcelLookupQuerySchema's declaration of `semi` is not in this diff (cannot see it); if the schema does not declare the field, Zod strips it and `semi === 'answered'` is never true, so the SRCH.SEMI hold never lifts
- Lens fix or rationale: paste the schema line showing `semi` accepted, with its allowed values.
- Opened: file:line opened: src/app/api/parcels/lookup/route.ts:90 the quoted code is there

### F-057 · bylaw (bylaw-p2) · diff part load1-1 · DEFER severity=LOW
- Clause: operator ruling cited by the change, MORNING-DECISIONS.md:1061 / RR-0271, not pasted in this context
- Diff: src/lib/parcels/report-compute.ts:5 "operator \"2. y\", MORNING-DECISIONS.md:1061, RR-0271, and \"task 341 approved\", :1160"
- Lens claim: the operator words that authorise the one-lot compute and the semi hold are cited only inside the diff, so I cannot verify the change against them (cannot see MORNING-DECISIONS.md or RR-0271/RR-0278)
- Lens fix or rationale: paste those lines if this review is to bind them.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:5 the quoted code is not there (not found in the file at 3a36e8b26)

### F-058 · bylaw (bylaw-p2) · diff part load1-2 · DEFER severity=MED
- Clause: m.0 "each change says what it replaces"
- Diff: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts:122 "/** LOAD.1 (task-266): moved here unchanged from runtime-loader.logic.test.ts so the customer compute test builds the same batch rows."
- Lens claim: the moved body is not unchanged: it gains a new first statement, so the change's own claim of what it replaces is false and the substitution is invisible to a reviewer
- Lens fix or rationale: reword the comment to name the added read (e.g. "adds its own read of the golden expected.jsonl so the builder no longer relies on the test file's module scope") or pass `expected` in as an argument so the body really is unchanged
- Opened: file:line opened: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts:122 the quoted code is there

### F-059 · bylaw (bylaw-p2) · diff part load1-2 · DEFER severity=MED
- Clause: m.0 "each change says what it replaces"
- Diff: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts:124 "const expected = readJsonl(`${G25}/expected.jsonl`);"
- Lens claim: the removed function read `expected` from the test file's module scope ("const e = expected.find((x) => x.parcel_id === lot.parcel_id) as Json;") whose definition is outside this diff, so whether the harness reads the same file, the same way, cannot see, and equality of the golden 25 rows before and after the move is unverified
- Lens fix or rationale: cite the module-scope definition's file:line in the comment, or show the removed and added reads side by side in the commit body
- Opened: file:line opened: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts:124 the quoted code is there

### F-060 · bylaw (bylaw-p2) · diff part load1-2 · DEFER severity=LOW
- Clause: m.0 "Every field, gate, file and mode names the mistake it prevents or the reader it serves"
- Diff: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts:122 "LOAD.1 (task-266)"
- Lens claim: the authority for the new exported surface is a task card whose clauses are not pasted, so nothing here can be checked against the card that licenses it
- Lens fix or rationale: paste the LOAD.1 / task-266 clauses (or quote the card line in the harness comment) so the export is judged against the requirement it serves
- Opened: file:line opened: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts:122 the quoted code is there

### F-061 · bylaw (bylaw-p2) · diff part route-1 · DEFER severity=MED
- Clause: m.69 "Report-field totality: output ⇄ registry ⇄ rendered."
- Diff: src/components/report/ReportPage.tsx:263 "{ role: 'copyright', content: 'footer.copyright' }," with :266 "const texts: Record<string, string> = { ...footer, sources: g2?.text ?? '', change: g3?.text ?? '' };"
- Lens claim: the section's own copyright part is no longer rendered (the deleted line "-          <T p={one(s, 'sources')} /><T p={one(s, 'change')} /><T p={one(s, 'copyright')} />"), so a view field leaves the render and a caller string takes its place
- Lens fix or rationale: bind the copyright from the part as sources and change are bound (add "copyright: g4?.text", from one(s,'copyright')), or declare footer.copyright in the registry that totals the render.
- Opened: file:line opened: src/components/report/ReportPage.tsx:263 the quoted code is not there (not found in the file at 3a36e8b26)

### F-062 · bylaw (bylaw-p2) · diff part route-1 · DEFER severity=MED
- Clause: m.69 "Report-field totality: output ⇄ registry ⇄ rendered."
- Diff: src/lib/admin/report-preview-live/stored-page.ts "-for (const c of PARCEL_COLUMNS) if (!PARCEL_SELECTED.includes(c)) throw new Error(`MB-93: page field source parcels:${c} is not in the static parcels read`);"
- Lens claim: the load-time witness that every parcels-sourced page field is in the fetched select list is deleted with the read, and whether readStoredPage re-establishes it is not in this diff (cannot see '@/lib/report-projection/read-stored'), so the totality witness is now unverifiable from the change
- Lens fix or rationale: cite the moved check in the diff or keep the PARCEL_COLUMNS loop here against that module's exported column list.
- Opened: file opened: src/lib/admin/report-preview-live/stored-page.ts no line number was given; the quoted code is not there (not found in the file at 3a36e8b26)

### F-063 · bylaw (bylaw-p2) · diff part route-1 · DEFER severity=MED
- Clause: m.64 "Only permitted scenarios are shown; every other scenario is recorded, counted and never displayed."
- Diff: src/lib/parcels/report-compute.ts:9 "Nothing is written (the record write is ST.P1, task-265)."
- Lens claim: a page served from the one-lot compute displays the permitted rows while its non-permitted siblings are neither recorded nor counted on that path, so the clause's recording arm has no object here
- Lens fix or rationale: say in the file (and the pack) which recorded scenario set the computed display inherits, or serve the computed page only where the lot's recorded rows exist.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:9 the quoted code is there

### F-064 · bylaw (bylaw-p2) · diff part route-1 · DEFER severity=MED
- Clause: m.71 "No live report column moves before its shadow passes."
- Diff: src/lib/parcels/report-compute.ts:105 "return pageForVerdict(stored);"
- Lens claim: request-time computed values reach a customer lookup whenever MAXBLD_WEB_LIVE is true, and the file itself records that the visibility decision is unruled, "decision D-1 (who sees numbers before launch, task-348) is not ruled" (line 11), with no shadow pass for the computed values shown in the diff
- Lens fix or rationale: attach the shadow round record for the computed path, or keep the served page behind the same off-by-default gate the landing state relies on.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:105 the quoted code is there

### F-065 · bylaw (bylaw-p2) · diff part route-1 · DEFER severity=MED
- Clause: m.0 "Every field, gate, file and mode names the mistake it prevents or the reader it serves; edge cases are not chased; each change says what it replaces."
- Diff: src/app/api/parcels/lookup/route.ts:90 "semi: sp.get('semi') ?? undefined," and src/app/api/parcels/entitlement/types.ts "resetsOnDisplay: z.string().nullable(), // the same instant as the Toronto date, \"9 Dec 2026\" (RR-0310)"
- Lens claim: every clause licensing the new behaviour (SRCH.SEMI, SRCH.METER-2, RR-0278, SRCH.A6, RR-0310, LOAD.1, RR-0271, MF-91) is a comment inside the diff and appears in no pasted clause or ruling, so those clauses cannot be checked here
- Lens fix or rationale: paste the card and ruling text into the context, or mark these five behaviours unverified at lock.
- Opened: file:line opened: src/app/api/parcels/lookup/route.ts:90 the quoted code is not there (not found in the file at 3a36e8b26)

### F-067 · bylaw (bylaw-p2) · diff part route-2 · DEFER severity=MED
- Clause: m.68 "Every non-law number a formula uses is an admin logic variable; nothing is hidden."
- Diff: src/lib/report-projection/format.ts:13 "export const SQFT_PER_M2 = 10.7639;"
- Lens claim: this factor and project.ts:76 "LOT_SIZE_PLAUSIBLE_M2 = Object.freeze({ min: 50, max: 5000 })" are inline non-law numbers in code, not declared logic variables
- Lens fix or rationale: move both into the committed logic-variable JSON and read them, so changing either is a data edit.
- Opened: file:line opened: src/lib/report-projection/format.ts:13 the quoted code is there

### F-068 · bylaw (bylaw-p2) · diff part route-2 · DEFER severity=MED
- Clause: m.1 "The single source of truth is the committed generated JSON"
- Diff: src/lib/report-projection/format.ts:56 "const CONFIDENCE_WORDS: Record<string, string> = { high: 'High confidence', medium: 'Medium confidence', ..."
- Lens claim: the confidence vocabulary and project.ts:166 "const LOST: Record<string, string> = {" prose are hardcoded while the sibling status text is read from report-presentation.json, so one register has two sources
- Lens fix or rationale: read both from the committed JSON.
- Opened: file:line opened: src/lib/report-projection/format.ts:56 the quoted code is there

### F-069 · bylaw (bylaw-p2) · diff part route-2 · DEFER severity=LOW
- Clause: m.69 "Report-field totality: output ⇄ registry ⇄ rendered."
- Diff: src/lib/report-projection/project.ts:102 "if (hits.length !== 1) throw new Error(`MB-93: page field ${p.field} is not declared exactly once`);"
- Lens claim: only page to registry is asserted at load; nothing asserts registry to page, so a declared or stored field with no page part is dropped from values and from lineage.fields (project.ts:152 "const BOUND_FIELDS = new Set(BINDINGS.flatMap(...))") without being counted
- Lens fix or rationale: add a load-time assertion that every declared field is bound to a page part or named in a counted exception list.
- Opened: file:line opened: src/lib/report-projection/project.ts:102 the quoted code is there

### F-070 · bylaw (bylaw-p2) · diff part route-2 · DEFER severity=LOW
- Clause: no pasted clause or operator ruling names a landing footer
- Diff: src/lib/surfaces/maxbld-landing.ts:147 "const report: StaticReport = { sample: view, footer: pickFooterText(SEARCH_CONTENT), ...(demo ? { demo } : {}), ...(picture ? { picture } : {}) };"
- Lens claim: this adds a rendered footer element that nothing in the pasted context asks for
- Lens fix or rationale: name the clause or ruling for the landing footer in the change, or split the hunk out.
- Opened: file:line opened: src/lib/surfaces/maxbld-landing.ts:147 the quoted code is there

### F-071 · bylaw (bylaw-p3) · diff part load1-1 · DEFER severity=MED
- Clause: m.384 "Phase 3 is tables, not code (CARD P3-DATA-MODEL and the narrowed CARD-L3-REBUILD)."
- Diff: src/lib/parcels/report-compute.ts:2 "docs/specs/01-pipeline/69a_mcbylaw_register.md M-384 (Layer 3 is the step's own pure"
- Lens claim: the pasted M-384 row does not carry the words the header attributes to it, and the customer page is produced by a read-time code path rather than from the Phase 3 tables
- Lens fix or rationale: cite the pasted M-384 text verbatim, or cite the clause that authorizes a read-time compute (Spec 100 §3.2, Spec 126 §11a.7 are not pasted).
- Opened: file:line opened: src/lib/parcels/report-compute.ts:2 the quoted code is there

### F-072 · bylaw (bylaw-p3) · diff part load1-1 · DEFER severity=MED
- Clause: m.348 "Two Phase 3 gates are fixed: the shadow gate blocks on Layer 2 defects, the hidden-number check blocks at Phase 3 close."
- Diff: src/lib/parcels/report-compute.ts:74 "if (!MAXBLD_WEB_LIVE) return null;" with header line ":10" "decision D-1 (who sees numbers before launch, task-348) is not ruled, so this adds no session gate"
- Lens claim: a customer-visible numbers path lands gated by one switch while the change itself states the who-sees-numbers decision is unruled, and no pasted clause authorizes it
- Lens fix or rationale: keep the compute dark at landing and assert the switch false in the same change until D-1 is ruled.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:74 the quoted code is not there (not found in the file at 3a36e8b26)

### F-073 · bylaw (bylaw-p3) · diff part load1-1 · DEFER severity=MED
- Clause: m.328 "Every by-law rule and decision passes the five words, adds no scope, and shows its handbook ruling."
- Diff: src/app/api/parcels/lookup/route.ts:146 "const held = lotForm?.unsure === true && semi !== 'answered';"
- Lens claim: a new visibility and metering decision (SRCH.METER-2, task-360) is bundled into LOAD.1, its ruling is not in the pasted context, and no handbook row is shown for it
- Lens fix or rationale: land task-360 under its own pasted ruling text, or drop the `semi` parameter from this diff.
- Opened: file:line opened: src/app/api/parcels/lookup/route.ts:146 the quoted code is there

### F-074 · bylaw (bylaw-p3) · diff part load1-1 · DEFER severity=LOW
- Clause: m.415 "The runRow seam and the rounding contract."
- Diff: src/lib/parcels/report-compute.ts:86 "const plan = buildSourceSql(descriptor, { ...config, [POPULATION_SETTING]: [String(lot.id)] }, {});"
- Lens claim: the one-lot run is assembled by overwriting the step's population setting and driving the batch statement with the keyset bind, and a descriptor edit then throws inside a customer request at ":87" "throw new Error('report-compute: the core batch statement no longer binds last_key and batch_size')"
- Lens fix or rationale: call runRow if that is the named seam, or record in the header why the batch statement is driven directly and make the drift a test failure rather than a request 500.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:86 the quoted code is there

### F-075 · bylaw (bylaw-p3) · diff part load1-2 · DEFER severity=MED
- Clause: task-266 / LOAD.1 (the authorising card is not pasted into the context) "/** LOAD.1 (task-266): moved here unchanged from runtime-loader.logic.test.ts so the customer compute test builds the same batch rows."
- Diff: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts:122 "+export function goldenBatch(): { rows: Json[]; raw: Json } {"
- Lens claim: no pasted clause or ruling names a new shared export or the "same batch rows" requirement, so the change's stated obligation cannot be checked against the pasted set
- Lens fix or rationale: paste the task-266 LOAD.1 text (or the ruling naming it) into the context before merge
- Opened: file:line opened: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts:122 the quoted code is there

### F-076 · bylaw (bylaw-p3) · diff part load1-2 · DEFER severity=MED
- Clause: m.380 "Expected answers are the authority and are protected."
- Diff: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts:123 "+  const expected = readJsonl(`${G25}/expected.jsonl`);"
- Lens claim: the moved body is not unchanged: the removed block used an undeclared (module level) `expected` in "const e = expected.find((x) => x.parcel_id === lot.parcel_id) as Json;" and the harness copy instead re-reads the fixture, so two suites now source the authority independently and the original declaration is not pasted, cannot see
- Lens fix or rationale: confirm the test file's module level `expected` reads `${G25}/expected.jsonl` unchanged, or alias the harness one to it
- Opened: file:line opened: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts:123 the quoted code is there

### F-077 · bylaw (bylaw-p3) · diff part load1-2 · DEFER severity=LOW
- Clause: m.411 "Where the increment-1 loop data and pending tests live." / "protected-paths.json lists the three globs"
- Diff: src/tests/steps/compute_maxbld_scenarios/runtime-loader.logic.test.ts:17 "+import { goldenBatch } from './golden25-harness';"
- Lens claim: cannot see protected-paths.json, so I cannot tell whether src/tests/steps/compute_maxbld_scenarios/** is one of the three protected globs this diff now edits
- Lens fix or rationale: paste the three globs and confirm the edit is permitted
- Opened: file:line opened: src/tests/steps/compute_maxbld_scenarios/runtime-loader.logic.test.ts:17 the quoted code is there

### F-078 · bylaw (bylaw-p3) · diff part route-1 · DEFER severity=MED
- Clause: m.213 "**m.213** Heritage, ravine, holding and Chapter 900 gate or disclose."
- Diff: src/lib/admin/report-preview-live/stored-page.ts:52 (deleted) "// K2: a heritage / ravine yes-no column is NOT NULL DEFAULT false, so a never-enriched lot would read "No"; the lineage column nulls it (the page then shows the dash)." and src/lib/parcels/report-compute.ts:74 "const lot = await readLotFacts(pool, parcelRef);"
- Lens claim: the gate-or-disclose column nulling now lives in src/lib/report-projection/read-stored.ts and src/lib/report-projection/project.ts, neither in the diff, so m.213's disclosure for a never-enriched lot cannot be shown as preserved on either the stored or the computed path
- Lens fix or rationale: cannot see those files; add the moved read and the K2 null rule to the review material or a witness test so m.213 is checked, not assumed.
- Opened: file:line opened: src/lib/admin/report-preview-live/stored-page.ts:52 the quoted code is not there (not found in the file at 3a36e8b26)

### F-079 · bylaw (bylaw-p3) · diff part route-1 · DEFER severity=MED
- Clause: m.385 "**m.385** Undecided never means zero (R3-01)."
- Diff: src/lib/parcels/report-compute.ts:99 "rows: out.rows.e1.map(toStoredRow),"
- Lens claim: the stored read passes rows: null when nothing is stored ("every option takes the not-evaluated path", stored-page.ts header) while the compute passes an array that can be empty, so a lot the core evaluated to nothing may project as an answered page instead of the not-evaluated path; project.ts is not in the diff, cannot see it
- Lens fix or rationale: decide the empty-e1 case explicitly (map an empty e1 to rows: null, as W does) and pin it with a test that quotes m.385.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:99 the quoted code is there

### F-083 · bylaw (bylaw-p3) · diff part route-2 · DEFER severity=MED
- Clause: m.367 "Old hard-coded zoning values are not shown until each field group is switched."
- Diff: src/lib/parcels/report-page.ts:44 "if (!MAXBLD_WEB_LIVE) return null;"
- Lens claim: one global switch gates every parcels-sourced page value (zoning_zn_string included, read-stored.ts:31) and no per-field-group switch is added
- Lens fix or rationale: a single flip shows every group at once — add the field-group gate m.367 requires, or cite the ruling that replaced it with the one web switch
- Opened: file:line opened: src/lib/parcels/report-page.ts:44 the quoted code is not there; it is at line 57

### F-084 · bylaw (bylaw-p3) · diff part route-2 · DEFER severity=MED
- Clause: m.383 "The five objectives bind every McBylaws phase."
- Diff: src/lib/surfaces/maxbld-landing.ts:147 "footer: pickFooterText(SEARCH_CONTENT)"
- Lens claim: a landing footer is added to the report and no pasted clause or ruling names it; it rides along with a card that is about the customer report read
- Lens fix or rationale: split the footer out or cite the ruling that asks for it
- Opened: file:line opened: src/lib/surfaces/maxbld-landing.ts:147 the quoted code is there

### F-085 · bylaw (bylaw-p3) · diff part route-2 · DEFER severity=LOW
- Clause: m.371 "Every product zoning number comes from a keyed by-law clause."
- Diff: src/lib/report-projection/format.ts:36 "const sqft = grouped(Math.round(n * SQFT_PER_M2));"
- Lens claim: the "2,670 sq ft" a customer sees is produced by multiplying in code, not taken from a clause value
- Lens fix or rationale: LOW because it is a unit conversion of a stored clause number, not a new number
- Opened: file:line opened: src/lib/report-projection/format.ts:36 the quoted code is there

### F-086 · bylaw (bylaw-p4) · diff part load1-1 · DEFER severity=MED
- Clause: m.483 "row_sha, table_version and evaluator_version on bylaw_resolution_lots are stored as bytea(32) at the database boundary (migration 295) and read as hex through the view bylaw_resolution_lot_stamps; the values are unchanged and JavaScript stays hex."
- Diff: src/lib/parcels/report-compute.ts "const stamp = row.lot as { lot_gate?: string | null; table_version?: string | null; evaluator_version?: string | null };"
- Lens claim: the compute path takes table_version and evaluator_version from the core's batch row object, not from the bylaw_resolution_lot_stamps view, and the batch_sql that populates row.lot is not in this diff (cannot see), so compliance with the hex-through-the-view boundary is unverified
- Lens fix or rationale: fix: cite the batch statement's stamp source or read the stamp through the same view that W (readCustomerPageResponse) uses before projectStoredPage.
- Opened: file opened: src/lib/parcels/report-compute.ts no line number was given; the quoted code is there (line 97)

### F-087 · bylaw (bylaw-p4) · diff part load1-1 · DEFER severity=LOW
- Clause: m.454 "An out-of-bounds setting refuses the run before compute (follows R-G); amends M-428."
- Diff: src/lib/parcels/report-compute.ts "const { values: config } = await resolveConfig(pool, descriptor);"
- Lens claim: the entry delegates the bounds refusal to scripts/lib/step/config.js, which is not in the diff (cannot see), so the second caller's compliance with M-454 rests on an unpasted module
- Lens fix or rationale: fix: quote config.js's bounds refusal in the header or add a test where an out-of-bounds setting rejects the web entry.
- Opened: file opened: src/lib/parcels/report-compute.ts no line number was given; the quoted code is there (line 85)

### F-088 · bylaw (bylaw-p4) · diff part load1-1 · DEFER severity=LOW
- Clause: no pasted clause or ruling names this new request behaviour; the change cites SRCH.METER-2 (task-360) which is not in the pasted context
- Diff: src/app/api/parcels/lookup/route.ts "semi: sp.get('semi') ?? undefined," and "page_source: pageSource, // LOAD.1: stored, computed or none"
- Lens claim: the semi=answered hold/lift, the semi_answered log field and compute_ms telemetry are behaviours no pasted clause authorises, so scope compliance cannot be seen
- Lens fix or rationale: fix: attach the SRCH.METER-2 / task-360 ruling text (and confirm ConsumerParcelLookupQuerySchema accepts `semi`, also not in the diff) to the review material.
- Opened: file opened: src/app/api/parcels/lookup/route.ts no line number was given; the quoted code is there (line 90)

### F-089 · bylaw (bylaw-p4) · diff part load1-2 · DEFER severity=MED
- Clause: lc.53 "Verified by named lock; no partial green."
- Diff: golden25-harness.ts added body "const expected = readJsonl(`${G25}/expected.jsonl`);"
- Lens claim: the comment claims "moved here unchanged", but that line does not exist anywhere in the removed hunk, so the fixture the named lock reads now comes from a new read inside a shared harness no lock in this diff exercises
- Lens fix or rationale: fix: either say so in the comment ("expected.jsonl is read here now, previously module scope in the lock") or pass `expected` in as an argument so the body is genuinely the moved one.
- Opened: no file:line in the field as returned: golden25-harness.ts added body "const expected = readJsonl(`${G25}/exp

### F-090 · bylaw (bylaw-p4) · diff part load1-2 · DEFER severity=LOW
- Clause: m.511 "CITE-2 cite by id and anchor."
- Diff: golden25-harness.ts "/** LOAD.1 (task-266): moved here unchanged ... */"
- Lens claim: the only authorisation cited for a new exported helper is "LOAD.1 (task-266)", an id that appears in no pasted clause, so nothing pasted can be checked against it
- Lens fix or rationale: fix: anchor the comment to a pasted ruling or to the plan section that names the customer compute test.
- Opened: file opened: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts no line number was given; the quoted code is not there (not found in the file at 3a36e8b26)

### F-091 · bylaw (bylaw-p4) · diff part load1-2 · DEFER severity=LOW
- Clause: m.500 "golden-25 gains the houseplex class (RP-G25H)"
- Diff: golden25-harness.ts "abutters: (line.abutments || []).map((a: Json, i: number) => ({ parcel_id: lot.parcel_id, neighbour_id: 900000 + i, ..."
- Lens claim: exporting goldenBatch makes one fixed, synthetic shaping (neighbour 900000+i, street 800000+i, zone [], ring_edges []) the shared input for every consumer, so the export cannot later stand for the RP-G25H houseplex rows
- Lens fix or rationale: fix: keep the comment scoped to increment 1 and 2, or take the neighbour and street shapes as parameters.
- Opened: file opened: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts no line number was given; the quoted code is there (line 150)

### F-094 · bylaw (bylaw-p4) · diff part route-1 · DEFER severity=MED
- Clause: m.454 "An out-of-bounds setting refuses the run before compute (follows R-G); amends M-428."
- Diff: src/lib/parcels/report-compute.ts "const plan = buildSourceSql(descriptor, { ...config, [POPULATION_SETTING]: [String(lot.id)] }, {})"
- Lens claim: the entry calls the pure core with an overridden setting and no boundary check, so no refusal happens before compute
- Lens fix or rationale: run the step's own setting bounds validation on the merged config before buildSourceSql.
- Opened: file opened: src/lib/parcels/report-compute.ts no line number was given; the quoted code is there (line 87)

### F-095 · bylaw (bylaw-p4) · diff part route-1 · DEFER severity=MED
- Clause: m.483 "row_sha, table_version and evaluator_version on bylaw_resolution_lots are stored as bytea(32) at the database boundary (migration 295) and read as hex through the view bylaw_resolution_lot_stamps"
- Diff: src/lib/parcels/report-compute.ts "const stamp = row.lot as { lot_gate?: string | null; table_version?: string | null; evaluator_version?: string | null }"
- Lens claim: the stamp is taken from the core batch row instead of the stamps view the clause names, and whether that json carries the view's hex values cannot be seen in this diff
- Lens fix or rationale: read the stamp through bylaw_resolution_lot_stamps as stored-page did, or show the batch row's lot json is that view.
- Opened: file opened: src/lib/parcels/report-compute.ts no line number was given; the quoted code is there (line 97)

### F-096 · bylaw (bylaw-p4) · diff part route-1 · DEFER severity=LOW
- Clause: cited but not pasted "SRCH.METER-2 (task-360, RR-0278), LOAD.1 (task-266, RR-0271), SRCH.A6 (task-351, RR-0310), SRCH.FOOTER (task-332)"
- Diff: src/app/api/parcels/lookup/route.ts "SRCH.METER-2 (task-360, RR-0278): an unsure lot's page is HELD until the semi answer"
- Lens claim: the held page, the semi=answered lift, the reset label and the footer tree rest on rulings that are not in the pasted context, so compliance with them cannot be confirmed here
- Lens fix or rationale: paste RR-0278, RR-0310, RR-0271 and the SRCH.FOOTER text with the next round.
- Opened: file opened: src/app/api/parcels/lookup/route.ts no line number was given; the quoted code is there (line 143)

### F-099 · bylaw (bylaw-p4) · diff part route-2 · DEFER severity=MED
- Clause: m.495 "One Layer 3 catalogue row per field: each row's building_type becomes a list, and a class's Phase 2 rows are read through the building-types table"
- Diff: src/lib/report-projection/project.ts "stored.find((r) => r.building_type === bt && r.field_id === field)"
- Lens claim: exact string equality on building_type, so once the ruled list form lands every option reads not_evaluated on the customer page
- Lens fix or rationale: match the option type against the list form before the customer switch (MAXBLD_WEB_LIVE) is turned on.
- Opened: file opened: src/lib/report-projection/project.ts no line number was given; the quoted code is there (line 194)

### F-100 · bylaw (bylaw-p4) · diff part route-2 · DEFER severity=MED
- Clause: lc.26 "Provenance precedence: user input > pipeline estimate."
- Diff: src/lib/report-projection/project.ts "if (b.source.kind === 'user_input') continue; // D-46: never a value"
- Lens claim: the customer producer inherits the admin preview's D-46 no-user-input rule, so a member-entered lot size is neither shown nor given precedence over a stored estimate
- Lens fix or rationale: for W, project the user entry first and fall back to the stored estimate.
- Opened: file opened: src/lib/report-projection/project.ts no line number was given; the quoted code is there (line 213)

### F-101 · bylaw (bylaw-p4) · diff part route-2 · DEFER severity=MED
- Clause: lc.61 "Scenario cards may show before the shadow passes; the headline may not (2026-10-20)."
- Diff: src/lib/report-projection/project.ts "if (stamp?.lot_gate) return { ...base, verdict: 'gated', gate: stamp.lot_gate };"
- Lens claim: the only serving gates are the lot gate and the three hashes, nothing in the diff represents a shadow-pass state before a customer headline is served
- Lens fix or rationale: name the shadow state in freshnessOf or in pageForVerdict so a pre-shadow headline is a miss.
- Opened: file opened: src/lib/report-projection/project.ts no line number was given; the quoted code is there (line 174)

### F-102 · bylaw (bylaw-p4) · diff part route-2 · DEFER severity=MED
- Clause: lc.53 "Verified by named lock; no partial green."
- Diff: src/lib/report-projection/format.ts "left untouched; a parity test pins the two"
- Lens claim: the diff adds the formatter, the projection and the freshness rule and cites a parity test and a SQL ledger that appear nowhere in the diff, so the claim rests on a comment only
- Lens fix or rationale: land the parity/lock test in this diff or cite the existing test path that already exercises each new module.
- Opened: file opened: src/lib/report-projection/format.ts no line number was given; the quoted code is there (line 10)

### F-104 · eng (eng-p1) · diff part load1-1 · DEFER severity=MED
- Clause: §5.2 "*.infra.test.ts | API routes, DB queries, external calls | New API route / DB mutation"
- Diff: src/tests/customer-report-compute.logic.test.ts:6 "No database: the pool is a scripted fake."
- Lens claim: the new module issues three SQL statements (report-compute.ts:92-95) yet is proven only by a *.logic.test.ts with a faked pool, which §5.5 reserves for pure functions
- Lens fix or rationale: add an *.infra.test.ts exercising the three reads against the real query layer, or state in the plan why the scripted pool proves the query shapes.
- Opened: file:line opened: src/tests/customer-report-compute.logic.test.ts:6 the quoted code is there

### F-105 · eng (eng-p1) · diff part load1-1 · DEFER severity=MED
- Clause: §10.3 "API routes must be thin, validate input, call a lib function, return the result. Business logic belongs in src/lib/, not in route handlers"
- Diff: src/app/api/parcels/lookup/route.ts:146 "const held = lotForm?.unsure === true && semi !== 'answered';"
- Lens claim: the hold rule plus the stored-then-computed source selection (route.ts:147-154) is billing-bearing policy written inline in the handler
- Lens fix or rationale: move the hold and the two-source fallback into src/lib/parcels (e.g. next to pageForVerdict) and have the route call one function.
- Opened: file:line opened: src/app/api/parcels/lookup/route.ts:146 the quoted code is there

### F-106 · eng (eng-p1) · diff part load1-1 · DEFER severity=MED
- Clause: no pasted clause or ruling names SRCH.METER-2 or LOAD.1
- Diff: src/app/api/parcels/lookup/route.ts:143 "SRCH.METER-2 (task-360, RR-0278): an unsure lot's page is HELD until the semi answer"
- Lens claim: the new `semi` query param, the withheld page and the re-ordered meter condition are authorised only by task-360, RR-0278 and task-266, none of them pasted, so no pasted clause covers the added behaviour
- Lens fix or rationale: paste RR-0278 and the Spec 100 §3.2 dated note with this change, or drop the behaviour.
- Opened: file:line opened: src/app/api/parcels/lookup/route.ts:143 the quoted code is there

### F-107 · eng (eng-p1) · diff part load1-1 · DEFER severity=LOW
- Clause: §5.1 "Never write untyped inline mocks (e.g., `const permit = {id: 1}`). You MUST always import typed factories from `src/tests/factories.ts`"
- Diff: src/tests/customer-report-compute.logic.test.ts:70 "const parcelRow = (row: Json): Json => ({"
- Lens claim: the new test fabricates parcels rows and the C9 lot object inline and imports nothing from src/tests/factories.ts
- Lens fix or rationale: add the parcels/lot shapes to factories.ts (or reuse an existing typed factory) and build the fixtures from it.
- Opened: file:line opened: src/tests/customer-report-compute.logic.test.ts:70 the quoted code is not there; it is at line 79

### F-108 · eng (eng-p1) · diff part load1-1 · DEFER severity=LOW
- Clause: §4.2 "String concatenation for dynamic queries ... is forbidden unless rigorously validated against a static whitelist"
- Diff: src/lib/parcels/report-compute.ts:89 "const plan = buildSourceSql(descriptor, { ...config, [POPULATION_SETTING]: [String(lot.id)] }, {});"
- Lens claim: the lot id reaches the batch SQL text (test asserts "unnest((ARRAY[${LOT_ID}]::int[]))") with no guard before interpolation; validation is only the ::int[] cast and the post-hoc check at report-compute.ts:96
- Lens fix or rationale: add `if (!Number.isSafeInteger(lot.id)) return null;` before buildSourceSql.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:89 the quoted code is there

### F-109 · eng (eng-p1) · diff part load1-1 · DEFER severity=LOW
- Clause: §11 "Before declaring Green Light, generate a 5-10 item self-skeptical checklist from the spec section that governs the change ... Output PASS/FAIL per item"
- Diff: src/tests/customer-report-compute.logic.test.ts:5 "Red first (Spec 08 08_agents.md:490, RR-0225)"
- Lens claim: the pasted material carries an enumerated C1 to C9 list, not a PASS/FAIL walk against the governing spec, and the governing clauses (§3.2, §11a.7, M-384) are not pasted so the walk cannot be verified
- Lens fix or rationale: attach the PASS/FAIL walk per clause before merge.
- Opened: file:line opened: src/tests/customer-report-compute.logic.test.ts:5 the quoted code is not there (not found in the file at 3a36e8b26)

### F-111 · eng (eng-p1) · diff part load1-2 · DEFER severity=MED
- Clause: §5.1 "Never write untyped inline mocks (e.g., `const permit = {id: 1}`). You MUST always import typed factories from `src/tests/factories.ts`."
- Diff: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts:143 "abutters: (line.abutments || []).map((a: Json, i: number) => ({ parcel_id: lot.parcel_id, neighbour_id: 900000 + i, shared_len_m: 10, est: a.est,"
- Lens claim: untyped object literals stand in for row shapes in a shared harness
- Lens fix or rationale: declare named row interfaces (or a factory) in the harness and type the literals, or record why the golden-fixture builder is exempt
- Opened: file:line opened: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts:143 the quoted code is not there; it is at line 150

### F-112 · eng (eng-p1) · diff part load1-2 · DEFER severity=LOW
- Clause: no pasted clause or ruling names a shared `goldenBatch` export; the only stated justification is a comment
- Diff: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts:122 "LOAD.1 (task-266): moved here unchanged from runtime-loader.logic.test.ts so the customer compute test builds the same batch rows."
- Lens claim: a comment naming task-266 is not a pasted clause, so the added export has no governing clause in context
- Lens fix or rationale: paste the LOAD.1 card text or restate the change as behaviour-neutral extraction with no new export surface
- Opened: file:line opened: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts:122 the quoted code is there

### F-113 · eng (eng-p1) · diff part load1-2 · DEFER severity=LOW
- Clause: §11 "Before declaring Green Light, generate a 5-10 item self-skeptical checklist ... Output PASS/FAIL per item in the response BEFORE running tests."
- Diff: NONE
- Lens claim: no per-item PASS/FAIL checklist accompanies this diff in the pasted material
- Lens fix or rationale: cannot see; supply the checklist output with the diff
- Opened: no code line cited (NONE)

### F-114 · eng (eng-p1) · diff part load1-2 · DEFER severity=LOW
- Clause: §4.4 "All API routes must return a consistent envelope: `{ data, error, meta }`." and §2.2 "Every newly created API route ... MUST have an overarching `try-catch`"
- Diff: NONE
- Lens claim: no route is touched, so the clause is inert here; listed only to record that the diff's new export is a test-harness function, not a handler
- Lens fix or rationale: no action
- Opened: no code line cited (NONE)

### F-117 · eng (eng-p1) · diff part mobile-1 · DEFER severity=MED
- Clause: §11 "375px viewport test in test plan"
- Diff: NONE
- Lens claim: the new reports-left line, pick hint, help row and semi card/dot layout have no 375px viewport test in a test plan
- Lens fix or rationale: add a 375px case for the search column and the semi question column
- Opened: no code line cited (NONE)

### F-118 · eng (eng-p1) · diff part mobile-1 · DEFER severity=MED
- Clause: §1.3 "error toasts
- Diff: must trigger a haptic: ... and the error variant for failures. Silent state changes that affect financial or account data are not acceptable."
- Lens claim: mobile/app/(app)/parcel-tool/semi-question.tsx:70 "if (mountedRef.current) setSubmitError(e);"
- Lens fix or rationale: the failed answered lookup, the call that decides whether the report is counted, changes state silently with no haptic — fire the error haptic in the catch alongside setSubmitError
- Opened: no file:line in the field as returned: must trigger a haptic: ... and the error variant for failures. Silent 

### F-119 · eng (eng-p1) · diff part mobile-1 · DEFER severity=MED
- Clause: §1.1 "All interactive elements (buttons, links, toggles, icons) MUST have a minimum tappable area of 44px x 44px."
- Diff: mobile/src/constants/lotMap.ts:64 "helpLink: S.report,"
- Lens claim: `S.report`/`S.reportText` are not pasted, so the new help link's tappable area, drawn as a text-sized link, cannot be seen to reach 44px
- Lens fix or rationale: give helpLink an explicit `min-h-[44px] min-w-[44px]` or paste the class it borrows
- Opened: file:line opened: mobile/src/constants/lotMap.ts:64 the quoted code is there

### F-120 · eng (eng-p1) · diff part mobile-1 · DEFER severity=LOW
- Clause: §1.1 "Card and row layouts MUST stack vertically on mobile and flow horizontally on desktop. Use `flex flex-col md:flex-row` (not `flex` alone)."
- Diff: mobile/src/constants/lotMap.ts:62 "helpRow: 'mt-3 flex-row flex-wrap items-center justify-center gap-1'," (also semiCardRow:53, semiTop:46)
- Lens claim: the base class is horizontal with no `md:` counterpart
- Lens fix or rationale: record in the plan why these rows stay horizontal at 375px (wrap and centred already) or add the `md:` variant
- Opened: file:line opened: mobile/src/constants/lotMap.ts:62 the quoted code is there

### F-121 · eng (eng-p1) · diff part mobile-1 · DEFER severity=LOW
- Clause: card clauses referenced but absent
- Diff: mobile/src/components/surfaces/SearchBinding.tsx:93 "SRCH.A6 (task-320; RR-0307; small-pages-v8 search.html:267)"
- Lens claim: none of SRCH.A6, SRCH.C12, SRCH.SEMI, RR-0278/0307/0310 or tasks 319-362 are in the pasted context, so whether the served values, the help topic/query, the busy look and the pick hint match them cannot be judged
- Lens fix or rationale: paste those card clauses and rulings for the next pass
- Opened: file:line opened: mobile/src/components/surfaces/SearchBinding.tsx:93 the quoted code is there

### F-123 · eng (eng-p1) · diff part mobile-2 · DEFER severity=MED
- Clause: pasted instruction, What to walk 4 "A change that adds behaviour no pasted clause or ruling names is a finding"
- Diff: useParcelLookup.ts "SRCH.A6 (task-320; RR-0307): the caller's plan and this month's report count, read from GET /api/parcels/entitlement"
- Lens claim: every new behaviour here rests on rulings cited only in comments and not pasted (RR-0307 entitlement line, RR-0278 semi=answered, RR-0310 resetsOnDisplay, task-362 in-app browser sheet, SUITE.FIX-2 hook move, the 60s SEMI_CONTINUE_WAIT_MS "operator item"), so compliance with them is cannot see
- Lens fix or rationale: paste RR-0278, RR-0307, RR-0310 and the task-361/362 wording into the context before lock.
- Opened: file opened: mobile/src/hooks/useParcelLookup.ts no line number was given; the quoted code is there (line 117)

### F-124 · eng (eng-p1) · diff part mobile-2 · DEFER severity=LOW
- Clause: Spec 00 §2.3 "Do NOT use the non-null assertion operator (`!`) unless the value's existence is mathematically guaranteed by a prior validation step. If using `!`, you must document why in an inline comment."
- Diff: useParcelLookup.ts "queryFn: () => fetchParcelLookup(parcelLookupParams(parcelId!, semi))"
- Lens claim: the assertion is rewritten into a new call shape with no inline comment naming the `enabled: !!parcelId` guard that makes it safe
- Lens fix or rationale: add one clause-long comment at the `parcelId!` site stating the guard.
- Opened: file opened: mobile/src/hooks/useParcelLookup.ts no line number was given; the quoted code is there (line 96)

### F-127 · eng (eng-p1) · diff part mobile-tests-1 · DEFER severity=MED
- Clause: walk step 4 (no pasted clause names the behaviour)
- Diff: "A change that adds behaviour no pasted clause or ruling names is a finding (nothing added that the card or ruling did not name)."
- Lens claim: mobile/__tests__/lotMapScreens.golden.test.ts:139 "expect(LOT_MAP_SLICE.content['select.hint']).toBe('Pick a lot on the map or in the list.');"
- Lens fix or rationale: the new hint copy, the open_help in-app browser behaviour, the semi-question fetch/cache/busy flow and the held-report loading state are sourced only from strings quoted inside the diff (choose-lot.html:278, search.html:235, task-319/360/361/362 ACs), none of which is pasted — paste those design lines and ACs so the copy and behaviour are checkable.
- Opened: no file:line in the field as returned: "A change that adds behaviour no pasted clause or ruling names is a fi

### F-128 · eng (eng-p1) · diff part mobile-tests-1 · DEFER severity=LOW
- Clause: Spec 00 §5.2
- Diff: "| `*.ui.test.tsx` | React component rendering, interactions | Any new/changed component |"
- Lens claim: mobile/__tests__/lotMapPage.behaviour.test.tsx and mobile/__tests__/semiQuestionScreens.golden.test.ts
- Lens fix or rationale: the new component render/interaction assertions sit in behaviour/golden files outside the §5.2 pattern table — add the equivalent *.ui.test.tsx coverage or record the mobile-app naming exemption against §5.2 so the layer claim is auditable.
- Opened: no file:line in the field as returned: "| `*.ui.test.tsx` | React component rendering, interactions | Any new

### F-129 · eng (eng-p1) · diff part mobile-tests-1 · DEFER severity=LOW
- Clause: Spec 00 §5.1
- Diff: "Never write untyped inline mocks (e.g., `const permit = {id: 1}`). You MUST always import typed factories"
- Lens claim: mobile/__tests__/reportScreen.mount.behaviour.test.tsx:105 "const unsureHit = (page: Json | null) => ({ ...hit(page), lotForm: { detected: 'semi_half', basis: 'o4_two_parcel_abut', unsure: true } });"
- Lens fix or rationale: an untyped literal for the new lotForm shape, so a schema change cannot fail the test at compile time — type the fixture, or build it through the shared schema factory.
- Opened: no file:line in the field as returned: "Never write untyped inline mocks (e.g., `const permit = {id: 1}`). Yo

### F-135 · eng (eng-p1) · diff part route-1 · DEFER severity=MED
- Clause: no pasted clause names this behaviour
- Diff: src/app/api/parcels/lookup/types.ts:44 "// SRCH.SEMI stage 2 (task-319, MF-93; RR-0278): the semi question page sets this on its Continue fetch"
- Lens claim: a client-supplied flag now lifts a metering hold, and neither RR-0278 nor task-319 is in the pasted context
- Lens fix or rationale: paste the ruling or drop the param.
- Opened: file:line opened: src/app/api/parcels/lookup/types.ts:44 the quoted code is there

### F-136 · eng (eng-p1) · diff part route-1 · DEFER severity=MED
- Clause: Spec 00 §5.2 "Two parallel implementations stay in sync (§7 dual-path; seed-JSON ↔ TS defaults; generated doc ↔ generator)"
- Diff: src/components/report/ReportPage.tsx:236 "The mobile binding keeps its own footer"
- Lens claim: web now renders the shared footer tree while mobile keeps a hand-rolled footer, with no parity test in the diff
- Lens fix or rationale: bind both to footerNode or add a parity battery entry.
- Opened: file:line opened: src/components/report/ReportPage.tsx:236 the quoted code is there

### F-137 · eng (eng-p1) · diff part route-1 · DEFER severity=LOW
- Clause: Spec 00 §10.2 "If a `src/lib/` module is imported by both API routes and frontend components, any modification requires `npx vitest related` to verify no API regression."
- Diff: src/lib/parcels/lot-size-entry.ts:121 "export const formatDateDmyFixed = (d: Date): string => {"
- Lens claim: a shared src/lib module gains a new export with no cross-boundary run recorded
- Lens fix or rationale: run and record npx vitest related for lot-size-entry.ts.
- Opened: file:line opened: src/lib/parcels/lot-size-entry.ts:121 the quoted code is there

### F-140 · eng (eng-p1) · diff part route-2 · DEFER severity=MED
- Clause: Spec 00 §5.2 parity battery: "Two parallel implementations stay in sync (§7 dual-path; seed-JSON ↔ TS defaults; generated doc ↔ generator)"
- Diff: src/lib/report-projection/seed-shas.ts:13 "the scope.ts / storey-extract.js twin pattern): src/tests/admin-report-preview-live.logic.test.ts asserts both give the same hex."
- Lens claim: two new twins (canonicalJson/sha256 vs scripts/lib/compute/maxbld/catalogue.js, formatter vs mobile/src/lib/parcelCostFormat.ts) are pinned only by a comment naming an existing test, and no parity test is added in the diff; per the walk rule a clause satisfied only by a comment is unmet
- Lens fix or rationale: add the two parity assertions in this change.
- Opened: file:line opened: src/lib/report-projection/seed-shas.ts:13 the quoted code is not there; it is at line 6

### F-141 · eng (eng-p1) · diff part route-2 · DEFER severity=MED
- Clause: no pasted clause names a landing footer: "NONE"
- Diff: src/lib/surfaces/maxbld-landing.ts:147 "const report: StaticReport = { sample: view, footer: pickFooterText(SEARCH_CONTENT), ...}"
- Lens claim: a new footer plus a new import (footerNode, SEARCH_CONTENT) rides inside an MB-44 customer-producer diff with no pasted clause or ruling authorising it
- Lens fix or rationale: cite the operator ruling for the landing footer or split it out of this change.
- Opened: file:line opened: src/lib/surfaces/maxbld-landing.ts:147 the quoted code is not there (not found in the file at 3a36e8b26)

### F-142 · eng (eng-p1) · diff part route-2 · DEFER severity=LOW
- Clause: Spec 00 §11 pre-review self-checklist: "Before declaring Green Light, generate a 5-10 item self-skeptical checklist from the spec section that governs the change ... Output PASS/FAIL per item in the response BEFORE running tests"
- Diff: NONE
- Lens claim: the material under review carries no per-item PASS/FAIL checklist for the governing sections (the diff comments assert outcomes, not a walked checklist)
- Lens fix or rationale: include the checklist output with the change or state where it lives.
- Opened: no code line cited (NONE)

### F-143 · eng (eng-p1) · diff part route-2 · DEFER severity=LOW
- Clause: Spec 00 §8.2 target gotchas: "The project `tsconfig.json` targets **ES2017**"
- Diff: src/lib/report-projection/format.ts:62 "if (rule === 'confidence') return typeof v === 'string' && Object.hasOwn(CONFIDENCE_WORDS, v) ? (CONFIDENCE_WORDS[v] as string) : null;"
- Lens claim: `Object.hasOwn` is ES2022 and I cannot see the tsconfig `lib`, so this may not typecheck under the stated target
- Lens fix or rationale: use `Object.prototype.hasOwnProperty.call` or state the lib setting.
- Opened: file:line opened: src/lib/report-projection/format.ts:62 the quoted code is there

### F-146 · eng (eng-p1) · diff part scripts-1 · DEFER severity=MED
- Clause: Spec 00 §5.3 "Code may not be written until the test demonstrably fails."
- Diff: scripts/analysis/backlog-lane.mjs:137 "const lensLine = (task, ctx) => {"
- Lens claim: the type-plus-Files regex that decides which lenses run is new unpinned logic with no test in the pasted diff
- Lens fix or rationale: fix: add a logic test pinning plan/out lens sets for a build task on an entitlement file, a record-only task, and a task whose description has no Files line.
- Opened: file:line opened: scripts/analysis/backlog-lane.mjs:137 the quoted code is there

### F-147 · eng (eng-p1) · diff part scripts-1 · DEFER severity=LOW
- Clause: Spec 00 §10.2 "If a `src/lib/` module is imported by both API routes and frontend components, any modification requires `npx vitest related` to verify no API regression."
- Diff: scripts/analysis/src-sql-ledger.mjs:108 "+  'src/lib/parcels/report-compute.ts', // LOAD.1 (task-266 ..."
- Lens claim: the diff records a src/lib modification with no cross-boundary validation evidence; cannot see whether the module is imported by both sides
- Lens fix or rationale: fix: state the import direction and the `npx vitest related` result for report-compute.ts, or record that it is server-only.
- Opened: file:line opened: scripts/analysis/src-sql-ledger.mjs:108 the quoted code is there

### F-148 · eng (eng-p1) · diff part scripts-1 · DEFER severity=LOW
- Clause: Spec 00 §8.2 "The project `tsconfig.json` targets **ES2017**."
- Diff: scripts/analysis/proof-slice.mjs:135 "const counts = Object.fromEntries(STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length]));"
- Lens claim: Object.fromEntries is ES2019; cannot see whether the analysis .mjs scripts fall under the ES2017 target or run untyped under node
- Lens fix or rationale: fix: replace with a reduce/loop, or record that scripts/ is outside the tsconfig target.
- Opened: file:line opened: scripts/analysis/proof-slice.mjs:135 the quoted code is not there; it is at line 102

### F-150 · eng (eng-p1) · diff part surface-1 · DEFER severity=MED
- Clause: §10.2 / §11 Frontend Boundary Check "No modifications to `scripts/`, `migrations/`, or `scripts/lib/` (§10.2)"
- Diff: scripts/surfaces/_schema/seed-report-v2.mjs:600 "+    'not_evaluated:not_in_engine_population': 'Not yet evaluated', // MB-94 (c)"
- Lens claim: 7 of the 9 changed paths sit under scripts/, and no pasted clause or ruling records the surfaces-tooling carve-out
- Lens fix or rationale: paste the carve-out or move the edit outside scripts/
- Opened: file:line opened: scripts/surfaces/_schema/seed-report-v2.mjs:600 the quoted code is there

### F-151 · eng (eng-p1) · diff part surface-1 · DEFER severity=MED
- Clause: §11 Cross-Layer Contracts Check "Any numeric threshold that crosses spec ↔ SQL ↔ Zod ↔ migration is sourced from `docs/specs/_contracts.json`, not duplicated as a literal across files"
- Diff: scripts/surfaces/_schema/census/contracts.json:22891 "It reads 9 tables"
- Lens claim: the same field's LOAD.1 note then names 7 further tables (bylaw_resolution_results, bylaw_resolution_option_results, bylaw_resolution_units, bylaw_resolution_texts, parcel_abutments, parcel_maxbld_population, logic_variables), so the hand-edited literal count was stale the moment it was written
- Lens fix or rationale: drop the count or generate it
- Opened: file:line opened: scripts/surfaces/_schema/census/contracts.json:22891 the quoted code is not there; it is at line 22003

### F-152 · eng (eng-p1) · diff part surface-1 · DEFER severity=MED
- Clause: bindings.json dated note 2026-11-19 "The check C-9m still requires exactly one min-h- token on the list; nothing under 44 is listed."
- Diff: scripts/surfaces/_schema/bindings.json:73 "\"Button\": [\"min-h-[44px]\", \"min-h-[48px]\"], \"Input\": [\"min-h-[44px]\"]"
- Lens claim: Button now carries two min-h- tokens while the same note asserts C-9m tolerates exactly one, and the check itself is not pasted
- Lens fix or rationale: state C-9m's per-usage reading or update the check in this change
- Opened: file:line opened: scripts/surfaces/_schema/bindings.json:73 the quoted code is not there (not found in the file at 3a36e8b26)

### F-153 · eng (eng-p1) · diff part surface-1 · DEFER severity=MED
- Clause: no pasted clause or operator ruling names the new reports-left line
- Diff: scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.content.json:22 "\"search.reports_left\": \"{left} of {allowance} reports left until {reset}\""
- Lens claim: the authority the diff itself cites (SRCH.A6, task-320, RR-0307, RR-0310) is not in the pasted context, so compliance with it cannot be judged
- Lens fix or rationale: paste RR-0307 and RR-0310 so the string, the {reset} placeholder and resetsOnDisplay can be checked against them
- Opened: file:line opened: scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.content.json:22 the quoted code is not there (not found in the file at 3a36e8b26)

### F-154 · eng (eng-p1) · diff part surface-1 · DEFER severity=MED
- Clause: no pasted clause or operator ruling names the new help and footer copy
- Diff: scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_disambiguation_map.content.json:25 "\"help.lot.prompt\": \"Not sure which lot?\""
- Lens claim: MF-53, quoted only inside the bindings.json header, is not pasted, and nothing pasted names help.address.link, select.hint or footer.copyright/help/privacy/terms
- Lens fix or rationale: paste the copy card for the two surfaces
- Opened: file:line opened: scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_disambiguation_map.content.json:25 the quoted code is not there (not found in the file at 3a36e8b26)

### F-155 · eng (eng-p1) · diff part surface-1 · DEFER severity=MED
- Clause: bindings.json dated note 2026-11-19 "orchestrator decision under the pre-approved criteria, MORNING-DECISIONS.md:1227 (not an operator ruling)"
- Diff: scripts/surfaces/_schema/bindings.json:2 "touch_targets.mobile.Button gains min-h-[48px] beside min-h-[44px]"
- Lens claim: the added token's own note says its authority is not an operator ruling and RR-0309 is not pasted, so the change is carried by an admission of non-ruling status
- Lens fix or rationale: paste RR-0309 or the pre-approved criteria line
- Opened: file:line opened: scripts/surfaces/_schema/bindings.json:2 the quoted code is there

### F-156 · eng (eng-p1) · diff part surface-1 · DEFER severity=LOW
- Clause: §1.1 "Use `min-h-[44px] min-w-[44px]` or equivalent padding."
- Diff: scripts/surfaces/_schema/bindings.json:73 "\"Button\": [\"min-h-[44px]\", \"min-h-[48px]\"], \"Input\": [\"min-h-[44px]\"]"
- Lens claim: only height tokens are listed under a key that judges className tokens, and the change adds link strings (footer.help, footer.privacy, footer.terms, help.address.link) that §1.1 treats as interactive
- Lens fix or rationale: add a width or padding token for link-shaped controls, or record the padding equivalence
- Opened: file:line opened: scripts/surfaces/_schema/bindings.json:73 the quoted code is not there (not found in the file at 3a36e8b26)

### F-161 · eng (eng-p1) · diff part surface-2 · DEFER severity=MED
- Clause: §1.1 "Dense metadata rows MUST use `flex-wrap`."
- Diff: src/components/surfaces/web/SearchBinding.tsx:66 "footerLinks: 'gap-2',"
- Lens claim: three footer links sit in one non-wrapping row with no mobile stacking
- Lens fix or rationale: add flex-wrap (or flex-col md:flex-row) and cover 375px in the test plan.
- Opened: file:line opened: src/components/surfaces/web/SearchBinding.tsx:66 the quoted code is there

### F-162 · eng (eng-p1) · diff part surface-2 · DEFER severity=MED
- Clause: §2.3 "Before accessing nested object properties, explicitly check for `null` or `undefined`."
- Diff: src/components/surfaces/web/SearchBinding.tsx:270 "reportsLeftShown(s.entitlement) ? { [ENTITLEMENT]: { reportsLeft: s.entitlement.reportsLeft, reportsLimit: s.entitlement.reportsLimit, resetsOnDisplay: s.entitlement.resetsOnDisplay } }"
- Lens claim: the dereference is safe only if reportsLeftShown is a type predicate, and that declaration is not in this diff (cannot see)
- Lens fix or rationale: declare it as `(e?: EntitlementLine | null): e is EntitlementLine` and keep the guarded spread.
- Opened: file:line opened: src/components/surfaces/web/SearchBinding.tsx:270 the quoted code is there

### F-163 · eng (eng-p1) · diff part surface-2 · DEFER severity=LOW
- Clause: §5.5 "Two parallel implementations stay in sync (§7 dual-path ...)"
- Diff: src/components/surfaces/web/SearchBinding.tsx:248 "without the legal line, which is in the footer (last child, MF-91)" and the removed "−    legal(),"
- Lens claim: the web and mobile search trees now diverge (legal line moved, footer added on web only) and the ruling that approves it is quoted only inside the diff, not in the pasted context (cannot see)
- Lens fix or rationale: paste the MF-91 operator verbatim into the review context, or record the divergence in the mobile descriptor.
- Opened: file:line opened: src/components/surfaces/web/SearchBinding.tsx:248 the quoted code is not there (not found in the file at 3a36e8b26)

### F-164 · eng (eng-p1) · diff part surface-2 · DEFER severity=LOW
- Clause: §5.5 "generated doc ↔ its generator (the drift guard, regenerate to a buffer, diff the committed file)"
- Diff: scripts/surfaces/parcel_product/F06/surfaces/web_landing.sample.json "scripts/surfaces/_schema/report-presentation.json": "e151b5ccd11cd137"
- Lens claim: the sample records a new hash for a schema file that is not in this diff part (cannot see whether it changed)
- Lens fix or rationale: confirm the schema file changed in the same change set, else regenerate the sample.
- Opened: file opened: scripts/surfaces/parcel_product/F06/surfaces/web_landing.sample.json no line number was given; the quoted code is there (line 1996)

### F-166 · eng (eng-p2) · diff part load1-1 · DEFER severity=MED
- Clause: §13.5 "Any new user-facing feature MUST be wrapped in a feature flag check at the route level."
- Diff: src/lib/parcels/report-compute.ts "if (!MAXBLD_WEB_LIVE) return null;"
- Lens claim: the only gate on the newly served computed page lives inside the lib entry, the route performs no flag check, so the flag is not "at the route level"
- Lens fix or rationale: add the flag check in route.ts (or attach the operator ruling that names MAXBLD_WEB_LIVE as the route-level flag for this surface)
- Opened: file opened: src/lib/parcels/report-compute.ts no line number was given; the quoted code is there (line 75)

### F-167 · eng (eng-p2) · diff part load1-1 · DEFER severity=LOW
- Clause: §14 "Every source/test file's `SPEC LINK` points at the spec **AND the section (§N)**; new couplings update **Cross-Spec Dependencies both directions**"
- Diff: src/lib/parcels/report-compute.ts:4 "// core); docs/specs/00_engineering_standards.md (parameterised SQL; Standard 10.2: this file imports scripts/ code, it modifies none)."
- Lens claim: that link carries no §N form, and the new src/lib to scripts/lib/compute coupling records no both-directions Cross-Spec Dependencies update in the pasted diff
- Lens fix or rationale: write §10.2 and add the dependency entries to both specs
- Opened: file:line opened: src/lib/parcels/report-compute.ts:4 the quoted code is there

### F-168 · eng (eng-p2) · diff part load1-2 · DEFER severity=MED
- Clause: prompt walk item 4, "A change that adds behaviour no pasted clause or ruling names is a finding (nothing added that the card or ruling did not name)"
- Diff: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts:123 "const expected = readJsonl(`${G25}/expected.jsonl`);"
- Lens claim: this fixture read is not in the removed copy (the removed body begins "const MZ = req(path.join(ROOT, 'scripts/lib/bylaw-materialize.js')) as Json;"), so the new function differs from the code it replaced and no pasted clause or card authorizes the difference; the task-266 card is not pasted, so the claim "so the customer compute test builds the same batch rows" cannot be checked
- Lens fix or rationale: either confirm the module-scope `expected` this inlines was the identical `readJsonl(`${G25}/expected.jsonl`)` or drop the "unchanged" wording.
- Opened: file:line opened: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts:123 the quoted code is there

### F-169 · eng (eng-p2) · diff part load1-2 · DEFER severity=MED
- Clause: §14 registry row, "A behavior-changing ruling updates ALL cited specs + runbooks in the SAME commit"
- Diff: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts:121 "LOAD.1 (task-266): moved here unchanged from runtime-loader.logic.test.ts"
- Lens claim: the diff cites a task id and asserts a pure move, but neither the task-266 card nor the spec section it belongs to is pasted, so the clause's own check (cited specs updated with the ruling) cannot be performed
- Lens fix or rationale: paste the task-266 card and the spec/runbook section it cites.
- Opened: file:line opened: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts:121 the quoted code is there

### F-170 · eng (eng-p2) · diff part load1-2 · DEFER severity=LOW
- Clause: §14 registry row, "Every source/test file's `SPEC LINK` points at the spec **AND the section (§N)**"
- Diff: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts:121 "LOAD.1 (task-266)"
- Lens claim: the relocated helper is labelled with a task id, not a spec section; the harness file header is not pasted so I cannot see whether a file-level SPEC LINK already covers it
- Lens fix or rationale: add the spec §N to the moved block's citation or confirm the header link.
- Opened: file:line opened: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts:121 the quoted code is there

### F-171 · eng (eng-p2) · diff part mobile-1 · DEFER severity=MED
- Clause: SRCH.SEMI stage 2 / RR-0278 (cited in code, not pasted) "SRCH.SEMI stage 2 (task-319, MF-93; RR-0278): Continue first fetches the same lookup with the one flag `semi: 'answered'`"
- Diff: semi-question.tsx:9
- Lens claim: the cited card and ruling text is not in the pasted context, so the answered lookup, the cache write and the busy look cannot be judged clause by clause; this is "cannot see", not a pass
- Lens fix or rationale: paste the SRCH.SEMI, SRCH.A6 and SRCH.C12 cards plus RR-0278, RR-0307, RR-0310
- Opened: file:line opened: mobile/app/(app)/parcel-tool/semi-question.tsx:9 exists; no code quote was given

### F-172 · eng (eng-p2) · diff part mobile-1 · DEFER severity=MED
- Clause: §14 registry "A behavior-changing ruling updates ALL cited specs + runbooks in the SAME commit"
- Diff: "# DIFF PART mobile-1: git diff 9f04d9074..3a36e8b26, files: mobile/app/(app)/parcel-tool/[parcelId].tsx, ... mobile/src/constants/parcelSearch.ts"
- Lens claim: the range cites RR-0278, RR-0307, RR-0310 and operator rulings and changes behaviour (report held while the semi is owed, counted answered lookup, reports-left line) yet carries no docs/specs or runbook file
- Lens fix or rationale: add the spec and runbook updates for those rulings to this same commit
- Opened: file opened: mobile/src/constants/parcelSearch.ts no line number was given; the quoted code is not there (not found in the file at 3a36e8b26)

### F-173 · eng (eng-p2) · diff part mobile-1 · DEFER severity=LOW
- Clause: 13.5 "Any new user-facing feature MUST be wrapped in a feature flag check at the route level."
- Diff: SearchBinding.tsx "+      ...reportsLeft(s),"
- Lens claim: the new reports-left meter and the new Help & Support links ship unconditionally, gated only by served data, no flag at the route
- Lens fix or rationale: confirm the rule does not reach mobile or record an operator waiver
- Opened: file opened: SearchBinding.tsx does not exist at 3a36e8b26 (cannot open); no line number was given

### F-174 · eng (eng-p2) · diff part mobile-1 · DEFER severity=LOW
- Clause: 13.3 "All catch blocks use `logError(tag, err, context)`."
- Diff: semi-question.tsx "+    } catch (e) {\n+      if (mountedRef.current) setSubmitError(e);"
- Lens claim: a failed answered lookup is shown to the user but never logged, so a failed count leaves no trace anywhere
- Lens fix or rationale: emit the structured log for the submit failure
- Opened: file opened: mobile/app/(app)/parcel-tool/semi-question.tsx no line number was given; the quoted code is not there (not found in the file at 3a36e8b26)

### F-175 · eng (eng-p2) · diff part mobile-2 · DEFER severity=MED
- Clause: §13.5 "Any new user-facing feature MUST be wrapped in a feature flag check at the route level."
- Diff: mobile/src/hooks/useParcelLookup.ts (+new) "export function useParcelEntitlement() {"
- Lens claim: the new reports-left line (schema, hook, situation key, persist filter) ships with no feature-flag gate in this diff part, the screen/route file is not pasted so cannot see
- Lens fix or rationale: add the flag check where the line is drawn, or cite the line in this commit that carries it.
- Opened: no file:line in the field as returned: mobile/src/hooks/useParcelLookup.ts (+new) "export function useParcelE

### F-176 · eng (eng-p2) · diff part mobile-2 · DEFER severity=MED
- Clause: §14 "A behavior-changing ruling updates ALL cited specs + runbooks in the SAME commit"
- Diff: mobile/src/lib/maxbldHelp.ts (+new) "the page opens in the in-app browser sheet through expo-web-browser, the same call as useSubscribeCheckout.ts:61, instead of leaving the app through Linking."
- Lens claim: a behaviour change against the cited docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.3/§11b.7, and no spec edit appears in this mobile-only diff part, cannot see
- Lens fix or rationale: land the §11b.3/§11b.7 wording change in the same commit or show the spec already reads in-app browser sheet.
- Opened: file:line opened: useSubscribeCheckout.ts does not exist at 3a36e8b26 (cannot open)

### F-177 · eng (eng-p2) · diff part mobile-2 · DEFER severity=LOW
- Clause: §13.3 "All catch blocks use logError(tag, err, context). NEVER bare `console.error`. ESLint enforces."
- Diff: mobile/src/lib/maxbldHelp.ts (+new) "console.warn(`[maxbldHelp] could not open Help & Support (topic ${topic})`);"
- Lens claim: the new catch logs through bare console, not logError(tag, err, context)
- Lens fix or rationale: route the catch through the app logger or record in the plan why §13.3 does not reach mobile/src/lib.
- Opened: no file:line in the field as returned: mobile/src/lib/maxbldHelp.ts (+new) "console.warn(`[maxbldHelp] could 

### F-178 · eng (eng-p2) · diff part mobile-2 · DEFER severity=NIT
- Clause: §14 "Every source/test file's `SPEC LINK` points at the spec AND the section (§N)"
- Diff: mobile/src/lib/parcelSearchCore.ts (+new) "// ── The reports-left line (SRCH.A6, task-320; operator RR-0307, MORNING-DECISIONS.md:1182)"
- Lens claim: the new export block names a task id and a rulings file, no spec path and §N, and the file header is not in this hunk, cannot see
- Lens fix or rationale: add the spec path and §N to the new block or confirm the header carries it.
- Opened: file:line opened: MORNING-DECISIONS.md does not exist at 3a36e8b26 (cannot open)

### F-180 · eng (eng-p2) · diff part mobile-tests-1 · DEFER severity=MED
- Clause: rule 3 "A clause satisfied only by a comment, a TODO or a test name is UNMET"
- Diff: mobile/__tests__/semiQuestionScreens.golden.test.ts "// SRCH.SEMI stage 2: Continue and Try again are 48 px (the mock)"
- Lens claim: the button-size gate is widened from exactly min-h-[44px] to 44 or 48 px for every Button on the page on the strength of a code comment, and no quoted mock line in this diff establishes 48 px
- Lens fix or rationale: quote the mock rule that sets 48 px, or keep the single min-h-[44px] token.
- Opened: file opened: mobile/__tests__/semiQuestionScreens.golden.test.ts no line number was given; the quoted code is there (line 60)

### F-181 · eng (eng-p2) · diff part mobile-tests-1 · DEFER severity=MED
- Clause: search.html:235 "in-app browser sheet (B10): Help, Terms, Privacy open the web page with Done"
- Diff: mobile/__tests__/parcelSearchScreen.behaviour.test.tsx "fireEvent.press(screen.getByTestId('parcel-search-report'));"
- Lens claim: only the Help link is pinned on either page, the Terms and Privacy links the quoted line names get no assertion and their call sites are not in this part (cannot see)
- Lens fix or rationale: add the two press assertions, or record Terms and Privacy as explicitly out of scope for task-362.
- Opened: file opened: mobile/__tests__/parcelSearchScreen.behaviour.test.tsx no line number was given; the quoted code is there (line 148)

### F-182 · eng (eng-p2) · diff part mobile-tests-1 · DEFER severity=LOW
- Clause: §14 "A behavior-changing ruling updates ALL cited specs + runbooks in the SAME commit"
- Diff: mobile/__tests__/parcelScreens.golden.test.ts "expect(SEARCH_SLICE.content['search.input.placeholder']).toBe('Enter a Toronto address');"
- Lens claim: this part carries no spec or runbook text change for the placeholder ruling, and the other parts of 9f04d9074..3a36e8b26 are not visible
- Lens fix or rationale: confirm the cited spec sections and runbooks that quote "Enter lot address" are updated inside the same commit range.
- Opened: file opened: mobile/__tests__/parcelScreens.golden.test.ts no line number was given; the quoted code is there (line 246)

### F-184 · eng (eng-p2) · diff part route-1 · DEFER severity=MED
- Clause: §12.12 "Pure functions with arithmetic invariants ... MUST have at least one `fast-check` property test asserting the invariant"
- Diff: src/lib/parcels/lot-size-entry.ts:123 "export const formatDateDmyFixed = (d: Date): string => {"
- Lens claim: a new pure instant-to-Toronto-date formatter with a midnight/month boundary ships with no property test, and the clause's invariant example is itself a formatter ordering property
- Lens fix or rationale: add a src/tests/property fast-check test (day-boundary/month rollover, monotone order)
- Opened: file:line opened: src/lib/parcels/lot-size-entry.ts:123 the quoted code is there

### F-185 · eng (eng-p2) · diff part route-1 · DEFER severity=MED
- Clause: §13.5 "Any new user-facing feature MUST be wrapped in a feature flag check at the route level."
- Diff: src/lib/parcels/report-compute.ts:96 "if (!MAXBLD_WEB_LIVE) return null;"
- Lens claim: the LOAD.1 compute that newly puts numbers on the customer page is flagged inside the lib, not at the route, and the SRCH.METER-2 page-hold has no flag at all
- Lens fix or rationale: also gate the call site in src/app/api/parcels/lookup/route.ts behind the flag
- Opened: file:line opened: src/lib/parcels/report-compute.ts:96 the quoted code is not there; it is at line 75

### F-186 · eng (eng-p2) · diff part route-1 · DEFER severity=MED
- Clause: §14 registry "Every source/test file's SPEC LINK points at the spec AND the section (§N) ... new couplings update Cross-Spec Dependencies both directions"
- Diff: src/lib/parcels/report-compute.ts:71 "const core = await import('../../../scripts/lib/compute/compute-maxbld-scenarios.js');"
- Lens claim: a new src-to-scripts coupling (compute core, config reader, descriptor json) is added and no Cross-Spec Dependencies update is visible in the diff
- Lens fix or rationale: add the reciprocal dependency entries both directions
- Opened: file:line opened: src/lib/parcels/report-compute.ts:71 the quoted code is not there; it is at line 78

### F-187 · eng (eng-p2) · diff part route-1 · DEFER severity=LOW
- Clause: §14 registry "every SELECT feeding a typed client includes every field the client type declares"
- Diff: src/lib/admin/report-preview-live/stored-page.ts:50 removed "-for (const c of PARCEL_COLUMNS) if (!PARCEL_SELECTED.includes(c)) throw new Error(`MB-93: page field source parcels:${c} is not in the static parcels read`);"
- Lens claim: the load-time guard enforcing SELECT fidelity is deleted here and its re-homing to src/lib/report-projection/read-stored.ts cannot be seen
- Lens fix or rationale: confirm the guard survives in read-stored.ts or restore it
- Opened: file:line opened: src/lib/admin/report-preview-live/stored-page.ts:50 the quoted code is not there (not found in the file at 3a36e8b26)

### F-190 · eng (eng-p2) · diff part route-2 · DEFER severity=MED
- Clause: 13.5 "Any new user-facing feature MUST be wrapped in a feature flag check at the route level."
- Diff: src/lib/parcels/report-page.ts:58 "if (!MAXBLD_WEB_LIVE) return null;"
- Lens claim: the new customer report capability is gated by a module constant inside the producer, not by a route-level flag check, and MAXBLD_WEB_LIVE is a pinned constant rather than a PostHog flag
- Lens fix or rationale: confirm and cite the route that holds the flag check (the route file is not in this diff, so cannot see).
- Opened: file:line opened: src/lib/parcels/report-page.ts:58 the quoted code is there

### F-191 · eng (eng-p2) · diff part route-2 · DEFER severity=MED
- Clause: 14 "A behavior-changing ruling updates ALL cited specs + runbooks in the SAME commit"
- Diff: src/lib/parcels/report-page.ts:8 "the customer producer is W below" (replacing the removed "The customer producer is NONE today")
- Lens claim: the customer contract changes from always-null to a live stored read, and no file under docs/specs/ is in this diff; cannot see whether 135 FE-05/FE-34, 126 11a.7, 128 rule 16 and 69a M-384 got their dated notes
- Lens fix or rationale: add the dated note to each cited spec in this commit.
- Opened: file:line opened: src/lib/parcels/report-page.ts:8 the quoted code is not there (not found in the file at 3a36e8b26)

### F-192 · eng (eng-p2) · diff part route-2 · DEFER severity=LOW
- Clause: 14 "points at the spec AND the section (§N)"
- Diff: src/lib/report-projection/read-stored.ts:1 "docs/specs/00_engineering_standards.md (parameterised SQL)"
- Lens claim: SPEC LINK cites a spec with no section number (also seed-shas.ts:2 "docs/specs/01-pipeline/78_optimal_lot_configuration.md (compute_maxbld_scenarios step identity)")
- Lens fix or rationale: add the section number to each cited doc.
- Opened: file:line opened: src/lib/report-projection/read-stored.ts:1 the quoted code is there

### F-193 · eng (eng-p2) · diff part scripts-1 · DEFER severity=MED
- Clause: §14 "Every source/test file's `SPEC LINK` points at the spec **AND the section (§N)**"
- Diff: proof-slice.mjs:2-3 "// SPEC LINK: docs/specs/02-web-admin/127_surface_conversion_procedure.md (the S-gate table whose rows this runner calls), / //            docs/specs/02-web-admin/126_maxbld_surface_standard.md,"
- Lens claim: the new file's SPEC LINK names two specs with no §N (only 08_agents.md:490, a line locator, not a section)
- Lens fix or rationale: add the §N of the S-gate table in 127 and of the 126 clause the runner leans on, or drop the claim that 126 is cited.
- Opened: file:line opened: scripts/analysis/proof-slice.mjs:2 the quoted code is not there (not found in the file at 3a36e8b26)

### F-194 · eng (eng-p2) · diff part scripts-1 · DEFER severity=MED
- Clause: §13.3 "All catch blocks use `logError(tag, err, context)`. NEVER bare `console.error`."
- Diff: proof-slice.mjs:146 "} catch (e) { console.error(`proof-slices.json unreadable or malformed: ${e.message}`); return 2; }" and :148 "} catch (e) { console.error(`proof-slice: cannot create --out ${outDir} (${e?.code ?? e?.message ?? 'error'})`); return 2; }"
- Lens claim: two catch blocks in the new script log through bare console.error with no tag, and the script is lane-run so the pipeline-logger rule (same §13.3) applies to it
- Lens fix or rationale: route both through logError/pipeline.log with a tag.
- Opened: file:line opened: scripts/analysis/proof-slice.mjs:146 the quoted code is not there (not found in the file at 3a36e8b26)

### F-195 · eng (eng-p2) · diff part scripts-1 · DEFER severity=MED
- Clause: §14 "A **behavior-changing ruling updates ALL cited specs + runbooks in the SAME commit**"
- Diff: src-sql-ledger.mjs:78-80 "SQL-bearing files: 41 static, 29 interpolated, 2 not_postgres); LOAD.1 (task-266, / * 2026-11-19) adds the 30th: src/lib/parcels/report-compute.ts"
- Lens claim: the ruling that adds the 30th interpolated file leaves the cited measurement one line above reading "29 interpolated" and "72 SQL-bearing files", the exact drift class the clause names
- Lens fix or rationale: state the post-change totals (30 interpolated, 73 total) next to the dated measurement.
- Opened: file:line opened: scripts/analysis/src-sql-ledger.mjs:78 the quoted code is not there (not found in the file at 3a36e8b26)

### F-196 · eng (eng-p2) · diff part scripts-1 · DEFER severity=LOW
- Clause: §14 "new couplings update **Cross-Spec Dependencies both directions**"
- Diff: deepseek-review.js:374 "const tIdx = args.indexOf('--template');" plus backlog-lane.mjs:145 naming ".claude/review-templates/lens-*.md"
- Lens claim: the review tool gains a hard dependency on the lens template files' placeholder names, and the diff file list ("files: scripts/analysis/backlog-lane.mjs, ..., scripts/deepseek-review.js") contains no spec doc, so I cannot see the Cross-Spec Dependencies entry updated
- Lens fix or rationale: add the entry both directions or cite the existing one in the commit.
- Opened: file:line opened: scripts/deepseek-review.js:374 the quoted code is not there (not found in the file at 3a36e8b26)

### F-197 · eng (eng-p2) · diff part scripts-1 · DEFER severity=LOW
- Clause: pasted-clause test, walk step 4 "A change that adds behaviour no pasted clause or ruling names is a finding"
- Diff: backlog-lane.mjs:135 "// task-358 (REVIEW.LENSES): the review line names the Spec 08 lens set (08_agents.md:334 \"NEVER run one generic pass\"; section 7 rules 4, 7)" and deepseek-review.js:178 "// task-358 (REVIEW.LENSES)
- Lens claim: lens mode"
- Lens fix or rationale: the new lens-line and lens-mode behaviour is authorised only by an in-code comment; 08_agents.md:334 and section 7 rules 4,7 are not pasted, so I cannot see the ruling it rests on — paste the card or the ruling so the lens set can be checked clause by clause.
- Opened: file:line opened: scripts/analysis/backlog-lane.mjs:135 the quoted code is not there (not found in the file at 3a36e8b26)

### F-203 · eng (eng-p2) · diff part surface-1 · DEFER severity=LOW
- Clause: §14 "Every source/test file's SPEC LINK points at the spec AND the section (§N); new couplings update Cross-Spec Dependencies both directions"
- Diff: scripts/surfaces/_schema/report-presentation.json:26 "+    \"not_evaluated:not_in_engine_population\": \"Not yet evaluated\","
- Lens claim: the twin line in seed-report-v2.mjs carries "Spec 126 11a.3 dated note 2026-11-12 (R-2 literal)" and this schema file carries no section citation, and the literal cannot be checked because Spec 126 11a.3 is not pasted
- Lens fix or rationale: add the same section citation beside the key, or confirm the schema file is generated and must not carry one.
- Opened: file:line opened: scripts/surfaces/_schema/report-presentation.json:26 the quoted code is not there (not found in the file at 3a36e8b26)

### F-206 · eng (eng-p2) · diff part surface-2 · DEFER severity=MED
- Clause: §14 registry row "A behavior-changing ruling updates ALL cited specs + runbooks in the SAME commit"
- Diff: scripts/surfaces/parcel_product/F06/surfaces/web_landing.sample.json `"scripts/surfaces/_schema/report-presentation.json": "e151b5ccd11cd137"` (was "6b780bd76e164820")
- Lens claim: the sample's recorded input hash advances for a schema file absent from the commit's seven files, so the sample cannot be shown regenerated against the committed input
- Lens fix or rationale: fix: include `scripts/surfaces/_schema/report-presentation.json` in the commit or regenerate the sample from the committed schema
- Opened: file opened: scripts/surfaces/_schema/report-presentation.json no line number was given; the quoted code is not there (not found in the file at 3a36e8b26)

### F-207 · eng (eng-p2) · diff part surface-2 · DEFER severity=LOW
- Clause: §14 registry row "A behavior-changing ruling updates ALL cited specs + runbooks in the SAME commit"
- Diff: scripts/surfaces/parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json `-      "unsure"` / `+      "semi"`
- Lens claim: a value is added to a closed contract list with no dated note, while every other addition in that file carries its provenance ("Dated 2026-11-11 (MF-53)", "Dated 2026-11-19 (LOAD.1, task-266, M-246)"), so the reader cannot tell which ruling introduced `semi`
- Lens fix or rationale: fix: add the dated note and the ruling for `semi`, or drop the value from this commit
- Opened: no file:line in the field as returned: scripts/surfaces/parcel_product/F02/contracts/contract_parcels_lookup.

### F-212 · fe (fe) · diff part load1-1 · DEFER severity=LOW
- Clause: fe.24 "the renderer throws on an unknown field or status" and fe.06 "closed status list; oracle = catalogue flags."
- Diff: src/lib/parcels/report-compute.ts:56 "status: String(r.status),"
- Lens claim: a core row with an absent or unrecognised status becomes the string "undefined" and is handed to the projection instead of failing the closed list
- Lens fix or rationale: reject a status outside the closed list at the mapping, the way the entry already rejects a changed batch bind at report-compute.ts:88.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:56 the quoted code is there

### F-213 · fe (fe) · diff part load1-2 · DEFER severity=LOW
- Clause: fe.25 "The 25 golden lots render end to end the McBylaws answer-key numbers on every target. Runs as a db-type test in a named CI step."
- Diff: src/tests/steps/compute_maxbld_scenarios/runtime-loader.logic.test.ts "+import { goldenBatch } from './golden25-harness';"
- Lens claim: the one new consumer of the shared harness is a logic test, so fe.25's owed db-type answer-key lock stays unmet by this diff
- Lens fix or rationale: keep fe.25 OWED and consume goldenBatch from src/tests/surfaces/answer-key-e2e.db.test.ts when that lock lands.
- Opened: file opened: src/tests/steps/compute_maxbld_scenarios/runtime-loader.logic.test.ts no line number was given; the quoted code is there (line 17)

### F-214 · fe (fe) · diff part load1-2 · DEFER severity=NIT
- Clause: no pasted clause or ruling names a shared goldenBatch export
- Diff: golden25-harness.ts "+/** LOAD.1 (task-266): moved here unchanged from runtime-loader.logic.test.ts so the customer compute test builds the same batch rows."
- Lens claim: the comment asserts "unchanged" but the added body introduces "const expected = readJsonl(`${G25}/expected.jsonl`);" which the deleted body did not declare locally, so equivalence cannot be confirmed from the pasted diff
- Lens fix or rationale: either make the body byte-identical to the deleted one or reword the comment to state where expected now comes from.
- Opened: file opened: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts no line number was given; the quoted code is there (line 122)

### F-217 · fe (fe) · diff part mobile-1 · DEFER severity=MED
- Clause: fe.32 "the member must exist in that descriptor; any other value fails"
- Diff: mobile/src/components/surfaces/SearchBinding.tsx "+const ENTITLEMENT = 'contract_parcels_entitlement';"
- Lens claim: a new contract binding home is introduced and no descriptor named `contract_parcels_entitlement` with the members `reportsLeft`, `reportsLimit`, `resetsOnDisplay` is in the pasted context or the changed file list, so the members cannot be seen to exist, write the descriptor in the plan material or cite it.
- Opened: file opened: mobile/src/components/surfaces/SearchBinding.tsx no line number was given; the quoted code is there (line 52)

### F-218 · fe (fe) · diff part mobile-1 · DEFER severity=MED
- Clause: fe.02 "a screen is a descriptor; the only code is the shared archetype components"
- Diff: mobile/app/(app)/parcel-tool/index.tsx "+      if (accessToken) void refetchEntitlement({ cancelRefetch: false });"
- Lens claim: a new network read on every screen focus, and the answered-lookup submit flow in semi-question.tsx "result = await boundedWait(fetchParcelLookup({ parcelId: id, semi: 'answered' }), SEMI_CONTINUE_WAIT_MS);", are behaviour carried by no pasted clause (only task ids SRCH.A6 and SRCH.SEMI) and placed in screen mount code
- Lens fix or rationale: declare the read and the submit in the surface descriptor or cite the clause that permits screen code for them.
- Opened: file opened: mobile/app/(app)/parcel-tool/index.tsx no line number was given; the quoted code is there (line 59)

### F-219 · fe (fe) · diff part mobile-1 · DEFER severity=LOW
- Clause: fe.31 "standard library components configured by schema"
- Diff: mobile/src/components/surfaces/SemiQuestionBinding.tsx "+    className: s.busy ? `${L.semiSelect} opacity-[0.85]` : L.semiSelect,"
- Lens claim: the approved busy look is a class literal composed in code while the sibling rule in the same file reads "draws the approved mock with the semi-prefixed keys of that table", so the busy look has no key in the table
- Lens fix or rationale: add a `semiSelectBusy` (or equivalent) key to mobile/src/constants/lotMap.ts and read it.
- Opened: file opened: mobile/src/components/surfaces/SemiQuestionBinding.tsx no line number was given; the quoted code is there (line 96)

### F-220 · fe (fe) · diff part mobile-2 · DEFER severity=MED
- Clause: fe.32 "contract is a binding kind: a displayed value may bind to a field of a declared CONTRACT descriptor's response projection; the member must exist in that descriptor; any other value fails."
- Diff: mobile/src/lib/schemas.ts "+// SRCH.A6 (task-320; RR-0307): GET /api/parcels/entitlement (contract_parcels_entitlement, src/app/api/parcels/entitlement/types.ts)."
- Lens claim: the three displayed members are tied to a contract descriptor only by this comment and that descriptor is not pasted, so the member-exists requirement cannot be confirmed
- Lens fix or rationale: paste the contract_parcels_entitlement response projection entry naming reportsLeft, reportsLimit and resetsOnDisplay.
- Opened: file opened: mobile/src/lib/schemas.ts no line number was given; the quoted code is there (line 443)

### F-221 · fe (fe) · diff part mobile-2 · DEFER severity=LOW
- Clause: fe.33 "every displayed string, library default strings and form error messages included, comes from content"
- Diff: mobile/src/hooks/useParcelLookup.ts "SRCH.A6 (task-320; RR-0307): the caller's plan and this month's report count, read from GET /api/parcels/entitlement (the line "N of M reports left until <date>")"
- Lens claim: the line's literal copy exists only in this comment and no content key for it is visible in the diff, so comment-only cannot satisfy the clause
- Lens fix or rationale: name the content key that supplies the line text and its date slot.
- Opened: file opened: mobile/src/hooks/useParcelLookup.ts no line number was given; the quoted code is not there (not found in the file at 3a36e8b26)

### F-222 · fe (fe) · diff part mobile-2 · DEFER severity=LOW
- Clause: no pasted clause names the in-app browser sheet
- Diff: mobile/src/lib/maxbldHelp.ts "-import { Linking } from 'react-native';" / "+import * as WebBrowser from 'expo-web-browser';"
- Lens claim: the switch from Linking.openURL to WebBrowser.openBrowserAsync changes what the person sees (the page now opens inside the app) and the authorizing text (task-362, SRCH.LOTMAP-2, small-pages-v8 search.html:235) is not pasted, so the requirement cannot be checked
- Lens fix or rationale: paste the ruling or the small-pages line for the sheet.
- Opened: file opened: mobile/src/lib/maxbldHelp.ts no line number was given; the quoted code is not there (not found in the file at 3a36e8b26)

### F-223 · fe (fe) · diff part mobile-tests-1 · DEFER severity=MED
- Clause: fe.31 "one props golden per reachable state per declared target"
- Diff: mobile/__tests__/semiQuestionScreens.golden.test.ts:142 "so a named case, not a new golden state"
- Lens claim: the new submitting (busy) state of the semi question page is a reachable state, yet it is pinned only by a named case and no props golden state is added
- Lens fix or rationale: add an ask_yes_busy (submitting true) golden state to the page fixtures, or record in the descriptor why busy is not a declared state.
- Opened: file:line opened: mobile/__tests__/semiQuestionScreens.golden.test.ts:142 the quoted code is there

### F-224 · fe (fe) · diff part mobile-tests-1 · DEFER severity=MED
- Clause: fe.03 "golden states; both-directions locks"
- Diff: mobile/__tests__/semiQuestionScreens.golden.test.ts:60 "some((c) => c === 'min-h-[44px]' || c === 'min-h-[48px]')"
- Lens claim: the page-wide Button check now accepts either height, so no single value is locked for any Button; the 48 px basis cited is a mock rule (semi-question.html:130) that is not in the pasted context
- Lens fix or rationale: pin Continue and Try again at 48 px by testID and keep 44 px for every other Button.
- Opened: file:line opened: mobile/__tests__/semiQuestionScreens.golden.test.ts:60 the quoted code is there

### F-225 · fe (fe) · diff part mobile-tests-1 · DEFER severity=MED
- Clause: fe.33 "every displayed string, library default strings and form error messages included, comes from content"
- Diff: mobile/__tests__/semiQuestionPage.behaviour.test.tsx:170 "expect(screen.getByText('Couldn’t reach the lot service. Check your connection and try again.')).toBeTruthy()"
- Lens claim: the new Continue error text is asserted only as a literal, no content key is named, and the component is not in this diff, so the content binding cannot be seen
- Lens fix or rationale: assert the key as the lot map hint test does with select.hint.
- Opened: file:line opened: mobile/__tests__/semiQuestionPage.behaviour.test.tsx:170 the quoted code is there

### F-226 · fe (fe) · diff part mobile-tests-1 · DEFER severity=MED
- Clause: fe.03 "golden states; both-directions locks"
- Diff: mobile/__tests__/maxbldHelp.test.ts:6 "openHelp opens that URL in the in-app browser sheet through expo-web-browser"
- Lens claim: the lock that pinned the previous exit (mobile/__tests__/maxbldHelp.test.ts old line: openHelp opens that URL through Linking) is deleted and replaced on the strength of small-pages-v8 search.html:235 and task-362, neither of which is pasted, so the new OS-boundary behaviour has no visible ruling
- Lens fix or rationale: paste the search.html:235 mock line or the dated note before merging the lock swap.
- Opened: file:line opened: mobile/__tests__/maxbldHelp.test.ts:6 the quoted code is there

### F-227 · fe (fe) · diff part mobile-tests-1 · DEFER severity=LOW
- Clause: fe.19 "User inputs are shared, not private: an entered fact updates the shared database, raises that lot's confidence for every viewer, and keeps provenance (source user, entered_at)"
- Diff: mobile/__tests__/semiQuestionPage.behaviour.test.tsx:83 "expect(mockSetQueryData.mock.calls).toEqual([[['parcel-lookup', 'PCL-S1'], data(form(true))]])"
- Lens claim: the semi answer is an entered fact about the lot, yet the diff shows only a client cache write and the route params semi=answered and lotFormOverride, so the shared write, the confidence raise and the provenance cannot be seen
- Lens fix or rationale: show the server-side write of the answer with its provenance and confidence, or record where it happens.
- Opened: file:line opened: mobile/__tests__/semiQuestionPage.behaviour.test.tsx:83 the quoted code is there

### F-228 · fe (fe) · diff part mobile-tests-1 · DEFER severity=LOW
- Clause: fe.31 "descriptor + content + standard library components configured by schema"
- Diff: mobile/__tests__/parcelScreens.golden.test.ts:243 "Dated note 2026-11-19 (RR-0313, MORNING-DECISIONS.md:1216"
- Lens claim: the search placeholder content value is changed from the ruled 2026-11-11 wording, and the superseding ruling is not in the pasted context, so the new value cannot be checked against a pasted line
- Lens fix or rationale: paste RR-0313 or point the file's SPEC LINK header at it.
- Opened: file:line opened: mobile/__tests__/parcelScreens.golden.test.ts:243 the quoted code is there

### F-231 · fe (fe) · diff part route-1 · DEFER severity=MED
- Clause: fe.07 "P6 Same everywhere: mobile, web, admin and PDF render the same declaration; parity compares each target's real output."
- Diff: src/components/report/ReportPage.tsx "The mobile binding keeps its own footer (mobile/src/components/surfaces/ReportBinding.tsx): its G4 part is unchanged."
- Lens claim: web gains three links plus caller-supplied copyright while mobile keeps its own footer; parity of the new footer parts across targets cannot see
- Lens fix or rationale: prove or add the same footer parts on mobile and pdf, or state which target is exempt
- Opened: file opened: src/components/report/ReportPage.tsx no line number was given; the quoted code is there (line 237)

### F-232 · fe (fe) · diff part route-1 · DEFER severity=MED
- Clause: fe.27 "A column that is not in the migrations, or a path not on the whitelist, fails."
- Diff: src/lib/admin/report-preview-live/stored-page.ts "-for (const c of PARCEL_COLUMNS) if (!PARCEL_SELECTED.includes(c)) throw new Error(`MB-93: page field source parcels:${c} is not in the static parcels read`);"
- Lens claim: the load-time parcels column check is deleted here and the replacement inside readStoredPage cannot see
- Lens fix or rationale: confirm lib/report-projection/read-stored keeps the same failing check, else restore it
- Opened: file opened: src/lib/admin/report-preview-live/stored-page.ts no line number was given; the quoted code is not there (not found in the file at 3a36e8b26)

### F-233 · fe (fe) · diff part route-1 · DEFER severity=MED
- Clause: fe.32 "a displayed value may bind to a field of a declared CONTRACT descriptor's response projection; the member must exist in that descriptor; any other value fails."
- Diff: src/app/api/parcels/entitlement/types.ts "resetsOnDisplay: z.string().nullable(), // the same instant as the Toronto date, "9 Dec 2026" (RR-0310); the page prints it"
- Lens claim: a new displayed contract member is added on the wire and its presence in the declared contract descriptor cannot see
- Lens fix or rationale: add resetsOnDisplay to the entitlement contract descriptor in the same change
- Opened: file opened: src/app/api/parcels/entitlement/types.ts no line number was given; the quoted code is there (line 18)

### F-236 · fe (fe) · diff part route-2 · DEFER severity=MED
- Clause: fe.39 "cost comes from the Spec 88 scenario lines, joined by the producer"
- Diff: src/lib/report-projection/read-stored.ts:35 "FROM parcel_maxbld_scenarios WHERE parcel_id = $1 ORDER BY building_type, field_id"
- Lens claim: the producer that now answers customers reads no Spec 88 line, so no cost value can ever be sent
- Lens fix or rationale: join the Spec 88 lines or record the cost gap against fe.39 before MAXBLD_WEB_LIVE turns on.
- Opened: file:line opened: src/lib/report-projection/read-stored.ts:35 the quoted code is there

### F-237 · fe (fe) · diff part route-2 · DEFER severity=MED
- Clause: fe.33 "every displayed string, library default strings and form error messages included, comes from content"
- Diff: src/lib/report-projection/format.ts:56 "const CONFIDENCE_WORDS: Record<string, string> = { high: 'High confidence', medium: 'Medium confidence'"
- Lens claim: displayed text ('High confidence', 'Yes', 'No', 'sq ft', 'm²') lives in code, not content
- Lens fix or rationale: move those strings into the content tables the renderer already reads.
- Opened: file:line opened: src/lib/report-projection/format.ts:56 the quoted code is there

### F-238 · fe (fe) · diff part route-2 · DEFER severity=MED
- Clause: fe.27 "A column that is not in the migrations, or a path not on the whitelist, fails"
- Diff: src/lib/report-projection/read-stored.ts:27 "CASE WHEN heritage_dataset_version_when_enriched IS NULL THEN NULL ELSE is_heritage_designated END AS is_heritage_designated,"
- Lens claim: the Spec 100 §3.2 whitelist is not pasted, so the heritage and ravine columns now read on the customer path cannot be verified
- Lens fix or rationale: paste the whitelist or cite the line listing these columns.
- Opened: file:line opened: src/lib/report-projection/read-stored.ts:27 the quoted code is there

### F-239 · fe (fe) · diff part route-2 · DEFER severity=LOW
- Clause: fe.24 "the renderer throws on an unknown field or status"
- Diff: src/lib/report-projection/project.ts:174 "let shownAs: 'shown' | 'hidden' | 'not_evaluated' = 'not_evaluated';"
- Lens claim: a stored status outside the closed list falls through to a not-evaluated card instead of being refused
- Lens fix or rationale: throw on any status not in the presentation list.
- Opened: file:line opened: src/lib/report-projection/project.ts:174 the quoted code is not there; it is at line 202

### F-240 · fe (fe) · diff part route-2 · DEFER severity=LOW
- Clause: fe.31 "Every MaxBLD page (a converted non-REPORT surface) is descriptor + content + standard library components configured by schema"
- Diff: src/lib/surfaces/maxbld-landing.ts:147 "const report: StaticReport = { sample: view, footer: pickFooterText(SEARCH_CONTENT), ..."
- Lens claim: a footer is added to the landing with no pasted clause or page-table part naming it and a component module imported into a server lib
- Lens fix or rationale: split it out or cite the card and the declared landing part it serves.
- Opened: file:line opened: src/lib/surfaces/maxbld-landing.ts:147 the quoted code is there

### F-243 · fe (fe) · diff part surface-1 · DEFER severity=MED
- Clause: fe.31 "in the converted manifest (two-direction totality); one props golden per reachable state per declared target"
- Diff: scripts/surfaces/_schema/census/mobile-product.json "{\"name\": \"hit\", \"golden\": \"reports_left\"}"
- Lens claim: a new state and golden name is declared, but no golden file appears in this diff part and none of the eight new content strings has a golden update here, so I cannot see the proof
- Lens fix or rationale: fix: include the goldens, or name the diff part that carries them.
- Opened: file opened: scripts/surfaces/_schema/census/mobile-product.json no line number was given; the quoted code is not there (not found in the file at 3a36e8b26)

### F-244 · fe (fe) · diff part surface-1 · DEFER severity=MED
- Clause: fe.29 "status (the 11a.3 forms plus none)"
- Diff: scripts/surfaces/_schema/seed-report-v2.mjs "'not_evaluated:not_in_engine_population': 'Not yet evaluated', // MB-94 (c), Spec 126 11a.3 dated note 2026-11-12 (R-2 literal)"
- Lens claim: the new closed-status value rests only on a comment citing an unpasted spec note, so I cannot see that not_in_engine_population is on the closed list
- Lens fix or rationale: fix: paste the §11a.3 line that admits the value, or drop the key.
- Opened: file opened: scripts/surfaces/_schema/seed-report-v2.mjs no line number was given; the quoted code is there (line 600)

### F-245 · fe (fe) · diff part surface-1 · DEFER severity=LOW
- Clause: fe.03 "declarations checked against live contracts and the catalogue"
- Diff: scripts/surfaces/_schema/census/contracts.json data_story "It reads 9 tables ... It reads no table today and changes no meter."
- Lens claim: the same field now states nine tables are read and that no table is read; only the switch-off aside keeps them from being flatly contradictory
- Lens fix or rationale: fix: state one read set per switch state and drop the stale "reads no table today" sentence.
- Opened: no file:line in the field as returned: scripts/surfaces/_schema/census/contracts.json data_story "It reads 9 

### F-249 · fe (fe) · diff part surface-2 · DEFER severity=MED
- Clause: fe.31 "one props golden per reachable state per declared target"
- Diff: scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.descriptor.json:360 "\"golden\": \"reports_left\""
- Lens claim: a golden name is added for the new hit state, but no web-target golden appears in the pasted material for the tree that now draws the footer and the reports-left line, so the web target is unproven
- Lens fix or rationale: commit the web props golden for the footer plus reports-left tree.
- Opened: file:line opened: scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.descriptor.json:360 the quoted code is not there (not found in the file at 3a36e8b26)

### F-250 · mobile-100 (mobile-100-p1) · diff part mobile-1 · DEFER severity=MED
- Clause: Spec 100 §3 "### `GET /api/parcels/lookup?q=<address>` | `?parcelId=<id>`"
- Diff: mobile/app/(app)/parcel-tool/index.tsx "const { data: entitlementData, isError: entitlementFailed, refetch: refetchEntitlement } = useParcelEntitlement();"
- Lens claim: the reports-left line is fed by a second read (`contract_parcels_entitlement`, drawn from a non-lookup route) that no pasted clause names; the pasted API section names only the lookup route, so this addition is unauthorised against everything pasted
- Lens fix or rationale: paste the clause (or the §3 continuation) that names the entitlement read, then re-check it.
- Opened: file opened: mobile/app/(app)/parcel-tool/index.tsx no line number was given; the quoted code is there (line 55)

### F-251 · mobile-100 (mobile-100-p1) · diff part mobile-1 · DEFER severity=MED
- Clause: dated note 2026-11-11 "a hit for a `parcel_tool` user writes one `property_view` row keyed on the matched `parcels.parcel_id` (`parcel_ref`), after the response has passed its `.strict()` parse"
- Diff: mobile/app/(app)/parcel-tool/semi-question.tsx "result = await boundedWait(fetchParcelLookup({ parcelId: id, semi: 'answered' }), SEMI_CONTINUE_WAIT_MS);"
- Lens claim: the pasted clause keys the count to the lookup response, not to report production as the diff's own comment asserts ("which lets the server count the lot once its report is produced"), so the premise for the extra call is a meter change no pasted ruling carries
- Lens fix or rationale: cite the ruling that moves the count to production, or align the comment to the pasted rule.
- Opened: file opened: mobile/app/(app)/parcel-tool/semi-question.tsx no line number was given; the quoted code is there (line 64)

### F-252 · mobile-100 (mobile-100-p1) · diff part mobile-1 · DEFER severity=MED
- Clause: dated note 2026-11-11 "a 403 `REPORT_LIMIT_REACHED` with `reportsLimit` and `resetsOn`"
- Diff: mobile/src/components/surfaces/SearchBinding.tsx "vars: { left: entitlement('reportsLeft'), allowance: entitlement('reportsLimit'), reset: entitlement('resetsOnDisplay') }"
- Lens claim: the reset date is read from `resetsOnDisplay`, a field name the pasted clause does not carry, and its only authority here is the unpasted RR-0310, so the printed date cannot be checked
- Lens fix or rationale: paste RR-0310 or the entitlement payload clause.
- Opened: file opened: mobile/src/components/surfaces/SearchBinding.tsx no line number was given; the quoted code is there (line 102)

### F-253 · mobile-100 (mobile-100-p1) · diff part mobile-1 · DEFER severity=MED
- Clause: mobile/app/(app)/parcel-tool/semi-question.tsx "storeLookup(id, result);"
- Diff: NONE
- Lens claim: the answered result is stored under the report's key and the report then calls `useParcelLookup(parcelId, semiParam)`, but neither hook nor its key is in the pasted diff or the file list, so whether the report reads the stored entry or issues a third lookup cannot be seen
- Lens fix or rationale: paste the hook change (mobile/src/hooks/useParcelLookup.ts) so the key match is visible.
- Opened: no code line cited (NONE)

### F-254 · mobile-100 (mobile-100-p1) · diff part mobile-1 · DEFER severity=LOW
- Clause: mobile/src/components/surfaces/LotMapBinding.tsx "case 'unlinked': return [unlinkedNotice(), helpLink('address_match'), ...mapView(s)];"
- Diff: the four error-state help links, the pick hint and the help row rest only on v8 mock references ("C.12` (task-362; choose-lot.html:278)") that are not in the pasted context, so they are additions no pasted clause or ruling names
- Lens claim: paste the SRCH.C11/C12 design text or the ruling.
- Opened: no file:line in the field as returned: the four error-state help links, the pick hint and the help row rest o

### F-257 · mobile-100 (mobile-100-p1) · diff part mobile-2 · DEFER severity=MED
- Clause: §2.2 "Two consumer tiers (the diagnostic Tier-3 groups of Spec 89 are EXCLUDED by design). The consumer sees exactly:" and §3 "### `GET /api/parcels/lookup?q=<address>` | `?parcelId=<id>`"
- Diff: mobile/src/hooks/useParcelLookup.ts:134 "queryKey: ['parcel-entitlement'],"
- Lens claim: the change adds a second consumer endpoint and a reports-left line that no pasted clause names; the authorities it cites (RR-0307, MORNING-DECISIONS.md:1182, src/app/api/parcels/entitlement/types.ts) are not pasted, so conformance cannot be judged
- Lens fix or rationale: paste the ruling and the endpoint contract with the diff, or drop the line.
- Opened: file:line opened: mobile/src/hooks/useParcelLookup.ts:134 the quoted code is there

### F-258 · mobile-100 (mobile-100-p1) · diff part mobile-2 · DEFER severity=LOW
- Clause: §1 "It is **not** coupled to the Lead Feed, Flight Center, or LeadDetail" is the only pasted scope text, and no pasted clause names Help & Support
- Diff: mobile/src/lib/maxbldHelp.ts:21 "export const openHelp = async (topic: string, q: string): Promise<void> => {"
- Lens claim: the Linking to expo-web-browser swap rests on Spec 126 §11b.3 and small-pages-v8 search.html:235, neither of which is pasted; "with Done" is also conceded to be iOS-only in the new comment
- Lens fix or rationale: paste the surface-standard line before merge.
- Opened: file:line opened: mobile/src/lib/maxbldHelp.ts:21 the quoted code is there

### F-260 · mobile-100 (mobile-100-p1) · diff part mobile-tests-1 · DEFER severity=MED
- Clause: §3 frozen "ConsumerParcelLookupResponse" (no lotForm field)
- Diff: mobile/__tests__/reportScreen.mount.behaviour.test.tsx "const unsureHit = (page: Json | null) => ({ ...hit(page), lotForm: { detected: 'semi_half', basis: 'o4_two_parcel_abut', unsure: true } });"
- Lens claim: the held-screen state is driven off a lotForm field absent from the pasted frozen response interface
- Lens fix or rationale: name lotForm in the frozen response contract or read a field the contract actually declares.
- Opened: file opened: mobile/__tests__/reportScreen.mount.behaviour.test.tsx no line number was given; the quoted code is there (line 105)

### F-261 · mobile-100 (mobile-100-p1) · diff part mobile-tests-1 · DEFER severity=LOW
- Clause: RR-0313 (not pasted) "Enter a Toronto address"
- Diff: mobile/__tests__/parcelScreens.golden.test.ts "expect(SEARCH_SLICE.content['search.input.placeholder']).toBe('Enter a Toronto address');"
- Lens claim: the ruling authorizing this wording is not in the pasted context, cannot see whether the text is verbatim
- Lens fix or rationale: paste RR-0313 or cite its spec line so the placeholder change is judgeable.
- Opened: file opened: mobile/__tests__/parcelScreens.golden.test.ts no line number was given; the quoted code is there (line 246)

### F-262 · mobile-100 (mobile-100-p1) · diff part mobile-tests-1 · DEFER severity=LOW
- Clause: task-362 / search.html:235 (Spec 126, not pasted)
- Diff: mobile/__tests__/maxbldHelp.test.ts "expect(open).toHaveBeenCalledWith('https://maxbld.ca/help#topic=address_match&q=1%20Main%20St');"
- Lens claim: the in-app browser sheet behaviour is named only by a spec not pasted, cannot judge it
- Lens fix or rationale: paste Spec 126 §11b.3 (or the ruling naming the sheet) so the openHelp change is in scope.
- Opened: file opened: mobile/__tests__/maxbldHelp.test.ts no line number was given; the quoted code is there (line 31)

### F-263 · mobile-100 (mobile-100-p1) · diff part mobile-tests-1 · DEFER severity=LOW
- Clause: no pasted clause names 48 px or aria-busy
- Diff: mobile/__tests__/semiQuestionScreens.golden.test.ts "!String(n.props.className ?? '').split(/\s+/).some((c) => c === 'min-h-[44px]' || c === 'min-h-[48px]')"
- Lens claim: the golden relaxes the touch-target check to accept 48 px and adds a busy state on no pasted rule
- Lens fix or rationale: cite the mock/spec line that rules 48 px and the busy Continue.
- Opened: file opened: mobile/__tests__/semiQuestionScreens.golden.test.ts no line number was given; the quoted code is there (line 60)

### F-268 · mobile-100 (mobile-100-p2) · diff part mobile-1 · DEFER severity=MED
- Clause: RR-0313 dated note 2026-11-19 "the outside-Toronto notice ... still shows ... and the reports-left slot is unchanged"
- Diff: mobile/src/components/surfaces/SearchBinding.tsx "const reportsLeft = (s: SearchSituation): PropsNode[] => reportsLeftShown(s.entitlement)"
- Lens claim: the reports-left line, its `contract_parcels_entitlement` fields and `GET /api/parcels/entitlement` are named by no pasted clause (RR-0307 is not in the pasted set; §3.2/§6 name `contract_parcels_lookup` and its whitelist only), so compliance cannot be judged
- Lens fix or rationale: Rationale: add RR-0307 and the entitlement contract fields to the pasted context.
- Opened: file opened: mobile/src/components/surfaces/SearchBinding.tsx no line number was given; the quoted code is in the file (not on one line)

### F-269 · mobile-100 (mobile-100-p2) · diff part mobile-1 · DEFER severity=MED
- Clause: MF-35 dated note 2026-11-10 "the 'Report incorrect address match' link is added by MF-46 with its Help & Support page (P35-D18 a)"
- Diff: mobile/src/components/surfaces/LotMapBinding.tsx "onPress: { action: 'open_help', topic, q: derived('query') }," plus `pickHint()` and `helpRow()`
- Lens claim: the only pasted help-link clause binds the search page; SRCH.C12, B.7, choose-lot.html:279 and task-362 are not pasted, so the new lot-map links, the pick hint and the help row rest on no visible clause
- Lens fix or rationale: Rationale: paste SRCH.C12/B.7 and the choose-lot mock rows.
- Opened: file opened: mobile/src/components/surfaces/LotMapBinding.tsx no line number was given; the quoted code is there (line 104)

### F-270 · mobile-100 (mobile-100-p2) · diff part mobile-1 · DEFER severity=MED
- Clause: SEMI-B dated note 2026-11-13 "(2) ... not sure writes nothing and shows the semi view"
- Diff: mobile/app/(app)/parcel-tool/semi-question.tsx "push: (route: string) => void continueToReport(route),"
- Lens claim: Continue runs the same answered fetch and replace for all three answers and the diff shows no branch that keeps "not sure" writing nothing, so cannot see where this ruling is honoured
- Lens fix or rationale: Rationale: paste `buildSemiQuestionSituation`/`semiQuestionRoute` or the ruling that the route carries the answer.
- Opened: file opened: mobile/app/(app)/parcel-tool/semi-question.tsx no line number was given; the quoted code is there (line 88)

### F-271 · mobile-100 (mobile-100-p2) · diff part mobile-1 · DEFER severity=LOW
- Clause: mobile/src/components/surfaces/SurfaceRenderer.tsx "The closed icon table (plan v3 §2.2)"
- Diff: "export const ICONS = { ..., X, ChevronLeft, Info };"
- Lens claim: the closed table gains two icons and plan v3 §2.2 is not pasted, so the authority for opening it cannot be checked
- Lens fix or rationale: Rationale: paste plan v3 §2.2 or the ruling that opened the table.
- Opened: no file:line in the field as returned: "export const ICONS = { ..., X, ChevronLeft, Info };"

### F-272 · mobile-100 (mobile-100-p2) · diff part mobile-1 · DEFER severity=LOW
- Clause: SEMI-B dated note 2026-11-13 "(2) ... on a page modelled on the 'choose your lot' page"
- Diff: mobile/src/components/surfaces/SemiQuestionBinding.tsx "node('View', { key: 'card-dot', className: checked ? L.semiDotChecked : L.semiDot })" and "icon: 'ChevronLeft'"
- Lens claim: the semi page drops the choose-lot card idiom (the Check icon of L.card) and the ActivityIndicator for an approved mock that is not pasted
- Lens fix or rationale: Rationale: paste the small-pages-v8 semi mock so the modelled-on clause can be tested.
- Opened: file opened: mobile/src/components/surfaces/SemiQuestionBinding.tsx no line number was given; the quoted code is there (line 84)

### F-274 · mobile-100 (mobile-100-p2) · diff part mobile-2 · DEFER severity=MED
- Clause: Spec 100 §3.2 dated note 2026-11-13, semi item (2): "The answer is a route param applied in the app (`lot_form_user_override`; O-12: the pipeline never reads it)"
- Diff: mobile/src/lib/lotForm.ts "which does not apply it yet: nothing outside this file reads the param or calls `lotFormEffective`"
- Lens claim: the pasted clause requires the override be applied in the app, and the diff records that nothing applies it, so the clause is unmet
- Lens fix or rationale: task-209 is named for the effect, the comment is corrected rather than the behaviour, defer only with that card linked.
- Opened: file opened: mobile/src/lib/lotForm.ts no line number was given; the quoted code is there (line 8)

### F-275 · mobile-100 (mobile-100-p2) · diff part mobile-2 · DEFER severity=MED
- Clause: Spec 100 §4: "`useParcelLookup(parcelId)`
- Diff: the detail depends **only** on `['parcel-lookup', parcelId]` (query-key hygiene, Spec 99 §4)"
- Lens claim: mobile/src/hooks/useParcelLookup.ts "it changes the request, not the key (the semi page stores its answered result under the same key, useSetParcelLookup)"
- Lens fix or rationale: with `staleTime: 60_000` a plain lookup cached moments earlier satisfies the answered query without calling `fetchParcelLookup`, so the `semi=answered` request is never sent and the server neither counts nor releases the lot — force the answered fetch at Continue (invalidate or refetch on that key) while leaving the single pasted key intact.
- Opened: no file:line in the field as returned: the detail depends **only** on `['parcel-lookup', parcelId]` (query-ke

### F-276 · mobile-100 (mobile-100-p2) · diff part mobile-2 · DEFER severity=MED
- Clause: Spec 100 §3.2: "**Any future reader of `parcels` owes the same explicit allow-list**"
- Diff: mobile/src/hooks/useParcelLookup.ts "read from GET /api/parcels/entitlement (the line \"N of M reports left until <date>\")"
- Lens claim: no pasted clause names an entitlement endpoint, and the Operating Boundaries Target Files list only "`src/app/api/parcels/lookup/{route.ts,types.ts}`", so the whitelist obligation of this new reader cannot be checked from the pasted text
- Lens fix or rationale: the server route, its projection and its lock are not in this diff part, cannot see them, produce them before lock.
- Opened: file opened: mobile/src/hooks/useParcelLookup.ts no line number was given; the quoted code is not there (not found in the file at 3a36e8b26)

### F-277 · mobile-100 (mobile-100-p2) · diff part mobile-2 · DEFER severity=LOW
- Clause: Spec 100 §4 dated note 2026-11-19 (RR-0313): "the reports-left slot is unchanged"
- Diff: mobile/src/lib/parcelSearchMatch.ts "SRCH.A6 (task-320): the served count fields the reports-left line binds"
- Lens claim: the situation now carries three served fields but the drawing slot is not in this diff part, so "unchanged" cannot be verified
- Lens fix or rationale: the screen that renders `reportsLeftShown` is outside the pasted files, cannot see it, confirm the slot's markup is untouched.
- Opened: file opened: mobile/src/lib/parcelSearchMatch.ts no line number was given; the quoted code is there (line 320)

### F-278 · mobile-100 (mobile-100-p2) · diff part mobile-2 · DEFER severity=LOW
- Clause: Spec 100 §4 dated note 2026-11-10 (MF-35): "the \"Report incorrect address match\" link is added by MF-46 with its Help & Support page (P35-D18 a)"
- Diff: mobile/src/lib/maxbldHelp.ts "opens in the in-app browser sheet through expo-web-browser ... instead of leaving the app through Linking"
- Lens claim: the pasted clause names only that the link opens the Help page, no pasted clause authorises the in-app browser sheet (task-362, small-pages-v8 are not pasted)
- Lens fix or rationale: content and URL are unchanged, the presentation change is the only delta, so it is low risk but unsourced in the pasted text.
- Opened: file opened: mobile/src/lib/maxbldHelp.ts no line number was given; the quoted code is not there (not found in the file at 3a36e8b26)

### F-279 · mobile-100 (mobile-100-p2) · diff part mobile-2 · DEFER severity=NIT
- Clause: Spec 100 §3.2 dated note 2026-11-13, semi item (2): "When `unsure` is true the app shows one question before the report"
- Diff: mobile/src/lib/semiQuestion.ts "how long Continue waits for the answered lookup before it ends in the built error state (a timeframe; operator item in the lane report)"
- Lens claim: the 60 000 ms window is attributed to an operator item that is not pasted, so its provenance cannot be checked
- Lens fix or rationale: one constant, one screen, safe to defer behind that missing record.
- Opened: file opened: mobile/src/lib/semiQuestion.ts no line number was given; the quoted code is there (line 15)

### F-281 · mobile-100 (mobile-100-p2) · diff part mobile-tests-1 · DEFER severity=MED
- Clause: Spec 100 §3.2 dated note 2026-11-13 (SEMI-B) "The answer is a route param applied in the app (`lot_form_user_override`; O-12: the pipeline never reads it)"
- Diff: mobile/__tests__/useParcelLookup.test.ts:108 "expect(mockFetch).toHaveBeenLastCalledWith('/api/parcels/lookup?parcelId=PIN-777&semi=answered');"
- Lens claim: the diff adds a `semi` request parameter and a Continue-time fetch plus cache write (semiQuestionPage.behaviour.test.tsx "Continue fetches the lookup with semi=answered, stores it in the report cache entry"), none of which any pasted clause names
- Lens fix or rationale: paste the SRCH.SEMI stage 2 / SRCH.METER-2 ruling that authorises the request parameter, the second lookup and the cache write.
- Opened: file:line opened: mobile/__tests__/useParcelLookup.test.ts:108 the quoted code is there

### F-282 · mobile-100 (mobile-100-p2) · diff part mobile-tests-1 · DEFER severity=MED
- Clause: Spec 100 §4 dated note 2026-11-10 (MF-35) "the \"Report incorrect address match\" link is added by MF-46 with its Help & Support page (P35-D18 a)"
- Diff: mobile/__tests__/maxbldHelp.test.ts:36 "expect(link).not.toHaveBeenCalled();"
- Lens claim: the diff replaces the Linking exit with an in-app browser sheet, but the "in-app browser sheet (B10) ... search.html:235" clause it rests on is not pasted, so the change cannot be certified against the pasted material
- Lens fix or rationale: paste the clause that rules the in-app sheet and the "never Linking" wording (small-pages-v8 search.html:235 or 126 §11b.3).
- Opened: file:line opened: mobile/__tests__/maxbldHelp.test.ts:36 the quoted code is not there; it is at line 32

### F-283 · mobile-100 (mobile-100-p2) · diff part mobile-tests-1 · DEFER severity=MED
- Clause: Spec 100 §3.2 dated note 2026-11-11 (MF-53) "the \"choose your lot\" map page ... `~/Buildo-scratch/mcfrontend/small-pages-v4/choose-lot-states.html` (message states)"
- Diff: mobile/__tests__/lotMapScreens.golden.test.ts:139 "expect(LOT_MAP_SLICE.content['select.hint']).toBe('Pick a lot on the map or in the list.');"
- Lens claim: a new content key `select.hint` and its copy are pinned, and no pasted clause or ruling names that key or that sentence (choose-lot.html:278 is cited in the case name but not pasted)
- Lens fix or rationale: paste the hint row from the approved choose-lot page or the content-key addition.
- Opened: file:line opened: mobile/__tests__/lotMapScreens.golden.test.ts:139 the quoted code is there

### F-284 · mobile-100 (mobile-100-p2) · diff part mobile-tests-1 · DEFER severity=LOW
- Clause: Spec 100 §4 dated note 2026-11-19 (RR-0313) "Content only: one value in `scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.content.json`, read by the app and the web (FE-07); the generated slice and the goldens regenerated by their scripts"
- Diff: mobile/__tests__/parcelScreens.golden.test.ts:249 "expect(SEARCH_SLICE.content['search.input.placeholder']).toBe('Enter a Toronto address');"
- Lens claim: this part changes the golden only, the content JSON and the regenerated slice are not in it and cannot be seen
- Lens fix or rationale: confirm they changed in another part of the change, otherwise the golden cannot pass.
- Opened: file:line opened: mobile/__tests__/parcelScreens.golden.test.ts:249 the quoted code is there

### F-286 · mobile-100 (mobile-100-p3) · diff part mobile-1 · DEFER severity=MED
- Clause: Raw `q` in logs "the `.infra` log-hygiene lock asserts `q` is never passed to `logInfo`"
- Diff: mobile/src/components/surfaces/LotMapBinding.tsx:103 "onPress: { action: 'open_help', topic, q: derived('query') }"
- Lens claim: the typed query now leaves the app to Help & Support in a browser sheet, an egress of `q` that no pasted clause names and the pasted guard (logInfo only) does not cover
- Lens fix or rationale: cite a test showing openHelp neither logs nor puts `q` in a tracked URL, or stop passing `q`.
- Opened: file:line opened: mobile/src/components/surfaces/LotMapBinding.tsx:103 the quoted code is there

### F-287 · mobile-100 (mobile-100-p3) · diff part mobile-1 · DEFER severity=LOW
- Clause: Whitelist leak (NEW) "the §3.2 explicit pick-by-name assembler + the `.infra` whitelist test (no unlisted key; no `groups`; no Spec 89 Tier-3 column name)"
- Diff: mobile/src/components/surfaces/SearchBinding.tsx:52 "const ENTITLEMENT = 'contract_parcels_entitlement';"
- Lens claim: a new three-key served payload enters the client data set and no assembler or whitelist test for it is pasted
- Lens fix or rationale: name the pick-by-name assembler and the whitelist test for GET /api/parcels/entitlement.
- Opened: file:line opened: mobile/src/components/surfaces/SearchBinding.tsx:52 the quoted code is there

### F-288 · mobile-100 (mobile-100-p3) · diff part mobile-1 · DEFER severity=LOW
- Clause: No-match-is-a-result "the §2.6 200-with-null contract"
- Diff: mobile/app/(app)/parcel-tool/semi-question.tsx:79 "storeLookup(id, result);"
- Lens claim: the answered lookup's result is cached under the report key before the report is opened, and nothing pasted states what the 200-with-null contract says for an answered unsure lot, so compliance cannot be confirmed
- Lens fix or rationale: paste the §2.6 rule for the `semi: 'answered'` response.
- Opened: file:line opened: mobile/app/(app)/parcel-tool/semi-question.tsx:79 the quoted code is not there; it is at line 74

### F-290 · mobile-100 (mobile-100-p3) · diff part mobile-2 · DEFER severity=MED
- Clause: no pasted clause (the only authority cited is RR-0278, not pasted) "RR-0278): `semi: 'answered'` is the one optional flag the semi question page sends at Continue"
- Diff: mobile/src/lib/lotForm.ts:8 "it travels as a route param (OVERRIDE_PARAM) to the report, which does not apply it yet: nothing outside this file reads the param or calls `lotFormEffective`"
- Lens claim: the same change asks the server to count a reported lot while this comment records the owner's answer reaches no consumer, so a report is counted whose form the answer never changed
- Lens fix or rationale: paste the P5.7 / task-209 clause, or hold the `semi` count until the override is applied.
- Opened: file:line opened: mobile/src/lib/lotForm.ts:8 the quoted code is there

### F-291 · mobile-100 (mobile-100-p3) · diff part mobile-2 · DEFER severity=MED
- Clause: Spec 100 §8 "a distinct home-looker persona, entitlement, and pricing (and an optional `parcel_view_events` trial counter) are a later product decision"
- Diff: mobile/src/lib/schemas.ts:445 "export const ParcelToolEntitlementSchema = z.object({"
- Lens claim: the diff ships an entitlement read, schema, cache key, persist-filter entry and line in v1, while the only pasted text that names entitlement defers it and RR-0307 that would authorize the line is not pasted
- Lens fix or rationale: paste RR-0307 (SRCH.A6) or drop useParcelEntitlement, ParcelToolEntitlementSchema, EntitlementLine and the persistFilter entry from this change.
- Opened: file:line opened: mobile/src/lib/schemas.ts:445 the quoted code is there

### F-292 · mobile-100 (mobile-100-p3) · diff part mobile-2 · DEFER severity=MED
- Clause: no pasted clause (Spec 126 §11b.3 and small-pages-v8 search.html:235 are cited but not pasted) "the page opens in the in-app browser sheet through expo-web-browser, the same call as useSubscribeCheckout.ts:61, instead of leaving the app through Linking"
- Diff: mobile/src/lib/maxbldHelp.ts:13 "import * as WebBrowser from 'expo-web-browser';"
- Lens claim: the change reverses the recorded leave-the-origin decision (removed line "it leaves the app for the browser (Linking.openURL, a leave-the-origin move, never a router push)") with no pasted clause in front of the reviewer
- Lens fix or rationale: paste §11b.3 and the search.html:235 line, or keep Linking.openURL.
- Opened: file:line opened: mobile/src/lib/maxbldHelp.ts:13 the quoted code is there

### F-293 · mobile-100 (mobile-100-p3) · diff part mobile-2 · DEFER severity=MED
- Clause: no pasted clause (the diff itself calls it "a timeframe; operator item in the lane report", and LX-E1 is not pasted) "SRCH.SEMI-3 (task-361, LX-E1): how long Continue waits for the answered lookup"
- Diff: mobile/src/lib/semiQuestion.ts:16 "export const SEMI_CONTINUE_WAIT_MS = 60_000;"
- Lens claim: a 60 second user facing wait is introduced with no pasted operator wording, number or ruling
- Lens fix or rationale: paste the operator timeframe or drop boundedWait from this diff.
- Opened: file:line opened: mobile/src/lib/semiQuestion.ts:16 the quoted code is there

### F-294 · mobile-100 (mobile-100-p3) · diff part mobile-2 · DEFER severity=LOW
- Clause: no pasted clause names cache seeding, and Spec 100 §4 key hygiene is cited in the file but not pasted "Depends ONLY on `['parcel-lookup', parcelId]`"
- Diff: mobile/src/hooks/useParcelLookup.ts:97 "queryClient.setQueryData(['parcel-lookup', parcelId], result)"
- Lens claim: a result fetched by the semi page with `semi=answered` is written under the same key a request without `semi` reads with staleTime 60_000, so the key no longer identifies one request and no pasted clause authorizes the seeding
- Lens fix or rationale: paste the SUITE.FIX-2 / task-353 ruling and include `semi` in the key, or invalidate ['parcel-lookup', parcelId] on report mount.
- Opened: file:line opened: mobile/src/hooks/useParcelLookup.ts:97 the quoted code is not there; it is at line 111

### F-300 · mobile-100 (mobile-100-p3) · diff part mobile-tests-1 · DEFER severity=MED
- Clause: No-match-is-a-result, "treating a miss or an unknown parcelId as a 404 breaks the client state machine", "Guard: the §2.6 200-with-null contract"
- Diff: mobile/__tests__/reportScreen.mount.behaviour.test.tsx "expect(mockReplace.mock.calls).toEqual([['/(app)/parcel-tool/semi-question?parcelId=PIN-777']]);"
- Lens claim: a settled 200-with-null page for an unsure lot is now replaced by a redirect rather than shown as a result, and the exception's authority (RR-0278, SE-1) is not pasted, leaving one clear-lot test as the only pin on the pasted contract
- Lens fix or rationale: rationale: paste RR-0278/SE-1, or reach the question without overriding the null-page result
- Opened: file opened: mobile/__tests__/reportScreen.mount.behaviour.test.tsx no line number was given; the quoted code is there (line 112)

### F-301 · mobile-100 (mobile-100-p3) · diff part mobile-tests-1 · DEFER severity=MED
- Clause: §8 "a map pane with the parcel + example pins, a map-search mode" is listed under "Future (reserved)" and "is out of v1 scope"
- Diff: mobile/__tests__/lotMapPage.behaviour.test.tsx "expect(screen.getByText('Pick a lot on the map or in the list.')).toBeTruthy();"
- Lens claim: the diff pins a lot map surface whose ruled copy points at a map, while the pasted §8 keeps a map pane out of v1 and requires "a conscious whitelist extension" for centroid data
- Lens fix or rationale: rationale: confirm against a pasted clause that this choose-lot map is in v1 and not the reserved 23C pane, or record it as deferred
- Opened: file opened: mobile/__tests__/lotMapPage.behaviour.test.tsx no line number was given; the quoted code is there (line 167)

### F-302 · mobile-96 (mobile-96-p1) · diff part mobile-1 · DEFER severity=MED
- Clause: Spec 96 §8 "Never see the trial countdown"
- Diff: mobile/src/components/surfaces/SearchBinding.tsx:96 "vars: { left: entitlement('reportsLeft'), allowance: entitlement('reportsLimit'), reset: entitlement('resetsOnDisplay') }"
- Lens claim: the new allowance meter draws for every user the entitlement read answers for and carries no exclusion for an `admin_managed` manufacturer, whose payload is not in the diff (cannot see), so the §8 ban is not shown satisfied
- Lens fix or rationale: add an explicit plan/account guard, or paste the entitlement payload proving an admin_managed read yields no line.
- Opened: file:line opened: mobile/src/components/surfaces/SearchBinding.tsx:96 the quoted code is not there; it is at line 102

### F-303 · mobile-96 (mobile-96-p1) · diff part mobile-1 · DEFER severity=MED
- Clause: Spec 96 §5 "The app opens this URL via `WebBrowser.openBrowserAsync()` from `expo-web-browser`."
- Diff: mobile/app/(app)/parcel-tool/disambiguate.tsx:50 "the help link opens Help & Support in the in-app browser sheet (task-362)" with the action at :51 "open_help: openHelp"
- Lens claim: the newly added help links are met only by a comment; `openHelp` lives in `@/lib/maxbldHelp`, which is not in the diff, so the openBrowserAsync mechanism cannot be seen
- Lens fix or rationale: include mobile/src/lib/maxbldHelp.ts in the diff.
- Opened: file:line opened: mobile/app/(app)/parcel-tool/disambiguate.tsx:50 the quoted code is not there (not found in the file at 3a36e8b26)

### F-304 · mobile-96 (mobile-96-p1) · diff part mobile-1 · DEFER severity=MED
- Clause: dated note 2026-11-11 "the parcel lookup gate is per product ... (metered, Spec 126 section 11b.7 dated note 2026-11-11)"
- Diff: mobile/app/(app)/parcel-tool/semi-question.tsx:64 "result = await boundedWait(fetchParcelLookup({ parcelId: id, semi: 'answered' }), SEMI_CONTINUE_WAIT_MS);"
- Lens claim: the diff makes the meter move on a new `semi` query flag, and neither the flag nor the count-once-when-the-report-is-produced rule appears in any pasted text (cannot see Spec 126 §11b.7)
- Lens fix or rationale: paste that dated note or the server-side gate text before merge.
- Opened: file:line opened: mobile/app/(app)/parcel-tool/semi-question.tsx:64 the quoted code is there

### F-305 · mobile-96 (mobile-96-p1) · diff part mobile-1 · DEFER severity=LOW
- Clause: no pasted clause or ruling names the reports-left line
- Diff: mobile/app/(app)/parcel-tool/index.tsx:78 "entitlement: entitlement ? { reportsLeft: entitlement.reportsLeft, reportsLimit: entitlement.reportsLimit, resetsOnDisplay: entitlement.resetsOnDisplay } : null"
- Lens claim: SRCH.A6, RR-0307 and RR-0310 are cited but none is pasted, so existence, wording and values of the line are unjudgeable here
- Lens fix or rationale: paste the SRCH.A6 card and RR-0307/RR-0310.
- Opened: file:line opened: mobile/app/(app)/parcel-tool/index.tsx:78 the quoted code is there

### F-306 · mobile-96 (mobile-96-p1) · diff part mobile-1 · DEFER severity=LOW
- Clause: no pasted clause or ruling names the lot-map help links or the pick hint
- Diff: mobile/src/components/surfaces/LotMapBinding.tsx:107 "return [unlinkedNotice(), helpLink('address_match'), ...mapView(s)];" and :250 "helpRow()"
- Lens claim: SRCH.C12, C.11, C.12 and the mock lines choose-lot.html:278-279 are cited but not pasted, so text and placement cannot be checked
- Lens fix or rationale: paste the approved choose-lot lines.
- Opened: file:line opened: mobile/src/components/surfaces/LotMapBinding.tsx:107 the quoted code is not there (not found in the file at 3a36e8b26)

### F-307 · mobile-96 (mobile-96-p1) · diff part mobile-2 · DEFER severity=MED
- Clause: SRCH.A6 / RR-0307, cited by the change, is not in the pasted context, so the new reports-left behaviour has no pasted clause to satisfy
- Diff: "SRCH.A6 (task-320; RR-0307): the caller's plan and this month's report count"
- Lens claim: mobile/src/hooks/useParcelLookup.ts:112-118 "export async function fetchParcelEntitlement(): Promise<ParcelToolEntitlement> {"
- Lens fix or rationale: a new endpoint read, Zod boundary, cache key and non-persistence land with no pasted clause or ruling naming any of them (walk step 4) — paste SRCH.A6 and RR-0307 before merge so the display, the null-when-no-plan rule and the "display, never a gate" claim can be checked clause by clause
- Opened: no file:line in the field as returned: "SRCH.A6 (task-320; RR-0307): the caller's plan and this month's repor

### F-308 · mobile-96 (mobile-96-p1) · diff part mobile-2 · DEFER severity=MED
- Clause: SRCH.A6 "re-read on focus" is satisfied only by the docstring, not visibly by the hook
- Diff: mobile/src/hooks/useParcelLookup.ts:113 "re-read on focus."
- Lens claim: mobile/src/hooks/useParcelLookup.ts:126-131 "staleTime: 0, retry: shouldRetryParcelLookup,"
- Lens fix or rationale: the hook sets staleTime and retry but no focus/AppState refetch option appears in the pasted code, so the clause rests on a comment (walk step 3) — add the explicit focus refetch (refetchOnWindowFocus or a focusManager subscription) or drop the claim
- Opened: file:line opened: mobile/src/hooks/useParcelLookup.ts:113 the quoted code is not there; it is at line 119

### F-309 · mobile-96 (mobile-96-p1) · diff part mobile-2 · DEFER severity=MED
- Clause: SRCH.SEMI-3 "a timeframe; operator item in the lane report" is not pasted, so the waited duration has no pasted ruling behind it
- Diff: "how long Continue waits for the answered lookup before it ends in the built error state (a timeframe; operator item in the lane report)"
- Lens claim: mobile/src/lib/semiQuestion.ts:16 "export const SEMI_CONTINUE_WAIT_MS = 60_000;"
- Lens fix or rationale: the 60_000 value is asserted only by the code comment citing an unpasted operator item — paste the lane-report operator item that names the wait, or mark the value as provisional
- Opened: no file:line in the field as returned: "how long Continue waits for the answered lookup before it ends in the

### F-310 · mobile-96 (mobile-96-p1) · diff part mobile-2 · DEFER severity=MED
- Clause: task-362 / small-pages-v8 search.html:235, the clause for the Help sheet, is not pasted; the only pasted browser clause binds the subscribe URL, not Help
- Diff: mobile/src/lib/maxbldHelp.ts:6-7 "the page opens in the in-app browser sheet through expo-web-browser, the same call as useSubscribeCheckout.ts:61"
- Lens claim: mobile/src/lib/maxbldHelp.ts:22 "await WebBrowser.openBrowserAsync(helpUrl(topic, q));"
- Lens fix or rationale: the switch from Linking.openURL to the in-app sheet rests on a clause not in the pasted context — paste §11b.3/§11b.7 and the small-pages line so the sheet, the Done behaviour and the fragment-only prefill can be checked
- Opened: file:line opened: mobile/src/lib/maxbldHelp.ts:6 the quoted code is not there (not found in the file at 3a36e8b26)

### F-311 · mobile-96 (mobile-96-p1) · diff part mobile-2 · DEFER severity=LOW
- Clause: the semi override's deferral (OVERRIDE_PARAM not read, effect owned by task-209) is asserted by a comment only, and the governing P5.7 / task-209 text is not pasted
- Diff: "it travels as a route param (OVERRIDE_PARAM) to the report, which does not apply it yet: nothing outside this file reads the param or calls `lotFormEffective`"
- Lens claim: mobile/src/lib/lotForm.ts:8-9 "nothing outside this file reads the param or calls `lotFormEffective`"
- Lens fix or rationale: a clause-shaped statement stands on a comment with no pasted clause behind it — paste the P5.7 text or the task-209 card so the "not applied yet" state is a ruled deferral rather than a comment
- Opened: no file:line in the field as returned: "it travels as a route param (OVERRIDE_PARAM) to the report, which doe

### F-312 · mobile-96 (mobile-96-p1) · diff part mobile-tests-1 · DEFER severity=LOW
- Clause: Spec 96 §5 "The app opens this URL via `WebBrowser.openBrowserAsync()` from `expo-web-browser`"
- Diff: mobile/__tests__/maxbldHelp.test.ts:31 "expect(open).toHaveBeenCalledWith('https://maxbld.ca/help#topic=address_match&q=1%20Main%20St')"
- Lens claim: the diff's only browser-mechanism assertion is on the maxbld.ca help URL, a surface no pasted clause names, while the pasted clause scopes openBrowserAsync to the buildo.com checkout URL; AC1/AC5 (task-362, small-pages-v8 search.html:235) are not pasted, cannot verify the sheet is the ruled exit
- Lens fix or rationale: cite the governing card for the help link in the change record, or state plainly that no pasted clause binds it.
- Opened: file:line opened: mobile/__tests__/maxbldHelp.test.ts:31 the quoted code is there

### F-313 · mobile-96 (mobile-96-p1) · diff part mobile-tests-1 · DEFER severity=LOW
- Clause: Spec 96 §5 "no UID or email in the URL (avoids PII exposure in server logs, browser history, and referrer headers)"
- Diff: mobile/__tests__/maxbldHelp.test.ts:31 "https://maxbld.ca/help#topic=address_match&q=1%20Main%20St"
- Lens claim: the typed street address is placed into a URL the OS in-app browser records, and the pasted clause's stated rationale is exactly PII in browser history, though its scope is the subscribe nonce URL
- Lens fix or rationale: record why the fragment is acceptable for the help URL (it is not sent to the server) in the change note rather than leaving the two URL rules unexplained.
- Opened: file:line opened: mobile/__tests__/maxbldHelp.test.ts:31 the quoted code is there

### F-314 · mobile-96 (mobile-96-p1) · diff part mobile-tests-1 · DEFER severity=LOW
- Clause: no pasted clause fixes the mobile touch minimum; the only pasted design text that binds sizes is Spec 96 §5's NativeWind table
- Diff: mobile/__tests__/semiQuestionScreens.golden.test.ts:60 "some((c) => c === 'min-h-[44px]' || c === 'min-h-[48px]')"
- Lens claim: the golden rule is widened from exactly min-h-[44px] to also accept min-h-[48px] on the grounds of "the mock" (SRCH.SEMI stage 2), and that mock rule is not pasted, cannot verify
- Lens fix or rationale: quote the 48 px mock line (semi-question.html) in the comment, as the sibling cases do for their cited lines.
- Opened: file:line opened: mobile/__tests__/semiQuestionScreens.golden.test.ts:60 the quoted code is there

### F-315 · mobile-96 (mobile-96-p1) · diff part mobile-tests-1 · DEFER severity=LOW
- Clause: no pasted clause names search placeholder copy; the pasted behaviour is limited to the paywall and subscription surfaces
- Diff: mobile/__tests__/parcelScreens.golden.test.ts:246 "expect(SEARCH_SLICE.content['search.input.placeholder']).toBe('Enter a Toronto address');"
- Lens claim: the wording change rests on RR-0313 (2026-11-19), which is not pasted, and the test also replaces the previous 2026-11-11 ruling's asserted string
- Lens fix or rationale: quote the RR-0313 verbatim line in the change record so the newer ruling is verifiable against the string asserted.
- Opened: file:line opened: mobile/__tests__/parcelScreens.golden.test.ts:246 the quoted code is there

### F-316 · mobile-96 (mobile-96-p1) · diff part mobile-tests-1 · DEFER severity=LOW
- Clause: Spec 96 dated note 2026-11-11 "`GET /api/parcels/lookup` admits a `parcel_tool` entitlement in {trial, active, past_due, admin_managed} ... else 403 `SUBSCRIPTION_REQUIRED`"
- Diff: mobile/__tests__/useParcelLookup.test.ts:109 "expect(mockFetch).toHaveBeenLastCalledWith('/api/parcels/lookup?parcelId=PIN-777&semi=answered')"
- Lens claim: a new `semi` query param is added to the gated endpoint and no pasted clause names it, the pasted clause governs only the entitlement outcome, so the gate is untouched but the param's contract (SE-1, SE-2, RR-0278) is not pasted
- Lens fix or rationale: record the server-side acceptance of `semi` in the change note, since nothing pasted confirms the endpoint honours or ignores it.
- Opened: file:line opened: mobile/__tests__/useParcelLookup.test.ts:109 the quoted code is there

### F-317 · mobile-96 (mobile-96-p1) · diff part mobile-tests-1 · DEFER severity=LOW
- Clause: a clause satisfied only by a test name is unmet; the whole pasted diff is test files
- Diff: mobile/__tests__/lotMapPage.behaviour.test.tsx:161 "task-362 AC1, AC5: Get help with an address opens Help in the in-app browser sheet"
- Lens claim: the production lines these tests pin (mobile/lib/maxbldHelp.ts, disambiguate.tsx, index.tsx, semi-question.tsx, useParcelLookup.ts) are not in this diff part, cannot see them, so every behavioural clause here is asserted but unverifiable from the pasted material
- Lens fix or rationale: confirm the source diff parts are pasted alongside before sign-off.
- Opened: file:line opened: mobile/__tests__/lotMapPage.behaviour.test.tsx:161 the quoted code is not there; it is at line 174

### F-318 · mobile-96 (mobile-96-p2) · diff part mobile-1 · DEFER severity=MED
- Clause: Spec 96 Operating Boundaries, out of scope "Pricing tier display in-app
- Diff: managed on web only"
- Lens claim: mobile/app/(app)/parcel-tool/index.tsx:78 "entitlement: entitlement ? { reportsLeft: entitlement.reportsLeft, reportsLimit: entitlement.reportsLimit, resetsOnDisplay: entitlement.resetsOnDisplay } : null,"
- Lens fix or rationale: the change prints the plan's report allowance and reset date inside the app, and the only pasted boundary on plan display in-app assigns it to the web — get the operator to say a reports-left count is not the out-of-scope tier display, or drop the line.
- Opened: no file:line in the field as returned: managed on web only"

### F-319 · mobile-96 (mobile-96-p2) · diff part mobile-1 · DEFER severity=MED
- Clause: Spec 96 declared scope "Mobile subscription (Spec 96, whole; governs the no-plan and limit states)"
- Diff: mobile/src/components/surfaces/SemiQuestionBinding.tsx:53 "? [notice('entitlement', 'Info', L.noticeIconNeutral, [node('AlertDescription', { key: 'entitlement-text', className: L.noticeTextNeutral }, [content('state.entitlement')])])]"
- Lens claim: a limit state is now drawn as a neutral Info notice, and the only limit-state treatment the pasted body names is "'expired'` → `<PaywallScreen>`", so no pasted clause authorizes softening it
- Lens fix or rationale: paste the ruling that makes this notice informational, or keep the Lock treatment.
- Opened: file:line opened: mobile/src/components/surfaces/SemiQuestionBinding.tsx:53 the quoted code is there

### F-320 · mobile-96 (mobile-96-p2) · diff part mobile-1 · DEFER severity=MED
- Clause: pasted context names no clause governing the added parcel behaviour
- Diff: mobile/app/(app)/parcel-tool/semi-question.tsx:11 "// SRCH.SEMI stage 2 (task-319, MF-93; RR-0278): Continue first fetches the same lookup with the one flag `semi: 'answered'`"
- Lens claim: every clause this diff claims to satisfy (SRCH.A6 task-320 RR-0307, SRCH.C12 task-321, SRCH.SEMI/SEMI-3 task-319/361, SRCH.METER-2 task-360, S-093, Spec 78 O-4, Spec 99 §6.5) is cited but not pasted, so compliance with them cannot be judged here
- Lens fix or rationale: paste those clauses into the next review pack before merge.
- Opened: file:line opened: mobile/app/(app)/parcel-tool/semi-question.tsx:11 the quoted code is there

### F-323 · mobile-96 (mobile-96-p2) · diff part mobile-2 · DEFER severity=MED
- Clause: Spec 96 Step 2 "On mount + on `AppState change` to `'active'`: call `queryClient.invalidateQueries(['user-profile'])` to re-fetch profile"
- Diff: mobile/src/hooks/useParcelLookup.ts "never persisted across a restart (mobile/src/lib/persistFilter.ts); re-read on focus."
- Lens claim: the freshness the comment claims is a comment only: the diff wires no AppState 'active' invalidation and no focus manager for ['parcel-entitlement'], so the pasted re-fetch pattern has no counterpart here and the claim rests on prose
- Lens fix or rationale: add the AppState/focus invalidation call and test, or delete the "re-read on focus" claim.
- Opened: file opened: mobile/src/hooks/useParcelLookup.ts no line number was given; the quoted code is there (line 119)

### F-324 · mobile-96 (mobile-96-p2) · diff part mobile-2 · DEFER severity=MED
- Clause: every hunk rests on ids not pasted (RR-0278, RR-0307, RR-0310, MF-93, LX-E1, FE-05, task-319/320/353/360/361/362; Spec 100 §4, bindings.json mount_internal, small-pages-v8 search.html:235)
- Diff: mobile/src/lib/semiQuestion.ts "SRCH.SEMI-3 (task-361, LX-E1): how long Continue waits for the answered lookup"
- Lens claim: compliance of the semi `semi: 'answered'` flag, the 60s boundedWait, the mount-file indirection and the help sheet cannot be judged against anything pasted, so those parts are "cannot see"
- Lens fix or rationale: paste the cited rulings and spec sections before merge.
- Opened: file opened: mobile/src/lib/semiQuestion.ts no line number was given; the quoted code is there (line 15)

### F-325 · mobile-96 (mobile-96-p2) · diff part mobile-tests-1 · DEFER severity=MED
- Clause: Spec 126 §11b.3 / MF-46 follow-up (cited in the diff, not pasted)
- Diff: "openHelp opens that URL in the in-app browser sheet through expo-web-browser (the same call as useSubscribeCheckout.ts:61), never through"
- Lens claim: mobile/__tests__/maxbldHelp.test.ts:6 "openHelp opens that URL in the in-app browser sheet through expo-web-browser"
- Lens fix or rationale: the only governing text pasted is Spec 96 (subscription), which never reaches the Help surface, so the help-sheet exit and the fragment prefill cannot be judged — paste Spec 126 §11b.3 and its 2026-11-12 dated note for the Help & Support link.
- Opened: file:line opened: useSubscribeCheckout.ts does not exist at 3a36e8b26 (cannot open)

### F-326 · mobile-96 (mobile-96-p2) · diff part mobile-tests-1 · DEFER severity=MED
- Clause: task-362 AC2/AC6 (cited in the diff, not pasted)
- Diff: "choose-lot.html:278 `<button type=\"button\" class=\"btn p\" disabled aria-describedby=\"pick-hint\">Choose a lot</button><p class=\"small\" id=\"pick-hint\">Pick a lot on the map or in the list.</p>`"
- Lens claim: mobile/__tests__/lotMapScreens.golden.test.ts:139 "expect(LOT_MAP_SLICE.content['select.hint']).toBe('Pick a lot on the map or in the list.');"
- Lens fix or rationale: the verbatim hint text, the disabled-only draw rule and the aria-describedby mapping all rest on a mock line and card not pasted, so the test's source text is unverifiable — paste choose-lot.html around 270-285 and the AC2/AC6 wording.
- Opened: no file:line in the field as returned: "choose-lot.html:278 `<button type=\"button\" class=\"btn p\" disabled

### F-327 · mobile-96 (mobile-96-p2) · diff part mobile-tests-1 · DEFER severity=MED
- Clause: RR-0313 / task-356 (cited in the diff, not pasted)
- Diff: "operator verbatim: \"c. can't we put in the search box. Enter a Toronto address\""
- Lens claim: mobile/__tests__/parcelScreens.golden.test.ts:246 "expect(SEARCH_SLICE.content['search.input.placeholder']).toBe('Enter a Toronto address');"
- Lens fix or rationale: this line retires an earlier operator ruling ("should be enter lot address") on the strength of a comment, and the superseding ruling is not pasted, so the new verbatim string cannot be checked — paste RR-0313 and RR-0314 from MORNING-DECISIONS.md:1216.
- Opened: no file:line in the field as returned: "operator verbatim: \"c. can't we put in the search box. Enter a Toron

### F-328 · mobile-96 (mobile-96-p2) · diff part mobile-tests-1 · DEFER severity=MED
- Clause: SRCH.METER-2 / RR-0278 (cited in the diff, not pasted)
- Diff: "an unsure lot is held by the server (page null) until the semi answer; the screen must not flash the"
- Lens claim: mobile/__tests__/reportScreen.mount.behaviour.test.tsx:107 "a settled unsure lot with page null shows the loading state, not the miss text, and redirects to the question once"
- Lens fix or rationale: the held-page rule and the exact-sentinel rule ("Only the exact sentinel counts as answered") are pasted nowhere, so neither the loading hold nor the parcelLookupParams stray-value matrix can be judged — paste RR-0278 and the SE-1/SE-2 findings.
- Opened: no file:line in the field as returned: "an unsure lot is held by the server (page null) until the semi answer

### F-329 · mobile-96 (mobile-96-p2) · diff part mobile-tests-1 · DEFER severity=MED
- Clause: SRCH.SEMI-3 / task-361, semi-question.html:130 (cited in the diff, not pasted)
- Diff: "The approved mock draws only the rule `.btn.p[aria-busy=\"true\"] { opacity:.85; cursor:progress }`"
- Lens claim: mobile/__tests__/semiQuestionScreens.golden.test.ts:142 "// SRCH.SEMI-3 (task-361, UX-4): the busy Continue. The approved mock draws only the rule"
- Lens fix or rationale: the busy accessibilityState, the opacity class and the "no busy section" claim rest on a mock and card not pasted, so the new named case cannot be checked against its source — paste semi-question.html around line 130 and the SRCH.SEMI-3 card.
- Opened: no file:line in the field as returned: "The approved mock draws only the rule `.btn.p[aria-busy=\"true\"] { o

### F-330 · mobile-96 (mobile-96-p2) · diff part mobile-tests-1 · DEFER severity=LOW
- Clause: touch-target rule (not pasted)
- Diff: "if (n.component === 'Button' && !String(n.props.className ?? '').split(/\s+/).some((c) => c === 'min-h-[44px]' || c === 'min-h-[48px]'))"
- Lens claim: mobile/__tests__/semiQuestionScreens.golden.test.ts:60 "SRCH.SEMI stage 2: Continue and Try again are 48 px (the mock)"
- Lens fix or rationale: the diff widens the Button height rule to 48 px on the authority of "the mock", and no pasted clause names either 44 px or 48 px, so the relaxation has no visible authority — paste the touch-target clause that permits 48 px for these buttons.
- Opened: no file:line in the field as returned: "if (n.component === 'Button' && !String(n.props.className ?? '').spli

### F-333 · mobile-99 (mobile-99-p1) · diff part mobile-1 · DEFER severity=MED
- Clause: Spec 99 §3.2 `idToken` row, Authorized Readers "apiClient `Authorization: Bearer` only"
- Diff: mobile/app/(app)/parcel-tool/index.tsx "const accessToken = useAuthStore((s) => s.accessToken);"
- Lens claim: a screen reads the auth credential, a field with no row in the pasted §3.2 matrix (only `idToken` exists there) and a reader set limited to apiClient, so the normative matrix cannot be shown to authorize it
- Lens fix or rationale: fix: gate the focus refetch on an existing matrix field (e.g. `user.uid`) or add the matrix row / route the read through apiClient.
- Opened: file opened: mobile/app/(app)/parcel-tool/index.tsx no line number was given; the quoted code is there (line 54)

### F-334 · mobile-99 (mobile-99-p1) · diff part mobile-1 · DEFER severity=MED
- Clause: Spec 99 §B1 registry "the parcel detail; depends ONLY on `parcelId` (query-key hygiene, never on the search string)"
- Diff: mobile/app/(app)/parcel-tool/[parcelId].tsx "const { data, isError, isFetching, refetch } = useParcelLookup(parcelId, semiParam);"
- Lens claim: the owner hook now takes a second argument not in the registered key; useParcelLookup's body is not pasted (cannot see), and if `semi` enters the key the report will not read the entry the semi screen stores
- Lens fix or rationale: fix: keep the key `['parcel-lookup', parcelId]`, pass `semi` as a request argument only, and state that in the change.
- Opened: file opened: mobile/app/(app)/parcel-tool/[parcelId].tsx no line number was given; the quoted code is there (line 23)

### F-335 · mobile-99 (mobile-99-p1) · diff part mobile-1 · DEFER severity=MED
- Clause: pasted context contains no card text for the behaviour added
- Diff: mobile/src/components/surfaces/SearchBinding.tsx "SRCH.A6 (task-320; RR-0307; small-pages-v8 search.html:267)"
- Lens claim: the reports-left line, the lot-map help link/pick hint (SRCH.C12, C.11) and the semi page restyle (SRCH.SEMI-3) rest on cards and mocks that are not pasted; only Spec 99 is, so whether the copy, placement and values satisfy them cannot see
- Lens fix or rationale: fix: paste the SRCH.A6 / C.11 / C.12 / SEMI-3 card lines and the v8 excerpts against which these assertions are made.
- Opened: file opened: mobile/src/components/surfaces/SearchBinding.tsx no line number was given; the quoted code is there (line 94)

### F-336 · mobile-99 (mobile-99-p1) · diff part mobile-1 · DEFER severity=LOW
- Clause: Spec 99 §3 "Adding a field to the mobile app requires adding a row here"
- Diff: mobile/src/components/surfaces/SearchBinding.tsx "const entitlement = (field: string): Ref => ({ contract: `${ENTITLEMENT}.${field}` });"
- Lens claim: a new contract surface `contract_parcels_entitlement` is bound into the search props tree (reportsLeft, reportsLimit, resetsOnDisplay) with no state-matrix or contract row in the pasted material
- Lens fix or rationale: fix: paste the entitlement contract schema and its §3 row so the three printed fields can be checked against a served source.
- Opened: file opened: mobile/src/components/surfaces/SearchBinding.tsx no line number was given; the quoted code is there (line 55)

### F-343 · mobile-99 (mobile-99-p1) · diff part mobile-2 · DEFER severity=LOW
- Clause: Spec 99 §4 B1 "`refetchOnReconnect` defaults to `true` and MUST stay enabled for `['user-profile']`"
- Diff: mobile/src/hooks/useParcelLookup.ts "re-read on focus."
- Lens claim: the "re-read on focus" and "No retry on 401/403/429 or drift" claims are comment-only: the useQuery options show no focus option and shouldRetryParcelLookup's body is not in the diff, so neither claim can be checked
- Lens fix or rationale: show the option and the retry guard, or delete the claims.
- Opened: file opened: mobile/src/hooks/useParcelLookup.ts no line number was given; the quoted code is there (line 119)

### F-345 · mobile-99 (mobile-99-p1) · diff part mobile-tests-1 · DEFER severity=MED
- Clause: Spec 99 §4 preamble "These are the only allowed cross-layer flows. A seventh pattern requires a spec amendment." and §4 B1 "Every server fetch MUST go through TanStack Query
- Diff: never raw `fetch()` in components."
- Lens claim: mobile/__tests__/semiQuestionPage.behaviour.test.tsx:33 "useSetParcelLookup: () => (id: string, result: unknown) => mockSetQueryData(['parcel-lookup', id], result)"
- Lens fix or rationale: the Continue press runs fetchParcelLookup then a hand-rolled queryClient.setQueryData write from the page, which is neither B1 (useQuery) nor B3 (useMutation with onSettled invalidate); the app code is not in this diff part, so whether it is wrapped in useMutation cannot be seen — wrap it in useMutation per B3 or paste the §4 amendment.
- Opened: no file:line in the field as returned: never raw `fetch()` in components."

### F-346 · mobile-99 (mobile-99-p1) · diff part mobile-tests-1 · DEFER severity=MED
- Clause: operator ruling RR-0313 (not pasted; cited only in a comment)
- Diff: mobile/__tests__/parcelScreens.golden.test.ts:242 "Dated note 2026-11-19 (RR-0313, MORNING-DECISIONS.md:1216, operator verbatim: \"c. can't we put in the search box. Enter a Toronto address\"; task-356)"
- Lens claim: the new placeholder "Enter a Toronto address" is satisfied only by a test comment, and the companion ruling RR-0314 for the outside-Toronto notice is also not pasted, so neither verbatim wording can be checked
- Lens fix or rationale: paste RR-0313/RR-0314 into the context.
- Opened: file:line opened: mobile/__tests__/parcelScreens.golden.test.ts:242 the quoted code is not there (not found in the file at 3a36e8b26)

### F-347 · mobile-99 (mobile-99-p1) · diff part mobile-tests-1 · DEFER severity=LOW
- Clause: no pasted clause or ruling names this behaviour (walk step 4)
- Diff: mobile/__tests__/semiQuestionPage.behaviour.test.tsx:150 "await act(async () => { jest.advanceTimersByTime(SEMI_CONTINUE_WAIT_MS - 1); });"
- Lens claim: a bounded wait, an error state on Continue failure, a busy Continue and a double-press guard are added on the strength of SRCH.SEMI-3 / task-361, quoted only inside comments and not in the pasted context
- Lens fix or rationale: paste task-361/task-319 in, or drop the unruled additions.
- Opened: file:line opened: mobile/__tests__/semiQuestionPage.behaviour.test.tsx:150 the quoted code is there

### F-348 · mobile-99 (mobile-99-p1) · diff part mobile-tests-1 · DEFER severity=LOW
- Clause: no pasted clause or ruling names this behaviour (walk step 4)
- Diff: mobile/__tests__/lotMapPage.behaviour.test.tsx:178 "expect(mockOpenBrowser.mock.calls).toEqual([['https://maxbld.ca/help#topic=lot_match&q=5%20Elm%20St']]);"
- Lens claim: the in-app browser sheet, the lot_match topic and the pick hint are added on task-362 AC1/AC2/AC5, which are named but not pasted
- Lens fix or rationale: paste the task-362 ACs so the URL shape and the hint text can be checked clause by clause.
- Opened: file:line opened: mobile/__tests__/lotMapPage.behaviour.test.tsx:178 the quoted code is there

### F-349 · mobile-99 (mobile-99-p2) · diff part mobile-1 · DEFER severity=HIGH
- Clause: Spec 99 §8.3 "Each render gate condition (per §6.5) MUST have a test asserting that toggling `isFetching` does NOT flip the gate."
- Diff: mobile/app/(app)/parcel-tool/[parcelId].tsx:35 "const { view, lifecycle } = reportScreenState({ data: data && !ask ? { page: data.page ?? null } : undefined, isError });"
- Lens claim: the diff introduces a new loading-versus-report render gate whose stated purpose is to stop a flip, and the diff's file list carries no test for it; a clause met only by the SRCH.METER-2 comment is UNMET
- Lens fix or rationale: add the §8.3 gate-stability test (same settled ask-owed data rendered with isFetching true and false, assert the identical loading view both times).
- Opened: file:line opened: mobile/app/(app)/parcel-tool/[parcelId].tsx:35 the quoted code is there

### F-350 · mobile-99 (mobile-99-p2) · diff part mobile-1 · DEFER severity=MED
- Clause: Spec 99 §B5 "useAuthStore.setState({ user: null, idToken: null, isLoading: false })"
- Diff: mobile/app/(app)/parcel-tool/index.tsx:54 "const accessToken = useAuthStore((s) => s.accessToken);"
- Lens claim: the pasted store contract names the token field `idToken` (also §B6 "const { idToken } = useAuthStore.getState();"), so a selector on `accessToken` gates the focus re-read on a field the pasted clauses do not attest; if the field is absent the entitlement is never re-read, cannot see mobile/src/store/authStore.ts to confirm
- Lens fix or rationale: select the field the store actually holds (`idToken`) or state where `accessToken` is defined.
- Opened: file:line opened: mobile/app/(app)/parcel-tool/index.tsx:54 the quoted code is there

### F-351 · mobile-99 (mobile-99-p2) · diff part mobile-1 · DEFER severity=MED
- Clause: Spec 99 §B5 "`queryClient.clear()` MUST fire as part of `clearLocalSessionState()`."
- Diff: mobile/app/(app)/parcel-tool/semi-question.tsx "storeLookup(id, result);"
- Lens claim: the answered lookup is written into the report's cache entry, and unless that write lands in the TanStack cache (queryClient.setQueryData on ['parcel-lookup', id]) the §B5 clear cannot purge it and a previous user's parcel page can rehydrate on a shared device; cannot see `useSetParcelLookup`
- Lens fix or rationale: confirm the setter writes through queryClient.
- Opened: file opened: mobile/app/(app)/parcel-tool/semi-question.tsx no line number was given; the quoted code is there (line 74)

### F-352 · mobile-99 (mobile-99-p2) · diff part mobile-1 · DEFER severity=MED
- Clause: prompt walk rule 4 "A change that adds behaviour no pasted clause or ruling names is a finding"
- Diff: mobile/app/(app)/parcel-tool/index.tsx:51 "// SRCH.A6 (task-320; RR-0307): the reports-left line reads the served count (GET /api/parcels/entitlement)"
- Lens claim: every governing clause the change cites (SRCH.A6, SRCH.C12, SRCH.SEMI, RR-0278, RR-0307, RR-0310, tasks 319/320/321/360/361/362) is not in the pasted context, and nothing in the pasted Spec 99 part 2 of 3 names the reports-left line, the help links, the pick hint, the semi restyle or the answered-Continue fetch, so their compliance is cannot see
- Lens fix or rationale: paste the cards and rulings for these surfaces before this diff can be judged clause by clause.
- Opened: file:line opened: mobile/app/(app)/parcel-tool/index.tsx:51 the quoted code is there

### F-356 · mobile-99 (mobile-99-p2) · diff part mobile-2 · DEFER severity=LOW
- Clause: §5.2 "Subscription status? `useUserProfile().data.subscription_status` (canonical)
- Diff: NEVER mirrored locally"
- Lens claim: mobile/src/lib/schemas.ts:@@ -439,3 +439,16 @@ "status: z.string().nullable(), ... reportsLimitReached: z.boolean().nullable(),"
- Lens fix or rationale: the diff threads a second device-side copy of plan state into parcelSearchMatch's SearchSituation, the struct that also carries route; today parcelSearchRoute does not read it, so no routing decision yet breaches §5.2 — keep entitlement out of every route derivation, or let the unpasted RR-0307 text declare this endpoint canonical for the reports-left line only
- Opened: no file:line in the field as returned: NEVER mirrored locally"

### F-357 · mobile-99 (mobile-99-p2) · diff part mobile-2 · DEFER severity=LOW
- Clause: §B4 "if (isUidChange) { void queryClient.invalidateQueries({ queryKey: ['user-profile'] }); }"
- Diff: mobile/src/hooks/useParcelLookup.ts:@@ -68,17 +76,65 @@ "queryKey: ['parcel-entitlement']"
- Lens claim: the new user-scoped key is not invalidated on a genuine UID change, only purged by the §B5 sign-out clear, so any uid change not preceded by the sign-out fan-out would show the previous account's count
- Lens fix or rationale: add ['parcel-entitlement'] to the B4 uid-change invalidation, or state in the unpasted clause that the B5 clear is sufficient
- Opened: file opened: mobile/src/hooks/useParcelLookup.ts no line number was given; the quoted code is there (line 134)

### F-358 · mobile-99 (mobile-99-p2) · diff part mobile-2 · DEFER severity=LOW
- Clause: prompt rule "A clause satisfied only by a comment, a TODO or a test name is UNMET"
- Diff: mobile/src/lib/lotForm.ts:@@ -5,7 +5,8 @@ "it travels as a route param (OVERRIDE_PARAM) to the report, which does not apply it yet: nothing outside this file reads the param or calls `lotFormEffective`"
- Lens claim: this hunk changes only a comment and now records that the P5.7 application is unimplemented; P5.7 and the "semi all y" / "semi ask a" rulings are not pasted, cannot see whether any pasted clause requires the override to take effect
- Lens fix or rationale: paste P5.7 before this file's assertion is treated as compliant
- Opened: file opened: mobile/src/lib/lotForm.ts no line number was given; the quoted code is there (line 8)

### F-359 · mobile-99 (mobile-99-p2) · diff part mobile-tests-1 · DEFER severity=MED
- Clause: §8.3 "Each render gate condition (per §6.5) MUST have a test asserting that toggling `isFetching` does NOT flip the gate. Pattern: render the layout twice (once with isFetching=true, once with =false)
- Diff: both must produce the same JSX."
- Lens claim: mobile/__tests__/reportScreen.mount.behaviour.test.tsx:28 "type Hook = { data: unknown; isError: boolean; refetch: jest.Mock };" (and the new case "mockHook = { data: unsureHit(null), isError: false, refetch: jest.fn() };", which never carries isFetching)
- Lens fix or rationale: the new held-report render gate (unsure lot, page null, unanswered renders LIFE.loading instead of the miss text) has no isFetching-toggle stability test, and this mock type cannot even express one — add a case rendering the same unsure/page-null data with isFetching true and again with false and assert byte-identical render output (and the same for the unsure/page-VIEW answered case)
- Opened: no file:line in the field as returned: both must produce the same JSX."

### F-360 · mobile-99 (mobile-99-p2) · diff part mobile-tests-1 · DEFER severity=LOW
- Clause: clause NONE in the pasted context names it
- Diff: mobile/__tests__/maxbldHelp.test.ts:4 "task-362 SRCH.LOTMAP-2 (AC1, AC5; small-pages-v8 search.html:235 "in-app browser sheet (B10): Help, Terms, Privacy open the web page with Done")"
- Lens claim: the switch of openHelp from Linking.openURL to expo-web-browser openBrowserAsync is justified only by the diff's own comment; AC1/AC5 and small-pages-v8 search.html/choose-lot.html are not pasted, so compliance cannot be verified
- Lens fix or rationale: paste the card text and the small-pages-v8 lines, or mark the change as not-yet-governed
- Opened: file:line opened: mobile/__tests__/maxbldHelp.test.ts:4 the quoted code is there

### F-361 · mobile-99 (mobile-99-p2) · diff part mobile-tests-1 · DEFER severity=LOW
- Clause: clause NONE in the pasted context names it
- Diff: mobile/__tests__/parcelScreens.golden.test.ts:242 "Dated note 2026-11-19 (RR-0313, MORNING-DECISIONS.md:1216, operator verbatim: "c. can't we put in the search box. Enter a Toronto address"; task-356)"
- Lens claim: the placeholder copy is changed from a previously ruled verbatim string ("Enter lot address") to a new one on the strength of a ruling that appears only inside the diff; no pasted operator ruling supersedes the old wording
- Lens fix or rationale: paste RR-0313 and RR-0314 verbatim so the replacement and the retained outside-Toronto notice are checkable
- Opened: file:line opened: mobile/__tests__/parcelScreens.golden.test.ts:242 the quoted code is there

### F-362 · mobile-99 (mobile-99-p2) · diff part mobile-tests-1 · DEFER severity=LOW
- Clause: clause NONE in the pasted context names it
- Diff: mobile/__tests__/semiQuestionPage.behaviour.test.tsx:29 "// SRCH.SEMI stage 2 (task-319): Continue stores the answered lookup in the report's cache entry (through useSetParcelLookup since task-353; same key and value)"
- Lens claim: the diff adds behaviour no pasted clause describes: Continue now calls fetchParcelLookup then writes the report's query cache entry, plus a busy accessibilityState and a bounded-wait error state (semi-question.html:130 is cited only in the diff); SRCH.SEMI-3 and SRCH.METER-2 are not pasted, so none of it is checkable against a governing clause
- Lens fix or rationale: paste those card items or record the change as outside the pasted spec
- Opened: file:line opened: mobile/__tests__/semiQuestionPage.behaviour.test.tsx:29 the quoted code is there

### F-363 · mobile-99 (mobile-99-p2) · diff part mobile-tests-1 · DEFER severity=LOW
- Clause: §6.5 "Adding a new permitted carve-out requires extending this enumeration in the same commit; reviewers MUST reject any unenumerated carve-out."
- Diff: NONE (app/(app)/parcel-tool/[parcelId].tsx is not in this diff part, so the held-report gate's inputs cannot be seen)
- Lens claim: if that gate reads isFetching or fetchStatus rather than settled data plus the `semi` route param, it is an unenumerated isFetching carve-out that must be rejected; the test name "on the settled render" leaves this open
- Lens fix or rationale: include the gate's condition in a later diff part, or state in the test that the gate reads data and route param only
- Opened: no code line cited (NONE (app/(app)/parcel-tool/[parcelId].tsx is not in this di)

### F-367 · mobile-99 (mobile-99-p3) · diff part mobile-1 · DEFER severity=MED
- Clause: no pasted clause (the diff cites SRCH.C12, B.7, C.11, C.12, choose-lot.html:278-279; none is pasted) "SRCH.C12 / B.7: the v8 link to Help & Support, prefilled with the typed query (the existing action open_help)"
- Diff: mobile/src/components/surfaces/LotMapBinding.tsx "return [unlinkedNotice(), helpLink('address_match'), ...mapView(s)];"
- Lens claim: which states carry a help link, which content key each uses (both topics pass content('help.address.link')), and the new pick hint and help row cannot be checked against the approved design text
- Lens fix or rationale: paste the v8 choose-lot design text and SRCH.C12 before merge.
- Opened: file opened: mobile/src/components/surfaces/LotMapBinding.tsx no line number was given; the quoted code is there (line 240)

### F-368 · mobile-99 (mobile-99-p3) · diff part mobile-1 · DEFER severity=LOW
- Clause: no pasted clause (the diff cites plan v3 §2.2 via the in-file comment; that section is not pasted) "The closed icon table (plan v3 §2.2)."
- Diff: mobile/src/components/surfaces/SurfaceRenderer.tsx "export const ICONS = { Search, MapPin, AlertTriangle, RefreshCw, Lock, Ban, User, Check, ArrowRight, X, ChevronLeft, Info };"
- Lens claim: adding ChevronLeft and Info extends a table the code itself calls closed; the authority to extend it is not in the pasted context
- Lens fix or rationale: paste plan v3 §2.2, or confirm the table's amendment rule.
- Opened: file opened: mobile/src/components/surfaces/SurfaceRenderer.tsx no line number was given; the quoted code is there (line 31)

### F-369 · mobile-99 (mobile-99-p3) · diff part mobile-2 · DEFER severity=MED
- Clause: pasted context (none)
- Diff: mobile/src/hooks/useParcelLookup.ts "// SRCH.A6 (task-320; RR-0307): the caller's plan and this month's report count"
- Lens claim: every clause this diff claims to satisfy (RR-0278, RR-0307, SRCH.SEMI, SRCH.A6, SRCH.METER-2, SRCH.LOTMAP-2, MF-93, tasks 319/320/353/360/361/362) is cited only in comments and none is pasted, so those clauses are cannot-see and unverifiable
- Lens fix or rationale: paste those operator rulings and SRCH clauses before relying on this PASS.
- Opened: file opened: mobile/src/hooks/useParcelLookup.ts no line number was given; the quoted code is not there (not found in the file at 3a36e8b26)

### F-370 · mobile-99 (mobile-99-p3) · diff part mobile-2 · DEFER severity=MED
- Clause: walk rule "A change that adds behaviour no pasted clause or ruling names is a finding (nothing added that the card or ruling did not name)"
- Diff: mobile/src/lib/maxbldHelp.ts "import * as WebBrowser from 'expo-web-browser';"
- Lens claim: the switch away from "it leaves the app for the browser (Linking.openURL, a leave-the-origin move)" is named only by task-362 SRCH.LOTMAP-2 and small-pages-v8 search.html:235, neither pasted
- Lens fix or rationale: paste SRCH.LOTMAP-2 / small-pages-v8 to close this clause.
- Opened: file opened: mobile/src/lib/maxbldHelp.ts no line number was given; the quoted code is there (line 10)

### F-371 · mobile-99 (mobile-99-p3) · diff part mobile-2 · DEFER severity=LOW
- Clause: §8.6 "A pre-commit script `mobile/scripts/check-spec99-matrix.mjs` MUST parse the Zod object keys from `mobile/src/lib/userProfile.schema.ts` and the §3.1 markdown table, asserting setEqual"
- Diff: mobile/src/lib/schemas.ts "export const ParcelToolEntitlementSchema = z.object({"
- Lens claim: the new server-contract parser lands in a file the only drift check the spec names does not parse, so no CI guard ties its keys to any contract table
- Lens fix or rationale: extend the drift-check glob or add a sibling check for the entitlement contract.
- Opened: file opened: mobile/src/lib/schemas.ts no line number was given; the quoted code is there (line 445)

### F-372 · mobile-99 (mobile-99-p3) · diff part mobile-tests-1 · DEFER severity=LOW
- Clause: pasted-context boundary
- Diff: cannot see
- Lens claim: mobile/__tests__/lotMapPage.behaviour.test.tsx "task-362 AC2 (choose-lot.html:278 …)"
- Lens fix or rationale: the governing cards/rulings cited in the diff (task-362, task-360, task-356, task-361, task-319, RR-0313, RR-0278) are not pasted, so the changed behaviour cannot be judged against them, only against Spec 99 — paste those ACs and RR entries at invocation to make them judgeable
- Opened: no file:line in the field as returned: cannot see

### F-373 · mobile-core (mobile-core) · diff part mobile-1 · DEFER severity=MED
- Clause: domain-admin Rule 1 "every async call must be `await`-ed or chained with `.catch()`"
- Diff: mobile/app/(app)/parcel-tool/index.tsx:56 "if (accessToken) void refetchEntitlement({ cancelRefetch: false });" and mobile/app/(app)/parcel-tool/semi-question.tsx "push: (route: string) => void continueToReport(route)"
- Lens claim: both new calls use the `void` operator, which neither awaits nor catches, so a rejection is unhandled; `continueToReport`'s "storeLookup(id, result)" and "router.replace(route)" sit outside its try, so that promise can reject
- Lens fix or rationale: append ".catch(() => undefined)" or make the handlers async and await them.
- Opened: file:line opened: mobile/app/(app)/parcel-tool/index.tsx:56 the quoted code is not there (not found in the file at 3a36e8b26)

### F-374 · mobile-core (mobile-core) · diff part mobile-1 · DEFER severity=MED
- Clause: Spec 90 §13 "Every JSON response fetched via TanStack Query MUST be parsed through a Zod schema before hitting the UI"
- Diff: mobile/app/(app)/parcel-tool/index.tsx:78 "entitlement: entitlement ? { reportsLeft: entitlement.reportsLeft, reportsLimit: entitlement.reportsLimit, resetsOnDisplay: entitlement.resetsOnDisplay } : null,"
- Lens claim: the new entitlement response now reaches the props tree, but its parse lives in `useParcelEntitlement`, whose file is not in this diff part, so the parse cannot be seen
- Lens fix or rationale: paste `mobile/src/hooks/useParcelLookup.ts` or the schema in review before merge.
- Opened: file:line opened: mobile/app/(app)/parcel-tool/index.tsx:78 the quoted code is there

### F-375 · mobile-core (mobile-core) · diff part mobile-1 · DEFER severity=MED
- Clause: Spec 90 §5 "Always use TanStack Query."
- Diff: mobile/app/(app)/parcel-tool/semi-question.tsx:61 "result = await boundedWait(fetchParcelLookup({ parcelId: id, semi: 'answered' }), SEMI_CONTINUE_WAIT_MS);"
- Lens claim: the answered lookup is issued as a direct fetcher call and hand-written into the cache with `storeLookup` while the report mounts a query on the same key, so the fetch is outside the query layer the clause names
- Lens fix or rationale: cite the sanctioned cache-set pattern (Spec 99 not pasted) or run it through the query's own fetch.
- Opened: file:line opened: mobile/app/(app)/parcel-tool/semi-question.tsx:61 the quoted code is there

### F-376 · mobile-core (mobile-core) · diff part mobile-1 · DEFER severity=LOW
- Clause: Spec 90 §9 "Touch targets for all interactive elements MUST be a minimum of `44px` by `44px`."
- Diff: mobile/src/constants/lotMap.ts:66 "helpLink: S.report,"
- Lens claim: the new help link (an interactive Button, accessibilityRole 'link') takes the search page's link classes, whose min-height is not in this diff, so 44 by 44 cannot be confirmed
- Lens fix or rationale: give it a key with "min-h-[44px] min-w-[44px]" as `semiBack` does.
- Opened: file:line opened: mobile/src/constants/lotMap.ts:66 the quoted code is there

### F-377 · mobile-core (mobile-core) · diff part mobile-1 · DEFER severity=LOW
- Clause: Spec 90 §2 "NativeWind `dark:` variants are required for all UI components."
- Diff: mobile/src/constants/lotMap.ts:48 "semiHeading: 'mt-6 w-full text-lg font-bold leading-6 text-report-ink',"
- Lens claim: `semiHeading`, `semiCardText`, `semiDot`, `pickHint`, `helpPrompt`, `helpRow` and `parcelSearch.ts` "allowance" carry no `dark:` twin, while `semiCard` in the same commit carries `dark:bg-report-card`
- Lens fix or rationale: add dark twins or record that the report tokens themselves flip.
- Opened: file:line opened: mobile/src/constants/lotMap.ts:48 the quoted code is there

### F-379 · mobile-core (mobile-core) · diff part mobile-2 · DEFER severity=MED
- Clause: .claude/domain-admin.md Required Tooling Stack "No new dependency without a Spec 33 amendment naming it."
- Diff: mobile/src/lib/maxbldHelp.ts "import * as WebBrowser from 'expo-web-browser';"
- Lens claim: expo-web-browser is not in the pasted Spec 90 §4 stack and no pasted amendment names it; package.json and useSubscribeCheckout.ts cannot see, so whether it is a new dependency is unverifiable
- Lens fix or rationale: paste the amendment or confirm the existing declaration.
- Opened: file opened: mobile/src/lib/maxbldHelp.ts no line number was given; the quoted code is there (line 10)

### F-380 · mobile-core (mobile-core) · diff part mobile-2 · DEFER severity=MED
- Clause: Spec 90 §7 "All Zustand stores, MMKV blobs, TanStack Query keys, and cross-layer bridges MUST conform to Spec 99"
- Diff: mobile/src/hooks/useParcelLookup.ts "queryKey: ['parcel-entitlement']," and "queryKey: ['parcel-lookup', parcelId],"
- Lens claim: a new key is added and the lookup key now serves two different requests (with and without semi=answered, the second counted server-side) plus a setQueryData write; Spec 99 §3-§5 is not pasted, so conformance is unverifiable
- Lens fix or rationale: paste Spec 99 §3-§5 or record the pattern match for both keys.
- Opened: file opened: mobile/src/hooks/useParcelLookup.ts no line number was given; the quoted code is there (line 134)

### F-381 · mobile-core (mobile-core) · diff part mobile-2 · DEFER severity=MED
- Clause: Spec 98 §4 "`useParcelLookup.test.ts`: `fetchParcelLookup` Zod-parses the whitelist envelope ... `shouldRetryParcelLookup` skips 400/403/429/drift."
- Diff: NONE (no test file in the pasted diff)
- Lens claim: parcelLookupParams, fetchParcelEntitlement, reportsLeftShown and boundedWait arrive with no visible test change against the mandated hook test
- Lens fix or rationale: add the tests or paste the test part of the diff.
- Opened: no code line cited (NONE (no test file in the pasted diff))

### F-382 · mobile-core (mobile-core) · diff part mobile-2 · DEFER severity=MED
- Clause: pasted clauses name no behaviour for the new surfaces, only code comments do "SRCH.A6 (task-320; RR-0307, MORNING-DECISIONS.md:1182)"
- Diff: mobile/src/lib/parcelSearchCore.ts "export function reportsLeftShown(e: EntitlementLine | null | undefined): e is ShownEntitlement"
- Lens claim: the reports-left line, the semi=answered flag and SEMI_CONTINUE_WAIT_MS = 60_000 rest on RR-0307, RR-0278, RR-0310 and SRCH.SEMI-3, none pasted, so those additions cannot be checked against any governing clause
- Lens fix or rationale: paste those rulings or drop the additions from this change.
- Opened: file opened: mobile/src/lib/parcelSearchCore.ts no line number was given; the quoted code is there (line 78)

### F-383 · mobile-core (mobile-core) · diff part mobile-2 · DEFER severity=LOW
- Clause: Spec 98 §4 "`shouldRetryParcelLookup` skips 400/403/429/drift."
- Diff: mobile/src/hooks/useParcelLookup.ts "No retry on 401/403/429 or drift (the line is simply absent)"
- Lens claim: the new comment promises a 401 exclusion the pasted pin of the guard does not state, and the guard body cannot see
- Lens fix or rationale: drop 401 from the comment or paste shouldRetryParcelLookup so the claim is checked.
- Opened: file opened: mobile/src/hooks/useParcelLookup.ts no line number was given; the quoted code is not there (not found in the file at 3a36e8b26)

### F-384 · mobile-core (mobile-core) · diff part mobile-tests-1 · DEFER severity=MED
- Clause: no pasted clause names the new placeholder copy (RR-0313 is cited in the diff, not pasted)
- Diff: "// Dated note 2026-11-19 (RR-0313, MORNING-DECISIONS.md:1216, operator verbatim: c. can't we put in the search box. Enter a Toronto address; task-356)"
- Lens claim: mobile/__tests__/parcelScreens.golden.test.ts:243 "expect(SEARCH_SLICE.content['search.input.placeholder']).toBe('Enter a Toronto address');"
- Lens fix or rationale: the user-visible string rests on an unpasted ruling so its verbatim wording cannot be checked — paste RR-0313 or confirm the exact string before merge.
- Opened: file:line opened: MORNING-DECISIONS.md does not exist at 3a36e8b26 (cannot open)

### F-385 · mobile-core (mobile-core) · diff part mobile-tests-1 · DEFER severity=MED
- Clause: pasted context contains no clause authorising these behaviours
- Diff: "// task-362 SRCH.LOTMAP-2 (AC1, AC5; small-pages-v8 search.html:235 in-app browser sheet (B10)...)"
- Lens claim: mobile/__tests__/maxbldHelp.test.ts:6 "// task-362 SRCH.LOTMAP-2 (AC1, AC5; small-pages-v8 search.html:235 ..."
- Lens fix or rationale: the diff pins in-app-browser help, the pick hint, busy Continue, the semi cache write and the held report screen whose cards/rulings (task-362, SRCH.SEMI-3, SRCH.METER-2, RR-0278) are cited but not pasted, so compliance cannot be confirmed — paste those cards/rulings or confirm they are in force.
- Opened: no file:line in the field as returned: "// task-362 SRCH.LOTMAP-2 (AC1, AC5; small-pages-v8 search.html:235 i

### F-386 · mobile-core (mobile-core) · diff part mobile-tests-1 · DEFER severity=LOW
- Clause: Spec 90 §4 "You must strictly adhere to the following stack" (expo-web-browser is not in the pasted list) plus domain-admin "No new dependency without a Spec 33 amendment naming it"
- Diff: mobile/__tests__/maxbldHelp.test.ts:9 "import * as WebBrowser from 'expo-web-browser';"
- Lens claim: cannot see mobile/package.json to tell whether expo-web-browser is an existing dependency or a new one needing an amendment
- Lens fix or rationale: confirm it is already declared before merge.
- Opened: file:line opened: mobile/__tests__/maxbldHelp.test.ts:9 the quoted code is there

### F-390 · mobile-core (mobile-core) · diff part surface-1 · DEFER severity=MED
- Clause: Spec 90 §13 "Every JSON response fetched via TanStack Query MUST be parsed through a Zod schema before hitting the UI"
- Diff: scripts/surfaces/_schema/census/contracts.json:22971 "resetsOnDisplay"
- Lens claim: a new field is added to the entitlement response whitelist and no file in the diff touches mobile/src/lib/schemas.ts or mobile/src/hooks/useParcelLookup.ts, so the parse that must accept it cannot be seen
- Lens fix or rationale: add the schema or hook change to the diff.
- Opened: file:line opened: scripts/surfaces/_schema/census/contracts.json:22971 the quoted code is there

### F-391 · mobile-core (mobile-core) · diff part surface-1 · DEFER severity=MED
- Clause: contracts.json:22892 "its response is an explicit `.strict()` whitelist of six fields" against the same entry now listing "resetsOnDisplay" beside "resetsOn"
- Diff: the descriptor's own cardinality statement is left at six while a seventh key is added
- Lens claim: update the count or keep the whitelist at six.
- Opened: no file:line in the field as returned: the descriptor's own cardinality statement is left at six while a seve

### F-392 · mobile-core (mobile-core) · diff part surface-1 · DEFER severity=MED
- Clause: bindings ref_kinds clause "a golden value {"contract": "<contract_id>.<field>"} names a field of a CONTRACT descriptor's inputs.field_whitelist"
- Diff: scripts/surfaces/_schema/census/mobile-product.json:7887 {"name": "hit", "golden": "reports_left"}
- Lens claim: a golden is named and "/api/parcels/entitlement" added to contract_ref, but no golden file and no contract-ref value appear in the diff, so the reset-date binding to resetsOnDisplay is asserted nowhere visible
- Lens fix or rationale: add the reports_left golden carrying {"contract": "...resetsOnDisplay"}.
- Opened: file:line opened: scripts/surfaces/_schema/census/mobile-product.json:7887 the quoted code is there

### F-393 · mobile-core (mobile-core) · diff part surface-1 · DEFER severity=LOW
- Clause: scripts/surfaces/_schema/seed-report-v2.mjs:600 "'not_evaluated:not_in_engine_population': 'Not yet evaluated', // MB-94 (c), Spec 126 11a.3 dated note 2026-11-12 (R-2 literal)"
- Diff: the clause the literal claims to satisfy is not pasted, so the literal cannot be checked here
- Lens claim: paste the Spec 126 11a.3 note when this line is reviewed.
- Opened: no file:line in the field as returned: the clause the literal claims to satisfy is not pasted, so the literal

### F-396 · mobile-core (mobile-core) · diff part surface-2 · DEFER severity=MED
- Clause: no pasted ruling names the reports-left line
- Diff: src/components/surfaces/web/SearchBinding.tsx "SRCH.A6 (task-320; RR-0307; v8 search.html:320): the mobile line, the same refs"
- Lens claim: the line, the added `/api/parcels/entitlement` contract_ref and the new `hit`/`reports_left` golden all rest on RR-0307 and task-320, neither pasted here
- Lens fix or rationale: rationale: bounded to one conditional Text node and one contract ref, but the authority for it is not in the context I may judge against.
- Opened: file opened: src/components/surfaces/web/SearchBinding.tsx no line number was given; the quoted code is there (line 146)

### F-397 · mobile-core (mobile-core) · diff part surface-2 · DEFER severity=MED
- Clause: pasted operator ruling "approved except for 9 - the report should still show with the google street view photo if its not available - just the photo space should not show" (Spec 98 §4 dated note)
- Diff: scripts/surfaces/parcel_product/F06/surfaces/web_landing.sample.json:1996 "\"scripts/surfaces/_schema/report-presentation.json\": \"e151b5ccd11cd137\""
- Lens claim: the presentation schema the sample was re-hashed against is not in the diff, so whether the photo-space behaviour this ruling governs survived it cannot be seen
- Lens fix or rationale: rationale: the hash bump proves the schema changed; the change itself is invisible in the reviewed material.
- Opened: file:line opened: scripts/surfaces/parcel_product/F06/surfaces/web_landing.sample.json:1996 the quoted code is not there (not found in the file at 3a36e8b26)

### F-398 · mobile-core (mobile-core) · diff part surface-2 · DEFER severity=MED
- Clause: StaticBinding now hard-requires footer text the pasted sample diff does not supply
- Diff: src/components/surfaces/web/StaticBinding.tsx "return <ReportPage key={k} view={reportOf(p.view, 'sample', ctx.report)} footer={footerOf2(ctx.report)} />" with "report.footer ?? fail('no footer text (the server leaves this part out)')"
- Lens claim: every landing sample now throws without a `footer` value, and the only landing-sample line pasted changes the schema hash
- Lens fix or rationale: rationale: the sample's runtime content is not in the diff and no pasted clause names this requirement.
- Opened: file opened: src/components/surfaces/web/StaticBinding.tsx no line number was given; the quoted code is not there (not found in the file at 3a36e8b26)

### F-399 · mobile-core (mobile-core) · diff part surface-2 · DEFER severity=LOW
- Clause: an operator-adjudicated deviation record is extended without a new adjudication
- Diff: scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.descriptor.json deviation why "The reset date of the reports-left line (SRCH.A6) is not a derived name ... and it binds as a contract value." while "adjudicated_by": "operator 2026-11-09 ... \"approved except for 9 ...\"" and "date": "2026-11-10" stay unchanged
- Lens claim: rationale: the record now carries a claim the 2026-11-09 wording does not contain; a later dated entry would keep the record auditable.
- Opened: no file:line in the field as returned: scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.desc

### F-400 · mobile-core (mobile-core) · diff part surface-2 · DEFER severity=LOW
- Clause: Spec 90 §10 "Unit Testing (Jest): Jest + React Native Testing Library for logic hooks. Minimum 80% coverage threshold."
- Diff: the diff adds new mobile/web logic `reportsLeftShown`, `pickFooterText`, `footerNode` and no test file appears in the diff
- Lens claim: rationale: the new golden `{ "name": "hit", "golden": "reports_left" }` implies a harness I cannot see, so coverage of the new functions is unverifiable from the pasted material.
- Opened: no file:line in the field as returned: the diff adds new mobile/web logic `reportsLeftShown`, `pickFooterText

### F-401 · queue (queue) · diff part scripts-1 · DEFER severity=MED
- Clause: Rule 3 "When work lands for a row, the commit that lands it edits that row's status line."
- Diff: diff file list "files: scripts/analysis/backlog-lane.mjs, scripts/analysis/proof-slice.mjs, scripts/analysis/proof-slices.json, scripts/analysis/src-sql-ledger.mjs, scripts/deepseek-review.js" together with backlog-lane.mjs:136 "// task-358 (REVIEW.LENSES)" and proof-slice.mjs:6 "// task-68 PROOF.TOOL, stage 2 (minimum)"
- Lens claim: this DIFF PART lands work for task-358, task-68 and task-266 yet carries no backlog task file, and I cannot see whether a later part of 9f04d9074..3a36e8b26 edits the three rows
- Lens fix or rationale: confirm all three status lines are edited inside the same commit range before merge.
- Opened: file:line opened: scripts/analysis/backlog-lane.mjs:136 the quoted code is not there (not found in the file at 3a36e8b26)

### F-402 · queue (queue) · diff part scripts-1 · DEFER severity=LOW
- Clause: Rule 4 "A ruling is kept as a verbatim dated note on its row, in the M-246 form: `Dated note <date> (M-246, prior text kept; <row> · <queue> · lane X; operator, verbatim: "<words>")`."
- Diff: scripts/analysis/src-sql-ledger.mjs:111 "'src/lib/parcels/report-compute.ts', // LOAD.1 (task-266, dated note 2026-11-19): the batch statement text is built by the Layer 3 step's own core"
- Lens claim: the entry calls its rationale a "dated note" while using no M-246 form and quoting no operator words, so a reader cannot tell whether a ruling sits on task-266's row
- Lens fix or rationale: rename it in the comment to engineering rationale, or write the M-246 dated note on task-266's status line and have the comment point at it.
- Opened: file:line opened: scripts/analysis/src-sql-ledger.mjs:111 the quoted code is there

### F-403 · queue (queue) · diff part scripts-1 · DEFER severity=LOW
- Clause: Rule 3 "This goes into every lane brief and the commit checklist."
- Diff: scripts/analysis/backlog-lane.mjs:160 "extra: [ticket, `Review (review mode, from the worktree): ... plan-review-deepseek.md`, lensLine(t, ctxRel)],"
- Lens claim: the lane brief gains a review lens line while this hunk adds no same-commit status-line sentence, and the unchanged part of the file cannot be seen here
- Lens fix or rationale: add the Rule 3 sentence to `spec.extra` if it is not already present.
- Opened: file:line opened: scripts/analysis/backlog-lane.mjs:160 the quoted code is not there (not found in the file at 3a36e8b26)

### F-404 · queue (queue) · diff part scripts-1 · DEFER severity=LOW
- Clause: no pasted clause names review lenses (walk step 4)
- Diff: backlog-lane.mjs:136 "// task-358 (REVIEW.LENSES): the review line names the Spec 08 lens set (08_agents.md:334 "NEVER run one generic pass"; section 7 rules 4, 7)"
- Lens claim: the authority quoted for the new lens line and for `--template` in scripts/deepseek-review.js is Spec 08 section 7 and .claude/review-templates/README.md, neither pasted, so the added behaviour cannot be checked against a pasted clause
- Lens fix or rationale: paste Spec 08 section 7 and the README lens table into the next context block.
- Opened: file:line opened: scripts/analysis/backlog-lane.mjs:136 the quoted code is there

### F-408 · spec08 (spec08) · diff part scripts-1 · DEFER severity=LOW
- Clause: Spec 08 §7 rule 6 "Findings triage (WF6): BUG → WF3 before Green Light; DEFER → `review_followups.md` with reasons."
- Diff: scripts/analysis/backlog-lane.mjs:145 "triage every finding as round 2 (one grounder, KEEP or REJECT with the opened file:line, TRIAGE.md)"
- Lens claim: the added triage instruction has two outcomes and one destination; a deferred non-bug finding has no named home
- Lens fix or rationale: state the DEFER branch and its review_followups.md destination in the same line.
- Opened: file:line opened: scripts/analysis/backlog-lane.mjs:145 the quoted code is there

### F-409 · spec08 (spec08) · diff part scripts-1 · DEFER severity=NIT
- Clause: Spec 08 §7 rule 10 dated note (C2) "a rule is cited by its id and anchor first, with the line number as a hint dated by the commit sha (form: `R-KG (124a; :1015 at <sha>)`)"
- Diff: scripts/analysis/backlog-lane.mjs:135 "the review line names the Spec 08 lens set (08_agents.md:334 \"NEVER run one generic pass\"; section 7 rules 4, 7)"
- Lens claim: the anchor is right but the line number carries no commit-sha date, so the hint cannot be checked against the tree
- Lens fix or rationale: write the cite as "Spec 08 §7 rule 4 (:334 at <sha>)".
- Opened: file:line opened: scripts/analysis/backlog-lane.mjs:135 the quoted code is not there (not found in the file at 3a36e8b26)

### F-416 · step (step-p1) · diff part load1-2 · DEFER severity=MED
- Clause: core.10 "its compute lock builds that ctx through the real dispatch, stubbing only DB and network answers"
- Diff: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts:133 "const env = MZ.makeEnv({ body: INPUT.body, map: MAP, scope: SCOPE, vocab: VOCAB, zoneList, versions: { table_version: INPUT.table_version, evaluator_version: INPUT.evaluator_version } });"
- Lens claim: the diff exists so "the customer compute test builds the same batch rows", but that customer compute test is not in the pasted diff, so whether its ctx comes from the real dispatch or from this hand-built `makeEnv`/fixture rows cannot be seen
- Lens fix or rationale: show the new consumer's ctx build (dispatch-derived) before merge
- Opened: file:line opened: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts:133 the quoted code is there

### F-417 · step (step-p1) · diff part load1-2 · DEFER severity=LOW
- Clause: core.8 "Every number a step, gate, admin surface or tool uses is a registered logic variable or an exact zero"
- Diff: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts:150 "shared_len_m: 10, est: a.est"
- Lens claim: a fixed 10 m shared frontage and synthetic ids (900000+i, 800000+i) are now shared with a second test rather than living in one fixture reader
- Lens fix or rationale: acceptable as fixture data, but name it once in the harness so both consumers cannot drift
- Opened: file:line opened: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts:150 the quoted code is there

### F-424 · step (step-p1) · diff part route-1 · DEFER severity=LOW
- Clause: not pasted (SRCH.A6/RR-0310, MF-91/SRCH.FOOTER, SRCH.SEMI/MF-93, SRCH.METER-2) "cannot see"
- Diff: src/app/api/parcels/lookup/route.ts "SRCH.METER-2 (task-360, 2026-11-19): that unsure lot's `page` is not sent either"
- Lens claim: the entitlement resetsOnDisplay, footer and semi-hold behaviours have no governing clause in the pasted context, so their compliance cannot be judged
- Lens fix or rationale: fix: paste those rulings into the context for the next pass.
- Opened: file opened: src/app/api/parcels/lookup/route.ts no line number was given; the quoted code is there (line 18)

### F-426 · step (step-p1) · diff part route-2 · DEFER severity=MED
- Clause: core.15 "Every frozen enum value and every `execution.*` declaration has a disposition in its registry: executed (with a named executor or check), descriptive, or retired."
- Diff: src/lib/report-projection/format.ts:55 "export const TEXT_RULES = ['yes_no', 'confidence'] as const;"
- Lens claim: a new closed vocabulary is fixed in TS code (with `PAGE_RULES` at format.ts:15 and `CONFIDENCE_ORDER` at :58) and its only authority is a code comment citing "operator 2026-11-13", which is not pasted; no registry row or disposition names who executes or describes these values
- Lens fix or rationale: declare the text rules in the committed page/decl schema and derive the const, and give each value a disposition.
- Opened: file:line opened: src/lib/report-projection/format.ts:55 the quoted code is there

### F-427 · step (step-p1) · diff part route-2 · DEFER severity=MED
- Clause: walk 4 "A change that adds behaviour no pasted clause or ruling names is a finding (nothing added that the card or ruling did not name)."
- Diff: src/lib/surfaces/maxbld-landing.ts:147 "const report: StaticReport = { sample: view, footer: pickFooterText(SEARCH_CONTENT), ...(demo ? { demo } : {}), ...(picture ? { picture } : {}) };"
- Lens claim: this hunk adds a landing-page footer behaviour, and the pasted context is entirely step-standard rules that name neither it nor any ruling it cites
- Lens fix or rationale: split it out with its governing ruling or register id, or drop it from this diff.
- Opened: file:line opened: src/lib/surfaces/maxbld-landing.ts:147 the quoted code is there

### F-428 · step (step-p1) · diff part route-2 · DEFER severity=LOW
- Clause: plan D2 (not pasted)
- Diff: src/lib/parcels/report-page.ts:46 "case 'not_stored': // D2"
- Lens claim: the branch deciding what a customer sees for a lot with no stored record rests on "plan D2", which is not in the pasted context, so that branch cannot be checked clause by clause; cannot see D2
- Lens fix or rationale: paste plan D2 or its register row id so the serve-or-miss rule has a cited authority.
- Opened: file:line opened: src/lib/parcels/report-page.ts:46 the quoted code is there

### F-431 · step (step-p1) · diff part scripts-1 · DEFER severity=MED
- Clause: core.14 "Declared equals witnessed. Acquisition reads go in `inputs.reads`... Fast invariant #44 traces what the step really runs and fails any gap"
- Diff: scripts/analysis/proof-slices.json:11 "\"proof\": \"Hooks plus full suite on the current tip (reads the push station pass file; never runs the suite)...\"" met by scripts/analysis/proof-slice.mjs:89-90 "if (field('RESULT') === 'PASS') return { ...base, status: 'PASS' };"
- Lens claim: the row's declared witness (hooks plus the full suite, and the four named `suite_files`) is narrower than the file: only `sha:` and `RESULT:` are read, so a pass file that never ran the named files still yields PASS
- Lens fix or rationale: require the pass file to name the suite files (or the hook rows) and fail closed when they are absent
- Opened: file:line opened: scripts/analysis/proof-slices.json:11 the quoted code is not there (not found in the file at 3a36e8b26)

### F-432 · step (step-p1) · diff part scripts-1 · DEFER severity=LOW
- Clause: x-validate.1 "One command grades a step: `node scripts/analysis/step-validate.mjs --step=<slug>`... it runs in the hooks, never as a separate track"
- Diff: scripts/analysis/proof-slice.mjs:12 "Caller: the PROOF.S lane (task-268) runs it as its acceptance command; no hook, station step or CI job calls it."
- Lens claim: a second grading command that emits PASS/FAIL/NOT BUILT/GAP rows is introduced outside the one command and outside the hooks
- Lens fix or rationale: justify in the tool header why these slice rows are not step-validate's job, or have the lane print it through step-validate's output instead
- Opened: file:line opened: scripts/analysis/proof-slice.mjs:12 the quoted code is there

### F-434 · step (step-p2) · diff part load1-1 · DEFER severity=MED
- Clause: x-rulings.4 "`--check` at pre-commit fails on an uncovered decision or a citation of an unknown one"
- Diff: src/lib/parcels/report-compute.ts "+// LOAD.1 (task-266, Increment 1·B; operator "2. y", MORNING-DECISIONS.md:1061, RR-0271, and "task 341 approved", :1160)"
- Lens claim: the diff cites RR-0271 and RR-0278 (route.ts "SRCH.METER-2 (task-360, 2026-11-19)") but ships no decision log or register row and I cannot see either id resolve
- Lens fix or rationale: cite the existing register rows in the header, or add the decisions log in the same commit.
- Opened: file:line opened: MORNING-DECISIONS.md does not exist at 3a36e8b26 (cannot open)

### F-435 · step (step-p2) · diff part load1-1 · DEFER severity=MED
- Clause: SRCH.SEMI stage 2 (task-319, MF-93) "the semi page's Continue fetches again with `semi=answered`, which lifts that hold"
- Diff: src/app/api/parcels/lookup/route.ts "+    semi: sp.get('semi') ?? undefined,"
- Lens claim: ConsumerParcelLookupQuerySchema is not in this diff; a zod object strips keys it does not declare, so if `semi` is absent the flag is dropped before `const { q, parcelId, semi } = parsed.data;` and the hold can never lift, cannot see the schema
- Lens fix or rationale: declare `semi` in that schema here and lock it with the test above.
- Opened: file opened: src/app/api/parcels/lookup/route.ts no line number was given; the quoted code is there (line 90)

### F-436 · step (step-p2) · diff part load1-1 · DEFER severity=LOW
- Clause: x-verify.1 "The report lives at `docs/reports/verification/<branch>.md` and every integrate commit cites it"
- Diff: src/lib/parcels/report-compute.ts "+// Integrated with the board head (2026-11-19, merge ba7953933): the related run of the merge commit re-proves C1 to C9 on that head."
- Lens claim: the re-proving run is self-reported and no verification report path is cited, cannot see one
- Lens fix or rationale: cite the verification report before any integrate commit cites this file.
- Opened: file opened: src/lib/parcels/report-compute.ts no line number was given; the quoted code is there (line 17)

### F-437 · step (step-p2) · diff part load1-2 · DEFER severity=MED
- Clause: x-rulings.1 "Cited ids must resolve."
- Diff: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts:121 "/** LOAD.1 (task-266): moved here unchanged from runtime-loader.logic.test.ts so the customer compute test builds the same batch rows."
- Lens claim: the cited id LOAD.1 (task-266) does not appear anywhere in the pasted clauses, so the authority for this extraction cannot be resolved from what is pasted
- Lens fix or rationale: paste the LOAD.1 ruling or 124a register row (or replace the citation with the register id that names this move) so the id resolves.
- Opened: file:line opened: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts:121 the quoted code is there

### F-438 · step (step-p2) · diff part load1-2 · DEFER severity=MED
- Clause: x-rulings.2 "add a both-directions test and re-run the golden capture"
- Diff: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts:122 "const expected = readJsonl(`${G25}/expected.jsonl`);"
- Lens claim: the "unchanged" claim is contradicted: the removed hunk in runtime-loader.logic.test.ts begins at "const MZ = req(path.join(ROOT, 'scripts/lib/bylaw-materialize.js')) as Json;" and contains no expected.jsonl read, so the moved body is not the moved text and the caller now builds rows from a per-call read
- Lens fix or rationale: either make the move byte-identical or show the golden capture re-run plus the both-directions test for the shared helper.
- Opened: file:line opened: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts:122 the quoted code is there

### F-439 · step (step-p2) · diff part load1-2 · DEFER severity=MED
- Clause: x-rulings.2 "Route each learning to the most enforced artifact that can hold it."
- Diff: src/tests/steps/compute_maxbld_scenarios/runtime-loader.logic.test.ts:17 "import { goldenBatch } from './golden25-harness';"
- Lens claim: the diff adds a second consumer of the golden 25 batch shape (the customer compute test) with no pasted clause or ruling naming that consumer, so nothing pasted bounds what that consumer asserts
- Lens fix or rationale: name the ruling/card clause the customer compute test enforces before merge.
- Opened: file:line opened: src/tests/steps/compute_maxbld_scenarios/runtime-loader.logic.test.ts:17 the quoted code is there

### F-440 · step (step-p2) · diff part load1-2 · DEFER severity=LOW
- Clause: x-rulings.4 "`--check` at pre-commit fails on an uncovered decision or a citation of an unknown one."
- Diff: NONE
- Lens claim: no decision-log row or `<log stem>#<decision id>` citation appears in the pasted diff, and the "customer compute test" motivation reads like an operator ruling
- Lens fix or rationale: cannot see whether the branch adds the docs/reports/decisions row; if the move came from a ruling, cite it in the docstring or commit body.
- Opened: no code line cited (NONE)

### F-442 · step (step-p2) · diff part route-1 · DEFER severity=MED
- Clause: x-rulings.1 "Cited ids must resolve."
- Diff: src/app/api/parcels/lookup/types.ts:44 "SRCH.SEMI stage 2 (task-319, MF-93; RR-0278): the semi question page sets this on its Continue fetch, so an unsure lot counts like any lot once it is answered."
- Lens claim: RR-0278, RR-0271 and RR-0310 are cited across the diff but no register row for any of them is in the pasted context (cannot see), so resolution is unproven
- Lens fix or rationale: cite each register row id or attach the rows to the change.
- Opened: file:line opened: src/app/api/parcels/lookup/types.ts:44 the quoted code is there

### F-443 · step (step-p2) · diff part route-1 · DEFER severity=MED
- Clause: x-rulings.1 "the same commit adds the both-directions test and amends the spec"
- Diff: src/app/api/parcels/lookup/route.ts:18 "SRCH.METER-2 (task-360, 2026-11-19): that unsure lot's `page` is not sent either (null; neither the stored read nor the compute runs, meter semi_pending) until"
- Lens claim: the new contract (page withheld until semi=answered, the semi_pending hold lifted) has no test file among the 10 diff files and no spec amendment visible
- Lens fix or rationale: attach the both-directions test and the dated spec note to this diff.
- Opened: file:line opened: src/app/api/parcels/lookup/route.ts:18 the quoted code is there

### F-444 · step (step-p2) · diff part route-1 · DEFER severity=MED
- Clause: x-rulings.2 "add a both-directions test and re-run the golden capture"
- Diff: src/components/report/ReportPage.tsx:358 "        <ReportFooter s={s} footer={footer} />"
- Lens claim: every footer section now renders three links and a copyright through the shared tree while src/app/admin/report-preview/goldens.ts is not in the diff, so the golden re-run is not visible
- Lens fix or rationale: regenerate or re-run the preview goldens and show it.
- Opened: file:line opened: src/components/report/ReportPage.tsx:358 the quoted code is there

### F-445 · step (step-p2) · diff part route-1 · DEFER severity=MED
- Clause: x-rulings.1 "When no rung answers, use the protocol: one pass discovers and proposes (closed Intent Ledger vocabulary); a different party adjudicates, named and dated; the ruling gets a dated register row in Spec 124 §5"
- Diff: src/lib/parcels/report-compute.ts:11 "THE GATE is the existing web live switch ALONE, the first statement of the entry: decision D-1 (who sees numbers before launch, task-348) is not ruled,"
- Lens claim: the entry lands with its gating decision explicitly not ruled, and no adjudication or register row for D-1 is cited
- Lens fix or rationale: cite the interim ruling that permits landing behind the switch, or hold the file until D-1 is ruled.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:11 the quoted code is there

### F-450 · step (step-p2) · diff part route-2 · DEFER severity=MED
- Clause: x-verify.1 "The report lives at docs/reports/verification/<branch>.md and every integrate commit cites it"
- Diff: src/lib/parcels/report-page.ts:17 "(Integrated with the board head, merge ba7953933.)"
- Lens claim: an integration claim is made with no verification report citation in the diff and the report is not visible, cannot see docs/reports/verification/route-2.md
- Lens fix or rationale: fix: cite the verification report in the integrate commit or remove the integration claim from the module header.
- Opened: file:line opened: src/lib/parcels/report-page.ts:17 the quoted code is there

### F-451 · step (step-p2) · diff part route-2 · DEFER severity=MED
- Clause: Scope check, "A change that adds behaviour no pasted clause or ruling names is a finding"
- Diff: src/lib/surfaces/maxbld-landing.ts:147 "footer: pickFooterText(SEARCH_CONTENT)"
- Lens claim: a landing footer is injected by this diff; no pasted clause, ruling or the MB-44/MB-93 material names a landing footer, so this is an unadjudicated addition riding in the same change
- Lens fix or rationale: fix: split it out or paste the card that names it.
- Opened: file:line opened: src/lib/surfaces/maxbld-landing.ts:147 the quoted code is there

### F-452 · step (step-p2) · diff part scripts-1 · DEFER severity=MED
- Clause: x-rulings.2 "resolve at the first fitting rung (descriptor, declared check, logic variable, library change, shape rule, new schema field)"
- Diff: scripts/analysis/src-sql-ledger.mjs:111 "'src/lib/parcels/report-compute.ts', // LOAD.1 (task-266, dated note 2026-11-19): the batch statement text is built by the Layer 3 step's own core"
- Lens claim: a set the file itself describes as one that "may not grow (`grew:`)" grows by one entry, so the `grew:` signal is resolved by amending the baseline rather than at a named rung, and the diff carries no both-directions test for the new interpolation nor a re-run capture, while the header still prints 72 SQL-bearing files against 41 static + 30 interpolated + 2 not_postgres = 73
- Lens fix or rationale: state the rung that fits and why, add the both-directions test for report-compute's batch statement, and correct the header total to 73.
- Opened: file:line opened: scripts/analysis/src-sql-ledger.mjs:111 the quoted code is there

### F-453 · step (step-p2) · diff part scripts-1 · DEFER severity=MED
- Clause: x-rulings.4 "each set of rulings (a review-page export or a chat ruling with its quote, and any later amendment with its quote) is committed verbatim as `docs/reports/decisions/<date>-<slug>.json`"
- Diff: scripts/analysis/backlog-lane.mjs:136 "// task-358 (REVIEW.LENSES): the review line names the Spec 08 lens set (08_agents.md:334 \"NEVER run one generic pass\"; section 7 rules 4, 7), chosen by task type and the Files line."
- Lens claim: the lens-selection policy (task type, the Files regexes, the security keyword list) is a decision implemented in code, and the diff commits no decisions log entry or register-row citation for it, so if any part of this selection is an operator ruling it has been transferred by hand
- Lens fix or rationale: either commit the ruling verbatim under docs/reports/decisions and cite `<log stem>#<decision id>` in the comment, or mark the whole selection as Spec 08 text with a resolvable line.
- Opened: file:line opened: scripts/analysis/backlog-lane.mjs:136 the quoted code is not there (not found in the file at 3a36e8b26)

### F-454 · step (step-p2) · diff part scripts-1 · DEFER severity=LOW
- Clause: x-rulings.1 "Cited ids must resolve."
- Diff: scripts/analysis/proof-slice.mjs:42 "for (const k of Object.keys(r ?? {})) if (!KEYS.includes(k)) problems.push(`${at}: unknown key ${k}`);"
- Lens claim: checkSpec validates shape and key names only, it never resolves the ids the data file cites (scripts/analysis/proof-slices.json:12 "Design fit (RS-12): every stored value maps to a designed element (RR-0306: printed as not built)", plus S-gen, S-golden, S-parity, CHK.3, CHK.5, task-*), so "cited ids must resolve" is unenforced by the only validator this data passes through
- Lens fix or rationale: add a resolution step for the cited ids (register row, spec line or board task) to checkSpec or to the slice run and fail closed on an unresolvable id.
- Opened: file:line opened: scripts/analysis/proof-slice.mjs:42 the quoted code is there

### F-457 · storage (storage-p1) · diff part load1-1 · DEFER severity=MED
- Clause: P1 "runs once when a lot is first opened from the search page"
- Diff: src/app/api/parcels/lookup/route.ts:146 "const held = lotForm?.unsure === true && semi !== 'answered';" and :147 "let pageResponse = held ? null : await readCustomerPageResponse(parcelRef);"
- Lens claim: on the first open of an unsure lot neither the stored read nor the compute runs, so the clause's first-open compute is skipped for that class; the hold rests on SRCH.METER-2, which is not in the pasted context
- Lens fix or rationale: run the compute at first open and hold only the page, or paste the ruling that supersedes P1 for unsure lots.
- Opened: file:line opened: src/app/api/parcels/lookup/route.ts:146 the quoted code is not there (not found in the file at 3a36e8b26)

### F-458 · storage (storage-p1) · diff part load1-1 · DEFER severity=MED
- Clause: A-MF62 "waits for the numbers up to the set maximum (35,000 ms, raised from the seed's 30,000 by task LOAD.3, ...). Where the numbers are not ready at the maximum, the report opens with the "updating" state, never an old number"
- Diff: src/app/api/parcels/lookup/route.ts:150 "pageResponse = await computeCustomerPageResponse(parcelRef);"
- Lens claim: the compute is awaited in the request with no maximum and there is no "updating" path in the diff, so a compute past the maximum returns late instead of opening the named state
- Lens fix or rationale: bound the wait at the set maximum and emit the "updating" state (the existing lifecycle loading).
- Opened: file:line opened: src/app/api/parcels/lookup/route.ts:150 the quoted code is there

### F-460 · storage (storage-p1) · diff part load1-2 · DEFER severity=MED
- Clause: A-MF62 "the loading screen starts the one-lot compute at the search pick, waits for the numbers up to the set maximum (35,000 ms, raised from the seed's 30,000 by task LOAD.3 ...)"
- Diff: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts "+export function goldenBatch(): { rows: Json[]; raw: Json } {"
- Lens claim: this part is labelled LOAD.1 (task-266) but contains only a fixture helper, no search-pick compute start, no 35,000 ms maximum and no skip for a re-opened lot, so it cannot carry A-MF62
- Lens fix or rationale: keep LOAD.1 open and paste the part that holds the gate plus the seed max change before claiming LOAD.1 closes.
- Opened: file opened: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts no line number was given; the quoted code is there (line 123)

### F-461 · storage (storage-p1) · diff part load1-2 · DEFER severity=MED
- Clause: A-MB38 "The L3b sweep opens N sampled lots through the real path and asserts: a record with the current stamp exists, a second open reads an equal record (content_sha), and a record with an older stamp is recomputed."
- Diff: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts "+  const out = MZ.materializeBatch(parcels, env);"
- Lens claim: the helper rebuilds batch rows by calling makeEnv and materializeBatch directly instead of opening a lot through the search pick, so it can never show the stamp guard or the equal second read
- Lens fix or rationale: label the helper as fixture parity only and keep the real-path L3b sweep as the A-MB38 proof.
- Opened: file opened: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts no line number was given; the quoted code is there (line 56)

### F-462 · storage (storage-p1) · diff part load1-2 · DEFER severity=LOW
- Clause: doc-16 section 5 "S Search | nothing; the search hit starts the compute" read with the new comment "so the customer compute test builds the same batch rows"
- Diff: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts "moved here unchanged from runtime-loader.logic.test.ts" against "+  const expected = readJsonl(`${G25}/expected.jsonl`);"
- Lens claim: the function is not unchanged, the source version resolved `expected` from module scope and the harness now reads the file inside the helper, so the parity claim rests on an unstated assumption
- Lens fix or rationale: say in the comment that `expected` is now read in the helper and that the module value it replaced came from this same file.
- Opened: file opened: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts no line number was given; the quoted code is not there (not found in the file at 3a36e8b26)

### F-465 · storage (storage-p1) · diff part route-1 · DEFER severity=MED
- Clause: P1 "the pure core (buildParcelRows, the whole report, all options in scope, main page and See details)"
- Diff: src/lib/parcels/report-compute.ts:7 "computes THAT lot's rows in memory with the Layer 3 step's OWN pure core (materializeRows and buildSourceSql, the exports the pipeline step runs)"
- Lens claim: the clause names buildParcelRows and the whole report plus See details, the diff names different exports and their equivalence to P1's core rests only on its own comment, so the clause is UNMET on the text shown
- Lens fix or rationale: paste a test or ruling showing materializeRows yields P1's core output, or call the core P1 names.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:7 the quoted code is not there (not found in the file at 3a36e8b26)

### F-466 · storage (storage-p1) · diff part route-1 · DEFER severity=MED
- Clause: P1 "runs once when a lot is first opened from the search page, behind the loading screen"
- Diff: src/lib/parcels/report-compute.ts:19 "if (!MAXBLD_WEB_LIVE) return null;"
- Lens claim: no pasted clause or ruling names a live-switch gate on the first-open compute, and while the switch is off the first open runs no compute and the route serves page null with meter not_produced
- Lens fix or rationale: paste the switch's governing ruling or gate nothing here.
- Opened: file:line opened: src/lib/parcels/report-compute.ts:19 the quoted code is not there; it is at line 75

### F-467 · storage (storage-p1) · diff part route-1 · DEFER severity=MED
- Clause: P1 "Compute on first open ... runs once when a lot is first opened from the search page"
- Diff: src/app/api/parcels/lookup/route.ts:147 "const held = lotForm?.unsure === true && semi !== 'answered';"
- Lens claim: the SRCH.METER-2 hold sends no page and runs no compute on an unsure lot's first open, behaviour no pasted clause or ruling names
- Lens fix or rationale: paste the task-360 / RR-0278 ruling in the context, or hold only the display and still run the P1 compute on the open.
- Opened: file:line opened: src/app/api/parcels/lookup/route.ts:147 the quoted code is there

### F-468 · storage (storage-p1) · diff part route-1 · DEFER severity=LOW
- Clause: not pasted (SRCH.FOOTER, the report footer)
- Diff: src/components/report/ReportPage.tsx:405 "export function ReportPage({ view, footer }: { view: PageView; footer: FooterText }): ReactElement {"
- Lens claim: the MF-91 footer rewiring and the now-required footer prop belong to a card whose ruling (MORNING-DECISIONS.md:1066) is not in the pasted context, so its clauses cannot be judged and none of it touches the storage policy
- Lens fix or rationale: split it out or paste the SRCH.FOOTER card and ruling.
- Opened: file:line opened: src/components/report/ReportPage.tsx:405 the quoted code is there

### F-469 · storage (storage-p1) · diff part route-1 · DEFER severity=LOW
- Clause: not pasted (SRCH.A6 / RR-0310, the reset label)
- Diff: src/app/api/parcels/entitlement/types.ts:18 "resetsOnDisplay: z.string().nullable(), // the same instant as the Toronto date"
- Lens claim: the new wire field and the formatDateDmyFixed helper are governed by RR-0310, which is not pasted, so their compliance is unjudgeable here
- Lens fix or rationale: paste RR-0310 or land the label with its own clause.
- Opened: file:line opened: src/app/api/parcels/entitlement/types.ts:18 the quoted code is there

### F-471 · storage (storage-p1) · diff part route-2 · DEFER severity=MED
- Clause: doc-16 section 4 "Stale-stamp guard | Compare the stamp on every read; mismatch means recompute"
- Diff: src/lib/report-projection/project.ts "if (stamp?.lot_gate) return { ...base, verdict: 'gated', gate: stamp.lot_gate };" with src/lib/parcels/report-page.ts "case 'gated': return stored.response"
- Lens claim: a gated lot returns before any stamp comparison and its stored page is served regardless of stamp, so the stamp is not compared on every read
- Lens fix or rationale: run the stamp comparison first and only suppress engine values for a gated lot, never skip the guard.
- Opened: file opened: src/lib/report-projection/project.ts no line number was given; the quoted code is not there (not found in the file at 3a36e8b26)

### F-472 · storage (storage-p1) · diff part route-2 · DEFER severity=MED
- Clause: P9 "Cost is NOT in the record (computed at each open by lineCost)" and A-S88 "worked out at each open and joined by (parcel, option)"
- Diff: src/lib/parcels/report-page.ts "return pageForVerdict(stored);"
- Lens claim: the customer producer serves the stored page with no lineCost join on the record's size at read, so any cost bound to this page is absent
- Lens fix or rationale: join lineCost at read here (parcel, option) before returning the page.
- Opened: file opened: src/lib/parcels/report-page.ts no line number was given; the quoted code is there (line 62)

### F-473 · storage (storage-p1) · diff part route-2 · DEFER severity=MED
- Clause: doc-16 section 1 line 3 "The result is saved with its stamp ... for that user and for everyone else who opens the lot later" and A-LAT "opening the report (main page and See details) from a stored record"
- Diff: src/lib/parcels/report-page.ts "if (!MAXBLD_WEB_LIVE) return null;"
- Lens claim: while the live switch is off no saved record is ever read, so the stored result serves nobody and the 1 s stored-read path never runs; no pasted clause names this switch
- Lens fix or rationale: name the pasted clause or ruling that lifts the switch and its date, or make the switch gate only the tester feed.
- Opened: file opened: src/lib/parcels/report-page.ts no line number was given; the quoted code is there (line 57)

### F-474 · storage (storage-p1) · diff part route-2 · DEFER severity=MED
- Clause: P6 "ONE record per (parcel, option) (unique key (parcel, option); the stamp is a column, a recompute replaces the row)"
- Diff: src/lib/report-projection/read-stored.ts "FROM parcel_maxbld_scenarios WHERE parcel_id = $1 ORDER BY building_type, field_id" and project.ts "stored.find((r) => r.building_type === bt && r.field_id === field)"
- Lens claim: the shared read is keyed per (building_type, field_id) rows, not the policy's (parcel, option) record, so when the P6 record lands this read answers nothing and every lot falls to not_evaluated
- Lens fix or rationale: read the (parcel, option) record and its stored values, keeping the per-field form only for the bounded cohorts.
- Opened: file opened: src/lib/report-projection/read-stored.ts no line number was given; the quoted code is not there (not found in the file at 3a36e8b26)

### F-475 · storage (storage-p1) · diff part route-2 · DEFER severity=LOW
- Clause: P3 stamp list does not name a catalogue or switchboard sha
- Diff: src/lib/report-projection/project.ts "if (rows.some((r) => r.switchboard_sha !== current.switchboard_sha)) moved.push('switchboard');"
- Lens claim: the guard adds two stamp components no pasted clause names, which turns records stale on any seed change
- Lens fix or rationale: cite the pasted clause that names them or drop them from the customer verdict.
- Opened: file opened: src/lib/report-projection/project.ts no line number was given; the quoted code is there (line 182)

### F-476 · storage (storage-p1) · diff part route-2 · DEFER severity=LOW
- Clause: no pasted clause names a landing footer
- Diff: src/lib/surfaces/maxbld-landing.ts "const report: StaticReport = { sample: view, footer: pickFooterText(SEARCH_CONTENT), ...(demo ? { demo } : {})"
- Lens claim: behaviour unrelated to the storage policy enters the reviewed diff with its governing card not pasted
- Lens fix or rationale: cannot see the clause that authorises it; show it or split it out of this route.
- Opened: file opened: src/lib/surfaces/maxbld-landing.ts no line number was given; the quoted code is there (line 147)

### F-477 · storage (storage-p2) · diff part load1-1 · DEFER severity=MED
- Clause: doc-16 §6.13 "See details loads with the main page"
- Diff: src/lib/parcels/report-compute.ts "if (!MAXBLD_WEB_LIVE) return null;"
- Lens claim: while the switch is off a missed lot still returns page null, so the clause holds only post-switch
- Lens fix or rationale: dark-code-at-landing is deliberate until D-1/task-348 is ruled, bounded blast radius.
- Opened: file opened: src/lib/parcels/report-compute.ts no line number was given; the quoted code is there (line 75)

### F-478 · storage (storage-p2) · diff part load1-1 · DEFER severity=MED
- Clause: doc-16 §7.2 "confirm that p95 <= 1 s also applies to an owner-input recompute once 5.11 is measured"
- Diff: src/app/api/parcels/lookup/route.ts "the compute can take many seconds"
- Lens claim: the change serves an unbounded multi-second compute synchronously at the pick, and the only pasted latency text is an unconfirmed open point
- Lens fix or rationale: §7.2 is an open point about owner-input recompute, not a ruling, so it cannot be judged met or unmet here.
- Opened: file opened: src/app/api/parcels/lookup/route.ts no line number was given; the quoted code is there (line 144)

### F-479 · storage (storage-p2) · diff part load1-1 · DEFER severity=LOW
- Clause: doc-16 §7.3 "Cost: confirm cost is computed at each open from the record's size (not stored)"
- Diff: src/lib/parcels/report-compute.ts "// Nothing is written (the record write is ST.P1, task-265)."
- Lens claim: cost and stored-size handling are absent from this compute-only diff and the clause is an unconfirmed open point
- Lens fix or rationale: out of scope for a landing whose write is a separate task, no pasted ruling to measure against.
- Opened: file opened: src/lib/parcels/report-compute.ts no line number was given; the quoted code is not there (not found in the file at 3a36e8b26)

### F-480 · storage (storage-p2) · diff part load1-2 · DEFER severity=MED
- Clause: McStorage policy v2 rule list (P1 to P7, A-ST5, A-ST6, A-ST3, A-FE39, A-MB38, A-MB75, A-MB76, A-S88 are named but not pasted) "Rules in the whole list: 12 (counted by pattern /^\| P\d+ \|/) · this is part 2 of 2"
- Diff: NONE
- Lens claim: the rules that would bind the batch and headline path sit in part 1 of 2, so compliance of this diff against them is cannot see
- Lens fix or rationale: paste part 1 of 2 and the A-ST ruling texts with the diff.
- Opened: no code line cited (NONE)

### F-481 · storage (storage-p2) · diff part load1-2 · DEFER severity=LOW
- Clause: no pasted clause names task-266 or LOAD.1
- Diff: "LOAD.1 (task-266): moved here unchanged from runtime-loader.logic.test.ts so the customer compute test builds the same batch rows."
- Lens claim: src/tests/steps/compute_maxbld_scenarios/golden25-harness.ts:122
- Lens fix or rationale: the card authorizing the extraction is not pasted, so its clauses are cannot see — paste the LOAD.1 card text.
- Opened: no file:line in the field as returned: "LOAD.1 (task-266): moved here unchanged from runtime-loader.logic.tes

### F-482 · storage (storage-p2) · diff part route-1 · DEFER severity=MED
- Clause: McStorage policy v2 §6.1 "ST-5 \"For all lots (MB-38), Layer 3 persists one headline record per (parcel, option)\" (~/Buildo-scratch/mcbylaws/McSTORAGE-RULINGS.md:130) and \"computed on demand\" (:131): superseded by P1 to P7 / A-ST5"
- Diff: src/lib/parcels/report-compute.ts "the lookup route calls this entry, which computes THAT lot's rows in memory"
- Lens claim: the change adds a read-time on-demand compute, the model this pasted line marks superseded, and the replacing text (P1 to P7, A-ST5) is not pasted, so compliance cannot be shown
- Lens fix or rationale: paste P1 to P7 and A-ST5 and cite the clause that permits an in-memory compute at the pick, or keep the lookup on the stored read only
- Opened: file opened: src/lib/parcels/report-compute.ts no line number was given; the quoted code is not there (not found in the file at 3a36e8b26)

### F-483 · storage (storage-p2) · diff part route-1 · DEFER severity=MED
- Clause: McStorage policy v2 §7.2 "Waits with no screen: confirm that p95 <= 1 s also applies to an owner-input recompute once 5.11 is measured (\"updating\" until then)"
- Diff: src/app/api/parcels/lookup/route.ts "the compute can take many seconds" and "computeMs = Date.now() - c0;"
- Lens claim: the change places a compute that can take many seconds on the lookup read path with no wait screen and no "updating" state, which is the wait the operator has not yet ruled on
- Lens fix or rationale: paste the ruling that covers this wait, or land the compute behind the "updating" state named in the open point
- Opened: file opened: src/app/api/parcels/lookup/route.ts no line number was given; the quoted code is there (line 144)

### F-484 · storage (storage-p2) · diff part route-1 · DEFER severity=MED
- Clause: McStorage policy v2 §6.7 "Spec 88 / M-67 \"Spec 88 prices the STORED Layer 3 scenario areas\" (origin:scripts/lib/parcel-cost.js:385): amended by A-S88 for the opened lot"
- Diff: src/lib/parcels/report-compute.ts "return pageForVerdict(stored);"
- Lens claim: the served page for the opened lot is priced from rows that were never stored, and A-S88's amended text is not pasted, so the pricing clause cannot be checked against this path
- Lens fix or rationale: paste A-S88 and quote the clause that prices a computed, unstored opened lot
- Opened: file opened: src/lib/parcels/report-compute.ts no line number was given; the quoted code is there (line 104)

### F-485 · storage (storage-p2) · diff part route-1 · DEFER severity=LOW
- Clause: McStorage policy v2 §7.4 "Confirm A-ST5b, the bounded addition to ST-5's cohort clause: until MB-38, a tester's owner-entered rows are kept in the 309 form for that lot (about 304 KiB a lot, ESTIMATE)"
- Diff: src/lib/parcels/report-compute.ts "const out = materializeRows([row], { config, lookups });"
- Lens claim: on a stored-read miss the page is built only from the step's batch row, so a tester's owner-entered rows kept in the 309 form are not part of the served page and the change neither reads them nor names A-ST5b
- Lens fix or rationale: paste A-ST5b and either read the 309 form in the compute or keep owner-entered lots on the stored path
- Opened: file opened: src/lib/parcels/report-compute.ts no line number was given; the quoted code is there (line 96)

### F-486 · storage (storage-p2) · diff part route-1 · DEFER severity=LOW
- Clause: McStorage policy v2 §7 "Open points for the operator (only what the record cannot answer; see SITTING.md)"
- Diff: src/lib/parcels/report-compute.ts "decision D-1 (who sees numbers before launch, task-348) is not ruled"
- Lens claim: the change ships a gate choice whose ruling the file itself records as open, settling an operator question by comment rather than by ruling
- Lens fix or rationale: add the D-1 ruling to the pasted context, or show the clause that authorises the web live switch as the only gate
- Opened: file opened: src/lib/parcels/report-compute.ts no line number was given; the quoted code is there (line 11)

### F-488 · storage (storage-p2) · diff part route-2 · DEFER severity=MED
- Clause: doc-16 section 6.12 "~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:694 (client timer reading) and MF-51 plan.v2 line 58: amended or superseded as in section 3" (the only MORNING-DECISIONS line pasted)
- Diff: src/lib/parcels/report-page.ts:10 "MORNING-DECISIONS.md:789, and "task 341 approved", :1160"
- Lens claim: the authority the change rests on is not in the pasted context, cannot see whether :789 or :1160 says what the comment claims
- Lens fix or rationale: paste those two operator lines before the switch-on is relied on
- Opened: file:line opened: src/lib/parcels/report-page.ts:10 the quoted code is there

### F-489 · storage (storage-p2) · diff part route-2 · DEFER severity=MED
- Clause: doc-16 section 6.1 "superseded by P1 to P7 / A-ST5"
- Diff: src/lib/report-projection/read-stored.ts:45 "FROM parcel_maxbld_scenarios WHERE parcel_id = $1 ORDER BY building_type, field_id"
- Lens claim: the operative rules P1 to P12 and A-ST5 are counted in this list ("this is part 2 of 2", 12 rules by /^\| P\d+ \|/) but none is pasted, so the read the customer page now shares cannot be checked against them
- Lens fix or rationale: paste P1 to P7 and A-ST5
- Opened: file:line opened: src/lib/report-projection/read-stored.ts:45 the quoted code is not there; it is at line 34

### F-490 · storage (storage-p2) · diff part route-2 · DEFER severity=LOW
- Clause: doc-16 section 7.1 "Name the ceiling (lots or MiB) and approve purging untracked, un-owned records not opened for N days"
- Diff: src/lib/report-projection/read-stored.ts:70 "const rows = present ? (await db.query<StoredRow>(ROWS_SQL, [id])).rows : null;"
- Lens claim: the open point asks for a named ceiling and purge before these records are consumed citywide, and this diff adds that consumer with neither named, cannot see any
- Lens fix or rationale: record the ceiling and purge ruling (or the PIN-bounded exposure) next to the switch
- Opened: file:line opened: src/lib/report-projection/read-stored.ts:70 the quoted code is not there; it is at line 66

### F-491 · storage (storage-p2) · diff part route-2 · DEFER severity=LOW
- Clause: doc-16 section 7.4 "Confirm A-ST5b, the bounded addition to ST-5's cohort clause: until MB-38, a tester's owner-entered rows are kept in the 309 form for that lot"
- Diff: src/lib/parcels/report-page.ts:48 "case 'not_stored': // D2"
- Lens claim: an unconfirmed point, so a tester lot whose owner rows live in the 309 form today falls to a miss and a compute, and the ruling that would decide it is not pasted and not confirmed
- Lens fix or rationale: confirm A-ST5b before MB-94 part (f) lands behind its switch
- Opened: file:line opened: src/lib/parcels/report-page.ts:48 the quoted code is there

