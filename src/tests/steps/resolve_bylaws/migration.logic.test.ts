// SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §3 (the migration creates the tables empty with indexes and closed-column CHECKs
//            generated from layer2-map.json; DOWN drops them), §6 (storage budget), §7 (logic variables are resolve_bylaws_<name>);
//            docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-IO, R-IP, R-IQ, R-IU, R-CV; operator CHAT-80.QP (option 4)
// Handbook: Spec 132 §core.8 (R-CV: step variables are <slug>_<name>, seeded by migration); Spec 132 §core.12 (R-CT: RLS)
//
// File-only lock of migrations/282_resolve_bylaws.sql (written, NOT applied): parsed with libpg-query, so a syntax error fails here;
// every closed CHECK list equals its layer2-map.json / layer2-scope.json source both ways; the result columns the batch core emits
// are exactly the table columns (plus the lineage columns); the logic variables equal the seed file. The *.db.test.ts arms (one per CHECK,
// run only under npm run test:db on a migrated DB) are queued in the lane report.

import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped parse tree / json
const ROOT = path.resolve(__dirname, '../../../../');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readJson = (rel: string): Json => JSON.parse(read(rel)) as Json;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mz = (): Json => require(path.join(ROOT, 'scripts/lib/bylaw-materialize.js')) as Json;
const MIG = 'migrations/282_resolve_bylaws.sql';
const MAP = readJson('scripts/seeds/bylaw/layer2-map.json');
const SCOPE = readJson('scripts/seeds/bylaw/layer2-scope.json');
const VOCAB = readJson('scripts/seeds/bylaw/vocab.json');
const SEEDS = readJson('scripts/seeds/logic_variables.json');
const TABLES = ['units', 'texts', 'lots'] as const;
const tname = (t: string): string => `bylaw_resolution_${t}`;
const LINEAGE: Record<string, string[]> = { units: ['chain_run_id', 'resolved_at'], texts: ['chain_run_id', 'resolved_at'], lots: ['row_sha', 'table_version', 'evaluator_version', 'chain_run_id', 'resolved_at'] };
const KEYS: Record<string, string> = { units: 'unit_key', texts: 'text_key', lots: 'parcel_id' };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const lr = (): Json => require(path.join(ROOT, 'scripts/lib/bylaw-lot-row.js')) as Json;
const PAIRS = (SCOPE.structures as string[]).flatMap((structure) => (SCOPE.targets[structure] as string[]).map((target) => ({ structure, target })));

let sql = '';
let tree: Json[] = [];
beforeAll(async () => {
  sql = read(MIG);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const q = require('libpg-query') as Json;
  await q.loadModule();
  tree = q.parseSync(sql).stmts.map((s: Json) => s.stmt);
});

const tables = (): Map<string, Json> => new Map(tree.filter((s) => s.CreateStmt).map((s) => [s.CreateStmt.relation.relname as string, s.CreateStmt]));
const cols = (c: Json): string[] => (c.tableElts as Json[]).filter((e) => e.ColumnDef).map((e) => e.ColumnDef.colname as string);
const inList = (col: string): string[] => {
  const m = new RegExp(`\\b${col}\\s+TEXT\\s+(?:NOT NULL\\s+|NULL\\s+)?CHECK \\(${col} IN \\(([^)]*)\\)\\)`).exec(sql);
  expect(m, `${col} has a closed CHECK`).toBeTruthy();
  return [...(m as RegExpExecArray)[1]!.matchAll(/'([^']*)'/g)].map((x) => x[1]!);
};

