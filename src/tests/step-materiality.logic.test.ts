// 🔗 SPEC LINK: docs/specs/01-pipeline/55_source_parcels.md
// 🔗 SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.4
//
// L9 (geom-drift WF3 Commit 2): the `columns[].materiality` codegen axis — render forms + validate.js refusals.
//
// The opt-in axis on ONE column of a write target:
//   "materiality": { "sql_function": "parcels_geom_materially_changed",
//                    "tolerance_from_config": "parcels_geom_change_tolerance_deg",
//                    "carries": ["geometry"] }
// Let M = `public.parcels_geom_materially_changed(parcels.geom, EXCLUDED.geom)` — the form is
// `public.<sql_function>(<table>.<col>, EXCLUDED.<col>)`. When `M` is declared, the column's SET
// arm, its guard term, each `carries[]` column's SET arm and every `set_null_on_change_of` CASE arm
// on the target all switch from `IS DISTINCT FROM` to `CASE WHEN M THEN <write> ELSE <stored> END`.
// RED today (the axis does not exist); GREEN once Commit 2 lands. Renders the plan the engine
// actually builds (`buildWritePlan`) and polices it with the real validator (`validateDescriptor`).

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const write = require(path.join(process.cwd(), 'scripts/lib/step/write.js'));
const validate = require(path.join(process.cwd(), 'scripts/lib/step/validate.js'));
const LOAD_PARCELS = require(path.join(process.cwd(), 'scripts/load-parcels.descriptor.json'));
/* eslint-enable @typescript-eslint/no-require-imports */

const AXIS = {
  sql_function: 'parcels_geom_materially_changed',
  tolerance_from_config: 'parcels_geom_change_tolerance_deg',
  carries: ['geometry'],
};
/** M — the predicate the codegen must render for a materiality column of the parcels target. */
const M = 'public.parcels_geom_materially_changed(parcels.geom, EXCLUDED.geom)';

/** The declared write target + the write-spec inputs the codegen reads (`writes[0]`, its columns). */
const target = (d: any) => d.outputs.writes[0];
const col = (d: any, name: string) => target(d).columns.find((c: any) => c.name === name);
const guards = (d: any) => target(d).write_discipline.guard_columns;
const upsert = (d: any) => write.buildWritePlan(target(d), d).upsertSqlFor(1);
/** The conflict-update WHERE clause: between `  WHERE ` and the `RETURNING` tail. */
const where = (sql: string) => sql.slice(sql.indexOf('  WHERE '), sql.indexOf('RETURNING'));

/**
 * The target descriptor shape: the parcels clone with the axis on `geom` and `geometry` removed
 * from `guard_columns` (a materiality column is watched by the predicate, not by a plain term).
 * `mutate` then perturbs it for a refusal case — so the test passes whether or not the real
 * descriptor has been edited yet.
 */
function withMateriality(mutate?: (d: any) => void): any {
  const d: any = structuredClone(LOAD_PARCELS);
  col(d, 'geom').materiality = structuredClone(AXIS);
  target(d).write_discipline.guard_columns = guards(d).filter((g: string) => g !== 'geometry');
  if (mutate) mutate(d);
  return d;
}

/** The opt-in byte-identity twin: NO axis anywhere, `geometry` present as a plain guard column. */
function withoutAxis(): any {
  const d: any = structuredClone(LOAD_PARCELS);
  delete col(d, 'geom').materiality;
  if (!guards(d).includes('geometry')) guards(d).push('geometry');
  return d;
}

/** Validate, catching — returns the thrown error (or undefined when the validator accepts). */
function caught(d: any): any {
  try {
    validate.validateDescriptor(d);
  } catch (e) {
    return e;
  }
  return undefined;
}

// rule-map: R-BX — loader upsert replaces geometry only on material change (verify-12 N1, operator y 2026-10-20 consolidation 1-4)
describe('render (parcels shape)', () => {
  const sql = upsert(withMateriality());

  it('renders the materiality SET arm for the column itself', () => {
    expect(sql).toContain(`geom = CASE WHEN ${M} THEN EXCLUDED.geom ELSE parcels.geom END`);
  });

  it('renders a CASE arm for each carried column (geometry)', () => {
    expect(sql).toContain(
      `geometry = CASE WHEN ${M} THEN EXCLUDED.geometry ELSE parcels.geometry END`,
    );
  });

  it('gates each set_null_on_change_of stamp arm on M', () => {
    for (const stamp of [
      'ravine_dataset_version_when_enriched',
      'heritage_dataset_version_when_enriched',
      'centreline_dataset_version_when_enriched',
    ]) {
      expect(sql).toContain(`${stamp} = CASE WHEN ${M} THEN NULL ELSE parcels.${stamp} END`);
    }
  });

  it('opens the WHERE on M, drops the plain geom/geometry terms, and keeps 9 IS DISTINCT FROM', () => {
    const w = where(sql);
    expect(w).toContain(M);
    expect(w.indexOf(M)).toBeLessThan(w.indexOf('IS DISTINCT FROM'));
    expect(w).not.toMatch(/parcels\.geometry/);
    expect(w).not.toMatch(/parcels\.geom IS DISTINCT FROM/);
    expect(w.split('IS DISTINCT FROM').length - 1).toBe(9);
  });

  it('removes the plain geom term from the whole statement', () => {
    expect(sql).not.toContain('parcels.geom IS DISTINCT FROM EXCLUDED.geom');
  });

  it('is opt-in: an axis-free target renders today’s text byte-for-byte', () => {
    const plain = upsert(withoutAxis());
    expect(plain).toContain('parcels.geom IS DISTINCT FROM EXCLUDED.geom');
    expect(plain).toContain('geom = EXCLUDED.geom');
    expect(plain).not.toContain('parcels_geom_materially_changed');
  });
});

