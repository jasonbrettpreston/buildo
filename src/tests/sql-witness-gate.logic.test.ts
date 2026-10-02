// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6.1 (Phase 1 WITNESS, gate #44, slice A)
// Plan: .cursor/wf2_registry_truth_active_task.md PHASE 1 item 3 (slice A subset)
//
// RED-first lock for scripts/analysis/gates/witness.mjs (brief p1c3c-contract.md).
// The gate is created by a sibling brief, so this file is RED today: the module is
// missing. Every RED carries a GREEN control proving the same assertion can pass on a
// sibling input once the module exists.
//
// Contract (exact grammar):
//   evaluateWitness({ slug, descriptor, status, currentFingerprint, postTraces, preTraces, explainedDiffs })
//     -> { answer, rows, hardStop }
//   rows sorted unique; answer = rows.length === 0 ? 'PASS' : rows[0];
//   hardStop = status === 'pending' && rows.some(r => r.startsWith('FAIL:'))

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

type TraceDoc = {
  source_fingerprint?: string | null;
  statements?: Array<Record<string, unknown>>;
  transactions?: Array<{ client: string; write_fingerprints: string[] }>;
  autocommit_writes?: string[];
  touched?: { reads: Record<string, string[]>; writes: Record<string, string[]> };
  errors?: string[];
};

type EvaluateArgs = {
  slug: string;
  descriptor: unknown;
  status: 'pending' | 'converted';
  currentFingerprint: string;
  postTraces: Record<string, TraceDoc>;
  preTraces: Record<string, TraceDoc>;
  explainedDiffs: string[];
};

type GateModule = {
  evaluateWitness: (args: EvaluateArgs) => { answer: string; rows: string[]; hardStop: boolean };
  selfTest: () => { ok: boolean; detail: string };
};

const MODULE_PATH = path.join(process.cwd(), 'scripts/analysis/gates/witness.mjs');

// Loaded lazily inside beforeAll (error re-thrown per test in beforeEach) so a missing
// module turns every test RED (per-test failed assertionResults) instead of failing the
// file with 0 tests.
let G: GateModule;

// A throwing beforeAll SKIPS tests; a throwing beforeEach FAILS each one, which is what
// gate K's red evidence needs (>= 1 failed assertionResults).
let loadError: unknown = null;
beforeAll(async () => {
  try {
    G = (await import(pathToFileURL(MODULE_PATH).href)) as GateModule;
  } catch (err) {
    loadError = err;
  }
});
beforeEach(() => {
  if (loadError) throw loadError;
});

// ---------------------------------------------------------------------------
// Fixture descriptor: reads parcels id+geom; writes parcels columns a,b;
// write_inventory.statements 1; execution.txn_scope 'step'.
// ---------------------------------------------------------------------------
type Descriptor = {
  inputs: { reads: { tables: Array<{ table: string; columns: string[] }> } };
  outputs: {
    writes: Array<{ table: string; columns: Array<{ name: string }> }>;
    write_inventory: { statements: number };
  };
  execution: { txn_scope: string };
};

function makeDescriptor(overrides: {
  reads?: Array<{ table: string; columns: string[] }>;
  writes?: Array<{ table: string; columns: Array<{ name: string }> }>;
  statements?: number;
  txn_scope?: string;
} = {}): Descriptor {
  return {
    inputs: {
      reads: {
        tables: overrides.reads ?? [
          { table: 'parcels', columns: ['id', 'geom'] },
        ],
      },
    },
    outputs: {
      writes:
        overrides.writes ??
        [
          {
            table: 'parcels',
            columns: [{ name: 'a' }, { name: 'b' }],
          },
        ],
      write_inventory: { statements: overrides.statements ?? 1 },
    },
    execution: { txn_scope: overrides.txn_scope ?? 'step' },
  };
}

const FP = 'fp-current';

