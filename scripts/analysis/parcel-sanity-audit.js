// Parcel plausibility audit (read-only) — a data linter over ALL residential parcels. Turns
// "eyeball a sample, find one bug" into "run it, see every bug ranked". Three check families:
//   BOUNDS      — per-field, ZONE-AWARE range checks (a value wrong only for its zone, e.g. RD FSI 2.0)
//   INVARIANTS  — cross-field relationships that must hold (opt_aor ≤ opt_coa, new_build ≤ coa_build, …)
//   DISTRIBUTION— per-zone outliers (median + robust spread) — catches contamination we haven't named yet
// Each check seeded from a real bug OR a physical/domain law.
// Target DB: DATABASE_URL when set (cloud-capable, TLS via ssl-config), else the Docker dev DB
// (postgres@localhost:5432/buildo). The graded target is always logged (C6).
// Usage: node scripts/analysis/parcel-sanity-audit.js
//        DATABASE_URL=<cloud-url> node -r dotenv/config scripts/analysis/parcel-sanity-audit.js
//
// batch2 P1.1 (2026-09-18, fence F1) — this file is now the Reality-Check CLI ONLY. The
// bounds corpus (CHECK_DEFS) and the folded scan (runSanity) both live in
// scripts/lib/assert-parcel-sanity-fields.js / scripts/lib/compute/assert-parcel-sanity.js,
// which the `assert_parcel_sanity` pipeline step ALSO consumes — ONE bounds corpus, not a
// fork. `buildChecks(config)` materializes CHECK_DEFS' applies/bad FUNCTIONS into the
// legacy-shaped {applies,bad} STRING pair scripts/analysis/parcel-field-dump.js splices
// into SQL synchronously (F-G1) — `config` is obtained the SAME way for every consumer
// (this CLI, parcel-field-dump.js, and the pipeline step itself): resolveConfig(pool,
// descriptor) against the live logic_variables registry, never a second literal copy.
'use strict';
// Spec 122 §P0 — the single database-target resolver (fail-loud, floor-asserted).
const { createResolvedPool } = require('../lib/resolve-db');
const descriptor = require('../quality/assert-parcel-sanity.descriptor.json');
const { resolveConfig } = require('../lib/step/config');
const {
  CHECK_DEFS, DIST_DEFS, RES, ZC, LOWRISE,
} = require('../lib/assert-parcel-sanity-fields');
const { runSanity: computeRunSanity } = require('../lib/compute/assert-parcel-sanity');

// CLI pool factory (P4-F0 fold C6, Reality-Check): the entrypoints used a
// HARDCODED localhost:5432 dev-DB pool — pointed "at cloud" they silently
// graded the local DB while claiming to check cloud (the exact blind spot the
// F0 output review hit). Now DATABASE_URL wins when set (with ssl-config's
// host-aware TLS — cloud targets get CA-pinned verify-full), falling back to
// the historical Docker dev-DB default, and ALWAYS logs which DB it is
// grading — the silence was the bug, not just the target.
function makeCliPool(label) {
  // Spec 122 §P0 (WF3 2026-08-23). This factory ALREADY logged its target —
  // and still graded the wrong DB, because with DATABASE_URL unset it fell
  // back to localhost:5432/buildo and announced that as normal. Announcing the
  // wrong answer is not transparency. It now refuses: no target => throw, and
  // a below-floor database (the 222-migration pre-cutover DB) is rejected on
  // the first connection rather than graded.
  return createResolvedPool({ label });
}

// R-T addendum (Fold A-4d, commit 2) + batch2 P1.1 (Fold B-7): statusFor and the
// distribution-scan mechanism live in scripts/lib/step/plausibility.js — one copy of
// the gate-mapping policy, both sides import.
const { statusFor, runDistributionScan } = require('../lib/step/plausibility');
const { deriveVerdict } = require('../lib/step/verdict');

// DIST_FIELDS — local binding (batch2 P1.1: sourced from assert-parcel-sanity-fields.js
// DIST_DEFS rather than defined here, still one bounds corpus).
const DIST_FIELDS = DIST_DEFS;

/**
 * buildChecks(config) — F1/F-G1: materialize CHECK_DEFS' applies/bad FUNCTIONS
 * against a RESOLVED config object into the legacy-shaped {applies,bad} STRING
 * pair every non-pipeline consumer (this CLI's eyeball output,
 * parcel-field-dump.js) expects to splice into its own SQL synchronously.
 */
function buildChecks(config) {
  return CHECK_DEFS.map((def) => ({
    fam: def.fam,
    id: def.id,
    why: def.why,
    sev: def.gate ? 'HIGH' : def.sev,
    gate: !!def.gate,
    accept: def.accept,
    applies: def.applies(config),
    bad: def.bad(config),
  }));
}

