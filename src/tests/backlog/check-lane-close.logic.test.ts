// SPEC LINK: task-366 (COMPLY.2); Spec 08 section 7 rule 4 and section 5.3 (08_agents.md: every DeepSeek finding is adjudicated by a separate grounder, rejections carry reasons);
// Spec 137 section 4 rule 3 (137_mcqueue.md:84, the status line moves in the same commit as the work).
// scripts/hooks/check-lane-close.mjs <commit-msg-file> (cwd = a repo with staged files): a commit `Task: task-N` that moves the task file to BUILT or DONE is refused unless
// docs/reports/lanes/<date>/<lane>/ holds the lens set the task type calls for (compliance once per attached list, plus code-review and error-paths (ux, security by Files line)
// for a build or fix task), and a GROUNDER.md from an agent that is not the lane or any assignee: a `Ruled:` line (name, sha256, finding count) for every lens output, and a verdict
// line per finding id carrying a file:line and a quote that is really on that line of a repo file. Presence, form and the quote check; never judgement.
import { describe, expect, it } from 'vitest';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ROOT, run, script, tmp } from './helpers';

const TASK = 'backlog/tasks/task-7 - Lane work.md';
const LD = 'docs/reports/lanes/2026-11-20/BL-X';
const taskText = (o: { status: string; type?: string | undefined; files?: string | null | undefined; assignees?: string[] | undefined }) =>
  `---\nid: TASK-7\ntitle: Lane work\nstatus: ${o.status}\nassignee:\n${(o.assignees ?? ['@lane-BL-X']).map((a) => `  - '${a}'`).join('\n')}\nmilestone: m-0\ntype: ${o.type ?? 'build'}\n---\n\n## Description\n\n<!-- SECTION:DESCRIPTION:BEGIN -->\nprose\n${o.files === null ? '' : `Files: ${o.files ?? 'src/a.ts'}\n`}<!-- SECTION:DESCRIPTION:END -->\n`;
const TABLE = { contract_version: 1, lists: { first: { file: 'docs/a.md', whole: true, generated_by: 'hand-written' }, 'inc-F': { file: 'docs/inc.md', whole: true, generated_by: 'hand-written' } }, rows: [{ id: 'src', globs: ['src/**'], lists: ['first'], why: 'src' }], exempt: ['docs/reports/lanes/**'], increment_docs: { F: 'inc-F' } };
const LENS = (finding: boolean) => `noise\n${finding ? 'BUG severity=HIGH — clause "x" — src/a.ts:1 "y" — claim — fix\n' : ''}MET — c — d — e\nVERDICT: PASS on compliance\n`;
const sha = (t: string) => crypto.createHash('sha256').update(t).digest('hex').slice(0, 12);
const nFind = (t: string) => (t.match(/^\s*[-*]?\s*(BUG|DEFER)\s+severity=/gm) ?? []).length;
const isLens = (n: string) => /^(plan|out)-.+\.txt$/.test(n);
const OK_V = 'CONFIRMED src/a.ts:1 "export const a"';

type Lane = Record<string, string | null>;
type G = { grounder?: string; laneHdr?: string; verdict?: (id: string) => string | null; ruled?: boolean; countDelta?: number; headers?: boolean };
function grounder(lane: Lane, o: G = {}): string {
  const lines = ['# Grounder verdicts', ...(o.headers === false ? [] : [`Grounder: ${o.grounder ?? 'grounder-agent-1'}`, `Lane: ${o.laneHdr ?? 'BL-X'}`]), ''];
  const names = Object.entries(lane).filter(([n, t]) => t !== null && isLens(n)).map(([n]) => n).sort();
  if (o.ruled !== false) for (const n of names) lines.push(`Ruled: ${n} sha256:${sha(lane[n] as string)} findings:${nFind(lane[n] as string) + (o.countDelta ?? 0)}`);
  for (const n of names) for (let i = 1; i <= nFind(lane[n] as string); i++) { const id = `${n.replace(/\.txt$/, '')}#${i}`; const v = o.verdict ? o.verdict(id) : OK_V; if (v) lines.push(`${id} ${v}`); }
  return `${lines.join('\n')}\n`;
}
const base = (over: Lane = {}, g: G = {}): Lane => {
  const l: Lane = { 'out-compliance-first.txt': LENS(true), 'out-compliance-inc-F.txt': LENS(false), 'out-code-review.txt': LENS(false), 'out-error-paths.txt': LENS(false), 'plan-code-review.txt': LENS(false), ...over };
  if (!('GROUNDER.md' in over)) l['GROUNDER.md'] = grounder(l, g);
  return l;
};