// Helper producing a trace that PASSES: one write fingerprint inside one transaction
// block, writing exactly the declared columns, reading exactly the declared columns.
function trace(overrides: Partial<TraceDoc> = {}): TraceDoc {
  const base: TraceDoc = {
    source_fingerprint: FP,
    statements: [
      {
        fingerprint: 'w1',
        kind: 'write',
        count: 1,
        reads: { parcels: ['id'] },
        writes: { parcels: ['a', 'b'] },
        excluded: [],
        error: null,
      },
      {
        fingerprint: 'r1',
        kind: 'read',
        count: 1,
        reads: { parcels: ['id', 'geom'] },
        writes: {},
        excluded: [],
        error: null,
      },
    ],
    transactions: [{ client: '1:1', write_fingerprints: ['w1'] }],
    autocommit_writes: [],
    touched: {
      reads: { parcels: ['id', 'geom'] },
      writes: { parcels: ['a', 'b'] },
    },
    errors: [],
  };
  return {
    ...base,
    ...overrides,
  };
}

function run(overrides: Partial<EvaluateArgs> = {}): { answer: string; rows: string[]; hardStop: boolean } {
  return G.evaluateWitness({
    slug: 'sources',
    descriptor: makeDescriptor(),
    status: 'pending',
    currentFingerprint: FP,
    postTraces: { sources: trace() },
    preTraces: {},
    explainedDiffs: [],
    ...overrides,
  });
}

// ===========================================================================
// 1. GREEN baseline
// ===========================================================================
describe('gate #44 — baseline (contract: a fully-declared traced step PASSES)', () => {
  it('RED: answer PASS and hardStop false for the passing fixture', () => {
    const out = run();
    expect(out.answer).toBe('PASS');
    expect(out.hardStop).toBe(false);
    expect(out.rows).toEqual([]);
  });

  it('GREEN control: a converted status with the same passing trace is also PASS/false', () => {
    const out = run({ status: 'converted' });
    expect(out.answer).toBe('PASS');
    expect(out.hardStop).toBe(false);
  });
});

// ===========================================================================
// 2. UNWITNESSED when postTraces empty
// ===========================================================================
describe('gate #44 — no post traces (contract: UNWITNESSED:<slug>, not a FAIL)', () => {
  it('RED: empty postTraces yields rows [UNWITNESSED:sources] and hardStop false', () => {
    const out = run({ postTraces: {} });
    expect(out.answer).toBe('UNWITNESSED:sources');
    expect(out.rows).toEqual(['UNWITNESSED:sources']);
    expect(out.hardStop).toBe(false);
  });

  it('GREEN control: one post trace is witnessed and never UNWITNESSED', () => {
    const out = run();
    expect(out.rows).not.toContain('UNWITNESSED:sources');
  });
});

// ===========================================================================
// 3. FAIL:STALE on fingerprint mismatch
// ===========================================================================
describe('gate #44 — stale fingerprint (contract: FAIL:STALE:<slug>:<invocation>)', () => {
  it('RED: a mismatched source_fingerprint yields FAIL:STALE', () => {
    const out = run({ postTraces: { sources: trace({ source_fingerprint: 'fp-old' }) } });
    expect(out.rows).toContain('FAIL:STALE:sources:sources');
  });

  it('GREEN control: a matching source_fingerprint yields no STALE row', () => {
    const out = run();
    expect(out.rows.filter((r) => r.startsWith('FAIL:STALE:'))).toEqual([]);
  });
});

// ===========================================================================
// 4. (a) undeclared read column / undeclared table
// ===========================================================================
describe('gate #44 (a) — traced subset of declared (contract: FAIL:WITNESS:<slug>:a:...)', () => {
  it('RED: an undeclared read column yields :a:parcels.lot_size_sqm', () => {
    const t = trace();
    t.touched = {
      reads: { parcels: ['id', 'geom', 'lot_size_sqm'] },
      writes: { parcels: ['a', 'b'] },
    };
    const out = run({ postTraces: { sources: t } });
    expect(out.rows).toContain('FAIL:WITNESS:sources:a:parcels.lot_size_sqm');
  });

  it('RED: an undeclared table yields :a:other.* (one row per table)', () => {
    const t = trace();
    t.touched = {
      reads: { parcels: ['id', 'geom'], other: ['x', 'y'] },
      writes: { parcels: ['a', 'b'] },
    };
    const out = run({ postTraces: { sources: t } });
    expect(out.rows).toContain('FAIL:WITNESS:sources:a:other.*');
  });

  it('GREEN control: the declared fixture trace yields no (a) rows', () => {
    const out = run();
    expect(out.rows.filter((r) => r.startsWith('FAIL:WITNESS:sources:a:'))).toEqual([]);
  });
});

