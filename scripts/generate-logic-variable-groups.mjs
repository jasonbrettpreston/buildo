#!/usr/bin/env node
// ---------------------------------------------------------------------------
// GlobalConfigCard GROUPS generator
//   → src/features/admin-controls/generated/logic-variable-groups.json
//
// WF2 "Admin Tunable Coverage" commit 3
// (.cursor/wf2_admin_tunable_coverage_active_task.md) — GlobalConfigCard's
// GROUPS array stops being a hand-maintained literal and becomes DERIVED
// from the seed's declared `admin.group` field (commit 1). The admin
// surface (which keys render, in which group) is now single-sourced from
// the seed declaration, closing the reverse-coverage gap structurally: a
// key can no longer be silently omitted from GROUPS while still being
// admin-editable, or vice versa.
//
// GROUP_ORDER below is a PINNED snapshot (both group label order AND
// within-group key order) taken verbatim from GlobalConfigCard.tsx's GROUPS
// array as it stood immediately before this commit. Order is a deliberate
// editorial/layout decision, not something that should silently re-derive
// from seed-file insertion order — 5 of the 21 groups (Coverage & Quality,
// CoA Matching, Source Ingestion, Scraper & Network Health, Lifecycle Phase
// Distribution Bands) do NOT match seed insertion order today, so a naive
// "group by admin.group, keep seed order" derivation would have silently
// reshuffled the rendered card — exactly what the "no layout change"
// Standards Compliance line promises against. Adding a NEW key to an
// EXISTING group requires appending it to that group's `keys` array here
// too — the generator THROWS (never silently drops or silently accepts) on
// any mismatch between GROUP_ORDER and the seed's admin.group declarations,
// in both directions:
//   - a GROUP_ORDER key that IS in the seed but whose admin.group does not
//     match the group it's pinned under (rename/typo/forgotten update)
//   - a seed key that declares admin.group = X but is absent from the
//     GROUP_ORDER entry for X (the coverage gap this whole plan closes)
// A GROUP_ORDER key ABSENT from the seed (income_premium_tiers, JSONB /
// migration-seeded, Cost Tuning group) is the one documented exception —
// JSONB/migration-only vars are out of scope for the seed-driven admin
// declaration (see "Not in Scope" in the active task); it renders via
// JSON_KEYS in GlobalConfigCard.tsx exactly as it always has.
//
// Usage:
//   npm run logic-var-groups           # regenerate the JSON
//   node scripts/generate-logic-variable-groups.mjs --check   # exit 1 if stale
// ---------------------------------------------------------------------------
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SEED_PATH = path.join(ROOT, 'scripts', 'seeds', 'logic_variables.json');
// BUILDO_LOGIC_VAR_GROUPS_PATH — test-only override (mirrors
// BUILDO_CHURN_TABLE_PATH in scripts/analysis/step-churn-complexity.mjs) so
// the RED-fixture test can point --check at a tampered temp file instead of
// mutating the real committed artifact.
const OUTPUT = process.env.BUILDO_LOGIC_VAR_GROUPS_PATH
  ? path.resolve(ROOT, process.env.BUILDO_LOGIC_VAR_GROUPS_PATH)
  : path.join(ROOT, 'src', 'features', 'admin-controls', 'generated', 'logic-variable-groups.json');

