import fs from 'node:fs'; import { spawn } from 'node:child_process';
const C = process.env.HOME + '/Buildo-scratch/lanes-20261119/inc1b/comply3'; const REPO = process.env.HOME + '/Buildo-wt-comply3';
const ZW = '​'; const esc = (s) => s.replace(/\$/g, '$$$$').replace(/\{\{(PLAN|SPECS|DATA_CONTEXT)\}\}/g, (m) => '{' + ZW + '{' + m.slice(2, -2) + '}' + ZW + '}');
fs.mkdirSync(`${C}/esc`, { recursive: true }); fs.mkdirSync(`${C}/runs`, { recursive: true });
const packs = fs.readdirSync(`${REPO}/.claude/review-templates/packs`).filter((f) => /^fe-12[678]-p|^fe-135-p/.test(f)).map((f) => f.replace(/\.md$/, ''));
for (const p of packs) fs.writeFileSync(`${C}/esc/${p}.md`, esc(fs.readFileSync(`${REPO}/.claude/review-templates/packs/${p}.md`, 'utf8')));
const parts = fs.readFileSync(`${C}/diffs/MANIFEST.tsv`, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t')[0]);
for (const d of parts) fs.writeFileSync(`${C}/esc/diff-${d}.patch`, esc(fs.readFileSync(`${C}/diffs/diff-${d}.patch`, 'utf8')));
const only = process.argv[2] ? new RegExp(process.argv[2]) : null;
let jobs = []; for (const p of packs) for (const d of parts) jobs.push([p, d]); if (only) jobs = jobs.filter(([p, d]) => only.test(`${p}/${d}`));
const table = []; for (const [p, d] of jobs) { const a = fs.statSync(`${C}/esc/${p}.md`).size, b = fs.statSync(`${C}/esc/diff-${d}.patch`).size; table.push(`${p}\t${d}\t${a}\t${b}\t${a + 2 * b + 4600}`); if (a + 2 * b + 4600 > 119000) console.log('OVER', p, d); }
fs.appendFileSync(`${C}/runs/JOBS.tsv`, table.join('\n') + '\n'); console.log('jobs', jobs.length);
let i = 0, running = 0, done = 0;
const next = () => { while (running < 8 && i < jobs.length) { const [p, d] = jobs[i++]; running++;
  const out = fs.openSync(`${C}/pass2-${p}-${d}.txt`, 'w'); const err = fs.openSync(`${C}/runs/err-${p}-${d}.txt`, 'w');
  const c = spawn('node', ['-r', process.env.HOME + '/Buildo/node_modules/dotenv/config', 'scripts/deepseek-review.js', 'review', `${C}/esc/diff-${d}.patch`, '--context', `${C}/esc/${p}.md`, '--template', '.claude/review-templates/lens-compliance.md'], { cwd: REPO, env: process.env, stdio: ['ignore', out, err] });
  c.on('exit', (code) => { running--; done++; fs.appendFileSync(`${C}/runs/DONE.log`, `${p}\t${d}\texit ${code}\n`); if (done === jobs.length) console.log('ALL DONE'); next(); }); } };
next();
