# Adjudication items and the held fixes patch (2026-10-16, McBylaw lane)

## Held patch: `m176-m179-fixes.patch` (built and verified in an isolated copy; NOT applied)
It touches E-LAND's staged paths (`scripts/seeds/bylaw/vocab.json`, `scripts/seeds/bylaw/adjudications.json`,
`src/tests/bylaw-rulings.logic.test.ts`), so it waits until E-LAND commits. Apply with `git apply` (checked clean
against the worktree 2026-10-16). The corrections were appended by `keying-cli.mjs correct --corrections corrections.json
--adjudicator operator` (M-75); re-running that command on the landed tree reproduces them (the ids are deterministic;
`adjudicated_on` is the run date).

| fix | ruling | record |
|---|---|---|
| townhouse unit width answers 5.0 m; 6.0 m disclosed | M-176(1) | vocab `design_choice_disclosure.default_overrides`; `COR-10.80.40.1(3)#(3)(A)/calculation_handling~s1` (gaps) |
| new target `ancillary_coverage_pct` | M-179(1) | vocab `dsl_target` |
| 150.8.60.70(1)(B) → `ancillary_coverage_pct = 30 pct` | M-179(1), M-151 | `COR-…/target`, `COR-…/numeric_expression` |
| 150.7.60.20(6)(B) condition + `garage_entrance_faces_street` (token exists) | M-172(3), M-75 | `COR-150.7.60.20(6)#(6)(B)/condition` |
| 150.7.60.20(6)(C) corner lots only | M-179(2) | supersedes the three 2026-10-09 P10 corrections (`~s1`) — see ADJ-4 |
| 150.7.60.20(2)(C), (5)(A) not_modelled + disclosure | M-149, M-172(3) | `COR-…/calculation_handling`, `COR-…/disclosure` |
| test | — | `src/tests/bylaw-suite-keying-m176-m179.logic.test.ts` (red 8/8 → green 8/8); M-173 lock in `bylaw-rulings` updated to M-176(1) |

No change: 150.8.60.20(2)(A), (3)(A) are already `status: not_modelled` in their agreed units (they still enter
`effective()` until the disclosure wiring lands; phase2-plan-v2 addendum).

## ADJ-1 — 150.7.60.70(1)(A)/(B) as one `max(…)` (M-179(1)): not keyable today; the vector conflicts
1. Grammar: `lot_coverage_pct = max(45 pct @(1)(A); if(mapped(LC); overlay(LC); unregulated) @(1)(B)) @(1)` parses
   (per-arg clause tags work) but `checkStatement` returns `unregulated_not_terminal`. The `unregulated` in `max`
   propagation (Spec 68 §7.4, l.316) is the planned P3 grammar (M-72), not built.
2. Subjects differ: (A)'s 45 % covers all buildings incl. the suite; (B)'s overlay arm covers the house only (the suite
   then sits under the 20 % ancillary cap). On an LC 35 % lot, `max` answers 45 %, but M-179's enforced-by vector
   expects "principal 35 %, ancillary ≤ 20 %".
**Choose:** (a) principal = 45 % via (A) (largest house; disclose "(B): house 35 % + ancillary 20 %"), and fix the vector;
(b) principal = 35 % via (B) (largest total build), so not a per-target `max`; (c) key now as
`max(45 pct; overlay(LC))` with `condition mapped(LC)`, and leave unmapped lots for M-72.
*Recommendation:* hold until M-72 and pick (a) or (b). The units are `excluded_by_type` until P2-10, so nothing misfires now.

## ADJ-2 — 150.7.60.70(2)(A) is not keyed
The row (`150.7.60.70(2)#row`, a garden suite with an apartment building) has no unit. Moving it to
`ancillary_coverage_pct` needs keyer A + keyer B (Spec 68 §10). Queue it in the keying lane before P2-10.

## ADJ-3 — G-EVAL V12 mismatch introduced by M-175 (validate `--check` exit 1 today)
V12 (RT, building_type NULL, `side_setback_m`) expects `not_evaluated needs_user_input:building_type`. With the M-175
`applies()` change it gets 7.5 (winner 10.60.40.70(3)(A)). Cause: 10.5.60.20(9)(B) is scoped to an accessory-structure use, so
it no longer takes part. Every building-type world then agrees at 7.5, and M-50 answers it. Proven by running `--check`
with the staged `evaluate.mjs`: G-EVAL passes. **Choose:** (a) an `eval_mismatch` adjudication accepting 7.5 (M-175 + M-50);
(b) re-expect V12 (eval_vector record). The Spec 67 anchor ("NOT 7.5") targeted the old flat constant.

## ADJ-4 — confirm: 150.7.60.20(6)(C) reverses an earlier operator correction
On 2026-10-09 the operator set (6)(C)'s condition to none ("'in all other cases' is not a corner-lot arm; P10"). The M-179
draft said the condition "was left none". M-179(2) (2026-10-16) reads (C) as the corner-lot arm, so the patch
supersedes the three P10 records. Confirm that M-179(2) is meant to override P10.

## Operator answers 2026-10-16
- **ADJ-3: (a) ACCEPTED.** V12 answers 7.5 m. When every building type agrees, the evaluator answers (M-50), and the pool-only rule no longer contests the answer (M-175). Record this as an `eval_mismatch` adjudication. The old "NOT 7.5" anchor was written against the retired flat constant.
- **ADJ-1: DEFERRED to P2-10.** Decide (a) or (b) on real lots once M-72 grammar and the suite scenario exist. The units stay `excluded_by_type` until then.
- **ADJ-2:** queued for the keying lane (keyer A + B) before P2-10.
- **ADJ-4: CONFIRMED, corner lots only.** M-179(2) supersedes the three 2026-10-09 P10 records. Basis: the heading reads "on Corner Lot", and the lead-in "must comply with (5), except" would leave (5) with nothing to govern if (C) covered every lot. Operator answer given with the verbatim text in front of them.
