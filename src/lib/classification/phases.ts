import { differenceInMonths } from 'date-fns';
import type { Permit } from '@/lib/permits/types';

// ---------------------------------------------------------------------------
// Construction phases
// ---------------------------------------------------------------------------
export type Phase =
  | 'early_construction'
  | 'structural'
  | 'finishing'
  | 'landscaping';

/**
 * Mapping from each construction phase to the trade slugs that are
 * typically active during that phase.
 */
export const PHASE_TRADE_MAP: Record<Phase, string[]> = {
  early_construction: [
    'excavation',
    'shoring',
    'demolition',
    'concrete',
    'waterproofing',
    'temporary-fencing',
  ],
  structural: [
    'framing',
    'structural-steel',
    'masonry',
    'concrete',
    'roofing',
    'plumbing',
    'hvac',
    'electrical',
    'elevator',
    'fire-protection',
    'pool-installation',
  ],
  finishing: [
    'insulation',
    'drywall',
    'painting',
    'flooring',
    'glazing',
    'fire-protection',
    'plumbing',
    'hvac',
    'electrical',
    'trim-work',
    'millwork-cabinetry',
    'tiling',
    'stone-countertops',
    'caulking',
    'security',
    'solar',
    'eavestrough-siding',
  ],
  landscaping: [
    'landscaping',
    'painting',
    'decking-fences',
    'pool-installation',
  ],
};

// ---------------------------------------------------------------------------
// Phase determination
// ---------------------------------------------------------------------------

/**
 * Determine the current construction phase of a permit based on its status
 * and the number of months since the issued date.
 *
 * Heuristic:
 *  - Permits that have not been issued yet -> early_construction
 *  - 0-3 months after issuance            -> early_construction
 *  - 4-9 months                           -> structural
 *  - 10-18 months                         -> finishing
 *  - 18+ months                           -> landscaping
 *
 * Certain statuses override the time-based logic:
 *  - "Completed" / "Closed"               -> landscaping
 *  - "Application" / "Not Issued"         -> early_construction
 */
export function determinePhase(permit: Partial<Permit>): Phase {
  const status = (permit.status ?? '').toLowerCase().trim();

  // Status overrides
  if (status === 'completed' || status === 'closed') {
    return 'landscaping';
  }
  if (status === 'application' || status === 'not issued') {
    return 'early_construction';
  }

  // Time-based determination
  const issued = permit.issued_date;
  if (!issued) {
    return 'early_construction';
  }

  const monthsSinceIssued = differenceInMonths(new Date(), issued);

  if (monthsSinceIssued <= 3) return 'early_construction';
  if (monthsSinceIssued <= 9) return 'structural';
  if (monthsSinceIssued <= 18) return 'finishing';
  return 'landscaping';
}

// ---------------------------------------------------------------------------
// Phase / trade check
// ---------------------------------------------------------------------------

/**
 * Return whether a given trade slug is considered "active" during a
 * particular construction phase.
 */
export function isTradeActiveInPhase(tradeSlug: string, phase: string): boolean {
  const activeTrades = PHASE_TRADE_MAP[phase as Phase];
  if (!activeTrades) return false;
  return activeTrades.includes(tradeSlug);
}
