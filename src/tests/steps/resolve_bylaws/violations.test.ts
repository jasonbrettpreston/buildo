// SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §3, §7 (the step shape, I1-I15, terminals), §8 (born V3), §9 (planned red-first tests);
//            docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-IU, R-IX (one commit ①), R-HB (MATERIALIZER); operator CHAT-80.QP (option 4)
// Handbook: Spec 132 §core.1 (three files), §core.9 (R-W), §core.12 (write discipline), §materializer.1 (R-EH), §x-stages.1 (compute_ported), §x-stages.3 (R-DK)
//
// The per-step suite for resolve_bylaws (Spec 134 §9 "the full step suite violations.test.ts"): the descriptor, shell, compute module,
// migration and seeds locked against each other and against the batch core, so a drift in any one names the file that moved. The cases that
// need Postgres are *.db.test.ts (queued in the lane report); everything here is file-only.
// RED-FIRST evidence (Spec 124 R-BA, gate K) is cited in the assessment report: docs/reports/red-evidence/resolve_bylaws/*.json. The suite is
// committed with the code that turns it green (the accepted precedent), so it is plain `it`, not `it.fails`.

import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped descriptor / module surface
const ROOT = path.resolve(__dirname, '../../../../');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readJson = (rel: string): Json => JSON.parse(read(rel)) as Json;
const req = (rel: string): Json => require(path.join(ROOT, rel)) as Json; // eslint-disable-line @typescript-eslint/no-require-imports
const D = readJson('scripts/resolve-bylaws.descriptor.json');
const SEEDS = readJson('scripts/seeds/logic_variables.json');
const VOCAB = readJson('scripts/seeds/bylaw/vocab.json');
const SCOPE = readJson('scripts/seeds/bylaw/layer2-scope.json');
const MAP = readJson('scripts/seeds/bylaw/layer2-map.json');
const INPUT = readJson('docs/reference/bylaw-layer2-input.json');
const compute = (): Json => req('scripts/lib/compute/resolve-bylaws.js');
const mz = (): Json => req('scripts/lib/bylaw-materialize.js');
const TABLES = ['bylaw_resolution_units', 'bylaw_resolution_texts', 'bylaw_resolution_lots'];
const LINEAGE: Record<string, string[]> = { units: ['chain_run_id', 'resolved_at'], texts: ['chain_run_id', 'resolved_at'], lots: ['row_sha', 'table_version', 'evaluator_version', 'chain_run_id', 'resolved_at'] };

describe('three files and a frozen shell (Spec 132 core.1; Spec 122 §5.1)', () => {
  it('the shell requires the descriptor and the compute and exports pipeline.step; the lock constant equals identity.lock (Spec 47 §A.5)', () => {
    const shell = read('scripts/resolve-bylaws.js');
    expect(shell).toContain("require('./resolve-bylaws.descriptor.json')");
    expect(shell).toContain("require('./lib/compute/resolve-bylaws')");
    expect(shell).toContain('module.exports = pipeline.step(descriptor, compute);');
    expect(shell).toMatch(/const ADVISORY_LOCK_ID = 134;/);
    expect(D.identity.lock).toBe(134);
  });

  it('the manifest names the shell and every written table, the lot link row first (the inspector\'s primary table)', () => {
    const e = readJson('scripts/manifest.json').scripts.resolve_bylaws;
    expect(e.file).toBe('scripts/resolve-bylaws.js');
    expect(e.telemetry_tables[0]).toBe('bylaw_resolution_lots');
    expect([...e.telemetry_tables].sort()).toEqual([...TABLES].sort());
  });

  it('the census, converted.json and the notes sidecar agree on the slug, the archetype and the compute_ported stage (R-DK legacy none lands in commit 2, CHAT-129)', () => {
    const census = readJson('scripts/steps/_schema/step-archetype-census.json').entries.find((x: Json) => x.slug === 'resolve_bylaws');
    expect(census).toMatchObject({ archetype: 'MATERIALIZER', batch: 'pending', file: 'scripts/resolve-bylaws.js' });
    expect(census.owner_specs).toEqual(['docs/specs/01-pipeline/134_resolve_bylaws.md']);
    const pending = readJson('scripts/steps/_schema/converted.json').pending.find((x: Json) => x.file === 'scripts/resolve-bylaws.js');
    expect(pending.stage).toBe('compute_ported');
    expect(D.interpretation.file).toBe('resolve-bylaws.notes.json');
    expect(D.identity.archetype).toBe('MATERIALIZER');
  });
});

