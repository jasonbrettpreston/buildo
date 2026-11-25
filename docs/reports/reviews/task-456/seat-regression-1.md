# Seat: regression: task-456 plan (PLAN-456-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board head a6a3fcb6d (wf2/board; the plan says it read 9de5c2129). Files read: task-456 and task-454 task files; FINDINGS-PLAN.md; nav-by-route.logic.test.ts (:1-52, :120-200, :291-324, :355-420); search-follow-ups.logic.test.ts (:1-16, :55-100); surfaceRenderer.smoke.test.tsx (:28-58); customer-report-read.logic.test.ts (:60-100, grep of every row/stamp use); src-sql-ledger.logic.test.ts (:40-60, :300-312); src-sql-ledger.mjs (:800-818); project.ts (:20-60); migrations/309 (:30-50); enrich-parcels-scenarios.db.test.ts (:1-60); db-tests.yml; .husky/pre-commit; mcfixreborn-g2/GROUNDER-B.md (:55-100); the real files under the nav-lock DIRS (grep and sed); git log per file. Not read, no test runner, no database, no dotenv. The other-branch scan is UNVERIFIED in depth (see rg#6).

Checked and clean:
- Ledger exit-1 change (D2). The only automatic caller of src-sql-ledger.mjs is .husky/pre-commit:23, and it runs `--check`, never `--confirm`. package.json, .github, docs/runbook and scripts have no `--confirm` call. The only other mentions are the header comment, a report, capture-witness.js and sql-witness-harness.logic.test.ts, which are not shell callers. The ruling at GROUNDER-B.md:67 says "--confirm is a manual, labelled-PARTIAL diagnostic … nothing reads the confirm exit code". So nothing that passes today can start failing. The reader test at src-sql-ledger.logic.test.ts:308 (`readRecordedStatements(missing)` equals `[]`) stays valid because the plan leaves the reader alone.
- Case count for the D4 refactor: customer-report-read.logic.test.ts has 39 `it(` lines and no `it.each`, which matches the planner's 39. No case is dropped by the plan as written.
- The text pin at search-follow-ups:64-65 checks only `screen.getByText('Lot Intelligence')` and the absence of `Lot & Zoning Intelligence` in the smoke file. Adding 'reports_left' to :35 touches neither. The it.each at smoke :49-56 asserts input, BLD, tagline and no Account button, and the fixture key `reports_left` exists, so those generic asserts should hold (UNVERIFIED by run, as the plan says).
- The :98 title is a `describe` ("…and no field was added"). Its body asserts 14 to 16 fields (RR-0284), so the title is stale. Nothing outside review records greps that title, so renaming it breaks no pin.
- Migration 309: the plan never edits it. Each refused row in step 10 violates exactly one CHECK, so `err.constraint` names the intended one. The reason constraint sorts first, so a row breaking both would name it.
- No unmerged branch edits the 12 files. `git log --all --not HEAD --since=2026-11-18` with the path filter returned only `9ff368586 base`.

## rg#1 HIGH: the widened nav lock flags real code in sign-up.tsx, so the "real-tree case stays green" claim is false
Plan: Step 3 (X6 and R5, nav): "widen :154: climb through the parents that are `&&`/`||` binary expressions … The real-tree case at :361 must stay green". Section E: "the grounder grepped and found none".
Evidence: mobile/app/(auth)/sign-up.tsx:234 `{method === 'email' && awaitingConfirmation && (` and :274 `{method === 'email' && !awaitingConfirmation && (` are compound JSX branches on the state `method` (line 34 `useState<SignUpMethod>`). Line 335 has `onPress={() => setMethod('phone')}`. Today the compound hides `method` from `discriminants`, so there is no finding. After the climb, `method` becomes a discriminant and :335 becomes an unexplained NAV-1. The ALLOW list (nav-by-route :300-322) has no `setMethod` entry. Only `setPhoneStage('otp')` at :321 is listed, because `phoneStage === 'input' && (` is a simple form. Test :365 (`judge(...)` equals `{unexplained: [], miscounted: []}`) would go red. The lock was added by 3f41c8088 (MF-75, operator 2026-11-11), and "the list only shrinks" per the dated note at :297-299.
Fix: add to step 3 a decision for sign-up.tsx:335. Either a new ALLOW entry (kind 'disclosure', since the Pressable is behind PHONE_AUTH_ENABLED and opens the phone sheet, with a dated note and audit row), or ask the operator whether it is an exception owed to MF-49. Run the widened lock over the real tree before landing and add the result to Section E. LoginForm.tsx hits are all `v.mode` (property access, never an identifier), so they are not affected.