const GROUP_ORDER = [
  {
    "label": "Lead Scoring",
    "keys": [
      "los_multiplier_bid",
      "los_multiplier_work",
      "los_penalty_tracking",
      "los_penalty_saving",
      "los_base_cap",
      "los_base_divisor"
    ]
  },
  {
    "label": "Scoring Tiers",
    "keys": [
      "score_tier_elite",
      "score_tier_strong",
      "score_tier_moderate"
    ]
  },
  {
    "label": "Timing & Staleness",
    "keys": [
      "stall_penalty_precon",
      "stall_penalty_active",
      "expired_threshold_days",
      "coa_stall_threshold"
    ]
  },
  {
    "label": "Forecast & Urgency",
    "keys": [
      "urgency_overdue_days",
      "urgency_upcoming_days",
      "calibration_default_median_days",
      "calibration_default_p25_days",
      "calibration_default_p75_days"
    ]
  },
  {
    "label": "Inspection & Closure",
    "keys": [
      "inspection_stall_days",
      "stale_closure_abort_pct",
      "pending_closed_grace_days"
    ]
  },
  {
    "label": "Pre-Permits",
    "keys": [
      "pre_permit_expiry_months",
      "pre_permit_stale_months"
    ]
  },
  {
    "label": "Coverage & Quality",
    "keys": [
      "urban_coverage_ratio",
      "suburban_coverage_ratio",
      "trust_threshold_pct",
      "calibration_min_sample_size"
    ]
  },
  {
    "label": "Cost Tuning",
    "keys": [
      "liar_gate_threshold",
      "commercial_shell_multiplier",
      "placeholder_cost_threshold",
      "income_premium_tiers"
    ]
  },
  {
    "label": "CoA Matching",
    "keys": [
      "coa_match_conf_high",
      "coa_match_conf_medium",
      "snapshot_coa_conf_high",
      "coa_freshness_warn_days",
      "coa_stall_threshold_p2_days",
      "coa_imminent_window_days"
    ]
  },
  {
    "label": "Spatial & Massing",
    "keys": [
      "massing_shed_threshold_sqm",
      "massing_garage_max_sqm",
      "massing_nearest_max_distance_m",
      "link_massing_link_rate_fail_pct",
      "link_massing_centroid_confidence",
      "link_massing_nearest_confidence"
    ]
  },
  {
    "label": "Parcel Linking",
    "keys": [
      "spatial_match_max_distance_m",
      "spatial_match_confidence",
      "link_parcels_confidence_address_points_exact",
      "link_parcels_confidence_exact_address",
      "link_parcels_confidence_spatial_polygon",
      "link_parcels_confidence_name_only",
      "link_parcels_link_rate_warn_pct"
    ]
  },
  {
    "label": "WSIB Matching",
    "keys": [
      "wsib_fuzzy_match_threshold",
      "link_wsib_link_rate_warn_pct",
      "link_wsib_tier1_confidence",
      "link_wsib_tier2_confidence",
      "link_wsib_tier3_confidence",
      "link_wsib_entity_fanin_warn",
      "link_wsib_tier3_full_max_iterations",
      "link_wsib_tier3_token_overlap_fail_pct"
    ]
  },
  {
    "label": "Parcel-Address Bridge",
    "keys": [
      "link_parcel_addresses_batch_size",
      "link_parcel_addresses_no_address_warn_pct",
      "link_parcel_addresses_no_parcel_warn_pct",
      "link_parcel_addresses_fanout_warn_noncondo",
      "link_parcel_addresses_fanout_warn_condo",
      "link_parcel_addresses_structure_link_rate_warn_pct",
      "link_parcel_addresses_fanout_warn_rd_rs"
    ]
  },
  {
    "label": "Centroid Computation",
    "keys": [
      "compute_centroids_failed_geometries_warn",
      "compute_centroids_compute_rate_warn_pct",
      "compute_centroids_full_recompute_batch_size"
    ]
  },
  {
    "label": "Data Quality Thresholds",
    "keys": [
      "cost_outlier_ceiling_cad",
      "desc_null_rate_warn_pct",
      "builder_null_rate_warn_pct",
      "cost_est_null_rate_warn_pct",
      "cost_est_min_tiers",
      "calibration_freshness_warn_hours",
      "cost_model_coverage_warn_pct",
      "assert_schema_type_sample_rows",
      "assert_schema_csv_header_bytes",
      "assert_schema_geojson_probe_bytes"
    ]
  },
  {
    "label": "Source Ingestion",
    "keys": [
      "load_ravines_dataset_age_warn_years",
      "load_ravines_count_drift_fail_pct",
      "load_ravines_geometry_update_warn_pct",
      "load_ravines_invalid_geometry_fail_pct",
      "load_ravines_mass_delete_fail_pct",
      "load_ravines_download_timeout_ms",
      "enrich_parcels_heartbeat_minutes",
      "enrich_parcels_pass_statement_timeout_minutes",
      "enrich_parcels_lock_timeout_ms"
    ]
  },
  {
    "label": "Scraper & Network Health",
    "keys": [
      "scrape_early_phase_threshold_pct",
      "scrape_stale_days",
      "scraper_error_rate_warn_pct",
      "scraper_latency_p50_warn_ms",
      "scraper_empty_streak_warn",
      "lifecycle_unclassified_max"
    ]
  },
  {
    "label": "Pipeline Staleness Thresholds",
    "keys": [
      "staleness_max_stale_over_30d",
      "staleness_min_coverage_pct",
      "staleness_max_days_stale"
    ]
  },
  {
    "label": "Lifecycle Ledger",
    "keys": [
      "lifecycle_status_history_retention_days"
    ]
  },
  {
    "label": "Lifecycle Phase Distribution Bands",
    "keys": [
      "lifecycle_cross_stalled_threshold",
      "lifecycle_cross_active_inspection_threshold",
      "lifecycle_cross_issued_threshold",
      "lifecycle_band_p3_min",
      "lifecycle_band_p3_max",
      "lifecycle_band_p4_min",
      "lifecycle_band_p4_max",
      "lifecycle_band_p5_min",
      "lifecycle_band_p5_max",
      "lifecycle_band_p6_min",
      "lifecycle_band_p6_max",
      "lifecycle_band_p7a_min",
      "lifecycle_band_p7a_max",
      "lifecycle_band_p7b_min",
      "lifecycle_band_p7b_max",
      "lifecycle_band_p7c_min",
      "lifecycle_band_p7c_max",
      "lifecycle_band_p7d_min",
      "lifecycle_band_p7d_max",
      "lifecycle_band_p8_min",
      "lifecycle_band_p8_max",
      "lifecycle_band_p18_min",
      "lifecycle_band_p18_max",
      "lifecycle_band_p19_min",
      "lifecycle_band_p19_max",
      "lifecycle_band_p20_min",
      "lifecycle_band_p20_max",
      "lifecycle_band_p9_p17_agg_min",
      "lifecycle_band_p9_p17_agg_max",
      "lifecycle_band_o1_min",
      "lifecycle_band_o1_max",
      "lifecycle_band_o2_min",
      "lifecycle_band_o2_max",
      "lifecycle_band_o3_min",
      "lifecycle_band_o3_max",
      "lifecycle_band_coa_p1_min",
      "lifecycle_band_coa_p1_max",
      "lifecycle_band_coa_p2_min",
      "lifecycle_band_coa_p2_max"
    ]
  },
  {
    "label": "Step Validator",
    "keys": [
      "invariants_every_run_budget_ms"
    ]
  }
];

