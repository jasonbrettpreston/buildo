# Spec Compliance Review — `scripts/compute-opportunity-scores.js`

**Target spec:** `docs/specs/product/future/81_opportunity_score_engine.md`
**Reviewer:** Claude (Opus 4.6)
**Scope:** Spec→Code coverage, Code→Spec orphans, Cross-script contract drift, SPEC LINK hygiene.

Severity tags: **CRITICAL** (blocks release / correctness) · **HIGH** (spec-code drift, silent risk) · **MEDIUM** (under-specified or hardcoded values) · **LOW** (cosmetic / doc).

---

## Part A — Spec → Code Coverage

| # | Spec requirement (§3 Behavioral Contract / §2 Schema) | Implemented? | Line(s) | Correct? | Notes |
|---|---|---|---|---|---|
| A1 | Process all active trade_forecasts where `urgency <> 'expired'` | YES | 51 | PARTIAL | Uses `NOT IN ('expired')` — semantically equivalent, but LEFT JOIN to `cost_estimates` does NOT filter out rows with missing cost (see A3). |
| A2 | Financial Base: `MIN(trade_value / los_base_unit, 30)` | YES — but name drift | 68 | **MEDIUM drift** | Code uses `vars.los_base_divisor` and `vars.los_base_cap`. Spec §2 names the variable `los_base_unit` with value 10000; the "30" cap is implicit in the formula. DB seeds `los_base_divisor` (10000) + `los_base_cap` (30) — so DB + code agree, but the SPEC is stale (still says `los_base_unit`). Either the spec or the seed should be renamed. |
| A3 | "Missing Cost: If `trade_contract_values` is missing, Base defaults to 0" | YES | 64–65 | CORRECT | `row.trade_contract_values \|\| {}` then `tradeValues[row.trade_slug] \|\| 0` handles both null JSONB and missing slug keys. |
| A4 | Per-trade `multiplier_bid` / `multiplier_work` from `trade_configurations` | YES | 42–43, 49–50, 73–75 | CORRECT | LEFT JOIN + per-trade override; `parseFloat` coerces NUMERIC → number (pg driver returns strings for NUMERIC). |
| A5 | Fallback to global `los_multiplier_bid` / `los_multiplier_work` if trade config missing | YES | 73–75 | CORRECT | `row.multiplier_bid != null ? parseFloat(...) : vars.los_multiplier_bid`. |
| A6 | Competition Discount: `tracking_count * los_penalty_tracking + saving_count * los_penalty_saving` | YES | 78–79 | CORRECT | Matches spec byte-for-byte. |
| A7 | Final LOS: `Clamp((Base * Multiplier) - Discount, 0, 100)` | YES | 82, 85 | CORRECT | `Math.max(0, Math.min(100, Math.round(raw)))`. Spec doesn't specify rounding; `Math.round` is a defensible interpretation for INTEGER column storage. **MEDIUM**: spec silent on rounding mode — document that 0.5 rounds half-to-even? (JS uses half-away-from-zero.) |
| A8 | Integrity Audit: flag rows where `tracking_count > 0 AND modeled_gfa_sqm IS NULL` | YES | 95–97, 102–105 | PARTIAL — count only | Spec says "Flags leads." Current behaviour increments an integer and warns in logs; there is no per-row flag persisted to DB, no alert, no admin dashboard surface. If "flag" means "act on" (e.g., write to an audit table), this is under-implemented. **MEDIUM**. |
| A9 | Negative values → score = 0 | YES | 85 | CORRECT | `Math.max(0, ...)` covers it. |
| A10 | Output: mutate `trade_forecasts.opportunity_score` | YES | 127–135 | CORRECT | Batch UPDATE via VALUES, guarded by `IS DISTINCT FROM`. |
| A11 | Testing mandate: verify lead_key composite format `permit:num:revision` | N/A (this is a test requirement) | — | — | Reviewer verified the format in §C below. |

---

## Part B — Code → Spec Orphan Behaviours

