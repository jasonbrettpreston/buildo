import fs from 'node:fs';
const SRC = { '126': 'docs/specs/02-web-admin/126_maxbld_surface_standard.md', '127': 'docs/specs/02-web-admin/127_surface_conversion_procedure.md', '128': 'docs/specs/02-web-admin/128_surface_standard_policy.md', '135': 'docs/specs/02-web-admin/135_mcfrontend_decisions_register.md' };
let allOk = true; const lines = [];
for (const [k, f] of Object.entries(SRC)) {
  const S = fs.readFileSync(f, 'utf8').split('\n'); if (S[S.length - 1] === '') S.pop();
  const parts = fs.readdirSync('.claude/review-templates/packs').filter((n) => n.startsWith(`fe-${k}-p`)).sort((a, b) => parseInt(a.match(/-p(\d+)/)[1]) - parseInt(b.match(/-p(\d+)/)[1]));
  let got = []; let ok = true; let checked = 0;
  for (const p of parts) {
    const P = fs.readFileSync(`.claude/review-templates/packs/${p}`, 'utf8').split('\n'); if (P[P.length - 1] === '') P.pop();
    const mi = P.findIndex((t) => t.startsWith('<<< ')); const m = P[mi].match(/lines (\d+)-(\d+) >>>/); const a = +m[1], b = +m[2];
    let body = P.slice(mi + 1);
    if (body[0] && body[0].startsWith('(the register table header')) { const e = body.findIndex((t) => t === '(end of repeated header)'); body = body.slice(e + 1); }
    if (body.length !== b - a + 1) { ok = false; lines.push(`${p}: body ${body.length} lines vs range ${b - a + 1}`); }
    body.forEach((t, i) => { checked++; if (t !== S[a - 1 + i]) { ok = false; lines.push(`${p}: line ${a + i} differs`); } });
    got.push(...body);
  }
  const whole = got.length === S.length && got.every((t, i) => t === S[i]);
  lines.push(`${k}: ${parts.length} parts, ${checked} pack lines compared one by one with the source line they claim, ${S.length} source lines, concatenation equals the source whole: ${whole}, mismatches: ${ok ? 0 : 'SEE ABOVE'}`);
  if (!ok || !whole) allOk = false;
}
console.log(lines.join('\n')); console.log(allOk ? 'VERIFY PASS' : 'VERIFY FAIL');
