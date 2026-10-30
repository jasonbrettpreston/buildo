// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md PR-68 / M-3xx (the loop gate runs the committed set and reports what it saw)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-68/plan.md sections 2, 3, 8 (got_sha G68-11; the producer is spawned, never inlined; per-mode groups)
// Red first. The scorer is spawned only through an injected fake `spawn` (unit tests) or the real one (the 172 test, skipped without the data dir).
import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const M = await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-gate-run.mjs'));

type Row = {
  notice: string;
  n: number;
  class: string;
  clause_norm: string | null;
  ours: { status: string; value?: unknown; reason?: string | null } | null;
};
type Producer = {
  kind: string;
  data_dir?: string;
  notices?: string;
  parcels?: string;
  plan_facts?: string;
  floors?: string;
  pin?: string;
};
type Group = {
  id: string;
  introduced_in?: string;
  fast?: boolean;
  external?: boolean;
  producer?: Producer | undefined;
};
type Regression = { groups: Group[] };
type CaseOut = { group: string; id: string; status: string; value: unknown; reason: unknown; clause: unknown; got_sha: string };
type Call = { cmd: string; args: string[]; env: Record<string, string | undefined> };
type SpawnFn = (cmd: string, args: string[], opts: { env?: Record<string, string | undefined>; maxBuffer?: number }) => unknown;
type Deps = { spawn?: SpawnFn; rowsFor?: unknown };
type RunOut = {
  cases: CaseOut[];
  skipped: number;
  canary: { id: string | null; observed: string };
  report: { violations: string[]; owed: unknown[] };
  counts: { [k: string]: number };
  baseRows: unknown;
  curRows: { group: string; id: string; status: string; clause: unknown }[] | null;
  regenMismatch: string[];
  groups: { id: string; introduced_in?: string | undefined }[];
  floorsOk: boolean;
};

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mcbylaws-loop-gate-run-'));
afterAll(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

const DATA_DIR = path.join(TMP, 'coa-data');
const pinFile = path.join(TMP, 'pin.json');
const floorsFile = path.join(TMP, 'floors.json');

const row = (n: number, over: Partial<Row> = {}): Row => ({
  notice: 'A0001/26',
  n,
  class: 'MATCH',
  clause_norm: '10.20.40.40(1)',
  ours: { status: 'value', value: 1.2, reason: null },
  ...over,
});

// A fake spawn: records the call and writes a small scorecard JSON to the --out path, like coa-scorecard.mjs does.
function fakeSpawn(rows: Row[], calls: Call[]): SpawnFn {
  return (cmd, args, opts) => {
    calls.push({ cmd, args, env: opts.env ?? {} });
    const i = args.indexOf('--out');
    const out = args[i + 1] ?? '';
    fs.writeFileSync(out, JSON.stringify({ rows }));
    return Buffer.from('');
  };
}

const group = (over: Partial<Group> = {}): Group => ({
  id: '172',
  introduced_in: '1',
  fast: true,
  external: true,
  producer: {
    kind: 'coa-scorecard',
    data_dir: DATA_DIR,
    notices: 'notices-all2.json',
    parcels: 'parcels-all2.json',
    plan_facts: 'plan-facts',
    floors: floorsFile,
    pin: pinFile,
  },
  ...over,
});

// Groups with no floors and no pin file: the floors helper gets an empty floors file (no lines), so checkPercentFloors is green.
function prepFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(floorsFile, JSON.stringify({ overall: {}, articles: {}, pooled: null }));
  fs.writeFileSync(pinFile, JSON.stringify({ totals: { MATCH: 2 } }));
}
prepFiles();

describe('expandHome', () => {
  it('expands a leading ~ to the home directory', () => {
    expect(M.expandHome('~/Buildo-scratch/coa-data')).toBe(path.join(os.homedir(), 'Buildo-scratch/coa-data'));
    expect(M.expandHome('~')).toBe(os.homedir());
  });
  it('leaves a path without ~ unchanged, and a bare ~ in the middle is not expanded', () => {
    expect(M.expandHome('/abs/path')).toBe('/abs/path');
    expect(M.expandHome('rel/~path')).toBe('rel/~path');
  });
});

