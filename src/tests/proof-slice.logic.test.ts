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
import { checkSpec, main, realIo, renderTable, runSlice } from '../../scripts/analysis/proof-slice.mjs';
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

describe('T8 output review r2 (KEPT findings): positive proof of a run, strict row keys', () => {
  it('a clean exit without the expected output line is GAP, never PASS', () => {
    const r = go([cmd('g', { expect: 'goldens ok' })], () => ({ status: 0, stdout: '' }));
    expect(r.rows[0]).toMatchObject({ status: 'GAP' });
    expect(r.exit).toBe(3);
  });
  it('a clean exit with the expected output line is PASS', () => {
    expect(go([cmd('g', { expect: 'goldens ok' })], () => ({ status: 0, stdout: 'search goldens ok (10)\n' })).rows[0]?.status).toBe('PASS');
  });
  it('the WAITS marker still wins over expect', () => {
    const r = go([cmd('c', { waits: 'WAITS CHK.5', expect: 'POLICY CHECKS OK' })], () => ({ status: 0, stdout: 'WAITS CHK.5 x\nPOLICY CHECKS OK\n' }));
    expect(r.rows[0]?.status).toBe('NOT BUILT');
  });
  it('unknown row keys, and waits or expect on a non-argv row, are bad data', () => {
    expect(checkSpec(spec([cmd('a', { wait: 'WAITS X' })]), 'S').join()).toMatch(/unknown key wait/);
    expect(checkSpec(spec([{ id: 's', proof: 'p', suite: { suite_files: ['x'] }, waits: 'WAITS X' }]), 'S').join()).toMatch(/only read on an argv row/);
    expect(checkSpec(spec([cmd('a', { expect: '' })]), 'S').join()).toMatch(/non-empty string/);
  });
  it('notbuilt null is a stated problem, not a crash', () => {
    expect(checkSpec(spec([{ id: 'n', proof: 'p', notbuilt: null }]), 'S').join()).toMatch(/notbuilt must be an object/);
  });
  it('an unknown HEAD exits 2 before any row runs', () => {
    const io = { readFile: () => JSON.stringify(spec([cmd('a')])), run: ok, head: '', writeFile: () => undefined, mkdir: () => undefined, print: () => undefined };
    expect(main(['--slice', 'S', '--out', '/out'], io)).toBe(2);
  });
  it('the evidence file states why a command did not run', () => {
    const written: Record<string, string> = {};
    go([cmd('nope')], () => ({ status: null, error: { code: 'ENOENT', message: 'spawn x ENOENT' } as { code: string } }), { writeFile: (f: string, t: string) => { written[f] = t; } });
    expect(written['/out/nope.txt']).toContain('error: ENOENT');
  });
  it('every golden, surface and policy row in the committed data names the line its check prints', () => {
    const rows = (JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/analysis/proof-slices.json'), 'utf8')) as Record<string, { rows: Array<Record<string, unknown>> }>).S?.rows ?? [];
    for (const id of ['surface-validate', 'search-goldens', 'lotmap-goldens', 'semi-goldens', 'chk5-mcstorage']) expect(rows.find((r) => r.id === id)?.expect, id).toBeTruthy();
    // task-453 ST5 (AC #6): CHK.3 reads the staged diff and --all gives it no input, so its row is printed as not built, with the reason
    const chk3 = rows.find((r) => r.id === 'chk3-nothing-new') as { notbuilt?: { reason?: string }; argv?: unknown } | undefined;
    expect(chk3?.notbuilt?.reason).toBe('CHK.3 reads the staged diff; --all gives it no input');
    expect(chk3?.argv).toBeUndefined();
  });
});

describe('T9 task-363 input guards: null suite, bad timeoutMs, unwritable --out (RR-0306 keeps the design-fit row as is)', () => {
  const j = (rows: unknown[]) => JSON.stringify(spec(rows));
  const mk = (text: string, mkdir: (d: string) => void = () => undefined) => ({
    readFile: (f: string) => { if (f.endsWith('.json')) return text; throw new Error('no file'); },
    run: ok, head: HEAD, writeFile: () => undefined, mkdir, print: () => undefined,
  });
  it('a row with "suite": null is a stated problem and main exits 2, no TypeError', () => {
    const rows = [{ id: 's', proof: 'p', suite: null }];
    expect(checkSpec(spec(rows), 'S').join()).toMatch(/suite must be an object/);
    expect(main(['--slice', 'S', '--out', '/out'], mk(j(rows)))).toBe(2);
  });
  it('timeoutMs "5", -1, 0 and 1.5 are problems and main exits 2; a positive integer is accepted', () => {
    for (const t of ['5', -1, 0, 1.5]) {
      expect(checkSpec(spec([cmd('a', { timeoutMs: t })]), 'S').join(), String(t)).toMatch(/timeoutMs must be a positive integer/);
      expect(main(['--slice', 'S', '--out', '/out'], mk(j([cmd('a', { timeoutMs: t })])))).toBe(2);
    }
    expect(checkSpec(spec([cmd('a', { timeoutMs: 5000 })]), 'S')).toEqual([]);
  });
  it('an io.mkdir that throws exits 2 and prints one proof-slice: line (not the FAIL code 1)', () => {
    const lines: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => { lines.push(a.join(' ')); };
    try {
      const code = main(['--slice', 'S', '--out', '/out'], mk(j([cmd('a')]), () => { throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }); }));
      expect(code).toBe(2);
    } finally { console.error = orig; }
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^proof-slice: .*EACCES/);
  });
  it('the committed report-opens row is blocked by the live switch task-287, the design-fit row is unchanged', () => {
    const data = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/analysis/proof-slices.json'), 'utf8')) as Record<string, { rows: Array<Record<string, any>> }>; // eslint-disable-line @typescript-eslint/no-explicit-any -- JSON rows
    const byId = (id: string) => (data.S?.rows ?? []).find((r) => r.id === id);
    expect(byId('report-opens')?.notbuilt.blockedBy).toEqual(['task-287']);
    expect(byId('design-fit')?.notbuilt.blockedBy).toEqual(['task-345', 'task-67']);
  });
});

