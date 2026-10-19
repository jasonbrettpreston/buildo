// Sweep: agreed units whose own clause text names a flat roof but whose condition does not test flat_or_shallow_roof.
// Read-only. Usage: node sweep-flatroof.mjs <root>
import path from 'node:path'; import { pathToFileURL } from 'node:url';
const [ROOT] = process.argv.slice(2);
const mod = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const V = await mod('scripts/analysis/bylaw/validate.mjs'); const AU = await mod('scripts/analysis/bylaw/authored.mjs'); const AG = await mod('scripts/analysis/bylaw/agree.mjs');
const I = V.loadInputs({ root: ROOT });
const ag = AG.checkAgree({ shards: AU.loadAuthored(ROOT), adjudications: I.adjudications, vocab: I.vocab });
const leaf = new Map(); for (const r of I.slice.rows) for (const c of r.clauses || []) leaf.set(`${r.regulation_id}#${c.path}`, c.text || '');
let n = 0;
for (const [id, rec] of ag.units) {
  if (!(rec.state === 'agreed' || rec.state === 'adjudicated')) continue; const u = rec.unit || {};
  const txt = leaf.get(id) || ''; if (!/flat roof|flat or shallow roof/i.test(txt)) continue;
  const toks = (u.condition && u.condition.tokens) || []; if (toks.includes('flat_or_shallow_roof')) continue;
  n++; console.log(id, '|', [].concat(u.target).join(','), '|', JSON.stringify(u.numeric_expression), '|', txt.slice(0, 140));
}
console.log('flat-roof units without the roof condition:', n);
