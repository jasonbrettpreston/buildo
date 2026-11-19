// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md (surface standard: the S gate table),
//            docs/specs/02-web-admin/127_surface_conversion_procedure.md (the S-gate rows the runner calls),
//            docs/specs/00-architecture/08_agents.md:490 ("Red tests first, then the code, through the real hooks.").
//
// task-68 PROOF.TOOL, stage 2 (minimum): the slice runner scripts/analysis/proof-slice.mjs and its data file scripts/analysis/proof-slices.json.
// Plan: docs/reports/lanes/2026-11-19/BL-PROOF/PLAN.md section 5 (tests T1 to T7). The core is pure: `run` and `readFile` are injected, so no
// test below spawns a process. No DB, no network.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { checkSpec, main, renderTable, runSlice } from '../../scripts/analysis/proof-slice.mjs';
const REPO = process.cwd();

type Res = { status: number | null; signal?: string | null; error?: { code: string }; stdout?: string; stderr?: string };
type Row = { id: string; status: string; evidence: string; blockedBy: string[]; proof: string; cause?: string };
type Out = { rows: Row[]; counts: Record<string, number>; exit: number; problems: string[] };
const HEAD = 'a'.repeat(40);

const cmd = (id: string, extra: Record<string, unknown> = {}) => ({ id, proof: `proof ${id}`, argv: ['node', `${id}.mjs`], ...extra });
const spec = (rows: unknown[]) => ({ S: { rows } });
const go = (rows: unknown[], run: (argv: string[]) => Res, over: Record<string, unknown> = {}): Out => {
  const written: Record<string, string> = {};
  return runSlice({ spec: spec(rows), slice: 'S', run, head: HEAD, readFile: () => { throw new Error('no file'); }, outDir: '/out', writeFile: (f: string, t: string) => { written[f] = t; }, ...over }) as Out;
};
const ok = (): Res => ({ status: 0, stdout: 'fine\n', stderr: '' });

describe('T1 the committed data file', () => {
  const data = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/analysis/proof-slices.json'), 'utf8')) as Record<string, { rows: Array<Record<string, any>> }>; // eslint-disable-line @typescript-eslint/no-explicit-any -- JSON rows
  const rows = data.S?.rows ?? [];
  it('declares slice S and passes the runner shape check', () => {
    expect(rows.length).toBeGreaterThan(0);
    expect(checkSpec(data, 'S')).toEqual([]);
  });
  it('row ids are safe file names and unique', () => {
    const ids = rows.map((r) => r.id as string);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]{1,40}$/);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('every row has a proof and exactly one of argv, suite, notbuilt; argv is strings', () => {
    for (const r of rows) {
      expect(typeof r.proof).toBe('string');
      expect(['argv', 'suite', 'notbuilt'].filter((k) => r[k] !== undefined)).toHaveLength(1);
      if (r.argv !== undefined) expect(r.argv.every((a: unknown) => typeof a === 'string')).toBe(true);
    }
  });
  it('every blockedBy task resolves to a task file that is not DONE (a DONE blocker means the row must flip)', () => {
    const dir = path.join(REPO, 'backlog/tasks');
    for (const r of rows.filter((x) => x.notbuilt)) {
      for (const t of r.notbuilt.blockedBy as string[]) {
        const file = fs.readdirSync(dir).find((f) => f.startsWith(`${t} - `));
        expect(file, `${r.id}: ${t} has no task file`).toBeTruthy();
        const status = /^status:\s*(\S+)/m.exec(fs.readFileSync(path.join(dir, file as string), 'utf8'))?.[1];
        expect(status, `${r.id}: ${t} is ${status}`).not.toBe('DONE');
      }
    }
  });
  it('every suite_files path exists', () => {
    for (const r of rows.filter((x) => x.suite)) {
      expect((r.suite.suite_files as string[]).length).toBeGreaterThan(0);
      for (const f of r.suite.suite_files as string[]) expect(fs.existsSync(path.join(REPO, f)), f).toBe(true);
    }
  });
});

