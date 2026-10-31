// SPEC LINK: MB-73 plan sections 1, 5, 7 and 8; R-KQ (a row needs an artifact and a green), R-KU (an id never vanishes),
//            R-KK (the audit pack is a witness), F-IDEM (byte-identical status), F-ARM (the letters are free per task).
// The CLI against real temp repos: F-P10, F-P12, F-P1, F-IDEM, usage errors, the writers and the audit pack.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { main } from '../../scripts/analysis/mcbylaws-promises/mcbylaws-promises.mjs';
import { makePromisesRepo } from './fixtures/mcbylaws-promises/fixture-repo';

type Made = ReturnType<typeof makePromisesRepo>;
const repos: { cleanup(): void }[] = [];
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

afterAll(() => {
  for (const r of repos) r.cleanup();
});

/** A fixture repo, registered for cleanup. */
function repo(opts: Record<string, boolean> = {}): Made {
  const made = makePromisesRepo(opts);
  repos.push(made.r);
  return made;
}

type Io = { cwd: string; run?: Made['run'] };

/** Runs main with captured out / err. */
function run(argv: string[], io: Io) {
  const out: string[] = [];
  const err: string[] = [];
  const code = main(argv, { ...io, out: (s: string) => out.push(s), err: (s: string) => err.push(s) });
  return { code, out, err, text: out.join('\n'), errText: err.join('\n') };
}

const failedRun = () => ({
  ok: true,
  json: { testResults: [{ name: '/x/src/tests/z.test.ts', assertionResults: [{ fullName: 'z holds', status: 'failed' }] }] },
});

describe('mcbylaws-promises --check', () => {
  it('F-P10 a fully green repo exits 0 with the summary last', () => {
    const made = repo();
    const res = run(['--check'], { cwd: made.r.dir, run: made.run });
    expect(res.code).toBe(0);
    expect(res.err).toEqual([]);
    expect(res.out[res.out.length - 1]).toBe('promises: 1 done, 0 red, 0 not yet');
    expect(res.text).not.toContain('FAIL:');
  });

  it('F-P1 no queue root: arm Q and arm R both report, exit 2', () => {
    const made = repo({ queueTracked: false });
    const res = run(['--check'], { cwd: made.r.dir, run: made.run });
    expect(res.code).toBe(2);
    expect(res.text).toContain('FAIL:Q:queue-untracked');
    expect(res.out.some((l) => l.startsWith('FAIL:R:cannot-decide'))).toBe(true);
  });

  it('F-P1 proper, no red and no green: not green, exit 1', () => {
    const made = repo({ green: false, red: false });
    const res = run(['--check'], { cwd: made.r.dir, run: made.run });
    expect(res.code).toBe(1);
    expect(res.text).toContain('FAIL:R:not-green:R-ZZ');
  });

  it.each([
    ['F-P12 queue untracked', 'FAIL:Q:queue-untracked'],
  ])('%s is a red queue that cannot be decided, exit 2', (_name, line) => {
    const made = repo({ queueTracked: false });
    const res = run(['--check'], { cwd: made.r.dir, run: made.run });
    expect(res.code).toBe(2);
    expect(res.text).toContain(line);
  });

  it('a failing run exits 1 with the not-green line', () => {
    const made = repo();
    const res = run(['--check'], { cwd: made.r.dir, run: failedRun });
    expect(res.code).toBe(1);
    expect(res.text).toContain('FAIL:R:not-green:R-ZZ');
    expect(res.out[res.out.length - 1]).toMatch(/^promises: /);
  });

  it('an unknown increment cannot be decided', () => {
    const made = repo();
    const res = run(['--check', '--increment', '0'], { cwd: made.r.dir, run: made.run });
    expect(res.code).toBe(2);
    expect(res.text).toContain('FAIL:R:cannot-decide:increment-unknown:0');
  });
});

describe('mcbylaws-promises usage', () => {
  it.each([
    ['no mode', []],
    ['two modes', ['--check', '--status']],
    ['an unknown flag', ['--check', '--bogus', 'x']],
    ['--rev without a value', ['--check', '--rev']],
  ])('%s exits 2 with the usage', (_name, argv) => {
    const made = repo();
    const res = run(argv, { cwd: made.r.dir, run: made.run });
    expect(res.code).toBe(2);
    expect(res.errText).toContain('usage: ');
    expect(res.out).toEqual([]);
  });
});

