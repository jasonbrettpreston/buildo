// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.6.A.1
//             docs/specs/01-pipeline/84_lifecycle_phase_engine.md §7 (TS↔JS dual-path)
//             docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase C
// 🔗 DUAL CODE PATH: src/lib/leads/lead-id.ts must mirror this logic
//                   bit-for-bit. Parity verified by
//                   src/tests/lead-id-deriver.logic.test.ts.
//
// Pure function `deriveLeadId` — produces the canonical Phase B
// lead_id string from a permit row (`{ permit_num, revision_num }`)
// or a CoA application row (`{ application_number }`).
//
// Output format (matches the Phase B trigger on `permits` and
// `coa_applications` exactly):
//   - Permit: 'permit:' + permit_num + ':' + LPAD(revision_num, 2, '0')
//   - CoA:    'coa:' + application_number
//
// Hard guarantees:
//   - No DB access. No side effects.
//   - Same input → same output. Deterministic.
//   - Throws (does NOT return null/empty) on invalid input — the
//     database CHECK constraints + the application-layer Phase B
//     derivation pattern all assume non-empty, well-formed values.
//     Silent emission of an empty or malformed lead_id would cascade
//     to orphan rows in lead_trades / lead_parcels.
//
// Used by:
//   - scripts/migrate-to-lead-id.js (one-shot Phase C backfill — R5.2)
//   - scripts/classify-permits.js (dual-write — R5.3)
//   - scripts/link-parcels.js (dual-write — R5.3)
//   - scripts/compute-cost-estimates.js (read-source rekey — R5.4)
//   - scripts/compute-trade-forecasts.js (read-source rekey — R5.4)
//   - scripts/compute-opportunity-scores.js (R5.4)
//   - scripts/update-tracked-projects.js (R5.5)

'use strict';

/**
 * Derive the canonical Phase B lead_id from a permit or CoA row.
 * @param {object} input
 * @returns {string}
 * @throws Error if input is null/undefined, missing required fields,
 *   or simultaneously specifies both permit and CoA fields (ambiguous).
 */
function deriveLeadId(input) {
  if (input == null || typeof input !== 'object') {
    throw new Error('deriveLeadId: input must be an object');
  }

  // Permit branch: permit_num must be non-empty; revision_num must be
  // present (NULL/undefined rejected) but the empty string '' is allowed
  // because the Phase B trigger emits LPAD('', 2, '0') = '00' for it.
  // Matching trigger semantics is the explicit contract of this deriver.
  const hasPermit =
    input.permit_num != null && input.permit_num !== '' &&
    input.revision_num != null;
  const hasCoa = input.application_number != null && input.application_number !== '';

  if (hasPermit && hasCoa) {
    throw new Error('deriveLeadId: ambiguous input — both permit_num/revision_num and application_number provided');
  }

  if (hasCoa) {
    return `coa:${String(input.application_number)}`;
  }

  if (hasPermit) {
    // revision_num arrives from pg as VARCHAR; coerce numeric inputs safely.
    // Reproduce PostgreSQL LPAD(revision_num, 2, '0') byte-for-byte:
    //   - empty string '' → '00'  (pad)
    //   - '0', '5'        → '00', '05'  (pad)
    //   - '10', '50'      → '10', '50'  (exact)
    //   - '100', '001'    → '10', '00'  (TRUNCATE leftmost 2 — PG LPAD
    //                                     truncates over-width strings)
    const rev = String(input.revision_num);
    const lpad2 = rev.length >= 2 ? rev.slice(0, 2) : rev.padStart(2, '0');
    return `permit:${String(input.permit_num)}:${lpad2}`;
  }

  throw new Error('deriveLeadId: requires application_number OR (permit_num + revision_num)');
}

module.exports = { deriveLeadId };
