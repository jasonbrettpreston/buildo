// SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §3 (option and threshold slots; the lot stamps), §6, §7 I4;
//            docs/specs/01-pipeline/69a_mcbylaw_register.md M-465 (the roof-form design option, M-400's first option)
// Handbook: Spec 132 §x-tooling.1 (file-only: the migration is read, parsed and compared with its sources, never applied)
//
// Test C of the MB-27.L2 roof axis (plan-roof-axis v3 §7, v8 §3): migration 295 written once (V8-Q2 a) with the width-61 change, the closed
// storage code shared, both new views, and the Q-STOR a bytea retype of the three lot stamps. Locked both ways against its sources: the base
// pair list against layer2-scope.json (rb.scopePairs), the option slots against rb.optionPairs, the code set against layer2-map.json.
// RED FIRST: run against the base tree (no migration 295, no rb.optionPairs), every case fails.

import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .js module surface
const ROOT = path.resolve(__dirname, '../../../../');
const MIG = 'migrations/295_resolve_bylaws_roof_option.sql';
const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as Json;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rb = (): Json => require(path.join(ROOT, 'scripts/lib/bylaw-resolution.js')) as Json;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const lr = (): Json => require(path.join(ROOT, 'scripts/lib/bylaw-lot-row.js')) as Json;
const SCOPE = readJson('scripts/seeds/bylaw/layer2-scope.json');
const VOCAB = readJson('scripts/seeds/bylaw/vocab.json');
const MAP = readJson('scripts/seeds/bylaw/layer2-map.json');

let sql = '';
let bare = '';
let stmts: Json[] = [];
beforeAll(async () => {
  expect(fs.existsSync(path.join(ROOT, MIG)), `${MIG} exists`).toBe(true);
  sql = fs.readFileSync(path.join(ROOT, MIG), 'utf8');
  bare = sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const q = require('libpg-query') as Json;
  await q.loadModule();
  stmts = q.parseSync(sql).stmts.map((s: Json) => s.stmt);
});
const view = (name: string): string => {
  const m = new RegExp(`CREATE OR REPLACE VIEW ${name} AS([\\s\\S]*?);\\n`).exec(bare);
  expect(m, `${name} is created`).toBeTruthy();
  return (m as RegExpExecArray)[1] as string;
};
const width = (): number => rb().scopePairs(SCOPE).length + rb().optionPairs(SCOPE, VOCAB.design_options).length;

describe('migration 295: a parseable, append-only file (282 and 293 are not edited)', () => {
  it('parses, has UP and DOWN markers, the SPEC LINK and M-465, and names Q-STOR a', () => {
    expect(stmts.length).toBeGreaterThan(10);
    expect(sql).toMatch(/^-- UP$/m);
    expect(sql).toMatch(/^-- DOWN/m);
    expect(sql).toContain('SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md');
    expect(sql).toContain('M-465');
    expect(sql).toContain('Q-STOR a');
  });
  it('moves no data: no TRUNCATE, DELETE, INSERT or UPDATE statement', () => {
    expect(bare).not.toMatch(/\b(TRUNCATE|DELETE\s+FROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET)\b/i);
  });
});

describe('M-465 (1)-(4): width 61, the closed code shared, the base view unchanged in its pairs', () => {
  it('the lot row is 61 wide: the 54 base pairs plus the 7 option slots (a literal anchor, as profiles.logic.test.ts does for 54)', () => {
    expect(rb().scopePairs(SCOPE)).toHaveLength(54);
    expect(width()).toBe(61);
  });
  it('codes: width 61 and closed to the result codes plus storage code shared (layer2-map.json), NOT VALID', () => {
    const m = /bylaw_resolution_lots_codes_closed CHECK \(cardinality\(codes\) = (\d+) AND codes <@ ARRAY\[([0-9, ]+)\]::smallint\[\]\) NOT VALID;/.exec(bare);
    expect(m).toBeTruthy();
    expect(Number((m as RegExpExecArray)[1])).toBe(width());
    const n = (lr().resultCodes(MAP) as string[]).length + (MAP.storage_code as string[]).length;
    expect((m as RegExpExecArray)[2]!.split(',').map(Number)).toEqual(Array.from({ length: n }, (_, i) => i));
    expect(lr().sharedCode(MAP)).toBe(5);
  });
  it('every other array is empty-or-full width 61, NOT VALID', () => {
    const w = /bylaw_resolution_lots_array_width CHECK \(([\s\S]*?)\) NOT VALID;/.exec(bare);
    expect(w).toBeTruthy();
    for (const c of ['numbers', 'reason_ids', 'winner_ids', 'evidence_kinds', 'evidence_ref_ids']) expect((w as RegExpExecArray)[1], c).toContain(`${c} IS NULL OR cardinality(${c}) = ${width()}`);
  });
  it('shared is refused at the base slots 1-54 and at the threshold slot', () => {
    expect(bare).toContain('CHECK (NOT (codes[1:54] @> ARRAY[5]::smallint[]) AND codes[61] <> 5) NOT VALID;');
  });
  it('bylaw_resolution_results keeps its 54 pairs in scope order and returns only 61-wide rows', () => {
    const v = view('bylaw_resolution_results');
    const list = [...v.matchAll(/\((\d+), '([a-z_]+)', '([a-z0-9_]+)'\)/g)].map((m) => ({ i: Number(m[1]), structure: m[2], target: m[3] }));
    expect(list).toEqual(rb().scopePairs(SCOPE).map((p: Json, i: number) => ({ i: i + 1, ...p })));
    expect(v).toContain(`WHERE cardinality(l.codes) = ${width()}`);
  });
  it('bylaw_resolution_option_results names the option slots of rb.optionPairs both ways: position, option (NULL for the threshold), base pair', () => {
    const v = view('bylaw_resolution_option_results');
    const list = [...v.matchAll(/\((\d+), '([a-z_]+)', '([a-z0-9_]+)', (NULL|'[a-z_]+'), (NULL|\d+)\)/g)].map((m) => ({ i: Number(m[1]), structure: m[2], target: m[3], option: m[4] === 'NULL' ? null : m[4]!.slice(1, -1), base: m[5] === 'NULL' ? null : Number(m[5]) }));
    const base = rb().scopePairs(SCOPE).length;
    expect(list).toEqual((rb().optionPairs(SCOPE, VOCAB.design_options) as Json[]).map((p, k) => ({ i: base + k + 1, structure: p.structure, target: p.target, option: p.option, base: p.base_index === null ? null : p.base_index + 1 })));
    expect(list.filter((p) => p.option === null).map((p) => p.target)).toEqual(['pitched_roof_slope_min']); // test C: the threshold row has option NULL
    expect(v).toContain('CASE WHEN s.shared THEN l.codes[p.base_i] ELSE l.codes[p.i] END AS code');
    expect(v).toContain('r.shared AS shared_with_base');
    expect(v).toContain(`WHERE cardinality(l.codes) = ${width()}`);
  });
  it('migration 295 option view lists the detached_house only (RC-1 as written there); the scope lists the houseplex too and migration 297 widens the view (DL-7 a)', () => {
    const m = /CROSS JOIN \(VALUES ((?:\('[a-z_]+'\)(?:, )?)+)\) AS c \(class\)/.exec(view('bylaw_resolution_option_results'));
    expect([...(m as RegExpExecArray)[1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1])).toEqual(['detached_house']);
    expect(SCOPE.options.roof_form.classes).toEqual(['detached_house', 'detached_houseplex']);
  });
});