describe('mcbylaws-promises --status (F-IDEM)', () => {
  it('prints identical bytes twice, with the done row and the real HEAD', () => {
    const made = repo();
    const a = run(['--status'], { cwd: made.r.dir, run: made.run });
    const b = run(['--status'], { cwd: made.r.dir, run: made.run });
    const head = made.r.git(['rev-parse', 'HEAD']);
    expect(a.code).toBe(0);
    expect(a.out).toEqual(b.out);
    expect(a.text).toContain('| R-ZZ | done |');
    expect(a.text).toContain(`commit: ${head}`);
    expect(a.text).toContain('register: ');
    expect(a.text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('reports a red row without judging it', () => {
    const made = repo({ green: false, red: false });
    const res = run(['--status'], { cwd: made.r.dir, run: made.run });
    expect(res.code).toBe(0);
    expect(res.text).toContain('| R-ZZ | red | FAIL:R:not-green:R-ZZ |');
  });

  it('cannot decide exits 2', () => {
    const made = repo({ scanConfig: false });
    const res = run(['--status'], { cwd: made.r.dir, run: made.run });
    expect(res.code).toBe(2);
    // --status prints the table only, never the FAIL lines.
    expect(res.text).toContain('| id |');
    expect(res.text).not.toContain('FAIL:');
  });
});

describe('mcbylaws-promises --write-red / --write-green', () => {
  it('writes the red once, then refuses', () => {
    const made = repo({ red: false, green: false });
    const first = run(['--write-red', 'R-ZZ'], { cwd: made.r.dir, run: failedRun });
    expect(first.code).toBe(0);
    expect(first.out).toEqual(['mcbylaws/promises/red/R-ZZ.json']);
    expect(fs.existsSync(path.join(made.r.dir, 'mcbylaws/promises/red/R-ZZ.json'))).toBe(true);
    const second = run(['--write-red', 'R-ZZ'], { cwd: made.r.dir, run: failedRun });
    expect(second.code).toBe(1);
    expect(second.errText).toContain('refused:');
    expect(second.errText).toContain('exists:mcbylaws/promises/red/R-ZZ.json');
  });

  it('write-green without a red is refused', () => {
    const made = repo({ red: false, green: false });
    const res = run(['--write-green', 'R-ZZ'], { cwd: made.r.dir, run: made.run });
    expect(res.code).toBe(1);
    expect(res.errText).toContain('refused: no-red-first:R-ZZ');
  });

  it('an id with no register row or entry cannot be decided', () => {
    const made = repo();
    const res = run(['--write-red', 'R-NOPE'], { cwd: made.r.dir, run: made.run });
    expect(res.code).toBe(2);
    expect(res.text).toContain('FAIL:R:cannot-decide:no-entry:R-NOPE');
  });
});

describe('mcbylaws-promises --audit-pack and --audit', () => {
  const tmpDir = fs.mkdtempSync(path.join(ROOT, '.tmp-audit-'));
  afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  it('prints a pack with one entry per declared artifact', () => {
    const made = repo();
    const res = run(['--audit-pack'], { cwd: made.r.dir });
    expect(res.code).toBe(0);
    const pack = JSON.parse(res.text);
    expect(pack.schema).toBe('promises-audit-pack-v1');
    expect(pack.entries).toEqual([
      { id: 'R-ZZ', command: 'npx vitest run src/tests/z.test.ts --run', counts: 'Tests  1 passed (1)' },
    ]);
    expect(pack.pack_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('writes the pack to --out', () => {
    const made = repo();
    const out = path.join(tmpDir, 'pack.json');
    const res = run(['--audit-pack', '--out', out], { cwd: made.r.dir });
    expect(res.code).toBe(0);
    expect(res.out).toEqual([]);
    expect(JSON.parse(fs.readFileSync(out, 'utf8')).entries).toHaveLength(1);
  });

  it('--check with a matching audit text and pack has no audit line; a missing block is uncovered', () => {
    const made = repo();
    const pack = JSON.parse(run(['--audit-pack'], { cwd: made.r.dir }).text);
    const good = path.join(tmpDir, 'pack-good.json');
    const goodText = path.join(tmpDir, 'audit-good.md');
    fs.writeFileSync(good, JSON.stringify(pack));
    fs.writeFileSync(goodText, '## R-ZZ\nnpx vitest run src/tests/z.test.ts --run\nTests  1 passed (1)\n');
    const ok = run(['--check', '--audit', goodText, '--pack', good], { cwd: made.r.dir, run: made.run });
    expect(ok.code).toBe(0);
    expect(ok.text).not.toContain('audit');
    const badText = path.join(tmpDir, 'audit-bad.md');
    fs.writeFileSync(badText, '## OTHER\nnothing here\n');
    const bad = run(['--check', '--audit', badText, '--pack', good], { cwd: made.r.dir, run: made.run });
    expect(bad.code).toBe(1);
    expect(bad.text).toContain('FAIL:R:audit-uncovered:R-ZZ');
    const missing = run(['--check', '--audit', path.join(tmpDir, 'nope.md'), '--pack', good], { cwd: made.r.dir, run: made.run });
    expect(missing.code).toBe(2);
    expect(missing.text).toContain('FAIL:R:cannot-decide:audit-file');
  });
});

describe('F-ARM the verdict letters are free', () => {
  it('the MB-67 by-law directory carries no promise or drift letter', () => {
    const dir = path.join(ROOT, 'scripts/analysis/mcbylaws');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.mjs'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      expect(text.includes('FAIL:R:')).toBe(false);
      expect(text.includes('FAIL:W:')).toBe(false);
    }
  });

  it('this task files the R and W letters', () => {
    const own = path.join(ROOT, 'scripts/analysis/mcbylaws-promises');
    const mod = fs.readFileSync(path.join(own, 'mcbylaws-promises.mjs'), 'utf8');
    const others = fs.readdirSync(own).filter((f) => f.endsWith('.mjs')).map((f) => fs.readFileSync(path.join(own, f), 'utf8'));
    expect(mod).toContain('FAIL:R:');
    expect(others.some((t) => t.includes('FAIL:W:'))).toBe(true);
  });
});
