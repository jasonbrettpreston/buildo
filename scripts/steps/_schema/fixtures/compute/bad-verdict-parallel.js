/**
 * KNOWN-BAD FIXTURE — a compute that derives its own PARALLEL verdict cascade
 * instead of reporting observations and letting `scripts/lib/step/verdict.js`'s
 * `deriveVerdict(rows)` fold them (Spec 124 §2 Rule 10, WF2 "Rules 10/11/12
 * mechanical checkers", C1). Proves `compute-no-verdict-derivation`
 * (`scripts/ast-grep-rules/compute-shape.yml`) FIRES on the exact hand-rolled
 * shape the rule exists to retire — Spec 121 §12b.6: a checker that has never
 * been proven to fire is not evidence.
 *
 * ⚠️ NOT A STEP AND NOT LOADED BY ANYTHING. It lives OUTSIDE
 * scripts/lib/compute/ so `scripts/hooks/check-step-shape.mjs` never puts it in
 * the blocking corpus; the rule's `files:` glob names this directory
 * explicitly so the canary in src/tests/step-conformance.infra.test.ts can
 * scan it.
 *
 * ONE violation, isolated (unlike bad-compute-shape.js's all-in-one fixture,
 * which also carries this same shape so the combined RED battery covers it
 * too): `const verdict = hasFails ? 'FAIL' : 'PASS'` — the literal duplicate-
 * of-`deriveVerdict` cascade Rule 10 bans.
 *
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §2 Rule 10
 * SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.5/§3.6
 */
'use strict';

async function bad_check(ctx) {
  const hasFails = ctx.checks.some((id) => id === 'never_matches');
  // The exact shape Rule 10 bans: a SECOND, hand-rolled PASS/WARN/FAIL cascade,
  // parallel to scripts/lib/step/verdict.js's deriveVerdict(rows).
  const verdict = hasFails ? 'FAIL' : 'PASS';
  ctx.report('bad_check', { violations: hasFails ? 1 : 0, detail: verdict });
}

const CHECKS = { bad_check };

async function compute(ctx) {
  for (const id of ctx.checks) await CHECKS[id](ctx);
}

module.exports = compute;
module.exports.compute = compute;
module.exports.checks = CHECKS;
