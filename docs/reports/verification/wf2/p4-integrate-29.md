# Verification index — wf2/p4-integrate-29

R-EZ says: *"Findings block the integration until fixed or ruled. The verification report is saved under
`docs/reports/verification/<branch>.md` and the integrate commit cites it."*

- **Integrate base:** `db37b2e8` (wf2/p4-integrate-28, verify-48 PASS-WITH-NOTES, F-1..F-3 ruled/fixed; not yet pushed — integrate-28 lands first)
- **Worktree:** ~/Buildo-wt-int29 (node_modules symlinked to ~/Buildo/node_modules; mobile/node_modules an APFS clone, as int27/int28)
- **Queue:** ~/Buildo/.cursor/QUEUE.md "NOW 2026-10-25" (operator away; approvals CHAT-133..139)
- Working files: ~/Buildo-scratch/int29/

## Merged branches (in order)

| # | Branch @ tip | Lane verify | Notes |
|---|---|---|---|
| 1 | `wf1/rulings-rec3` @ `7e5e9f72` | decision-log / spec-split clean | CHAT-133..139 register notes (batch 2026-10-25-b) |
| 2 | `wf1/excr-l-interior` @ `3769508a` | verify-48a (d27d1930; BLOCK cleared) + **verify-48e PASS** (3769508a) | d27d1930 CHAT-100 L-INTERIOR option B (HELD for the CHAT-100 integrate, now here) + 3769508a CHAT-104 STREET-DIR |
| 3 | `wf2/v3coa-ledger-flips` @ `4d1113ab` | **verify-48f PASS-WITH-NOTES** (N1 fixed in 4d1113ab) | df50be8a R-JD flips (21 CLOSED · ②, COA-D7 back to OPEN per EVE.LEDGER-1) + 4d1113ab cost-rollback runbook names the CoA logic variable |
| 4 | `wf2/v3coa-cpp-1` @ `41153d12` | verify-48b PASS-WITH-NOTES (①) + **verify-48g PASS-WITH-FINDINGS** (②; F1/F2/F4 fixed in 41153d12) | 8cca8b0d + 3c1a80a6 ①, 2256cf36 ② (CHAT-138), 7de96a34 PRE captures, 3fffa353 PRE traces + catalog |
| 5 | `wf2/v3coa-fghi-merge` @ `2003fb42` | verify-48c (BLOCK F-1) → CHAT-105 → **verify-48c2** (F-1/F-2 cleared; G-1 fixed 2003fb42) | F/G/H/I ① merges + fixes, ec981c21 scorecards, 2003fb42 |
| 6 | `wf1/b10-door` @ `732bbe97` | **verify-48h PASS-WITH-NOTES** | B10 door, coa-2026-d prereg + blind round, values batch, ingest captures |

## Merge 1: wf1/rulings-rec3 @ 7e5e9f72

- No conflicts. bylaw-layer2-input.json current (table_version 196bb790, 1931 input files).

## Merge 2: wf1/excr-l-interior @ 3769508a (CHAT-100, CHAT-104)

- **Conflicts (both generated):** bylaw-layer2-input.json (regenerated: 6661 units, table_version 81f50b78d131 — evaluate.mjs moves the evaluator stamp) and maxbld-amendment-index.json (`generate-amendment-index.mjs --write`, it embeds the table_version); then report-fields.mjs --write, system-map. Every generator --check rc 0 (~/Buildo-scratch/int29/gens-m2.txt).
- **CoA (rows keyed notice + n + clause; class, ours, ours_alt, city_value, limit):** integrate-28 tip → merged tree: 0 of 698 and 0 of 496 rows move (the lanes and verify-48e said 0). Inputs moved, so re-pinned (`coa-scorecard.mjs --pin`, CHAT-65.repin); totals unchanged; FLOORS OK.
- The register text CHAT-100/104 (M-285, M-350 notes) is already on this tree from rulings-rec3 (verify-48e LOW (process) note resolved by merge 1).

## Merge 3: wf2/v3coa-ledger-flips @ 4d1113ab

- No conflicts (the defect-ledger rows merged clean beside integrate-28 RB-D8/RB-D9 and the rulings).
- verify-48f notes carried: N2 partial lock coverage on CCS-D3, CCT-D4, CCT-D5, CCCE-D2, CCCE-D8 and four OPEN rows with fixes but no ② lock (LCTP-D9, LCTP-D10, CCT-D7, CCCE-D10) — follow-up locks; N3 small text points.

## Merge 4: wf2/v3coa-cpp-1 @ 41153d12 (classify_permit_phase ①②, PREs)

