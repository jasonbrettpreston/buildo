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

  // Inspection scraping coverage
  inspections_total: number;
  inspections_permits_scraped: number;
  inspections_outstanding_count: number;
  inspections_passed_count: number;
  inspections_not_passed_count: number;

  created_at: string;
}

export interface CoverageRate {
  label: string;
  matched: number;
  total: number;
  percentage: number;
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
// Cadence Thresholds — milliseconds before a chain is considered stale
// Used by HealthBanner to compute schedule status (on-schedule / needs-run / overdue)
// ---------------------------------------------------------------------------

export const CADENCE_THRESHOLDS_MS: Record<string, number> = {
  Daily: 26 * 3600_000,        // 26 hours
  Quarterly: 95 * 86400_000,   // 95 days
  Annual: 370 * 86400_000,     // 370 days
};

// ---------------------------------------------------------------------------
// SLA Targets (hours)
// ---------------------------------------------------------------------------

export const SLA_TARGETS: Record<string, number> = {
  permits: 36,
  coa: 48,
  builders: 48,
  address_points: 2160,   // 90 days
  parcels: 2160,
  massing: 2160,
  neighbourhoods: 8760,   // 365 days
  inspections: 168,       // 7 days (weekly cadence)
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
// Duration Anomaly Detection
// ---------------------------------------------------------------------------

export interface DurationAnomaly {
  pipeline: string;
  avgMs: number;
  currentMs: number;
  ratio: number;
}

/**
 * Detect pipelines whose latest run duration is significantly slower than
 * their rolling average. Uses a 2x threshold on the average of the last 7 runs.
 *
 * @param runs - Map of pipeline slug → array of duration_ms values (most recent first)
 * @returns Anomalies where latest run > 2x the rolling average
 */
export function detectDurationAnomalies(
  runs: Record<string, number[]>
): DurationAnomaly[] {
  const anomalies: DurationAnomaly[] = [];

  for (const [pipeline, durations] of Object.entries(runs)) {
    // Need at least 2 runs: the current + at least 1 historical
    if (durations.length < 2) continue;

    const current = durations[0];
    const historical = durations.slice(1, 8).filter(d => d > 0); // exclude 0ms skipped/gated runs
    if (historical.length === 0) continue;

    const avg = historical.reduce((a, b) => a + b, 0) / historical.length;
    if (avg <= 0) continue;

    const ratio = current / avg;
    if (ratio >= 2) {
      anomalies.push({
        pipeline,
        avgMs: Math.round(avg),
        currentMs: current,
        ratio: Math.round(ratio * 10) / 10,
      });
    }
  }

  return anomalies;
}

// ---------------------------------------------------------------------------
// Engine Health Anomaly Detection
// ---------------------------------------------------------------------------

export interface EngineHealthEntry {
  table_name: string;
  n_live_tup: number;
  n_dead_tup: number;
  dead_ratio: number;
  seq_scan: number;
  idx_scan: number;
  seq_ratio: number;
}

export interface EngineHealthAnomaly {
  table: string;
  type: 'dead_tuples' | 'seq_scan_heavy' | 'update_ping_pong';
  value: number;
  threshold: number;
  detail: string;
}

/** Thresholds for engine health checks */
export const ENGINE_HEALTH_THRESHOLDS = {
  /** Flag tables where dead tuples exceed this ratio of live tuples */
  DEAD_TUPLE_RATIO: 0.10,
  /** Flag tables where sequential scans exceed this ratio (on large tables) */
  SEQ_SCAN_RATIO: 0.80,
  /** Minimum live tuples before seq_scan ratio is checked */
  SEQ_SCAN_MIN_ROWS: 10000,
  /** Flag when update count exceeds this multiple of insert count */
  PING_PONG_RATIO: 2,
} as const;

/**
 * Detect engine health issues from pg_stat_user_tables data.
 *
 * Checks:
 * 1. Dead tuple ratio > 10% (VACUUM not keeping up)
 * 2. Sequential scan ratio > 80% on tables with 10K+ rows (missing indexes)
 * 3. Update ping-pong: updates > 2x inserts (scripts re-touching unchanged rows)
 */
export function detectEngineHealthIssues(
  entries: EngineHealthEntry[],
  pgStats?: Record<string, { ins: number; upd: number; del: number }>
): EngineHealthAnomaly[] {
  const anomalies: EngineHealthAnomaly[] = [];

  for (const entry of entries) {
    // Check 1: Dead tuple ratio
    if (entry.n_live_tup > 0 && entry.dead_ratio > ENGINE_HEALTH_THRESHOLDS.DEAD_TUPLE_RATIO) {
      anomalies.push({
        table: entry.table_name,
        type: 'dead_tuples',
        value: Math.round(entry.dead_ratio * 1000) / 10,
        threshold: ENGINE_HEALTH_THRESHOLDS.DEAD_TUPLE_RATIO * 100,
        detail: `${entry.n_dead_tup.toLocaleString()} dead tuples (${(entry.dead_ratio * 100).toFixed(1)}% of ${entry.n_live_tup.toLocaleString()} live)`,
      });
    }

    // Check 2: Sequential scan ratio on large tables
    const totalScans = entry.seq_scan + entry.idx_scan;
    if (
      entry.n_live_tup >= ENGINE_HEALTH_THRESHOLDS.SEQ_SCAN_MIN_ROWS &&
      totalScans > 0 &&
      entry.seq_ratio > ENGINE_HEALTH_THRESHOLDS.SEQ_SCAN_RATIO
    ) {
      anomalies.push({
        table: entry.table_name,
        type: 'seq_scan_heavy',
        value: Math.round(entry.seq_ratio * 1000) / 10,
        threshold: ENGINE_HEALTH_THRESHOLDS.SEQ_SCAN_RATIO * 100,
        detail: `${entry.seq_scan} seq scans vs ${entry.idx_scan} idx scans (${(entry.seq_ratio * 100).toFixed(1)}% sequential)`,
      });
    }
  }

  // Check 3: Update ping-pong from recent pipeline telemetry
  if (pgStats) {
    for (const [table, stats] of Object.entries(pgStats)) {
      if (
        stats.ins > 0 &&
        stats.upd > ENGINE_HEALTH_THRESHOLDS.PING_PONG_RATIO * stats.ins
      ) {
        const ratio = Math.round((stats.upd / stats.ins) * 10) / 10;
        anomalies.push({
          table,
          type: 'update_ping_pong',
          value: ratio,
          threshold: ENGINE_HEALTH_THRESHOLDS.PING_PONG_RATIO,
          detail: `${stats.upd.toLocaleString()} updates vs ${stats.ins.toLocaleString()} inserts (${ratio}x ratio)`,
        });
      }
    }
  }

  return anomalies;
}

// ---------------------------------------------------------------------------
// Pipeline Failure Detection
// ---------------------------------------------------------------------------

export interface PipelineFailure {
  pipeline: string;
  error_message: string;
  failed_at: string;
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
 * Optional durationAnomalies parameter surfaces pipeline slowdown warnings.
 * Optional pipelineFailures parameter surfaces recent pipeline run failures.
 * Optional engineHealthAnomalies parameter surfaces DB engine health issues.
 */
export function computeSystemHealth(
  snapshot: DataQualitySnapshot,
  anomalies: VolumeAnomaly[],
  schemaDrift: SchemaDriftAlert[],
  durationAnomalies: DurationAnomaly[] = [],
  pipelineFailures: PipelineFailure[] = [],
  engineHealthAnomalies: EngineHealthAnomaly[] = []
): SystemHealthSummary {
  const issues: string[] = [];
  const warnings: string[] = [];

  // Check violations — show type breakdown for actionable messages
  if (snapshot.violations_total > 0) {
    const parts: string[] = [];
    if (snapshot.violation_cost_out_of_range > 0)
      parts.push(`${snapshot.violation_cost_out_of_range} cost outlier${snapshot.violation_cost_out_of_range === 1 ? '' : 's'}`);
    if (snapshot.violation_future_issued_date > 0)
      parts.push(`${snapshot.violation_future_issued_date} future-dated permit${snapshot.violation_future_issued_date === 1 ? '' : 's'}`);
    if (snapshot.violation_missing_status > 0)
      parts.push(`${snapshot.violation_missing_status} missing status`);
    const detail = parts.length > 0
      ? parts.join(', ')
      : `${snapshot.violations_total} data quality violations`;
    if (snapshot.violations_total >= 100) {
      issues.push(detail);
    } else {
      warnings.push(detail);
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

  // Check duration anomalies — pipeline slowdowns
  // Inline slug→name map (subset of FreshnessTimeline PIPELINE_REGISTRY to avoid circular dep)
  const PIPELINE_NAMES: Record<string, string> = {
    permits: 'Building Permits', coa: 'CoA Applications', builders: 'Extract Entities',
    address_points: 'Address Points', parcels: 'Parcels', massing: '3D Massing',
    neighbourhoods: 'Neighbourhoods', geocode_permits: 'Geocode Permits',
    link_parcels: 'Link Parcels', link_neighbourhoods: 'Link Neighbourhoods',
    link_massing: 'Link Massing', link_coa: 'Link CoA',
    enrich_wsib_builders: 'Enrich WSIB Matched', enrich_named_builders: 'Enrich Web Entities',
    load_wsib: 'Load WSIB Registry', link_wsib: 'Link WSIB',
    link_similar: 'Link Similar Permits', create_pre_permits: 'Create Pre-Permits',
    compute_centroids: 'Compute Centroids', inspections: 'Inspection Stages',
    coa_documents: 'CoA Documents', classify_scope: 'Scope Classification',
    classify_permits: 'Classify Trades', refresh_snapshot: 'Refresh Snapshot',
    assert_schema: 'Schema Validation', assert_data_bounds: 'Data Quality Checks',
    assert_engine_health: 'Engine Health',
  };
  for (const d of durationAnomalies) {
    const avgSec = (d.avgMs / 1000).toFixed(1);
    const curSec = (d.currentMs / 1000).toFixed(1);
    const name = PIPELINE_NAMES[d.pipeline] || d.pipeline;
    warnings.push(`Slow pipeline: ${name} (${d.pipeline}) took ${curSec}s (avg: ${avgSec}s, ${d.ratio}x slower)`);
  }

  // Check pipeline failures (latest run per pipeline)
  if (pipelineFailures.length >= 2) {
    issues.push(`${pipelineFailures.length} pipelines have a failed latest run`);
  } else if (pipelineFailures.length === 1) {
    const f = pipelineFailures[0];
    const msg = f.error_message.length > 120
      ? f.error_message.slice(0, 117) + '...'
      : f.error_message;
    warnings.push(`Pipeline ${f.pipeline} failed: ${msg}`);
  }

  // Check engine health anomalies
  for (const eh of engineHealthAnomalies) {
    if (eh.type === 'dead_tuples') {
      warnings.push(`Dead tuples: ${eh.table} at ${eh.value}% (threshold: ${eh.threshold}%)`);
    } else if (eh.type === 'seq_scan_heavy') {
      warnings.push(`Sequential scans: ${eh.table} at ${eh.value}% (threshold: ${eh.threshold}%)`);
    } else if (eh.type === 'update_ping_pong') {
      warnings.push(`Update ping-pong: ${eh.table} — ${eh.value}x update/insert ratio`);
    }
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
