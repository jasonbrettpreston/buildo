// SPEC LINK: docs/specs/01-pipeline/130_link_parcel_abutments.md
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §4.1, §5.1, §1.4 (guarded_upsert, full_rescan retract none — H6 port, PROVISIONAL Q-B3)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 3 tunables in logic_variables, Rule 10)
// SPEC LINK: .cursor/wf1_mcbylaw_phase2_inputs_active_task.md (B2)

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../../../..');
const SHELL = 'scripts/link-parcel-abutments.js';
const DESC = 'scripts/link-parcel-abutments.descriptor.json';
const NOTES = 'scripts/link-parcel-abutments.notes.json';
const COMPUTE = 'scripts/lib/compute/link-parcel-abutments.js';
const MIG = 'migrations/255_parcel_abutments.sql';
const LOCKS = 'src/tests/pipeline-advisory-lock.infra.test.ts';
const LV = 'scripts/seeds/logic_variables.json';

const STATUSES = [
  'estimated',
  'no_building',
  'no_frontage_street',
  'street_not_found',
  'estimate_negative',
  'estimate_out_of_bounds',
];

const CFG = {
  abut_touch_tolerance_m: 0.5,
  abut_min_shared_len_m: 1,
  abut_bbox_pad_deg: 0.00002,
  abut_street_search_deg: 0.0008,
  fya_est_min_m: 0,
  fya_est_max_m: 30,
};

function abs(rel: string): string {
  return path.join(ROOT, rel);
}

function readText(rel: string): string {
  expect(fs.existsSync(abs(rel)), `${rel} should exist`).toBe(true);
  return fs.readFileSync(abs(rel), 'utf8');
}

function desc(): Record<string, unknown> {
  return JSON.parse(readText(DESC)) as Record<string, unknown>;
}

function compute(): Record<string, unknown> {
  expect(fs.existsSync(abs(COMPUTE)), `${COMPUTE} should exist`).toBe(true);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(abs(COMPUTE)) as Record<string, unknown>;
}

function migrationColumns(): string[] {
  const sql = readText(MIG);
  const marker = 'CREATE TABLE IF NOT EXISTS parcel_abutments (';
  const start = sql.indexOf(marker);
  expect(start, 'CREATE TABLE block for parcel_abutments').toBeDefined();
  expect(start as number).toBeGreaterThanOrEqual(0);
  const block = sql.slice((start as number) + marker.length);
  const lines = block.split('\n');
  const cols: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith(');') || line.startsWith(')')) break;
    if (line.startsWith('PRIMARY') || line.startsWith('CONSTRAINT')) break;
    const tokens = line.split(/\s+/);
    if (tokens.length < 2) continue;
    const first = tokens[0];
    if (typeof first !== 'string' || !/^[a-z_]+$/.test(first)) continue;
    // keep lines whose first token is a bare identifier followed by a type
    cols.push(first);
  }
  return cols;
}

