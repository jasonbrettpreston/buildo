# Verification index — wf2/p4-integrate-25

R-EZ says: *"Findings block the integration until fixed or ruled. The verification report is saved under
`docs/reports/verification/<branch>.md` and the integrate commit cites it."*

Independent verifiers read the branches only: verify-39 (`~/Buildo-scratch/verify-39/verify-39.md`) for rulings-rec, v3rest, oraclec2, p3plan, l2prereq/l2slices2; verify-39b for coa-aswap; verify-38 for the base.

- **Integrate base:** `b9c43b09` (= `wf1/exc-w2-apply`, verified by verify-38)

## Merged branches (in order)

| # | Branch @ tip | Verdict |
|---|---|---|
| 1 | `wf1/rulings-rec` @ `9307de40` (CHAT-63..74 recorded; M-318..M-333, R-IZ..R-JF) | PASS-WITH-NOTES (verify-39 at 0287394d; 9307de40 adds CHAT-72/73/74) |
| 2 | `wf1/v3rest` @ `9d25fe1a` (14 ledger rows closed) | PASS-WITH-NOTES |
| 3 | `wf2/coa-aswap` @ `ade0001e`, then `6c25c3e0` (G3 fix b757d7ac, SWAP-4 scope test) | PASS-WITH-NOTES (verify-39b at ade0001e) |
| 4 | `wf1/oraclec2` @ `add47b13` | PASS-WITH-NOTES |
| 5 | `wf1/p3plan` @ `ca6fa645` only (5d17fa36, 62bf3190 HELD on P3-Q1, not merged) | PASS |
| 6 | `wf1/l2slices2` @ `5133377c` (861f9700 + l2prereq merge) | PASS-WITH-NOTES |

Not merged: `wf1/excr5b`, `wf1/coa-intake`, any HELD commit.

## Conflicts and resolution

| File | Where | Resolution |
|---|---|---|
| docs/reference/maxbld-report-field-inventory.{md,json} | coa-aswap | `report-fields.mjs --write` |
| docs/reference/bylaw-layer2-input.json | oraclec2, p3plan, l2slices2 | `generate-bylaw-layer2-input.mjs --write` |
| docs/reference/logic-variables-registry.md, maxbld-report-field-inventory.* | p3plan | `npm run logic-vars-docs`, `report-fields.mjs --write` |

Semantic (non-textual) break, fixed inside the p3plan merge commit: p3plan's vocab.json `disclosure_code` list was built when Spec 78 P5.12 had neither building-history row; exc-w2-apply's table carries both `building_history_permission` and `building_history_permission_undated`. Added `building_history_permission` to vocab.json and emptied the `APPROVED_NOT_YET_IN_SPEC` allowance in seed-p5-9-p5-12.logic.test.ts (Spec 133 §lc.52).

## Regeneration and hand edits

- Generators after the last merge: layer2 input, report-fields, maxbld-lineage --check, logic-vars-docs, step and by-law handbooks, system-map, spec-split-check, decision-log --check (49 logs, 200 decisions, 150 register rows, 283 citations; decision-log.logic.test.ts already reads 200, no change needed).
- Hand edits (one commit): 69a next free id M-318 to **M-334** (highest M-333); Spec 124:288 next free R-JC to **R-JG** (R-IZ, R-JA, R-JC, R-JD, R-JE, R-JF, R-JJ, R-JK, R-JL, R-JM, R-JU allocated; R-JG..R-JI free); R-JF lock in 124a now `src/tests/witness-keyed-update.logic.test.ts` (names R-JF); R-JE's lock already includes chat-rulings-register.logic.test.ts which names R-JE.
- Generated after the merges: golden-lot cases.json (P5.12 owed codes cleared) and 29 step scorecard blocks (min_migration count 274 to 275, migration 283).
- CoA re-pin (CHAT-65.repin): 172 MATCH 383, DIFFER 29, NO ANSWER 56, OWED 87, DATA 21, NOT SCORABLE 25, NOT MODELLED 96, BY-LAW CHANGED 1; 4D MATCH 273, DIFFER 23, NO ANSWER 43, OWED 55, BY-LAW CHANGED 1.

## Left out

- enrich_coa_zoning.descriptor.json lines 3167/3179/3191 text ("drafted; operator ruling owed at integration" to "ruling recorded"): R-IA/R-IB/R-IC are recorded, but the edit moves the step fingerprint and the hook stops it (#44 STALE x3). It rides the fleet-night tree.

## Checks

- `step-validate --all`: exit 0, 0 HARD STOP lines. `tsc --noEmit`: clean.
- `npm run test`: 848 files passed, 19,922 tests passed (first run found 3 stale generated files, regenerated above).
- `npm run test:db` (lock held during the run, released): 133 files passed, 893 tests passed.

## Carried forward (from verify-39 and verify-39b)

F8 (RULED rows cannot use the --accept pin door), F10 (oracle-c-round-v2 has no M-115 amendment row), F14 (list-type seed has no ruling), F15 (map_areas has no ruling), M-327 shortlist order OWED, and the HELD p3plan commits.
