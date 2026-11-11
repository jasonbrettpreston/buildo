# Night record: INC4-NIGHT (MB-27, the increment-4 Layer 2 night, 2026-11-11)

McBylaws task MB-27, local database only (127.0.0.1:54322). The night applied migration 304 alone (the option view lists its third class, `house_with_secondary_suite`), then did a TRUNCATE-RELOAD of the three Layer 2 tables (`bylaw_resolution_lots`, `_texts`, `_units`) at 61 slots (storage form b, no width move) from the tip `5550cb5a3` with no night patch, and retook the #44 witness captures. It restamped all 440,093 lots (D-6 re-ruled a).

Citations: `L:<n>` is a line of `~/Buildo-scratch/mcbylaws/inc4/night/night.log`; other files are in `~/Buildo-scratch/mcbylaws/inc4/night/` unless a path is given.

- Pre-registration: `scripts/analysis/bylaw-validation/coa-expected/prereg-MB-27-48.json` (round 154), committed alone as `5550cb5a3` on `6b5ef8e22` (increment 4 landed) and pushed before the go; its `layer2_night` block holds the complete dry-run transition table (17,029 transitions, 3,110,418 moved cells, 128,477,389 unchanged), the item table, the x.30.40 prediction, the 25-lot images and the re-measured G-STOR. The dry run ran on `6b5ef8e22`, the prereg's parent, with the frozen harness (`DRYRUN.sha256` 51128cf0) against a git-archive of `2e7976367` (the increment-3 night tree that wrote the stored rows).
- Plan: `~/Buildo-scratch/mcbylaws/inc4/build/NIGHT-STEPS.md` (steps 1-5) and the run sheet `RUN.md` (blocks b1-b6, the increment-3 C1-C6 form regrouped). Constants: `blocks/expect.zsh`; block files `blocks/` (sha256 in `blocks/BLOCKS.sha256`); the NIGHT3 library unchanged (`NIGHT3.sha256` digest `5072f2c00b0f`). Evidence: `night.log`, `b1-*.out`, `b5-*.out`, `obs/`, `runrows.txt`, `cap1.out`, `cap2.out`. Refuse-path self-check before the night: `SELFCHECK.txt` (16 runs without the go, each exit 2, nothing written).
- Storage form: **b** (width 61). G-STOR re-measured read-only on `6b5ef8e22` before the prereg (`gstor-inc4.out`): P_up **770.94 MiB**, PASS against the 780 MiB stop. The record file `docs/reports/storage-gates/MB-27L2-G-STOR.json` still carries the increment-3 measure (768.35) with the re-bound version fields; the re-measure is carried by the prereg.
- Operator rulings:
  - D-6 re-ruled (a), 2026-11-11: "1 a 2. y 3. a 4. will we need to build this later.. we have the tokens now 5. yes and yes recommend": an increment-4 Layer 2 night carrying the E8 hold and the houseplex family-A condition (`~/Buildo-scratch/mcbylaws/inc4/DECISIONS-v2.md`).
  - **The go**, verbatim: "go OPERATOR-GO INC4-NIGHT" (2026-11-11). The lock records it: `dblock taken (mb27-inc4-night, INC4-NIGHT, go: OPERATOR-GO INC4-NIGHT)` (L:869). The orchestrator ran b1 to b6 on that word.

## What the night stored
Every item was ruled and landed in increment 4 before the night; the night stores them and rules nothing new. Counts are cells over all classes, from the prereg items and the night's observe pass (`obs/transitions.tsv`, bound to the dry run and the prereg by b5 T1-T3, and re-classified by `blocks/items.awk`: `b5-items.tsv` equals the prereg items).