describe('link_parcel_abutments — static', () => {
  it('PA-1 shell', () => {
    const src = readText(SHELL);
    expect(fs.existsSync(abs(DESC)), `${DESC} should exist`).toBe(true);
    // The shell requires './lib/pipeline', which Node resolves to scripts/lib/pipeline.js —
    // there is no extension-less file and no directory of that name, so the file is asserted
    // where it actually lives and the require TEXT is asserted on the shell source.
    expect(fs.existsSync(abs('scripts/lib/pipeline.js')), 'scripts/lib/pipeline.js should exist').toBe(true);
    expect(fs.existsSync(abs(COMPUTE)), `${COMPUTE} should exist`).toBe(true);
    expect(src).toContain("require('./lib/pipeline')");
    expect(src).toContain("require('./link-parcel-abutments.descriptor.json')");
    expect(src).toContain("require('./lib/compute/link-parcel-abutments')");
    expect(src).toContain('const ADVISORY_LOCK_ID = 130;');
    expect(src).toContain('module.exports = pipeline.step(descriptor, compute);');
    expect(src.includes('pipeline.run(')).toBe(false);
  });

  it('PA-2 identity', () => {
    const d = desc() as {
      identity: { name: string; archetype: string; lock: number; spec: string };
      execution: { shape: string };
    };
    expect(d.identity.name).toBe('link_parcel_abutments');
    expect(d.identity.archetype).toBe('LINK');
    expect(d.identity.lock).toBe(130);
    expect(d.identity.spec).toBe('130');
    expect(d.execution.shape).toBe('link');
  });

  it('PA-3 lock registry', () => {
    const locks = readText(LOCKS);
    expect(locks).toMatch(/'scripts\/link-parcel-abutments\.js':\s*130,/);
    const all = locks.match(/:\s*130,/g) ?? [];
    expect(all.length).toBe(1);
  });

  it('PA-4 write', () => {
    const d = desc() as {
      outputs: {
        writes: Array<{
          table: string;
          key: string[];
          retract: string;
          retract_when: string;
          write_discipline: {
            class: string;
            guard: string;
            guard_columns: string[];
          };
          columns: Array<string | { name: string; source?: string }>;
        }>;
      };
    };
    const writes = d.outputs.writes;
    expect(Array.isArray(writes)).toBe(true);
    expect(writes.length).toBe(1);
    const w = writes[0];
    expect(w).toBeDefined();
    if (!w) throw new Error('expected a write entry');
    expect(w.table).toBe('parcel_abutments');
    expect(w.key).toEqual(['parcel_id', 'neighbour_id']);
    expect(w.write_discipline.class).toBe('guarded_upsert');
    expect(w.write_discipline.guard).toBe('is_distinct_from');
    // H6 port (PROVISIONAL, Q-B3): full_rescan refuses a retract "all" target (resolveLinkGate).
    expect(w.retract).toBe('none');
    expect(w.retract_when).toBeUndefined();

    const colName = (c: string | { name: string; source?: string }): string =>
      typeof c === 'string' ? c : c.name;
    const colNames = (w.columns ?? []).map(colName);
    const guardColumns = w.write_discipline.guard_columns;
    const linkedAt = w.columns.find((c) => colName(c) === 'linked_at');
    expect(linkedAt, 'linked_at column').toBeTruthy();
    if (linkedAt && typeof linkedAt !== 'string') {
      expect(linkedAt.source).toBe('run_at');
    } else {
      // if declared as a bare string, the source must still be modelled elsewhere
      expect(typeof linkedAt).toBe('object');
    }
    expect(guardColumns.includes('linked_at')).toBe(false);

    const others = colNames.filter((n) => !w.key.includes(n) && n !== 'linked_at');
    for (const n of others) {
      expect(guardColumns.includes(n), `${n} should be in guard_columns`).toBe(true);
    }
    for (const n of guardColumns) {
      expect(others.includes(n), `${n} in guard_columns should be a non-key column`).toBe(true);
    }
  });

  it('PA-5 columns == migration', () => {
    const d = desc() as {
      outputs: { writes: Array<{ columns: Array<string | { name: string }> }> };
    };
    const colName = (c: string | { name: string }): string =>
      typeof c === 'string' ? c : c.name;
    const write = d.outputs.writes[0];
    expect(write, 'PA-5 write entry').toBeDefined();
    const descriptorCols = write!.columns.map(colName).sort();
    const migCols = migrationColumns().sort();
    expect(migCols.length).toBeGreaterThan(0);
    expect(descriptorCols).toEqual(migCols);
  });

  it('PA-6 recovery', () => {
    const d = desc() as {
      recovery: { interrupted: string };
      override: { force_full: string };
    };
    // full_rescan: no incremental mode to follow a crash, nothing to force.
    expect(d.recovery.interrupted).toBe('none');
    expect(d.override.force_full).toBe('none');
  });

  it('PA-7 gate', () => {
    const d = desc() as {
      staleness: {
        mode_select: string;
        trigger: Array<{ signal: string; table?: string; emit_key: string }>;
      };
      emits: Array<{ key: string }>;
    };
    expect(d.staleness.mode_select).toBe('none');
    const emitKeys = d.emits.map((e) => e.key);

    // Every upstream corpus the pair set reads is watched by an upstream_ledger trigger, and
    // the code version is watched by its own trigger — both kinds must be present for a
    // full_rescan gate to MEASURE them for observation (Spec 130 staleness).
    expect(d.staleness.trigger.some((tr) => tr.signal === 'code_version')).toBe(true);
    for (const table of ['parcels', 'building_footprints', 'toronto_centreline']) {
      const t = d.staleness.trigger.find((tr) => tr.table === table);
      expect(t, `trigger for ${table}`).toBeTruthy();
      expect(t!.signal).toBe('upstream_ledger');
    }
    for (const tr of d.staleness.trigger) {
      expect(emitKeys.includes(tr.emit_key), `${tr.emit_key} should be an emit key`).toBe(true);
    }
  });

  it('PA-8 tunables', () => {
    const d = desc() as {
      config: { logic_variables: Array<{ name: string; default: unknown }> };
    };
    const names = d.config.logic_variables.map((v) => v.name);
    for (const key of Object.keys(CFG)) {
      expect(names).toContain(key);
    }
    const lv = JSON.parse(readText(LV)) as Record<string, { default: unknown }>;
    for (const [key, value] of Object.entries(CFG)) {
      const entry = lv[key];
      expect(entry, `${key} should exist in logic_variables.json`).toBeTruthy();
      expect(entry!.default).toBe(value);
    }
  });

  it('PA-9 checks dispatch', () => {
    const d = desc() as { checks: Array<{ id: string; name: string; severity: string }> };
    const c = compute() as { checks: Record<string, { name: string }> };
    expect(d.checks.map((c2) => c2.id)).toEqual(Object.keys(c.checks));
    for (const chk of d.checks) {
      const entry = c.checks[chk.id];
      expect(entry, `compute checks ${chk.id}`).toBeDefined();
      expect(entry!.name).toBe(chk.id);
    }
    const ids = d.checks.map((c2) => c2.id);
    expect(ids).toContain('asymmetric_pairs');
    expect(ids).toContain('est_status_counts');
    expect(d.checks.find((c2) => c2.id === 'asymmetric_pairs')!.severity).toBe('WARN');
    expect(d.checks.find((c2) => c2.id === 'est_status_counts')!.severity).toBe('INFO');
  });
});

