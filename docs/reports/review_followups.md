# Review Follow-ups Log

**Append-only.** Tracks deferred items from independent + adversarial reviews so they don't get lost across WFs. Items move from the active table to the **Closed** section at the bottom when resolved.

**How to use:**
- Each WF that runs reviews appends a new section with its commit SHA(s) and date.
- One row per deferred item: severity, source, item, planned home, status.
- When closing an item, change `OPEN` to `closed-in-<commit-sha>` and move the row to the Closed section.
- Future independent review agents should read this file BEFORE generating their own checklist so they don't repeat known-deferred items.

**Severity legend:** CRITICAL · HIGH · MED · LOW · NIT
**Source legend:** Gemini · DeepSeek · Independent · Self
**Status legend:** OPEN · closed-in-<sha> · WONTFIX (with reason in parentheses)

---

## Active

| Sev | Source | Item | Planned home | Status |
|-----|--------|------|--------------|--------|
| MED | Gemini+DeepSeek | `LeadFeedItem` is a flat interface with nullable fields per lead type, not a discriminated union. Matches the SQL UNION ALL row shape but forces defensive null checks in consumers. Refactor to `PermitFeedItem \| BuilderFeedItem` after Phase 1b-iii ships and we see the actual consumer patterns. | Phase 2 API or later refactor WF | OPEN |
| MED | DeepSeek | `TradeTimingEstimate` `confidence` and `tier` are independent string/number fields — impossible combinations like `{confidence:'high', tier:3}` are representable. Consider a discriminated union keyed on `tier`. | Phase 1b-ii (timing engine implementation) | OPEN |
| MED | Gemini+DeepSeek | `cost-model.ts` string-based permit categorization via `.toLowerCase().includes(...)` is brittle against misspellings or unusual permit types. Matches the existing codebase pattern in `classifier.ts`. Extract to a shared categorization function in a future hardening WF. | Future hardening WF | OPEN |
| MED | Gemini+DeepSeek | `determineBaseRate` defaults unknown new-build structure types (e.g., "Institutional", "Industrial") to SFD rate. Arbitrary choice — spec 72 doesn't cover these categories. Document the default or add explicit Institutional/Industrial rates. | Future spec 72 update | OPEN |
| MED | Gemini+DeepSeek | Cliff effect at `tenure_renter_pct = 50%` boundary (0.4 → 0.7 coverage). A 0.2% change in rent-pct flips a 75% cost difference. Spec-compliant but brittle. Smooth to interpolation in a future refinement. | V2 cost model refinement | OPEN |
| MED | DeepSeek | `compute-cost-estimates.js` uses single-row INSERTs inside the transaction (5000 sequential queries per batch). Bulk `INSERT ... VALUES` or `UNNEST` would be 50-100x faster. Fine for correctness; optimize later if nightly run time becomes an issue. | Phase 2+ perf optimization | OPEN |
| LOW | Gemini+DeepSeek | Tests for exported constants (`expect(BASE_RATES.sfd).toBe(3000)`) are snapshot-style change detectors, not behavior tests. Kept as spec-conformance tests; they lock the values to spec 72 table. Behavioral tests for each base rate added in commit `909b3d5`. | N/A (kept intentionally) | WONTFIX |
| LOW | Gemini+DeepSeek | `lat`/`lng`/score fields in `types.ts` are unconstrained `number`. Validation happens at Phase 2's `/api/leads/feed` Zod layer per spec 70. | Phase 2 API route | OPEN |
| LOW | Gemini | `model_version` hardcoded to 1. Will be incremented manually when formula changes; current = initial version. | On next formula change | OPEN |
| LOW | DeepSeek | Duplicate scope tags (e.g., `['pool', 'pool']`) would stack the addition twice. Extremely unlikely in real data; defer to source data hygiene. | Reactive | OPEN |
| LOW | Independent (retry pending) | Independent review agent hit 529 API overload twice on commit `a460904`. Dual code path was verified manually inline via constant-by-constant audit + 3 sample-input walkthroughs (documented in commit message and triage response). Full self-generated checklist deferred to next agent availability. | Re-run on next sub-WF or standalone | OPEN |
| MED | Independent | Spec 70 §Database Schema says "DOWN migration required (migration 067)" but the actual file is migration 070. Doc-only inconsistency. | Doc-only WF3 | OPEN |
| MED | Independent | Spec 71 §Database Schema lists `Unique: (stage_name, trade_slug)` but the seed data + spec prose require precedence in the unique key (painting appears under both Fire Separations prec 10 and Occupancy prec 20). Migration 072 implements `(stage_name, trade_slug, precedence)` correctly; the spec text needs to match. | Doc-only WF3 | OPEN |
| MED | Independent | `db:generate` deferred during Phase 1a because local `npm run migrate` fails at pre-existing migration 030 (`column "updated_at" of relation "trade_mapping_rules" does not exist`). Drizzle types may drift from the new lead_views/cost_estimates/inspection_stage_map/timing_calibration tables. | Phase 1b (run after CI clean DB OR repair local migration 030) | OPEN |
| LOW | Independent | No DB-roundtrip integration tests for the new CHECK constraints, FK CASCADEs, or XOR logic on lead_views. File-shape regex tests verify SQL structure but cannot catch a runtime constraint failure. Only safe to rely on once CI runs against a clean DB. | Phase 1b CI step | OPEN |
| LOW | Independent | No idx on `(trade_slug, precedence)` in inspection_stage_map. Fine for 21 seed rows; would matter if seed grows to thousands. | Reactive — only if seed grows | OPEN |
| LOW | Gemini | `src/lib/permits/types.ts` `PermitChange.old_value`/`new_value` typed as `string \| null` — loses type fidelity for numeric/date/boolean fields. Pre-existing, not touched by Phase 1a. | Future types-hardening WF | OPEN |
| LOW | Gemini | `src/lib/permits/types.ts` `PermitFilter.sort_by` typed as `string` — should be `keyof Permit` for compile-time safety + SQL injection defense. Pre-existing. | Future types-hardening WF | OPEN |
| LOW | Gemini | `src/lib/permits/types.ts` `Inspection.inspection_date` and `scraped_at` typed as `string` — inconsistent with `Permit` interface using `Date`. Pre-existing. | Future types-hardening WF | OPEN |
| LOW | Gemini | `src/lib/permits/types.ts` `Permit.dwelling_units_created`, `dwelling_units_lost`, `housing_units`, `storeys` typed as `number` (non-nullable) but ingested from raw strings — no protection against `""` / `"N/A"` producing `NaN`. Pre-existing. | Future types-hardening WF | OPEN |
| LOW | Gemini | `src/lib/permits/types.ts` `TradeMappingRule.match_field` typed as `string` — should be `keyof RawPermitRecord` to prevent typos. Pre-existing. | Future types-hardening WF | OPEN |
| LOW | Gemini | `src/lib/permits/types.ts` `Permit.location` typed as `unknown \| null` — no GeoJSON shape definition. Pre-existing. | Future types-hardening WF | OPEN |
| LOW | Gemini | `src/lib/permits/types.ts` `SyncRun.status` typed as generic `string` — should be a literal union. Pre-existing. | Future types-hardening WF | OPEN |
| LOW | Gemini | `src/lib/permits/types.ts` `Entity.is_wsib_registered: boolean` cannot represent the "unknown / not yet checked" state — should be `boolean \| null`. Pre-existing. | Future types-hardening WF | OPEN |

