// Print agreed units (after corrections) whose regulation matches a prefix (read-only helper).
// Usage: node units-for.mjs <root> <regPrefix> [target]
import path from 'node:path'; import { pathToFileURL } from 'node:url';
const [ROOT, PFX, TGT] = process.argv.slice(2);
const mod = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const V = await mod('scripts/analysis/bylaw/validate.mjs'); const AU = await mod('scripts/analysis/bylaw/authored.mjs'); const AG = await mod('scripts/analysis/bylaw/agree.mjs');
const I = V.loadInputs({ root: ROOT });
const ag = AG.checkAgree({ shards: AU.loadAuthored(ROOT), adjudications: I.adjudications, vocab: I.vocab });
for (const [id, rec] of ag.units) {
  if (!id.startsWith(PFX)) continue; const u = rec.unit || {};
  if (TGT && ![].concat(u.target || []).includes(TGT)) continue;
  console.log(id, '|', rec.state, '|', JSON.stringify({ archetype: u.archetype, target: u.target, expr: u.numeric_expression, cond: u.condition, applies: u.applies_to, app: u.application }).slice(0, 700));
}
