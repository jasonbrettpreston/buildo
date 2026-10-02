# SPEC 124a — Step Standard Policy: Appendix (historical, non-normative)

**Status:** ACTIVE (non-normative — this file carries no rulings of its own, see Governance below; the status
line exists only so `scripts/generate-system-map.mjs`'s `/^\*\*Status:\*\*\s*(.+)$/m` match does not silently
default this file to `'Done'`).

> Sibling of `docs/specs/01-pipeline/124_step_standard_policy.md` (Spec 124). Created 2026-10-02 per the operator ruling "Split to 124a": Spec 124 breached its arm (iv) byte budget in `docs/specs/01-pipeline/122_split_manifest.json` (157,811 B against a 156,781 B ceiling with register row R-BG drafted), and the ruling was to split, not to rebaseline `measured_at`. Each section below arrived ONLY through `node scripts/analysis/spec-split-check.mjs --refresh` (Spec 124 R-AA): its heading names the source anchor, its `moves[]` row in the manifest records the content hash, and the source heading survives in Spec 124 as a stub pointing here.

**Governance:** this file decides nothing. Spec 124's §2 rules and §5 register stay in Spec 124 and remain the live policy; where anything below conflicts with current Spec 124 text, Spec 124 governs (it is the live standard; this is history).

## Operating Boundaries

### Target Files
- None — a non-normative appendix with no owned implementation.

### Out-of-Scope Files
- `docs/specs/01-pipeline/124_step_standard_policy.md` — the live policy; its rules and register rows are never moved here (spec-split-check arm (iii) resolves every register-row citation against Spec 124 §5 only).

### Cross-Spec Dependencies
- **Relies on:** Spec 124 (the source of every section below; R-AA governs how a block arrives).
- **Consumed by:** readers following a Spec 124 stub; `scripts/analysis/spec-split-check.mjs` (arms i, ii and vi verify every move recorded here).


---

## Appendix §B1 — Worked examples from pilots 1–3 (moved from Spec 124 §7) — HISTORICAL, 2026-10-02

Moved from Spec 124 — Operator ruling 'Split to 124a' (2026-10-02): the drafted R-BG register row pushed Spec 124 past its arm (iv) byte ceiling. A dated pilot 1-3 illustration of the §7 ladder, no 'Enforced by' clause; the ladder itself stays in place.

#### Worked examples from pilots 1–3

| Problem | Rung used | Resolution | Ground |
|---|---|---|---|
| The 345-line JS fallback link path (0 of 11 runs since 2026-04-02 took it) was dead weight with a silent swallow, orphaning its `link_massing_grid_degrees` tunable | (a) descriptor, dead compute deleted | `knowingly-retired` (Intent Ledger), replaced by declared `guards.requires` preconditions; the orphaned tunable gets `config.retired: [{name, since, why, ledger: LM-D7}]`, never a silent seed-row deletion | LM-D7, ruling A-8, R-A |
| `link_massing_link_rate_fail_pct` was the bare literal `50`, INTENT-UNKNOWN | (c) admin logic variable | `link_massing_link_rate_fail_pct` (default 50, 0–100, `on_invalid:fail`) + `checks[].limit_from_config` | LM-D5 |
| No tiebreak on equal-distance nearest-building matches — links could flip between runs | (e) compute change, last resort | `ORDER BY` rule fixed in `buildMatchSql`; the rule itself stated in the check's `why`, in `notes.json`, and in the compute header — not left as a bare code change | LM-D13 |
| A killed forced-FULL retraction left `parcel_buildings` at 29,330/520,492 rows; the next run's gate read "unchanged" | (a) descriptor | `recovery.interrupted` (`force_full_on_next_run`\|`none`+why) required on any destructive-retraction write target | R-B |
| A declared logic variable with no `logic_variables` row silently resolved to the seed default, stamped as if operator-set | (d) library change | `resolveConfig` (all steps, not just `link_massing`) issues one extra presence query and THROWs, naming the remedy | LM-D15 |
| A standing non-zero link-quality population (`nearest_footprint_gt_lot_count`) was dispositioned INFO with no gate | (b) declared check, severity corrected | INFO conflicted with Spec 48 §4.9; re-dispositioned WARN + declared retighten condition | R-H, LM-D6/LM-D11 |