describe('Spec 124 R-HB / R-EH: MATERIALIZER, rows form, four write targets in dependency order', () => {
  it('shape materialize, form rows, keyed on parcels.id, batch from config', () => {
    expect(D.execution).toMatchObject({ shape: 'materialize', materialize_form: 'rows', batch_size_from_config: 'resolve_bylaws_batch_size' });
    expect(D.execution.materialize_source).toMatchObject({ table: 'parcels', key: 'id' });
    expect(D.recovery.reset).toMatch(/TRUNCATE/);
    for (const t of TABLES) expect(D.recovery.reset, t).toContain(t);
  });

  it('writes[] = the unit and text dictionaries (guarded upserts), the lots replace-keys retraction, then the lots upsert (R-IU, CHAT-80.QP)', () => {
    const w = D.outputs.writes as Json[];
    expect(w.map((x) => `${x.table}:${x.write_discipline.class}:${x.retract}`)).toEqual([
      'bylaw_resolution_units:guarded_upsert:none', 'bylaw_resolution_texts:guarded_upsert:none', 'bylaw_resolution_lots:link_full_retraction:replace_keys', 'bylaw_resolution_lots:guarded_upsert:none',
    ]);
    expect(D.outputs.write_inventory.statements).toBe(4);
  });

  it('the two dictionaries are read once as role "lookup" (unique on their key, empty is a warning on the first run) so a key collision with a stored row fails loud', () => {
    const lookups = (D.inputs.reads.tables as Json[]).filter((t) => t.role === 'lookup');
    expect(lookups.map((t) => t.table).sort()).toEqual(['bylaw_resolution_texts', 'bylaw_resolution_units']);
    for (const t of lookups) expect(t).toMatchObject({ on_empty: 'warn' });
    expect(lookups.find((t) => t.table === 'bylaw_resolution_units')).toMatchObject({ unique_on: ['unit_key'], columns: ['unit_key', 'unit_id', 'regulation_id', 'layer'] });
    expect(lookups.find((t) => t.table === 'bylaw_resolution_texts')).toMatchObject({ unique_on: ['text_key'], columns: ['text_key', 'text'] });
  });

  it('each upsert\'s guard covers the result columns only: no key, no row_sha, no version, no chain_run_id, no timestamp (Spec 134 §3 write guard)', () => {
    for (const w of (D.outputs.writes as Json[]).filter((x) => x.write_discipline.class === 'guarded_upsert')) {
      const logical = w.table.replace('bylaw_resolution_', '');
      const result: string[] = mz().RESULT_COLUMNS[logical];
      expect(w.write_discipline.guard).toBe('is_distinct_from');
      expect([...w.write_discipline.guard_columns].sort(), w.table).toEqual(result.filter((c) => !w.key.includes(c)).sort());
      const declared = (w.columns as Json[]).map((c) => c.name);
      expect(declared.sort(), w.table).toEqual([...result, ...(LINEAGE[logical] as string[])].sort());
      expect((w.columns as Json[]).find((c) => c.name === 'chain_run_id')!.written, w.table).toBe('db_default');
      expect((w.columns as Json[]).find((c) => c.name === 'resolved_at')!.source, w.table).toBe('run_at');
    }
  });

  it('closed columns carry the layer2-map / scope vocabularies with on_unknown fail, so the descriptor and the migration CHECKs cannot drift', () => {
    const units = (D.outputs.writes as Json[]).find((x) => x.table === 'bylaw_resolution_units');
    expect((units!.columns as Json[]).find((c) => c.name === 'layer')!.vocabulary.values).toEqual(['base', 'overlay', 'exception', 'provincial']);
    const lots = (D.outputs.writes as Json[]).find((x) => x.table === 'bylaw_resolution_lots' && x.write_discipline.class === 'guarded_upsert');
    expect((lots!.columns as Json[]).find((c) => c.name === 'lot_gate')!.vocabulary.values).toEqual(MAP.lot_gate);
  });

  it('every written table declares the RLS bypass precondition and the lot foreign key (R-CT)', () => {
    const req2 = D.guards.requires as Json[];
    for (const t of TABLES) expect(req2.some((r) => r.kind === 'rls_bypass_or_policy' && r.name === t), t).toBe(true);
    expect(req2.some((r) => r.kind === 'fk')).toBe(true);
  });
});

