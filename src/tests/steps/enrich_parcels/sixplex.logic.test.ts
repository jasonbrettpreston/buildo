// SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md (sixplex overlay pass — PROPOSED)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.4 (set_based_join_update), §6.4 (invalidation)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 3 tunables in logic_variables, Rule 10)
// SPEC LINK: .cursor/wf1_mcbylaw_phase2_inputs_active_task.md (A4)

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../../..');

const desc = (): any =>
  JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/enrich-parcels.descriptor.json'), 'utf8'));

const ep = (): any =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(path.join(ROOT, 'scripts/lib/compute/enrich-parcels.js'));

// H6 port (Spec 124 R-BZ G4/G5): the pass builds its temp tables through the REAL ctx.tempTable seam
// (scripts/lib/step/temp-table.js) and routes its UPDATE through ctx.exec; the exec stub records the
// writes_ref so the declared target (outputs.writes[7]) is asserted, then runs the SQL on the client.
const execRefs: number[] = [];
const seamCtx = (client: any): any => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { makeTempTable } = require(path.join(ROOT, 'scripts/lib/step/temp-table.js'));
  return {
    full: true,
    tempTable: makeTempTable(client, '[test]'),
    exec: (ref: number, sql: string, params?: unknown[]) => {
      execRefs.push(ref);
      return client.query(sql, params || []);
    },
  };
};

const lv = (): any =>
  JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/logic_variables.json'), 'utf8'));

const bma = (): any =>
  JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/load-bylaw-map-areas.descriptor.json'), 'utf8'));

const COLS = ['in_sixplex_area', 'sixplex_area_type', 'sixplex_membership_basis'];
const BASES = [
  'gis_in',
  'gis_out_ward_out',
  'gis_hole_ward_in',
  'gis_edge_ward_in',
  'straddle',
  'no_geom',
];

/** Migration-254 consistency rule for the sixplex triple. */
function consistent(out: any): boolean {
  const { basis, in_sixplex_area: inArea, sixplex_area_type: type } = out;
  if (inArea === true) return basis === 'gis_in' && (type === 3 || type === 4);
  if (inArea === false) return basis === 'gis_out_ward_out' && type === null;
  if (inArea === null) return basis !== 'gis_in' && type === null;
  return false;
}

function findPhase(phases: any[], name: string): any {
  return (phases || []).find((p: any) => p.name === name);
}

