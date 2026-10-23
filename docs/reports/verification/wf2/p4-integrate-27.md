# Verification index — wf2/p4-integrate-27

R-EZ says: *"Findings block the integration until fixed or ruled. The verification report is saved under
`docs/reports/verification/<branch>.md` and the integrate commit cites it."*

- **Integrate base:** `e9523e48` (= origin `wf2/deep-scrapes-restore-l0`, integrate-26)
- **Worktree:** ~/Buildo-wt-int27 (node_modules symlinked to ~/Buildo/node_modules; mobile/node_modules an APFS clone of ~/Buildo/mobile/node_modules, as int26 had for admin-lead-schemas.contract)
- Working files: ~/Buildo-scratch/int27/

## Merged branches (in order)

| # | Branch @ tip | Notes |
|---|---|---|
| 1 | `wf2/fleet-night-2210` @ `b6a39e4f` | 24aeb6ae fleet recapture captures (117/117) + b6a39e4f RE-FREEZE #39-#41 lib |

## Merge 1: wf2/fleet-night-2210 @ b6a39e4f

- **Conflicts:** 43 files, all `docs/reports/*-assessment.md`. In every one of them both sides changed only the generated
  `## Validation scorecard (generated)` block (checked per file: the text outside the block is byte-identical at the merge base,
  int26 and fleet-night; ~/Buildo-scratch/int27/bin/blockcheck.mjs). The block's generator is `step-validate --all --write`, which
  opens a DB pool (step-validate.mjs:6404-6414 `runDataValidatorsForWrite`) and so is not run in this no-DB lane. Each file was
  resolved to the int26 side whole (the operator's DB run 2 output at 24bc14ee, committed in e9523e48), never a hunk mix. The blocks
  are therefore stale for the merged tree (fleet-night adds migrations 284 and 285 and its own captures) and their regeneration is owed.
- **No other textual conflicts.** Every pre-commit generator `--check` is rc 0 on the merged tree without regeneration
  (layer2-input table_version 786fbe40 unchanged; report-field inventory, last_measured, 122-vocabulary, step and by-law handbooks,
  logic-variables registry, decision-log, spec-split all current).
- **Spec 122 §8 RE-FREEZE #41** (122_pipeline_step_optimization.md:1189): "operator Q-J / L2P-3 approval pending" now cites the recorded
  approval, Spec 124a R-JN (124a_step_standard_policy_appendix.md:969; `2026-10-22-page-eve#EVE.Q-J`, `#EVE.L2P-3`; handbook line
  Spec 132 §x-rulings.4 (R-JN), chat-rulings-register.logic.test.ts:30). `npm run system-map` regenerated.
- **Note on the b6a39e4f message:** its body says the list_of change "lands on this lane branch on the held reading
  (CHAT-never-halt)". `CHAT-never-halt` is not a CHAT id in any decision log; it names the never-halt working rule (lanes keep
  building on the recommended reading while a ruling is pending). The ruling it waited on is R-JN, recorded before this merge.
- **CoA:** both sets re-scored on the merged tree: 0 of 698 and 0 of 496 rows move (class, ours and city values identical to
  verify-46c's e9523e48 scores); CHECK OK on the existing pins; FLOORS OK. No re-pin (inputs unchanged).
