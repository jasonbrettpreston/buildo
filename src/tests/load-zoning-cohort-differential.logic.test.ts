// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-AS
// SPEC LINK: docs/specs/01-pipeline/58_source_zoning_bylaw.md §9
//
// R-AS (Spec 124 §5) fires only when a write target's `IS DISTINCT FROM` guard includes the
// lineage/version stamp the step itself writes. Zoning's guard EXCLUDES `source_dataset_version`
// (LZ-D2; the descriptor's `guard_columns`) and INCLUDES `geometry` (H5), so a forced FULL over
// an unchanged source cannot prove value equivalence here (measured 2026-10-02, re-grounding §A
// A2: 3 targets write 0 rows, the other 7 write 121 geom-only GEOS-drift rows ONCE). The
// instrument that DOES prove it is this script's COMMITTED PERTURBATION COHORT, whose arms are:
//   U = `geometry = geometry || '{"r_as":1}'::jsonb` — geometry IS a guard column (H5), so the
//       upsert must HEAL it (`updated`).
//   A = `source_dataset_version = '2000-01-01'` — the version stamp is OUTSIDE the guard (LZ-D2),
//       so NEITHER path heals it; only the restore does. This is zoning's guard-composition
//       witness, the INVERSE of heritage's A arm.
//   D = the rows are DELETEd, so the upsert must re-INSERT them.
//   P = ONE phantom row at max(key) + 100000 — only where 1/(n+1) <= 0.5 %, so P = [] on
//       building_setback_overlay and queenstw_eat_overlay.
//   X = the 121 pre-existing GEOS-drift rows (re-grounding §A A2), DECLARED but not perturbed.
//   negative_control = the remainder — byte-identical after either path.
//
// THIS file is the RED lock for the script's PURE exports. It EXECUTES `deriveCohort`, `judge`,
// `metricValue`, the SQL builders, `restoreParams`, `verifyBeforeImage`, the safety predicates
// and `parseArgs` — it never asserts on the script's source text.

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// The script is CommonJS (like every scripts/analysis/*.js driver); the require is
// intentional and exercised, not simulated.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS module
const mod = require('../../scripts/analysis/load-zoning-cohort-differential.js') as {
  TABLES: Table[];
  METRIC_PREFIX: Record<Table, string>;
  PROJ: Record<Table, string[]>;
  GEOM_KIND: Record<Table, 'polygon' | 'linestring'>;
  SIZES: Record<Table, { U: number; D: number; A: number; P: number }>;
  COHORT_LOCK_ID: number;
  CONSUMER_LOCK_ID: number;
  deriveCohort: (keysByTable: KeysByTable, xKeysByTable: KeysByTable) => Cohorts;
  metricValue: (auditRows: AuditRow[], metric: string) => number | undefined;
  judge: (input: JudgeInput) => string[];
  perturbationSql: (table: Table) => { U: string; A: string; D: string };
  xDriftSql: (table: Table) => string;
  buildPhantomInsertSql: (table: string, columns: string[]) => { text: string; typesUsed: string[] };
  buildRestoreDeleteSql: (table: Table, keys: number[]) => { text: string; params: number[][] };
  buildRestoreInsertSql: (table: Table) => { text: string };
  buildRestoreUpdateSql: (table: Table) => { text: string };
  beforeImageSelectSql: (table: Table) => string;
  restoreParams: (table: Table, row: Record<string, unknown>, mode: string) => unknown[];
  verifyBeforeImage: (doc: unknown, cohort: Cohorts) => { ok: boolean; reason?: string };
  assertLocalTarget: (description: unknown) => string;
  parseArgs: (argv: string[]) => {
    derive: boolean; run: boolean; selfTest: boolean; restore: string | null; side: string | null;
    chain: string; out: string | null; legacyRef: string | null;
  };
  sameSource: (a: string, b: string) => boolean;
  isConvertedShim: (text: string) => boolean;
  abortIfInterrupted: (state: { interrupted: boolean }) => void;
  A_SENTINEL: string;
  U_PATCH: string;
  PHANTOM_OFFSET: number;
  KEY: string;
  checkJournal: (doc: unknown, cohort: Cohorts) => { ok: boolean; reason?: string };
  assertXUnchanged: (table: string, cohortX: number[], liveX: number[]) => void;
  leftoverPerturbationSql: (table: Table) => string;
  selfTest: () => void;
};
const {
  TABLES, METRIC_PREFIX, PROJ, GEOM_KIND, SIZES,
  COHORT_LOCK_ID, CONSUMER_LOCK_ID,
  deriveCohort, metricValue, judge, perturbationSql, xDriftSql,
  buildPhantomInsertSql, buildRestoreDeleteSql, buildRestoreInsertSql,
  buildRestoreUpdateSql, beforeImageSelectSql, restoreParams,
  verifyBeforeImage, assertLocalTarget, parseArgs, sameSource, isConvertedShim,
  abortIfInterrupted, checkJournal, assertXUnchanged, leftoverPerturbationSql, selfTest,
} = mod;

