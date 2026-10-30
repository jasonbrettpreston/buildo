// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md PR-68 (the loop gate runs the committed regression set on the REAL repo data, and its CLI answers 2 when it cannot run)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-68/plan.md section 13 (the end-to-end suite: the real set, the real floors, the real run, the real CLI)
//
// B8a: no fakes and no fixtures copied into temp. The regression set, the percent floors file, the register rows and the committed pin are the
// repo's own, read under ROOT; the scorer is the committed one, spawned exactly as the gate spawns it. Only the run itself is skipped when the
// external CoA data dir is not on this machine (the producer's data is not in the tree). Every red case has a green twin.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(__dirname, '../..');
const GATE = path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-gate.mjs');

/** A child env free of every GIT_* variable: inside a hook GIT_DIR / GIT_INDEX_FILE point at the CALLING repo. */
const cleanEnv = (): NodeJS.ProcessEnv => Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))) as NodeJS.ProcessEnv;
// Inside the vitest worker process.execPath is the pool's runner, not a standalone node; PATH's node is spawned when it exists (the shell's
// entry guard needs loop-gate.mjs as argv[1]), else the harness runtime is used as is.
const NODE_BIN = String(spawnSync('which', ['node'], { encoding: 'utf8', env: cleanEnv() }).stdout || '').trim() || process.execPath;