describe('T2 spawn results map to rows', () => {
  it('exit 0 is PASS and the output is kept in <out>/<id>.txt', () => {
    const written: Record<string, string> = {};
    const r = go([cmd('a')], ok, { writeFile: (f: string, t: string) => { written[f] = t; } });
    expect(r.rows[0]).toMatchObject({ status: 'PASS', evidence: '/out/a.txt' });
    expect(written['/out/a.txt']).toContain('fine');
    expect(r.exit).toBe(0);
  });
  it('exit 1 is FAIL, shown in the table with its evidence file, and the run exits 1', () => {
    const r = go([cmd('good'), cmd('bad')], (argv) => (argv[1] === 'bad.mjs' ? { status: 1, stdout: '', stderr: 'SV-GOLDEN planted\n' } : ok()));
    expect(r.rows.map((x) => x.status)).toEqual(['PASS', 'FAIL']);
    expect(r.exit).toBe(1);
    const table = renderTable(r);
    expect(table).toMatch(/bad .*FAIL.*\/out\/bad\.txt/);
  });
  it('no exit (timeout or signal) is FAIL and names the cause', () => {
    const r = go([cmd('slow')], () => ({ status: null, signal: 'SIGTERM', error: { code: 'ETIMEDOUT' }, stdout: 'partial\n' }));
    expect(r.rows[0]).toMatchObject({ status: 'FAIL' });
    expect(r.rows[0]?.cause).toMatch(/timeout/);
    expect(r.exit).toBe(1);
  });
  it('a spawn error (ENOENT) is GAP (environment), not FAIL', () => {
    const r = go([cmd('nope')], () => ({ status: null, error: { code: 'ENOENT' } }));
    expect(r.rows[0]).toMatchObject({ status: 'GAP' });
    expect(r.exit).toBe(3);
  });
});

describe('T3 the WAITS marker', () => {
  const policy = (out: string) => (): Res => ({ status: 0, stdout: out });
  it('a line starting "WAITS CHK.5" makes the CHK.5 row NOT BUILT, never PASS', () => {
    const r = go([cmd('chk5', { waits: 'WAITS CHK.5' })], policy('WAITS CHK.5 chk5_tables is empty\nPOLICY CHECKS OK (all): 1 file(s)\n'));
    expect(r.rows[0]?.status).toBe('NOT BUILT');
    expect(r.exit).toBe(3);
  });
  it('a planted "WAITS CHK.3" line does not flip the CHK.5 row', () => {
    const r = go([cmd('chk5', { waits: 'WAITS CHK.5' })], policy('WAITS CHK.3 something\nPOLICY CHECKS OK (all): 1 file(s)\n'));
    expect(r.rows[0]?.status).toBe('PASS');
  });
  it('the marker is anchored to the line start: a mention inside a line does not flip the row', () => {
    const r = go([cmd('chk5', { waits: 'WAITS CHK.5' })], policy('note: WAITS CHK.5 appears mid-line\n'));
    expect(r.rows[0]?.status).toBe('PASS');
  });
  it('a failing exit with the marker present is FAIL', () => {
    const r = go([cmd('chk5', { waits: 'WAITS CHK.5' })], () => ({ status: 1, stdout: 'WAITS CHK.5 x\n' }));
    expect(r.rows[0]?.status).toBe('FAIL');
  });
});

describe('T4 NOT BUILT rows and the exit code', () => {
  const nb = { id: 'later', proof: 'a later proof', notbuilt: { blockedBy: ['task-123', 'task-265'] } };
  it('a NOT BUILT row is never PASS, carries its blockers, and the run exits 3', () => {
    const r = go([cmd('a'), nb], ok);
    expect(r.rows[1]).toMatchObject({ status: 'NOT BUILT', blockedBy: ['task-123', 'task-265'] });
    expect(r.exit).toBe(3);
    expect(renderTable(r)).toMatch(/later .*NOT BUILT.*task-123, task-265/);
  });
  it('the summary counts are exact', () => {
    const r = go([cmd('a'), cmd('b'), cmd('c'), nb], (argv) => (argv[1] === 'c.mjs' ? { status: 1 } : argv[1] === 'b.mjs' ? { status: null, error: { code: 'ENOENT' } } : ok()));
    expect(r.counts).toEqual({ PASS: 1, FAIL: 1, 'NOT BUILT': 1, GAP: 1 });
    expect(renderTable(r)).toContain('PASS 1 · FAIL 1 · NOT BUILT 1 · GAP 1');
  });
  it('FAIL wins over NOT BUILT: exit 1; exit 0 only when every row is PASS', () => {
    expect(go([cmd('a'), { ...nb }, cmd('b')], (argv) => (argv[1] === 'b.mjs' ? { status: 2 } : ok())).exit).toBe(1);
    expect(go([cmd('a'), cmd('b')], ok).exit).toBe(0);
    expect(go([cmd('a'), nb], ok).exit).not.toBe(0);
  });
});

