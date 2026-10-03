// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6.1
// Plan: .cursor/wf2_registry_truth_active_task.md P1-C-src (a)/(b), Fold 14
//
// Logic suite for `scripts/analysis/src-sql-ledger.mjs` (P1-C-src). It locks the
// three-file-in / three-class-out static pass over every SQL-bearing file under
// `src/`: the pure extractor (`extractSql`) over an AST, the classifier
// (`classifyFile`) over the witness resolver, the NOT_POSTGRES two-file carve-out,
// the closed-set check (`closedSetViolations`), and the committed-ledger freshness
// proof (`checkSrcSqlLedger`). The two `live:`/`exit criterion` tests are GREEN
// only once the orchestrator has written `scripts/steps/_schema/src-sql-ledger.json`
// and filled `CLOSED_INTERPOLATED_SET`; they are red on a fresh worktree by design.

import { describe, it, expect, beforeAll } from 'vitest';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as ssl from '../../scripts/analysis/src-sql-ledger.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/[/\\]$/, '');

// The fixture (rel `src/app/api/x/route.ts`) — one file exercising every rule:
//   L1  literal call            → literal
//   L2  interpolated call       → interpolated
//   L3  const → literal         → literal (resolved through the binding)
//   L4  const → template        → interpolated
//   L5  parameter pass-through  → NOT counted (passthrough)
//   L6  route-label string      → keyword-start but not a query argument and
//                                 unparseable → skipped as non-SQL
//   L7  lowercase literal call  → still a literal (parsed regardless of keyword)
const FIXTURE = [
  'export async function GET() {',
  "  await query('SELECT id FROM permits WHERE id = $1', [a]);", // L1
  '  await pool.query(`SELECT ${col} FROM permits`);', // L2
  "  const Q = 'SELECT name FROM entities';", // L3a
  '  await query(Q);', // L3b
  '  const T = `UPDATE permits SET status = ${s}`;', // L4a
  '  await query(T);', // L4b
  '  function run(text: string) {', // L5a
  '    return pool.query(text);', // L5b
  '  }',
  "  const label = 'DELETE /api/admin/x';", // L6
  "  await query('select 1 from permits');", // L7
  '}',
].join('\n');

const FIXTURE_REL = 'src/app/api/x/route.ts';

const CATALOG = { permits: ['id', 'status', 'name'], entities: ['id', 'name'] };

describe('src-sql-ledger — extractSql (pure AST extraction)', () => {
  beforeAll(async () => {
    await ssl.initParser();
  });

  it('splits literals / interpolated / skipped / passthrough for the fixture', () => {
    const e = ssl.extractSql(FIXTURE_REL, FIXTURE);

    // 3 literals: the permits call (L1), the entities call via `Q` (L3b), and the
    // lowercase call (L7) — each reached via a query call.
    expect(e.literals).toHaveLength(3);
    for (const lit of e.literals) {
      expect(lit.viaQueryCall).toBe(true);
      expect(typeof lit.line).toBe('number');
      expect(typeof lit.sql).toBe('string');
    }
    expect(e.literals.map((l) => l.line)).toEqual([2, 5, 12]);
    expect(e.literals[0]!.sql).toContain('FROM permits');
    expect(e.literals[1]!.sql).toContain('FROM entities');
    expect(e.literals[2]!.sql.toLowerCase()).toContain('from permits');

    // 2 interpolated: the inline template call (L2) and the `T` binding (L4b).
    expect(e.interpolated).toHaveLength(2);
    expect(e.interpolated.map((i) => i.line)).toEqual([3, 7]);

    // The route label is keyword-start but not a query argument and unparseable.
    expect(e.skipped).toBe(1);

    // The parameter pass-through in `run(text)` is never counted as SQL.
    expect(e.passthrough).toBe(1);
  });
});