type Opts = { status?: string; before?: string; type?: string; files?: string | null; assignees?: string[]; trailer?: boolean; lane?: Lane; table?: 'keep' | 'delete' | 'never'; code?: boolean };
function scenario(o: Opts = {}) {
  const d = tmp('lc');
  const g = (...a: string[]) => run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: d });
  const w = (f: string, t: string) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), t); };
  g('init', '-q', '.');
  if (o.table !== 'never') w('scripts/analysis/rule-lists.json', JSON.stringify(TABLE));
  w('src/a.ts', 'export const a = 1;\n');
  w('backlog/milestones/m-0 - inc.md', '---\nid: m-0\ntitle: "Increment 1·A Foundations [F]"\n---\n');
  w(TASK, taskText({ status: o.before ?? 'RUNNING', type: o.type, files: o.files, assignees: o.assignees }));
  g('add', '-A'); g('commit', '-qm', 'base');
  if (o.table === 'delete') fs.rmSync(path.join(d, 'scripts/analysis/rule-lists.json'));
  if (o.code) w('src/a.ts', 'export const a = 1;\nexport const b = 2;\n');
  w(TASK, `${taskText({ status: o.status ?? 'BUILT', type: o.type, files: o.files, assignees: o.assignees })}notes\n`);
  const lane = o.lane ?? base();
  for (const [n, t] of Object.entries(lane)) if (t !== null) w(`${LD}/${n}`, t);
  g('add', '-A');
  const msgFile = path.join(d, '.git/MSG');
  fs.writeFileSync(msgFile, `feat(08_agents): close\n\n${o.trailer === false ? '' : 'Task: task-7\n'}`);
  return script('scripts/hooks/check-lane-close.mjs', [msgFile], { cwd: d });
}
const refused = (r: { status: number | null; stderr: string }, re: RegExp) => { expect(r.status, r.stderr).toBe(1); expect(r.stderr).toMatch(re); };

describe('close check: the lens set (AC #3)', () => {
  it('passes with the lens set of a build task, a plan output and a grounder that ruled every finding', () => {
    const r = scenario();
    expect(r.status, r.stderr).toBe(0);
  });
  it('refuses a missing compliance lens output, naming the list and the file to write', () => {
    refused(scenario({ lane: base({ 'out-compliance-inc-F.txt': null }) }), /inc-F[\s\S]*out-compliance-inc-F\.txt/);
  });
  it('refuses a lens output with no VERDICT line (a failed run is not an output)', () => {
    refused(scenario({ lane: base({ 'out-compliance-first.txt': 'Failed: terminated\n' }) }), /VERDICT/);
  });
  it('refuses a build task missing a lens of its set (code-review, error-paths), and one with no plan-stage output', () => {
    refused(scenario({ lane: base({ 'out-code-review.txt': null }) }), /out-code-review\.txt/);
    refused(scenario({ lane: base({ 'out-error-paths.txt': null }) }), /out-error-paths\.txt/);
    refused(scenario({ lane: base({ 'plan-code-review.txt': null }) }), /plan-/);
  });
  it('ux and security join the required set by the Files line, as the launch brief names them', () => {
    refused(scenario({ files: 'src/components/x.tsx', lane: base() }), /out-ux\.txt/);
    refused(scenario({ files: 'src/lib/stripe/x.ts', lane: base() }), /out-security\.txt/);
  });
  it('split parts: -p1..-pK with no gap pass; a gap, or parts beside an unsuffixed file, are refused', () => {
    const ok = scenario({ lane: base({ 'out-compliance-first.txt': null, 'out-compliance-first-p1.txt': LENS(true), 'out-compliance-first-p2.txt': LENS(false) }) });
    expect(ok.status, ok.stderr).toBe(0);
    refused(scenario({ lane: base({ 'out-compliance-first.txt': null, 'out-compliance-first-p1.txt': LENS(false), 'out-compliance-first-p3.txt': LENS(false) }) }), /p2/);
    expect(scenario({ lane: base({ 'out-compliance-first-p1.txt': LENS(false) }) }).status).toBe(1);
  });
  it('a record-only task needs compliance lens outputs (plan or out) per list and no lens set; a grounder only when a lens returned a finding', () => {
    const none = scenario({ type: 'record', lane: { 'plan-compliance-first.txt': LENS(false), 'plan-compliance-inc-F.txt': LENS(false) } });
    expect(none.status, none.stderr).toBe(0);
    expect(scenario({ type: 'record', lane: { 'plan-compliance-first.txt': LENS(false) } }).status).toBe(1);
    refused(scenario({ type: 'record', lane: { 'plan-compliance-first.txt': LENS(true), 'plan-compliance-inc-F.txt': LENS(false) } }), /GROUNDER\.md/);
  });
  it('a build task with no Files line is refused (no silent "no rules apply")', () => {
    refused(scenario({ files: null }), /no Files/);
  });
  it('DONE is a close as well as BUILT', () => {
    expect(scenario({ status: 'DONE', lane: base({ 'GROUNDER.md': null }) }).status).toBe(1);
  });
});