describe('Q-STOR a: the three lot stamps are stored as bytea(32) and read as hex through bylaw_resolution_lot_stamps', () => {
  const STAMPS = ['row_sha', 'table_version', 'evaluator_version'];
  it('drops the three regex CHECKs of 282 IF EXISTS and retypes the columns with USING decode(x, \'hex\') (values unchanged)', () => {
    for (const c of STAMPS) {
      expect(bare).toContain(`DROP CONSTRAINT IF EXISTS bylaw_resolution_lots_${c}_check;`);
      expect(bare).toContain(`ALTER COLUMN ${c} TYPE bytea USING decode(${c}, 'hex')`);
    }
  });
  it('adds octet_length(x) = 32 CHECKs NOT VALID under the same names', () => {
    for (const c of STAMPS) expect(bare).toContain(`ADD CONSTRAINT bylaw_resolution_lots_${c}_check CHECK (octet_length(${c}) = 32) NOT VALID;`);
  });
  it('the stamps view gives every stamp back as hex, with the lot gate and permitted words Layer 3 reads', () => {
    const v = view('bylaw_resolution_lot_stamps');
    for (const c of STAMPS) expect(v).toContain(`encode(l.${c}, 'hex') AS ${c}`);
    for (const c of ['l.parcel_id', 'l.lot_gate', 'l.permitted', 'l.permitted_text_ids']) expect(v).toContain(c);
  });
  it('the foot names every VALIDATE CONSTRAINT the night runs after the reload (width, codes, shared, three stamps)', () => {
    const foot = sql.slice(sql.indexOf('AFTER THE LAYER 2 RELOAD'));
    for (const c of ['codes_closed', 'array_width', 'shared_option_slots', 'row_sha_check', 'table_version_check', 'evaluator_version_check']) {
      expect(foot).toContain(`ALTER TABLE bylaw_resolution_lots VALIDATE CONSTRAINT bylaw_resolution_lots_${c};`);
    }
  });
  it('282 still carries its regex CHECKs (append-only: no checksum drift)', () => {
    const s282 = fs.readFileSync(path.join(ROOT, 'migrations/282_resolve_bylaws.sql'), 'utf8');
    for (const c of STAMPS) expect(s282).toContain(`CHECK (${c} ~ '^[0-9a-f]{64}$')`);
  });
});

describe('G-STOR v2 (plan v5 section 2, GS-01): the axis night may not run on a tree without a PASS storage record bound to its own versions', () => {
  const REC = 'docs/reports/storage-gates/MB-27L2-G-STOR.json';
  it('the record exists, says PASS, and its projection is at or under the 780 MiB stop (the 0.60 line, held)', () => {
    expect(fs.existsSync(path.join(ROOT, REC)), REC).toBe(true);
    const r = readJson(REC);
    expect(r.verdict).toBe('PASS');
    expect(r.stop_mib).toBe(780);
    expect(r.P_up_mib).toBeLessThanOrEqual(780);
  });
  it('its table_version and evaluator_version equal the tree\'s Layer 1 input (a later Layer 1 or evaluator edit turns this red until G-STOR is re-run)', () => {
    const r = readJson(REC);
    const input = readJson('docs/reference/bylaw-layer2-input.json');
    expect({ tv: r.table_version, ev: r.evaluator_version }).toEqual({ tv: input.table_version, ev: input.evaluator_version });
  });
});
