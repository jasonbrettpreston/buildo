// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6.1 (Phase 1 WITNESS, P1-C4a fixture guard)
// Plan: .cursor/wf2_registry_truth_active_task.md PHASE 1 item 4 + "## Fold 7"; contract .cursor/engine-briefs/p1c4-contract.md
//
// RED-first lock for P1-C4a: the fixture guard (`src/tests/steps/_witness-guard.ts`), the
// catalog (`docs/reports/witness/_catalog.json` + `capture-witness.js#writeCatalog`) and the
// declared ⊆ witnessed half of gate #44. The code under test does not exist yet, so the RED
// tests below fail today — that is intended. Each RED carries a GREEN control proving the same
// assertion shape can pass on a sibling input once the code exists.
//
// Two canaries are locked here:
//   canary 4  — a DECLARED-but-UNWITNESSED column (`FAIL:WITNESS:<slug>:a:unwitnessed:<t>.<c>`)
//   canary 11 — the FIXTURE GUARD on an undeclared column (`FAIL:FIXTURE:<slug>:<suite>:<item>`)

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Loading. Everything is fetched INSIDE the test that needs it (never at module
// scope) so a missing module/export fails that ONE test instead of collapsing the
// whole file into a collection error.
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadGuard(): Promise<any> {
  return await import('./steps/_witness-guard');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadGate(): Promise<any> {
  return await import('../../scripts/analysis/gates/witness.mjs');
}

const witnessCjs = () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(path.join(REPO_ROOT, 'scripts/analysis/capture-witness.js'));

// The guard needs the (real) SQL resolver WASM. A failure here is the RED itself, so
// record it and let the individual tests surface it — never swallow it inside a test.
beforeAll(async () => {
  try {
    const g = await loadGuard();
    await g.initWitnessGuard();
  } catch {
    // surfaced by each test's own loadGuard() call — never swallowed inside a test
  }
});

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------
const SUITE = 'src/tests/sql-witness-fixture.logic.test.ts';

const CATALOG: Record<string, string[]> = {
  parcels: ['a', 'geom', 'id', 'lot_size_sqm', 'zone'],
  pipeline_runs: ['id', 'status'],
};

const DESC = {
  inputs: { reads: { tables: [{ table: 'parcels', columns: ['id', 'geom', 'zone'] }] } },
  outputs: { writes: [{ table: 'parcels', columns: [{ name: 'a' }] }], write_inventory: { statements: 1 } },
  execution: { txn_scope: 'step' },
};

// Minimal fresh trace, byte-for-byte the shape `selfTest()` in witness.mjs fabricates:
// one write statement `w1` writing `parcels.a`, one transaction holding `w1`.
function trace(fp: string, readsCols: string[]): Record<string, unknown> {
  return {
    source_fingerprint: fp,
    statements: [
      {
        fingerprint: 'w1',
        kind: 'write',
        count: 1,
        reads: { parcels: ['id'] },
        writes: { parcels: ['a'] },
        excluded: [],
        error: null,
      },
    ],
    transactions: [{ client: '1:1', write_fingerprints: ['w1'] }],
    autocommit_writes: [],
    touched: { reads: { parcels: readsCols }, writes: { parcels: ['a'] } },
    errors: [],
  };
}

const base = {
  slug: 's',
  descriptor: DESC,
  currentFingerprint: 'fp',
  preTraces: {},
  explainedDiffs: [] as string[],
};

// ===========================================================================
// canary 11 — the fixture guard on an undeclared column
// ===========================================================================
describe('P1-C4a canary 11 — the fixture guard on an undeclared column', () => {
  it('RED: a pending guard throws FAIL:FIXTURE:<slug>:<suite>:a:<table>.<col>', async () => {
    const g = await loadGuard();
    const guard = g.createWitnessGuard({
      slug: 'fixture_step',
      suite: SUITE,
      descriptor: DESC,
      status: 'pending',
      catalog: CATALOG,
    });
    const pool = guard.wrap({ query: async () => ({ rows: [] }) });
    expect(() => pool.query('SELECT id, lot_size_sqm FROM parcels')).toThrow(
      'FAIL:FIXTURE:fixture_step:' + SUITE + ':a:parcels.lot_size_sqm',
    );
  });

  it('GREEN control: a declared-only query resolves and records the read', async () => {
    const g = await loadGuard();
    const guard = g.createWitnessGuard({
      slug: 'fixture_step',
      suite: SUITE,
      descriptor: DESC,
      status: 'pending',
      catalog: CATALOG,
    });
    const pool = guard.wrap({ query: async () => ({ rows: [] }) });
    await expect(pool.query('SELECT id, geom FROM parcels')).resolves.toEqual({ rows: [] });
    expect(guard.record()).toEqual({
      reads: { parcels: ['geom', 'id'] },
      writes: {},
      violations: [],
      errors: [],
    });
  });

  it('converted is report-only: records the violation instead of throwing', async () => {
    const g = await loadGuard();
    const guard = g.createWitnessGuard({
      slug: 'fixture_step',
      suite: SUITE,
      descriptor: DESC,
      status: 'converted',
      catalog: CATALOG,
    });
    const pool = guard.wrap({ query: async () => ({ rows: [] }) });
    await expect(pool.query('SELECT id, lot_size_sqm FROM parcels')).resolves.toEqual({ rows: [] });
    expect(guard.record().violations).toEqual(['a:parcels.lot_size_sqm']);
  });

  it('wraps the client returned by connect() the same way', async () => {
    const g = await loadGuard();
    const guard = g.createWitnessGuard({
      slug: 'fixture_step',
      suite: SUITE,
      descriptor: DESC,
      status: 'pending',
      catalog: CATALOG,
    });
    const pool = guard.wrap({
      query: async () => ({ rows: [] }),
      connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }),
    });
    const c = await pool.connect();
    expect(() => c.query('SELECT lot_size_sqm FROM parcels')).toThrow(/FAIL:FIXTURE/);
  });

  it('wrap is identity: the same handle is returned, extra fields preserved', async () => {
    const g = await loadGuard();
    const guard = g.createWitnessGuard({
      slug: 'fixture_step',
      suite: SUITE,
      descriptor: DESC,
      status: 'pending',
      catalog: CATALOG,
    });
    const h = { query: async () => ({ rows: [] }), sql: ['keep'] };
    expect(guard.wrap(h)).toBe(h);
    expect(h.sql).toEqual(['keep']);
  });

  it('runner-owned tables (pipeline_runs) are not violations', async () => {
    const g = await loadGuard();
    const guard = g.createWitnessGuard({
      slug: 'fixture_step',
      suite: SUITE,
      descriptor: DESC,
      status: 'pending',
      catalog: CATALOG,
    });
    const pool = guard.wrap({ query: async () => ({ rows: [] }) });
    await expect(pool.query('SELECT status FROM pipeline_runs WHERE id = $1', [1])).resolves.toEqual({
      rows: [],
    });
    expect(guard.record().violations).toEqual([]);
  });

  it('a query with no text records the no-text error', async () => {
    const g = await loadGuard();
    const guard = g.createWitnessGuard({
      slug: 'fixture_step',
      suite: SUITE,
      descriptor: DESC,
      status: 'pending',
      catalog: CATALOG,
    });
    const pool = guard.wrap({ query: async () => ({ rows: [] }) });
    await pool.query({} as never);
    expect(guard.record().errors).toEqual(['no-text']);
  });

  it('a QueryStream-shaped argument reads through .cursor.text', async () => {
    const g = await loadGuard();
    const guard = g.createWitnessGuard({
      slug: 'fixture_step',
      suite: SUITE,
      descriptor: DESC,
      status: 'pending',
      catalog: CATALOG,
    });
    const pool = guard.wrap({ query: async () => ({ rows: [] }) });
    await pool.query({ cursor: { text: 'SELECT zone FROM parcels' } } as never);
    expect(guard.record().reads.parcels).toContain('zone');
  });
});

