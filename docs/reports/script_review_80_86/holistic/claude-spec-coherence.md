# Holistic Spec-Coherence Review — Specs 80–86 + `41_chain_permits` + `40_pipeline_system`

**Reviewer:** Claude (spec-coherence pass)
**Scope:** Contract integrity across 6 specs (81–86) plus spec 80 (consumer), spec 72 (legacy parallel), `41_chain_permits.md`, `40_pipeline_system.md`.
**Reference inputs:** 7 per-script TRIAGE.md documents in `docs/reports/script_review_80_86/{81..86,run-chain}/_TRIAGE.md`.

This review deliberately stops at the spec layer. Code fixes already live in the per-script TRIAGEs; the goal here is to identify the spec-level gaps that let those bugs slip through in the first place.

---

## Severity Legend

| Tag | Meaning |
|---|---|
| **BLOCKER** | Production-blocking contract ambiguity; multiple scripts disagree because the spec is silent or self-contradictory |
| **HIGH** | Cross-spec contract gap; producers and consumers work today by accident |
| **MEDIUM** | Single-spec structural hygiene (missing Operating Boundaries, orphan behaviour, stale SPEC LINK) |
| **LOW** | Cosmetic / naming / convention drift |

Severity reflects **coherence impact across the 80–86 family**, not the per-script bug catalogues.

---

## Findings

### H-1 · BLOCKER · `lead_key` canonical format has three producers and no spec owner

Spec 80 L43 declares `'permit:{permit_num}:{revision_num}'` — unpadded.
Spec 82 L36 declares `'permit:num:rev'` — ambiguous.
Spec 81 §4 test note says `'permit:num:revision'` — third phrasing.

Implementations disagree already:
- `update-tracked-projects.js:277,300` writes `LPAD(tp.revision_num::text, 2, '0')` — zero-padded to 2 chars.
- `compute-opportunity-scores.js:48` reads `LPAD(tf.revision_num, 2, '0')` — no `::text` cast.

Three consequences:
1. `revision_num > 99` silently produces 3-char suffix; any reader assuming fixed-width fails.
2. Casting convention differs between producer/consumer — works because column is VARCHAR; invites breakage on type change.
3. Spec 81 §5 test mandates format verification but spec doesn't fix the format.

**Fix:** publish one canonical format in a shared Data Contracts section referenced by 80/81/82. Pick `permit:<num>:<LPAD(rev,2,'0')>` (current producer) or `permit:<num>:<rev>` (unpadded) and make the other side conform. See H-24 for the Data Contracts section proposal.

### H-2 · BLOCKER · Spec 72 and spec 83 are both titled "Lead Cost Model" and disagree

`docs/specs/product/future/72_lead_cost_model.md` — "FUTURE BUILD", library-only model, writes `premium_factor`, `complexity_score`, `cost_range_low/high`.
`docs/specs/product/future/83_lead_cost_model.md` — "ARCHITECTURE LOCKED — April 2026", pipeline-first, writes `trade_contract_values`, `is_geometric_override`, `modeled_gfa_sqm`.

Both reference `scripts/compute-cost-estimates.js` and `src/features/leads/lib/cost-model.ts` as their target files. The implementation actually does **both**: it writes the spec-72 columns (`cost_tier`, `cost_range_low/high`, `complexity_score`, `premium_factor`) AND the spec-83 columns (`trade_contract_values`, `is_geometric_override`, `modeled_gfa_sqm`, `cost_source`).

Both scripts carry SPEC LINK → spec 72. Triage 83-W17 flags this. Neither spec supersedes the other; migration 092 references 83's allocation table.

**Fix:** Merge into one canonical file (`83_lead_cost_model.md`) that absorbs spec 72's library contract. Mark spec 72 as `**SUPERSEDED BY 83**` with a pointer. Update all SPEC LINK headers.

### H-3 · BLOCKER · `target_window` enum has three vocabularies across specs 80/81/85

