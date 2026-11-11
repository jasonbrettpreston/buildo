// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-72, M-377 (MB-31 Layer 3 step; plan sections 19.3, 19.7, 20.4)
//
// MB-31 · E31-01 oracle-only brief B0b. TWO contracts, both red-first (modules C5 do not exist yet):
//   B7  the neighbour-facts reader (`scripts/lib/compute/maxbld/neighbour-facts.js`) derives pooling facts from
//       neighbour/street/zone/ring lots; it holds NO threshold, NO level, NO depth and never chooses a fact.
//   B10 the declared reads of `scripts/lib/compute/compute-maxbld-scenarios.js`: read 6 (`ring_edges` since MB-31 (e); was `ring_lots`
//       with a bound depth) compares `primary_frontage_street_name`, and ringLots orders by `shared_len_m DESC`; read 5
//       (`street_pool`, `zone_pool`) excludes every `parcel_abutments` neighbour; every FROM/JOIN names an
//       allowlisted table (or a CTE defined in the same statement), and carries no spliced number literal.
import { describe, expect, it, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CommonJS module surface
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));

const CELL15: Json = { s: 'applies', kind: 'number', value: 15, clause: 'c', reason: null };
const NOT_EVAL_CELL: Json = { s: 'not_evaluated', kind: null, value: null, clause: null, reason: 'no_candidate' };

