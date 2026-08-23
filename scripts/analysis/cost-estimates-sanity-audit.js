// Cost-estimates plausibility audit (read-only) — the "are these WRITTEN prices sane?" linter over
// the archetype cost ladder OUTPUT (cost_estimates), the layer parcel-sanity-audit.js does NOT cover
// (that one is parcel-keyed; cost_estimates is permit/CoA-keyed). Born from the WF2 output review
// (Reality-Check): the T3 $159.9M tail + the 57-row T2 escalation cap-swap were both found by ad-hoc
// SQL, not by any instrument — this IS that instrument. Dev DB (postgres@localhost:5432/buildo).
// Usage: node -r dotenv/config scripts/analysis/cost-estimates-sanity-audit.js
//
// Check families (mirrors parcel-sanity-audit.js's BOUND/INVARIANT/DISTRIBUTION shape):
//   BOUND     — a written price ABOVE its tier's own cap is a definite ladder bug; per-tier $/sqm band.
//   INVARIANT — cross-field laws: archetype rows never NULL-cost; no rogue cost_source; the F1
//               project-type-vs-cap-class signature (reno/addition priced on a build cap) for T2 AND T1.
//   CROSS     — the parcel fan-out mislink (one parcel → N≫1 permits) + an FSI-vs-linked-lot check
//               SCOPED away from shared parcels (else it false-positives on legit multi-unit rows).
//   DIST      — per-cost_source estimate distribution (visibility).
// `gate: true` marks a ZERO-BASELINE bug whose reappearance is a definite regression.
'use strict';
require('dotenv').config();
// Spec 122 §P0 — the single database-target resolver (fail-loud, floor-asserted).
const { createResolvedPool } = require('../lib/resolve-db');

const pool = createResolvedPool({ label: 'cost-estimates-sanity-audit' });

const f = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 }));

// A joined view of every archetype-priced permit row + its dominant linked parcel's lot + project_type.
// (CoA rows carry no permit_parcels/dwelling_units; they simply don't match the permit-scoped checks.)
const JOINED = `
  cost_estimates ce
  LEFT JOIN permits p       ON p.permit_num = ce.permit_num AND p.revision_num = ce.revision_num
  LEFT JOIN LATERAL (
    SELECT pp.parcel_id, par.lot_size_sqm
    FROM permit_parcels pp JOIN parcels par ON par.id = pp.parcel_id
    WHERE pp.permit_num = ce.permit_num AND pp.revision_num = ce.revision_num
    ORDER BY par.lot_size_sqm DESC NULLS LAST LIMIT 1
  ) lp ON true`;

async function loadCaps() {
  const { rows } = await pool.query(
    `SELECT variable_key, variable_value FROM logic_variables
      WHERE variable_key IN ('archetype_t1_total_cap','archetype_t2_reno_line_cap',
        'archetype_t2_build_line_cap','archetype_t3_total_cap')`,
  );
  const c = {};
  for (const r of rows) c[r.variable_key] = Number(r.variable_value);
  return c;
}