- Spec 80 L52: `CHECK ('early_bid', 'rescue_mission')` — **snake_case full phrase**.
- Spec 81 L22: `CHECK ('bid', 'work')` — **short form**.
- Spec 85 L23: documents `'bid' or 'work'` — matches 81.
- `trade_forecasts` table CHECK constraint (actual DB): the implementation uses `'bid'` / `'work'`.

Readers of spec 80 who build a filter for `early_bid` silently match nothing. Readers of spec 81/85 see no warning that spec 80 uses different names.

**Fix:** Normalize to `'bid' / 'work'` in spec 80 and add a cross-reference note that 80's "Early Bid / Rescue Mission" are human-readable labels for `bid` / `work`. Or rename DB column values to match spec 80 and update code. Pick one.

### H-4 · BLOCKER · Urgency enum is a producer-side fiction — no consumer contract

Spec 85 L23 + §4 declares the producer enum: `expired | overdue | delayed | imminent | upcoming | on_time` (6 values).
Spec 82 §4 only routes `imminent` and `expired` — no rule for the other 4.
Spec 81 §4 only filters `expired` — no rule for the other 5.
Spec 80 mentions none of them.

The script triages confirm the silent gap (82-W17, 85-W18): downstream consumers ignore `overdue`, `delayed`, `upcoming`, `on_time` with no spec mandate. Either the producer is over-emitting dead values, or consumers are under-handling them. No spec resolves which.

**Fix:** spec 82 §4 must enumerate the routing of ALL 6 urgency values (alert? archive? silent-but-scored? silent-and-excluded?). Spec 81 §3 must declare whether each urgency value is scored or excluded. Spec 85 should then narrow its enum if any values have no downstream use.

### H-5 · BLOCKER · Calibration algorithm has no spec owner

`compute-timing-calibration-v2.js` (327 lines) implements LAG inspection-pair mining, ISSUED synthetic phases, 4-shape output (per-type×transition; per-type×ISSUED; all-type×transition; all-type×ISSUED), percentile cuts (p25/median/p75), `HAVING COUNT(*) >= 5`, forward-only ordinal filter.

Documented in: *nowhere*.
- Spec 85 L29 names `phase_calibration` as an input but describes no algorithm.
- Spec 86 is Control Panel — doesn't mention calibration.
- Spec 84 §4 doesn't reference `phase_calibration`.
- SPEC LINK in the script points to `docs/reports/lifecycle_phase_implementation.md` (a report).

Consumer (`compute-trade-forecasts.js`) depends on 4 undocumented fallback shapes; triage 85-D11 flags that spec says 4 fallback levels, code implements 5 method names.

**Fix:** add a `## Phase Calibration Algorithm` section to spec 85 covering: LAG algorithm, ISSUED synthetic, percentile cuts, HAVING threshold, forward-only filter, 4-shape output contract, NULL↔`__ALL__` semantics, `calibration_method` enum.

### H-6 · HIGH · `calibration_method` enum drift between spec 85 and code

Spec 85 L25: `exact, fallback_all_types, fallback_issued, default` — **4 values**.
Code (per 85-D11): `exact, fallback_all_types, fallback_issued_type, fallback_issued_all, default` — **5 values**.

Whatever downstream admin UI or reporting reads this column will mis-bucket or drop unknown values. Ties to H-5.

**Fix:** reconcile in spec 85 §2 schema row; pick the 5-value set and document each.

### H-7 · HIGH · Orphan phases O1/O2/O3 are a contract break between producer and consumer

Spec 84 §3.6 declares O1/O2/O3 as valid phases (Orphan Active / Done / Stalled).
Spec 82 declares auto-archive on terminal phases (P19/P20) but is silent on orphans.
`update-tracked-projects.js` L29, L96–104: `PHASE_ORDINAL` has no O1/O2/O3 entries → `isWindowClosed` returns `false` forever → orphan permits never auto-archive.

