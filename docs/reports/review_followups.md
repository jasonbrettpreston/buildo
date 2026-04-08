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