describe('link_parcel_abutments — compute', () => {
  it('PA-10 classifyMatches est_status', () => {
    const c = compute() as {
      classifyMatches: (
        rows: Array<Record<string, unknown>>,
        cfg: typeof CFG,
      ) => {
        parcels: number;
        matches: number;
        rows: Array<Record<string, unknown>>;
      };
    };

    const R = {
      parcel_id: 1,
      neighbour_id: 2,
      shared_len_m: 12.345,
      same_frontage_street: true,
      neighbour_residential: true,
      neighbour_building_id: 9,
      bldg_to_subject_m: 3.456,
      neighbour_street: 'Daisy Ave',
      street_found: true,
      bldg_street_m: 14.2,
      lot_street_m: 7.5,
    };

    const out = c.classifyMatches([R], CFG);
    expect(out).toEqual({
      parcels: 1,
      matches: 1,
      rows: [
        {
          parcel_id: 1,
          neighbour_id: 2,
          shared_len_m: 12.35,
          same_frontage_street: true,
          neighbour_residential: true,
          neighbour_building_id: 9,
          bldg_to_subject_m: 3.46,
          front_setback_est_m: 6.7,
          est_status: 'estimated',
        },
      ],
    });

    const firstRow = out.rows[0];
    expect(firstRow, 'classifyMatches row').toBeDefined();
    const keys = Object.keys(firstRow!).sort();
    expect(keys).toEqual(
      [
        'parcel_id',
        'neighbour_id',
        'shared_len_m',
        'same_frontage_street',
        'neighbour_residential',
        'neighbour_building_id',
        'bldg_to_subject_m',
        'front_setback_est_m',
        'est_status',
      ].sort(),
    );
    expect(keys).not.toContain('bldg_street_m');
    expect(keys).not.toContain('lot_street_m');
    expect(keys).not.toContain('neighbour_street');
    expect(keys).not.toContain('street_found');
    expect(keys).not.toContain('linked_at');

    const one = (patch: Record<string, unknown>): Record<string, unknown> => {
      const row = c.classifyMatches([{ ...R, ...patch }], CFG).rows[0];
      expect(row, 'classifyMatches single row').toBeDefined();
      return row!;
    };

    const noBldg = one({ neighbour_building_id: null });
    expect(noBldg.est_status).toBe('no_building');
    expect(noBldg.front_setback_est_m).toBeNull();
    expect(noBldg.bldg_to_subject_m).toBeNull();

    expect(one({ neighbour_street: null }).est_status).toBe('no_frontage_street');
    expect(one({ street_found: false }).est_status).toBe('street_not_found');

    const neg = one({ bldg_street_m: 6, lot_street_m: 7.5 });
    expect(neg.est_status).toBe('estimate_negative');
    expect(neg.front_setback_est_m).toBeNull();

    const oob = one({ bldg_street_m: 50, lot_street_m: 7.5 });
    expect(oob.est_status).toBe('estimate_out_of_bounds');
    expect(oob.front_setback_est_m).toBeNull();

    for (const st of ['estimated', 'no_building', 'no_frontage_street', 'street_not_found', 'estimate_negative', 'estimate_out_of_bounds']) {
      const patch: Record<string, unknown> =
        st === 'estimated'
          ? {}
          : st === 'no_building'
            ? { neighbour_building_id: null }
            : st === 'no_frontage_street'
              ? { neighbour_street: null }
              : st === 'street_not_found'
                ? { street_found: false }
                : st === 'estimate_negative'
                  ? { bldg_street_m: 6, lot_street_m: 7.5 }
                  : { bldg_street_m: 50, lot_street_m: 7.5 };
      const row = one(patch);
      expect((row.est_status === 'estimated') === (row.front_setback_est_m !== null)).toBe(true);
      expect(STATUSES.includes(row.est_status as string)).toBe(true);
    }

    const twoRows = c.classifyMatches(
      [R, { ...R, neighbour_id: 3 }],
      CFG,
    );
    expect(twoRows.parcels).toBe(1);
    expect(twoRows.matches).toBe(2);
  });

  it('PA-11 buildMatchSql', () => {
    const c = compute() as {
      buildMatchSql: (
        d: Record<string, unknown>,
        cfg: typeof CFG,
        mode: string,
      ) => {
        eligible_count_sql: string;
        eligible_batch_sql: string;
        primary_match_sql: string;
        primary_match_params: unknown[];
        fallback_match_sql: unknown;
        cumulative_sql: string;
        primary_counter: string;
      };
    };

    const m = c.buildMatchSql(desc(), CFG, 'full');
    expect(typeof m.eligible_count_sql).toBe('string');
    expect(m.eligible_batch_sql).toContain('$1');
    expect(m.eligible_batch_sql).toContain('$2');
    expect(m.eligible_batch_sql).toContain('ORDER BY id');
    expect(m.primary_match_sql).toContain('ANY($1::int[])');
    expect(m.primary_match_sql).toContain('ST_DWithin');
    expect(m.primary_match_sql).toContain('ST_Transform(');
    expect(m.primary_match_sql).toContain('2952');
    expect(m.primary_match_sql).toContain('toronto_centreline');
    expect(m.primary_match_sql).toContain('linear_name_full');
    expect(m.primary_match_sql).toContain('parcel_buildings');
    expect(m.primary_match_sql).toContain('is_primary');
    expect(m.primary_match_sql).toContain('UNION');
    expect(m.cumulative_sql).toContain('linked');
    expect(m.cumulative_sql).toContain('total');
    expect(m.cumulative_sql).toContain('asymmetric_pairs');
    expect(m.cumulative_sql).toContain('est_status_counts');
    expect(typeof m.primary_counter).toBe('string');
    expect(m.fallback_match_sql).toBeNull();

    // full_rescan: one eligibility predicate whatever mode string the runner passes.
    const inc = c.buildMatchSql(desc(), CFG, 'incremental');
    expect(inc.eligible_batch_sql).toBe(m.eligible_batch_sql);
    expect(m.eligible_batch_sql).not.toContain('NOT EXISTS');

    // runLinkPhase binds ONLY [ids] to primary_match_sql ($1 in the CTE), so every tunable
    // is interpolated as a NUMBER literal rather than bound — $2..$5 must NOT appear. The
    // four literals below are exactly CFG's four geometry tunables.
    expect(m.primary_match_params).toEqual([]);
    expect(m.primary_match_sql).toContain('ST_Expand(s.geom, 0.00002)');
    expect(m.primary_match_sql).toContain('ST_DWithin(n.geom::geography, s.geom::geography, 0.5)');
    expect(m.primary_match_sql).toContain('>= 1');
    // The frontage-street union CTE is named `g` (the pair-expansion CTE); the street-search
    // pad expands the NEIGHBOUR geometry `g.n_geom`.
    expect(m.primary_match_sql).toContain('ST_Expand(g.n_geom, 0.0008)');
    expect(m.primary_match_sql).not.toContain('$2');
    expect(m.primary_match_sql).not.toContain('$5');

    // A non-finite tunable must be REFUSED by name, never interpolated as `NaN` into shipped SQL.
    expect(() => c.buildMatchSql(desc(), { ...CFG, abut_touch_tolerance_m: NaN }, 'full')).toThrow();
  });

  it('PA-12 asymmetric check', () => {
    const c = compute() as {
      checks: Record<
        string,
        (ctx: Record<string, unknown>) => void
      >;
    };
    // The check is an OBSERVER: it hands its verdict to `ctx.report(id, obs)` and returns
    // nothing, so the helper must capture the obs under the reported key.
    const run = (matched: Record<string, unknown>): Record<string, unknown> => {
      let reported: Record<string, unknown> | undefined;
      const report = (k: string, o: Record<string, unknown>): void => {
        if (k === 'asymmetric_pairs') reported = o;
      };

      const check = c.checks.asymmetric_pairs;
      expect(check, 'asymmetric_pairs check').toBeDefined();
      check!({ matched, report });
      expect(reported, 'asymmetric_pairs must report').toBeDefined();
      return reported!;
    };

    expect(run({ asymmetric_pairs: 0 }).violations).toBe(0);
    expect(run({ asymmetric_pairs: 3 }).violations).toBe(3);
  });
});

