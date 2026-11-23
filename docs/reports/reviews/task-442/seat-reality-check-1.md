# Seat: reality-check: task-442 plan (PLAN-442-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

Basis: board head 086e6bcc6 (the plan read 18cc2752e; `git diff --stat 18cc2752e..HEAD` on the two test files, scripts/surfaces/_schema and src/lib/report-projection is empty, so every cite below is still the plan's tree). Read: the task card and plan; read-stored.ts whole; project.ts :1-25, :98-135, :195-210; seed-report-v2.mjs :55-95; compute-maxbld-scen*.js :178-216 and maxbld/rows.js :395-515 (the engine's write rule); layer3-catalogue.json, switchboard.json, building-types.json, logic_variables.json :1-14; report-page.json, report-presentation.json, report-v2.decl.json; the admin test :1-125 and :150-240; the customer-read test whole; report-binding.logic.test.ts; report-generator-fields.logic.test.ts; mobile_parcel_detail.descriptor.json; src/app/api/parcels/lookup/types.ts :76-100; 136 lines 46, 58, 85, 112, 149, 151; 135 line 67; RULE-CHECKS.md group 1 and 3; task-367, task-434, task-441 cards. Re-ran by small read-only node scripts: the dry run and the content-key count.

Checked and TRUE:
- The seven-link chain exists as written, links 1, 2, 4, 5 hold their cites: report-page.logic.test.ts:45 P1; report-schema.mjs:148 RS-1; .husky/pre-commit:23 src-sql-ledger --check (the ledger entry for read-stored.ts is per file, no line numbers: scripts/steps/_schema/src-sql-ledger.json:3059); consumer-registry.mjs:22-25 gate 5, with `parcels.is_corner_lot` rows owned by read-stored.ts (consumer-registry.json:6375-6378).
- Link 3: the only check is the load-time throw. Message "MB-93: page field source parcels:<c> is not in the static parcels read" is as the plan quotes. The message text occurs in src/ only in read-stored.ts (grep of src/tests and scripts: 0 other hits except the unrelated read-stored import pins at parcels-lookup-page.logic.test.ts:193 and customer-report-compute.logic.test.ts:225). So T2 is not a duplicate.
- pageBindings(page, fields) takes injected copies: project.ts:100 (docblock :98-99). The producer reads a row by (building_type, field_id): project.ts:199. pageOptions takes the scenario before "/": project.ts:131-133.
- Dry run re-run: 33 catalogue-bound parts in 3 option sections, 17 distinct (section, field) pairs (o1: 5, o2: 5, o3: 7), 0 misses against type membership plus the generator's switch rule. Holds.
- Content keys: report-presentation.json `page` at :281 has 90 keys, all strings. Exactly 4 hold a digit, at :322 `row.unit_size_basis_value` ("the basement; 10 % circulation"), :336 `legal.line` ("not 100% accurate"), :342 and :344 the two placeholders ("e.g. 50", "e.g. 120"). Holds. report-page.json:1580 is `"content": "row.unit_size_basis_value"` for part role `size.row.value` of o3. Holds.
- logic_variables.json:2 `houseplex_circulation_share`, default 0.1, min 0.1, max 0.1. Holds. layer3-catalogue.json:197 declares it as a setting row; lv(houseplex_circulation_share) is read by basement_livable_m2 :264, units_flat :266, units_pitched_a/b :267-268, unit_area_m2 :271, units_fit :277 and three renovation rows :335-337.
- Effective-ON: seed-report-v2.mjs:70 `typesOf` and :82 `typeOn` are the two lines the plan means. Holds.
- Section 4 item 1 (live break) is real as stated: the typed "10 %" sits beside a number the engine computes from the setting. It is true today only because min = max = 0.1.
- Section 4 item 2 is real as stated: mobile_parcel_detail.descriptor.json `inputs.field_whitelist` (25 paths) holds `parcel.parcelId`, `parcel.lot.is_heritage_designated`, `parcel.lot.is_in_ravine_protection_area`, `parcel.lot.is_corner_lot`; ConsumerParcelSchema (types.ts:80-96) is `.strict()` with costMenu, areas, neighbourhood only. No key for any of the four. The decl declares them at report-v2.decl.json :41, :122, :132, :142.
- 136 quotes at :46, :85, :112 and the fe.40 line :151, fe.09 :58 are verbatim. 135:67 (FE-45) says "the lock is task-434's and the path is a reservation".

## rc#1 HIGH: the T2 plant names the wrong line; the guard is read-stored.ts:29, not :28
Plan: section 0 link 3 "read-stored.ts:21-28" and T2 "temporarily deletes the guard line in read-stored.ts:28".
Evidence: src/lib/report-projection/read-stored.ts:28 is `const PARCEL_SELECTED = [...]`. The throwing line is :29 `for (const c of PARCEL_COLUMNS) if (!PARCEL_SELECTED.includes(c)) throw new Error(...)`. :21 is PARCEL_COLUMNS.
What goes wrong: a lane that follows the plan literally deletes :28. PARCEL_SELECTED is then undefined and :29 throws a ReferenceError at load. read-stored.ts is imported statically at the top of customer-report-read.logic.test.ts through report-page.ts (:55), so the whole file fails at collection: T1 to T10 all fail and T2 (a) never runs. red-T2.out would not hold the designed assertion (A1 fails or is read loosely). Deleting :29 gives the designed red (the import resolves, `rejects.toThrow` fails).
Fix: say "the throw line, read-stored.ts:29" and the range :21-29.