### B1 [HIGH] Hardcoded tier thresholds 80/50/20 (lines 144–148)

The score-distribution query bucketizes scores into `elite` / `strong` / `moderate` / `low` with magic numbers:

```js
WHEN opportunity_score >= 80 THEN 'elite'
WHEN opportunity_score >= 50 THEN 'strong'
WHEN opportunity_score >= 20 THEN 'moderate'
ELSE 'low'
```

Spec 81 is **silent on score tiers**. These labels show up in `emitSummary.records_meta.score_distribution`, which feeds the admin pipeline UI (FreshnessTimeline audit rows). Implications:

- Product teams reading the admin dashboard will interpret "elite" as a defined tier. If these cutoffs don't match the customer-visible UI thresholds used in `src/features/leads/`, operators get a misleading health signal.
- The values belong in `logic_variables` (e.g., `los_tier_elite`, `los_tier_strong`, `los_tier_moderate`) for consistency with how every other scoring constant is governed. DB-driven config is the explicit §5 principle.

**Recommendation:** Either add the tiers to spec 81 §2 and seed them in `logic_variables`, or explicitly document that they are telemetry-only buckets with no product meaning.

### B2 [MEDIUM] `WHERE tf.urgency NOT IN ('expired')` — scoring versus distribution mismatch

- Line 51 (main scoring query): `WHERE tf.urgency NOT IN ('expired')` — expired permits never receive a scoring UPDATE. Their `opportunity_score` retains whatever value it had before the permit expired (could be 75 from last week).
- Line 152 (distribution query): also excludes `expired` — consistent here.

Spec §3.Inputs says "all active `trade_forecasts` where `urgency <> 'expired'`", so scoring-exclusion is spec-compliant. **But** the spec doesn't clarify what happens to pre-existing scores on newly-expired rows. Options:
  1. Leave stale score in place (current behaviour) — misleading in the feed API if any consumer reads expired rows.
  2. Zero out scores on expired rows.
  3. Soft-delete/null the score on expired rows.

Document the chosen semantic in spec §3 Edge Cases. Current silent behaviour is option 1.

### B3 [MEDIUM] `IS DISTINCT FROM` guard (line 133)

`AND tf.opportunity_score IS DISTINCT FROM v.score`

Not in the spec. This is a correct, defensive optimization — it avoids row-churn and trigger fires when the score didn't change. Should be mentioned in spec §2 Implementation as a no-op guard (operational rule). **LOW** severity — it's a perf/write-amplification safeguard, not logic drift.

### B4 [MEDIUM] `COALESCE(la.tracking_count, 0)` fallback (lines 40–41)

Not in spec. When a permit has no `lead_analytics` row at all (brand new permit, never tracked), the COALESCE converts NULL → 0. This is defensible but should be spelled out in spec §3 Edge Cases: "Missing `lead_analytics` row → treated as 0 trackers, 0 savers." Aligns with `update-tracked-projects.js` semantics where rows are created on first tracker.

### B5 [MEDIUM] Per-trade vs global multiplier fallback logic (lines 73–75)

Spec §3 says "Falls back to global `los_multiplier_bid` / `los_multiplier_work`" but doesn't specify which null check triggers fallback. Code uses `row.multiplier_bid != null` — which is correct for `NULL` (no row) or a SQL NULL cell. If `trade_configurations` seeds a 0 or empty-string value, it would NOT fall back (0 is a real number, !=null). Low-risk because the seed table populates all 32 trades with NUMERIC values, but spec should state: "Fallback triggers only when the column is SQL NULL (missing row or unset cell), not when the operator intentionally sets 0."

### B6 [LOW] `target_window` else branch assumes binary domain

Line 73: `row.target_window === 'bid' ? bid-branch : work-branch`. Any value other than `'bid'` — including NULL, an empty string, or a future value like `'prep'` — falls through to the work-branch.