describe('close check: the separate grounder (AC #4)', () => {
  it('refuses a missing GROUNDER.md even when no lens returned a finding (every build task)', () => {
    refused(scenario({ lane: base({ 'out-compliance-first.txt': LENS(false), 'GROUNDER.md': null }) }), /GROUNDER\.md/);
  });
  it('refuses Grounder equal to Lane (header), to the task lane, and to any other assignee of the task', () => {
    refused(scenario({ lane: base({}, { grounder: 'BL-X' }) }), /same as .*Lane|is the lane/);
    refused(scenario({ lane: base({}, { grounder: 'bl-x', laneHdr: 'other' }) }), /is the lane|Lane/);
    refused(scenario({ assignees: ['@lane-BL-X', '@helper-9'], lane: base({}, { grounder: 'helper-9' }) }), /assignee/);
  });
  it('refuses a GROUNDER.md with no Grounder or Lane header', () => {
    refused(scenario({ lane: base({}, { headers: false }) }), /Grounder:/);
  });
  it('refuses a finding id with no verdict line, naming the id (plan-stage findings of any lens count)', () => {
    refused(scenario({ lane: base({ 'plan-code-review.txt': LENS(true) }, { verdict: (id) => (id === 'plan-code-review#1' ? null : OK_V) }) }), /plan-code-review#1/);
  });
  it('a verdict is CONFIRMED, REJECTED or CONFLICT, with file:line and a quote; REJECTED and CONFLICT also a reason', () => {
    const v = (s: string | null) => scenario({ lane: base({}, { verdict: () => s }) });
    refused(v('CONFIRMED'), /out-compliance-first#1/);
    refused(v('CONFIRMED src/a.ts:1'), /quote/);
    refused(v('CONFIRMED src/a.ts:1 "x"'), /quote/);
    refused(v('REJECTED src/a.ts:1 "export const a"'), /reason/);
    refused(v('CONFLICT src/a.ts:1 "export const a"'), /reason/);
    expect(v('REJECTED src/a.ts:1 "export const a" the quoted claim is not what the code does').status).toBe(0);
    expect(v('CONFLICT src/a.ts:1 "export const a" two rulings disagree, operator owed').status).toBe(0);
  });
  it('the quote must really be on the cited line of a repo file (the grounder opened it)', () => {
    const v = (s: string) => scenario({ lane: base({}, { verdict: () => s }) });
    refused(v('CONFIRMED src/a.ts:1 "this text is not in the file"'), /not on .*src\/a\.ts:1/);
    refused(v('CONFIRMED src/a.ts:99 "export const a"'), /line 99/);
    refused(v('CONFIRMED src/nope.ts:1 "export const a"'), /not in the repo/);
    refused(v(`CONFIRMED ${LD}/out-code-review.txt:3 "MET — c — d — e"`), /lane report/);
  });
  it('binds the ruled outputs: a Ruled line per lens output, with its sha256 and finding count; an output edited after grounding is refused', () => {
    refused(scenario({ lane: base({}, { ruled: false }) }), /Ruled:/);
    const l = base();
    l['out-code-review.txt'] = `${LENS(false)}edited after the grounder ruled\n`;
    refused(scenario({ lane: l }), /out-code-review\.txt.*(edited|sha256)/);
    refused(scenario({ lane: base({}, { countDelta: 1 }) }), /findings:/);
  });
});

describe('close check: who is exempt', () => {
  it('exempt: no Task trailer, no move to BUILT or DONE, a docs-only edit of a task nobody lane-holds', () => {
    expect(scenario({ trailer: false, lane: {} }).status).toBe(0);
    expect(scenario({ status: 'RUNNING', lane: {} }).status).toBe(0);
    expect(scenario({ before: 'BUILT', status: 'BUILT', lane: {} }).status).toBe(0);
    expect(scenario({ assignees: ['@human'], lane: {} }).status).toBe(0);
  });
  it('no exemption for a commit that changes code: with no @lane assignee it is refused', () => {
    refused(scenario({ assignees: ['@human'], code: true, lane: {} }), /@lane/);
  });
  it('fails closed when the rule-list table that HEAD has is gone; a repo that never had one is not held to it', () => {
    refused(scenario({ table: 'delete' }), /rule-lists\.json/);
    expect(scenario({ table: 'never', lane: {} }).status).toBe(0);
  });
  it('wired: .husky/commit-msg runs the check once, after check-task-files', () => {
    const t = fs.readFileSync(path.join(ROOT, '.husky/commit-msg'), 'utf8');
    expect(t.split('node scripts/hooks/check-lane-close.mjs "$1"').length - 1).toBe(1);
    expect(t.indexOf('check-task-files.mjs')).toBeLessThan(t.indexOf('check-lane-close.mjs'));
  });
});
