# Night record: MB26-NIGHT-1 (MB-26, the first Layer 2 night, 2026-11-03)

McBylaws task MB-26, lane D, local database only (127.0.0.1:54322). The night was a TRUNCATE-RELOAD of the three Layer 2 tables (`bylaw_resolution_lots`, `_texts`, `_units`) from the tree `dd7c080f2`, with migration 293 applied alone, the three held `scripts/resolve-bylaws.notes.json` lines and the #44 witness recapture.

- Pre-registration: `scripts/analysis/bylaw-validation/coa-expected/prereg-MB-26-1.json` (`dd7c080f2`, committed alone before the go), with its Q-C4 a dated note (M-246).
- Checklist: `~/Buildo-scratch/mcbylaws/MB-26/night-checklist-final.md` (C1 to C6). Log and evidence: `~/Buildo-scratch/mcbylaws/MB-26/night/` (`night.log`, `cap1.out`, `cap2.out`, `c4tail.out`, `C4-tail.zsh`, `diff-25.txt`, `runrows.txt`, `c4-stop-findings.md`).
- Operator rulings: card `~/Buildo-scratch/p2close/CARD-mb26-increment1-night.answered.md`.
  - Go: "Mb-26 is approved assuming its complaint".
  - Q-NIGHT B (verbatim "Q-NIGHT-B"), Q-MIG 1, Q-WRAP 1, O-n1 1, O-n2 1, O-n3 1.
  - Delegation to lane D: "put it in the db lane"; "Lane D: go for the MB-26 night, C2 onward".
  - The C2 fix: "night fix approved".
  - After the C4 stop: "Q-C4 a".
- Go token for the night id: `OPERATOR-GO MB26-NIGHT-1`.

## What the night stored
- The tree `dd7c080f2` holds MB-18 (k) `ac3f96d0c`, (j) `34567ff62`, (i) `ff601b393` and MB-27 sqrt `404653635`. C1 checked each as an ancestor of the tip.
- The tree also holds every commit since night D (2026-10-28). Among them is the no-number-rules round `d01e14584` (batch 2026-10-29-aa), which this night stores for the first time. The night prereg does not list it; see "Disclosed moves".
- Versions: table_version `4d18b9c1…` / evaluator_version `51a759e1…` became `c4ede8d0…` / `4b589081…`, one pair on all 440,093 rows.
- Excluded, as ruled:
  - the held patches MB-53, 54, 55, 56, 45d, 45f (O-n1 1);
  - migration 295 and the roof-form axis (Q-NIGHT B);
  - the P3-0 oracle-only commit.

## Timeline (local time EST, UTC-5, 2026-11-03; every block printed its checks and refused on a miss)
| Block | Time | Result |
|---|---|---|
| C1 | 13:53, 13:53 | REFUSED twice before any write. First, the prereg was not yet in the tip tree (the zsh `$T:s` modifier bug, fixed). Second, a vitest process was running. |
| C1 | 13:57:41 | PASS. Tip `dd7c080f2`; NIGHT3 digest `5072f2c00b0f`; gate OK; 440,093 lots at width 53, one version pair; 708 MiB; table backup measured at 205 MiB. |
| C2 | 13:58:44-14:00:17 | dblock taken (owner `mb26-night`). Table backup (files under `backup/`, no DB table) verified equal to live. STOP at the dump check: `pg_restore -l \| grep -q` raised SIGPIPE under pipefail. No DB write. |
| C2-tail | 14:17:44 | PASS (operator "night fix approved"). The dump was checked from a file: 966 MB, 103 table-data entries, `bylaw_resolution_lots` data listed. |
| C3a | 14:18:08 | PASS. Migration 293 applied alone (`migrate.js --only=293`). CHECKs at 54, NOT VALID. The view lists the new pair. |
| C3b | 14:18:31 | PASS. Capture worktree `~/Buildo-wt-mb26cap` at `dd7c080f2` plus the notes patch (54 slots). |
| C3c/C3d | 14:18:50-15:05:27 | TRUNCATE of the 3 tables, then the forced-full capture. Run 1 (pipeline_runs 4410) wrote 440,093 lots. The rerun proof (4411) wrote 0 rows on 3 tables: PASS. |
| C3e/C3f | 15:06:54-15:53:03 | Forced-cohort capture (4412, 4413). Backup table `bylaw_resolution_lots_cohort_bak_20261103t2006z`, 20 lots perturbed and healed, POST-RESTORE OK. Then both 293 CHECKs VALIDATED. |
| C4 | 15:53:32 | STOP at `i_depth = 385769 (want 391720)`. No database write after the stop (findings: `c4-stop-findings.md`). |
| C4-tail | 17:14:24 | PASS against the ruled figures (operator "Q-C4 a"). |
| C6 | 17:14:29 | Night closed, dblock released. |