describe('casesFromRows: the ids and the computed got_sha (G68-11)', () => {
  const rows = [row(1), row(2, { notice: 'A0002/26', class: 'DIFFER', ours: { status: 'value', value: 1.5, reason: 'ours 1.5 vs City 1.2' } })];

  it('ids are "<notice>|<n>", the group is kept, and the status is the printed class', () => {
    const cases = M.casesFromRows('172', rows) as CaseOut[];
    expect(cases.map((c) => c.id)).toEqual(['A0001/26|1', 'A0002/26|2']);
    expect(cases.map((c) => c.group)).toEqual(['172', '172']);
    expect(cases.map((c) => c.status)).toEqual(['MATCH', 'DIFFER']);
    expect(cases[0]?.value).toBe(1.2);
    expect(cases[1]?.reason).toBe('ours 1.5 vs City 1.2');
    expect(cases[0]?.clause).toBe('10.20.40.40(1)');
  });

  it('the got_sha is stable across two calls (a rerun gives identical hashes)', () => {
    const a = M.casesFromRows('172', rows) as CaseOut[];
    const b = M.casesFromRows('172', rows) as CaseOut[];
    expect(a.map((c) => c.got_sha)).toEqual(b.map((c) => c.got_sha));
    expect(a.every((c) => /^[0-9a-f]{64}$/.test(c.got_sha))).toBe(true);
    // the hash covers the printed class as well as the value
    const moved = M.casesFromRows('172', [row(1, { class: 'DIFFER' })]) as CaseOut[];
    expect(moved[0]?.got_sha).not.toBe(a[0]?.got_sha);
  });

  it('a changed value changes got_sha', () => {
    const base = M.casesFromRows('172', [row(1)]) as CaseOut[];
    const changed = M.casesFromRows('172', [row(1, { ours: { status: 'value', value: 1.3, reason: null } })]) as CaseOut[];
    expect(changed[0]?.got_sha).not.toBe(base[0]?.got_sha);
  });

  it('a row with no ours is still a case, with a written null value', () => {
    const cases = M.casesFromRows('172', [row(1, { ours: null })]) as CaseOut[];
    expect(cases).toHaveLength(1);
    expect(cases[0]?.value).toBeNull();
    expect(typeof cases[0]?.got_sha).toBe('string');
  });
});

describe('runProducer: spawns the committed scorer (never inlined)', () => {
  it('the argv names root, the expanded data dir, plan facts and an --out under a temp dir; the temp dir is removed', () => {
    const calls: Call[] = [];
    const res = M.runProducer(ROOT, group(), { spawn: fakeSpawn([row(1)], calls) }) as { rows: Row[]; cases: CaseOut[]; scorecard: unknown };
    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call?.cmd).toBe('node');
    const args = call?.args ?? [];
    expect(args[0]).toBe(path.join(ROOT, 'scripts/analysis/bylaw-validation/coa-scorecard.mjs'));
    expect(args).toContain('--root');
    expect(args[args.indexOf('--root') + 1]).toBe(ROOT);
    expect(args).toContain('--notices');
    expect(args[args.indexOf('--notices') + 1]).toBe(path.join(DATA_DIR, 'notices-all2.json'));
    expect(args[args.indexOf('--parcels') + 1]).toBe(path.join(DATA_DIR, 'parcels-all2.json'));
    expect(args[args.indexOf('--plan-facts') + 1]).toBe(path.join(DATA_DIR, 'plan-facts'));
    const out = args[args.indexOf('--out') + 1] ?? '';
    expect(path.isAbsolute(out)).toBe(true);
    expect(fs.existsSync(path.dirname(out))).toBe(false);
    expect(res.rows).toHaveLength(1);
    expect(res.cases[0]?.id).toBe('A0001/26|1');
    expect(res.scorecard).toBeTruthy();
  });

  it('the child env drops every GIT_* variable and asks for a large buffer', () => {
    const calls: Call[] = [];
    let maxBuffer = 0;
    const spawn: SpawnFn = (cmd, args, opts) => {
      maxBuffer = opts.maxBuffer ?? 0;
      return fakeSpawn([row(1)], calls)(cmd, args, opts);
    };
    M.runProducer(ROOT, group(), { spawn });
    const env = calls[0]?.env ?? {};
    expect(Object.keys(env).some((k) => k.startsWith('GIT_'))).toBe(false);
    expect(maxBuffer).toBeGreaterThanOrEqual(64 * 1024 * 1024);
  });

  it('a non-zero exit throws (the gate never reads a partial scorecard)', () => {
    const spawn: SpawnFn = () => {
      throw new Error('Command failed: exit 1');
    };
    expect(() => M.runProducer(ROOT, group(), { spawn })).toThrow(/exit 1|failed/i);
  });

  it('an unknown producer kind throws', () => {
    const spawn: SpawnFn = () => Buffer.from('');
    expect(() => M.runProducer(ROOT, group({ producer: { kind: 'other' } }), { spawn })).toThrow(/unknown_producer/);
    expect(() => M.runProducer(ROOT, group({ producer: undefined }), { spawn })).toThrow(/unknown_producer/);
  });

  it('a missing data_dir throws data_missing: <dir>, even before any spawn', () => {
    const calls: Call[] = [];
    expect(() => M.runProducer(ROOT, group({ producer: { kind: 'coa-scorecard', data_dir: path.join(TMP, 'gone') } }), { spawn: fakeSpawn([row(1)], calls) })).toThrow(
      /data_missing/,
    );
    expect(calls).toHaveLength(0);
  });
});

