// SPEC LINK: docs/specs/01-pipeline/61_source_heritage_properties.md §8e, §11.2, §11.3
//
// Source-contract / logic tests for the §8e heritage additions to enrich-permits.js.
// Locks: HERITAGE_COLS in allWriteCols (→ UPDATE guard + emitMeta); the L12 single-pass
// aggregate SQL (bool_or per type + MIN(date) FILTER + outer-guarded CASE precedence); the
// orphan-nullify NOT-NULL reset (false, type/date NULL); the L5 conditional WARN; the
// assertHeritageEnriched + assertHeritageColumns preconditions.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ep = require('../../scripts/enrich-permits.js');
const SRC = fs.readFileSync(path.resolve(__dirname, '../../scripts/enrich-permits.js'), 'utf8');

describe('enrich-permits §8e heritage — write-col plumbing', () => {
  it('HERITAGE_COLS = the 3 heritage columns, in allWriteCols for BOTH targets', () => {
    expect(ep.HERITAGE_COLS).toEqual(['is_heritage_designated', 'heritage_designation_type', 'heritage_designation_date']);
    for (const t of ['permits', 'coa']) {
      expect(ep.allWriteCols(t)).toEqual(expect.arrayContaining(ep.HERITAGE_COLS));
    }
  });

  it('the main UPDATE guard (IS DISTINCT FROM) covers the heritage cols (idempotency)', () => {
    const sql = ep.buildUpdateSql({ target: 'permits' });
    for (const col of ep.HERITAGE_COLS) {
      expect(sql).toMatch(new RegExp(`${col} IS DISTINCT FROM e\\.${col}`));
    }
  });
});

describe('enrich-permits §8e heritage — L12 propagation SQL (§11.2, single-pass)', () => {
  const sql = ep.buildEnrichmentSql({ target: 'permits' });
  it('aggregates bool_or(designated) + per-type bool_or + MIN(date) FILTER', () => {
    expect(sql).toMatch(/COALESCE\(bool_or\(is_heritage_designated\), false\)\s+AS new_heritage/);
    expect(sql).toMatch(/bool_or\(heritage_designation_type = 'part_iv_individual'\)\s+AS has_part_iv/);
    expect(sql).toMatch(/bool_or\(heritage_designation_type = 'part_v_hcd'\)\s+AS has_part_v_hcd/);
    expect(sql).toMatch(/MIN\(heritage_designation_date\) FILTER \(WHERE heritage_designation_type = 'part_iv_individual'\)\s+AS part_iv_date/);
    expect(sql).toMatch(/MIN\(heritage_designation_date\) FILTER \(WHERE heritage_designation_type = 'part_v_hcd'\)\s+AS part_v_date/);
  });
  it('resolves type via Part-IV-wins precedence inside an outer new_heritage guard', () => {
    expect(sql).toMatch(/CASE WHEN ag\.new_heritage[\s\S]*?has_part_iv THEN 'part_iv_individual'[\s\S]*?has_part_v_hcd THEN 'part_v_hcd'[\s\S]*?AS heritage_designation_type/);
    expect(sql).toMatch(/CASE WHEN ag\.new_heritage[\s\S]*?has_part_iv THEN ag\.part_iv_date[\s\S]*?has_part_v_hcd THEN ag\.part_v_date[\s\S]*?AS heritage_designation_date/);
  });
  it('heritage outputs come from ag (the aggregate), not dom (the dominant parcel)', () => {
    expect(sql).toMatch(/ag\.new_heritage AS is_heritage_designated/);
    expect(sql).not.toMatch(/dom\.is_heritage_designated/);
  });
});

describe('enrich-permits §8e heritage — orphan-nullify respects NOT NULL', () => {
  for (const target of ['permits', 'coa']) {
    const sql = ep.buildNullifyOrphansSql({ target });
    it(`[${target}] resets is_heritage_designated=false (not NULL); type/date=NULL`, () => {
      expect(sql).not.toMatch(/is_heritage_designated = NULL/);
      expect(sql).toMatch(/is_heritage_designated = false/);
      expect(sql).toMatch(/heritage_designation_type = NULL/);
      expect(sql).toMatch(/heritage_designation_date = NULL/);
    });
  }
});

describe('enrich-permits §8e heritage — preconditions + L5 + exports', () => {
  it('exports assertHeritageEnriched + assertHeritageColumns', () => {
    expect(typeof ep.assertHeritageEnriched).toBe('function');
    expect(typeof ep.assertHeritageColumns).toBe('function');
  });
  it('assertHeritageEnriched gates on parcels.heritage_dataset_version_when_enriched', () => {
    expect(SRC).toMatch(/heritage_dataset_version_when_enriched IS NOT NULL/);
  });
  it('L24 column-existence check covers parcels (incl. lineage) + the target table', () => {
    expect(SRC).toMatch(/information_schema\.columns/);
    expect(SRC).toMatch(/heritage_dataset_version_when_enriched/);
    expect(SRC).toMatch(/migration \$\{tbl === 'parcels' \? '171' : '172'\} not applied/);
  });
  it('L5 permit_type_heritage_disagreement is permits-only + conditional WARN (no perpetual-WARN)', () => {
    expect(SRC).toMatch(/permit_type = 'Heritage' AND is_heritage_designated = false/);
    expect(SRC).toMatch(/permit_type_heritage_disagreement.*hdis > 0 \? 'WARN' : 'INFO'/);
  });
  it('heritage count rows are INFO (additive; zoning F-H12 gate untouched)', () => {
    expect(SRC).toMatch(/\$\{prefix\}_heritage_designated_count.*status: 'INFO'/);
    expect(SRC).toMatch(/\$\{prefix\}_part_iv_count.*status: 'INFO'/);
    expect(SRC).toMatch(/\$\{prefix\}_part_v_hcd_count.*status: 'INFO'/);
  });
});