## rg#2 MED: the widening changes the rule's meaning, but the plan records it only as notes on stale headers
Plan: Step 3 "Add dated notes (prior text kept) at :2-3, :6 and :48-50".
Evidence: the NAV-1 rule text at nav-by-route.logic.test.ts:20-22 defines the discriminant as "`x === 'lit' && <jsx>`, a ternary with JSX, or `switch (x)`". The rule is also in Spec 126 §0b (the 2026-11-11 note) and §5.3 item 5, per the :1-3 SPEC LINK. The plan's note locations do not include :20-22 or the spec.
Fix: add a dated note at :20-22 (compound `&&`/`||` operands now count, ruling GROUNDER-F.md:107). Say whether the Spec 126 §0b note needs a one-line edit. If it does, add that file to Files, which is otherwise tests only.

## rg#3 MED: the D4 typed builders can weaken the withheld-column leak case
Plan: Step 9: "`StoredParcelRow` builder for the parcels read (read-stored.ts:23-28). Replace :77-80/:84".
Evidence: customer-report-read.logic.test.ts:371 `use({ ...CURRENT_LOT, parcel: { ...PARCEL_ROW, estimated_cost_max: 999999, variance_prediction: 1.7 } })`. This plants columns that are not in the typed parcels read, to prove the legacy columns never reach the response. A strict `StoredParcelRow` rejects those extra keys at compile time, so the author will either cast (losing the typing the card wants) or drop the plant (losing the lock). Line 195 mutates `ROWS()` after the fact, and `Lot.rows` is `Json[]` by design so malformed rows stay expressible.
Fix: in step 9 say that `makeStoredParcelRow` returns `StoredParcelRow & Record<string, unknown>`, or that the :371 case keeps its explicit extra keys. Add the proof "every pre-refactor assertion text and plant kept". The case count alone cannot show this.

## rg#4 MED: question D1 and the Files line need task-454 recorded as a dependency, and the order should be 454 first
Plan: Section C "build in parallel, but land 456's commit (i) after 454's code commit".
Evidence: the task-456 front matter has only `dependencies: TASK-452`. task-454's plan (:190) says "customer-report-read.logic.test.ts is in both Files lines. task-454 edits its db/client mock at :31-34; task-456 edits its builders at :77-78", and its Files line carries parcel-lookup-gate.infra.test.ts and parcels-entitlement.infra.test.ts. Step 7 copies the mocks from exactly those two tests (456's :16-21 reference), so the copy would be stale.
Fix: order is 454, then 456, never parallel. Write the task-454 dependency into the 456 file (and its queue row). The customer-report-read edits then touch different hunks (:31-34 versus :77-84). Write step 7's mocks after 454's route change, and re-run step 7 and the D4 case on that tip.

## rg#5 LOW: the DROP CONSTRAINT proof is DDL on the shared table, which the operator rule on the shared stack forbids if it ever runs there
Plan: Step 10: "in a transaction, `DROP CONSTRAINT <name>`, show the same row is accepted, then ROLLBACK", and Section D1 (test stack route "would migrate 55322").
Evidence: setup-testcontainer.ts:151-158 allows the test stack with `BUILDO_TEST_DB_EXTERNAL=1`. DROP CONSTRAINT takes an ACCESS EXCLUSIVE lock on parcel_maxbld_scenarios. The existing pattern in enrich-parcels-scenarios.db.test.ts:20-60 uses BEGIN/ROLLBACK and seeds `parcel_id LIKE '995%'`.
Fix: state in the plan that the file must refuse to run (or skip) under `BUILDO_TEST_DB_EXTERNAL=1`. Wrap the seed and every case in one BEGIN … ROLLBACK, as the enrich test does, so no row is ever committed, and pick a parcel_id range that is not 995xxxxxx. This extends error-paths#7 and deepseek#2, which asked for a try/finally, to the shared-stack rule.

## rg#6 NIT: the other-branch scan is shallow
Plan: Section C overlap note covers only task-454.
Evidence: the path-filtered `git log --all --not HEAD --since=2026-11-18` returned one commit (`9ff368586 base`) and the local `wf1/*` and `mf*` branches are old. Task-454 is only a plan, so its code is not on any branch yet.
Fix: no plan edit. Re-run the path filter on the push day, and again after 454 lands.

STATUS: 6 findings (1 HIGH, 3 MED, 1 LOW, 1 NIT); the widened nav lock would turn the real-tree case red on sign-up.tsx:335 (`setMethod('phone')`), so the plan needs an allow-list ruling before step 3 can land.
