// SPEC LINK: docs/specs/01-pipeline/88_parcel_cost_model.md §2.10 (cost-scalar propagation to permits/coa)
//
// Logic locks for the §4D propagation of the parcel cost-model headline + FSI scalars onto
// permits/coa: the single-source array (drift-pinned vs the engine's PARCEL_COST_LINES scalar set
// + the compute-script write list), the parcel_cost_menu JSONB staying parcel-scoped (NOT propagated),
// presence in allWriteCols for BOTH targets + the propagation SQL (par + dom maps), and the
// orphan-nullify resetting every cost scalar to NULL (all 15 are nullable numerics — no NOT-NULL bools).

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { COST_PROP_COLS, COST_SCALAR_COLS, FSI_SCALAR_COLS, COST_JSONB_COLS } = require('../../scripts/lib/parcel-cost-cols');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const eperm = require('../../scripts/enrich-permits.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pc = require('../../scripts/lib/parcel-cost.js');

describe('COST_PROP_COLS — single-source drift pin', () => {
  it('is the 12 headline cost scalars + 3 FSI scalars (15 flat)', () => {
    expect(COST_PROP_COLS).toEqual([...COST_SCALAR_COLS, ...FSI_SCALAR_COLS]);
    expect(COST_PROP_COLS).toHaveLength(15);
    expect(COST_SCALAR_COLS).toHaveLength(12);
    expect(FSI_SCALAR_COLS).toHaveLength(3);
  });

  it('the 12 cost scalars match the engine PARCEL_COST_LINES scalar set exactly (no drift)', () => {
    const engineScalars = pc.PARCEL_COST_LINES.map((l: { scalar: string | null }) => l.scalar).filter(Boolean);
    expect(engineScalars.slice().sort()).toEqual(COST_SCALAR_COLS.slice().sort());
  });

  it('does NOT propagate the parcel_cost_menu JSONB (parcel-scoped by design)', () => {
    expect(COST_JSONB_COLS).toEqual(['parcel_cost_menu']);
    expect(COST_PROP_COLS).not.toContain('parcel_cost_menu');
  });
});

describe('cost-scalar propagation wiring (enrich-permits)', () => {
  for (const target of ['permits', 'coa']) {
    it(`allWriteCols(${target}) includes all 15 cost/FSI cols`, () => {
      const cols = eperm.allWriteCols(target);
      for (const c of COST_PROP_COLS) expect(cols).toContain(c);
    });
    it(`buildEnrichmentSql(${target}) reads par.<col> AND writes dom.<col> AS <col> for the cost cols`, () => {
      const sql = eperm.buildEnrichmentSql({ target });
      for (const c of COST_PROP_COLS) {
        expect(sql).toContain(`par.${c}`); // cand CTE read
        expect(sql).toContain(`dom.${c} AS ${c}`); // final SELECT write
      }
    });
  }
});

describe('cost-scalar orphan-nullify — all 15 are nullable numerics (generic = NULL)', () => {
  it('resets every cost/FSI col to NULL on an orphan lead', () => {
    const sql = eperm.buildNullifyOrphansSql({ target: 'permits' });
    for (const c of COST_PROP_COLS) expect(sql).toContain(`${c} = NULL`);
  });
  it('never resets a cost col to false (none are NOT-NULL booleans)', () => {
    const sql = eperm.buildNullifyOrphansSql({ target: 'permits' });
    for (const c of COST_PROP_COLS) expect(sql).not.toContain(`${c} = false`);
  });
});
