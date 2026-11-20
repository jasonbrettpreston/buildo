// SPEC LINK: task-366 (COMPLY.2); Spec 08 section 7 rule 4 and section 5.3 (08_agents.md: every DeepSeek finding is adjudicated by a separate grounder, rejections carry reasons);
// Spec 137 section 4 rule 3 (137_mcqueue.md:84, the status line moves in the same commit as the work).
// scripts/hooks/check-lane-close.mjs <commit-msg-file> (cwd = a repo with staged files): ANY staged task file that moves to a finished status (the table's finished_statuses) is checked,
// whatever the commit message says. The lane report dir (docs/reports/lanes/<date>/<lane>/, scoped by its TASK file) must hold the lens set the task type calls for, each output with the
// review tool's REVIEW header (compliance outputs bound to the committed input and to the sha256 of the rule list text), and a GROUNDER.md from an agent that is not the lane or any
// assignee (names compared normalised), a Ruled line per lens output, and a verdict with a quote that is really on the cited line. Each ATTACK test below is an attack a separate grounder
// found got through the first version; each logs the refusal line it gets (console.log "ATTACK n: ...").
import { describe, expect, it } from 'vitest';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ROOT, run, script, tmp } from './helpers';

const TASK = 'backlog/tasks/task-7 - Lane work.md';
const OTHER = 'backlog/tasks/task-8 - Other work.md';
const LD = 'docs/reports/lanes/2026-11-20/BL-COMPLY2';
const taskText = (o: { id?: string; status: string; type?: string | undefined; files?: string | null | undefined; assignees?: string[] | undefined }) =>
  `---\nid: ${o.id ?? 'TASK-7'}\ntitle: Lane work\nstatus: ${o.status}\n${o.assignees && o.assignees.length === 0 ? 'assignee: []' : `assignee:\n${(o.assignees ?? ['@lane-BL-COMPLY2']).map((a) => `  - '${a}'`).join('\n')}`}\nmilestone: m-0\ntype: ${o.type ?? 'build'}\n---\n\n## Description\n\n<!-- SECTION:DESCRIPTION:BEGIN -->\nprose\n${o.files === null ? '' : `Files: ${o.files ?? 'src/a.ts'}\n`}<!-- SECTION:DESCRIPTION:END -->\n`;
const TABLE = {
  contract_version: 1, base_ref: 'lane-base', finished_statuses: ['BUILT', 'DONE', 'MERGED'], protected_paths: ['scripts/hooks/check-lane-close.mjs', 'scripts/analysis/rule-lists.*', '.husky/*'],
  lists: { first: { file: 'docs/a.md', whole: true, generated_by: 'hand-written' }, 'inc-F': { file: 'docs/inc.md', whole: true, generated_by: 'hand-written' } },
  rows: [{ id: 'src', globs: ['src/**'], lists: ['first'], why: 'src' }], exempt: ['docs/reports/lanes/**'], increment_docs: { F: 'inc-F' },
};
const AFILE = Array.from({ length: 9 }, (_, i) => `export const value0${i + 1} = 'alpha quote number 0${i + 1}';`).join('\n') + '\n';
const quoteAt = (k: number) => `export const value0${k} = 'alpha quote number 0${k}';`;
const FINDING = 'BUG severity=HIGH — clause "x" — src/a.ts:1 "y" — claim — fix\n';
const sha = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
const HEX64 = 'a'.repeat(64);
const hdr = (template: string, inputText: string | null) => `REVIEW template=${template} model=deepseek-reasoner at=2026-11-20T10:00:00.000Z file_sha256=${inputText === null ? HEX64 : sha(inputText)} prompt_sha256=${HEX64}\n`;
const body = (finding: boolean) => `noise\n${finding ? FINDING : ''}MET — c — d — e\nVERDICT: PASS on compliance\n`;
const nFind = (t: string) => (t.match(/^\s*[-*]?\s*(BUG|DEFER)\s+severity=/gm) ?? []).length;
const isLens = (n: string) => /^(plan|out)-.+\.txt$/.test(n);
const refLine = (stem: string, k: number) => `${stem}#${k}`;