---

## Closed

| Sev | Source | Item | Closed in | Notes |
|-----|--------|------|-----------|-------|
| CRITICAL | Gemini | Migration 072: missing `CHECK (min_lag_days <= max_lag_days)` allowing nonsensical lag windows | `909b3d5` | Also confirmed by DeepSeek MED |
| CRITICAL | DeepSeek | Migration 072: `stage_sequence` had no enforcement of the known-vocabulary constraint, allowing rogue sequence values that would break Tier 1 timing engine sequence-gap math | `909b3d5` | Closed via `CHECK (stage_sequence IN (10,20,30,40,50,60,70))` |
| HIGH | DeepSeek | Migration 071: `premium_factor DECIMAL(3,2)` permitted negatives, violating spec 72's documented 1.0–2.0 range | `909b3d5` | Closed via `CHECK (premium_factor >= 1.0)` |
| MED | DeepSeek | Migration 072: `precedence` lacked positive-value enforcement | `909b3d5` | Closed via `CHECK (precedence > 0)` |
| LOW | DeepSeek + Independent | Migration 071: no integrity check that `cost_range_low <= cost_range_high` when both populated | `909b3d5` | Closed via composite CHECK |
| HIGH | Gemini | Migration 070: UNIQUE `(user_id, lead_key, trade_slug)` "blocks re-viewing" — flagged as bug | n/a | WONTFIX — per spec 70 this is a state table with upsert semantics; the `saved` column makes the design explicit |
| HIGH | Gemini + DeepSeek | Migration 070: DOWN block is non-functional (commented out) | n/a | WONTFIX — codebase pattern (065/066/069 follow same convention); table is brand-new with zero data, rollback risk is purely structural |
| HIGH | Gemini | Migration 070: ON DELETE CASCADE on FKs to permits/entities is "dangerous" | n/a | WONTFIX — explicitly per spec 70 §Database Schema with cleanup-strategy discussion |
| HIGH | Gemini + DeepSeek | Migration 070: `user_id` lacks FK to a users table | n/a | WONTFIX — per spec 70 explicitly: "user_id NOT a FK (Firebase UID)" |
| HIGH | DeepSeek | Migration 070: XOR CHECK constraint "logically broken" | n/a | FALSE ALARM — DeepSeek misread; the CHECK is logically tight (verified by manual case analysis) |
| CRITICAL | DeepSeek | Migration 070: FK to `permits(permit_num, revision_num)` "assumes composite PK that may not exist" | n/a | FALSE ALARM — verified `migrations/001_permits.sql` PK is `(permit_num, revision_num)` composite |
| LOW | DeepSeek | Migration 070: VARCHAR(30)/VARCHAR(10) lengths "may not match permits table" | n/a | FALSE ALARM — verified, lengths match exactly |
| MED | Gemini | Migration 072: stage_name/trade_slug have no FK to lookup tables | n/a | WONTFIX — codebase-wide convention; trade slugs are referenced by string everywhere |
| MED | Gemini + DeepSeek | All migrations: should use ENUM types instead of VARCHAR + CHECK | n/a | WONTFIX — codebase consistency; CHECK approach is established |
| HIGH | Gemini | Migration 070: polymorphic table is an anti-pattern; should split into permit_lead_views + builder_lead_views | n/a | WONTFIX — per spec 70 §Database Schema explicit design decision |
| HIGH | Gemini | `src/lib/permits/types.ts` 7 pre-existing issues (sort_by, PermitChange, Inspection dates, etc.) | n/a | OUT OF SCOPE — this WF didn't touch those fields; tracked above as LOW for future hardening WF |

