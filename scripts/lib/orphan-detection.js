// 🔗 SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §7 Orphan Logic
//
// Pure helper that determines whether a permit should enter the orphan
// branch (O1/O2/O3) of the lifecycle classifier.
//
// Spec 84 §7 explicitly scopes O-phases to "standalone trade permits"
// (HVA, PLB, DRN, ELE etc.). A permit is "standalone" iff it has NO
// parent context. Three forms of parent context disqualify orphan:
//   1. The permit itself is a parent permit (BLD or CMB suffix).
//   2. A sibling BLD/CMB exists at the same year+serial prefix.
//   3. The permit is linked to a Committee of Adjustment application
//      (`permits.linked_coa_application_number IS NOT NULL`). A CoA
//      application is the project's regulatory parent context —
//      trade permits attached to a CoA are NOT standalone work.
//      [WF3 #12 Pass-2.5 Finding B, 2026-05-22.]
//
// Why the BLD/CMB exclusion exists (legacy):
//   Earlier inline logic in scripts/classify-lifecycle-phase.js wrongly
//   orphaned single-revision BLDs because the only entry in their prefix
//   Set was themselves; the loop never set is_orphan = false. Surfaced
//   via manual verification on `25 122754 BLD` (24 Northbridge): an
//   actively-inspected build with two live sub-permits at P18, but
//   classified as O3.
//
// Why the CoA-linkage exclusion was added (WF3 #12 Finding B):
//   The §7a Inspector spot-check on 2026-05-20 showed 4/4 CoA-linked
//   trade permits in the 12-permit sample were classified as orphan
//   (O1/O2/O3) and consequently dropped from the lead feed via Spec 85's
//   SKIP_PHASES_SQL filter. Spec 84 §7 makes the contract clear:
//   "standalone trade permit" means no parent context. CoA linkage
//   is parent context (same conceptual category as BLD/CMB sibling).
//
// Out of scope here:
//   The same §7a sample showed 7/8 NON-CoA-linked permits also
//   classified as orphan when the operator considered them non-orphan.
//   Investigation (2026-05-22) confirmed: schema has no other linkage
//   column on permits; the BLD/CMB load is exhaustive. The 7/8 cases
//   must be one of (race-condition transient orphans / archived-parent
//   feed-perspective orphans / genuinely-standalone permits where the
//   operator's intuition was wrong). No schema-driven fix is possible
//   without either fresh sample data or a new linkage signal. Filed in
//   docs/reports/review_followups.md for future WF3.
//
// `bldCmbByPrefix` is the same Map<prefix, Set<permit_num>> built by
// the calling pipeline script. The helper does not mutate it.

'use strict';

/** Suffixes that disqualify a permit from being an orphan per Spec 84 §7. */
const PARENT_PERMIT_SUFFIXES = [' BLD', ' CMB'];

/**
 * @param {string} permitNum - The permit number, e.g. "25 122754 BLD" or "25 122754 HVA".
 * @param {string | null} linkedCoaApplicationNumber - `permits.linked_coa_application_number` value; non-null means the permit has CoA parent context.
 * @param {Map<string, Set<string>>} bldCmbByPrefix - Map keyed by "YY NNNNNN" prefix → Set of BLD/CMB permit_nums sharing that prefix.
 * @returns {boolean} `true` if the permit qualifies as an orphan trade permit per Spec 84 §7; `false` if it has a parent BLD/CMB OR is itself a BLD/CMB OR is linked to a CoA application.
 */
function computeIsOrphan(permitNum, linkedCoaApplicationNumber, bldCmbByPrefix) {
  // Step 1 — Spec 84 §7 categorical rule: BLD and CMB permits are
  // parent permits, not standalone trade permits. They can never be
  // orphans, regardless of whether sibling revisions exist.
  for (const suffix of PARENT_PERMIT_SUFFIXES) {
    if (permitNum.endsWith(suffix)) {
      return false;
    }
  }

  // Step 2 — Spec 84 §7 CoA-linkage rule (WF3 #12 Finding B, 2026-05-22):
  // a permit attached to a Committee of Adjustment application has CoA
  // parent context and is NOT standalone work.
  if (linkedCoaApplicationNumber != null) {
    return false;
  }

  // Step 3 — non-BLD/CMB, non-CoA-linked permits (HVA/PLB/DRN/ELE/MTL/TPS/etc.):
  // orphan iff no parent BLD/CMB exists at the same prefix. Mirrors
  // the original SQL semantics: orphan iff no OTHER BLD/CMB row shares
  // the year + serial-number prefix.
  const parts = permitNum.split(' ');
  if (parts.length < 3) {
    // Malformed permit_num; defensive default to orphan. Upstream
    // classifier should reject malformed input separately.
    return true;
  }

  const prefix = `${parts[0]} ${parts[1]}`;
  const siblings = bldCmbByPrefix.get(prefix);
  if (!siblings) return true;

  // Existing semantics preserved: orphan iff no OTHER permit in the Set.
  // A sub-permit that somehow lands in this map (degenerate case) is
  // still orphan because the only matching pn IS itself.
  for (const pn of siblings) {
    if (pn !== permitNum) {
      return false;
    }
  }
  return true;
}

module.exports = { computeIsOrphan };