describe('link_parcel_abutments — fold 2', () => {
  // identity_name is no longer read (full_rescan has no ledger-keyed incremental predicate).
  const CFG2 = CFG;
  it('PA-F1 (H6 port, R-BZ G1) eligibility never reads the run ledger: every parcel with geometry, every run', () => {
    const c = compute() as {
      buildMatchSql: (
        d: Record<string, unknown>,
        cfg: Record<string, unknown>,
        mode: string,
      ) => { eligible_count_sql: string; eligible_batch_sql: string };
    };
    for (const mode of ['full', 'incremental']) {
      const m = c.buildMatchSql(desc(), CFG, mode);
      for (const sql of [m.eligible_batch_sql, m.eligible_count_sql]) {
        expect(sql).not.toContain('pipeline_runs');
        expect(sql).not.toContain('-infinity');
        expect(sql).toContain('geom IS NOT NULL');
      }
    }
    // identity.name is never a tunable.
    const d = desc() as { config: { logic_variables: Array<{ name: string }> } };
    expect(d.config.logic_variables.map((v) => v.name)).not.toContain('identity_name');
    // The compute holds no descriptor require (R-BZ G12) and no ledger relation text (G1).
    const src = fs.readFileSync(path.join(ROOT, COMPUTE), 'utf8');
    expect(src).not.toMatch(/require\([^)]*descriptor\.json/);
    expect(src).not.toMatch(/FROM pipeline_runs/);
  });

  it('PA-F1b producer edges are declared watermark pins (S1-P, LDG-10), never evaluated', () => {
    const d = desc() as { staleness: { pins: Array<{ step: string; stamp: string; op?: string; equals?: string }> } };
    expect(d.staleness.pins.map((p) => p.step).sort()).toEqual(['enrich_centreline', 'enrich_parcels', 'link_massing']);
    for (const p of d.staleness.pins) {
      expect(p.op).toBeUndefined();
      expect(p.equals).toBeUndefined();
    }
  });

  it('PA-F2 shared length is symmetric, measured once per unordered pair', () => {
    const c = compute() as {
      buildMatchSql: (
        d: Record<string, unknown>,
        cfg: Record<string, unknown>,
        mode: string,
      ) => { primary_match_sql: string };
    };
    const sql = c.buildMatchSql(desc(), CFG2, 'full').primary_match_sql;

    // ONE unordered-pair key for both orientations.
    expect(sql).toContain('LEAST(');
    expect(sql).toContain('GREATEST(');
    expect(sql).toContain('SELECT DISTINCT LEAST(a, b)');
    expect(sql).toContain('GREATEST(a, b)');

    // The measurement is taken on that key, not on a per-orientation subject, and only the
    // lineal part of the boundary/buffer intersection counts (a corner touch is punctual).
    expect(sql).toContain('ST_CollectionExtract(');
    expect(sql).toContain('AS shared_len_m');
    expect(sql).toContain('JOIN parcels lo ON lo.id = u.lo');

    // Buffer inflation is removed: the old form measured `len(∂A ∩ buffer(B, tol))` and a
    // corner touch measured about 2*tol (1.4 m at the default), clearing a 1.0 m minimum.
    expect(sql).toContain('2 * 0.5');
    expect(sql).toContain('GREATEST(0, (');
    expect(sql).not.toContain('ST_Boundary(g.sg)');

    // The threshold is applied ONCE, on the unordered pair, BEFORE the orientations exist —
    // so both orientations always share one length and one keep/drop decision.
    const kept = sql.indexOf('kept AS (');
    const pairs = sql.indexOf('pairs AS (');
    expect(kept).toBeGreaterThan(-1);
    expect(pairs).toBeGreaterThan(kept);
    expect(sql.slice(kept, pairs)).toContain('shared_len_m >= 1');
    expect(sql.indexOf('shared_len_m >= 1')).toBeLessThan(pairs);
    // ... and never again downstream.
    expect(sql.slice(pairs)).not.toContain('shared_len_m >= ');

    // Both orientations are expanded from `kept`, and both carry the SAME length column.
    expect(sql).toContain('SELECT lo AS parcel_id, hi AS neighbour_id, shared_len_m FROM kept');
    expect(sql).toContain('SELECT hi AS parcel_id, lo AS neighbour_id, shared_len_m FROM kept');
  });

  it('PA-F3 classifier tunables are refused by name when non-finite', () => {
    const c = compute() as {
      classifyMatches: (rows: Array<Record<string, unknown>>, cfg: Record<string, unknown>) => unknown;
    };
    const R = {
      parcel_id: 1,
      neighbour_id: 2,
      shared_len_m: 12.3,
      neighbour_street: 'Daisy Ave',
      street_found: true,
      neighbour_building_id: 9,
      bldg_street_m: 14.2,
      lot_street_m: 7.5,
    };
    expect(() => c.classifyMatches([R], { ...CFG, fya_est_max_m: NaN })).toThrow(/fya_est_max_m/);
    expect(() => c.classifyMatches([R], { ...CFG, fya_est_min_m: undefined })).toThrow(/fya_est_min_m/);
    expect(() => c.classifyMatches([R], { ...CFG, fya_est_max_m: 'nope' })).toThrow(/fya_est_max_m/);
    expect(() => c.classifyMatches([R], { ...CFG, fya_est_min_m: Infinity })).toThrow(/fya_est_min_m/);

    // The descriptor bounds the pair, so a bound can never be seeded non-finite through it.
    const d = desc() as { config: { logic_variables: Array<{ name: string; min: number; max: number }> } };
    for (const name of ['fya_est_min_m', 'fya_est_max_m']) {
      const v = d.config.logic_variables.find((x) => x.name === name);
      expect(v, `${name} should be declared`).toBeTruthy();
      expect(Number.isFinite(v!.min)).toBe(true);
      expect(Number.isFinite(v!.max)).toBe(true);
    }
  });

  it('PA-F4 an empty street union is not a found street', () => {
    const c = compute() as {
      buildMatchSql: (
        d: Record<string, unknown>,
        cfg: Record<string, unknown>,
        mode: string,
      ) => { primary_match_sql: string };
    };
    const sql = c.buildMatchSql(desc(), CFG2, 'full').primary_match_sql;

    // ST_Union over zero centreline rows returns an EMPTY geometry, not NULL; a bare
    // `IS NOT NULL` would call that found and then difference against nothing.
    expect(sql).toContain('ST_IsEmpty(st.g)');
    expect(sql).toMatch(/\(st\.g IS NOT NULL AND NOT ST_IsEmpty\(st\.g\)\) AS street_found/);
    // The two distances that read the street agree it is unusable when empty.
    expect(sql).toContain('OR ST_IsEmpty(st.g) THEN NULL');

    // ... and the classifier still refuses an explicitly-missing street.
    const cm = compute() as {
      classifyMatches: (rows: Array<Record<string, unknown>>, cfg: typeof CFG) => { rows: Array<{ est_status: string }> };
    };
    const row = cm.classifyMatches([{
      parcel_id: 1,
      neighbour_id: 2,
      shared_len_m: 12.3,
      neighbour_street: 'Daisy Ave',
      street_found: false,
      neighbour_building_id: 9,
      bldg_street_m: 14.2,
      lot_street_m: 7.5,
    }], CFG).rows[0];
    expect(row, 'classifyMatches row').toBeDefined();
    expect(row!.est_status).toBe('street_not_found');
  });

  it('PA-F5 the asymmetric check fails open on an unmeasured count', () => {
    const c = compute() as {
      checks: Record<
        string,
        (ctx: Record<string, unknown>) => void
      >;
    };
    const run = (matched: Record<string, unknown>): { violations: number; detail: Record<string, unknown> } => {
      let out: { violations: number; detail: Record<string, unknown> } | undefined;
      const report = (_k: string, o: { violations: number; detail: Record<string, unknown> }): void => {
        out = o;
      };
      const check = c.checks.asymmetric_pairs;
      expect(check, 'asymmetric_pairs check').toBeDefined();
      check!({ matched, report });
      expect(out, 'asymmetric_pairs must report').toBeDefined();
      return out!;
    };

    // A count the resolver cannot coerce to a finite number (the runner found no column to
    // coerce) is a VIOLATION, never a clean zero: an unmeasured symmetry invariant must not
    // read green. `undefined`, a non-numeric string, NaN and a bare object all fail the
    // check's `Number(...) -> Number.isFinite` test.
    for (const bad of [undefined, NaN, 'nope', {}]) {
      const r = run({ asymmetric_pairs: bad });
      expect(r.violations).toBe(1);
      expect(r.detail.unmeasured).toBe(true);
      expect(r.detail.asymmetric_pairs).toBeNull();
    }

    // `null` is NOT one of those: the check's resolver is `Number(v)`, and `Number(null)`
    // is the finite 0 — the same measured value the runner produces for a genuine zero row
    // (and for '', '0', false). Pinned here so the coercion is asserted, not assumed.
    expect(run({ asymmetric_pairs: null })).toEqual({ violations: 0, detail: { asymmetric_pairs: 0 } });
    expect(run({ asymmetric_pairs: '0' })).toEqual({ violations: 0, detail: { asymmetric_pairs: 0 } });

    // Measured values still pass through unchanged, including a genuine zero.
    expect(run({ asymmetric_pairs: 0 })).toEqual({ violations: 0, detail: { asymmetric_pairs: 0 } });
    expect(run({ asymmetric_pairs: 3 })).toEqual({ violations: 3, detail: { asymmetric_pairs: 3 } });

    // The descriptor's WARN row is what turns that into `linked_with_warnings`.
    const d = desc() as { checks: Array<{ id: string; severity: string }> };
    expect(d.checks.find((x) => x.id === 'asymmetric_pairs')!.severity).toBe('WARN');
  });

  it('PA-F6 the shared-length minimum excludes point touch', () => {
    const d = desc() as {
      config: { logic_variables: Array<{ name: string; min: number; max: number }> };
    };
    const v = d.config.logic_variables.find((x) => x.name === 'abut_min_shared_len_m');
    expect(v, 'abut_min_shared_len_m should be declared').toBeTruthy();

    // A zero minimum would ADMIT a point touch — the very thing the length test exists to
    // exclude — so the bound is a strictly positive floor.
    expect(v!.min).toBe(0.1);
    expect(v!.min).toBeGreaterThan(0);
    expect(v!.max).toBe(50);
    expect(v!.min).toBeLessThan(v!.max);

    // The interpolated predicate carries the same floor, so the SQL cannot disagree.
    const c = compute() as {
      buildMatchSql: (
        d: Record<string, unknown>,
        cfg: Record<string, unknown>,
        mode: string,
      ) => { primary_match_sql: string };
    };
    const sql = c.buildMatchSql(desc(), { ...CFG2, abut_min_shared_len_m: v!.min }, 'full').primary_match_sql;
    expect(sql).toContain(`shared_len_m >= ${v!.min}`);

    // A separate limitation records the pad/tolerance coupling that no logic_variable bound
    // can see on its own.
    const dl = desc() as {
      limitations: Array<{ what: string; measured: string; check_id: string }>;
    };
    const lim = dl.limitations.find((x) => x.check_id === 'parcels_with_abutments_pct');
    expect(lim, 'parcels_with_abutments_pct limitation should be declared').toBeTruthy();
    expect(lim!.what).toContain('abut_bbox_pad_deg');
    expect(lim!.what).toContain('abut_touch_tolerance_m');
    expect(lim!.measured).toContain('0.00002');
    expect(lim!.measured).toContain('0.5 m');
  });
});

