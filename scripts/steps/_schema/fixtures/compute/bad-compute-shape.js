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
 *   compute-no-console          — the console.log below
 *   compute-no-bare-fetch       — the bare fetch(url)
 *   compute-no-wall-clock       — Date.now()
 *   compute-no-process-env      — process.env.PIPELINE_CHAIN
 *   compute-forbidden-require   — require('pg')
 *
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.5
 */
'use strict';

const { Pool } = require('pg');

async function bad_check(ctx) {
  const started = Date.now();
  const chain = process.env.PIPELINE_CHAIN;
  console.log(`running for ${chain} with ${Pool.name}`);
  const res = await fetch('https://example.invalid/never-called');
  ctx.report('bad_check', { violations: res.ok ? 0 : 1, detail: started });
}

const CHECKS = { bad_check };

async function compute(ctx) {
  for (const id of ctx.checks) await CHECKS[id](ctx);
}

module.exports = compute;
module.exports.compute = compute;
module.exports.checks = CHECKS;