// ===========================================================================
// canary 4 — a declared-but-unwitnessed column
// ===========================================================================
describe('P1-C4a canary 4 — a declared-but-unwitnessed column', () => {
  it('RED: an unwitnessed declared read column yields FAIL:WITNESS:<slug>:a:unwitnessed:...', async () => {
    const gate = await loadGate();
    const out = gate.evaluateWitness({
      ...base,
      status: 'converted',
      postTraces: { std: trace('fp', ['id', 'geom']) },
      fixtureRecords: {},
    });
    expect(out.rows).toContain('FAIL:WITNESS:s:a:unwitnessed:parcels.zone');
    expect(out.hardStop).toBe(false); // converted is report-only
  });

  it('GREEN control: a fixture record witnessing the column yields no a:unwitnessed row', async () => {
    const gate = await loadGate();
    const out = gate.evaluateWitness({
      ...base,
      status: 'converted',
      postTraces: { std: trace('fp', ['id', 'geom']) },
      fixtureRecords: {
        [SUITE]: { reads: { parcels: ['zone'] }, writes: {}, violations: [], errors: [] },
      },
    });
    expect(out.rows.filter((r: string) => r.startsWith('FAIL:WITNESS:s:a:unwitnessed:'))).toEqual([]);
  });

  it('pending hard-stops on the unwitnessed column', async () => {
    const gate = await loadGate();
    const out = gate.evaluateWitness({
      ...base,
      status: 'pending',
      postTraces: { std: trace('fp', ['id', 'geom']) },
      fixtureRecords: {},
    });
    expect(out.hardStop).toBe(true);
  });

  it('not armed without a fresh trace (empty postTraces answers UNWITNESSED)', async () => {
    const gate = await loadGate();
    const out = gate.evaluateWitness({ ...base, status: 'converted', postTraces: {}, fixtureRecords: {} });
    expect(out.rows.filter((r: string) => r.includes('a:unwitnessed'))).toEqual([]);
    expect(out.answer).toBe('UNWITNESSED:s');
  });

  it('not armed on a stale trace alone', async () => {
    const gate = await loadGate();
    const out = gate.evaluateWitness({
      ...base,
      status: 'converted',
      postTraces: { std: trace('old', ['id']) },
      fixtureRecords: {},
    });
    expect(out.rows.filter((r: string) => r.includes('a:unwitnessed'))).toEqual([]);
  });

  it('a whole-table declared read is unwitnessed as <table>.*', async () => {
    const gate = await loadGate();
    const descriptor = {
      ...DESC,
      inputs: {
        reads: {
          tables: [
            { table: 'parcels', columns: ['id', 'geom', 'zone'] },
            { table: 'zones', columns: ['*'] },
          ],
        },
      },
    };
    const out = gate.evaluateWitness({
      ...base,
      descriptor,
      status: 'converted',
      postTraces: { std: trace('fp', ['id', 'geom', 'zone']) },
      fixtureRecords: {},
    });
    expect(out.rows).toContain('FAIL:WITNESS:s:a:unwitnessed:zones.*');
  });
});