describe('pinMismatch: the committed pin against the rows just scored', () => {
  it('equal totals and row count is green', () => {
    fs.writeFileSync(pinFile, JSON.stringify({ totals: { MATCH: 2, DIFFER: 1 }, variances: 3 }));
    const rows = [row(1), row(2), row(3, { class: 'DIFFER' })];
    expect(M.pinMismatch(group(), rows, ROOT)).toEqual([]);
  });

  it('a total that differs is reported', () => {
    fs.writeFileSync(pinFile, JSON.stringify({ totals: { MATCH: 2, DIFFER: 1 }, variances: 3 }));
    expect(M.pinMismatch(group(), [row(1), row(2), row(3)], ROOT)).toContain('generated_not_regenerable');
  });

  it('a row count that differs is reported', () => {
    fs.writeFileSync(pinFile, JSON.stringify({ totals: { MATCH: 1 }, variances: 5 }));
    expect(M.pinMismatch(group(), [row(1)], ROOT)).toContain('generated_not_regenerable');
  });

  it('a group without a pin has nothing to compare', () => {
    expect(M.pinMismatch(group({ producer: { kind: 'coa-scorecard', data_dir: DATA_DIR } }), [row(1)], ROOT)).toEqual([]);
  });
});

describe('computeRun: the groups a mode runs', () => {
  const twoRows = [row(1), row(2)];

  it('commit runs only the fast groups', () => {
    const calls: Call[] = [];
    const regression: Regression = {
      groups: [group({ id: '172', fast: true }), group({ id: '4d', fast: false, producer: { kind: 'coa-scorecard', data_dir: DATA_DIR } })],
    };
    fs.writeFileSync(pinFile, JSON.stringify({ totals: { MATCH: 2 }, variances: 2 }));
    const run = M.computeRun({ root: ROOT, regression, mode: 'commit', registerText: '', deps: { spawn: fakeSpawn(twoRows, calls) } }) as RunOut | null;
    expect(calls).toHaveLength(1);
    expect(run).toBeTruthy();
    expect(run?.groups.map((g) => g.id)).toEqual(['172', '4d']);
    expect(run?.cases.every((c) => c.group === '172')).toBe(true);
    expect(run?.counts).toEqual({ '172 cases': 2 });
  });

  it('push runs every group', () => {
    const calls: Call[] = [];
    const regression: Regression = {
      groups: [group({ id: '172', fast: true }), group({ id: '4d', fast: false, producer: { kind: 'coa-scorecard', data_dir: DATA_DIR } })],
    };
    const run = M.computeRun({ root: ROOT, regression, mode: 'push', registerText: '', deps: { spawn: fakeSpawn(twoRows, calls) } }) as RunOut | null;
    expect(calls).toHaveLength(2);
    expect(run?.cases).toHaveLength(4);
    expect(run?.counts).toEqual({ '172 cases': 2, '4d cases': 2 });
  });

  it('ci skips the external groups and returns null when no group is left', () => {
    const calls: Call[] = [];
    const onlyExternal: Regression = { groups: [group({ id: '172', external: true })] };
    expect(M.computeRun({ root: ROOT, regression: onlyExternal, mode: 'ci', registerText: '', deps: { spawn: fakeSpawn(twoRows, calls) } })).toBeNull();
    expect(calls).toHaveLength(0);
    const mixed: Regression = { groups: [group({ id: '172', external: true }), group({ id: '4d', external: false, producer: { kind: 'coa-scorecard', data_dir: DATA_DIR } })] };
    const run = M.computeRun({ root: ROOT, regression: mixed, mode: 'ci', registerText: '', deps: { spawn: fakeSpawn(twoRows, calls) } }) as RunOut | null;
    expect(calls).toHaveLength(1);
    expect(run?.counts).toEqual({ '4d cases': 2 });
  });

  it('returns the run shape evaluateGate reads, with a red canary on a normal run', () => {
    fs.writeFileSync(pinFile, JSON.stringify({ totals: { MATCH: 2 }, variances: 2 }));
    const regression: Regression = { groups: [group()] };
    const run = M.computeRun({ root: ROOT, regression, mode: 'push', registerText: '', deps: { spawn: fakeSpawn(twoRows, []) } }) as RunOut | null;
    expect(run).toBeTruthy();
    if (!run) return;
    expect(run.skipped).toBe(0);
    expect(run.baseRows).toBeNull();
    expect(run.canary.observed).toBe('fail');
    expect(run.canary.id).toBe('A0001/26|1');
    expect(run.report.violations).toEqual([]);
    expect(run.report.owed).toEqual([]);
    expect(run.regenMismatch).toEqual([]);
    expect(run.floorsOk).toBe(true);
    expect(run.curRows).toEqual([
      { group: '172', id: 'A0001/26|1', status: 'MATCH', clause: '10.20.40.40(1)' },
      { group: '172', id: 'A0001/26|2', status: 'MATCH', clause: '10.20.40.40(1)' },
    ]);
    expect(run.groups).toHaveLength(1);
    expect(run.groups[0]?.id).toBe('172');
  });

  it('a floors violation surfaces as report.violations and floorsOk false', () => {
    // a line named by no register row is a hard FAIL: rows under a floor of 101 % is the fault injected, and the gate says so
    // (its two MATCH rows measure 100 %, below 101 %)
    const regression: Regression = {
      groups: [group({ producer: { kind: 'coa-scorecard', data_dir: DATA_DIR, floors: floorsFile } })],
    };
    fs.writeFileSync(floorsFile, JSON.stringify({ overall: { accuracy: 101 }, articles: {}, pooled: null }));
    const run = M.computeRun({ root: ROOT, regression, mode: 'push', registerText: '', deps: { spawn: fakeSpawn([row(1), row(2)], []) } }) as RunOut | null;
    expect(run?.floorsOk).toBe(false);
    expect(run?.report.violations.some((v) => v.includes('floor_fell:overall accuracy'))).toBe(true);
    // an OWED line is not a violation (M-372), and the owed line is returned so checkOwedRatchet can watch it
    const owedText = [
      '| **M-999** | **OWED to Phase 3: overall accuracy.** | RULED 2026-01-01 OWED to Phase 3 (MB-1) since 2026-01-01 |',
    ].join('\n');
    const owedRun = M.computeRun({ root: ROOT, regression, mode: 'push', registerText: owedText, deps: { spawn: fakeSpawn([row(1), row(2)], []) } }) as RunOut | null;
    expect(owedRun?.floorsOk).toBe(true);
    expect(owedRun?.report.owed).toHaveLength(1);
    fs.writeFileSync(floorsFile, JSON.stringify({ overall: {}, articles: {}, pooled: null }));
  });

  it('a pin mismatch is carried in regenMismatch', () => {
    fs.writeFileSync(pinFile, JSON.stringify({ totals: { MATCH: 99 }, variances: 2 }));
    const regression: Regression = { groups: [group()] };
    const run = M.computeRun({ root: ROOT, regression, mode: 'push', registerText: '', deps: { spawn: fakeSpawn(twoRows, []) } }) as RunOut | null;
    expect(run?.regenMismatch).toEqual(['172 generated_not_regenerable']);
  });
});

