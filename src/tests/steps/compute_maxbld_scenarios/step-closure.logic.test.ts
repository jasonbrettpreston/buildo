// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-72, M-377 (MB-31 Layer 3 step; plan sections 5, 7)
//
// MB-31 · E31-01 oracle-only brief B0e (part 1 of 2). RED FIRST: `scripts/lib/compute/compute-maxbld-scenarios.js`
// does not exist yet.
//   R-KF closed dependency graph: walking `require`/`import` from the step entry reaches exactly the nine
//        Layer 3 files and only the `crypto`/`node:crypto` bare specifiers; nothing reached (bar the two existing
//        Layer 2 files) touches env, clock or fs/pg/child_process.
//   R-KT declared reads: every table named after FROM/JOIN in READ_SQL is declared in the descriptor and the
//        declared read list is exactly the eight tables (the option view since MB-27 R2, operator "a" on Q-R2A); the descriptor pins columns, steps, name, lock 135.
// Every file is read as TEXT and never executed.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON surface
const ROOT = process.cwd();
const ENTRY = 'scripts/lib/compute/compute-maxbld-scenarios.js';
const SHELL = 'scripts/compute-maxbld-scenarios.js';
const DESCRIPTOR = 'scripts/compute-maxbld-scenarios.descriptor.json';

// MB-27 R2 (operator "Q-r2 a"; "a" on Q-R2A): the reader calls Layer 2's own withNotAbove (bylaw-materialize.js), so the walk reaches
// that file and its Layer 2 dependencies; each is checked free of env, clock and io like the Layer 3 files.
const EXPECTED_LOCAL = [
  'scripts/analysis/bylaw/cell-cache.mjs',
  'scripts/analysis/bylaw/dsl.mjs',
  'scripts/analysis/bylaw/evaluate-l3.mjs',
  'scripts/analysis/bylaw/evaluate.mjs',
  'scripts/lib/bylaw-lot-row.js',
  'scripts/lib/bylaw-materialize.js',
  'scripts/lib/bylaw-resolution.js',
  'scripts/lib/compute/compute-maxbld-scenarios.js',
  'scripts/lib/compute/maxbld/catalogue.js',
  'scripts/lib/compute/maxbld/disclosure-families.json', // MB-27 D-8 (R3-02 dated note 2026-11-06): the closed disclosure-family map (data)
  'scripts/lib/compute/maxbld/disclosures.js', // MB-27 D-8: the pure disclosure-to-word carriage
  'scripts/lib/compute/maxbld/layer2-cells.js',
  'scripts/lib/compute/maxbld/neighbour-facts.js',
  'scripts/lib/compute/maxbld/rows.js',
  'scripts/seeds/bylaw/cell-key-whole.json', // read by cell-cache.mjs (MB-27 R2)
  'scripts/seeds/bylaw/layer3-catalogue.json', // the Layer 3 words (lexicon) that dsl.mjs reads; MB-31 operator answer 2026-11-02 (eight files became nine)
];
const ALLOWED_BARE = ['crypto', 'node:crypto'];
const LAYER2_EXISTING = ['scripts/analysis/bylaw/evaluate.mjs', 'scripts/analysis/bylaw/dsl.mjs'];
const EXPECTED_TABLES = [
  'bylaw_resolution_lot_stamps', // Q-STOR a: the lot stamps read as hex through the view (migration 295)
  'bylaw_resolution_option_results', // MB-27 R2 (operator "a" on Q-R2A): the design-option slots and the threshold (migration 295)
  'bylaw_resolution_results',
  'bylaw_resolution_texts',
  'bylaw_resolution_units',
  'logic_variables',
  'parcel_abutments',
  'parcels',
];
// MB-27 increment 3, DL-21 a (D-8 read wiring, the step-closure ALLOWED assertion): the buildLotVector columns join the parcels read
const PARCEL_COLUMNS = [
  'abuts_laneway',
  'depth_m',
  'exception_number',
  'frontage_m',
  'geom',
  'id',
  'in_sixplex_area',
  'is_corner_lot',
  'is_heritage_designated',
  'is_through_lot',
  'lot_size_sqm',
  'on_policy_road',
  'parcel_id',
  'primary_frontage_street_name',
  'zoning_class',
  'zoning_is_ambiguous',
  'zoning_overlays',
  'zoning_zn_string',
];
const FORBIDDEN_SNIPPETS = [
  'process.env',
  'new Date',
  'Date.now',
  "require('fs')",
  "require('node:fs')",
  "require('pg')",
  "require('child_process')",
  'readFileSync',
];

const abs = (rel: string): string => path.join(ROOT, rel);
const read = (rel: string): string => fs.readFileSync(abs(rel), 'utf8');
const norm = (rel: string): string => rel.split(path.sep).join('/');

interface Graph {
  local: string[];
  bare: string[];
  missing: string[];
}