type Lane = Record<string, string | null>;
type G = { grounder?: string; laneHdr?: string; verdict?: (id: string, k: number) => string | null; ruled?: boolean; countDelta?: number; headers?: boolean };
function grounder(lane: Lane, o: G = {}): string {
  const lines = ['# Grounder verdicts', ...(o.headers === false ? [] : [`Grounder: ${o.grounder ?? 'grounder-agent-1'}`, `Lane: ${o.laneHdr ?? 'BL-COMPLY2'}`]), ''];
  const names = Object.entries(lane).filter(([n, t]) => t !== null && isLens(n)).map(([n]) => n).sort();
  if (o.ruled !== false) for (const n of names) lines.push(`Ruled: ${n} sha256:${sha(lane[n] as string).slice(0, 12)} findings:${nFind(lane[n] as string) + (o.countDelta ?? 0)}`);
  let k = 0;
  for (const n of names) for (let i = 1; i <= nFind(lane[n] as string); i++) {
    k += 1;
    const id = refLine(n.replace(/\.txt$/, ''), i);
    const v = o.verdict ? o.verdict(id, k) : `CONFIRMED src/a.ts:${k} "${quoteAt(k)}"`;
    if (v) lines.push(`${id} ${v}`);
  }
  return `${lines.join('\n')}\n`;
}

type Opts = {
  status?: string; before?: string; type?: string; files?: string | null; assignees?: string[]; beforeAssignees?: string[]; trailer?: string | false; msg?: string; table?: 'keep' | 'delete' | 'never';
  tableEdit?: (t: Record<string, unknown>) => void; laneWork?: Record<string, string>; staged?: Record<string, string>; otherTask?: boolean;
  mutate?: (l: Lane, d: string) => Lane; after?: (l: Lane) => Lane; g?: G; noTaskFile?: boolean; taskFileText?: string; lensFinding?: boolean;
};
function scenario(o: Opts = {}) {
  const d = tmp('lc');
  const g = (...a: string[]) => run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: d });
  const w = (f: string, t: string) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), t); };
  g('init', '-q', '.');
  const table = JSON.parse(JSON.stringify(TABLE)) as Record<string, unknown>;
  o.tableEdit?.(table);
  if (o.table !== 'never') w('scripts/analysis/rule-lists.json', JSON.stringify(table));
  w('docs/a.md', '# A\nrule one text\nrule two text\n'); w('docs/inc.md', '# Inc\nincrement text\n');
  w('src/a.ts', AFILE);
  w('backlog/milestones/m-0 - inc.md', '---\nid: m-0\ntitle: "Increment 1·A Foundations [F]"\n---\n');
  w(TASK, taskText({ status: o.before ?? 'RUNNING', type: o.type, files: o.files, assignees: o.beforeAssignees ?? o.assignees }));
  if (o.otherTask) w(OTHER, taskText({ id: 'TASK-8', status: 'RUNNING' }));
  g('add', '-A'); g('commit', '-qm', 'base'); g('branch', 'lane-base');
  if (o.laneWork) { for (const [f, t] of Object.entries(o.laneWork)) w(f, t); g('add', '-A'); g('commit', '-qm', 'lane work'); }
  if (o.table === 'delete') fs.rmSync(path.join(d, 'scripts/analysis/rule-lists.json'));
  for (const [f, t] of Object.entries(o.staged ?? {})) w(f, t);
  if (!o.noTaskFile) w(TASK, o.taskFileText ?? `${taskText({ status: o.status ?? 'BUILT', type: o.type, files: o.files, assignees: o.assignees })}notes\n`);
  // the lane report: inputs written by the real lens-input, outputs carrying the review tool's header
  const lane: Lane = { TASK: 'task-7\n' };
  fs.writeFileSync(path.join(d, '.git/material.txt'), 'MATERIAL UNDER REVIEW: a diff\n');
  for (const id of ['first', 'inc-F']) {
    const out = path.join(d, LD, `in-out-compliance-${id}`);
    const r = script('scripts/analysis/rule-lists.mjs', ['lens-input', '--root', d, '--table', path.join(d, 'scripts/analysis/rule-lists.json'), '--list', id, '--material', path.join(d, '.git/material.txt'), '--out', out], { cwd: d });
    if (r.status !== 0 && o.table !== 'never' && o.table !== 'delete') throw new Error(`lens-input ${id}: ${r.stderr}`);
    const inText = fs.existsSync(`${out}.txt`) ? fs.readFileSync(`${out}.txt`, 'utf8') : '';
    lane[`in-out-compliance-${id}.txt`] = inText;
    lane[`out-compliance-${id}.txt`] = hdr('lens-compliance.md', inText) + body(id === 'first' && o.lensFinding !== false);
  }
  lane['out-code-review.txt'] = hdr('lens-code-review.md', null) + body(false);
  lane['out-error-paths.txt'] = hdr('lens-error-paths.md', null) + body(false);
  lane['plan-code-review.txt'] = body(false);
  let l = o.mutate ? o.mutate(lane, d) : lane;
  if (!('GROUNDER.md' in l)) l['GROUNDER.md'] = grounder(l, o.g);
  if (o.after) l = o.after(l);
  for (const [n, t] of Object.entries(l)) if (t !== null) w(`${LD}/${n}`, t);
  g('add', '-A');
  const msgFile = path.join(d, '.git/MSG');
  fs.writeFileSync(msgFile, o.msg ?? `feat(08_agents): close\n\n${o.trailer === false ? '' : (o.trailer ?? 'Task: task-7')}\n`);
  return script('scripts/hooks/check-lane-close.mjs', [msgFile], { cwd: d });
}
const refused = (r: { status: number | null; stderr: string }, re: RegExp, attack?: number) => {
  expect(r.status, r.stderr).toBe(1);
  expect(r.stderr).toMatch(re);
  if (attack !== undefined) console.log(`ATTACK ${attack}: REFUSED: ${(r.stderr.split('\n').find((l) => re.test(l)) ?? r.stderr).trim().slice(0, 260)}`);
};