## 2026-04-08 — Phase 1b-i Cost Model (commits a460904 + Phase 1b-i review fixes)

| Sev | Source | Item | Closed in | Notes |
|-----|--------|------|-----------|-------|
| HIGH | Self (test caught it) | `determineBaseRate` returned `addition` rate ($2000) for `permit_type='Interior Alteration'` because `'alteration'` substring matched before any `'interior'` check. Spec 72 distinguishes "Addition/alteration" from "Interior renovation" — they should NOT collapse. | this commit | Fixed in BOTH cost-model.ts and compute-cost-estimates.js (dual code path) by adding `'interior'` branch BEFORE `'alteration'`. Test caught it. |
| HIGH | Gemini | `formatDistanceForDisplay` rounded 999.5 → "1000m" (shadows the 1.0km format) | this commit | Fixed via `Math.floor` for sub-km values |
| MED | Gemini+DeepSeek | `formatDistanceForDisplay` had no defense against NaN/Infinity/negative inputs | this commit | Fixed via `Number.isFinite` guard returning "—" placeholder |
| HIGH | Gemini | cost-model SFD test used loose `toBeGreaterThan(1_000_000)` instead of exact value | this commit | Replaced with `toBeCloseTo(1_380_000, 0)` |
| HIGH | Gemini | cost-model residential vs commercial test used `not.toBe()` (no direction check) | this commit | Replaced with explicit `toBeCloseTo` for both + `toBeGreaterThan` direction assertion |
| HIGH | Gemini | cost-model only had behavioral test for SFD base rate; missing for semi/town, multi-res, addition, commercial, interior_reno | this commit | Added 5 explicit behavioral tests with exact expected values |
| LOW | Gemini | cost-model fallback range test wrapped assertions in `if (!== null)` blocks that silently skip | this commit | Replaced with `expect().not.toBeNull()` then unconditional spread calc |
| HIGH | DeepSeek | `compute-cost-estimates.js` advisory lock could "leak forever on crash" | this commit | Added inline comment explaining `pg_try_advisory_lock` is session-scoped — Postgres auto-releases on connection close, which the SDK does on script exit. No code change needed; clarification only. |
| CRITICAL | Gemini | "dual code path is a time bomb" — manual sync between TS and JS guaranteed to drift | n/a | WONTFIX — per CLAUDE.md §7 Backend Mode rule 8, dual code path is the established pattern for classification/scoring/scope. Cross-reference comments + infra test asserting both files reference the same constant names + manual byte-for-byte audit in commit message. Future hardening WF can extract to shared JSON. |
| CRITICAL | Gemini+DeepSeek | `LeadFeedItem` "grab-bag of nullable fields" violates discriminated union | n/a | WONTFIX for Phase 1b-i — flat shape mirrors the SQL UNION ALL row. Tracked above as MED for Phase 2 refactor when consumer patterns are known. |
| HIGH | Gemini+DeepSeek | `model_version` hardcoded to 1 "defeats versioning" | n/a | WONTFIX — version 1 IS the current model version; bumped manually on formula change. Tracked above as LOW. |
| HIGH | Gemini+DeepSeek | `determineBaseRate` defaults unknown new builds to SFD | n/a | Tracked above as MED — needs spec 72 update to cover Institutional/Industrial categories. Code defensible as best-effort default. |
| HIGH | Gemini+DeepSeek | `computeComplexityScore` stacks +10 per scope tag, "double-counts" | n/a | DEFENSIBLE — spec 72 literally says "Complex scope (underpinning, elevator, pool): +10 each". "Each" = each present scope. |
| HIGH | DeepSeek | `compute-cost-estimates.js` `flushBatch` does sequential single-row INSERTs | n/a | Tracked above as MED for Phase 2 perf optimization. Correct, just slow. |
| HIGH | DeepSeek | `LATERAL SELECT parcel_id ORDER BY ASC LIMIT 1` arbitrary parcel pick | n/a | DEFENSIBLE — already documented in Phase 1b-i plan Risk Note 3 as known limitation. Permits with multiple parcels are rare. |
| HIGH | Gemini+DeepSeek | `tenure_renter_pct > 50` cliff effect | n/a | Tracked above as MED for V2 cost model refinement. |
| HIGH | DeepSeek | `PLACEHOLDER_COST_THRESHOLD = 1000` rejects legit small jobs | n/a | DEFENSIBLE — per spec 72 explicit decision: ">1000 threshold filters out placeholder values like $1". |
| HIGH | DeepSeek | premium_factor not applied to scope_additions ("$80K pool same in low-income as premium") | n/a | DEFENSIBLE — per spec 72 "Scope additions ... additive AFTER the area × rate × premium calculation, never multiplied". |
| HIGH | DeepSeek | premium tier off-by-one boundary | n/a | FALSE ALARM — verified manually: `income=60000` matches tier 2 (`60000 >= 60000 && 60000 < 100000`). |
| HIGH | DeepSeek | `est_const_cost::float8` cast fails on non-numeric strings | n/a | FALSE ALARM — source column is `DECIMAL(15,2)` per migration 001, not text. Cast is safe. |
| MED | DeepSeek | `batch = []` not cleared on flushBatch throw, retries indefinitely | n/a | FALSE ALARM — `batch = []` is OUTSIDE the inner try/catch, runs regardless of throw. |
| HIGH | Gemini | infra tests "tautological / box-ticking" | n/a | DEFENSIBLE — file-shape tests are a deliberate fallback because local DB is broken at migration 030 (Phase 1a known blocker). They lock the SQL structure against drift; behavioral tests will run in CI against a clean DB. |
| MED | Gemini | distance.test "tests for constants are change-detector noise" | n/a | DEFENSIBLE — constants ARE the spec 72 contract; tests serve as spec-conformance locks. Behavioral tests for the constants USING them now also added. |