describe('migration 282 (option 4): the three Layer 2 tables and one view, empty, with a parseable body (written, not applied)', () => {
  it('is migration 282, has UP and DOWN markers and the SPEC LINKs, and cites the operator ruling', () => {
    expect(fs.existsSync(path.join(ROOT, MIG))).toBe(true);
    expect(sql).toMatch(/^-- UP$/m);
    expect(sql).toMatch(/^-- DOWN/m);
    expect(sql).toContain('SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md');
    expect(sql).toContain('CHAT-80.QP');
  });

  it('creates exactly units, texts and lots (no profiles, cells, signatures or sets), dictionaries before the lot table', () => {
    const order = tree.filter((s) => s.CreateStmt).map((s) => s.CreateStmt.relation.relname as string);
    expect(order).toEqual(TABLES.map(tname));
    expect(sql).not.toMatch(/bylaw_resolution_(cells|profiles|signatures|json_sets|disclosure_sets)/);
    const seen = new Set<string>();
    for (const s of tree.filter((x) => x.CreateStmt)) {
      const name = s.CreateStmt.relation.relname as string;
      const refs = [...JSON.stringify(s).matchAll(/"pktable":\{[^}]*"relname":"([^"]+)"/g)].map((m) => m[1]!);
      for (const r of refs) if (r !== 'parcels') expect(seen.has(r), `${name} references ${r} before it is created`).toBe(true);
      seen.add(name);
    }
  });

  it('every table has RLS enabled (no policies, Class B) and a table comment', () => {
    for (const t of TABLES) {
      expect(sql, t).toMatch(new RegExp(`ALTER TABLE ${tname(t)} ENABLE ROW LEVEL SECURITY;`));
      expect(sql, t).toMatch(new RegExp(`COMMENT ON TABLE ${tname(t)} IS`));
    }
  });

  it('DOWN is comments only and names every table, the view and every logic variable (an uncommented DROP would run on migrate)', () => {
    const down = sql.slice(sql.indexOf('-- DOWN'));
    for (const l of down.split('\n').slice(1)) expect(l === '' || l.startsWith('--'), l).toBe(true);
    for (const t of TABLES) expect(down).toContain(`DROP TABLE IF EXISTS ${tname(t)};`);
    expect(down).toContain('DROP VIEW IF EXISTS bylaw_resolution_results;');
    for (const k of Object.keys(SEEDS).filter((x) => x.startsWith('resolve_bylaws_'))) expect(down).toContain(`'${k}'`);
  });

  it('the lot row references parcels(id) with ON DELETE CASCADE (R-IU: a deleted parcel takes its row)', () => {
    expect(sql).toMatch(/parcel_id\s+INTEGER PRIMARY KEY REFERENCES parcels \(id\) ON DELETE CASCADE/);
  });

  it('the view is created once and the lot table is the only one with array columns', () => {
    expect((sql.match(/CREATE OR REPLACE VIEW bylaw_resolution_results/g) || []).length).toBe(1);
    expect(tree.filter((s) => s.ViewStmt)).toHaveLength(1);
  });
});

describe('closed-column CHECKs equal their sources both ways (Spec 134 §3, §4)', () => {
  it('lots.lot_gate = layer2-map lot_gate in its declared order', () => {
    expect(inList('lot_gate')).toEqual(MAP.lot_gate);
  });

  it('units.layer = the evaluator layer ranks', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const E = require(path.join(ROOT, 'scripts/analysis/bylaw/evaluate.mjs')) as Json;
    expect(inList('layer')).toEqual(Object.keys(E.LAYER_RANK));
  });

  it('codes: one slot per scope pair, every element a result code of layer2-map (status x value_kind)', () => {
    const codes = lr().resultCodes(MAP) as string[];
    const m = /cardinality\(codes\) = (\d+) AND codes <@ ARRAY\[([0-9, ]+)\]::smallint\[\]/.exec(sql);
    expect(m).toBeTruthy();
    expect(Number((m as RegExpExecArray)[1])).toBe(PAIRS.length);
    expect((m as RegExpExecArray)[2]!.split(',').map((x) => Number(x))).toEqual(codes.map((_, i) => i));
  });

  it('evidence_kinds index layer2-map evidence_kind, permitted indexes permission_image, with one slot per class', () => {
    const e = /evidence_kinds <@ ARRAY\[([0-9, ]+)\]::smallint\[\]/.exec(sql);
    expect((e as RegExpExecArray)[1]!.split(',').map((x) => Number(x))).toEqual((MAP.evidence_kind as string[]).map((_, i) => i));
    const p = /cardinality\(permitted\) = (\d+) AND permitted <@ ARRAY\[([0-9, ]+)\]::smallint\[\]/.exec(sql);
    expect(Number((p as RegExpExecArray)[1])).toBe(SCOPE.classes.length);
    expect((p as RegExpExecArray)[2]!.split(',').map((x) => Number(x))).toEqual(Object.keys(MAP.permission_image).map((_, i) => i));
  });

  it('every other array is empty-or-full width (one slot per pair)', () => {
    const w = /bylaw_resolution_lots_array_width CHECK \(([\s\S]*?)\),\n/.exec(sql);
    expect(w).toBeTruthy();
    for (const c of ['numbers', 'reason_ids', 'winner_ids', 'evidence_kinds', 'evidence_ref_ids']) expect((w as RegExpExecArray)[1], c).toContain(`${c} IS NULL OR cardinality(${c}) = ${PAIRS.length}`);
  });

  it('I4: a gated lot has only not_evaluated results and no winner (the code is the one of status not_evaluated)', () => {
    const ne = (lr().resultCodes(MAP) as string[]).indexOf('not_evaluated');
    expect(sql).toContain(`CHECK (lot_gate IS NULL OR (codes <@ ARRAY[${ne}]::smallint[] AND winner_ids IS NULL))`);
  });

  it('every hash column of the lot table is a 64-hex string', () => {
    for (const c of ['row_sha', 'table_version', 'evaluator_version']) expect(sql, c).toContain(`CHECK (${c} ~ '^[0-9a-f]{64}$')`);
  });
});