- **Conflicts: 46 files.**
  - 38 `docs/reports/*-assessment.md`: in every one both sides changed only the generated `## Validation scorecard (generated)` block (~/Buildo-scratch/int27/bin/blockcheck.mjs: outside text base==ours==theirs on 38/38). Each resolved to the integrate side whole (`git show :2:`), never a hunk mix. The blocks are stale for the merged tree; **a DB-backed `step-validate --all --write` is owed (H lane)** as its own generator-output commit.
  - Generated, regenerated: logic-variables-registry.md (851 vars), logic-variable groups, maxbld-report-field-inventory.{json,md}, 122-conversion-roadmap.md, 122-programme-backlog.md, programme-items.json evidence, 132 handbook Table 1b (39 -> 40 steps), system map.
  - Hand-merged to the union: execution-budget-disposition.json (pending list keeps resolve_bylaws AND classify_permit_phase; pending_why = base + both sides' appended notes, both pure appends; CRLF kept); conversion-roadmap.infra.test.ts pendingBatch 16 (each side +1 from 14); sql-witness-fixture.logic.test.ts ADOPTION 19 / 8 / 18 (zero_statement +1 resolve_bylaws, legacy_oracle_excluded +1 classify_permit_phase).
- **Checks:** every generator --check rc 0 (~/Buildo-scratch/int29/gens-m4.txt); decision-log clean (381); spec-split-check clean; 22 targeted files, 577 tests passed.
- Migration numbering: 287 (p37, uncommitted), 288 (v3merge), 290, 291 (this, not applied), 292 (cpc2, uncommitted).

## Merge 5: wf2/v3coa-fghi-merge @ 2003fb42 (V3-COA F/G/H/I + CHAT-105 regeneration + G-1 fix)

- Lane verifies: verify-48c BLOCK F-1 → CHAT-105 ec981c21 (DB-backed regeneration) → **verify-48c2** confirmed F-1/F-2 cleared, found G-1 HIGH (two it.fails flipped by the new blocks) → fixed 2003fb42 (it.fails → it, compute_phase_calibration D6 precedent).
- **Conflicts: 56 files.**
  - 43 assessment files: 42 with only the generated block changed on both sides (blockcheck) → integrate side whole; `2026-10-19-batch5-p1-4-assert-lifecycle-phase-distribution-assessment.md` changed outside the block only on the V3MERGE side (lane F's ② text) → V3MERGE side whole. All blocks are stale for the merged tree.
  - Generated, regenerated: logic-variables registry, logic-variable groups + R-EO effect JSON, report-field inventory, 122 conversion roadmap, programme backlog, programme-items, 132 handbook (628 lines), system map.
  - Hand-merged to the union: converted.json (classify_permit_phase AND classify_lifecycle_phase pending rows), _witness-guard.ts (both legacy_oracle_excluded entries), defect-ledger.md (CPP-D1..D10 and CLP-D*; RB-D1..D9 and LCOA-D*), execution-budget-disposition.json pending list (resolve_bylaws, classify_permit_phase, assert_lifecycle_phase_distribution), conversion-roadmap.infra.test.ts (pendingBatch 19, C6 18), sql-witness-fixture.logic.test.ts (ADOPTION 19 / 8 / 21) — the tests derive these from the registries and pass.
- **Checks:** every generator --check rc 0 (~/Buildo-scratch/int29/gens-m5.txt); decision-log clean (381); spec-split-check clean; targeted 149 files: 3,658 passed, **29 failed = exactly the step-conformance R-R/Rule 13 "generated scorecard block is not stale" cases** (the merges resolved blocks to one side; ~/Buildo-scratch/int29/m5-tests.txt). **Owed next (H lane, DB-backed): `node scripts/analysis/step-validate.mjs --all --write`** → one generator-output commit; then the full suite.
- **Integration fix (in the merge commit):** src/tests/gate-score-floor.infra.test.ts T6 spawned `step-validate --all --fast` with the 1 MB spawnSync default; the merged tree prints 1.84 MB (0.87 MB at integrate-28) so the run died ENOBUFS and T6 read 0 score rows. maxBuffer 64 MB added (red: docs/reports/red-evidence/gate-f/t6-enobufs-red.json 1 failed / 21 passed; after 22/22). No gate logic changed.

## Merge 6: wf1/b10-door @ 732bbe97 (B10: M-357 door, coa-2026-d pre-registration, blind result, values batch, ingest captures)

- Lane verify: **verify-48h PASS-WITH-NOTES** (every number re-derived; prereg a54b4138 committed 31 s before the first score; values-only clean; values batch byte-identical on rebuild, sha f8ea5ad7).
- Commits: c0495a9f door (coa-cumulative.mjs + cumulative-set.json), a54b4138 prereg-coa-2026-d.json, 3c2f95a3 blind result, 53c66619 values batch + manifest entry, 732bbe97 load_coa_notices POST captures retaken after the 2026-10-25 ingest (coa-2026-d 123 variance rows + 25 plan facts live; 7 explained input-drift keys; 17/17 V3).
- **Scorecard (M-357):** blind coa-2026-d 48 MATCH / 7 DIFFER → 87.27 % accuracy, 67.07 % answered; cumulative headline 197 notices / 821 rows 435 / 36 → 92.36 % / 74.53 %, overall floors and 900.3.10 pass, seven article floors fail → operator (no --accept).
- No conflicts; every generator --check rc 0 (~/Buildo-scratch/int29/gens-m6.txt); 172 / 4d CHECK OK (pinned), FLOORS OK; coa-cumulative + load_coa_notices 223 tests passed.

## Scorecard regeneration (H lane, after merge 6)

- DB-backed `step-validate --all --write` on fc7915fb under the DB lock: exit 0, 0 blocking hard stops, R-EY 30/48 V3, E1 PASS; 48 blocks written (38 at 17/17, 9 pending at 14/17, permits 7/17). Replaces the blocks merges 4 and 5 resolved to one side whole.

## Full suite (after the regeneration) and two integration fixes

- First full suite at dc5844e5: 919 files / 20,601 tests passed, **3 failed**: gate-captures T6e and gate-registries T8b (both `spawnSync step-validate --all --fast` killed ENOBUFS — the same 1 MB default as gate-score-floor T6, merge 5) and variable-effect.infra (the R-EO badge file src/features/admin-controls/generated/logic-variable-effect.json was taken from one side at merge 5 and its generator, generate-logic-variable-effect.mjs, is not in the int29 gens list). Red: docs/reports/red-evidence/gate-f/int29-suite-3-red.txt.
- Fixed: maxBuffer 64 MB on both spawns; badge file regenerated (`generate-logic-variable-effect.mjs --write`: 209 take effect at cutover, 19 scheduled for retirement). The three files: 84/84 passed. Full suite re-run below.