// ===========================================================================
// FAIL:FIXTURE rows in gate #44
// ===========================================================================
describe('P1-C4a — FAIL:FIXTURE rows in #44', () => {
  const fixtureRecords = {
    'src/x.test.ts': {
      reads: {},
      writes: {},
      violations: ['a:parcels.lot_size_sqm'],
      errors: ['no-text'],
    },
  };

  it('a fully-witnessed trace still emits FAIL:FIXTURE rows; converted is report-only, pending hard-stops', async () => {
    const gate = await loadGate();
    const common = {
      ...base,
      postTraces: { std: trace('fp', ['id', 'geom', 'zone']) },
      fixtureRecords,
    };
    const converted = gate.evaluateWitness({ ...common, status: 'converted' });
    expect(converted.rows).toContain('FAIL:FIXTURE:s:src/x.test.ts:a:parcels.lot_size_sqm');
    expect(converted.rows).toContain('FAIL:FIXTURE:s:src/x.test.ts:input:no-text');
    expect(converted.hardStop).toBe(false);

    const pending = gate.evaluateWitness({ ...common, status: 'pending' });
    expect(pending.hardStop).toBe(true);
  });

  it('GREEN control: an empty fixture record answers PASS', async () => {
    const gate = await loadGate();
    const out = gate.evaluateWitness({
      ...base,
      status: 'converted',
      postTraces: { std: trace('fp', ['id', 'geom', 'zone']) },
      fixtureRecords: {
        'src/x.test.ts': { reads: {}, writes: {}, violations: [], errors: [] },
      },
    });
    expect(out.answer).toBe('PASS');
  });

  it('FAIL:FIXTURE rows are emitted even when the slug is UNWITNESSED', async () => {
    const gate = await loadGate();
    const out = gate.evaluateWitness({ ...base, status: 'converted', postTraces: {}, fixtureRecords });
    expect(out.rows).toContain('FAIL:FIXTURE:s:src/x.test.ts:a:parcels.lot_size_sqm');
    expect(out.rows).toContain('FAIL:FIXTURE:s:src/x.test.ts:input:no-text');
  });
});

