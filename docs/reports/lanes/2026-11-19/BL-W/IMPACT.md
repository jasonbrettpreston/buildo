# IMPACT.md: BL-W, task-123, measured on worktree head 35ecc0dda (branch wf1/inc1b-w)
Method: run every file-only --check script at the head (baseline) and grep what a share-out plus a new SQL reader would touch. "Predicted" = derived from a grep or generator reading, not from running the change (stage 1 writes no product code). No test runner called.

## 1. Baseline --check results (all run in ~/Buildo-wt-w, no DB)
| Command | Result on head |
|---|---|
| node scripts/analysis/src-sql-ledger.mjs --check | "src-sql-ledger: fresh, 92 file(s) (61 static, 29 interpolated, 2 not_postgres), closed set holds, every column is in the catalog (uncatalogued, skipped: mv_monthly_permit_stats, parcel_lot_view)" |
| node scripts/analysis/gates/consumer-registry.mjs --check | "scripts/steps/_schema/consumer-registry.json is fresh" |
| node scripts/violations/generate-surface-registry.mjs --check | "[surface-registry] clean, no drift (171 rows, 171 descriptors)" |
| node scripts/analysis/report-schema.mjs --check | "report-schema current; RS-0 PASS ... RS-11 PASS" |
| node scripts/analysis/report-fields.mjs --check | "report-fields current (1 rendered fields); gates FAIL (report-only): RF-2, RF-4, RF-6, RF-7, RF-9" (report-only, already failing on the head, not moved by W) |
| node scripts/analysis/gates/generated-docs.mjs --check | "PASS, 13 live doc(s)" |
| node scripts/generate-system-map.mjs --check | "Generated docs/specs/00-architecture/00_system_map.md, 120 specs" (worktree stayed clean afterwards: git status shows only the untracked review dir and mobile/node_modules) |
| node scripts/analysis/decision-log.mjs --check | "clean, 137 log(s), 860 decision(s)" |
| node scripts/analysis/spec-split-check.mjs --check | "clean, 11482 citations checked, 0 dangling" |
The pre-commit hook runs these and more (.husky/pre-commit lines 17-48); stage 2 commits must leave all green.

## 2. Tests and locks that will move (each with the command that showed it)
Command A: git grep -n "report-preview-live" -- src scripts mobile .cursor docs/specs  (file counts: src/tests/admin-report-preview-live.logic.test.ts 7, src/tests/surfaces/report-honest-k2b.logic.test.ts 3, src/tests/surfaces/engine-inputs-bind.logic.test.ts 1, src/tests/parcels-lookup-page.logic.test.ts 1, src/tests/src-sql-ledger.logic.test.ts 1, scripts/steps/_schema/consumer-registry.json 13, scripts/steps/_schema/src-sql-ledger.json 1, scripts/surfaces/_schema/seed-report-v2.mjs 1, scripts/seeds/logic_variables.json 1, prereg-MB-93-1.json 1 (comment), .cursor/MCBYLAWS-QUEUE.md 3, .cursor/MCFRONTEND-QUEUE.md 2, seven specs 1 each)
Command B: git grep -n "readCustomerPageResponse\|lib/parcels/report-page" -- src scripts mobile
| Item | Why it moves | Kind |
|---|---|---|
| src/tests/admin-report-preview-live.logic.test.ts (imports :21-24, DIR, "outside the four directories" :132-139, L1 :433-458) | three files move to the neutral directory; imports change; the L1 fence gains a neutral-directory case; "format.ts imports nothing" re-pointed | test, edited |
| src/tests/surfaces/report-honest-k2b.logic.test.ts :10-12, src/tests/surfaces/engine-inputs-bind.logic.test.ts :14 | import path only | test, path edit (both under src/tests/surfaces/: a McFrontend frontend glob) |
| src/tests/parcels-lookup-page.logic.test.ts :186-191 | pin "report-page.ts imports no `@/lib/db/`" must change to "only the pool from `@/lib/db/client`, never the admin dir"; red both ways | pin, reversed on purpose |
| src/tests/parcel-lookup-gate.infra.test.ts :45-58, :134, :292-359 | mocks readCustomerPageResponse; stays green; add the miss case | test, unchanged or one case added |
| src/tests/maxbld-web-pages.logic.test.ts :154 (pin MAXBLD_WEB_LIVE false), :111-119 (R2 tripwire) | NOT moved if D3 is "at launch" (recommended) | pin kept |
| src/tests/src-sql-ledger.logic.test.ts :336-345 (uncatalogued list) | expected unchanged: parcel_maxbld_scenarios is catalogued since MB-35 (comment :341-342); bylaw_resolution_lot_stamps: grep -c bylaw_resolution_lot_stamps docs/reports/witness/_catalog.json returns 1, so it is catalogued: expected unchanged | pin, check |
| NEW src/tests/customer-report-read.logic.test.ts | T1-T9 in PLAN.md section 4 | new test |
| src/tests/surfaces/report-no-maths.logic.test.ts | its four scanned DIRS must not include the new directory (the admin test checks the same, :132-139) | lock, re-verified |

