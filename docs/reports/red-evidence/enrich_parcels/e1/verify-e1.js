'use strict';
// E1 / B1 bound 3 restated — compare a BEFORE and an AFTER snapshot (snapshot.sql output) against the
// pre-registered prediction (e1-prediction.json). Usage:
//   node docs/reports/red-evidence/enrich_parcels/e1/verify-e1.js <before.tsv> <after.tsv>
// PASS iff (a) the 26-column md5 is identical for every parcel present in both snapshots, and
// (b) for each of the 9 columns the set of parcels whose value changed EQUALS the predicted set.
const fs = require('fs');
const path = require('path');
const COLS = ['bylaw_max_units', 'bylaw_max_density', 'bylaw_pct_commercial_max', 'bylaw_pct_residential_max',
  'bylaw_pct_employment_max', 'bylaw_pct_office_max', 'bylaw_min_frontage_m', 'bylaw_min_area_sqm', 'bylaw_standard_setback_m'];
const read = (f) => new Map(fs.readFileSync(f, 'utf8').trim().split('\n').map((l) => { const a = l.split('\t'); return [a[0], a]; }));
const [before, after] = [read(process.argv[2]), read(process.argv[3])];
const pred = JSON.parse(fs.readFileSync(path.join(__dirname, 'e1-prediction.json'), 'utf8'));
let fail = 0;
let other = 0;
const changed = Object.fromEntries(COLS.map((c) => [c, new Set()]));
for (const [id, b] of before) {
  const a = after.get(id);
  if (!a) continue;
  if (a[10] !== b[10]) other += 1;
  COLS.forEach((c, i) => { if (a[i + 1] !== b[i + 1]) changed[c].add(Number(id)); });
}
console.log(`26-column md5 changes: ${other} (expected 0)`);
if (other) fail += 1;
for (const c of COLS) {
  const want = new Set(pred.sets[c] || []);
  const got = changed[c];
  const missing = [...want].filter((x) => !got.has(x)).length;
  const extra = [...got].filter((x) => !want.has(x)).length;
  console.log(`${c}: changed ${got.size}, predicted ${want.size}, missing ${missing}, extra ${extra}`);
  if (missing || extra) fail += 1;
}
console.log(fail ? 'FAIL' : 'PASS');
process.exitCode = fail ? 1 : 0;
