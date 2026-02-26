export interface DataQualitySnapshot {
  id: number;
  snapshot_date: string;

  // Permit universe
  total_permits: number;
  active_permits: number;

  // Trade classification
  permits_with_trades: number;
  trade_matches_total: number;
  trade_avg_confidence: number | null;
  trade_tier1_count: number;
  trade_tier2_count: number;
  trade_tier3_count: number;

  // Builder matching
  permits_with_builder: number;
  builders_total: number;
  builders_enriched: number;
  builders_with_phone: number;
  builders_with_email: number;
  builders_with_website: number;
  builders_with_google: number;
  builders_with_wsib: number;

  // Parcel linking
  permits_with_parcel: number;
  parcel_exact_matches: number;
  parcel_name_matches: number;
  parcel_spatial_matches: number;
  parcel_avg_confidence: number | null;

  // Neighbourhood
  permits_with_neighbourhood: number;

  // Geocoding
  permits_geocoded: number;

  // CoA linking
  coa_total: number;
  coa_linked: number;
  coa_avg_confidence: number | null;
  coa_high_confidence: number;
  coa_low_confidence: number;

  // Scope classification
  permits_with_scope: number;
  scope_project_type_breakdown: Record<string, number> | null;

  // Building massing
  building_footprints_total: number;
  parcels_with_buildings: number;

  // Data freshness
  permits_updated_24h: number;
  permits_updated_7d: number;
  permits_updated_30d: number;
  last_sync_at: string | null;
  last_sync_status: string | null;

  created_at: string;
}

export interface CoverageRate {
  label: string;
  matched: number;
  total: number;
  percentage: number;
}

export interface TrendPoint {
  date: string;
  value: number;
}

export interface MatchingMetrics {
  tradeCoverage: CoverageRate;
  builderEnrichment: CoverageRate;
  parcelLinking: CoverageRate;
  neighbourhoodCoverage: CoverageRate;
  geocoding: CoverageRate;
  coaLinking: CoverageRate;
}

export interface DataQualityResponse {
  current: DataQualitySnapshot | null;
  trends: DataQualitySnapshot[];
  lastUpdated: string | null;
}

/** Weights for the composite Data Effectiveness Score (must sum to 1.0) */
export const EFFECTIVENESS_WEIGHTS = {
  tradeCoverage: 0.25,
  builderEnrichment: 0.20,
  parcelLinking: 0.15,
  neighbourhoodCoverage: 0.15,
  geocoding: 0.15,
  coaLinking: 0.10,
} as const;

/**
 * Calculate the composite Data Effectiveness Score (0-100) from a snapshot.
 * Returns null if the snapshot has no active permits.
 */
export function calculateEffectivenessScore(s: DataQualitySnapshot): number | null {
  if (s.active_permits === 0) return null;

  const tradePct = (s.permits_with_trades / s.active_permits) * 100;
  const builderPct = s.builders_total > 0
    ? (s.builders_enriched / s.builders_total) * 100
    : 0;
  const parcelPct = (s.permits_with_parcel / s.active_permits) * 100;
  const neighbourhoodPct = (s.permits_with_neighbourhood / s.active_permits) * 100;
  const geocodingPct = (s.permits_geocoded / s.active_permits) * 100;
  const coaPct = s.coa_total > 0
    ? (s.coa_linked / s.coa_total) * 100
    : 0;

  const raw =
    tradePct * EFFECTIVENESS_WEIGHTS.tradeCoverage +
    builderPct * EFFECTIVENESS_WEIGHTS.builderEnrichment +
    parcelPct * EFFECTIVENESS_WEIGHTS.parcelLinking +
    neighbourhoodPct * EFFECTIVENESS_WEIGHTS.neighbourhoodCoverage +
    geocodingPct * EFFECTIVENESS_WEIGHTS.geocoding +
    coaPct * EFFECTIVENESS_WEIGHTS.coaLinking;

  return Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
}

/**
 * Extract MatchingMetrics from a snapshot for display in coverage cards.
 */
export function extractMetrics(s: DataQualitySnapshot): MatchingMetrics {
  return {
    tradeCoverage: {
      label: 'Trade Classification',
      matched: s.permits_with_trades,
      total: s.active_permits,
      percentage: s.active_permits > 0
        ? Math.round((s.permits_with_trades / s.active_permits) * 1000) / 10
        : 0,
    },
    builderEnrichment: {
      label: 'Builder Enrichment',
      matched: s.builders_enriched,
      total: s.builders_total,
      percentage: s.builders_total > 0
        ? Math.round((s.builders_enriched / s.builders_total) * 1000) / 10
        : 0,
    },
    parcelLinking: {
      label: 'Parcel Linking',
      matched: s.permits_with_parcel,
      total: s.active_permits,
      percentage: s.active_permits > 0
        ? Math.round((s.permits_with_parcel / s.active_permits) * 1000) / 10
        : 0,
    },
    neighbourhoodCoverage: {
      label: 'Neighbourhood',
      matched: s.permits_with_neighbourhood,
      total: s.active_permits,
      percentage: s.active_permits > 0
        ? Math.round((s.permits_with_neighbourhood / s.active_permits) * 1000) / 10
        : 0,
    },
    geocoding: {
      label: 'Geocoding',
      matched: s.permits_geocoded,
      total: s.active_permits,
      percentage: s.active_permits > 0
        ? Math.round((s.permits_geocoded / s.active_permits) * 1000) / 10
        : 0,
    },
    coaLinking: {
      label: 'CoA Linking',
      matched: s.coa_linked,
      total: s.coa_total,
      percentage: s.coa_total > 0
        ? Math.round((s.coa_linked / s.coa_total) * 1000) / 10
        : 0,
    },
  };
}
