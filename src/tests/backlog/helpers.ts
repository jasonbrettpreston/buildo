// Shared helpers for the Backlog-home tests (plan v8.1, R1). No product logic here: only process spawning, a tiny
// front-matter reader and fixture copying. The scripts under test (scripts/analysis/plan-to-backlog.mjs,
// backlog-brief.mjs, backlog-decision.mjs, backlog-next.mjs, scripts/hooks/check-backlog-task.mjs) are run as CLIs, so
// a missing script is a failed expectation on exit code and message, never an import error.
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export const ROOT = path.resolve(__dirname, '../../..');
export const FX = path.join(__dirname, 'fixtures');
export const RAW = path.join(FX, 'raw');
export const EXPECTED = JSON.parse(fs.readFileSync(path.join(FX, 'expected.json'), 'utf8')) as {
  expect: Record<string, { status: string; labels: string[]; ruling?: string } | null>;
  counts: { tasksMin: number; draftsExact: number };
  censusWords: string[];
  snapshotDate: string;
};

/** The pinned Backlog.md 1.55.3 binary: the repo devDependency first, else the pilot copy of the same version. */
export function backlogBin(): string {
  const cands = [path.join(ROOT, 'node_modules/.bin/backlog'), path.join(os.homedir(), 'Buildo-scratch/backlog-pilot/node_modules/.bin/backlog')];
  return cands.find((c) => fs.existsSync(c)) ?? (cands[0] as string);
}

export type Run = { status: number | null; stdout: string; stderr: string };
// BL-R3 note: git sets GIT_DIR, GIT_INDEX_FILE and friends while a pre-commit hook runs the related tests; if they leak into the temp repos below,
// `git add -A` and `git commit` land in the REAL repository (this happened once, see the BL-R3 report). So every child process gets a GIT_*-free environment.
const cleanEnv = (extra?: Record<string, string>): NodeJS.ProcessEnv => ({ ...(Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))) as NodeJS.ProcessEnv), ...extra });
export function run(cmd: string, args: string[], opts: { cwd?: string; input?: string; env?: Record<string, string> } = {}): Run {
  const r: SpawnSyncReturns<string> = spawnSync(cmd, args, { cwd: opts.cwd ?? ROOT, encoding: 'utf8', input: opts.input, env: cleanEnv(opts.env), maxBuffer: 1 << 26 });
  return { status: r.status, stdout: r.stdout ?? '', stderr: (r.stderr ?? '') + (r.error ? String(r.error) : '') };
}
export const script = (rel: string, args: string[], opts: { cwd?: string; input?: string } = {}) => run('node', [path.join(ROOT, rel), ...args], opts);
export const backlog = (cwd: string, args: string[]) => run(backlogBin(), args, { cwd });

export function tmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `bl-${prefix}-`));
}

/** Copy the fixture raw folder and regenerate SHA256SUMS after an edit callback, so a test can vary one file. */
export function rawCopy(edit?: (dir: string) => void, resum = true): string {
  const d = path.join(tmp('raw'), 'raw');
  fs.cpSync(RAW, d, { recursive: true });
  if (edit) edit(d);
  if (resum) {
    const names = fs.readdirSync(d).filter((f) => f !== 'SHA256SUMS').sort();
    fs.writeFileSync(path.join(d, 'SHA256SUMS'), names.map((n) => `${crypto.createHash('sha256').update(fs.readFileSync(path.join(d, n))).digest('hex')}  ${n}`).join('\n') + '\n');
  }
  return d;
}

export type Loaded = { run: Run; target: string; report: string; raw: string };
/** Run the loader once on a fixture raw folder into a fresh target; never throws. */
export function load(raw = RAW, extra: string[] = []): Loaded {
  const target = tmp('load');
  const report = path.join(target, 'import-report.md');
  const r = script('scripts/analysis/plan-to-backlog.mjs', [
    '--raw', raw, '--target', target, '--report', report, '--origin-root', path.join(FX, 'origin'), '--scratch-root', path.join(FX, 'scratch'),
    '--expect', `${EXPECTED.counts.tasksMin},${EXPECTED.counts.draftsExact}`, '--backlog-bin', backlogBin(), ...extra,
  ]);
  return { run: r, target, report, raw };
}
let memo: Loaded | undefined;
export const loadedFixture = (): Loaded => (memo ??= load());

export type FM = Record<string, string | string[]>;
export type TaskFile = { file: string; fm: FM; body: string; text: string };
export function parseFrontMatter(text: string): { fm: FM; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!m) return { fm: {}, body: text };
  const fm: FM = {};
  let key = '';
  for (const line of (m[1] ?? '').split('\n')) {
    const li = /^\s+-\s+(.*)$/.exec(line);
    if (li && key) { (fm[key] as string[]).push((li[1] ?? '').replace(/^'(.*)'$/, '$1').replace(/^"(.*)"$/, '$1')); continue; }
    const kv = /^([A-Za-z_]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    key = kv[1] ?? '';
    const v = (kv[2] ?? '').replace(/^'(.*)'$/, '$1').replace(/^"(.*)"$/, '$1');
    fm[key] = v === '' || v === '[]' ? [] : v;
  }
  return { fm, body: m[2] ?? '' };
}
export function readDir(dir: string): TaskFile[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort().map((f) => {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    return { file: f, text, ...parseFrontMatter(text) };
  });
}
export const tasksOf = (target: string) => readDir(path.join(target, 'backlog/tasks'));
export const draftsOf = (target: string) => readDir(path.join(target, 'backlog/drafts'));
export const labelsOf = (t: TaskFile) => ([] as string[]).concat(t.fm.labels ?? []);
/** The task or draft whose label `plan:<plan id>` names the plan item. */
export function byPlan(target: string, planId: string): TaskFile | undefined {
  return [...tasksOf(target), ...draftsOf(target)].find((t) => labelsOf(t).includes(`plan:${planId}`));
}
export const idNum = (id: string) => Number(/(\d+)$/.exec(String(id))?.[1]);

/** A hand-built Backlog project (no loader): init, configured statuses, then the caller's tasks. */
export function makeProject(): string {
  const d = tmp('proj');
  run('git', ['init', '-q', '.'], { cwd: d });
  backlog(d, ['init', 'fixture', '--defaults', '--agent-instructions', 'none', '--zero-padded-ids', '0', '--check-branches', 'false', '--auto-open-browser', 'false']);
  const cfg = path.join(d, 'backlog/config.yml');
  let t = fs.readFileSync(cfg, 'utf8');
  t = t.replace(/^default_status:.*$/m, 'default_status: "LATER"').replace(/^statuses:.*$/m, 'statuses: ["LATER", "WAITS", "RUNNING", "BUILT", "OPERATOR", "MERGED", "FROZEN", "DROPPED", "DONE"]');
  fs.writeFileSync(cfg, t + 'types: ["build", "record", "decision", "check", "push", "db-rehearsal", "db-go", "night", "fix", "db-run"]\nprojects: ["McBylaws", "McFrontend", "McIncrement"]\n');
  return d;
}
export function mk(d: string, title: string, args: string[] = []): string {
  const r = backlog(d, ['task', 'create', title, '--plain', ...args]);
  const m = /Task (TASK-\d+)/i.exec(r.stdout);
  if (!m) throw new Error(`task create failed: ${r.stdout}${r.stderr}`);
  return (m[1] ?? '').toLowerCase();
}
