// 🔗 SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md (v1.0) §2 (DEC-1/DEC-3), §3
// 🔗 SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md §2 DEC-1 (amended by E1, Spec 69 R-ZV)
//
// Pure-logic lock for scripts/lib/zoning-precedence.js — the attr→rule config +
// SQL-fragment builder that scripts/enrich-parcels.js composes into one set-based
// UPDATE. No DB. Live spatial behaviour is covered by db/enrich-parcels.db.test.ts.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const precedence = require('../../scripts/lib/zoning-precedence');

const {
  PRECEDENCE_RULES,
  PROVENANCE_COLUMNS,
  AMBIGUOUS_DOMINANT_SHARE_MAX,
  DOMINANT_ORDER_BY,
  sqlAggregate,
} = precedence;

describe('zoning-precedence — config completeness (DEC-2)', () => {
  it('covers every mapped parcel zoning column (30 mapped + 6 provenance = 36)', () => {
    expect(Object.keys(PRECEDENCE_RULES)).toHaveLength(30);
    expect(PROVENANCE_COLUMNS).toHaveLength(6);
    // No overlap between the two sets.
    for (const c of PROVENANCE_COLUMNS) {
      expect(PRECEDENCE_RULES[c]).toBeUndefined();
    }
  });

  it('every rule is one of the known kinds', () => {
    const kinds = new Set(['dominant', 'overlay_min', 'membership']);
    for (const [col, rule] of Object.entries(PRECEDENCE_RULES)) {
      expect(kinds.has(rule as string), `${col} → ${rule}`).toBe(true);
    }
    expect(new Set(Object.values(PRECEDENCE_RULES))).toEqual(new Set(['dominant', 'overlay_min', 'membership']));
  });

  it('classifies representative attributes correctly (DEC-1)', () => {
    expect(PRECEDENCE_RULES.zoning_class).toBe('dominant');       // identity ← dominant zone
    expect(PRECEDENCE_RULES.exception_number).toBe('dominant');
    expect(PRECEDENCE_RULES.bylaw_max_fsi).toBe('dominant');      // WF3: FSI ← dominant zone (was 'min' — MIN skipped NULLs → sliver-borrowed FSI)
    // E1 (Spec 69 R-ZV, 2026-10-06): every base parameter from the dominant label — DEC-1 MIN/MAX retired
    for (const col of [
      'bylaw_max_units', 'bylaw_max_density',
      'bylaw_pct_commercial_max', 'bylaw_pct_residential_max', 'bylaw_pct_employment_max', 'bylaw_pct_office_max',
      'bylaw_min_frontage_m', 'bylaw_min_area_sqm', 'bylaw_standard_setback_m',
    ]) {
      expect(PRECEDENCE_RULES[col], col).toBe('dominant');
    }
    expect(PRECEDENCE_RULES.bylaw_max_height_m).toBe('overlay_min'); // overlay replaces base (D4)
    expect(PRECEDENCE_RULES.bylaw_max_coverage_pct).toBe('overlay_min');
    expect(PRECEDENCE_RULES.in_policy_area).toBe('membership');
    expect(PRECEDENCE_RULES.on_priority_retail).toBe('membership');
  });
});

describe('zoning-precedence — SQL fragment builder (DEC-3)', () => {
  it('emits the dominant form for every base parameter, MIN for overlay_min, bool_or for membership', () => {
    // WF3/E1: every base parameter is now 'dominant' → emits the area-ordered array_agg form, not MIN/MAX.
    for (const col of [
      'bylaw_max_units', 'bylaw_max_density',
      'bylaw_pct_commercial_max', 'bylaw_pct_residential_max', 'bylaw_pct_employment_max', 'bylaw_pct_office_max',
      'bylaw_min_frontage_m', 'bylaw_min_area_sqm', 'bylaw_standard_setback_m',
    ]) {
      expect(sqlAggregate(col, 'x'), col).toBe(`(array_agg(x ORDER BY ${DOMINANT_ORDER_BY}))[1]`);
    }
    expect(sqlAggregate('bylaw_max_coverage_pct', 'x')).toBe('MIN(x)'); // overlay_min still aggregates MIN
    expect(sqlAggregate('in_policy_area', 'x')).toBe('bool_or(x)');
  });

  it('dominant aggregation is deterministic — ordered by area then zn_zone then source_id', () => {
    const sql = sqlAggregate('zoning_class', 'z.zn_zone');
    expect(sql).toContain('ORDER BY');
    expect(sql).toContain(DOMINANT_ORDER_BY);
  });

  it('DOMINANT_ORDER_BY carries the secondary deterministic keys (resolves Gemini-E/D8)', () => {
    expect(DOMINANT_ORDER_BY).toMatch(/intersect_area DESC/);
    expect(DOMINANT_ORDER_BY).toMatch(/zn_zone ASC/);
    expect(DOMINANT_ORDER_BY).toMatch(/source_id ASC/);
  });

  it('throws on an unknown column (guards typos in the engine)', () => {
    expect(() => sqlAggregate('not_a_column', 'x')).toThrow();
  });

  // E1 (Spec 69 R-ZV, 2026-10-06) — anti-reintroduction at the RENDERED-SQL level: the composed
  // pass-1 SQL must never aggregate a base parameter with MIN/MAX again.
  it('E1 anti-reintroduction — the rendered pass-1 SQL aggregates no base parameter with MIN/MAX', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ep = require('../../scripts/lib/compute/enrich-parcels.js');
    const sql: string = ep.buildEnrichmentSql({ scopeWhere: 'TRUE', full: true, bboxDivisor: 1000 });
    for (const frag of [
      'MAX(frontage_min_m)',
      'MAX(area_min_sqm)',
      'MAX(standard_setback)',
      'MIN(units_max)',
      'MIN(density_max)',
      'MIN(pct_commercial_max)',
      'MIN(pct_residential_max)',
      'MIN(pct_employment_max)',
      'MIN(pct_office_max)',
      'MIN(coverage_max_pct) AS base_coverage_max_pct',
    ]) {
      expect(sql.includes(frag), frag).toBe(false);
    }
    expect(sql).toContain(`(array_agg(coverage_max_pct ORDER BY ${DOMINANT_ORDER_BY}))[1]`);
    expect(sql).toContain(`ORDER BY ${DOMINANT_ORDER_BY}) AS base_candidates`);
  });
});

describe('zoning-precedence — ambiguity threshold sourced from _contracts.json', () => {
  it('matches docs/specs/_contracts.json zoning.ambiguous_dominant_share_max', () => {
    const contracts = JSON.parse(
      readFileSync(resolve(__dirname, '../../docs/specs/_contracts.json'), 'utf8'),
    );
    expect(AMBIGUOUS_DOMINANT_SHARE_MAX).toBe(contracts.zoning.ambiguous_dominant_share_max);
    expect(AMBIGUOUS_DOMINANT_SHARE_MAX).toBe(0.6);
  });
});
