// Market metrics shared helpers — extracted from route.ts for testability
// (Next.js API routes cannot export non-handler functions)

export type WealthTier = 'high' | 'middle' | 'low';
export const TIER_LABELS: Record<WealthTier, string> = {
  high: 'High Income ($100K+)',
  middle: 'Middle Income ($60K-$100K)',
  low: 'Lower Income (<$60K)',
};
export const TIER_ORDER: WealthTier[] = ['high', 'middle', 'low'];

export function formatCurrency(cents: number): string {
  if (cents >= 1_000_000_000) return `$${(cents / 1_000_000_000).toFixed(1)}B`;
  if (cents >= 1_000_000) return `$${(cents / 1_000_000).toFixed(1)}M`;
  if (cents >= 1_000) return `$${(cents / 1_000).toFixed(0)}K`;
  return `$${cents}`;
}

/** Map raw permit_type to activity chart category */
const PERMIT_TYPE_MAP: Record<string, string> = {
  'Small Residential Projects': 'small_residential',
  'New Houses': 'new_houses',
  'Building Additions/Alterations': 'additions_alterations',
  'New Building': 'new_building',
  'Plumbing(PS)': 'plumbing',
  'Mechanical(MS)': 'hvac',
  'Drain and Site Service': 'drain',
  'Demolition Folder (DM)': 'demolition',
};

/** Map permit_type directly to trade slug for dedicated permit types */
export const PERMIT_TYPE_TO_TRADE: Record<string, string> = {
  'Plumbing(PS)': 'plumbing',
  'Mechanical(MS)': 'hvac',
  'Demolition Folder (DM)': 'demolition',
  'Fire/Security Upgrade': 'fire-protection',
  'Drain and Site Service': 'excavation',
};

export function mapPermitType(raw: string | null): string {
  if (!raw) return 'other';
  return PERMIT_TYPE_MAP[raw] ?? 'other';
}

export function trendPct(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}
