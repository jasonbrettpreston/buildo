# Night record: MB27-AXIS-NIGHT-1 (MB-27, the increment-2 roof-axis night, 2026-11-05)

McBylaws task MB-27, local database only (127.0.0.1:54322). The night applied migration 295 alone, then did a TRUNCATE-RELOAD of the three Layer 2 tables (`bylaw_resolution_lots`, `_texts`, `_units`) at 61 slots with bytea stamps from the tree `41f1e2e3c` plus the night patch, and retook the #44 witness captures.

- Pre-registration: `scripts/analysis/bylaw-validation/coa-expected/prereg-MB-27-14.json` (`41f1e2e3c`, committed alone before the go). Its `layer2_night` block holds the complete transition table of the dry run: 17,021 transitions, 6,210,208 moved cells, 119,216,297 unchanged.
- Checklist: `~/Buildo-scratch/mcbylaws/MB-27L2/night-checklist-axis.v2.md` (C1 to C6, dated notes v2.1 to v2.7). Log and evidence: `~/Buildo-scratch/mcbylaws/MB-27L2/night/` (`night.log`, `blocks/*.out`, `obs/`, `diff-25.txt`, `runrows.txt`, `stop-c3a-1.txt`, `stop-c3a-2.txt`, `stop-c4-1.txt`).
- Night patch: `~/Buildo-scratch/mcbylaws/MB-27L2/gate/night-patch.combined.diff` (sha256 `9baeb317…f904de9`). It holds the notes slot words (Q-D4W a), the resolve-bylaws.js hunk (the three stamps bound as bytea at the write boundary, and the POST width from the base pairs plus the option pairs) and the two test hunks.
- Operator rulings (answer log `~/Buildo-scratch/mcbylaws/inc2/open-questions.md`):
  - Go: the axis-night go (b), "b - you run this - go for it - let's finish this - I need to leave in any hour", typed as `OPERATOR-GO MB27-AXIS-NIGHT-1`. It confirms D-MIG ("migration 295 alone, --only=295 --dry-run first, all others held, the night running 295's VALIDATE"), the O-n2 extension ("the whole-DB restore also covers a 295 failure and a storage stop") and the go card ("a failed or differing night stops and is reported; no re-run without a new plan").
  - Before the night: Q-S6 a (storage stop only above 780 MiB, no band) and Q-D4W a (the 61-slot notes words).
  - After the three stops: Q-C3A b, Q-C3A2 b, Q-C4G b (below).
  - The five stored items and the bytea stamps were ruled and landed before the night, in commits already on origin: Q-RSM (its door data commit, prereg-MB-27-13), the street-side absence item (its door data commit, prereg-MB-27-12), RC-1, Q-STOR a and the 1:4 re-key (D-RK a, F-2 a) with P3 (migration 295), and MB-18 (l). Their rulings are in the same answer log. The night stores them; it rules nothing new.

## What the night stored
- Five ruled items, and nothing else: Q-RSM (the roof-slope absence entries ABS-10.1..10.5), M-475 (the street-side absence entries ABS-9.1..9.4), RC-1 (migration 295: 7 option slots for the detached house), the 1:4 re-key (D-RK a, F-2 a) and MB-18 (l) (the R side yard). M-480/481 move 0 cells.
- Width 54 became 61 (54 target slots, then 7 option slots stored for the detached house only). The stamps `row_sha`, `table_version` and `evaluator_version` became bytea (Q-STOR a).
- Versions: table_version `c4ede8d0…` / evaluator_version `4b589081…` became `3bc74bbf…` / `cc56a43d…`, one pair on all 440,093 rows.
- Excluded, as ruled: every migration after 295 (D-MIG; 296 present in the tree and not applied).

