/**
 * KNOWN-BAD FIXTURE — compute PURITY (CP-B4). Exactly ONE site per code, so the
 * gate's purity rules are proven to FIRE (Spec 121 §12b.6: a checker that never
 * fires proves nothing). Every violation line ends with `// expect: <CODE>`, and
 * the gate asserts it finds EXACTLY one hit per code — no more, no fewer.
 *
 * The codes (plan .cursor/wf1_compute_purity_active_task.md, Phase 1 G1–G8):
 *   G1  reads a raw control/ledger table through ctx.pool.query (pipeline_runs);
 *       closure modules count too — see ./helpers/purity-helper.js (sync_runs).
 *   G2  ctx.pool.query against a relation NOT in this fixture's DECLARED map.
 *   G3  information_schema introspection (column_name for 'parcels').
 *   G4  session/DML/DDL/transaction verbs run through the pool itself —
 *       BEGIN, VACUUM, pg_advisory_xact_lock, and a raw ctx.pool.connect().
 *   G5  direct DML (UPDATE) issued through ctx.pool.query instead of a seam.
 *   G7  comparisons against a ctx.config alias (and ctx.config inline) —
 *       module tunables must be resolved through the SeamConfig, not inlined.
 *   G8  a module-level hook (module.exports.enrich_hooks) wired to a raw
 *       contract reader rather than declared as data (enrich-contract).
 *
 * ⚠️ NOT A STEP AND NOT LOADED BY ANYTHING. Fixtures are never executed; they are
 * parsed (AST-scanned) by the gate only.
 *
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 2, Rule 3 (gate E/CP)
 */

const purityHelper = require('./helpers/purity-helper');

// Declared relations for THIS fixture. Anything the fixture reads/writes that is
// not listed here is undeclared (G2). The sibling descriptor is intentionally
// absent: with no `*_schema.json` next to this file, DECLARED is the whole world.
const DECLARED = { reads: ['parcels'], writes: ['parcels'] };

// ── G1 — raw read of the ledger table (pipeline_runs) via the pool ──────────────
async function readLedgerWatermark(ctx, x) {
  return ctx.pool.query('SELECT max(started_at) FROM pipeline_runs WHERE pipeline = $1', [x]); // expect: G1
}

// ── G2 — reads a relation this fixture never declared ───────────────────────────
async function readUndeclared(ctx) {
  return ctx.pool.query('SELECT id FROM undeclared_table_xyz'); // expect: G2
}

// ── G3 — information_schema introspection ────────────────────────────────────────
async function introspectColumns(ctx) {
  return ctx.pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'parcels'"); // expect: G3
}

// ── G4 — session / DDL / transaction verbs issued through the pool ───────────────
async function badVerbs(ctx) {
  await ctx.pool.query('BEGIN'); // expect: G4
  await ctx.pool.query('VACUUM ANALYZE parcels'); // expect: G4
  await ctx.pool.query('SELECT pg_advisory_xact_lock(42)'); // expect: G4
  const c = await ctx.pool.connect(); // expect: G4
  return c;
}

// ── G5 — direct DML through the pool instead of a semantic seam ──────────────────
async function directDml(ctx, a, b) {
  return ctx.pool.query('UPDATE parcels SET zone = $1 WHERE id = $2', [a, b]); // expect: G5
}

// ── G7 — module tunables read via a ctx.config alias / inline ────────────────────
function aliasCompare(ctx, row) {
  const cfg = ctx.config || {};
  if (row.area > cfg.max_area) { // expect: G7
    return { violations: 1 };
  }
  if (row.depth <= ctx.config.min_depth) {} // expect: G7
  return { violations: 0 };
}

// ── G8 — a hook wired to a raw contract reader (enrich-contract bypass) ──────────
module.exports.enrich_hooks = { contract_read: readContract };

function readContract() { throw new Error('x'); } // expect: G8

module.exports.DECLARED = DECLARED;
module.exports.readLedgerWatermark = readLedgerWatermark;
module.exports.readUndeclared = readUndeclared;
module.exports.introspectColumns = introspectColumns;
module.exports.badVerbs = badVerbs;
module.exports.directDml = directDml;
module.exports.aliasCompare = aliasCompare;
module.exports.purityHelper = purityHelper;