| Item | Ruling | Cells | What moves |
|---|---|---|---|
| S1 suite option slots listed | migration 304 (M-379 dated note, D-6 a) | 3,080,651 | the 7 option slots of house_with_secondary_suite principal, `-` to a cell on every lot (7 x 440,093). No value moves: every suite option cell equals the stored detached_house option cell (prep: 3,080,651 of 3,080,651; b5 `suite_option_ne_house` 0 on the live view, L:1054) |
| S2 suite principal lot_coverage_pct | the E8 hold (5 vocab unit_application rows, dated note) | 14,789 | the suite cell won by 10.x.30.40(1)#(1)(A), (B) or (D) moves to the exception figure or not_evaluated, as the house (families A 6,549, B 7,808, B' 81, C 351; the addendum's stored count) |
| S3 detached_houseplex family A | the houseplex family-A condition (CARD-D4-E8-FAMILY-B a) | 6,549 | principal lot_coverage_pct, (B) unregulated to the 900.* exception figure |
| S4 semi_detached_houseplex family A | the same condition | 5,819 | the same move (NIGHT-STEPS estimate about 5,800) |
| S5 suite garden_suite + laneway_suite lot_coverage_pct | the E8 hold | 2,610 | the ancillary coverage cells under the hold (estimate about 2,500) |
| Restamp | D-6 a | all 440,093 rows | `dc82bfe6d3b4…/54c20374745f…` to `4e7ea5d17e90…/54c20374745f…` (L:1035) |

- 0 detached_house cells moved, 0 permission words (`b5-house.out`, `b5-perm.out`); 0 cells moved on the 25 lots for the three classes (`b5-diff-25.txt` empty; `g25-allowed.txt` empty, as registered).
- x.30.40 winners over a 900.* house cell, after the night (`b5-x3040.out` = `blocks/x3040-want.txt`): the suite keeps none of (A), (B), (D); detached_houseplex (A) 81 and (D) 7,808; semi_detached_houseplex (A) 81 and (D) 5,090. Before the night each class held (B) 6,549 (semi 5,819) as well. The houseplex (D) and (A) cells are families B and B': the zone prevails there by the D-4 ruling, which ships with a later increment; NIGHT-STEPS step 5's "no (B)/(D)" wording holds for the suite only, and b5 bound the dry run's figure.
- Width stays 61 (54 base pairs + 7 option pairs, `b1-width.out`); stamps stay bytea. The option view lists 3 classes, 7 slots, width 61 (L:905-915).
- Excluded, as ruled: every held migration (276, 279, 288, 291, 292, 294, 296); T3 found no unregistered key.

## Timeline (local time EST, UTC-5, 2026-11-11; every block printed its checks and refused on a miss)
| Block | Time | Result |
|---|---|---|
| b1 preconditions, read-only | 14:49:06-14:49:10 | PASS (L:1-867): tip `5550cb5a3` = the prereg alone on `6b5ef8e22`; prereg header round 154, G-STOR 770.94 PASS; dry-run shas = prereg; migrations after 295 as listed, 304 its blob and unapplied; `Verify: 8 missing, 3 drift` (L:37); memory free 79 % (L:16); `440093|440093|1`, old pair, bytea, 12 CHECKs, 754.13 MiB / 95,213 pages; the 25-lot images of 3 classes equal to the prep reads |
| b1 lock, table backup, whole-DB dump | 14:49:10-14:50:49 | PASS (L:869-879): dblock owner `mb27-inc4-night`, the go recorded; 3-table backup verified; `pre-inc4.dump` 969M, 113 table-data entries (L:876); `pr_id0` 4434 |
| b2 migration 304 alone | 14:50:57-14:51:00 | PASS (L:880-923): `--only=304 --dry-run` printed `run [304_…]` and the 7 held files HELD (L:887-888); 304 applied (OK 21 ms, L:897); recorded 1; held still held; classes house, houseplex, suite 1 each; 7 slots; width 61; 54 base pairs; 0 unvalidated CHECKs; lots and the old pair unchanged |
| b3 harness compare, read-only | 14:51:07-14:53:50 | PASS (L:924-928): snapshot of 440,093 lots; self-observe 0 moves; every stored row_sha equal to the prep dry run's before row (`b3-before-eq.out` `440093 440093 0`) |
| b4 capture tree, TRUNCATE | 14:54:01-15:41:26 | `~/Buildo-wt-inc4cap` at `5550cb5a3`, width 61, input current (L:929-935); the TRUNCATE statement returned at 15:41:26, 47 min 23 s after `step truncate` (L:936-937). See finding 1 |
| b4 capture 1 + rerun proof | 15:41:46-16:35:49 | PASS (L:938-964): run 4435 (started 20:41:36Z) wrote 440,093 lots by 16:11:47 (L:952); duration 26.7 min; `RC=0`, rerun proof PASS, git_head `5550cb5a3c96…` |
| b4 forced-cohort capture | 16:35:50-17:29:14 | PASS (L:965-1025): 20 ungated lots backed up to `bylaw_resolution_lots_cohort_bak_20261111t2135z`, healed, post-restore cohort equals its before-image, `RC=0`; both witness traces recaptured; 440,093 lots; 12 CHECKs validated (L:1023) |
| b5 verify, read-only | 17:29:19-17:32:35 | PASS (L:1026-1891), below |
| b6 release | 17:32:40 | PASS (L:1892-1895): dblock released |