describe('link_parcel_abutments — notes', () => {
  it('PA-13 notes shape', () => {
    const notes = JSON.parse(readText(NOTES)) as Record<string, unknown>;
    const keys = Object.keys(notes);
    // `$comment` is the sidecar's own metadata (Spec 120 §3.4); every other key is a prose
    // SECTION holding an array of entry objects, and the CAP (12) is counted over the
    // entries, not the section names.
    const sections = keys.filter((k) => k !== '$comment');
    expect(sections.length).toBeGreaterThanOrEqual(1);
    let prose = 0;
    for (const k of sections) {
      const v = notes[k];
      expect(Array.isArray(v), `${k} should be an array of prose entries`).toBe(true);
      expect((v as unknown[]).length, `${k} should not be empty`).toBeGreaterThanOrEqual(1);
      for (const entry of v as unknown[]) {
        expect(typeof entry === 'object' && entry !== null, `${k} entries should be objects`).toBe(true);
        // A section entry is a prose object whose lead field carries the text: `what` for
        // most sections, `signal` for `suspicious_if`. At least one must be a non-empty string.
        const e = entry as Record<string, unknown>;
        const lead = [e.what, e.signal].find((s) => typeof s === 'string' && s.length > 0);
        expect(typeof lead, `${k} entry should carry prose text`).toBe('string');
      }
      prose += (v as unknown[]).length;
    }
    expect(prose).toBeGreaterThanOrEqual(1);
    expect(prose).toBeLessThanOrEqual(12);
  });
});

