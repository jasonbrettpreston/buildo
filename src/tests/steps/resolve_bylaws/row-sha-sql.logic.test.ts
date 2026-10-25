// SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §3 (lineage: row_sha, recomputed by SQL every run), §7 I14;
//            docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-IW (sha256)
// Handbook: Spec 132 §core.9 (R-W); operator CHAT-80.QP
//
// Q-I (CHAT-80.QP): the lot row_sha is recomputed by SQL, and each dictionary key is recomputed as the hash of its content. rowShaMismatchSql builds,
// from the same RESULT_COLUMNS the JS hashes, the SQL that renders the canonical text (columns joined by chr(31), NULL empty, array items by chr(30)
// with NULL elements empty, jsonb as ::text, numbers as ::text) and counts rows whose stored identity differs. This file locks the SQL TEXT against
// the JS column lists and value types; the equivalence with a real Postgres rendering (jsonb::text, float8[]::text) is the read-only check queued
// in the lane report and the *.db.test.ts arm.
// RED FIRST: docs/reports/red-evidence/resolve_bylaws/part-e-option4-red.json.

import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .js module surface
const ROOT = path.resolve(__dirname, '../../../../');
const read = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as Json;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mz = (): Json => require(path.join(ROOT, 'scripts/lib/bylaw-materialize.js')) as Json;
const TABLES = { units: 'bylaw_resolution_units', texts: 'bylaw_resolution_texts', lots: 'bylaw_resolution_lots' };
const ORDER = ['units', 'texts', 'lots'];

let rows: Json = {};
beforeAll(() => {
  const INPUT = read('docs/reference/bylaw-layer2-input.json');
  const env = mz().makeEnv({ body: INPUT.body, map: read('scripts/seeds/bylaw/layer2-map.json'), scope: read('scripts/seeds/bylaw/layer2-scope.json'), vocab: read('scripts/seeds/bylaw/vocab.json'), zoneList: ['RD'], versions: { table_version: INPUT.table_version, evaluator_version: INPUT.evaluator_version } });
  const row = { id: 1, parcel_id: '1', zoning_class: 'RD', zoning_zn_string: 'RD (f10.0; a245)', exception_number: null, zoning_overlays: {}, on_policy_road: false, is_corner_lot: false, is_through_lot: false, abuts_laneway: false, frontage_m: 10.5, depth_m: 35.2, lot_size_sqm: 369.6, zoning_is_ambiguous: false, in_sixplex_area: false, is_heritage_designated: false, geom_npoints: 5 };
  rows = mz().materializeBatch([row], env).rows;
});

describe('rowShaMismatchSql: three scalar counts, built from RESULT_COLUMNS', () => {
  it('returns three statements in the order units, texts, lots, each counting its own table', () => {
    const q: string[] = mz().rowShaMismatchSql(TABLES);
    expect(q).toHaveLength(3);
    q.forEach((s, i) => {
      expect(s).toContain(`FROM ${TABLES[ORDER[i] as keyof typeof TABLES]} `);
      expect(s).toMatch(/^SELECT COUNT\(\*\)::int FROM /);
    });
    expect(q[2]).toContain("row_sha IS DISTINCT FROM encode(sha256(convert_to(");
    expect(q[2]).toContain("'UTF8')), 'hex')");
  });

  it('the dictionary statements recompute the key as the first four bytes of the sha256 of the content, as a signed int4 (hash32)', () => {
    const q: string[] = mz().rowShaMismatchSql(TABLES);
    const h = (col: string): string => `('x' || encode(substring(sha256(convert_to(${col}, 'UTF8')) FROM 1 FOR 4), 'hex'))::bit(32)::int`;
    expect(q[0]).toContain(`unit_key IS DISTINCT FROM ${h('unit_id')}`);
    expect(q[1]).toContain(`text_key IS DISTINCT FROM ${h('text')}`);
  });

  it('the lot statement renders every result column exactly once, in RESULT_COLUMNS order, joined by chr(31)', () => {
    const q: string[] = mz().rowShaMismatchSql(TABLES);
    const text = /convert_to\(([\s\S]*), 'UTF8'\)\), 'hex'\)/.exec(q[2] as string)![1] as string;
    const parts = text.split(' || chr(31) || ');
    const cols = mz().RESULT_COLUMNS.lots as string[];
    expect(parts).toHaveLength(cols.length);
    parts.forEach((p, k) => expect(p, `lots.${cols[k]}`).toMatch(new RegExp(`\\b${cols[k]}\\b`)));
  });

  it('a jsonb column is its ::text, an array column array_to_string by chr(30) with NULL elements empty, and no timestamp, version or chain_run_id is read', () => {
    const lot = (mz().rowShaMismatchSql(TABLES) as string[])[2] as string;
    expect(lot).toContain("coalesce(class_results::text, '')");
    for (const c of ['codes', 'numbers', 'reason_ids', 'winner_ids', 'evidence_kinds', 'evidence_ref_ids', 'permitted', 'permitted_text_ids']) expect(lot).toContain(`coalesce(array_to_string(${c}, chr(30), ''), '')`);
    for (const c of ['resolved_at', 'table_version', 'evaluator_version', 'chain_run_id']) expect(lot).not.toContain(c);
  });

  it('the column kinds match the JS values the batch core emits (so the SQL cast renders what canonicalText hashed)', () => {
    const kinds = mz().COLUMN_SQL as Record<string, Record<string, string>>;
    for (const t of ORDER) {
      const cols = mz().RESULT_COLUMNS[t] as string[];
      expect(Object.keys(kinds[t] as Json), t).toEqual(cols);
      for (const r of rows[t] as Json[]) {
        for (const c of cols) {
          const v = r[c];
          const k = (kinds[t] as Json)[c] as string;
          if (v === null || v === undefined) continue;
          if (k === 'jsonb') expect(typeof v === 'object' && !Array.isArray(v), `${t}.${c}`).toBe(true);
          else if (k === 'array') expect(Array.isArray(v), `${t}.${c}`).toBe(true);
          else if (k === 'int') expect(typeof v, `${t}.${c}`).toBe('number');
          else expect(typeof v, `${t}.${c}`).toBe('string');
        }
      }
    }
  });
});
