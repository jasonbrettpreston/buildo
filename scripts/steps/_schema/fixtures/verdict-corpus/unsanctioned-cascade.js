/**
 * KNOWN-BAD FIXTURE — Spec 124 §2 Rule 10, WF3 "Rules 10-12 output panel
 * remediation" commit 3. A hand-rolled SECOND verdict-derivation cascade,
 * structurally identical to the real corpus violation class
 * `checkNoSecondDerivation` (`scripts/analysis/step-validate.mjs`) exists to
 * catch — the same shape `scripts/lib/step/plausibility.js`'s retired
 * `verdictCascade` was (WF2 C1) and the same regex
 * (`VERDICT_CASCADE_RE`)/site (`VERDICT_SITE_RE`) detection the real corpus
 * scan uses.
 *
 * ⚠️ NOT scanned by default. It lives OUTSIDE `VERDICT_LIBRARY_CORPUS` (never
 * one of the 11 real `scripts/lib/step/*.js`/`scripts/lib/pipeline.js`/
 * `scripts/lib/source-version.js` files, and NOT `require()`'d by anything —
 * `grep -rn "unsanctioned-cascade" --include=*.js` outside this file and its
 * own conformance lock returns nothing) so it can never contaminate a real
 * `step:validate` run. `src/tests/step-conformance.infra.test.ts`'s Rule 10
 * lock spawns the real CLI with `BUILDO_VERDICT_CORPUS_EXTRA` pointed at THIS
 * file (the same additive, test-only env-override convention as
 * `BUILDO_PROGRAMME_ITEMS_PATH`/`BUILDO_CHURN_TABLE_PATH`), proving
 * `checkNoSecondDerivation` reports it `unsanctioned` with a `file:line`
 * citation naming the cascade below — Spec 121 §12b.6: a checker never proven
 * to fire is not evidence.
 *
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §2 Rule 10
 * SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.5/§3.6
 */
'use strict';

/** The exact shape Rule 10 bans, at a KNOWN line the lock test cites by number. */
function unsanctionedDeriveVerdict(rows) {
  return rows.some((r) => r.status === 'FAIL') ? 'FAIL'
    : rows.some((r) => r.status === 'WARN') ? 'WARN' : 'PASS';
}

module.exports = { unsanctionedDeriveVerdict };
