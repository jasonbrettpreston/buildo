# Night record: MB27-INC3-NIGHT-1 (MB-27, the increment-3 Layer 2 night, 2026-11-10)

McBylaws task MB-27, local database only (127.0.0.1:54322). The night applied migration 297 alone, then did a TRUNCATE-RELOAD of the three Layer 2 tables (`bylaw_resolution_lots`, `_texts`, `_units`) at 61 slots (storage form b, no width move) from the tip `2e7976367` plus the notes-only night patch, and retook the #44 witness captures. It restamped all 440,093 lots (D-6 a).

Citations: `L:<n>` is a line of `~/Buildo-scratch/mcbylaws/inc3/night/n1/night.log`; other files are in that directory (`n1/`) unless a path is given.

- Pre-registration: `scripts/analysis/bylaw-validation/coa-expected/prereg-MB-27-44.json` (round 133), committed alone as the tip `2e7976367` before the go; its `layer2_night` block holds the complete dry-run transition table (18,379 transitions, 3,389,414 moved cells, 125,117,742 unchanged) and the disclosure census table (66 rows). The dry run ran on `e6d9fdfa6`, the prereg's parent.
- Plan: `~/Buildo-scratch/mcbylaws/inc3/night/RUNBOOK-inc3-night-v3.md` (sections 2-7, 11 and its night-record notes) over `night-checklist-inc3.v2.md` (C1-C6, the outline at v2:384-394). Constants: `n1/expect.zsh`. Block files: `n1/blocks/` (sha256 in `blocks/BLOCKS.sha256`). Evidence: `night.log`, `c*.run.txt`, `c1-*.out`, `c4-*.out`, `obs/`, `diff-25.txt`, `runrows.txt`.
- Night patch: `n1/night-patch.notes.diff`, sha256 `58d519bea9aadc9479573a3829ae92f736489670974494687924e2aba3b1bf2f`, numstat `10 10 scripts/resolve-bylaws.notes.json` (L:1252). Notes only (DL-9 a, decision N-4 a): the held axis-night figures (Q-D4W a, source run 4414) and the slot clause corrected for D5.
- Storage form: **b**. The P-10 candidate (form a code, width 63) read P_up 792.38 MiB, over the 780 stop (`OPEN-LIST-v3.md:41`), so E5-b landed and the M-472 storage half is held (DL-3 b). The final-tree record `docs/reports/storage-gates/MB-27L2-G-STOR.json` reads P_up 768.35 MiB, PASS.
- Operator rulings (answer log `~/Buildo-scratch/mcbylaws/inc3/open-questions.md`):
  - Who runs the blocks: "like the orchestrator model - go-" (open-questions.md:414-416): the orchestrator runs the blocks on the operator's word (runbook v3:106, DL-13 b); C1 (read-only) on this word, the writes from C2 on after the typed go.
  - **The go**, typed by the operator in chat about 12:55, verbatim: "doneOPERATOR-GO MB27-INC3-NIGHT-1 go" (open-questions.md:417). The lock records it: `dblock taken (mb27-inc3-night, MB27-INC3-NIGHT-1, go: OPERATOR-GO MB27-INC3-NIGHT-1)` (L:1202). The orchestrator ran C2 to C6 on that word; C1 PASS was the operator's own Terminal run (open-questions.md:417-418).
  - Night prep, "1. y 2.y 3. y approved." (open-questions.md:407-412): (1) STOP-1 a (below); (2) the C1 "migrations after 295" line compares against the full 295 file name; (3) the notes slot words corrected before C3c.
  - "Census decision a" (open-questions.md:397-400): E2c fixed in the LQ-1 form, census and dry run re-taken.
  - Carried rulings, landed before the night in commits on origin: Q14 a (one Layer 2 night for increment 3), Q-D2 a (D2), Q12-S a (Q12), Q-287E2 a with the x812 (b) dated note (Q-287E), DL-4 a (RM houseplex absence), DL-3 a gated with b taken at P-10, DL-7 a / DL-10 a (297 alone; 294 and 296 held), DL-9 a, DL-13 b, Q-S6 a (780 MiB is the only storage stop), L-1 a, L-4 a, L-5 a.