describe('enrich_parcels — sixplex pass (600.60 membership)', () => {
  it('ESX-1 phase: sixplex (order 5, shared, full scope) precedes optimal_config (order 6, post_commit)', () => {
    const phases = desc().execution.phases as any[];
    const sixplex = findPhase(phases, 'sixplex');
    const optimal = findPhase(phases, 'optimal_config');

    expect(sixplex).toBeDefined();
    expect(sixplex.order).toBe(5);
    expect(sixplex.txn).toBe('shared');
    expect(sixplex.scope).toBe('full');
    expect(sixplex.writes_ref).toBeTruthy();

    // writes_ref must point at a write owned by the sixplex pass (ESX-2's).
    const writes = desc().outputs.writes;
    expect(writes).toBeTruthy();
    expect(writes[sixplex.writes_ref]).toBeDefined();

    expect(optimal).toBeDefined();
    expect(optimal.order).toBe(6);
    expect(optimal.txn).toBe('post_commit');

    const orders = phases.map((p: any) => p.order);
    expect(new Set(orders).size).toBe(orders.length); // orders unique

    const postOrders = phases.filter((p: any) => p.txn === 'post_commit').map((p: any) => p.order);
    const sharedOrders = phases.filter((p: any) => p.txn === 'shared').map((p: any) => p.order);
    const maxShared = Math.max(...sharedOrders);
    for (const o of postOrders) expect(maxShared).toBeLessThan(o);
  });

  it('ESX-2 write: parcels / id, exact columns, set_based_join_update discipline, distinct-from guard, zero-write rerun', () => {
    const d = desc();
    const sixplex = findPhase(d.execution.phases, 'sixplex');
    const w = d.outputs.writes[sixplex.writes_ref];

    expect(w.table).toBe('parcels');
    expect(w.key).toBe('id');

    const names = (w.columns || []).map((c: any) => (typeof c === 'string' ? c : c.name));
    expect([...names].sort()).toEqual([...COLS].sort());
    expect(names.length).toBe(COLS.length);

    expect(w.write_discipline.class).toBe('set_based_join_update');
    expect(w.write_discipline.guard).toBe('is_distinct_from');
    expect(w.write_discipline.idempotent_rerun).toBe('zero_writes');
  });

  // An invalidates row is declared by the column's WRITER only (#44 arm; Spec 122a §A27 item 4, H6 2026-10-16):
  // enrich_parcels writes the sixplex columns and declares them full_rescan; load_bylaw_map_areas writes only
  // bylaw_map_areas and declares none (its producer edge is enrich_parcels' staleness.pins watermark).
  it('ESX-3 invalidators: each column is full_rescan in the writer (enrich_parcels) and absent from load_bylaw_map_areas', () => {
    const d = desc();
    const b = bma();
    for (const column of COLS) {
      expect(d.outputs.invalidates).toEqual(
        expect.arrayContaining([expect.objectContaining({ table: 'parcels', column, by: 'full_rescan' })]),
      );
      expect(b.outputs.invalidates.filter((r: { table: string; column: string }) => r.table === 'parcels' && r.column === column)).toEqual([]);
    }
  });

  it('ESX-4 reads: depends on load_bylaw_map_areas step and the bylaw_map_areas table', () => {
    const reads = desc().inputs.reads;
    expect(reads.steps).toEqual(expect.arrayContaining([{ step: 'load_bylaw_map_areas' }]));
    expect(
      reads.tables.some((t: any) => (typeof t === 'string' ? t : t.table) === 'bylaw_map_areas'),
    ).toBe(true);
  });

  it('ESX-5 passes: registry order, shared sixplex pass wired to runSixplexPass', () => {
    const impl = ep();
    const names = impl.passes.map((p: any) => p.name);
    expect(names).toEqual([
      'zoning',
      'max_build',
      'existing_structure',
      'comparable_builds',
      'sixplex',
      'optimal_config',
    ]);
    const sixplex = impl.passes.find((p: any) => p.name === 'sixplex');
    expect(sixplex.txn).toBe('shared');
    expect(sixplex.run).toBe(impl.runSixplexPass);
  });

  it('ESX-6 truth table: classifySixplexBasis boundaries and migration-254 consistency', () => {
    const { classifySixplexBasis } = ep();
    const cases: Array<{ input: any; expected: any }> = [
      { input: { hasGeom: false }, expected: { basis: 'no_geom', in_sixplex_area: null, sixplex_area_type: null } },
      { input: { hasGeom: true, gisAreaType: 4, wardIn: true, hullIn: true }, expected: { basis: 'gis_in', in_sixplex_area: true, sixplex_area_type: 4 } },
      { input: { hasGeom: true, gisAreaType: 3, wardIn: false, hullIn: false }, expected: { basis: 'gis_in', in_sixplex_area: true, sixplex_area_type: 3 } },
      { input: { hasGeom: true, gisAreaType: null, wardIn: true, hullIn: true }, expected: { basis: 'gis_hole_ward_in', in_sixplex_area: null, sixplex_area_type: null } },
      { input: { hasGeom: true, gisAreaType: null, wardIn: true, hullIn: false }, expected: { basis: 'gis_edge_ward_in', in_sixplex_area: null, sixplex_area_type: null } },
      { input: { hasGeom: true, gisAreaType: null, wardIn: false, hullIn: false }, expected: { basis: 'gis_out_ward_out', in_sixplex_area: false, sixplex_area_type: null } },
      { input: { hasGeom: true, gisAreaType: null, wardIn: false, hullIn: true }, expected: { basis: 'gis_out_ward_out', in_sixplex_area: false, sixplex_area_type: null } },
    ];

    for (const { input, expected } of cases) {
      const out = classifySixplexBasis(input);
      expect(out.basis).toBe(expected.basis);
      expect(out.in_sixplex_area).toBe(expected.in_sixplex_area);
      expect(out.sixplex_area_type).toBe(expected.sixplex_area_type);
      expect(BASES).toContain(out.basis);
      expect(consistent(out)).toBe(true);
      expect(out.basis).not.toBe('straddle'); // reserved (Q-A3), never produced
    }
  });

  it('ESX-7 SQL: temp parts build over subdivided geometries, basis CASE order, guarded UPDATE', () => {
    const impl = ep();

    const buildSql = impl.buildSixplexSql();
    expect(typeof buildSql).toBe('string');
    // The DDL frame (CREATE TEMP TABLE … ON COMMIT DROP, the GiST index, ANALYZE) is the seam's,
    // asserted on the recorded statements in ESX-10 — compute holds only the SELECTs (R-BZ G4).
    expect(buildSql).not.toMatch(/CREATE|DROP|ANALYZE/);
    for (const needle of [
      'ST_Subdivide(',
      '$1',
      'ST_PointOnSurface(',
      'ST_ExteriorRing(',
      "'city_gis_layer80'",
      "'ckan_wards_2018'",
      "map_code = '600.60'",
    ]) {
      expect(buildSql).toContain(needle);
    }

    const order = ["'gis_in'", "'gis_hole_ward_in'", "'gis_edge_ward_in'", "'gis_out_ward_out'", "'no_geom'"];
    let cursor = -1;
    for (const lit of order) {
      const at = buildSql.indexOf(lit);
      expect(at).toBeGreaterThan(-1);
      expect(at).toBeGreaterThan(cursor);
      cursor = at;
    }
    expect(buildSql).not.toContain("'straddle'");

    const updateSql = impl.buildSixplexUpdateSql();
    expect(updateSql).toContain('UPDATE parcels p SET');
    for (const col of COLS) {
      expect(updateSql).toContain(col);
      expect(updateSql).toContain('IS DISTINCT FROM');
    }
    expect(updateSql).toContain('RETURNING p.id');
  });

  it('ESX-8 tunable: sixplex_subdivide_max_vertices declared 8..4096 with default 256', () => {
    const declared = desc().config.logic_variables;
    expect(declared).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'enrich_parcels_sixplex_subdivide_max_vertices', min: 8, max: 4096 }),
      ]),
    );

    const parsed = lv();
    // scripts/seeds/logic_variables.json is an OBJECT keyed by variable name; each value is
    // the variable's definition, whose `default` is the seeded value.
    const entry = parsed.enrich_parcels_sixplex_subdivide_max_vertices;
    expect(entry).toBeDefined();
    expect(entry.default).toBe(256);
  });

  it('ESX-9 checks: sixplex_map_missing (WARN, when post), sixplex_basis_counts and sixplex_enriched_count (INFO) are implemented', () => {
    const d = desc();
    const checks = d.checks as any[];
    const byId = (id: string) => (checks || []).find((c: any) => (c.id ?? c.name) === id);

    const missing = byId('sixplex_map_missing');
    expect(missing).toBeDefined();
    expect(missing.severity).toBe('WARN');
    expect(missing.when).toBe('post');

    const basisCounts = byId('sixplex_basis_counts');
    expect(basisCounts).toBeDefined();
    expect(basisCounts.severity).toBe('INFO');

    const enriched = byId('sixplex_enriched_count');
    expect(enriched).toBeDefined();
    expect(enriched.severity).toBe('INFO');

    const impl = ep();
    for (const id of ['sixplex_map_missing', 'sixplex_basis_counts', 'sixplex_enriched_count']) {
      expect(Object.keys(impl.checks)).toContain(id);
    }
  });

  it('ESX-10 runSixplexPass: skips without map areas, else counts basis and updates ids', async () => {
    interface Rec {
      sql: string;
      params: any;
    }
    const makeClient = (answers: (sql: string) => any) => {
      const recorded: Rec[] = [];
      const query = async (sql: string, params?: any) => {
        recorded.push({ sql, params });
        return answers(sql);
      };
      return { client: { query } as any, recorded };
    };

    const isCount = (sql: string) => /FROM bylaw_map_areas/i.test(sql) && /count\(/i.test(sql);

    // Skipped path: no map areas loaded.
    {
      const { client, recorded } = makeClient((sql) =>
        isCount(sql) ? { rows: [{ gis: 0, wards: 0 }] } : { rows: [], rowCount: 0 },
      );
      const result = await ep().runSixplexPass(
        client,
        seamCtx(client),
        { enrich_parcels_sixplex_subdivide_max_vertices: 256 },
      );
      expect(result.skipped).toBe('no_map_areas');
      expect(result.updated).toBe(0);
      for (const r of recorded) expect(r.sql).not.toContain('UPDATE parcels');
    }

    // Happy path: map areas present, basis counts, two parcels updated.
    {
      const updateSql = ep().buildSixplexUpdateSql();
      const { client, recorded } = makeClient((sql) => {
        if (isCount(sql)) return { rows: [{ gis: 18, wards: 9 }] };
        if (/zoning_class IN/i.test(sql)) {
          return { rows: [{ basis: 'gis_in', n: 1 }] };
        }
        if (/GROUP BY basis/i.test(sql)) {
          return {
            rows: [
              { basis: 'gis_in', n: 3 },
              { basis: 'gis_out_ward_out', n: 2 },
            ],
          };
        }
        if (sql === updateSql || /UPDATE parcels/i.test(sql)) {
          return { rows: [{ id: 1 }, { id: 2 }], rowCount: 2 };
        }
        return { rows: [], rowCount: 0 };
      });

      const result = await ep().runSixplexPass(
        client,
        seamCtx(client),
        { enrich_parcels_sixplex_subdivide_max_vertices: 256 },
      );

      expect(result.updated).toBe(2);
      expect(result.updatedIds).toEqual([1, 2]);
      expect(result.basisCounts).toEqual({ gis_in: 3, gis_out_ward_out: 2 });
      expect(result.skipped).toBeNull();

      const parts = recorded.find((r) => r.sql.includes('CREATE TEMP TABLE sixplex_parts ON COMMIT DROP'));
      expect(parts).toBeDefined();
      expect(parts!.params).toEqual([256]);
      expect(recorded.some((r) => r.sql === 'CREATE INDEX sixplex_parts_geom_gist ON sixplex_parts USING gist (geom)')).toBe(true);
      expect(recorded.some((r) => r.sql === 'ANALYZE sixplex_parts')).toBe(true);
      expect(recorded.some((r) => r.sql.includes('CREATE TEMP TABLE sixplex_enrich ON COMMIT DROP'))).toBe(true);
      // The UPDATE goes through ctx.exec to the declared sixplex target (execution.phases sixplex writes_ref).
      const ref = desc().execution.phases.find((p: any) => p.name === 'sixplex').writes_ref;
      expect(execRefs[execRefs.length - 1]).toBe(ref);
    }
  });

  it('ESX-11 computePostPhase: sixplex counts flow through, skipped maps report sixplex_map_missing', async () => {
    const fakePool = { query: async () => ({ rows: [{ n: 0 }] }) } as any;

    const ok = await ep().computePostPhase(fakePool, {
      passRaw: {
        sixplex: {
          ran: true,
          skipped: null,
          updated: 2,
          updatedIds: [1, 2],
          basisCounts: { gis_in: 3 },
          basisCountsResidential: { gis_in: 1 },
        },
      },
    });
    expect(ok.matched.sixplex_enriched_count).toBe(2);
    expect(ok.matched.sixplex_basis_counts).toEqual({
      all: { gis_in: 3 },
      residential: { gis_in: 1 },
    });
    expect(ok.matched.sixplex_map_missing).toBe(false);

    const skipped = await ep().computePostPhase(fakePool, {
      passRaw: {
        sixplex: {
          ran: true,
          skipped: 'no_map_areas',
          mapCounts: { gis: 0, wards: 0 },
          updated: 0,
          updatedIds: [],
          basisCounts: {},
          basisCountsResidential: {},
        },
      },
    });
    expect(skipped.matched.sixplex_map_missing).toBe(true);
  });
});