// ===========================================================================
// 5. (b) extra written table / declared write column missing
// ===========================================================================
describe('gate #44 (b) — written tables EQUAL declared write tables (contract: FAIL:WITNESS:<slug>:b:...)', () => {
  it('RED: an extra written table yields :b:extra_table', () => {
    const t = trace();
    t.touched = {
      reads: { parcels: ['id', 'geom'] },
      writes: { parcels: ['a', 'b'], extra_table: ['z'] },
    };
    const out = run({ postTraces: { sources: t } });
    expect(out.rows).toContain('FAIL:WITNESS:sources:b:extra_table');
  });

  it('RED: a declared write column missing from the traced writes yields :b:parcels.b', () => {
    const t = trace();
    t.touched = {
      reads: { parcels: ['id', 'geom'] },
      writes: { parcels: ['a'] },
    };
    const out = run({ postTraces: { sources: t } });
    expect(out.rows).toContain('FAIL:WITNESS:sources:b:parcels.b');
  });

  it('GREEN control: the declared fixture trace writes both declared columns and yields no (b) rows', () => {
    const out = run();
    expect(out.rows.filter((r) => r.startsWith('FAIL:WITNESS:sources:b:'))).toEqual([]);
  });
});

// ===========================================================================
// 6. (c) distinct write fingerprints vs declared 1
// ===========================================================================
describe('gate #44 (c) — distinct write fingerprints equal write_inventory.statements', () => {
  it('RED: two distinct write fingerprints vs declared 1 yields :c:statements:1!=2', () => {
    const t = trace({
      statements: [
        {
          fingerprint: 'w1',
          kind: 'write',
          count: 1,
          reads: { parcels: ['id'] },
          writes: { parcels: ['a', 'b'] },
          excluded: [],
          error: null,
        },
        {
          fingerprint: 'w2',
          kind: 'write',
          count: 1,
          reads: { parcels: ['id'] },
          writes: { parcels: ['a', 'b'] },
          excluded: [],
          error: null,
        },
      ],
      transactions: [{ client: '1:1', write_fingerprints: ['w1', 'w2'] }],
    });
    const out = run({ postTraces: { sources: t } });
    expect(out.rows).toContain('FAIL:WITNESS:sources:c:statements:1!=2');
  });

  it('GREEN control: one distinct write fingerprint vs declared 1 yields no (c) row', () => {
    const out = run();
    expect(out.rows.filter((r) => r.startsWith('FAIL:WITNESS:sources:c:'))).toEqual([]);
  });
});

// ===========================================================================
// 7. (d) txn_scope violations
// ===========================================================================
describe('gate #44 (d) — declared txn_scope vs observed (contract: FAIL:WITNESS:<slug>:d:txn_scope:<declared>:<observed>)', () => {
  it('RED: writes in 2 blocks with txn_scope step yields :d:txn_scope:step:batch', () => {
    const t = trace({
      transactions: [
        { client: '1:1', write_fingerprints: ['w1'] },
        { client: '1:2', write_fingerprints: ['w1'] },
      ],
    });
    const out = run({ postTraces: { sources: t } });
    expect(out.rows).toContain('FAIL:WITNESS:sources:d:txn_scope:step:batch');
  });

  it('RED: an autocommit write plus a block yields observed mixed', () => {
    const t = trace({
      autocommit_writes: ['w2'],
    });
    const out = run({ postTraces: { sources: t } });
    expect(out.rows).toContain('FAIL:WITNESS:sources:d:txn_scope:step:mixed');
  });

  it('GREEN control: exactly one block with writes, no autocommit, yields no (d) row', () => {
    const out = run();
    expect(out.rows.filter((r) => r.startsWith('FAIL:WITNESS:sources:d:'))).toEqual([]);
  });
});

