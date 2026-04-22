// Mirror of docs/specs/_contracts.json — single source of truth for
// cross-layer numeric constants shared between the Next.js backend and
// the Expo mobile client.

export const CONTRACTS = {
  scoring: {
    permit_proximity_max: 30,
    permit_timing_max: 30,
    permit_value_max: 20,
    permit_opportunity_max: 20,
    permit_total_max: 100,
    builder_proximity_max: 30,
    builder_value_max: 20,
    builder_opportunity_max: 20,
    builder_total_max: 100,
  },
  rate_limits: {
    feed_per_min: 30,
    view_per_min: 60,
    window_sec: 60,
  },
  geo: {
    max_radius_km: 50,
    default_radius_km: 10,
  },
  feed: {
    max_limit: 30,
    default_limit: 15,
    forced_refetch_threshold_m: 500,
    coord_precision: 1000,
  },
  schema: {
    firebase_uid_max: 128,
    trade_slug_max: 50,
    permit_num_max: 30,
    revision_num_max: 10,
  },
  retention: {
    lead_views_days: 90,
    grace_purge_days: 180,
  },
} as const;