describe('T5 fail closed', () => {
  const io = (text: string | Error) => ({
    readFile: (f: string) => { if (text instanceof Error) throw text; if (f.endsWith('.json')) return text; throw new Error('no file'); },
    run: ok, head: HEAD, writeFile: () => undefined, mkdir: () => undefined, print: () => undefined,
  });
  it('an unknown slice exits 2', () => {
    expect(main(['--slice', 'X', '--out', '/out'], io(JSON.stringify(spec([cmd('a')]))))).toBe(2);
  });
  it('a missing data file exits 2', () => {
    expect(main(['--slice', 'S', '--out', '/out'], io(new Error('ENOENT')))).toBe(2);
  });
  it('a malformed data file exits 2', () => {
    expect(main(['--slice', 'S', '--out', '/out'], io('{not json'))).toBe(2);
    expect(main(['--slice', 'S', '--out', '/out'], io(JSON.stringify(spec([{ id: '../x', proof: 'p', argv: ['node'] }]))))).toBe(2);
    expect(main(['--slice', 'S', '--out', '/out'], io(JSON.stringify(spec([{ id: 'a', proof: 'p', argv: ['node'], notbuilt: { blockedBy: [] } }]))))).toBe(2);
  });
  it('usage errors exit 2: no --slice, no --out, an unknown flag', () => {
    const j = JSON.stringify(spec([cmd('a')]));
    expect(main(['--out', '/out'], io(j))).toBe(2);
    expect(main(['--slice', 'S'], io(j))).toBe(2);
    expect(main(['--slice', 'S', '--out', '/out', '--bogus'], io(j))).toBe(2);
  });
  it('a valid call returns the run exit code', () => {
    expect(main(['--slice', 'S', '--out', '/out'], io(JSON.stringify(spec([cmd('a')]))))).toBe(0);
  });
});

describe('T6 the suite row reads the station pass file and never runs the suite', () => {
  const suiteRow = { id: 'suite', proof: 'hooks plus full suite on the tip', suite: { suite_files: ['src/tests/search-routing.logic.test.ts'] } };
  const pass = (sha: string, result = 'PASS') => `task: push-station suite\nRESULT: ${result}\ntip: ${'b'.repeat(40)}\nsha: ${sha}\n`;
  const noRun = (): Res => { throw new Error('the suite row must not spawn'); };
  it('no pass file given is GAP', () => {
    const r = go([suiteRow], noRun);
    expect(r.rows[0]).toMatchObject({ status: 'GAP' });
    expect(r.exit).toBe(3);
  });
  it('a pass file that cannot be read is GAP', () => {
    expect(go([suiteRow], noRun, { suitePass: '/p/x.pass' }).rows[0]?.status).toBe('GAP');
  });
  it('RESULT PASS with sha equal to HEAD is PASS', () => {
    const r = go([suiteRow], noRun, { suitePass: '/p/x.pass', readFile: () => pass(HEAD) });
    expect(r.rows[0]).toMatchObject({ status: 'PASS', evidence: '/p/x.pass' });
    expect(r.exit).toBe(0);
  });
  it('a pass file for a different sha is GAP', () => {
    expect(go([suiteRow], noRun, { suitePass: '/p/x.pass', readFile: () => pass('c'.repeat(40)) }).rows[0]?.status).toBe('GAP');
  });
  it('RESULT FAIL at HEAD is FAIL, never hidden as GAP', () => {
    expect(go([suiteRow], noRun, { suitePass: '/p/x.pass', readFile: () => pass(HEAD, 'FAIL') }).rows[0]?.status).toBe('FAIL');
  });
  it('the table names the test files the suite row covers', () => {
    expect(renderTable(go([suiteRow], noRun))).toContain('src/tests/search-routing.logic.test.ts');
  });
});

describe('T7 tripwire (not a sandbox): the runner carries no database or network code', () => {
  const text = fs.readFileSync(path.join(REPO, 'scripts/analysis/proof-slice.mjs'), 'utf8');
  it('has no pg import, no connection string, no fetch call', () => {
    expect(text).not.toMatch(/from ['"]pg['"]|require\(['"]pg['"]\)|postgres(ql)?:\/\/|\bfetch\(/);
  });
});