// ===========================================================================
// gate helpers exported
// ===========================================================================
describe('P1-C4a — gate helpers exported', () => {
  it('the five helpers are functions', async () => {
    const gate = await loadGate();
    expect(typeof gate.declaredReads).toBe('function');
    expect(typeof gate.declaredTables).toBe('function');
    expect(typeof gate.declaredWrites).toBe('function');
    expect(typeof gate.undeclaredItems).toBe('function');
    expect(typeof gate.unwitnessedItems).toBe('function');
  });

  it('undeclaredItems reports undeclared columns and undeclared tables', async () => {
    const gate = await loadGate();
    const items = gate.undeclaredItems(DESC, {
      reads: { permits: ['x'], parcels: ['lot_size_sqm', 'id'] },
      writes: {},
    });
    expect(items).toEqual(['a:parcels.lot_size_sqm', 'a:permits.*']);
  });

  it('unwitnessedItems reports declared reads not witnessed', async () => {
    const gate = await loadGate();
    const items = gate.unwitnessedItems(DESC, { reads: { parcels: ['id'] }, writes: { parcels: ['geom'] } });
    expect(items).toEqual(['a:unwitnessed:parcels.zone']);
  });
});

// ===========================================================================
// catalog (_catalog.json)
// ===========================================================================
describe('P1-C4a — catalog (_catalog.json)', () => {
  const CONTRACT_SOURCE =
    "information_schema.columns WHERE table_schema = 'public' (scripts/analysis/capture-witness.js snapshotCatalog)";

  it('CATALOG_REL points at the committed catalog path', () => {
    expect(witnessCjs().CATALOG_REL).toBe('docs/reports/witness/_catalog.json');
  });

  it('writeCatalog writes the canonical shape and returns { catalogPath, tables }', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p1c4-'));
    const tmpFile = path.join(dir, '_catalog.json');
    const out = witnessCjs().writeCatalog({ b: ['y', 'x', 'x'], a: ['z'] }, tmpFile);
    expect(out).toEqual({ catalogPath: tmpFile, tables: 2 });
    const expected =
      JSON.stringify({ catalog_version: 1, source: CONTRACT_SOURCE, tables: { a: ['z'], b: ['x', 'y'] } }, null, 2) +
      '\n';
    expect(fs.readFileSync(tmpFile, 'utf8')).toBe(expected);
  });

  it('capture-step-golden.js calls witness.writeCatalog(', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts/analysis/capture-step-golden.js'), 'utf8');
    expect(src).toContain('witness.writeCatalog(');
  });

  it('the committed catalog is present, canonical and non-empty', () => {
    const catalogPath = path.join(REPO_ROOT, 'docs/reports/witness/_catalog.json');
    expect(fs.existsSync(catalogPath)).toBe(true);
    const text = fs.readFileSync(catalogPath, 'utf8');
    const doc = JSON.parse(text) as { catalog_version: number; tables: Record<string, string[]> };
    expect(doc.catalog_version).toBe(1);
    expect(Object.keys(doc.tables).length).toBeGreaterThan(0);
    // keys sorted, each column array sorted unique
    const canonicalTables: Record<string, string[]> = {};
    for (const table of Object.keys(doc.tables).sort()) {
      canonicalTables[table] = [...new Set(doc.tables[table])].sort();
    }
    const reshaped = JSON.stringify({ ...doc, tables: canonicalTables }, null, 2) + '\n';
    expect(reshaped).toBe(text);
  });

  it('no committed trace touches a column absent from the catalog', () => {
    const catalogPath = path.join(REPO_ROOT, 'docs/reports/witness/_catalog.json');
    const catalog = (JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as { tables: Record<string, string[]> })
      .tables;
    const root = path.join(REPO_ROOT, 'docs/reports/witness');
    const misses: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.name.endsWith('.trace.json')) continue;
        if (!full.includes(`${path.sep}pre${path.sep}`) && !full.includes(`${path.sep}post${path.sep}`)) continue;
        const doc = JSON.parse(fs.readFileSync(full, 'utf8')) as {
          touched?: { reads?: Record<string, string[]>; writes?: Record<string, string[]> };
        };
        const rel = path.relative(REPO_ROOT, full).split(path.sep).join('/');
        for (const kind of ['reads', 'writes'] as const) {
          const touched = (doc.touched && doc.touched[kind]) || {};
          for (const [table, cols] of Object.entries(touched)) {
            const have = new Set(catalog[table] || []);
            for (const col of Array.isArray(cols) ? cols : []) {
              if (!have.has(col)) misses.push(`${rel}:${table}.${col}`);
            }
          }
        }
      }
    };
    walk(root);
    expect(misses).toEqual([]);
  });
});