## Timeline (local time EST, UTC-5, 2026-11-05; every block printed its checks and refused on a miss)
| Block | Time | Result |
|---|---|---|
| C1 preflight (read-only) | 15:43-15:46 | PASS |
| C2 lock, table backup, whole-DB dump `pre295.dump` | 15:48-15:49 | PASS; dblock owner `mb27-axis-night` |
| C3a migration 295 alone | 15:50 | the `--only=295 --dry-run` printed run [295] and every other pending migration HELD (`c3a-dry.out`); 295 applied. STOP at 15:50:18 on a checklist defect (stop 1 below) |
| C3a rest (Q-C3A b) | 15:52 | STOP at 15:52:07 on a second checklist defect (stop 2 below) |
| C3a rest 2 (Q-C3A2 b) | 15:53 | PASS: 295 alone; bytea stamps; CHECKs NOT VALID; both views present |
| C3b capture tree + night patch | 15:53 | PASS: the four patched files exactly |
| C3c TRUNCATE + capture 1 | 15:54 | started (run 4414, 20:54:10Z) |
| C3d capture 1 + rerun proof | 15:54-16:42 | PASS: 440,093 lots; rerun wrote 0 rows on 3 tables; verdict WARN (expected) |
| C3e forced cohort capture | 16:43-17:30 | PASS. The recipe's heal test: 20 ungated lots are backed up, deleted and re-derived by a forced run, which must rewrite them identically; cohort backup table `bylaw_resolution_lots_cohort_bak_20261105t2142z` |
| C3f forced trace, cohort restore, 295's VALIDATE | 17:30 | PASS: the post-restore cohort equals its before-image; all 6 CHECKs of 295 validated: the three stamp checks `bylaw_resolution_lots_row_sha_check`, `_table_version_check`, `_evaluator_version_check` (`octet_length(…) = 32`), the two width checks `_codes_closed` and `_array_width` (61), and `_shared_option_slots` |
| C4 verify (read-only) | 17:30 | STOP at 17:30:32 on a checklist defect (stop 3 below) |
| (waiting for the operator's ruling on the C4 stop; lock held, nothing run) | 17:30-20:57 | |
| C4 rerun (Q-C4G b): the checks, then the observe pass (the frozen dry-run harness reads the C1 snapshot and the reloaded rows and writes `obs/`) | 20:57-20:59 | PASS (below) |
| C6 release | 21:00:27 | PASS: dblock released, `~/Buildo-scratch/dblock` empty |

## The three stops (each a checklist defect; the database was correct each time)
Each stop held the lock, named its recovery file and waited for a ruling ("no re-run without a new plan"). Each re-run block refused unless HELD/STOP held the exact marker text, then archived it.
1. **C3a stop 1** (`§migrate295 (2026-11-05 15:50:18): old_regex_checks is '3', want '0': C5 → next: restore`). 295 drops the hex CHECKs and re-adds them under the same names as `CHECK (octet_length(…) = 32) NOT VALID` (295 lines 31-40), so a count by name is wrong. Q-C3A b: the check became `old_hex_checks 0` (no CHECK on a stamp column other than octet_length(…) = 32). Dated note v2.5.
2. **C3a stop 2** (`§migrate295 (2026-11-05 15:52:07): the width CHECKs are not 61 NOT VALID: C5 → next: restore`). `conname||'|'||convalidated` prints the boolean as `false`, so `grep -c '|f|'` read 0 on a correct database. Q-C3A2 b: `grep -c '|false|'` = 2. Dated note v2.6.
3. **C4 stop** (`§verify (2026-11-05 17:30:32): versions_hex_view: query failed → next: report`). `group by 1,2` names the output expression that holds count(*) ("aggregate functions are not allowed in GROUP BY"); `l3_view_tv`'s `group by 1` had the same defect. Q-C4G b: both name their columns, with the same expected values. Dated note v2.7. C4 only reads, so nothing was written between the stop and the rerun.

## C4 against the pre-registered figures (`blocks/c4-rerun.out`)
- lots 440,093; width 61 on every array of every row (0 off); octet_length 32 on every stamp (0 off).
- versions through the hex view: `3bc74bbf…|cc56a43d…|440093` (one pair).
- I10 inputs_defaulted 0. I14: the tip's `rowShaMismatchSql` lots statement (bytea compare, read from code): 0 rows.
- T1: the night's transition table and unchanged-cell table equal the dry run's, byte for byte (`cmp`).
- T2: row_sha of every lot equals the dry run's prediction: 440,093 of 440,093, 0 off.
- T3: against the committed prereg's table (prereg-MB-27-14, committed before the go; its table was copied from the dry run, so T3 binds the night to what was registered, not to a second derivation): 0 unregistered keys, 0 counts that differ, 0 registered keys absent. Each item's correctness was tested when it landed, by its own tests and oracle door entries; the night checks that the stored image is exactly what those landed trees produce.
- The 25-lot image: 30 changed lines, all inside the 15 pre-registered (parcel, target) pairs.
- Run rows 4414-4417: completed_with_warnings, warnings `["scenario_axis_cells: 398"]`, errors `[]`, lots_gated 40,908, 0 FAIL audit rows.
- The Layer 3 read through the hex view equals the generated input's table_version (`3bc74bbf…|440093`).
- Storage (Q-S6 a): the three tables measured **708.51 MiB**, against the predicted 740.10 MiB and the 780 MiB stop. That is 31.6 MiB (4.3 %) under the prediction. The prediction was calibrated on the long-lived heap (93,291 pages, 728.84 MiB heap); a freshly reloaded table carries no dead space, which is the likely reason (not measured). The step's own `storage_within_budget`, measured at capture run 1, reads ratio 0.5449759615384615 of 1,300 MiB (708.47), PASS; the forced capture's reads 708.51, the same as C4's later read.

## Every stored-image move of the night (from `obs/transitions.tsv`, which C4 bound to the dry run and the prereg)
6,210,208 cells moved in 17,021 transitions; 119,216,297 cells unchanged. The harness counts 285 cells per lot: 54 base pairs × 5 classes, the 7 option slots (detached house), and 8 lot pseudo-cells (lot_gate, inputs_defaulted, row presence, `permitted` per class); 440,093 × 285 = 125,426,505 = moved + unchanged. An option slot absent before the night counts as moved.
| Item | Cells (all classes) | What moves |
|---|---|---|
| Q-RSM | 1,795,169 | principal roof_slope_max, no_candidate to unregulated by ABS-10.1..10.5 |
| M-475 | 840,319 | principal side_setback_street_m, no_candidate to unregulated by ABS-9.1..9.4; five classes (house_with_secondary_suite moves with detached_house, M-240 / V8-Q1 a); suite structures 0 |
| RC-1 | 3,080,651 | the 7 new option slots, one cell per lot each (one of them the threshold slot, 440,093) |
| 1:4 re-key | 5,444 (1,603 lots) | principal height_m 3,207 and main_wall_height_m 2,237 cells |
| MB-18 (l) | 488,625 | principal side_setback_m on R lots: the value and winner move inside `applies` (for example 0.45 by 10.10.40.70(4)#(4)(A) to 0.9 by 10.10.40.70(3)#(3)(A)), so no reason or winner-layer count changes |

The table counts all five classes. The step's audit counts the representative class detached_house only, and there the golden deltas reconcile to the cell:
- no_candidate -450,946 = Q-RSM -300,199 + M-475 -166,725 + RC-1 +15,978.
- condition_unknown +2,175 = the 1:4 re-key (height_m +1,421, main_wall_height_m +754).
- the gate reasons, from RC-1's 7 option slots: lot_metric_missing +7,756 (7 × 1,108 gated lots), ambiguous_zone +3,143 (7 × 449), label_exception_mismatch +553 (7 × 79), label_unparsed +35 (7 × 5), and exception_not_authored +281,365 (7 × 39,267 gated lots + 7 × 928 ungated lots whose exception is not authored for these slots).
- RC-1's 3,080,651 new cells by destination: applies with a winner 2,357,586, not_applicable 390,268, not_evaluated 308,830 (the reasons above and no_candidate 15,978), applies unregulated 23,967.
- winners base +2,310,257 = RC-1 +2,310,890 and the 1:4 re-key -633; exception +45,908 = RC-1 +46,696 and the 1:4 re-key -788.
- results 26,845,673 = 440,093 × 61.

Dictionaries (read-only compare of `pre295.dump` with the live tables): texts 2,848 to 2,866 (+19 -1), units 999 to 1,015 (+21 -5). Each added or removed id is carried by one of the five items. The list is in `explained-diffs.json` (`table_state[].row_count`).

No move outside the prereg: T3 found 0 unregistered keys.

## The witness recapture and the explained diffs
- Both POST goldens and both witness traces were retaken from the recorded recipe. G8 against `41f1e2e3c`: 72 diffs over both posts (36 keys each), 0 unexplained after `explained-diffs.json`. `step-validate --step=resolve_bylaws --fast`: 17/17, standard V3, G8 3/3, #44 WITNESS PASS.
- `explained-diffs.json`: 29 entries rewritten for this night (the 13 audit keys in both the summary and run-ledger copies, `stdout_lines[]` and the two `table_state` keys), as the MB-26 night did for night D. The 14 entries this night did not move are unchanged.

## Findings and leftovers
- **The Q-D4W measured figures wait for the next recapture.** Q-D4W a has the notes hunk's measured figures (results, units, texts, size, duration, WARN, date/source/query) "filled from the axis night's own capture run". Filling them after the capture makes both POST goldens stale: `step-validate` then reads `#44 FAIL:STALE` on standalone and standalone.forced. MB-26 hit the same block with D-4. The figures were measured from capture run 1 (pipeline_runs 4414): results 26,845,673, units 1,015, texts 2,866, 708.5 MB (the step's own storage figure), 24.0 min, scenario_axis_cells 398, date 2026-11-05. They are held in `~/Buildo-scratch/mcbylaws/MB-27L2/night-commit/resolve-bylaws.notes.d4-figures.json` for the next Layer 2 recapture (P4). This commit carries the notes exactly as captured (the two slot clauses). So the same notes line, `expected_shape[0].what`, still holds the first capture's figures (2026-10-24): 992 units, 2,840 texts, 23,324,929 results, about 81 min, about 733 MB and scenario_axis_cells 597, against tonight's 1,015, 2,866, 26,845,673, 24 min, 708 MB and 398 (398 is pre-registered in prereg-MB-27-14 and was first ruled at the MB-26 night). They are knowingly stale until the next recapture.
- **RP-7 moves nothing tonight.** `expected-172.json`, `expected-4d.json` and `maxbld-amendment-index.json` already hold `3bc74bbf…` / `cc56a43d…` (applied at P3's landing).
- **Cohort backup table.** `bylaw_resolution_lots_cohort_bak_20261105t2142z` stays in the database, as MB-26's did (decision D2). `docs/reports/witness/_catalog.json` lists it, so the catalog matches the database.
- **Display (cosmetic).** The forced-cohort plan prints the bytea row_sha as raw bytes, not hex. It writes nothing; a card.
- **Backups kept** until the operator's word: the C2 table backup (`night/backup/`, binary copies of the three tables on disk) and `pre295.dump` (966 MB). Deleting either is the operator's decision (archive, then confirm). The cohort backup table is the same.
- **Migration 296** (`296_layer3_increment2_settings.sql`, lane K) stays unapplied, held by D-MIG for its own night.

## Commits (throwaway worktree `~/Buildo-wt-mb27cap` off `41f1e2e3c`; not pushed)
1. `9f15d0ff4`, the night recapture: both POST goldens, both witness traces, `_catalog.json`, `explained-diffs.json`, the night patch (notes slot words, the resolve-bylaws.js write-boundary and POST-width hunk, two test hunks) and the OUTPUT panel record `docs/reports/panels/MB-27.json`.
2. `3ee360356`, this night record (with this touch-up after it).
