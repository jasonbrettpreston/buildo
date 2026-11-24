// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §4.3 Detail Screen
//             docs/specs/01-pipeline/83_lead_cost_model.md §2 (effective_area_sqm)
//             docs/specs/01-pipeline/57_source_neighbourhoods.md §2 (income fields)
//
// Pure formatting helpers for the [lead].tsx detail screen. Extracted into
// a leaf module so they're unit-testable without spinning up the screen
// renderer (per [flight-job].test precedent — full-tree render impractical
// under jest-node).

// Spec 83 §2 reports `effective_area_sqm` (mapped to `cost.modeled_gfa_sqm`
// in the API) in m². Spec 91 §4.3 specifies the mobile UI as "Square Footage
// Projection" → ft² for North American user. The API serves the area already
// converted (`cost.modeled_gfa_sqft`, the pinned setting parcels_sqm_to_sqft);
// this helper only formats it — no conversion factor lives on the phone
// (Spec 136 fe.44: "the conversion factor is content/settings, never code").
export function formatSqft(sqft: number | null | undefined): string | null {
  if (sqft === null || sqft === undefined || !Number.isFinite(sqft)) return null;
  return `${Math.round(sqft).toLocaleString()} sq ft`;
}

// Currency for neighbourhood incomes (Spec 57 — annual CAD from Census XLSX).
// Format with thousand separators + dollar sign. Returns null on null/NaN
// so consumer can render '—' placeholder.
export function formatIncome(v: number | null): string | null {
  if (v === null || !Number.isFinite(v)) return null;
  return `$${Math.round(v).toLocaleString()}`;
}

// Cost-tier label (Spec 83 §2). Returned verbatim with title-case mapping.
const COST_TIER_LABEL: Record<string, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
  major: 'Major',
  mega: 'Mega',
};
const COST_TIER_SYMBOL: Record<string, string> = {
  small: '$',
  medium: '$$',
  large: '$$$',
  major: '$$$$',
  mega: '$$$$$',
};

export function formatCostTier(tier: string | null): {
  label: string;
  symbol: string;
} {
  if (tier === null) return { label: '—', symbol: '' };
  return {
    label: COST_TIER_LABEL[tier] ?? tier,
    symbol: COST_TIER_SYMBOL[tier] ?? '',
  };
}

// Currency for cost estimates with K/M abbreviation (existing pattern from
// [lead].tsx pre-rewrite at lines 40-45).
export function formatCurrencyAbbrev(v: number | null): string | null {
  if (v === null || !Number.isFinite(v)) return null;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${Math.round(v)}`;
}
