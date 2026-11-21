// Test fixture program of task-375 D (the launch gate): writes real plan evidence into a fixture board and commits it. Run by src/tests/backlog/backlog-lane.logic.test.ts:
//   node plant-evidence.mjs <board> <task id> <lane> <repo root> <backlog binary>

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const [board, taskId, lane, ROOT, bin] = process.argv.slice(2);
const u = (p) => `file://${ROOT}/${p}`;
const rl = await import(u('scripts/analysis/rule-lists.mjs'));
const lib = await import(u('scripts/analysis/backlog-lib.mjs'));
const clc = await import(u('scripts/hooks/check-lane-close.mjs'));
const rt = createRequire(`${ROOT}/x.js`)(`${ROOT}/scripts/lib/review-template.js`);
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const table = rl.readTable();
const t = lib.readItems(board).find((x) => x.id === taskId);
const type = String(t.fm.type ?? '').toLowerCase();
const text0 = fs.readFileSync(t.file, 'utf8');
const r = rl.resolveTask({ table, root: board, body: t.body, type, letter: rl.milestoneLetter(board, t.fm.milestone) });
if (r.error) process.exit(0);
const cp = (rel) => { fs.mkdirSync(path.dirname(path.join(board, rel)), { recursive: true }); fs.copyFileSync(path.join(ROOT, rel), path.join(board, rel)); };
for (const l of r.lists) cp(l.file);
cp('.claude/review-templates/lens-compliance.md');
const dir = path.join(board, 'docs/reports/reviews', taskId);
fs.mkdirSync(dir, { recursive: true });
const ctx = fs.readFileSync(path.join(ROOT, 'docs/reports/reviews/task-375/fixture-context.md'), 'utf8');
fs.writeFileSync(path.join(dir, 'context-r1.md'), ctx);
const sel = rt.extractSections(ctx, rt.CONTEXT_SECTIONS);
const cut = rt.extractSections(ctx, rt.PLAN_SECTIONS);
const tplFile = path.join(ROOT, '.claude/review-templates/lens-compliance.md');
const tplText = fs.readFileSync(tplFile, 'utf8');
const planFiles = {};
const w = (n, x) => { fs.writeFileSync(path.join(dir, n), x); };
const outBody = 'MET - c - d - e\nVERDICT: PASS on compliance\n';
const hdr = (inText) => `REVIEW template=lens-compliance.md model=deepseek-reasoner at=2026-11-21T00:00:00.000Z file_sha256=${sha(inText)} prompt_sha256=${rl.lensPromptHash({ templateText: tplText, inputText: inText, context: sel })}\n`;
if (type === 'build') {
  for (const l of r.lists) {
    for (const x of rl.buildLensInputs({ id: l.id, list: table.lists[l.id], root: board, material: cut, templateFile: tplFile, context: sel })) {
      const inn = `in-plan-compliance-${l.id}${x.suffix}.txt`;
      w(inn, x.text);
      const outn = inn.replace(/^in-/, '');
      const o = hdr(x.text) + outBody; w(outn, o); planFiles[outn] = o;
    }
  }
} else { const o = `REVIEW template=lens-code-review.md model=deepseek-reasoner at=2026-11-21T00:00:00.000Z file_sha256=${'a'.repeat(64)} prompt_sha256=${'b'.repeat(64)}\n${outBody}`; w('plan-code-review.txt', o); planFiles['plan-code-review.txt'] = o; }
const git = (...a) => spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: board, encoding: 'utf8' });
const entries = rl.filesEntries(text0) ?? [];
const needReg = entries.some((e) => git('ls-files', '--', e).stdout.trim() !== '');
const seats = ['integration', 'reality-check', ...(needReg ? ['regression'] : [])];
const rel = `docs/reports/reviews/${taskId}`;
const lines = ['# Plan grounder (test evidence)', 'Grounder: grounder-fixture', `Lane: ${lane}`, ''];
for (const n of Object.keys(planFiles).sort()) lines.push(rl.ruledLine(n, planFiles[n]));
const seatLines = [];
for (const n of seats) {
  const body = `# ${n} seat\n### ${n.slice(0, 3)}#1 LOW: a small note\n`;
  w(`seat-${n}-1.md`, body);
  lines.push(`${n.slice(0, 3)}#1 REJECTED docs/a.md:1 "a small note that changes nothing" a note that changes nothing in the plan text at all`);
  seatLines.push(`Seat: ${n} ${rel}/seat-${n}-1.md sha256:${sha(body).slice(0, 12)}`);
}
const ed = (args) => { const e = spawnSync(bin, ['task', 'edit', taskId, ...args], { cwd: board, encoding: 'utf8' }); if (e.status !== 0) { console.error(e.stderr); process.exit(1); } };
ed(['--plan', 'the plan text of the fixture task']);
ed(['--append-plan', `Plan review round 1: 0 folded, 0 task, 0 ruling, 0 wontfix, 0 pile; grounder ${rel}/GROUNDER-PLAN.md; triage ${rel}/TRIAGE-PLAN.md`]);
for (const x of [`${rel}/GROUNDER-PLAN.md`, ...seats.map((n) => `${rel}/seat-${n}-1.md`)]) ed(['--add-ref', x]);
const planLine = `Plan: ${taskId} sha256:${clc.planHash(fs.readFileSync(t.file, 'utf8'))}`;
lines.push(...seatLines, planLine);
w('GROUNDER-PLAN.md', `${lines.join('\n')}\n`);
w('FOLD-CHECK.md', `# Fold check (test evidence)\nChecked by: Fold-G1\nVerdict: PASS\n\n${planLine}\n`);
git('add', '-A'); const c = git('commit', '-q', '-m', 'plan evidence'); if (c.status !== 0) { console.error(c.stdout + c.stderr); process.exit(1); }
