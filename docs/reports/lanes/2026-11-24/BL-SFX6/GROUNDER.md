# GROUNDER task-461 BL-SFX6 output review round 1
Grounder: Cairn-Ground-O461
Lane: BL-SFX6

Ruled: out-code-review.txt sha256:991fead2c39d findings:0
Ruled: out-compliance-inc-S.txt sha256:b783191e7897 findings:2
Ruled: out-compliance-mobile-90.txt sha256:0585f5d3cb8e findings:3
Ruled: out-compliance-mobile-98.txt sha256:c6360810ea46 findings:3
Ruled: out-compliance-mobile-99.txt sha256:78028828ec8f findings:3
Ruled: out-compliance-ms-S.txt sha256:5003618ed7a1 findings:3
Ruled: out-compliance-surface-136.txt sha256:7a4d697a4918 findings:2
Ruled: out-engineering-eng-front.txt sha256:a1793e39430f findings:0
Ruled: out-engineering-eng-shared.txt sha256:31115b95cd99 findings:3
Ruled: out-error-paths.txt sha256:27bee4023da7 findings:3
Ruled: out-ux.txt sha256:0c376a101549 findings:1

out-compliance-inc-S#1 REJECTED mobile/__tests__/lotForm.test.ts:67 "{ ...form(true), extra: 1 } }).success).toBe(true);" Not a fault in the test: red.out shows the old case failing at :71 and green.out shows 2 suites and 40 tests passing; the card notes state the command and counts, the lens could only see the diff.
out-compliance-inc-S#2 REJECTED mobile/__tests__/useParcelLookup.test.ts:23 "import { ConsumerParcelLookupResultSchema }" AC2 holds: git grep of the schema name in mobile/__tests__ finds only lotForm, schemas.test.ts:326 and useParcelLookup.test.ts:163 and :200 (valid payloads, true); the diff touches no other file.
out-compliance-mobile-90#1 REJECTED mobile/__tests__/schemas.test.ts:326 "const { ParcelLotFormSchema, ConsumerParcelLookupResultSchema }" Same grep as inc-S#2, re-run by the grounder: no phone test asserts the strict form; schemas.test.ts:329 already states the plain form.
out-compliance-mobile-90#2 REJECTED mobile/__tests__/lotForm.test.ts:63 "with null and with a server-added field" The lens could not see red.out and green.out; both exist (1 of 40 failing at :71 before, 40 of 40 after); the full run is owed under RR-0460 and ruled with mobile-98#1.
out-compliance-mobile-90#3 REJECTED mobile/__tests__/lotForm.test.ts:67 "plain, a server-added field still parses" Ruled by task-450 AC3 and GROUNDER-B D1 and by plan 8.1 A: the phone mirror is plain on purpose; a future generated mirror (Spec 126 5.2) is its own card, no new infrastructure (RR-0392).
out-compliance-mobile-98#1 CONFIRMED mobile/__tests__/lotForm.test.ts:62 "the mobile mirror of the lookup block" LOW: RR-0460 wants a full local phone run before the push and none exists after the fold yet; it is owed, not a defect in the diff, and is the orchestrator step in the gate worktree (see LANE-STEPS).
out-compliance-mobile-98#2 REJECTED mobile/__tests__/schemas.test.ts:329 "lot form with one extra field parses" Same as inc-S#2: the grounder re-ran the grep, AC2 holds, and the plain form is already stated at schemas.test.ts:329-331.
out-compliance-mobile-98#3 REJECTED docs/reports/reviews/task-461/GROUNDER-PLAN.md:11 "Seat: integration docs/reports/reviews/task-461/seat-integration-1.md" The fresh integration seat of RR-0461 exists and is committed at the plan stage and was ruled in the plan grounder; no seat report is required for an output review.
out-compliance-mobile-99#1 CONFIRMED mobile/src/lib/schemas.ts:424 "server-added field never raises ParcelLookupSchemaError" LOW: the task-450 dated note of plan section 7 is owed and bookkeeping only; the deviation is correct (Files line), the orchestrator writes it through the backlog CLI (see Q2).
out-compliance-mobile-99#2 REJECTED docs/reports/reviews/task-461/GROUNDER-PLAN.md:29 "in#1 CONFIRMED docs/reports/reviews/task-461/seat-integration-1.md" Same as mobile-98#3: the fresh integration seat report is in the repo at docs/reports/reviews/task-461/seat-integration-1.md.
out-compliance-mobile-99#3 REJECTED mobile/__tests__/schemas.test.ts:335 "ConsumerParcelLookupResultSchema.parse(result).lotForm" Same as inc-S#2: the lens could not open the cited ranges; schemas.test.ts:326-335 and useParcelLookup.test.ts:163,:200 hold plain or valid payloads, so AC2 holds.
out-compliance-ms-S#1 REJECTED docs/reports/reviews/task-461/GROUNDER-PLAN.md:13 "Seat: regression docs/reports/reviews/task-461/seat-regression-1.md" Same as mobile-98#3: RR-0461 asked for the fresh integration seat on the plan and it ran; it is committed, so this finding is only the lens not seeing it.
out-compliance-ms-S#2 REJECTED mobile/__tests__/lotForm.test.ts:65 "{ ...base }).success).toBe(true);" Duplicate of mobile-98#1, which holds the one record of the owed full local run; the two-file run is the red and green proof only.
out-compliance-ms-S#3 REJECTED mobile/src/lib/schemas.ts:423 "task-450 SEARCHFIX.2, L1; GROUNDER-B D1" Duplicate of mobile-99#1, which holds the one record of the owed task-450 note.
out-compliance-surface-136#1 REJECTED mobile/__tests__/lotForm.test.ts:64 "form(true) }).success).toBe(true);" Duplicate of mobile-98#1 (the full local phone run owed before the push, RR-0460).
out-compliance-surface-136#2 REJECTED mobile/__tests__/useParcelLookup.test.ts:163 "expect(ConsumerParcelLookupResultSchema.safeParse(searchCandidatesResponse)" Same as inc-S#2: AC2 holds by the grounder grep, nothing else asserts the strict form.
out-engineering-eng-shared#1 REJECTED src/tests/parcel-lot-form.logic.test.ts:145 "e block is strict and closed" Ruled 8.3: the server strict block is correct for the server schema and is the intended guard that goes red first on a server field; no new parity infrastructure (RR-0392).
out-engineering-eng-shared#2 REJECTED mobile/__tests__/lotForm.test.ts:63 "parses a payload with the block, without it (older server)" Renaming a test file is outside the card Files line and the two-line change; the file name is the long-standing one and nothing in the card asks for a layer name.
out-engineering-eng-shared#3 REJECTED mobile/__tests__/lotForm.test.ts:69 "refuses a block outside the contract" A response-time checklist is no artefact of a two-line test move; the plan was grounded and the red and green runs are the record.
out-error-paths#1 REJECTED mobile/src/lib/schemas.ts:424 "The closed enum lists stay." Ruled by task-450 and kept by the card: closed enums stay fatal, the two refusals at :70 and :71 lock that; the diff changes no behaviour here and a lenient fallback is a new design.
out-error-paths#2 REJECTED mobile/__tests__/schemas.test.ts:330 "ParcelLotFormSchema.parse(lotForm)).toMatchObject(" The card asks that an extra field still parses; z.object strips unknown keys (schemas.ts:425) and a passthrough change would be a schema change with its own test, not this card.
out-error-paths#3 REJECTED mobile/src/lib/schemas.ts:425 "export const ParcelLotFormSchema = z.object({" Verified on the schema: detected, basis and unsure are all required with no optional, so an empty block is refused today; an extra case is outside the card acceptance lines.
out-ux#1 REJECTED mobile/src/lib/schemas.ts:421 "Spec 78 O-4 + the doubt rule" Dated notes naming the card are this repo convention in code comments (schemas.ts:423 does the same) and the test comment is developer text, not person-facing copy.
