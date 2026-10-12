/**
 * KNOWN-BAD FIXTURE — one violation per gate-E rule id, so the 11 new rules
 * appended to `scripts/ast-grep-rules/compute-shape.yml` are proven to FIRE
 * (Spec 121 §12b.6: a checker that never fires proves nothing).
 *
 * ⚠️ NOT A STEP AND NOT LOADED BY ANYTHING. It lives OUTSIDE scripts/lib/compute/
 * so `scripts/hooks/check-step-shape.mjs` never puts it in the blocking corpus;
 * the rules' `files:` globs name this directory explicitly so
 * `scripts/analysis/gates/compute-literals.mjs`'s `selfTest()` can scan it.
 *
 * One violation per rule id (compute-no-module-numeric-const gets THREE —
 * an UPPER_SNAKE_CASE const, a camelCase const, and a camelCase arithmetic
 * const — to prove case no longer decides whether the rule fires, Spec 124
 * §5 R-BA "McDonald's Airtight", 2026-09-26; compute-no-swallow gets TWO —
 * an empty `catch {}` and a non-empty catch that only assigns — to prove both
 * anchor arms of that rule fire):
 *   compute-no-sql-interval-literal     — INTERVAL '30 days'
 *   compute-no-sql-date-literal         — '2026-01-01'
 *   compute-no-module-numeric-const     — const MAX_RETRY_COUNT = 5 (UPPER_SNAKE_CASE)
 *                                       — const roundScale = 1000 (camelCase)
 *                                       — const msPerHour = 60 * 60 * 1000 (camelCase arithmetic)
 *   compute-no-literal-violation-compare — violations: fraction >= 0.1 ? 1 : 0
 *   compute-no-sql-numeric-bound        — cost_oor < 100 OR cost_oor > 1000000000
 *
 * 2026-10-11 R-BZ extension (six more ids, one site each unless noted):
 *   compute-no-sql-clock               — SELECT 1 WHERE created_at > now()
 *   compute-no-local-numeric-const     — const n = 5 (function-local)
 *   compute-no-literal-url             — https://example.invalid/x (reserved TLD)
 *   compute-forbidden-require-dynamic  — import(`pg`)
 *   compute-forbidden-require-descriptor — require('./bad-compute-literals.descriptor.json')
 *   compute-no-swallow                 — catch {} (empty) AND a catch that only assigns
 *
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 2, Rule 3, §5 R-BA (gate E)
 */

function badInterval(ctx) {
  return ctx.query(`SELECT 1 WHERE updated_at > now() - INTERVAL '30 days'`);
}

function badDateLiteral(ctx) {
  return ctx.query(`SELECT 1 WHERE created_at >= '2026-01-01'`);
}

const MAX_RETRY_COUNT = 5;
const roundScale = 1000;
const msPerHour = 60 * 60 * 1000;

function badViolationCompare(fraction) {
  return { violations: fraction >= 0.1 ? 1 : 0, detail: 'fraction too high' };
}

function badNumericBound(ctx) {
  return ctx.query(`SELECT 1 WHERE cost_oor < 100 OR cost_oor > 1000000000`);
}

// ── 2026-10-11 R-BZ extension — one site per new gate-E rule id ─────────────

// compute-no-sql-clock — the DATABASE measures "now", so no test can pin it.
function badSqlClock(ctx) {
  return ctx.query(`SELECT 1 WHERE created_at > now()`);
}

// compute-no-literal-url — an endpoint frozen into the compute. Reserved
// `.invalid` TLD on purpose: this is a shape, not a reachable host.
function badLiteralUrl(ctx) {
  return ctx.fetch('https://example.invalid/x');
}

// compute-forbidden-require-dynamic — a template literal defeats the
// literal-name constraint on compute-forbidden-require.
function badDynamicRequire() {
  return require(`pg`);
}

// compute-forbidden-require-descriptor — the raw JSON is a second source of
// truth beside the validated descriptor the runner hands over on ctx.
const badDescriptorRequire = require('./bad-compute-literals.descriptor.json');

// compute-no-swallow, anchor arm 1 — an EMPTY catch: the finding anchors on the
// catch clause itself.
function badEmptyCatch(fn) {
  try {
    return fn();
  } catch {}
  return null;
}

// compute-no-swallow, anchor arm 2 — a non-empty catch that only ASSIGNS into a
// local, so the failure never reaches a throw, ctx.report, or ctx.log. The
// finding anchors on the FIRST statement of the body.
function badSwallowedCatch(fn) {
  let lastError = null;
  try {
    return fn();
  } catch (err) {
    lastError = err;
  }
  return lastError;
}

// compute-no-local-numeric-const — the same `const $N = $V` shape as the
// MODULE-level consts above, but INSIDE a function body: a magic number with no
// name anyone can register (the sibling rule's carve-out, now its own rule).
function badLocalNumericConst() {
  const secondsPerHour = 3600;
  return secondsPerHour;
}

module.exports = {
  badInterval, badDateLiteral, MAX_RETRY_COUNT, roundScale, msPerHour,
  badViolationCompare, badNumericBound, functionLocalNumericConstIsFine,
  badSqlClock, badLiteralUrl, badDynamicRequire, badDescriptorRequire,
  badEmptyCatch, badSwallowedCatch, badLocalNumericConst,
};
