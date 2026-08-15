// SPEC LINK: docs/specs/01-pipeline/118_deep_scrapes_execution_envelope.md §1, §7.1
// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md
//
// WF3 F1 (2026-08-15) — the refresh_snapshot pathology fix (measured 2026-08-14:
// the stats query index-fetched 187,187 rows = 73% of permits via idx_permits_status;
// 3min -> 64min once the week's mass-UPDATE traffic destroyed the heap's physical
// correlation with status order — NOT bloat, NOT locks, NOT a plan flip).
//
// This is the SHAPE lock (source-level): the measured three-part winner is exported
// from scripts/refresh-snapshot.js and this file pins the ADOPTED shape —
//   ① buildPermitsScalarQuery — 10 scalar permits.status-scoped aggregates, ONE
//      no-WHERE FILTER pass (no top-level WHERE at all — that absence is the fix).
//   ② buildTagBreakdownQuery — the 2 GROUP BY scope_tags queries, ONE pass, using
//      the `(status = ANY($1)) IS TRUE` index-defeat idiom (not a bare `= ANY()`).
//   ③ buildTradeByTypeQuery — same JOIN shape as before (unchanged query text); the
//      fix is executing it under `enable_indexscan = off` on the caller's pinned
//      client, which this file pins by source-scanning the caller (refresh-snapshot.js)
//      for the SET/RESET bracketing around the query, not inside the query builder.
//
// Value equivalence (the numbers into data_quality_snapshots are unchanged) is
// proven separately by src/tests/db/refresh-snapshot-consolidation.db.test.ts —
// a source-level test cannot prove that; it can only prove the SHAPE was adopted.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = readFileSync(join(process.cwd(), 'scripts/refresh-snapshot.js'), 'utf8');
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real module's exports, not re-implementing them
const mod = require(join(process.cwd(), 'scripts/refresh-snapshot.js'));

describe('refresh-snapshot.js — WF3 F1 query-consolidation shape lock (Spec 118 §1/§7.1)', () => {
  it('exports the three query builders + the tag-split helper', () => {
    expect(typeof mod.buildPermitsScalarQuery).toBe('function');
    expect(typeof mod.buildTagBreakdownQuery).toBe('function');
    expect(typeof mod.buildTradeByTypeQuery).toBe('function');
    expect(typeof mod.splitTagBreakdown).toBe('function');
  });

  it('requiring the module has NO side effects (guarded by require.main === module)', () => {
    // If pipeline.run() fired at require-time, this file would already have thrown
    // (no DB, no PG_* env in a plain vitest process) before reaching this line.
    expect(SRC).toMatch(/if \(require\.main === module\)/);
  });

  it('① the permits scalar query has NO top-level WHERE clause on `permits`', () => {
    const { sql } = mod.buildPermitsScalarQuery();
    // The whole point of the fix: nothing outside a FILTER(...) may restrict which
    // rows are read, or the planner regains the incentive to satisfy the query via
    // idx_permits_status instead of scanning the table.
    expect(sql).toMatch(/FROM permits\s*$/);
    expect(sql).not.toMatch(/FROM permits[\s\S]*WHERE(?!\s*\()/); // no bare WHERE after FROM permits
  });

  it('① every status-scoped metric FILTERs on status = ANY($1), never a literal IN-list', () => {
    const { sql, params } = mod.buildPermitsScalarQuery();
    expect(sql).toMatch(/status = ANY\(\$1\)/);
    expect(sql).not.toMatch(/status IN \('Permit Issued'/);
    expect(params).toEqual([mod.ACTIVE_PERMIT_STATUSES]);
  });

  it('① consolidates all 10 scalar permits aggregates into ONE query (metric ceiling stated)', () => {
    const { sql } = mod.buildPermitsScalarQuery();
    const expectedMetrics = [
      'total', 'active', 'permits_with_builder', 'neighbourhood_count', 'geocoded_count',
      'scope_count', 'scope_tags_count', 'detailed_tags_count',
      'updated_24h', 'updated_7d', 'updated_30d',
      'null_description', 'null_builder_name', 'null_est_const_cost',
      'null_street_num', 'null_street_name', 'null_geo_id',
      'cost_oor', 'future_issued', 'missing_status',
    ];
    for (const metric of expectedMetrics) {
      expect(sql, `missing metric ${metric}`).toMatch(new RegExp(`AS ${metric}\\b`));
    }
  });

  it('② the tag-breakdown query is a single pass using the `(status = ANY($1)) IS TRUE` index-defeat idiom', () => {
    const { sql, params } = mod.buildTagBreakdownQuery();
    expect(sql).toMatch(/\(status = ANY\(\$1\)\) IS TRUE/);
    expect(sql).toMatch(/GROUP BY tag/);
    // ONE query, not two: only one FROM permits in the whole builder.
    expect(sql.match(/FROM permits/g)?.length).toBe(1);
    expect(params).toEqual([mod.ACTIVE_PERMIT_STATUSES]);
  });

  it('③ tradeByTypeRes is executed under session-scoped enable_indexscan=off + RESET on the pinned client', () => {
    // Source-level: the SET/RESET bracket the tradeByTypeQuery call site.
    const setIdx = SRC.indexOf("snapClient.query('SET enable_indexscan = off')");
    const callIdx = SRC.indexOf('snapClient.query(tradeByTypeQuery.sql, tradeByTypeQuery.params)');
    const resetIdx = SRC.indexOf("snapClient.query('RESET enable_indexscan')");
    expect(setIdx, 'SET enable_indexscan = off must exist').toBeGreaterThan(-1);
    expect(callIdx, 'tradeByTypeQuery call must exist').toBeGreaterThan(-1);
    expect(resetIdx, 'RESET enable_indexscan must exist').toBeGreaterThan(-1);
    expect(setIdx).toBeLessThan(callIdx);
    expect(callIdx).toBeLessThan(resetIdx);
  });

  it('the in-code comment states the I/O-pattern rationale and cites Spec 118 §1 (ceiling, not a guess)', () => {
    expect(SRC).toMatch(/Spec 118 §1/);
    expect(SRC).toMatch(/DECISION RESTS ON THE OBSERVED I\/O PATTERN/);
    expect(SRC).toMatch(/stale correlation/i);
  });

  it('old per-metric query variables are gone — the consolidation actually replaced them, not just added to them', () => {
    // These variable NAMES existed pre-fix as separate round trips; their absence
    // (as declarations) proves the 10+2 queries were actually removed, not merely
    // shadowed by new ones running alongside the old.
    for (const gone of ['nhoodRes =', 'scopeRes =', 'scopeTagsRes =', 'detailedTagsRes =', 'freshRes =', 'nullsRes =', 'violationsRes =', 'topTagsRes =', 'scopeBreakdownRes =', 'permitsBuilderRes =', 'geoRes =']) {
      expect(SRC, `${gone} should no longer exist as a separate query`).not.toContain(gone);
    }
  });
});
