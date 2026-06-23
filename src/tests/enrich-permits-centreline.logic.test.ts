// SPEC LINK: docs/specs/01-pipeline/62_source_centreline.md §8e, §11.1, §L24
//
// Source-contract / logic tests for the §8e centreline additions to enrich-permits.js.
// Locks the deliberate divergences flagged for review:
//   DEC-A  corner/through via bool_or, NO mutual-exclusivity carve-out (a multi-parcel lead can be both)
//   DEC-B  primary_frontage_street_name = smallest-parcel_id non-NULL via array_agg ORDER BY parcel_id
//          FILTER — NOT off dom (max-area parcel), NOT a standalone CTE chain
//   DEC-C  orphan-nullify resets the NOT-NULL booleans to false (NOT = NULL → would crash PG 23502)
//   DEC-D  preconditions: L24a column-existence + L24b recency + L24c coverage (stricter than the
//          ravine/heritage `>0` precedent) + DEC-D2 per-target link-table guard

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ep = require('../../scripts/enrich-permits.js');
const SRC = fs.readFileSync(path.resolve(__dirname, '../../scripts/enrich-permits.js'), 'utf8');

describe('enrich-permits §8e centreline — write-col plumbing', () => {
  it('CENTRELINE_COLS = the 4 centreline columns (incl. Phase-3 abuts_laneway), in allWriteCols for BOTH targets', () => {
    expect(ep.CENTRELINE_COLS).toEqual(['is_corner_lot', 'is_through_lot', 'primary_frontage_street_name', 'abuts_laneway']);
    for (const t of ['permits', 'coa']) {
      expect(ep.allWriteCols(t)).toEqual(expect.arrayContaining(ep.CENTRELINE_COLS));
    }
  });

  it('the main UPDATE guard (IS DISTINCT FROM) covers the centreline cols (idempotency)', () => {
    const sql = ep.buildUpdateSql({ target: 'permits' });
    for (const col of ep.CENTRELINE_COLS) {
      expect(sql).toMatch(new RegExp(`${col} IS DISTINCT FROM e\\.${col}`));
    }
  });
});

describe('enrich-permits §8e centreline — propagation SQL (§11.1, single-pass)', () => {
  const sql = ep.buildEnrichmentSql({ target: 'permits' });
  it('DEC-A: corner/through via bool_or → new_is_corner_lot / new_is_through_lot (no mutual-exclusivity)', () => {
    expect(sql).toMatch(/COALESCE\(bool_or\(is_corner_lot\), false\)\s+AS new_is_corner_lot/);
    expect(sql).toMatch(/COALESCE\(bool_or\(is_through_lot\), false\)\s+AS new_is_through_lot/);
    // A lead can be BOTH corner and through — there must be no CASE/guard making them mutually exclusive.
    expect(sql).not.toMatch(/new_is_corner_lot[\s\S]{0,80}NOT\s+new_is_through_lot/i);
  });
  it('DEC-B: frontage = smallest-parcel_id non-NULL via array_agg ORDER BY parcel_id FILTER ... [1]', () => {
    expect(sql).toMatch(/array_agg\(primary_frontage_street_name ORDER BY parcel_id\)\s*FILTER\s*\(WHERE primary_frontage_street_name IS NOT NULL\)\)\[1\]\s+AS new_primary_frontage/);
    // ORDER BY the cand alias parcel_id (par.id doesn't resolve at the ag altitude).
    expect(sql).not.toMatch(/array_agg\(primary_frontage_street_name ORDER BY par\.id\)/);
  });
  it('centreline outputs come from ag (aggregate), NOT dom (dominant/max-area parcel)', () => {
    expect(sql).toMatch(/ag\.new_is_corner_lot AS is_corner_lot/);
    expect(sql).toMatch(/ag\.new_is_through_lot AS is_through_lot/);
    expect(sql).toMatch(/ag\.new_primary_frontage AS primary_frontage_street_name/);
    expect(sql).not.toMatch(/dom\.is_corner_lot/);
    expect(sql).not.toMatch(/dom\.primary_frontage_street_name/);
  });
});

describe('enrich-permits §8e centreline — orphan-nullify respects NOT NULL (DEC-C)', () => {
  for (const target of ['permits', 'coa']) {
    const sql = ep.buildNullifyOrphansSql({ target });
    it(`[${target}] resets is_corner_lot/is_through_lot/abuts_laneway=false (NOT = NULL → PG 23502); frontage=NULL`, () => {
      expect(sql).not.toMatch(/is_(corner|through)_lot = NULL/);
      expect(sql).not.toMatch(/abuts_laneway = NULL/);
      expect(sql).toMatch(/is_corner_lot = false/);
      expect(sql).toMatch(/is_through_lot = false/);
      expect(sql).toMatch(/abuts_laneway = false/); // Phase 3 NN-bool
      expect(sql).toMatch(/primary_frontage_street_name = NULL/);
    });
  }
});

describe('enrich-permits §8e centreline — preconditions + exports (DEC-D)', () => {
  it('exports assertCentrelineColumns + assertCentrelineEnriched + assertLinkTable', () => {
    expect(typeof ep.assertCentrelineColumns).toBe('function');
    expect(typeof ep.assertCentrelineEnriched).toBe('function');
    expect(typeof ep.assertLinkTable).toBe('function');
  });
  it('L24a column-existence covers parcels (incl. lineage) + the target, citing mig 174/191 + 176/192', () => {
    expect(SRC).toMatch(/migration \$\{tbl === 'parcels' \? '174\/191' : '176\/192'\} not applied/);
    expect(SRC).toMatch(/centreline_dataset_version_when_enriched/);
  });
  it('L24b recency: enrich_centreline run must post-date the latest load-parcels', () => {
    expect(SRC).toMatch(/'sources:enrich_centreline','enrich_centreline'/);
    expect(SRC).toMatch(/'sources:parcels','parcels'/);
    expect(SRC).toMatch(/predates the latest load-parcels/);
  });
  it('L24c coverage: tunable threshold via logic_variables, default 0.90, over valid-geom parcels', () => {
    expect(SRC).toMatch(/centreline_propagation_coverage_min/);
    expect(ep).toHaveProperty('CENTRELINE_COLS'); // module loaded
    expect(SRC).toMatch(/centreline_dataset_version_when_enriched IS NOT NULL\)::float[\s\S]*?NULLIF\(COUNT\(\*\) FILTER \(WHERE geom IS NOT NULL\)/);
  });
  it('DEC-D2 link-table guard checks permit_parcels (permits) / lead_parcels (coa) join cols', () => {
    expect(SRC).toMatch(/target === 'permits' \? 'permit_parcels' : 'lead_parcels'/);
  });
  it('centreline count rows are INFO (additive; zoning F-H12 gate untouched)', () => {
    expect(SRC).toMatch(/\$\{prefix\}_corner_lot_count.*status: 'INFO'/);
    expect(SRC).toMatch(/\$\{prefix\}_through_lot_count.*status: 'INFO'/);
    expect(SRC).toMatch(/\$\{prefix\}_with_frontage_name_count.*status: 'INFO'/);
  });
});
