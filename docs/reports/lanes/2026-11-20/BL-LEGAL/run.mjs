// lane runner: phase plan|out; material file; runs lens set in parallel via the repo review tool (DOTENV_CONFIG_PATH form)
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
const [phase, material, ...rest] = process.argv.slice(2);
const only = rest[0];
const H = process.env.HOME, L = `${H}/Buildo-scratch/lanes-20261119/inc1b/legal/lens`, WT = `${H}/Buildo-wt-legal`;
const T = (n) => `.claude/review-templates/${n}.md`;
const jobs = [];
const lists = JSON.parse(fs.readFileSync(`${H}/Buildo-scratch/lanes-20261119/inc1b/legal/rule-lists.resolved.json`,"utf8")).lists.map((l) => l.id);
for (const id of lists) {
  const r = spawnSync('node', ['scripts/analysis/rule-lists.mjs', 'lens-input', '--list', id, '--material', material, '--out', `${L}/in-${phase}-compliance-${id}`, '--template', T('lens-compliance')], { cwd: WT, encoding: 'utf8' });
  for (const f of r.stdout.split('\n').filter((x) => x.endsWith('.txt'))) { const stem = f.split('/').pop().replace(/^in-/, ''); jobs.push({ input: f, out: `${L}/${stem}`, tpl: T('lens-compliance') }); }
}
const other = phase === 'plan' ? [['plan-review-deepseek', 'plan-review-deepseek'], ['ux', 'lens-ux'], ['error-paths', 'lens-error-paths'], ['regression', `${L}/lens-regression`]] : [['code-review', 'lens-code-review'], ['ux', 'lens-ux'], ['error-paths', 'lens-error-paths'], ['regression', `${L}/lens-regression`]];
for (const [n, t] of other) jobs.push({ input: material, out: `${L}/${phase}-${n}.txt`, tpl: t.startsWith('/') ? `${t}.md` : T(t) });
const env = { ...process.env, DOTENV_CONFIG_PATH: `${H}/Buildo/.env` };
await Promise.all(jobs.filter((j) => !only || new RegExp(only).test(j.out)).map((j) => new Promise((res) => {
  const c = spawn('node', ['-r', `${H}/Buildo/node_modules/dotenv/config`, 'scripts/deepseek-review.js', 'review', j.input, '--template', j.tpl], { cwd: WT, env });
  let o = ''; c.stdout.on('data', (d) => (o += d)); c.stderr.on('data', (d) => (o += d));
  c.on('close', (code) => { fs.writeFileSync(j.out, o); console.log(code, j.out.split('/').pop(), o.length); res(); });
})));
