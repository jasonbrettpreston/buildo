// SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §4D (optimal-config + comp propagation)
//
// Logic locks for the Spec-49 propagation of the optimal-config + comp headline scalars onto
// permits/coa (4D): the single-source array (drift-pinned vs the enrich-parcels write-cols), its
// presence in allWriteCols for BOTH targets + the propagation SQL (par + dom maps), and the
// orphan-nullify treating opt_suite_fits_full as a NULLABLE bool (generic = NULL, NOT = false).

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { OPT_COMP_PROP_COLS, OPT_COMP_JSONB_COLS } = require('../../scripts/lib/optimal-config-cols');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const eperm = require('../../scripts/enrich-permits.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ep = require('../../scripts/enrich-parcels.js');

describe('OPT_COMP_PROP_COLS — single-source drift pin', () => {
  it('is the 13 flat scalars = (OPTCFG_WRITE_COLS ∪ COMP_WRITE_COLS) minus the 3 JSONB blobs', () => {
    const expected = [...ep.OPTCFG_WRITE_COLS, ...ep.COMP_WRITE_COLS].filter((c: string) => !OPT_COMP_JSONB_COLS.includes(c));
    expect(OPT_COMP_PROP_COLS.slice().sort()).toEqual(expected.slice().sort());
    expect(OPT_COMP_PROP_COLS).toHaveLength(13);
  });
  it('contains NONE of the 3 JSONB blobs (parcel-scoped by design)', () => {
    for (const j of ['optimal_config', 'comparable_builds', 'nearby_builds_summary']) {
      expect(OPT_COMP_PROP_COLS).not.toContain(j);
    }
  });
});

describe('4D propagation wiring (enrich-permits)', () => {
  for (const target of ['permits', 'coa']) {
    it(`allWriteCols(${target}) includes all 13 opt/comp cols`, () => {
      const cols = eperm.allWriteCols(target);
      for (const c of OPT_COMP_PROP_COLS) expect(cols).toContain(c);
    });
    it(`buildEnrichmentSql(${target}) reads par.<col> AND writes dom.<col> AS <col> for the opt/comp cols`, () => {
      const sql = eperm.buildEnrichmentSql({ target });
      for (const c of OPT_COMP_PROP_COLS) {
        expect(sql).toContain(`par.${c}`);                 // cand CTE read
        expect(sql).toContain(`dom.${c} AS ${c}`);         // final SELECT write
      }
    });
  }
});

describe('4D orphan-nullify — opt_suite_fits_full is NULLABLE (generic = NULL, not = false)', () => {
  it('resets every opt/comp col to NULL on an orphan lead', () => {
    const sql = eperm.buildNullifyOrphansSql({ target: 'permits' });
    for (const c of OPT_COMP_PROP_COLS) expect(sql).toContain(`${c} = NULL`);
  });
  it('does NOT reset opt_suite_fits_full to false (it is nullable, unlike the NOT-NULL max-build bools)', () => {
    const sql = eperm.buildNullifyOrphansSql({ target: 'permits' });
    expect(sql).not.toContain('opt_suite_fits_full = false');
    expect(sql).toContain('opt_suite_fits_full = NULL');
  });
});
