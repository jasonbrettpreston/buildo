/**
 * KNOWN-BAD FIXTURE — one violation per gate-E rule id, so the 5 new rules
 * appended to `scripts/ast-grep-rules/compute-shape.yml` are proven to FIRE
 * (Spec 121 §12b.6: a checker that never fires proves nothing).
 *
 * ⚠️ NOT A STEP AND NOT LOADED BY ANYTHING. It lives OUTSIDE scripts/lib/compute/
 * so `scripts/hooks/check-step-shape.mjs` never puts it in the blocking corpus;
 * the rules' `files:` globs name this directory explicitly so
 * `scripts/analysis/gates/compute-literals.mjs`'s `selfTest()` can scan it.
 *
 * One violation per rule id:
 *   compute-no-sql-interval-literal     — INTERVAL '30 days'
 *   compute-no-sql-date-literal         — '2026-01-01'
 *   compute-no-upper-numeric-const      — const MAX_RETRY_COUNT = 5
 *   compute-no-literal-violation-compare — violations: fraction >= 0.1 ? 1 : 0
 *   compute-no-sql-numeric-bound        — cost_oor < 100 OR cost_oor > 1000000000
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

function badViolationCompare(fraction) {
  return { violations: fraction >= 0.1 ? 1 : 0, detail: 'fraction too high' };
}

function badNumericBound(ctx) {
  return ctx.query(`SELECT 1 WHERE cost_oor < 100 OR cost_oor > 1000000000`);
}

module.exports = { badInterval, badDateLiteral, MAX_RETRY_COUNT, badViolationCompare, badNumericBound };