type Table =
  | 'zoning_bylaw_areas'
  | 'zoning_height_overlay'
  | 'zoning_lot_coverage_overlay'
  | 'zoning_building_setback_overlay'
  | 'zoning_policy_area_overlay'
  | 'zoning_policy_road_overlay'
  | 'zoning_rooming_house_overlay'
  | 'zoning_parking_zone_overlay'
  | 'zoning_priority_retail_overlay'
  | 'zoning_queenstw_eat_overlay';

type Arm = { U: number[]; D: number[]; A: number[]; P: number[]; X: number[]; negative_control: number[] };
type Cohorts = Record<Table, Arm>;
type KeysByTable = Record<Table, number[]>;
type AuditRow = { metric: string; value: unknown };
type HashRow = { afterExceptAX: string | null; aPerturbedStill: boolean | null };
type JudgeInput = {
  cohort: Partial<Cohorts>;
  auditRows: AuditRow[];
  hashes: Partial<Record<Table, HashRow>>;
  baselineExceptAX: Partial<Record<Table, string>>;
};

// ── fixtures ─────────────────────────────────────────────────────────────────
// 40 ascending even keys (2, 4, …, 80) for the large tables; 4 keys (2, 4, 6, 8) for the two
// 4-row tables (building_setback, queenstw_eat) — the live shapes the SIZES were declared for.
const SMALL_TABLES: Table[] = ['zoning_building_setback_overlay', 'zoning_queenstw_eat_overlay'];

function keysFor(t: Table): number[] {
  const out: number[] = [];
  const n = SMALL_TABLES.includes(t) ? 4 : 40;
  for (let i = 1; i <= n; i++) out.push(i * 2);
  return out;
}

/** The X arm (declared, not perturbed): all 4 keys for building_setback, [] for the zero-drift
 *  overlays, the first two keys otherwise. */
function xFor(t: Table): number[] {
  if (t === 'zoning_building_setback_overlay') return [2, 4, 6, 8];
  if (t === 'zoning_policy_road_overlay'
    || t === 'zoning_priority_retail_overlay'
    || t === 'zoning_queenstw_eat_overlay') return [];
  return keysFor(t).slice(0, 2);
}

function keysByTable(): KeysByTable {
  const out = {} as KeysByTable;
  for (const t of TABLES) out[t] = keysFor(t);
  return out;
}

function xKeysByTable(): KeysByTable {
  const out = {} as KeysByTable;
  for (const t of TABLES) out[t] = xFor(t);
  return out;
}

function derive(): Cohorts {
  return deriveCohort(keysByTable(), xKeysByTable());
}

/**
 * The fully PASSing judge input. `loaded = |U|+|D|+|X| + 5` and `unchanged = 5`, so
 * `written = loaded − unchanged = |U|+|D|+|X|`; `orphans = |P|`; `afterExceptAX` equals
 * `baselineExceptAX[t]`; the A witness is true wherever the table carries an A arm.
 */
function passInput(cohort: Cohorts): JudgeInput {
  const auditRows: AuditRow[] = [];
  const hashes: Partial<Record<Table, HashRow>> = {};
  const baselineExceptAX: Partial<Record<Table, string>> = {};
  for (const t of TABLES) {
    const p = METRIC_PREFIX[t];
    const arm = cohort[t];
    const written = arm.U.length + arm.D.length + arm.X.length;
    auditRows.push({ metric: `${p}_loaded_count`, value: written + 5 });
    auditRows.push({ metric: `${p}_unchanged_skipped`, value: 5 });
    auditRows.push({ metric: `${p}_orphans_removed_count`, value: arm.P.length });
    hashes[t] = { afterExceptAX: `h-${t}`, aPerturbedStill: arm.A.length > 0 };
    baselineExceptAX[t] = `h-${t}`;
  }
  return { cohort, auditRows, hashes, baselineExceptAX };
}

/** A before-image row for one key of one table: every PROJ column except `geom` present, plus geom_hex. */
function beforeRow(t: Table, key: number): Record<string, unknown> {
  const row: Record<string, unknown> = { __table: t, geom_hex: 'AABB' };
  for (const c of PROJ[t]) {
    if (c === 'geom') continue;
    row[c] = c === 'source_id' ? key : null;
  }
  return row;
}

/** A COMPLETE before-image doc: one row per U ∪ D ∪ A ∪ X key of every table. */
function completeDoc(cohort: Cohorts): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const t of TABLES) {
    const arm = cohort[t];
    for (const k of [...arm.U, ...arm.D, ...arm.A, ...arm.X]) rows.push(beforeRow(t, k));
  }
  return rows;
}

const sortedAsc = (a: number[]): number[] => a.slice().sort((x, y) => x - y);

