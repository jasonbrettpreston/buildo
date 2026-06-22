// SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md §4 (Max-build envelope), MB-7
//
// Source-contract / logic tests for the §8e max-build propagation added to enrich-permits.js.
// Locks the deliberate decisions:
//   MB-7a  MAXBUILD_COLS wired through all 4 surfaces (allWriteCols, cand/SELECT, nullify, update)
//   MB-7b  envelope OUTPUTS come from dom (dominant parcel), NOT ag (assembly has no coherent envelope)
//   MB-7c  max_build_confidence degrades to 'low' when zoning_parcel_count > 1
//   MB-7d  orphan-nullify resets the 2 NOT-NULL bools to false (not = NULL → PG 23502); rest → NULL
//   MB-7e  assertMaxBuildColumns guard cites migration 185/186

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ep = require('../../scripts/enrich-permits.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mb = require('../../scripts/lib/max-build.js');
const SRC = fs.readFileSync(path.resolve(__dirname, '../../scripts/enrich-permits.js'), 'utf8');

describe('enrich-permits §8e max-build — write-col plumbing (MB-7a)', () => {
  it('MAXBUILD_COLS = LOT_MAXBUILD_COLS, present in allWriteCols for BOTH targets', () => {
    expect(ep.MAXBUILD_COLS).toEqual(mb.LOT_MAXBUILD_COLS);
    for (const t of ['permits', 'coa']) {
      expect(ep.allWriteCols(t)).toEqual(expect.arrayContaining(ep.MAXBUILD_COLS));
    }
  });

  it('the main UPDATE guard covers every max-build col (idempotency)', () => {
    const sql = ep.buildUpdateSql({ target: 'permits' });
    for (const col of ep.MAXBUILD_COLS) {
      expect(sql).toMatch(new RegExp(`${col} IS DISTINCT FROM e\\.${col}`));
    }
  });
});

describe('enrich-permits §8e max-build — propagation SQL (MB-7b/c)', () => {
  const sql = ep.buildEnrichmentSql({ target: 'permits' });

  it('cand reads the lot dims + envelope outputs off the parcel', () => {
    expect(sql).toMatch(/par\.frontage_m/);
    expect(sql).toMatch(/par\.depth_m/);
    expect(sql).toMatch(/par\.max_buildable_gfa_sqm/);
  });

  it('MB-7b: envelope OUTPUTS come from dom (dominant parcel), not ag', () => {
    expect(sql).toMatch(/dom\.max_buildable_footprint_sqm AS max_buildable_footprint_sqm/);
    expect(sql).toMatch(/dom\.lot_size_sqm AS lot_size_sqm/);
  });

  it('MB-7c: max_build_confidence degrades to low on a multi-parcel assembly', () => {
    expect(sql).toMatch(/CASE WHEN ag\.zoning_parcel_count > 1 THEN 'low' ELSE dom\.max_build_confidence END AS max_build_confidence/);
  });
});

describe('enrich-permits §8e max-build — orphan-nullify respects NOT NULL (MB-7d)', () => {
  for (const target of ['permits', 'coa']) {
    const sql = ep.buildNullifyOrphansSql({ target });
    it(`[${target}] resets the 2 NOT-NULL bools to false; lot inputs + numeric outputs → NULL`, () => {
      expect(sql).not.toMatch(/garden_suite_fits = NULL/);
      expect(sql).not.toMatch(/envelope_constrained = NULL/);
      expect(sql).toMatch(/garden_suite_fits = false/);
      expect(sql).toMatch(/envelope_constrained = false/);
      expect(sql).toMatch(/lot_size_confidence = NULL/);
      expect(sql).toMatch(/max_buildable_gfa_sqm = NULL/);
    });
  }
});

describe('enrich-permits §8e max-build — preconditions + observability (MB-7e/MB-8)', () => {
  it('exports + cites migration 185/186 in the column guard', () => {
    expect(typeof ep.assertMaxBuildColumns).toBe('function');
    expect(SRC).toMatch(/migration \$\{tbl === 'parcels' \? '185' : '186'\} not applied/);
  });

  it('max-build propagation counts are INFO (zoning F-H12 gate untouched)', () => {
    expect(SRC).toMatch(/\$\{prefix\}_max_buildable_footprint_count.*status: 'INFO'/);
    expect(SRC).toMatch(/\$\{prefix\}_max_build_confidence_high_count.*status: 'INFO'/);
    expect(SRC).toMatch(/\$\{prefix\}_envelope_constrained_count.*status: 'INFO'/);
  });
});
