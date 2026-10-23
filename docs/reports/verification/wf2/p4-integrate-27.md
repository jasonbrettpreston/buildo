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
| 2 | `wf1/rulings-rec3` @ `f7a348cf` | CHAT-92..96 register rows and dated notes (375f928f CHAT-92 RS-1 note + 00084d4b CHAT-93.RS-1 withdrawal correction on R-II) |
| 3 | `wf1/excr5c` @ `977970fe` | 04a796c2 CHAT-95 X-1..X-5, 977970fe CHAT-96 NAMED-FAM |

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

## Merge 2: wf1/rulings-rec3 @ f7a348cf (CHAT-92..96)

- Commits taken (18aa1f7c..f7a348cf, all new to the integrate line): 375f928f CHAT-92 RS-1 note on R-II; 00084d4b CHAT-93 (RS-1 withdrawn on R-II
  as a dated correction that supersedes the CHAT-92 note, which stays as the record; F1-F4, CPC-Q1, Q-H1 and the held readings); b651df89
  CHAT-94 P3-HOLD-1 option A dated note on R-EQ; f4c57ffc CHAT-95 X-1..X-5 dated notes in 69a; f7a348cf CHAT-96 NAMED-FAM and the
  classify_lifecycle_phase cards, new rows R-JZ, R-KA. New 124a rows R-JV..R-KA; decision logs batch-m..q (imported by decision-log.mjs on the lane).
- **Conflict:** docs/specs/00-architecture/00_system_map.md only, regenerated with `npm run system-map` (116 specs).
- **Checks:** decision-log --check clean (72 logs, 332 decisions, 203 register rows, 446 citations); spec-split-check clean (10672 citations,
  0 dangling); step and by-law handbooks up to date (386 rules); every generator --check rc 0. chat-rulings-register + decision-log tests 81 passed.
- **CoA:** 0 of 698 and 0 of 496 rows move against merge 1; CHECK OK on the existing pins.

## Merge 3: wf1/excr5c @ 977970fe (CHAT-95, CHAT-96 NAMED-FAM)

- Commits taken (beb769f3..977970fe): 04a796c2 CHAT-95 X-1..X-5 named-road keying fixes; 977970fe CHAT-96 NAMED-FAM (the named-road
  family read by the clause wording). Spec 133 §m.285 (M-285), §m.350 (M-350); red evidence docs/reports/red-evidence/bylaw/bylaw-chat95-red.txt,
  bylaw-chat96-namedfam-red.txt (on the lane).
- **Conflicts:** docs/reference/bylaw-layer2-input.json and docs/reference/maxbld-report-field-inventory.{json,md}, all generated:
  `generate-bylaw-layer2-input.mjs --write` (6661 units, table_version e8ff61039c7e), then `report-fields.mjs --write` (34 rendered fields), then
  `generate-amendment-index.mjs --write` (semantic: it embeds layer2_table_version; 6661 units). scripts/seeds/bylaw/vocab.json auto-merged.
- **CoA row moves (rows keyed notice#n + clause; class, ours and city values compared):**
  - beb769f3 -> 04a796c2 (CHAT-95): 0 of 698, 0 of 496.
  - 04a796c2 -> 977970fe (CHAT-96): 0 of 698, 0 of 496.
  - merge 2 tree -> merged tree: 0 of 698, 0 of 496. The lanes' claim of 0 moved rows holds.
- **Re-pin:** the inputs moved (layer2 table_version), so the existing pins read "CHECK OK (not pinned: inputs differ from the pin)". Re-pinned
  with `coa-scorecard.mjs --pin` on the merged tree (CHAT-65.repin); totals unchanged. The pins' `commit` field reads ed18cb53 (the HEAD
  before the merge commit; cosmetic, as verify-46c N-3).
  - 172: MATCH 387, DIFFER 29, NO ANSWER 46, OWED 88, DATA 24, NOT SCORABLE 25, NOT MODELLED 96, BY-LAW CHANGED 3: CHECK OK (pinned).
  - 4D: MATCH 277, DIFFER 23, NO ANSWER 33, OWED 56, DATA 22, NOT SCORABLE 12, NOT MODELLED 70, BY-LAW CHANGED 3: CHECK OK (pinned).
- **Floors (CHAT-63.C5; floors-172.json):** FLOORS OK. Measured overall accuracy 93.0 (floor 92), answered 75.6 (floor 71); 900.3.10 accuracy
  86.4 (floor 86), answered 88.0; 9 article floors + pooled pass.
- **Checks:** every generator --check rc 0; bylaw-named1-held, bylaw-v42-precedent and the 12 coa-* test files: 14 files, 334 passed.