describe('MB-31 neighbour-facts reader (B7)', () => {
  let NF: Json;
  beforeAll(() => {
    NF = req(path.join(ROOT, 'scripts/lib/compute/maxbld/neighbour-facts.js')) as Json;
  });

  it('ring: distinct ids only, non-null estimates only, mean present only when n > 0', () => {
    expect(NF.neighbourFacts).toBeTypeOf('function');
    const a = NF.neighbourFacts({ ring: [{ id: 1, est: 2.0 }, { id: 2, est: 2.4 }] }, CELL15);
    expect(a.facts.ring_n).toBe(2);
    expect(a.facts.ring_est_mean_m).toBeCloseTo(2.2, 9);

    const dup = NF.neighbourFacts({ ring: [{ id: 1, est: 2 }, { id: 1, est: 9 }] }, CELL15);
    expect(dup.facts.ring_n).toBe(1);
    expect(dup.facts.ring_est_mean_m).toBe(2);

    const nul = NF.neighbourFacts({ ring: [{ id: 1, est: null }, { id: 2, est: 3 }] }, CELL15);
    expect(nul.facts.ring_n).toBe(1);
    expect(nul.facts.ring_est_mean_m).toBe(3);

    const empty = NF.neighbourFacts({ ring: [] }, CELL15);
    expect(empty.facts.ring_n).toBe(0);
    expect('ring_est_mean_m' in empty.facts).toBe(false);

    const reversed = NF.neighbourFacts({ ring: [{ id: 2, est: 2.4 }, { id: 1, est: 2.0 }] }, CELL15);
    expect(reversed.facts).toEqual(a.facts);
  });

  it('street and zone pools: abutters excluded (MB-80 M4), one estimate per lot, median by sorted middle', () => {
    const street = NF.neighbourFacts(
      { street: [{ id: 9, est: 9, abutter: true }, { id: 1, est: 1 }, { id: 2, est: 2 }, { id: 3, est: 3 }] },
      CELL15,
    );
    expect(street.facts.street_n).toBe(3);
    expect(street.facts.street_median_m).toBe(2);

    const even = NF.neighbourFacts({ street: [{ id: 1, est: 1.11 }, { id: 2, est: 1.14 }] }, CELL15);
    expect(even.facts.street_median_m).toBeCloseTo(1.125, 9);

    const dup = NF.neighbourFacts({ street: [{ id: 1, est: 1 }, { id: 1, est: 5 }, { id: 2, est: 3 }] }, CELL15);
    expect(dup.facts.street_n).toBe(2);
    expect(dup.facts.street_median_m).toBe(2);

    const empty = NF.neighbourFacts({ street: [] }, CELL15);
    expect(empty.facts.street_n).toBe(0);
    expect('street_median_m' in empty.facts).toBe(false);

    const zone = NF.neighbourFacts(
      { zone: [{ id: 1, est: 3 }, { id: 2, est: 9 }, { id: 3, est: 5 }, { id: 4, est: 7 }, { id: 5, est: 6 }] },
      CELL15,
    );
    expect(zone.facts.zone_n).toBe(5);
    expect(zone.facts.zone_median_m).toBe(6);
  });

  it('neighbours with the averaging cell: quality gate against the cell value, not a code threshold', () => {
    const n1 = [{ id: 1, est: 4, bldg_m: 3, est_status: 'estimated', same_street: true, residential: true }];
    const one = NF.neighbourFacts({ neighbours: n1 }, CELL15).facts;
    expect(one.nbr_all_n).toBe(1);
    expect(one.nbr_q_n).toBe(1);
    expect(one.nbr_q_bad_n).toBe(0);
    expect(one.nbr_q_est_mean_m).toBe(4);

    const two = NF.neighbourFacts(
      { neighbours: [...n1, { id: 2, est: 9, bldg_m: 20, est_status: 'estimated', same_street: true, residential: true }] },
      CELL15,
    ).facts;
    expect(two.nbr_all_n).toBe(2);
    expect(two.nbr_q_n).toBe(1);

    const nullBldg = NF.neighbourFacts(
      { neighbours: [{ id: 1, est: 4, bldg_m: null, est_status: 'estimated', same_street: true, residential: true }] },
      CELL15,
    ).facts;
    expect(nullBldg.nbr_q_n).toBe(1);

    const bad = NF.neighbourFacts(
      { neighbours: [{ id: 1, est: 4, bldg_m: 3, est_status: 'estimate_negative', same_street: true, residential: true }] },
      CELL15,
    ).facts;
    expect(bad.nbr_q_bad_n).toBe(1);
    expect('nbr_q_est_mean_m' in bad).toBe(false);

    const offStreet = NF.neighbourFacts(
      { neighbours: [{ id: 1, est: 4, bldg_m: 3, est_status: 'estimated', same_street: false, residential: true }] },
      CELL15,
    ).facts;
    expect(offStreet.nbr_all_n ?? 0).toBe(0);
    expect(offStreet.nbr_q_n ?? 0).toBe(0);
  });

  it('a non-applies averaging cell turns the four neighbour facts into one not_evaluated fact + an l2 read', () => {
    const out = NF.neighbourFacts(
      { neighbours: [{ id: 1, est: 4, bldg_m: 3, est_status: 'estimated', same_street: true, residential: true }] },
      NOT_EVAL_CELL,
    );
    expect(out.facts.nbr_all_n).toEqual({ not_evaluated: 'no_candidate' });
    expect(out.facts.nbr_q_n).toEqual({ not_evaluated: 'no_candidate' });
    expect(out.facts.nbr_q_bad_n).toEqual({ not_evaluated: 'no_candidate' });
    expect(out.facts.nbr_q_est_mean_m).toEqual({ not_evaluated: 'no_candidate' });
    expect(out.reads).toHaveLength(1);
    expect(out.reads[0].kind).toBe('l2');
    expect(out.reads[0].id).toBe('averaging_distance_m');
  });

  it('user list, own frontage and building-type units pass straight through', () => {
    const facts = NF.neighbourFacts({ user: [3, 5] }, CELL15).facts;
    expect(facts.user_n).toBe(2);
    expect(facts.user_mean_m).toBe(4);
    const none = NF.neighbourFacts({ user: [] }, CELL15).facts;
    expect(none.user_n).toBe(0);
    expect('user_mean_m' in none).toBe(false);

    const own = NF.neighbourFacts({ own: 7.2 }, CELL15).facts;
    expect(own.own_n).toBe(1);
    expect(own.own_front_m).toBe(7.2);
    expect(NF.neighbourFacts({ own: null }, CELL15).facts.own_n).toBe(0);

    expect(NF.neighbourFacts({ bt_units: 1 }, CELL15).facts.bt_units).toBe(1);
  });

  it('the reader holds no threshold: extra input keys change nothing', () => {
    const ring = [{ id: 1, est: 2 }, { id: 2, est: 4 }];
    const a = NF.neighbourFacts({ ring }, CELL15).facts;
    const b = NF.neighbourFacts({ ring, ring_min_n: 3 }, CELL15).facts;
    expect(b).toEqual(a);
  });

  it('static source: no env, no dsl calls, no level/depth/threshold, no fs/pg', () => {
    const src = fs.readFileSync(path.join(ROOT, 'scripts/lib/compute/maxbld/neighbour-facts.js'), 'utf8');
    for (const bad of ['process.env', 'lv(', 'l2(', 'level', 'depth', 'ring_min_n', "require('fs')", "require('pg')"]) {
      expect(src, `neighbour-facts.js must not contain ${bad}`).not.toContain(bad);
    }
  });
});