describe('close check: the lens set (AC #3)', () => {
  it('passes a build task with the lens set, headers, committed inputs, a plan output, a TASK file and a grounder that ruled every finding', () => {
    const r = scenario();
    expect(r.status, r.stderr).toBe(0);
  });
  it('refuses a missing compliance lens output, naming the list and the file to write', () => {
    refused(scenario({ mutate: (l) => ({ ...l, 'out-compliance-inc-F.txt': null }) }), /inc-F[\s\S]*out-compliance-inc-F\.txt/);
  });
  it('refuses a lens output with no VERDICT line (a failed run is not an output)', () => {
    refused(scenario({ mutate: (l) => ({ ...l, 'out-compliance-first.txt': `${hdr('lens-compliance.md', l['in-out-compliance-first.txt'] as string)}Failed: terminated\n` }) }), /VERDICT/);
  });
  it('refuses a build task missing a lens of its set (code-review, error-paths), and one with no plan-stage output', () => {
    refused(scenario({ mutate: (l) => ({ ...l, 'out-code-review.txt': null }) }), /out-code-review\.txt/);
    refused(scenario({ mutate: (l) => ({ ...l, 'out-error-paths.txt': null }) }), /out-error-paths\.txt/);
    refused(scenario({ mutate: (l) => ({ ...l, 'plan-code-review.txt': null }) }), /plan-/);
  });
  it('ux and security join the required set by the Files line, as the launch brief names them', () => {
    refused(scenario({ files: 'src/components/x.tsx' }), /out-ux\.txt/);
    refused(scenario({ files: 'src/lib/stripe/x.ts' }), /out-security\.txt/);
  });
  it('split parts: -p1..-pK with no gap pass; a gap, or parts beside an unsuffixed file, are refused', () => {
    // the fixture list is tiny (one section), so a single part is the honest shape here; the gap and both-forms refusals are what is pinned
    refused(scenario({ mutate: (l) => ({ ...l, 'out-compliance-first-p1.txt': l['out-compliance-first.txt'] as string }) }), /both exist|-pN/);
    refused(scenario({ mutate: (l) => ({ ...l, 'out-compliance-first.txt': null, 'out-compliance-first-p1.txt': l['out-compliance-first.txt'] as string, 'out-compliance-first-p3.txt': l['out-compliance-first.txt'] as string }) }), /p2/);
  });
  it('a record-only task needs compliance lens outputs (plan or out) per list and no lens set; a grounder only when a lens returned a finding', () => {
    const rec = (finding: boolean) => scenario({ type: 'record', lensFinding: finding, mutate: (l) => ({ TASK: l.TASK as string, 'in-out-compliance-first.txt': l['in-out-compliance-first.txt'] as string, 'in-out-compliance-inc-F.txt': l['in-out-compliance-inc-F.txt'] as string, 'out-compliance-first.txt': l['out-compliance-first.txt'] as string, 'out-compliance-inc-F.txt': l['out-compliance-inc-F.txt'] as string, ...(finding ? {} : { 'GROUNDER.md': null }) }) });
    const none = rec(false);
    expect(none.status, none.stderr).toBe(0);
    refused(scenario({ type: 'record', mutate: (l) => ({ TASK: l.TASK as string, 'in-out-compliance-first.txt': l['in-out-compliance-first.txt'] as string, 'out-compliance-first.txt': l['out-compliance-first.txt'] as string, 'GROUNDER.md': null }) }), /inc-F/);
    refused(scenario({ type: 'record', mutate: (l) => ({ TASK: l.TASK as string, 'in-out-compliance-first.txt': l['in-out-compliance-first.txt'] as string, 'in-out-compliance-inc-F.txt': l['in-out-compliance-inc-F.txt'] as string, 'out-compliance-first.txt': l['out-compliance-first.txt'] as string, 'out-compliance-inc-F.txt': l['out-compliance-inc-F.txt'] as string, 'GROUNDER.md': null }) }), /GROUNDER\.md/);
  });
  it('a build task with no Files line is refused (no silent "no rules apply")', () => {
    refused(scenario({ files: null }), /no Files/);
  });
});

