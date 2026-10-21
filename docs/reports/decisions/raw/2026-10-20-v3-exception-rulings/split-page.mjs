// Mechanical split of the committed V3 Exception Rulings page record into the decision-log page-export form
// (answers/<ref>.json {decision, ref, updated_at, note} + entries.json {ref, step, key, note, evidence}).
// Only rows answered ON THE PAGE are exported; the 8 answered in chat are CHAT-22 (chat log).
import fs from 'node:fs';
const [dir] = process.argv.slice(2);
const page = JSON.parse(fs.readFileSync(`${dir}/page-v3-rulings.json`, 'utf8'));
const prop = JSON.parse(fs.readFileSync(`${dir}/proposed-rulings.json`, 'utf8'));
const byId = new Map(prop.proposals.map((p) => [p.id, p]));
const entries = [];
for (const r of page.rows) {
  if (r.answered_via !== 'page' || !r.answer) continue;
  const p = byId.get(r.id);
  if (!p) throw new Error(`no proposal for ${r.id}`);
  if (p.question !== r.question) throw new Error(`question differs for ${r.id}`);
  fs.writeFileSync(`${dir}/answers/${r.id}.json`, `${JSON.stringify({ decision: r.answer.choice, ref: r.id, updated_at: r.answer.decided_at, note: r.answer.note }, null, 2)}\n`);
  entries.push({ ref: r.id, step: 'V3 condition-9 family', key: r.question, note: p.recommendation,
    evidence: p.covers.entries.map((e) => ({ file: e.location, quote: e.text })) });
}
fs.writeFileSync(`${dir}/entries.json`, `${JSON.stringify(entries, null, 2)}\n`);
console.log(`answers ${entries.length}`);