describe('MB-31 declared read 6 and read 5 contract (B10)', () => {
  let READ_SQL: Json;
  let BATCH_SQL: string;
  const ALLOWED = new Set([
    'bylaw_resolution_results',
    'bylaw_resolution_lot_stamps', // Q-STOR a: the lot stamps read as hex through the view (migration 295)
    'bylaw_resolution_option_results', // MB-27 R2 (operator "a" on Q-R2A): the design-option slots and the threshold (migration 295)
    'bylaw_resolution_texts',
    'bylaw_resolution_units',
    'parcels',
    'parcel_abutments',
    'logic_variables',
    'parcel_maxbld_population', // MB-31 (e) / MB-35 D-3 a (operator "a yes" 2026-11-11): the cohort part of the population (migration 309)
  ]);
  beforeAll(() => {
    const CM = req(path.join(ROOT, 'scripts/lib/compute/compute-maxbld-scenarios.js')) as Json;
    READ_SQL = CM.READ_SQL;
    const LV = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/logic_variables.json'), 'utf8')) as Json;
    const DESC = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/compute-maxbld-scenarios.descriptor.json'), 'utf8')) as Json;
    const config = Object.fromEntries((DESC.config.logic_variables as Json[]).map((d) => [d.name, LV[d.name].default]));
    BATCH_SQL = CM.buildSourceSql(DESC, config, { mode: 'incremental' }).batch_sql;
  });

  const cteNames = (sql: string): string[] => {
    const names: string[] = [];
    const re =
      /(?:WITH(?:\s+RECURSIVE)?|,)\s*([a-z_][a-z0-9_]*)(?:\s*\([^)]*\))?\s+AS\s*(?:MATERIALIZED\s+|NOT\s+MATERIALIZED\s+)?\(/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) names.push((m[1] as string).toLowerCase());
    return names;
  };
  const tableNames = (sql: string): string[] => {
    const names: string[] = [];
    const own = new Set(cteNames(sql));
    const re = /\b(?:FROM|JOIN)\s+(?:LATERAL\s+)?(?!LATERAL\b)([a-z_][a-z0-9_]*)(?![a-z0-9_])/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) {
      const name = (m[1] ?? '').toLowerCase();
      const isDistinctFrom = /IS\s+(?:NOT\s+)?DISTINCT\s+$/i.test(sql.slice(Math.max(0, m.index - 24), m.index));
      if (name === '' || isDistinctFrom || own.has(name)) continue;
      names.push(name);
    }
    return names;
  };

  // MB-31 (e) (operator "a yes" 2026-11-11, D-2 a; MB-31 plan 21.2 / 22): read 6 returns the street-scoped abutment rows and the compute
  // walks the ring to the configured depth; the frontage-street key and the tie-break are carried (the tie-break now in ringLots).
  it('read 6 (ring_edges): street-scoped abutment rows on the frontage-street key, no depth and no recursion in SQL; the walk sorts shared_len_m DESC then lot id', () => {
    const sql: string = READ_SQL.ring_edges;
    expect(typeof sql).toBe('string');
    expect(READ_SQL.ring_lots).toBeUndefined();
    expect(sql).toContain('primary_frontage_street_name');
    expect(sql).toContain('parcel_abutments');
    expect(sql).not.toContain('same_frontage_street');
    expect(sql).not.toContain('street_name_normalized');
    expect(sql).not.toContain('WITH RECURSIVE');
    expect(sql).not.toMatch(/\$\d/);
    expect(sql).not.toMatch(/\b([2-9]|\d{2,})\b/);
    const CM = req(path.join(ROOT, 'scripts/lib/compute/compute-maxbld-scenarios.js')) as Json;
    const edge = (a: number, b: number, len: number, est: number | null = 1) => ({ parcel_id: a, neighbour_id: b, shared_len_m: len, est });
    // subject 1, start abutter 2; from 2 the candidates 3 (10 m) and 4 (20 m): the longest edge wins; a tie goes to the lowest id
    expect(CM.ringLots(1, [edge(1, 2, 5), edge(2, 1, 5), edge(2, 3, 10), edge(2, 4, 20)], 2)).toEqual([{ id: 4, est: 1 }]);
    expect(CM.ringLots(1, [edge(1, 2, 5), edge(2, 4, 20), edge(2, 3, 20)], 2)).toEqual([{ id: 3, est: 1 }]);
  });

  it('read 5 (street_pool, zone_pool) exclude every parcel_abutments neighbour of the subject', () => {
    for (const key of ['street_pool', 'zone_pool']) {
      const sql: string = READ_SQL[key];
      expect(typeof sql, `${key} is a declared SQL string`).toBe('string');
      expect(sql, `${key} names parcel_abutments`).toContain('parcel_abutments');
      expect(/(NOT\s+EXISTS|NOT\s+IN)/.test(sql), `${key} carries one abutter exclusion wording`).toBe(true);
    }
  });

  it('every READ_SQL statement, and the batch statement that carries them, reads only allowlisted tables or the CTEs of the batch statement', () => {
    const keys = Object.keys(READ_SQL);
    expect(keys.length).toBeGreaterThan(0);
    const batchCtes = cteNames(BATCH_SQL);
    for (const t of tableNames(BATCH_SQL)) expect(ALLOWED.has(t) || batchCtes.includes(t), `batch: table ${t}`).toBe(true);
    for (const key of keys) {
      const sql: string = READ_SQL[key];
      const own = new Set([...cteNames(sql), ...batchCtes]);
      for (const t of tableNames(sql)) {
        expect(ALLOWED.has(t) || own.has(t), `${key}: table ${t} is allowlisted or a CTE of the same statement`).toBe(true);
      }
    }
  });
});
