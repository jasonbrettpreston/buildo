import fs from 'node:fs'; import { execFileSync } from 'node:child_process';
const C = process.env.HOME + '/Buildo-scratch/lanes-20261119/inc1b/comply';
const REPO = process.env.HOME + '/Buildo-wt-comply';
const files = fs.readdirSync(C).filter((f) => /^pass-.*\.txt$/.test(f)).sort();
const showCache = new Map();
const show = (p) => { if (!showCache.has(p)) { try { showCache.set(p, execFileSync('git', ['-C', REPO, 'show', `3a36e8b26:${p}`], { encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] })); } catch { showCache.set(p, null); } } return showCache.get(p); };
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const ALL = fs.readFileSync(C + "/build/files-all.txt", "utf8").split("\n").filter(Boolean);
function resolvePath(p) { if (ALL.includes(p)) return p; const hit = ALL.filter((x) => x.endsWith("/" + p) || x === p); return hit.length === 1 ? hit[0] : p; }
function openCheck(ref) {
  if (/^\s*NONE\b/i.test(ref)) return "no code line cited (" + ref.trim().slice(0, 60) + ")";
  const m = ref.match(/([A-Za-z0-9_@.\/()\[\]-]+\.(?:tsx?|mjs|cjs|js|json|md|yml|sh)):(\d+)(?:-\d+)?/);
  if (!m) {
    const m2 = ref.match(/([A-Za-z0-9_@.\/()\[\]-]+\.(?:tsx?|mjs|cjs|js|json|md|yml|sh))(?::[^"]*)?\s*"/);
    if (!m2) return "no file:line in the field as returned: " + ref.trim().slice(0, 70);
    const p2 = resolvePath(m2[1]); const tx = show(p2);
    if (tx === null) return "file opened: " + p2 + " does not exist at 3a36e8b26 (cannot open); no line number was given";
    const r2 = ref.slice(m2.index + m2[0].length - 1); const a1 = r2.indexOf('"'), a2 = r2.lastIndexOf('"');
    let cands = []; if (a2 > a1) { const full = r2.slice(a1 + 1, a2).replace(/^[+ ]/, ""); cands = [full, full.split(/"\s*(?:and|,|\+|or)?\s*"/)[0]]; }
    for (const c of cands) { const qq = norm(c.replace(/^\.\.\.|\.\.\.$/g, "")); if (!qq) continue; const L = tx.split("\n"); const h = L.findIndex((x) => norm(x).includes(qq)); if (h >= 0) return "file opened: " + p2 + " no line number was given; the quoted code is there (line " + (h + 1) + ")"; if (norm(tx).includes(qq)) return "file opened: " + p2 + " no line number was given; the quoted code is in the file (not on one line)"; }
    return "file opened: " + p2 + " no line number was given; the quoted code is not there (not found in the file at 3a36e8b26)";
  }
  const p = resolvePath(m[1]); const l = +m[2];
  const rest = ref.slice(m.index + m[0].length); const i1 = rest.indexOf('"'), i2 = rest.lastIndexOf('"');
  const txt = show(p);
  if (txt === null) return "file:line opened: " + p + " does not exist at 3a36e8b26 (cannot open)";
  const L = txt.split("\n");
  if (i1 < 0 || i2 <= i1) return L[l - 1] !== undefined ? "file:line opened: " + p + ":" + l + " exists; no code quote was given" : "file:line opened: " + p + " has " + L.length + " lines, line " + l + " does not exist";
  let q = rest.slice(i1 + 1, i2).replace(/^[+ ]/, "");
  const qq = norm(q.replace(/^\.\.\.|\.\.\.$/g, "")); const near = norm(L.slice(Math.max(0, l - 4), l + 3).join(" "));
  if (near.includes(qq)) return "file:line opened: " + p + ":" + l + " the quoted code is there";
  const hit = L.findIndex((x) => norm(x).includes(qq));
  if (hit >= 0) return "file:line opened: " + p + ":" + l + " the quoted code is not there; it is at line " + (hit + 1);
  if (norm(txt).includes(qq)) return "file:line opened: " + p + ":" + l + " the quoted code is not on one line there; it is in the file";
  return "file:line opened: " + p + ":" + l + " the quoted code is not there (not found in the file at 3a36e8b26)";
}
const rows = []; let id = 0; const tally = {};
const runInfo = [];
for (const f of files) {
  const m = f.match(/^pass-(.*)-((?:route|mobile-tests|mobile|surface|scripts|load1)-\d+)\.txt$/);
  if (!m) continue; const [, pack, part] = m; const hb = pack.replace(/-p\d+$/, '');
  const txt = fs.readFileSync(`${C}/${f}`, 'utf8');
  const lines = txt.split('\n');
  let bug = 0, defer = 0, met = 0, rej = 0, verdict = '', checked = '';
  for (const ln of lines) {
    if (/^(BUG|DEFER) /.test(ln) && ln.split(" — ").length < 3 && /none/i.test(ln)) { /* the lens said it has no finding of this kind */ } else if (/^(BUG|DEFER) /.test(ln)) {
      const kind = ln.startsWith('BUG') ? 'BUG' : 'DEFER'; kind === 'BUG' ? bug++ : defer++;
      const f2 = ln.split(' — ');
      id++;
      rows.push({ id: `F-${String(id).padStart(3, '0')}`, hb, pack, part, kind, head: f2[0], clause: f2[1] || '', code: f2[2] || '', claim: f2[3] || '', fix: f2.slice(4).join(' — '), raw: ln, chk: f2[2] ? openCheck(f2[2]) : 'unparsed' });
    } else if (/^MET /.test(ln)) met++; else if (/^REJECT /.test(ln)) rej++;
    else if (/^VERDICT/.test(ln)) verdict = ln; else if (/^Clauses checked/.test(ln)) checked = ln;
  }
  runInfo.push({ pack, part, hb, bug, defer, met, rej, verdict, checked, ok: /^VERDICT/m.test(txt), bytes: txt.length });
  tally[hb] = tally[hb] || { runs: 0, bug: 0, defer: 0, met: 0, rej: 0 }; const t = tally[hb];
  t.runs++; t.bug += bug; t.defer += defer; t.met += met; t.rej += rej;
}
fs.writeFileSync(`${C}/build/findings.json`, JSON.stringify({ rows, runInfo, tally }, null, 1));
console.log(JSON.stringify(tally), 'findings', rows.length, 'runs', runInfo.length, 'noVerdict', runInfo.filter((r) => !r.ok).map((r) => r.pack + '/' + r.part).join(','));