describe('src-sql-ledger — classifyFile', () => {
  beforeAll(async () => {
    await ssl.initParser();
  });

  it('classifies the mixed fixture as interpolated with resolved reads and fingerprints', () => {
    const e = ssl.extractSql(FIXTURE_REL, FIXTURE);
    const c = ssl.classifyFile(FIXTURE_REL, e, CATALOG) as { class: string; reads: Record<string, string[]>; fingerprints: string[]; unparsed: number[] };

    expect(c.class).toBe('interpolated');
    expect(c.reads.permits).toContain('id');
    expect(c.reads.entities).toContain('name');
    expect(Array.isArray(c.fingerprints)).toBe(true);
    expect(c.fingerprints.length).toBeGreaterThan(0);
    // sorted + unique + non-empty strings
    expect(c.fingerprints).toEqual([...new Set(c.fingerprints)].sort());
    for (const fp of c.fingerprints) expect(fp.length).toBeGreaterThan(0);
    expect(c.unparsed).toEqual([]);
  });

  it('classifies a literal-only file as static', () => {
    const text = "await query('SELECT id FROM permits');\n";
    const e = ssl.extractSql('src/app/api/y/route.ts', text);
    const c = ssl.classifyFile('src/app/api/y/route.ts', e, CATALOG);
    expect(c.class).toBe('static');
    expect(c.unparsed).toEqual([]);
  });

  it('reports a literal query argument that fails to parse as unparsed, still static', () => {
    const text = "await query('SELEC id FROM');\n";
    const e = ssl.extractSql('src/app/api/z/route.ts', text);
    const c = ssl.classifyFile('src/app/api/z/route.ts', e, CATALOG);
    expect(c.class).toBe('static');
    expect(c.unparsed).toEqual([1]);
  });
});

describe('src-sql-ledger — NOT_POSTGRES carve-out', () => {
  it('is a frozen two-key object with non-empty reasons, sorted', () => {
    expect(Object.isFrozen(ssl.NOT_POSTGRES)).toBe(true);
    expect(Object.keys(ssl.NOT_POSTGRES).sort()).toEqual([
      'src/lib/admin/posthog-client.ts',
      'src/lib/db/generated/schema.ts',
    ]);
    for (const reason of Object.values(ssl.NOT_POSTGRES)) {
      expect(typeof reason).toBe('string');
      expect(reason.length).toBeGreaterThan(0);
    }
  });

  it('classifyFile on a NOT_POSTGRES rel returns only { class, reason }', () => {
    const rel = 'src/lib/admin/posthog-client.ts';
    const c = ssl.classifyFile(rel, { literals: [], interpolated: [], skipped: 0, passthrough: 0 }, {});
    expect(c).toEqual({ class: 'not_postgres', reason: ssl.NOT_POSTGRES[rel] });
  });
});

describe('src-sql-ledger — closedSetViolations', () => {
  const ledger = {
    files: {
      'a.ts': { class: 'interpolated', unparsed: [] },
      'b.ts': { class: 'static', unparsed: [7] },
      'c.ts': { class: 'static', unparsed: [] },
    },
  };

  it('flags grew / stale / unparsed, sorted', () => {
    const v = ssl.closedSetViolations(ledger, ['c.ts']);
    expect(v).toEqual(['grew:a.ts', 'stale:c.ts', 'unparsed:b.ts:7']);
  });

  it('is silent when the set is exactly the interpolated set and no file is unparsed', () => {
    const clean = {
      files: {
        'a.ts': { class: 'interpolated', unparsed: [] },
        'b.ts': { class: 'static', unparsed: [] },
        'c.ts': { class: 'static', unparsed: [] },
      },
    };
    expect(ssl.closedSetViolations(clean, ['a.ts'])).toEqual([]);
  });
});

describe('src-sql-ledger — parse errors vs resolution notes', () => {
  it('a resolution note on SQL that parsed is NOT unparsed: the statement counts and resolve_errors records it', () => {
    // Only a PARSE failure is `FAIL:INPUT:parse:`; everything else is a note on
    // SQL that parsed (its reads/writes are still populated), so it must not be
    // treated as unparsed.
    expect(ssl.isParseError('FAIL:INPUT:parse:syntax error')).toBe(true);
    expect(ssl.isParseError('FAIL:RESOLVE:ambiguous:x')).toBe(false);
    expect(ssl.isParseError(null)).toBe(false);
  });

  it('the extraction skips are carried into the file entry', () => {
    const c = ssl.classifyFile(
      'src/x.ts',
      { literals: [], interpolated: [], skipped: 2, passthrough: 0 },
      {},
    );
    expect(c.skipped).toBe(2);
  });
});

