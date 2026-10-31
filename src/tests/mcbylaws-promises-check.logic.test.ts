// SPEC LINK: MB-73 plan sections 2 to 9; R-KQ (a row needs an artifact and a green), R-KU (an id never vanishes),
//            R-KK (the queue and the audit pack are witnesses). The whole `--check` pipeline against real temp repos.
import { afterAll, describe, expect, it } from 'vitest';
import { classify, dedupe, runCheck } from '../../scripts/analysis/mcbylaws-promises/promise-check.mjs';
import { queueCheck } from '../../scripts/analysis/mcbylaws/mcbylaws-queue-check.mjs';
import { makePromisesRepo } from './fixtures/mcbylaws-promises/fixture-repo';

const ART = 'mcbylaws/promises/artifacts.json';
const ZTEST = "import { expect, it } from 'vitest';\nimport { z } from '../lib/z.mjs';\nit('z holds', () => { expect(z).toBe(1); });\n";

const repos: { cleanup(): void }[] = [];
afterAll(() => {
  for (const r of repos) r.cleanup();
});

/** A fixture repo, registered for cleanup. */
function repo(opts: Record<string, boolean> = {}) {
  const made = makePromisesRepo(opts);
  repos.push(made.r);
  return made;
}

/** runCheck against one fixture commit (defaults to the records commit). */
function check(made: ReturnType<typeof repo>, extra: Record<string, unknown> = {}) {
  return runCheck({ cwd: made.r.dir, rev: made.rev, run: made.run, ...extra });
}

describe('promise-check fixture', () => {
  it('needs the script to exist', () => {
    expect(typeof runCheck).toBe('function');
    expect(typeof classify).toBe('function');
    expect(typeof dedupe).toBe('function');
  });
});

describe('promise-check green path', () => {
  it('reports a done promise with no lines', () => {
    const made = repo();
    const res = check(made);
    expect(res.lines).toEqual([]);
    expect(res.exit).toBe(0);
    expect((res.states as Record<string, string>)['R-ZZ']).toBe('done');
    expect(res.counts).toEqual({ done: 1, red: 0, notYet: 0 });
    expect(typeof res.registerHash).toBe('string');
    expect(res.registerHash).toHaveLength(64);
    expect((res.rows as Array<{ id: string }>).map((row) => row.id)).toEqual(['R-ZZ']);
  });
});

describe('promise-check reds', () => {
  const absent: { name: string; line: string; exit: number; opts?: Record<string, unknown>; edit?: (m: ReturnType<typeof repo>) => void }[] = [
    { name: 'F-P1 artifacts.json without the entry', line: 'FAIL:R:no-artifact:R-ZZ', exit: 1, edit: (m) => m.r.write(ART, '{}\n') },
    {
      name: 'F-P2 entry pointing at a missing file',
      line: 'FAIL:R:artifact-missing:R-ZZ',
      exit: 1,
      edit: (m) => m.r.write(ART, '{"R-ZZ":{"artifact":"src/tests/gone.test.ts","test_name":"z holds"}}\n'),
    },
    { name: 'F-D1 forbidden name in a scan root', line: 'FAIL:W:old-engine:src/old.mjs', exit: 1, edit: (m) => m.r.write('src/old.mjs', 'export const legacy = "zz-forbidden-name";\n') },
  ];
  for (const c of absent) {
    it(c.name, () => {
      const made = repo();
      c.edit?.(made);
      const res = check(made, { rev: made.commit() });
      expect(res.lines).toContain(c.line);
      expect(res.exit).toBe(c.exit);
    });
  }

  it('F-P12 queue untracked', () => {
    const made = repo({ queueTracked: false });
    const res = check(made);
    // No readable queue root means the source closure cannot be decided: fail closed with 2.
    expect(res.lines).toContain('FAIL:Q:queue-untracked');
    expect(res.lines.some((l: string) => l.startsWith('FAIL:R:cannot-decide'))).toBe(true);
    expect(res.exit).toBe(2);
  });

  it('F-P8 committed edit after the records', () => {
    const made = repo();
    made.r.write('src/lib/z.mjs', 'export const z = 2;\n');
    const res = check(made, { rev: made.commit() });
    expect(res.lines).toContain('FAIL:R:stale-green:R-ZZ');
    expect(res.exit).toBe(1);
    expect((res.states as Record<string, string>)['R-ZZ']).toBe('red');
  });

  it('F-P10 no red and no green', () => {
    const made = repo({ red: false, green: false });
    const res = check(made);
    expect(res.lines).toContain('FAIL:R:not-green:R-ZZ');
    expect(res.exit).toBe(1);
    expect((res.states as Record<string, string>)['R-ZZ']).toBe('red');
  });

  it('F-N0 unknown increment argument', () => {
    const res = check(repo(), { incArg: '0' });
    expect(res.lines).toContain('FAIL:R:cannot-decide:increment-unknown:0');
    expect(res.exit).toBe(2);
  });
});

