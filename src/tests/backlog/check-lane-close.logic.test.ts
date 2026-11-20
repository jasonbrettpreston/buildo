// SPEC LINK: task-366 (COMPLY.2); Spec 08 section 7 rule 4 and section 5.3 (08_agents.md: every DeepSeek finding is adjudicated by a separate grounder, REJECTED with a reason);
// Spec 137 section 4 rule 3 (137_mcqueue.md:84, the status line moves in the same commit as the work).
// scripts/hooks/check-lane-close.mjs <commit-msg-file> (cwd = a repo with staged files): a commit `Task: task-N` that moves the task file to BUILT or DONE, for a task
// held by an @lane-* assignee, is refused unless docs/reports/lanes/<date>/<lane>/ holds one compliance lens output per attached list and a GROUNDER.md from an
// agent that is not the lane with one verdict line per finding. Presence and form only.
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ROOT, run, script, tmp } from './helpers';

const TASK = 'backlog/tasks/task-7 - Lane work.md';
const LD = 'docs/reports/lanes/2026-11-20/BL-X';
const taskText = (o: { status: string; type?: string | undefined; files?: string | null | undefined; assignee?: string | undefined }) =>
  `---\nid: TASK-7\ntitle: Lane work\nstatus: ${o.status}\nassignee:\n  - '${o.assignee ?? '@lane-BL-X'}'\nmilestone: m-0\ntype: ${o.type ?? 'build'}\n---\n\n## Description\n\n<!-- SECTION:DESCRIPTION:BEGIN -->\nprose\n${o.files === null ? '' : `Files: ${o.files ?? 'src/a.ts'}\n`}<!-- SECTION:DESCRIPTION:END -->\n`;
const TABLE = { contract_version: 1, lists: { first: { file: 'docs/a.md', whole: true, generated_by: 'hand-written' }, 'inc-F': { file: 'docs/inc.md', whole: true, generated_by: 'hand-written' } }, rows: [{ id: 'src', globs: ['src/**'], lists: ['first'], why: 'src' }], exempt: ['docs/reports/lanes/**'], increment_docs: { F: 'inc-F' } };
const LENS = (finding: boolean) => `noise\n${finding ? 'BUG severity=HIGH — clause "x" — src/a.ts:1 "y" — claim — fix\n' : ''}MET — c — d — e\nVERDICT: PASS on compliance\n`;
const GOOD_GROUNDER = (extra = '') => `# Grounder verdicts\nGrounder: grounder-agent-1\nLane: BL-X\n\nout-compliance-first#1 CONFIRMED src/a.ts:1\n${extra}`;

type Opts = { status?: string; before?: string; type?: string; files?: string | null; assignee?: string; trailer?: boolean; lane?: Record<string, string | null>; msg?: string };
function scenario(o: Opts = {}) {
  const d = tmp('lc');
  const g = (...a: string[]) => run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: d });
  const w = (f: string, t: string) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), t); };
  g('init', '-q', '.');
  w('scripts/analysis/rule-lists.json', JSON.stringify(TABLE));
  w('src/a.ts', 'export const a = 1;\n');
  w('backlog/milestones/m-0 - inc.md', '---\nid: m-0\ntitle: "Increment 1·A Foundations [F]"\n---\n');
  w(TASK, taskText({ status: o.before ?? 'RUNNING', type: o.type, files: o.files, assignee: o.assignee }));
  g('add', '-A'); g('commit', '-qm', 'base');
  w(TASK, taskText({ status: o.status ?? 'BUILT', type: o.type, files: o.files, assignee: o.assignee }) + 'notes\n');
  const lane: Record<string, string | null> = o.lane ?? { 'out-compliance-first.txt': LENS(true), 'out-compliance-inc-F.txt': LENS(false), 'GROUNDER.md': GOOD_GROUNDER() };
  for (const [n, t] of Object.entries(lane)) if (t !== null) w(`${LD}/${n}`, t);
  g('add', '-A');
  const msgFile = path.join(d, '.git/MSG');
  fs.writeFileSync(msgFile, o.msg ?? `feat(08_agents): close\n\n${o.trailer === false ? '' : 'Task: task-7\n'}`);
  return script('scripts/hooks/check-lane-close.mjs', [msgFile], { cwd: d });
}
const lane = (over: Record<string, string | null>): Record<string, string | null> => ({ 'out-compliance-first.txt': LENS(true), 'out-compliance-inc-F.txt': LENS(false), 'GROUNDER.md': GOOD_GROUNDER(), ...over });

