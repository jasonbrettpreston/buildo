/**
 * KNOWN-GOOD FIXTURE — compute PURITY twin (CP-B4). The PASSING counterpart of
 * bad-compute-purity.js: the same shapes routed through the semantic seams, so
 * the gate's purity rules must stay SILENT here. ZERO violation-marker comments —
 * the gate asserts this file yields no purity hits at all.
 *
 * Seam routing of the G-codes:
 *   G1/G2 — reads go through ctx.stream (...) and only touch DECLARED relations;
 *   G5    — writes go through ctx.joinUpdate / ctx.flushBatch with plan-owned
 *           `*_sql` strings (a `*_sql` plan property IS the seam);
 *   G7    — tunables arrive as plain numbers on a function argument, never a
 *           ctx.config alias or inline read;
 *   G4/G8 — no raw pool verbs and no module-level enrich hook.
 *
 * ⚠️ NOT A STEP AND NOT LOADED BY ANYTHING. Fixtures are never executed; they are
 * parsed (AST-scanned) by the gate only.
 *
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 2, Rule 3 (gate E/CP)
 */

// Declared relations for THIS fixture; every read below stays inside this map.
const DECLARED = { reads: ['parcels'], writes: ['parcels'] };

// G5 — the UPDATE lives in the plan as a `*_sql` property, applied via a seam.
function planParcelZoneUpdate() {
  return { update_sql: 'UPDATE parcels SET zone = $1' };
}

// G5 — writes are flushed through the batch seam, never ctx.pool.query.
async function applyZoneUpdate(ctx, rows) {
  const plan = planParcelZoneUpdate();
  return ctx.flushBatch(plan.update_sql, rows);
}

// G1/G2 — the declared read is handed to ctx.stream, which owns the pool.
async function readDeclaredParcels(ctx) {
  return ctx.stream('SELECT id FROM parcels', [], { batchSize: 1000 });
}

// G5 — a join-update seam call whose SQL is the plan's own read/write string.
async function joinUpdateFromSource(ctx, sourceDatasetVersion) {
  return ctx.joinUpdate(0, 'UPDATE parcels SET zone = $1', [sourceDatasetVersion]);
}

// G7 — bounds come in as plain numbers from the caller, not from ctx.config.
function classifyArea(area, maxArea, minDepth) {
  if (area > maxArea) {
    return { violations: 1, detail: 'area above max' };
  }
  if (area <= minDepth) {
    return { violations: 1, detail: 'area below min' };
  }
  return { violations: 0 };
}

// R-DC control: a config value alias OUTSIDE a check body classifies domain output — not judged.
function classifyMatch(ctx, distanceM) {
  const near = Number(ctx.config.match_near_m);
  return distanceM <= near ? 'near' : 'far';
}

// Errors are reported through the logger seam, never swallowed raw.
async function runPass(ctx, rows, bounds) {
  try {
    await applyZoneUpdate(ctx, rows);
    return classifyArea(rows.length, bounds.maxArea, bounds.minDepth);
  } catch (err) {
    ctx.log.warn(err);
    return { violations: 0, detail: 'pass failed, logged' };
  }
}

module.exports = {
  DECLARED,
  planParcelZoneUpdate,
  applyZoneUpdate,
  readDeclaredParcels,
  joinUpdateFromSource,
  classifyArea,
  classifyMatch,
  runPass,
};