## 3. Generated files that will move (predicted from the generator's own sources)
| File | Generator | Why |
|---|---|---|
| scripts/steps/_schema/src-sql-ledger.json | src-sql-ledger.mjs --write | one SQL-bearing file moves (stored read) and one is edited (report-page.ts imports pool; its SQL, if any, is in the shared read) |
| scripts/steps/_schema/consumer-registry.json | gates/consumer-registry.mjs | its 13 rows with consumer src/lib/admin/report-preview-live/stored-page.ts (grep above) re-point to the shared read file; no new rows for report-page.ts (it holds no SQL, by design) |
| docs/specs/01-pipeline/55,59,61,62,65,67,78 consumer lines (e.g. 55_source_parcels.md:112, 78_optimal_lot_configuration.md:1602) | the spec generators run by the hook | the consumer path text changes |
| scripts/surfaces/parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json:6 data_story ("reads 7 tables") | hand edit; then generate-surface-registry --write | the route reads two more tables through W (parcel_maxbld_scenarios, bylaw_resolution_lot_stamps); frontend glob (scripts/surfaces/**) |
| docs/reports/generated/127-surface-registry.md:1002, scripts/surfaces/_schema/census/contracts.json:22003 | generate-surface-registry | same sentence |
| docs/specs/00-architecture/00_system_map.md | generate-system-map | file list per spec (line 117, spec 100 row) |
| report goldens (src/tests/fixtures/report-page/**), report-presentation.json | none expected | W adds no field or status word; the recut already moved them (40cbd77b1) |
Command C: node scripts/analysis/src-sql-ledger.mjs --check and gates/consumer-registry.mjs --check after the stage 2 change will say which of the above really moved (stage 2 re-measures; this list is not the measure).

## 4. Switches, descriptors, contracts, migrations
- Switches: MAXBLD_WEB_LIVE (src/lib/surfaces/maxbld-web.ts:19) read, not changed; pinned false at maxbld-web-pages.logic.test.ts:154. No logic_variables row added (the admin row maxbld_internal_preview_enabled, scripts/seeds/logic_variables.json:10737, is not reused: D1).
- Contract: GET /api/parcels/lookup response shape unchanged (`page` already nullable, types.ts:142); descriptor text only. Contract tests: src/tests/parcel-lookup-gate.infra.test.ts, parcels-lookup-page.logic.test.ts.
- Migrations: none. Migration 309 (parcel_maxbld_scenarios) and the stamp table exist; the record table is ST.P1's (L.6 task-259).
- Operator DB job: none. Seeds: none.

## 5. The expected moves for the prereg (stage 2 commit 1)
moves: 3 files renamed; 1 file new (read-stored); 1 lib file changed (report-page.ts); 1 admin file changed (stored-page.ts); tests as section 2; generated files as section 3; no value in any golden changes; no by-law reading changes (no literal, no zone name: M-61).

## 6. Gates and ids (summary; detail in PLAN.md section 5)
- .husky/pre-commit: mcbylaws gate (--staged), partial-staging refusal, every --check above, typecheck, lint, the related-tests run on staged src/scripts files. mcbylaws/protected-paths.json `frontend` globs (scripts/surfaces/**, src/lib/surfaces/**, src/tests/surfaces/**, src/app/(maxbld)/**) trigger arms H, C, P: stage 2 touches scripts/surfaces/** (descriptor, registry/census) and src/tests/surfaces/** (two import paths): an MF panel record and an MF id are owed. The `layer23` globs (the maxbld lib scripts and the scenario compute step) are not touched.
- ID ledger (~/Buildo-scratch/ids lists D-54..D-61 on its first lines; nothing claimed by this lane): owed at stage 2 start by the orchestrator: one prereg round number, one MF id if arm P needs it, no migration number, no M or FE number unless D2 adds a dated note to Spec 126 R-2 (an M-246 note, not a new number: UNVERIFIED).
- Queue rows: MB-44 (.cursor/MCBYLAWS-QUEUE.md:777-778) status line replaced in the same commit as the work; its expiry is 2026-11-19.
- Records: prereg owed (none exists for task-123); plan review = r1-plan.txt + TRIAGE.md (this stage); OUTPUT review owed; the G1 context pack exists.
- Spec 100 section 3.2 (the `page` text "null for every lot until MB-44", docs/specs/03-mobile/100_mobile_parcel_cost_tool.md:119,134) takes a dated M-246 note; check-spec-diff hook applies.

## 7. Searches behind the Q9 conclusion (rule 9)
grep -n "Q9" ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md : no hit. grep -n "D04" same file : no hit. grep -n "Q9" ~/Buildo-scratch/lanes-20261117/gap-register/REGISTER.md : no hit (the register uses D04); SITTING.md:105-112 holds Q9 with the recommendation, no answer. git grep -n "\bQ9\b" -- backlog docs/reports/plan-import : the task title, current.json:1393, and unrelated hits (matrix-verified.json "SQL Q9" is a SQL query label; the raw queue copy has CL-Q9/Q10 AGC, a different row).
