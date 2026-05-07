// 🔗 SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §7 Orphan Logic
//
// Pure helper that determines whether a permit should enter the orphan
// branch (O1/O2/O3) of the lifecycle classifier.
//
// Spec 84 §7 explicitly scopes O-phases to "standalone trade permits"
// (HVA, PLB, DRN, ELE etc.). BLD and CMB are parent-permit / combined-
// folder permits — they CANNOT be standalone trade permits and therefore
// can NEVER legitimately fall into an O-phase.
//
// Earlier inline logic in scripts/classify-lifecycle-phase.js wrongly
// orphaned single-revision BLDs because the only entry in their prefix
// Set was themselves; the loop never set is_orphan = false. Surfaced
// via manual verification on `25 122754 BLD` (24 Northbridge): an
// actively-inspected build with two live sub-permits at P18, but
// classified as O3.
//
// Fix strategy:
//   1. SHORT-CIRCUIT: if the permit suffix is BLD or CMB, is_orphan = false
//      regardless of prefix-group state. Spec 84 §7 categorical rule.
//   2. SUB-PERMITS (HVA/PLB/DRN/ELE/MTL/TPS/etc.): keep the existing
//      sibling-search semantics — orphan iff no parent BLD/CMB exists
//      at the prefix.
//
// `bldCmbByPrefix` is the same Map<prefix, Set<permit_num>> built by
// the calling pipeline script. The helper does not mutate it.

'use strict';

/** Suffixes that disqualify a permit from being an orphan per Spec 84 §7. */
const PARENT_PERMIT_SUFFIXES = [' BLD', ' CMB'];

/**
 * @param {string} permitNum - The permit number, e.g. "25 122754 BLD" or "25 122754 HVA".
 * @param {Map<string, Set<string>>} bldCmbByPrefix - Map keyed by "YY NNNNNN" prefix → Set of BLD/CMB permit_nums sharing that prefix.
 * @returns {boolean} `true` if the permit qualifies as an orphan trade permit per Spec 84 §7; `false` if it has a parent BLD/CMB OR is itself a BLD/CMB.
 */
function computeIsOrphan(permitNum, bldCmbByPrefix) {
  // Step 1 — Spec 84 §7 categorical rule: BLD and CMB permits are
  // parent permits, not standalone trade permits. They can never be
  // orphans, regardless of whether sibling revisions exist.
  for (const suffix of PARENT_PERMIT_SUFFIXES) {
    if (permitNum.endsWith(suffix)) {
      return false;
    }
  }

  // Step 2 — non-BLD/CMB permits (HVA/PLB/DRN/ELE/MTL/TPS/etc.):
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
