// WF2 §3-ARCHETYPE shadow comparison — old (_shadow_cost_old snapshot) vs new (cost_estimates).
// Read-only. Reports: cost_source distribution shift, residential coverage delta (incl. T4-priced),
// top-declared permits old/new side-by-side, and T1-class model-vs-declared MAPE.
// Usage: node -r dotenv/config scripts/analysis/wf2-archetype-shadow-compare.js
'use strict';
require('dotenv').config();
// Spec 122 §P0 — the single database-target resolver (fail-loud, floor-asserted).
const { createResolvedPool } = require('../lib/resolve-db');
const pool = createResolvedPool({ label: 'wf2-archetype-shadow-compare' });

const fmt = (n) => n == null ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });

(async () => {
  try {
    // 1. Distribution shift.
    console.log('=== cost_source distribution: OLD → NEW ===');
    const oldD = await pool.query(`SELECT cost_source, COUNT(*)::int n FROM _shadow_cost_old GROUP BY 1`);
    const newD = await pool.query(`SELECT cost_source, COUNT(*)::int n FROM cost_estimates GROUP BY 1`);
    const oldM = Object.fromEntries(oldD.rows.map(r => [r.cost_source, r.n]));
    const newM = Object.fromEntries(newD.rows.map(r => [r.cost_source, r.n]));
    const keys = [...new Set([...Object.keys(oldM), ...Object.keys(newM)])].sort();
    for (const k of keys) console.log(`  ${String(k).padEnd(26)} ${String(fmt(oldM[k]||0)).padStart(10)} → ${String(fmt(newM[k]||0)).padStart(10)}`);

    // 2. Residential coverage (permits only — CoA lead_id starts 'coa:'). Priced = estimated_cost NOT NULL.
    console.log('\n=== residential permit coverage (structure_type low-rise) ===');
    const cov = await pool.query(`
      WITH res AS (
        SELECT ce.lead_id, ce.estimated_cost, ce.cost_source
        FROM cost_estimates ce JOIN permits p
          ON p.permit_num = ce.permit_num AND p.revision_num = ce.revision_num
        WHERE ce.lead_id LIKE 'permit:%'
          AND lower(coalesce(p.structure_type,'')) ~ '(sfd|detached|semi|town|duplex|dwelling)'
          AND lower(coalesce(p.structure_type,'')) !~ 'apartment'
      )
      SELECT COUNT(*)::int total,
             COUNT(*) FILTER (WHERE estimated_cost IS NOT NULL)::int priced,
             COUNT(*) FILTER (WHERE cost_source LIKE 'archetype_%')::int archetype,
             COUNT(*) FILTER (WHERE estimated_cost IS NOT NULL AND cost_source NOT LIKE 'archetype_%')::int t4_priced
      FROM res`);
    const c = cov.rows[0];
    console.log(`  residential permits: ${fmt(c.total)}`);
    console.log(`  priced (any source): ${fmt(c.priced)}  (${(100*c.priced/c.total).toFixed(1)}%)`);
    console.log(`    via archetype:     ${fmt(c.archetype)}  (${(100*c.archetype/c.total).toFixed(1)}%)`);
    console.log(`    via T4 legacy:     ${fmt(c.t4_priced)}  (${(100*c.t4_priced/c.total).toFixed(1)}%)`);

    // 3. Top-declared permits: old vs new side-by-side.
    console.log('\n=== top 15 permits by declared est_const_cost: declared | OLD | NEW (source) ===');
    const top = await pool.query(`
      SELECT p.permit_num, p.est_const_cost::numeric declared, p.structure_type,
             o.estimated_cost old_cost, n.estimated_cost new_cost, n.cost_source new_src
      FROM permits p
      JOIN _shadow_cost_old o ON o.permit_num=p.permit_num AND o.revision_num=p.revision_num
      JOIN cost_estimates n ON n.permit_num=p.permit_num AND n.revision_num=p.revision_num
      WHERE p.est_const_cost IS NOT NULL
      ORDER BY p.est_const_cost DESC LIMIT 15`);
    for (const r of top.rows) {
      console.log(`  ${r.permit_num.padEnd(16)} decl ${String(fmt(r.declared)).padStart(12)} | old ${String(fmt(r.old_cost)).padStart(12)} | new ${String(fmt(r.new_cost)).padStart(12)} ${r.new_src} [${(r.structure_type||'').slice(0,22)}]`);
    }

    // 4. T1-class MAPE (model vs declared) — the archetype declared-area tier.
    console.log('\n=== T1 (archetype_declared_area) model-vs-declared ===');
    const mape = await pool.query(`
      SELECT COUNT(*)::int n,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY n.estimated_cost)::numeric med_model,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY p.est_const_cost)::numeric med_declared,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY abs(n.estimated_cost - p.est_const_cost)/NULLIF(p.est_const_cost,0))::numeric median_ape
      FROM cost_estimates n JOIN permits p ON p.permit_num=n.permit_num AND p.revision_num=n.revision_num
      WHERE n.cost_source='archetype_declared_area' AND p.est_const_cost > 1000`);
    const m = mape.rows[0];
    console.log(`  n=${fmt(m.n)}  median model=${fmt(m.med_model)}  median declared=${fmt(m.med_declared)}  median |APE|=${m.median_ape==null?'—':(100*m.median_ape).toFixed(0)+'%'}`);

    // 5. Bounds safety: any T1/T2 price beyond a sane ceiling (the $159.9M townhouse tail the caps target).
    console.log('\n=== bounds safety: archetype prices > $20M (should be ~0 after caps) ===');
    const oob = await pool.query(`SELECT cost_source, COUNT(*)::int n, MAX(estimated_cost)::numeric mx
      FROM cost_estimates WHERE cost_source LIKE 'archetype_%' AND estimated_cost > 20000000 GROUP BY 1`);
    if (oob.rows.length === 0) console.log('  none — all archetype prices ≤ $20M ✓');
    else oob.rows.forEach(r => console.log(`  ${r.cost_source}: ${r.n} rows, max ${fmt(r.mx)}`));
  } catch (e) { console.error('ERR', e.message, e.stack); process.exitCode = 1; }
  finally { await pool.end(); }
})();