## rc#2 MED: T1's title says "the engine writes"; the rule T1 checks is the generator's, and the engine's rule differs in two places
Plan: T1 title and section 0 link 6 "the engine writes the catalogue field for the page section's building type"; effective-ON copied from seed-report-v2.mjs:70, :82.
Evidence: maxbld/rows.js:496-512 `runAllRows` writes every catalogue row whose building_type list holds the type (`mine`, :504). It drops only a row that has an increment other than '1', is switched off and is not_evaluated (:511). An increment-1 row that is switched off is still written, as not_evaluated with reason `switched_off:<id>` (rows.js:402). The engine reads a missing switch as ON (compute-maxbld-scen*.js:213-216); the generator treats a missing switch as a finding (seed-report-v2.mjs:88-92). Increments of the 17 fields: permitted, storeys_max, footprint_max_m2, units_max, gfa_max_m2 are '1'; gfa_pitched_m2, gfa_flat_m2 '2'; unit_area_m2, unit_count, houseplex_bedrooms, units_flat '3'.
What goes wrong: T1 case (c) (formula:storeys_max off) reports o1, o2, o3 as "unwritten", but the engine still writes storeys_max for each as not_evaluated. T1 proves "declared and effective-ON by the generator's rule", not "written by the engine". The plan's own UNVERIFIED list says it did not trace this; I did, and the answer is that the two differ.
Fix: word T1 as the generator's rule (fe.30 plus type membership) or add a control that runs the engine (the admin test already builds rows with `S.buildParcelRows`, :84-90) and asserts the 17 pairs are present.

## rc#3 MED: the skip of ranks 1-7 rests on a reading; the look's own Feeds column says task-442
Plan: section 2 rows 1-7 "OWED, lock path reserved: task-367 (RR-0385 item 6, MD:1922 ...)".
Evidence: docs/reports/reviews/task-440/RULE-CHECKS.md:169-175 (group 3 ranks 1-7) end each row with `| - | task-442 |`, the Feeds cell. The task-367 card names only fe.01, fe.05, fe.13, fe.44 and its plan is gates A, B, C; none of fe.45, fe.52, fe.56, fe.21, fe.25, fe.26 appears in it. task-434 (which 135 rows name as the lock's owner) is LATER with a dated note "merged into task-367 ... withdrawn here once the look at task-367's branch confirms nothing is lost" (task-434 :43). So the chain is MD:1922 ("Task 367 is the key card") plus that merge note. It is a fair reading, not a fact the cards state.
What goes wrong: task-442's card says "as ranked by FINAL.5"; FINAL.5 ranks these seven first and hands them to task-442. The plan skips the seven worst-ranked rows on its own reading, and Q1 asks only about the engineering rows, not these.
Fix: add a question (Q7) for the orchestrator: does task-367 carry the seven OWED locks? If the orchestrator answers yes, state the card line in the task.

## rc#4 MED: T3's walk reaches 81 of the 90 content keys
Plan: T3 checker "each part's `content` key and each `pending_texts` key".
Evidence: node walk of report-page.json sections: 79 distinct `content` keys; pending_texts adds `pending.estimated`, `pending.classified` (report-page.json:4-7). The other 9 keys of `page` are never named by a part: `sheet.link_dims`, `sheet.err_range_sqft`, `sheet.err_range_m2`, `sheet.err_side_ft`, `sheet.err_side_m`, `sheet.err_dims_area_sqft`, `sheet.err_dims_area_m2`, `sheet.err_ratio`, `summary.not_evaluated`. None holds a digit today (the count of 4 is over all 90).
What goes wrong: the plan's header says "90 keys" but the checker covers 81. The unreached ones are the lot-size error texts with {lo}/{hi}, the place a typed limit is most likely to be added later.
Fix: scan every key of `page`, or assert that walked plus a named unwalked list equals all 90.

## rc#5 LOW: the layer3-catalogue cite points at neighbours of the row the label describes
Plan: "through lv() (layer3-catalogue.json:264-268)". Lines 264, 266, 267, 268 hold basement_livable_m2, units_flat, units_pitched_a, units_pitched_b. The row behind the o3 label "Size per unit includes the basement; 10 % circulation" is unit_area_m2 at :271 (and units_fit :277). The fact is true; the cite is loose.

## rc#6 LOW: fe.13 dry run not re-run
The plan's "12 misses of 286" for fe.13 was not reproduced here (see UNVERIFIED). The decision to skip fe.13 does not depend on the number.

## rc#7 NIT: T1 and design options
o1 is scenario `detached_house/pitched` and the catalogue row gfa_pitched_m2 carries design_option roof_form pitched; the plan's check uses the type before "/" only (as project.ts does). Fact is consistent with the producer; stated so the reader does not expect the variant to be checked.

UNVERIFIED (not checked by this seat):
- The fe.13 "12 of 286" dry run, the parcel_lot_form view and the imagery_roof_* rename.
- "Where the design rule 'the schema binds to DB fields; the only exceptions are user inputs and ads' is written": not searched.
- MD:638 and MD:1917-1922 were read only at the cited lines.
- Whether the S-001 hand screen is retired (report-fields.decl.json `$comment`).
- db-tests.yml path filters and test.yml:66-67 (section 4 item 3, Q3).
- What lens lists the Files line resolves to at output review.
