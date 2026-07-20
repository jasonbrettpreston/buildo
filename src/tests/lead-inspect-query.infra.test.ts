// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.5 (Cycle 7)
//             docs/specs/01-pipeline/83_lead_cost_model.md §7 (the dual-path
//             reference SOURCE_SQL pattern this test enforces consistency with)
//
// SQL-shape regression-lock for src/lib/leads/lead-inspect-query.ts.
//
// Why this test exists (WF3 2026-05-08):
//   The original WF2 #4 implementation (commit 6683477) aliased the
//   parcel_buildings LATERAL subquery as `pb` and SELECTed `pb.area_sqm`
//   and `pb.height_m` directly — but those columns DON'T EXIST on
//   parcel_buildings (it's a join table per migrations 024 + 026; the
//   geometry lives on building_footprints per migration 023). The bug
//   slipped because `admin-leads-inspect.infra.test.ts` mocks
//   fetchLeadInspect (so the SQL was never exercised) and
//   `admin-detail-inspectors.ui.test.tsx` mocks the API response.
//
//   The fix mirrors the SOURCE_SQL pattern in scripts/compute-cost-estimates.js:
//   the LATERAL fetches `building_id` only; a top-level
//   `LEFT JOIN building_footprints bf` resolves the geometry; SELECTs read
//   from `bf.footprint_area_sqm` / `bf.max_height_m`.
//
// What this test catches: any regression that re-introduces the broken
// shape (text-level). It does NOT exercise the SQL against a live DB —
// a live-DB infra harness for inspect SQL is filed as a follow-up in
// docs/reports/review_followups.md.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const QUERY_PATH = path.resolve(
  __dirname,
  '../../src/lib/leads/lead-inspect-query.ts',
);