describe('close check (AC #3, #4): a lane task moving to BUILT or DONE', () => {
  it('passes with one lens output per attached list and a grounder verdict per finding', () => {
    const r = scenario();
    expect(r.status, r.stderr).toBe(0);
  });
  it('refuses a missing lens output, naming the list and the file name to write', () => {
    const r = scenario({ lane: lane({ 'out-compliance-inc-F.txt': null }) });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('inc-F');
    expect(r.stderr).toContain('out-compliance-inc-F.txt');
  });
  it('refuses a lens output with no VERDICT line (a failed run is not an output)', () => {
    const r = scenario({ lane: lane({ 'out-compliance-first.txt': 'Failed: terminated\n' }) });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/VERDICT/);
  });
  it('refuses a missing GROUNDER.md even when no lens returned a finding (build task)', () => {
    const r = scenario({ lane: lane({ 'out-compliance-first.txt': LENS(false), 'GROUNDER.md': null }) });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('GROUNDER.md');
  });
  it('refuses Grounder equal to Lane (the header)', () => {
    const r = scenario({ lane: lane({ 'GROUNDER.md': GOOD_GROUNDER().replace('grounder-agent-1', 'BL-X') }) });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Grounder .* same as .*Lane|is the lane/);
  });
  it('refuses a Grounder that is the task lane even when the Lane header names someone else', () => {
    const r = scenario({ lane: lane({ 'GROUNDER.md': GOOD_GROUNDER().replace('grounder-agent-1', 'bl-x').replace('Lane: BL-X', 'Lane: other') }) });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/is the lane|Lane:/);
  });
  it('refuses a GROUNDER.md with no Grounder or Lane header', () => {
    const r = scenario({ lane: lane({ 'GROUNDER.md': 'out-compliance-first#1 CONFIRMED src/a.ts:1\n' }) });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Grounder:/);
  });
  it('refuses a finding id with no verdict line, naming the id', () => {
    const r = scenario({ lane: lane({ 'out-compliance-first.txt': LENS(true) + 'DEFER severity=LOW — c "x" — NONE — claim — why\n', 'GROUNDER.md': GOOD_GROUNDER() }) });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('out-compliance-first#2');
  });
  it('a verdict needs CONFIRMED or REJECTED and a file:line; REJECTED also needs a reason', () => {
    const noLoc = scenario({ lane: lane({ 'GROUNDER.md': GOOD_GROUNDER().replace('CONFIRMED src/a.ts:1', 'CONFIRMED') }) });
    expect(noLoc.status).toBe(1);
    const noReason = scenario({ lane: lane({ 'GROUNDER.md': GOOD_GROUNDER().replace('CONFIRMED src/a.ts:1', 'REJECTED src/a.ts:1') }) });
    expect(noReason.status).toBe(1);
    expect(noReason.stderr).toMatch(/reason/);
    const ok = scenario({ lane: lane({ 'GROUNDER.md': GOOD_GROUNDER().replace('CONFIRMED src/a.ts:1', 'REJECTED src/a.ts:1 the quoted line is not there') }) });
    expect(ok.status, ok.stderr).toBe(0);
  });
  it('split parts: -p1..-pK with no gap pass; a gap, or parts beside an unsuffixed file, are refused', () => {
    const ok = scenario({ lane: lane({ 'out-compliance-first.txt': null, 'out-compliance-first-p1.txt': LENS(true), 'out-compliance-first-p2.txt': LENS(false), 'GROUNDER.md': GOOD_GROUNDER('out-compliance-first-p1#1 CONFIRMED src/a.ts:1\n').replace('out-compliance-first#1', 'out-compliance-first-p1#1') }) });
    expect(ok.status, ok.stderr).toBe(0);
    const gap = scenario({ lane: lane({ 'out-compliance-first.txt': null, 'out-compliance-first-p1.txt': LENS(false), 'out-compliance-first-p3.txt': LENS(false), 'GROUNDER.md': GOOD_GROUNDER().replace('out-compliance-first#1 CONFIRMED src/a.ts:1\n', '') }) });
    expect(gap.status).toBe(1);
    expect(gap.stderr).toMatch(/p2/);
    const both = scenario({ lane: lane({ 'out-compliance-first-p1.txt': LENS(false) }) });
    expect(both.status).toBe(1);
  });
  it('a finding in a plan-stage output (any lens) also needs a verdict', () => {
    const r = scenario({ lane: lane({ 'plan-code-review.txt': LENS(true) }) });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('plan-code-review#1');
  });
  it('DONE is a close as well as BUILT', () => {
    const r = scenario({ status: 'DONE', lane: lane({ 'GROUNDER.md': null }) });
    expect(r.status).toBe(1);
  });
  it('a build task with no Files line is refused (no silent "no rules apply")', () => {
    const r = scenario({ files: null });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/no Files/);
  });
  it('a record-only task needs lens outputs (plan or out) per list, and a grounder only when a lens returned a finding', () => {
    const none = scenario({ type: 'record', lane: { 'plan-compliance-first.txt': LENS(false), 'plan-compliance-inc-F.txt': LENS(false) } });
    expect(none.status, none.stderr).toBe(0);
    const missing = scenario({ type: 'record', lane: { 'plan-compliance-first.txt': LENS(false) } });
    expect(missing.status).toBe(1);
    const finding = scenario({ type: 'record', lane: { 'plan-compliance-first.txt': LENS(true), 'plan-compliance-inc-F.txt': LENS(false) } });
    expect(finding.status).toBe(1);
    expect(finding.stderr).toContain('GROUNDER.md');
  });
  it('exempt: no Task trailer, no lane assignee, no move to BUILT or DONE', () => {
    expect(scenario({ trailer: false, lane: {} }).status).toBe(0);
    expect(scenario({ assignee: '@human', lane: {} }).status).toBe(0);
    expect(scenario({ status: 'RUNNING', lane: {} }).status).toBe(0);
    expect(scenario({ before: 'BUILT', status: 'BUILT', lane: {} }).status).toBe(0);
  });
  it('wired: .husky/commit-msg runs the check once, after check-task-files', () => {
    const t = fs.readFileSync(path.join(ROOT, '.husky/commit-msg'), 'utf8');
    expect(t.split('node scripts/hooks/check-lane-close.mjs "$1"').length - 1).toBe(1);
    expect(t.indexOf('check-task-files.mjs')).toBeLessThan(t.indexOf('check-lane-close.mjs'));
  });
});