describe('link_parcel_abutments — QA ruling 2026-10-16', () => {
  // .cursor/h6-qa-ruling-2026-10-16.md item 2 (3/3): a share that a collapse would move is not a
  // purely descriptive counter (R-H, Spec 124 §5 Rule 10). Fleet LINK form: link_neighbourhoods
  // link_rate (field_coverage, `pct >= N`, limit_from_config, WARN, retighten_when, reports `value`).
  it('PA-Q2 the abutment share is a WARN floor from config, reported as a value', () => {
    const d = desc() as {
      checks: Array<Record<string, unknown>>;
      config: { logic_variables: Array<{ name: string; min: number; max: number; on_invalid: string }> };
    };
    const chk = d.checks.find((x) => x.id === 'parcels_with_abutments_pct')!;
    expect(chk.severity).toBe('WARN');
    expect(chk.limit).toBe('pct >= 50');
    expect(chk.limit_from_config).toBe('abut_parcels_with_abutments_warn_pct');
    expect(typeof chk.retighten_when).toBe('string');
    const v = d.config.logic_variables.find((x) => x.name === 'abut_parcels_with_abutments_warn_pct');
    expect(v, 'the floor is a declared logic variable').toBeTruthy();
    expect(v!.on_invalid).toBe('fail');
    const lv = JSON.parse(readText(LV)) as Record<string, { default: unknown; min: number; max: number }>;
    expect(lv.abut_parcels_with_abutments_warn_pct?.default).toBe(50);

    const c = compute() as { checks: Record<string, (ctx: Record<string, unknown>) => void> };
    const run = (cumulative: Record<string, unknown>): Record<string, unknown> => {
      let obs: Record<string, unknown> | undefined;
      c.checks.parcels_with_abutments_pct!({
        cumulative,
        report: (k: string, o: Record<string, unknown>) => {
          if (k === 'parcels_with_abutments_pct') obs = o;
        },
      });
      return obs!;
    };
    const o = run({ linked_parcels: 300, parcels_with_centroid: 400 });
    expect(o.value).toBe(75);
    expect(o.violations).toBeUndefined();
    expect(run({ linked_parcels: 0, parcels_with_centroid: 0 }).value).toBe(0);
  });
});
