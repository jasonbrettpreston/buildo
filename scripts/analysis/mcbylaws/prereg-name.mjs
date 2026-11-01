// SPEC LINK: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-MA (amends R-KV; 2026-11-01-batch-ao#CHAT-216.O-28)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-79/h/plan.md section 2.1 (one pure module owns the prereg file name form; the loop gate and arm C both import it)
//
// A task numbers its preregs 1, 2, ... in its own order: scripts/analysis/bylaw-validation/coa-expected/prereg-<MB-id>-<k>.json.
// k has no leading zero (so -2 and -02 cannot both claim 2) and is compared as an integer (so -10 is newer than -2).

/** The prereg file name form. Capture 1 = the task (MB-<digits>), capture 2 = k. Directly inside coa-expected/ only. */
export const PREREG_FORM_RE = /^scripts\/analysis\/bylaw-validation\/coa-expected\/prereg-(MB-\d+)-([1-9]\d*)\.json$/;

/** {task, k} of a repo-relative path of the form, or null. */
export function parsePreregName(rel) {
  if (typeof rel !== 'string') return null;
  const m = PREREG_FORM_RE.exec(rel);
  return m ? { task: m[1], k: Number(m[2]) } : null;
}

/** Sort comparator on {k}: the newest (highest integer k) first. */
export function byNewest(a, b) {
  return b.k - a.k;
}