describe('promise-check queues and records', () => {
  it('F-P4 passes every line the real queueCheck returns', () => {
    const made = repo();
    made.r.write('.cursor/MCBYLAWS-QUEUE.md', '# Q\n- MB-99\n');
    const rev = made.commit('queue');
    const real = queueCheck({ cwd: made.r.dir, rev });
    expect(real.length).toBeGreaterThan(0);
    const res = check(made, { rev });
    for (const line of real) expect(res.lines).toContain(line);
    expect(res.exit).toBe(1);
  });

  it('F-P10 red only is not yet', () => {
    const made = repo({ green: false });
    const res = check(made);
    expect(res.lines).toContain('FAIL:R:not-green:R-ZZ');
    expect((res.states as Record<string, string>)['R-ZZ']).toBe('not yet');
  });

  it('F-P3 a failed runner is not green', () => {
    const made = repo();
    const res = check(made, {
      run: () => ({ ok: true, json: { testResults: [{ name: '/x/src/tests/z.test.ts', assertionResults: [{ fullName: 'z holds', status: 'failed' }] }] } }),
    });
    expect(res.lines).toContain('FAIL:R:not-green:R-ZZ');
    expect(res.exit).toBe(1);
  });
});

describe('promise-check cannot decide', () => {
  it('scan config missing', () => {
    const res = check(repo({ scanConfig: false }));
    expect(res.lines).toContain('FAIL:R:cannot-decide:scan-config');
    expect(res.exit).toBe(2);
  });

  it('unreadable increments file', () => {
    const made = repo();
    made.r.write('scripts/analysis/mcbylaws-loop/data/increments.json', 'not json');
    const res = check(made, { rev: made.commit('increments') });
    expect(res.lines).toContain('FAIL:R:cannot-decide:increment-ids');
    expect(res.exit).toBe(2);
  });

  it('the runner cannot run', () => {
    const res = check(repo(), { run: () => ({ ok: false, reason: 'x' }) });
    expect(res.lines).toContain('FAIL:R:cannot-decide:run:x');
    expect(res.exit).toBe(2);
  });

  it('audit text without a pack', () => {
    const res = check(repo(), { auditText: '## R-ZZ\nwhatever\n' });
    expect(res.lines).toContain('FAIL:R:cannot-decide:audit-pack');
    expect(res.exit).toBe(2);
  });
});

describe('promise-check base and the run', () => {
  it('F-VANISH an id the base had and the later commit removed', () => {
    const made = repo();
    made.r.write(ART, '{"R-ZZ":{"artifact":"src/tests/z.test.ts","test_name":"z holds"},"R-GONE":{"artifact":"src/tests/z.test.ts","test_name":"z holds"}}\n');
    const base = made.commit('base with R-GONE');
    made.r.write(ART, '{"R-ZZ":{"artifact":"src/tests/z.test.ts","test_name":"z holds"}}\n');
    made.r.write('src/tests/z.test.ts', ZTEST);
    const later = made.commit('no more R-GONE');
    const res = check(made, { rev: later, base });
    expect(res.lines).toContain('FAIL:R:id-vanished:R-GONE');
    expect(res.exit).toBe(1);
  });

  it('calls the runner exactly once with the artifact paths', () => {
    const made = repo();
    const calls: unknown[] = [];
    const run = (args: { cwd: string; files: string[] }) => {
      calls.push(args);
      return made.run();
    };
    const res = check(made, { run });
    expect(calls).toHaveLength(1);
    expect((calls[0] as { files: string[] }).files).toEqual(['src/tests/z.test.ts']);
    expect(res.exit).toBe(0);
  });
});

describe('classify', () => {
  const table: { lines: string[]; exit: number }[] = [
    { lines: [], exit: 0 },
    { lines: ['FAIL:R:not-green:R-ZZ'], exit: 1 },
    { lines: ['FAIL:W:old-engine:src/a.mjs'], exit: 1 },
    { lines: ['FAIL:R:cannot-decide'], exit: 2 },
    { lines: ['FAIL:R:not-green:R-ZZ', 'FAIL:R:cannot-decide:run:x'], exit: 2 },
  ];
  for (const t of table) {
    it(`classify ${JSON.stringify(t.lines)} is ${t.exit}`, () => {
      expect(classify(t.lines)).toBe(t.exit);
    });
  }

  it('dedupe drops a repeated line and keeps the order', () => {
    expect(dedupe(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c']);
    expect(dedupe([])).toEqual([]);
  });
});