describe('the view names every array position by its target (CHAT-80.QP)', () => {
  const view = (): string => /CREATE OR REPLACE VIEW bylaw_resolution_results AS([\s\S]*?);\n\nALTER TABLE/.exec(sql)![1]!;
  it('its pair list equals layer2-scope.json pairs in scope order, both ways, with 1-based positions', () => {
    const v = view();
    const list = [...v.matchAll(/\((\d+), '([a-z_]+)', '([a-z0-9_]+)'\)/g)].map((m) => ({ i: Number(m[1]), structure: m[2], target: m[3] }));
    expect(list).toEqual(PAIRS.map((p, i) => ({ i: i + 1, ...p })));
  });
  it('its class list equals layer2-scope.json classes in order', () => {
    const m = /CROSS JOIN \(VALUES ((?:\('[a-z_]+'\)(?:, )?)+)\) AS c \(class\)/.exec(view());
    expect(m).toBeTruthy();
    expect([...(m as RegExpExecArray)[1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1])).toEqual(SCOPE.classes);
  });
  it('its status, value_kind and evidence_kind decodes equal layer2-map in code order', () => {
    const v = view();
    const codes = lr().resultCodes(MAP) as string[];
    const decode = (col: string): string[] => [...(new RegExp(`CASE r\\.${col}((?: WHEN \\d+ THEN '[a-z_]+')+) END`).exec(v) as RegExpExecArray)[1]!.matchAll(/WHEN (\d+) THEN '([a-z_]+)'/g)].map((m) => m[2]!);
    expect(decode('code').slice(0, codes.length)).toEqual(codes.map((c) => c.split(':')[0]));
    const kinds = [...(/CASE r\.code((?: WHEN \d+ THEN '[a-z_]+')+) END AS value_kind/.exec(v) as RegExpExecArray)[1]!.matchAll(/THEN '([a-z_]+)'/g)].map((m) => m[1]);
    expect(kinds).toEqual(codes.filter((c) => c.includes(':')).map((c) => c.split(':')[1]));
    expect(decode('ek')).toEqual(MAP.evidence_kind);
  });
  it('it joins both dictionaries and exposes the eight stored fields by name', () => {
    const v = view();
    for (const c of ['status', 'value_kind', 'value', 'reason', 'winner_unit_id', 'winner_layer', 'evidence_kind', 'evidence_ref']) expect(v, c).toMatch(new RegExp(`AS ${c}\\b`));
    expect(v).toContain('LEFT JOIN bylaw_resolution_units u ON u.unit_key = r.wid');
    expect(v).toContain('LEFT JOIN bylaw_resolution_texts tr ON tr.text_key = r.rid');
    expect(v).toContain('LEFT JOIN bylaw_resolution_texts tf ON tf.text_key = r.ref');
  });
});

