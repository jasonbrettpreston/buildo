/**
 * Accepted-baseline WARN builder — the producer-side acceptance pattern for a
 * persistently-red audit gate (Pipeline Rehab P4, 2026-08-03).
 *
 * When a gate's live value sits durably below its strict threshold for a
 * KNOWN, owned reason (a structural gap with a named fix epic — not a
 * regression the gate could catch by staying red), the acceptance lives IN
 * THE GATE (Spec 48 §4.6 — never a checker-side allowlist): the would-be
 * FAIL is downgraded to WARN, and this builder emits the §4.9-shaped
 * self-announcing pair:
 *
 *   1. accepted-WARN row (NEW metric name — never reuse an existing metric;
 *      `coa_audit_gate_warn_accepted` is RESERVED by Spec 85/mig 211):
 *      carries the LIVE value every run (a further regression stays visible
 *      in row history) + a self-documenting acceptance string naming the
 *      suspended threshold, the baseline provenance, and the self-retire
 *      condition.
 *   2. companion re-tighten INFO row (`<metric>_retighten`): the
 *      machine-observable re-tightening condition (§4.9 — a relaxation must
 *      never be a silent, forgettable bypass).
 *
 * SELF-RETIRE: returns null the moment `valuePct >= strictPct` — no
 * acceptance rows, the plain gate resumes (normal PASS). Also null for
 * unusable input (null/NaN): acceptance never invents rows from bad data.
 *
 * Pure — no I/O; gates stay read-only probes (Spec 47 Observer archetype).
 *
 * SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §4.5, §4.9
 */
'use strict';

/**
 * @param {object} args
 * @param {number | null} args.valuePct  live coverage value in percent (0-100)
 * @param {number} args.strictPct        the strict threshold the acceptance suspends
 * @param {string} args.acceptanceMetric NEW, unclaimed metric name for the accepted-WARN row
 * @param {string} args.baseline         baseline provenance (measured value + date + owning fix)
 * @returns {Array<{ metric: string, value: string, threshold: string, status: 'WARN' | 'INFO' }> | null}
 *   [acceptedWarnRow, retightenInfoRow], or null when self-retired / unusable input.
 */
function acceptedBaselineRows({ valuePct, strictPct, acceptanceMetric, baseline }) {
  if (valuePct == null || !Number.isFinite(valuePct)) return null;
  if (valuePct >= strictPct) return null; // self-retire: plain gate resumes
  return [
    {
      metric: acceptanceMetric,
      value: `${valuePct}%`,
      threshold:
        `accepted-WARN while < ${strictPct}% — baseline ${baseline}. ` +
        `Live value re-emitted every run; acceptance SELF-RETIRES at >= ${strictPct}% ` +
        '(this row disappears and the plain gate resumes). Spec 48 §4.9.',
      status: 'WARN',
    },
    {
      metric: `${acceptanceMetric}_retighten`,
      value: `${valuePct}%`,
      threshold: `re-tighten condition (machine-observable): live value >= ${strictPct}%`,
      status: 'INFO',
    },
  ];
}

module.exports = { acceptedBaselineRows };
