/**
 * KNOWN-BAD FIXTURE — every §5.5 (2)(3) violation in one file, so
 * `scripts/ast-grep-rules/compute-shape.yml` is proven to FIRE (Spec 121 §12b.6:
 * a checker that never fires proves nothing).
 *
 * ⚠️ NOT A STEP AND NOT LOADED BY ANYTHING. It lives OUTSIDE scripts/lib/compute/
 * so `scripts/hooks/check-step-shape.mjs` never puts it in the blocking corpus;
 * the rules' `files:` globs name this directory explicitly so the canary in
 * src/tests/step-conformance.infra.test.ts can scan it.
 *
 * One violation per rule id:
 *   compute-no-console             — the console.log below
 *   compute-no-bare-fetch          — the bare fetch(url)
 *   compute-no-wall-clock          — Date.now()
 *   compute-no-process-env         — process.env.PIPELINE_CHAIN
 *   compute-forbidden-require      — require('pg')
 *   compute-no-literal-url-tunable — `&limit=20` baked into the URL (§1.2a P4)
 *   compute-no-literal-byte-window — `Range: bytes=0-2048` (§1.2a P4)
 *   compute-no-literal-threshold   — `violations > 3`, a limit the descriptor owns
 *   compute-no-postgis-branch      — `ctx.hasPostGIS` branch (Spec 124 §2 Rule 2, R-W)
 *   compute-no-verdict-derivation  — `const verdict = … ? 'FAIL' : 'PASS'` (Spec 124 §2 Rule 10, C1)
 *
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.5, §1.2a P4
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §2 Rule 2 (R-W), Rule 10
 */
'use strict';

const { Pool } = require('pg');

async function bad_check(ctx) {
  const started = Date.now();
  const chain = process.env.PIPELINE_CHAIN;
  console.log(`running for ${chain} with ${Pool.name}`);
  const res = await fetch('https://example.invalid/never-called?limit=20', {
    headers: { Range: 'bytes=0-2048' },
  });
  const violations = res.ok ? 0 : 1;
  // compute-no-verdict-derivation (Rule 10) — a compute must never derive a verdict
  // of its own; that is scripts/lib/step/verdict.js's deriveVerdict's one job.
  const verdict = violations > 3 ? 'FAIL' : 'PASS';
  if (ctx.hasPostGIS) {
    ctx.report('bad_check', { violations: violations > 3 ? violations : 0, detail: `${started}:${verdict}` });
    return;
  }
  ctx.report('bad_check', { violations: violations > 3 ? violations : 0, detail: `${started}:${verdict}` });
}

const CHECKS = { bad_check };

async function compute(ctx) {
  for (const id of ctx.checks) await CHECKS[id](ctx);
}

module.exports = compute;
module.exports.compute = compute;
module.exports.checks = CHECKS;
