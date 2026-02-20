// ---------------------------------------------------------------------------
// Subscription plan definitions and feature gating
// ---------------------------------------------------------------------------

/**
 * Available subscription tiers.
 */
export type PlanTier = 'free' | 'pro' | 'enterprise';

/**
 * Feature flags and limits associated with each plan.
 *
 * Numeric fields represent hard limits (use `Infinity` for unlimited).
 * Boolean fields act as feature toggles.
 */
export interface PlanFeatures {
  max_saved_permits: number;
  max_exports_per_day: number;
  has_analytics: boolean;
  has_teams: boolean;
  has_api_access: boolean;
  has_priority_support: boolean;
  /** Monthly price in Canadian dollars. */
  price_monthly_cad: number;
}

// ---------------------------------------------------------------------------
// Plan catalog
// ---------------------------------------------------------------------------

export const PLANS: Record<PlanTier, PlanFeatures> = {
  free: {
    max_saved_permits: 5,
    max_exports_per_day: 2,
    has_analytics: false,
    has_teams: false,
    has_api_access: false,
    has_priority_support: false,
    price_monthly_cad: 0,
  },
  pro: {
    max_saved_permits: Infinity,
    max_exports_per_day: Infinity,
    has_analytics: true,
    has_teams: false,
    has_api_access: false,
    has_priority_support: false,
    price_monthly_cad: 29,
  },
  enterprise: {
    max_saved_permits: Infinity,
    max_exports_per_day: Infinity,
    has_analytics: true,
    has_teams: true,
    has_api_access: true,
    has_priority_support: true,
    price_monthly_cad: 99,
  },
};

// ---------------------------------------------------------------------------
// Feature gate checks
// ---------------------------------------------------------------------------

/**
 * Check whether a user on the given plan has access to a specific feature.
 *
 * For boolean features (`has_*`), returns the flag value directly.
 * For numeric features (`max_*`), returns `true` if the limit is greater
 * than zero (i.e., the feature is available at all).
 *
 * @param userPlan  The user's current subscription tier.
 * @param feature   The feature key to check.
 * @returns `true` if the feature is available on the plan.
 */
export function canAccess(
  userPlan: PlanTier,
  feature: keyof PlanFeatures
): boolean {
  const plan = PLANS[userPlan];
  const value = plan[feature];

  if (typeof value === 'boolean') {
    return value;
  }

  // Numeric limits: available if > 0
  return value > 0;
}

/**
 * Check whether the user's current usage is still within the plan's limit
 * for a given numeric feature.
 *
 * @param userPlan     The user's current subscription tier.
 * @param feature      The feature key (must correspond to a numeric limit).
 * @param currentUsage The user's current count for this feature.
 * @returns `true` if `currentUsage` is below the plan limit.
 */
export function isWithinLimit(
  userPlan: PlanTier,
  feature: string,
  currentUsage: number
): boolean {
  const plan = PLANS[userPlan];
  const key = feature as keyof PlanFeatures;
  const limit = plan[key];

  if (typeof limit !== 'number') {
    // Non-numeric feature -- treat as unlimited
    return true;
  }

  return currentUsage < limit;
}