// task-375 FIX.TOOLS D10 (Spec 132 core.8, 132_step_standard_handbook.md:154 "Runner and gate numbers are pinned `step_*` / `gate_*` / `tooling_*` variables"):
// the runner's child-output ceiling is the registered tooling_spawn_max_buffer_mb, not a typed 16 MiB.
describe('D10 task-375: the child-output ceiling is the registered variable', () => {
  it('a real child that writes 20 MiB to stdout is not cut off (the typed 16 MiB ceiling cut it off with ENOBUFS)', async () => {
    const mod = (await import('../../scripts/analysis/proof-slice.mjs')) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const r = mod.realIo().run(['node', '-e', "process.stdout.write('x'.repeat(20 * 1024 * 1024))"], { timeoutMs: 60000 });
    expect(r.error?.code).toBeUndefined();
    expect(r.status).toBe(0);
    expect(r.stdout.length).toBe(20 * 1024 * 1024);
  });
  it('the maxBuffer argument is read from tooling_spawn_max_buffer_mb through gateVariable, with no typed MiB literal', () => {
    const src = fs.readFileSync(path.join(REPO, 'scripts/analysis/proof-slice.mjs'), 'utf8');
    expect(src).toMatch(/maxBuffer:\s*gateVariable\('tooling_spawn_max_buffer_mb'\)\s*\*\s*1024\s*\*\s*1024/);
    expect(src).not.toMatch(/maxBuffer:\s*\d/);
  });
});

describe('task-375 D10b: the timeout comes from the registered variable, a bad value refuses and names it (no default, no unbounded run)', () => {
  it('accepts a positive integer, given as a number or as the text the variable table stores', async () => {
    const m = await import('../../scripts/analysis/proof-slice.mjs');
    expect(m.timeoutMsFromVariable(120000)).toBe(120000);
    expect(m.timeoutMsFromVariable('90000')).toBe(90000);
    expect(m.timeoutMsFromVariable('1')).toBe(1);
  });
  it('refuses unset, empty, zero, negative, fractional and non-numeric values, each message names the variable', async () => {
    const m = await import('../../scripts/analysis/proof-slice.mjs');
    expect(typeof m.TIMEOUT_VARIABLE).toBe('string');
    for (const bad of [undefined, null, '', '   ', 0, '0', -5, '-5', 1.5, '1.5', 'abc', '12s', Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => m.timeoutMsFromVariable(bad), String(bad)).toThrow(new RegExp(m.TIMEOUT_VARIABLE));
    }
  });
});

// task-453 T4 (GROUNDER-D D1, proof-slice.mjs:11 "exit 2 ... usage"): with git unspawnable realIo() gives an empty head (main then exits 2), never a TypeError
describe('task-453 T4: realIo with no git on PATH', () => {
  it('head is the empty string, no throw', () => {
    const saved = process.env.PATH;
    const empty = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR ?? '/tmp'), 'nogit-'));
    process.env.PATH = empty;
    try {
      expect(realIo().head).toBe('');
    } finally {
      process.env.PATH = saved;
    }
  });
});
