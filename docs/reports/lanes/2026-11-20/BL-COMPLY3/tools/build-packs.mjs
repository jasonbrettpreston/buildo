// Builds the four COMPLY.5 packs by script. Each part is one contiguous line range of the source, copied verbatim; split points are the source's own headings
// (## then ### when a ## section is over the bound), and for the Spec 135 register table, the row boundaries (the table is one heading section of 72720 chars).
import fs from 'node:fs'; import { execFileSync } from 'node:child_process';
const REPO = process.cwd(); const LIM = 31500; const OUT = '.claude/review-templates/packs';
const HEAD = execFileSync('git', ['rev-parse', '--short=9', 'HEAD'], { encoding: 'utf8' }).trim();
const SRC = {
  '126': { f: 'docs/specs/02-web-admin/126_maxbld_surface_standard.md', title: 'Spec 126, the MaxBLD surface standard (the surface descriptor as contract), whole', rows: null },
  '127': { f: 'docs/specs/02-web-admin/127_surface_conversion_procedure.md', title: 'Spec 127, the surface conversion procedure (assessment, gates, commit form), whole', rows: null },
  '128': { f: 'docs/specs/02-web-admin/128_surface_standard_policy.md', title: 'Spec 128, the surface standard policy (rules, budget rules B1-B6, ruling protocol, register of rulings), whole', rows: null },
  '135': { f: 'docs/specs/02-web-admin/135_mcfrontend_decisions_register.md', title: 'Spec 135, the McFrontend decisions register, full rows with their dated notes, whole', rows: 'Register' },
};
const RULE = /\b(must|MUST|never|NEVER|shall|SHALL|forbidden|required|RULED|Rule \d+|B[1-6])\b|^\| (FE-\d+|\*\*R-\d+|\*\*ASK-\d+|\*\*P\d+) /;
const out = [];
for (const [key, s] of Object.entries(SRC)) {
  const raw = fs.readFileSync(s.f, 'utf8'); const L = raw.split('\n'); if (L[L.length - 1] === '') L.pop();
  const sha = execFileSync('git', ['hash-object', s.f], { encoding: 'utf8' }).trim().slice(0, 12);
  const gsha = execFileSync('git', ['log', '-1', '--format=%h', '--', s.f], { encoding: 'utf8' }).trim();
  const len = (a, b) => L.slice(a, b).join('\n').length + 1; // [a,b) 0-based
  // heading starts outside code fences
  let fence = false; const H = [];
  L.forEach((t, i) => { if (/^```/.test(t)) fence = !fence; const m = !fence && t.match(/^(#{1,4}) /); if (m) H.push([i, m[1].length]); });
  // atomic units: recursive split of over-limit ranges
  const units = [];
  const split = (a, b, lvl) => {
    if (len(a, b) <= LIM) { units.push([a, b]); return; }
    const hs = H.filter(([i, l]) => i >= a && i < b && l === lvl).map(([i]) => i);
    if (lvl <= 4 && hs.length >= 1) {
      const cuts = [a, ...hs.filter((i) => i > a), b]; const u = [...new Set(cuts)];
      if (u.length > 2 || (u.length === 2 && u[0] !== a)) { for (let k = 0; k < u.length - 1; k++) split(u[k], u[k + 1], lvl + 1); return; }
      split(a, b, lvl + 1); return;
    }
    if (lvl <= 4) { split(a, b, lvl + 1); return; }
    // table rows (Spec 135 register): split at row boundaries
    let c = a; let k = a;
    while (k < b) { if (len(c, k + 1) > LIM && k > c) { units.push([c, k]); c = k; } k++; }
    units.push([c, b]);
  };
  split(0, L.length, 2);
  // greedy join of consecutive units under the bound
  const parts = []; let cur = null;
  for (const [a, b] of units) { if (cur && len(cur[0], b) <= LIM) cur[1] = b; else { cur = [a, b]; parts.push(cur); } }
  // first part to start at line 1
  parts[0][0] = 0;
  // table header (Spec 135): for parts that start inside the Register table body
  const tblHead = s.rows ? (() => { const i = L.findIndex((t) => /^\| # \|/.test(t)); return [i, i + 2]; })() : null;
  const totalRule = L.filter((t) => RULE.test(t)).length;
  parts.forEach(([a, b], idx) => {
    const body = L.slice(a, b); const n = body.filter((t) => RULE.test(t)).length;
    const needsHead = tblHead && a > tblHead[0] + 1 && /^\| FE-/.test(L[a]);
    const hdr = [
      `# HANDBOOK TEXT (verbatim copy, whole source; nothing trimmed): ${s.title}`,
      `Source: ${s.f}:${a + 1}-${b} (source file blob ${sha}, last commit ${gsha}, repo head ${HEAD} at build)`,
      `Generator: ${'.claude/review-templates/packs (task-369 build-packs.mjs, lane BL-COMPLY3)'}; copied by script from the source lines, split only at the source's own headings${s.rows ? ' and, inside the register table, at row boundaries' : ''}`,
      `Rule-bearing lines in the whole source: ${totalRule} (pattern ${RULE.source}) · in this part: ${n} · this is part ${idx + 1} of ${parts.length}`,
      '',
      `<<< ${s.f.split('/').pop()} lines ${a + 1}-${b} >>>`,
    ];
    if (needsHead) { hdr.push(`(the register table header, source lines ${tblHead[0] + 1}-${tblHead[0] + 2}, repeated here so the columns read; it is not part of this part's range)`); hdr.push(L[tblHead[0]]); hdr.push(L[tblHead[0] + 1]); hdr.push('(end of repeated header)'); }
    const text = hdr.join('\n') + '\n' + body.join('\n') + '\n';
    const name = `fe-${key}-p${idx + 1}.md`; fs.writeFileSync(`${OUT}/${name}`, text);
    out.push([name, key, a + 1, b, n, totalRule, text.length, parts.length].join('\t'));
  });
}
fs.writeFileSync(process.argv[2], out.join('\n') + '\n'); console.log(out.join('\n'));
