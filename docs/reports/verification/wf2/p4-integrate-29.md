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