describe('load-zoning-cohort-differential — R-AS cohort derivation and judging (pure)', () => {
  describe('SIZES / TABLES — the declared arm sizes and target order', () => {
    it('declares the four pinned tables at their measured sizes', () => {
      expect(SIZES.zoning_bylaw_areas).toEqual({ U: 5, D: 5, A: 5, P: 1 });
      expect(SIZES.zoning_building_setback_overlay).toEqual({ U: 0, D: 0, A: 0, P: 0 });
      expect(SIZES.zoning_queenstw_eat_overlay).toEqual({ U: 1, D: 1, A: 1, P: 0 });
      expect(SIZES.zoning_policy_area_overlay).toEqual({ U: 3, D: 3, A: 3, P: 1 });
    });

    it('TABLES has TEN entries and the base layer is first', () => {
      expect(TABLES.length).toBe(10);
      expect(TABLES[0]).toBe('zoning_bylaw_areas');
      expect(new Set(TABLES).size).toBe(10);
    });
  });

  describe('deriveCohort — disjoint, exhaustive, phantom-P, order-independent', () => {
    it('returns { U, D, A, P, X, negative_control } per table at the declared sizes', () => {
      const cohort = derive();
      for (const t of TABLES) {
        const arm = cohort[t];
        for (const name of ['U', 'D', 'A', 'P'] as const) {
          expect(arm[name].length, `${t}.${name} size`).toBe(SIZES[t][name]);
        }
        expect(arm.X.length, `${t}.X == the input X list`).toBe(xFor(t).length);
      }
    });

    it('U, D, A, X, negative_control are pairwise DISJOINT and their union is EXACTLY the input keys', () => {
      const input = keysByTable();
      const cohort = derive();
      for (const t of TABLES) {
        const arm = cohort[t];
        const parts: Array<[string, number[]]> = [
          ['U', arm.U], ['D', arm.D], ['A', arm.A], ['X', arm.X], ['negative_control', arm.negative_control],
        ];
        for (let i = 0; i < parts.length; i++) {
          for (let j = i + 1; j < parts.length; j++) {
            const [ni, vi] = parts[i] as [string, number[]];
            const [nj, vj] = parts[j] as [string, number[]];
            const right = new Set(vj);
            expect(vi.filter((k) => right.has(k)), `${t}: ${ni} ∩ ${nj}`).toEqual([]);
          }
        }
        const union = new Set<number>([...arm.U, ...arm.D, ...arm.A, ...arm.X, ...arm.negative_control]);
        expect(sortedAsc([...union]), `${t}: U∪D∪A∪X∪negative_control`).toEqual(sortedAsc(input[t]));
      }
    });

    it('no U/D/A/negative_control key is an X key', () => {
      const cohort = derive();
      for (const t of TABLES) {
        const arm = cohort[t];
        const xSet = new Set(arm.X);
        const perturbed = [...arm.U, ...arm.D, ...arm.A, ...arm.negative_control];
        expect(perturbed.filter((k) => xSet.has(k)), `${t}: no arm key is X`).toEqual([]);
      }
    });

    it('P is exactly max(key) + 100000 where SIZES.P === 1, and [] otherwise', () => {
      const input = keysByTable();
      const cohort = derive();
      for (const t of TABLES) {
        const arm = cohort[t];
        if (SIZES[t].P === 1) {
          expect(arm.P, `${t}.P`).toEqual([Math.max(...input[t]) + 100000]);
        } else {
          expect(arm.P, `${t}.P`).toEqual([]);
        }
      }
    });

    it('building_setback (all X) has empty U/D/A AND an EMPTY negative_control', () => {
      const arm = derive().zoning_building_setback_overlay;
      expect(arm.U).toEqual([]);
      expect(arm.D).toEqual([]);
      expect(arm.A).toEqual([]);
      expect(arm.negative_control).toEqual([]);
      expect(sortedAsc(arm.X)).toEqual([2, 4, 6, 8]);
    });

    it('queenstw_eat has one key in each of U/D/A and one negative-control key, and no X', () => {
      const arm = derive().zoning_queenstw_eat_overlay;
      expect(arm.U.length).toBe(1);
      expect(arm.D.length).toBe(1);
      expect(arm.A.length).toBe(1);
      expect(arm.negative_control.length).toBe(1);
      expect(arm.X).toEqual([]);
    });

    it('is order-independent — reversed key lists yield the SAME cohort', () => {
      const ordered = derive();
      const revKeys = {} as KeysByTable;
      const revX = {} as KeysByTable;
      for (const t of TABLES) {
        revKeys[t] = keysFor(t).slice().reverse();
        revX[t] = xFor(t).slice().reverse();
      }
      expect(deriveCohort(revKeys, revX)).toEqual(ordered);
    });

    it('throws (naming the table) on a 2-key base list', () => {
      const k = keysByTable();
      k.zoning_bylaw_areas = [2, 4];
      expect(() => deriveCohort(k, xKeysByTable())).toThrowError(/zoning_bylaw_areas/);
    });

    it('throws when an X key is absent from the key list', () => {
      const x = xKeysByTable();
      x.zoning_height_overlay = [999999];
      expect(() => deriveCohort(keysByTable(), x)).toThrow();
    });

    it('throws when a key list is missing', () => {
      const k = keysByTable();
      delete (k as Partial<KeysByTable>).zoning_height_overlay;
      expect(() => deriveCohort(k as KeysByTable, xKeysByTable())).toThrow();
    });
  });

  describe('metricValue — the audit-row reader', () => {
    it("reads '7' as 7", () => {
      expect(metricValue([{ metric: 'a', value: '7' }], 'a')).toBe(7);
    });

    it('is undefined when the metric is absent', () => {
      expect(metricValue([{ metric: 'a', value: 7 }], 'b')).toBeUndefined();
      expect(metricValue([], 'a')).toBeUndefined();
    });
  });

  describe('judge — [] means PASS; each failed claim is NAMED', () => {
    it('PASSes a fully PASSing input', () => {
      const cohort = derive();
      expect(judge(passInput(cohort))).toEqual([]);
    });

    it('names written:zoning_policy_area_overlay when one loaded_count is +1', () => {
      const cohort = derive();
      const fx = passInput(cohort);
      const metric = 'policy_area_overlay_loaded_count';
      fx.auditRows = fx.auditRows.map((r) => (r.metric === metric ? { ...r, value: Number(r.value) + 1 } : r));
      const failures = judge(fx);
      expect(failures.length).toBe(1);
      const first = failures[0] as string;
      expect(first.startsWith('written:zoning_policy_area_overlay')).toBe(true);
      expect(first).toContain(metric);
    });

    it('names written: when a table\u2019s _unchanged_skipped row is MISSING (NaN must FAIL, not pass)', () => {
      const cohort = derive();
      const fx = passInput(cohort);
      const metric = 'height_overlay_unchanged_skipped';
      fx.auditRows = fx.auditRows.filter((r) => r.metric !== metric);
      const failures = judge(fx);
      expect(failures.length).toBeGreaterThan(0);
      expect(failures.join('\n')).toContain('written:zoning_height_overlay');
    });

    it('names deleted:zoning_bylaw_areas when orphans is 0 although |P| = 1', () => {
      const cohort = derive();
      const fx = passInput(cohort);
      const metric = 'zoning_areas_orphans_removed_count';
      fx.auditRows = fx.auditRows.map((r) => (r.metric === metric ? { ...r, value: 0 } : r));
      const failures = judge(fx);
      expect(failures.join('\n')).toContain('deleted:zoning_bylaw_areas');
    });

    it('names hash:zoning_parking_zone_overlay on a drifted afterExceptAX', () => {
      const cohort = derive();
      const fx = passInput(cohort);
      fx.hashes = { ...fx.hashes, zoning_parking_zone_overlay: { afterExceptAX: 'drifted', aPerturbedStill: true } };
      const failures = judge(fx);
      expect(failures.join('\n')).toContain('hash:zoning_parking_zone_overlay');
    });

    it('names guard_composition:zoning_rooming_house_overlay when its A witness is false', () => {
      const cohort = derive();
      const fx = passInput(cohort);
      fx.hashes = {
        ...fx.hashes,
        zoning_rooming_house_overlay: { afterExceptAX: 'h-zoning_rooming_house_overlay', aPerturbedStill: false },
      };
      const failures = judge(fx);
      expect(failures.join('\n')).toContain('guard_composition:zoning_rooming_house_overlay');
    });

    it('makes NO guard_composition claim for building_setback with a false witness (|A| = 0)', () => {
      const cohort = derive();
      const fx = passInput(cohort);
      fx.hashes = {
        ...fx.hashes,
        zoning_building_setback_overlay: { afterExceptAX: 'h-zoning_building_setback_overlay', aPerturbedStill: false },
      };
      expect(judge(fx)).toEqual([]);
    });

    it('reports cohort:zoning_height_overlay ALONE when that arm is absent', () => {
      const cohort = derive();
      const fx = passInput(cohort);
      const partial: Partial<Cohorts> = { ...cohort };
      delete partial.zoning_height_overlay;
      fx.cohort = partial;
      const failures = judge(fx);
      expect(failures).toEqual(['cohort:zoning_height_overlay']);
    });

    it('counts X toward written: — a load built WITHOUT X fails written: on the X-bearing tables', () => {
      const cohort = derive();
      const fx = passInput(cohort);
      // Rebuild every counter from |U|+|D| only (X omitted) — X-bearing tables must now FAIL.
      fx.auditRows = fx.auditRows.map((r) => {
        const loaded = /^(.*)_loaded_count$/.exec(r.metric);
        if (!loaded) return r;
        const p = loaded[1] as string;
        const t = TABLES.find((x) => METRIC_PREFIX[x] === p);
        if (!t) return r;
        const arm = cohort[t];
        // Build from |U|+|D| ONLY — X omitted — so `written = |U|+|D|` makes every X-bearing table fail.
        return { ...r, value: arm.U.length + arm.D.length + 5 };
      });
      const failures = judge(fx);
      expect(failures.length).toBeGreaterThan(0);
      expect(failures.join('\n')).toContain('written:zoning_bylaw_areas');
      expect(failures.join('\n')).toContain('written:zoning_rooming_house_overlay');
      // The zero-X tables (policy_road, priority_retail) are unaffected.
      expect(failures.join('\n')).not.toContain('written:zoning_policy_road_overlay');
    });
  });

  describe('SQL builders (pure)', () => {
    describe('perturbationSql — the U/A/D arms', () => {
      for (const t of TABLES) {
        it(`${t}: U patches geometry jsonb, A stamps the sentinel, D deletes`, () => {
          const sql = perturbationSql(t);
          expect(sql.U).toContain(`geometry || '{"r_as":1}'::jsonb`);
          expect(sql.A).toContain(`'2000-01-01'::timestamptz`);
          expect(sql.D.startsWith('DELETE FROM')).toBe(true);
        });
      }
    });

    describe('xDriftSql — the re-derived GEOS-drift selector', () => {
      for (const t of TABLES) {
        it(`${t}: re-derives geom and compares IS DISTINCT FROM`, () => {
          const sql = xDriftSql(t);
          expect(sql).toContain('ST_GeomFromGeoJSON(geometry::text)');
          expect(sql).toContain('IS DISTINCT FROM');
        });
      }

      it('uses ST_CollectionExtract type arg 2 for the two LINESTRING tables and 3 for polygons', () => {
        const typeArg = (t: Table): number => (GEOM_KIND[t] === 'linestring' ? 2 : 3);
        for (const t of TABLES) {
          const sql = xDriftSql(t);
          expect(sql, `${t}: carries ST_CollectionExtract(`).toContain('ST_CollectionExtract(');
          expect(sql, `${t}: type arg ${typeArg(t)}`).toContain(`, ${typeArg(t)})`);
        }
        // The two line tables are exactly the LINESTRING kind.
        expect(GEOM_KIND.zoning_policy_road_overlay).toBe('linestring');
        expect(GEOM_KIND.zoning_priority_retail_overlay).toBe('linestring');
        expect(xDriftSql('zoning_policy_road_overlay')).toContain(', 2)');
        expect(xDriftSql('zoning_bylaw_areas')).toContain(', 3)');
      });
    });

    describe('phantom INSERT / restore INSERT / restore UPDATE — never ::undefined, never id/created_at', () => {
      for (const t of TABLES) {
        it(`${t}: binds the projection with no ::undefined cast and no id/created_at column`, () => {
          const phantom = buildPhantomInsertSql(t, PROJ[t]);
          expect(phantom.text).not.toContain('::undefined');
          expect(phantom.text).not.toMatch(/\bid\b/);
          expect(phantom.text).not.toContain('created_at');
          const ins = buildRestoreInsertSql(t);
          expect(ins.text).not.toContain('::undefined');
          expect(ins.text).not.toMatch(/\bid\b/);
          expect(ins.text).not.toContain('created_at');
          const upd = buildRestoreUpdateSql(t);
          expect(upd.text).not.toContain('::undefined');
          expect(upd.text).not.toContain('created_at');
        });
      }

      it('buildPhantomInsertSql throws when handed the id column', () => {
        expect(() => buildPhantomInsertSql('zoning_bylaw_areas', ['id'])).toThrow();
      });

      it('buildRestoreDeleteSql throws on a NaN key', () => {
        expect(() => buildRestoreDeleteSql('zoning_bylaw_areas', [Number.NaN])).toThrow();
      });

      it("buildRestoreDeleteSql([3, 4]) deletes by source_id = ANY($1::integer[])", () => {
        expect(buildRestoreDeleteSql('zoning_bylaw_areas', [3, 4])).toEqual({
          text: 'DELETE FROM zoning_bylaw_areas WHERE source_id = ANY($1::integer[])',
          params: [[3, 4]],
        });
      });
    });

    describe('beforeImageSelectSql — text round-trip, geom as WKB hex', () => {
      for (const t of TABLES) {
        it(`${t}: casts to text, exports geom_hex, never text-casts geom`, () => {
          const sql = beforeImageSelectSql(t);
          expect(sql).toContain('source_dataset_version::text');
          expect(sql).toContain('geometry::text');
          expect(sql).toContain('geom_hex');
          expect(sql).not.toContain('geom::text');
        });
      }
    });
  });

  describe('restoreParams — insert order = PROJ order; update = key first then PROJ minus key', () => {
    it('insert binds geom_hex where PROJ names geom', () => {
      const t: Table = 'zoning_height_overlay';
      const row = { source_id: 7, geom_hex: 'AB', gen_zone: 3 };
      const ins = restoreParams(t, row, 'insert');
      expect(ins.length).toBe(PROJ[t].length);
      expect(ins[PROJ[t].indexOf('geom')]).toBe('AB');
    });

    it('update puts the key first and binds geom_hex in PROJ-minus-key order', () => {
      const t: Table = 'zoning_height_overlay';
      const row = { source_id: 7, geom_hex: 'AB', gen_zone: 3 };
      const upd = restoreParams(t, row, 'update');
      expect(upd[0]).toBe(7);
      expect(upd.length).toBe(PROJ[t].length);
      const idx = PROJ[t].filter((c) => c !== 'source_id').indexOf('geom');
      expect(upd[idx + 1]).toBe('AB');
    });

    it('throws on an unknown mode', () => {
      expect(() => restoreParams('zoning_height_overlay', { source_id: 1, geom_hex: 'AB' }, 'nope')).toThrow();
    });
  });

  describe('verifyBeforeImage — complete doc OK; every defect rejected, naming the table', () => {
    it('is ok on a complete doc', () => {
      const cohort = derive();
      expect(verifyBeforeImage({ rows: completeDoc(cohort) }, cohort)).toEqual({ ok: true });
    });

    it('rejects a dropped row, naming the table', () => {
      const cohort = derive();
      const arm = cohort.zoning_height_overlay;
      const dropped = completeDoc(cohort).filter(
        (r) => !(r.__table === 'zoning_height_overlay' && r.source_id === arm.U[0]),
      );
      const v = verifyBeforeImage({ rows: dropped }, cohort);
      expect(v.ok).toBe(false);
      expect(v.reason).toContain('zoning_height_overlay');
    });

    it('rejects an extra key, naming the table', () => {
      const cohort = derive();
      const extra = [...completeDoc(cohort), beforeRow('zoning_height_overlay', 999999)];
      const v = verifyBeforeImage({ rows: extra }, cohort);
      expect(v.ok).toBe(false);
      expect(v.reason).toContain('zoning_height_overlay');
    });

    it('rejects an empty geom_hex, naming the table', () => {
      const cohort = derive();
      const rows = completeDoc(cohort);
      rows[0] = { ...(rows[0] as Record<string, unknown>), geom_hex: '' };
      const v = verifyBeforeImage({ rows }, cohort);
      expect(v.ok).toBe(false);
      expect(v.reason).toContain('zoning_bylaw_areas');
    });

    it('rejects a duplicate row', () => {
      const cohort = derive();
      const rows = completeDoc(cohort);
      const v = verifyBeforeImage({ rows: [...rows, rows[0]] }, cohort);
      expect(v.ok).toBe(false);
    });

    it('rejects a missing projected column, naming the table', () => {
      const cohort = derive();
      const rows = completeDoc(cohort);
      const target = rows.find((r) => r.__table === 'zoning_height_overlay') as Record<string, unknown>;
      delete target.ht_string;
      const v = verifyBeforeImage({ rows }, cohort);
      expect(v.ok).toBe(false);
      expect(v.reason).toContain('zoning_height_overlay');
    });

    it('rejects rows that are not an array', () => {
      const cohort = derive();
      const v = verifyBeforeImage({ rows: 'nope' }, cohort);
      expect(v.ok).toBe(false);
      expect(typeof v.reason).toBe('string');
    });
  });

  describe('safety surface — local-only target, argv contract, gate signals', () => {
    it('assertLocalTarget accepts the two loopback description shapes', () => {
      expect(assertLocalTarget('postgresql://u:secret@127.0.0.1:54322/postgres'))
        .toContain('127.0.0.1:54322');
      expect(assertLocalTarget('127.0.0.1:54322/postgres')).toContain('127.0.0.1:54322');
    });

    it('assertLocalTarget throws on a cloud host, a non-loopback IP and the empty string', () => {
      expect(() => assertLocalTarget('postgresql://u:secret@db.abcdefgh.supabase.co:5432/postgres')).toThrow();
      expect(() => assertLocalTarget('10.0.0.5:5432/postgres')).toThrow();
      expect(() => assertLocalTarget('')).toThrow();
    });

    it('parseArgs refuses multi-mode and unknown/ill-formed argv', () => {
      expect(() => parseArgs(['--derive', '--run'])).toThrow();
      expect(() => parseArgs(['--self-test', '--run'])).toThrow();
      expect(() => parseArgs(['--side=pre'])).toThrow();
      expect(() => parseArgs(['--bogus'])).toThrow();
    });

    it('parseArgs accepts the run argv and records legacyRef', () => {
      const args = parseArgs(['--run', '--side=pre', '--legacy-ref=abc', '--out=x.json']);
      expect(args.run).toBe(true);
      expect(args.side).toBe('pre');
      expect(args.legacyRef).toBe('abc');
      expect(args.out).toBe('x.json');
    });

    it('sameSource normalises CRLF and detects a content difference', () => {
      expect(sameSource('a\r\nb', 'a\nb')).toBe(true);
      expect(sameSource('a', 'b')).toBe(false);
    });

    it('isConvertedShim is true for a converted shim, false for legacy and for the empty string', () => {
      expect(isConvertedShim('module.exports = pipeline.step(d, c);')).toBe(true);
      expect(isConvertedShim('// legacy loader')).toBe(false);
      expect(isConvertedShim('')).toBe(false);
    });

    it('abortIfInterrupted throws only when interrupted', () => {
      expect(() => abortIfInterrupted({ interrupted: false })).not.toThrow();
      expect(() => abortIfInterrupted({ interrupted: true })).toThrow();
    });

    it('COHORT_LOCK_ID is 902003 and CONSUMER_LOCK_ID is 65 — neither is the step lock 58', () => {
      expect(COHORT_LOCK_ID).toBe(902003);
      expect(CONSUMER_LOCK_ID).toBe(65);
      expect(COHORT_LOCK_ID).not.toBe(58);
      expect(CONSUMER_LOCK_ID).not.toBe(58);
    });
  });

  describe('selfTest — the whole pure surface runs clean', () => {
    it('runs without throwing', () => {
      expect(() => selfTest()).not.toThrow();
    });
  });

  describe('zc-p2', () => {
    describe('parseArgs — the --restore mode', () => {
      it("records args.restore for '--restore=/tmp/j.json'", () => {
        expect(parseArgs(['--restore=/tmp/j.json']).restore).toBe('/tmp/j.json');
      });

      it("refuses '--restore=/tmp/j.json' with '--run' as a fourth mode", () => {
        // The MODE-COUNT refusal, not a generic unknown-arg throw (the pre-F1 parser threw for
        // any unknown --restore= too, which made a bare toThrow() vacuous).
        expect(() => parseArgs(['--restore=/tmp/j.json', '--run'])).toThrow(/exactly one of .*--restore/);
        expect(() => parseArgs(['--derive', '--restore=/tmp/j.json'])).toThrow(/exactly one of .*--restore/);
      });

      it("refuses '--restore=' with a message about the journal path", () => {
        expect(() => parseArgs(['--restore='])).toThrow(/--restore requires a journal path/);
      });
    });

    describe('checkJournal — a restore-journal gate that never throws', () => {
      it('is ok for a complete journal whose cohort_baseline matches and whose rows verify', () => {
        const cohort = derive();
        const doc = {
          cohort_baseline: Object.fromEntries(TABLES.map((t) => [t, `h-${t}`])),
          rows: completeDoc(cohort),
        };
        const baseCohort = { ...cohort, baseline: doc.cohort_baseline } as Cohorts & { baseline: Record<string, string> };
        expect(checkJournal(doc, baseCohort)).toEqual({ ok: true });
      });

      it('names the table when ANY cohort_baseline entry differs', () => {
        const cohort = derive();
        const baseline = Object.fromEntries(TABLES.map((t) => [t, `h-${t}`]));
        const doc = { cohort_baseline: { ...baseline, zoning_height_overlay: 'different' }, rows: completeDoc(cohort) };
        const baseCohort = { ...cohort, baseline } as Cohorts & { baseline: Record<string, string> };
        const v = checkJournal(doc, baseCohort);
        expect(v.ok).toBe(false);
        expect(v.reason).toContain('zoning_height_overlay');
        expect(v.reason).toContain('journal was taken against a different cohort');
      });

      it('passes verifyBeforeImage failures through, naming the table', () => {
        const cohort = derive();
        const baseline = Object.fromEntries(TABLES.map((t) => [t, `h-${t}`]));
        const arm = cohort.zoning_height_overlay;
        const rows = completeDoc(cohort).filter(
          (r) => !(r.__table === 'zoning_height_overlay' && r.source_id === arm.U[0]),
        );
        const doc = { cohort_baseline: baseline, rows };
        const baseCohort = { ...cohort, baseline } as Cohorts & { baseline: Record<string, string> };
        const v = checkJournal(doc, baseCohort);
        expect(v.ok).toBe(false);
        expect(v.reason).toContain('zoning_height_overlay');
      });

      it('never throws on garbage input', () => {
        const cohort = derive();
        const baseCohort = { ...cohort, baseline: {} } as Cohorts & { baseline: Record<string, string> };
        expect(() => checkJournal(null, baseCohort)).not.toThrow();
        expect(checkJournal(null, baseCohort).ok).toBe(false);
        expect(() => checkJournal({}, baseCohort)).not.toThrow();
      });
    });

    describe('assertXUnchanged — the live X re-check', () => {
      it('returns nothing when the key sets are equal in any order', () => {
        expect(() => assertXUnchanged('zoning_bylaw_areas', [3, 1, 2], [2, 3, 1])).not.toThrow();
      });

      it('throws on an EXTRA live key, naming the table, both counts and the drift words', () => {
        let err: Error | null = null;
        try {
          assertXUnchanged('zoning_height_overlay', [1, 2], [1, 2, 3]);
        } catch (e) {
          err = e as Error;
        }
        expect(err).not.toBeNull();
        const msg = (err as Error).message;
        expect(msg).toContain('zoning_height_overlay');
        expect(msg).toContain('cohort |X| 2');
        expect(msg).toContain('live |X| 3');
        expect(msg).toContain('X drifted since --derive');
      });

      it('throws on a MISSING live key, naming the table, both counts and the drift words', () => {
        let err: Error | null = null;
        try {
          assertXUnchanged('zoning_parking_zone_overlay', [1, 2, 3], [1, 2]);
        } catch (e) {
          err = e as Error;
        }
        expect(err).not.toBeNull();
        const msg = (err as Error).message;
        expect(msg).toContain('zoning_parking_zone_overlay');
        expect(msg).toContain('cohort |X| 3');
        expect(msg).toContain('live |X| 2');
        expect(msg).toContain('X drifted since --derive');
      });
    });

    describe('leftoverPerturbationSql — the derive-time leftover probe', () => {
      for (const t of TABLES) {
        it(`${t}: counts rows carrying any leftover perturbation`, () => {
          const sql = leftoverPerturbationSql(t);
          expect(sql.startsWith(`SELECT count(*)::int AS n FROM ${t} WHERE`)).toBe(true);
          const uKey = Object.keys(JSON.parse(mod.U_PATCH))[0];
          expect(sql).toContain(`geometry ? '${uKey}'`);
          expect(sql).toContain(`source_dataset_version = '${mod.A_SENTINEL}'::timestamptz`);
          expect(sql).toContain(`${mod.KEY} >= ${mod.PHANTOM_OFFSET}`);
          // The three markers are OR-ed: any one of them is a leftover.
          expect(sql.split(' OR ').length).toBe(3);
        });
      }
    });

    // Source-order locks (no DB): the F1–F3 wiring lives in async DB functions, so the pure
    // exports above cannot reach it. These pin WHERE the new checks sit relative to the writes.
    describe('wiring locks (source text, no DB)', () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, '../../scripts/analysis/load-zoning-cohort-differential.js'), 'utf8',
      );
      const body = (name: string): string => {
        const start = src.indexOf(`async function ${name}(`);
        expect(start).toBeGreaterThan(-1);
        const next = src.indexOf('\nasync function ', start + 1);
        return src.slice(start, next === -1 ? undefined : next);
      };

      it('F1: main dispatches --restore to restoreFromJournal, gated by checkJournal inside both locks', () => {
        expect(src).toMatch(/if \(args\.restore\) return restoreFromJournal\(args\.restore\);/);
        const r = body('restoreFromJournal');
        const check = r.indexOf('checkJournal(doc, cohort)');
        const lockOuter = r.indexOf('withAdvisoryLock(pool, COHORT_LOCK_ID');
        const lockInner = r.indexOf('withAdvisoryLock(pool, CONSUMER_LOCK_ID');
        const restore = r.indexOf('restoreAndVerify(');
        expect(check).toBeGreaterThan(-1);
        expect(lockOuter).toBeGreaterThan(check);
        expect(lockInner).toBeGreaterThan(lockOuter);
        expect(restore).toBeGreaterThan(lockInner);
        expect(r).toContain("makePool('load-zoning-cohort-differential:restore')");
      });

      it('F1: no "manual restore from" hint survives; every hint is the runnable --restore command', () => {
        expect(src).not.toContain('manual restore from');
        const hints = src.match(/restore with: node -r dotenv\/config scripts\/analysis\/load-zoning-cohort-differential\.js --restore=\$\{beforePath\}/g) ?? [];
        expect(hints.length).toBeGreaterThanOrEqual(4);
        expect(src).toMatch(/REPLAY-SAFE: run on an\s+already-restored DB/);
      });

      it('F2: run re-checks X after the baseline check and BEFORE the before-image export and any perturbation', () => {
        const r = body('run');
        const baseline = r.indexOf('BASELINE confirmed');
        const xCheck = r.indexOf('assertXUnchanged(table, cohort[table].X');
        const export_ = r.indexOf('beforeImageSelectSql(table)');
        const perturb = r.indexOf('perturbationSql(');
        expect(baseline).toBeGreaterThan(-1);
        expect(xCheck).toBeGreaterThan(baseline);
        expect(export_).toBeGreaterThan(xCheck);
        expect(perturb).toBeGreaterThan(xCheck);
      });

      it('F3: derive reads in ONE repeatable-read read-only txn and refuses leftovers before the X read', () => {
        const d = body('derive');
        expect(src).not.toContain('readOnlyQuery');
        expect(d.match(/pool\.connect\(\)/g) ?? []).toHaveLength(1);
        expect(d).not.toMatch(/pool\.query\(/);
        const begin = d.indexOf('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const leftover = d.indexOf('leftoverPerturbationSql(table)');
        const xRead = d.indexOf('xDriftSql(table)');
        const hash = d.indexOf('hashSql(table)');
        expect(begin).toBeGreaterThan(-1);
        expect(leftover).toBeGreaterThan(begin);
        expect(xRead).toBeGreaterThan(leftover);
        expect(hash).toBeGreaterThan(xRead);
        expect(d).toContain('leftover perturbation found: restore it (--restore=<journal>) before re-deriving');
        expect(d).toMatch(/finally \{[\s\S]*ROLLBACK[\s\S]*client\.release\(\)/);
      });
    });
  });
});
