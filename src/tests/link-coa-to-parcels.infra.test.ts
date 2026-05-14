// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.5 step 9 (link_parcels twin)
//             docs/specs/01-pipeline/42_chain_coa.md §6.8 (script catalog — lock 4201)
//             docs/specs/01-pipeline/47_pipeline_script_protocol.md §R1-R12
//
// SQL-string + Spec-47-skeleton regression-lock for scripts/link-coa-to-parcels.js.
//
// Per the R5.2 active task R2 triage:
//   - Advisory lock 4201 (Spec 42 §6.8 Phase D allocation)
//   - Plain `id`-keyset pagination (R2.v5 fix H — application_number is UNIQUE per mig 009)
//   - Per-record SAVEPOINT atomicity (R2.v5 fix #11 — Gemini CRITICAL C2)
//   - Tier 1a (addr_num + street_name_normalized exact) — confidence 0.95
//   - Tier 1b (street_name_normalized only, no street_num) — confidence 0.80
//   - No Tier 2/3 spatial (R2.v5 fix #14)
//   - Bundled neighbourhood pass: PostGIS fast-path + Turf fallback
//   - lat/lng back-fill driven by `parcel_linked_at IS NULL` (R2.v5 fix #1)
//   - Sentinel NULL (not -1) for no-neighbourhood-match (R2.v5 fix #5)
//   - Ghost-cleanup: existence-based, batched LIMIT 1000, separate txn (R2.v5 fix #6)
//   - Per-tier audit breakdown (R2.v5 fix #12)
//   - Day-1 coa_unmatched_threshold_pct logic_variable (R2.v5 fix #9)
//   - centroid_outside_polygon_count audit metric (R2.v5 plan-review fix #2)

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('link-coa-to-parcels.js — Spec 47 §R1-R12 + R5.2 contract', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../../scripts/link-coa-to-parcels.js'),
    'utf-8',
  );

  it('§R1 — imports the pipeline SDK', () => {
    expect(src).toMatch(/require\(['"]\.\/lib\/pipeline['"]\)/);
  });

  it('§R2 — declares advisory lock ID 4201 (Spec 42 §6.8 Phase D allocation)', () => {
    expect(src).toMatch(/(?:const|let)\s+ADVISORY_LOCK_ID\s*=\s*4201\b/);
  });

  it('§R3 — uses pipeline.run() entrypoint with slug "link-coa-to-parcels"', () => {
    expect(src).toMatch(/pipeline\.run\(['"]link-coa-to-parcels['"]/);
  });

  it('§R3.5 — captures DB clock via pipeline.getDbTimestamp at start', () => {
    expect(src).toMatch(/pipeline\.getDbTimestamp\(/);
  });

  it('§R4 — Zod logic_vars validation includes coa_unmatched_threshold_pct (R2.v5 fix #9)', () => {
    expect(src).toMatch(/coa_unmatched_threshold_pct/);
    expect(src).toMatch(/z\.object|LOGIC_VARS_SCHEMA/);
  });

  it('§R6 — wraps work in pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, ...)', () => {
    expect(src).toMatch(/pipeline\.withAdvisoryLock\(\s*pool\s*,\s*ADVISORY_LOCK_ID\b/);
  });

  it('§R7 — keyset pagination on id (R2.v5 fix H — plain id-keyset; application_number UNIQUE so no tiebreaker)', () => {
    // The Tier 1a/1b match queries also have `ORDER BY id DESC LIMIT 1` (tie-breaker),
    // so accept either the bare `id` or `<alias>.id` form for the pagination match.
    expect(src).toMatch(/ORDER\s+BY\s+(?:\w+\.)?id\s+ASC[\s\S]*?LIMIT/i);
    expect(src).toMatch(/WHERE[\s\S]*?(?:\w+\.)?id\s*>\s*\$/i);
  });

  it('§R8 — Tier 1a addr_num + street_name_normalized exact match (confidence 0.95)', () => {
    expect(src).toMatch(/addr_num_normalized\s*=[\s\S]*?street_name_normalized/i);
    expect(src).toMatch(/tier_1a|tier_1a_exact/);
  });

  it('§R8 — Tier 1b street_name_normalized only fallback (confidence 0.80)', () => {
    expect(src).toMatch(/tier_1b|tier_1b_name_only/);
  });

  it('§R8 — does NOT implement Tier 2 spatial cascade (R2.v5 fix #14)', () => {
    expect(src).not.toMatch(/spatial_match_max_distance_m/);
  });

  it('§R8 — duplicate-parcel tie-breaker: ORDER BY parcels.id DESC LIMIT 1 (plan-review fix #11)', () => {
    // The Tier 1a/1b match queries should pick the most-recently-ingested parcel.
    expect(src).toMatch(/ORDER\s+BY[\s\S]*?(?:parcels?\.)?id\s+DESC[\s\S]*?LIMIT\s+1/i);
  });

  it('§R9 — per-record SAVEPOINT atomicity (R2.v5 fix #11 — Gemini CRITICAL C2)', () => {
    expect(src).toMatch(/SAVEPOINT\s+\w+/i);
    expect(src).toMatch(/RELEASE\s+SAVEPOINT|ROLLBACK\s+TO\s+SAVEPOINT/i);
  });

  it('§R9 — outer pipeline.withTransaction wraps the batch (per-row savepoints inside)', () => {
    expect(src).toMatch(/pipeline\.withTransaction\(/);
  });

  it('§R9 — PostGIS detection + dual-path (PostGIS fast-path / Turf fallback) for neighbourhood lookup', () => {
    expect(src).toMatch(/pg_extension[\s\S]*?postgis/i);
    expect(src).toMatch(/ST_Contains|booleanPointInPolygon/);
  });

  it('§R9 — bundled neighbourhood pass uses parcels.centroid_lat/centroid_lng (not raw geometry — plan-review fix #2)', () => {
    expect(src).toMatch(/centroid_lat[\s\S]*?centroid_lng|centroid_lng[\s\S]*?centroid_lat/i);
  });

  it('§R9 — lat/lng back-fill driven by coa_applications.parcel_linked_at IS NULL (NOT lp.matched_at — plan-review fix #1)', () => {
    expect(src).toMatch(/parcel_linked_at\s+IS\s+NULL/i);
    expect(src).not.toMatch(/lp\.matched_at\s*>=\s*\$RUN_AT/i);
  });

  it('§R9 — IS DISTINCT FROM guards on the lat/lng UPDATE (plan-review fix #3)', () => {
    expect(src).toMatch(/IS\s+DISTINCT\s+FROM/i);
  });

  it('§R9 — neighbourhood no-match sentinel is NULL (NOT -1 — plan-review fix #5)', () => {
    // The CoA twin uses NULL, not the permits-side -1 sentinel. The "processed"
    // gate is parcel_linked_at IS NOT NULL, independent of neighbourhood-match.
    // Anti-regression: the script should not contain the -1 sentinel pattern.
    expect(src).not.toMatch(/neighbourhood_id\s*=\s*-1/);
  });

  it('§R9 — ghost-cleanup uses NOT EXISTS pattern, separate transaction, batched LIMIT (plan-review fix #6)', () => {
    expect(src).toMatch(/NOT\s+EXISTS[\s\S]*?coa_applications/i);
    expect(src).toMatch(/LIMIT\s+1000|LIMIT\s+\d+/i);
    expect(src).toMatch(/lead_parcels[\s\S]*?lead_id\s+LIKE\s+'coa:%'/i);
  });

  it('§R10 — PIPELINE_SUMMARY emit (per-tier audit_table per plan-review fix #12)', () => {
    expect(src).toMatch(/audit_table/);
    expect(src).toMatch(/tier_1a_exact|tier_1a_count/);
    expect(src).toMatch(/tier_1b_name_only|tier_1b_count/);
    expect(src).toMatch(/(?:no_parcel_match|unmatched_coa_count|no_address_data)/);
  });

  it('§R10 — centroid_outside_polygon_count audit metric (plan-review fix #2)', () => {
    expect(src).toMatch(/centroid_outside_polygon/);
  });

  it('§R10 — day-1 threshold via logic_variable, WARN not FAIL (plan-review fix #9)', () => {
    // The audit_table verdict should use coa_unmatched_threshold_pct from logic_vars
    // and emit WARN (not FAIL) when above threshold on day 1.
    expect(src).toMatch(/coa_unmatched_threshold_pct/);
  });

  it('§R11 — pipeline.emitMeta() listing CoA reads + lead_parcels writes', () => {
    expect(src).toMatch(/pipeline\.emitMeta\(/);
    expect(src).toMatch(/coa_applications[\s\S]*?lead_parcels|lead_parcels[\s\S]*?coa_applications/i);
  });

  it('§R12 — lockResult.acquired guard at end (SKIP pattern)', () => {
    expect(src).toMatch(/lockResult\.acquired/);
    expect(src).toMatch(/if\s*\(\s*!\s*lockResult\.acquired\s*\)/);
  });

  it('SPEC LINK header present', () => {
    expect(src).toMatch(/SPEC LINK:\s*docs\/specs\/01-pipeline\/42_chain_coa\.md/i);
  });

  it('lead_id reference comes directly from the source coa_applications row (R2.v3 fix — never re-derive via concatenation)', () => {
    // The INSERT INTO lead_parcels should use coa_applications.lead_id directly,
    // not reconstruct it via 'coa:' || application_number.
    expect(src).not.toMatch(/'coa:'\s*\|\|\s*application_number/);
  });
});