Machine time b1 to b6: 2 h 43 min 34 s (14:49:06 to 17:32:40), of which 47 min 23 s was the TRUNCATE wait; without it 1 h 56 min, the RUN.md estimate. The two captures took 54 min and 53 min. No stop.

## Stops
None. Every block printed PASS and exit 0.

## b5 against the prereg (L:1026-1891)
- lots 440,093 (L:1029); width 61 on every array, 0 off (L:1031); octet_length 32 on every stamp, 0 off (L:1033).
- restamp through the stamps view: one pair `4e7ea5d17e90…|54c20374745f…|440093` (L:1035). I10 0 (L:1037). I14 0 (L:1039). 12 CHECKs validated (L:1041).
- T1: `obs/transitions.tsv` and `obs/unchanged.tsv` equal the dry run's byte for byte; the class|structure|target aggregate equal. T2: row_sha 440,093 of 440,093 equal to the dry run's prediction (`b5-rowsha.out`). T3: 0 unregistered, 0 count differs, 0 registered absent (`b5-reg.out`).
- The expected-move table: S1 3,080,651, S2 14,789, S3 6,549, S4 5,819, S5 2,610, nothing else (`b5-items.tsv`, L:1042-1046).
- Option view: `detached_house,detached_houseplex,house_with_secondary_suite` (L:1052); suite option values unlike the house's: 0 (L:1054).
- Run rows 4435-4438: `completed|resolved`, warnings `[]`, errors `[]`, lots_gated 40,908, 0 FAIL audit rows (`runrows.txt`).
- Layer 3 reads the tree's table_version through the stamps view: `4e7ea5d17e90…|440093` (L:1887).
- The 7 file-only locks on the capture tree (disclosure-carriage, disclosure-carriage-stale, golden-25, increment4-suite-gain, suite-unit-cap, bylaw-e8-coverage-families, bylaw-848-in-force): 7 files, 143 tests passed (L:1888; `b5-locks.out`).
- **Storage** (Q-S6 a): the three tables measure **754.95 MiB** (L:1881) against the re-measured P_up **770.94 MiB** and the **780 MiB** stop: 15.99 MiB under the prediction, 25.05 MiB under the stop. The step's own `storage_within_budget` at capture run 1 reads ratio 0.580703125 of 1,300 MiB (754.91), PASS. Baseline before the night 754.13 MiB / 95,213 pages.

