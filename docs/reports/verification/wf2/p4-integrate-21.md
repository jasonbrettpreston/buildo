# Verification index — wf2/p4-integrate-21

R-EZ says: *"Findings block the integration until fixed or ruled. The verification report is saved under
`docs/reports/verification/<branch>.md` and the integrate commit cites it."*

Four fix-round-4D branches were verified in two rounds by verifiers that did not write the work and read it only. Each report is
copied verbatim from the orchestrator's scratchpad and is `cmp`-identical to its source.

- **Integrate base:** `c417a651` (= `wf2/p4-integrate-20`, verified, awaiting the operator's push)

## Merged branches

| # | Branch @ tip | Verdict | Report |
|---|---|---|---|
| 1 | `wf1/layer2-prereq-1` @ `10ead5bf` (lane C: M-295..M-298, L2-LOSERS, L2-CLOSURE, L2-CHAPTERS, L2-CLASSES) | PASS-WITH-NOTES | [layer2-prereq-coa-tools.md](layer2-prereq-coa-tools.md) (= `~/Buildo-scratch/verify-28/verify-28.md`) |
| 2 | `wf1/bylaw-fix-5` @ `3f85ed1c` (lane A: M-265..M-268, exceptions) | PASS-WITH-NOTES | [bylaw-fix-5-6.md](bylaw-fix-5-6.md) (= `~/Buildo-scratch/verify-27/verify-27.md`) |
| 3 | `wf1/bylaw-fix-6` @ `7adf6a56` (lane B: M-280..M-291, inputs and keying) | PASS-WITH-NOTES | [bylaw-fix-5-6.md](bylaw-fix-5-6.md) |
| 4 | `wf1/coa-tools-2` @ `8ea488df` (lane D: M-305..M-312, R-JB, scorer tooling) | PASS-WITH-NOTES | [layer2-prereq-coa-tools.md](layer2-prereq-coa-tools.md) |

Merged in that order, merge-only; generated files were regenerated with their generators after each merge (provisions, code-findings,
report-fields inventory, golden cases, Spec 133 and Spec 132 handbooks and rule maps, system map, Layer 2 input).

## Notes and how each was resolved

| Note (report) | Resolution | Where |
|---|---|---|
| verify-27 A1 and the stamp TODO: the 13 `operator`-stamped M-75 corrections of lane A | **Ruled; application OWED.** The operator ruled (`2026-10-21-batch-p#CHAT-50`, "1y"): the 6 on exception 528 are RATIFIED; the other 7 are mechanical gate fixes, to be re-labelled `orchestrator-p1-mechanical`. The decision is imported (M-315). **The 13 superseding `~s1` adjudication records are NOT appended**: the permission system refused the append in this lane, and the lane did not work around it. The ready script is `~/Buildo-scratch/int21/append-chat50.cjs` (it checks it finds exactly the 13, appends, run from the worktree root; then regenerate). Until it runs the records stay stamped `operator`, so the stamp TODO is still OPEN. | `scripts/seeds/bylaw/adjudications.json` (untouched), 69a M-315 |
| verify-27 A3: M-265 text said "all 136 INCLUDE units" | M-265 states the true scope: 64 of 141 INCLUDE units carry `include_ref` (38 to 1462, 4 to 336, 22 to 900.2.10 (4)/(5)/(7)). | 69a M-265 |
| verify-27 A2 / summary 4: exception 1397's 0.69 pre-1953 arm orphaned | Owner row M-316: OWED to an existing-building input. | 69a M-316 |
| verify-27 B: A0385/26TEY `separation_m` left MATCH (11 to 2) | Scorer fix 4D-S4c: a notice citing 10.10.40.80(1)(C) is evidence that each facing main wall has an opening. A0385 is MATCH again. | `coa-scorecard.mjs`, M-313 |
| verify-27 B7 / B1: lane B scorer copy not committed; `explained_differences` unvalidated | Lane B's diff applied (F-4D-19 label, 4D-S4b, consumer, `primary_frontage_street_name`). `coa-explained.mjs` validates the table at load (exit 2 on a bad entry) and is tested. | M-313 |
| verify-28 C4: M-297 two-way lock reads migration 280 by a hard path | Both locks (`bylaw-layer2-vocab`, `resolve_bylaws/resolution`) find the file in `pending-migrations/` or `migrations/`. Not red-testable without moving the file. | the two tests |
| verify-28 C1: M-298 status says "confirmed" | The status says "ADOPTED"; the operator confirmed `house_units` = 2 (`2026-10-21-batch-o#CHAT-48`). | 69a M-298 |
| verify-28 D4: A0247 survey arc | CHAT-46: a frontage measured along a curved front lot line is not preferred; the calculated frontage is kept; by-law 800.50(445). A0247 is MATCH. | M-313 |
| verify-28 D5: `expected-4d.json` inert ("tree moved on") | Expected totals are committed beside the tool and pinned by an inputs key (Layer 2 table_version, evaluator_version, scorer sha), not a commit sha. The lock is live: a changed total FAILS while the inputs equal the pin. When an input moves, re-pin with `coa-scorecard.mjs --pin` (the test names this). Two files: the 123-notice set and the 172-notice set. | `coa-expected/` |
| verify-28 D6: R-JB active/lock inflates counts | R-JB is status `parked` (new status, not in force), enforcement none. The ward migration is renumbered 281 in the parked patch (280 is lane C's). Bundled into the next CoA capture night (CHAT-47). | rule-map, 124a, patch |
| verify-27 B3: platform scope leak onto ancillary / laneway from 150.7 | Not changed (value 0.2 m either way); carried forward. | below |
| Found by the scorecard comparison: lane B's F-4D-19 label sent A0205/26NY `10.5.40.50(2)` to the rear target (DIFFER) | Fixed in the scorer (the line named after the figure is used when none precedes it); locked by a test. Both rows are MATCH again. | M-313 |
| CHAT-49: side-yard leak of newly keyed exceptions | 15 units (list in the row). Exceptions 117, 199, 258, 287 still hold a pending unit, so the entries bind when those are authored. | `vocab.unit_application`, M-314 |

## Hand-merged files

- 69a: every row of all four lanes kept (M-260, M-265..M-268, M-280..M-291, M-295..M-298, M-305..M-312), plus new M-313..M-316.
- `adjudications.json`: append-only; lane A's 13, then lane B's 90 (6053 records); both sides share the base prefix (verified).
- `vocab.json`: `unit_application` union (lane A's M-267, lane B's M-288, M-314); one new `named_street` entry for
  `900.3.10(100)#(100)[SSP](C)` ("Scarborough Golf Club Rd.", line `any`): lane A authored that unit, and lane B's closed-table test
  (every unit carrying `abuts_named_street` is listed) failed on the merge.
- 124a: R-IY and R-JB both kept. Steps `rule-map.json`: R-IY and R-JB both kept as separate objects.
- `decision-log.logic.test.ts` pin: 102 (C), 114 (A), 125 (B), 136 (D), 141 (CHAT-46..50); each is the number `decision-log --check` printed.
- Next-free counters: Spec 124 `R-JC`, Spec 69a `M-317`.

## Results at this tip

Scorecard (172 notices, `notices-all2` / `parcels-all2`, plan facts; the committed patched scorer run at each root):

| root | MATCH | DIFFER | NO ANSWER | OWED | accurate | answered |
|---|---|---|---|---|---|---|
| base, old scorer (`scorecard-172-ee`) | 330 | 40 | 113 | 77 | 89.2 | 66.1 |
| base engine, patched scorer | 337 | 30 | 111 | 78 | 91.8 | 66.0 |
| + lane C | 337 | 30 | 111 | 78 | 91.8 | 66.0 |
| + lane A | 349 | 29 | 96 | 82 | 92.3 | 68.0 |
| + lane B | 368 | 29 | 76 | 83 | 92.7 | 71.4 |
| + lane D, + follow-ups (tip) | 368 | 29 | 76 | 83 | 92.7 | 71.4 |

No row left MATCH against the old base. Gate widening (M-265 with `exceptionClosure`): 64 exceptions (37,869 lots) now have an
included exception in their closure; 0 lots flip to `exception_not_authored` (every included exception is authored); 11 exceptions
(1,918 lots) newly answer (lane A authoring).

## Carried forward (open at this tip)

1. **The CHAT-50 application** (13 superseding adjudication records), and with it the stamp TODO.
2. verify-27 B3: `platform_above_access_floor_m` resolves to a 150.7 garden-suite unit for plain ancillary and laneway buildings (0.2 m either way).
3. Lane A's three new DIFFERs (A0103/26SC #1 and #3, A0138/26SC #3): rows that were blank and are now answered differently from the City.
4. Pending units: exceptions 1437, 1436, 1434, 117, 258, 287, 199 and 291 wait for the operator.
5. M-308's data fixes for F-4D-9 / F-4D-14 and M-312 (calculator survey override) stay OWED.
6. Migration 281 (ward) is parked with R-JB until the next CoA capture night.
7. Everything carried forward in `p4-integrate-20.md` is still open.
