// count by-law handbook rows by the "Enforced by" cell (Spec 133 lines 28-1826)
import fs from 'node:fs';
const t = fs.readFileSync(process.argv[2], 'utf8').split('\n');
const from = 27, to = 1826; // 0-based slice of lines 28..1826
const rows = [];
for (let i = from; i < Math.min(to, t.length); i++) if (/^- \*\*(m|lc)\.\d+\*\*/.test(t[i])) rows.push({ line: i + 1, id: /^- \*\*([^*]+)\*\*/.exec(t[i])[1], head: t[i], st: t[i + 1] || '' });
const cell = (r) => { const m = /Enforced by: (.*?)(?: · \+\d+ dated notes?)?\s*$/.exec(r.st); return m ? m[1] : null; };
const k = { total: rows.length, startsOWED: 0, noCell: 0, noneYet: 0, reportOnly: 0, other: 0 };
const ro = [];
for (const r of rows) {
  const c = cell(r);
  if (c === null) { k.noCell++; continue; }
  if (/^OWED/.test(c)) { k.startsOWED++; continue; }
  if (/^none/i.test(c)) { k.noneYet++; continue; }
  if (/report-only|report only/i.test(c) || /report-only/i.test(r.head)) { k.reportOnly++; ro.push(`${r.id} (line ${r.line + 1}) ${c.slice(0, 110)}`); continue; }
  k.other++;
}
console.log(JSON.stringify(k));
console.log(ro.join('\n'));
// second pass: whole status line (the generator's "OWED marker" is the status word OR the enforcer cell)
let c = { total: 0, owedMarker: 0, reportOnlyNotOwed: 0, noneNotOwed: 0, namedEnforcerClean: 0 };
for (const r of rows) {
  c.total++;
  const cl = cell(r) || '';
  if (/OWED/.test(r.st)) c.owedMarker++;
  else if (/report-only/i.test(cl) || /report-only/i.test(r.head)) c.reportOnlyNotOwed++;
  else if (/^none/i.test(cl)) c.noneNotOwed++;
  else c.namedEnforcerClean++;
}
console.log(JSON.stringify(c));
// third pass: the handbook's own OWED list (generator's r.owed, section "Rows with an OWED marker")
const sIdx = t.findIndex((l) => /^## \d+\. Rows with an OWED marker/.test(l));
const owedIds = new Set(); for (let i = sIdx; i < t.length; i++) { const m = /^\| (M-\d+|LC-\d+) \| (\S+) \|/.exec(t[i]); if (m) owedIds.add(m[2]); if (i > sIdx + 5 && /^## /.test(t[i])) break; }
const notOwed = rows.filter((r) => !owedIds.has(r.id));
const roN = notOwed.filter((r) => /report-only/i.test(cell(r) || '') || /report-only/i.test(r.head));
const noneN = notOwed.filter((r) => /^none/i.test(cell(r) || ''));
console.log(JSON.stringify({ owedListIds: owedIds.size, rowsNotOnOwedList: notOwed.length, reportOnly: roN.map((r) => r.id), noneNotOwed: noneN.map((r) => r.id), checkedCorrected: notOwed.length - roN.length - noneN.length }));