describe('src-sql-ledger — CLOSED_INTERPOLATED_SET (measured)', () => {
  it('CLOSED_INTERPOLATED_SET is the measured 29-file set, frozen and sorted (growth lock)', () => {
    const set = ssl.CLOSED_INTERPOLATED_SET;
    expect(Object.isFrozen(set)).toBe(true);
    expect(set).toHaveLength(29);
    expect(set).toEqual([...set].sort());
    expect(set).toContain('src/app/api/permits/route.ts');
    expect(set).toContain('src/lib/admin/step-output-query.ts');
  });
});

describe('runtime confirmation comparator (P1-C-src (c), PARTIAL until a live test:db run)', () => {
  beforeAll(async () => {
    await ssl.initParser();
  });

  it('judges each recorded statement once per caller against the static pass (or the closed interpolated set)', () => {
    const FP_A = ssl.fingerprintOf('SELECT id FROM permits WHERE id = $1');
    const ledger = {
      files: {
        'src/a.ts': { class: 'static', fingerprints: [FP_A] },
        'src/b.ts': { class: 'interpolated', fingerprints: [] },
      },
    };

    const r = ssl.confirmRecorded(ledger, [
      { text: 'SELECT id FROM permits WHERE id = $1', callers: ['src/a.ts'] },
      { text: 'SELECT name FROM entities', callers: ['src/a.ts'] },
      { text: 'SELECT 1', callers: ['src/b.ts'] },
      { text: 'SELECT 2', callers: ['src/zzz.ts'] },
      { text: 'SELECT 3' },
    ]);

    expect(r).toEqual({
      confirmed: 1,
      dynamic: 1,
      untagged: 1,
      rows: [
        'unclassified:src/zzz.ts',
        `unconfirmed:src/a.ts:${ssl.fingerprintOf('SELECT name FROM entities')}`,
      ],
    });
  });

  it('confirms a recorded statement the static pass parsed (GREEN control)', () => {
    const FP_A = ssl.fingerprintOf('SELECT id FROM permits WHERE id = $1');
    const ledger = {
      files: {
        'src/a.ts': { class: 'static', fingerprints: [FP_A] },
        'src/b.ts': { class: 'interpolated', fingerprints: [] },
      },
    };

    const r = ssl.confirmRecorded(ledger, [
      { text: 'SELECT id FROM permits WHERE id = $1', callers: ['src/a.ts'] },
    ]);

    expect(r).toEqual({ confirmed: 1, dynamic: 0, untagged: 0, rows: [] });
  });

  it('readRecordedStatements reads one NDJSON trace file per process: statement lines only', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'src-sql-ledger-trace-'));
    try {
      fs.writeFileSync(
        path.join(dir, '123.ndjson'),
        [
          JSON.stringify({ type: 'header', pid: 123, distinct: 2, calls: 2 }),
          JSON.stringify({ type: 'statement', i: 0, text: 'SELECT id FROM permits', count: 1, rowCount: 1, clients: [1], callers: ['src/a.ts'] }),
          JSON.stringify({ type: 'statement', i: 1, text: 'SELECT name FROM entities', count: 1, rowCount: 1, clients: [1] }),
          JSON.stringify({ type: 'client', id: 1, seq: [[0, 1]] }),
        ].join('\n') + '\n',
      );
      expect(ssl.readRecordedStatements(dir)).toEqual([
        { text: 'SELECT id FROM permits', callers: ['src/a.ts'] },
        { text: 'SELECT name FROM entities' },
      ]);
      expect(ssl.readRecordedStatements(path.join(dir, 'missing'))).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('src-sql-ledger — committed ledger (live)', () => {
  beforeAll(async () => {
    await ssl.initParser();
  });

  it('live: the committed ledger is fresh and its closed interpolated set holds', async () => {
    const r = await ssl.checkSrcSqlLedger(REPO_ROOT);
    expect(r.violations).toEqual([]);
    expect(r.fresh).toBe(true);
  });

  it('exit criterion: every SQL-bearing src/ file is classified', async () => {
    const built = await ssl.buildSrcSqlLedger(REPO_ROOT);
    for (const [, e] of Object.entries(built.files)) {
      expect(['static', 'interpolated', 'not_postgres']).toContain(e.class);
    }
    expect(Object.keys(built.files).length).toBeGreaterThanOrEqual(70);
  });
});