## What the night stored
Every item below was ruled and landed before the night; the night stores them and rules nothing new. Counts are cells over all classes, from the prereg items and the night's observe pass (`obs/transitions.tsv`, bound to the dry run and the prereg by C4 T1-T3).

| Item | Ruling | Cells | What moves |
|---|---|---|---|
| D5 houseplex roof option | Q14 a, DL-7 a (P-7, migration 297) | 3,080,651 | the 7 option slots of detached_houseplex principal, `-` to a cell on every lot (7 x 440,093; `c4-d5.out`, L:1343-1377) |
| D2 lot_coverage_pct | Q-D2 a | 101,312 | `not_evaluated:map_value_absent:LC` to `applies:unregulated` (1)(B), 9 keys: RD 24,643 x 4, RT 548 x 5 (`c4-d2.out`, L:1332-1340) |
| DL-4 RM houseplex absence | DL-4 a | 155,691 | RM detached_houseplex principal main_wall_front_rear_share_pct, main_wall_side_share_pct, upper_storey_setback_m, `no_candidate` to unregulated by ABS-11.1..11.3, 51,897 each (prereg items.DL4_rm_houseplex_absence) |
| Q12 RM height_m | Q12-S a | 23,786 | 17,730 by the keying fix (`10@(C)` to `12@(B)(ii)`: detached_houseplex 11,434, semi_detached_houseplex 6,296) + 6,056 by mechanism (RM exception arms at 11 m to 12 m: 459 + 5,597); per class 11,893 + 11,893 (`c4-q12.out`, L:1341-1342; prereg items.Q12_rm_height_m) |
| Q-287E | Q-287E2 a, x812 (b) | 2,240 + 1,990 | principal front_setback_m: x331 935 and x88 765 (6.0 to 3.0), x324 540 (applies to not_evaluated); suite side_setback_m garden 995 and laneway 995, out of `needs_user_input:ancillary_contains_parking_space` (`c4-q287e.out`, L:1378-1382) |
| E4 (MB-17 Q1 reversal) | prereg-MB-27-32 | 23,744 | houseplex principal setbacks move to the 900.x exception arm written for the house (prereg items.E4_mb17_q1_reversal) |
| M-472 storage half | DL-3 b (form b) | 0 | held: the four mechanical rows stay `not_evaluated:missing_input:absent_target`, disclosed "mechanical area: not yet stored" (`c4-m472.out`, L:1383) |
| Restamp | D-6 a | all 440,093 rows | `3bc74bbfc0c9…/cc56a43de6c2…` to `dc82bfe6d3b4…/54c20374745f…` (L:1327) |

- No cell moved by: LQ1, M-435, D-8 (disclosures are not stored; the census records them) and the RM fix trace/switches option (i) (a Layer 3 consequence, open-questions.md:356-360). The detached_house moves are the Q-287E cells only: 846 = 448 principal + 398 suite.
- Width stays 61 (54 base pairs + 7 option pairs; `c1-width.out` `54 7`). Stamps stay bytea.
- Excluded, as ruled: every held migration (276, 279, 288, 291, 292, 294, 296; DL-10), the M-472 storage half (form b), and the items the outline names (M-344, Q5 b); T3 found no unregistered key.
- The tip's evaluator_version moved before the night (`54c20374745f…`; runbook v3 section 3 expected `81042395ee14…` only if no push moved it and said to read it from the tree). The constants read it from `e6d9fdfa6` (`expect.zsh`), equal to the prereg's `versions_new` and to C1 (`c1-ver.out`).