const REAL_DATA = path.join(os.homedir(), 'Buildo-scratch/coa-data');
const have = fs.existsSync(REAL_DATA);

describe.skipIf(!have)('the real 172 group (MB-68 B7d)', () => {
  const regression: Regression = {
    groups: [
      {
        id: '172',
        introduced_in: '1',
        fast: true,
        external: true,
        producer: {
          kind: 'coa-scorecard',
          data_dir: '~/Buildo-scratch/coa-data',
          notices: 'notices-all2.json',
          parcels: 'parcels-all2.json',
          plan_facts: 'plan-facts',
          floors: 'scripts/analysis/bylaw-validation/coa-expected/floors-172.json',
          pin: 'scripts/analysis/bylaw-validation/coa-expected/expected-172.json',
        },
      },
    ],
  };

  it('698 cases with unique ids, the pin regenerated, canary red, floors checked, and a second run hashes identically', () => {
    const first = M.computeRun({ root: ROOT, regression, mode: 'push', registerText: '' }) as RunOut | null;
    expect(first).toBeTruthy();
    if (!first) return;
    expect(first.cases).toHaveLength(698);
    expect(new Set(first.cases.map((c) => c.id)).size).toBe(698);
    // the article 10.5.40 accuracy line is owed (M-372: measured 91.7 % against floor 94 %, the prereg baseline): it is reported in
    // report.owed and is NOT a violation; without the register text the gate cannot know it is owed, so it is a hard FAIL again.
    expect(first.floorsOk).toBe(first.report.violations.length === 0);
    expect(first.report.violations.every((v) => /floor_fell:article 10\.5\.40 accuracy/.test(v))).toBe(true);
    expect(first.regenMismatch).toEqual([]);
    expect(first.canary.observed).toBe('fail');
    const second = M.computeRun({ root: ROOT, regression, mode: 'push', registerText: '' }) as RunOut | null;
    expect(second).toBeTruthy();
    if (!second) return;
    expect(second.cases.map((c) => `${c.id}:${c.got_sha}`)).toEqual(first.cases.map((c) => `${c.id}:${c.got_sha}`));
  }, 60000);
});
