/**
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md
 * SPEC LINK: docs/specs/01-pipeline/49_data_completeness_profiling.md §2
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §4.1, §5.1, §5.5
 *
 * Parcel Sanity Profile — THE DOMAIN LOGIC ONLY. One folded scan (Ask A1: 42
 * declared checks[], one compute loader, never 42 standalone scans) over
 * `parcels`, config-driven for the 35 new + 2 reused `parcel_sanity_*`/shared
 * logic variables (`scripts/lib/assert-parcel-sanity-fields.js` CHECK_DEFS).
 *
 * Ported from `scripts/analysis/parcel-sanity-audit.js`'s `runSanity()` — that
 * file SURVIVES as the Reality-Check CLI instrument and re-imports `CHECKS`/
 * `runSanity` from here (fence F1, `.cursor/batch2_p1_1_assert_parcel_sanity_active_task.md`
 * §6) rather than forking a second bounds corpus.
 *
 * `DISTRIBUTION_SCOPE` (Fold B-7 wiring) hands the residential-scope predicate
 * and the zone-bucket CASE expression to `scripts/lib/step/index.js`'s generic
 * `kind:"distribution"` dispatch — see scripts/lib/step/plausibility.js.
 */
'use strict';

const { CHECK_DEFS, DIST_DEFS, RES, ZC } = require('../assert-parcel-sanity-fields');

/**
 * runSanity(pool, config) — the folded scan, callable standalone (the CLI's own
 * use, samples-capable there) as well as from `compute()` below. Mirrors
 * `parcel-sanity-audit.js`'s pre-conversion signature/return shape
 * ({total, results}) so that file's own `runAudit()` can re-import this
 * without re-deriving the SQL.
 */
async function runSanity(pool, config, { samples = false } = {}) {
  const cols = CHECK_DEFS.map((def) => {
    const applies = def.applies(config);
    let bad = def.bad(config);
    if (Array.isArray(def.accept) && def.accept.length) {
      bad = `(${bad}) AND id <> ALL(ARRAY[${def.accept.map(Number).join(',')}]::int[])`;
    }
    const base = `count(*) FILTER (WHERE (${applies}) AND (${bad}))::int AS "v_${def.id}",
     count(*) FILTER (WHERE ${applies})::int AS "p_${def.id}"`;
    return samples
      ? `${base},\n     (array_agg(id ORDER BY id) FILTER (WHERE (${applies}) AND (${bad})))[1:6] AS "s_${def.id}"`
      : base;
  }).join(',\n');
  const row = (await pool.query(`SELECT count(*)::int AS total,\n${cols}\nFROM parcels WHERE ${RES}`)).rows[0];
  const total = row.total;
  const results = CHECK_DEFS.map((def) => {
    const viol = row[`v_${def.id}`];
    const pop = row[`p_${def.id}`];
    return {
      id: def.id, fam: def.fam, sev: def.gate ? 'HIGH' : def.sev, gate: !!def.gate, why: def.why,
      pop, viol, pct: pop ? (100 * viol / pop) : 0, samples: row[`s_${def.id}`] || [], inert: pop === 0,
    };
  });
  return { total, results };
}

// batch2 P1.1 fix (②c, §5.5 (1)/(4) conformance) — `module.exports.checks` must be a
// DISPATCH TABLE (one NAMED function per declared check id, in descriptor order),
// not the raw CHECK_DEFS array (src/tests/step-conformance.infra.test.ts "§5.5
// compute shape — dispatch table ≡ declared checks"). The folded scan still runs
// EXACTLY ONCE per step invocation: `getScan(ctx)` memoizes the single `runSanity`
// promise per `ctx` (mirrors assert-data-bounds.js's own BRANCH_MEMO pattern), so
// 42 dispatch calls share one query, matching Ask A1's "one compute loader".
const SCAN_MEMO = new WeakMap();
function getScan(ctx) {
  if (!SCAN_MEMO.has(ctx)) {
    SCAN_MEMO.set(ctx, runSanity(ctx.pool, ctx.config, { samples: false }));
  }
  return SCAN_MEMO.get(ctx);
}

/** One dispatch entry per CHECK_DEFS id — reports its own slice of the shared scan. */
async function evalCheck(ctx, def) {
  const { results } = await getScan(ctx);
  const r = results.find((x) => x.id === def.id);
  if (!r) throw new Error(`[${ctx.descriptor.identity.name}] no result for check "${def.id}" from the folded scan`);
  if (r.inert) {
    // F5 / D-E 4 — the applicable population was 0: this check proves nothing,
    // never a green PASS even for a gate. verdict.js's checkRow() renders INFO
    // for observation.inert === true regardless of declared severity.
    ctx.report(def.id, { violations: 0, inert: true, detail: 'inert (population 0)' });
  } else {
    ctx.report(def.id, { violations: r.viol, detail: r.pop ? `${r.viol} / ${r.pop}` : String(r.viol) });
  }
}

const CHECKS = {};
for (const def of CHECK_DEFS) {
  const dispatchFn = (ctx) => evalCheck(ctx, def);
  Object.defineProperty(dispatchFn, 'name', { value: def.id, configurable: true });
  CHECKS[def.id] = dispatchFn;
}

/**
 * §5.5 (2) — run the SELECTED checks, and nothing else. `ctx.checks` is every
 * declared check id (sharing.varies_by_chain.checks:"none" — this step is not
 * per-chain), so in practice this always runs the full folded scan (once).
 */
async function compute(ctx) {
  ctx.log.info(`[${ctx.descriptor.identity.name}]`, '=== Parcel Sanity Profile: folded scan ===');
  for (const checkId of ctx.checks) {
    const fn = CHECKS[checkId];
    if (typeof fn !== 'function') {
      throw new Error(`[${ctx.descriptor.identity.name}] descriptor declares check "${checkId}" with no function in the compute dispatch table`);
    }
    await fn(ctx);
  }
  // Population context row — legacy `rows.unshift({metric:'residential_parcels_scanned', ...})`.
  // stepCtx.contextRow() preserves it without inflating checks.length past 42
  // (buildAuditTable appends extraRows LAST, so this row's array POSITION moves
  // from index 0 to the end — a named, position-only Class A diff).
  const { total } = await getScan(ctx);
  ctx.contextRow({ metric: 'residential_parcels_scanned', value: total, threshold: null, status: 'INFO' });
}

module.exports = compute;
module.exports.compute = compute;
module.exports.runSanity = runSanity;
module.exports.checks = CHECKS;
// Fold B-7 — generic DISTRIBUTION_SCOPE convention (scripts/lib/step/index.js reads
// this off `runnable.compute` for any kind:"distribution" plausibility entry).
// `fieldExprById` maps each descriptor plausibility id ("dist_<id>") to the BARE
// field EXPRESSION runDistributionEntries splices into buildDistributionQuery's
// own CTE — NOT the same text as the descriptor's `sql` field (which is the full,
// standalone, reduced query capture-step-golden.js executes verbatim; see APS-D2).
module.exports.DISTRIBUTION_SCOPE = {
  resScope: RES,
  zoneExpr: ZC,
  fieldExprById: Object.fromEntries(DIST_DEFS.map((d) => [`dist_${d.id}`, d.expr])),
};