// ===========================================================================
// 8. (g) PRE column missing from POST / explained / POST-only extra
// ===========================================================================
describe('gate #44 (g) — one-way PRE → POST (contract: FAIL:WITNESS:<slug>:g:<key>)', () => {
  it('RED: a PRE column missing from POST yields FAIL with the key', () => {
    const pre: TraceDoc = {
      touched: { reads: {}, writes: { parcels: ['a'] } },
      errors: [],
    };
    const post = trace();
    post.touched = {
      reads: { parcels: ['id', 'geom'] },
      writes: { parcels: ['a', 'b'] },
    };
    // pre has writes.parcels.a; post still has it. Drop it from post to force (g).
    post.touched.writes = { parcels: ['b'] };
    const out = run({ preTraces: { sources: pre }, postTraces: { sources: post } });
    expect(out.rows).toContain('FAIL:WITNESS:sources:g:writes.parcels.a');
  });

  it('RED: the same key in explainedDiffs yields PASS for that key', () => {
    const pre: TraceDoc = {
      touched: { reads: {}, writes: { parcels: ['a'] } },
      errors: [],
    };
    const post = trace();
    post.touched = {
      reads: { parcels: ['id', 'geom'] },
      writes: { parcels: ['b'] },
    };
    const out = run({
      preTraces: { sources: pre },
      postTraces: { sources: post },
      explainedDiffs: ['writes.parcels.a'],
    });
    expect(out.rows.filter((r) => r.startsWith('FAIL:WITNESS:sources:g:'))).toEqual([]);
  });

  it('RED: a POST-only extra yields no (g) row', () => {
    const pre: TraceDoc = {
      touched: { reads: {}, writes: { parcels: ['a'] } },
      errors: [],
    };
    const post = trace();
    post.touched = {
      reads: { parcels: ['id', 'geom'] },
      writes: { parcels: ['a', 'b'] },
    };
    const out = run({ preTraces: { sources: pre }, postTraces: { sources: post } });
    expect(out.rows.filter((r) => r.startsWith('FAIL:WITNESS:sources:g:'))).toEqual([]);
  });

  it('GREEN control: identical PRE/POST yield no (g) rows', () => {
    const pre = trace();
    const out = run({ preTraces: { sources: pre }, postTraces: { sources: trace() } });
    expect(out.rows.filter((r) => r.startsWith('FAIL:WITNESS:sources:g:'))).toEqual([]);
  });
});

// ===========================================================================
// 9. canary 1 (massing shape) — DELETE on a table the descriptor never writes
// ===========================================================================
describe('gate #44 canary 1 (massing) — a DELETE on a non-declared table is caught by (b)', () => {
  it('RED: descriptor writes building_footprints but trace deletes parcel_buildings', () => {
    const descriptor = makeDescriptor({
      reads: [{ table: 'building_footprints', columns: ['id', 'geom'] }],
      writes: [
        { table: 'building_footprints', columns: [{ name: 'id' }, { name: 'geom' }] },
      ],
    });
    const t: TraceDoc = {
      source_fingerprint: FP,
      statements: [
        {
          fingerprint: 'd1',
          kind: 'write',
          count: 1,
          reads: { parcel_buildings: ['parcel_id'] },
          writes: { parcel_buildings: [] },
          excluded: [],
          error: null,
        },
      ],
      transactions: [{ client: '1:1', write_fingerprints: ['d1'] }],
      autocommit_writes: [],
      touched: {
        reads: { parcel_buildings: ['parcel_id'] },
        writes: { parcel_buildings: [] },
      },
      errors: [],
    };
    const out = run({ slug: 'massing', descriptor, postTraces: { massing: t } });
    expect(out.rows).toContain('FAIL:WITNESS:massing:b:parcel_buildings');
  });

  it('GREEN control: the same descriptor with only its own table touched yields no :b: row', () => {
    const descriptor = makeDescriptor({
      reads: [{ table: 'building_footprints', columns: ['id', 'geom'] }],
      writes: [
        { table: 'building_footprints', columns: [{ name: 'id' }, { name: 'geom' }] },
      ],
    });
    const t: TraceDoc = {
      source_fingerprint: FP,
      statements: [
        {
          fingerprint: 'w1',
          kind: 'write',
          count: 1,
          reads: { building_footprints: ['id'] },
          writes: { building_footprints: ['id', 'geom'] },
          excluded: [],
          error: null,
        },
      ],
      transactions: [{ client: '1:1', write_fingerprints: ['w1'] }],
      autocommit_writes: [],
      touched: {
        reads: { building_footprints: ['id'] },
        writes: { building_footprints: ['id', 'geom'] },
      },
      errors: [],
    };
    const out = run({ slug: 'massing', descriptor, postTraces: { massing: t } });
    expect(out.rows.filter((r) => r.startsWith('FAIL:WITNESS:massing:b:'))).toEqual([]);
  });
});