describe('source and batch statements (Spec 124 R-EH (a)): pure, keyset, no clock', () => {
  it('buildSourceSql pages every parcel by id with runner binds only, and reads no clock', () => {
    const q = compute().buildSourceSql(D, {}, {});
    expect(q.batch_binds).toEqual(['last_key', 'batch_size', 'run_at']);
    expect(q.batch_sql).toMatch(/WHERE id > \$1\s+ORDER BY id ASC\s+LIMIT \$2/);
    expect(q.batch_sql).not.toMatch(/\bnow\s*\(|CURRENT_TIMESTAMP|clock_timestamp/i);
    expect(q.count_sql).toMatch(/COUNT\(\*\)/);
    for (const c of (D.inputs.reads.tables as Json[]).find((t) => t.table === 'parcels')!.columns as string[]) if (c !== 'geom') expect(q.batch_sql, c).toContain(c);
  });

  it('buildPostSql is one parseable statement with four parameters, reading only declared tables', async () => {
    const q = compute().buildPostSql(D, { resolve_bylaws_population_zone_classes: VOCAB.zone, resolve_bylaws_class_cap: 8 });
    expect(q.post_params).toHaveLength(4);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const lp = require('libpg-query') as Json;
    await lp.loadModule();
    expect(lp.parseSync(q.post_sql).stmts).toHaveLength(1);
    const reads = new Set<string>([...TABLES, 'parcels']);
    for (const m of q.post_sql.matchAll(/(?:FROM|JOIN)\s+([a-z_]+)(?![\w(])/g)) expect(reads.has(m[1] as string) || ['i', 'generate_series', 'jsonb_object_keys'].includes(m[1] as string), m[1]).toBe(true);
  });

  it('CHAT-127.L2-WIT-1: the #44 witness resolver binds every column of buildPostSql (a set-returning function names its output columns; Spec 132 core.14)', async () => {
    const q = compute().buildPostSql(D, { resolve_bylaws_population_zone_classes: VOCAB.zone, resolve_bylaws_class_cap: 8 });
    const R = req('scripts/lib/sql-witness/resolve.cjs');
    await R.init();
    const r = R.resolveStatement(q.post_sql, readJson('docs/reports/witness/_catalog.json').tables);
    expect(r.error).toBeNull();
    expect(Object.keys(r.reads).sort()).toEqual([...TABLES, 'parcels'].sort());
  });

  it('each of the three identity statements (two dictionary keys, the lot row_sha) parses (Q-I)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const lp = require('libpg-query') as Json;
    await lp.loadModule();
    for (const s of mz().rowShaMismatchSql(Object.fromEntries(['units', 'texts', 'lots'].map((t) => [t, `bylaw_resolution_${t}`])))) expect(lp.parseSync(s).stmts).toHaveLength(1);
  });
});

describe('materializeRows (the compute\'s rows-arm hook) hands the runner the declared targets', () => {
  const config = { resolve_bylaws_population_zone_classes: VOCAB.zone, resolve_bylaws_equivalence_every_nth: 1000000 };
  const parcel = (id: number, o: Json = {}): Json => ({
    id, parcel_id: String(id), zoning_class: 'RD', zoning_zn_string: 'RD (f10.0; a245)', exception_number: null, zoning_overlays: {}, on_policy_road: false, is_corner_lot: false,
    is_through_lot: false, abuts_laneway: false, frontage_m: '10.50', depth_m: '35.20', lot_size_sqm: '369.60', zoning_is_ambiguous: false, in_sixplex_area: false,
    is_heritage_designated: false, geom_npoints: 5, run_day: 20000, ...o,
  });
  let out: Json = {};
  beforeAll(() => { out = compute().materializeRows([parcel(1), parcel(2, { zoning_class: 'CR', zoning_zn_string: 'CR' })], { config, lookups: {} }); });

  it('rows e1, e2, e4 and replace_keys e3 (the targetKey of each writes[] index); the out-of-population parcel is retracted', () => {
    expect(Object.keys(out.rows).sort()).toEqual(['e1', 'e2', 'e4']);
    expect(out.replace_keys).toEqual({ e3: [2] });
    expect(out.rows.e4).toHaveLength(1);
  });

  it('every row key is a declared column of its target (db_default and run_at columns are not supplied), and a numeric-string metric is accepted from pg', () => {
    const w = D.outputs.writes as Json[];
    for (const [ek, idx] of [['e1', 0], ['e2', 1], ['e4', 3]] as Array<[string, number]>) {
      const supplied = (w[idx]!.columns as Json[]).filter((c) => c.written === 'step' && c.source !== 'run_at').map((c) => c.name).sort();
      for (const r of out.rows[ek] as Json[]) expect(Object.keys(r).sort(), ek).toEqual(supplied);
    }
  });

  it('the one jsonb column (lots.class_results) reaches the runner as JSON text, the typed arrays as JS arrays (node-pg sends a JS array as a Postgres array literal), 53 slots wide', () => {
    const l = out.rows.e4[0];
    expect(typeof l.class_results).toBe('string');
    JSON.parse(l.class_results);
    for (const c of ['codes', 'numbers', 'reason_ids', 'winner_ids', 'evidence_kinds', 'evidence_ref_ids']) if (l[c] !== null) { expect(Array.isArray(l[c]), c).toBe(true); expect(l[c], c).toHaveLength(53); }
    expect(l.permitted).toHaveLength(SCOPE.classes.length);
    expect(out.rows.e1.length).toBeGreaterThan(0);
    expect(out.rows.e2.length).toBeGreaterThan(0);
  });

  it('a stored dictionary row under the same key with other content makes the run fail loud (lookups seed the collision check)', () => {
    const probe = compute().materializeRows([parcel(1)], { config, lookups: {} });
    const t = probe.rows.e2[0];
    // a fresh run (new population key) whose lookup holds the same key for other text
    const other = { ...config, resolve_bylaws_population_zone_classes: [...VOCAB.zone].reverse() };
    expect(() => compute().materializeRows([parcel(1)], { config: other, lookups: { bylaw_resolution_units: [], bylaw_resolution_texts: [{ text_key: t.text_key, text: 'not-' + t.text }] } })).toThrow(/collision/);
  });

  it('matched is additive (numbers and objects of numbers) so the runner can sum it across batches (R-EH (c))', () => {
    const ok = (v: unknown): boolean => typeof v === 'number' || (v !== null && typeof v === 'object' && !Array.isArray(v) && Object.values(v as Json).every((x) => typeof x === 'number'));
    for (const [k, v] of Object.entries(out.matched)) expect(ok(v), k).toBe(true);
  });
});

describe('checks: the descriptor, the compute dispatch table and the config agree (Spec 122 §5.5 (1), G7)', () => {
  it('compute.checks keys are exactly the descriptor check ids, in declaration order', () => {
    expect(Object.keys(compute().checks)).toEqual((D.checks as Json[]).map((c) => c.id));
  });

  it('every limit_from_config names a declared config variable, and every declared variable has a seed and a migration row', () => {
    const declared = new Set((D.config.logic_variables as Json[]).map((v) => v.name));
    for (const c of D.checks as Json[]) for (const k of ['limit_from_config', 'warn_limit_from_config']) if (c[k]) expect(declared.has(c[k]), `${c.id}.${k}`).toBe(true);
    expect(D.execution.batch_size_from_config).toSatisfy((n: string) => declared.has(n));
    const mig = read('migrations/282_resolve_bylaws.sql');
    for (const n of declared) { expect(SEEDS[n], n).toBeTruthy(); expect(mig, n).toContain(`'${n}'`); }
  });

  it('Q-J: the population is one list variable whose closed list_of is vocab.json zone, on_invalid fail', () => {
    const v = (D.config.logic_variables as Json[]).find((x) => x.name === 'resolve_bylaws_population_zone_classes');
    expect(v).toMatchObject({ min: 'none', max: 'none', on_invalid: 'fail' });
    expect(v!.list_of).toEqual(VOCAB.zone);
    expect(SEEDS.resolve_bylaws_population_zone_classes).toMatchObject({ type: 'list', default: VOCAB.zone });
  });

  it('through the compute dispatch every check reports exactly once, a violations check a count and a bound check a value', async () => {
    const reports: Record<string, Json> = {};
    const m = { ...compute().finalizeMatched({ lots: 3, lots_retracted: 1, lots_gated: 1, inputs_defaulted: 0, scenario_axis_results: 2, equivalence_checked: 5, equivalence_disagreements: 0, order_disagreements: 0, gated_by_gate: { exception_not_authored: 1 }, results_by_status: { applies: 6, not_evaluated: 4 }, not_evaluated_by_reason: { conflict: 0, no_candidate: 4 }, winner_layers: { base: 6 } },
      { config: { resolve_bylaws_storage_budget_mb: 1300 }, post: { lots_total: 3, population_total: 3, lots_outside_population: 0, storage_bytes: 1048576 * 100, row_sha_mismatches_0: 0, row_sha_mismatches_1: 0, row_sha_mismatches_2: 0 }, count: { parcels_scanned: 4 } }) };
    const ctx = { checks: (D.checks as Json[]).map((c) => c.id), descriptor: D, matched: m, config: {}, report: (id: string, v: Json) => { expect(reports[id], id).toBeUndefined(); reports[id] = v; }, log: { error: () => undefined } };
    const res = await compute().compute(ctx);
    expect(Object.keys(reports)).toEqual(ctx.checks);
    for (const c of D.checks as Json[]) {
      const isViol = /^viol /.test(c.limit);
      expect(isViol ? 'violations' in reports[c.id]! : 'value' in reports[c.id]!, c.id).toBe(true);
      expect(reports[c.id]!.error, c.id).toBeUndefined();
    }
    expect(res.records_meta).toBeTruthy();
    expect(m.not_evaluated_share_pct).toBe(40);
    expect(m.storage_mb).toBe(100);
    expect(m.link_row_violations).toBe(0);
  });

  it('a check that throws is reported as an error row, not swallowed (on_check_error fail_step)', async () => {
    const seen: Json[] = [];
    await compute().compute({ checks: ['link_row_violations'], descriptor: D, matched: {}, config: {}, report: (id: string, v: Json) => seen.push({ id, ...v }), log: { error: () => undefined } }).catch(() => undefined);
    expect(seen).toHaveLength(1);
  });

  it('the checks that read the once-per-run post statement declare the tables they read (#44 (a), checks[].reads)', () => {
    const declared = (id: string): string[] => ((D.checks as Json[]).find((c) => c.id === id)!.reads as Json[]).map((r) => r.table);
    expect(declared('link_row_violations')).toEqual(expect.arrayContaining(['bylaw_resolution_lots', 'parcels']));
    expect(declared('lineage_violations').sort()).toEqual([...TABLES].sort());
    expect(declared('row_sha_mismatches').sort()).toEqual([...TABLES].sort());
    expect(declared('storage_within_budget').sort()).toEqual([...TABLES].sort());
  });
});

describe('Spec 134 §8 born V3: no by-law id, exception number or parcel id literal in the compute (G-EXC-LIT); the structure set is exactly three (§6)', () => {
  it('the compute and its two libraries pass the G-EXC-LIT scan', async () => {
    const lit = await import(path.join(ROOT, 'scripts/analysis/bylaw/exc-lit.mjs')) as Json;
    for (const f of ['scripts/lib/compute/resolve-bylaws.js', 'scripts/lib/bylaw-materialize.js', 'scripts/lib/bylaw-resolution.js', 'scripts/lib/bylaw-lot-row.js']) {
      if (f.startsWith('scripts/lib/compute/')) expect(lit.classify(f).mode, `${f} is in the blocking scope`).toBe('blocking');
      expect(lit.scanSource(f, read(f)), f).toEqual([]);
    }
  });

  it('structures are exactly principal, garden_suite, laneway_suite and the classes are the five P5.1 classes', () => {
    expect(SCOPE.structures).toEqual(['principal', 'garden_suite', 'laneway_suite']);
    expect(SCOPE.classes).toHaveLength(5);
    expect(INPUT.table_version).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('CHAT-118.Q-114b: the R3 bracket bypasses the ledger gate through the declared force_full env only (Spec 132 §x-captures.1-.2; CHAT-89)', () => {
  it('override.force_full names RESOLVE_BYLAWS_FORCE_FULL and the runner reads it; force_run and dry_run stay none', () => {
    const st = req('scripts/lib/step/staleness.js');
    expect(D.override.force_full).toBe('RESOLVE_BYLAWS_FORCE_FULL');
    expect(D.override.force_run).toBe('none');
    expect(D.override.dry_run).toBe('none');
    expect(st.resolveOverrides(D, { RESOLVE_BYLAWS_FORCE_FULL: '1' }, []).force_full).toBe(true);
    expect(st.resolveOverrides(D, {}, []).force_full).toBe(false);
  });
});
