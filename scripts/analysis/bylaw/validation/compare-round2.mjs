// Bylaw hand-check round 2: three-way comparison of the evaluator with the two round-1 readings (DeepSeek, Claude).
// Pure. Usage: node compare-round2.mjs <hc-eval.json> <ds-round1.json> <claude-round1.json> <out.json>
import fs from 'node:fs';
const [EV, DS, CL, OUT] = process.argv.slice(2);
const ev = JSON.parse(fs.readFileSync(EV, 'utf8')); const ds = JSON.parse(fs.readFileSync(DS, 'utf8')); const cl = JSON.parse(fs.readFileSync(CL, 'utf8'));
const NOLIMIT = new Set(['unregulated', 'not_applicable', 'no_candidate', 'none', 'no limit', 'unlimited']);
export function norm(x) {
  if (x === null || x === undefined) return { k: 'missing' };
  if (typeof x === 'number') return { k: 'num', v: x };
  const s = String(x).trim().toLowerCase();
  const n = Number(s.replace(/[^\d.\-]/g, '')); if (/^-?[\d.]+\s*(m|m2|%|metres|storeys)?$/.test(s) && Number.isFinite(n)) return { k: 'num', v: n };
  if (NOLIMIT.has(s) || s.startsWith('not_applicable') || s.startsWith('unregulated')) return { k: 'nolimit' };
  if (s.startsWith('unknown')) return { k: 'unknown', why: s };
  return { k: 'other', why: s };
}
function evNorm(r) {
  if (!r) return { k: 'missing' };
  if (r.status === 'not_evaluated') { const code = String(r.reason).split(':')[0]; if (code === 'no_candidate') return { k: 'nolimit', why: 'no_candidate' }; return { k: 'unknown', why: r.reason }; }
  if (typeof r.value === 'number') return { k: 'num', v: r.value };
  if (r.status === 'not_applicable' || r.value === 'unregulated' || r.value === 'unlimited' || r.value === 'not_applicable') return { k: 'nolimit', why: r.value || r.status };
  return { k: 'other', why: JSON.stringify(r.value) };
}
const eq = (a, b) => a.k === b.k && (a.k !== 'num' || Math.abs(a.v - b.v) < 0.011);
const rows = [];
for (const L of ev.lots) {
  const d = (ds.lots.find((x) => x.id === L.id) || {}).answer || {}; const c = cl.lots.find((x) => x.id === L.id);
  for (const cs of c.scenarios) {
    const evRow = L.rows[`${cs.building_type}|${cs.roof}`];
    const dsS = (d.scenarios || []).find((x) => x.building_type === cs.building_type && (x.roof || 'pitched') === cs.roof) || {};
    for (const [t, cv] of Object.entries(cs.values)) {
      const e = evNorm(evRow && evRow.res[t]); const dv = dsS.values && dsS.values[t]; const dn = norm(dv && typeof dv === 'object' ? dv.value : dv); const cn = norm(cv.value);
      const agree = { ev_claude: eq(e, cn), ev_ds: eq(e, dn), ds_claude: eq(dn, cn) };
      rows.push({ id: L.id, stratum: L.stratum, exception: L.lot.exception, bt: cs.building_type, roof: cs.roof, target: t,
        evaluator: e, evaluator_raw: evRow ? { value: evRow.res[t]?.value, reason: evRow.res[t]?.reason, winner: evRow.res[t]?.winner } : null,
        deepseek: dn, deepseek_clause: dv && dv.clause, claude: cn, claude_clause: cv.clause, ...agree,
        class: agree.ev_claude && agree.ev_ds ? 'all_agree' : agree.ev_claude ? 'ev=claude≠ds' : agree.ev_ds ? 'ev=ds≠claude' : agree.ds_claude ? 'readers_agree≠ev' : 'all_differ' });
    }
  }
}
const cnt = {}; for (const r of rows) cnt[r.class] = (cnt[r.class] || 0) + 1;
fs.writeFileSync(OUT, JSON.stringify({ counts: cnt, n: rows.length, rows }, null, 1));
console.log(rows.length, cnt);