// ===========================================================================
// 10. canary 7 PRODUCER — pipeline_runs status filter
// ===========================================================================
describe('gate #44 PRODUCER (canary 7) — pipeline_runs completed-only status filter', () => {
  it('RED: status = completed yields FAIL:PRODUCER:<slug>:sources:load_ravines:status', () => {
    const t = trace();
    t.statements = [
      {
        fingerprint: 'p1',
        kind: 'read',
        count: 1,
        reads: {},
        writes: {},
        excluded: ['pipeline_runs'],
        error: null,
        text: "SELECT records_meta FROM pipeline_runs WHERE pipeline = $1 AND status = 'completed'",
        params: [['sources:load_ravines']],
      },
    ];
    const out = run({ postTraces: { sources: t } });
    expect(out.rows).toContain('FAIL:PRODUCER:sources:sources:load_ravines:status');
  });

  it('GREEN control: status IN (completed, completed_with_warnings) yields no PRODUCER row', () => {
    const t = trace();
    t.statements = [
      {
        fingerprint: 'p1',
        kind: 'read',
        count: 1,
        reads: {},
        writes: {},
        excluded: ['pipeline_runs'],
        error: null,
        text: "SELECT records_meta FROM pipeline_runs WHERE pipeline = $1 AND status IN ('completed','completed_with_warnings')",
        params: [['sources:load_ravines']],
      },
    ];
    const out = run({ postTraces: { sources: t } });
    expect(out.rows.filter((r) => r.startsWith('FAIL:PRODUCER:'))).toEqual([]);
  });
});