## C4 against the ruled figures (C4-tail, `c4tail.out`)
| Check | Measured | Want |
|---|---|---|
| lots, width 54, inputs_defaulted (I10), row_sha 64-hex | 440,093; 0 off-width; 0; 0 off-form | as registered |
| versions | `c4ede8d0…`/`4b589081…` on 440,093 rows | as registered |
| (k) averaging_distance_m principal | applies 1,991,285 (all 15, winner `10.5.40.70(1)#(1)(A)`); not_evaluated 209,180 | as registered |
| (j) front_setback_fallback_m principal | applies 1,991,285; not_evaluated 209,180; new rows 2,200,465; parcel 428050 detached_house applies 6 | as registered |
| front_setback_m rows | 2,200,465 | as registered |
| (i) detached_house principal applies | depth 385,769 (+41,654); length 385,769 (+41,654); side 394,729 (+4,590); street 87,139 (+713) | ruled (Q-C4 a); registered +47,605 / +47,605 / +4,496 / +987 |
| frontage reason left on applies | 0 | 0 |
| A0067 / A0097 depth and length numeric | 4 | 4 |
| 25-lot image | 58 changed lines, only the allowed pairs (`diff-25.txt`) | allowed pairs only |
| storage, 3 tables | 740 MiB | ruled 740 (registered band 715-730); hard stop above 780 held |
| runs 4410-4413 | completed_with_warnings / resolved_with_warnings; warnings `["scenario_axis_cells: 398"]`; errors `[]`; lots_gated 40,908; 0 FAIL audit rows | ruled warning 398 (registered 597) |

Cause of the four (i) misses and the warning: one counting fault. The registered deltas counted rows by their stored reason, not the rows that become valued. A cell reports one reason, and rows whose first reason was the frontage fact had a second blocker that now shows. Checklist D4 named this residual.

The 199 RD lots (side_setback_m needs_user_input to applies 0.9, winner `900.3.10(287)#(287)[SSP](C)`) are also item (i) (M-406). The dated correction in `c4-stop-findings.md` traces this. The same 199 lots explain scenario_axis_cells 597 to 398.

## Every stored-image move of the night (read-only, per lot and per slot)
- Method:
  - Representative class detached_house, the class the step's by_reason counts read.
  - Before: the `bylaw_resolution_lots` and `_texts` data of `pre293.dump`, decoded with `pg_restore -a` to a file.
  - After: the live tables, read with `COPY ... TO STDOUT` in a read-only transaction.
  - Every lot is joined by parcel_id, with the 53 old slots mapped onto the 54 new ones by pair name.
- Every lot-slot whose status or reason code changed is listed below. The full reason text was also compared, and no cell changed only its reason text within the same code.
- On the 53 shared slots, no cell that stayed applies changed its value, value kind or winner.
- The class_results of the other four classes were not compared cell by cell; C4's per-class counts cover (k), (j) and (i).
- Grain: the counts below are lots, that is lot-slot cells of the representative class. C4's 1,991,285 / 209,180 / 2,200,465 are view rows over 5 classes.
- "Gated" on a slot means 41,836 lots: the 40,908 lots with a lot gate plus 928 ungated lots whose slot is exception-gated. Of the 399,185 ungated lots, 398,257 have the slot applying.