Triage 84-W1 + 82-W7 flag the same bug from both sides. Neither spec owns the cross-cutting decision.

**Fix:** spec 82 §4 must explicitly declare handling for O1/O2/O3 (archive on O2/O3? ignore? route through `isWindowClosed` with sentinel ordinal?). Spec 84 should cross-reference the spec 82 rule as a downstream contract.

### H-8 · HIGH · Spec 84 self-contradicts on O2 semantics

Spec 84 §3.6 row O2: "Orphan Done — Standalone trade permit finalized."
`scripts/lib/lifecycle-phase.js` L388 comment: "O2 = orphan active."
`TIME_BUCKET_GROUPS` at `classify-lifecycle-phase.js` L391–402 groups O2↔O3 as sub-phase noise (suppressed transitions).

Triage 84-W2 + 84-S3 flag both. Spec says O3 = Stalled (distinct state change, meaningful); code suppresses O2→O3 as noise.

**Fix:** spec 84 §3.6 must pick one meaning for O2 and state whether O2→O3 is a suppressed transition or a tracked state change.

### H-9 · HIGH · Phantom phase `O4` exists in code but no spec

`scripts/lib/lifecycle-phase.js` L106: `VALID_PHASES` includes `O4`.
`compute-trade-forecasts.js:29`: SKIP_PHASES defensively filters `O4`.
`update-tracked-projects.js` (via PHASE_ORDINAL miss): `O4` joins the contract-break set at H-7.

Spec 84 has no O4. No classifier rule produces O4. Dead code path; triage 84-W10 + 85-D6.

**Fix:** remove O4 from `VALID_PHASES` + downstream filters, or add O4 to spec 84 §3.6 if intended.

### H-10 · HIGH · Chain step ordering is documented, cross-spec dependency DAG is not

Spec 41 tabulates the 24-step chain well. But the cross-spec data-flow DAG is scattered:
- Spec 81 L41 declares step 23 depends on step 14 (cost_estimates) + step 22 (trade_forecasts).
- Spec 82 L43 declares step 24 depends on step 23.
- Spec 83 L75 declares step 14 independent of step 15 timing.
- Spec 85 L30 declares step 22 depends on step 15 (calibration) + step 21 (lifecycle) + step 14 implicitly.
- Spec 84 L39–42 declares step 21 depends on step 20 (engine health) + precedes 22-24.

There is no single DAG diagram showing `85 → 81 → 82 → (83 ← 85 feedback)` with the table dependencies labelled. A reviewer reading spec 82 in isolation has no way to see that breaking spec 85's `phase_calibration` schema cascades into 82's alert logic via 81.

**Fix:** publish a `docs/specs/product/future/80_lead_feed.md` §Cross-Spec Data Flow section (or new file `80_marketplace_dag.md`) with a single DAG. Each spec 81–86 should link to it under Cross-Spec Dependencies.

### H-11 · HIGH · Spec 83 §6 trade-allocation table diverges from migration 092 seed

Spec 83 §6: uses `foundation`, `glass-glazing`, `pool` as slugs; sums to ~98.5%.
Migration 092 seed + spec 82 §Seed: uses `glazing`, `pool-installation`; no `foundation`; sums normalized to 1.0.

Triage 83-W18 flags this. Downstream effect: if operator tunes `foundation` in 83 spec they get no match in DB; if they tune `glazing` matching 82's seed they diverge from 83's table.

Also: spec 72 §3 `complexity_score` includes `+10` for `pool` (singular) while spec 83 Commercial Shell logic touches interior trades and needs the slug set pinned.

