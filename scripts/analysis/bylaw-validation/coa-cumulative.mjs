// SPEC LINK: docs/specs/01-pipeline/133_bylaw_handbook.md m.357 (blind first, then one cumulative headline set), m.321 (pre-registration), m.322 (floors only go up)
// The M-357 door, smallest form. READ-ONLY on the data: it assembles the cumulative all-notices inputs from the batches listed in
// coa-expected/cumulative-set.json and writes them to --out; the unchanged scorer then scores them with the M-322 floors:
//   node scripts/analysis/bylaw-validation/coa-cumulative.mjs --data <coa-data dir> --out <dir> [--set FILE] [--root R]
//   node scripts/analysis/bylaw-validation/coa-scorecard.mjs --root R --notices <dir>/notices.json --parcels <dir>/parcels.json --plan-facts <dir>/plan-facts --out S.json --floors <set.floors>
// A batch joins only after its blind round (M-357): its M-321 pre-registration is committed at HEAD and its blind result is recorded in the set file.
// The 172 and 4d sets stay frozen pins (expected-172.json, expected-4d.json); this tool never re-pins them. No new class, floor or pin mechanism.
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';

export function checkSetShape(s) {
  const v = [];
  if (!s || s.schema !== 'coa-cumulative-set-v1') v.push('schema must be coa-cumulative-set-v1');
  if (!s || typeof s.$comment !== 'string' || !s.$comment) v.push('$comment must be a non-empty string');
  if (!s || typeof s.floors !== 'string' || !s.floors) v.push('floors must name the M-322 floors file');
  const b = (s && s.batches) || [];
  if (!Array.isArray(b) || !b.length) v.push('batches must be a non-empty list');
  else {
    if (b[0].role !== 'frozen') v.push('the first batch must be the frozen reference set');
    if (b.filter((x) => x.role === 'frozen').length > 1) v.push('exactly one frozen reference set');
    for (const x of b) {
      if (!x.batch || !x.notices || !x.parcels) v.push(`batch ${x.batch || '?'}: batch, notices and parcels are required`);
      if (!['frozen', 'blind'].includes(x.role)) v.push(`batch ${x.batch || '?'}: role must be frozen or blind`);
    }
  }
  return v;
}

/** io = { readJson(p), listPlanFacts(dir) -> {file name: content}, isCommitted(repo path) -> boolean }. Returns { notices, parcels, planFacts, problems }. */
export function assembleCumulative(set, io) {
  const problems = checkSetShape(set);
  const notices = []; const parcels = {}; const planFacts = {}; const owner = new Map(); const pfOwner = new Map();
  if (problems.length) return { notices, parcels, planFacts, problems };
  for (const b of set.batches) {
    if (b.role === 'blind') {
      if (!b.prereg) problems.push(`${b.batch}: no pre-registration (M-321) named`);
      else if (!io.isCommitted(b.prereg)) problems.push(`${b.batch}: pre-registration ${b.prereg} is not committed at HEAD`);
      if (!b.blind || !b.blind.totals) problems.push(`${b.batch}: no recorded blind result (score blind first, M-357)`);
    }
    const ns = io.readJson(b.notices) || []; const ps = io.readJson(b.parcels) || {};
    for (const n of ns) {
      if (owner.has(n.file_number)) { problems.push(`${n.file_number} is in ${owner.get(n.file_number)} and ${b.batch} (one notice per file number)`); continue; }
      owner.set(n.file_number, b.batch); notices.push(n);
      if (ps[n.file_number]) parcels[n.file_number] = ps[n.file_number];
    }
    if (!b.plan_facts) continue;
    for (const [name, content] of Object.entries(io.listPlanFacts(b.plan_facts))) {
      if (pfOwner.has(name)) { if (planFacts[name] !== content) problems.push(`plan facts ${name} differ between ${pfOwner.get(name)} and ${b.batch}`); continue; }
      pfOwner.set(name, b.batch); planFacts[name] = content;
    }
  }
  return { notices, parcels, planFacts, problems };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k, d = null) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
  const ROOT = path.resolve(arg('root', path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')));
  const SET = arg('set', path.join(ROOT, 'scripts/analysis/bylaw-validation/coa-expected/cumulative-set.json'));
  const DATA = arg('data'); const OUT = arg('out');
  if (!DATA || !OUT) { console.error('usage: coa-cumulative.mjs --data <coa-data dir> --out <dir> [--set FILE] [--root R]'); process.exit(2); }
  const set = JSON.parse(fs.readFileSync(SET, 'utf8'));
  const io = {
    readJson: (p) => JSON.parse(fs.readFileSync(path.join(DATA, p), 'utf8')),
    listPlanFacts: (d) => Object.fromEntries(fs.readdirSync(path.join(DATA, d)).filter((f) => f.endsWith('.json')).sort().map((f) => [f, fs.readFileSync(path.join(DATA, d, f), 'utf8')])),
    isCommitted: (p) => { try { return execFileSync('git', ['-C', ROOT, 'show', 'HEAD:' + p], { encoding: 'utf8' }) === fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch { return false; } },
  };
  const r = assembleCumulative(set, io);
  if (r.problems.length) { console.error('CUMULATIVE REFUSED:\n  ' + r.problems.join('\n  ')); process.exit(1); }
  fs.mkdirSync(path.join(OUT, 'plan-facts'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'notices.json'), JSON.stringify(r.notices, null, 1));
  fs.writeFileSync(path.join(OUT, 'parcels.json'), JSON.stringify(r.parcels, null, 1));
  for (const [name, content] of Object.entries(r.planFacts)) fs.writeFileSync(path.join(OUT, 'plan-facts', name), content);
  console.log(`CUMULATIVE ${set.batches.map((b) => b.batch).join(' + ')}: ${r.notices.length} notices, ${Object.keys(r.parcels).length} parcel entries, ${Object.keys(r.planFacts).length} plan-facts files -> ${OUT}; score with --floors ${set.floors}`);
}