| Slot (structure, target) | Before | After | Lots | Source |
|---|---|---|---|---|
| principal averaging_distance_m | not_evaluated no_candidate | applies 15 | 398,257 | (k) `ac3f96d0c` |
| principal front_setback_fallback_m (new) | (no slot) | applies | 398,257 | (j) `34567ff62`, migration 293 |
| principal front_setback_fallback_m (new) | (no slot) | not_evaluated, gate reason (exception_not_authored 40,195; lot_metric_missing 1,108; ambiguous_zone 449; label_exception_mismatch 79; label_unparsed 5) | 41,836 | (j) |
| principal building_depth_m | existing_building_facts | applies / no_candidate / named_lots_only | 41,654 / 5,847 / 104 | (i) `ff601b393` |
| principal building_length_m | existing_building_facts | applies / no_candidate / named_lots_only | 41,654 / 5,847 / 104 | (i) |
| principal side_setback_m | existing_building_facts | applies / condition_unknown | 4,391 / 105 | (i) |
| principal side_setback_m | needs_user_input | applies 0.9 | 199 | (i) |
| principal side_setback_street_m | existing_building_facts | applies / condition_unknown | 713 / 274 | (i) |
| garden_suite gfa_m2 | applies 120 (winner `150.7.60.50(4)#(4)(A)`) | not_evaluated missing_input:main_building_gfa_m2 | 386,380 | no-number-rules round `d01e14584` |
| laneway_suite gfa_m2 | not_evaluated no_candidate | not_evaluated missing_input:main_building_gfa_m2 | 386,380 | no-number-rules round `d01e14584` |

- Dictionaries. Texts went 2,843 to 2,848:
  - added: the six x.40.70(1) references and `missing_input:main_building_gfa_m2`;
  - removed: `existing_building_facts:lot_frontage_m` and `150.7.60.50(4)`.
- Units went 992 to 999:
  - added: `10.5.40.70(1)#(1)(A)`; the five `…40.70(1)#whole` units; `10.20.40.70(3)#(3)(A)` (20 lots of (i)); `900.3.10(287)#(287)[SSP](C)`;
  - removed: `150.7.60.50(4)#(4)(A)`.
- The golden G8 keys and the arithmetic that ties each by_reason count to these rows are in `docs/reports/golden/resolve_bylaws/explained-diffs.json`.

## Disclosed moves (not in the night prereg)
- **Suite floor area, `d01e14584`.** On 386,380 lots, in all 5 classes (1,931,900 class rows per suite structure, 3,863,800 for both), garden_suite and laneway_suite gfa_m2 now read `not_evaluated missing_input:main_building_gfa_m2`.
  - Before, the garden suite stored 120 m² (`150.7.60.50(4)(A)`) and the laneway suite no_candidate.
  - Mechanism: `d01e14584` turns `150.7.60.50(2)` and `150.8.60.50(2)` into a max gfa_m2 limit "= main_building_gfa_m2" (`docs/reference/bylaw-layer2-input.json`). Layer 2 holds no main_building_gfa_m2 (the ruled fill order, plan facts, then footprint x storeys, then the maximum build, is not available to Layer 2). So under strict I10 the cell is missing_input on every lot where the limit applies.
  - This is the stored form of the ruled no-number-rules round (batch 2026-10-29-aa: "the model evaluates the suite floor area against the main building (input main_building_gfa_m2, 150.7/150.8.60.50(2))"). That round landed after night D, so this night stores it for the first time.
  - The night prereg's `landed_items` does not list it, its `layer2_night` registers no suite figure, and no C4 check reads a suite slot. The move was found after C6, when this record and the explained diffs were built.
  - Q-C4 a does not rule it. The operator ruled it after the panel (Q-NC1 a): it is accepted as a disclosed finding for increment 4, where the suite rows must read the main-building floor area from Layer 3. No increment 4 work moves forward. The queue carries the dated note.
- **Garden suite 120 m² to not evaluated.** This is a stored value becoming not_evaluated, on 386,380 lots. On every target that C4 checks, no row went from applies to not_evaluated.