describe('lead-inspect-query.ts — SQL-shape regression-lock (WF3 2026-05-08)', () => {
  let src: string;

  beforeAll(() => {
    src = fs.readFileSync(QUERY_PATH, 'utf-8');
  });

  it('does NOT reference pb.area_sqm (the broken column on parcel_buildings)', () => {
    // parcel_buildings has no area_sqm column (migs 024 + 026 schema:
    // id, parcel_id, building_id, is_primary, structure_type, linked_at,
    // match_type, confidence). Geometry lives on building_footprints.
    expect(src).not.toMatch(/\bpb\.area_sqm\b/);
  });

  it('does NOT reference pb.height_m (the broken column on parcel_buildings)', () => {
    // Same root cause — height_m is on building_footprints, not parcel_buildings.
    expect(src).not.toMatch(/\bpb\.height_m\b/);
  });

  it('SELECTs bf.footprint_area_sqm aliased as pb_area_sqm (correct column from building_footprints)', () => {
    // Migration 023: building_footprints.footprint_area_sqm is the
    // canonical column. Aliasing to pb_area_sqm preserves the MainRow
    // TS interface so the JS-side mapper requires no edits.
    expect(src).toMatch(/bf\.footprint_area_sqm[\s\S]*?AS\s+pb_area_sqm/i);
  });

  it('SELECTs bf.max_height_m aliased as pb_height_m (correct column from building_footprints)', () => {
    expect(src).toMatch(/bf\.max_height_m[\s\S]*?AS\s+pb_height_m/i);
  });

  it('joins building_footprints via the building_id from the parcel_buildings LATERAL', () => {
    // Mirrors scripts/compute-cost-estimates.js SOURCE_SQL lines 86-92:
    // the LATERAL fetches building_id only; a top-level LEFT JOIN resolves
    // the geometry. Single source of truth — both surfaces stay aligned.
    expect(src).toMatch(/LEFT\s+JOIN\s+building_footprints\s+bf\s+ON\s+bf\.id\s*=\s*pb\.building_id/i);
  });

  it('LATERAL subquery selects building_id from parcel_buildings (not geometry columns)', () => {
    // Multiline aware — the LATERAL spans several lines.
    const lateralBlock = src.match(
      /LEFT\s+JOIN\s+LATERAL\s*\(\s*SELECT\s+building_id[\s\S]*?FROM\s+parcel_buildings[\s\S]*?\)\s+pb\s+ON\s+true/i,
    );
    expect(lateralBlock).toBeTruthy();
  });

  // ─── Drift #2: parc.area_sqm doesn't exist on parcels (mig 011: lot_size_sqm)

  it('does NOT reference parc.area_sqm (the broken column on parcels)', () => {
    // parcels (mig 011) has lot_size_sqm — there is no area_sqm column.
    expect(src).not.toMatch(/\bparc\.area_sqm\b/);
  });

  it('SELECTs parc.lot_size_sqm aliased as parcel_area_sqm (correct column from parcels)', () => {
    expect(src).toMatch(/parc\.lot_size_sqm[\s\S]*?AS\s+parcel_area_sqm/i);
  });

  // ─── Drift #3 (CORRECTED 2026-05-08): permits.neighbourhood_id is a
  // FK to neighbourhoods.id (SERIAL) per migration 109 fk_permits_neighbourhoods.
  // The earlier WF3 73f3ae6 commit incorrectly flipped this to n.neighbourhood_id
  // based on compute-cost-estimates.js — but that script is ALSO wrong (separate
  // WF3 deferred to review_followups.md). The truth: lead-detail-query.ts:101
  // uses `n.id = p.neighbourhood_id` and that's the FK-correct join.

  it('joins neighbourhoods on n.id = p.neighbourhood_id (the SERIAL FK per mig 109)', () => {
    // Mig 109 step 4a-c: ALTER TABLE permits ADD CONSTRAINT fk_permits_neighbourhoods
    //   FOREIGN KEY (neighbourhood_id) REFERENCES neighbourhoods(id);
    // Step 4b nullified non-matching rows. Step 4c VALIDATEd. → permits.neighbourhood_id
    // CONTAINS SERIAL `id` values. Joining on n.neighbourhood_id (the city
    // open-data PK) returns the WRONG neighbourhood for every permit.
    expect(src).toMatch(/LEFT\s+JOIN\s+neighbourhoods\s+n\s+ON\s+n\.id\s*=\s*p\.neighbourhood_id/i);
  });

  it('does NOT join neighbourhoods on n.neighbourhood_id (regression-lock against the FK-wrong join)', () => {
    expect(src).not.toMatch(/JOIN\s+neighbourhoods\s+n\s+ON\s+n\.neighbourhood_id\s*=\s*p\.neighbourhood_id/i);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Spec 79 §7 Surface 1 Pass-2 fold (2026-05-20): CoA Lead Inspector hit
// 4 schema-drift crashes when invoked with COA-<application_number>:
//   1. lead_trades.trade_slug — column doesn't exist (FK is trade_id)
//   2. trades.display_name — column is `name`
//   3. $2/$3 in COA_CROSS_STREAM_SQL — null param type ambiguity (42P18)
//   4. lifecycle_status_history.id — BIGINT returns as string, LeadInspect
//      schema requires number → ZodError
// ────────────────────────────────────────────────────────────────────────
describe('lead-inspect-query.ts — CoA Lead Inspector schema drift (Spec 79 §7 Surface 1)', () => {
  const src = fs.readFileSync(QUERY_PATH, 'utf-8');

  it('COA_LEAD_TRADES_SQL reads lt.trade_id and JOINs trades on t.id = lt.trade_id (NOT lt.trade_slug)', () => {
    // The lead_trades schema is (id, lead_id, trade_id, confidence, tier, ...) — there is no `trade_slug` column.
    const block = src.match(/COA_LEAD_TRADES_SQL\s*=\s*`[\s\S]*?`/)?.[0] ?? '';
    expect(block, 'COA_LEAD_TRADES_SQL block not found').toBeTruthy();
    expect(block).toMatch(/lt\.trade_id/);
    expect(block).toMatch(/JOIN\s+trades\s+t\s+ON\s+t\.id\s*=\s*lt\.trade_id/i);
    // Negation: must NOT bare-read trade_slug from lead_trades.
    expect(block).not.toMatch(/lt\.trade_slug/);
    expect(block).not.toMatch(/ON\s+t\.slug\s*=\s*lt\.trade_slug/i);
  });

  it('COA_LEAD_TRADES_SQL aliases t.name AS display_name (trades has `name`, not `display_name`)', () => {
    const block = src.match(/COA_LEAD_TRADES_SQL\s*=\s*`[\s\S]*?`/)?.[0] ?? '';
    expect(block).toMatch(/t\.name\s+AS\s+display_name/i);
    expect(block).not.toMatch(/\bt\.display_name\b(?!\s+AS)/);
  });

  it('COA_CROSS_STREAM_SQL casts $2 and $3 as ::text to resolve nullable-param ambiguity (PG 42P18)', () => {
    const block = src.match(/COA_CROSS_STREAM_SQL\s*=\s*`[\s\S]*?`/)?.[0] ?? '';
    expect(block, 'COA_CROSS_STREAM_SQL block not found').toBeTruthy();
    expect(block).toMatch(/\$2::text\s+IS\s+NOT\s+NULL/i);
    expect(block).toMatch(/\|\|\s*\$2::text\s*\|\|/);
    expect(block).toMatch(/\$3::text\s+IS\s+NOT\s+NULL/i);
    expect(block).toMatch(/lead_id\s*=\s*\$3::text/i);
  });

  it('COA_CROSS_STREAM_SQL casts id::int — lifecycle_status_history.id is BIGINT (pg returns string by default)', () => {
    const block = src.match(/COA_CROSS_STREAM_SQL\s*=\s*`[\s\S]*?`/)?.[0] ?? '';
    // All three UNION ALL arms must cast id; LeadInspectSchema declares id: number.
    const idCasts = block.match(/id::int/g) ?? [];
    expect(idCasts.length).toBeGreaterThanOrEqual(3);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Spec 79 §7a Pass-2.5 WF3 #1 (2026-05-20): Cross-stream timeline duplicate
// permit row.
// When fetchCoaPanel is called on a PERMIT lead linked to a CoA, Arm 1
// (`lead_id=$1`) and Arm 2 (`lead_id LIKE 'permit:'||$2||':%'`) BOTH match
// the active permit's lifecycle_status_history row, producing a duplicate
// in cross_stream_timeline. Fix: add `lead_id <> $1` exclusion to Arm 2
// (primary) and Arm 3 (defense-only). Also add `$2::text <> ''` empty-
// string guard from DeepSeek plan-review.
// Original duplicate observed live on permit 25 237692 PLB--00 (4/4
// CoA-linked permits in 12-permit sample reproduced 100%).
// ────────────────────────────────────────────────────────────────────────
describe('lead-inspect-query.ts — Cross-stream timeline dedup (Spec 79 §7a WF3 #1)', () => {
  const src = fs.readFileSync(QUERY_PATH, 'utf-8');
  const crossStreamBlock = src.match(/COA_CROSS_STREAM_SQL\s*=\s*`[\s\S]*?`/)?.[0] ?? '';

  it('COA_CROSS_STREAM_SQL has exactly 2 `lead_id <> $1` exclusions (Arms 2 + 3)', () => {
    // Whitespace-tolerant + count-exact (catches future drift where someone removes one arm's guard).
    const matches = crossStreamBlock.match(/lead_id\s*<>\s*\$1\b/g) ?? [];
    expect(matches.length).toBe(2);
  });

  it('Arm 2 has the `lead_id <> $1` exclusion that prevents Arm 1 overlap', () => {
    // The permit-arm: matches against `LIKE 'permit:' || $2::text || ':%'` then must exclude active lead.
    // Tightened lookahead from 200→80 per Independent IMPL review (Item 6 FLAG) — only ESCAPE clause
    // and whitespace sit between the two predicates; 80 chars is generous without permitting drift.
    expect(crossStreamBlock).toMatch(
      /lead_id\s+LIKE\s+'permit:'\s*\|\|\s*\$2::text\s*\|\|\s*':%'[\s\S]{0,80}?lead_id\s*<>\s*\$1/i,
    );
  });

  it('Arm 3 has the `lead_id <> $1` paranoid/defense-in-depth exclusion', () => {
    // The cross-stream-coa arm: matches against `lead_id = $3::text` then has the defense exclusion.
    expect(crossStreamBlock).toMatch(
      /lead_id\s*=\s*\$3::text[\s\S]{0,100}?lead_id\s*<>\s*\$1/i,
    );
  });

  it('Arm 2 has the `$2::text <> \'\'` empty-string guard (DeepSeek plan-review fold)', () => {
    // Empty-string would otherwise let `LIKE 'permit::%'` through and match unrelated rows.
    expect(crossStreamBlock).toMatch(/\$2::text\s*<>\s*''/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// WF3 Pass-2.5 Finding C Phase 5 (2026-05-22) — event_date column passed
// through each UNION arm + TZ-deterministic ORDER BY using DATE-only
// comparison via `AT TIME ZONE 'UTC'`. Plan v2 fix per 3-reviewer
// convergence (Gemini CRIT + DeepSeek MED + Independent ITEM 2) — the
// plan-v1 `COALESCE(event_date::timestamptz, transitioned_at)` was
// session-TZ-dependent. New form casts transitioned_at to DATE under
// explicit UTC so both sides of COALESCE are DATE.
// ────────────────────────────────────────────────────────────────────────
describe('lead-inspect-query.ts — Cross-stream timeline event_date (Spec 79 §7a WF3 #11 Finding C Phase 5)', () => {
  const src = fs.readFileSync(QUERY_PATH, 'utf-8');
  const crossStreamBlock = src.match(/COA_CROSS_STREAM_SQL\s*=\s*`[\s\S]*?`/)?.[0] ?? '';

  it('Each of the 3 UNION arms SELECTs event_date::text AS event_date', () => {
    const matches = crossStreamBlock.match(/event_date::text\s+AS\s+event_date/g) ?? [];
    expect(matches.length).toBe(3);
  });

  // WF3 FIX (Supabase Phase 1 satellite, symptom C root cause): a bare
  // ORDER BY directly on the 3-arm UNION ALL resolves `event_date`/
  // `transitioned_at` against the UNION's projected (TEXT) column types —
  // `text AT TIME ZONE 'UTC'` has no operator (42883 on EVERY call, live-
  // reproduced). The fix wraps the UNION as a `cross_stream` subquery and
  // moves ORDER BY to the outer (non-set-op) SELECT, where the TEXT columns
  // can be re-cast back to DATE/TIMESTAMPTZ for the sort computation —
  // Postgres also forbids re-casting a set-operation's own output column in
  // its own ORDER BY (0A000), which is why the subquery wrap (not just an
  // in-place cast) is required.
  it('ORDER BY runs on the outer, non-set-op SELECT over a `cross_stream` subquery (not directly on the UNION)', () => {
    expect(crossStreamBlock).toMatch(/\)\s*cross_stream\s*\n\s*ORDER BY/);
  });

  it('ORDER BY uses TZ-deterministic COALESCE(event_date::date, (transitioned_at::timestamptz AT TIME ZONE \'UTC\')::date) on the outer query', () => {
    expect(crossStreamBlock).toMatch(
      /COALESCE\(\s*cross_stream\.event_date::date\s*,\s*\(\s*cross_stream\.transitioned_at::timestamptz\s+AT\s+TIME\s+ZONE\s+'UTC'\s*\)::date\s*\)\s*ASC/,
    );
  });

  it('ORDER BY has the "real-event_date rows sort before detected-only rows" tie-break (Gemini CRIT fold)', () => {
    expect(crossStreamBlock).toMatch(
      /CASE\s+WHEN\s+cross_stream\.event_date\s+IS\s+NOT\s+NULL\s+THEN\s+0\s+ELSE\s+1\s+END\s+ASC/,
    );
  });

  it('ORDER BY preserves transitioned_at ASC + id ASC for absolute determinism', () => {
    expect(crossStreamBlock).toMatch(/transitioned_at::timestamptz\s+ASC\s*,\s*\n?\s*cross_stream\.id\s+ASC/);
  });

  it('The plan-v1 TZ-dependent form COALESCE(event_date::timestamptz, transitioned_at) is NOT present (regression lock)', () => {
    // Plan-v1 used implicit DATE→TIMESTAMPTZ cast which depends on session TZ.
    // Plan-v2 cast direction is reversed (transitioned_at → DATE under UTC).
    expect(crossStreamBlock).not.toMatch(/COALESCE\(\s*event_date::timestamptz/);
  });
});