**Fix:** canonical slug list must live in ONE place. Nominate `docs/specs/product/future/82_crm_assistant_alerts.md` §Seed as authoritative (it's the migration source). Spec 83 §6 rewrites against it. Remove `foundation` or map to `concrete`+`waterproofing`.

### H-12 · HIGH · `logic_variables` key set is declared in four places with drift

Spec 81 §2 enumerates: `los_base_unit`, `los_multiplier_bid`, `los_multiplier_work`, `los_penalty_tracking`, `los_penalty_saving`.
Spec 86 §1: `los_base_unit`, `los_penalty_tracking`, `los_penalty_saving`, `lead_expiry_days`, `coa_stall_threshold`, `stall_penalty_precon`, `stall_penalty_active`.
Spec 85 §5 Control Panel: `stall_penalty_precon`, `stall_penalty_active`, `expired_threshold_days`.
Spec 84 L43: `coa_stall_threshold`.

Triage 81-S1 flags the primary drift: spec 81 writes `los_base_unit`, migration 092 + config-loader use `los_base_divisor`. Code and spec disagree on the DB key.

Additionally, these exist in code+triage but in no spec: `liar_gate_threshold` (83), `unclassified_threshold` (84-W7), `default_median_days` (85-W16), `confidence_sample_low/medium/high` (85-W15), `overdue_threshold_days` (85-W17), `bloat_warn_threshold` / `bloat_abort_threshold` (RC-W14), `calibration_min_sample_size` (86-W11), `permit_issued_stall_days` (84-W5).

**Fix:** spec 86 §1 must be the single authoritative table of `logic_variables` keys. Each consumer spec (81–85) references 86 rather than redeclaring. Add the missing keys above to spec 86.

### H-13 · HIGH · `trade_configurations` column set drifts across 81/82/83/85/86

| Spec | Declared columns |
|---|---|
| Spec 81 §2 | (describes usage but no table) |
| Spec 82 §2 | `trade_slug`, `imminent_window_days`, `bid_phase_cutoff`, `work_phase_target`, `allocation_pct` |
| Spec 83 §2 | `trade_slug`, `allocation_pct` (only) |
| Spec 85 §5 | references `bid_phase_cutoff`, `work_phase_target`, `imminent_window_days`, `multiplier_bid`, `multiplier_work` |
| Spec 86 §2 | `multiplier_bid`, `multiplier_work`, `allocation_pct`, `bid_phase_cutoff`, `work_phase_target`, `imminent_window` (singular — not `imminent_window_days`) |

Spec 86 calls the column `imminent_window` where every other spec + migration calls it `imminent_window_days`.

**Fix:** spec 86 §2 must be the authoritative table for `trade_configurations`. All other specs reference it. Rename `imminent_window` → `imminent_window_days` in spec 86.

### H-14 · HIGH · Spec 82 promises per-trade `imminent_window_days` drives urgency classification; spec 85 doesn't consume it

Spec 82 §3 bullet 3: "If the `predicted_start` is within the `imminent_window_days`, it sends the 'Last Minute' start alert."
Spec 82 §6 Control Panel: "The CRM assistant now JOINs `trade_configurations` to get per-trade `imminent_window_days` instead of the hardcoded 14."

Spec 85 §4 Urgency Classification: "`imminent`: < 14 days until predicted start" — hardcoded 14.
`compute-trade-forecasts.js:81`: `daysUntil <= 14` — hardcoded.

Triage 82-W2 + 85-W1 flag the cross-spec contract break. The Control Panel knob is cosmetic for urgency: spec 82 uses the value only in message text, not threshold gating. Specs disagree on who owns the threshold.

**Fix:** spec 85 §4 must reference per-trade `tradeConfigs[trade_slug].imminent_window_days` as the threshold. Spec 82 must declare it READS the threshold set by spec 85 rather than applying independently.

### H-15 · HIGH · `permit_phase_transitions` is an architectural orphan

Spec 84 §2 declares the table as a "Historical Ledger" of phase transitions.
Spec 85 + 86 describe no consumer.
Triage 84-W4 + 86-W6 + RC-S15 independently flag that `compute-timing-calibration-v2.js` mines `permit_inspections` directly, NOT `permit_phase_transitions`. Write-only table.

No spec declares:
- Whether calibration should migrate to transitions-mining (richer — covers P3-P8 CoA phases + orphans).
- Whether transitions is observability-only (admin UI ledger).
- Retention policy (84-D2: breaks around 2-5M rows).
- `neighbourhood_id` column usage (added in migration 086).

**Fix:** spec 84 §2 must declare the intended consumer OR mark the table observability-only. Spec 85 calibration section (per H-5) must declare the input source. Spec 41 must cross-reference.

### H-16 · HIGH · Spec 84 P3/P4/P5 dual-meaning collision

Spec 84 §3.1: P3=CoA Approved, P4=CoA Final, P5=Zoning Review.
`scripts/lib/lifecycle-phase.js`: same IDs used for BLD permit intake (INTAKE_P3_SET / REVIEW_P4_SET / HOLD_P5_SET).

Same ID space, two semantics, disambiguated only by `lifecycle_path` (`'coa'` vs `'permit'`) — a field not mentioned in spec 84 §2 schema. Dashboard filters, exports, and any cross-lifecycle analytics will mis-label.

Triage 84-W11 flags it. Spec 82 Imminent alert logic indirectly inherits the ambiguity when a claimed CoA lead has phase `P5` (zoning review vs hold — different window decisions).

**Fix:** spec 84 §3.1 must add a `lifecycle_path` column to the schema table AND declare either (a) renumber permit-intake phases to `I3/I4/I5`, or (b) spec-lock that `lifecycle_path` is the disambiguator + require ALL consumers to filter by it.

### H-17 · HIGH · Spec 81 depends on spec 83 `trade_contract_values` shape — shape not declared

Spec 83 §2 schema says `trade_contract_values JSONB` with description "Stores estimated $ value for all 32 trades." No key set, no value type (integer? decimal? unit?), no format contract.

Spec 81 §3 Core Logic: `Extract trade_contract_values[row.trade_slug]`. Assumes map-of-slug-to-number with specific key names.

Triage 83-S6 flags this. If spec 83 rewrites to `{trade: 'framing', value: 15000}` array shape, spec 81 silently breaks.

**Fix:** spec 83 §2 must declare the exact JSONB shape: `{ [trade_slug: string]: integer_dollars }` with enumerated slug set (tied to H-11 canonical slug list).

### H-18 · MEDIUM · Six of seven scripts carry the same wrong SPEC LINK

Every 80-86 script + run-chain points at `docs/reports/lifecycle_phase_implementation.md` — a report, not a spec. Triages 81-W7 · 82-W16 · 83-W17 (points at 72 not 83) · 84-W6 · 85-W14 · 86-W5 · RC (no explicit).

Definitive SPEC LINK map:

| Script | Correct SPEC LINK |
|---|---|
| `compute-opportunity-scores.js` | `docs/specs/product/future/81_opportunity_score_engine.md` |
| `update-tracked-projects.js` | `docs/specs/product/future/82_crm_assistant_alerts.md` |
| `compute-cost-estimates.js` (JS + TS counterpart) | `docs/specs/product/future/83_lead_cost_model.md` |
| `classify-lifecycle-phase.js` | `docs/specs/product/future/84_lifecycle_phase_engine.md` |
| `scripts/lib/lifecycle-phase.js` | `docs/specs/product/future/84_lifecycle_phase_engine.md` |
| `compute-trade-forecasts.js` | `docs/specs/product/future/85_trade_forecast_engine.md` |
| `compute-timing-calibration-v2.js` | `docs/specs/product/future/85_trade_forecast_engine.md` (pending H-5 algorithm section) |
| `run-chain.js` | `docs/specs/pipeline/40_pipeline_system.md` + `docs/specs/pipeline/41_chain_permits.md` |

**Fix:** bulk-rewrite SPEC LINK headers in one WF2 commit. Add a pre-commit check that fails if SPEC LINK targets a path outside `docs/specs/`.

### H-19 · MEDIUM · Operating Boundaries sections are inconsistent

CLAUDE.md mandates every new spec declare Target Files / Out-of-Scope / Cross-Spec Dependencies.

| Spec | Target Files | Out-of-Scope | Cross-Spec Dependencies | Control Panel section |
|---|---|---|---|---|
| 80 | — | — | — | — |
| 81 | ✅ | ✅ | ❌ | ✅ |
| 82 | ❌ (has "Future Updates" + Control Panel) | ❌ | ❌ | ✅ |
| 83 | ✅ | ✅ | ✅ | ✅ |
| 84 | ❌ | ❌ | ✅ | ❌ |
| 85 | ✅ | ✅ | ✅ (references "72_lead_cost_model" — see H-2) | ✅ |
| 86 | ❌ | ❌ | ❌ | N/A (owner) |

Spec 83 is the only fully-compliant §5. Spec 82 skips Target/Out-of-Scope entirely. Spec 80 lacks the whole Operating Boundaries section.

**Fix:** retrofit §5 Operating Boundaries into 80, 82, 84, 86 matching spec 83 pattern. Update CLAUDE.md WF5 audit to enforce.

### H-20 · MEDIUM · Control-Panel-tunable thresholds are not declared per spec

CLAUDE.md WF5 spec-audit asks which thresholds in each spec are Control-Panel-tunable. Current state:

| Spec | Control Panel section declares tunable thresholds | Missed per triages |
|---|---|---|
| 81 | ✅ (`los_penalty_tracking`, `los_penalty_saving`, `los_base_divisor`, `multiplier_bid`, `multiplier_work`) | tier thresholds (81-S2), NULL urgency handling (81-S3) |
| 82 | ✅ (`imminent_window_days`) | stall/terminal phase ordinals (82-S4), archive boundary (82-S7) |
| 83 | ✅ (`allocation_pct`, `liar_gate_threshold`) | commercial shell multiplier, premium tiers, fallback floors (83-S1, S2, S3) |
| 84 | ❌ (no Control Panel section at all) | `stall_threshold_days`, `coa_stall_threshold`, `permit_issued_stall_days`, `unclassified_threshold` (84-W5, 84-W7) |
| 85 | ✅ (`stall_penalty_precon`, `stall_penalty_active`, `expired_threshold_days`) | `default_median_days`, `confidence_sample_*`, `overdue_threshold_days`, `imminent_window_days` threshold ownership (85-W15-17, 85-S8) |
| 86 | N/A (owner) | missing keys enumerated in H-12 |

**Fix:** every spec 81–85 must have a `## Control Panel` subsection listing every constant/threshold that is or should be DB-tunable. Spec 86 must index all of them in one master table.

### H-21 · MEDIUM · Spec 72 vs 85 — `timing_calibration` vs `phase_calibration` parallel tables

Spec 72 §2 + spec 71 §Dynamic calibration describe `timing_calibration` table (permit_type-based medians, used by `src/features/leads/lib/timing.ts` detail-page engine).
Spec 85 consumes `phase_calibration` (phase-to-phase medians, written by `compute-timing-calibration-v2.js`).

`41_chain_permits.md` L28–31 notes: "The detail-page timing engine (spec 71) still reads the `timing_calibration` table; that table will go stale until a future frontend WF migrates it to read from `phase_calibration`."

Two calibration tables with overlapping-but-not-identical semantics. Spec 71 specs the old one, spec 85 specs the new one (via H-5, loosely), migration note says "someday" we'll reconcile. Today: one pipeline produces `phase_calibration`, one frontend reads `timing_calibration`, no producer for the latter.

**Fix:** either (a) mark spec 71 as `SUPERSEDED BY 85` and schedule WF3 to delete `timing_calibration` + migrate frontend to `phase_calibration`; or (b) write a spec for the bridge that keeps both alive with documented staleness tolerance.

### H-22 · MEDIUM · Related-spec naming collisions: 71↔85, 72↔83

Pattern: every 7X spec has an 8X successor with overlapping domain:
- 70 `lead_feed.md` → 80 `lead_feed.md` (80 updated/canonical).
- 71 `lead_timing_engine.md` → 85 `trade_forecast_engine.md` (different scope: 71 is per-permit timing estimate, 85 is per-trade actionable date prediction).
- 72 `lead_cost_model.md` → 83 `lead_cost_model.md` (same title — H-2).
- 74 `lead_feed_design.md` + 75 `lead_feed_implementation_guide.md` — no 8X counterparts, referenced from CLAUDE.md Frontend Mode.

No README in `docs/specs/product/future/` declares which number series is current. Operators searching "cost model" find both 72 and 83.

**Fix:** add `docs/specs/product/future/README.md` declaring spec numbering policy: 70-series = original design (frozen / superseded); 80-series = current April-2026 architecture. Mark 70/71/72 as `SUPERSEDED BY 80/(pending)/83` respectively.

### H-23 · MEDIUM · Spec 86 is implementation-only — lacks boundaries, ownership, audit

Spec 86 has no §5 Operating Boundaries, no §Target Files, no §Out-of-Scope, no Testing Mandate. It's effectively a glossary + implementation-plan document, not a spec.

Consequence: no way to know which files implement it (the 4 consumer scripts are in 81–85; the Admin UI at §4.step-4 doesn't exist and has no spec).

**Fix:** spec 86 must add:
- §5 Operating Boundaries (target files: migrations 091/092/093/094, `scripts/lib/config-loader.js`).
- §6 Testing Mandate (infra test for config loader, migration idempotency).
- Pointer to the (future) Admin UI spec — likely a new `87_admin_control_ui.md`.

### H-24 · MEDIUM · No shared Data Contracts document for the 80-86 family

The enums/types shared across multiple specs are scattered:

| Contract | Declared in | Consumed in |
|---|---|---|
| `lead_key` format | 80, 81 (test), 82 | 81, 82 |
| `urgency` enum | 85 | 81, 82 |
| `target_window` enum | 80, 81, 85 | 81 |
| `cost_source` enum | 83 | 80, 81 (indirectly via cost-estimates JOIN) |
| `calibration_method` enum | 85 (partial) | 85 (self) |
| `lifecycle_phase` values (P1-P20, O1-O4) | 84 | 82, 85 |
| Alert type codes (STALL_WARNING, IMMINENT, etc.) | — (implicit in 82) | 82 |
| `trade_slug` set (32 slugs) | 82 §Seed | 81, 83, 85, 86 |
| `logic_variables` keys | 86 §1 | 81-85 |
| `trade_configurations` columns | 86 §2 | 81-85 |

Six different consumers, zero authoritative file. Every script reviewer flagged a different flavour of this gap (81-S9, 82-S9/10, 83-S9, 85-S2/S9, 86-S2).

**Fix:** create `docs/specs/product/future/80_data_contracts.md` (or rename 80 lead_feed.md section) that enumerates every shared enum + composite key + JSONB shape used by the 80-86 family. Each spec 81–86 references the contracts document.

### H-25 · LOW · Spec 82 "Imminent Window" vs spec 85 "imminent urgency" naming drift

Spec 82 §2: column is `imminent_window_days`.
Spec 85 §4: urgency value is `imminent` (< 14 days).
Spec 86 §2: column is `imminent_window` (drops `_days`).
Spec 86 §3: Admin UI label is "Imminent Window".

Four related-but-distinct concepts with inconsistent naming. Low severity but confuses readers.

**Fix:** pick one canonical name (`imminent_window_days` per the migration/schema). Update spec 86 §2/§3 accordingly.

---

## Summary — Priority Actions

1. **Produce `80_data_contracts.md`** (H-24) — single source of truth for `lead_key`, urgency enum, target_window enum, cost_source enum, phase enum, trade_slug set, alert type codes. Spec 81–86 reference it.
2. **Reconcile spec 72 ↔ 83** (H-2, H-22) — mark 72 SUPERSEDED; add README to `docs/specs/product/future/`.
3. **Spec 85 add Phase Calibration Algorithm section** (H-5, H-6) — document the compute-timing-calibration-v2.js algorithm and the `calibration_method` enum.
4. **Spec 82 handle all 6 urgency values** (H-4, H-14) — enumerate routing for every urgency; declare who owns the `imminent_window_days` threshold.
5. **Spec 84 resolve O2 meaning + O4 removal + O1/O2/O3 downstream contract** (H-7, H-8, H-9) — publish cross-spec orphan handling rule.
6. **Spec 86 become authoritative schema table** (H-12, H-13) — single `logic_variables` + `trade_configurations` master table; other specs reference.
7. **Bulk SPEC LINK rewrite** (H-18) — one WF2 commit across 7 script headers.
8. **Retrofit Operating Boundaries + Control Panel sections** (H-19, H-20, H-23) — specs 80, 82, 84, 86 to CLAUDE.md compliance.
9. **Publish cross-spec dependency DAG** (H-10) — single diagram showing 15→85→82→81→83 feedback loop.
10. **Address `permit_phase_transitions` orphan** (H-15) — either wire calibration consumer or mark observability-only.

---

## Cross-Reference Table — Per-Script Triage Items Resolved by Spec Fixes

| Holistic finding | Resolves triage items |
|---|---|
| H-1 `lead_key` format | 81-S9, 82-W14, 82-W15, 82-S9 |
| H-2 72↔83 collision | 83-W17, 83-S10 |
| H-3 target_window | 80 silent |
| H-4 urgency enum | 81-S3, 82-S5, 82-W17, 85-S2, 85-W18 |
| H-5 calibration algorithm | 85-W14, 86-W5, 86-S1 |
| H-6 calibration_method | 85-D11, 85-S9 |
| H-7 O1/O2/O3 orphans | 82-W7, 82-S4, 84-W1, 84-S12 |
| H-8 O2 contradiction | 84-W2, 84-S3 |
| H-9 O4 phantom | 84-W10, 84-S6, 85-D6 |
| H-10 DAG | cross-cutting |
| H-11 slug drift | 83-W18, 83-S12 |
| H-12 logic_variables keys | 81-S1, 83-S (liar_gate), 84-W5/W7, 85-W15/16/17, 86-W11, RC-W14 |
| H-13 trade_configurations columns | 82 §2, 86 §2, 85-S1 |
| H-14 imminent_window_days ownership | 82-W2, 85-W1, 85-S1 |
| H-15 permit_phase_transitions orphan | 84-W4, 86-W6, RC-S15 |
| H-16 P3-P5 collision | 84-W11, 84-S7 |
| H-17 trade_contract_values shape | 83-S6, 81-D3 |
| H-18 SPEC LINK rot | 81-W7, 82-W16, 83-W17, 84-W6, 85-W14, 86-W5 |
| H-19 Operating Boundaries | CLAUDE.md §Spec Boundary Requirements |
| H-20 Control Panel coverage | 81-S2/S3, 82-S4/S7, 83-S1/S2/S3, 84-W5/W7, 85-W15-17 |
| H-21 timing_calibration parallel | spec 71 + 41_chain_permits note |
| H-22 naming collisions | 70/71/72 ↔ 80/(none)/83 |
| H-23 spec 86 boundaries | cross-cutting |
| H-24 Data Contracts | 81-S9, 82-S9/10, 83-S9, 85-S2/S9, 86-S2 |
| H-25 Imminent naming | 82, 85, 86 §2 |

25 findings. 5 BLOCKER, 13 HIGH, 6 MEDIUM, 1 LOW.