// 10b. WF3 witness-unblock C1 — (b) honours written:"db_default" in both directions
describe('gate #44 (b) — written:"db_default" columns (WF3 C1: R1–R3, R17)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const W = require(path.join(process.cwd(), 'scripts/lib/step/write.js'));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const A = require(path.join(process.cwd(), 'scripts/lib/sql-witness/assemble.cjs'));
  type Col = { name: string; written?: string };
  type Desc = { outputs: { writes: Array<{ table: string; columns: Col[] }> } };
  const load = (f: string): Desc =>
    JSON.parse(fs.readFileSync(path.join(process.cwd(), `scripts/${f}.descriptor.json`), 'utf8'));
  const ndjson = (texts: string[]): string => [
    { type: 'header', pid: 1, tracer_self_ms: 0, distinct: texts.length, calls: texts.length },
    ...texts.map((text, i) => ({ type: 'statement', i, text, count: 1, rowCount: 1, clients: [1] })),
    { type: 'client', id: 1, seq: texts.map((_, i) => [i, 1]) },
  ].map((l) => JSON.stringify(l)).join('\n') + '\n';
  const first = (d: Desc): { table: string; columns: Col[] } => {
    const w = d.outputs.writes[0];
    if (!w) throw new Error('descriptor declares no write');
    return w;
  };
  const upsert = (d: Desc): string => W.buildWritePlan(first(d), d).upsertSqlFor(1); // 2 args (F-6(b))
  async function bRows(file: string, slug: string, texts?: (d: Desc) => string[]): Promise<string[]> {
    const d = load(file);
    const w = first(d);
    const t = await A.assembleTrace({
      ndjsonTexts: [ndjson(texts ? texts(d) : [upsert(d)])],
      catalog: { [w.table]: w.columns.map((c) => c.name) },
      meta: { step: slug, chain: 'sources', source_fingerprint: FP, git_head: 'g', wall_ms: 0 },
    });
    const out = G.evaluateWitness({ slug, descriptor: d, status: 'pending', currentFingerprint: FP,
      postTraces: { sources: t }, preTraces: {}, explainedDiffs: [] });
    return out.rows.filter((r) => r.startsWith(`FAIL:WITNESS:${slug}:b:`));
  }
  it('R1 RED: load_ravines generated upsert (db_default created_at untraced) yields no b: row', async () => {
    expect(await bRows('load-ravines', 'load_ravines')).toEqual([]);
  });
  it.each([['load-centreline', 'load_centreline'], ['load-neighbourhoods', 'neighbourhoods'], ['load-massing', 'massing']])(
    'R17 RED: %s generated upsert yields no b: row', async (file, slug) => {
      expect(await bRows(file, slug)).toEqual([]);
    });
  it('R2 RED: a traced write of the db_default column IS a b: violation', async () => {
    const rows = await bRows('load-ravines', 'load_ravines',
      (d) => [upsert(d), 'INSERT INTO ravines (created_at) VALUES (now())']);
    expect(rows).toContain('FAIL:WITNESS:load_ravines:b:ravines.created_at');
  });
  it('R3 scope control: a dropped step column (updated_at) still FAILs b:', async () => {
    const rows = await bRows('load-ravines', 'load_ravines', (d) => {
      const cols = first(d).columns.filter((c) => c.written === 'step' && c.name !== 'updated_at').map((c) => c.name);
      return [`INSERT INTO ravines (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`];
    });
    expect(rows).toContain('FAIL:WITNESS:load_ravines:b:ravines.updated_at');
    expect(rows).not.toContain('FAIL:WITNESS:load_ravines:b:ravines.created_at');
  });
});

describe('gate #44 PRODUCER — a SQL comment never satisfies the pattern (WF3 C1, O-7: R4)', () => {
  const producer = (text: string): string[] => {
    const t = trace();
    t.statements = [{ fingerprint: 'p1', kind: 'read', count: 1, reads: {}, writes: {}, excluded: ['pipeline_runs'],
      error: null, text, params: [['sources:load_ravines']] }];
    return run({ postTraces: { sources: t } }).rows.filter((r) => r.startsWith('FAIL:PRODUCER:'));
  };
  const RED = ['FAIL:PRODUCER:sources:sources:load_ravines:status'];
  it('R4 RED: the token inside a /* */ comment does not exempt a completed-only filter', () => {
    expect(producer("SELECT records_meta FROM pipeline_runs WHERE status = 'completed' /* completed_with_warnings */")).toEqual(RED);
  });
  it('R4 RED: the token inside a -- comment does not exempt it either', () => {
    expect(producer("SELECT records_meta FROM pipeline_runs WHERE status = 'completed' -- completed_with_warnings\nORDER BY started_at DESC")).toEqual(RED);
  });
  it("R4 GREEN control: a -- inside a string literal ('a--b') is text, not a comment", () => {
    expect(producer("SELECT records_meta FROM pipeline_runs WHERE status = 'completed' AND pipeline <> 'a--b' OR status = 'completed_with_warnings'")).toEqual([]);
  });
  it('R4 GREEN control: a -- inside a dollar-quoted body ($t$…$t$) is text', () => {
    expect(producer("SELECT records_meta FROM pipeline_runs WHERE status = 'completed' AND pipeline <> $t$x--y$t$ OR status = 'completed_with_warnings'")).toEqual([]);
  });
});