// ===========================================================================
// suite adoption (Fold 7 rulings 2 and 4)
// ===========================================================================
describe('P1-C4a — suite adoption (Fold 7 rulings 2 and 4)', () => {
  const convertedDoc = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'scripts/steps/_schema/converted.json'), 'utf8'),
  ) as { converted: string[]; pending: Array<{ file: string }> };
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/manifest.json'), 'utf8')) as {
    scripts: Record<string, { file: string }>;
  };
  const slugFor = (file: string): string => {
    const hit = Object.keys(manifest.scripts).find((slug) => manifest.scripts[slug]?.file === file);
    if (!hit) throw new Error(`no manifest slug for ${file}`);
    return hit;
  };

  it('ADOPTION keys equal every converted[] file plus every pending[].file, mapped to slugs', async () => {
    const guard = await loadGuard();
    const expected = [...convertedDoc.converted, ...convertedDoc.pending.map((p) => p.file)]
      .map(slugFor)
      .sort();
    expect(Object.keys(guard.ADOPTION).sort()).toEqual(expected);
  });

  it('ADOPTION class counts are 18 / 4 / 3 (no c4b_pending left)', async () => {
    const guard = await loadGuard();
    const counts: Record<string, number> = {};
    for (const cls of Object.values(guard.ADOPTION) as string[]) {
      counts[cls] = (counts[cls] || 0) + 1;
    }
    expect(counts.guarded).toBe(18);
    expect(counts.zero_statement).toBe(4);
    expect(counts.legacy_oracle_excluded).toBe(3);
    expect(Object.keys(counts).sort()).toEqual(['guarded', 'legacy_oracle_excluded', 'zero_statement']);
  });

  it('each class carries the matching structural marker in src/tests/steps/<slug>/', async () => {
    const guard = await loadGuard();
    const readSuite = (slug: string): string => {
      const dir = path.join(REPO_ROOT, 'src/tests/steps', slug);
      const chunks: string[] = [];
      const walk = (d: string): void => {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
          const full = path.join(d, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (entry.name.endsWith('.ts')) chunks.push(fs.readFileSync(full, 'utf8'));
        }
      };
      walk(dir);
      return chunks.join('\n');
    };
    for (const [slug, cls] of Object.entries(guard.ADOPTION) as Array<[string, string]>) {
      const src = readSuite(slug);
      if (cls === 'guarded') expect(src, `${slug} must contain witnessGuard(`).toContain('witnessGuard(');
      if (cls === 'zero_statement') expect(src, `${slug} must contain "must not touch the pool"`).toContain('must not touch the pool');
      if (cls === 'legacy_oracle_excluded') expect(src, `${slug} must contain legacy-harness`).toContain('legacy-harness');
    }
  });

  it('every guarded slug has a committed fixture record with fixture_version 1 and ≥1 suite', async () => {
    const guard = await loadGuard();
    const guarded = Object.entries(guard.ADOPTION)
      .filter(([, cls]) => cls === 'guarded')
      .map(([slug]) => slug);
    for (const slug of guarded) {
      const recordPath = path.join(REPO_ROOT, 'docs/reports/witness', `${slug}.fixture.json`);
      expect(fs.existsSync(recordPath), `${slug}.fixture.json must exist`).toBe(true);
      const doc = JSON.parse(fs.readFileSync(recordPath, 'utf8')) as {
        fixture_version: number;
        slug: string;
        suites: Record<string, unknown>;
      };
      expect(doc.fixture_version, `${slug} fixture_version`).toBe(1);
      expect(doc.slug, `${slug} slug`).toBe(slug);
      expect(Object.keys(doc.suites).length, `${slug} suites`).toBeGreaterThanOrEqual(1);
    }
  });
});

// ===========================================================================
// step-validate reads fixture records
// ===========================================================================
describe('P1-C4a — step-validate reads fixture records', () => {
  it('step-validate.mjs references .fixture.json and fixtureRecords', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts/analysis/step-validate.mjs'), 'utf8');
    expect(src).toContain('.fixture.json');
    expect(src).toContain('fixtureRecords');
  });
});