describe('sixplex fold 1', () => {
  // Shared helpers: a recording query client plus the bylaw_map_areas count probe predicate.
  const makeClient = (answers: (sql: string) => any) => {
    const recorded: Array<{ sql: string; params: any }> = [];
    const query = async (sql: string, params?: any) => {
      recorded.push({ sql, params });
      return answers(sql);
    };
    return { client: { query } as any, recorded };
  };
  const isCount = (sql: string) => /FROM bylaw_map_areas/i.test(sql) && /count\(/i.test(sql);

  it('ESX-F1 a pass that never ran reports a violation, not a clean run', async () => {
    const fakePool = { query: async () => ({ rows: [{ n: 0 }] }) } as any;

    // passRaw with no sixplex block at all — the pass did not run.
    const out = await ep().computePostPhase(fakePool, { passRaw: {} });
    expect(out.matched.sixplex_ran).toBe(false);

    const ctx: any = {
      matched: out.matched,
      report: (id: string, r: any) => {
        if (id === 'sixplex_map_missing') ctx._r = r;
      },
    };
    ep().checks.sixplex_map_missing(ctx);
    expect(ctx._r.violations).toBe(1);
    expect(ctx._r.detail).toBe('sixplex pass did not run');
  });

  it('ESX-F2 exactly one missing source is partial_map_areas and issues no UPDATE', async () => {
    const { client, recorded } = makeClient((sql) =>
      isCount(sql) ? { rows: [{ gis: 18, wards: 0 }] } : { rows: [], rowCount: 0 },
    );
    const result = await ep().runSixplexPass(
      client,
      seamCtx(client),
      { enrich_parcels_sixplex_subdivide_max_vertices: 256 },
    );
    expect(result.skipped).toBe('partial_map_areas');
    expect(result.ran).toBe(true);
    expect(result.mapCounts).toEqual({ gis: 18, wards: 0 });
    expect(result.updated).toBe(0);
    for (const r of recorded) expect(r.sql).not.toContain('UPDATE parcels');
  });

  it('ESX-F3 statement 6 treats empty geometry as no_geom (ST_IsEmpty twice)', () => {
    const sql = ep().buildSixplexSql();
    const hits = sql.match(/ST_IsEmpty\(p\.geom\)/g) || [];
    expect(hits.length).toBe(2);
  });

  it('ESX-F4 the stale same-name temp table is dropped by the seam, not by compute', async () => {
    expect(ep().buildSixplexSql()).not.toContain('DROP TABLE');
    const { client, recorded } = makeClient((sql) =>
      isCount(sql) ? { rows: [{ gis: 18, wards: 9 }] } : { rows: [{ id: 1 }], rowCount: 1 },
    );
    await ep().runSixplexPass(client, seamCtx(client), { enrich_parcels_sixplex_subdivide_max_vertices: 256 });
    expect(recorded.some((r) => r.sql === 'DROP TABLE IF EXISTS sixplex_parts')).toBe(true);
    expect(recorded.some((r) => r.sql === 'DROP TABLE IF EXISTS sixplex_enrich')).toBe(true);
  });

  it('ESX-F5 the census carries an R-category slice for the Reality-Check bounds', async () => {
    const { client, recorded } = makeClient((sql) => {
      if (isCount(sql)) return { rows: [{ gis: 18, wards: 9 }] };
      if (/zoning_class IN/i.test(sql)) return { rows: [{ basis: 'gis_in', n: 4 }] };
      if (/GROUP BY basis/i.test(sql)) return { rows: [{ basis: 'gis_in', n: 9 }] };
      return { rows: [{ id: 1 }], rowCount: 1 };
    });
    const result = await ep().runSixplexPass(
      client,
      seamCtx(client),
      { enrich_parcels_sixplex_subdivide_max_vertices: 256 },
    );
    expect(result.basisCountsResidential).toEqual({ gis_in: 4 });
    const resQ = recorded.find((r) => /zoning_class IN/i.test(r.sql));
    expect(resQ).toBeDefined();
    expect(resQ!.sql).toContain("zoning_class IN ('R', 'RD', 'RS', 'RT', 'RM')");
  });
});
