import fs from 'node:fs';
const dir = new URL('./runs/', import.meta.url).pathname;
const files = fs.readdirSync(dir).filter((f) => /^r1-.*\.txt$/.test(f)).sort();
let n = 0; const out = []; const counts = {};
const lensOf = (f) => f.split('-')[1] === 'error' ? 'error-paths' : f.split('-')[1] === 'code' ? 'code-review' : f.split('-')[1];
out.push('# FINDINGS.md: lens findings on VERIFY.md (task-377, VERIFY.C)\n');
out.push('Source: the DeepSeek lens set run on the per-conflict parts of VERIFY.md (c1..c4 = sections C1..C4), rule lists pasted WHOLE where the context file says so (ctx files in ctx/), rulings pasted in every context (parts/rulings.md). One round, no triage and no verdict by this lane: the lens judged the document, so a finding marks something the grounder must open. Ids F-001... in file order. Lens templates that exist in .claude/review-templates: lens-code-review, lens-compliance, lens-error-paths, lens-security, lens-ux, plan-review-deepseek, plan-review-gemini. No reality or integration lens template exists. Run: compliance, ux, error-paths, code-review. NOT run: lens-security (no money, auth or PII change in the evidence), plan-review-deepseek (plan mode; nothing planned here).\n');
for (const f of files) {
  const lens = lensOf(f); const t = fs.readFileSync(dir + f, 'utf8');
  const lines = t.split('\n').filter((l) => /^(BUG|DEFER) /.test(l));
  out.push(`\n## ${f} (${lines.length} finding lines)`);
  const tail = t.split('\n').filter((l) => /^(VERDICT|Clauses checked)/.test(l));
  for (const l of lines) { n++; counts[lens] = (counts[lens] || 0) + 1; out.push(`- F-${String(n).padStart(3, '0')} [${lens}] ${l}`); }
  for (const l of tail) out.push(`- (lens tail) ${l}`);
}
out.push('\n## Count by lens\n' + Object.entries(counts).map(([k, v]) => `- ${k}: ${v}`).join('\n') + `\n- total: ${n}\n`);
fs.writeFileSync(new URL('./FINDINGS.md', import.meta.url).pathname, out.join('\n'));
console.log(JSON.stringify(counts), n);