/**
 * resolveCliConfig(pool) — the ONE place a CLI entrypoint resolves
 * assert_parcel_sanity's logic_variables, via the SAME resolveConfig(pool,
 * descriptor) the pipeline step itself calls (F-G1/F-G2: "the audit cannot read
 * logic_variables" is KNOWINGLY RETIRED — it now can, through the descriptor).
 */
async function resolveCliConfig(pool) {
  const { values } = await resolveConfig(pool, descriptor);
  return values;
}

// runSanity(pool) — the OPTIMIZED sweep the pipeline step consumes, re-exported here
// (unchanged signature/return shape — {total, results (each carrying `status` via
// statusFor), dist}) so this file's own runAudit() and every existing caller
// (src/tests/db/assert-parcel-sanity.db.test.ts) continue to work unmodified.
// Delegates to scripts/lib/compute/assert-parcel-sanity.js's runSanity(pool, config,
// opts) for the folded scan — ONE implementation, not a second copy (fence F1).
async function runSanity(pool, opts = {}) {
  const config = await resolveCliConfig(pool);
  const { total, results: rawResults } = await computeRunSanity(pool, config, opts);
  const results = rawResults.map((r) => ({ ...r, status: statusFor(r, r.viol, r.pop) }));
  // R-T addendum, commit 2 — the distribution scan (runDistributionScan, extracted
  // to plausibility.js) runs in parallel with — not folded into — the BOUND/
  // INVARIANT scan above, exactly as the pre-conversion runSanity() did.
  const dist = await runDistributionScan(pool, DIST_FIELDS, RES, ZC);
  return { total, results, dist };
}

async function runAudit() {
  const pool = makeCliPool('parcel-sanity-audit');
  const { total, results, dist } = await runSanity(pool, { samples: true });
  await pool.end();
  console.log(`\n=== PARCEL SANITY AUDIT — ${total.toLocaleString()} residential parcels ===\n`);

  const line = (id, viol, pop, pct, sev, extra) =>
    `  [${sev.padEnd(4)}] ${id.padEnd(40)} ${String(viol).padStart(7)} / ${String(pop).padStart(7)} (${pct.toFixed(2).padStart(6)}%)  ${extra}`;

  for (const fam of ['BOUND', 'INVARIANT']) {
    console.log(`── ${fam} ${'─'.repeat(60)}`);
    for (const r of results.filter((x) => x.fam === fam).sort((a, b) => b.viol - a.viol)) {
      const mark = r.status === 'FAIL' ? '✗' : r.viol > 0 ? '⚠' : '·';
      console.log(`${mark} ` + line(r.id, r.viol, r.pop, r.pct, r.sev, r.viol ? `e.g. ${r.samples.join(',')}${r.gate ? '  [GATE]' : ''}` : `[${r.why}]`));
    }
    console.log('');
  }
  console.log(`── DISTRIBUTION (per-zone outlier: > p99 AND > 3× zone median, INFO-only) ${'─'.repeat(12)}`);
  for (const d of dist.sort((a, b) => b.viol - a.viol)) {
    const mark = d.viol > 0 ? '⚠' : '·';
    console.log(`${mark}   ${d.id.padEnd(40)} ${String(d.viol).padStart(7)} outliers  worst=${d.worst}  e.g. ${(d.samples || []).join(',')}`);
  }

  const flagged = results.filter((r) => r.viol > 0);
  const failing = results.filter((r) => r.status === 'FAIL');
  // "Violations" = real problems (HIGH/MED). INFO rows are visibility counts (e.g. correctly-gated
  // parcels), NOT violations — reported separately so the headline number isn't inflated by non-bugs.
  const totalViol = results.filter((r) => r.sev !== 'INFO').reduce((s, r) => s + r.viol, 0);
  const infoViz = results.filter((r) => r.sev === 'INFO' && r.viol > 0).reduce((s, r) => s + r.viol, 0);
  console.log(`\n=== SUMMARY: ${flagged.length}/${results.length} checks tripped · ${failing.length} FAIL-GATED · ${totalViol.toLocaleString()} HIGH/MED violations (+ ${infoViz.toLocaleString()} INFO visibility) · ${dist.filter((d) => d.viol > 0).length}/${dist.length} distribution fields with outliers ===`);
  console.log('Top offenders (HIGH/MED only):');
  for (const r of results.filter((r) => r.sev !== 'INFO' && r.viol > 0).sort((a, b) => b.viol - a.viol).slice(0, 8)) {
    console.log(`  ${r.viol.toLocaleString().padStart(8)}  ${r.id}  (${r.why})${r.gate ? '  [GATE→FAIL]' : ''}`);
  }
}

module.exports = {
  CHECK_DEFS, DIST_FIELDS, RES, ZC, LOWRISE,
  buildChecks, resolveCliConfig, runSanity, statusFor, deriveVerdict, makeCliPool,
};

if (require.main === module) {
  runAudit().catch((e) => { console.error(e); process.exit(1); });
}