(async () => {
  try {
    const cap = await loadCaps();
    console.log('caps:', JSON.stringify(cap));
    // per-unit divisor SQL fragment (permits only; CoA has no dwelling_units_created → treated as 1)
    const UNITS = `GREATEST(1, COALESCE(p.dwelling_units_created, 1))`;
    const RENO = cap.archetype_t2_reno_line_cap;

    // ── CHECK definitions: { fam, id, why, bad (SQL predicate over the JOINED view), gate? } ──
    const CHECKS = [
      // BOUND — a price above its own tier cap is a definite ladder bug (the guard should have caught it).
      { fam: 'BOUND', id: 't1_above_t1_cap', gate: true,
        why: 'T1 price > archetype_t1_total_cap × units (T1 cap should reject to T2)',
        bad: `ce.cost_source='archetype_declared_area' AND ce.estimated_cost > ${cap.archetype_t1_total_cap}::numeric * ${UNITS}` },
      { fam: 'BOUND', id: 't2_above_build_cap', gate: true,
        why: 'T2 parcel line > the absolute build cap (no T2 line — reno or build — may exceed it)',
        bad: `ce.cost_source='archetype_parcel' AND ce.estimated_cost > ${cap.archetype_t2_build_line_cap}` },
      { fam: 'BOUND', id: 't3_above_t3_cap', gate: true,
        why: 'F2: T3 price > archetype_t3_total_cap × units (the $159.9M tail — WF3 cap should reject)',
        bad: `ce.cost_source='archetype_rate' AND ce.estimated_cost > ${cap.archetype_t3_total_cap}::numeric * ${UNITS}` },
      { fam: 'BOUND', id: 'cost_per_sqm_out_of_band', gate: false,
        why: 'archetype $/sqm outside ~$1K–$25K/sqm (rate/area sanity — RC observed legit low tail ~$866/sqm)',
        bad: `ce.cost_source LIKE 'archetype_%' AND ce.effective_area_sqm > 0
              AND (ce.estimated_cost / ce.effective_area_sqm < 1000 OR ce.estimated_cost / ce.effective_area_sqm > 25000)` },
      // INVARIANT — cross-field laws.
      { fam: 'INVARIANT', id: 'archetype_null_cost', gate: true,
        why: 'archetype provenance with NULL estimated_cost (must be cost_source=none instead)',
        bad: `ce.cost_source LIKE 'archetype_%' AND ce.estimated_cost IS NULL` },
      { fam: 'INVARIANT', id: 'rogue_cost_source', gate: true,
        why: 'cost_source outside the mig-209 enum',
        bad: `ce.cost_source IS NOT NULL AND ce.cost_source NOT IN
              ('permit','model','none','geometric','archetype_declared_area','archetype_parcel','archetype_rate')` },
      // F1 signature — reno/addition-typed permit priced on the BUILD cap family (escalation cap-swap).
      { fam: 'INVARIANT', id: 'f1_reno_typed_on_build_cap_t2', gate: false,
        why: 'F1: renovation/addition project_type priced as archetype_parcel above the reno cap (cap-swap)',
        bad: `ce.cost_source='archetype_parcel' AND lower(coalesce(p.project_type,'')) IN ('renovation','addition')
              AND ce.estimated_cost > ${RENO}` },
      { fam: 'INVARIANT', id: 'f1_reno_typed_over_reno_cap_t1', gate: false,
        why: 'F1 residual (Guardian): reno/addition T1 archetype_declared_area above the reno cap (T1 not origin-gated)',
        bad: `ce.cost_source='archetype_declared_area' AND lower(coalesce(p.project_type,'')) IN ('renovation','addition')
              AND ce.estimated_cost > ${RENO}` },
      // CROSS — the FSI-vs-lot check, SCOPED away from shared (fan-out) parcels (else it false-positives).
      { fam: 'CROSS', id: 'own_area_gt_lot_x2_unshared', gate: false,
        why: 'T1/T3 own-area > 2× its linked lot on an UNSHARED parcel (oversized/mislinked parent)',
        bad: `ce.cost_source IN ('archetype_declared_area','archetype_rate') AND lp.lot_size_sqm > 0
              AND ce.effective_area_sqm > lp.lot_size_sqm * 2
              AND lp.parcel_id IN (SELECT parcel_id FROM permit_parcels GROUP BY parcel_id HAVING COUNT(*) <= 3)` },
    ];

    console.log('\n=== CHECKS (count of violating rows; gate rows must be 0) ===');
    let anyGate = false;
    for (const chk of CHECKS) {
      // eslint-disable-next-line no-await-in-loop
      const { rows } = await pool.query(`SELECT COUNT(*)::int n FROM ${JOINED} WHERE ${chk.bad}`);
      const n = rows[0].n;
      const flag = n > 0 && chk.gate ? ' 🔴 GATE' : n > 0 ? ' ⚠' : ' ✓';
      if (n > 0 && chk.gate) anyGate = true;
      console.log(`  [${chk.fam}] ${chk.id.padEnd(34)} n=${String(f(n)).padStart(8)}${flag}  — ${chk.why}`);
      // Show up to 3 sample rows for any non-zero check.
      if (n > 0) {
        // eslint-disable-next-line no-await-in-loop
        const s = await pool.query(
          `SELECT ce.permit_num, ce.cost_source, ce.estimated_cost::numeric est, ce.effective_area_sqm::numeric area,
                  p.project_type, p.dwelling_units_created units, lp.lot_size_sqm::numeric lot
           FROM ${JOINED} WHERE ${chk.bad} ORDER BY ce.estimated_cost DESC NULLS LAST LIMIT 3`);
        for (const r of s.rows) {
          console.log(`        e.g. ${String(r.permit_num || '').padEnd(15)} ${r.cost_source} $${f(r.est)} area=${f(r.area)} pt=${r.project_type} units=${r.units} lot=${f(r.lot)}`);
        }
      }
    }

    // ── CROSS: parcel fan-out (one parcel linked to N≫1 distinct permits — the ghost-parcel mislink) ──
    console.log('\n=== CROSS: parcel fan-out (one parcel_id → many permits; the shared-mislink signal) ===');
    const fan = await pool.query(
      `SELECT pp.parcel_id, COUNT(DISTINCT pp.permit_num)::int n, par.lot_size_sqm::numeric lot
         FROM permit_parcels pp JOIN parcels par ON par.id = pp.parcel_id
        GROUP BY pp.parcel_id, par.lot_size_sqm
        HAVING COUNT(DISTINCT pp.permit_num) > 20
        ORDER BY 2 DESC LIMIT 10`);
    if (fan.rows.length === 0) console.log('  none > 20 permits/parcel');
    else fan.rows.forEach((r) => console.log(`  parcel ${r.parcel_id}: ${f(r.n)} permits, lot=${f(r.lot)} sqm`));

    // ── DISTRIBUTION: per-cost_source estimate spread ──
    console.log('\n=== DIST: estimated_cost per cost_source ===');
    const dist = await pool.query(
      `SELECT cost_source, COUNT(*)::int n,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY estimated_cost)::numeric p50,
              percentile_cont(0.99) WITHIN GROUP (ORDER BY estimated_cost)::numeric p99,
              MAX(estimated_cost)::numeric mx
         FROM cost_estimates WHERE estimated_cost IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`);
    dist.rows.forEach((r) => console.log(`  ${String(r.cost_source).padEnd(26)} n=${String(f(r.n)).padStart(9)} p50=${f(r.p50)} p99=${f(r.p99)} max=${f(r.mx)}`));

    console.log(`\nVERDICT: ${anyGate ? '🔴 FAIL — a zero-baseline gate check is non-zero' : '✓ PASS — no gate violations'}`);
    process.exitCode = anyGate ? 1 : 0;
  } catch (e) {
    console.error('ERR', e.message, e.stack);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