Per the schema (spec §2): `CHECK ('bid', 'work')` — so this should be safe. But `compute-trade-forecasts.js` line 302 is the writer; if that script ever emits a third value, this code silently misclassifies. **LOW** severity while the CHECK constraint holds; upgrade to **HIGH** if CHECK is removed. Recommended: replace with explicit `=== 'work'` branch + a `pipeline.log.warn` for unexpected values.

### B7 [LOW] Score-distribution query excludes expired permits but re-runs the same filter as line 51

The distribution query at lines 142–154 is executed against `trade_forecasts` (not the in-memory `updates` array). This is correct but wastes a second query — the in-memory data already knows each score. Consider computing distribution from `updates` to save a round-trip. Not a correctness issue.

### B8 [MEDIUM] No transaction around batch UPDATEs

Lines 114–137 loop over batches outside any `pipeline.withTransaction`. If a batch fails partway through, prior batches are committed and later ones never run — leaving `trade_forecasts` in a mixed state (some rows scored with today's inputs, others with yesterday's). Not spec-specified either way, but `compute-cost-estimates.js` and `update-tracked-projects.js` both wrap their writes in `withTransaction`. **Contract drift against sibling scripts.**

### B9 [LOW] Missing `audit_table` in `records_meta`

`compute-cost-estimates.js` lines 494–515 provide a rich `audit_table` with threshold/status rows. `compute-opportunity-scores.js` only emits `score_distribution` + `integrity_flags`. The admin `FreshnessTimeline` hides default records_* rows when any other meta exists — so operators lose both the rich audit view and the default view. See identical pattern documented in cost-estimates comment (lines 480–490).

---

## Part C — Cross-Script Contract Drift

### C1 [CRITICAL] `lead_analytics.lead_key` — **format agrees but cast asymmetry exists**

**Writer** (`update-tracked-projects.js` line 277 + 300):
```sql
'permit:' || tp.permit_num || ':' || LPAD(tp.revision_num::text, 2, '0')
```

**Reader** (`compute-opportunity-scores.js` line 48):
```sql
'permit:' || tf.permit_num || ':' || LPAD(tf.revision_num, 2, '0')
```

Schema check (`migrations/001_permits.sql` line 7): `revision_num VARCHAR(10) NOT NULL`.

Because `revision_num` is already VARCHAR, `LPAD(tf.revision_num, 2, '0')` works without explicit cast — Postgres' `LPAD(text, int, text)` signature matches. So the two keys are **byte-for-byte identical** in the happy path.

**But there is a subtle risk:** if a future migration changes `revision_num` to INTEGER or `tracked_projects.revision_num` diverges in type from `trade_forecasts.revision_num`, the LPAD call on the reader side would fail without the `::text` cast while the writer side keeps working. **Recommendation (HIGH, hardening):** add explicit `::text` to the reader for symmetry and future-proofing:

```sql
ON la.lead_key = 'permit:' || tf.permit_num || ':' || LPAD(tf.revision_num::text, 2, '0')
```

This is upgraded to **CRITICAL contract hazard** in the sense that a silent type-drift between the two tables' `revision_num` columns would cause a runtime error only on the reader, not the writer, making the scoring pipeline the crash point — exactly the wrong place for a schema change to surface. Currently functional, but fragile.

### C2 [PASS] `cost_estimates.trade_contract_values` JSONB shape

**Writer** (`compute-cost-estimates.js` lines 205–213, `sliceTradeValues`):
```js
for (const [slug, pct] of Object.entries(TRADE_ALLOCATION_PCT)) {
  const val = Math.round(totalCost * pct);
  if (val > 0) values[slug] = val;
}
```

Keys are trade slugs (e.g., `"framing": 45000`), values are integers. `TRADE_ALLOCATION_PCT` is built from `trade_configurations.allocation_pct` keyed by `trade_slug` (line 390–392).

**Reader** (`compute-opportunity-scores.js` line 65):
```js
const tradeValue = tradeValues[row.trade_slug] || 0;
```