// ── Cross-validate GROUP_ORDER against the seed's admin.group declarations ──
const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf-8'));

if (GROUP_ORDER.length === 0) {
  throw new Error('GROUP_ORDER is empty — vacuous generator, refusing to emit');
}

const pinnedLabelOf = new Map(); // key -> label (from GROUP_ORDER)
for (const group of GROUP_ORDER) {
  if (group.keys.length === 0) {
    throw new Error(`GROUP_ORDER entry ${JSON.stringify(group.label)} has zero keys — empty group`);
  }
  for (const key of group.keys) {
    if (pinnedLabelOf.has(key)) {
      throw new Error(`key ${JSON.stringify(key)} appears in TWO GROUP_ORDER groups (${pinnedLabelOf.get(key)}, ${group.label}) — a key belongs to exactly one group`);
    }
    pinnedLabelOf.set(key, group.label);

    const seedEntry = seed[key];
    if (seedEntry === undefined) {
      // Migration-only / JSONB var, out of scope for the seed-driven admin
      // declaration (Not in Scope, WF2 admin tunable coverage plan) — the
      // ONE documented exception is income_premium_tiers.
      if (key !== 'income_premium_tiers') {
        throw new Error(`GROUP_ORDER key ${JSON.stringify(key)} (group ${JSON.stringify(group.label)}) is absent from the seed and is not the documented income_premium_tiers exception`);
      }
      continue;
    }
    const declaredGroup = seedEntry.admin && 'group' in seedEntry.admin ? seedEntry.admin.group : undefined;
    if (declaredGroup !== group.label) {
      throw new Error(`GROUP_ORDER pins ${JSON.stringify(key)} under ${JSON.stringify(group.label)}, but its seed admin declaration says ${JSON.stringify(declaredGroup)} — update GROUP_ORDER (or the seed) to match`);
    }
  }
}

