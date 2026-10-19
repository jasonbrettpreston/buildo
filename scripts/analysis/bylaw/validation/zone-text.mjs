// Dump the verbatim leaf text of the core regulations per zone (read-only) for the hand-check readers.
// Usage: node zone-text.mjs <root> <out.json>
import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const [ROOT, OUT] = process.argv.slice(2);
const V = await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/bylaw/validate.mjs')).href);
const I = V.loadInputs({ root: ROOT });
const CH = { R: '10.10', RD: '10.20', RS: '10.40', RT: '10.60', RM: '10.80' };
const ART = ['30.10', '30.20', '30.40', '40.10', '40.20', '40.30', '40.40', '40.70', '40.1'];
const out = {};
for (const [z, ch] of Object.entries(CH)) {
  out[z] = {};
  for (const r of I.slice.rows) {
    const id = r.regulation_id || ''; if (!ART.some((a) => id.startsWith(`${ch}.${a}(`))) continue;
    const txt = (r.clauses || []).map((c) => c.text).join('').replace(/\s+/g, ' ').trim();
    out[z][id] = txt;
  }
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
for (const [z, m] of Object.entries(out)) console.log(z, Object.keys(m).length, 'regulations', Object.values(m).join('').length, 'chars');
