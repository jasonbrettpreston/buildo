// 🔗 SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md (v1.0) §2 (DEC-1/DEC-3), §3
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
    const kinds = new Set(['dominant', 'min', 'max', 'overlay_min', 'membership']);
    for (const [col, rule] of Object.entries(PRECEDENCE_RULES)) {
      expect(kinds.has(rule as string), `${col} → ${rule}`).toBe(true);
    }
  });

  it('classifies representative attributes correctly (DEC-1)', () => {
    expect(PRECEDENCE_RULES.zoning_class).toBe('dominant');       // identity ← dominant zone
    expect(PRECEDENCE_RULES.exception_number).toBe('dominant');
    expect(PRECEDENCE_RULES.bylaw_max_fsi).toBe('min');           // ceiling ← most-restrictive MIN
    expect(PRECEDENCE_RULES.bylaw_max_units).toBe('min');
    expect(PRECEDENCE_RULES.bylaw_min_frontage_m).toBe('max');    // floor ← MAX
    expect(PRECEDENCE_RULES.bylaw_min_area_sqm).toBe('max');
    expect(PRECEDENCE_RULES.bylaw_standard_setback_m).toBe('max');// setback is a floor requirement
    expect(PRECEDENCE_RULES.bylaw_max_height_m).toBe('overlay_min'); // overlay replaces base (D4)
    expect(PRECEDENCE_RULES.bylaw_max_coverage_pct).toBe('overlay_min');
    expect(PRECEDENCE_RULES.in_policy_area).toBe('membership');
    expect(PRECEDENCE_RULES.on_priority_retail).toBe('membership');
  });
});

describe('zoning-precedence — SQL fragment builder (DEC-3)', () => {
  it('emits MIN for ceilings, MAX for floors, bool_or for membership', () => {
    expect(sqlAggregate('bylaw_max_fsi', 'x')).toBe('MIN(x)');
    expect(sqlAggregate('bylaw_max_coverage_pct', 'x')).toBe('MIN(x)'); // overlay_min still aggregates MIN
    expect(sqlAggregate('bylaw_min_frontage_m', 'x')).toBe('MAX(x)');
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
