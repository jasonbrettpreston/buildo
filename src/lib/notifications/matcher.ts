// ---------------------------------------------------------------------------
// Permit-to-user preference matcher
// ---------------------------------------------------------------------------
//
// When a new permit is classified, we need to determine which users should
// be notified. This module compares permit attributes against each user's
// stored preferences (trade filters, postal codes, wards, cost range) and
// returns the list of matching user IDs together with a human-readable
// reason string.
//
// User preferences are currently stored in Firestore (see auth/types.ts for
// the UserPreferences interface). Until the Firestore Admin SDK query layer
// is fully integrated, the main function returns an empty array.
// ---------------------------------------------------------------------------

/**
 * Represents a single user who matched a given permit along with the
 * reason(s) they matched.
 */
export interface MatchResult {
  user_id: string;
  reason: string;
}

/**
 * Permit fields required for matching against user preferences.
 */
export interface MatchablePermit {
  permit_num: string;
  revision_num: string;
  ward: string;
  postal: string;
  est_const_cost: number | null;
  trade_slugs: string[];
}

// ---------------------------------------------------------------------------
// Matching logic
// ---------------------------------------------------------------------------

/**
 * Find all users whose notification preferences match the supplied permit.
 *
 * Match criteria (any of the following is sufficient):
 *   - At least one overlapping trade slug between the permit's classified
 *     trades and the user's `trade_filters`.
 *   - The permit's ward is included in the user's `wards` list.
 *   - The permit's postal code prefix (first 3 characters, i.e. FSA) is
 *     included in the user's `postal_codes` list.
 *   - If the user has set `min_cost` / `max_cost`, the permit's estimated
 *     construction cost must fall within that range.
 *
 * TODO: Implement Firestore Admin SDK queries to fetch user preferences and
 * run the matching logic server-side. For now this is a stub that returns an
 * empty array. The matching algorithm is outlined in the helper below for
 * reference; once Firestore queries are wired in, call `matchesPreferences`
 * for each candidate user.
 */
export async function findMatchingUsers(
  _permit: MatchablePermit
): Promise<MatchResult[]> {
  // TODO: Query Firestore for users with overlapping preferences and run
  // matchesPreferences() against each candidate. Return aggregated results.
  return [];
}

// ---------------------------------------------------------------------------
// Pure matching helper (for use once Firestore queries are available)
// ---------------------------------------------------------------------------

/**
 * Determine whether a single user's preferences match a permit.
 *
 * Exported for unit-testing purposes. This is a pure function with no I/O.
 */
export function matchesPreferences(
  permit: MatchablePermit,
  preferences: {
    trade_filters: string[];
    postal_codes: string[];
    wards: string[];
    min_cost?: number;
    max_cost?: number;
  }
): { matched: boolean; reasons: string[] } {
  const reasons: string[] = [];

  // Trade overlap
  if (preferences.trade_filters.length > 0 && permit.trade_slugs.length > 0) {
    const userTrades = new Set(preferences.trade_filters);
    const overlap = permit.trade_slugs.filter((t) => userTrades.has(t));
    if (overlap.length > 0) {
      reasons.push(`matching trades: ${overlap.join(', ')}`);
    }
  }

  // Ward match
  if (preferences.wards.length > 0 && permit.ward) {
    if (preferences.wards.includes(permit.ward)) {
      reasons.push(`ward ${permit.ward}`);
    }
  }

  // Postal prefix match (FSA = first 3 characters)
  if (preferences.postal_codes.length > 0 && permit.postal) {
    const fsa = permit.postal.substring(0, 3).toUpperCase();
    const normalizedCodes = preferences.postal_codes.map((c) =>
      c.substring(0, 3).toUpperCase()
    );
    if (normalizedCodes.includes(fsa)) {
      reasons.push(`postal area ${fsa}`);
    }
  }

  // Cost range filter (only applied when the user has set bounds AND the
  // permit has a cost estimate)
  if (permit.est_const_cost != null) {
    const { min_cost, max_cost } = preferences;
    if (min_cost != null && permit.est_const_cost < min_cost) {
      // Below minimum -- no match from cost alone, but don't disqualify
      // matches from other criteria.
    } else if (max_cost != null && permit.est_const_cost > max_cost) {
      // Above maximum -- same treatment.
    } else if (min_cost != null || max_cost != null) {
      reasons.push(
        `cost $${permit.est_const_cost.toLocaleString()} within range`
      );
    }
  }

  return {
    matched: reasons.length > 0,
    reasons,
  };
}