// Reverse direction: every seed key DECLARING a group must be pinned somewhere.
for (const [key, entry] of Object.entries(seed)) {
  const admin = entry.admin;
  if (admin && 'group' in admin) {
    if (pinnedLabelOf.get(key) !== admin.group) {
      throw new Error(`seed key ${JSON.stringify(key)} declares admin.group ${JSON.stringify(admin.group)} but is not pinned in GROUP_ORDER under that label — add it to the generator's GROUP_ORDER`);
    }
  }
}

// ── Emit / check ──────────────────────────────────────────────────────────
const OUT_JSON = JSON.stringify(GROUP_ORDER, null, 2) + '\n';
const CHECK = process.argv.includes('--check');
fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
if (CHECK) {
  const existing = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, 'utf-8') : '';
  if (existing !== OUT_JSON) {
    console.error(`✗ ${path.relative(ROOT, OUTPUT)} is STALE — run \`npm run logic-var-groups\``);
    process.exitCode = 1;
  } else {
    console.log(`✔ ${path.relative(ROOT, OUTPUT)} is up to date`);
  }
} else {
  fs.writeFileSync(OUTPUT, OUT_JSON);
  console.log(`✔ Generated ${path.relative(ROOT, OUTPUT)}`);
  console.log(`  ${GROUP_ORDER.length} groups, ${GROUP_ORDER.reduce((a, g) => a + g.keys.length, 0)} keys`);

  // ── ADMIN-1 bookkeeping (commit 4) ─────────────────────────────────────
  // The generator "emits the live unclassified count" — refreshes the
  // ratchet (DOWNWARD only, never up) and programme-items.json's ADMIN-1
  // evidence text. Write-mode only; --check never mutates either file.
  const unclassifiedCount = Object.values(seed).filter(
    (v) => v && typeof v === 'object' && v.admin && 'hidden' in v.admin && v.admin.hidden === 'unclassified',
  ).length;
  const totalCount = Object.keys(seed).length;

  const RATCHET_PATH = path.join(ROOT, 'scripts', 'steps', '_schema', 'admin-unclassified-high-water-mark.json');
  if (fs.existsSync(RATCHET_PATH)) {
    const ratchetRaw = fs.readFileSync(RATCHET_PATH, 'utf-8');
    const ratchetUsesCRLF = ratchetRaw.includes('\r\n');
    const ratchet = JSON.parse(ratchetRaw);
    const newMark = Math.min(ratchet.high_water_mark, unclassifiedCount);
    if (newMark !== ratchet.high_water_mark) {
      ratchet.high_water_mark = newMark;
      ratchet.recorded_at = new Date().toISOString().slice(0, 10);
      let ratchetOut = JSON.stringify(ratchet, null, 2) + '\n';
      if (ratchetUsesCRLF) ratchetOut = ratchetOut.replace(/\n/g, '\r\n');
      fs.writeFileSync(RATCHET_PATH, ratchetOut);
      console.log(`  ratchet high_water_mark lowered to ${newMark}`);
    }
  }

  const PROGRAMME_ITEMS_PATH = path.join(ROOT, 'scripts', 'steps', '_schema', 'programme-items.json');
  if (fs.existsSync(PROGRAMME_ITEMS_PATH)) {
    const piRaw = fs.readFileSync(PROGRAMME_ITEMS_PATH, 'utf-8');
    const piUsesCRLF = piRaw.includes('\r\n');
    const piData = JSON.parse(piRaw);
    const admin1 = piData.items.find((i) => i.id === 'ADMIN-1');
    if (admin1) {
      const refreshed = admin1.evidence.replace(
        /^\d+ of \d+ scripts\/seeds\/logic_variables\.json keys carry admin\.hidden === "unclassified"/,
        `${unclassifiedCount} of ${totalCount} scripts/seeds/logic_variables.json keys carry admin.hidden === "unclassified"`,
      );
      if (refreshed !== admin1.evidence) {
        admin1.evidence = refreshed;
        let piOut = JSON.stringify(piData, null, 2) + '\n';
        if (piUsesCRLF) piOut = piOut.replace(/\n/g, '\r\n');
        fs.writeFileSync(PROGRAMME_ITEMS_PATH, piOut);
        console.log(`  programme-items.json ADMIN-1 evidence refreshed (${unclassifiedCount} of ${totalCount})`);
      }
    }
  }
}
