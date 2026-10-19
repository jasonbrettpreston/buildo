// Print the verbatim slice text of regulations (read-only helper). Usage: node clause-text.mjs <root> <regId>...
import path from 'node:path'; import { pathToFileURL } from 'node:url';
const [ROOT, ...ids] = process.argv.slice(2);
const V = await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/bylaw/validate.mjs')).href);
const I = V.loadInputs({ root: ROOT });
for (const id of ids) { const rows = I.slice.rows.filter((r) => r.regulation_id === id); console.log('==', id, rows.length ? '' : '(not in slice)'); for (const r of rows) console.log((r.row_verbatim || r.text || r.normalized || JSON.stringify(r)).slice(0, 1800)); }