Uses `tf.trade_slug` from `trade_forecasts`, which `compute-trade-forecasts.js` populates from `trades.slug` (line 161). All three scripts share the same slug dictionary. **Contract holds.** Edge case: if cost is null/zero, writer writes `{}` (line 263), reader returns 0 — consistent.

### C3 [PASS] `trade_forecasts` columns consumed

Reader needs: `permit_num, revision_num, trade_slug, target_window, urgency`.

Writer (`compute-trade-forecasts.js` line 302, line 378–383) populates all five, with `target_window` constrained to `'bid' | 'work'` by the bimodal routing at lines 219–227. **No third value can be written under current logic** — `else` branch at line 225 assigns `'work'`. So the reader's binary ternary (B6 above) is safe.

### C4 [MEDIUM] `trade_forecasts.urgency` values — reader must handle all producer values

Writer urgency domain (line 72–83): `'expired', 'overdue', 'delayed', 'imminent', 'upcoming', 'on_time'`.

Reader excludes `'expired'` at line 51. All others reach the scoring loop and are treated identically — competition-discount math doesn't care about urgency beyond the expired gate. Fine today. If spec 81 ever introduces urgency-dependent scoring (e.g., "imminent" permits get a bonus), this contract needs a producer update.

---

## Part D — SPEC LINK Correctness

### D1 [HIGH] Wrong SPEC LINK on line 12

Current:
```
SPEC LINK: docs/reports/lifecycle_phase_implementation.md
```

That file is an implementation *report*, not a spec. The authoritative spec for opportunity scoring is `docs/specs/product/future/81_opportunity_score_engine.md`. Fix:

```
SPEC LINK: docs/specs/product/future/81_opportunity_score_engine.md
```

### D2 [HIGH] Sibling scripts share the same stale SPEC LINK

- `scripts/compute-trade-forecasts.js` line 10 → `SPEC LINK: docs/reports/lifecycle_phase_implementation.md §Phase 4`. Should point to `docs/specs/product/future/80_*` (or equivalent trade-forecast spec).
- `scripts/update-tracked-projects.js` line 15 → same stale path. Should point to the tracked-projects / CRM spec (likely in `docs/specs/product/future/9X_*`).

All three scripts were evidently scaffolded off the same implementation-report draft before the product specs were renumbered into `docs/specs/product/future/`. Recommend a bulk SPEC LINK sweep across the 80–86 script batch.

### D3 [LOW] Top-of-file JSDoc description is accurate but incomplete

The header (lines 3–10) accurately summarizes the scoring goal and integrity audit, but omits:
- The control-panel dependency (loads config from `trade_configurations` + `logic_variables` via `loadMarketplaceConfigs`).
- The chain position ("step 23 of 24" per spec §2 Pipeline Wiring).
- The `IS DISTINCT FROM` guard.

Not blocking — nice-to-have polish.

---

## Summary Table

| Severity | Count | Items |
|---|---|---|
| CRITICAL | 1 | C1 (cast asymmetry = latent runtime failure under future schema drift) |
| HIGH | 3 | B1 (hardcoded tiers), D1 (wrong SPEC LINK), D2 (sibling SPEC LINKs) |
| MEDIUM | 7 | A2, A7, A8, B2, B4, B5, B8, B9 |
| LOW | 4 | B3, B6, B7, D3 |

**Verdict:** The script is **functionally spec-compliant** on the core scoring algorithm (A1–A10 all PASS or PARTIAL-with-correct-logic). The integrity-audit behaviour (A8) is under-implemented relative to the word "flags" in the spec. Primary hardening targets:

1. Fix the SPEC LINK on line 12 (5-second fix, blocks nothing but costs reviewer cycles every time).
2. Move tier thresholds 80/50/20 into `logic_variables` or document them in spec 81.
3. Wrap the batch UPDATE loop in `withTransaction` to match sibling-script discipline.
4. Add explicit `::text` cast on the `lead_analytics` JOIN for symmetry with the writer.
5. Seed spec 81 with the actual variable names (`los_base_divisor` + `los_base_cap`) to match the DB seed in migration 092.