// ===========================================================================
// 11. hardStop semantics
// ===========================================================================
describe('gate #44 hardStop — pending vs converted (contract: converted is REPORT-ONLY)', () => {
  const undeclared = (): TraceDoc => {
    const t = trace();
    t.touched = {
      reads: { parcels: ['id', 'geom', 'lot_size_sqm'] },
      writes: { parcels: ['a', 'b'] },
    };
    return t;
  };

  it('RED: a FAIL with status pending yields hardStop true', () => {
    const out = run({ status: 'pending', postTraces: { sources: undeclared() } });
    expect(out.rows.some((r) => r.startsWith('FAIL:'))).toBe(true);
    expect(out.hardStop).toBe(true);
  });

  it('RED: the same FAIL with status converted yields hardStop false', () => {
    const out = run({ status: 'converted', postTraces: { sources: undeclared() } });
    expect(out.rows.some((r) => r.startsWith('FAIL:'))).toBe(true);
    expect(out.hardStop).toBe(false);
  });

  it('GREEN control: a PASS with status pending yields hardStop false', () => {
    const out = run({ status: 'pending' });
    expect(out.hardStop).toBe(false);
  });
});

// ===========================================================================
// 12. FAIL:INPUT when a trace has errors
// ===========================================================================
describe('gate #44 — trace errors (contract: FAIL:INPUT:<slug>:<invocation>:<error>)', () => {
  it('RED: a trace with an errors[] entry yields FAIL:INPUT', () => {
    const t = trace({ errors: ['FAIL:INPUT:parse:boom'] });
    const out = run({ postTraces: { sources: t } });
    expect(out.rows).toContain('FAIL:INPUT:sources:sources:FAIL:INPUT:parse:boom');
  });

  it('GREEN control: a trace with no errors yields no FAIL:INPUT row', () => {
    const out = run();
    expect(out.rows.filter((r) => r.startsWith('FAIL:INPUT:'))).toEqual([]);
  });
});

// ===========================================================================
// 13. selfTest
// ===========================================================================
describe('gate #44 — selfTest (contract: built-in red/green pair)', () => {
  it('RED: selfTest().ok is true', () => {
    const out = G.selfTest();
    expect(out.ok).toBe(true);
  });
});

// ===========================================================================
// 14. no forbidden string in the module source
// ===========================================================================
describe('gate #44 — module source hygiene (slice A)', () => {
  it('RED: the module source does NOT contain the string R-BF WITNESS GATE', () => {
    const src = fs.readFileSync(MODULE_PATH, 'utf8');
    expect(src).not.toContain('R-BF WITNESS GATE');
  });
});

// ===========================================================================
// 15. step-validate wiring lock (P1-C3c2) — gate #44 is imported, self-tested,
// reads the witness tree, and its hard stop is guarded by witness44.hardStop.
// The C9 marker string must NOT appear yet.
// ===========================================================================
const STEP_VALIDATE_PATH = path.join(process.cwd(), 'scripts/analysis/step-validate.mjs');

describe('gate #44 — step-validate wiring (P1-C3c2)', () => {
  let src: string;
  beforeAll(() => {
    src = fs.readFileSync(STEP_VALIDATE_PATH, 'utf8');
  });

  it('imports evaluateWitness from ./gates/witness.mjs', () => {
    expect(src).toContain("from './gates/witness.mjs'");
    expect(src).toContain('evaluateWitness(');
  });

  it('runs the gate self-test in main()', () => {
    expect(src).toContain('witnessSelfTest()');
  });

  it('reads the witness tree (docs/reports/witness)', () => {
    expect(src).toContain('docs/reports/witness');
  });

  it('guards the hard stop with witness44.hardStop', () => {
    expect(src).toContain('witness44.hardStop');
  });

  it('does NOT contain the string R-BF WITNESS GATE (lands at P1-C9)', () => {
    expect(src).not.toContain('R-BF WITNESS GATE');
  });
});
