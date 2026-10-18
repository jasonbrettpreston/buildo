'use strict';
/**
 * The enrich_permits compute entry — one line over the ONE shared lead-zoning module.
 *
 * Operator-approved 2026-10-18 (wave-4 plan question 9): enrich_permits and enrich_coa_zoning are two thin
 * step shells over ONE shared compute module (`scripts/lib/enrich-lead-zoning.js`). This entry exists only because the
 * tooling resolves a step's compute by its shell's basename (`capture-step-golden.js` computePathFor); it
 * binds the target and adds nothing.
 *
 * SPEC LINK: docs/specs/01-pipeline/66_enrich_permits.md
 */
module.exports = require('../enrich-lead-zoning').forTarget('permits');
