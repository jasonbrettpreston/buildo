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

  // Trade classification by use-type
  trade_residential_classified: number;
  trade_residential_total: number;
  trade_commercial_classified: number;
  trade_commercial_total: number;

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
  permits_with_scope_tags: number;
  permits_with_detailed_tags: number;
  scope_tags_top: Record<string, number> | null;

  // Building massing
  building_footprints_total: number;
  parcels_with_buildings: number;

  // Data freshness
  permits_updated_24h: number;
  permits_updated_7d: number;
  permits_updated_30d: number;
  last_sync_at: string | null;
  last_sync_status: string | null;

  // Null tracking (field completeness)
  null_description_count: number;
  null_builder_name_count: number;
  null_est_const_cost_count: number;
  null_street_num_count: number;
  null_street_name_count: number;
  null_geo_id_count: number;

  // Violation counts
  violation_cost_out_of_range: number;
  violation_future_issued_date: number;
  violation_missing_status: number;
  violations_total: number;

  // Schema drift tracking
  schema_column_counts: Record<string, number> | null;

  // SLA metrics
  sla_permits_ingestion_hours: number | null;

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

/**
 * Find the snapshot closest to `daysAgo` days before today.
 * Only considers snapshots that are at least 7 days old to avoid
 * comparing today's snapshot against itself (which always yields delta 0).
 * Returns null if trends is empty or no snapshot qualifies.
 */
export function findSnapshotDaysAgo(
  trends: DataQualitySnapshot[],
  daysAgo: number
): DataQualitySnapshot | null {
  if (trends.length === 0) return null;

  const now = new Date();
  const target = new Date(now);
  target.setDate(target.getDate() - daysAgo);
  const targetMs = target.getTime();

  // Minimum age: snapshot must be at least 7 days old
  const minAge = new Date(now);
  minAge.setDate(minAge.getDate() - 7);
  const minAgeMs = minAge.getTime();

  let closest: DataQualitySnapshot | null = null;
  let closestDiff = Infinity;

  for (const snap of trends) {
    const snapMs = new Date(snap.snapshot_date).getTime();
    // Skip snapshots that are too recent (less than 7 days old)
    if (snapMs > minAgeMs) continue;

    const diff = Math.abs(snapMs - targetMs);
    if (diff < closestDiff) {
      closestDiff = diff;
      closest = snap;
    }
  }

  return closest;
}

/**
 * Compute the delta between current and previous values.
 * Returns positive = up, negative = down, null = no previous data.
 */
export function trendDelta(
  current: number,
  previous: number | null
): number | null {
  if (previous === null) return null;
  return Math.round((current - previous) * 10) / 10;
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

// ---------------------------------------------------------------------------
// SLA Targets (hours)
// ---------------------------------------------------------------------------

export const SLA_TARGETS: Record<string, number> = {
  permits: 24,
  coa: 48,
  builders: 48,
  address_points: 2160,   // 90 days
  parcels: 2160,
  massing: 2160,
  neighbourhoods: 8760,   // 365 days
};

// ---------------------------------------------------------------------------
// Volume Anomaly Detection
// ---------------------------------------------------------------------------

export interface VolumeAnomaly {
  source: string;
  expected: number;
  actual: number;
  deviations: number;
  direction: 'drop' | 'spike';
}

/**
 * Detect volume anomalies using 2-standard-deviation threshold on a 30-day window.
 * Compares the latest snapshot's permits_updated_24h against the historical average.
 */
export function detectVolumeAnomalies(trends: DataQualitySnapshot[]): VolumeAnomaly[] {
  if (trends.length < 3) return [];

  const current = trends[0];
  const historical = trends.slice(1);

  const values = historical.map((s) => s.permits_updated_24h);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return [];

  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  const stddev = Math.sqrt(variance);

  const diff = current.permits_updated_24h - mean;

  // If stddev is 0 (all historical values identical), any significant deviation is anomalous
  const deviations = stddev === 0
    ? (diff === 0 ? 0 : Infinity)
    : Math.abs(diff) / stddev;

  if (deviations >= 2) {
    return [{
      source: 'permits',
      expected: Math.round(mean),
      actual: current.permits_updated_24h,
      deviations: Math.round(deviations * 10) / 10,
      direction: diff < 0 ? 'drop' : 'spike',
    }];
  }

  return [];
}

// ---------------------------------------------------------------------------
// Schema Drift Detection
// ---------------------------------------------------------------------------

export interface SchemaDriftAlert {
  table: string;
  previousCount: number;
  currentCount: number;
}

/**
 * Detect schema drift by comparing column counts between two snapshots.
 */
export function detectSchemaDrift(
  current: Record<string, number> | null,
  previous: Record<string, number> | null
): SchemaDriftAlert[] {
  if (!current || !previous) return [];

  const alerts: SchemaDriftAlert[] = [];
  for (const table of Object.keys(current)) {
    if (previous[table] != null && current[table] !== previous[table]) {
      alerts.push({
        table,
        previousCount: previous[table],
        currentCount: current[table],
      });
    }
  }
  return alerts;
}

// ---------------------------------------------------------------------------
// System Health Summary
// ---------------------------------------------------------------------------

export type HealthLevel = 'green' | 'yellow' | 'red';

export interface SystemHealthSummary {
  level: HealthLevel;
  issues: string[];
  warnings: string[];
}

/**
 * Compute overall system health from a snapshot and anomaly/drift data.
 */
export function computeSystemHealth(
  snapshot: DataQualitySnapshot,
  anomalies: VolumeAnomaly[],
  schemaDrift: SchemaDriftAlert[]
): SystemHealthSummary {
  const issues: string[] = [];
  const warnings: string[] = [];

  // Check violations
  if (snapshot.violations_total > 0) {
    if (snapshot.violations_total >= 100) {
      issues.push(`${snapshot.violations_total} data quality violations`);
    } else {
      warnings.push(`${snapshot.violations_total} data quality violations`);
    }
  }

  // Check volume anomalies
  for (const a of anomalies) {
    if (a.direction === 'drop') {
      issues.push(`Volume drop: ${a.source} (${a.actual} vs expected ${a.expected})`);
    } else {
      warnings.push(`Volume spike: ${a.source} (${a.actual} vs expected ${a.expected})`);
    }
  }

  // Check schema drift
  if (schemaDrift.length > 0) {
    warnings.push(`Schema changes detected in ${schemaDrift.length} table(s)`);
  }

  // Check null rates (flag if >20% of active permits missing critical fields)
  if (snapshot.active_permits > 0) {
    const descNullPct = (snapshot.null_description_count / snapshot.active_permits) * 100;
    if (descNullPct > 20) {
      warnings.push(`${descNullPct.toFixed(0)}% of permits missing description`);
    }
  }

  // Check SLA
  if (snapshot.sla_permits_ingestion_hours != null && snapshot.sla_permits_ingestion_hours > SLA_TARGETS.permits) {
    issues.push(`Permits SLA breach: ${snapshot.sla_permits_ingestion_hours.toFixed(1)}h (target: ${SLA_TARGETS.permits}h)`);
  }

  const level: HealthLevel = issues.length > 0 ? 'red' : warnings.length > 0 ? 'yellow' : 'green';
  return { level, issues, warnings };
}