## Timeline (local time EST, UTC-5, 2026-11-10; every block printed its checks and refused on a miss)
| Block | Time | Result |
|---|---|---|
| C1 preflight, read-only (operator's Terminal) | 12:50:23-12:53:31 | PASS (L:1-46, L:1199): tip `2e7976367`, 24 ancestors OK, memory free 85 %; `440093|440093|1`; old pair on 440,093; stamps `bytea,bytea,bytea`; 708.51 MiB / 89,375 pages; `Verify: 8 missing, 3 drift`; 300 and 301 applied, 294/296/297 not; the generator clean at tv `dc82bfe6d3b4`; prereg and dry-run shas equal (`c1-preregsha.out` = `c1-drysha.out`); census out sha `227c68ed…`; snapshot of 440,093 lots (`c1-snapshot.out`); self-observe 0 moves on 440,093 lots (`c1-selfobs.out`) |
| C1, a second run | 12:52:38-12:52:54 | REFUSED, exit 2 (`c1.run.txt`; L:597-1193): started while the first run was in its self-observe; its snapshot guard found `before-lots.jsonl.gz` from the first run. No lock, no write. See finding 1 |
| C2 lock, table backup, whole-DB dump | 13:01:29-13:03:04 | PASS (`c2.run.txt`; L:1200-1211): dblock owner `mb27-inc3-night`, the go recorded; backup of the 3 tables; `pre-inc3.dump` 970M, 106 table-data entries; `pr_id0` 4417 |
| C3a migration 297 alone | 13:03:14-13:03:15 | PASS (`c3a.run.txt`; L:1212-1250): `--only=297 --dry-run` printed `run [297_…]` and the 7 held files HELD (`c3a-dry.out`); 297 applied (OK 26 ms); recorded 1, held_still_held 0, option classes house 1 and houseplex 1, view option slots 7, view base pairs 54, `checks_all_valid` 0, lots still at 61 440,093, old pair kept 440,093 |
| C3b capture worktree + night patch | 13:03:26-13:03:28 | PASS (`c3b.run.txt`; L:1251-1254): `~/Buildo-wt-mb27inc3cap` at `2e7976367`, status exactly ` M scripts/resolve-bylaws.notes.json`, numstat `10 10`, generator `--check` clean |
| C3c TRUNCATE + capture 1 (detached) | 13:03:39-13:03:59 | started (L:1255-1257); run 4418 started 18:03:49Z |
| C3d capture 1 + rerun proof | 13:03:59-13:53:12 | PASS (`c3d.run.txt`; L:1258-1280): 440,093 lots by 13:29:10; `RC=0`, verdict PASS, rerun_proof PASS (0 rows rewritten on 3 tables), git_head `2e7976367c53…` |
| C3e forced-cohort capture | 13:53:20-13:53:41 | started (`c3e.run.txt`; L:1281-1313): 20 ungated lots backed up to the sixth cohort table `bylaw_resolution_lots_cohort_bak_20261110t1853z` |
| C3f forced trace, cohort restore, VALIDATE | 13:53:41-14:42:52 | PASS (`c3f.run.txt`; L:1315-1318; `cap2.out`): 20 rows written, cohort healed, post-restore cohort equals its before-image, `RC=0`; 297 has no VALIDATE (form b); `all_checks_valid` 12 |
| C4 verify, read-only | 14:43:01-14:45:40 | PASS (`c4.run.txt`; L:1319-1942), below |
| Q10 stamps read, read-only (orchestrator) | after C4 | one row `dc82bfe6d3b4…|54c20374745f…|440093`, 0 not at the new pair, 0 at the old pair (open-questions.md:418). Re-read read-only at 15:45:17 with the same result (`~/Buildo-scratch/mcbylaws/inc3/night/after-tmp/q10-after.txt`) |
| C6 release | 14:46:00 | PASS (`c6.run.txt`; L:1943-1945): dblock released |

Machine time C2 to C6: 1 h 44 min 31 s (13:01:29 to 14:46:00). The two captures took 49 min each (runbook v3 estimate 47-48). No stop.

## Stops
None. Every block from C2 to C6 printed PASS and `exit=0`. The one refusal (C1, second run) is in finding 1; it came before any write and took no lock.

**STOP-1 (before the night, ruled).** The dry run's size self-check read `model_on_stored_ne` = 440,093 where v2:122 wants 0. Cause: the frozen harness sizes the stored stamps as hex (`dryrun.mjs:280`), and they are bytea since migration 295; 428,126 rows are off by exactly 96 B (3 x 32 B). Ruling STOP-1 a ("1. y", open-questions.md:409): accepted as a harness artifact; the storage figure of record is the G-STOR measure (P_up 768.35 MiB PASS); `MOS_NE_WANT=440093` set in `expect.zsh`; the frozen harness is not changed. Handling: C1 compared the dry run's figure with `MOS_NE_WANT` and passed (`c1-mosne.out` 440093). C4 measured the real tables (754.13 MiB) and T2 bound every row_sha to the dry run, so the artifact touched no stored figure.

## C4 against the prereg (`c4.run.txt`, L:1319-1942)
- lots 440,093 (L:1321); width 61 on every array of every row, 0 off (L:1323); octet_length 32 on every stamp, 0 off (L:1325).
- restamp through the stamps view: one pair `dc82bfe6d3b4c0aa…|54c20374745f59aa…|440093` (L:1327).
- I10 inputs_defaulted 0 (L:1329). I14: the tip's `rowShaMismatchSql` lots statement, 0 rows (L:1331).
- T1: the night's `obs/transitions.tsv` and `obs/unchanged.tsv` equal the dry run's byte for byte (`cmp`; no `c4-trans.diff` was written). The observe pass: 440,093 lots, 3,389,414 cells moved, 125,117,742 unchanged, 18,379 transitions, rows added 0, removed 0 (`c4-obs.out`).
- T2: row_sha of every lot equals the dry run's prediction, 440,093 of 440,093, 0 off (`c4-rowsha.out` `440093 440093 0`).
- T3: against the committed prereg table: 0 unregistered keys, 0 counts that differ, 0 registered keys absent (`c4-reg.out` `0 0 0`).
- Item read-outs: D2 101,312 (L:1332-1340); Q12 23,786 = 11,893 + 11,893 = 17,730 + 6,056 (L:1341-1342); D5 3,080,651 = 7 x (104,546 + 236,070 + 54,868 + 29,681 + 14,928) (L:1343-1377); Q-287E principal 540 + 935 + 765 = 2,240 and suite 995 + 995 = 1,990 (L:1378-1382); M-472 mechanical cells 0 (L:1383).
- The 25-lot images: detached_house, 0 changed lines; detached_houseplex, 10 changed lines on 5 (parcel, target) pairs: 120669 height_m, 283723 height_m, 283723 side_setback_m, 403569 lot_coverage_pct, 428050 lot_coverage_pct (`diff-25.txt`). These are exactly the prereg's `golden25_allowed_pairs`; `c4-25.out` is empty (no unexpected line).
- Run rows 4418-4421: `completed|resolved`, warnings `[]`, errors `[]`, lots_gated 40,908, 0 FAIL audit rows (`runrows.txt`; L:1936-1939). The registered `scenario_axis_results` is 0 (prereg), so the warning list is empty.
- The Layer 3 read through the stamps view equals the generated input's table_version: `dc82bfe6d3b4…|440093` (L:1941; `c4-l3tv.out`).
- **Storage** (Q-S6 a): the three tables measure **754.13 MiB** (L:1934-1935; `c4-storage.out`) against the predicted P_up **768.35 MiB** and the **780 MiB** stop: 14.22 MiB (1.9 %) under the prediction, 25.87 MiB under the stop. Beside the projections: the dry run's next-fit heap 758.3 MiB (97,063 pages, prereg storage), and the impact-map figure for D5 alone 746.0 MiB (runbook v3 section 4). The step's own `storage_within_budget` at capture run 1 reads ratio 0.5800721153846153 of 1,300 MiB (754.09), PASS. Baseline before the night 708.51 MiB / 89,375 pages (L:34).

## Every stored-image move of the night (`obs/transitions.tsv`)
3,389,414 cells moved in 18,379 transitions; 125,117,742 unchanged (440,093 x 292 = 128,507,156 = moved + unchanged: the 285 cells per lot of the axis night plus the 7 detached_houseplex option slots). Every key belongs to exactly one item (prereg items.classification): D5 3,080,651, DL-4 155,691, D2 101,312, E4 23,744, Q12 23,786, Q-287E 4,230; total 3,389,414.

The step's audit counts the representative class detached_house only (846 moved cells, all Q-287E), and the golden deltas reconcile to the cell (`explained-diffs.json`):
- needs_user_input -398: garden_suite 199 and laneway_suite 199 side_setback_m leave `ancillary_contains_parking_space` (garden 176 to applies 150.7.60.20(5)#(5)(B), 23 to `missing_input:side_setback_m`; laneway 199 to applies 150.8.60.20(3)#(3)(D)).
- missing_input +23; condition_unknown +108 (x324 principal front_setback_m, applies to `condition_unknown:front_averaging_not_applicable`).
- winners base +375 (176 + 199 suite cells); exception -108 (x324). x331 (187 cells, (E) to (C)) and x88 (153 cells, (F) to (D)) stay exception winners.
- scenario_axis_cells 398 to 0, so the step's audit verdict, status and terminal move WARN to PASS (`completed`, `resolved`, warnings `[]`).
- results 26,845,673 = 440,093 x 61, unchanged.

Dictionaries (read-only compare of `n1/pre-inc3.dump` with the live tables): texts 2,866 to 2,868 (+4: ABS-11.1, ABS-11.2, ABS-11.3 for DL-4, ABS-11.4 for the D5 RM houseplex threshold slot; -2: `map_value_absent:LC` for D2, `needs_user_input:ancillary_contains_parking_space` for Q-287E). Units 1,015 to 1,014 (+2: 900.3.10(331)#(331)[SSP](C), 900.5.10(88)#(88)[SSP](D); -3: 900.3.10(324)#(324)[SSP](C), 900.3.10(331)#(331)[SSP](E), 900.5.10(88)#(88)[SSP](F); all Q-287E). Each added or removed id is carried by one item.

No move outside the prereg: T3 found 0 unregistered keys.

## The disclosure census (LQ1, M-435; DL-8 a), not stored
From the dry-run section, as registered in prereg `layer2_night.disclosures`: script `~/Buildo-scratch/mcbylaws/inc3/build/census/disclosure-census.cjs` sha256 `847c5d77c8e64b7a79bb3d3b6d2c48d4ca31feb32b6f44e37a6bcac867c9c1d5`; output `n1/dry/disclosures.tsv` sha256 `227c68edc484c7779c42d2a3a4d3c1f2cfb1856a3ed816999915e43e6476d7e3` (C1 re-read the same sha, `c1-censussha.out`); 66 rows; tree `4a3f1c4fb` (Layer 2 paths byte-equal to `e6d9fdfa6`); 438,053 lots read. Disclosures are computed at read time and not stored; the night moves no disclosure.

**Census self-test note** (runbook v3 night-record notes; "Census decision a", open-questions.md:400). The census self-test header (`build/census/census-selftest.zsh:2-3`) says the LQ1 leg moves the shift family by "-14". That is the Layer 3 unit (7 LQ-2 b lots x footprint_max_m2 + gfa_max_m2). The census counts Phase 2 cells: 7 lots x 5 classes = **-35** (build-plan.md:199 MD-E10, :211; the `d337dd606` message). On a tip that already contains LQ1 (every tip from `d337dd606` on, including `10ba4b857`), the self-test's `patch` step (`census-selftest.zsh:11`) finds the LQ1 green patch already applied and macOS `patch` applies it in reverse, so the leg reads **+35** (tip vs tip-minus-LQ1; verified in `census-review-tmp/tip-vs-lq1tree.diff`). Not a census defect: the pass criteria (tip vs tip 0 rows, 25 lots read) still hold; the LQ1 leg no longer adds a red-first check on a post-LQ1 tip. The frozen self-test is not edited (its sha `ff0fa96a` stays).

## The witness recapture and the explained diffs
- Both POST goldens and both witness traces were retaken from the recorded recipe on `2e7976367` plus the notes patch (git_head `2e7976367c53…` in both). G8 against `2e7976367`: 62 diffs over both posts (31 each), 0 unexplained after `explained-diffs.json`. `step-validate --step=resolve_bylaws --fast`: 17/17, standard V3, G8 3/3, `#44 WITNESS resolve_bylaws: PASS`.
- `explained-diffs.json`: 17 entries rewritten for this night (scenario_axis_cells row value, warnings, needs_user_input, missing_input, condition_unknown, base, exception in both the summary and run-ledger copies; `stdout_lines[]` migrations=280 to 283 (300, 301, 297); the two `table_state` keys) and 11 added (the audit row status, audit verdict, checks_passed, checks_warned and terminal in both copies, and `pipeline_runs[].status`), all following from the Q-287E suite cells. The other entries are unchanged.
- `docs/reports/witness/_catalog.json` lists the sixth cohort backup table `bylaw_resolution_lots_cohort_bak_20261110t1853z`, so the catalog matches the database.

## Findings and leftovers
1. **A second C1 ran beside the operator's C1.** At 12:52:38 a second C1 started while the operator's run (12:50:23) was in its self-observe. It refused at 12:52:54 on its snapshot guard (`before-lots.jsonl.gz` exists), exit 2, no lock, nothing written in the database (`c1.run.txt`; L:1193). Its read-only checks rewrote the `c1-*.out` files from 12:52:39 to 12:52:54; its log lines (L:598-1192) equal the first run's (L:2-596) line for line apart from the timestamps, so the files C4 later compared against (`c1-golden.sorted`, `c1-25hp.out`) hold the same pre-night reads. The operator's run then wrote `c1-plan.out` and `c1-before-eq.out` and passed at 12:53:31 (L:1199). The block's guard worked as designed. Card: C1 has no guard against a concurrent C1 before its snapshot step.
2. **Notes figures (N-4 a / DL-9 a).** The night patch carried the held axis figures (run 4414: results 26,845,673, units 1,015, texts 2,866, 708.5 MB, 24 min, scenario_axis_cells 398, date 2026-11-05) before the capture, so #44 is fresh. This night's own figures, from capture run 1 (pipeline_runs 4418): results 26,845,673, units 1,014, texts 2,868, 754.1 MB (the step's storage figure), 24.6 min, scenario_axis_cells 0, lots_gated 40,908, date 2026-11-10. They are held in `~/Buildo-scratch/mcbylaws/inc3/night/after-tmp/resolve-bylaws.notes.inc3-figures.json` for the next Layer 2 recapture. Until then the notes' `expected_shape[0].measured` knowingly carries the axis figures.
3. **The night ran on 2026-11-10, not 2026-11-11.** The timing ruling (b) moved it to 2026-11-11 (open-questions.md:402-405); the operator gave the go on 2026-11-10 once the pieces were built (open-questions.md:414-418).
4. **Cohort backup tables (L-1 a).** `bylaw_resolution_lots_cohort_bak_20261110t1853z` stays in the database, the sixth such table, as MB-26's and the axis night's did.
5. **This night's backups (L-4 a).** The C2 table backup (`n1/backup/`) and `n1/pre-inc3.dump` (970M) are kept until the operator's word.
6. **The axis-night scratch (L-2 a)** is due for archive-then-confirm now that C4 passed (v2 section X); nothing is deleted without the operator's typed confirm.
7. **Migrations 294 and 296** stay unapplied, held for the Layer 3 window (DL-10). 302 may now be applied, and MB-86 (298) may land in its own session (freeze lifted, open-questions.md:419).
8. **Stamp freshness (DL-2 a).** All 440,093 lots are at the tip's pair. The next commit that moves table_version or evaluator_version makes them stale again.
9. **Display (cosmetic, carried).** The forced-cohort plan still prints the bytea row_sha as raw bytes (L:1288-1307). It writes nothing; the axis card stands.

## Commits (branch `wf1/inc3-night-commit-1110` off `2e7976367`, worktree `~/Buildo-wt-inc3-night-commit`; not pushed)
1. `0a5548856`, the night recapture: both POST goldens, both witness traces, `_catalog.json`, `explained-diffs.json` and the notes (the night patch as captured).
2. This night record.
3. The OUTPUT panel record `docs/reports/panels/MB-27.json` for this night, when its seats have run.
