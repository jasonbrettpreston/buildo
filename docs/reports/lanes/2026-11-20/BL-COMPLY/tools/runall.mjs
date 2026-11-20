import fs from 'node:fs'; import { spawn } from 'node:child_process';
const C = process.env.HOME + '/Buildo-scratch/lanes-20261119/inc1b/comply';
const only = process.argv[2] ? new RegExp(process.argv[2]) : null;
const packs = fs.readdirSync(`${C}/packs-out`).map((f) => f.replace(/\.md$/, ''));
const base = (p) => p.replace(/-p\d+$/, '');
const MAP = {
  fe: ['route', 'mobile', 'mobile-tests', 'surface', 'load1'],
  step: ['route', 'load1', 'scripts'],
  bylaw: ['route', 'load1'],
  storage: ['route', 'load1'],
  queue: ['scripts'],
  spec08: ['scripts'],
  airtight: ['load1', 'route', 'scripts'],
  'mobile-core': ['mobile', 'mobile-tests', 'surface'],
  'mobile-99': ['mobile', 'mobile-tests'], 'mobile-100': ['mobile', 'mobile-tests'], 'mobile-96': ['mobile', 'mobile-tests'],
  eng: ['route', 'mobile', 'mobile-tests', 'surface', 'scripts', 'load1'],
};
let jobs = [];
const chunks = fs.readFileSync(`${C}/diffs/MANIFEST.tsv`,"utf8").split("\n").filter(Boolean).map((l)=>l.split("\t")[0]);
for (const p of packs) for (const g of MAP[base(p)] || []) for (const d of chunks.filter((c)=>c.replace(/-\d+$/,"")===g)) jobs.push([p, d]);
if (only) jobs = jobs.filter(([p, d]) => only.test(`${p}/${d}`));
fs.mkdirSync(`${C}/runs`, { recursive: true });
const table = [];
for (const [p, d] of jobs) { const a = fs.statSync(`${C}/packs-out/${p}.md`).size, b = fs.statSync(`${C}/diffs/diff-${d}.patch`).size; table.push(`${p}\t${d}\t${a}\t${b}\t${a + 2 * b + 4600}`); if (a + 2 * b + 4600 > 119000) console.log("OVER", p, d); }
fs.writeFileSync(`${C}/runs/JOBS.tsv`, table.join('\n') + '\n');
console.log('jobs', jobs.length);
let i = 0, running = 0, done = 0;
const next = () => {
  while (running < 8 && i < jobs.length) {
    const [p, d] = jobs[i++]; running++;
    const out = fs.openSync(`${C}/pass-${p}-${d}.txt`, 'w'); const err = fs.openSync(`${C}/runs/err-${p}-${d}.txt`, 'w');
    const c = spawn('node', ['scripts/deepseek-review.js', 'review', `${C}/runs/esc/diff-${d}.patch`, '--context', `${C}/runs/esc/${p}.md`, '--template', '.claude/review-templates/lens-compliance.md'], { cwd: process.env.HOME + '/Buildo-wt-comply', env: process.env, stdio: ['ignore', out, err] });
    c.on('exit', (code) => { running--; done++; fs.appendFileSync(`${C}/runs/DONE.log`, `${p}\t${d}\texit ${code}\n`); if (done === jobs.length) console.log('ALL DONE'); next(); });
  }
};
next();