describe('close check: the separate grounder (AC #4)', () => {
  it('refuses a missing GROUNDER.md even when no lens returned a finding (every build task)', () => {
    refused(scenario({ lensFinding: false, mutate: (l) => ({ ...l, 'GROUNDER.md': null }) }), /GROUNDER\.md/);
  });
  it('refuses Grounder equal to Lane (header), to the task lane, and to any other assignee of the task', () => {
    refused(scenario({ g: { grounder: 'BL-COMPLY2' } }), /same as .*Lane|is the lane/);
    refused(scenario({ g: { grounder: 'bl-comply2', laneHdr: 'other' } }), /is the lane|Lane/);
    refused(scenario({ assignees: ['@lane-BL-COMPLY2', '@helper-nine'], g: { grounder: 'helper-nine' } }), /assignee/);
  });
  it('ATTACK 3: a grounder name that merely contains or is contained in the lane or an assignee (comply2-b, comply-2) is refused', () => {
    const lane = { assignees: ['@lane-BL-COMPLY2', '@helper-nine'] };
    refused(scenario({ ...lane, g: { grounder: 'comply2-b', laneHdr: 'someone' } }), /lane|assignee/, 3);
    refused(scenario({ ...lane, g: { grounder: 'comply-2', laneHdr: 'someone' } }), /lane|assignee/, 3);
    refused(scenario({ ...lane, g: { grounder: 'helper-nine-2', laneHdr: 'someone' } }), /assignee/, 3);
    refused(scenario({ ...lane, g: { grounder: 'Helper_Nine', laneHdr: 'someone' } }), /assignee/, 3);
  });
  it('refuses a GROUNDER.md with no Grounder or Lane header', () => {
    refused(scenario({ g: { headers: false } }), /Grounder:/);
  });
  it('refuses a finding id with no verdict line, naming the id (plan-stage findings of any lens count)', () => {
    refused(scenario({ mutate: (l) => ({ ...l, 'plan-code-review.txt': body(true) }), g: { verdict: (id, k) => (id === 'plan-code-review#1' ? null : `CONFIRMED src/a.ts:${k} "${quoteAt(k)}"`) } }), /plan-code-review#1/);
  });
  it('a verdict is CONFIRMED, REJECTED or CONFLICT, with file:line and a quote; REJECTED and CONFLICT also a reason', () => {
    const v = (s: (k: number) => string) => scenario({ g: { verdict: (_id, k) => s(k) } });
    refused(v(() => 'CONFIRMED'), /out-compliance-first#1/);
    refused(v((k) => `CONFIRMED src/a.ts:${k}`), /quote/);
    refused(v((k) => `REJECTED src/a.ts:${k} "${quoteAt(k)}"`), /reason/);
    refused(v((k) => `CONFLICT src/a.ts:${k} "${quoteAt(k)}"`), /reason/);
    const good = 'the quoted claim is not what the code does at this line';
    expect(v((k) => `REJECTED src/a.ts:${k} "${quoteAt(k)}" ${good}`).status).toBe(0);
    expect(v((k) => `CONFLICT src/a.ts:${k} "${quoteAt(k)}" two rulings disagree, operator owed a ruling`).status).toBe(0);
  });
  it('ATTACK 4: a quote under 20 characters, a reason under 30, a repeated quote, or a boilerplate line are refused', () => {
    const v = (s: (k: number) => string) => scenario({ g: { verdict: (_id, k) => s(k) } });
    refused(v((k) => `CONFIRMED src/a.ts:${k} "export const"`), /20|quote/, 4);
    refused(v((k) => `REJECTED src/a.ts:${k} "${quoteAt(k)}" too short`), /30|reason/, 4);
    // two findings with the same quote
    refused(scenario({ mutate: (l) => ({ ...l, 'out-code-review.txt': hdr('lens-code-review.md', null) + body(true) }), g: { verdict: () => `CONFIRMED src/a.ts:1 "${quoteAt(1)}"` } }), /same quote|distinct|repeat/, 4);
    // a line that occurs more than three times in the cited file
    refused(scenario({ staged: {}, laneWork: { 'src/rep.ts': `${"export const boilerplate = 'same line everywhere';\n".repeat(5)}` }, files: 'src/', g: { verdict: () => `CONFIRMED src/rep.ts:1 "export const boilerplate = 'same line everywhere';"` } }), /more than 3|boilerplate/, 4);
  });
  it('the quote must really be on the cited line of a repo file (the grounder opened it)', () => {
    const v = (s: string) => scenario({ g: { verdict: () => s } });
    refused(v('CONFIRMED src/a.ts:1 "this text is not in the file at all"'), /not on .*src\/a\.ts:1/);
    refused(v(`CONFIRMED src/a.ts:99 "${quoteAt(1)}"`), /line 99/);
    refused(v(`CONFIRMED src/nope.ts:1 "${quoteAt(1)}"`), /not in the repo/);
    refused(v(`CONFIRMED ${LD}/out-code-review.txt:3 "MET — c — d — e is the line"`), /lane report/);
  });
  it('binds the ruled outputs: a Ruled line per lens output, with its sha256 and finding count; an output edited after grounding is refused', () => {
    refused(scenario({ g: { ruled: false } }), /Ruled:/);
    refused(scenario({ after: (l) => ({ ...l, 'out-code-review.txt': `${l['out-code-review.txt']}edited after the grounder ruled\n` }) }), /out-code-review\.txt.*(edited|sha256)/);
    refused(scenario({ g: { countDelta: 1 } }), /findings:/);
  });
  it('ATTACK 5: finding lines the strict matcher misses (bold, numbered, quoted, lower case, colon) are refused as altered or unparsable', () => {
    const altered = (line: string) => scenario({ mutate: (l) => ({ ...l, 'out-code-review.txt': `${hdr('lens-code-review.md', null)}noise\n${line}\nVERDICT: PASS\n` }) });
    for (const line of ['**BUG** severity=HIGH — x', '1. BUG severity=HIGH — x', '> DEFER severity=LOW — x', '"BUG" severity=HIGH — x', 'bug severity=high — x', 'BUG: severity=HIGH — x']) {
      refused(altered(line), /altered or unparsable/, 5);
    }
  });
});

describe('close check: the lens outputs are the review tool\'s, on the committed input', () => {
  it('ATTACK 6a: a compliance output with only a VERDICT line and no REVIEW header is refused', () => {
    refused(scenario({ mutate: (l) => ({ ...l, 'out-compliance-first.txt': 'VERDICT: PASS on compliance\n' }) }), /REVIEW header/, 6);
    refused(scenario({ mutate: (l) => ({ ...l, 'out-code-review.txt': 'VERDICT: PASS\n' }) }), /REVIEW header/, 6);
  });
  it('ATTACK 6b: the header names another lens template, or a hash that is not of the committed input, or the input does not carry the list text', () => {
    refused(scenario({ mutate: (l) => ({ ...l, 'out-code-review.txt': hdr('lens-ux.md', null) + body(false) }) }), /template/, 6);
    refused(scenario({ mutate: (l) => ({ ...l, 'out-compliance-first.txt': hdr('lens-compliance.md', 'some other input') + body(true) }) }), /input|sha256/, 6);
    // the lane edits the rule list text inside the committed input (and re-hashes the header): the stamped list sha256 no longer matches the list
    refused(scenario({ mutate: (l) => { const t = (l['in-out-compliance-first.txt'] as string).replace('rule one text', 'rule one text, softened'); return { ...l, 'in-out-compliance-first.txt': t, 'out-compliance-first.txt': hdr('lens-compliance.md', t) + body(true) }; } }), /list/, 6);
    // the lane drops half the list and re-stamps it: the input no longer carries the whole list
    refused(scenario({ mutate: (l) => { const raw = l['in-out-compliance-first.txt'] as string; const cut = raw.replace('rule two text\n', ''); const stamped = cut.replace(/^LIST first sha256:[0-9a-f]{64}/, `LIST first sha256:${sha('# A\nrule one text\n')}`); return { ...l, 'in-out-compliance-first.txt': stamped, 'out-compliance-first.txt': hdr('lens-compliance.md', stamped) + body(true) }; } }), /whole list|list/, 6);
  });
});

describe('close check: scope of the lane report, the diff and who may close', () => {
  it('ATTACK 1: every finished status triggers the check (MERGED as well as BUILT and DONE)', () => {
    refused(scenario({ status: 'MERGED', g: { headers: false } }), /Grounder:/, 1);
  });
  it('ATTACK 2a: a wrong-task trailer or no trailer does not avoid the check; every staged task file that moves to finished is checked', () => {
    refused(scenario({ trailer: 'Task: task-8', mutate: (l) => ({ ...l, 'GROUNDER.md': null }), otherTask: true }), /GROUNDER\.md/, 2);
    refused(scenario({ trailer: false, mutate: (l) => ({ ...l, 'GROUNDER.md': null }) }), /GROUNDER\.md/, 2);
  });
  it('ATTACK 2b: the board auto-commit (a docs commit message, only the task file staged) is checked too', () => {
    refused(scenario({ msg: 'docs(137_mcqueue): board edits 2026-11-20 08:10\n', mutate: () => ({}) }), /TASK|lane report|GROUNDER/, 2);
  });
  it('ATTACK 7: the lane dir is scoped by a TASK file naming exactly this task; a dir reused for another task is refused', () => {
    refused(scenario({ mutate: (l) => ({ ...l, TASK: 'task-8\n' }) }), /TASK file|task-7/, 7);
    refused(scenario({ mutate: (l) => ({ ...l, TASK: null }) }), /TASK file|task-7/, 7);
  });
  it('ATTACK 8: every path changed since the lane branch point must be covered by the Files line; a build task whose Files resolve to no rule list is refused', () => {
    refused(scenario({ laneWork: { 'src/sneaky.ts': 'export const s = 1;\n' } }), /sneaky\.ts/, 8);
    expect(scenario({ files: 'src/', laneWork: { 'src/sneaky.ts': 'export const s = 1;\n' } }).status).toBe(0);
    refused(scenario({ files: 'docs/reports/lanes/x/' }), /no rule list|exempt/, 8);
  });
  it('ATTACK 9: a finished move of a build, fix or check task with no @lane assignee is refused whatever the commit touches; dropping the assignee in the closing commit too', () => {
    refused(scenario({ assignees: ['@human'] }), /@lane/, 9);
    refused(scenario({ assignees: [] , beforeAssignees: ['@lane-BL-COMPLY2'] }), /@lane|assignee/, 9);
    refused(scenario({ type: 'check', assignees: ['@human'] }), /@lane/, 9);
  });
  it('ATTACK 10: a commit that edits the check, the table, a hook or the review tool may not also move a task to finished', () => {
    refused(scenario({ staged: { 'scripts/hooks/check-lane-close.mjs': '// edited\n' }, files: 'src/a.ts, scripts/hooks/' }), /protected|self/, 10);
    refused(scenario({ staged: { '.husky/commit-msg': '#!/bin/sh\n' }, files: 'src/a.ts, .husky/' }), /protected|self/, 10);
  });
  it('fails closed when the rule-list table that HEAD has is gone; a repo that never had one is not held to it', () => {
    refused(scenario({ table: 'delete' }), /rule-lists\.json/);
    expect(scenario({ table: 'never', mutate: () => ({}) }).status).toBe(0);
  });
  it('exempt: a commit that moves nothing to finished, a status that is not finished, a non-build task nobody lane-holds with no code staged', () => {
    expect(scenario({ status: 'RUNNING', mutate: () => ({}) }).status).toBe(0);
    expect(scenario({ before: 'BUILT', status: 'BUILT', mutate: () => ({}) }).status).toBe(0);
    expect(scenario({ type: 'record', assignees: ['@human'], mutate: () => ({}) }).status).toBe(0);
  });
  it('wired: .husky/commit-msg runs the check once, after check-task-files', () => {
    const t = fs.readFileSync(path.join(ROOT, '.husky/commit-msg'), 'utf8');
    expect(t.split('node scripts/hooks/check-lane-close.mjs "$1"').length - 1).toBe(1);
    expect(t.indexOf('check-task-files.mjs')).toBeLessThan(t.indexOf('check-lane-close.mjs'));
  });
});