describe('render (guard-column branch, synthetic plan)', () => {
  it('renders M once in the WHERE when geom is a guard column watched by nothing', () => {
    const d = withMateriality((x: any) => {
      col(x, 'geom').materiality.carries = [];
      x.outputs.invalidates = [];
      guards(x).push('geom');
      if (!guards(x).includes('geometry')) guards(x).push('geometry');
    });
    const w = where(upsert(d));
    expect(w.split(M).length - 1).toBe(1);
    expect(w).not.toMatch(/parcels\.geom IS DISTINCT FROM/);
  });
});

describe('validate.js refusals', () => {
  it('accepts the good twin (the axis on geom, geom watched by all three stamps)', () => {
    expect(() => validate.validateDescriptor(withMateriality())).not.toThrow();
  });

  it('refuses the axis on a non-wkb_geometry column', () => {
    const d = withMateriality((x: any) => {
      delete col(x, 'geom').materiality;
      col(x, 'lot_size_sqm').materiality = structuredClone(AXIS);
    });
    const err = caught(d);
    expect(err).toBeDefined();
    expect(err.message).toMatch(/materiality[\s\S]*wkb_geometry/);
    expect(Array.isArray(err.semanticFindings)).toBe(true);
    expect(err.semanticFindings.length).toBeGreaterThanOrEqual(1);
  });

  it('refuses a materiality column that also declares on_empty', () => {
    const d = withMateriality((x: any) => { col(x, 'geom').on_empty = 'preserve_null'; });
    expect(() => validate.validateDescriptor(d)).toThrow(/materiality[\s\S]*on_empty/);
  });

  it('refuses a materiality column neither guarded nor watched', () => {
    const d = withMateriality((x: any) => {
      x.outputs.invalidates = [];
    });
    const err = caught(d);
    expect(err).toBeDefined();
    expect(err.message).toMatch(/materiality[\s\S]*(guard_columns|set_null_on_change_of)/);
    expect(Array.isArray(err.semanticFindings)).toBe(true);
    expect(err.semanticFindings.length).toBeGreaterThanOrEqual(1);
  });

  it('refuses a carries entry that is undeclared', () => {
    const d = withMateriality((x: any) => { col(x, 'geom').materiality.carries = ['no_such_col']; });
    const err = caught(d);
    expect(err).toBeDefined();
    expect(err.message).toMatch(/carries/);
    expect(Array.isArray(err.semanticFindings)).toBe(true);
    expect(err.semanticFindings.length).toBeGreaterThanOrEqual(1);
  });

  it('refuses the materiality column carrying itself', () => {
    const d = withMateriality((x: any) => { col(x, 'geom').materiality.carries = ['geom']; });
    expect(() => validate.validateDescriptor(d)).toThrow(/carries/);
  });

  it('refuses a carried column declaring on_empty', () => {
    const d = withMateriality((x: any) => { col(x, 'geometry').on_empty = 'preserve_null'; });
    const err = caught(d);
    expect(err).toBeDefined();
    expect(err.message).toMatch(/carries[\s\S]*on_empty/);
    expect(Array.isArray(err.semanticFindings)).toBe(true);
    expect(err.semanticFindings.length).toBeGreaterThanOrEqual(1);
  });

  it('refuses a carried column that is also a guard column', () => {
    const d = withMateriality((x: any) => { guards(x).push('geometry'); });
    const err = caught(d);
    expect(err).toBeDefined();
    expect(err.message).toMatch(/carries[\s\S]*guard_columns/);
    expect(Array.isArray(err.semanticFindings)).toBe(true);
    expect(err.semanticFindings.length).toBeGreaterThanOrEqual(1);
  });

  it('refuses a carried column that is also watched by set_null_on_change_of (DeepSeek lens, executed 2026-10-08)', () => {
    const d = withMateriality((x: any) => { x.outputs.invalidates[0].set_null_on_change_of = 'geometry'; });
    const err = caught(d);
    expect(err).toBeDefined();
    expect(err.message).toMatch(/carries "geometry"[\s\S]*watched by a set_null_on_change_of/);
    expect(err.semanticFindings.length).toBeGreaterThanOrEqual(1);
  });

  it('refuses more than one materiality column on a target', () => {
    const d = withMateriality((x: any) => {
      const geom2: any = structuredClone(col(x, 'geom'));
      geom2.name = 'geom2';
      target(x).columns.push(geom2);
    });
    const err = caught(d);
    expect(err).toBeDefined();
    expect(err.message).toMatch(/more than one materiality/);
    expect(Array.isArray(err.semanticFindings)).toBe(true);
    expect(err.semanticFindings.length).toBeGreaterThanOrEqual(1);
  });
});
