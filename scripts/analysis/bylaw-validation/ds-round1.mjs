// Bylaw hand-check round 1, DeepSeek seat (Spec 08: mechanical first reading; Claude verifies in round 2).
// Independent of the evaluator: the reader gets ONLY the lot facts and the verbatim by-law text, never evaluator output.
// Needs DEEPSEEK_API_KEY in the environment (key only). Usage: node ds-round1.mjs <root> <hc-lots.json> <zone-text.json> <out.json>
import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const [ROOT, LOTS, ZT, OUT] = process.argv.slice(2);
const KEY = process.env.DEEPSEEK_API_KEY;
const IS_MAIN = !!(process.argv[1] && process.argv[1].endsWith('ds-round1.mjs'));
if (IS_MAIN && !KEY) { console.error('DEEPSEEK_API_KEY not set'); process.exit(2); }
const V = IS_MAIN ? await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/bylaw/validate.mjs')).href) : null;
const I = IS_MAIN ? V.loadInputs({ root: ROOT }) : null;
const zt = IS_MAIN ? JSON.parse(fs.readFileSync(ZT, 'utf8')) : null;
const regText = (reg) => I.slice.rows.filter((r) => r.regulation_id === reg).map((r) => (r.clauses || []).map((c) => c.text).join('')).join(' ').replace(/\s+/g, ' ').trim();
const general = !IS_MAIN ? '' : ['10.5.40.70(1)', '10.5.30.40(1)'].map((id) => `## ${id} ${regText(id)}`).join('\n');
const EXTRA = { R: ['semi_detached_houseplex'], RS: ['semi_detached_houseplex'], RM: ['semi_detached_houseplex'], RT: ['detached_houseplex'], RD: ['detached_houseplex'] };
const TG = ['required_lot_frontage_m', 'required_lot_area_m2', 'height_m', 'main_wall_height_m', 'height_storeys', 'fsi', 'lot_coverage_pct', 'rear_setback_m', 'side_setback_m', 'building_depth_m', 'building_length_m'];
export function scenarios(L) {
  const z = L.lot.zone;
  const scen = [{ building_type: 'detached_house', roof: 'pitched', targets: TG }, { building_type: 'detached_house', roof: 'flat', targets: ['main_wall_height_m', 'upper_storey_setback_m'] }];
  for (const bt of EXTRA[z]) scen.push({ building_type: bt, roof: 'pitched', dwelling_units: bt === 'detached_houseplex' ? 3 : 2, targets: ['required_lot_frontage_m', 'required_lot_area_m2', 'height_m', 'fsi'] });
  if (L.lot.flags.major_street) scen.push({ building_type: 'townhouse', roof: 'pitched', dwelling_units: 4, all_units_front_street: true, every_unit_has_own_driveway: true, targets: ['required_lot_frontage_m', 'height_m'] });
  return scen;
}
function prompt(L) {
  const z = L.lot.zone; const lot = L.lot;
  const facts = { zone: z, zone_label: lot.zone_label, label_values: lot.label, height_overlay_HT_m: lot.overlays.HT ?? 'no value', height_overlay_ST_storeys: lot.overlays.ST ?? 'no value',
    lot_coverage_overlay_pct: lot.overlays.LC ?? 'no value', lot_frontage_m: lot.vars.lot_frontage_m, lot_depth_m: lot.vars.lot_depth_m, lot_area_m2: lot.vars.lot_area_m2,
    corner_lot: lot.flags.corner_lot, through_lot: lot.flags.through_lot, abuts_major_street: lot.flags.major_street, new_building: true, exception: lot.exception || 'none' };
  const text = Object.entries(zt[z]).map(([id, t]) => `## ${id} ${t}`).join('\n');
  const exc = lot.exception ? `\n\nEXCEPTION ${lot.exception} (applies to this lot; its Site Specific Provisions prevail over the zone rules they address; prevailing by-laws/sections it lists are not available to you):\n${regText(lot.exception)}` : '';
  return `You are checking Toronto Zoning By-law 569-2013 for one real lot. Using ONLY the by-law text below and the lot facts, give the as-of-right value of each requested quantity for each scenario.
Rules: "despite" clauses replace the clauses they name, for the cases they name. A zone-label letter (f, a, d, u, au) is used only if the label has it. Height/storeys come from the Height Overlay value when present. A requested item the text does not regulate for that zone/type is "unregulated"; one the text says does not apply is "not_applicable"; one that depends on a fact you do not have is "unknown:<fact>". Use metres, square metres, percent of lot area, FSI as a ratio.
Lot facts: ${JSON.stringify(facts)}
Scenarios: ${JSON.stringify(scenarios(L))}
Reply as JSON: {"scenarios":[{"building_type":"..","roof":"..","values":{"<target>":{"value":<number or string>,"clause":"<regulation id(s) you used>"}}}]}

BY-LAW TEXT (zone ${z}):
${text}
${general}${exc}`;
}
async function ask(p) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch('https://api.deepseek.com/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ model: 'deepseek-chat', temperature: 0, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: p }] }) });
      if (!r.ok) throw new Error(`http ${r.status}`);
      const j = await r.json(); return JSON.parse(j.choices[0].message.content);
    } catch (e) { if (i === 2) return { error: String(e.message) }; await new Promise((s) => setTimeout(s, 2000 * (i + 1))); }
  }
}
if (IS_MAIN) {
  const { lots } = JSON.parse(fs.readFileSync(LOTS, 'utf8'));
  const out = []; let k = 0;
  const work = lots.map((L) => async () => { const a = await ask(prompt(L)); out.push({ id: L.id, answer: a }); console.error(`ds ${++k}/${lots.length} ${L.id}${a.error ? ' ERROR ' + a.error : ''}`); });
  const q = [...work]; await Promise.all(Array.from({ length: 4 }, async () => { while (q.length) await q.shift()(); }));
  out.sort((a, b) => (a.id < b.id ? -1 : 1));
  fs.writeFileSync(OUT, JSON.stringify({ model: 'deepseek-chat', temperature: 0, lots: out }, null, 1));
}