const M = (await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-regression.mjs'))) as unknown as RegressionModule;
const F = (await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-floors.mjs'))) as unknown as FloorsModule;
const R = (await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-gate-run.mjs'))) as unknown as RunModule;
const D = (await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-decide.mjs'))) as unknown as DecideModule;
const U = (await import(path.join(ROOT, 'scripts/analysis/bylaw/universe.mjs'))) as unknown as UniverseModule;

type Group = { id: string; ids: string[]; ids_sha256?: string; [k: string]: unknown };
type Regression = { groups: Group[]; pending: unknown[]; removals: unknown[]; [k: string]: unknown };
type RegressionModule = {
  loadRegression: (root: string) => Regression;
  checkRegression: (base: Regression | null, cur: Regression, rulings: Map<string, string>) => string[];
  idsSha: (ids: string[]) => string;
  isAuthorityStatus: (status: string | undefined) => boolean;
};
type Floors = {
  overall?: { accuracy?: number; answered?: number };
  articles?: { [article: string]: { accuracy?: number; answered?: number } };
  pooled?: { accuracy?: number; answered?: number } | null;
  rulings?: unknown[];
  [k: string]: unknown;
};
type FloorsModule = {
  checkFloorEdit: (base: Floors | null, cur: Floors, rulings: Map<string, string>) => string[];
  flattenFloors: (floors: Floors) => { [line: string]: number };
};
type RunCase = { group: string; id: string; status: string; value: unknown; reason: unknown; clause: unknown; got_sha: string };
type RunOut = {
  cases: RunCase[];
  skipped: number;
  canary: { id: string | null; observed: string };
  report: { violations: string[]; owed: { group: string; line: string; measured: number; floor: number }[] };
  counts: { [k: string]: number };
  curRows: { group: string; id: string; status: string; clause: unknown }[];
  regenMismatch: string[];
  groups: { id: string; introduced_in?: string | undefined }[];
  floorsOk: boolean;
};
type RunModule = {
  computeRun: (a: { root: string; regression: Regression; mode: string; registerText: string }) => RunOut | null;
  coversAllGroups: (run: RunOut | null, regression: Regression) => boolean;
  registerTextOf: (root: string) => string;
  groupsForMode: (regression: Regression, mode: string) => Group[];
};
type DecideModule = {
  checkRun: (a: { declaredIds: string[]; cases: RunCase[]; skipped?: number; canary: { id: string | null; observed: string } }) => string[];
};
type UniverseModule = {
  readSpec69Rulings: (root: string) => string;
  parseRulings: (text: string) => Map<string, string>;
};

const SET = M.loadRegression(ROOT);
const groupOf = (id: string): Group => {
  const found = SET.groups.find((g) => g.id === id);
  if (!found) throw new Error(`regression group not found: ${id}`);
  return found;
};
const REAL_DATA = path.join(os.homedir(), 'Buildo-scratch/coa-data');
const haveData = fs.existsSync(REAL_DATA);

// ─── 3. the real regression set (always) ──────────────────────────────────────────────────────────────────────────────────────
describe('the real regression set (mcbylaws/loop/regression-set.json + its ids files)', () => {
  it('holds coa172 (698 ids) and coa4d (496 ids), every hash matches its list, and every id is unique', () => {
    expect(SET.groups.map((g) => g.id)).toEqual(['coa172', 'coa4d']);
    expect(groupOf('coa172').ids).toHaveLength(698);
    expect(groupOf('coa4d').ids).toHaveLength(496);
    expect(SET.groups.length).toBe(2);
    for (const g of SET.groups) {
      expect(g.ids.length).toBeGreaterThan(0);
      expect(g.ids_sha256).toBe(M.idsSha(g.ids));
      expect(new Set(g.ids).size).toBe(g.ids.length);
      expect(g.ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    }
    // the cases are keyed by id alone (no group in the record, checkCasesPresent), so no id may appear twice across the groups
    // (the 4d rows are a subset of the 172 rows by design: coa4d adds no case the 172 set does not hold)
    const all = new Set(SET.groups.flatMap((g) => g.ids));
    expect(all.size).toBeGreaterThanOrEqual(698);
    const coa172 = new Set(groupOf('coa172').ids);
    for (const id of groupOf('coa4d').ids) expect(coa172.has(id)).toBe(true);
  });

  it('the set against nothing (null) and against itself is green', () => {
    expect(M.checkRegression(null, SET, new Map())).toEqual([]);
    expect(M.checkRegression(SET, SET, new Map())).toEqual([]);
  });

  it('dropping one id from a clone of coa172 (sha recomputed) is reported against the real set', () => {
    const clone: Regression = JSON.parse(JSON.stringify(SET));
    const g = clone.groups.find((x) => x.id === 'coa172');
    if (!g) throw new Error('coa172 missing from the clone');
    const dropped = g.ids[0];
    if (dropped === undefined) throw new Error('coa172 has no ids');
    g.ids = g.ids.slice(1);
    g.ids_sha256 = M.idsSha(g.ids);
    const out = M.checkRegression(SET, clone, new Map());
    expect(out).toContain(`regression_case_removed:coa172|${dropped}`);
    expect(out).toContain('regression_count_fell:coa172');
    // the clone is internally consistent (the hash was recomputed), so nothing else is reported
    expect(out.filter((v) => v.startsWith('ids_sha_mismatch'))).toEqual([]);
    expect(out).toHaveLength(2);
  });
});

// ─── 4. the real percent floors file (always) ─────────────────────────────────────────────────────────────────────────────────
const FLOORS_FILE = path.join(ROOT, 'scripts/analysis/bylaw-validation/coa-expected/floors-172.json');
const readFloors = (): Floors => JSON.parse(fs.readFileSync(FLOORS_FILE, 'utf8')) as Floors;

describe('the real percent floors (coa-expected/floors-172.json)', () => {
  it('the file against itself is green, and it holds the overall accuracy line', () => {
    const f = readFloors();
    expect(F.checkFloorEdit(f, f, new Map())).toEqual([]);
    expect(F.flattenFloors(f)['overall accuracy']).toBe(92);
    expect(Array.isArray(f.rulings)).toBe(true);
  });

  it('a lowered overall accuracy with a forged ruling is refused twice', () => {
    const f = readFloors();
    const clone: Floors = JSON.parse(JSON.stringify(f));
    clone.overall = { ...(clone.overall ?? {}), accuracy: 50 };
    clone.rulings = [...(clone.rulings ?? []), { ruling: 'RULED-FAKE-999', lines: [{ line: 'overall accuracy' }] }];
    const out = F.checkFloorEdit(f, clone, new Map());
    expect(out).toContain('ruling_not_authority:RULED-FAKE-999');
    expect(out).toContain('floor_lowered_without_ruling:overall accuracy');
  });

  it('the same edit named M-322 is excused: M-322 is authority in the real register', () => {
    const rulings = U.parseRulings(U.readSpec69Rulings(ROOT));
    // the ruling must resolve in the REAL register (G68-02): RULED or RATIFIED, never the fallback
    expect(rulings.get('M-322')).toBe('RULED');
    expect(M.isAuthorityStatus(rulings.get('M-322'))).toBe(true);

    const f = readFloors();
    const clone: Floors = JSON.parse(JSON.stringify(f));
    clone.overall = { ...(clone.overall ?? {}), accuracy: 50 };
    clone.rulings = [...(clone.rulings ?? []), { ruling: 'M-322', lines: [{ line: 'overall accuracy' }] }];
    expect(F.checkFloorEdit(f, clone, rulings)).toEqual([]);
    // green twin: the same clone checked with no rulings map is red, so the green above is the authority lookup, not a no-op
    expect(F.checkFloorEdit(f, clone, new Map())).toContain('ruling_not_authority:M-322');
  });
});

// ─── 5. the real run (skipped only when the external data is not on this machine) ────────────────────────────────────────────
describe.skipIf(!haveData)('the real run (mode push over the committed set)', () => {
  it('the run covers the committed set: 1194 cases, the pin regenerates, the canary is red, every case is hashed, nothing is missing', () => {
    const registerText = R.registerTextOf(ROOT);
    expect(registerText.length).toBeGreaterThan(0);
    const groups = R.groupsForMode(SET, 'push');
    expect(groups.map((g) => g.id)).toEqual(['coa172', 'coa4d']);

    const run = R.computeRun({ root: ROOT, regression: SET, mode: 'push', registerText });
    expect(run).toBeTruthy();
    if (!run) return;

    // the run covers the whole set: 698 + 496 case ids
    expect(R.coversAllGroups(run, SET)).toBe(true);
    expect(run.cases).toHaveLength(698 + 496);
    expect(run.counts['coa172 cases']).toBe(698);
    expect(run.counts['coa4d cases']).toBe(496);
    expect(run.cases.filter((c) => c.group === 'coa172')).toHaveLength(698);
    expect(run.cases.filter((c) => c.group === 'coa4d')).toHaveLength(496);

    // the committed pin regenerates, and the canary proves the comparison detects a mutation
    expect(run.regenMismatch).toEqual([]);
    expect(run.canary.observed).toBe('fail');

    // every case carries the hash of its printed class and value (G68-11)
    expect(run.cases.every((c) => /^[0-9a-f]{64}$/.test(c.got_sha))).toBe(true);
    expect(new Set(run.cases.map((c) => c.got_sha)).size).toBeGreaterThan(0);

    // run honesty over the declared ids: every declared case ran, none skipped, every one hashed
    const declaredIds = SET.groups.flatMap((g) => g.ids);
    expect(declaredIds).toHaveLength(698 + 496);
    expect(D.checkRun({ declaredIds, cases: run.cases, skipped: run.skipped, canary: run.canary })).toEqual([]);
    // green twin: one id the run did not produce is reported (the guard is not vacuous)
    const fewer = D.checkRun({ declaredIds: [...declaredIds, 'ZZZZ/99|1'], cases: run.cases, skipped: run.skipped, canary: run.canary });
    expect(fewer).toContain('case_missing:ZZZZ/99|1');
    expect(fewer).toContain('ran_fewer_than_declared:1');

    // ---- floors: the coa172 group HOLDS (one OWED line), the coa4d group is RED for a stated, real reason; see the next test ----
    // Measured 91.7 % on the 172 article 10.5.40 accuracy, which M-372 owes: reported, never counted as PASS, never a FAIL (M-360).
    const owed172 = run.report.owed.filter((o) => o.group === 'coa172').map((o) => o.group + ' ' + o.line);
    expect(owed172).toEqual(['coa172 article 10.5.40 accuracy']);
    const v172 = run.report.violations.filter((v) => !v.startsWith('coa4d '));
    expect({ v172, owed: owed172 }).toEqual({ v172: [], owed: ['coa172 article 10.5.40 accuracy'] });
  }, 120000);

  it('the coa4d group is red: it names no percent floors file, so every article with 10 or more scored rows fails by the floors rule', () => {
    // Diagnose from the run itself: strip coa4d's floors reference and both groups hold, which proves the FAILs are the
    // missing floors file and nothing the scorer measured. Kept here (not in the assertions above) because it is the finding
    // this suite reports to the operator: scripts/analysis/bylaw-validation/coa-expected/ has floors-172.json only.
    const with172 = SET.groups.find((g) => g.id === 'coa172');
    const with4d = SET.groups.find((g) => g.id === 'coa4d');
    if (!with172 || !with4d) throw new Error('regression groups not found');
    const producer172 = with172.producer as { floors?: string } | undefined;
    const producer4d = with4d.producer as { floors?: string } | undefined;
    expect(producer172?.floors).toBe('scripts/analysis/bylaw-validation/coa-expected/floors-172.json');
    expect(producer4d?.floors).toBeUndefined();
    expect(fs.existsSync(path.join(ROOT, 'scripts/analysis/bylaw-validation/coa-expected/floors-4d.json'))).toBe(false);

    const real = R.computeRun({ root: ROOT, regression: SET, mode: 'push', registerText: R.registerTextOf(ROOT) });
    expect(real).toBeTruthy();
    if (!real) return;
    expect(real.floorsOk).toBe(false);
    const fourD = real.report.violations.filter((v) => v.startsWith('coa4d '));
    expect(fourD.length).toBeGreaterThan(0);
    expect(fourD.every((v) => /^coa4d floor_fell:article \d+(?:\.\d+)+ has 10 or more scored rows and no floor \(add it with --accept --ruling\)$/.test(v))).toBe(true);

    // green twin: the coa172 group ALONE through the same computeRun holds and owes exactly the one 172 line. The 4d FAILs
    // above are therefore the group's own floors data (no percent floors file named, so the empty-floor rule fails every
    // article with 10 or more scored rows), not anything the scorer or the 172 floors measured.
    const only172: Regression = JSON.parse(JSON.stringify(SET));
    only172.groups = only172.groups.filter((g) => g.id === 'coa172');
    const relaxed = R.computeRun({ root: ROOT, regression: only172, mode: 'push', registerText: R.registerTextOf(ROOT) });
    expect(relaxed).toBeTruthy();
    if (!relaxed) return;
    expect(relaxed.cases).toHaveLength(698);
    expect(relaxed.report.violations).toEqual([]);
    expect(relaxed.floorsOk).toBe(true);
    expect(relaxed.report.owed.map((o) => `${o.group} ${o.line}`)).toEqual(['coa172 article 10.5.40 accuracy']);
  }, 120000);
});

// ─── 6. the real CLI (always) ────────────────────────────────────────────────────────────────────────────────────────────────
type CliResult = { status: number | null; stdout: string; stderr: string };
const cli = (args: string[]): CliResult => {
  const res = spawnSync(NODE_BIN, [GATE, ...args], { cwd: ROOT, encoding: 'utf8', env: cleanEnv(), timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
  if (res.error) throw res.error;
  return { status: res.status, stdout: String(res.stdout ?? ''), stderr: String(res.stderr ?? '') };
};

describe('the real CLI (scripts/analysis/mcbylaws-loop/loop-gate.mjs)', () => {
  it('no arguments -> exit 2 (could not run) and the usage line', () => {
    const res = cli([]);
    expect(res.status).toBe(2);
    expect(res.stdout).toContain('usage: loop-gate');
  });

  it('--mode bogus -> exit 2 and the bad mode named', () => {
    const res = cli(['--mode', 'bogus']);
    expect(res.status).toBe(2);
    expect(res.stdout).toContain('bad_mode:bogus');
  });

  it('verify --json -> exit 0 and stdout parses as JSON (an array)', () => {
    const res = cli(['verify', '--json']);
    expect(res.status).toBe(0);
    const lines = res.stdout.split('\n').filter((line) => line.trim().length > 0);
    expect(lines.length).toBeGreaterThan(0);
    // stdout is JSON: the console line (the per-increment array) or, with no record on disk, the shell's report object
    const parsed = JSON.parse(lines[0] ?? '') as unknown;
    if (!Array.isArray(parsed)) throw new Error(`verify --json: stdout is not an array: ${lines[0] ?? ''}`);
    expect(parsed.length).toBeGreaterThanOrEqual(0);
    // no record on disk: the command answers through the shell's report path (the plain object, not the console array)
    if (parsed.length === 0) {
      expect(JSON.parse(lines[lines.length - 1] ?? '')).toMatchObject({ command: 'verify', violations: [], notes: [] });
    }
  }, 60000);
});