describe('the columns are the batch core\'s result columns plus the lineage columns (Q-I: SQL can recompute row_sha)', () => {
  it('each table = RESULT_COLUMNS[table] + its lineage columns, with the key first', () => {
    const t = tables();
    for (const name of TABLES) {
      const c = cols(t.get(tname(name)) as Json);
      const result = mz().RESULT_COLUMNS[name] as string[];
      expect([...c].sort(), name).toEqual([...result, ...(LINEAGE[name] as string[])].sort());
      expect(c[0], name).toBe(KEYS[name]);
    }
  });

  it('column types: arrays are typed arrays (int2[], float8[], int4[]), class_results JSONB, dictionary keys INTEGER, so ::text is the canonical rendering', () => {
    for (const col of Object.keys(mz().COLUMN_KINDS.lots as Json)) expect(sql, col).toMatch(new RegExp(`\\b${col}\\s+JSONB`));
    for (const [c, t] of [['codes', 'SMALLINT'], ['numbers', 'DOUBLE PRECISION'], ['reason_ids', 'INTEGER'], ['winner_ids', 'INTEGER'], ['evidence_kinds', 'SMALLINT'], ['evidence_ref_ids', 'INTEGER'], ['permitted', 'SMALLINT'], ['permitted_text_ids', 'INTEGER']] as Array<[string, string]>) {
      expect(sql, c).toMatch(new RegExp(`\\b${c}\\s+${t}\\[\\]`));
    }
    expect(sql).toMatch(/\bunit_key\s+INTEGER PRIMARY KEY/);
    expect(sql).toMatch(/\btext_key\s+INTEGER PRIMARY KEY/);
    expect(sql).not.toMatch(/\bpointers\b|\bBYTEA\b/);
  });

  it('the dictionaries carry no row_sha or version columns (their key is the content hash); the lot table does', () => {
    const t = tables();
    for (const name of ['units', 'texts'] as const) for (const c of ['row_sha', 'table_version', 'evaluator_version']) expect(cols(t.get(tname(name)) as Json), `${name}.${c}`).not.toContain(c);
    for (const c of ['row_sha', 'table_version', 'evaluator_version']) expect(cols(t.get(tname('lots')) as Json)).toContain(c);
  });

  it('chain_run_id is nullable on every table and outside the result columns (Spec 134 §3; Q-L)', () => {
    expect((sql.match(/chain_run_id\s+TEXT NULL/g) || []).length).toBe(TABLES.length);
    for (const name of TABLES) expect(mz().RESULT_COLUMNS[name]).not.toContain('chain_run_id');
  });

  it('the text dictionary has no unique index on the text (a btree entry caps near 2.7 kB; the key is the content hash)', () => {
    const t = tables().get(tname('texts')) as Json;
    const text = (t.tableElts as Json[]).find((e) => e.ColumnDef && e.ColumnDef.colname === 'text');
    expect(JSON.stringify(text)).not.toContain('CONSTR_UNIQUE');
  });
});

describe('the step\'s logic variables (R-CV): seeded here, mirrored in the seed file, bounded', () => {
  const inserted = (): Map<string, number> => {
    const body = /INSERT INTO logic_variables \(variable_key, variable_value, variable_value_json, description\) VALUES\n([\s\S]*?)\nON CONFLICT \(variable_key\) DO NOTHING;/.exec(sql);
    expect(body).toBeTruthy();
    return new Map([...(body as RegExpExecArray)[1]!.matchAll(/\('([a-z0-9_]+)', (-?[0-9.]+),/g)].map((m) => [m[1]!, Number(m[2])]));
  };

  it('every resolve_bylaws_* variable in the seed file is inserted here with the seed default, and nothing else is', () => {
    const seeded = Object.keys(SEEDS).filter((k) => k.startsWith('resolve_bylaws_')).sort();
    expect([...inserted().keys()].sort()).toEqual(seeded);
    for (const [k, v] of inserted()) if (SEEDS[k].type !== 'list') expect(SEEDS[k].default, k).toBe(v);
  });

  it('the insert is idempotent (ON CONFLICT DO NOTHING keeps an operator-set value) and every name follows <slug>_<name>', () => {
    expect(sql).toMatch(/ON CONFLICT \(variable_key\) DO NOTHING;/);
    for (const k of inserted().keys()) expect(k).toMatch(/^resolve_bylaws_[a-z0-9_]+$/);
  });

  it('Q-J: the population is ONE list variable (seed type list): sentinel 0 and the JSON array in variable_value_json, equal to the seed default and inside vocab.json zone', () => {
    const k = 'resolve_bylaws_population_zone_classes';
    expect(SEEDS[k].type).toBe('list');
    expect(SEEDS[k].default).toEqual(VOCAB.zone);
    expect(inserted().get(k)).toBe(0);
    const m = /'resolve_bylaws_population_zone_classes', 0, '(\[[^']*\])'::jsonb/.exec(sql);
    expect(m).toBeTruthy();
    expect(JSON.parse((m as RegExpExecArray)[1] as string)).toEqual(SEEDS[k].default);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(() => (require(path.join(ROOT, 'scripts/lib/bylaw-resolution.js')) as Json).inPopulation(SEEDS[k].default, VOCAB.zone)).not.toThrow();
  });

  it('every seeded default lies inside its own min and max', () => {
    for (const k of [...inserted().keys()].filter((x) => SEEDS[x].type !== 'list')) {
      expect(SEEDS[k].default, k).toBeGreaterThanOrEqual(SEEDS[k].min);
      expect(SEEDS[k].default, k).toBeLessThanOrEqual(SEEDS[k].max);
    }
  });
});
