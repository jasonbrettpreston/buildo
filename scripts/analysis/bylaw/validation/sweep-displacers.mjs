// Sweep: units with no value of their own (target none / statement none) that displace a unit which carries a numeric
// limit. In the evaluator a displaced unit leaves the candidate set (rule 2), so such a pair removes the base limit and
// answers no_candidate on the lots the displacer applies to. Read-only. Usage: node sweep-displacers.mjs <root> <out.json>
import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const [ROOT, OUT] = process.argv.slice(2);
const mod = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const V = await mod('scripts/analysis/bylaw/validate.mjs'); const AU = await mod('scripts/analysis/bylaw/authored.mjs');
const AG = await mod('scripts/analysis/bylaw/agree.mjs'); const E = await mod('scripts/analysis/bylaw/evaluate.mjs'); const X = await mod('scripts/analysis/bylaw/xref.mjs');
const I = V.loadInputs({ root: ROOT });
const external = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/external.json'), 'utf8'));
const ag = AG.checkAgree({ shards: AU.loadAuthored(ROOT), adjudications: I.adjudications, vocab: I.vocab });
const units = [...AG.agreedUnits(ag).values()].map(AU.withGeneratedFields);
const byId = new Map(units.map((u) => [u.unit_id, u]));
const index = AU.buildIndex(I.slice);
const tg = (u) => [].concat(u.target || []).filter((t) => t && t !== 'none');
const out = [];
for (const u of units) {
  if (tg(u).length) continue;
  let d = []; try { d = X.displacesOf(index, u.unit_id, I.vocab, external).targets.map((t) => t.id); } catch { continue; }
  const hit = units.filter((x) => x.unit_id !== u.unit_id && tg(x).length && d.some((ref) => E.refMatch(ref, x.unit_id)));
  if (hit.length) out.push({ displacer: u.unit_id, archetype: u.archetype, zones: u.application && u.application.zones, cond: u.condition && u.condition.if, displaced: hit.map((x) => ({ id: x.unit_id, target: tg(x) })) });
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
const byT = {}; for (const o of out) for (const d of o.displaced) for (const t of d.target) byT[t] = (byT[t] || 0) + 1;
console.log('valueless displacers that drop a numeric unit:', out.length); console.log(byT);
for (const o of out.filter((x) => /^10\./.test(x.displacer))) console.log(o.displacer, o.archetype, '→', o.displaced.map((d) => d.id + ':' + d.target).join(' '));