function specifiersOf(src: string): string[] {
  const out: string[] = [];
  const patterns = [
    /\brequire\s*\(\s*(['"])([^'"]+)\1\s*\)/g,
    /\bfrom\s+(['"])([^'"]+)\1/g,
    /(?:^|[^.\w$])import\s*\(\s*(['"])([^'"]+)\1\s*\)/g,
  ];
  for (const re of patterns) {
    let m = re.exec(src);
    while (m !== null) {
      out.push(m[2] ?? '');
      m = re.exec(src);
    }
  }
  return out;
}

function walk(entry: string): Graph {
  const local = new Set<string>();
  const bare = new Set<string>();
  const missing: string[] = [];
  const queue: string[] = [entry];
  while (queue.length > 0) {
    const rel = norm(queue.shift() as string);
    if (local.has(rel)) continue;
    if (!fs.existsSync(abs(rel))) {
      missing.push(rel);
      continue;
    }
    local.add(rel);
    for (const spec of specifiersOf(read(rel))) {
      if (spec.startsWith('.')) {
        const target = norm(path.normalize(path.join(path.dirname(rel), spec)));
        if (!local.has(target)) queue.push(target);
      } else {
        bare.add(spec);
      }
    }
  }
  return { local: [...local].sort(), bare: [...bare].sort(), missing };
}

function sqlText(): string {
  const req = createRequire(import.meta.url);
  const mod = req(path.join(process.cwd(), ENTRY)) as Json;
  const sql = mod.READ_SQL as Json;
  return Object.keys(sql)
    .sort()
    .map((k) => String(sql[k]))
    .join('\n');
}

function tablesAfterFromJoin(sql: string): string[] {
  const words = new Set<string>();
  const own = new Set(cteNames(sql));
  const re = /\b(?:FROM|JOIN)\s+(?:LATERAL\s+)?(?!LATERAL\b)([A-Za-z_][A-Za-z0-9_]*)(?![A-Za-z0-9_])/gi;
  let m = re.exec(sql);
  while (m !== null) {
    const name = (m[1] ?? '').toLowerCase();
    const isDistinctFrom = /IS\s+(?:NOT\s+)?DISTINCT\s+$/i.test(sql.slice(Math.max(0, m.index - 24), m.index));
    if (name !== '' && !isDistinctFrom && !own.has(name)) words.add(name);
    m = re.exec(sql);
  }
  return [...words].sort();
}

function cteNames(sql: string): string[] {
  const names = new Set<string>();
  const re =
    /(?:WITH(?:\s+RECURSIVE)?|,)\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s*\([^)]*\))?\s+AS\s*(?:MATERIALIZED\s+|NOT\s+MATERIALIZED\s+)?\(/g;
  let m = re.exec(sql);
  while (m !== null) {
    names.add((m[1] ?? '').toLowerCase());
    m = re.exec(sql);
  }
  return [...names];
}

const descriptor = (): Json => JSON.parse(read(DESCRIPTOR));

describe('MB-31 compute closure, R-KF / R-KT', () => {
  it('walks from the step entry to exactly the eleven Layer 3 files (MB-27 D-8: the disclosure carriage) and the five Layer 2 files of withNotAbove (MB-27 R2)', () => {
    const graph = walk(ENTRY);
    expect(graph.missing).toEqual([]);
    expect(graph.local).toEqual(EXPECTED_LOCAL);
    expect(graph.bare.every((s) => ALLOWED_BARE.includes(s))).toBe(true);
    expect(graph.bare.length).toBeGreaterThan(0);
  });

  it('keeps the newly reached files free of env, clock and io', () => {
    const graph = walk(ENTRY);
    const fresh = graph.local.filter((f) => !LAYER2_EXISTING.includes(f));
    expect(fresh.length).toBe(EXPECTED_LOCAL.length - LAYER2_EXISTING.length);
    const hits: string[] = [];
    for (const file of fresh) {
      const src = read(file);
      for (const snippet of FORBIDDEN_SNIPPETS) {
        if (src.includes(snippet)) hits.push(`${file}: ${snippet}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('READ_SQL names only tables the descriptor declares', () => {
    const sql = sqlText().toLowerCase();
    const ctes = cteNames(sql);
    const tables = tablesAfterFromJoin(sqlText())
      .map((t) => t.toLowerCase())
      .filter((t) => !ctes.includes(t));
    expect(tables.length).toBeGreaterThan(0);
    const declared = (descriptor().inputs.reads.tables as Json[]).map((t) => String(t.table));
    expect(tables.filter((t) => !declared.includes(t))).toEqual([]);
    expect([...declared].sort()).toEqual(EXPECTED_TABLES);
  });

  it('pins the parcels read columns, steps and externals', () => {
    const d = descriptor();
    const parcels = (d.inputs.reads.tables as Json[]).find((t) => t.table === 'parcels') as Json;
    expect(parcels).toBeTruthy();
    expect([...(parcels.columns as string[])].sort()).toEqual(PARCEL_COLUMNS);
    const steps = (d.inputs.reads.steps as Json[]).map((s) => String(s.step));
    expect(steps).toContain('resolve_bylaws');
    expect(steps).toContain('link_parcel_abutments');
    expect(d.inputs.reads.externals).toEqual([]);
  });

  it('pins the descriptor identity', () => {
    const d = descriptor();
    expect(d.identity.name).toBe('compute_maxbld_scenarios');
    expect(d.identity.archetype).toBe('MATERIALIZER');
    expect(d.identity.lock).toBe(135);
  });

  it('keeps the shell a thin advisory-locked pipeline step', () => {
    const src = read(SHELL);
    expect(src).toContain('const ADVISORY_LOCK_ID = 135;');
    expect(src).toContain('pipeline.step(descriptor, compute)');
    expect(src.split('\n').filter((l) => l.trim() !== '').length).toBeLessThanOrEqual(40);
  });
});