## Named exceptions and leftovers
- **`--verify` named exception (Q-MIG 1, an exception to README §3 rule 2).** Before the night, `migrate --verify` printed "7 missing, 3 drift". After 293 alone it prints 6 missing and 3 drift:
  - six seed migrations are held: 276, 279, 288, 291, 292, 294 (294 is MB-35's window);
  - three checksum drifts have no schema difference: 254 and 255 (applied from a pre-commit draft; the live schema matches the file) and 281 (one comment word);
  - `--verify` stays red by design until those land.
- **Leftover cohort backup table.** `bylaw_resolution_lots_cohort_bak_20261103t2006z` (20 rows) is KEPT, per decision D2 (operator: no drop without a separate word).
  - The capture's own `docs/reports/witness/_catalog.json` lists it, so the committed catalog matches the DB.
  - If the table is dropped later, that catalog entry goes in the same change (the CHAT-196 precedent, `81fe7b8da`).
- **RB-D10.** The night-recapture commit removes the two RB-D10 `value.ratio` explained-diff entries (MB-18 plan M18-15).
  - The M-409 tooling drops the ratio from the compared golden, so the recapture's own net-new G8 compare shows the one-time drop of `value.ratio`.
  - By operator ruling Q-NC3 a, one new entry per path explains that drop: 0.5446574519230769 -> 0.5698798076923077 (forced 0.5446875 -> 0.5699098557692308), about 740 MiB, PASS, under the 780 MiB stop, pointing at M-406, M-245, M-423 and Q-C4 a. The G8 compare of the recapture against `dd7c080f2` reads 100 diffs, 0 unexplained.
  - Closing the RB-D10 ledger row is a lane R edit and is not in this record.
- **Not done here:**
  - MB-18 plan 16.4 F-3 names "a NEW defect-ledger row for the 54-slot change". It is added in its own commit as RB-D11 (lane R work done by lane D).
  - The `scripts/resolve-bylaws.notes.json` prose still gives the night-D figures (23,324,929 results, 2,840 texts, 992 units, warning 597). Updating them was asked for in the recapture commit, but the file is in resolve_bylaws' source fingerprint. The edit makes both POST goldens stale and the pre-commit #44 witness check FAIL (`FAIL:STALE:resolve_bylaws:standalone`, `standalone.forced`). So the figures wait for the next Layer 2 recapture (D-4, deferred by the orchestrator, recorded in the queue note). The prepared edit is at `~/Buildo-scratch/mcbylaws/MB-26/resolve-bylaws.notes.d4-figures.json`.

## Commits (throwaway worktree `~/Buildo-wt-mb26cap`, branch `wf1/mb26-cap` off `dd7c080f2`; not pushed)
Dated touch-up 2026-11-03: the commits as they landed. This list replaces the planned five-item list of the first version of this record (in git history):
1. `87f992dd4`, the night recapture. It holds the notes lines, both POST goldens, both witness traces, the catalog and `explained-diffs.json` (G8 against `dd7c080f2`: 100 diffs, 0 unexplained).
2. `b6df1fd81`, this record and the OUTPUT panel record `docs/reports/panels/MB-26.json`.
3. `1a041a6ea`, the defect-ledger row RB-D11 for the 54-slot change (MB-18 plan 16.4 F-3), CLOSED at `87f992dd`.
4. `422b0024b`, `prereg-MB-26-2.json` (round 47, zero moves), committed alone. The loop gate joins a new loop record to a prereg that the commit directly below adds, and `prereg-MB-26-1.json` already exists, so this prereg is that commit (Q-NC2 a).
5. `9265a886a`, the Q-C4 a dated note on `prereg-MB-26-1.json`, with the loop record `docs/reports/loop-records/1/round-15.json` written by the loop runner: 1,194 cases, 0 moved against round-14.
6. `fbfe4f630`, the queue dated note (`.cursor/MCBYLAWS-QUEUE.md`, MB-26): the Q-NC1 a finding for increment 4, the D-4 deferral and the prereg round shift.
7. This touch-up of the night record and the panel record.