---

## Appendix §B2 — Known concerns per archetype (moved from Spec 124 §9) — HISTORICAL, 2026-10-02

Moved from Spec 124 — Operator ruling 'Split to 124a' (2026-10-02), same move set as M08. Per-pilot archetype caveats (M06/M07 criterion: a pilot-cutover snapshot, not Rules 1-13 policy), no 'Enforced by' clause; the heading stays, so every 'Spec 124 §9' citation still resolves.

## §9. Known concerns per archetype (R-T, 2026-08-29 — lifted from the ~~six~~ **nine (corrected 2026-09-10, measured)** pilots' §R Reflections)

*One row per proven archetype, citing the pilot report it was first measured in. Not a defect list (see `docs/reports/defect-ledger.md` for that) — this is the standing, archetype-level caveat a future pilot of the SAME archetype should read before assuming its predecessor's shape transfers cleanly.*

| Archetype | Pilot | Known concern |
|---|---|---|
| ASSERT | `assert_schema` | Compute never opens `ctx.pool` at all (Rule 2's stated exception) — the shape's thinnest test of the contract; `outputs`/`recovery`/`counters`/`config`/`override` all forced `"none"`, so ASSERT alone cannot exercise `write_discipline`, `recovery.reset`, or tunable-presence checks at all. Four fences moved to descriptor data or a named check at conversion (Rule 1 worked example). |
| INGESTOR | `load_ravines` | The richest archetype (9 members) but only ONE representative converted — class B/4-`finally`/drift+mass-delete-env-override coverage is real, but classes A and C (the OTHER two write mechanics INGESTOR spans, §8.2's coverage caveat) are validated only by the enum port, never by a converted INGESTOR exercising them directly. LR-D9 (a phase-reordering ruling silently retiring a "before X" write-order guarantee, Rule 11's origin incident) was FIRST found here, not in a more write-heavy archetype. **Update 2026-09-27:** class A is now exercised by converted `address_points`/`parcels` and class C by converted `load_centreline` (batch-2 row 3.2 ③) — the enum-port-only caveat is retired for A and C. |
| LINK | `link_massing` | E1's `guard:"none"` is a genuinely correct grandfathered case (an `IS DISTINCT FROM` guard here would skip the exact rows the clear exists to move) — the archetype's own worked example for why `guard:"none"` is sometimes RIGHT, not merely tolerated (Rule 9). Also the archetype that forced R-B's crash-recovery declaration (an interrupted forced-FULL retraction leaving a table at 29,330/520,492 rows with a FALSE `recovery.resume` claim). |
| MATCHER | `link_wsib` | Tier-3 precision required hardening post-cutover (LW-D18, a WF3) after a self-agreeing predicate (`tier3_token_overlap_pass_pct` at 100.00%) coexisted with a 60-row sample measuring as low as 46.7% genuine precision — R-O's "sampled precision/recall, never a link rate" accuracy doctrine originates here, and is the ONE Rule-10-adjacent doctrine every future MATCHER must apply, not just cite. |
| MATERIALIZER | `link_parcel_addresses` | LPA-D1 (`insert_only_no_retraction`, class D, banned-for-new under V7's `no_retraction` rule) is GRANDFATHERED, not fixed — a real, filed, zero-measured-live-exposure known defect the archetype's sole representative carries forward rather than resolving. A future MATERIALIZER pilot (if the estate ever gets a second one) inherits this as an open question, not a closed pattern. |
| BACKFILL | `compute_centroids` | `write.js`'s class-E (`write_once_backfill`) executor (`executeBackfillUpdate`) was newly built THIS pilot (LG-20) — the "zero library growth" hypothesis every pilot since 3 has tested was REFUTED here too, for the third time. Fork-over-share was chosen a THIRD time over a shared phase-runner scaffold (`LG-21`, RATIFIED fork-over-share at the freeze — `e029c37d`, `template-freeze.json`'s `lg21_decision` — see §8 above). Downstream: this archetype's output (`parcels.centroid_lat/lng`) exposes a real, measured, pre-existing consumer defect in `link-parcels.js`'s Tier-3 join (CC-D2/CC-D3, `RT-CC3` — 6,808/17,500 spatial-tier links, 38.9%, would resolve to a different parcel under a containment-based join) that is NOT this archetype's own defect to fix, but is the first pilot where a downstream consumer's join STRATEGY, not just its data freshness, was found to be in question. |
| RECORDER | *(pilot 8, run — corrected 2026-09-03, WF3 cloud-parity FIX 1.6)* | `refresh_snapshot` converted (`converted.json`, 8 entries) via `runRecorderPhase` (LG-26/LG-27 library growth). Was mislabeled "pilot 7, not yet run" — pilot 7 was `link_parcels` (LINK archetype). RECORDER's daily-keyed upsert fit `guarded_upsert` with `guard:"none"` (declared, not invented); see the pilot 8 commit history and `docs/reports/2026-08-31-pilot8-refresh-snapshot-assessment.md` for the worked answer. |
| ENRICHER | `enrich_parcels` (pilot 9, run; cut over commit 9, 2026-09-11) | **Four measured concerns, all invisible locally — every one only surfaced against real cloud scale/heap-state:** **EP-D14** (2026-09-09) — pass-5 D4' recovery walked unconsumed `enrich_parcels_pass3_scope` rows ONE AT A TIME, a per-row full-scan UPDATE with no index leading on `parcel_id`; cloud-measured 439,130 unconsumed rows, one backend active 23 minutes on a single such UPDATE, invisible locally because EP-D10's own prune leaves the local table at 0 rows. **EP-D16** (2026-09-09) — the declared pass-5 statement-timeout bound was applied ONLY inside `flushBatch`'s per-batch transaction, never session-wide on `postClient`; every OTHER statement on that connection (`consumePendingScope`'s reads/writes, the citywide backstop check) ran with NO ceiling at all, invisible locally because a small local table never runs long enough to expose an unbound statement. **EP-D15** (2026-09-09) — the post_commit phase's "heartbeat" advanced only at 4 phase-boundary call sites, never periodically DURING a phase, so a genuinely healthy 30+-minute pass looked identical to a wedged one; invisible locally because a local pass finishes before the gap would ever matter. **EP-D17** (2026-09-10) — the run-end `invariants[]`/`plausibility[]` post checks (and `run-chain.js`'s T1/T4 telemetry) ran as unbounded, unfolded, serial full scans of `parcels`; cost is not a constant but a 150x cliff keyed on heap state (16-30s clean vs 40+ minutes against the 1,346,759 dead tuples the step's OWN pass 4 had just created), invisible locally because a small local table has no bloat to hit. All four were closed as code fixes in the SAME step's own WF3 cycle, not deferred to a future pilot's discovery. |
| ENRICHER *(superseded 2026-09-11 by the row above — retained, never deleted)* | *(pilot 9, not yet run — corrected 2026-09-03; was mislabeled "pilot 8, not yet run")* | **Untested, named in advance:** `enrich_parcels` is ~~2,153~~ **2,068 (corrected 2026-09-10, measured — the same stale figure was carried in Spec 122 §8.2's archetype table, fixed in the same pass)** lines, 5 passes, the largest single conversion in the programme; its clock-relative comps-window gate (Spec 122a's own open question Q3 — "no count- or watermark-based gate can ever skip it") has no analogue in any archetype converted so far, and is the last of the eight-archetype coverage table's rows to be proven against real code rather than the aspirational dispatch-map comment in `scripts/lib/step/index.js`. |