## Every stored-image move of the night (`obs/transitions.tsv`)
3,110,418 cells moved in 17,029 transitions; 128,477,389 unchanged; every key belongs to exactly one item (prereg items.classification: 17,029 keys, 0 unclassified). The step's audit counts the representative class detached_house, which moved 0 cells, so its by-reason and winner counts are unchanged; texts 2,868 and units 1,014 are unchanged (`table_state` in both POST goldens). The golden deltas are run identity, timings, `equivalence_checked` 12,017 to 12,444, the three content hashes, the storage ratio and the DB's applied migration count `migrations=283` to `288` (298, 302, 303, 306 and 304 applied since the increment-3 night); G8 24 diffs, 0 unexplained by the existing `explained-diffs.json`.

## The witness recapture
- Both POST goldens and both witness traces retaken from the recorded recipe on `5550cb5a3` with no night patch (git_head `5550cb5a3c96…`). `step-validate --step=resolve_bylaws --fast`: 17/17, V3, G8 24 diffs 0 unexplained, `#44 WITNESS resolve_bylaws: PASS`.
- `docs/reports/witness/_catalog.json` adds the seventh cohort backup table `bylaw_resolution_lots_cohort_bak_20261111t2135z`. The harness's catalog output also listed six columns that migration 306 (MF-62, applied to the local DB from another branch) added; they are left out so the catalog names this tree's schema only.
- The Rule 13 block of the resolve_bylaws assessment was regenerated (`step-validate --all --fast --write` in a read-only DB session): G8 diffs 0 to 24 and P3 records_meta 4,734 B to 4,727 B; no other report moved. The fast migration count reads the tree (294), so the DB's later 305, 307 and 308 (applied after the night by the orchestrator) move nothing.

## Findings and leftovers
1. **The TRUNCATE waited 47 min 23 s** (L:936-937). The statement is one psql call with no lock_timeout; it returned without error and everything after it passed. The log records no cause; a lock held on one of the three tables by another session is the likely one. Card: b4 should set a lock_timeout and print the blocking pids before the TRUNCATE.
2. **Notes figures (carried from the increment-3 panel, N-4 a).** This night ran no notes patch, so `scripts/resolve-bylaws.notes.json` `expected_shape[0]` still carries the axis figures; the increment-3 night's figures stay held in `~/Buildo-scratch/mcbylaws/inc3/night/after-tmp/resolve-bylaws.notes.inc3-figures.json`. This night's own figures, from capture run 4435: results 26,845,673, units 1,014, texts 2,868, 754.9 MiB, 26.7 min, scenario_axis_cells 0, lots_gated 40,908, date 2026-11-11. Filling them after the capture would make both POSTs stale (#44); they wait for the next Layer 2 recapture, which fills `what` and `measured` together before its capture.
3. **Cohort backup tables (L-1 a).** `bylaw_resolution_lots_cohort_bak_20261111t2135z` stays in the database, the seventh such table.
4. **This night's backups (L-4 a).** `backup/` and `pre-inc4.dump` (969M) are kept until the operator's word.
5. **Migrations.** 276, 279, 288, 291, 292, 294 and 296 stay unapplied (held). 305, 307 and 308 were applied after b6 by the orchestrator's DB job (MF-19, MF-53, MB-93); 306 is applied from MF-62's branch. None of them is on this tree.
6. **Stamp freshness (DL-2 a).** All 440,093 lots are at the tip's pair. The next commit that moves table_version or evaluator_version makes them stale again.
7. **The G-STOR record file** still holds the increment-3 measure; the re-measure (770.94) lives in prereg 48 and here. A record commit is optional and was not asked for.

## Commits (branch `wf1/mb27-inc4-night-1111` on `5550cb5a3`, worktree `~/Buildo-wt-inc4n`; not pushed)
1. `05075508b`, the night recapture: both POST goldens, both witness traces, the `_catalog.json` cohort entry and the resolve_bylaws Rule 13 block.
2. This night record.
3. The OUTPUT panel record `docs/reports/panels/MB-27.json` for this night, when its seats have run.
