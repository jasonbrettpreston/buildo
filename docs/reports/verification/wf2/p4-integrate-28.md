# Verification index — wf2/p4-integrate-28

R-EZ says: *"Findings block the integration until fixed or ruled. The verification report is saved under
`docs/reports/verification/<branch>.md` and the integrate commit cites it."*

- **Integrate base:** `d6dc90d2` (= origin `wf2/deep-scrapes-restore-l0`, integrate-27)
- **Worktree:** ~/Buildo-wt-int28 (node_modules symlinked to ~/Buildo/node_modules; mobile/node_modules an APFS clone of ~/Buildo/mobile/node_modules, as int27)
- **Queue item:** H4 of `~/Buildo-scratch/session-1023b/NIGHT-QUEUE.md` (order confirmed by the operator 2026-10-25: batch-y import, H4, H5, CHAT-105, CHAT-106)
- Working files: ~/Buildo-scratch/int28/

## Merged branches (in order)

| # | Branch @ tip | Notes |
|---|---|---|
| 1 | `wf1/l2-night-land` @ `98272ffe` | fast-forward: 3c7ca535 Layer 2 resolve_bylaws (code, migrations 282 + 290, POST captures, traces, recipes, cohort.json, scorecards), dbcf84cb R-DK `legacy: "none"` (CHAT-129), 1e82e39f scorecard (resolve_bylaws 17/17, standard=V3), 98272ffe R-IX lock fix |
| 2 | `wf1/rulings-rec3` @ `b87b4ad7` | b733b0e0 CHAT-97, 5a120cca CHAT-98, beec193d CHAT-99 (R-KB), ca289366 CHAT-100, cecbb76c CHAT-101..120, 59d4f51a CHAT-121..123, b87b4ad7 CHAT-124..129 (R-KC) |

## Merge 1: wf1/l2-night-land @ 98272ffe (fast-forward)

- **Layer 2 numbers (first POST, 2026-10-24):** 496,536 parcels scanned, 440,093 lots, 40,908 gated, 23,324,929 results, 992 units, 2,840 texts; lots table 733 MB of the 1,300 MB budget (6.20 % with L3a, kill line 10 %); verdict WARN on scenario_axis_cells 597 only. R1 standalone: run 1 nonzero after the recovery.reset TRUNCATE, forced rerun 0 writes; R3 delete_reinsert bracket: 20 healed, forced rerun 0 writes; table_state hash f9dff7b2 on both.
- **Rulings applied at the night:** CHAT-114 (RB-D8 cell cache), CHAT-115 (M-60 evidence), CHAT-116 / CHAT-118 (R3 recipe, force_full env), CHAT-121 (step_timeout 125m), CHAT-126 (PRECAP-1 run before the retake), CHAT-127 (RB-D9 witness alias; R1 and R3 retaken on frozen text), CHAT-128 (cohort.json counters), CHAT-129 (two commits).
- **98272ffe:** 3c7ca535 deleted the R-IX placeholder case as it asked, but rule-map.json still named that file as R-IX's lock; handbook-rule-map.logic.test.ts failed 2 cases (arm e) in this lane's first full suite. Fixed on the lane branch red-first (`docs/reports/red-evidence/resolve_bylaws/r-ix-lock-red.json`); the first integrate attempt was aborted (`git merge --abort`) and rebuilt on the fixed tip.

## Merge 2: wf1/rulings-rec3 @ b87b4ad7 (CHAT-97..129)

- **Conflicts (both generated):** `docs/reference/bylaw-layer2-input.json` (regenerated: `generate-bylaw-layer2-input.mjs --write`, 6661 units, table_version 196bb790cd18; evaluator_version f16165c7 = the Layer 2 side, the version the captures were taken at) and `docs/specs/00-architecture/00_system_map.md` (`npm run system-map`, 116 specs). Then `report-fields.mjs --write` and `generate-amendment-index.mjs --write` (6661 units; it embeds the table_version), as int27 merge 3.
- **table_version note (owed, DB):** the rulings' register text moves table_version (e8ff6103 → 196bb790). Spec 134:48-49 keeps table_version out of the write guard and row_sha, so the next resolve_bylaws run should be one gated full run that writes 0 rows; not run here (DB write, operator).
- **CoA (rows keyed notice + n + clause; class, ours, ours_alt, city_value, limit compared):** wf1/l2-night-land tip → merged tree: 0 of 698 and 0 of 496 rows move. Inputs moved, so re-pinned with `coa-scorecard.mjs --pin` (CHAT-65.repin); totals unchanged; CHECK OK (pinned) on both; FLOORS OK.
  - 172: MATCH 387, DIFFER 29, NO ANSWER 46, OWED 88, DATA 24, NOT SCORABLE 25, NOT MODELLED 96, BY-LAW CHANGED 3.
  - 4D: MATCH 277, DIFFER 23, NO ANSWER 33, OWED 56, DATA 22, NOT SCORABLE 12, NOT MODELLED 70, BY-LAW CHANGED 3.

## Checks on the merged tree

- Every pre-commit generator `--check` rc 0 (~/Buildo-scratch/int28/gens-m2.txt); decision-log --check clean (80 logs, 371 decisions); spec-split-check clean (41 moves); step handbook and bylaw handbook (387 rules) up to date.
- Full suite (`VITEST_MIN_FORKS=8 VITEST_MAX_FORKS=8 npx vitest run`): 913 files passed, 123 skipped; 20,447 tests passed, 652 skipped, 936 todo; exit 0 (~/Buildo-scratch/int28/suite-m2.txt). `npm run test:db` not run (DB writes; operator).

## Owed / not in this integrate

- H5 verify-48: a fresh read-only verifier on this branch (Compliance, Integration, Reality-Check on the size and capture numbers); its findings are appended here.
- The table_version gated rerun above (operator DB job).
- Not merged here: wf2/v3coa-fghi-merge (verify-48c BLOCK F-1, cleared by CHAT-105), wf2/v3coa-cpp-1, wf1/excr-l-interior (HELD on CHAT-104 build), the RARMS patches (re-freeze night).
