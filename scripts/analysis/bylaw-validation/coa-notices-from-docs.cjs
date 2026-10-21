// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-125; DRAFT RULING pending (see coa-parse.cjs). Values only.
// Rebuilds parser-shaped notices.json from per-notice JSON docs (intake DB export), re-deriving required_all/proposed_all with coa-parse.cjs measures().
// Usage: node scripts/analysis/bylaw-validation/coa-notices-from-docs.cjs <docs-dir> <out notices.json> [<scrubbed samples dir> to parity-check the parser]
const fs = require('fs'), path = require('path');
const P = require('./coa-parse.cjs');
const canon = (x) => Array.isArray(x) ? x.map(canon) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, canon(x[k])])) : x;
const C = (x) => JSON.stringify(canon(x));
const [DOCS, OUT, SAMPLES] = process.argv.slice(2);
if (!DOCS || !OUT) { console.error('usage: coa-notices-from-docs.cjs <docs-dir> <out.json> [samples-dir]'); process.exit(2); }
const out = []; let cmp = 0, diff = 0;
for (const f of fs.readdirSync(DOCS).filter((x) => x.endsWith('.json')).sort()) {
  const d = JSON.parse(fs.readFileSync(path.join(DOCS, f), 'utf8'));
  const rec = { ...d }; delete rec.plan_facts; delete rec.filed_at; delete rec.examiner_review;
  rec.variances = d.variances.map((v) => ({ ...v, required_all: P.measures(v.requirement), proposed_all: P.measures(v.proposal) }));
  const fn = f.replace('.json', ''); const txt = SAMPLES && path.join(SAMPLES, fn + '.txt');
  if (txt && fs.existsSync(txt)) {
    const r = P.parse(fs.readFileSync(txt, 'utf8')).record; cmp++;
    if (C(r.variances) !== C(rec.variances) || r.address !== rec.address || C({ ...r.zoning, u: 0 }) !== C({ ...rec.zoning, u: 0 }) || r.purpose !== rec.purpose || r.hearing_date !== rec.hearing_date || r.outcome !== rec.outcome) { diff++; console.log('PARITY DIFF', fn); }
  }
  out.push({ file: fn + '.txt', ...rec, warnings: [] });
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log('notices', out.length, 'variances', out.reduce((s, n) => s + n.variances.length, 0), 'parity compared', cmp, 'diff', diff);
if (diff) process.exit(1);
