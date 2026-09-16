# Surface review queue (generated)

> **GENERATED — do not hand-edit.** Source of record: the sharded census under `scripts/surfaces/_schema/census/`.
> Regenerate: `node scripts/violations/generate-surface-registry.mjs`. Drift-guarded by `src/tests/surface-registry.infra.test.ts`.
> SPEC LINK: `docs/specs/02-web-admin/127_surface_conversion_procedure.md` §9 (Review procedure) · `docs/specs/02-web-admin/126_maxbld_surface_standard.md` §2.0 (the programme partition)

## How to use this

One card per entry that Spec 126 governs — scopes A, B and C — **in build order**, so reviewing top to bottom reviews dependencies before the things that depend on them. Scope D (the other product) is not queued.

Every card answers the **same nine questions** from the descriptor, with the evidence inline. Walk them in order. When a card is right, set `programme.review` to `{"status": "reviewed", "reviewer": "...", "date": "..."}` in the census shard and regenerate; when something must change, set `needs_change` and put what in `notes`. **The status lives in the descriptor, not in anyone's memory.**

**91 cards** — 91 unreviewed.

| # | id | entry | scope | feature | build | review |
|---:|---|---|---|---|---:|---|
| 1 | [`S-002`](#card-s-002) | [`mobile_parcel_search`](#card-s-002) | `parcel_product` | `F01` | 1013 | `unreviewed` |
| 2 | [`S-004`](#card-s-004) | [`shell_parcel_tool_stack`](#card-s-004) | `parcel_product` | `F01` | 1013 | `unreviewed` |
| 3 | [`C-001`](#card-c-001) | [`contract_parcels_lookup`](#card-c-001) | `parcel_product` | `F02` | 1022 | `unreviewed` |
| 4 | [`S-001`](#card-s-001) | [`mobile_parcel_detail`](#card-s-001) | `parcel_product` | `F02` | 1023 | `unreviewed` |
| 5 | [`S-003`](#card-s-003) | [`overlay_sponsor_slot`](#card-s-003) | `parcel_product` | `F04` | 1043 | `unreviewed` |
| 6 | [`S-005`](#card-s-005) | [`web_landing`](#card-s-005) | `parcel_product` | `F06` | 1063 | `unreviewed` |
| 7 | [`S-009`](#card-s-009) | [`admin_export_audit`](#card-s-009) | `parcel_admin` | `F03` | 2033 | `unreviewed` |
| 8 | [`S-006`](#card-s-006) | [`admin_advertiser_accounts`](#card-s-006) | `parcel_admin` | `F04` | 2043 | `unreviewed` |
| 9 | [`S-013`](#card-s-013) | [`admin_placements`](#card-s-013) | `parcel_admin` | `F04` | 2043 | `unreviewed` |
| 10 | [`S-017`](#card-s-017) | [`advertiser_self_metrics`](#card-s-017) | `parcel_admin` | `F04` | 2043 | `unreviewed` |
| 11 | [`S-010`](#card-s-010) | [`admin_ledger_visualiser`](#card-s-010) | `parcel_admin` | `F07` | 2073 | `unreviewed` |
| 12 | [`S-015`](#card-s-015) | [`admin_run_ledger`](#card-s-015) | `parcel_admin` | `F07` | 2073 | `unreviewed` |
| 13 | [`C-002`](#card-c-002) | [`contract_admin_parcels_lookup`](#card-c-002) | `parcel_admin` | `F08` | 2082 | `unreviewed` |
| 14 | [`S-012`](#card-s-012) | [`admin_parcel_cost`](#card-s-012) | `parcel_admin` | `F08` | 2083 | `unreviewed` |
| 15 | [`S-007`](#card-s-007) | [`admin_contract_fanout`](#card-s-007) | `parcel_admin` | `F09` | 2093 | `unreviewed` |
| 16 | [`S-008`](#card-s-008) | [`admin_drift_status`](#card-s-008) | `parcel_admin` | `F09` | 2093 | `unreviewed` |
| 17 | [`S-011`](#card-s-011) | [`admin_orphan_panel`](#card-s-011) | `parcel_admin` | `F09` | 2093 | `unreviewed` |
| 18 | [`S-014`](#card-s-014) | [`admin_role_matrix`](#card-s-014) | `parcel_admin` | `F09` | 2093 | `unreviewed` |
| 19 | [`S-016`](#card-s-016) | [`admin_surface_registry`](#card-s-016) | `parcel_admin` | `F09` | 2093 | `unreviewed` |
| 20 | [`S-027`](#card-s-027) | [`mobile_auth_confirm`](#card-s-027) | `platform_shared` | `F10` | 3103 | `unreviewed` |
| 21 | [`S-037`](#card-s-037) | [`mobile_sign_in`](#card-s-037) | `platform_shared` | `F10` | 3103 | `unreviewed` |
| 22 | [`S-038`](#card-s-038) | [`mobile_sign_up`](#card-s-038) | `platform_shared` | `F10` | 3103 | `unreviewed` |
| 23 | [`S-039`](#card-s-039) | [`overlay_account_linking_sheet`](#card-s-039) | `platform_shared` | `F10` | 3103 | `unreviewed` |
| 24 | [`S-040`](#card-s-040) | [`overlay_error_boundary`](#card-s-040) | `platform_shared` | `F10` | 3103 | `unreviewed` |
| 25 | [`S-047`](#card-s-047) | [`shell_auth_stack`](#card-s-047) | `platform_shared` | `F10` | 3103 | `unreviewed` |
| 26 | [`C-026`](#card-c-026) | [`contract_onboarding_suppliers`](#card-c-026) | `platform_shared` | `F11` | 3112 | `unreviewed` |
| 27 | [`S-028`](#card-s-028) | [`mobile_onboarding_address`](#card-s-028) | `platform_shared` | `F11` | 3113 | `unreviewed` |
| 28 | [`S-029`](#card-s-029) | [`mobile_onboarding_complete`](#card-s-029) | `platform_shared` | `F11` | 3113 | `unreviewed` |
| 29 | [`S-030`](#card-s-030) | [`mobile_onboarding_first_permit`](#card-s-030) | `platform_shared` | `F11` | 3113 | `unreviewed` |
| 30 | [`S-031`](#card-s-031) | [`mobile_onboarding_manufacturer_hold`](#card-s-031) | `platform_shared` | `F11` | 3113 | `unreviewed` |
| 31 | [`S-032`](#card-s-032) | [`mobile_onboarding_path`](#card-s-032) | `platform_shared` | `F11` | 3113 | `unreviewed` |
| 32 | [`S-033`](#card-s-033) | [`mobile_onboarding_profession`](#card-s-033) | `platform_shared` | `F11` | 3113 | `unreviewed` |
| 33 | [`S-034`](#card-s-034) | [`mobile_onboarding_supplier`](#card-s-034) | `platform_shared` | `F11` | 3113 | `unreviewed` |
| 34 | [`S-035`](#card-s-035) | [`mobile_onboarding_terms`](#card-s-035) | `platform_shared` | `F11` | 3113 | `unreviewed` |
| 35 | [`S-048`](#card-s-048) | [`shell_onboarding_stack`](#card-s-048) | `platform_shared` | `F11` | 3113 | `unreviewed` |
| 36 | [`C-020`](#card-c-020) | [`contract_admin_users_uid_subscription_events`](#card-c-020) | `platform_shared` | `F12` | 3122 | `unreviewed` |
| 37 | [`C-021`](#card-c-021) | [`contract_admin_users_uid_subscription_reconcile`](#card-c-021) | `platform_shared` | `F12` | 3122 | `unreviewed` |
| 38 | [`C-022`](#card-c-022) | [`contract_admin_users_uid_subscription_retry_cancel`](#card-c-022) | `platform_shared` | `F12` | 3122 | `unreviewed` |
| 39 | [`C-030`](#card-c-030) | [`contract_subscribe_exchange`](#card-c-030) | `platform_shared` | `F12` | 3122 | `unreviewed` |
| 40 | [`C-031`](#card-c-031) | [`contract_subscribe_portal_session`](#card-c-031) | `platform_shared` | `F12` | 3122 | `unreviewed` |
| 41 | [`C-032`](#card-c-032) | [`contract_subscribe_session`](#card-c-032) | `platform_shared` | `F12` | 3122 | `unreviewed` |
| 42 | [`C-038`](#card-c-038) | [`contract_webhooks_stripe`](#card-c-038) | `platform_shared` | `F12` | 3122 | `unreviewed` |
| 43 | [`S-043`](#card-s-043) | [`overlay_paywall`](#card-s-043) | `platform_shared` | `F12` | 3123 | `unreviewed` |
| 44 | [`S-044`](#card-s-044) | [`overlay_subscription_loading_guard`](#card-s-044) | `platform_shared` | `F12` | 3123 | `unreviewed` |
| 45 | [`S-051`](#card-s-051) | [`web_subscribe`](#card-s-051) | `platform_shared` | `F12` | 3123 | `unreviewed` |
| 46 | [`S-052`](#card-s-052) | [`web_subscribe_cancel`](#card-s-052) | `platform_shared` | `F12` | 3123 | `unreviewed` |
| 47 | [`S-053`](#card-s-053) | [`web_subscribe_success`](#card-s-053) | `platform_shared` | `F12` | 3123 | `unreviewed` |
| 48 | [`C-006`](#card-c-006) | [`contract_admin_notifications`](#card-c-006) | `platform_shared` | `F13` | 3132 | `unreviewed` |
| 49 | [`C-007`](#card-c-007) | [`contract_admin_notifications_test_send`](#card-c-007) | `platform_shared` | `F13` | 3132 | `unreviewed` |
| 50 | [`C-023`](#card-c-023) | [`contract_notifications`](#card-c-023) | `platform_shared` | `F13` | 3132 | `unreviewed` |
| 51 | [`C-024`](#card-c-024) | [`contract_notifications_preferences`](#card-c-024) | `platform_shared` | `F13` | 3132 | `unreviewed` |
| 52 | [`C-025`](#card-c-025) | [`contract_notifications_register`](#card-c-025) | `platform_shared` | `F13` | 3132 | `unreviewed` |
| 53 | [`S-022`](#card-s-022) | [`admin_notifications`](#card-s-022) | `platform_shared` | `F13` | 3133 | `unreviewed` |
| 54 | [`S-041`](#card-s-041) | [`overlay_notification_permission_modal`](#card-s-041) | `platform_shared` | `F13` | 3133 | `unreviewed` |
| 55 | [`S-042`](#card-s-042) | [`overlay_offline_banner`](#card-s-042) | `platform_shared` | `F14` | 3143 | `unreviewed` |
| 56 | [`S-045`](#card-s-045) | [`shell_app_root`](#card-s-045) | `platform_shared` | `F14` | 3143 | `unreviewed` |
| 57 | [`S-046`](#card-s-046) | [`shell_app_tabs`](#card-s-046) | `platform_shared` | `F14` | 3143 | `unreviewed` |
| 58 | [`S-049`](#card-s-049) | [`shell_web_root`](#card-s-049) | `platform_shared` | `F14` | 3143 | `unreviewed` |
| 59 | [`C-027`](#card-c-027) | [`contract_products`](#card-c-027) | `platform_shared` | `F15` | 3152 | `unreviewed` |
| 60 | [`C-034`](#card-c-034) | [`contract_trades`](#card-c-034) | `platform_shared` | `F15` | 3152 | `unreviewed` |
| 61 | [`C-035`](#card-c-035) | [`contract_user_profile`](#card-c-035) | `platform_shared` | `F15` | 3152 | `unreviewed` |
| 62 | [`C-036`](#card-c-036) | [`contract_user_profile_delete`](#card-c-036) | `platform_shared` | `F15` | 3152 | `unreviewed` |
| 63 | [`C-037`](#card-c-037) | [`contract_user_profile_reactivate`](#card-c-037) | `platform_shared` | `F15` | 3152 | `unreviewed` |
| 64 | [`S-036`](#card-s-036) | [`mobile_settings`](#card-s-036) | `platform_shared` | `F15` | 3153 | `unreviewed` |
| 65 | [`C-003`](#card-c-003) | [`contract_admin_app_health`](#card-c-003) | `platform_shared` | `F16` | 3162 | `unreviewed` |
| 66 | [`C-004`](#card-c-004) | [`contract_admin_control_panel_configs`](#card-c-004) | `platform_shared` | `F16` | 3162 | `unreviewed` |
| 67 | [`C-005`](#card-c-005) | [`contract_admin_control_panel_resync`](#card-c-005) | `platform_shared` | `F16` | 3162 | `unreviewed` |
| 68 | [`C-008`](#card-c-008) | [`contract_admin_pipeline_step_output`](#card-c-008) | `platform_shared` | `F16` | 3162 | `unreviewed` |
| 69 | [`C-009`](#card-c-009) | [`contract_admin_pipelines_history`](#card-c-009) | `platform_shared` | `F16` | 3162 | `unreviewed` |
| 70 | [`C-010`](#card-c-010) | [`contract_admin_pipelines_runs`](#card-c-010) | `platform_shared` | `F16` | 3162 | `unreviewed` |
| 71 | [`C-011`](#card-c-011) | [`contract_admin_pipelines_schedules`](#card-c-011) | `platform_shared` | `F16` | 3162 | `unreviewed` |
| 72 | [`C-012`](#card-c-012) | [`contract_admin_pipelines_slug`](#card-c-012) | `platform_shared` | `F16` | 3162 | `unreviewed` |
| 73 | [`C-013`](#card-c-013) | [`contract_admin_pipelines_status`](#card-c-013) | `platform_shared` | `F16` | 3162 | `unreviewed` |
| 74 | [`C-014`](#card-c-014) | [`contract_admin_security_mfa`](#card-c-014) | `platform_shared` | `F16` | 3162 | `unreviewed` |
| 75 | [`C-015`](#card-c-015) | [`contract_admin_security_mfa_verify`](#card-c-015) | `platform_shared` | `F16` | 3162 | `unreviewed` |
| 76 | [`C-016`](#card-c-016) | [`contract_admin_stats`](#card-c-016) | `platform_shared` | `F16` | 3162 | `unreviewed` |
| 77 | [`C-017`](#card-c-017) | [`contract_admin_sync`](#card-c-017) | `platform_shared` | `F16` | 3162 | `unreviewed` |
| 78 | [`C-018`](#card-c-018) | [`contract_admin_users`](#card-c-018) | `platform_shared` | `F16` | 3162 | `unreviewed` |
| 79 | [`C-019`](#card-c-019) | [`contract_admin_users_uid`](#card-c-019) | `platform_shared` | `F16` | 3162 | `unreviewed` |
| 80 | [`C-028`](#card-c-028) | [`contract_quality`](#card-c-028) | `platform_shared` | `F16` | 3162 | `unreviewed` |
| 81 | [`C-029`](#card-c-029) | [`contract_quality_refresh`](#card-c-029) | `platform_shared` | `F16` | 3162 | `unreviewed` |
| 82 | [`C-033`](#card-c-033) | [`contract_sync`](#card-c-033) | `platform_shared` | `F16` | 3162 | `unreviewed` |
| 83 | [`S-018`](#card-s-018) | [`admin_app_health`](#card-s-018) | `platform_shared` | `F16` | 3163 | `unreviewed` |
| 84 | [`S-019`](#card-s-019) | [`admin_control_panel`](#card-s-019) | `platform_shared` | `F16` | 3163 | `unreviewed` |
| 85 | [`S-020`](#card-s-020) | [`admin_data_quality`](#card-s-020) | `platform_shared` | `F16` | 3163 | `unreviewed` |
| 86 | [`S-021`](#card-s-021) | [`admin_home`](#card-s-021) | `platform_shared` | `F16` | 3163 | `unreviewed` |
| 87 | [`S-023`](#card-s-023) | [`admin_pipeline_step_output`](#card-s-023) | `platform_shared` | `F16` | 3163 | `unreviewed` |
| 88 | [`S-024`](#card-s-024) | [`admin_security`](#card-s-024) | `platform_shared` | `F16` | 3163 | `unreviewed` |
| 89 | [`S-025`](#card-s-025) | [`admin_user_detail`](#card-s-025) | `platform_shared` | `F16` | 3163 | `unreviewed` |
| 90 | [`S-026`](#card-s-026) | [`admin_users`](#card-s-026) | `platform_shared` | `F16` | 3163 | `unreviewed` |
| 91 | [`S-050`](#card-s-050) | [`web_login`](#card-s-050) | `platform_shared` | `F16` | 3163 | `unreviewed` |

---

<a id="card-s-002"></a>

## Card 1 — `S-002` `mobile_parcel_search`

Registry detail: [`S-002`](../../../docs/reports/generated/127-surface-registry.md#s-002) `mobile_parcel_search`.

`SURFACE` · `SEARCH` · scope `parcel_product` · feature `F01` address-lookup · build order 1013 · batch B2 · **review: `unreviewed`**

**1. What does it do, and for whom?**

A search box where someone types a Toronto street address and gets back matching lots to open. Typing pauses briefly before searching so exploratory typing does not hammer the server, and at least three characters are required. If the user's saved home base is outside Toronto they see a gentle note that coverage is Toronto-only, and if they search too fast they are told how many seconds to wait.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `address_points` | `address_point_id` · `address_full` · `addr_num_normalized` · `street_name_normalized` | `address_point_id` · `latitude` · `longitude` · `address_number` · `linear_name_full` · `address_full` · `lo_num` · `hi_num` · `maint_stage` · `address_status` · `address_class_desc` · `class_family_desc` · `place_name` · `addr_num_normalized` · `linear_name_normalized` · `geom` | `address_points` | `sources[2]` | `docs/specs/01-pipeline/54_source_address_points.md` |
| reads | `parcel_address_points` | `parcel_id` · `address_point_id` | `parcel_id` · `address_point_id` · `computed_at` | `link_parcel_addresses` | `sources[8]` | `docs/specs/01-pipeline/54_source_address_points.md` |
| reads | `parcels` | `id` · `parcel_id` · `address_number` · `linear_name_full` · `addr_num_normalized` · `street_name_normalized` | `id` · `parcel_id` · `feature_type` · `address_number` · `linear_name_full` · `addr_num_normalized` · `street_name_normalized` · `street_type_normalized` · `stated_area_raw` · `lot_size_sqm` · `lot_size_sqft` · `frontage_m` · `frontage_ft` · `depth_m` · `depth_ft` · `geometry` · `date_effective` · `date_expiry` · `created_at` · `centroid_lat` · `centroid_lng` · `is_irregular` · `geom` · `zoning_class` · `zoning_zn_string` · `zoning_gen_zone` · `zoning_holding` · `zone_status` · `bylaw_max_fsi` · `bylaw_max_coverage_pct` · `bylaw_max_height_m` · `bylaw_max_stories` · `bylaw_max_units` · `bylaw_max_density` · `bylaw_min_frontage_m` · `bylaw_min_area_sqm` · `bylaw_standard_setback_m` · `bylaw_pct_commercial_max` · `bylaw_pct_residential_max` · `bylaw_pct_employment_max` · `bylaw_pct_office_max` · `exception_number` · `exception_text` · `bylaw_chapter` · `bylaw_section` · `bylaw_exception_ref` · `in_policy_area` · `on_policy_road` · `in_rooming_house_overlay` · `in_parking_zone_overlay` · `in_building_setback_overlay` · `on_priority_retail` · `in_queenstw_eat_overlay` · `zoning_overlays` · `zoning_base_source_id` · `zoning_dominant_area_share` · `zoning_is_ambiguous` · `zoning_base_source_dataset_version` · `zoning_enriched_at` · `is_in_ravine_protection_area` · `ravine_distance_m` · `ravine_dataset_version_when_enriched` · `is_heritage_designated` · `heritage_designation_type` · `heritage_designation_date` · `heritage_dataset_version_when_enriched` · `is_corner_lot` · `is_through_lot` · `primary_frontage_street_name` · `centreline_dataset_version_when_enriched` · `lot_size_confidence` · `lot_size_basis` · `max_build_setback_basis` · `max_buildable_footprint_sqm` · `max_build_width_m` · `max_build_length_m` · `max_build_height_m` · `max_build_stories` · `max_build_basis` · `max_buildable_gfa_sqm` · `max_buildable_gfa_basis` · `max_build_confidence` · `max_garden_suite_gfa_sqm` · `garden_suite_fits` · `envelope_constrained` · `envelope_constraint_reason` · `imagery_roof_footprint_sqm` · `existing_stories` · `existing_height_m` · `imagery_roof_gfa_sqm` · `existing_width_m` · `existing_length_m` · `existing_structure_confidence` · `existing_other_structures_count` · `existing_other_structures_sqm` · `existing_greenspace_sqm` · `max_newbuild_coa_gfa_sqm` · `cur_basement_gfa_sqm` · `cur_storey_gfa_sqm` · `cur_interior_reno_gfa_sqm` · `cur_est_kitchen_gfa_sqm` · `cur_est_bath_gfa_sqm` · `max_build_stories_basis` · `abuts_laneway` · `max_garage_gfa_sqm` · `garage_capacity_cars` · `garage_constraint_reason` · `garage_permission` · `max_laneway_suite_gfa_sqm` · `max_rear_suite_gfa_sqm` · `rear_suite_type` · `rear_suite_permission` · `cur_floor_gfa_sqm` · `cur_pot_2story_gfa_sqm` · `cur_pot_3story_gfa_sqm` · `cur_gfa_range_basis` · `existing_data_quality_flag` · `max_build_stories_aggressive` · `market_exceeds_bylaw` · `neighbourhood_id` · `neighbourhood_cost_premium` · `opt_aor_storeys` · `opt_aor_gfa_sqm` · `opt_aor_units` · `opt_coa_storeys` · `opt_coa_gfa_sqm` · `opt_suite_type` · `opt_suite_fits_full` · `opt_binding_constraint` · `opt_config_confidence` · `optimal_config` · `nearby_builds_summary` · `comparable_builds` · `comp_count` · `comp_dominant_build` · `comp_build_ratio_p50` · `comp_fsi_p50` · `cur_gfa_low_sqm` · `cur_gfa_high_sqm` · `cur_storeys_range` · `cur_gfa_band_basis` · `parcel_cost_menu` · `cost_fb_total` · `cost_coa_total` · `cost_solar_total` · `cost_garden_suite_total` · `cost_laneway_suite_total` · `cost_garage_total` · `cost_gut_total` · `cost_addition_total` · `cost_kitchen_per_sqm` · `cost_bath_per_sqm` · `cost_basement_per_sqm` · `cost_basement_underpin_per_sqm` · `max_build_fsi` · `coa_fsi` · `realized_fsi_p90` · `lot_size_source` | `parcels` · `enrich_parcels` · `compute_parcel_cost_estimates` · `compute_centroids` · `enrich_centreline` · `enrich_heritage` · `enrich_ravines` | `sources[4]` | `docs/specs/01-pipeline/55_source_parcels.md` |

**3. Which contracts, and who calls them?**

Calls 1: `/api/parcels/lookup` (idiom: hook)

**4. What gate, role or entitlement stands in front of it?**

session `entitled` — The route resolves the user context and then hard-403s unless subscription_status is one of trial/active/past_due/admin_managed — a signed-in but lapsed user cannot reach the search at all. · RLS class `B` · entitlement `lead_gen`

**5. What archetype, and why that one?**

`SEARCH` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

- ⚠️ Reads the LEAD-FEED filter store to decide whether to show a "Toronto only" coverage note — `useFilterStore((s) => s.homeBaseLocation)`. "Home base" is a lead-generation concept: it is the radius centre the lead feed filters permits around, set during lead-gen onboarding. The file's own header asserts the opposite (`// Toronto hint (isInsideToronto is UX, not security — Spec 100 §2.9). NOT coupled to leads.`) while line 22 reads a lead-gen store. → owning product `lead_gen`, proposed `needs-ruling`. Evidence: `mobile/app/(app)/parcel-tool/index.tsx:22` · `mobile/app/(app)/parcel-tool/index.tsx:13` · `mobile/app/(app)/parcel-tool/index.tsx:34` · `mobile/app/(app)/parcel-tool/index.tsx:5`

**7. Does it match its owning spec section?**

Spec: [`docs/specs/03-mobile/100_mobile_parcel_cost_tool.md`](../../../docs/specs/03-mobile/100_mobile_parcel_cost_tool.md) · anchors: `docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4` · `docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §2.6` · `docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §2.8` · `docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §2.9`

- ❓ Should searching a specific street address open that lot directly, rather than returning a list of up to ten candidates to choose from? A person who types their own address expects their own property, not a disambiguation list. **Measured:** The contract returns `candidates` (≤10) with `parcel: null` whenever the address is ambiguous, and the screen renders that list. An exact match does open directly — but address ambiguity in the corpus is common enough that the list is the ordinary path, not the exception. **Spec:** Spec 100 §2 item 6 DESIGNS this: "Ambiguity → 200 with `candidates` (≤10) and `parcel: null` … the shape drives the client state machine." So the code matches its spec exactly. The question is whether the SPEC matches the product — e.g. auto-open on a single high-confidence candidate, or rank and pre-select.
- ❓ Should a parcel-tool user see a "home base" concept at all? The coverage note only appears if they completed lead-gen onboarding and set a radius centre — so a parcel-only user never sees the Toronto-coverage warning that exists to help them. **Measured:** The note is rendered only when `homeBaseLocation` is non-null AND outside Toronto. A user with no home base set sees nothing. **Spec:** Spec 100 §2.9 covers the Toronto-only scoping as UX rather than security; it does not say the hint should depend on a lead-gen field.

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 2 entr(ies) in feature `F01`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-004"></a>

## Card 2 — `S-004` `shell_parcel_tool_stack`

Registry detail: [`S-004`](../../../docs/reports/generated/127-surface-registry.md#s-004) `shell_parcel_tool_stack`.

`SURFACE` · `SHELL` · scope `parcel_product` · feature `F01` address-lookup · build order 1013 · batch B2 · **review: `unreviewed`**

**1. What does it do, and for whom?**

The thin wrapper that lets the parcels tab hold two screens in sequence: the address search, and the lot report you reach by tapping a result. It hides the default navigation header so each screen can draw its own. It makes no decisions about who is allowed in.

**2. Which tables and columns, produced by which step?**

_No table is reached by this entry — every value it shows arrives through a contract, or it shows no server data at all._

**3. Which contracts, and who calls them?**

It reaches no contract — every value is local, a prop, or device state.

**4. What gate, role or entitlement stands in front of it?**

session `entitled` — It inherits the tab gate: shell_app_tabs will not mount the tab tree at all unless subscription_status is trial/active/past_due/admin_managed, and the lookup route re-checks server-side. · RLS class `none` · entitlement `lead_gen`

**5. What archetype, and why that one?**

`SHELL` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/03-mobile/100_mobile_parcel_cost_tool.md`](../../../docs/specs/03-mobile/100_mobile_parcel_cost_tool.md) · anchors: `docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4` · `docs/specs/03-mobile/99_mobile_state_architecture.md §5.1`

**8. What is still unresearched?**

**1 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 2 entr(ies) in feature `F01`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-c-001"></a>

## Card 3 — `C-001` `contract_parcels_lookup`

Registry detail: [`C-001`](../../../docs/reports/generated/127-surface-registry.md#c-001) `contract_parcels_lookup`.

`CONTRACT` · `QUERY` · scope `parcel_product` · feature `F02` parcel-report · build order 1022 · batch B1 · **review: `unreviewed`**

**1. What does it do, and for whom?**

Lets a paying subscriber search for a property by address, or pick a specific close match, and see the estimated construction costs and nearby neighbourhood build activity for that property.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `address_points` | `address_point_id` · `address_full` · `linear_name_normalized` · `addr_num_normalized` · `address_status` · `maint_stage` | `address_point_id` · `latitude` · `longitude` · `address_number` · `linear_name_full` · `address_full` · `lo_num` · `hi_num` · `maint_stage` · `address_status` · `address_class_desc` · `class_family_desc` · `place_name` · `addr_num_normalized` · `linear_name_normalized` · `geom` | `address_points` | `sources[2]` | `docs/specs/01-pipeline/43_chain_sources.md` |
| reads | `coa_applications` | `application_number` · `address` · `status` · `decision` · `decision_date` · `hearing_date` · `description` · `project_type` · `modeled_gfa_sqm` · `estimated_cost` · `neighbourhood_id` | `id` · `application_number` · `address` · `street_num` · `street_name` · `ward` · `status` · `decision` · `decision_date` · `hearing_date` · `description` · `applicant` · `linked_permit_num` · `linked_confidence` · `data_hash` · `first_seen_at` · `last_seen_at` · `sub_type` · `street_name_normalized` · `lifecycle_phase` · `lifecycle_classified_at` · `lifecycle_stalled` · `lead_id` · `coa_type_class` · `project_type` · `scope_tags` · `scope_classified_at` · `scope_source` · `structure_type` · `neighbourhood_id` · `latitude` · `longitude` · `modeled_gfa_sqm` · `estimated_cost` · `cost_source` · `cost_classified_at` · `lifecycle_seq` · `lifecycle_group` · `lifecycle_block` · `lifecycle_stage` · `bid_value` · `parcel_linked_at` · `trade_classified_at` · `matched_status` · `matched_rule` · `unmapped_status` · `unmapped_decision` · `zoning_class` · `bylaw_max_coverage_pct` · `bylaw_max_fsi` · `bylaw_max_height_m` · `exception_number` · `variance_context` · `zoning_parcel_count` · `zoning_dominant_parcel_id` · `zoning_dominant_parcel_method` · `zoning_enriched_at` · `is_in_ravine_protection_area` · `ravine_distance_m` · `is_heritage_designated` · `heritage_designation_type` · `heritage_designation_date` · `is_corner_lot` · `is_through_lot` · `primary_frontage_street_name` · `lot_size_sqm` · `frontage_m` · `depth_m` · `lot_size_confidence` · `lot_size_basis` · `max_build_setback_basis` · `max_buildable_footprint_sqm` · `max_build_width_m` · `max_build_length_m` · `max_build_height_m` · `max_build_stories` · `max_build_basis` · `max_buildable_gfa_sqm` · `max_buildable_gfa_basis` · `max_build_confidence` · `max_garden_suite_gfa_sqm` · `garden_suite_fits` · `envelope_constrained` · `envelope_constraint_reason` · `imagery_roof_footprint_sqm` · `existing_stories` · `existing_height_m` · `imagery_roof_gfa_sqm` · `existing_width_m` · `existing_length_m` · `existing_structure_confidence` · `existing_other_structures_count` · `existing_other_structures_sqm` · `existing_greenspace_sqm` · `max_newbuild_coa_gfa_sqm` · `cur_basement_gfa_sqm` · `cur_storey_gfa_sqm` · `cur_interior_reno_gfa_sqm` · `cur_est_kitchen_gfa_sqm` · `cur_est_bath_gfa_sqm` · `max_build_stories_basis` · `abuts_laneway` · `max_garage_gfa_sqm` · `garage_capacity_cars` · `garage_constraint_reason` · `garage_permission` · `max_laneway_suite_gfa_sqm` · `max_rear_suite_gfa_sqm` · `rear_suite_type` · `rear_suite_permission` · `cur_floor_gfa_sqm` · `cur_pot_2story_gfa_sqm` · `cur_pot_3story_gfa_sqm` · `cur_gfa_range_basis` · `existing_data_quality_flag` · `max_build_stories_aggressive` · `market_exceeds_bylaw` · `neighbourhood_cost_premium` · `opt_aor_storeys` · `opt_aor_gfa_sqm` · `opt_aor_units` · `opt_coa_storeys` · `opt_coa_gfa_sqm` · `opt_suite_type` · `opt_suite_fits_full` · `opt_binding_constraint` · `opt_config_confidence` · `comp_count` · `comp_dominant_build` · `comp_build_ratio_p50` · `comp_fsi_p50` · `cost_fb_total` · `cost_coa_total` · `cost_solar_total` · `cost_garden_suite_total` · `cost_laneway_suite_total` · `cost_garage_total` · `cost_gut_total` · `cost_addition_total` · `cost_kitchen_per_sqm` · `cost_bath_per_sqm` · `cost_basement_per_sqm` · `cost_basement_underpin_per_sqm` · `max_build_fsi` · `coa_fsi` · `realized_fsi_p90` | `classify_coa_scope` · `classify_coa_trades` · `classify_lifecycle_phase` · `coa` · `compute_coa_cost_estimates` · `enrich_coa_zoning` · `link_coa` · `link_coa_to_parcels` | `coa[5] · coa[6] · permits[23], coa[12] · coa[1] · coa[7] · coa[4] · permits[19], coa[8] · coa[3]` | `docs/specs/01-pipeline/42_chain_coa.md` |
| reads | `entitlements` | `status` · `user_id` · `product` | `user_id` · `product` · `status` · `stripe_subscription_id` · `current_period_end` · `trial_started_at` · `last_stripe_event_at` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/116_multi_product_architecture.md` |
| reads | `parcel_address_points` | `address_point_id` · `parcel_id` | `parcel_id` · `address_point_id` · `computed_at` | `link_parcel_addresses` | `sources[8]` | `docs/specs/01-pipeline/54_source_address_points.md` |
| reads | `parcels` | `parcel_id` · `address_number` · `linear_name_full` · `addr_num_normalized` · `street_name_normalized` · `id` · `parcel_cost_menu` · `cost_fb_total` · `cost_coa_total` · `cost_solar_total` · `cost_garden_suite_total` · `cost_laneway_suite_total` · `cost_garage_total` · `cost_gut_total` · `cost_addition_total` · `cost_kitchen_per_sqm` · `cost_bath_per_sqm` · `cost_basement_per_sqm` · `cost_basement_underpin_per_sqm` · `lot_size_sqm` · `lot_size_sqft` · `opt_aor_gfa_sqm` · `opt_aor_storeys` · `opt_coa_gfa_sqm` · `opt_coa_storeys` · `max_buildable_gfa_sqm` · `max_buildable_footprint_sqm` · `imagery_roof_gfa_sqm` · `imagery_roof_footprint_sqm` · `cur_floor_gfa_sqm` · `max_newbuild_coa_gfa_sqm` · `nearby_builds_summary` · `comparable_builds` · `comp_count` · `comp_dominant_build` · `comp_build_ratio_p50` · `comp_fsi_p50` · `neighbourhood_id` · `neighbourhood_cost_premium` · `feature_type` · `date_effective` · `date_expiry` · `created_at` · `centroid_lat` · `centroid_lng` · `is_irregular` · `street_type_normalized` · `stated_area_raw` · `frontage_m` · `frontage_ft` · `depth_m` · `depth_ft` · `lot_size_confidence` · `lot_size_basis` · `lot_size_source` · `zoning_class` · `zoning_zn_string` · `zoning_gen_zone` · `zoning_holding` · `zone_status` · `bylaw_max_fsi` · `bylaw_max_coverage_pct` · `bylaw_max_height_m` · `bylaw_max_stories` · `bylaw_max_units` · `bylaw_max_density` · `bylaw_min_frontage_m` · `bylaw_min_area_sqm` · `bylaw_standard_setback_m` · `bylaw_pct_commercial_max` · `bylaw_pct_residential_max` · `bylaw_pct_employment_max` · `bylaw_pct_office_max` · `exception_number` · `exception_text` · `bylaw_chapter` · `bylaw_section` · `bylaw_exception_ref` · `in_policy_area` · `on_policy_road` · `in_rooming_house_overlay` · `in_parking_zone_overlay` · `in_building_setback_overlay` · `on_priority_retail` · `in_queenstw_eat_overlay` · `zoning_overlays` · `zoning_base_source_id` · `zoning_dominant_area_share` · `zoning_is_ambiguous` · `zoning_base_source_dataset_version` · `zoning_enriched_at` · `is_in_ravine_protection_area` · `ravine_distance_m` · `ravine_dataset_version_when_enriched` · `is_heritage_designated` · `heritage_designation_type` · `heritage_designation_date` · `heritage_dataset_version_when_enriched` · `is_corner_lot` · `is_through_lot` · `primary_frontage_street_name` · `centreline_dataset_version_when_enriched` · `abuts_laneway` · `existing_stories` · `existing_height_m` · `existing_width_m` · `existing_length_m` · `existing_structure_confidence` · `existing_other_structures_count` · `existing_other_structures_sqm` · `existing_greenspace_sqm` · `existing_data_quality_flag` · `cur_gfa_low_sqm` · `cur_gfa_high_sqm` · `cur_storeys_range` · `cur_gfa_band_basis` · `max_build_setback_basis` · `max_build_width_m` · `max_build_length_m` · `max_build_height_m` · `max_build_stories` · `max_build_basis` · `max_buildable_gfa_basis` · `max_build_confidence` · `envelope_constrained` · `envelope_constraint_reason` · `max_build_stories_basis` · `max_build_stories_aggressive` · `market_exceeds_bylaw` · `max_build_fsi` · `coa_fsi` · `realized_fsi_p90` · `massing_enriched_at` · `cur_basement_gfa_sqm` · `cur_storey_gfa_sqm` · `cur_interior_reno_gfa_sqm` · `cur_est_kitchen_gfa_sqm` · `cur_est_bath_gfa_sqm` · `cur_pot_2story_gfa_sqm` · `cur_pot_3story_gfa_sqm` · `cur_gfa_range_basis` · `garden_suite_fits` · `max_garden_suite_gfa_sqm` · `max_garage_gfa_sqm` · `garage_capacity_cars` · `garage_constraint_reason` · `garage_permission` · `max_laneway_suite_gfa_sqm` · `max_rear_suite_gfa_sqm` · `rear_suite_type` · `rear_suite_permission` · `opt_aor_units` · `opt_suite_type` · `opt_suite_fits_full` · `opt_binding_constraint` · `opt_config_confidence` · `optimal_config` | `id` · `parcel_id` · `feature_type` · `address_number` · `linear_name_full` · `addr_num_normalized` · `street_name_normalized` · `street_type_normalized` · `stated_area_raw` · `lot_size_sqm` · `lot_size_sqft` · `frontage_m` · `frontage_ft` · `depth_m` · `depth_ft` · `geometry` · `date_effective` · `date_expiry` · `created_at` · `centroid_lat` · `centroid_lng` · `is_irregular` · `geom` · `zoning_class` · `zoning_zn_string` · `zoning_gen_zone` · `zoning_holding` · `zone_status` · `bylaw_max_fsi` · `bylaw_max_coverage_pct` · `bylaw_max_height_m` · `bylaw_max_stories` · `bylaw_max_units` · `bylaw_max_density` · `bylaw_min_frontage_m` · `bylaw_min_area_sqm` · `bylaw_standard_setback_m` · `bylaw_pct_commercial_max` · `bylaw_pct_residential_max` · `bylaw_pct_employment_max` · `bylaw_pct_office_max` · `exception_number` · `exception_text` · `bylaw_chapter` · `bylaw_section` · `bylaw_exception_ref` · `in_policy_area` · `on_policy_road` · `in_rooming_house_overlay` · `in_parking_zone_overlay` · `in_building_setback_overlay` · `on_priority_retail` · `in_queenstw_eat_overlay` · `zoning_overlays` · `zoning_base_source_id` · `zoning_dominant_area_share` · `zoning_is_ambiguous` · `zoning_base_source_dataset_version` · `zoning_enriched_at` · `is_in_ravine_protection_area` · `ravine_distance_m` · `ravine_dataset_version_when_enriched` · `is_heritage_designated` · `heritage_designation_type` · `heritage_designation_date` · `heritage_dataset_version_when_enriched` · `is_corner_lot` · `is_through_lot` · `primary_frontage_street_name` · `centreline_dataset_version_when_enriched` · `lot_size_confidence` · `lot_size_basis` · `max_build_setback_basis` · `max_buildable_footprint_sqm` · `max_build_width_m` · `max_build_length_m` · `max_build_height_m` · `max_build_stories` · `max_build_basis` · `max_buildable_gfa_sqm` · `max_buildable_gfa_basis` · `max_build_confidence` · `max_garden_suite_gfa_sqm` · `garden_suite_fits` · `envelope_constrained` · `envelope_constraint_reason` · `imagery_roof_footprint_sqm` · `existing_stories` · `existing_height_m` · `imagery_roof_gfa_sqm` · `existing_width_m` · `existing_length_m` · `existing_structure_confidence` · `existing_other_structures_count` · `existing_other_structures_sqm` · `existing_greenspace_sqm` · `max_newbuild_coa_gfa_sqm` · `cur_basement_gfa_sqm` · `cur_storey_gfa_sqm` · `cur_interior_reno_gfa_sqm` · `cur_est_kitchen_gfa_sqm` · `cur_est_bath_gfa_sqm` · `max_build_stories_basis` · `abuts_laneway` · `max_garage_gfa_sqm` · `garage_capacity_cars` · `garage_constraint_reason` · `garage_permission` · `max_laneway_suite_gfa_sqm` · `max_rear_suite_gfa_sqm` · `rear_suite_type` · `rear_suite_permission` · `cur_floor_gfa_sqm` · `cur_pot_2story_gfa_sqm` · `cur_pot_3story_gfa_sqm` · `cur_gfa_range_basis` · `existing_data_quality_flag` · `max_build_stories_aggressive` · `market_exceeds_bylaw` · `neighbourhood_id` · `neighbourhood_cost_premium` · `opt_aor_storeys` · `opt_aor_gfa_sqm` · `opt_aor_units` · `opt_coa_storeys` · `opt_coa_gfa_sqm` · `opt_suite_type` · `opt_suite_fits_full` · `opt_binding_constraint` · `opt_config_confidence` · `optimal_config` · `nearby_builds_summary` · `comparable_builds` · `comp_count` · `comp_dominant_build` · `comp_build_ratio_p50` · `comp_fsi_p50` · `cur_gfa_low_sqm` · `cur_gfa_high_sqm` · `cur_storeys_range` · `cur_gfa_band_basis` · `parcel_cost_menu` · `cost_fb_total` · `cost_coa_total` · `cost_solar_total` · `cost_garden_suite_total` · `cost_laneway_suite_total` · `cost_garage_total` · `cost_gut_total` · `cost_addition_total` · `cost_kitchen_per_sqm` · `cost_bath_per_sqm` · `cost_basement_per_sqm` · `cost_basement_underpin_per_sqm` · `max_build_fsi` · `coa_fsi` · `realized_fsi_p90` · `lot_size_source` | `compute_centroids` · `compute_parcel_cost_estimates` · `enrich_centreline` · `enrich_heritage` · `enrich_parcels` · `enrich_ravines` · `parcels` | `sources[9] · sources[22] · sources[13] · sources[12] · sources[21] · sources[11] · sources[4]` | `docs/specs/01-pipeline/43_chain_sources.md` |
| reads | `user_profiles` | `trade_slug` · `trade_slugs_override` · `display_name` · `user_id` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/02-web-admin/102_admin_notifications_tool.md` |
| writes | `user_profiles` | `user_id` · `trade_slug` · `display_name` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/02-web-admin/102_admin_notifications_tool.md` |

**3. Which contracts, and who calls them?**

Called by 1: `mobile/src/hooks/useParcelLookup.ts`

**4. What gate, role or entitlement stands in front of it?**

session `entitled` — classifyRoute returns "authenticated", and the handler adds a server-side subscription gate: a session alone is refused unless subscription_status is in ACTIVE_SUBSCRIPTION_STATUSES. · RLS class `A` · entitlement `none`

**5. What archetype, and why that one?**

`QUERY` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

- ⚠️ Its entitlement check reads `entitlements` joined on `product = 'lead_gen'`, because `chk_entitlements_product` admits only `lead_gen` and `flight_center`. The parcel product has no key of its own in the live database — Spec 128 R-01 rules that it should, and the CHECK widening has not landed. → owning product `lead_gen`, proposed `move-to-owner`. Evidence: `migrations/228_entitlements.sql:32-33` · `src/lib/entitlements/index.ts:39` · `src/lib/entitlements/index.ts:42-43`

**7. Does it match its owning spec section?**

Spec: [`docs/specs/03-mobile/100_mobile_parcel_cost_tool.md`](../../../docs/specs/03-mobile/100_mobile_parcel_cost_tool.md) · anchors: `docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §3 (API) — src/app/api/parcels/lookup/route.ts:1; body also cites §2.6 (line 6), §90 §11 (line 8), §5 (line 9), §3.2 whitelist (line 11), §2.8 (line 13)`

**8. What is still unresearched?**

**1 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 2 entr(ies) in feature `F02`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-001"></a>

## Card 4 — `S-001` `mobile_parcel_detail` — **THE PILOT**

Registry detail: [`S-001`](../../../docs/reports/generated/127-surface-registry.md#s-001) `mobile_parcel_detail`.

`SURFACE` · `REPORT` · scope `parcel_product` · feature `F02` parcel-report · build order 1023 · batch B1 · **review: `unreviewed`**

**1. What does it do, and for whom?**

The full story of one building lot, assembled for a homeowner or buyer. It shows the lot size and how much floor area can legally be built, a menu of what different kinds of work would cost, a summary of what neighbours have built, real nearby examples with their density and build type, and any applications currently in front of the committee of adjustment. Nothing on this page can be edited or saved; it only reads.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `parcels` | `all` | `id` · `parcel_id` · `feature_type` · `address_number` · `linear_name_full` · `addr_num_normalized` · `street_name_normalized` · `street_type_normalized` · `stated_area_raw` · `lot_size_sqm` · `lot_size_sqft` · `frontage_m` · `frontage_ft` · `depth_m` · `depth_ft` · `geometry` · `date_effective` · `date_expiry` · `created_at` · `centroid_lat` · `centroid_lng` · `is_irregular` · `geom` · `zoning_class` · `zoning_zn_string` · `zoning_gen_zone` · `zoning_holding` · `zone_status` · `bylaw_max_fsi` · `bylaw_max_coverage_pct` · `bylaw_max_height_m` · `bylaw_max_stories` · `bylaw_max_units` · `bylaw_max_density` · `bylaw_min_frontage_m` · `bylaw_min_area_sqm` · `bylaw_standard_setback_m` · `bylaw_pct_commercial_max` · `bylaw_pct_residential_max` · `bylaw_pct_employment_max` · `bylaw_pct_office_max` · `exception_number` · `exception_text` · `bylaw_chapter` · `bylaw_section` · `bylaw_exception_ref` · `in_policy_area` · `on_policy_road` · `in_rooming_house_overlay` · `in_parking_zone_overlay` · `in_building_setback_overlay` · `on_priority_retail` · `in_queenstw_eat_overlay` · `zoning_overlays` · `zoning_base_source_id` · `zoning_dominant_area_share` · `zoning_is_ambiguous` · `zoning_base_source_dataset_version` · `zoning_enriched_at` · `is_in_ravine_protection_area` · `ravine_distance_m` · `ravine_dataset_version_when_enriched` · `is_heritage_designated` · `heritage_designation_type` · `heritage_designation_date` · `heritage_dataset_version_when_enriched` · `is_corner_lot` · `is_through_lot` · `primary_frontage_street_name` · `centreline_dataset_version_when_enriched` · `lot_size_confidence` · `lot_size_basis` · `max_build_setback_basis` · `max_buildable_footprint_sqm` · `max_build_width_m` · `max_build_length_m` · `max_build_height_m` · `max_build_stories` · `max_build_basis` · `max_buildable_gfa_sqm` · `max_buildable_gfa_basis` · `max_build_confidence` · `max_garden_suite_gfa_sqm` · `garden_suite_fits` · `envelope_constrained` · `envelope_constraint_reason` · `imagery_roof_footprint_sqm` · `existing_stories` · `existing_height_m` · `imagery_roof_gfa_sqm` · `existing_width_m` · `existing_length_m` · `existing_structure_confidence` · `existing_other_structures_count` · `existing_other_structures_sqm` · `existing_greenspace_sqm` · `max_newbuild_coa_gfa_sqm` · `cur_basement_gfa_sqm` · `cur_storey_gfa_sqm` · `cur_interior_reno_gfa_sqm` · `cur_est_kitchen_gfa_sqm` · `cur_est_bath_gfa_sqm` · `max_build_stories_basis` · `abuts_laneway` · `max_garage_gfa_sqm` · `garage_capacity_cars` · `garage_constraint_reason` · `garage_permission` · `max_laneway_suite_gfa_sqm` · `max_rear_suite_gfa_sqm` · `rear_suite_type` · `rear_suite_permission` · `cur_floor_gfa_sqm` · `cur_pot_2story_gfa_sqm` · `cur_pot_3story_gfa_sqm` · `cur_gfa_range_basis` · `existing_data_quality_flag` · `max_build_stories_aggressive` · `market_exceeds_bylaw` · `neighbourhood_id` · `neighbourhood_cost_premium` · `opt_aor_storeys` · `opt_aor_gfa_sqm` · `opt_aor_units` · `opt_coa_storeys` · `opt_coa_gfa_sqm` · `opt_suite_type` · `opt_suite_fits_full` · `opt_binding_constraint` · `opt_config_confidence` · `optimal_config` · `nearby_builds_summary` · `comparable_builds` · `comp_count` · `comp_dominant_build` · `comp_build_ratio_p50` · `comp_fsi_p50` · `cur_gfa_low_sqm` · `cur_gfa_high_sqm` · `cur_storeys_range` · `cur_gfa_band_basis` · `parcel_cost_menu` · `cost_fb_total` · `cost_coa_total` · `cost_solar_total` · `cost_garden_suite_total` · `cost_laneway_suite_total` · `cost_garage_total` · `cost_gut_total` · `cost_addition_total` · `cost_kitchen_per_sqm` · `cost_bath_per_sqm` · `cost_basement_per_sqm` · `cost_basement_underpin_per_sqm` · `max_build_fsi` · `coa_fsi` · `realized_fsi_p90` · `lot_size_source` | `parcels` · `enrich_parcels` · `compute_parcel_cost_estimates` · `compute_centroids` · `enrich_centreline` · `enrich_heritage` · `enrich_ravines` | `sources[4]` | `docs/specs/01-pipeline/55_source_parcels.md` |
| reads | `coa_applications` | `application_number` · `address` · `status` · `decision` · `decision_date` · `hearing_date` · `description` · `project_type` · `modeled_gfa_sqm` · `estimated_cost` · `neighbourhood_id` | `id` · `application_number` · `address` · `street_num` · `street_name` · `ward` · `status` · `decision` · `decision_date` · `hearing_date` · `description` · `applicant` · `linked_permit_num` · `linked_confidence` · `data_hash` · `first_seen_at` · `last_seen_at` · `sub_type` · `street_name_normalized` · `lifecycle_phase` · `lifecycle_classified_at` · `lifecycle_stalled` · `lead_id` · `coa_type_class` · `project_type` · `scope_tags` · `scope_classified_at` · `scope_source` · `structure_type` · `neighbourhood_id` · `latitude` · `longitude` · `modeled_gfa_sqm` · `estimated_cost` · `cost_source` · `cost_classified_at` · `lifecycle_seq` · `lifecycle_group` · `lifecycle_block` · `lifecycle_stage` · `bid_value` · `parcel_linked_at` · `trade_classified_at` · `matched_status` · `matched_rule` · `unmapped_status` · `unmapped_decision` · `zoning_class` · `bylaw_max_coverage_pct` · `bylaw_max_fsi` · `bylaw_max_height_m` · `exception_number` · `variance_context` · `zoning_parcel_count` · `zoning_dominant_parcel_id` · `zoning_dominant_parcel_method` · `zoning_enriched_at` · `is_in_ravine_protection_area` · `ravine_distance_m` · `is_heritage_designated` · `heritage_designation_type` · `heritage_designation_date` · `is_corner_lot` · `is_through_lot` · `primary_frontage_street_name` · `lot_size_sqm` · `frontage_m` · `depth_m` · `lot_size_confidence` · `lot_size_basis` · `max_build_setback_basis` · `max_buildable_footprint_sqm` · `max_build_width_m` · `max_build_length_m` · `max_build_height_m` · `max_build_stories` · `max_build_basis` · `max_buildable_gfa_sqm` · `max_buildable_gfa_basis` · `max_build_confidence` · `max_garden_suite_gfa_sqm` · `garden_suite_fits` · `envelope_constrained` · `envelope_constraint_reason` · `imagery_roof_footprint_sqm` · `existing_stories` · `existing_height_m` · `imagery_roof_gfa_sqm` · `existing_width_m` · `existing_length_m` · `existing_structure_confidence` · `existing_other_structures_count` · `existing_other_structures_sqm` · `existing_greenspace_sqm` · `max_newbuild_coa_gfa_sqm` · `cur_basement_gfa_sqm` · `cur_storey_gfa_sqm` · `cur_interior_reno_gfa_sqm` · `cur_est_kitchen_gfa_sqm` · `cur_est_bath_gfa_sqm` · `max_build_stories_basis` · `abuts_laneway` · `max_garage_gfa_sqm` · `garage_capacity_cars` · `garage_constraint_reason` · `garage_permission` · `max_laneway_suite_gfa_sqm` · `max_rear_suite_gfa_sqm` · `rear_suite_type` · `rear_suite_permission` · `cur_floor_gfa_sqm` · `cur_pot_2story_gfa_sqm` · `cur_pot_3story_gfa_sqm` · `cur_gfa_range_basis` · `existing_data_quality_flag` · `max_build_stories_aggressive` · `market_exceeds_bylaw` · `neighbourhood_cost_premium` · `opt_aor_storeys` · `opt_aor_gfa_sqm` · `opt_aor_units` · `opt_coa_storeys` · `opt_coa_gfa_sqm` · `opt_suite_type` · `opt_suite_fits_full` · `opt_binding_constraint` · `opt_config_confidence` · `comp_count` · `comp_dominant_build` · `comp_build_ratio_p50` · `comp_fsi_p50` · `cost_fb_total` · `cost_coa_total` · `cost_solar_total` · `cost_garden_suite_total` · `cost_laneway_suite_total` · `cost_garage_total` · `cost_gut_total` · `cost_addition_total` · `cost_kitchen_per_sqm` · `cost_bath_per_sqm` · `cost_basement_per_sqm` · `cost_basement_underpin_per_sqm` · `max_build_fsi` · `coa_fsi` · `realized_fsi_p90` | `coa` · `link_coa_to_parcels` · `classify_coa_scope` · `compute_coa_cost_estimates` | `coa[1]` | `docs/specs/01-pipeline/42_chain_coa.md` |

**3. Which contracts, and who calls them?**

Calls 1: `/api/parcels/lookup` (idiom: hook)

**4. What gate, role or entitlement stands in front of it?**

session `entitled` — Spec 100 §5: the proprietary cost model is gated server-side — an inactive subscription gets 403 before any DB work, even if a stale client bypasses the UI gate. · RLS class `B` · entitlement `lead_gen`

**5. What archetype, and why that one?**

`REPORT` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

- ⚠️ Gated by the GLOBAL `subscription_status`, which is the lead-gen subscription, rather than by a parcel-tool entitlement. A user paying for lead generation gets the parcel product free; a user who wanted only the parcel product cannot buy it. → owning product `lead_gen`, proposed `move-to-owner`. Evidence: `src/app/api/parcels/lookup/route.ts:46-59` · `migrations/228_entitlements.sql:32-33`

**7. Does it match its owning spec section?**

Spec: [`docs/specs/03-mobile/100_mobile_parcel_cost_tool.md`](../../../docs/specs/03-mobile/100_mobile_parcel_cost_tool.md) · anchors: `docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4` · `docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §3.2` · `docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §8` · `docs/specs/01-pipeline/88_parcel_cost_model.md` · `docs/specs/02-web-admin/126_maxbld_surface_standard.md §11`

- ❓ Is a report that "derives nothing new" the product a MaxBLD customer is buying? Every value is an existing pipeline column re-presented; the tool adds no scenario, no comparison and no saved state. **Measured:** Spec 100 §1 states it explicitly: "It derives nothing new." The surface writes nothing, saves nothing and has no Layer-3 store. **Spec:** By design, and the design is what makes it the lowest-risk pilot. The question is whether the shipped product should stay that way once the standard is proven.

**8. What is still unresearched?**

Nothing — every field is answered with a why and a citation.

**9. What would removing it delete?**

It is 1 of 2 entr(ies) in feature `F02`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-003"></a>

## Card 5 — `S-003` `overlay_sponsor_slot`

Registry detail: [`S-003`](../../../docs/reports/generated/127-surface-registry.md#s-003) `overlay_sponsor_slot`.

`SURFACE` · `SLOT` · scope `parcel_product` · feature `F04` sponsor-placements · build order 1043 · batch B1 · **review: `unreviewed`**

**1. What does it do, and for whom?**

A reserved, named space at the foot of the lot report where a future architect, designer, or trade sponsorship will appear. In the current build it shows nothing at all. It exists now purely so the position in the page is claimed and the layout will not have to be rearranged later.

**2. Which tables and columns, produced by which step?**

_No table is reached by this entry — every value it shows arrives through a contract, or it shows no server data at all._

**3. Which contracts, and who calls them?**

It reaches no contract — every value is local, a prop, or device state.

**4. What gate, role or entitlement stands in front of it?**

session `entitled` — It is mounted only inside the parcel detail report, which the route gates on an active subscription — so the slot inherits that gate even though it renders nothing. · RLS class `none` · entitlement `lead_gen`

**5. What archetype, and why that one?**

`SLOT` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/03-mobile/100_mobile_parcel_cost_tool.md`](../../../docs/specs/03-mobile/100_mobile_parcel_cost_tool.md) · anchors: `docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §8` · `docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §6.8` · `docs/specs/02-web-admin/126_maxbld_surface_standard.md §7`

**8. What is still unresearched?**

Nothing — every field is answered with a why and a citation.

**9. What would removing it delete?**

It is 1 of 4 entr(ies) in feature `F04`. Removing it deletes 1 owned component(s): `mobile/src/components/parcel/SponsorSlot.tsx`. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-005"></a>

## Card 6 — `S-005` `web_landing`

Registry detail: [`S-005`](../../../docs/reports/generated/127-surface-registry.md#s-005) `web_landing`.

`SURFACE` · `STATIC` · scope `parcel_product` · feature `F06` web-front-door · build order 1063 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

The public front door of the product. A visitor who has never signed in lands here and reads the pitch: the service watches Toronto building permits every day and matches them to a trade so contractors hear about jobs early. It shows three explainer cards, a list of the twenty trade categories covered, and buttons that send the visitor to sign in or straight to the live permit feed. Nothing on the page is personalised and it fetches no data.

**2. Which tables and columns, produced by which step?**

_No table is reached by this entry — every value it shows arrives through a contract, or it shows no server data at all._

**3. Which contracts, and who calls them?**

It reaches no contract — every value is local, a prop, or device state.

**4. What gate, role or entitlement stands in front of it?**

session `anon` — PUBLIC_PATHS lists `/` explicitly and the middleware lock pins classifyRoute('/') === 'public'. · RLS class `none` · entitlement `none`

**5. What archetype, and why that one?**

`STATIC` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: **UNRESEARCHED** — no SPEC LINK header and no System Map row, so there is nothing to check it against · anchors: 

**8. What is still unresearched?**

**3 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 1 entr(ies) in feature `F06`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-009"></a>

## Card 7 — `S-009` `admin_export_audit`

Registry detail: [`S-009`](../../../docs/reports/generated/127-surface-registry.md#s-009) `admin_export_audit`.

`SURFACE` · `LIST` · scope `parcel_admin` · feature `F03` pdf-export · build order 2033 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

A running list of every document the product has generated and sent out — who exported what, when, and to whom. It is the record you reach for when a customer asks what was sent on their behalf, or when a compliance question lands. It is also the first place a broken export path becomes visible, because an export feature that no one ever uses shows up here as an empty list rather than as silence.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `pdf_exports` **(net-new)** | `export_id` · `user_id` · `subject_kind` · `subject_key` · `storage_path` · `bytes` · `parity_fingerprint` · `expires_at` · `recipient` | _does not exist yet_ | `none` | `n/a` | `docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3 row 7 · §6.5` |
| reads | `usage_events` **(net-new)** | `event_id` · `user_id` · `session_id` · `product` · `event` · `subject_kind` · `subject_key` · `occurred_at` · `meta` | _does not exist yet_ | `none` | `n/a` | `docs/specs/02-web-admin/126_maxbld_surface_standard.md §7` |

**3. Which contracts, and who calls them?**

It reaches no contract — every value is local, a prop, or device state.

**4. What gate, role or entitlement stands in front of it?**

session `admin` — An /admin/** page: classifyRoute returns "admin" for any pathname starting with /admin/, and "admin" is the profiles.is_admin flag checked in-predicate — there is no admin Postgres role. · RLS class `A` · entitlement `none`

**5. What archetype, and why that one?**

`LIST` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/02-web-admin/126_maxbld_surface_standard.md`](../../../docs/specs/02-web-admin/126_maxbld_surface_standard.md) · anchors: `docs/specs/02-web-admin/126_maxbld_surface_standard.md §2.2 group E — admin_export_audit LIST (gen, NEW)` · `docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3 row 7 — pdf_exports: one row per generated export, and the share model` · `docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.5 — Supabase Storage, the surface-exports bucket, and the ledger row per issue and per download` · `docs/specs/02-web-admin/126_maxbld_surface_standard.md §7 — usage_events, event pdf_send / export` · `docs/reports/2026-09-15-spec126-admin-best-in-class.md §1.1 row 16 · §3.1`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 1 entr(ies) in feature `F03`. Removing it deletes 1 owned component(s): `src/features/admin-registry/components/ExportAuditTable.tsx`. It is the ONLY reader or writer of `pdf_exports` — removing it orphans that table.

---

<a id="card-s-006"></a>

## Card 8 — `S-006` `admin_advertiser_accounts`

Registry detail: [`S-006`](../../../docs/reports/generated/127-surface-registry.md#s-006) `admin_advertiser_accounts`.

`SURFACE` · `LIST` · scope `parcel_admin` · feature `F04` sponsor-placements · build order 2043 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

The place an operator creates and manages the businesses that pay to advertise in the product — a builder or designer who buys a sponsored slot. It lists every advertiser account with a detail view for each one, and it is where an account is set up, edited, and deactivated. Nothing like it exists today because the product has never had a paying advertiser.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `advertisers` **(net-new)** | `advertiser_id` · `name` · `contact_user_id` · `active` | _does not exist yet_ | `none` | `n/a` | `docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3 row 4` |
| writes | `advertisers` **(net-new)** | `advertiser_id` · `name` · `contact_user_id` · `active` | _does not exist yet_ | `none` | `n/a` | `docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3 row 4` |
| writes | `admin_audit_log` | `id` · `admin_uid` · `action` · `target_uid` · `old_value` · `new_value` · `reason` · `created_at` | `id` · `admin_uid` · `action` · `target_uid` · `old_value` · `new_value` · `reason` · `created_at` | `none` | `n/a` | `docs/specs/02-web-admin/26_admin_dashboard.md` |

**3. Which contracts, and who calls them?**

It reaches no contract — every value is local, a prop, or device state.

**4. What gate, role or entitlement stands in front of it?**

session `admin` — An /admin/** page: classifyRoute returns "admin" for any pathname starting with /admin/, and "admin" is the profiles.is_admin flag checked in-predicate — there is no admin Postgres role. · RLS class `D` · entitlement `none`

**5. What archetype, and why that one?**

`LIST` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/02-web-admin/126_maxbld_surface_standard.md`](../../../docs/specs/02-web-admin/126_maxbld_surface_standard.md) · anchors: `docs/specs/02-web-admin/126_maxbld_surface_standard.md §2.2 group D — admin_advertiser_accounts LIST+DETAIL (gen, NEW)` · `docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3 row 4 — advertisers: the membership row the advertiser role is scoped by` · `docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.2 — the advertiser role and Class D` · `docs/specs/02-web-admin/128_surface_standard_policy.md §3 rule B6 / §5 R-12 — every admin mutation writes exactly one admin_audit_log row` · `docs/specs/00-architecture/114_rls_policy_catalog.md §2 amendment 2026-09-15 — Class D` · `docs/reports/2026-09-15-spec126-admin-best-in-class.md §1.1 row 13`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 4 entr(ies) in feature `F04`. Removing it deletes 1 owned component(s): `src/features/admin-registry/components/AdvertiserAccountTable.tsx`. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-013"></a>

## Card 9 — `S-013` `admin_placements`

Registry detail: [`S-013`](../../../docs/reports/generated/127-surface-registry.md#s-013) `admin_placements`.

`SURFACE` · `FORM` · scope `parcel_admin` · feature `F04` sponsor-placements · build order 2043 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

The form on which an operator assigns a specific advertiser to a specific advertising slot in the product — which sponsor appears where, and for how long. The list of valid slots is a closed, declared set rather than free text, so a placement cannot be pointed at a slot that does not exist. Today the component that would display a sponsor renders nothing at all, so there is no way to sell or schedule a placement.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `placements` **(net-new)** | `placement_key` · `surface_archetype` · `max_slots` · `disclosure_required` | _does not exist yet_ | `none` | `n/a` | `docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3 row 5` |
| reads | `offers` **(net-new)** | `offer_id` · `advertiser_id` · `placement_key` · `targeting` · `flight_start` · `flight_end` · `active` | _does not exist yet_ | `none` | `n/a` | `docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3 row 6` |
| writes | `placements` **(net-new)** | `placement_key` · `surface_archetype` · `max_slots` · `disclosure_required` | _does not exist yet_ | `none` | `n/a` | `docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3 row 5` |
| writes | `offers` **(net-new)** | `offer_id` · `advertiser_id` · `placement_key` · `targeting` · `flight_start` · `flight_end` · `active` | _does not exist yet_ | `none` | `n/a` | `docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3 row 6` |
| writes | `admin_audit_log` | `id` · `admin_uid` · `action` · `target_uid` · `old_value` · `new_value` · `reason` · `created_at` | `id` · `admin_uid` · `action` · `target_uid` · `old_value` · `new_value` · `reason` · `created_at` | `none` | `n/a` | `docs/specs/02-web-admin/26_admin_dashboard.md` |

**3. Which contracts, and who calls them?**

It reaches no contract — every value is local, a prop, or device state.

**4. What gate, role or entitlement stands in front of it?**

session `admin` — An /admin/** page: classifyRoute returns "admin" for any pathname starting with /admin/, and "admin" is the profiles.is_admin flag checked in-predicate — there is no admin Postgres role. · RLS class `UNRESEARCHED` · entitlement `none`

**5. What archetype, and why that one?**

`FORM` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/02-web-admin/126_maxbld_surface_standard.md`](../../../docs/specs/02-web-admin/126_maxbld_surface_standard.md) · anchors: `docs/specs/02-web-admin/126_maxbld_surface_standard.md §2.2 group D — admin_placements FORM (gen, NEW)` · `docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3 row 5 — placements: the closed placement vocabulary — where a SLOT may render` · `docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3 row 6 — offers: the inventory a SLOT renders, a table and never a literal` · `docs/specs/02-web-admin/126_maxbld_surface_standard.md §3.1 row 9 — the SLOT profile this form populates (placement, inventory_source, targeting, disclosure, max_slots)` · `docs/specs/02-web-admin/128_surface_standard_policy.md §5 R-17 / R-34 — ad policy is a checks[] entry and the placements table, never plausibility[]` · `docs/reports/2026-09-15-spec126-admin-best-in-class.md §1.1 row 14`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 4 entr(ies) in feature `F04`. Removing it deletes 1 owned component(s): `src/features/admin-registry/components/PlacementForm.tsx`. It is the ONLY reader or writer of `placements` — removing it orphans that table.

---

<a id="card-s-017"></a>

## Card 10 — `S-017` `advertiser_self_metrics`

Registry detail: [`S-017`](../../../docs/reports/generated/127-surface-registry.md#s-017) `advertiser_self_metrics`.

`SURFACE` · `DASHBOARD` · scope `parcel_admin` · feature `F04` sponsor-placements · build order 2043 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

A dashboard an advertiser logs into to see how their own sponsored placements performed — how many times their offer was shown and how many times someone clicked it. It shows only their own numbers and no one else's, enforced by the database rather than by the page. This is the first screen in the estate handed to someone who is not an internal admin, which is why it is scoped by the advertiser's own identity instead of the admin flag.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `usage_events` **(net-new)** | `event_id` · `user_id` · `session_id` · `product` · `event` · `subject_kind` · `subject_key` · `occurred_at` · `meta` | _does not exist yet_ | `none` | `n/a` | `docs/specs/02-web-admin/126_maxbld_surface_standard.md §7` |
| reads | `offers` **(net-new)** | `offer_id` · `advertiser_id` · `placement_key` · `targeting` · `flight_start` · `flight_end` · `active` | _does not exist yet_ | `none` | `n/a` | `docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3 row 6` |
| reads | `advertisers` **(net-new)** | `advertiser_id` · `name` · `contact_user_id` · `active` | _does not exist yet_ | `none` | `n/a` | `docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3 row 4` |

**3. Which contracts, and who calls them?**

It reaches no contract — every value is local, a prop, or device state.

**4. What gate, role or entitlement stands in front of it?**

session `UNRESEARCHED` — DECISION NEEDED (Spec 126 / the schema vocabulary): this is "the first non-admin principal ever admitted to an admin-shaped surface" (Spec 126 §2.2 group D) and its principal is the `advertiser` ROLE — but guards.session is closed to anon | authenticated | entitled | admin. "authenticated" would be true and useless (it is what lets any signed-in user in); "entitled" is wrong by construction, because R-09 rules that an entitlement is what agent gets and R-10 rules that advertiser is a real ROLE and not an entitlement; "admin" is explicitly wrong — the report says RLS-scoped, NOT is_admin-gated. Either guards.session gains an `advertiser` value or the vocabulary must say how a Class-D principal is expressed. · RLS class `D` · entitlement `none`

**5. What archetype, and why that one?**

`DASHBOARD` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/02-web-admin/126_maxbld_surface_standard.md`](../../../docs/specs/02-web-admin/126_maxbld_surface_standard.md) · anchors: `docs/specs/02-web-admin/126_maxbld_surface_standard.md §2.2 group D — advertiser_self_metrics DASHBOARD (gen, NEW; role advertiser, RLS-scoped, NOT is_admin-gated)` · `docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.2 — advertiser is a real role and the reason a fourth class must exist (R-10)` · `docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3 rows 2, 4, 6 — usage_events, advertisers, offers` · `docs/specs/02-web-admin/126_maxbld_surface_standard.md §7 — the usage ledger; impressions are counted per event, not deduped` · `docs/specs/02-web-admin/126_maxbld_surface_standard.md §7.1 — the one anon write in the estate, narrowed to offer_impression` · `docs/specs/00-architecture/114_rls_policy_catalog.md §2 amendment 2026-09-15 — Class D` · `docs/reports/2026-09-15-spec126-admin-best-in-class.md §1.1 row 15 · §4`

**8. What is still unresearched?**

**4 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 4 entr(ies) in feature `F04`. Removing it deletes 1 owned component(s): `src/features/admin-registry/components/AdvertiserMetricsTiles.tsx`. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-010"></a>

## Card 11 — `S-010` `admin_ledger_visualiser`

Registry detail: [`S-010`](../../../docs/reports/generated/127-surface-registry.md#s-010) `admin_ledger_visualiser`.

`SURFACE` · `REPORT` · scope `parcel_admin` · feature `F07` app-outputs-materialisation · build order 2073 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

A diagram that traces any number a user sees back to the pipeline step that produced it and the exact run that last wrote it. When someone asks 'where did this figure come from and how old is it', this is the page that answers without a developer. It joins the pipeline's governed steps to the screens that render their output, pinned to the version of the step that ran.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `pipeline_runs` | `id` · `pipeline` · `started_at` · `completed_at` · `status` · `records_total` · `records_new` · `records_updated` · `error_message` · `duration_ms` · `records_meta` | `id` · `pipeline` · `started_at` · `completed_at` · `status` · `records_total` · `records_new` · `records_updated` · `error_message` · `duration_ms` · `records_meta` | `(every chain step — the Spec 47 SDK run ledger writes one row per run, so there is no single named producer)` | `n/a — written by the SDK around every step in every chain` | `docs/specs/01-pipeline/48_pipeline_observability.md` |
| reads | `app_outputs` **(net-new)** | `subject_kind` · `subject_key` · `projection` · `version` · `payload` · `built_at` · `source_fingerprint` · `pipeline_run_id` | _does not exist yet_ | `materialize_app_outputs` | `sources[END] — DESIGNED. Spec 126 §6.3.1 rules the step runs at the END of chain `sources`, after enrichment, so the projection is never built from a half-enriched corpus. No slot is claimed: scripts/manifest.json chains.sources holds 28 steps today and none of them is this one; registering it is Backend/Pipeline work, explicitly out of Spec 126 §14 Target Files.` | `docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3.1` |
| reads | `usage_events` **(net-new)** | `event_id` · `user_id` · `session_id` · `product` · `event` · `subject_kind` · `subject_key` · `occurred_at` · `meta` | _does not exist yet_ | `none` | `n/a` | `docs/specs/02-web-admin/126_maxbld_surface_standard.md §7` |

**3. Which contracts, and who calls them?**

It reaches no contract — every value is local, a prop, or device state.

**4. What gate, role or entitlement stands in front of it?**

session `admin` — An /admin/** page: classifyRoute returns "admin" for any pathname starting with /admin/, and "admin" is the profiles.is_admin flag checked in-predicate — there is no admin Postgres role. · RLS class `B` · entitlement `none`

**5. What archetype, and why that one?**

`REPORT` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/02-web-admin/126_maxbld_surface_standard.md`](../../../docs/specs/02-web-admin/126_maxbld_surface_standard.md) · anchors: `docs/specs/02-web-admin/126_maxbld_surface_standard.md §2.2 group F — admin_ledger_visualiser REPORT (100% gen)` · `docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3.1 — app_outputs, written by a converted pipeline step at the END of chain sources` · `docs/specs/02-web-admin/126_maxbld_surface_standard.md §2.2.1 P10 — time-travel is the ledger: pipeline_runs + usage_events + admin_audit_log, all append-only` · `docs/specs/02-web-admin/126_maxbld_surface_standard.md §10 — observability and visualisation` · `docs/reports/2026-09-15-spec126-admin-best-in-class.md §1.1 row 22 · §3.2 — "the one genuinely new join", verdict BUILD`

**8. What is still unresearched?**

**1 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 2 entr(ies) in feature `F07`. Removing it deletes 1 owned component(s): `src/features/admin-registry/components/LedgerSeamGraph.tsx`. It is the ONLY reader or writer of `app_outputs` — removing it orphans that table.

---

<a id="card-s-015"></a>

## Card 12 — `S-015` `admin_run_ledger`

Registry detail: [`S-015`](../../../docs/reports/generated/127-surface-registry.md#s-015) `admin_run_ledger`.

`SURFACE` · `LIST` · scope `parcel_admin` · feature `F07` app-outputs-materialisation · build order 2073 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

A single scrollable list of every pipeline run the system has recorded — what ran, when, whether it finished, and the per-run detail the pipeline itself wrote into its records_meta summary. Operators use it to answer 'did the nightly work actually happen, and what did it do' without opening a database client. It also covers the older sync_runs ledger, so the two histories read as one timeline.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `pipeline_runs` | `id` · `pipeline` · `started_at` · `completed_at` · `status` · `records_total` · `records_new` · `records_updated` · `error_message` · `duration_ms` · `records_meta` | `id` · `pipeline` · `started_at` · `completed_at` · `status` · `records_total` · `records_new` · `records_updated` · `error_message` · `duration_ms` · `records_meta` | `(every chain step — the Spec 47 SDK run ledger writes one row per run, so there is no single named producer)` | `n/a — written by the SDK around every step in every chain` | `docs/specs/01-pipeline/48_pipeline_observability.md` |
| reads | `sync_runs` | `id` · `started_at` · `completed_at` · `status` · `records_total` · `records_new` · `records_updated` · `records_unchanged` · `records_errors` · `error_message` · `snapshot_path` · `duration_ms` | `id` · `started_at` · `completed_at` · `status` · `records_total` · `records_new` · `records_updated` · `records_unchanged` · `records_errors` · `error_message` · `snapshot_path` · `duration_ms` | `permits` | `permits[1]` | `docs/specs/01-pipeline/48_pipeline_observability.md` |

**3. Which contracts, and who calls them?**

Calls 2: `/api/admin/pipelines/history` · `/api/admin/pipelines/runs`

**4. What gate, role or entitlement stands in front of it?**

session `admin` — An /admin/** page: classifyRoute returns "admin" for any pathname starting with /admin/, and "admin" is the profiles.is_admin flag checked in-predicate — there is no admin Postgres role. · RLS class `B` · entitlement `none`

**5. What archetype, and why that one?**

`LIST` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/02-web-admin/126_maxbld_surface_standard.md`](../../../docs/specs/02-web-admin/126_maxbld_surface_standard.md) · anchors: `docs/specs/02-web-admin/126_maxbld_surface_standard.md §2.2 group A — admin_run_ledger LIST (gen, NEW)` · `docs/specs/02-web-admin/126_maxbld_surface_standard.md §2.2.1 P10 — time-travel is the ledger (pipeline_runs + usage_events + admin_audit_log), not a snapshot table` · `docs/reports/2026-09-15-spec126-admin-best-in-class.md §1.1 row 5 · §3.1 — pipeline_runs (incl. records_meta) must be rendered UNMODIFIED` · `docs/specs/01-pipeline/48_pipeline_observability.md §3.6 — the records_meta producer/consumer contract`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 2 entr(ies) in feature `F07`. Removing it deletes 1 owned component(s): `src/features/admin-registry/components/RunLedgerTable.tsx`. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-c-002"></a>

## Card 13 — `C-002` `contract_admin_parcels_lookup`

Registry detail: [`C-002`](../../../docs/reports/generated/127-surface-registry.md#c-002) `contract_admin_parcels_lookup`.

`CONTRACT` · `QUERY` · scope `parcel_admin` · feature `F08` admin-parcel-operations · build order 2082 · batch B1 · **review: `unreviewed`**

**1. What does it do, and for whom?**

Lets an admin look up one property by address or internal ID and see everything the system has calculated about it — zoning limits, buildable size, renovation and addition cost estimates, and nearby comparable committee-of-adjustment decisions. This is the data behind the admin Parcel Cost Model Tool.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `address_points` | `address_point_id` · `address_full` · `linear_name_normalized` · `addr_num_normalized` · `address_status` · `maint_stage` | `address_point_id` · `latitude` · `longitude` · `address_number` · `linear_name_full` · `address_full` · `lo_num` · `hi_num` · `maint_stage` · `address_status` · `address_class_desc` · `class_family_desc` · `place_name` · `addr_num_normalized` · `linear_name_normalized` · `geom` | `address_points` | `sources[2]` | `docs/specs/01-pipeline/43_chain_sources.md` |
| reads | `coa_applications` | `application_number` · `address` · `status` · `decision` · `decision_date` · `hearing_date` · `description` · `project_type` · `modeled_gfa_sqm` · `estimated_cost` · `neighbourhood_id` | `id` · `application_number` · `address` · `street_num` · `street_name` · `ward` · `status` · `decision` · `decision_date` · `hearing_date` · `description` · `applicant` · `linked_permit_num` · `linked_confidence` · `data_hash` · `first_seen_at` · `last_seen_at` · `sub_type` · `street_name_normalized` · `lifecycle_phase` · `lifecycle_classified_at` · `lifecycle_stalled` · `lead_id` · `coa_type_class` · `project_type` · `scope_tags` · `scope_classified_at` · `scope_source` · `structure_type` · `neighbourhood_id` · `latitude` · `longitude` · `modeled_gfa_sqm` · `estimated_cost` · `cost_source` · `cost_classified_at` · `lifecycle_seq` · `lifecycle_group` · `lifecycle_block` · `lifecycle_stage` · `bid_value` · `parcel_linked_at` · `trade_classified_at` · `matched_status` · `matched_rule` · `unmapped_status` · `unmapped_decision` · `zoning_class` · `bylaw_max_coverage_pct` · `bylaw_max_fsi` · `bylaw_max_height_m` · `exception_number` · `variance_context` · `zoning_parcel_count` · `zoning_dominant_parcel_id` · `zoning_dominant_parcel_method` · `zoning_enriched_at` · `is_in_ravine_protection_area` · `ravine_distance_m` · `is_heritage_designated` · `heritage_designation_type` · `heritage_designation_date` · `is_corner_lot` · `is_through_lot` · `primary_frontage_street_name` · `lot_size_sqm` · `frontage_m` · `depth_m` · `lot_size_confidence` · `lot_size_basis` · `max_build_setback_basis` · `max_buildable_footprint_sqm` · `max_build_width_m` · `max_build_length_m` · `max_build_height_m` · `max_build_stories` · `max_build_basis` · `max_buildable_gfa_sqm` · `max_buildable_gfa_basis` · `max_build_confidence` · `max_garden_suite_gfa_sqm` · `garden_suite_fits` · `envelope_constrained` · `envelope_constraint_reason` · `imagery_roof_footprint_sqm` · `existing_stories` · `existing_height_m` · `imagery_roof_gfa_sqm` · `existing_width_m` · `existing_length_m` · `existing_structure_confidence` · `existing_other_structures_count` · `existing_other_structures_sqm` · `existing_greenspace_sqm` · `max_newbuild_coa_gfa_sqm` · `cur_basement_gfa_sqm` · `cur_storey_gfa_sqm` · `cur_interior_reno_gfa_sqm` · `cur_est_kitchen_gfa_sqm` · `cur_est_bath_gfa_sqm` · `max_build_stories_basis` · `abuts_laneway` · `max_garage_gfa_sqm` · `garage_capacity_cars` · `garage_constraint_reason` · `garage_permission` · `max_laneway_suite_gfa_sqm` · `max_rear_suite_gfa_sqm` · `rear_suite_type` · `rear_suite_permission` · `cur_floor_gfa_sqm` · `cur_pot_2story_gfa_sqm` · `cur_pot_3story_gfa_sqm` · `cur_gfa_range_basis` · `existing_data_quality_flag` · `max_build_stories_aggressive` · `market_exceeds_bylaw` · `neighbourhood_cost_premium` · `opt_aor_storeys` · `opt_aor_gfa_sqm` · `opt_aor_units` · `opt_coa_storeys` · `opt_coa_gfa_sqm` · `opt_suite_type` · `opt_suite_fits_full` · `opt_binding_constraint` · `opt_config_confidence` · `comp_count` · `comp_dominant_build` · `comp_build_ratio_p50` · `comp_fsi_p50` · `cost_fb_total` · `cost_coa_total` · `cost_solar_total` · `cost_garden_suite_total` · `cost_laneway_suite_total` · `cost_garage_total` · `cost_gut_total` · `cost_addition_total` · `cost_kitchen_per_sqm` · `cost_bath_per_sqm` · `cost_basement_per_sqm` · `cost_basement_underpin_per_sqm` · `max_build_fsi` · `coa_fsi` · `realized_fsi_p90` | `classify_coa_scope` · `classify_coa_trades` · `classify_lifecycle_phase` · `coa` · `compute_coa_cost_estimates` · `enrich_coa_zoning` · `link_coa` · `link_coa_to_parcels` | `coa[5] · coa[6] · permits[23], coa[12] · coa[1] · coa[7] · coa[4] · permits[19], coa[8] · coa[3]` | `docs/specs/01-pipeline/42_chain_coa.md` |
| reads | `parcel_address_points` | `address_point_id` · `parcel_id` | `parcel_id` · `address_point_id` · `computed_at` | `link_parcel_addresses` | `sources[8]` | `docs/specs/01-pipeline/54_source_address_points.md` |
| reads | `parcels` | `parcel_id` · `addr_num_normalized` · `street_name_normalized` · `address_number` · `linear_name_full` · `parcel_cost_menu` · `cost_fb_total` · `cost_coa_total` · `cost_solar_total` · `cost_garden_suite_total` · `cost_laneway_suite_total` · `cost_garage_total` · `cost_gut_total` · `cost_addition_total` · `cost_kitchen_per_sqm` · `cost_bath_per_sqm` · `cost_basement_per_sqm` · `cost_basement_underpin_per_sqm` · `lot_size_sqm` · `lot_size_sqft` · `opt_aor_gfa_sqm` · `opt_aor_storeys` · `opt_coa_gfa_sqm` · `opt_coa_storeys` · `max_buildable_gfa_sqm` · `max_buildable_footprint_sqm` · `imagery_roof_gfa_sqm` · `imagery_roof_footprint_sqm` · `cur_floor_gfa_sqm` · `max_newbuild_coa_gfa_sqm` · `nearby_builds_summary` · `comparable_builds` · `comp_count` · `comp_dominant_build` · `comp_build_ratio_p50` · `comp_fsi_p50` · `neighbourhood_id` · `neighbourhood_cost_premium` · `id` · `feature_type` · `date_effective` · `date_expiry` · `created_at` · `centroid_lat` · `centroid_lng` · `is_irregular` · `street_type_normalized` · `stated_area_raw` · `frontage_m` · `frontage_ft` · `depth_m` · `depth_ft` · `lot_size_confidence` · `lot_size_basis` · `lot_size_source` · `zoning_class` · `zoning_zn_string` · `zoning_gen_zone` · `zoning_holding` · `zone_status` · `bylaw_max_fsi` · `bylaw_max_coverage_pct` · `bylaw_max_height_m` · `bylaw_max_stories` · `bylaw_max_units` · `bylaw_max_density` · `bylaw_min_frontage_m` · `bylaw_min_area_sqm` · `bylaw_standard_setback_m` · `bylaw_pct_commercial_max` · `bylaw_pct_residential_max` · `bylaw_pct_employment_max` · `bylaw_pct_office_max` · `exception_number` · `exception_text` · `bylaw_chapter` · `bylaw_section` · `bylaw_exception_ref` · `in_policy_area` · `on_policy_road` · `in_rooming_house_overlay` · `in_parking_zone_overlay` · `in_building_setback_overlay` · `on_priority_retail` · `in_queenstw_eat_overlay` · `zoning_overlays` · `zoning_base_source_id` · `zoning_dominant_area_share` · `zoning_is_ambiguous` · `zoning_base_source_dataset_version` · `zoning_enriched_at` · `is_in_ravine_protection_area` · `ravine_distance_m` · `ravine_dataset_version_when_enriched` · `is_heritage_designated` · `heritage_designation_type` · `heritage_designation_date` · `heritage_dataset_version_when_enriched` · `is_corner_lot` · `is_through_lot` · `primary_frontage_street_name` · `centreline_dataset_version_when_enriched` · `abuts_laneway` · `existing_stories` · `existing_height_m` · `existing_width_m` · `existing_length_m` · `existing_structure_confidence` · `existing_other_structures_count` · `existing_other_structures_sqm` · `existing_greenspace_sqm` · `existing_data_quality_flag` · `cur_gfa_low_sqm` · `cur_gfa_high_sqm` · `cur_storeys_range` · `cur_gfa_band_basis` · `max_build_setback_basis` · `max_build_width_m` · `max_build_length_m` · `max_build_height_m` · `max_build_stories` · `max_build_basis` · `max_buildable_gfa_basis` · `max_build_confidence` · `envelope_constrained` · `envelope_constraint_reason` · `max_build_stories_basis` · `max_build_stories_aggressive` · `market_exceeds_bylaw` · `max_build_fsi` · `coa_fsi` · `realized_fsi_p90` · `massing_enriched_at` · `cur_basement_gfa_sqm` · `cur_storey_gfa_sqm` · `cur_interior_reno_gfa_sqm` · `cur_est_kitchen_gfa_sqm` · `cur_est_bath_gfa_sqm` · `cur_pot_2story_gfa_sqm` · `cur_pot_3story_gfa_sqm` · `cur_gfa_range_basis` · `garden_suite_fits` · `max_garden_suite_gfa_sqm` · `max_garage_gfa_sqm` · `garage_capacity_cars` · `garage_constraint_reason` · `garage_permission` · `max_laneway_suite_gfa_sqm` · `max_rear_suite_gfa_sqm` · `rear_suite_type` · `rear_suite_permission` · `opt_aor_units` · `opt_suite_type` · `opt_suite_fits_full` · `opt_binding_constraint` · `opt_config_confidence` · `optimal_config` | `id` · `parcel_id` · `feature_type` · `address_number` · `linear_name_full` · `addr_num_normalized` · `street_name_normalized` · `street_type_normalized` · `stated_area_raw` · `lot_size_sqm` · `lot_size_sqft` · `frontage_m` · `frontage_ft` · `depth_m` · `depth_ft` · `geometry` · `date_effective` · `date_expiry` · `created_at` · `centroid_lat` · `centroid_lng` · `is_irregular` · `geom` · `zoning_class` · `zoning_zn_string` · `zoning_gen_zone` · `zoning_holding` · `zone_status` · `bylaw_max_fsi` · `bylaw_max_coverage_pct` · `bylaw_max_height_m` · `bylaw_max_stories` · `bylaw_max_units` · `bylaw_max_density` · `bylaw_min_frontage_m` · `bylaw_min_area_sqm` · `bylaw_standard_setback_m` · `bylaw_pct_commercial_max` · `bylaw_pct_residential_max` · `bylaw_pct_employment_max` · `bylaw_pct_office_max` · `exception_number` · `exception_text` · `bylaw_chapter` · `bylaw_section` · `bylaw_exception_ref` · `in_policy_area` · `on_policy_road` · `in_rooming_house_overlay` · `in_parking_zone_overlay` · `in_building_setback_overlay` · `on_priority_retail` · `in_queenstw_eat_overlay` · `zoning_overlays` · `zoning_base_source_id` · `zoning_dominant_area_share` · `zoning_is_ambiguous` · `zoning_base_source_dataset_version` · `zoning_enriched_at` · `is_in_ravine_protection_area` · `ravine_distance_m` · `ravine_dataset_version_when_enriched` · `is_heritage_designated` · `heritage_designation_type` · `heritage_designation_date` · `heritage_dataset_version_when_enriched` · `is_corner_lot` · `is_through_lot` · `primary_frontage_street_name` · `centreline_dataset_version_when_enriched` · `lot_size_confidence` · `lot_size_basis` · `max_build_setback_basis` · `max_buildable_footprint_sqm` · `max_build_width_m` · `max_build_length_m` · `max_build_height_m` · `max_build_stories` · `max_build_basis` · `max_buildable_gfa_sqm` · `max_buildable_gfa_basis` · `max_build_confidence` · `max_garden_suite_gfa_sqm` · `garden_suite_fits` · `envelope_constrained` · `envelope_constraint_reason` · `imagery_roof_footprint_sqm` · `existing_stories` · `existing_height_m` · `imagery_roof_gfa_sqm` · `existing_width_m` · `existing_length_m` · `existing_structure_confidence` · `existing_other_structures_count` · `existing_other_structures_sqm` · `existing_greenspace_sqm` · `max_newbuild_coa_gfa_sqm` · `cur_basement_gfa_sqm` · `cur_storey_gfa_sqm` · `cur_interior_reno_gfa_sqm` · `cur_est_kitchen_gfa_sqm` · `cur_est_bath_gfa_sqm` · `max_build_stories_basis` · `abuts_laneway` · `max_garage_gfa_sqm` · `garage_capacity_cars` · `garage_constraint_reason` · `garage_permission` · `max_laneway_suite_gfa_sqm` · `max_rear_suite_gfa_sqm` · `rear_suite_type` · `rear_suite_permission` · `cur_floor_gfa_sqm` · `cur_pot_2story_gfa_sqm` · `cur_pot_3story_gfa_sqm` · `cur_gfa_range_basis` · `existing_data_quality_flag` · `max_build_stories_aggressive` · `market_exceeds_bylaw` · `neighbourhood_id` · `neighbourhood_cost_premium` · `opt_aor_storeys` · `opt_aor_gfa_sqm` · `opt_aor_units` · `opt_coa_storeys` · `opt_coa_gfa_sqm` · `opt_suite_type` · `opt_suite_fits_full` · `opt_binding_constraint` · `opt_config_confidence` · `optimal_config` · `nearby_builds_summary` · `comparable_builds` · `comp_count` · `comp_dominant_build` · `comp_build_ratio_p50` · `comp_fsi_p50` · `cur_gfa_low_sqm` · `cur_gfa_high_sqm` · `cur_storeys_range` · `cur_gfa_band_basis` · `parcel_cost_menu` · `cost_fb_total` · `cost_coa_total` · `cost_solar_total` · `cost_garden_suite_total` · `cost_laneway_suite_total` · `cost_garage_total` · `cost_gut_total` · `cost_addition_total` · `cost_kitchen_per_sqm` · `cost_bath_per_sqm` · `cost_basement_per_sqm` · `cost_basement_underpin_per_sqm` · `max_build_fsi` · `coa_fsi` · `realized_fsi_p90` · `lot_size_source` | `compute_centroids` · `compute_parcel_cost_estimates` · `enrich_centreline` · `enrich_heritage` · `enrich_parcels` · `enrich_ravines` · `parcels` | `sources[9] · sources[22] · sources[13] · sources[12] · sources[21] · sources[11] · sources[4]` | `docs/specs/01-pipeline/43_chain_sources.md` |
| reads | `profiles` | `id` · `is_admin` | `id` · `is_admin` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/114_rls_policy_catalog.md` |

**3. Which contracts, and who calls them?**

Called by 1: `src/features/admin-flight-center/api/useParcelLookup.ts`

**4. What gate, role or entitlement stands in front of it?**

session `admin` — classifyRoute("/api/admin/parcels/lookup") returns "admin" (executed 2026-09-15); the handler re-verifies the caller in-process. · RLS class `C` · entitlement `none`

**5. What archetype, and why that one?**

`QUERY` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/02-web-admin/89_parcel_cost_model_tool.md`](../../../docs/specs/02-web-admin/89_parcel_cost_model_tool.md) · anchors: `docs/specs/02-web-admin/89_parcel_cost_model_tool.md §3 (API) at src/app/api/admin/parcels/lookup/route.ts:1; docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §5 + §12 + §13 at :2`

**8. What is still unresearched?**

**1 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 2 entr(ies) in feature `F08`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-012"></a>

## Card 14 — `S-012` `admin_parcel_cost`

Registry detail: [`S-012`](../../../docs/reports/generated/127-surface-registry.md#s-012) `admin_parcel_cost`.

`SURFACE` · `SEARCH` · scope `parcel_admin` · feature `F08` admin-parcel-operations · build order 2083 · batch B1 · **review: `unreviewed`**

**1. What does it do, and for whom?**

Search any Toronto address and see everything the system knows about that property, in a fixed three-tier order: first the renovation cost menu and headline areas, then the neighbourhood picture including nearby projects awaiting a committee decision and comparable buildings, then nine collapsed groups holding every remaining field. If the address matches several parcels it offers the candidates to choose from. It only displays stored values - it calculates nothing itself - and is the operator prototype of a future consumer-facing property screen.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `parcels` | `parcel_id` · `id` · `address_number` · `linear_name_full` · `addr_num_normalized` · `street_name_normalized` · `parcel_cost_menu` | `id` · `parcel_id` · `feature_type` · `address_number` · `linear_name_full` · `addr_num_normalized` · `street_name_normalized` · `street_type_normalized` · `stated_area_raw` · `lot_size_sqm` · `lot_size_sqft` · `frontage_m` · `frontage_ft` · `depth_m` · `depth_ft` · `geometry` · `date_effective` · `date_expiry` · `created_at` · `centroid_lat` · `centroid_lng` · `is_irregular` · `geom` · `zoning_class` · `zoning_zn_string` · `zoning_gen_zone` · `zoning_holding` · `zone_status` · `bylaw_max_fsi` · `bylaw_max_coverage_pct` · `bylaw_max_height_m` · `bylaw_max_stories` · `bylaw_max_units` · `bylaw_max_density` · `bylaw_min_frontage_m` · `bylaw_min_area_sqm` · `bylaw_standard_setback_m` · `bylaw_pct_commercial_max` · `bylaw_pct_residential_max` · `bylaw_pct_employment_max` · `bylaw_pct_office_max` · `exception_number` · `exception_text` · `bylaw_chapter` · `bylaw_section` · `bylaw_exception_ref` · `in_policy_area` · `on_policy_road` · `in_rooming_house_overlay` · `in_parking_zone_overlay` · `in_building_setback_overlay` · `on_priority_retail` · `in_queenstw_eat_overlay` · `zoning_overlays` · `zoning_base_source_id` · `zoning_dominant_area_share` · `zoning_is_ambiguous` · `zoning_base_source_dataset_version` · `zoning_enriched_at` · `is_in_ravine_protection_area` · `ravine_distance_m` · `ravine_dataset_version_when_enriched` · `is_heritage_designated` · `heritage_designation_type` · `heritage_designation_date` · `heritage_dataset_version_when_enriched` · `is_corner_lot` · `is_through_lot` · `primary_frontage_street_name` · `centreline_dataset_version_when_enriched` · `lot_size_confidence` · `lot_size_basis` · `max_build_setback_basis` · `max_buildable_footprint_sqm` · `max_build_width_m` · `max_build_length_m` · `max_build_height_m` · `max_build_stories` · `max_build_basis` · `max_buildable_gfa_sqm` · `max_buildable_gfa_basis` · `max_build_confidence` · `max_garden_suite_gfa_sqm` · `garden_suite_fits` · `envelope_constrained` · `envelope_constraint_reason` · `imagery_roof_footprint_sqm` · `existing_stories` · `existing_height_m` · `imagery_roof_gfa_sqm` · `existing_width_m` · `existing_length_m` · `existing_structure_confidence` · `existing_other_structures_count` · `existing_other_structures_sqm` · `existing_greenspace_sqm` · `max_newbuild_coa_gfa_sqm` · `cur_basement_gfa_sqm` · `cur_storey_gfa_sqm` · `cur_interior_reno_gfa_sqm` · `cur_est_kitchen_gfa_sqm` · `cur_est_bath_gfa_sqm` · `max_build_stories_basis` · `abuts_laneway` · `max_garage_gfa_sqm` · `garage_capacity_cars` · `garage_constraint_reason` · `garage_permission` · `max_laneway_suite_gfa_sqm` · `max_rear_suite_gfa_sqm` · `rear_suite_type` · `rear_suite_permission` · `cur_floor_gfa_sqm` · `cur_pot_2story_gfa_sqm` · `cur_pot_3story_gfa_sqm` · `cur_gfa_range_basis` · `existing_data_quality_flag` · `max_build_stories_aggressive` · `market_exceeds_bylaw` · `neighbourhood_id` · `neighbourhood_cost_premium` · `opt_aor_storeys` · `opt_aor_gfa_sqm` · `opt_aor_units` · `opt_coa_storeys` · `opt_coa_gfa_sqm` · `opt_suite_type` · `opt_suite_fits_full` · `opt_binding_constraint` · `opt_config_confidence` · `optimal_config` · `nearby_builds_summary` · `comparable_builds` · `comp_count` · `comp_dominant_build` · `comp_build_ratio_p50` · `comp_fsi_p50` · `cur_gfa_low_sqm` · `cur_gfa_high_sqm` · `cur_storeys_range` · `cur_gfa_band_basis` · `parcel_cost_menu` · `cost_fb_total` · `cost_coa_total` · `cost_solar_total` · `cost_garden_suite_total` · `cost_laneway_suite_total` · `cost_garage_total` · `cost_gut_total` · `cost_addition_total` · `cost_kitchen_per_sqm` · `cost_bath_per_sqm` · `cost_basement_per_sqm` · `cost_basement_underpin_per_sqm` · `max_build_fsi` · `coa_fsi` · `realized_fsi_p90` · `lot_size_source` | `parcels` · `enrich_parcels` · `compute_centroids` · `compute_parcel_cost_estimates` · `enrich_heritage` · `enrich_ravines` · `enrich_centreline` | `sources[4]` | `docs/specs/01-pipeline/43_chain_sources.md` |
| reads | `address_points` | `address_full` · `address_point_id` · `linear_name_normalized` · `addr_num_normalized` · `address_status` · `maint_stage` | `address_point_id` · `latitude` · `longitude` · `address_number` · `linear_name_full` · `address_full` · `lo_num` · `hi_num` · `maint_stage` · `address_status` · `address_class_desc` · `class_family_desc` · `place_name` · `addr_num_normalized` · `linear_name_normalized` · `geom` | `address_points` | `sources[2]` | `docs/specs/01-pipeline/54_source_address_points.md` |
| reads | `parcel_address_points` | `address_point_id` · `parcel_id` | `parcel_id` · `address_point_id` · `computed_at` | `link_parcel_addresses` | `sources[8]` | `docs/specs/01-pipeline/54_source_address_points.md` |
| reads | `coa_applications` | `application_number` · `address` · `status` · `decision` · `decision_date` · `hearing_date` · `description` · `project_type` · `modeled_gfa_sqm` · `estimated_cost` · `neighbourhood_id` | `id` · `application_number` · `address` · `street_num` · `street_name` · `ward` · `status` · `decision` · `decision_date` · `hearing_date` · `description` · `applicant` · `linked_permit_num` · `linked_confidence` · `data_hash` · `first_seen_at` · `last_seen_at` · `sub_type` · `street_name_normalized` · `lifecycle_phase` · `lifecycle_classified_at` · `lifecycle_stalled` · `lead_id` · `coa_type_class` · `project_type` · `scope_tags` · `scope_classified_at` · `scope_source` · `structure_type` · `neighbourhood_id` · `latitude` · `longitude` · `modeled_gfa_sqm` · `estimated_cost` · `cost_source` · `cost_classified_at` · `lifecycle_seq` · `lifecycle_group` · `lifecycle_block` · `lifecycle_stage` · `bid_value` · `parcel_linked_at` · `trade_classified_at` · `matched_status` · `matched_rule` · `unmapped_status` · `unmapped_decision` · `zoning_class` · `bylaw_max_coverage_pct` · `bylaw_max_fsi` · `bylaw_max_height_m` · `exception_number` · `variance_context` · `zoning_parcel_count` · `zoning_dominant_parcel_id` · `zoning_dominant_parcel_method` · `zoning_enriched_at` · `is_in_ravine_protection_area` · `ravine_distance_m` · `is_heritage_designated` · `heritage_designation_type` · `heritage_designation_date` · `is_corner_lot` · `is_through_lot` · `primary_frontage_street_name` · `lot_size_sqm` · `frontage_m` · `depth_m` · `lot_size_confidence` · `lot_size_basis` · `max_build_setback_basis` · `max_buildable_footprint_sqm` · `max_build_width_m` · `max_build_length_m` · `max_build_height_m` · `max_build_stories` · `max_build_basis` · `max_buildable_gfa_sqm` · `max_buildable_gfa_basis` · `max_build_confidence` · `max_garden_suite_gfa_sqm` · `garden_suite_fits` · `envelope_constrained` · `envelope_constraint_reason` · `imagery_roof_footprint_sqm` · `existing_stories` · `existing_height_m` · `imagery_roof_gfa_sqm` · `existing_width_m` · `existing_length_m` · `existing_structure_confidence` · `existing_other_structures_count` · `existing_other_structures_sqm` · `existing_greenspace_sqm` · `max_newbuild_coa_gfa_sqm` · `cur_basement_gfa_sqm` · `cur_storey_gfa_sqm` · `cur_interior_reno_gfa_sqm` · `cur_est_kitchen_gfa_sqm` · `cur_est_bath_gfa_sqm` · `max_build_stories_basis` · `abuts_laneway` · `max_garage_gfa_sqm` · `garage_capacity_cars` · `garage_constraint_reason` · `garage_permission` · `max_laneway_suite_gfa_sqm` · `max_rear_suite_gfa_sqm` · `rear_suite_type` · `rear_suite_permission` · `cur_floor_gfa_sqm` · `cur_pot_2story_gfa_sqm` · `cur_pot_3story_gfa_sqm` · `cur_gfa_range_basis` · `existing_data_quality_flag` · `max_build_stories_aggressive` · `market_exceeds_bylaw` · `neighbourhood_cost_premium` · `opt_aor_storeys` · `opt_aor_gfa_sqm` · `opt_aor_units` · `opt_coa_storeys` · `opt_coa_gfa_sqm` · `opt_suite_type` · `opt_suite_fits_full` · `opt_binding_constraint` · `opt_config_confidence` · `comp_count` · `comp_dominant_build` · `comp_build_ratio_p50` · `comp_fsi_p50` · `cost_fb_total` · `cost_coa_total` · `cost_solar_total` · `cost_garden_suite_total` · `cost_laneway_suite_total` · `cost_garage_total` · `cost_gut_total` · `cost_addition_total` · `cost_kitchen_per_sqm` · `cost_bath_per_sqm` · `cost_basement_per_sqm` · `cost_basement_underpin_per_sqm` · `max_build_fsi` · `coa_fsi` · `realized_fsi_p90` | `coa` · `link_coa` · `classify_coa_scope` · `compute_coa_cost_estimates` | `coa[1]` | `docs/specs/01-pipeline/42_chain_coa.md` |
| reads | `profiles` | `is_admin` | `id` · `is_admin` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/114_rls_policy_catalog.md §5` |

**3. Which contracts, and who calls them?**

Calls 1: `/api/admin/parcels/lookup`

**4. What gate, role or entitlement stands in front of it?**

session `admin` — There is no admin Postgres role: classifyRoute sends every /admin/* path down the admin arm, and the real boundary is verifyAdminAuth reading profiles.is_admin on the route. Note the neighbouring consumer prefix /api/parcels classifies as authenticated; this page calls /api/admin/parcels/lookup, which takes the /api/admin/ arm and verifies on its first line. · RLS class `B` · entitlement `none`

**5. What archetype, and why that one?**

`SEARCH` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/02-web-admin/89_parcel_cost_model_tool.md`](../../../docs/specs/02-web-admin/89_parcel_cost_model_tool.md) · anchors: `docs/specs/02-web-admin/89_parcel_cost_model_tool.md §2` · `docs/specs/02-web-admin/89_parcel_cost_model_tool.md §3` · `docs/specs/02-web-admin/89_parcel_cost_model_tool.md §4` · `docs/specs/02-web-admin/89_parcel_cost_model_tool.md §5`

**8. What is still unresearched?**

**3 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 2 entr(ies) in feature `F08`. Removing it deletes 2 owned component(s): `src/components/admin/ParcelCostTool.tsx` · `src/components/admin/GenericFieldRenderer.tsx`. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-007"></a>

## Card 15 — `S-007` `admin_contract_fanout`

Registry detail: [`S-007`](../../../docs/reports/generated/127-surface-registry.md#s-007) `admin_contract_fanout`.

`SURFACE` · `REPORT` · scope `parcel_admin` · feature `F09` surface-registry-drift · build order 2093 · batch B1a · **review: `unreviewed`**

**1. What does it do, and for whom?**

A picture of which screens depend on which APIs, with each connecting line labelled by HOW the screen calls it. When one API is consumed by eleven different screens in two different styles, that is invisible in code review and obvious in this diagram. It is the page that shows an engineer they are about to change something eleven other places rely on.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `contract_descriptors` **(net-new)** | `contract_id` · `archetype` · `descriptor` · `git_sha` · `seeded_at` | _does not exist yet_ | `none` | `n/a` | `docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3` |
| reads | `surface_descriptors` **(net-new)** | `surface_id` · `archetype` · `platforms` · `descriptor` · `git_sha` · `seeded_at` | _does not exist yet_ | `none` | `n/a` | `docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3` |

**3. Which contracts, and who calls them?**

It reaches no contract — every value is local, a prop, or device state.

**4. What gate, role or entitlement stands in front of it?**

session `admin` — An /admin/** page: classifyRoute returns "admin" for any pathname starting with /admin/, and "admin" is the profiles.is_admin flag checked in-predicate, not a Postgres role. · RLS class `B` · entitlement `none`

**5. What archetype, and why that one?**

`REPORT` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/02-web-admin/126_maxbld_surface_standard.md`](../../../docs/specs/02-web-admin/126_maxbld_surface_standard.md) · anchors: `docs/specs/02-web-admin/126_maxbld_surface_standard.md §2.2 group F — admin_contract_fanout REPORT (100% gen)` · `docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3 row 9 — contract_descriptors.descriptor->'consumers' is where the graph's edges live` · `docs/specs/02-web-admin/126_maxbld_surface_standard.md §10 — observability and visualisation` · `docs/reports/2026-09-15-spec126-admin-best-in-class.md §1.1 row 18 · §3.2 (verdict BUILD) · §3.3`

**8. What is still unresearched?**

Nothing — every field is answered with a why and a citation.

**9. What would removing it delete?**

It is 1 of 5 entr(ies) in feature `F09`. Removing it deletes 1 owned component(s): `src/features/admin-registry/components/RegistryGraph.tsx`. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-008"></a>

## Card 16 — `S-008` `admin_drift_status`

Registry detail: [`S-008`](../../../docs/reports/generated/127-surface-registry.md#s-008) `admin_drift_status`.

`SURFACE` · `DASHBOARD` · scope `parcel_admin` · feature `F09` surface-registry-drift · build order 2093 · batch B1a · **review: `unreviewed`**

**1. What does it do, and for whom?**

A board showing the current verdict of every automated consistency check the project already runs — schema drift, contract drift, the system map, the mobile matrix, golden-file freshness. Those checks exist and pass or fail in CI today, but nothing displays the result where an operator would see it. A check nobody reads is a check nobody acts on, and this page is the reader.

**2. Which tables and columns, produced by which step?**

_No table is reached by this entry — every value it shows arrives through a contract, or it shows no server data at all._

**3. Which contracts, and who calls them?**

It reaches no contract — every value is local, a prop, or device state.

**4. What gate, role or entitlement stands in front of it?**

session `admin` — An /admin/** page: classifyRoute returns "admin" for any pathname starting with /admin/, and "admin" is the profiles.is_admin flag checked in-predicate — there is no admin Postgres role. · RLS class `none` · entitlement `none`

**5. What archetype, and why that one?**

`DASHBOARD` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/02-web-admin/126_maxbld_surface_standard.md`](../../../docs/specs/02-web-admin/126_maxbld_surface_standard.md) · anchors: `docs/specs/02-web-admin/126_maxbld_surface_standard.md §2.2 group F — admin_drift_status DASHBOARD (100% gen)` · `docs/specs/02-web-admin/126_maxbld_surface_standard.md §2.2.1 P6 — drift is shown in-product, not only in CI; a checker with no reader is a checker nobody acts on` · `docs/specs/02-web-admin/127_surface_conversion_procedure.md §5 — the fast invariants (no DB, no vitest) this page re-executes` · `docs/reports/2026-09-15-spec126-admin-best-in-class.md §1.1 row 20 · §2 P6`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 5 entr(ies) in feature `F09`. Removing it deletes 1 owned component(s): `src/features/admin-registry/components/DriftTileGrid.tsx`. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-011"></a>

## Card 17 — `S-011` `admin_orphan_panel`

Registry detail: [`S-011`](../../../docs/reports/generated/127-surface-registry.md#s-011) `admin_orphan_panel`.

`SURFACE` · `LIST` · scope `parcel_admin` · feature `F09` surface-registry-drift · build order 2093 · batch B1a · **review: `unreviewed`**

**1. What does it do, and for whom?**

The same screen-to-API map as the fan-out page, inverted: it lists the APIs nothing calls and the screens backed by no declared API. Dead code that still runs, still has tests and still costs money is the thing this page is for. Every row is a decision waiting to be made — keep it and wire it up, or delete it.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `contract_descriptors` **(net-new)** | `contract_id` · `archetype` · `descriptor` · `git_sha` · `seeded_at` | _does not exist yet_ | `none` | `n/a` | `docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3` |
| reads | `surface_descriptors` **(net-new)** | `surface_id` · `archetype` · `platforms` · `descriptor` · `git_sha` · `seeded_at` | _does not exist yet_ | `none` | `n/a` | `docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3` |

**3. Which contracts, and who calls them?**

It reaches no contract — every value is local, a prop, or device state.

**4. What gate, role or entitlement stands in front of it?**

session `admin` — An /admin/** page: classifyRoute returns "admin" for any pathname starting with /admin/, and "admin" is the profiles.is_admin flag checked in-predicate, not a Postgres role. · RLS class `B` · entitlement `none`

**5. What archetype, and why that one?**

`LIST` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/02-web-admin/126_maxbld_surface_standard.md`](../../../docs/specs/02-web-admin/126_maxbld_surface_standard.md) · anchors: `docs/specs/02-web-admin/126_maxbld_surface_standard.md §2.2 group F — admin_orphan_panel LIST (100% gen)` · `docs/specs/02-web-admin/126_maxbld_surface_standard.md §2.2.1 P8 — orphans are a first-class rendered concept` · `docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3 row 9 — the fan-out and orphan joins, both derived from consumers[]` · `docs/reports/2026-09-15-spec126-admin-best-in-class.md §1.1 row 19 · §2 P8 · §3.2 (verdict BUILD)`

**8. What is still unresearched?**

**1 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 5 entr(ies) in feature `F09`. Removing it deletes 1 owned component(s): `src/features/admin-registry/components/RegistryOrphanTable.tsx`. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-014"></a>

## Card 18 — `S-014` `admin_role_matrix`

Registry detail: [`S-014`](../../../docs/reports/generated/127-surface-registry.md#s-014) `admin_role_matrix`.

`SURFACE` · `REPORT` · scope `parcel_admin` · feature `F09` surface-registry-drift · build order 2093 · batch B1a · **review: `unreviewed`**

**1. What does it do, and for whom?**

A grid of who is allowed to see and change what — every role down one axis, every table and route across the other. It is built by asking the live database what its access rules actually are and re-running the app's own route classifier, rather than by reading what a migration file claims. That distinction is the whole point: this page shows the permissions that are really in force, and flags any place where the declared intent and the live database disagree.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `pg_policies` **(net-new)** | `schemaname` · `tablename` · `policyname` · `permissive` · `roles` · `cmd` · `qual` · `with_check` | _does not exist yet_ | `none` | `n/a` | `docs/specs/00-architecture/114_rls_policy_catalog.md §8 — policy naming; §9 — the role matrix` |

**3. Which contracts, and who calls them?**

It reaches no contract — every value is local, a prop, or device state.

**4. What gate, role or entitlement stands in front of it?**

session `admin` — An /admin/** page: classifyRoute returns "admin" for any pathname starting with /admin/, and "admin" is the profiles.is_admin flag checked in-predicate — there is no admin Postgres role. · RLS class `none` · entitlement `none`

**5. What archetype, and why that one?**

`REPORT` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/02-web-admin/126_maxbld_surface_standard.md`](../../../docs/specs/02-web-admin/126_maxbld_surface_standard.md) · anchors: `docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.2 — RLS as descriptor data: classes, roles, and the role matrix` · `docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.2 rule 3 — the assertion reads the LIVE catalog (pg_policies / pg_class.relrowsecurity / pg_roles), never the migration text` · `docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.2 R-11 — migration 226's D5 renders as a declared OPEN row on /admin/roles, never as an omission` · `docs/specs/00-architecture/114_rls_policy_catalog.md §2 — the four classes, incl. the 2026-09-15 Class D amendment` · `docs/specs/00-architecture/114_rls_policy_catalog.md §8 — policy naming <table>_<operation>_<scope>` · `docs/reports/2026-09-15-spec126-admin-best-in-class.md §1.1 row 21 · §4`

**8. What is still unresearched?**

Nothing — every field is answered with a why and a citation.

**9. What would removing it delete?**

It is 1 of 5 entr(ies) in feature `F09`. Removing it deletes 1 owned component(s): `src/features/admin-registry/components/RegistryMatrix.tsx`. It is the ONLY reader or writer of `pg_policies` — removing it orphans that table.

---

<a id="card-s-016"></a>

## Card 19 — `S-016` `admin_surface_registry`

Registry detail: [`S-016`](../../../docs/reports/generated/127-surface-registry.md#s-016) `admin_surface_registry`.

`SURFACE` · `LIST` · scope `parcel_admin` · feature `F09` surface-registry-drift · build order 2093 · batch B1a · **review: `unreviewed`**

**1. What does it do, and for whom?**

One page listing every screen, every API contract and every scheduled job in the product, generated directly from the declarations that define them. It answers 'what does this system actually consist of, and which parts is anyone using' — including a seven-day usage count beside each entry. Because the page is generated rather than hand-written, it cannot quietly fall out of date: if a declaration is missing or wrong, the page is visibly empty or visibly wrong.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `surface_descriptors` **(net-new)** | `surface_id` · `archetype` · `platforms` · `descriptor` · `git_sha` · `seeded_at` | _does not exist yet_ | `none` | `n/a` | `docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3` |
| reads | `contract_descriptors` **(net-new)** | `contract_id` · `archetype` · `descriptor` · `git_sha` · `seeded_at` | _does not exist yet_ | `none` | `n/a` | `docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3` |
| reads | `archetype_registry` **(net-new)** | `archetype` · `platform` · `component_path` | _does not exist yet_ | `none` | `n/a` | `docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3` |
| reads | `usage_events` **(net-new)** | `event_id` · `user_id` · `session_id` · `product` · `event` · `subject_kind` · `subject_key` · `occurred_at` · `meta` | _does not exist yet_ | `none` | `n/a` | `docs/specs/02-web-admin/126_maxbld_surface_standard.md §7` |

**3. Which contracts, and who calls them?**

It reaches no contract — every value is local, a prop, or device state.

**4. What gate, role or entitlement stands in front of it?**

session `admin` — An /admin/** page: classifyRoute returns "admin" for any pathname starting with /admin/, and "admin" is the profiles.is_admin flag checked in-predicate, not a Postgres role. · RLS class `B` · entitlement `none`

**5. What archetype, and why that one?**

`LIST` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/02-web-admin/126_maxbld_surface_standard.md`](../../../docs/specs/02-web-admin/126_maxbld_surface_standard.md) · anchors: `docs/specs/02-web-admin/126_maxbld_surface_standard.md §2.2.2 — the admin pilot, /admin/surfaces, and why it is 100% generated` · `docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3 rows 8-10 — surface_descriptors, contract_descriptors, archetype_registry` · `docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.4 — the seeded-projection tables and their bidirectional drift lock` · `docs/specs/02-web-admin/127_surface_conversion_procedure.md §8.1 — the registry it renders` · `docs/reports/2026-09-15-spec126-admin-best-in-class.md §1.1 row 17 · §3.3 — the generated-page engine`

**8. What is still unresearched?**

**1 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 5 entr(ies) in feature `F09`. Removing it deletes 1 owned component(s): `src/features/admin-registry/components/RegistryTable.tsx`. It is the ONLY reader or writer of `archetype_registry` — removing it orphans that table.

---

<a id="card-s-027"></a>

## Card 20 — `S-027` `mobile_auth_confirm`

Registry detail: [`S-027`](../../../docs/reports/generated/127-surface-registry.md#s-027) `mobile_auth_confirm`.

`SURFACE` · `GATE` · scope `platform_shared` · feature `F10` auth-identity · build order 3103 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

The landing spot when someone taps the confirmation link in their sign-up email. It quietly exchanges the one-time code from the link for a real session and, when that works, the app routes them onward on its own. When it fails it explains which of two things went wrong: the link expired or was already used, or the link was opened on a different device than the one they signed up on.

**2. Which tables and columns, produced by which step?**

_No table is reached by this entry — every value it shows arrives through a contract, or it shows no server data at all._

**3. Which contracts, and who calls them?**

It reaches no contract — every value is local, a prop, or device state.

**4. What gate, role or entitlement stands in front of it?**

session `anon` — It is reachable with no session at all — establishing one is the point. It projects no data field, so there is nothing to disclose. · RLS class `none` · entitlement `none`

**5. What archetype, and why that one?**

`GATE` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/03-mobile/93_mobile_auth.md`](../../../docs/specs/03-mobile/93_mobile_auth.md) · anchors: `docs/specs/03-mobile/93_mobile_auth.md §5` · `docs/specs/03-mobile/99_mobile_state_architecture.md §5.1`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 6 entr(ies) in feature `F10`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-037"></a>

## Card 21 — `S-037` `mobile_sign_in`

Registry detail: [`S-037`](../../../docs/reports/generated/127-surface-registry.md#s-037) `mobile_sign_in`.

`SURFACE` · `FORM` · scope `platform_shared` · feature `F10` auth-identity · build order 3103 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

The front door of the app. Returning users sign in with Apple, Google, or an email and password, and there is a phone code path built but currently switched off. If someone tries to sign in with a method attached to an email that already has an account, a sheet explains the clash and sends them back to pick their original method, after which the new method is attached automatically.

**2. Which tables and columns, produced by which step?**

_No table is reached by this entry — every value it shows arrives through a contract, or it shows no server data at all._

**3. Which contracts, and who calls them?**

It reaches no contract — every value is local, a prop, or device state.

**4. What gate, role or entitlement stands in front of it?**

session `anon` — It is the unauthenticated entry point; it projects no server-sourced field, so there is nothing to disclose beyond the fixed wordmark copy. · RLS class `none` · entitlement `none`

**5. What archetype, and why that one?**

`FORM` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/03-mobile/93_mobile_auth.md`](../../../docs/specs/03-mobile/93_mobile_auth.md) · anchors: `docs/specs/03-mobile/93_mobile_auth.md §3.1` · `docs/specs/03-mobile/93_mobile_auth.md §3.2` · `docs/specs/03-mobile/93_mobile_auth.md §4` · `docs/specs/03-mobile/93_mobile_auth.md §5` · `docs/specs/03-mobile/93_mobile_auth.md §2.2`

**8. What is still unresearched?**

**1 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 6 entr(ies) in feature `F10`. Removing it deletes 1 owned component(s): `mobile/src/components/auth/GoogleSignInButton.tsx`. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-038"></a>

## Card 22 — `S-038` `mobile_sign_up`

Registry detail: [`S-038`](../../../docs/reports/generated/127-surface-registry.md#s-038) `mobile_sign_up`.

`SURFACE` · `FORM` · scope `platform_shared` · feature `F10` auth-identity · build order 3103 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Where a new user creates an account with an email and password, confirming the password twice. Because email confirmation is switched on, after submitting they see a 'check your email' state with a button to send the link again if it never arrives. A phone sign-up path with a texted code and a recovery-email step exists in the code but is currently hidden.

**2. Which tables and columns, produced by which step?**

_No table is reached by this entry — every value it shows arrives through a contract, or it shows no server data at all._

**3. Which contracts, and who calls them?**

It reaches no contract — every value is local, a prop, or device state.

**4. What gate, role or entitlement stands in front of it?**

session `anon` — The unauthenticated registration entry point; it projects no server-sourced field. · RLS class `none` · entitlement `none`

**5. What archetype, and why that one?**

`FORM` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/03-mobile/93_mobile_auth.md`](../../../docs/specs/03-mobile/93_mobile_auth.md) · anchors: `docs/specs/03-mobile/93_mobile_auth.md §4` · `docs/specs/03-mobile/93_mobile_auth.md §5` · `docs/specs/03-mobile/93_mobile_auth.md §2.2` · `docs/specs/03-mobile/95_mobile_user_profiles.md §4`

**8. What is still unresearched?**

**1 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 6 entr(ies) in feature `F10`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-039"></a>

## Card 23 — `S-039` `overlay_account_linking_sheet`

Registry detail: [`S-039`](../../../docs/reports/generated/127-surface-registry.md#s-039) `overlay_account_linking_sheet`.

`SURFACE` · `GATE` · scope `platform_shared` · feature `F10` auth-identity · build order 3103 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

A panel that appears when someone tries to sign in with a new method using an email that already has an account. It explains the clash and asks them to sign in with whatever method they originally used, after which the new one gets attached automatically. For security reasons it deliberately never reveals which method the existing account uses.

**2. Which tables and columns, produced by which step?**

_No table is reached by this entry — every value it shows arrives through a contract, or it shows no server data at all._

**3. Which contracts, and who calls them?**

It reaches no contract — every value is local, a prop, or device state.

**4. What gate, role or entitlement stands in front of it?**

session `anon` — It appears mid-sign-in, before a session exists — the whole point is that the user could not authenticate with the method they tried. · RLS class `none` · entitlement `none`

**5. What archetype, and why that one?**

`GATE` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/03-mobile/93_mobile_auth.md`](../../../docs/specs/03-mobile/93_mobile_auth.md) · anchors: `docs/specs/03-mobile/93_mobile_auth.md §3.2` · `docs/specs/03-mobile/93_mobile_auth.md §4`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 6 entr(ies) in feature `F10`. Removing it deletes 1 owned component(s): `mobile/src/components/auth/AccountLinkingSheet.tsx`. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-040"></a>

## Card 24 — `S-040` `overlay_error_boundary`

Registry detail: [`S-040`](../../../docs/reports/generated/127-surface-registry.md#s-040) `overlay_error_boundary`.

`SURFACE` · `GATE` · scope `platform_shared` · feature `F10` auth-identity · build order 3103 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

The last line of defence when part of the app crashes. Instead of a white screen, the user sees a short 'something went wrong' message, the underlying error text, and a Try Again button that attempts to re-render. It wraps both the whole app and, separately, the signed-in tab area.

**2. Which tables and columns, produced by which step?**

_No table is reached by this entry — every value it shows arrives through a contract, or it shows no server data at all._

**3. Which contracts, and who calls them?**

It reaches no contract — every value is local, a prop, or device state.

**4. What gate, role or entitlement stands in front of it?**

session `anon` — It wraps the entire tree including the unauthenticated auth group, so it must render with no session. · RLS class `none` · entitlement `none`

**5. What archetype, and why that one?**

`GATE` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: **UNRESEARCHED** — no SPEC LINK header and no System Map row, so there is nothing to check it against · anchors: `docs/specs/03-mobile/99_mobile_state_architecture.md §7.1` · `docs/specs/03-mobile/99_mobile_state_architecture.md §9.5` · `docs/specs/03-mobile/90_mobile_engineering_protocol.md §13`

**8. What is still unresearched?**

**3 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 6 entr(ies) in feature `F10`. Removing it deletes 1 owned component(s): `mobile/src/components/ErrorBoundary.tsx`. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-047"></a>

## Card 25 — `S-047` `shell_auth_stack`

Registry detail: [`S-047`](../../../docs/reports/generated/127-surface-registry.md#s-047) `shell_auth_stack`.

`SURFACE` · `SHELL` · scope `platform_shared` · feature `F10` auth-identity · build order 3103 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

The wrapper around the three signed-out screens: sign in, sign up, and the email-confirmation landing page. It does nothing but hold them in a stack and hide the default navigation header. Anyone can reach it, signed in or not.

**2. Which tables and columns, produced by which step?**

_No table is reached by this entry — every value it shows arrives through a contract, or it shows no server data at all._

**3. Which contracts, and who calls them?**

It reaches no contract — every value is local, a prop, or device state.

**4. What gate, role or entitlement stands in front of it?**

session `anon` — The auth group is the unauthenticated area; this shell adds no guard of its own — Spec 99 §5.1 gives one router per gate boundary and that router is AuthGate. · RLS class `none` · entitlement `none`

**5. What archetype, and why that one?**

`SHELL` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/03-mobile/93_mobile_auth.md`](../../../docs/specs/03-mobile/93_mobile_auth.md) · anchors: `docs/specs/03-mobile/93_mobile_auth.md §5` · `docs/specs/03-mobile/99_mobile_state_architecture.md §5.1`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 6 entr(ies) in feature `F10`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-c-026"></a>

## Card 26 — `C-026` `contract_onboarding_suppliers`

Registry detail: [`C-026`](../../../docs/reports/generated/127-surface-registry.md#c-026) `contract_onboarding_suppliers`.

`CONTRACT` · `QUERY` · scope `platform_shared` · feature `F11` onboarding · build order 3112 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

During sign-up, shows a new user the admin-curated list of supplier names for the trade they chose, so they can pick their usual suppliers instead of typing them in.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `trade_suppliers` | `name` · `trade_slug` · `active` · `display_order` | `id` · `trade_slug` · `name` · `display_order` · `active` | `none` | `n/a` | `docs/specs/03-mobile/94_mobile_onboarding.md` |

**3. Which contracts, and who calls them?**

Called by 1: `mobile_onboarding_supplier`

**4. What gate, role or entitlement stands in front of it?**

session `authenticated` — classifyRoute("/api/onboarding/suppliers") returns "authenticated" (executed 2026-09-15); the handler re-verifies the caller in-process. · RLS class `B` · entitlement `none`

**5. What archetype, and why that one?**

`QUERY` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/03-mobile/94_mobile_onboarding.md`](../../../docs/specs/03-mobile/94_mobile_onboarding.md) · anchors: `docs/specs/03-mobile/94_mobile_onboarding.md §10 Step 7b — src/app/api/onboarding/suppliers/route.ts:1`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 10 entr(ies) in feature `F11`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-028"></a>

## Card 27 — `S-028` `mobile_onboarding_address`

Registry detail: [`S-028`](../../../docs/reports/generated/127-surface-registry.md#s-028) `mobile_onboarding_address`.

`SURFACE` · `WIZARD_STEP` · scope `platform_shared` · feature `F11` onboarding · build order 3113 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Asks where the user works from, so the app knows which permits are nearby. They can type an address and confirm it, or hand over live location so the app follows them around. Addresses outside Toronto are refused with an offer to use the nearest covered area instead, and a confirmed address is rounded off to a coarse grid rather than stored precisely.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `user_profiles` | `user_id` · `home_base_lat` · `home_base_lng` · `location_mode` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/03-mobile/95_mobile_user_profiles.md` |
| writes | `user_profiles` | `user_id` · `home_base_lat` · `home_base_lng` · `location_mode` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/03-mobile/95_mobile_user_profiles.md` |

**3. Which contracts, and who calls them?**

Calls 1: `/api/user-profile` (idiom: direct)

**4. What gate, role or entitlement stands in front of it?**

session `authenticated` — The step is only reachable once AuthGate has a Supabase user whose server profile says onboarding_complete is false; PATCH /api/user-profile is an authenticated route. · RLS class `A` · entitlement `none`

**5. What archetype, and why that one?**

`WIZARD_STEP` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/03-mobile/94_mobile_onboarding.md`](../../../docs/specs/03-mobile/94_mobile_onboarding.md) · anchors: `docs/specs/03-mobile/94_mobile_onboarding.md §4` · `docs/specs/03-mobile/94_mobile_onboarding.md §5` · `docs/specs/03-mobile/94_mobile_onboarding.md §8` · `docs/specs/03-mobile/99_mobile_state_architecture.md §9.3`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 10 entr(ies) in feature `F11`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-029"></a>

## Card 28 — `S-029` `mobile_onboarding_complete`

Registry detail: [`S-029`](../../../docs/reports/generated/127-surface-registry.md#s-029) `mobile_onboarding_complete`.

`SURFACE` · `WIZARD_STEP` · scope `platform_shared` · feature `F11` onboarding · build order 3113 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

The last setup screen for users who joined to find new work. Four elements fade up in sequence confirming their trade and telling them their feed is ready. The button marks setup as finished on the server and drops them into the lead feed; if that save fails they stay put with a retry message rather than being pushed forward into a half-configured app.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `user_profiles` | `user_id` · `default_tab` · `onboarding_complete` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/03-mobile/95_mobile_user_profiles.md` |
| writes | `user_profiles` | `user_id` · `default_tab` · `onboarding_complete` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/03-mobile/95_mobile_user_profiles.md` |

**3. Which contracts, and who calls them?**

Calls 1: `/api/user-profile` (idiom: direct)

**4. What gate, role or entitlement stands in front of it?**

session `authenticated` — Reachable only after AuthGate has a Supabase user whose server profile says onboarding_complete is false; PATCH /api/user-profile is an authenticated route. · RLS class `A` · entitlement `none`

**5. What archetype, and why that one?**

`WIZARD_STEP` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/03-mobile/94_mobile_onboarding.md`](../../../docs/specs/03-mobile/94_mobile_onboarding.md) · anchors: `docs/specs/03-mobile/94_mobile_onboarding.md §5` · `docs/specs/03-mobile/94_mobile_onboarding.md §10` · `docs/specs/03-mobile/99_mobile_state_architecture.md §3.5` · `docs/specs/03-mobile/99_mobile_state_architecture.md §9.2`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 10 entr(ies) in feature `F11`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-030"></a>

## Card 29 — `S-030` `mobile_onboarding_first_permit`

Registry detail: [`S-030`](../../../docs/reports/generated/127-surface-registry.md#s-030) `mobile_onboarding_first_permit`.

`SURFACE` · `WIZARD_STEP` · scope `platform_shared` · feature `F11` onboarding · build order 3113 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Offered only to users who said they mainly want to track existing projects. It invites them to add one job they are already working on so their board is not empty on arrival, with a skip option underneath. In the current build neither button actually adds anything — both simply move on to the terms screen.

**2. Which tables and columns, produced by which step?**

_No table is reached by this entry — every value it shows arrives through a contract, or it shows no server data at all._

**3. Which contracts, and who calls them?**

It reaches no contract — every value is local, a prop, or device state.

**4. What gate, role or entitlement stands in front of it?**

session `authenticated` — Reachable only after AuthGate has a Supabase user whose server profile says onboarding_complete is false; PATCH /api/user-profile is an authenticated route. · RLS class `none` · entitlement `none`

**5. What archetype, and why that one?**

`WIZARD_STEP` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/03-mobile/94_mobile_onboarding.md`](../../../docs/specs/03-mobile/94_mobile_onboarding.md) · anchors: `docs/specs/03-mobile/94_mobile_onboarding.md §6` · `docs/specs/03-mobile/94_mobile_onboarding.md §10` · `docs/specs/03-mobile/77_mobile_crm_flight_board.md §3.1`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 10 entr(ies) in feature `F11`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-031"></a>

## Card 30 — `S-031` `mobile_onboarding_manufacturer_hold`

Registry detail: [`S-031`](../../../docs/reports/generated/127-surface-registry.md#s-031) `mobile_onboarding_manufacturer_hold`.

`SURFACE` · `GATE` · scope `platform_shared` · feature `F11` onboarding · build order 3113 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

A holding screen for manufacturer accounts whose feed is configured by hand behind the scenes. It tells the user their account is being set up and that they will be emailed when it is ready, with a button to email support. There is nothing to do here and no way forward from inside the app.

**2. Which tables and columns, produced by which step?**

_No table is reached by this entry — every value it shows arrives through a contract, or it shows no server data at all._

**3. Which contracts, and who calls them?**

It reaches no contract — every value is local, a prop, or device state.

**4. What gate, role or entitlement stands in front of it?**

session `authenticated` — AuthGate routes an authenticated user here when account_preset is manufacturer and onboarding_complete is false; the screen itself has no gate of its own. · RLS class `none` · entitlement `none`

**5. What archetype, and why that one?**

`GATE` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/03-mobile/94_mobile_onboarding.md`](../../../docs/specs/03-mobile/94_mobile_onboarding.md) · anchors: `docs/specs/03-mobile/94_mobile_onboarding.md §7` · `docs/specs/03-mobile/96_mobile_subscription.md §8` · `docs/specs/03-mobile/99_mobile_state_architecture.md §5.3`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 10 entr(ies) in feature `F11`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-032"></a>

## Card 31 — `S-032` `mobile_onboarding_path`

Registry detail: [`S-032`](../../../docs/reports/generated/127-surface-registry.md#s-032) `mobile_onboarding_path`.

`SURFACE` · `WIZARD_STEP` · scope `platform_shared` · feature `F11` onboarding · build order 3113 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Asks the user which of two jobs they want the app to do for them: find brand-new work nearby, or keep track of projects they are already on. Two large cards, and tapping one moves straight on with no separate continue button. The choice changes the remaining setup steps and which screen they land on at the end.

**2. Which tables and columns, produced by which step?**

_No table is reached by this entry — every value it shows arrives through a contract, or it shows no server data at all._

**3. Which contracts, and who calls them?**

It reaches no contract — every value is local, a prop, or device state.

**4. What gate, role or entitlement stands in front of it?**

session `authenticated` — The step is only reachable once AuthGate has a Supabase user whose server profile says onboarding_complete is false; PATCH /api/user-profile is an authenticated route. · RLS class `none` · entitlement `none`

**5. What archetype, and why that one?**

`WIZARD_STEP` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/03-mobile/94_mobile_onboarding.md`](../../../docs/specs/03-mobile/94_mobile_onboarding.md) · anchors: `docs/specs/03-mobile/94_mobile_onboarding.md §5` · `docs/specs/03-mobile/94_mobile_onboarding.md §6` · `docs/specs/03-mobile/94_mobile_onboarding.md §10`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 10 entr(ies) in feature `F11`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-033"></a>

## Card 32 — `S-033` `mobile_onboarding_profession`

Registry detail: [`S-033`](../../../docs/reports/generated/127-surface-registry.md#s-033) `mobile_onboarding_profession`.

`SURFACE` · `WIZARD_STEP` · scope `platform_shared` · feature `F11` onboarding · build order 3113 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

The first setup question: what trade do you work in. The user picks one from a long grouped list, then a sheet slides up warning that this choice cannot be changed later without deleting the account, and asks them to confirm. Once saved, plumbers and similar trades go on to choose how they will use the app, while real-estate agents skip straight to setting their territory.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `user_profiles` | `user_id` · `trade_slug` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/03-mobile/95_mobile_user_profiles.md` |
| writes | `user_profiles` | `user_id` · `trade_slug` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/03-mobile/95_mobile_user_profiles.md` |

**3. Which contracts, and who calls them?**

Calls 1: `/api/user-profile` (idiom: direct)

**4. What gate, role or entitlement stands in front of it?**

session `authenticated` — The step is only reachable once AuthGate has a Supabase user whose server profile says onboarding_complete is false; PATCH /api/user-profile is an authenticated route. · RLS class `A` · entitlement `none`

**5. What archetype, and why that one?**

`WIZARD_STEP` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/03-mobile/94_mobile_onboarding.md`](../../../docs/specs/03-mobile/94_mobile_onboarding.md) · anchors: `docs/specs/03-mobile/94_mobile_onboarding.md §3` · `docs/specs/03-mobile/94_mobile_onboarding.md §10` · `docs/specs/03-mobile/95_mobile_user_profiles.md §6` · `docs/specs/03-mobile/99_mobile_state_architecture.md §9.3`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 10 entr(ies) in feature `F11`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-034"></a>

## Card 33 — `S-034` `mobile_onboarding_supplier`

Registry detail: [`S-034`](../../../docs/reports/generated/127-surface-registry.md#s-034) `mobile_onboarding_supplier`.

`SURFACE` · `WIZARD_STEP` · scope `platform_shared` · feature `F11` onboarding · build order 3113 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Optionally asks which supplier the user mainly buys from, offering a grid of the common names for their trade plus a free-text box for anything else. It can be skipped entirely. If there are no known suppliers for that trade, the screen skips itself automatically and the user never sees it.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `trade_suppliers` | `trade_slug` · `name` · `display_order` · `active` | `id` · `trade_slug` · `name` · `display_order` · `active` | `none` | `n/a` | `docs/specs/01-pipeline/80_taxonomies.md` |
| reads | `user_profiles` | `user_id` · `supplier_selection` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/03-mobile/95_mobile_user_profiles.md` |
| writes | `user_profiles` | `user_id` · `supplier_selection` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/03-mobile/95_mobile_user_profiles.md` |

**3. Which contracts, and who calls them?**

Calls 2: `/api/onboarding/suppliers` · `/api/user-profile` (idiom: direct)

**4. What gate, role or entitlement stands in front of it?**

session `authenticated` — The step is only reachable once AuthGate has a Supabase user whose server profile says onboarding_complete is false; PATCH /api/user-profile is an authenticated route. · RLS class `B` · entitlement `none`

**5. What archetype, and why that one?**

`WIZARD_STEP` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/03-mobile/94_mobile_onboarding.md`](../../../docs/specs/03-mobile/94_mobile_onboarding.md) · anchors: `docs/specs/03-mobile/94_mobile_onboarding.md §5` · `docs/specs/03-mobile/94_mobile_onboarding.md §6` · `docs/specs/01-pipeline/87_supplier_audience.md`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 10 entr(ies) in feature `F11`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-035"></a>

## Card 34 — `S-035` `mobile_onboarding_terms`

Registry detail: [`S-035`](../../../docs/reports/generated/127-surface-registry.md#s-035) `mobile_onboarding_terms`.

`SURFACE` · `WIZARD_STEP` · scope `platform_shared` · feature `F11` onboarding · build order 3113 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Two tick boxes for the terms of service and the privacy policy, each linking out to the document in a browser. Both must be ticked before the button at the bottom becomes usable. Users who came in to find new work continue to a short celebration screen; users who came in to track existing jobs finish setup here and land straight on their board.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `user_profiles` | `user_id` · `tos_accepted_at` · `default_tab` · `location_mode` · `onboarding_complete` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/03-mobile/95_mobile_user_profiles.md` |
| writes | `user_profiles` | `user_id` · `tos_accepted_at` · `default_tab` · `location_mode` · `onboarding_complete` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/03-mobile/95_mobile_user_profiles.md` |

**3. Which contracts, and who calls them?**

Calls 1: `/api/user-profile` (idiom: direct)

**4. What gate, role or entitlement stands in front of it?**

session `authenticated` — Reachable only after AuthGate has a Supabase user whose server profile says onboarding_complete is false; PATCH /api/user-profile is an authenticated route. · RLS class `A` · entitlement `none`

**5. What archetype, and why that one?**

`WIZARD_STEP` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/03-mobile/94_mobile_onboarding.md`](../../../docs/specs/03-mobile/94_mobile_onboarding.md) · anchors: `docs/specs/03-mobile/94_mobile_onboarding.md §4` · `docs/specs/03-mobile/94_mobile_onboarding.md §6` · `docs/specs/03-mobile/94_mobile_onboarding.md §10` · `docs/specs/03-mobile/99_mobile_state_architecture.md §4`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 10 entr(ies) in feature `F11`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-048"></a>

## Card 35 — `S-048` `shell_onboarding_stack`

Registry detail: [`S-048`](../../../docs/reports/generated/127-surface-registry.md#s-048) `shell_onboarding_stack`.

`SURFACE` · `SHELL` · scope `platform_shared` · feature `F11` onboarding · build order 3113 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Holds the eight setup screens in order so the user can move forward and back through them. It deliberately makes no decision about when setup is finished or where to send the user next — that judgement belongs entirely to the outermost wrapper.

**2. Which tables and columns, produced by which step?**

_No table is reached by this entry — every value it shows arrives through a contract, or it shows no server data at all._

**3. Which contracts, and who calls them?**

It reaches no contract — every value is local, a prop, or device state.

**4. What gate, role or entitlement stands in front of it?**

session `authenticated` — The group is reachable only when AuthGate has a user with onboarding_complete false; the shell itself adds no guard — deliberately. · RLS class `none` · entitlement `none`

**5. What archetype, and why that one?**

`SHELL` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/03-mobile/94_mobile_onboarding.md`](../../../docs/specs/03-mobile/94_mobile_onboarding.md) · anchors: `docs/specs/03-mobile/94_mobile_onboarding.md §10` · `docs/specs/03-mobile/93_mobile_auth.md §5` · `docs/specs/03-mobile/99_mobile_state_architecture.md §5.1`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 10 entr(ies) in feature `F11`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-c-020"></a>

## Card 36 — `C-020` `contract_admin_users_uid_subscription_events`

Registry detail: [`C-020`](../../../docs/reports/generated/127-surface-registry.md#c-020) `contract_admin_users_uid_subscription_events`.

`CONTRACT` · `QUERY` · scope `platform_shared` · feature `F12` subscription-billing · build order 3122 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Shows an admin the recent billing events that have hit one specific user's account, so support staff can check whether the payment provider is actually talking to that account without logging into the provider's own dashboard.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `admin_backup_codes` | `id` · `code_hash` · `code_salt` · `user_id` · `used_at` | `id` · `user_id` · `code_hash` · `code_salt` · `used_at` · `created_at` | `none` | `n/a` | `docs/specs/00-architecture/13_authentication.md` |
| reads | `entitlements` | `last_stripe_event_at` · `user_id` | `user_id` · `product` · `status` · `stripe_subscription_id` · `current_period_end` · `trial_started_at` · `last_stripe_event_at` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/116_multi_product_architecture.md` |
| reads | `profiles` | `id` · `is_admin` | `id` · `is_admin` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/114_rls_policy_catalog.md` |
| reads | `stripe_webhook_events` | `event_id` · `event_type` · `processed_at` · `stripe_customer_id` | `event_id` · `processed_at` · `event_type` · `stripe_customer_id` | `none` | `n/a` | `docs/specs/03-mobile/95_mobile_user_profiles.md` |
| reads | `user_profiles` | `stripe_customer_id` · `user_id` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/02-web-admin/102_admin_notifications_tool.md` |
| writes | `admin_backup_codes` | `used_at` | `id` · `user_id` · `code_hash` · `code_salt` · `used_at` · `created_at` | `none` | `n/a` | `docs/specs/00-architecture/13_authentication.md` |

**3. Which contracts, and who calls them?**

Called by 1: `admin_user_detail`

**4. What gate, role or entitlement stands in front of it?**

session `admin` — classifyRoute("/api/admin/users/X/subscription/events") returns "admin" (executed 2026-09-15); the handler re-verifies the caller in-process. · RLS class `A` · entitlement `none`

**5. What archetype, and why that one?**

`QUERY` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/02-web-admin/21_admin_user_management.md`](../../../docs/specs/02-web-admin/21_admin_user_management.md) · anchors: `docs/specs/02-web-admin/21_admin_user_management.md §6 (Subscription-Ops); docs/specs/02-web-admin/20_stripe_web_checkout.md §7 — src/app/api/admin/users/[uid]/subscription/events/route.ts:1-2`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 12 entr(ies) in feature `F12`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-c-021"></a>

## Card 37 — `C-021` `contract_admin_users_uid_subscription_reconcile`

Registry detail: [`C-021`](../../../docs/reports/generated/127-surface-registry.md#c-021) `contract_admin_users_uid_subscription_reconcile`.

`CONTRACT` · `MUTATION` · scope `platform_shared` · feature `F12` subscription-billing · build order 3122 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Lets an admin check whether a user's stored subscription status has drifted out of sync with what the payment provider actually says — because a billing notification was missed — and then apply the provider's version as the correct one, per product, with a required reason logged for the record.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `admin_backup_codes` | `id` · `code_hash` · `code_salt` · `user_id` · `used_at` | `id` · `user_id` · `code_hash` · `code_salt` · `used_at` · `created_at` | `none` | `n/a` | `docs/specs/00-architecture/13_authentication.md` |
| reads | `entitlements` | `product` · `status` · `user_id` | `user_id` · `product` · `status` · `stripe_subscription_id` · `current_period_end` · `trial_started_at` · `last_stripe_event_at` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/116_multi_product_architecture.md` |
| reads | `logic_variables` | `variable_value_json` · `variable_key` | `variable_key` · `variable_value` · `description` · `updated_at` · `variable_value_json` | `none` | `n/a` | `docs/specs/02-web-admin/86_control_panel.md` |
| reads | `profiles` | `id` · `is_admin` | `id` · `is_admin` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/114_rls_policy_catalog.md` |
| reads | `user_profiles` | `stripe_customer_id` · `user_id` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/02-web-admin/102_admin_notifications_tool.md` |
| writes | `admin_audit_log` | `admin_uid` · `action` · `target_uid` · `old_value` · `new_value` · `reason` | `id` · `admin_uid` · `action` · `target_uid` · `old_value` · `new_value` · `reason` · `created_at` | `none` | `n/a` | `docs/specs/02-web-admin/21_admin_user_management.md` |
| writes | `admin_backup_codes` | `used_at` | `id` · `user_id` · `code_hash` · `code_salt` · `used_at` · `created_at` | `none` | `n/a` | `docs/specs/00-architecture/13_authentication.md` |
| writes | `entitlements` | `user_id` · `product` · `status` · `last_stripe_event_at` · `created_at` · `updated_at` | `user_id` · `product` · `status` · `stripe_subscription_id` · `current_period_end` · `trial_started_at` · `last_stripe_event_at` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/116_multi_product_architecture.md` |

**3. Which contracts, and who calls them?**

Called by 1: `admin_user_detail`

**4. What gate, role or entitlement stands in front of it?**

session `admin` — classifyRoute("/api/admin/users/X/subscription/reconcile") returns "admin" (executed 2026-09-15); the handler re-verifies the caller in-process. · RLS class `A` · entitlement `none`

**5. What archetype, and why that one?**

`MUTATION` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/02-web-admin/21_admin_user_management.md`](../../../docs/specs/02-web-admin/21_admin_user_management.md) · anchors: `docs/specs/02-web-admin/21_admin_user_management.md §6 (Subscription-Ops); docs/specs/02-web-admin/20_stripe_web_checkout.md §7; docs/specs/00-architecture/116_multi_product_architecture.md §4 N2 + OD3/OD5 — src/app/api/admin/users/[uid]/subscription/reconcile/route.ts:1-3`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 12 entr(ies) in feature `F12`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-c-022"></a>

## Card 38 — `C-022` `contract_admin_users_uid_subscription_retry_cancel`

Registry detail: [`C-022`](../../../docs/reports/generated/127-surface-registry.md#c-022) `contract_admin_users_uid_subscription_retry_cancel`.

`CONTRACT` · `MUTATION` · scope `platform_shared` · feature `F12` subscription-billing · build order 3122 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Lets an admin retry cancelling a deleted user's subscription when the automatic cancellation failed at delete time, so the person does not keep getting billed after their account was removed.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `admin_backup_codes` | `id` · `code_hash` · `code_salt` · `user_id` · `used_at` | `id` · `user_id` · `code_hash` · `code_salt` · `used_at` · `created_at` | `none` | `n/a` | `docs/specs/00-architecture/13_authentication.md` |
| reads | `profiles` | `id` · `is_admin` | `id` · `is_admin` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/114_rls_policy_catalog.md` |
| reads | `user_profiles` | `stripe_customer_id` · `stripe_cancel_failed_at` · `account_deleted_at` · `user_id` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/02-web-admin/102_admin_notifications_tool.md` |
| writes | `admin_audit_log` | `admin_uid` · `action` · `target_uid` · `old_value` · `new_value` · `reason` | `id` · `admin_uid` · `action` · `target_uid` · `old_value` · `new_value` · `reason` · `created_at` | `none` | `n/a` | `docs/specs/02-web-admin/21_admin_user_management.md` |
| writes | `admin_backup_codes` | `used_at` | `id` · `user_id` · `code_hash` · `code_salt` · `used_at` · `created_at` | `none` | `n/a` | `docs/specs/00-architecture/13_authentication.md` |
| writes | `user_profiles` | `stripe_cancel_failed_at` · `updated_at` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/02-web-admin/102_admin_notifications_tool.md` |

**3. Which contracts, and who calls them?**

Called by 1: `admin_user_detail`

**4. What gate, role or entitlement stands in front of it?**

session `admin` — classifyRoute("/api/admin/users/X/subscription/retry-cancel") returns "admin" (executed 2026-09-15); the handler re-verifies the caller in-process. · RLS class `A` · entitlement `none`

**5. What archetype, and why that one?**

`MUTATION` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/02-web-admin/21_admin_user_management.md`](../../../docs/specs/02-web-admin/21_admin_user_management.md) · anchors: `docs/specs/02-web-admin/21_admin_user_management.md §6 (Subscription-Ops); docs/specs/02-web-admin/20_stripe_web_checkout.md §6-DELETE §7 — src/app/api/admin/users/[uid]/subscription/retry-cancel/route.ts:1-2`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 12 entr(ies) in feature `F12`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-c-030"></a>

## Card 39 — `C-030` `contract_subscribe_exchange`

Registry detail: [`C-030`](../../../docs/reports/generated/127-surface-registry.md#c-030) `contract_subscribe_exchange`.

`CONTRACT` · `MUTATION` · scope `platform_shared` · feature `F12` subscription-billing · build order 3122 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Completes the web checkout handoff: a mobile user taps Subscribe, which mints a one-time link; this endpoint redeems that link, confirms who the person is, and starts a payment session so they can enter billing details and become a paying subscriber.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `logic_variables` | `variable_value_json` | `variable_key` · `variable_value` · `description` · `updated_at` · `variable_value_json` | `none` | `n/a` | `docs/specs/02-web-admin/86_control_panel.md` |
| reads | `user_profiles` | `email` · `stripe_customer_id` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/02-web-admin/102_admin_notifications_tool.md` |
| writes | `subscribe_nonces` | `nonce (predicate)` · `expires_at (predicate)` · `user_id (RETURNING)` | `nonce` · `user_id` · `expires_at` | `none` | `n/a` | `docs/specs/03-mobile/95_mobile_user_profiles.md` |
| writes | `user_profiles` | `stripe_customer_id` · `updated_at` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/02-web-admin/102_admin_notifications_tool.md` |

**3. Which contracts, and who calls them?**

Called by 1: `web_subscribe`

**4. What gate, role or entitlement stands in front of it?**

session `anon` — classifyRoute("/api/subscribe/exchange") returns "public" (executed 2026-09-15); no session is checked — the handler authenticates the caller by other means: Single-use nonce IS the credential. Consumption is one atomic statement: `DELETE FROM subscribe_nonces WHERE nonce = $1 AND expires_at > NOW() RETURNING user_id · RLS class `A` · entitlement `none`

**5. What archetype, and why that one?**

`MUTATION` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/02-web-admin/20_stripe_web_checkout.md`](../../../docs/specs/02-web-admin/20_stripe_web_checkout.md) · anchors: `docs/specs/02-web-admin/20_stripe_web_checkout.md §3.2 + docs/specs/03-mobile/96_mobile_subscription.md §10 Step 4b (src/app/api/subscribe/exchange/route.ts:1-2)`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 12 entr(ies) in feature `F12`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-c-031"></a>

## Card 40 — `C-031` `contract_subscribe_portal_session`

Registry detail: [`C-031`](../../../docs/reports/generated/127-surface-registry.md#c-031) `contract_subscribe_portal_session`.

`CONTRACT` · `COMMAND` · scope `platform_shared` · feature `F12` subscription-billing · build order 3122 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Lets a signed-in subscriber open the payment provider's self-service billing portal, where they can cancel their subscription, update their payment method, or fix a failed payment — replacing the static billing-page link the mobile app used before.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `user_profiles` | `stripe_customer_id` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/02-web-admin/102_admin_notifications_tool.md` |

**3. Which contracts, and who calls them?**

Called by 1: `mobile/src/hooks/usePortalSession.ts`

**4. What gate, role or entitlement stands in front of it?**

session `authenticated` — classifyRoute("/api/subscribe/portal-session") returns "authenticated" (executed 2026-09-15); the handler re-verifies the caller in-process. · RLS class `A` · entitlement `none`

**5. What archetype, and why that one?**

`COMMAND` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/02-web-admin/20_stripe_web_checkout.md`](../../../docs/specs/02-web-admin/20_stripe_web_checkout.md) · anchors: `docs/specs/02-web-admin/20_stripe_web_checkout.md §5 + docs/specs/03-mobile/96_mobile_subscription.md §7 (src/app/api/subscribe/portal-session/route.ts:1-2)`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 12 entr(ies) in feature `F12`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-c-032"></a>

## Card 41 — `C-032` `contract_subscribe_session`

Registry detail: [`C-032`](../../../docs/reports/generated/127-surface-registry.md#c-032) `contract_subscribe_session`.

`CONTRACT` · `MUTATION` · scope `platform_shared` · feature `F12` subscription-billing · build order 3122 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Starts the subscribe flow for a signed-in user: checks they are not already subscribed, mid-cancellation or pending account deletion, then issues a short-lived single-use link to the checkout page so the URL is safe to share or log without exposing who the user is.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `entitlements` | `status` · `trial_started_at` | `user_id` · `product` · `status` · `stripe_subscription_id` · `current_period_end` · `trial_started_at` · `last_stripe_event_at` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/116_multi_product_architecture.md` |
| reads | `subscribe_nonces` | `nonce` | `nonce` · `user_id` · `expires_at` | `none` | `n/a` | `docs/specs/03-mobile/95_mobile_user_profiles.md` |
| reads | `user_profiles` | `account_deleted_at` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/02-web-admin/102_admin_notifications_tool.md` |
| writes | `subscribe_nonces` | `nonce` · `user_id` | `nonce` · `user_id` · `expires_at` | `none` | `n/a` | `docs/specs/03-mobile/95_mobile_user_profiles.md` |

**3. Which contracts, and who calls them?**

Called by 1: `mobile/src/hooks/useSubscribeCheckout.ts`

**4. What gate, role or entitlement stands in front of it?**

session `authenticated` — classifyRoute("/api/subscribe/session") returns "authenticated" (executed 2026-09-15); the handler re-verifies the caller in-process. · RLS class `A` · entitlement `none`

**5. What archetype, and why that one?**

`MUTATION` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/03-mobile/96_mobile_subscription.md`](../../../docs/specs/03-mobile/96_mobile_subscription.md) · anchors: `docs/specs/03-mobile/96_mobile_subscription.md §5 Paywall Screen + §10 Step 4b (src/app/api/subscribe/session/route.ts:1-2)`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 12 entr(ies) in feature `F12`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-c-038"></a>

## Card 42 — `C-038` `contract_webhooks_stripe`

Registry detail: [`C-038`](../../../docs/reports/generated/127-surface-registry.md#c-038) `contract_webhooks_stripe`.

`CONTRACT` · `WEBHOOK` · scope `platform_shared` · feature `F12` subscription-billing · build order 3122 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Receives payment-status events directly from the payment provider — checkout completed, subscription created, updated or cancelled, invoice paid or failed — and updates the corresponding user's paid-access status. This is the mechanism that actually turns a subscriber's access on or off after billing is processed.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `entitlements` | `product` | `user_id` · `product` · `status` · `stripe_subscription_id` · `current_period_end` · `trial_started_at` · `last_stripe_event_at` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/116_multi_product_architecture.md` |
| reads | `logic_variables` | `variable_value_json` | `variable_key` · `variable_value` · `description` · `updated_at` · `variable_value_json` | `none` | `n/a` | `docs/specs/02-web-admin/86_control_panel.md` |
| reads | `user_profiles` | `user_id` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/02-web-admin/102_admin_notifications_tool.md` |
| writes | `entitlements` | `user_id` · `product` · `status` · `stripe_subscription_id` · `current_period_end` · `last_stripe_event_at` · `created_at` · `updated_at` | `user_id` · `product` · `status` · `stripe_subscription_id` · `current_period_end` · `trial_started_at` · `last_stripe_event_at` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/116_multi_product_architecture.md` |
| writes | `stripe_webhook_events` | `event_id` · `event_type` · `stripe_customer_id` | `event_id` · `processed_at` · `event_type` · `stripe_customer_id` | `none` | `n/a` | `docs/specs/03-mobile/95_mobile_user_profiles.md` |

**3. Which contracts, and who calls them?**

**Nothing calls it.** An orphan contract — the exact shape this registry exists to surface.

**4. What gate, role or entitlement stands in front of it?**

session `anon` — classifyRoute("/api/webhooks/stripe") returns "public" (executed 2026-09-15); no session is checked — the handler authenticates the caller by other means: SIGNATURE: the stripe-signature header is required at src/app/api/webhooks/stripe/route.ts:283-286, and HMAC-verified by `stripe.webhooks.constructEvent(rawBody · RLS class `A` · entitlement `none`

**5. What archetype, and why that one?**

`WEBHOOK` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/03-mobile/96_mobile_subscription.md`](../../../docs/specs/03-mobile/96_mobile_subscription.md) · anchors: `docs/specs/03-mobile/96_mobile_subscription.md §10 Step 5 + docs/specs/00-architecture/116_multi_product_architecture.md §4 N2 + OD3/OD5 (src/app/api/webhooks/stripe/route.ts:1-2)`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 12 entr(ies) in feature `F12`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-043"></a>

## Card 43 — `S-043` `overlay_paywall`

Registry detail: [`S-043`](../../../docs/reports/generated/127-surface-registry.md#s-043) `overlay_paywall`.

`SURFACE` · `GATE` · scope `platform_shared` · feature `F12` subscription-billing · build order 3123 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

The full-screen message a user meets when their free trial has run out. It tells them how many jobs they viewed during the trial and offers a button that opens a checkout page in a browser. They can also dismiss it and keep browsing with everything blurred out. If they have already paid and nothing has changed, a link appears after a minute to re-check their status.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `user_profiles` | `user_id` · `lead_views_count` · `account_deleted_at` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/03-mobile/95_mobile_user_profiles.md` |
| reads | `entitlements` | `user_id` · `product` · `status` · `trial_started_at` | `user_id` · `product` · `status` · `stripe_subscription_id` · `current_period_end` · `trial_started_at` · `last_stripe_event_at` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/116_multi_product_architecture.md` |
| reads | `subscribe_nonces` | `nonce` · `user_id` | `nonce` · `user_id` · `expires_at` | `none` | `n/a` | `docs/specs/03-mobile/96_mobile_subscription.md` |
| writes | `subscribe_nonces` | `nonce` · `user_id` | `nonce` · `user_id` · `expires_at` | `none` | `n/a` | `docs/specs/03-mobile/96_mobile_subscription.md` |

**3. Which contracts, and who calls them?**

Calls 1: `/api/subscribe/session` (idiom: hook)

**4. What gate, role or entitlement stands in front of it?**

session `authenticated` — Only an authenticated user can reach it (the tab shell mounts it), and /api/subscribe/session is under the explicitly-listed /api/subscribe authenticated prefix — the sibling /api/subscribe/exchange is the exact-match public exception. · RLS class `A` · entitlement `lead_gen`

**5. What archetype, and why that one?**

`GATE` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

- ⚠️ Renders trial copy from `user_profiles.lead_views_count` — a lead-gen counter — on a paywall that also stands in front of the parcel product. The counter is structurally 0 (its only writer has no caller), so every trial user sees the zero-state copy regardless of which product they came from. → owning product `lead_gen`, proposed `needs-ruling`. Evidence: `mobile/src/components/paywall/PaywallScreen.tsx:153` · `src/app/api/leads/view/route.ts:100-114` · `src/features/leads/api/useLeadView.ts:77`

**7. Does it match its owning spec section?**

Spec: [`docs/specs/03-mobile/96_mobile_subscription.md`](../../../docs/specs/03-mobile/96_mobile_subscription.md) · anchors: `docs/specs/03-mobile/96_mobile_subscription.md §9` · `docs/specs/03-mobile/96_mobile_subscription.md §10` · `docs/specs/03-mobile/96_mobile_subscription.md §5` · `docs/specs/03-mobile/99_mobile_state_architecture.md §7.6`

- ❓ Should the trial paywall tell a parcel-tool user how many LEADS they have viewed? The copy is lead-gen framing on a gate that also stands in front of the parcel product. **Measured:** The `{N} leads` branch is unreachable in production because the counter never increments, so every trial user sees the zero-state copy — which hides the question rather than answering it. **Spec:** Spec 95 §2.2.1 designs the trial view counter. Spec 128 R-08 retires the meter in favour of `usage_events`, which makes this copy a product decision rather than a bug fix.

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 12 entr(ies) in feature `F12`. Removing it deletes 1 owned component(s): `mobile/src/components/paywall/PaywallScreen.tsx`. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-044"></a>

## Card 44 — `S-044` `overlay_subscription_loading_guard`

Registry detail: [`S-044`](../../../docs/reports/generated/127-surface-registry.md#s-044) `overlay_subscription_loading_guard`.

`SURFACE` · `GATE` · scope `platform_shared` · feature `F12` subscription-billing · build order 3123 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

A plain full-screen spinner shown in the moment before the app knows whether the user's subscription is still valid. Its whole job is to make sure the upgrade screen never flashes up at someone who is actually a paying customer. It is also reused when the app is briefly unsure which user's data it is holding.

**2. Which tables and columns, produced by which step?**

_No table is reached by this entry — every value it shows arrives through a contract, or it shows no server data at all._

**3. Which contracts, and who calls them?**

It reaches no contract — every value is local, a prop, or device state.

**4. What gate, role or entitlement stands in front of it?**

session `authenticated` — All four mount points sit behind a resolved Supabase user: three in the tab shell's subscription gate and one in AuthGate's stale-profile branch. · RLS class `none` · entitlement `none`

**5. What archetype, and why that one?**

`GATE` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/03-mobile/96_mobile_subscription.md`](../../../docs/specs/03-mobile/96_mobile_subscription.md) · anchors: `docs/specs/03-mobile/96_mobile_subscription.md §9` · `docs/specs/03-mobile/99_mobile_state_architecture.md §6.5` · `docs/specs/03-mobile/99_mobile_state_architecture.md §7.1`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 12 entr(ies) in feature `F12`. Removing it deletes 1 owned component(s): `mobile/src/components/paywall/SubscriptionLoadingGuard.tsx`. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-051"></a>

## Card 45 — `S-051` `web_subscribe`

Registry detail: [`S-051`](../../../docs/reports/generated/127-surface-registry.md#s-051) `web_subscribe`.

`SURFACE` · `WIZARD_STEP` · scope `platform_shared` · feature `F12` subscription-billing · build order 3123 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

The hand-off page between the mobile app and the payment provider. A user who taps subscribe in the app arrives here with a one-time code in the web address and no web login; the page trades that code for a payment page and sends the browser straight on to it, showing only a spinner while it works. If the code is missing, already used, or older than fifteen minutes, it shows one honest message telling the user to go back to the app and start again.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `user_profiles` | **UNRESEARCHED** | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/02-web-admin/20_stripe_web_checkout.md §3.2` |
| reads | `logic_variables` | **UNRESEARCHED** | `variable_key` · `variable_value` · `description` · `updated_at` · `variable_value_json` | `none` | `n/a` | **UNRESEARCHED** |

**3. Which contracts, and who calls them?**

Calls 1: `/api/subscribe/exchange`

**4. What gate, role or entitlement stands in front of it?**

session `anon` — /subscribe is in PUBLIC_PATHS and /api/subscribe/exchange is in PUBLIC_EXACT_API_PATHS — deliberately exact-match so the sibling /api/subscribe/session and /portal-session stay authenticated. · RLS class `A` · entitlement `none`

**5. What archetype, and why that one?**

`WIZARD_STEP` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/02-web-admin/20_stripe_web_checkout.md`](../../../docs/specs/02-web-admin/20_stripe_web_checkout.md) · anchors: `docs/specs/02-web-admin/20_stripe_web_checkout.md §3.2` · `docs/specs/02-web-admin/20_stripe_web_checkout.md §3.1` · `docs/specs/02-web-admin/20_stripe_web_checkout.md §3.3` · `docs/specs/03-mobile/96_mobile_subscription.md §6`

**8. What is still unresearched?**

**7 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 12 entr(ies) in feature `F12`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-052"></a>

## Card 46 — `S-052` `web_subscribe_cancel`

Registry detail: [`S-052`](../../../docs/reports/generated/127-surface-registry.md#s-052) `web_subscribe_cancel`.

`SURFACE` · `STATIC` · scope `platform_shared` · feature `F12` subscription-billing · build order 3123 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Where the payment provider sends the user if they back out of paying. It is a single reassuring message: no charge was made, and to try again they should return to the mobile app and tap the subscribe link. It fetches nothing and changes nothing.

**2. Which tables and columns, produced by which step?**

_No table is reached by this entry — every value it shows arrives through a contract, or it shows no server data at all._

**3. Which contracts, and who calls them?**

It reaches no contract — every value is local, a prop, or device state.

**4. What gate, role or entitlement stands in front of it?**

session `anon` — /subscribe/cancel is in PUBLIC_PATHS as a Stripe redirect target for a sessionless visitor, and the lock pins it public. · RLS class `none` · entitlement `none`

**5. What archetype, and why that one?**

`STATIC` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/02-web-admin/20_stripe_web_checkout.md`](../../../docs/specs/02-web-admin/20_stripe_web_checkout.md) · anchors: `docs/specs/02-web-admin/20_stripe_web_checkout.md §3.2` · `docs/specs/02-web-admin/20_stripe_web_checkout.md §3.3`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 12 entr(ies) in feature `F12`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-053"></a>

## Card 47 — `S-053` `web_subscribe_success`

Registry detail: [`S-053`](../../../docs/reports/generated/127-surface-registry.md#s-053) `web_subscribe_success`.

`SURFACE` · `WIZARD_STEP` · scope `platform_shared` · feature `F12` subscription-billing · build order 3123 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Where the payment provider sends the user after a successful payment. It confirms the payment was received, then checks the account a few times over about twelve seconds to see whether the upgrade has landed. If it has, it says so; if the check cannot run (the mobile hand-off visitor has no web login) or the upgrade has not appeared yet, it says the account will be active shortly and to return to the app. It never claims the account is active before the server confirms it, and never claims failure.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `user_profiles` | `subscription_status` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/02-web-admin/20_stripe_web_checkout.md §4` |
| reads | `entitlements` | **UNRESEARCHED** | `user_id` · `product` · `status` · `stripe_subscription_id` · `current_period_end` · `trial_started_at` · `last_stripe_event_at` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/116_multi_product_architecture.md §4` |

**3. Which contracts, and who calls them?**

Calls 1: `/api/user-profile`

**4. What gate, role or entitlement stands in front of it?**

session `anon` — /subscribe/success is in PUBLIC_PATHS because Stripe redirects a sessionless mobile-handoff visitor here; the lock pins it public alongside /subscribe and /subscribe/cancel. · RLS class `A` · entitlement `none`

**5. What archetype, and why that one?**

`WIZARD_STEP` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/02-web-admin/20_stripe_web_checkout.md`](../../../docs/specs/02-web-admin/20_stripe_web_checkout.md) · anchors: `docs/specs/02-web-admin/20_stripe_web_checkout.md §3.2` · `docs/specs/02-web-admin/20_stripe_web_checkout.md §3.3` · `docs/specs/02-web-admin/20_stripe_web_checkout.md §4` · `docs/specs/03-mobile/96_mobile_subscription.md §6`

**8. What is still unresearched?**

**6 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 12 entr(ies) in feature `F12`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-c-006"></a>

## Card 48 — `C-006` `contract_admin_notifications`

Registry detail: [`C-006`](../../../docs/reports/generated/127-surface-registry.md#c-006) `contract_admin_notifications`.

`CONTRACT` · `QUERY` · scope `platform_shared` · feature `F13` notifications · build order 3132 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Shows an admin the log of push notifications sent to users, newest first and paginated, and — when a specific user is selected — that user's registered devices, notification preferences, and the current on/off switches for the notification system.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `device_tokens` | `push_token` · `platform` · `updated_at` · `user_id` | `id` · `user_id` · `push_token` · `platform` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/03-mobile/92_mobile_engagement_hardware.md` |
| reads | `logic_variables` | `variable_key` · `variable_value` · `variable_value_json` | `variable_key` · `variable_value` · `description` · `updated_at` · `variable_value_json` | `none` | `n/a` | `docs/specs/02-web-admin/86_control_panel.md` |
| reads | `notification_dispatches` | `id` · `user_id` · `lead_id` · `type` · `toronto_date` · `push_token` · `expo_ticket_id` · `status` · `detail` · `dispatched_at` | `id` · `user_id` · `lead_id` · `type` · `toronto_date` · `push_token` · `expo_ticket_id` · `status` · `detail` · `dispatched_at` · `receipt_checked_at` | `none` | `n/a` | `docs/specs/01-pipeline/101_notification_dispatch.md` |
| reads | `notifications` | `title` · `body` · `user_id` · `type` · `lead_id` · `created_at` | `id` · `user_id` · `type` · `title` · `body` · `permit_num` · `trade_slug` · `channel` · `is_read` · `is_sent` · `sent_at` · `created_at` · `lead_id` | `classify_lifecycle_phase` · `update_tracked_projects` | `permits[23], coa[12] · permits[28]` | `docs/specs/01-pipeline/41_chain_permits.md` |
| reads | `profiles` | `id` · `is_admin` | `id` · `is_admin` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/114_rls_policy_catalog.md` |
| reads | `user_profiles` | `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `new_lead_min_cost_tier` · `user_id` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/02-web-admin/102_admin_notifications_tool.md` |

**3. Which contracts, and who calls them?**

Called by 2: `admin_user_detail` · `admin_notifications`

**4. What gate, role or entitlement stands in front of it?**

session `admin` — classifyRoute("/api/admin/notifications") returns "admin" (executed 2026-09-15); the handler re-verifies the caller in-process. · RLS class `A` · entitlement `none`

**5. What archetype, and why that one?**

`QUERY` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/02-web-admin/102_admin_notifications_tool.md`](../../../docs/specs/02-web-admin/102_admin_notifications_tool.md) · anchors: `src/app/api/admin/notifications/route.ts:1 — docs/specs/02-web-admin/102_admin_notifications_tool.md §2`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 7 entr(ies) in feature `F13`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-c-007"></a>

## Card 49 — `C-007` `contract_admin_notifications_test_send`

Registry detail: [`C-007`](../../../docs/reports/generated/127-surface-registry.md#c-007) `contract_admin_notifications_test_send`.

`CONTRACT` · `COMMAND` · scope `platform_shared` · feature `F13` notifications · build order 3132 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Lets an admin send one real test push notification to a specific device or user to verify the notification pipeline works end to end, without it counting against that user's daily notification limit or appearing in the normal send history.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `device_tokens` | `push_token` · `user_id` · `updated_at` | `id` · `user_id` · `push_token` · `platform` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/03-mobile/92_mobile_engagement_hardware.md` |
| reads | `profiles` | `id` · `is_admin` | `id` · `is_admin` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/114_rls_policy_catalog.md` |

**3. Which contracts, and who calls them?**

Called by 1: `admin_notifications`

**4. What gate, role or entitlement stands in front of it?**

session `admin` — classifyRoute("/api/admin/notifications/test-send") returns "admin" (executed 2026-09-15); the handler re-verifies the caller in-process. · RLS class `A` · entitlement `none`

**5. What archetype, and why that one?**

`COMMAND` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/02-web-admin/102_admin_notifications_tool.md`](../../../docs/specs/02-web-admin/102_admin_notifications_tool.md) · anchors: `src/app/api/admin/notifications/test-send/route.ts:1 — docs/specs/02-web-admin/102_admin_notifications_tool.md §2 + §3`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 7 entr(ies) in feature `F13`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-c-023"></a>

## Card 50 — `C-023` `contract_notifications`

Registry detail: [`C-023`](../../../docs/reports/generated/127-surface-registry.md#c-023) `contract_notifications`.

`CONTRACT` · `MUTATION` · scope `platform_shared` · feature `F13` notifications · build order 3132 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Shows a user their own notification inbox, optionally filtered to unread only, and lets them mark one notification or all of their notifications as read.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `notifications` | `all` | `id` · `user_id` · `type` · `title` · `body` · `permit_num` · `trade_slug` · `channel` · `is_read` · `is_sent` · `sent_at` · `created_at` · `lead_id` | `classify_lifecycle_phase` · `update_tracked_projects` | `permits[23], coa[12] · permits[28]` | `docs/specs/01-pipeline/41_chain_permits.md` |
| writes | `notifications` | `is_read` | `id` · `user_id` · `type` · `title` · `body` · `permit_num` · `trade_slug` · `channel` · `is_read` · `is_sent` · `sent_at` · `created_at` · `lead_id` | `classify_lifecycle_phase` · `update_tracked_projects` | `permits[23], coa[12] · permits[28]` | `docs/specs/01-pipeline/41_chain_permits.md` |

**3. Which contracts, and who calls them?**

**Nothing calls it.** An orphan contract — the exact shape this registry exists to surface.

**4. What gate, role or entitlement stands in front of it?**

session `authenticated` — classifyRoute("/api/notifications") returns "authenticated" (executed 2026-09-15); the handler re-verifies the caller in-process. · RLS class `A` · entitlement `none`

**5. What archetype, and why that one?**

`MUTATION` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/01-pipeline/101_notification_dispatch.md`](../../../docs/specs/01-pipeline/101_notification_dispatch.md) · anchors: `docs/specs/01-pipeline/101_notification_dispatch.md §3 (Auth Matrix) — src/app/api/notifications/route.ts:1`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 7 entr(ies) in feature `F13`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-c-024"></a>

## Card 51 — `C-024` `contract_notifications_preferences`

Registry detail: [`C-024`](../../../docs/reports/generated/127-surface-registry.md#c-024) `contract_notifications_preferences`.

`CONTRACT` · `MUTATION` · scope `platform_shared` · feature `F13` notifications · build order 3132 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Lets a user see and change their notification settings: which kinds of alerts they receive (new leads above a cost threshold, construction phase changes, stalled jobs, urgent start dates) and what time of day they want them delivered.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `user_profiles` | `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `user_id` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/02-web-admin/102_admin_notifications_tool.md` |
| writes | `user_profiles` | `user_id` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `updated_at` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/02-web-admin/102_admin_notifications_tool.md` |

**3. Which contracts, and who calls them?**

Called by 1: `mobile_settings`

**4. What gate, role or entitlement stands in front of it?**

session `authenticated` — classifyRoute("/api/notifications/preferences") returns "authenticated" (executed 2026-09-15); the handler re-verifies the caller in-process. · RLS class `A` · entitlement `none`

**5. What archetype, and why that one?**

`MUTATION` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/03-mobile/92_mobile_engagement_hardware.md`](../../../docs/specs/03-mobile/92_mobile_engagement_hardware.md) · anchors: `docs/specs/03-mobile/92_mobile_engagement_hardware.md §2.3; docs/specs/03-mobile/99_mobile_state_architecture.md §9.14 — src/app/api/notifications/preferences/route.ts:1-2`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 7 entr(ies) in feature `F13`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-c-025"></a>

## Card 52 — `C-025` `contract_notifications_register`

Registry detail: [`C-025`](../../../docs/reports/generated/127-surface-registry.md#c-025) `contract_notifications_register`.

`CONTRACT` · `MUTATION` · scope `platform_shared` · feature `F13` notifications · build order 3132 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Registers a phone for push notifications by saving its device token against the signed-in user's account. Safe to call again — after an app reinstall, say — without creating duplicates.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| writes | `device_tokens` | `user_id` · `push_token` · `platform` · `created_at` · `updated_at` | `id` · `user_id` · `push_token` · `platform` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/03-mobile/92_mobile_engagement_hardware.md` |

**3. Which contracts, and who calls them?**

Called by 1: `mobile/src/lib/pushTokens.ts`

**4. What gate, role or entitlement stands in front of it?**

session `authenticated` — classifyRoute("/api/notifications/register") returns "authenticated" (executed 2026-09-15); the handler re-verifies the caller in-process. · RLS class `A` · entitlement `none`

**5. What archetype, and why that one?**

`MUTATION` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/03-mobile/92_mobile_engagement_hardware.md`](../../../docs/specs/03-mobile/92_mobile_engagement_hardware.md) · anchors: `docs/specs/03-mobile/92_mobile_engagement_hardware.md §3 Payload Schema — src/app/api/notifications/register/route.ts:1`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 7 entr(ies) in feature `F13`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-022"></a>

## Card 53 — `S-022` `admin_notifications`

Registry detail: [`S-022`](../../../docs/reports/generated/127-surface-registry.md#s-022) `admin_notifications`.

`SURFACE` · `LIST` · scope `platform_shared` · feature `F13` notifications · build order 3133 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

The operator's window on push notifications. It lists what was sent, to whom, when and of what type, with device identifiers partly hidden, and lets the operator fire a real test notification to a chosen device and see the delivery receipt. It also shows, read-only, whether notifications are currently switched off or throttled, linking to the control panel for the one place those settings can actually be changed.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `notification_dispatches` | `id` · `user_id` · `lead_id` · `type` · `toronto_date` · `push_token` · `expo_ticket_id` · `status` · `detail` · `dispatched_at` | `id` · `user_id` · `lead_id` · `type` · `toronto_date` · `push_token` · `expo_ticket_id` · `status` · `detail` · `dispatched_at` · `receipt_checked_at` | `none` | `n/a` | `docs/specs/00-architecture/114_rls_policy_catalog.md §3.1` |
| reads | `notifications` | `title` · `body` · `user_id` · `type` · `lead_id` · `created_at` | `id` · `user_id` · `type` · `title` · `body` · `permit_num` · `trade_slug` · `channel` · `is_read` · `is_sent` · `sent_at` · `created_at` · `lead_id` | `classify_lifecycle_phase` · `update_tracked_projects` | `permits[23]` | `docs/specs/00-architecture/01_database_schema.md §3` |
| reads | `device_tokens` | `push_token` · `platform` · `updated_at` · `user_id` | `id` · `user_id` · `push_token` · `platform` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/114_rls_policy_catalog.md §3.1` |
| reads | `user_profiles` | `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `new_lead_min_cost_tier` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/00-architecture/114_rls_policy_catalog.md §3.1` |
| reads | `logic_variables` | `variable_key` · `variable_value` · `variable_value_json` | `variable_key` · `variable_value` · `description` · `updated_at` · `variable_value_json` | `none` | `n/a` | `docs/specs/02-web-admin/86_control_panel.md §1` |
| reads | `profiles` | `is_admin` | `id` · `is_admin` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/114_rls_policy_catalog.md §5` |

**3. Which contracts, and who calls them?**

Calls 2: `/api/admin/notifications` · `/api/admin/notifications/test-send`

**4. What gate, role or entitlement stands in front of it?**

session `admin` — There is no admin Postgres role: classifyRoute sends every /admin/* path down the admin arm, and the real boundary is verifyAdminAuth reading profiles.is_admin on the route. Both contracts call it on their first line, and test-send additionally requires authMethod === "session", so neither a CI token nor a break-glass key can fire a push. · RLS class `A` · entitlement `none`

**5. What archetype, and why that one?**

`LIST` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/02-web-admin/102_admin_notifications_tool.md`](../../../docs/specs/02-web-admin/102_admin_notifications_tool.md) · anchors: `docs/specs/02-web-admin/102_admin_notifications_tool.md §2` · `docs/specs/02-web-admin/102_admin_notifications_tool.md §3` · `docs/specs/02-web-admin/102_admin_notifications_tool.md §4` · `docs/specs/02-web-admin/86_control_panel.md §1`

**8. What is still unresearched?**

**4 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 7 entr(ies) in feature `F13`. Removing it deletes 1 owned component(s): `src/components/admin/NotificationsTool.tsx`. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-041"></a>

## Card 54 — `S-041` `overlay_notification_permission_modal`

Registry detail: [`S-041`](../../../docs/reports/generated/127-surface-registry.md#s-041) `overlay_notification_permission_modal`.

`SURFACE` · `GATE` · scope `platform_shared` · feature `F13` notifications · build order 3133 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

A panel shown once, right after a user saves their first job, asking whether they would like alerts when their saved jobs change. Saying yes then triggers the phone's own permission prompt; saying 'maybe later' dismisses it without asking the operating system anything. Both choices are given the same visual weight so neither feels like the forced option.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| writes | `device_tokens` | `user_id` · `push_token` · `platform` · `updated_at` | `id` · `user_id` · `push_token` · `platform` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/03-mobile/92_mobile_engagement_hardware.md` |

**3. Which contracts, and who calls them?**

It reaches no contract — every value is local, a prop, or device state.

**4. What gate, role or entitlement stands in front of it?**

session `authenticated` — It can only appear after a save, which requires a session; the registration route is under the authenticated /api/notifications prefix. · RLS class `A` · entitlement `none`

**5. What archetype, and why that one?**

`GATE` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/03-mobile/92_mobile_engagement_hardware.md`](../../../docs/specs/03-mobile/92_mobile_engagement_hardware.md) · anchors: `docs/specs/03-mobile/92_mobile_engagement_hardware.md §4.1` · `docs/specs/03-mobile/90_mobile_engineering_protocol.md §5`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 7 entr(ies) in feature `F13`. Removing it deletes 1 owned component(s): `mobile/src/components/shared/NotificationPermissionModal.tsx`. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-042"></a>

## Card 55 — `S-042` `overlay_offline_banner`

Registry detail: [`S-042`](../../../docs/reports/generated/127-surface-registry.md#s-042) `overlay_offline_banner`.

`SURFACE` · `STATIC` · scope `platform_shared` · feature `F14` navigation-shells · build order 3143 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

A thin amber strip that slides into view at the top of a screen when the phone loses its connection. It tells the user they are offline and how long ago the data they are looking at was last refreshed, which matters when someone is making a real decision from a cached list. When there is no cached data at all it says so instead.

**2. Which tables and columns, produced by which step?**

_No table is reached by this entry — every value it shows arrives through a contract, or it shows no server data at all._

**3. Which contracts, and who calls them?**

It reaches no contract — every value is local, a prop, or device state.

**4. What gate, role or entitlement stands in front of it?**

session `authenticated` — It is mounted on the four gated tab screens only; the auth and onboarding groups do not render it. · RLS class `none` · entitlement `none`

**5. What archetype, and why that one?**

`STATIC` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/03-mobile/90_mobile_engineering_protocol.md`](../../../docs/specs/03-mobile/90_mobile_engineering_protocol.md) · anchors: `docs/specs/03-mobile/77_mobile_crm_flight_board.md §4.2` · `docs/specs/03-mobile/90_mobile_engineering_protocol.md §12`

**8. What is still unresearched?**

**1 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 4 entr(ies) in feature `F14`. Removing it deletes 1 owned component(s): `mobile/src/components/shared/OfflineBanner.tsx`. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-045"></a>

## Card 56 — `S-045` `shell_app_root`

Registry detail: [`S-045`](../../../docs/reports/generated/127-surface-registry.md#s-045) `shell_app_root`.

`SURFACE` · `SHELL` · scope `platform_shared` · feature `F14` navigation-shells · build order 3143 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

The outermost wrapper every screen sits inside. It decides, on each launch, whether to send the user to sign-in, into setup, or into the app proper, based on what the server says about their account. It also catches confirmation links from email, handles incoming push notifications by showing an in-app banner or jumping to the right screen, and offers people whose account is scheduled for deletion a chance to reactivate it.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `user_profiles` | `user_id` · `onboarding_complete` · `account_preset` · `trade_slug` · `account_deleted_at` · `lead_views_count` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/03-mobile/95_mobile_user_profiles.md` |
| reads | `entitlements` | `user_id` · `product` · `status` · `trial_started_at` | `user_id` · `product` · `status` · `stripe_subscription_id` · `current_period_end` · `trial_started_at` · `last_stripe_event_at` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/116_multi_product_architecture.md` |
| writes | `user_profiles` | `user_id` · `account_deleted_at` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/03-mobile/95_mobile_user_profiles.md` |
| writes | `entitlements` | `user_id` · `product` · `status` · `trial_started_at` | `user_id` · `product` · `status` · `stripe_subscription_id` · `current_period_end` · `trial_started_at` · `last_stripe_event_at` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/116_multi_product_architecture.md` |
| writes | `device_tokens` | `user_id` · `push_token` · `platform` · `updated_at` | `id` · `user_id` · `push_token` · `platform` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/03-mobile/92_mobile_engagement_hardware.md` |

**3. Which contracts, and who calls them?**

Calls 2: `/api/user-profile` · `/api/user-profile/reactivate` (idiom: both)

**4. What gate, role or entitlement stands in front of it?**

session `anon` — It is the only surface that runs before a session exists — it IS the session gate, routing an unauthenticated user to /(auth)/sign-in and an authenticated one onward. · RLS class `A` · entitlement `none`

**5. What archetype, and why that one?**

`SHELL` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/03-mobile/93_mobile_auth.md`](../../../docs/specs/03-mobile/93_mobile_auth.md) · anchors: `docs/specs/03-mobile/93_mobile_auth.md §3.6` · `docs/specs/03-mobile/93_mobile_auth.md §5` · `docs/specs/03-mobile/95_mobile_user_profiles.md §4` · `docs/specs/03-mobile/99_mobile_state_architecture.md §5.3` · `docs/specs/03-mobile/99_mobile_state_architecture.md §2.1` · `docs/specs/03-mobile/92_mobile_engagement_hardware.md §4.2`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 4 entr(ies) in feature `F14`. Removing it deletes 1 owned component(s): `mobile/src/components/shared/NotificationToast.tsx`. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-046"></a>

## Card 57 — `S-046` `shell_app_tabs`

Registry detail: [`S-046`](../../../docs/reports/generated/127-surface-registry.md#s-046) `shell_app_tabs`.

`SURFACE` · `SHELL` · scope `platform_shared` · feature `F14` navigation-shells · build order 3143 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

The five-tab bar every signed-in screen hangs off: feed, saved jobs, map, parcels, and settings. Before showing any of it, this layer checks whether the user's subscription is still good and puts up the upgrade screen instead when the trial has run out. It also carries the unread badge on the saved-jobs tab, slides the bar out of the way when the user scrolls down, and signs out anyone whose account is pending deletion.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `user_profiles` | `user_id` · `lead_views_count` · `onboarding_complete` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/03-mobile/95_mobile_user_profiles.md` |
| reads | `entitlements` | `user_id` · `product` · `status` · `trial_started_at` | `user_id` · `product` · `status` · `stripe_subscription_id` · `current_period_end` · `trial_started_at` · `last_stripe_event_at` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/116_multi_product_architecture.md` |

**3. Which contracts, and who calls them?**

Calls 1: `/api/user-profile` (idiom: hook)

**4. What gate, role or entitlement stands in front of it?**

session `entitled` — It is the entitlement gate for the whole app: trial/active/past_due/admin_managed render the tabs, expired renders the paywall or the inline blur, cancelled_pending_deletion signs the user out, and a null status renders the loading guard. · RLS class `A` · entitlement `lead_gen`

**5. What archetype, and why that one?**

`SHELL` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/03-mobile/96_mobile_subscription.md`](../../../docs/specs/03-mobile/96_mobile_subscription.md) · anchors: `docs/specs/03-mobile/96_mobile_subscription.md §10` · `docs/specs/03-mobile/96_mobile_subscription.md §9` · `docs/specs/03-mobile/91_mobile_lead_feed.md §2` · `docs/specs/03-mobile/99_mobile_state_architecture.md §6.5` · `docs/specs/03-mobile/92_mobile_engagement_hardware.md §4.4`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 4 entr(ies) in feature `F14`. Removing it deletes 1 owned component(s): `mobile/src/components/onboarding/IncompleteBanner.tsx`. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-049"></a>

## Card 58 — `S-049` `shell_web_root`

Registry detail: [`S-049`](../../../docs/reports/generated/127-surface-registry.md#s-049) `shell_web_root`.

`SURFACE` · `SHELL` · scope `platform_shared` · feature `F14` navigation-shells · build order 3143 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

The outermost wrapper every web page renders inside. It sets the browser tab title and description for the whole site and switches on two background services that all pages then share: a cache that remembers fetched data between page visits, and the usage-tracking hookup. It shows nothing of its own - visitors never see it as a page.

**2. Which tables and columns, produced by which step?**

_No table is reached by this entry — every value it shows arrives through a contract, or it shows no server data at all._

**3. Which contracts, and who calls them?**

It reaches no contract — every value is local, a prop, or device state.

**4. What gate, role or entitlement stands in front of it?**

session `anon` — It wraps every route, including the public ones, so it renders for a visitor with no session at all — classifyRoute('/') is 'public'. · RLS class `none` · entitlement `none`

**5. What archetype, and why that one?**

`SHELL` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/archive/75_lead_feed_implementation_guide.md`](../../../docs/specs/archive/75_lead_feed_implementation_guide.md) · anchors: `docs/specs/archive/75_lead_feed_implementation_guide.md §11 Phase 3 (the provider composition)` · `docs/specs/archive/75_lead_feed_implementation_guide.md §7a` · `docs/specs/archive/75_lead_feed_implementation_guide.md §13` · `docs/specs/02-web-admin/126_maxbld_surface_standard.md §3.1 (the SHELL archetype)`

**8. What is still unresearched?**

**3 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 4 entr(ies) in feature `F14`. Removing it deletes 1 owned component(s): `src/components/observability/PostHogProvider.tsx`. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-c-027"></a>

## Card 59 — `C-027` `contract_products`

Registry detail: [`C-027`](../../../docs/reports/generated/127-surface-registry.md#c-027) `contract_products`.

`CONTRACT` · `QUERY` · scope `platform_shared` · feature `F15` user-profile-settings · build order 3152 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Returns the fixed list of construction product and material categories the app uses to classify permits, for populating a filter dropdown. No user data or database is involved.

**2. Which tables and columns, produced by which step?**

_No table is reached by this entry — every value it shows arrives through a contract, or it shows no server data at all._

**3. Which contracts, and who calls them?**

**Nothing calls it.** An orphan contract — the exact shape this registry exists to surface.

**4. What gate, role or entitlement stands in front of it?**

session `anon` — classifyRoute("/api/products") returns "public" (executed 2026-09-15); the handler adds no check of its own, so middleware is the only gate. · RLS class `none` · entitlement `none`

**5. What archetype, and why that one?**

`QUERY` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: **UNRESEARCHED** — no SPEC LINK header and no System Map row, so there is nothing to check it against · anchors: `UNRESEARCHED — src/app/api/products/route.ts carries no SPEC LINK header and no System Map row lists it (docs/specs/00-architecture/00_system_map.md, searched 2026-09-15); guessing the nearest spec would be an invention`

**8. What is still unresearched?**

**4 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 6 entr(ies) in feature `F15`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-c-034"></a>

## Card 60 — `C-034` `contract_trades`

Registry detail: [`C-034`](../../../docs/reports/generated/127-surface-registry.md#c-034) `contract_trades`.

`CONTRACT` · `QUERY` · scope `platform_shared` · feature `F15` user-profile-settings · build order 3152 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Returns the fixed list of construction trades — electrical, plumbing, roofing and so on — the app uses to classify permits, for populating a filter dropdown. No user data or database is involved.

**2. Which tables and columns, produced by which step?**

_No table is reached by this entry — every value it shows arrives through a contract, or it shows no server data at all._

**3. Which contracts, and who calls them?**

Called by 1: `web_dashboard`

**4. What gate, role or entitlement stands in front of it?**

session `anon` — classifyRoute("/api/trades") returns "public" (executed 2026-09-15); the handler adds no check of its own, so middleware is the only gate. · RLS class `none` · entitlement `none`

**5. What archetype, and why that one?**

`QUERY` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/00-architecture/06_permits_rest_api.md`](../../../docs/specs/00-architecture/06_permits_rest_api.md) · anchors: `docs/specs/00-architecture/06_permits_rest_api.md — owns src/app/api/trades/route.ts per docs/specs/00-architecture/00_system_map.md:13; the System Map row names no section, and the route file carries no SPEC LINK header`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 6 entr(ies) in feature `F15`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-c-035"></a>

## Card 61 — `C-035` `contract_user_profile`

Registry detail: [`C-035`](../../../docs/reports/generated/127-surface-registry.md#c-035) `contract_user_profile`.

`CONTRACT` · `MUTATION` · scope `platform_shared` · feature `F15` user-profile-settings · build order 3152 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Lets a signed-in user view their own profile and free-trial status — viewing it auto-starts or auto-expires the trial as a side effect — and update profile fields such as name, phone, location, trade and notification preferences. A couple of one-time fields (trade selection, terms acceptance) can only be set once and then lock.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `entitlements` | `status (aliased subscription_status)` · `trial_started_at` | `user_id` · `product` · `status` · `stripe_subscription_id` · `current_period_end` · `trial_started_at` · `last_stripe_event_at` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/116_multi_product_architecture.md` |
| reads | `user_profiles` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `radius_cap_km` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/02-web-admin/102_admin_notifications_tool.md` |
| writes | `entitlements` | `user_id` · `product` · `status` · `trial_started_at` · `created_at` · `updated_at` | `user_id` · `product` · `status` · `stripe_subscription_id` · `current_period_end` · `trial_started_at` · `last_stripe_event_at` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/116_multi_product_architecture.md` |
| writes | `user_profiles` | `user_id` · `trade_slug` · `full_name` · `phone_number` · `company_name` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `supplier_selection` · `onboarding_complete` · `tos_accepted_at` · `radius_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `account_preset` · `updated_at` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/02-web-admin/102_admin_notifications_tool.md` |

**3. Which contracts, and who calls them?**

Called by 8: `mobile/src/hooks/useUserProfile.ts` · `mobile/src/hooks/usePatchProfile.ts` · `mobile_onboarding_address` · `mobile_onboarding_complete` · `mobile_onboarding_profession` · `mobile_onboarding_supplier` · `mobile_onboarding_terms` · `web_subscribe_success`

**4. What gate, role or entitlement stands in front of it?**

session `authenticated` — classifyRoute("/api/user-profile") returns "authenticated" (executed 2026-09-15); the handler re-verifies the caller in-process. · RLS class `A` · entitlement `none`

**5. What archetype, and why that one?**

`MUTATION` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/03-mobile/95_mobile_user_profiles.md`](../../../docs/specs/03-mobile/95_mobile_user_profiles.md) · anchors: `docs/specs/03-mobile/95_mobile_user_profiles.md §5 API Contract, §6 Route Logic + docs/specs/03-mobile/96_mobile_subscription.md §10 Step 4 + docs/specs/00-architecture/116_multi_product_architecture.md §4 N2 + OD5 (src/app/api/user-profile/route.ts:1-3)`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 6 entr(ies) in feature `F15`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-c-036"></a>

## Card 62 — `C-036` `contract_user_profile_delete`

Registry detail: [`C-036`](../../../docs/reports/generated/127-surface-registry.md#c-036) `contract_user_profile_delete`.

`CONTRACT` · `MUTATION` · scope `platform_shared` · feature `F15` user-profile-settings · build order 3152 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Lets a signed-in user request deletion of their own account. It marks the account and every subscription on it as pending deletion, schedules any active billing to stop at the end of the period they already paid for, and opens a 30-day window during which they can change their mind and reactivate.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `user_profiles` | `account_deleted_at` · `stripe_customer_id` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/02-web-admin/102_admin_notifications_tool.md` |
| writes | `entitlements` | `status` · `updated_at` | `user_id` · `product` · `status` · `stripe_subscription_id` · `current_period_end` · `trial_started_at` · `last_stripe_event_at` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/116_multi_product_architecture.md` |
| writes | `user_profiles` | `account_deleted_at` · `updated_at` · `stripe_cancel_failed_at` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/02-web-admin/102_admin_notifications_tool.md` |

**3. Which contracts, and who calls them?**

**Nothing calls it.** An orphan contract — the exact shape this registry exists to surface.

**4. What gate, role or entitlement stands in front of it?**

session `authenticated` — classifyRoute("/api/user-profile/delete") returns "authenticated" (executed 2026-09-15); the handler re-verifies the caller in-process. · RLS class `A` · entitlement `none`

**5. What archetype, and why that one?**

`MUTATION` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/03-mobile/95_mobile_user_profiles.md`](../../../docs/specs/03-mobile/95_mobile_user_profiles.md) · anchors: `docs/specs/03-mobile/95_mobile_user_profiles.md §5 API Contract §6.3 Deletion + docs/specs/02-web-admin/20_stripe_web_checkout.md §6 (src/app/api/user-profile/delete/route.ts:1-2)`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 6 entr(ies) in feature `F15`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-c-037"></a>

## Card 63 — `C-037` `contract_user_profile_reactivate`

Registry detail: [`C-037`](../../../docs/reports/generated/127-surface-registry.md#c-037) `contract_user_profile_reactivate`.

`CONTRACT` · `MUTATION` · scope `platform_shared` · feature `F15` user-profile-settings · build order 3152 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Lets a user who deleted their account within the last 30 days restore it, giving back exactly the access their real current subscription status supports for each product — rather than assuming they are still subscribed.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `entitlements` | `status (aliased subscription_status)` · `trial_started_at` | `user_id` · `product` · `status` · `stripe_subscription_id` · `current_period_end` · `trial_started_at` · `last_stripe_event_at` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/116_multi_product_architecture.md` |
| reads | `logic_variables` | `variable_value_json` | `variable_key` · `variable_value` · `description` · `updated_at` · `variable_value_json` | `none` | `n/a` | `docs/specs/02-web-admin/86_control_panel.md` |
| reads | `user_profiles` | `account_deleted_at` · `account_preset` · `stripe_customer_id` · `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `onboarding_complete` · `tos_accepted_at` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/02-web-admin/102_admin_notifications_tool.md` |
| writes | `entitlements` | `user_id` · `product` · `status` · `created_at` · `updated_at` · `last_stripe_event_at` | `user_id` · `product` · `status` · `stripe_subscription_id` · `current_period_end` · `trial_started_at` · `last_stripe_event_at` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/116_multi_product_architecture.md` |
| writes | `user_profiles` | `account_deleted_at` · `stripe_cancel_failed_at` · `updated_at` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/02-web-admin/102_admin_notifications_tool.md` |

**3. Which contracts, and who calls them?**

Called by 1: `shell_app_root`

**4. What gate, role or entitlement stands in front of it?**

session `authenticated` — classifyRoute("/api/user-profile/reactivate") returns "authenticated" (executed 2026-09-15); the handler re-verifies the caller in-process. · RLS class `A` · entitlement `none`

**5. What archetype, and why that one?**

`MUTATION` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/03-mobile/95_mobile_user_profiles.md`](../../../docs/specs/03-mobile/95_mobile_user_profiles.md) · anchors: `docs/specs/03-mobile/95_mobile_user_profiles.md §5 API Contract §6.4 Reactivation + docs/specs/00-architecture/116_multi_product_architecture.md §4 N2 + OD3/OD5 (src/app/api/user-profile/reactivate/route.ts:1-2)`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 6 entr(ies) in feature `F15`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-036"></a>

## Card 64 — `S-036` `mobile_settings`

Registry detail: [`S-036`](../../../docs/reports/generated/127-surface-registry.md#s-036) `mobile_settings`.

`SURFACE` · `FORM` · scope `platform_shared` · feature `F15` user-profile-settings · build order 3153 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Where the user reviews their trade, changes how far out they want to see jobs, and chooses which alerts reach them and when. It also tells them if the phone's operating system is blocking notifications and offers a way to fix that, gives paying users a link into the billing portal to cancel or change payment, and holds the sign-out button.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `user_profiles` | `user_id` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `radius_km` · `radius_cap_km` · `account_preset` · `stripe_customer_id` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/03-mobile/95_mobile_user_profiles.md` |
| reads | `entitlements` | `user_id` · `product` · `status` · `trial_started_at` | `user_id` · `product` · `status` · `stripe_subscription_id` · `current_period_end` · `trial_started_at` · `last_stripe_event_at` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/116_multi_product_architecture.md` |
| writes | `user_profiles` | `user_id` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `radius_km` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/03-mobile/95_mobile_user_profiles.md` |

**3. Which contracts, and who calls them?**

Calls 3: `/api/notifications/preferences` · `/api/user-profile` · `/api/subscribe/portal-session` (idiom: both)

**4. What gate, role or entitlement stands in front of it?**

session `authenticated` — /api/notifications and /api/user-profile are both authenticated prefixes; the portal-session route is under /api/subscribe, which is listed explicitly in AUTHENTICATED_API_ROUTES rather than relying on the fail-closed default. · RLS class `A` · entitlement `none`

**5. What archetype, and why that one?**

`FORM` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/03-mobile/97_mobile_settings_notifications_offboarding.md`](../../../docs/specs/03-mobile/97_mobile_settings_notifications_offboarding.md) · anchors: `docs/specs/03-mobile/92_mobile_engagement_hardware.md §2.3` · `docs/specs/03-mobile/93_mobile_auth.md §5` · `docs/specs/03-mobile/96_mobile_subscription.md §7` · `docs/specs/03-mobile/99_mobile_state_architecture.md §9.16`

**8. What is still unresearched?**

**1 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 6 entr(ies) in feature `F15`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-c-003"></a>

## Card 65 — `C-003` `contract_admin_app_health`

Registry detail: [`C-003`](../../../docs/reports/generated/127-surface-registry.md#c-003) `contract_admin_app_health`.

`CONTRACT` · `QUERY` · scope `platform_shared` · feature `F16` platform-admin · build order 3162 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Powers the admin App Health Dashboard: pulls together five live health signals about the mobile app (crash rate, sign-in success rate, how often people save a lead after viewing one, how often they convert on the paywall, and cache-refresh activity) so the team can see at a glance whether the app is working properly for users.

**2. Which tables and columns, produced by which step?**

_No table is reached by this entry — every value it shows arrives through a contract, or it shows no server data at all._

**3. Which contracts, and who calls them?**

Called by 1: `src/features/admin-app-health/api/useAppHealth.ts`

**4. What gate, role or entitlement stands in front of it?**

session `admin` — classifyRoute("/api/admin/app-health") returns "admin" (executed 2026-09-15); the handler re-verifies the caller in-process. · RLS class `none` · entitlement `none`

**5. What archetype, and why that one?**

`QUERY` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/02-web-admin/30_app_health_dashboard.md`](../../../docs/specs/02-web-admin/30_app_health_dashboard.md) · anchors: `docs/specs/02-web-admin/30_app_health_dashboard.md §2.2 + §2.6 (src/app/api/admin/app-health/route.ts:1)`

**8. What is still unresearched?**

**4 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 27 entr(ies) in feature `F16`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-c-004"></a>

## Card 66 — `C-004` `contract_admin_control_panel_configs`

Registry detail: [`C-004`](../../../docs/reports/generated/127-surface-registry.md#c-004) `contract_admin_control_panel_configs`.

`CONTRACT` · `MUTATION` · scope `platform_shared` · feature `F16` platform-admin · build order 3162 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Lets an admin view every tunable business setting the pricing and forecasting engine uses — cost rates, trade timing windows, scope allocation percentages — and save edits to them, which the pipeline picks up on its next run.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `logic_variables` | `variable_key` · `variable_value` · `variable_value_json` · `description` · `updated_at` | `variable_key` · `variable_value` · `description` · `updated_at` · `variable_value_json` | `none` | `n/a` | `docs/specs/02-web-admin/86_control_panel.md` |
| reads | `scope_intensity_matrix` | `permit_type` · `structure_type` · `gfa_allocation_percentage` | `permit_type` · `structure_type` · `gfa_allocation_percentage` · `updated_at` | `none` | `n/a` | `docs/specs/product/future/83_lead_cost_model.md` |
| reads | `trade_configurations` | `trade_slug` · `bid_phase_cutoff` · `work_phase_target` · `imminent_window_days` · `allocation_pct` · `multiplier_bid` · `multiplier_work` | `trade_slug` · `bid_phase_cutoff` · `work_phase_target` · `imminent_window_days` · `allocation_pct` · `updated_at` · `multiplier_bid` · `multiplier_work` | `none` | `n/a` | `docs/specs/02-web-admin/86_control_panel.md` |
| reads | `trade_sqft_rates` | `base_rate_sqft` · `structure_complexity_factor` · `trade_slug` | `trade_slug` · `base_rate_sqft` · `structure_complexity_factor` · `updated_at` | `none` | `n/a` | `docs/specs/product/future/83_lead_cost_model.md` |
| writes | `logic_variables` | `variable_value` · `variable_value_json` · `updated_at` | `variable_key` · `variable_value` · `description` · `updated_at` · `variable_value_json` | `none` | `n/a` | `docs/specs/02-web-admin/86_control_panel.md` |
| writes | `scope_intensity_matrix` | `permit_type` · `structure_type` · `gfa_allocation_percentage` · `updated_at` | `permit_type` · `structure_type` · `gfa_allocation_percentage` · `updated_at` | `none` | `n/a` | `docs/specs/product/future/83_lead_cost_model.md` |
| writes | `trade_configurations` | `bid_phase_cutoff` · `work_phase_target` · `imminent_window_days` · `allocation_pct` · `multiplier_bid` · `multiplier_work` · `updated_at` | `trade_slug` · `bid_phase_cutoff` · `work_phase_target` · `imminent_window_days` · `allocation_pct` · `updated_at` · `multiplier_bid` · `multiplier_work` | `none` | `n/a` | `docs/specs/02-web-admin/86_control_panel.md` |
| writes | `trade_sqft_rates` | `base_rate_sqft` · `structure_complexity_factor` · `updated_at` | `trade_slug` · `base_rate_sqft` · `structure_complexity_factor` · `updated_at` | `none` | `n/a` | `docs/specs/product/future/83_lead_cost_model.md` |

**3. Which contracts, and who calls them?**

Called by 2: `src/features/admin-controls/api/useGetConfigs.ts` · `src/features/admin-controls/api/useUpdateConfigs.ts`

**4. What gate, role or entitlement stands in front of it?**

session `admin` — classifyRoute("/api/admin/control-panel/configs") returns "admin" (executed 2026-09-15); the handler adds no check of its own, so middleware is the only gate. · RLS class `B` · entitlement `none`

**5. What archetype, and why that one?**

`MUTATION` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/02-web-admin/86_control_panel.md`](../../../docs/specs/02-web-admin/86_control_panel.md) · anchors: `docs/specs/02-web-admin/86_control_panel.md §5 Phase 2 (src/app/api/admin/control-panel/configs/route.ts:6)`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 27 entr(ies) in feature `F16`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-c-005"></a>

## Card 67 — `C-005` `contract_admin_control_panel_resync`

Registry detail: [`C-005`](../../../docs/reports/generated/127-surface-registry.md#c-005) `contract_admin_control_panel_resync`.

`CONTRACT` · `COMMAND` · scope `platform_shared` · feature `F16` platform-admin · build order 3162 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Gives an admin a button to immediately re-run the back half of the data pipeline — cost estimates, forecasts, snapshots — after changing a pricing setting, instead of waiting for the next scheduled run.

**2. Which tables and columns, produced by which step?**

_No table is reached by this entry — every value it shows arrives through a contract, or it shows no server data at all._

**3. Which contracts, and who calls them?**

Called by 1: `src/features/admin-controls/api/useTriggerPipeline.ts`

**4. What gate, role or entitlement stands in front of it?**

session `admin` — classifyRoute("/api/admin/control-panel/resync") returns "admin" (executed 2026-09-15); the handler adds no check of its own, so middleware is the only gate. · RLS class `none` · entitlement `none`

**5. What archetype, and why that one?**

`COMMAND` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/02-web-admin/86_control_panel.md`](../../../docs/specs/02-web-admin/86_control_panel.md) · anchors: `docs/specs/02-web-admin/86_control_panel.md §5 Phase 6 (src/app/api/admin/control-panel/resync/route.ts:9)`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 27 entr(ies) in feature `F16`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-c-008"></a>

## Card 68 — `C-008` `contract_admin_pipeline_step_output`

Registry detail: [`C-008`](../../../docs/reports/generated/127-surface-registry.md#c-008) `contract_admin_pipeline_step_output`.

`CONTRACT` · `QUERY` · scope `platform_shared` · feature `F16` platform-admin · build order 3162 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Lets an admin browse the raw data rows a single pipeline step actually produced — for example what a parcel-linking run wrote — with optional filtering, so they can inspect and troubleshoot pipeline output directly in the admin UI.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `<dynamic: manifest telemetry_tables[0] allow-list>` **(net-new)** | `all` | _does not exist yet_ | `none` | `n/a` | `n/a — not a fixed table; the read target is chosen per request from the manifest allow-list` |
| reads | `information_schema.columns` **(net-new)** | `column_name` · `data_type` · `table_schema` · `table_name` · `ordinal_position` | _does not exist yet_ | `none` | `n/a` | `n/a — PostgreSQL system catalog/view; no Buildo spec owns it` |
| reads | `pg_class` **(net-new)** | `reltuples` · `relname` · `relnamespace` · `relkind` | _does not exist yet_ | `none` | `n/a` | `n/a — PostgreSQL system catalog/view; no Buildo spec owns it` |
| reads | `pg_namespace` **(net-new)** | `oid` · `nspname` | _does not exist yet_ | `none` | `n/a` | `n/a — PostgreSQL system catalog/view; no Buildo spec owns it` |
| reads | `profiles` | `id` · `is_admin` | `id` · `is_admin` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/114_rls_policy_catalog.md` |

**3. Which contracts, and who calls them?**

Called by 1: `src/features/admin-flight-center/api/useStepOutput.ts`

**4. What gate, role or entitlement stands in front of it?**

session `admin` — classifyRoute("/api/admin/pipeline/step-output") returns "admin" (executed 2026-09-15); the handler re-verifies the caller in-process. · RLS class `C` · entitlement `none`

**5. What archetype, and why that one?**

`QUERY` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/01-pipeline/26_*.md`](../../../docs/specs/01-pipeline/26_*.md) · anchors: `docs/specs/01-pipeline/26_*.md §3.1 (Step-Output Inspector) at src/app/api/admin/pipeline/step-output/route.ts:1; docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §5 + §13 at :2; docs/specs/01-pipeline/40_pipeline_system.md at :3`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 27 entr(ies) in feature `F16`. It owns no component. It is the ONLY reader or writer of `<dynamic: manifest telemetry_tables[0] allow-list>` · `pg_namespace` — removing it orphans those tables.

---

<a id="card-c-009"></a>

## Card 69 — `C-009` `contract_admin_pipelines_history`

Registry detail: [`C-009`](../../../docs/reports/generated/127-surface-registry.md#c-009) `contract_admin_pipelines_history`.

`CONTRACT` · `QUERY` · scope `platform_shared` · feature `F16` platform-admin · build order 3162 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Shows an admin the last several runs of one chosen pipeline — when it ran, how long it took, how many records it processed — to render a small trend sparkline of that pipeline's recent history.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `pipeline_runs` | `started_at` · `completed_at` · `status` · `duration_ms` · `records_total` · `records_new` · `records_updated` · `records_meta` · `pipeline` | `id` · `pipeline` · `started_at` · `completed_at` · `status` · `records_total` · `records_new` · `records_updated` · `error_message` · `duration_ms` · `records_meta` | `assert_data_bounds` · `assert_pre_permit_aging` · `assert_schema` | `permits[21], coa[10], sources[26], deep_scrapes[4] · not-in-a-chain · permits[0], coa[0], sources[1]` | `docs/specs/01-pipeline/41_chain_permits.md` |

**3. Which contracts, and who calls them?**

Called by 1: `admin_data_quality`

**4. What gate, role or entitlement stands in front of it?**

session `admin` — classifyRoute("/api/admin/pipelines/history") returns "admin" (executed 2026-09-15); no session is checked — the handler authenticates the caller by other means: No CSRF/Origin check, no MFA — those live only inside verifyAdminAuth, which this route never calls. · RLS class `B` · entitlement `none`

**5. What archetype, and why that one?**

`QUERY` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/28_data_quality_dashboard.md`](../../../docs/specs/28_data_quality_dashboard.md) · anchors: `SPEC LINK: docs/specs/28_data_quality_dashboard.md at src/app/api/admin/pipelines/history/route.ts:12 — the file header names the spec but no section`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 27 entr(ies) in feature `F16`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-c-010"></a>

## Card 70 — `C-010` `contract_admin_pipelines_runs`

Registry detail: [`C-010`](../../../docs/reports/generated/127-surface-registry.md#c-010) `contract_admin_pipelines_runs`.

`CONTRACT` · `QUERY` · scope `platform_shared` · feature `F16` platform-admin · build order 3162 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Gives an admin a searchable, paginated table of past pipeline runs, filterable by pipeline name and status and carrying a total count, for browsing full run history rather than just the latest run.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `pipeline_runs` | `id` · `pipeline` · `started_at` · `completed_at` · `status` · `duration_ms` · `error_message` · `records_total` · `records_new` · `records_updated` | `id` · `pipeline` · `started_at` · `completed_at` · `status` · `records_total` · `records_new` · `records_updated` · `error_message` · `duration_ms` · `records_meta` | `assert_data_bounds` · `assert_pre_permit_aging` · `assert_schema` | `permits[21], coa[10], sources[26], deep_scrapes[4] · not-in-a-chain · permits[0], coa[0], sources[1]` | `docs/specs/01-pipeline/41_chain_permits.md` |

**3. Which contracts, and who calls them?**

**Nothing calls it.** An orphan contract — the exact shape this registry exists to surface.

**4. What gate, role or entitlement stands in front of it?**

session `admin` — classifyRoute("/api/admin/pipelines/runs") returns "admin" (executed 2026-09-15); the handler adds no check of its own, so middleware is the only gate. · RLS class `B` · entitlement `none`

**5. What archetype, and why that one?**

`QUERY` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: **UNRESEARCHED** — no SPEC LINK header and no System Map row, so there is nothing to check it against · anchors: `UNRESEARCHED — src/app/api/admin/pipelines/runs/route.ts carries no SPEC LINK header and no System Map row lists it (docs/specs/00-architecture/00_system_map.md, searched 2026-09-15); guessing the nearest spec would be an invention`

**8. What is still unresearched?**

**4 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 27 entr(ies) in feature `F16`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-c-011"></a>

## Card 71 — `C-011` `contract_admin_pipelines_schedules`

Registry detail: [`C-011`](../../../docs/reports/generated/127-surface-registry.md#c-011) `contract_admin_pipelines_schedules`.

`CONTRACT` · `MUTATION` · scope `platform_shared` · feature `F16` platform-admin · build order 3162 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Lets an admin view and change how often each pipeline is scheduled to run — daily, weekly, quarterly — and turn a pipeline's schedule on or off.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `pipeline_schedules` | `pipeline` · `cadence` · `cron_expression` · `enabled` · `updated_at` | `pipeline` · `cadence` · `cron_expression` · `updated_at` · `enabled` · `chain_id` | `none` | `n/a` | `docs/specs/00-architecture/115_scheduling.md` |
| writes | `pipeline_schedules` | `cadence` · `updated_at` · `pipeline` · `enabled` · `chain_id` | `pipeline` · `cadence` · `cron_expression` · `updated_at` · `enabled` · `chain_id` | `none` | `n/a` | `docs/specs/00-architecture/115_scheduling.md` |

**3. Which contracts, and who calls them?**

Called by 1: `admin_data_quality`

**4. What gate, role or entitlement stands in front of it?**

session `admin` — classifyRoute("/api/admin/pipelines/schedules") returns "admin" (executed 2026-09-15); no session is checked — the handler authenticates the caller by other means: No CSRF/Origin check on the two MUTATING methods. The Origin allowlist lives inside verifyAdminAuth (src/lib/auth/verify-admin.ts:70-78), which this file never  · RLS class `B` · entitlement `none`

**5. What archetype, and why that one?**

`MUTATION` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/00-architecture/115_scheduling.md`](../../../docs/specs/00-architecture/115_scheduling.md) · anchors: `docs/specs/00-architecture/115_scheduling.md — owns src/app/api/admin/pipelines/schedules/route.ts per docs/specs/00-architecture/00_system_map.md:19; the System Map row names no section, and the route file carries no SPEC LINK header`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 27 entr(ies) in feature `F16`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-c-012"></a>

## Card 72 — `C-012` `contract_admin_pipelines_slug`

Registry detail: [`C-012`](../../../docs/reports/generated/127-surface-registry.md#c-012) `contract_admin_pipelines_slug`.

`CONTRACT` · `COMMAND` · scope `platform_shared` · feature `F16` platform-admin · build order 3162 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Lets an admin start one of the automated data-collection pipelines — permits, committee-of-adjustment applications, sources, entities, or deep scrapes — by triggering it on GitHub Actions, or cancel it while it is running.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `pipeline_runs` | `id` · `pipeline` · `status` · `started_at` | `id` · `pipeline` · `started_at` · `completed_at` · `status` · `records_total` · `records_new` · `records_updated` · `error_message` · `duration_ms` · `records_meta` | `assert_data_bounds` · `assert_pre_permit_aging` · `assert_schema` | `permits[21], coa[10], sources[26], deep_scrapes[4] · not-in-a-chain · permits[0], coa[0], sources[1]` | `docs/specs/01-pipeline/41_chain_permits.md` |
| reads | `profiles` | `id` · `is_admin` | `id` · `is_admin` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/114_rls_policy_catalog.md` |
| writes | `pipeline_runs` | `status` · `error_message` · `completed_at` | `id` · `pipeline` · `started_at` · `completed_at` · `status` · `records_total` · `records_new` · `records_updated` · `error_message` · `duration_ms` · `records_meta` | `assert_data_bounds` · `assert_pre_permit_aging` · `assert_schema` | `permits[21], coa[10], sources[26], deep_scrapes[4] · not-in-a-chain · permits[0], coa[0], sources[1]` | `docs/specs/01-pipeline/41_chain_permits.md` |

**3. Which contracts, and who calls them?**

Called by 1: `admin_data_quality`

**4. What gate, role or entitlement stands in front of it?**

session `admin` — classifyRoute("/api/admin/pipelines/X") returns "admin" (executed 2026-09-15); the handler re-verifies the caller in-process. · RLS class `C` · entitlement `none`

**5. What archetype, and why that one?**

`COMMAND` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/02-web-admin/26_admin_dashboard.md`](../../../docs/specs/02-web-admin/26_admin_dashboard.md) · anchors: `docs/specs/02-web-admin/26_admin_dashboard.md — owns src/app/api/admin/pipelines/[slug]/route.ts per docs/specs/00-architecture/00_system_map.md:87; the System Map row names no section, and the route file carries no SPEC LINK header`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 27 entr(ies) in feature `F16`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-c-013"></a>

## Card 73 — `C-013` `contract_admin_pipelines_status`

Registry detail: [`C-013`](../../../docs/reports/generated/127-surface-registry.md#c-013) `contract_admin_pipelines_status`.

`CONTRACT` · `QUERY` · scope `platform_shared` · feature `F16` platform-admin · build order 3162 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Gives the admin dashboard a fast, lightweight snapshot of each pipeline's latest run status, meant to be polled frequently without the overhead of the full stats endpoint's thirty-plus counting queries.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `pipeline_runs` | `pipeline` · `started_at` · `status` · `duration_ms` · `error_message` · `records_total` · `records_new` · `records_updated` · `records_meta` | `id` · `pipeline` · `started_at` · `completed_at` · `status` · `records_total` · `records_new` · `records_updated` · `error_message` · `duration_ms` · `records_meta` | `assert_data_bounds` · `assert_pre_permit_aging` · `assert_schema` | `permits[21], coa[10], sources[26], deep_scrapes[4] · not-in-a-chain · permits[0], coa[0], sources[1]` | `docs/specs/01-pipeline/41_chain_permits.md` |

**3. Which contracts, and who calls them?**

Called by 1: `admin_data_quality`

**4. What gate, role or entitlement stands in front of it?**

session `admin` — classifyRoute("/api/admin/pipelines/status") returns "admin" (executed 2026-09-15); the handler adds no check of its own, so middleware is the only gate. · RLS class `B` · entitlement `none`

**5. What archetype, and why that one?**

`QUERY` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: **UNRESEARCHED** — no SPEC LINK header and no System Map row, so there is nothing to check it against · anchors: `UNRESEARCHED — src/app/api/admin/pipelines/status/route.ts carries no SPEC LINK header and no System Map row lists it (docs/specs/00-architecture/00_system_map.md, searched 2026-09-15); guessing the nearest spec would be an invention`

**8. What is still unresearched?**

**4 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 27 entr(ies) in feature `F16`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-c-014"></a>

## Card 74 — `C-014` `contract_admin_security_mfa`

Registry detail: [`C-014`](../../../docs/reports/generated/127-surface-registry.md#c-014) `contract_admin_security_mfa`.

`CONTRACT` · `MUTATION` · scope `platform_shared` · feature `F16` platform-admin · build order 3162 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Lets a signed-in admin see whether they have two-factor authentication set up, start enrolling an authenticator app, or remove two-factor from their own account.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `admin_backup_codes` | `user_id` · `used_at` · `id` · `code_hash` · `code_salt` | `id` · `user_id` · `code_hash` · `code_salt` · `used_at` · `created_at` | `none` | `n/a` | `docs/specs/00-architecture/13_authentication.md` |
| reads | `profiles` | `id` · `is_admin` | `id` · `is_admin` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/114_rls_policy_catalog.md` |
| writes | `admin_audit_log` | `admin_uid` · `action` · `target_uid` · `old_value` · `new_value` · `reason` | `id` · `admin_uid` · `action` · `target_uid` · `old_value` · `new_value` · `reason` · `created_at` | `none` | `n/a` | `docs/specs/02-web-admin/21_admin_user_management.md` |
| writes | `admin_backup_codes` | `user_id` · `used_at` | `id` · `user_id` · `code_hash` · `code_salt` · `used_at` · `created_at` | `none` | `n/a` | `docs/specs/00-architecture/13_authentication.md` |

**3. Which contracts, and who calls them?**

Called by 1: `src/features/admin-security/api/useAdminSecurity.ts`

**4. What gate, role or entitlement stands in front of it?**

session `admin` — classifyRoute("/api/admin/security/mfa") returns "admin" (executed 2026-09-15); the handler re-verifies the caller in-process. · RLS class `A` · entitlement `none`

**5. What archetype, and why that one?**

`MUTATION` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/00-architecture/13_authentication.md`](../../../docs/specs/00-architecture/13_authentication.md) · anchors: `docs/specs/00-architecture/13_authentication.md §3.6, docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §5 + §8.1 + §13, .cursor/phase1_plan.md Item 6 / P1-F4.3 — src/app/api/admin/security/mfa/route.ts:1-3`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 27 entr(ies) in feature `F16`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-c-015"></a>

## Card 75 — `C-015` `contract_admin_security_mfa_verify`

Registry detail: [`C-015`](../../../docs/reports/generated/127-surface-registry.md#c-015) `contract_admin_security_mfa_verify`.

`CONTRACT` · `MUTATION` · scope `platform_shared` · feature `F16` platform-admin · build order 3162 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Completes an admin's two-factor setup by checking the six-digit code from their authenticator app; on success it upgrades their login session to a higher trust level and issues one-time backup codes for use if they lose their device.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `admin_backup_codes` | `id` · `code_hash` · `code_salt` · `user_id` · `used_at` | `id` · `user_id` · `code_hash` · `code_salt` · `used_at` · `created_at` | `none` | `n/a` | `docs/specs/00-architecture/13_authentication.md` |
| reads | `profiles` | `id` · `is_admin` | `id` · `is_admin` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/114_rls_policy_catalog.md` |
| writes | `admin_audit_log` | `admin_uid` · `action` · `target_uid` · `old_value` · `new_value` · `reason` | `id` · `admin_uid` · `action` · `target_uid` · `old_value` · `new_value` · `reason` · `created_at` | `none` | `n/a` | `docs/specs/02-web-admin/21_admin_user_management.md` |
| writes | `admin_backup_codes` | `user_id` · `code_hash` · `code_salt` · `used_at` | `id` · `user_id` · `code_hash` · `code_salt` · `used_at` · `created_at` | `none` | `n/a` | `docs/specs/00-architecture/13_authentication.md` |

**3. Which contracts, and who calls them?**

Called by 1: `src/features/admin-security/api/useAdminSecurity.ts`

**4. What gate, role or entitlement stands in front of it?**

session `admin` — classifyRoute("/api/admin/security/mfa/verify") returns "admin" (executed 2026-09-15); the handler re-verifies the caller in-process. · RLS class `A` · entitlement `none`

**5. What archetype, and why that one?**

`MUTATION` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/00-architecture/13_authentication.md`](../../../docs/specs/00-architecture/13_authentication.md) · anchors: `docs/specs/00-architecture/13_authentication.md §3.6, docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §5 + §8.1 + §13, .cursor/phase1_plan.md Item 6 / P1-F4.3 — src/app/api/admin/security/mfa/verify/route.ts:1-3`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 27 entr(ies) in feature `F16`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-c-016"></a>

## Card 76 — `C-016` `contract_admin_stats`

Registry detail: [`C-016`](../../../docs/reports/generated/127-surface-registry.md#c-016) `contract_admin_stats`.

`CONTRACT` · `QUERY` · scope `platform_shared` · feature `F16` platform-admin · build order 3162 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Powers the main admin dashboard's overview numbers — how many permits, builders, and committee-of-adjustment applications exist, how many are linked to properties, neighbourhoods and contractor-registry records, and how fresh and healthy each data pipeline currently is — so an admin can see overall system health at a glance.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `address_points` | — | `address_point_id` · `latitude` · `longitude` · `address_number` · `linear_name_full` · `address_full` · `lo_num` · `hi_num` · `maint_stage` · `address_status` · `address_class_desc` · `class_family_desc` · `place_name` · `addr_num_normalized` · `linear_name_normalized` · `geom` | `address_points` | `sources[2]` | `docs/specs/01-pipeline/43_chain_sources.md` |
| reads | `building_footprints` | — | `id` · `source_id` · `geometry` · `footprint_area_sqm` · `footprint_area_sqft` · `max_height_m` · `min_height_m` · `elev_z` · `estimated_stories` · `centroid_lat` · `centroid_lng` · `created_at` · `geom` | `massing` | `sources[14]` | `docs/specs/01-pipeline/43_chain_sources.md` |
| reads | `coa_applications` | `linked_permit_num` · `linked_confidence` · `decision` · `decision_date` · `hearing_date` | `id` · `application_number` · `address` · `street_num` · `street_name` · `ward` · `status` · `decision` · `decision_date` · `hearing_date` · `description` · `applicant` · `linked_permit_num` · `linked_confidence` · `data_hash` · `first_seen_at` · `last_seen_at` · `sub_type` · `street_name_normalized` · `lifecycle_phase` · `lifecycle_classified_at` · `lifecycle_stalled` · `lead_id` · `coa_type_class` · `project_type` · `scope_tags` · `scope_classified_at` · `scope_source` · `structure_type` · `neighbourhood_id` · `latitude` · `longitude` · `modeled_gfa_sqm` · `estimated_cost` · `cost_source` · `cost_classified_at` · `lifecycle_seq` · `lifecycle_group` · `lifecycle_block` · `lifecycle_stage` · `bid_value` · `parcel_linked_at` · `trade_classified_at` · `matched_status` · `matched_rule` · `unmapped_status` · `unmapped_decision` · `zoning_class` · `bylaw_max_coverage_pct` · `bylaw_max_fsi` · `bylaw_max_height_m` · `exception_number` · `variance_context` · `zoning_parcel_count` · `zoning_dominant_parcel_id` · `zoning_dominant_parcel_method` · `zoning_enriched_at` · `is_in_ravine_protection_area` · `ravine_distance_m` · `is_heritage_designated` · `heritage_designation_type` · `heritage_designation_date` · `is_corner_lot` · `is_through_lot` · `primary_frontage_street_name` · `lot_size_sqm` · `frontage_m` · `depth_m` · `lot_size_confidence` · `lot_size_basis` · `max_build_setback_basis` · `max_buildable_footprint_sqm` · `max_build_width_m` · `max_build_length_m` · `max_build_height_m` · `max_build_stories` · `max_build_basis` · `max_buildable_gfa_sqm` · `max_buildable_gfa_basis` · `max_build_confidence` · `max_garden_suite_gfa_sqm` · `garden_suite_fits` · `envelope_constrained` · `envelope_constraint_reason` · `imagery_roof_footprint_sqm` · `existing_stories` · `existing_height_m` · `imagery_roof_gfa_sqm` · `existing_width_m` · `existing_length_m` · `existing_structure_confidence` · `existing_other_structures_count` · `existing_other_structures_sqm` · `existing_greenspace_sqm` · `max_newbuild_coa_gfa_sqm` · `cur_basement_gfa_sqm` · `cur_storey_gfa_sqm` · `cur_interior_reno_gfa_sqm` · `cur_est_kitchen_gfa_sqm` · `cur_est_bath_gfa_sqm` · `max_build_stories_basis` · `abuts_laneway` · `max_garage_gfa_sqm` · `garage_capacity_cars` · `garage_constraint_reason` · `garage_permission` · `max_laneway_suite_gfa_sqm` · `max_rear_suite_gfa_sqm` · `rear_suite_type` · `rear_suite_permission` · `cur_floor_gfa_sqm` · `cur_pot_2story_gfa_sqm` · `cur_pot_3story_gfa_sqm` · `cur_gfa_range_basis` · `existing_data_quality_flag` · `max_build_stories_aggressive` · `market_exceeds_bylaw` · `neighbourhood_cost_premium` · `opt_aor_storeys` · `opt_aor_gfa_sqm` · `opt_aor_units` · `opt_coa_storeys` · `opt_coa_gfa_sqm` · `opt_suite_type` · `opt_suite_fits_full` · `opt_binding_constraint` · `opt_config_confidence` · `comp_count` · `comp_dominant_build` · `comp_build_ratio_p50` · `comp_fsi_p50` · `cost_fb_total` · `cost_coa_total` · `cost_solar_total` · `cost_garden_suite_total` · `cost_laneway_suite_total` · `cost_garage_total` · `cost_gut_total` · `cost_addition_total` · `cost_kitchen_per_sqm` · `cost_bath_per_sqm` · `cost_basement_per_sqm` · `cost_basement_underpin_per_sqm` · `max_build_fsi` · `coa_fsi` · `realized_fsi_p90` | `classify_coa_scope` · `classify_coa_trades` · `classify_lifecycle_phase` · `coa` · `compute_coa_cost_estimates` · `enrich_coa_zoning` · `link_coa` · `link_coa_to_parcels` | `coa[5] · coa[6] · permits[23], coa[12] · coa[1] · coa[7] · coa[4] · permits[19], coa[8] · coa[3]` | `docs/specs/01-pipeline/42_chain_coa.md` |
| reads | `entities` | `primary_phone` · `primary_email` | `id` · `legal_name` · `trade_name` · `name_normalized` · `entity_type` · `primary_phone` · `primary_email` · `website` · `linkedin_url` · `google_place_id` · `google_rating` · `google_review_count` · `is_wsib_registered` · `permit_count` · `first_seen_at` · `last_seen_at` · `last_enriched_at` · `photo_url` · `photo_validated_at` | `builders` · `enrich_named_builders` · `enrich_wsib_builders` · `link_wsib` | `permits[5] · entities[1] · entities[0] · permits[6], sources[19]` | `docs/specs/01-pipeline/41_chain_permits.md` |
| reads | `information_schema.columns` **(net-new)** | `table_name` · `column_name` · `table_schema` · `ordinal_position` | _does not exist yet_ | `none` | `n/a` | `n/a — PostgreSQL system catalog/view; no Buildo spec owns it` |
| reads | `lead_views` | `saved` | `id` · `user_id` · `lead_key` · `lead_type` · `permit_num` · `revision_num` · `entity_id` · `trade_slug` · `viewed_at` · `saved` · `saved_at` | `none` | `n/a` | `docs/specs/01-pipeline/84_lifecycle_phase_engine.md` |
| reads | `neighbourhoods` | — | `id` · `neighbourhood_id` · `name` · `geometry` · `avg_household_income` · `median_household_income` · `avg_individual_income` · `low_income_pct` · `tenure_owner_pct` · `tenure_renter_pct` · `period_of_construction` · `couples_pct` · `lone_parent_pct` · `married_pct` · `university_degree_pct` · `immigrant_pct` · `visible_minority_pct` · `english_knowledge_pct` · `top_mother_tongue` · `census_year` · `created_at` · `geom` | `neighbourhoods` | `sources[16]` | `docs/specs/01-pipeline/43_chain_sources.md` |
| reads | `notifications` | `is_sent` | `id` · `user_id` · `type` · `title` · `body` · `permit_num` · `trade_slug` · `channel` · `is_read` · `is_sent` · `sent_at` · `created_at` · `lead_id` | `classify_lifecycle_phase` · `update_tracked_projects` | `permits[23], coa[12] · permits[28]` | `docs/specs/01-pipeline/41_chain_permits.md` |
| reads | `parcel_buildings` | `parcel_id` | `id` · `parcel_id` · `building_id` · `is_primary` · `structure_type` · `linked_at` · `match_type` · `confidence` | `link_massing` | `permits[11], sources[15]` | `docs/specs/01-pipeline/56_source_massing.md` |
| reads | `parcels` | — | `id` · `parcel_id` · `feature_type` · `address_number` · `linear_name_full` · `addr_num_normalized` · `street_name_normalized` · `street_type_normalized` · `stated_area_raw` · `lot_size_sqm` · `lot_size_sqft` · `frontage_m` · `frontage_ft` · `depth_m` · `depth_ft` · `geometry` · `date_effective` · `date_expiry` · `created_at` · `centroid_lat` · `centroid_lng` · `is_irregular` · `geom` · `zoning_class` · `zoning_zn_string` · `zoning_gen_zone` · `zoning_holding` · `zone_status` · `bylaw_max_fsi` · `bylaw_max_coverage_pct` · `bylaw_max_height_m` · `bylaw_max_stories` · `bylaw_max_units` · `bylaw_max_density` · `bylaw_min_frontage_m` · `bylaw_min_area_sqm` · `bylaw_standard_setback_m` · `bylaw_pct_commercial_max` · `bylaw_pct_residential_max` · `bylaw_pct_employment_max` · `bylaw_pct_office_max` · `exception_number` · `exception_text` · `bylaw_chapter` · `bylaw_section` · `bylaw_exception_ref` · `in_policy_area` · `on_policy_road` · `in_rooming_house_overlay` · `in_parking_zone_overlay` · `in_building_setback_overlay` · `on_priority_retail` · `in_queenstw_eat_overlay` · `zoning_overlays` · `zoning_base_source_id` · `zoning_dominant_area_share` · `zoning_is_ambiguous` · `zoning_base_source_dataset_version` · `zoning_enriched_at` · `is_in_ravine_protection_area` · `ravine_distance_m` · `ravine_dataset_version_when_enriched` · `is_heritage_designated` · `heritage_designation_type` · `heritage_designation_date` · `heritage_dataset_version_when_enriched` · `is_corner_lot` · `is_through_lot` · `primary_frontage_street_name` · `centreline_dataset_version_when_enriched` · `lot_size_confidence` · `lot_size_basis` · `max_build_setback_basis` · `max_buildable_footprint_sqm` · `max_build_width_m` · `max_build_length_m` · `max_build_height_m` · `max_build_stories` · `max_build_basis` · `max_buildable_gfa_sqm` · `max_buildable_gfa_basis` · `max_build_confidence` · `max_garden_suite_gfa_sqm` · `garden_suite_fits` · `envelope_constrained` · `envelope_constraint_reason` · `imagery_roof_footprint_sqm` · `existing_stories` · `existing_height_m` · `imagery_roof_gfa_sqm` · `existing_width_m` · `existing_length_m` · `existing_structure_confidence` · `existing_other_structures_count` · `existing_other_structures_sqm` · `existing_greenspace_sqm` · `max_newbuild_coa_gfa_sqm` · `cur_basement_gfa_sqm` · `cur_storey_gfa_sqm` · `cur_interior_reno_gfa_sqm` · `cur_est_kitchen_gfa_sqm` · `cur_est_bath_gfa_sqm` · `max_build_stories_basis` · `abuts_laneway` · `max_garage_gfa_sqm` · `garage_capacity_cars` · `garage_constraint_reason` · `garage_permission` · `max_laneway_suite_gfa_sqm` · `max_rear_suite_gfa_sqm` · `rear_suite_type` · `rear_suite_permission` · `cur_floor_gfa_sqm` · `cur_pot_2story_gfa_sqm` · `cur_pot_3story_gfa_sqm` · `cur_gfa_range_basis` · `existing_data_quality_flag` · `max_build_stories_aggressive` · `market_exceeds_bylaw` · `neighbourhood_id` · `neighbourhood_cost_premium` · `opt_aor_storeys` · `opt_aor_gfa_sqm` · `opt_aor_units` · `opt_coa_storeys` · `opt_coa_gfa_sqm` · `opt_suite_type` · `opt_suite_fits_full` · `opt_binding_constraint` · `opt_config_confidence` · `optimal_config` · `nearby_builds_summary` · `comparable_builds` · `comp_count` · `comp_dominant_build` · `comp_build_ratio_p50` · `comp_fsi_p50` · `cur_gfa_low_sqm` · `cur_gfa_high_sqm` · `cur_storeys_range` · `cur_gfa_band_basis` · `parcel_cost_menu` · `cost_fb_total` · `cost_coa_total` · `cost_solar_total` · `cost_garden_suite_total` · `cost_laneway_suite_total` · `cost_garage_total` · `cost_gut_total` · `cost_addition_total` · `cost_kitchen_per_sqm` · `cost_bath_per_sqm` · `cost_basement_per_sqm` · `cost_basement_underpin_per_sqm` · `max_build_fsi` · `coa_fsi` · `realized_fsi_p90` · `lot_size_source` | `compute_centroids` · `compute_parcel_cost_estimates` · `enrich_centreline` · `enrich_heritage` · `enrich_parcels` · `enrich_ravines` · `parcels` | `sources[9] · sources[22] · sources[13] · sources[12] · sources[21] · sources[11] · sources[4]` | `docs/specs/01-pipeline/43_chain_sources.md` |
| reads | `permit_parcels` | `permit_num` · `revision_num` · `parcel_id` | `id` · `permit_num` · `revision_num` · `parcel_id` · `match_type` · `confidence` · `linked_at` | `link_parcels` | `permits[8], sources[10]` | `docs/specs/01-pipeline/41_chain_permits.md` |
| reads | `permit_trades` | `permit_num` · `revision_num` | `id` · `permit_num` · `revision_num` · `trade_id` · `tier` · `confidence` · `is_active` · `phase` · `lead_score` · `classified_at` · `attachment_basis` | `backfill_realtor_permit_trades` · `classify_permits` | `permits[16] · permits[13]` | `docs/specs/03-mobile/91_mobile_lead_feed.md` |
| reads | `permits` | `first_seen_at` · `status` · `builder_name` · `neighbourhood_id` · `latitude` · `scope_source` | `permit_num` · `revision_num` · `permit_type` · `structure_type` · `work` · `street_num` · `street_name` · `street_type` · `street_direction` · `city` · `postal` · `geo_id` · `building_type` · `category` · `application_date` · `issued_date` · `completed_date` · `status` · `description` · `est_const_cost` · `builder_name` · `owner` · `dwelling_units_created` · `dwelling_units_lost` · `ward` · `council_district` · `current_use` · `proposed_use` · `housing_units` · `storeys` · `latitude` · `longitude` · `geocoded_at` · `data_hash` · `first_seen_at` · `last_seen_at` · `raw_json` · `neighbourhood_id` · `project_type` · `scope_tags` · `scope_classified_at` · `scope_source` · `enriched_status` · `street_name_normalized` · `last_scraped_at` · `trade_classified_at` · `parcel_linked_at` · `location` · `photo_url` · `lifecycle_phase` · `lifecycle_stalled` · `lifecycle_classified_at` · `phase_started_at` · `updated_at` · `lead_id` · `linked_coa_application_number` · `lifecycle_seq` · `lifecycle_group` · `lifecycle_block` · `lifecycle_stage` · `bid_value` · `matched_status` · `matched_rule` · `unmapped_status` · `zoning_class` · `bylaw_max_coverage_pct` · `bylaw_max_fsi` · `bylaw_max_height_m` · `exception_number` · `applicable_bylaws` · `overlay_summary` · `zoning_parcel_count` · `zoning_dominant_parcel_id` · `zoning_dominant_parcel_method` · `zoning_enriched_at` · `is_in_ravine_protection_area` · `ravine_distance_m` · `is_heritage_designated` · `heritage_designation_type` · `heritage_designation_date` · `is_corner_lot` · `is_through_lot` · `primary_frontage_street_name` · `lot_size_sqm` · `frontage_m` · `depth_m` · `lot_size_confidence` · `lot_size_basis` · `max_build_setback_basis` · `max_buildable_footprint_sqm` · `max_build_width_m` · `max_build_length_m` · `max_build_height_m` · `max_build_stories` · `max_build_basis` · `max_buildable_gfa_sqm` · `max_buildable_gfa_basis` · `max_build_confidence` · `max_garden_suite_gfa_sqm` · `garden_suite_fits` · `envelope_constrained` · `envelope_constraint_reason` · `imagery_roof_footprint_sqm` · `existing_stories` · `existing_height_m` · `imagery_roof_gfa_sqm` · `existing_width_m` · `existing_length_m` · `existing_structure_confidence` · `existing_other_structures_count` · `existing_other_structures_sqm` · `existing_greenspace_sqm` · `max_newbuild_coa_gfa_sqm` · `cur_basement_gfa_sqm` · `cur_storey_gfa_sqm` · `cur_interior_reno_gfa_sqm` · `cur_est_kitchen_gfa_sqm` · `cur_est_bath_gfa_sqm` · `max_build_stories_basis` · `abuts_laneway` · `max_garage_gfa_sqm` · `garage_capacity_cars` · `garage_constraint_reason` · `garage_permission` · `max_laneway_suite_gfa_sqm` · `max_rear_suite_gfa_sqm` · `rear_suite_type` · `rear_suite_permission` · `cur_floor_gfa_sqm` · `cur_pot_2story_gfa_sqm` · `cur_pot_3story_gfa_sqm` · `cur_gfa_range_basis` · `existing_data_quality_flag` · `max_build_stories_aggressive` · `market_exceeds_bylaw` · `neighbourhood_cost_premium` · `residential_sqm` · `interior_alterations_sqm` · `assembly_sqm` · `institutional_sqm` · `mercantile_sqm` · `industrial_sqm` · `business_personal_services_sqm` · `opt_aor_storeys` · `opt_aor_gfa_sqm` · `opt_aor_units` · `opt_coa_storeys` · `opt_coa_gfa_sqm` · `opt_suite_type` · `opt_suite_fits_full` · `opt_binding_constraint` · `opt_config_confidence` · `comp_count` · `comp_dominant_build` · `comp_build_ratio_p50` · `comp_fsi_p50` · `cost_fb_total` · `cost_coa_total` · `cost_solar_total` · `cost_garden_suite_total` · `cost_laneway_suite_total` · `cost_garage_total` · `cost_gut_total` · `cost_addition_total` · `cost_kitchen_per_sqm` · `cost_bath_per_sqm` · `cost_basement_per_sqm` · `cost_basement_underpin_per_sqm` · `max_build_fsi` · `coa_fsi` · `realized_fsi_p90` | `classify_inspection_status` · `classify_lifecycle_phase` · `classify_permit_phase` · `classify_scope` · `classify_scope_class` · `classify_scope_tags` · `close_stale_permits` · `create_pre_permits` · `enrich_permits` · `geocode_permits` · `inspections` · `link_coa` · `link_neighbourhoods` · `link_similar` · `permits` | `deep_scrapes[1] · permits[23], coa[12] · permits[3] · permits[4] · not-in-a-chain · not-in-a-chain · permits[2] · not-in-a-chain · permits[9] · permits[7], sources[3] · deep_scrapes[0] · permits[19], coa[8] · permits[10], sources[17] · permits[12] · permits[1]` | `docs/specs/01-pipeline/41_chain_permits.md` |
| reads | `pg_class` **(net-new)** | `relname` · `reltuples` · `relkind` | _does not exist yet_ | `none` | `n/a` | `n/a — PostgreSQL system catalog/view; no Buildo spec owns it` |
| reads | `pipeline_runs` | `pipeline` · `started_at` · `status` · `duration_ms` · `error_message` · `records_total` · `records_new` · `records_updated` · `records_meta` · `completed_at` | `id` · `pipeline` · `started_at` · `completed_at` · `status` · `records_total` · `records_new` · `records_updated` · `error_message` · `duration_ms` · `records_meta` | `assert_data_bounds` · `assert_pre_permit_aging` · `assert_schema` | `permits[21], coa[10], sources[26], deep_scrapes[4] · not-in-a-chain · permits[0], coa[0], sources[1]` | `docs/specs/01-pipeline/41_chain_permits.md` |
| reads | `pipeline_schedules` | `pipeline` · `cadence` · `cron_expression` · `enabled` | `pipeline` · `cadence` · `cron_expression` · `updated_at` · `enabled` · `chain_id` | `none` | `n/a` | `docs/specs/00-architecture/115_scheduling.md` |
| reads | `profiles` | `id` · `is_admin` | `id` · `is_admin` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/114_rls_policy_catalog.md` |
| reads | `sync_runs` | `started_at` | `id` · `started_at` · `completed_at` · `status` · `records_total` · `records_new` · `records_updated` · `records_unchanged` · `records_errors` · `error_message` · `snapshot_path` · `duration_ms` | `none` | `n/a` | `docs/specs/00-architecture/115_scheduling.md` |
| reads | `trade_mapping_rules` | `is_active` | `id` · `trade_id` · `tier` · `match_field` · `match_pattern` · `confidence` · `phase_start` · `phase_end` · `is_active` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/01_database_schema.md` |
| reads | `trades` | — | `id` · `slug` · `name` · `icon` · `color` · `sort_order` · `created_at` · `kind` · `seq` · `cost_basis` | `none` | `n/a` | `docs/specs/01-pipeline/84_lifecycle_phase_engine.md` |
| reads | `wsib_registry` | `linked_entity_id` · `trade_name` | `id` · `legal_name` · `trade_name` · `legal_name_normalized` · `trade_name_normalized` · `mailing_address` · `predominant_class` · `naics_code` · `naics_description` · `subclass` · `subclass_description` · `business_size` · `match_confidence` · `matched_at` · `first_seen_at` · `last_seen_at` · `linked_entity_id` · `primary_phone` · `primary_email` · `website` · `last_enriched_at` · `is_gta` | `link_wsib` · `load_wsib` | `permits[6], sources[19] · sources[18]` | `docs/specs/01-pipeline/46_wsib_enrichment.md` |
| writes | `pipeline_runs` | `status` · `completed_at` · `error_message` | `id` · `pipeline` · `started_at` · `completed_at` · `status` · `records_total` · `records_new` · `records_updated` · `error_message` · `duration_ms` · `records_meta` | `assert_data_bounds` · `assert_pre_permit_aging` · `assert_schema` | `permits[21], coa[10], sources[26], deep_scrapes[4] · not-in-a-chain · permits[0], coa[0], sources[1]` | `docs/specs/01-pipeline/41_chain_permits.md` |

**3. Which contracts, and who calls them?**

Called by 2: `web_dashboard` · `admin_data_quality`

**4. What gate, role or entitlement stands in front of it?**

session `admin` — classifyRoute("/api/admin/stats") returns "admin" (executed 2026-09-15); the handler adds no check of its own, so middleware is the only gate. · RLS class `A` · entitlement `none`

**5. What archetype, and why that one?**

`QUERY` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/00-architecture/115_scheduling.md`](../../../docs/specs/00-architecture/115_scheduling.md) · anchors: `docs/specs/00-architecture/115_scheduling.md — owns src/app/api/admin/stats/route.ts per docs/specs/00-architecture/00_system_map.md:19; the System Map row names no section, and the route file carries no SPEC LINK header`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 27 entr(ies) in feature `F16`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-c-017"></a>

## Card 77 — `C-017` `contract_admin_sync`

Registry detail: [`C-017`](../../../docs/reports/generated/127-surface-registry.md#c-017) `contract_admin_sync`.

`CONTRACT` · `COMMAND` · scope `platform_shared` · feature `F16` platform-admin · build order 3162 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Shows an admin the history of the last twenty permit-data import runs, and lets them manually trigger a new import of permit data from a file already sitting on the server.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `permit_type_classifications` | `permit_type` · `class` | `permit_type` · `class` · `notes` · `updated_at` | `none` | `n/a` | `docs/specs/01-pipeline/80_taxonomies.md` |
| reads | `permits` | `all` | `permit_num` · `revision_num` · `permit_type` · `structure_type` · `work` · `street_num` · `street_name` · `street_type` · `street_direction` · `city` · `postal` · `geo_id` · `building_type` · `category` · `application_date` · `issued_date` · `completed_date` · `status` · `description` · `est_const_cost` · `builder_name` · `owner` · `dwelling_units_created` · `dwelling_units_lost` · `ward` · `council_district` · `current_use` · `proposed_use` · `housing_units` · `storeys` · `latitude` · `longitude` · `geocoded_at` · `data_hash` · `first_seen_at` · `last_seen_at` · `raw_json` · `neighbourhood_id` · `project_type` · `scope_tags` · `scope_classified_at` · `scope_source` · `enriched_status` · `street_name_normalized` · `last_scraped_at` · `trade_classified_at` · `parcel_linked_at` · `location` · `photo_url` · `lifecycle_phase` · `lifecycle_stalled` · `lifecycle_classified_at` · `phase_started_at` · `updated_at` · `lead_id` · `linked_coa_application_number` · `lifecycle_seq` · `lifecycle_group` · `lifecycle_block` · `lifecycle_stage` · `bid_value` · `matched_status` · `matched_rule` · `unmapped_status` · `zoning_class` · `bylaw_max_coverage_pct` · `bylaw_max_fsi` · `bylaw_max_height_m` · `exception_number` · `applicable_bylaws` · `overlay_summary` · `zoning_parcel_count` · `zoning_dominant_parcel_id` · `zoning_dominant_parcel_method` · `zoning_enriched_at` · `is_in_ravine_protection_area` · `ravine_distance_m` · `is_heritage_designated` · `heritage_designation_type` · `heritage_designation_date` · `is_corner_lot` · `is_through_lot` · `primary_frontage_street_name` · `lot_size_sqm` · `frontage_m` · `depth_m` · `lot_size_confidence` · `lot_size_basis` · `max_build_setback_basis` · `max_buildable_footprint_sqm` · `max_build_width_m` · `max_build_length_m` · `max_build_height_m` · `max_build_stories` · `max_build_basis` · `max_buildable_gfa_sqm` · `max_buildable_gfa_basis` · `max_build_confidence` · `max_garden_suite_gfa_sqm` · `garden_suite_fits` · `envelope_constrained` · `envelope_constraint_reason` · `imagery_roof_footprint_sqm` · `existing_stories` · `existing_height_m` · `imagery_roof_gfa_sqm` · `existing_width_m` · `existing_length_m` · `existing_structure_confidence` · `existing_other_structures_count` · `existing_other_structures_sqm` · `existing_greenspace_sqm` · `max_newbuild_coa_gfa_sqm` · `cur_basement_gfa_sqm` · `cur_storey_gfa_sqm` · `cur_interior_reno_gfa_sqm` · `cur_est_kitchen_gfa_sqm` · `cur_est_bath_gfa_sqm` · `max_build_stories_basis` · `abuts_laneway` · `max_garage_gfa_sqm` · `garage_capacity_cars` · `garage_constraint_reason` · `garage_permission` · `max_laneway_suite_gfa_sqm` · `max_rear_suite_gfa_sqm` · `rear_suite_type` · `rear_suite_permission` · `cur_floor_gfa_sqm` · `cur_pot_2story_gfa_sqm` · `cur_pot_3story_gfa_sqm` · `cur_gfa_range_basis` · `existing_data_quality_flag` · `max_build_stories_aggressive` · `market_exceeds_bylaw` · `neighbourhood_cost_premium` · `residential_sqm` · `interior_alterations_sqm` · `assembly_sqm` · `institutional_sqm` · `mercantile_sqm` · `industrial_sqm` · `business_personal_services_sqm` · `opt_aor_storeys` · `opt_aor_gfa_sqm` · `opt_aor_units` · `opt_coa_storeys` · `opt_coa_gfa_sqm` · `opt_suite_type` · `opt_suite_fits_full` · `opt_binding_constraint` · `opt_config_confidence` · `comp_count` · `comp_dominant_build` · `comp_build_ratio_p50` · `comp_fsi_p50` · `cost_fb_total` · `cost_coa_total` · `cost_solar_total` · `cost_garden_suite_total` · `cost_laneway_suite_total` · `cost_garage_total` · `cost_gut_total` · `cost_addition_total` · `cost_kitchen_per_sqm` · `cost_bath_per_sqm` · `cost_basement_per_sqm` · `cost_basement_underpin_per_sqm` · `max_build_fsi` · `coa_fsi` · `realized_fsi_p90` | `classify_inspection_status` · `classify_lifecycle_phase` · `classify_permit_phase` · `classify_scope` · `classify_scope_class` · `classify_scope_tags` · `close_stale_permits` · `create_pre_permits` · `enrich_permits` · `geocode_permits` · `inspections` · `link_coa` · `link_neighbourhoods` · `link_similar` · `permits` | `deep_scrapes[1] · permits[23], coa[12] · permits[3] · permits[4] · not-in-a-chain · not-in-a-chain · permits[2] · not-in-a-chain · permits[9] · permits[7], sources[3] · deep_scrapes[0] · permits[19], coa[8] · permits[10], sources[17] · permits[12] · permits[1]` | `docs/specs/01-pipeline/41_chain_permits.md` |
| reads | `sync_runs` | `id` · `started_at` · `completed_at` · `status` · `records_total` · `records_new` · `records_updated` · `records_unchanged` · `records_errors` · `error_message` · `snapshot_path` · `duration_ms` | `id` · `started_at` · `completed_at` · `status` · `records_total` · `records_new` · `records_updated` · `records_unchanged` · `records_errors` · `error_message` · `snapshot_path` · `duration_ms` | `none` | `n/a` | `docs/specs/00-architecture/115_scheduling.md` |
| reads | `trade_mapping_rules` | `all` | `id` · `trade_id` · `tier` · `match_field` · `match_pattern` · `confidence` · `phase_start` · `phase_end` · `is_active` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/01_database_schema.md` |
| reads | `trades` | `id` · `slug` | `id` · `slug` · `name` · `icon` · `color` · `sort_order` · `created_at` · `kind` · `seq` · `cost_basis` | `none` | `n/a` | `docs/specs/01-pipeline/84_lifecycle_phase_engine.md` |
| writes | `permit_history` | `permit_num` · `revision_num` · `field_name` · `old_value` · `new_value` · `sync_run_id` · `changed_at` | `id` · `permit_num` · `revision_num` · `sync_run_id` · `field_name` · `old_value` · `new_value` · `changed_at` | `none` | `n/a` | `docs/specs/00-architecture/01_database_schema.md` |
| writes | `permit_trades` | `permit_num` · `revision_num` · `trade_id` · `trade_slug` · `trade_name` · `tier` · `confidence` · `is_active` · `phase` · `lead_score` | `id` · `permit_num` · `revision_num` · `trade_id` · `tier` · `confidence` · `is_active` · `phase` · `lead_score` · `classified_at` · `attachment_basis` | `backfill_realtor_permit_trades` · `classify_permits` | `permits[16] · permits[13]` | `docs/specs/03-mobile/91_mobile_lead_feed.md` |
| writes | `permits` | `permit_num` · `revision_num` · `permit_type` · `structure_type` · `work` · `street_num` · `street_name` · `street_type` · `street_direction` · `city` · `postal` · `geo_id` · `building_type` · `category` · `application_date` · `issued_date` · `completed_date` · `status` · `description` · `est_const_cost` · `builder_name` · `owner` · `dwelling_units_created` · `dwelling_units_lost` · `ward` · `council_district` · `current_use` · `proposed_use` · `housing_units` · `storeys` · `data_hash` · `first_seen_at` · `last_seen_at` · `enriched_status` | `permit_num` · `revision_num` · `permit_type` · `structure_type` · `work` · `street_num` · `street_name` · `street_type` · `street_direction` · `city` · `postal` · `geo_id` · `building_type` · `category` · `application_date` · `issued_date` · `completed_date` · `status` · `description` · `est_const_cost` · `builder_name` · `owner` · `dwelling_units_created` · `dwelling_units_lost` · `ward` · `council_district` · `current_use` · `proposed_use` · `housing_units` · `storeys` · `latitude` · `longitude` · `geocoded_at` · `data_hash` · `first_seen_at` · `last_seen_at` · `raw_json` · `neighbourhood_id` · `project_type` · `scope_tags` · `scope_classified_at` · `scope_source` · `enriched_status` · `street_name_normalized` · `last_scraped_at` · `trade_classified_at` · `parcel_linked_at` · `location` · `photo_url` · `lifecycle_phase` · `lifecycle_stalled` · `lifecycle_classified_at` · `phase_started_at` · `updated_at` · `lead_id` · `linked_coa_application_number` · `lifecycle_seq` · `lifecycle_group` · `lifecycle_block` · `lifecycle_stage` · `bid_value` · `matched_status` · `matched_rule` · `unmapped_status` · `zoning_class` · `bylaw_max_coverage_pct` · `bylaw_max_fsi` · `bylaw_max_height_m` · `exception_number` · `applicable_bylaws` · `overlay_summary` · `zoning_parcel_count` · `zoning_dominant_parcel_id` · `zoning_dominant_parcel_method` · `zoning_enriched_at` · `is_in_ravine_protection_area` · `ravine_distance_m` · `is_heritage_designated` · `heritage_designation_type` · `heritage_designation_date` · `is_corner_lot` · `is_through_lot` · `primary_frontage_street_name` · `lot_size_sqm` · `frontage_m` · `depth_m` · `lot_size_confidence` · `lot_size_basis` · `max_build_setback_basis` · `max_buildable_footprint_sqm` · `max_build_width_m` · `max_build_length_m` · `max_build_height_m` · `max_build_stories` · `max_build_basis` · `max_buildable_gfa_sqm` · `max_buildable_gfa_basis` · `max_build_confidence` · `max_garden_suite_gfa_sqm` · `garden_suite_fits` · `envelope_constrained` · `envelope_constraint_reason` · `imagery_roof_footprint_sqm` · `existing_stories` · `existing_height_m` · `imagery_roof_gfa_sqm` · `existing_width_m` · `existing_length_m` · `existing_structure_confidence` · `existing_other_structures_count` · `existing_other_structures_sqm` · `existing_greenspace_sqm` · `max_newbuild_coa_gfa_sqm` · `cur_basement_gfa_sqm` · `cur_storey_gfa_sqm` · `cur_interior_reno_gfa_sqm` · `cur_est_kitchen_gfa_sqm` · `cur_est_bath_gfa_sqm` · `max_build_stories_basis` · `abuts_laneway` · `max_garage_gfa_sqm` · `garage_capacity_cars` · `garage_constraint_reason` · `garage_permission` · `max_laneway_suite_gfa_sqm` · `max_rear_suite_gfa_sqm` · `rear_suite_type` · `rear_suite_permission` · `cur_floor_gfa_sqm` · `cur_pot_2story_gfa_sqm` · `cur_pot_3story_gfa_sqm` · `cur_gfa_range_basis` · `existing_data_quality_flag` · `max_build_stories_aggressive` · `market_exceeds_bylaw` · `neighbourhood_cost_premium` · `residential_sqm` · `interior_alterations_sqm` · `assembly_sqm` · `institutional_sqm` · `mercantile_sqm` · `industrial_sqm` · `business_personal_services_sqm` · `opt_aor_storeys` · `opt_aor_gfa_sqm` · `opt_aor_units` · `opt_coa_storeys` · `opt_coa_gfa_sqm` · `opt_suite_type` · `opt_suite_fits_full` · `opt_binding_constraint` · `opt_config_confidence` · `comp_count` · `comp_dominant_build` · `comp_build_ratio_p50` · `comp_fsi_p50` · `cost_fb_total` · `cost_coa_total` · `cost_solar_total` · `cost_garden_suite_total` · `cost_laneway_suite_total` · `cost_garage_total` · `cost_gut_total` · `cost_addition_total` · `cost_kitchen_per_sqm` · `cost_bath_per_sqm` · `cost_basement_per_sqm` · `cost_basement_underpin_per_sqm` · `max_build_fsi` · `coa_fsi` · `realized_fsi_p90` | `classify_inspection_status` · `classify_lifecycle_phase` · `classify_permit_phase` · `classify_scope` · `classify_scope_class` · `classify_scope_tags` · `close_stale_permits` · `create_pre_permits` · `enrich_permits` · `geocode_permits` · `inspections` · `link_coa` · `link_neighbourhoods` · `link_similar` · `permits` | `deep_scrapes[1] · permits[23], coa[12] · permits[3] · permits[4] · not-in-a-chain · not-in-a-chain · permits[2] · not-in-a-chain · permits[9] · permits[7], sources[3] · deep_scrapes[0] · permits[19], coa[8] · permits[10], sources[17] · permits[12] · permits[1]` | `docs/specs/01-pipeline/41_chain_permits.md` |
| writes | `sync_runs` | `started_at` · `status` · `completed_at` · `records_total` · `records_new` · `records_updated` · `records_unchanged` · `records_errors` · `duration_ms` · `error_message` | `id` · `started_at` · `completed_at` · `status` · `records_total` · `records_new` · `records_updated` · `records_unchanged` · `records_errors` · `error_message` · `snapshot_path` · `duration_ms` | `none` | `n/a` | `docs/specs/00-architecture/115_scheduling.md` |

**3. Which contracts, and who calls them?**

**Nothing calls it.** An orphan contract — the exact shape this registry exists to surface.

**4. What gate, role or entitlement stands in front of it?**

session `admin` — classifyRoute("/api/admin/sync") returns "admin" (executed 2026-09-15); the handler adds no check of its own, so middleware is the only gate. · RLS class `B` · entitlement `none`

**5. What archetype, and why that one?**

`COMMAND` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: **UNRESEARCHED** — no SPEC LINK header and no System Map row, so there is nothing to check it against · anchors: `UNRESEARCHED — src/app/api/admin/sync/route.ts carries no SPEC LINK header and no System Map row lists it (docs/specs/00-architecture/00_system_map.md, searched 2026-09-15); guessing the nearest spec would be an invention`

**8. What is still unresearched?**

**4 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 27 entr(ies) in feature `F16`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-c-018"></a>

## Card 78 — `C-018` `contract_admin_users`

Registry detail: [`C-018`](../../../docs/reports/generated/127-surface-registry.md#c-018) `contract_admin_users`.

`CONTRACT` · `MUTATION` · scope `platform_shared` · feature `F16` platform-admin · build order 3162 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Gives an admin a searchable, filterable, paginated directory of all user accounts, and lets an admin manually create a new supplier or enterprise account — creating their login, sending a password-reset link and setting up their profile — for accounts that are not self-service signups.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `admin_backup_codes` | `id` · `code_hash` · `code_salt` · `user_id` · `used_at` | `id` · `user_id` · `code_hash` · `code_salt` · `used_at` · `created_at` | `none` | `n/a` | `docs/specs/00-architecture/13_authentication.md` |
| reads | `entitlements` | `status` · `user_id` · `product` | `user_id` · `product` · `status` · `stripe_subscription_id` · `current_period_end` · `trial_started_at` · `last_stripe_event_at` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/116_multi_product_architecture.md` |
| reads | `profiles` | `id` · `is_admin` | `id` · `is_admin` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/114_rls_policy_catalog.md` |
| reads | `user_profiles` | `user_id` · `email` · `phone_number` · `full_name` · `company_name` · `trade_slug` · `trade_slugs_override` · `account_preset` · `onboarding_complete` · `account_deleted_at` · `created_at` · `stripe_cancel_failed_at` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/02-web-admin/102_admin_notifications_tool.md` |
| writes | `admin_audit_log` | `admin_uid` · `action` · `target_uid` · `old_value` · `new_value` · `reason` | `id` · `admin_uid` · `action` · `target_uid` · `old_value` · `new_value` · `reason` · `created_at` | `none` | `n/a` | `docs/specs/02-web-admin/21_admin_user_management.md` |
| writes | `admin_backup_codes` | `used_at` | `id` · `user_id` · `code_hash` · `code_salt` · `used_at` · `created_at` | `none` | `n/a` | `docs/specs/00-architecture/13_authentication.md` |
| writes | `entitlements` | `user_id` · `product` · `status` · `created_at` · `updated_at` | `user_id` · `product` · `status` · `stripe_subscription_id` · `current_period_end` · `trial_started_at` · `last_stripe_event_at` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/116_multi_product_architecture.md` |
| writes | `user_profiles` | `user_id` · `email` · `company_name` · `account_preset` · `trade_slug` · `trade_slugs_override` · `radius_cap_km` · `onboarding_complete` · `updated_at` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/02-web-admin/102_admin_notifications_tool.md` |

**3. Which contracts, and who calls them?**

Called by 1: `src/features/admin-users/api/useAdminUsers.ts`

**4. What gate, role or entitlement stands in front of it?**

session `admin` — classifyRoute("/api/admin/users") returns "admin" (executed 2026-09-15); the handler re-verifies the caller in-process. · RLS class `A` · entitlement `none`

**5. What archetype, and why that one?**

`MUTATION` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/02-web-admin/21_admin_user_management.md`](../../../docs/specs/02-web-admin/21_admin_user_management.md) · anchors: `docs/specs/02-web-admin/21_admin_user_management.md §3.1 + §4 and docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §5 + §8 + §13 — src/app/api/admin/users/route.ts:1-2`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 27 entr(ies) in feature `F16`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-c-019"></a>

## Card 79 — `C-019` `contract_admin_users_uid`

Registry detail: [`C-019`](../../../docs/reports/generated/127-surface-registry.md#c-019) `contract_admin_users_uid`.

`CONTRACT` · `MUTATION` · scope `platform_shared` · feature `F16` platform-admin · build order 3162 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Lets an admin look up one user's full account record and activity, and make account-level changes to it: change which trades they're assigned, change their account tier, extend a free trial, revoke or suspend access, or permanently delete the account including cancelling their billing and scrubbing their personal data.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `admin_backup_codes` | `id` · `code_hash` · `code_salt` · `user_id` · `used_at` | `id` · `user_id` · `code_hash` · `code_salt` · `used_at` · `created_at` | `none` | `n/a` | `docs/specs/00-architecture/13_authentication.md` |
| reads | `entitlements` | `status` · `trial_started_at` · `user_id` · `product` | `user_id` · `product` · `status` · `stripe_subscription_id` · `current_period_end` · `trial_started_at` · `last_stripe_event_at` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/116_multi_product_architecture.md` |
| reads | `lead_view_events` | `user_id` | `user_id` · `permit_num` · `revision_num` · `viewed_at` | `none` | `n/a` | `docs/specs/03-mobile/95_mobile_user_profiles.md` |
| reads | `lead_views` | `user_id` · `saved` | `id` · `user_id` · `lead_key` · `lead_type` · `permit_num` · `revision_num` · `entity_id` · `trade_slug` · `viewed_at` · `saved` · `saved_at` | `none` | `n/a` | `docs/specs/01-pipeline/84_lifecycle_phase_engine.md` |
| reads | `profiles` | `id` · `is_admin` | `id` · `is_admin` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/114_rls_policy_catalog.md` |
| reads | `user_profiles` | `user_id` · `email` · `phone_number` · `full_name` · `company_name` · `display_name` · `trade_slug` · `trade_slugs_override` · `account_preset` · `radius_km` · `radius_cap_km` · `location_mode` · `stripe_customer_id` · `stripe_cancel_failed_at` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `lead_views_count` · `created_at` · `updated_at` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/02-web-admin/102_admin_notifications_tool.md` |
| writes | `admin_audit_log` | `admin_uid` · `action` · `target_uid` · `old_value` · `new_value` · `reason` | `id` · `admin_uid` · `action` · `target_uid` · `old_value` · `new_value` · `reason` · `created_at` | `none` | `n/a` | `docs/specs/02-web-admin/21_admin_user_management.md` |
| writes | `admin_backup_codes` | `used_at` | `id` · `user_id` · `code_hash` · `code_salt` · `used_at` · `created_at` | `none` | `n/a` | `docs/specs/00-architecture/13_authentication.md` |
| writes | `entitlements` | `user_id` · `product` · `status` · `trial_started_at` · `created_at` · `updated_at` | `user_id` · `product` · `status` · `stripe_subscription_id` · `current_period_end` · `trial_started_at` · `last_stripe_event_at` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/116_multi_product_architecture.md` |
| writes | `user_profiles` | `trade_slug` · `trade_slugs_override` · `updated_at` · `account_preset` · `full_name` · `phone_number` · `email` · `backup_email` · `company_name` · `account_deleted_at` · `stripe_cancel_failed_at` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/02-web-admin/102_admin_notifications_tool.md` |

**3. Which contracts, and who calls them?**

Called by 1: `src/features/admin-users/api/useAdminUsers.ts`

**4. What gate, role or entitlement stands in front of it?**

session `admin` — classifyRoute("/api/admin/users/X") returns "admin" (executed 2026-09-15); the handler re-verifies the caller in-process. · RLS class `A` · entitlement `none`

**5. What archetype, and why that one?**

`MUTATION` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/02-web-admin/21_admin_user_management.md`](../../../docs/specs/02-web-admin/21_admin_user_management.md) · anchors: `docs/specs/02-web-admin/21_admin_user_management.md §3 + §4; docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §5 + §8 + §13; docs/specs/00-architecture/116_multi_product_architecture.md §4 N2 + OD5 — src/app/api/admin/users/[uid]/route.ts:1-3`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 27 entr(ies) in feature `F16`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-c-028"></a>

## Card 80 — `C-028` `contract_quality`

Registry detail: [`C-028`](../../../docs/reports/generated/127-surface-registry.md#c-028) `contract_quality`.

`CONTRACT` · `QUERY` · scope `platform_shared` · feature `F16` platform-admin · build order 3162 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Returns the current data-quality dashboard and its 30-day trend: permit, trade, property and committee-of-adjustment metrics, detected volume, schema and duration anomalies, recent pipeline failures, and live database health statistics — for staff monitoring system health.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `data_quality_snapshots` | `all` | `id` · `snapshot_date` · `total_permits` · `active_permits` · `permits_with_trades` · `trade_matches_total` · `trade_avg_confidence` · `trade_tier1_count` · `trade_tier2_count` · `trade_tier3_count` · `permits_with_builder` · `builders_total` · `builders_enriched` · `builders_with_phone` · `builders_with_email` · `builders_with_website` · `builders_with_google` · `builders_with_wsib` · `permits_with_parcel` · `parcel_exact_matches` · `parcel_name_matches` · `parcel_avg_confidence` · `permits_with_neighbourhood` · `permits_geocoded` · `coa_total` · `coa_linked` · `coa_avg_confidence` · `coa_high_confidence` · `coa_low_confidence` · `permits_updated_24h` · `permits_updated_7d` · `permits_updated_30d` · `last_sync_at` · `last_sync_status` · `created_at` · `parcel_spatial_matches` · `permits_with_scope` · `scope_project_type_breakdown` · `building_footprints_total` · `parcels_with_buildings` · `permits_with_scope_tags` · `scope_tags_top` · `permits_with_detailed_tags` · `trade_residential_classified` · `trade_residential_total` · `trade_commercial_classified` · `trade_commercial_total` · `null_description_count` · `null_builder_name_count` · `null_est_const_cost_count` · `null_street_num_count` · `null_street_name_count` · `null_geo_id_count` · `violation_cost_out_of_range` · `violation_future_issued_date` · `violation_missing_status` · `violations_total` · `schema_column_counts` · `sla_permits_ingestion_hours` · `inspections_total` · `inspections_permits_scraped` · `inspections_outstanding_count` · `inspections_passed_count` · `inspections_not_passed_count` · `cost_estimates_total` · `cost_estimates_from_permit` · `cost_estimates_from_model` · `cost_estimates_null_cost` · `timing_calibration_total` · `timing_calibration_avg_sample` · `timing_calibration_freshness_hours` · `cost_estimates_liar_gate_overrides` · `cost_estimates_zero_total_bypass` | `compute_cost_estimates` · `refresh_snapshot` | `permits[17] · permits[20], coa[9], sources[25], deep_scrapes[3]` | `docs/specs/01-pipeline/41_chain_permits.md` |
| reads | `logic_variables` | `variable_key` · `variable_value` | `variable_key` · `variable_value` · `description` · `updated_at` · `variable_value_json` | `none` | `n/a` | `docs/specs/02-web-admin/86_control_panel.md` |
| reads | `pg_stat_user_tables` **(net-new)** | `relname` · `n_live_tup` · `n_dead_tup` · `seq_scan` · `idx_scan` | _does not exist yet_ | `none` | `n/a` | `n/a — PostgreSQL system catalog/view; no Buildo spec owns it` |
| reads | `pipeline_runs` | `pipeline` · `duration_ms` · `status` · `started_at` · `records_meta` · `error_message` | `id` · `pipeline` · `started_at` · `completed_at` · `status` · `records_total` · `records_new` · `records_updated` · `error_message` · `duration_ms` · `records_meta` | `assert_data_bounds` · `assert_pre_permit_aging` · `assert_schema` | `permits[21], coa[10], sources[26], deep_scrapes[4] · not-in-a-chain · permits[0], coa[0], sources[1]` | `docs/specs/01-pipeline/41_chain_permits.md` |

**3. Which contracts, and who calls them?**

Called by 1: `admin_data_quality`

**4. What gate, role or entitlement stands in front of it?**

session `anon` — classifyRoute("/api/quality") returns "public" (executed 2026-09-15); the handler adds no check of its own, so middleware is the only gate. · RLS class `B` · entitlement `none`

**5. What archetype, and why that one?**

`QUERY` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/02-web-admin/26_admin_dashboard.md`](../../../docs/specs/02-web-admin/26_admin_dashboard.md) · anchors: `docs/specs/02-web-admin/26_admin_dashboard.md — owns src/app/api/quality/route.ts per docs/specs/00-architecture/00_system_map.md:87; the System Map row names no section, and the route file carries no SPEC LINK header`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 27 entr(ies) in feature `F16`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-c-029"></a>

## Card 81 — `C-029` `contract_quality_refresh`

Registry detail: [`C-029`](../../../docs/reports/generated/127-surface-registry.md#c-029) `contract_quality_refresh`.

`CONTRACT` · `COMMAND` · scope `platform_shared` · feature `F16` platform-admin · build order 3162 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Forces an immediate recomputation of today's data-quality snapshot — permit counts, trade-match rates, builder enrichment, property linkage and so on — instead of waiting for the next scheduled capture, so the quality dashboard reflects current numbers on demand.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `building_footprints` | `all (COUNT(*) only)` | `id` · `source_id` · `geometry` · `footprint_area_sqm` · `footprint_area_sqft` · `max_height_m` · `min_height_m` · `elev_z` · `estimated_stories` · `centroid_lat` · `centroid_lng` · `created_at` · `geom` | `massing` | `sources[14]` | `docs/specs/01-pipeline/43_chain_sources.md` |
| reads | `coa_applications` | `linked_permit_num` · `linked_confidence` | `id` · `application_number` · `address` · `street_num` · `street_name` · `ward` · `status` · `decision` · `decision_date` · `hearing_date` · `description` · `applicant` · `linked_permit_num` · `linked_confidence` · `data_hash` · `first_seen_at` · `last_seen_at` · `sub_type` · `street_name_normalized` · `lifecycle_phase` · `lifecycle_classified_at` · `lifecycle_stalled` · `lead_id` · `coa_type_class` · `project_type` · `scope_tags` · `scope_classified_at` · `scope_source` · `structure_type` · `neighbourhood_id` · `latitude` · `longitude` · `modeled_gfa_sqm` · `estimated_cost` · `cost_source` · `cost_classified_at` · `lifecycle_seq` · `lifecycle_group` · `lifecycle_block` · `lifecycle_stage` · `bid_value` · `parcel_linked_at` · `trade_classified_at` · `matched_status` · `matched_rule` · `unmapped_status` · `unmapped_decision` · `zoning_class` · `bylaw_max_coverage_pct` · `bylaw_max_fsi` · `bylaw_max_height_m` · `exception_number` · `variance_context` · `zoning_parcel_count` · `zoning_dominant_parcel_id` · `zoning_dominant_parcel_method` · `zoning_enriched_at` · `is_in_ravine_protection_area` · `ravine_distance_m` · `is_heritage_designated` · `heritage_designation_type` · `heritage_designation_date` · `is_corner_lot` · `is_through_lot` · `primary_frontage_street_name` · `lot_size_sqm` · `frontage_m` · `depth_m` · `lot_size_confidence` · `lot_size_basis` · `max_build_setback_basis` · `max_buildable_footprint_sqm` · `max_build_width_m` · `max_build_length_m` · `max_build_height_m` · `max_build_stories` · `max_build_basis` · `max_buildable_gfa_sqm` · `max_buildable_gfa_basis` · `max_build_confidence` · `max_garden_suite_gfa_sqm` · `garden_suite_fits` · `envelope_constrained` · `envelope_constraint_reason` · `imagery_roof_footprint_sqm` · `existing_stories` · `existing_height_m` · `imagery_roof_gfa_sqm` · `existing_width_m` · `existing_length_m` · `existing_structure_confidence` · `existing_other_structures_count` · `existing_other_structures_sqm` · `existing_greenspace_sqm` · `max_newbuild_coa_gfa_sqm` · `cur_basement_gfa_sqm` · `cur_storey_gfa_sqm` · `cur_interior_reno_gfa_sqm` · `cur_est_kitchen_gfa_sqm` · `cur_est_bath_gfa_sqm` · `max_build_stories_basis` · `abuts_laneway` · `max_garage_gfa_sqm` · `garage_capacity_cars` · `garage_constraint_reason` · `garage_permission` · `max_laneway_suite_gfa_sqm` · `max_rear_suite_gfa_sqm` · `rear_suite_type` · `rear_suite_permission` · `cur_floor_gfa_sqm` · `cur_pot_2story_gfa_sqm` · `cur_pot_3story_gfa_sqm` · `cur_gfa_range_basis` · `existing_data_quality_flag` · `max_build_stories_aggressive` · `market_exceeds_bylaw` · `neighbourhood_cost_premium` · `opt_aor_storeys` · `opt_aor_gfa_sqm` · `opt_aor_units` · `opt_coa_storeys` · `opt_coa_gfa_sqm` · `opt_suite_type` · `opt_suite_fits_full` · `opt_binding_constraint` · `opt_config_confidence` · `comp_count` · `comp_dominant_build` · `comp_build_ratio_p50` · `comp_fsi_p50` · `cost_fb_total` · `cost_coa_total` · `cost_solar_total` · `cost_garden_suite_total` · `cost_laneway_suite_total` · `cost_garage_total` · `cost_gut_total` · `cost_addition_total` · `cost_kitchen_per_sqm` · `cost_bath_per_sqm` · `cost_basement_per_sqm` · `cost_basement_underpin_per_sqm` · `max_build_fsi` · `coa_fsi` · `realized_fsi_p90` | `classify_coa_scope` · `classify_coa_trades` · `classify_lifecycle_phase` · `coa` · `compute_coa_cost_estimates` · `enrich_coa_zoning` · `link_coa` · `link_coa_to_parcels` | `coa[5] · coa[6] · permits[23], coa[12] · coa[1] · coa[7] · coa[4] · permits[19], coa[8] · coa[3]` | `docs/specs/01-pipeline/42_chain_coa.md` |
| reads | `entities` | `last_enriched_at` · `primary_phone` · `primary_email` · `website` · `google_place_id` · `is_wsib_registered` | `id` · `legal_name` · `trade_name` · `name_normalized` · `entity_type` · `primary_phone` · `primary_email` · `website` · `linkedin_url` · `google_place_id` · `google_rating` · `google_review_count` · `is_wsib_registered` · `permit_count` · `first_seen_at` · `last_seen_at` · `last_enriched_at` · `photo_url` · `photo_validated_at` | `builders` · `enrich_named_builders` · `enrich_wsib_builders` · `link_wsib` | `permits[5] · entities[1] · entities[0] · permits[6], sources[19]` | `docs/specs/01-pipeline/41_chain_permits.md` |
| reads | `information_schema.columns` **(net-new)** | `table_name` · `table_schema` | _does not exist yet_ | `none` | `n/a` | `n/a — PostgreSQL system catalog/view; no Buildo spec owns it` |
| reads | `parcel_buildings` | `parcel_id` | `id` · `parcel_id` · `building_id` · `is_primary` · `structure_type` · `linked_at` · `match_type` · `confidence` | `link_massing` | `permits[11], sources[15]` | `docs/specs/01-pipeline/56_source_massing.md` |
| reads | `permit_inspections` | `permit_num` · `status` | `id` · `permit_num` · `stage_name` · `status` · `inspection_date` · `scraped_at` · `created_at` | `inspections` | `deep_scrapes[0]` | `docs/specs/01-pipeline/44_chain_deep_scrapes.md` |
| reads | `permit_parcels` | `permit_num` · `revision_num` · `match_type` · `confidence` | `id` · `permit_num` · `revision_num` · `parcel_id` · `match_type` · `confidence` · `linked_at` | `link_parcels` | `permits[8], sources[10]` | `docs/specs/01-pipeline/41_chain_permits.md` |
| reads | `permit_trades` | `permit_num` · `revision_num` · `confidence` · `tier` | `id` · `permit_num` · `revision_num` · `trade_id` · `tier` · `confidence` · `is_active` · `phase` · `lead_score` · `classified_at` · `attachment_basis` | `backfill_realtor_permit_trades` · `classify_permits` | `permits[16] · permits[13]` | `docs/specs/03-mobile/91_mobile_lead_feed.md` |
| reads | `permits` | `status` · `builder_name` · `neighbourhood_id` · `latitude` · `longitude` · `scope_tags` · `last_seen_at` · `description` · `est_const_cost` · `street_num` · `street_name` · `geo_id` · `issued_date` · `first_seen_at` · `permit_num` · `revision_num` | `permit_num` · `revision_num` · `permit_type` · `structure_type` · `work` · `street_num` · `street_name` · `street_type` · `street_direction` · `city` · `postal` · `geo_id` · `building_type` · `category` · `application_date` · `issued_date` · `completed_date` · `status` · `description` · `est_const_cost` · `builder_name` · `owner` · `dwelling_units_created` · `dwelling_units_lost` · `ward` · `council_district` · `current_use` · `proposed_use` · `housing_units` · `storeys` · `latitude` · `longitude` · `geocoded_at` · `data_hash` · `first_seen_at` · `last_seen_at` · `raw_json` · `neighbourhood_id` · `project_type` · `scope_tags` · `scope_classified_at` · `scope_source` · `enriched_status` · `street_name_normalized` · `last_scraped_at` · `trade_classified_at` · `parcel_linked_at` · `location` · `photo_url` · `lifecycle_phase` · `lifecycle_stalled` · `lifecycle_classified_at` · `phase_started_at` · `updated_at` · `lead_id` · `linked_coa_application_number` · `lifecycle_seq` · `lifecycle_group` · `lifecycle_block` · `lifecycle_stage` · `bid_value` · `matched_status` · `matched_rule` · `unmapped_status` · `zoning_class` · `bylaw_max_coverage_pct` · `bylaw_max_fsi` · `bylaw_max_height_m` · `exception_number` · `applicable_bylaws` · `overlay_summary` · `zoning_parcel_count` · `zoning_dominant_parcel_id` · `zoning_dominant_parcel_method` · `zoning_enriched_at` · `is_in_ravine_protection_area` · `ravine_distance_m` · `is_heritage_designated` · `heritage_designation_type` · `heritage_designation_date` · `is_corner_lot` · `is_through_lot` · `primary_frontage_street_name` · `lot_size_sqm` · `frontage_m` · `depth_m` · `lot_size_confidence` · `lot_size_basis` · `max_build_setback_basis` · `max_buildable_footprint_sqm` · `max_build_width_m` · `max_build_length_m` · `max_build_height_m` · `max_build_stories` · `max_build_basis` · `max_buildable_gfa_sqm` · `max_buildable_gfa_basis` · `max_build_confidence` · `max_garden_suite_gfa_sqm` · `garden_suite_fits` · `envelope_constrained` · `envelope_constraint_reason` · `imagery_roof_footprint_sqm` · `existing_stories` · `existing_height_m` · `imagery_roof_gfa_sqm` · `existing_width_m` · `existing_length_m` · `existing_structure_confidence` · `existing_other_structures_count` · `existing_other_structures_sqm` · `existing_greenspace_sqm` · `max_newbuild_coa_gfa_sqm` · `cur_basement_gfa_sqm` · `cur_storey_gfa_sqm` · `cur_interior_reno_gfa_sqm` · `cur_est_kitchen_gfa_sqm` · `cur_est_bath_gfa_sqm` · `max_build_stories_basis` · `abuts_laneway` · `max_garage_gfa_sqm` · `garage_capacity_cars` · `garage_constraint_reason` · `garage_permission` · `max_laneway_suite_gfa_sqm` · `max_rear_suite_gfa_sqm` · `rear_suite_type` · `rear_suite_permission` · `cur_floor_gfa_sqm` · `cur_pot_2story_gfa_sqm` · `cur_pot_3story_gfa_sqm` · `cur_gfa_range_basis` · `existing_data_quality_flag` · `max_build_stories_aggressive` · `market_exceeds_bylaw` · `neighbourhood_cost_premium` · `residential_sqm` · `interior_alterations_sqm` · `assembly_sqm` · `institutional_sqm` · `mercantile_sqm` · `industrial_sqm` · `business_personal_services_sqm` · `opt_aor_storeys` · `opt_aor_gfa_sqm` · `opt_aor_units` · `opt_coa_storeys` · `opt_coa_gfa_sqm` · `opt_suite_type` · `opt_suite_fits_full` · `opt_binding_constraint` · `opt_config_confidence` · `comp_count` · `comp_dominant_build` · `comp_build_ratio_p50` · `comp_fsi_p50` · `cost_fb_total` · `cost_coa_total` · `cost_solar_total` · `cost_garden_suite_total` · `cost_laneway_suite_total` · `cost_garage_total` · `cost_gut_total` · `cost_addition_total` · `cost_kitchen_per_sqm` · `cost_bath_per_sqm` · `cost_basement_per_sqm` · `cost_basement_underpin_per_sqm` · `max_build_fsi` · `coa_fsi` · `realized_fsi_p90` | `classify_inspection_status` · `classify_lifecycle_phase` · `classify_permit_phase` · `classify_scope` · `classify_scope_class` · `classify_scope_tags` · `close_stale_permits` · `create_pre_permits` · `enrich_permits` · `geocode_permits` · `inspections` · `link_coa` · `link_neighbourhoods` · `link_similar` · `permits` | `deep_scrapes[1] · permits[23], coa[12] · permits[3] · permits[4] · not-in-a-chain · not-in-a-chain · permits[2] · not-in-a-chain · permits[9] · permits[7], sources[3] · deep_scrapes[0] · permits[19], coa[8] · permits[10], sources[17] · permits[12] · permits[1]` | `docs/specs/01-pipeline/41_chain_permits.md` |
| reads | `sync_runs` | `started_at` · `status` | `id` · `started_at` · `completed_at` · `status` · `records_total` · `records_new` · `records_updated` · `records_unchanged` · `records_errors` · `error_message` · `snapshot_path` · `duration_ms` | `none` | `n/a` | `docs/specs/00-architecture/115_scheduling.md` |
| writes | `data_quality_snapshots` | `snapshot_date` · `total_permits` · `active_permits` · `permits_with_trades` · `trade_matches_total` · `trade_avg_confidence` · `trade_tier1_count` · `trade_tier2_count` · `trade_tier3_count` · `trade_residential_classified` · `trade_residential_total` · `trade_commercial_classified` · `trade_commercial_total` · `permits_with_builder` · `builders_total` · `builders_enriched` · `builders_with_phone` · `builders_with_email` · `builders_with_website` · `builders_with_google` · `builders_with_wsib` · `permits_with_parcel` · `parcel_exact_matches` · `parcel_name_matches` · `parcel_spatial_matches` · `parcel_avg_confidence` · `permits_with_neighbourhood` · `permits_geocoded` · `coa_total` · `coa_linked` · `coa_avg_confidence` · `coa_high_confidence` · `coa_low_confidence` · `permits_with_scope` · `scope_project_type_breakdown` · `permits_with_scope_tags` · `permits_with_detailed_tags` · `scope_tags_top` · `permits_updated_24h` · `permits_updated_7d` · `permits_updated_30d` · `last_sync_at` · `last_sync_status` · `building_footprints_total` · `parcels_with_buildings` · `null_description_count` · `null_builder_name_count` · `null_est_const_cost_count` · `null_street_num_count` · `null_street_name_count` · `null_geo_id_count` · `violation_cost_out_of_range` · `violation_future_issued_date` · `violation_missing_status` · `violations_total` · `schema_column_counts` · `sla_permits_ingestion_hours` · `inspections_total` · `inspections_permits_scraped` · `inspections_outstanding_count` · `inspections_passed_count` · `inspections_not_passed_count` | `id` · `snapshot_date` · `total_permits` · `active_permits` · `permits_with_trades` · `trade_matches_total` · `trade_avg_confidence` · `trade_tier1_count` · `trade_tier2_count` · `trade_tier3_count` · `permits_with_builder` · `builders_total` · `builders_enriched` · `builders_with_phone` · `builders_with_email` · `builders_with_website` · `builders_with_google` · `builders_with_wsib` · `permits_with_parcel` · `parcel_exact_matches` · `parcel_name_matches` · `parcel_avg_confidence` · `permits_with_neighbourhood` · `permits_geocoded` · `coa_total` · `coa_linked` · `coa_avg_confidence` · `coa_high_confidence` · `coa_low_confidence` · `permits_updated_24h` · `permits_updated_7d` · `permits_updated_30d` · `last_sync_at` · `last_sync_status` · `created_at` · `parcel_spatial_matches` · `permits_with_scope` · `scope_project_type_breakdown` · `building_footprints_total` · `parcels_with_buildings` · `permits_with_scope_tags` · `scope_tags_top` · `permits_with_detailed_tags` · `trade_residential_classified` · `trade_residential_total` · `trade_commercial_classified` · `trade_commercial_total` · `null_description_count` · `null_builder_name_count` · `null_est_const_cost_count` · `null_street_num_count` · `null_street_name_count` · `null_geo_id_count` · `violation_cost_out_of_range` · `violation_future_issued_date` · `violation_missing_status` · `violations_total` · `schema_column_counts` · `sla_permits_ingestion_hours` · `inspections_total` · `inspections_permits_scraped` · `inspections_outstanding_count` · `inspections_passed_count` · `inspections_not_passed_count` · `cost_estimates_total` · `cost_estimates_from_permit` · `cost_estimates_from_model` · `cost_estimates_null_cost` · `timing_calibration_total` · `timing_calibration_avg_sample` · `timing_calibration_freshness_hours` · `cost_estimates_liar_gate_overrides` · `cost_estimates_zero_total_bypass` | `compute_cost_estimates` · `refresh_snapshot` | `permits[17] · permits[20], coa[9], sources[25], deep_scrapes[3]` | `docs/specs/01-pipeline/41_chain_permits.md` |

**3. Which contracts, and who calls them?**

**Nothing calls it.** An orphan contract — the exact shape this registry exists to surface.

**4. What gate, role or entitlement stands in front of it?**

session `authenticated` — classifyRoute("/api/quality/refresh") returns "authenticated" (executed 2026-09-15); the handler adds no check of its own, so middleware is the only gate. · RLS class `B` · entitlement `none`

**5. What archetype, and why that one?**

`COMMAND` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: **UNRESEARCHED** — no SPEC LINK header and no System Map row, so there is nothing to check it against · anchors: `UNRESEARCHED — src/app/api/quality/refresh/route.ts carries no SPEC LINK header and no System Map row lists it (docs/specs/00-architecture/00_system_map.md, searched 2026-09-15); guessing the nearest spec would be an invention`

**8. What is still unresearched?**

**4 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 27 entr(ies) in feature `F16`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-c-033"></a>

## Card 82 — `C-033` `contract_sync`

Registry detail: [`C-033`](../../../docs/reports/generated/127-surface-registry.md#c-033) `contract_sync`.

`CONTRACT` · `COMMAND` · scope `platform_shared` · feature `F16` platform-admin · build order 3162 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Shows the history of recent data-import runs that pull the City of Toronto's open permit data into the system, and lets an operator manually kick off a new import from a given file, updating and classifying permits as it goes.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `permit_type_classifications` | `permit_type` · `class` | `permit_type` · `class` · `notes` · `updated_at` | `none` | `n/a` | `docs/specs/01-pipeline/80_taxonomies.md` |
| reads | `permits` | `all` | `permit_num` · `revision_num` · `permit_type` · `structure_type` · `work` · `street_num` · `street_name` · `street_type` · `street_direction` · `city` · `postal` · `geo_id` · `building_type` · `category` · `application_date` · `issued_date` · `completed_date` · `status` · `description` · `est_const_cost` · `builder_name` · `owner` · `dwelling_units_created` · `dwelling_units_lost` · `ward` · `council_district` · `current_use` · `proposed_use` · `housing_units` · `storeys` · `latitude` · `longitude` · `geocoded_at` · `data_hash` · `first_seen_at` · `last_seen_at` · `raw_json` · `neighbourhood_id` · `project_type` · `scope_tags` · `scope_classified_at` · `scope_source` · `enriched_status` · `street_name_normalized` · `last_scraped_at` · `trade_classified_at` · `parcel_linked_at` · `location` · `photo_url` · `lifecycle_phase` · `lifecycle_stalled` · `lifecycle_classified_at` · `phase_started_at` · `updated_at` · `lead_id` · `linked_coa_application_number` · `lifecycle_seq` · `lifecycle_group` · `lifecycle_block` · `lifecycle_stage` · `bid_value` · `matched_status` · `matched_rule` · `unmapped_status` · `zoning_class` · `bylaw_max_coverage_pct` · `bylaw_max_fsi` · `bylaw_max_height_m` · `exception_number` · `applicable_bylaws` · `overlay_summary` · `zoning_parcel_count` · `zoning_dominant_parcel_id` · `zoning_dominant_parcel_method` · `zoning_enriched_at` · `is_in_ravine_protection_area` · `ravine_distance_m` · `is_heritage_designated` · `heritage_designation_type` · `heritage_designation_date` · `is_corner_lot` · `is_through_lot` · `primary_frontage_street_name` · `lot_size_sqm` · `frontage_m` · `depth_m` · `lot_size_confidence` · `lot_size_basis` · `max_build_setback_basis` · `max_buildable_footprint_sqm` · `max_build_width_m` · `max_build_length_m` · `max_build_height_m` · `max_build_stories` · `max_build_basis` · `max_buildable_gfa_sqm` · `max_buildable_gfa_basis` · `max_build_confidence` · `max_garden_suite_gfa_sqm` · `garden_suite_fits` · `envelope_constrained` · `envelope_constraint_reason` · `imagery_roof_footprint_sqm` · `existing_stories` · `existing_height_m` · `imagery_roof_gfa_sqm` · `existing_width_m` · `existing_length_m` · `existing_structure_confidence` · `existing_other_structures_count` · `existing_other_structures_sqm` · `existing_greenspace_sqm` · `max_newbuild_coa_gfa_sqm` · `cur_basement_gfa_sqm` · `cur_storey_gfa_sqm` · `cur_interior_reno_gfa_sqm` · `cur_est_kitchen_gfa_sqm` · `cur_est_bath_gfa_sqm` · `max_build_stories_basis` · `abuts_laneway` · `max_garage_gfa_sqm` · `garage_capacity_cars` · `garage_constraint_reason` · `garage_permission` · `max_laneway_suite_gfa_sqm` · `max_rear_suite_gfa_sqm` · `rear_suite_type` · `rear_suite_permission` · `cur_floor_gfa_sqm` · `cur_pot_2story_gfa_sqm` · `cur_pot_3story_gfa_sqm` · `cur_gfa_range_basis` · `existing_data_quality_flag` · `max_build_stories_aggressive` · `market_exceeds_bylaw` · `neighbourhood_cost_premium` · `residential_sqm` · `interior_alterations_sqm` · `assembly_sqm` · `institutional_sqm` · `mercantile_sqm` · `industrial_sqm` · `business_personal_services_sqm` · `opt_aor_storeys` · `opt_aor_gfa_sqm` · `opt_aor_units` · `opt_coa_storeys` · `opt_coa_gfa_sqm` · `opt_suite_type` · `opt_suite_fits_full` · `opt_binding_constraint` · `opt_config_confidence` · `comp_count` · `comp_dominant_build` · `comp_build_ratio_p50` · `comp_fsi_p50` · `cost_fb_total` · `cost_coa_total` · `cost_solar_total` · `cost_garden_suite_total` · `cost_laneway_suite_total` · `cost_garage_total` · `cost_gut_total` · `cost_addition_total` · `cost_kitchen_per_sqm` · `cost_bath_per_sqm` · `cost_basement_per_sqm` · `cost_basement_underpin_per_sqm` · `max_build_fsi` · `coa_fsi` · `realized_fsi_p90` | `classify_inspection_status` · `classify_lifecycle_phase` · `classify_permit_phase` · `classify_scope` · `classify_scope_class` · `classify_scope_tags` · `close_stale_permits` · `create_pre_permits` · `enrich_permits` · `geocode_permits` · `inspections` · `link_coa` · `link_neighbourhoods` · `link_similar` · `permits` | `deep_scrapes[1] · permits[23], coa[12] · permits[3] · permits[4] · not-in-a-chain · not-in-a-chain · permits[2] · not-in-a-chain · permits[9] · permits[7], sources[3] · deep_scrapes[0] · permits[19], coa[8] · permits[10], sources[17] · permits[12] · permits[1]` | `docs/specs/01-pipeline/41_chain_permits.md` |
| reads | `sync_runs` | `all` | `id` · `started_at` · `completed_at` · `status` · `records_total` · `records_new` · `records_updated` · `records_unchanged` · `records_errors` · `error_message` · `snapshot_path` · `duration_ms` | `none` | `n/a` | `docs/specs/00-architecture/115_scheduling.md` |
| reads | `trade_mapping_rules` | `all` | `id` · `trade_id` · `tier` · `match_field` · `match_pattern` · `confidence` · `phase_start` · `phase_end` · `is_active` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/01_database_schema.md` |
| reads | `trades` | `id` · `slug` | `id` · `slug` · `name` · `icon` · `color` · `sort_order` · `created_at` · `kind` · `seq` · `cost_basis` | `none` | `n/a` | `docs/specs/01-pipeline/84_lifecycle_phase_engine.md` |
| writes | `permit_history` | `permit_num` · `revision_num` · `field_name` · `old_value` · `new_value` · `sync_run_id` · `changed_at` | `id` · `permit_num` · `revision_num` · `sync_run_id` · `field_name` · `old_value` · `new_value` · `changed_at` | `none` | `n/a` | `docs/specs/00-architecture/01_database_schema.md` |
| writes | `permit_trades` | `permit_num` · `revision_num` · `trade_id` · `trade_slug` · `trade_name` · `tier` · `confidence` · `is_active` · `phase` · `lead_score` · `permit_num (predicate)` · `revision_num (predicate)` | `id` · `permit_num` · `revision_num` · `trade_id` · `tier` · `confidence` · `is_active` · `phase` · `lead_score` · `classified_at` · `attachment_basis` | `backfill_realtor_permit_trades` · `classify_permits` | `permits[16] · permits[13]` | `docs/specs/03-mobile/91_mobile_lead_feed.md` |
| writes | `permits` | `permit_num` · `revision_num` · `permit_type` · `structure_type` · `work` · `street_num` · `street_name` · `street_type` · `street_direction` · `city` · `postal` · `geo_id` · `building_type` · `category` · `application_date` · `issued_date` · `completed_date` · `status` · `description` · `est_const_cost` · `builder_name` · `owner` · `dwelling_units_created` · `dwelling_units_lost` · `ward` · `council_district` · `current_use` · `proposed_use` · `housing_units` · `storeys` · `data_hash` · `first_seen_at` · `last_seen_at` · `enriched_status` | `permit_num` · `revision_num` · `permit_type` · `structure_type` · `work` · `street_num` · `street_name` · `street_type` · `street_direction` · `city` · `postal` · `geo_id` · `building_type` · `category` · `application_date` · `issued_date` · `completed_date` · `status` · `description` · `est_const_cost` · `builder_name` · `owner` · `dwelling_units_created` · `dwelling_units_lost` · `ward` · `council_district` · `current_use` · `proposed_use` · `housing_units` · `storeys` · `latitude` · `longitude` · `geocoded_at` · `data_hash` · `first_seen_at` · `last_seen_at` · `raw_json` · `neighbourhood_id` · `project_type` · `scope_tags` · `scope_classified_at` · `scope_source` · `enriched_status` · `street_name_normalized` · `last_scraped_at` · `trade_classified_at` · `parcel_linked_at` · `location` · `photo_url` · `lifecycle_phase` · `lifecycle_stalled` · `lifecycle_classified_at` · `phase_started_at` · `updated_at` · `lead_id` · `linked_coa_application_number` · `lifecycle_seq` · `lifecycle_group` · `lifecycle_block` · `lifecycle_stage` · `bid_value` · `matched_status` · `matched_rule` · `unmapped_status` · `zoning_class` · `bylaw_max_coverage_pct` · `bylaw_max_fsi` · `bylaw_max_height_m` · `exception_number` · `applicable_bylaws` · `overlay_summary` · `zoning_parcel_count` · `zoning_dominant_parcel_id` · `zoning_dominant_parcel_method` · `zoning_enriched_at` · `is_in_ravine_protection_area` · `ravine_distance_m` · `is_heritage_designated` · `heritage_designation_type` · `heritage_designation_date` · `is_corner_lot` · `is_through_lot` · `primary_frontage_street_name` · `lot_size_sqm` · `frontage_m` · `depth_m` · `lot_size_confidence` · `lot_size_basis` · `max_build_setback_basis` · `max_buildable_footprint_sqm` · `max_build_width_m` · `max_build_length_m` · `max_build_height_m` · `max_build_stories` · `max_build_basis` · `max_buildable_gfa_sqm` · `max_buildable_gfa_basis` · `max_build_confidence` · `max_garden_suite_gfa_sqm` · `garden_suite_fits` · `envelope_constrained` · `envelope_constraint_reason` · `imagery_roof_footprint_sqm` · `existing_stories` · `existing_height_m` · `imagery_roof_gfa_sqm` · `existing_width_m` · `existing_length_m` · `existing_structure_confidence` · `existing_other_structures_count` · `existing_other_structures_sqm` · `existing_greenspace_sqm` · `max_newbuild_coa_gfa_sqm` · `cur_basement_gfa_sqm` · `cur_storey_gfa_sqm` · `cur_interior_reno_gfa_sqm` · `cur_est_kitchen_gfa_sqm` · `cur_est_bath_gfa_sqm` · `max_build_stories_basis` · `abuts_laneway` · `max_garage_gfa_sqm` · `garage_capacity_cars` · `garage_constraint_reason` · `garage_permission` · `max_laneway_suite_gfa_sqm` · `max_rear_suite_gfa_sqm` · `rear_suite_type` · `rear_suite_permission` · `cur_floor_gfa_sqm` · `cur_pot_2story_gfa_sqm` · `cur_pot_3story_gfa_sqm` · `cur_gfa_range_basis` · `existing_data_quality_flag` · `max_build_stories_aggressive` · `market_exceeds_bylaw` · `neighbourhood_cost_premium` · `residential_sqm` · `interior_alterations_sqm` · `assembly_sqm` · `institutional_sqm` · `mercantile_sqm` · `industrial_sqm` · `business_personal_services_sqm` · `opt_aor_storeys` · `opt_aor_gfa_sqm` · `opt_aor_units` · `opt_coa_storeys` · `opt_coa_gfa_sqm` · `opt_suite_type` · `opt_suite_fits_full` · `opt_binding_constraint` · `opt_config_confidence` · `comp_count` · `comp_dominant_build` · `comp_build_ratio_p50` · `comp_fsi_p50` · `cost_fb_total` · `cost_coa_total` · `cost_solar_total` · `cost_garden_suite_total` · `cost_laneway_suite_total` · `cost_garage_total` · `cost_gut_total` · `cost_addition_total` · `cost_kitchen_per_sqm` · `cost_bath_per_sqm` · `cost_basement_per_sqm` · `cost_basement_underpin_per_sqm` · `max_build_fsi` · `coa_fsi` · `realized_fsi_p90` | `classify_inspection_status` · `classify_lifecycle_phase` · `classify_permit_phase` · `classify_scope` · `classify_scope_class` · `classify_scope_tags` · `close_stale_permits` · `create_pre_permits` · `enrich_permits` · `geocode_permits` · `inspections` · `link_coa` · `link_neighbourhoods` · `link_similar` · `permits` | `deep_scrapes[1] · permits[23], coa[12] · permits[3] · permits[4] · not-in-a-chain · not-in-a-chain · permits[2] · not-in-a-chain · permits[9] · permits[7], sources[3] · deep_scrapes[0] · permits[19], coa[8] · permits[10], sources[17] · permits[12] · permits[1]` | `docs/specs/01-pipeline/41_chain_permits.md` |
| writes | `sync_runs` | `started_at` · `status` · `completed_at` · `records_total` · `records_new` · `records_updated` · `records_unchanged` · `records_errors` · `duration_ms` · `error_message` | `id` · `started_at` · `completed_at` · `status` · `records_total` · `records_new` · `records_updated` · `records_unchanged` · `records_errors` · `error_message` · `snapshot_path` · `duration_ms` | `none` | `n/a` | `docs/specs/00-architecture/115_scheduling.md` |

**3. Which contracts, and who calls them?**

**Nothing calls it.** An orphan contract — the exact shape this registry exists to surface.

**4. What gate, role or entitlement stands in front of it?**

session `authenticated` — classifyRoute("/api/sync") returns "authenticated" (executed 2026-09-15); the handler adds no check of its own, so middleware is the only gate. · RLS class `B` · entitlement `none`

**5. What archetype, and why that one?**

`COMMAND` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/00-architecture/06_permits_rest_api.md`](../../../docs/specs/00-architecture/06_permits_rest_api.md) · anchors: `docs/specs/00-architecture/06_permits_rest_api.md — owns src/app/api/sync/route.ts per docs/specs/00-architecture/00_system_map.md:13; the System Map row names no section, and the route file carries no SPEC LINK header`

**8. What is still unresearched?**

**2 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 27 entr(ies) in feature `F16`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-018"></a>

## Card 83 — `S-018` `admin_app_health`

Registry detail: [`S-018`](../../../docs/reports/generated/127-surface-registry.md#s-018) `admin_app_health`.

`SURFACE` · `DASHBOARD` · scope `platform_shared` · feature `F16` platform-admin · build order 3163 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

An operator's at-a-glance read on how the mobile and web apps are behaving. Five tiles show the crash rate over the last day, how many sign-in attempts succeed by method over the last week, how often a viewed lead gets saved, how often the paywall gets clicked, and how much cache-refresh chatter there was. Each tile links out to the deeper analytics tools, and a tile that cannot reach its data source says so with the reason instead of showing a wrong number.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `profiles` | `is_admin` | `id` · `is_admin` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/114_rls_policy_catalog.md §5` |

**3. Which contracts, and who calls them?**

Calls 1: `/api/admin/app-health`

**4. What gate, role or entitlement stands in front of it?**

session `admin` — There is no admin Postgres role: classifyRoute sends every /admin/* path down the admin arm, and the real boundary is verifyAdminAuth reading profiles.is_admin on the route. This route calls it on the first line of GET. · RLS class `B` · entitlement `none`

**5. What archetype, and why that one?**

`DASHBOARD` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/02-web-admin/30_app_health_dashboard.md`](../../../docs/specs/02-web-admin/30_app_health_dashboard.md) · anchors: `docs/specs/02-web-admin/30_app_health_dashboard.md §2.2` · `docs/specs/02-web-admin/30_app_health_dashboard.md §2.3` · `docs/specs/02-web-admin/30_app_health_dashboard.md §3` · `docs/specs/02-web-admin/30_app_health_dashboard.md §2.6` · `docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §3`

**8. What is still unresearched?**

**5 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 27 entr(ies) in feature `F16`. Removing it deletes 1 owned component(s): `src/components/admin/HealthTile.tsx`. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-019"></a>

## Card 84 — `S-019` `admin_control_panel`

Registry detail: [`S-019`](../../../docs/reports/generated/127-surface-registry.md#s-019) `admin_control_panel`.

`SURFACE` · `FORM` · scope `platform_shared` · feature `F16` platform-admin · build order 3163 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Where an operator edits the tuning numbers the pipeline runs on - the platform-wide variables, the per-trade multipliers, and the scope-intensity grid - across three tabs. Edits are held as a draft until the operator presses apply, at which point a dialog shows exactly what is about to change; confirming saves the new values and then kicks off the downstream re-calculation.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `logic_variables` | `variable_key` · `variable_value` · `variable_value_json` · `description` · `updated_at` | `variable_key` · `variable_value` · `description` · `updated_at` · `variable_value_json` | `none` | `n/a` | `docs/specs/00-architecture/01_database_schema.md §3` |
| reads | `trade_configurations` | `trade_slug` · `bid_phase_cutoff` · `work_phase_target` · `imminent_window_days` · `allocation_pct` · `multiplier_bid` · `multiplier_work` | `trade_slug` · `bid_phase_cutoff` · `work_phase_target` · `imminent_window_days` · `allocation_pct` · `updated_at` · `multiplier_bid` · `multiplier_work` | `none` | `n/a` | `docs/specs/00-architecture/01_database_schema.md §3` |
| reads | `trade_sqft_rates` | `base_rate_sqft` · `structure_complexity_factor` | `trade_slug` · `base_rate_sqft` · `structure_complexity_factor` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/01_database_schema.md §3` |
| reads | `scope_intensity_matrix` | `permit_type` · `structure_type` · `gfa_allocation_percentage` | `permit_type` · `structure_type` · `gfa_allocation_percentage` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/01_database_schema.md §3` |
| writes | `logic_variables` | `variable_value` · `variable_value_json` · `updated_at` | `variable_key` · `variable_value` · `description` · `updated_at` · `variable_value_json` | `none` | `n/a` | `docs/specs/00-architecture/01_database_schema.md §3` |
| writes | `trade_configurations` | `bid_phase_cutoff` · `work_phase_target` · `imminent_window_days` · `allocation_pct` · `multiplier_bid` · `multiplier_work` · `updated_at` | `trade_slug` · `bid_phase_cutoff` · `work_phase_target` · `imminent_window_days` · `allocation_pct` · `updated_at` · `multiplier_bid` · `multiplier_work` | `none` | `n/a` | `docs/specs/00-architecture/01_database_schema.md §3` |
| writes | `trade_sqft_rates` | `base_rate_sqft` · `structure_complexity_factor` · `updated_at` | `trade_slug` · `base_rate_sqft` · `structure_complexity_factor` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/01_database_schema.md §3` |
| writes | `scope_intensity_matrix` | `permit_type` · `structure_type` · `gfa_allocation_percentage` · `updated_at` | `permit_type` · `structure_type` · `gfa_allocation_percentage` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/01_database_schema.md §3` |
| writes | `pipeline_runs` | `pipeline` · `started_at` · `status` | `id` · `pipeline` · `started_at` · `completed_at` · `status` · `records_total` · `records_new` · `records_updated` · `error_message` · `duration_ms` · `records_meta` | `every_chain_step_via_sdk_run_ledger` | `permits[0..32]` | `docs/specs/01-pipeline/41_chain_permits.md` |

**3. Which contracts, and who calls them?**

Calls 2: `/api/admin/control-panel/configs` · `/api/admin/control-panel/resync`

**4. What gate, role or entitlement stands in front of it?**

session `admin` — classifyRoute gates the page, but this is the one admin pair in the shard where NEITHER route calls verifyAdminAuth — the only check left is the middleware presence test, which is explicitly not a cryptographic or is_admin check. · RLS class `B` · entitlement `none`

**5. What archetype, and why that one?**

`FORM` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/02-web-admin/86_control_panel.md`](../../../docs/specs/02-web-admin/86_control_panel.md) · anchors: `docs/specs/02-web-admin/86_control_panel.md §1` · `docs/specs/02-web-admin/86_control_panel.md §3` · `docs/specs/02-web-admin/86_control_panel.md §5 Phase 4` · `docs/specs/02-web-admin/86_control_panel.md §5 Phase 6` · `docs/specs/00-architecture/114_rls_policy_catalog.md §4`

**8. What is still unresearched?**

**3 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 27 entr(ies) in feature `F16`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-020"></a>

## Card 85 — `S-020` `admin_data_quality`

Registry detail: [`S-020`](../../../docs/reports/generated/127-surface-registry.md#s-020) `admin_data_quality`.

`SURFACE` · `DASHBOARD` · scope `platform_shared` · feature `F16` platform-admin · build order 3163 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

The operator's view of how healthy the data itself is: how much of each source has been matched, how confident those matches are, how fresh each feed is against its target schedule, and where records drop out of the funnel between stages. It also lists every pipeline job with its last run, lets the operator start or stop a job and edit its schedule, and offers a timeline per job with its recent run history.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `data_quality_snapshots` | `all` | `id` · `snapshot_date` · `total_permits` · `active_permits` · `permits_with_trades` · `trade_matches_total` · `trade_avg_confidence` · `trade_tier1_count` · `trade_tier2_count` · `trade_tier3_count` · `permits_with_builder` · `builders_total` · `builders_enriched` · `builders_with_phone` · `builders_with_email` · `builders_with_website` · `builders_with_google` · `builders_with_wsib` · `permits_with_parcel` · `parcel_exact_matches` · `parcel_name_matches` · `parcel_avg_confidence` · `permits_with_neighbourhood` · `permits_geocoded` · `coa_total` · `coa_linked` · `coa_avg_confidence` · `coa_high_confidence` · `coa_low_confidence` · `permits_updated_24h` · `permits_updated_7d` · `permits_updated_30d` · `last_sync_at` · `last_sync_status` · `created_at` · `parcel_spatial_matches` · `permits_with_scope` · `scope_project_type_breakdown` · `building_footprints_total` · `parcels_with_buildings` · `permits_with_scope_tags` · `scope_tags_top` · `permits_with_detailed_tags` · `trade_residential_classified` · `trade_residential_total` · `trade_commercial_classified` · `trade_commercial_total` · `null_description_count` · `null_builder_name_count` · `null_est_const_cost_count` · `null_street_num_count` · `null_street_name_count` · `null_geo_id_count` · `violation_cost_out_of_range` · `violation_future_issued_date` · `violation_missing_status` · `violations_total` · `schema_column_counts` · `sla_permits_ingestion_hours` · `inspections_total` · `inspections_permits_scraped` · `inspections_outstanding_count` · `inspections_passed_count` · `inspections_not_passed_count` · `cost_estimates_total` · `cost_estimates_from_permit` · `cost_estimates_from_model` · `cost_estimates_null_cost` · `timing_calibration_total` · `timing_calibration_avg_sample` · `timing_calibration_freshness_hours` · `cost_estimates_liar_gate_overrides` · `cost_estimates_zero_total_bypass` | `refresh_snapshot` · `compute_cost_estimates` | `permits[20], coa[9], sources[25], deep_scrapes[3]` | `docs/specs/00-architecture/01_database_schema.md §3` |
| reads | `logic_variables` | `variable_key` · `variable_value` | `variable_key` · `variable_value` · `description` · `updated_at` · `variable_value_json` | `none` | `n/a` | `docs/specs/00-architecture/01_database_schema.md §3` |
| reads | `pipeline_runs` | `pipeline` · `started_at` · `completed_at` · `status` · `duration_ms` · `error_message` · `records_total` · `records_new` · `records_updated` · `records_meta` | `id` · `pipeline` · `started_at` · `completed_at` · `status` · `records_total` · `records_new` · `records_updated` · `error_message` · `duration_ms` · `records_meta` | `every_chain_step_via_sdk_run_ledger` | `permits[0..32]` | `docs/specs/01-pipeline/41_chain_permits.md` |
| reads | `pipeline_schedules` | `pipeline` · `cadence` · `cron_expression` · `enabled` · `updated_at` | `pipeline` · `cadence` · `cron_expression` · `updated_at` · `enabled` · `chain_id` | `none` | `n/a` | `docs/specs/00-architecture/01_database_schema.md §3` |
| reads | `permits` | `first_seen_at` · `status` · `builder_name` · `neighbourhood_id` · `latitude` · `scope_source` | `permit_num` · `revision_num` · `permit_type` · `structure_type` · `work` · `street_num` · `street_name` · `street_type` · `street_direction` · `city` · `postal` · `geo_id` · `building_type` · `category` · `application_date` · `issued_date` · `completed_date` · `status` · `description` · `est_const_cost` · `builder_name` · `owner` · `dwelling_units_created` · `dwelling_units_lost` · `ward` · `council_district` · `current_use` · `proposed_use` · `housing_units` · `storeys` · `latitude` · `longitude` · `geocoded_at` · `data_hash` · `first_seen_at` · `last_seen_at` · `raw_json` · `neighbourhood_id` · `project_type` · `scope_tags` · `scope_classified_at` · `scope_source` · `enriched_status` · `street_name_normalized` · `last_scraped_at` · `trade_classified_at` · `parcel_linked_at` · `location` · `photo_url` · `lifecycle_phase` · `lifecycle_stalled` · `lifecycle_classified_at` · `phase_started_at` · `updated_at` · `lead_id` · `linked_coa_application_number` · `lifecycle_seq` · `lifecycle_group` · `lifecycle_block` · `lifecycle_stage` · `bid_value` · `matched_status` · `matched_rule` · `unmapped_status` · `zoning_class` · `bylaw_max_coverage_pct` · `bylaw_max_fsi` · `bylaw_max_height_m` · `exception_number` · `applicable_bylaws` · `overlay_summary` · `zoning_parcel_count` · `zoning_dominant_parcel_id` · `zoning_dominant_parcel_method` · `zoning_enriched_at` · `is_in_ravine_protection_area` · `ravine_distance_m` · `is_heritage_designated` · `heritage_designation_type` · `heritage_designation_date` · `is_corner_lot` · `is_through_lot` · `primary_frontage_street_name` · `lot_size_sqm` · `frontage_m` · `depth_m` · `lot_size_confidence` · `lot_size_basis` · `max_build_setback_basis` · `max_buildable_footprint_sqm` · `max_build_width_m` · `max_build_length_m` · `max_build_height_m` · `max_build_stories` · `max_build_basis` · `max_buildable_gfa_sqm` · `max_buildable_gfa_basis` · `max_build_confidence` · `max_garden_suite_gfa_sqm` · `garden_suite_fits` · `envelope_constrained` · `envelope_constraint_reason` · `imagery_roof_footprint_sqm` · `existing_stories` · `existing_height_m` · `imagery_roof_gfa_sqm` · `existing_width_m` · `existing_length_m` · `existing_structure_confidence` · `existing_other_structures_count` · `existing_other_structures_sqm` · `existing_greenspace_sqm` · `max_newbuild_coa_gfa_sqm` · `cur_basement_gfa_sqm` · `cur_storey_gfa_sqm` · `cur_interior_reno_gfa_sqm` · `cur_est_kitchen_gfa_sqm` · `cur_est_bath_gfa_sqm` · `max_build_stories_basis` · `abuts_laneway` · `max_garage_gfa_sqm` · `garage_capacity_cars` · `garage_constraint_reason` · `garage_permission` · `max_laneway_suite_gfa_sqm` · `max_rear_suite_gfa_sqm` · `rear_suite_type` · `rear_suite_permission` · `cur_floor_gfa_sqm` · `cur_pot_2story_gfa_sqm` · `cur_pot_3story_gfa_sqm` · `cur_gfa_range_basis` · `existing_data_quality_flag` · `max_build_stories_aggressive` · `market_exceeds_bylaw` · `neighbourhood_cost_premium` · `residential_sqm` · `interior_alterations_sqm` · `assembly_sqm` · `institutional_sqm` · `mercantile_sqm` · `industrial_sqm` · `business_personal_services_sqm` · `opt_aor_storeys` · `opt_aor_gfa_sqm` · `opt_aor_units` · `opt_coa_storeys` · `opt_coa_gfa_sqm` · `opt_suite_type` · `opt_suite_fits_full` · `opt_binding_constraint` · `opt_config_confidence` · `comp_count` · `comp_dominant_build` · `comp_build_ratio_p50` · `comp_fsi_p50` · `cost_fb_total` · `cost_coa_total` · `cost_solar_total` · `cost_garden_suite_total` · `cost_laneway_suite_total` · `cost_garage_total` · `cost_gut_total` · `cost_addition_total` · `cost_kitchen_per_sqm` · `cost_bath_per_sqm` · `cost_basement_per_sqm` · `cost_basement_underpin_per_sqm` · `max_build_fsi` · `coa_fsi` · `realized_fsi_p90` | `permits` · `enrich_permits` · `classify_permit_phase` · `classify_lifecycle_phase` · `link_neighbourhoods` · `geocode_permits` · `classify_scope` · `classify_scope_tags` · `classify_scope_class` · `link_coa` · `link_similar` · `close_stale_permits` · `classify_inspection_status` · `create_pre_permits` · `inspections` | `permits[1]` | `docs/specs/01-pipeline/41_chain_permits.md` |
| reads | `coa_applications` | `decision` · `linked_permit_num` · `linked_confidence` · `decision_date` · `hearing_date` | `id` · `application_number` · `address` · `street_num` · `street_name` · `ward` · `status` · `decision` · `decision_date` · `hearing_date` · `description` · `applicant` · `linked_permit_num` · `linked_confidence` · `data_hash` · `first_seen_at` · `last_seen_at` · `sub_type` · `street_name_normalized` · `lifecycle_phase` · `lifecycle_classified_at` · `lifecycle_stalled` · `lead_id` · `coa_type_class` · `project_type` · `scope_tags` · `scope_classified_at` · `scope_source` · `structure_type` · `neighbourhood_id` · `latitude` · `longitude` · `modeled_gfa_sqm` · `estimated_cost` · `cost_source` · `cost_classified_at` · `lifecycle_seq` · `lifecycle_group` · `lifecycle_block` · `lifecycle_stage` · `bid_value` · `parcel_linked_at` · `trade_classified_at` · `matched_status` · `matched_rule` · `unmapped_status` · `unmapped_decision` · `zoning_class` · `bylaw_max_coverage_pct` · `bylaw_max_fsi` · `bylaw_max_height_m` · `exception_number` · `variance_context` · `zoning_parcel_count` · `zoning_dominant_parcel_id` · `zoning_dominant_parcel_method` · `zoning_enriched_at` · `is_in_ravine_protection_area` · `ravine_distance_m` · `is_heritage_designated` · `heritage_designation_type` · `heritage_designation_date` · `is_corner_lot` · `is_through_lot` · `primary_frontage_street_name` · `lot_size_sqm` · `frontage_m` · `depth_m` · `lot_size_confidence` · `lot_size_basis` · `max_build_setback_basis` · `max_buildable_footprint_sqm` · `max_build_width_m` · `max_build_length_m` · `max_build_height_m` · `max_build_stories` · `max_build_basis` · `max_buildable_gfa_sqm` · `max_buildable_gfa_basis` · `max_build_confidence` · `max_garden_suite_gfa_sqm` · `garden_suite_fits` · `envelope_constrained` · `envelope_constraint_reason` · `imagery_roof_footprint_sqm` · `existing_stories` · `existing_height_m` · `imagery_roof_gfa_sqm` · `existing_width_m` · `existing_length_m` · `existing_structure_confidence` · `existing_other_structures_count` · `existing_other_structures_sqm` · `existing_greenspace_sqm` · `max_newbuild_coa_gfa_sqm` · `cur_basement_gfa_sqm` · `cur_storey_gfa_sqm` · `cur_interior_reno_gfa_sqm` · `cur_est_kitchen_gfa_sqm` · `cur_est_bath_gfa_sqm` · `max_build_stories_basis` · `abuts_laneway` · `max_garage_gfa_sqm` · `garage_capacity_cars` · `garage_constraint_reason` · `garage_permission` · `max_laneway_suite_gfa_sqm` · `max_rear_suite_gfa_sqm` · `rear_suite_type` · `rear_suite_permission` · `cur_floor_gfa_sqm` · `cur_pot_2story_gfa_sqm` · `cur_pot_3story_gfa_sqm` · `cur_gfa_range_basis` · `existing_data_quality_flag` · `max_build_stories_aggressive` · `market_exceeds_bylaw` · `neighbourhood_cost_premium` · `opt_aor_storeys` · `opt_aor_gfa_sqm` · `opt_aor_units` · `opt_coa_storeys` · `opt_coa_gfa_sqm` · `opt_suite_type` · `opt_suite_fits_full` · `opt_binding_constraint` · `opt_config_confidence` · `comp_count` · `comp_dominant_build` · `comp_build_ratio_p50` · `comp_fsi_p50` · `cost_fb_total` · `cost_coa_total` · `cost_solar_total` · `cost_garden_suite_total` · `cost_laneway_suite_total` · `cost_garage_total` · `cost_gut_total` · `cost_addition_total` · `cost_kitchen_per_sqm` · `cost_bath_per_sqm` · `cost_basement_per_sqm` · `cost_basement_underpin_per_sqm` · `max_build_fsi` · `coa_fsi` · `realized_fsi_p90` | `coa` · `link_coa` · `link_coa_to_parcels` · `classify_coa_scope` · `classify_coa_trades` · `compute_coa_cost_estimates` · `enrich_coa_zoning` · `classify_lifecycle_phase` | `coa[1]` | `docs/specs/01-pipeline/42_chain_coa.md` |
| reads | `entities` | `primary_phone` · `primary_email` | `id` · `legal_name` · `trade_name` · `name_normalized` · `entity_type` · `primary_phone` · `primary_email` · `website` · `linkedin_url` · `google_place_id` · `google_rating` · `google_review_count` · `is_wsib_registered` · `permit_count` · `first_seen_at` · `last_seen_at` · `last_enriched_at` · `photo_url` · `photo_validated_at` | `builders` · `link_wsib` · `enrich_named_builders` · `enrich_wsib_builders` | `permits[5]` | `docs/specs/00-architecture/01_database_schema.md §3` |
| reads | `trades` | `id` | `id` · `slug` · `name` · `icon` · `color` · `sort_order` · `created_at` · `kind` · `seq` · `cost_basis` | `none` | `n/a` | `docs/specs/00-architecture/01_database_schema.md §3` |
| reads | `trade_mapping_rules` | `is_active` | `id` · `trade_id` · `tier` · `match_field` · `match_pattern` · `confidence` · `phase_start` · `phase_end` · `is_active` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/01_database_schema.md §3` |
| reads | `sync_runs` | `started_at` | `id` · `started_at` · `completed_at` · `status` · `records_total` · `records_new` · `records_updated` · `records_unchanged` · `records_errors` · `error_message` · `snapshot_path` · `duration_ms` | `none` | `n/a` | `docs/specs/00-architecture/01_database_schema.md §3` |
| reads | `notifications` | `is_sent` | `id` · `user_id` · `type` · `title` · `body` · `permit_num` · `trade_slug` · `channel` · `is_read` · `is_sent` · `sent_at` · `created_at` · `lead_id` | `classify_lifecycle_phase` · `update_tracked_projects` | `permits[23]` | `docs/specs/00-architecture/01_database_schema.md §3` |
| reads | `permit_parcels` | `permit_num` · `revision_num` · `parcel_id` | `id` · `permit_num` · `revision_num` · `parcel_id` · `match_type` · `confidence` · `linked_at` | `link_parcels` | `permits[8], sources[10]` | `docs/specs/01-pipeline/43_chain_sources.md` |
| reads | `permit_trades` | `permit_num` · `revision_num` | `id` · `permit_num` · `revision_num` · `trade_id` · `tier` · `confidence` · `is_active` · `phase` · `lead_score` · `classified_at` · `attachment_basis` | `classify_permits` · `backfill_realtor_permit_trades` | `permits[13]` | `docs/specs/01-pipeline/41_chain_permits.md` |
| reads | `address_points` | `id` | `address_point_id` · `latitude` · `longitude` · `address_number` · `linear_name_full` · `address_full` · `lo_num` · `hi_num` · `maint_stage` · `address_status` · `address_class_desc` · `class_family_desc` · `place_name` · `addr_num_normalized` · `linear_name_normalized` · `geom` | `address_points` | `sources[2]` | `docs/specs/01-pipeline/54_source_address_points.md` |
| reads | `parcels` | `id` | `id` · `parcel_id` · `feature_type` · `address_number` · `linear_name_full` · `addr_num_normalized` · `street_name_normalized` · `street_type_normalized` · `stated_area_raw` · `lot_size_sqm` · `lot_size_sqft` · `frontage_m` · `frontage_ft` · `depth_m` · `depth_ft` · `geometry` · `date_effective` · `date_expiry` · `created_at` · `centroid_lat` · `centroid_lng` · `is_irregular` · `geom` · `zoning_class` · `zoning_zn_string` · `zoning_gen_zone` · `zoning_holding` · `zone_status` · `bylaw_max_fsi` · `bylaw_max_coverage_pct` · `bylaw_max_height_m` · `bylaw_max_stories` · `bylaw_max_units` · `bylaw_max_density` · `bylaw_min_frontage_m` · `bylaw_min_area_sqm` · `bylaw_standard_setback_m` · `bylaw_pct_commercial_max` · `bylaw_pct_residential_max` · `bylaw_pct_employment_max` · `bylaw_pct_office_max` · `exception_number` · `exception_text` · `bylaw_chapter` · `bylaw_section` · `bylaw_exception_ref` · `in_policy_area` · `on_policy_road` · `in_rooming_house_overlay` · `in_parking_zone_overlay` · `in_building_setback_overlay` · `on_priority_retail` · `in_queenstw_eat_overlay` · `zoning_overlays` · `zoning_base_source_id` · `zoning_dominant_area_share` · `zoning_is_ambiguous` · `zoning_base_source_dataset_version` · `zoning_enriched_at` · `is_in_ravine_protection_area` · `ravine_distance_m` · `ravine_dataset_version_when_enriched` · `is_heritage_designated` · `heritage_designation_type` · `heritage_designation_date` · `heritage_dataset_version_when_enriched` · `is_corner_lot` · `is_through_lot` · `primary_frontage_street_name` · `centreline_dataset_version_when_enriched` · `lot_size_confidence` · `lot_size_basis` · `max_build_setback_basis` · `max_buildable_footprint_sqm` · `max_build_width_m` · `max_build_length_m` · `max_build_height_m` · `max_build_stories` · `max_build_basis` · `max_buildable_gfa_sqm` · `max_buildable_gfa_basis` · `max_build_confidence` · `max_garden_suite_gfa_sqm` · `garden_suite_fits` · `envelope_constrained` · `envelope_constraint_reason` · `imagery_roof_footprint_sqm` · `existing_stories` · `existing_height_m` · `imagery_roof_gfa_sqm` · `existing_width_m` · `existing_length_m` · `existing_structure_confidence` · `existing_other_structures_count` · `existing_other_structures_sqm` · `existing_greenspace_sqm` · `max_newbuild_coa_gfa_sqm` · `cur_basement_gfa_sqm` · `cur_storey_gfa_sqm` · `cur_interior_reno_gfa_sqm` · `cur_est_kitchen_gfa_sqm` · `cur_est_bath_gfa_sqm` · `max_build_stories_basis` · `abuts_laneway` · `max_garage_gfa_sqm` · `garage_capacity_cars` · `garage_constraint_reason` · `garage_permission` · `max_laneway_suite_gfa_sqm` · `max_rear_suite_gfa_sqm` · `rear_suite_type` · `rear_suite_permission` · `cur_floor_gfa_sqm` · `cur_pot_2story_gfa_sqm` · `cur_pot_3story_gfa_sqm` · `cur_gfa_range_basis` · `existing_data_quality_flag` · `max_build_stories_aggressive` · `market_exceeds_bylaw` · `neighbourhood_id` · `neighbourhood_cost_premium` · `opt_aor_storeys` · `opt_aor_gfa_sqm` · `opt_aor_units` · `opt_coa_storeys` · `opt_coa_gfa_sqm` · `opt_suite_type` · `opt_suite_fits_full` · `opt_binding_constraint` · `opt_config_confidence` · `optimal_config` · `nearby_builds_summary` · `comparable_builds` · `comp_count` · `comp_dominant_build` · `comp_build_ratio_p50` · `comp_fsi_p50` · `cur_gfa_low_sqm` · `cur_gfa_high_sqm` · `cur_storeys_range` · `cur_gfa_band_basis` · `parcel_cost_menu` · `cost_fb_total` · `cost_coa_total` · `cost_solar_total` · `cost_garden_suite_total` · `cost_laneway_suite_total` · `cost_garage_total` · `cost_gut_total` · `cost_addition_total` · `cost_kitchen_per_sqm` · `cost_bath_per_sqm` · `cost_basement_per_sqm` · `cost_basement_underpin_per_sqm` · `max_build_fsi` · `coa_fsi` · `realized_fsi_p90` · `lot_size_source` | `parcels` · `enrich_parcels` · `compute_centroids` · `compute_parcel_cost_estimates` · `enrich_heritage` · `enrich_ravines` · `enrich_centreline` | `sources[4]` | `docs/specs/01-pipeline/43_chain_sources.md` |
| reads | `building_footprints` | `id` | `id` · `source_id` · `geometry` · `footprint_area_sqm` · `footprint_area_sqft` · `max_height_m` · `min_height_m` · `elev_z` · `estimated_stories` · `centroid_lat` · `centroid_lng` · `created_at` · `geom` | `massing` | `sources[14]` | `docs/specs/01-pipeline/43_chain_sources.md` |
| reads | `parcel_buildings` | `parcel_id` | `id` · `parcel_id` · `building_id` · `is_primary` · `structure_type` · `linked_at` · `match_type` · `confidence` | `link_massing` | `permits[11], sources[15]` | `docs/specs/01-pipeline/43_chain_sources.md` |
| reads | `neighbourhoods` | `id` | `id` · `neighbourhood_id` · `name` · `geometry` · `avg_household_income` · `median_household_income` · `avg_individual_income` · `low_income_pct` · `tenure_owner_pct` · `tenure_renter_pct` · `period_of_construction` · `couples_pct` · `lone_parent_pct` · `married_pct` · `university_degree_pct` · `immigrant_pct` · `visible_minority_pct` · `english_knowledge_pct` · `top_mother_tongue` · `census_year` · `created_at` · `geom` | `neighbourhoods` | `sources[16]` | `docs/specs/01-pipeline/43_chain_sources.md` |
| reads | `wsib_registry` | `linked_entity_id` · `trade_name` | `id` · `legal_name` · `trade_name` · `legal_name_normalized` · `trade_name_normalized` · `mailing_address` · `predominant_class` · `naics_code` · `naics_description` · `subclass` · `subclass_description` · `business_size` · `match_confidence` · `matched_at` · `first_seen_at` · `last_seen_at` · `linked_entity_id` · `primary_phone` · `primary_email` · `website` · `last_enriched_at` · `is_gta` | `load_wsib` · `link_wsib` | `sources[18]` | `docs/specs/01-pipeline/43_chain_sources.md` |
| reads | `lead_views` | `saved` | `id` · `user_id` · `lead_key` · `lead_type` · `permit_num` · `revision_num` · `entity_id` · `trade_slug` · `viewed_at` · `saved` · `saved_at` | `none` | `n/a` | `docs/specs/00-architecture/114_rls_policy_catalog.md §3.1` |
| reads | `pg_stat_user_tables` **(net-new)** | `relname` · `n_live_tup` · `n_dead_tup` · `seq_scan` · `idx_scan` | _does not exist yet_ | `none` | `n/a` | `docs/specs/02-web-admin/26_admin_dashboard.md §3.4` |
| reads | `information_schema.columns` **(net-new)** | `table_name` · `column_name` | _does not exist yet_ | `none` | `n/a` | `docs/specs/00-architecture/01_database_schema.md §3` |
| reads | `pg_class` **(net-new)** | `relname` · `reltuples` · `relkind` | _does not exist yet_ | `none` | `n/a` | `docs/specs/00-architecture/01_database_schema.md §3` |
| writes | `pipeline_runs` | `status` · `error_message` · `completed_at` | `id` · `pipeline` · `started_at` · `completed_at` · `status` · `records_total` · `records_new` · `records_updated` · `error_message` · `duration_ms` · `records_meta` | `every_chain_step_via_sdk_run_ledger` | `permits[0..32]` | `docs/specs/01-pipeline/41_chain_permits.md` |
| writes | `pipeline_schedules` | `pipeline` · `cadence` · `enabled` · `updated_at` | `pipeline` · `cadence` · `cron_expression` · `updated_at` · `enabled` · `chain_id` | `none` | `n/a` | `docs/specs/00-architecture/01_database_schema.md §3` |

**3. Which contracts, and who calls them?**

Calls 6: `/api/quality` · `/api/admin/stats` · `/api/admin/pipelines/status` · `/api/admin/pipelines/[slug]` · `/api/admin/pipelines/schedules` · `/api/admin/pipelines/history`

**4. What gate, role or entitlement stands in front of it?**

session `admin` — The page is behind the /admin/* arm, but four of its six contracts never call verifyAdminAuth and one of them, /api/quality, is deliberately PUBLIC — an admin-gated page mixing a public contract with admin ones. · RLS class `B` · entitlement `none`

**5. What archetype, and why that one?**

`DASHBOARD` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/02-web-admin/26_admin_dashboard.md`](../../../docs/specs/02-web-admin/26_admin_dashboard.md) · anchors: `docs/specs/02-web-admin/26_admin_dashboard.md §3.4` · `docs/specs/02-web-admin/26_admin_dashboard.md §4` · `docs/specs/02-web-admin/26_admin_dashboard.md §5` · `docs/specs/01-pipeline/48_pipeline_observability.md §3.6`

**8. What is still unresearched?**

**6 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 27 entr(ies) in feature `F16`. Removing it deletes 4 owned component(s): `src/components/DataQualityDashboard.tsx` · `src/components/FreshnessTimeline.tsx` · `src/components/funnel/FunnelPanels.tsx` · `src/components/ScheduleEditModal.tsx`. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-021"></a>

## Card 86 — `S-021` `admin_home`

Registry detail: [`S-021`](../../../docs/reports/generated/127-surface-registry.md#s-021) `admin_home`.

`SURFACE` · `STATIC` · scope `platform_shared` · feature `F16` platform-admin · build order 3163 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

The operator's front page: a grid of ten tiles, each a doorway to one internal tool - data quality, market metrics, lead-feed testing, the parcel cost model, the flight centre watchlist, the configuration control panel, app health, user management, notifications, and security. It is navigation only; it loads no data of its own and shows no numbers.

**2. Which tables and columns, produced by which step?**

_No table is reached by this entry — every value it shows arrives through a contract, or it shows no server data at all._

**3. Which contracts, and who calls them?**

It reaches no contract — every value is local, a prop, or device state.

**4. What gate, role or entitlement stands in front of it?**

session `admin` — classifyRoute reaches the admin arm on the first disjunct — pathname === "/admin" — before any authenticated or public prefix is tried. · RLS class `none` · entitlement `none`

**5. What archetype, and why that one?**

`STATIC` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/02-web-admin/26_admin_dashboard.md`](../../../docs/specs/02-web-admin/26_admin_dashboard.md) · anchors: `docs/specs/02-web-admin/26_admin_dashboard.md §3.1` · `docs/specs/02-web-admin/26_admin_dashboard.md §5` · `docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §2.4`

**8. What is still unresearched?**

**3 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 27 entr(ies) in feature `F16`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-023"></a>

## Card 87 — `S-023` `admin_pipeline_step_output`

Registry detail: [`S-023`](../../../docs/reports/generated/127-surface-registry.md#s-023) `admin_pipeline_step_output`.

`SURFACE` · `LIST` · scope `platform_shared` · feature `F16` platform-admin · build order 3163 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

A plain row browser over whatever table a chosen pipeline step writes to. The operator arrives with a step already selected (usually from the freshness timeline's inspect link), pages through the rows fifty at a time, and can narrow them by typing a field name and value then pressing apply. Rows that carry a permit identity link straight through to the per-record inspector. It is read-only.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `information_schema.columns` **(net-new)** | `column_name` · `data_type` | _does not exist yet_ | `none` | `n/a` | `docs/specs/00-architecture/01_database_schema.md §3` |
| reads | `pg_class` **(net-new)** | `reltuples` | _does not exist yet_ | `none` | `n/a` | `docs/specs/00-architecture/01_database_schema.md §3` |
| reads | `(dynamic) manifest.scripts[slug].telemetry_tables[0]` **(net-new)** | `all` | _does not exist yet_ | `the_step_whose_slug_is_requested` | `varies with the requested slug` | `docs/specs/01-pipeline/40_pipeline_system.md` |
| reads | `profiles` | `is_admin` | `id` · `is_admin` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/114_rls_policy_catalog.md §5` |

**3. Which contracts, and who calls them?**

Calls 1: `/api/admin/pipeline/step-output`

**4. What gate, role or entitlement stands in front of it?**

session `admin` — There is no admin Postgres role: classifyRoute sends every /admin/* path down the admin arm, and the real boundary is verifyAdminAuth reading profiles.is_admin on the route. It verifies on the first line and then logs the acting uid with the slug, table, limit and offset as an access trail. · RLS class `B` · entitlement `none`

**5. What archetype, and why that one?**

`LIST` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: **UNRESEARCHED** — no SPEC LINK header and no System Map row, so there is nothing to check it against

**8. What is still unresearched?**

**7 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 27 entr(ies) in feature `F16`. Removing it deletes 1 owned component(s): `src/components/admin/StepOutputInspector.tsx`. It is the ONLY reader or writer of `(dynamic) manifest.scripts[slug].telemetry_tables[0]` — removing it orphans that table.

---

<a id="card-s-024"></a>

## Card 88 — `S-024` `admin_security`

Registry detail: [`S-024`](../../../docs/reports/generated/127-surface-registry.md#s-024) `admin_security`.

`SURFACE` · `FORM` · scope `platform_shared` · feature `F16` platform-admin · build order 3163 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Where an administrator turns on two-factor sign-in for their own account. It shows whether a authenticator app is already registered, walks through adding one by displaying a setup code to scan and asking for the six digits back to prove it worked, and then shows a set of one-time backup codes. The setup code and the backup codes are shown exactly once - leaving the screen loses them for good. It also allows removing a registered device behind a confirmation.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `admin_backup_codes` | `user_id` · `code_hash` · `code_salt` · `used_at` | `id` · `user_id` · `code_hash` · `code_salt` · `used_at` · `created_at` | `none` | `n/a` | `docs/specs/00-architecture/13_authentication.md §3.6` |
| reads | `profiles` | `is_admin` | `id` · `is_admin` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/114_rls_policy_catalog.md §5` |
| writes | `admin_backup_codes` | `user_id` · `code_hash` · `code_salt` | `id` · `user_id` · `code_hash` · `code_salt` · `used_at` · `created_at` | `none` | `n/a` | `docs/specs/00-architecture/13_authentication.md §3.6` |
| writes | `admin_audit_log` | `admin_uid` · `action` · `target_uid` · `old_value` · `new_value` · `reason` | `id` · `admin_uid` · `action` · `target_uid` · `old_value` · `new_value` · `reason` · `created_at` | `none` | `n/a` | `docs/specs/00-architecture/114_rls_policy_catalog.md §3.2` |

**3. Which contracts, and who calls them?**

Calls 2: `/api/admin/security/mfa` · `/api/admin/security/mfa/verify`

**4. What gate, role or entitlement stands in front of it?**

session `admin` — There is no admin Postgres role: classifyRoute sends every /admin/* path down the admin arm, and the real boundary is verifyAdminAuth reading profiles.is_admin on the route. All four handlers verify AND additionally require authMethod === "session", so neither the CI token nor the break-glass key can enrol, verify or unenrol a factor. verifyAdminAuth also becomes an aal2 check here once ADMIN_MFA_ENFORCED is true. · RLS class `A` · entitlement `none`

**5. What archetype, and why that one?**

`FORM` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/00-architecture/13_authentication.md`](../../../docs/specs/00-architecture/13_authentication.md) · anchors: `docs/specs/00-architecture/13_authentication.md §3.6` · `docs/specs/00-architecture/13_authentication.md §3.7` · `docs/specs/00-architecture/13_authentication.md §4` · `docs/specs/00-architecture/13_authentication.md §4b`

**8. What is still unresearched?**

**3 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 27 entr(ies) in feature `F16`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-025"></a>

## Card 89 — `S-025` `admin_user_detail`

Registry detail: [`S-025`](../../../docs/reports/generated/127-surface-registry.md#s-025) `admin_user_detail`.

`SURFACE` · `DETAIL` · scope `platform_shared` · feature `F16` platform-admin · build order 3163 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

One account, in full, with the controls to change it. Cards cover the profile, the subscription (including tools to compare the stored status against the payment provider, apply a correction, retry a failed cancellation, and view recent payment events), the persona-and-trades assignment, and a read-only summary of the account's notification devices, preferences and last message sent. Every change requires the operator to type a reason, and destructive ones go through a confirmation dialog. A banner warns when the account is inside its thirty-day deletion window and records that the operator looked.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `user_profiles` | `user_id` · `email` · `phone_number` · `full_name` · `company_name` · `display_name` · `trade_slug` · `trade_slugs_override` · `account_preset` · `radius_km` · `radius_cap_km` · `location_mode` · `stripe_customer_id` · `stripe_cancel_failed_at` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `lead_views_count` · `created_at` · `updated_at` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/00-architecture/114_rls_policy_catalog.md §3.1` |
| reads | `entitlements` | `user_id` · `product` · `status` · `trial_started_at` · `last_stripe_event_at` | `user_id` · `product` · `status` · `stripe_subscription_id` · `current_period_end` · `trial_started_at` · `last_stripe_event_at` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/116_multi_product_architecture.md` |
| reads | `lead_views` | `user_id` · `saved` | `id` · `user_id` · `lead_key` · `lead_type` · `permit_num` · `revision_num` · `entity_id` · `trade_slug` · `viewed_at` · `saved` · `saved_at` | `none` | `n/a` | `docs/specs/00-architecture/114_rls_policy_catalog.md §3.1` |
| reads | `lead_view_events` | `user_id` | `user_id` · `permit_num` · `revision_num` · `viewed_at` | `none` | `n/a` | `docs/specs/00-architecture/114_rls_policy_catalog.md §3.1` |
| reads | `stripe_webhook_events` | `event_id` · `event_type` · `processed_at` · `stripe_customer_id` | `event_id` · `processed_at` · `event_type` · `stripe_customer_id` | `none` | `n/a` | `docs/specs/00-architecture/116_multi_product_architecture.md` |
| reads | `logic_variables` | `variable_value_json` | `variable_key` · `variable_value` · `description` · `updated_at` · `variable_value_json` | `none` | `n/a` | `docs/specs/02-web-admin/86_control_panel.md §1` |
| reads | `notification_dispatches` | `id` · `user_id` · `lead_id` · `type` · `toronto_date` · `push_token` · `expo_ticket_id` · `status` · `detail` · `dispatched_at` | `id` · `user_id` · `lead_id` · `type` · `toronto_date` · `push_token` · `expo_ticket_id` · `status` · `detail` · `dispatched_at` · `receipt_checked_at` | `none` | `n/a` | `docs/specs/00-architecture/114_rls_policy_catalog.md §3.1` |
| reads | `device_tokens` | `push_token` · `platform` · `updated_at` · `user_id` | `id` · `user_id` · `push_token` · `platform` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/114_rls_policy_catalog.md §3.1` |
| reads | `profiles` | `is_admin` | `id` · `is_admin` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/114_rls_policy_catalog.md §5` |
| writes | `user_profiles` | `trade_slug` · `trade_slugs_override` · `account_preset` · `full_name` · `phone_number` · `email` · `backup_email` · `company_name` · `account_deleted_at` · `stripe_cancel_failed_at` · `updated_at` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/00-architecture/114_rls_policy_catalog.md §3.1` |
| writes | `entitlements` | `user_id` · `product` · `status` · `trial_started_at` · `last_stripe_event_at` · `created_at` · `updated_at` | `user_id` · `product` · `status` · `stripe_subscription_id` · `current_period_end` · `trial_started_at` · `last_stripe_event_at` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/116_multi_product_architecture.md` |
| writes | `admin_audit_log` | `admin_uid` · `action` · `target_uid` · `old_value` · `new_value` · `reason` | `id` · `admin_uid` · `action` · `target_uid` · `old_value` · `new_value` · `reason` · `created_at` | `none` | `n/a` | `docs/specs/00-architecture/114_rls_policy_catalog.md §3.2` |

**3. Which contracts, and who calls them?**

Calls 5: `/api/admin/users/[uid]` · `/api/admin/users/[uid]/subscription/reconcile` · `/api/admin/users/[uid]/subscription/retry-cancel` · `/api/admin/users/[uid]/subscription/events` · `/api/admin/notifications`

**4. What gate, role or entitlement stands in front of it?**

session `admin` — There is no admin Postgres role: classifyRoute sends every /admin/* path down the admin arm, and the real boundary is verifyAdminAuth reading profiles.is_admin on the route. Every handler verifies on its first line; PATCH and both subscription mutations additionally refuse the x-admin-key credential, guard against acting on another admin, and guard against the self-destructive case. · RLS class `A` · entitlement `none`

**5. What archetype, and why that one?**

`DETAIL` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/02-web-admin/21_admin_user_management.md`](../../../docs/specs/02-web-admin/21_admin_user_management.md) · anchors: `docs/specs/02-web-admin/21_admin_user_management.md §3.2` · `docs/specs/02-web-admin/21_admin_user_management.md §4` · `docs/specs/02-web-admin/21_admin_user_management.md §3.4` · `docs/specs/02-web-admin/21_admin_user_management.md §6` · `docs/specs/02-web-admin/21_admin_user_management.md §10`

**8. What is still unresearched?**

**3 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 27 entr(ies) in feature `F16`. Removing it deletes 1 owned component(s): `src/components/admin/NotificationsCard.tsx`. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-026"></a>

## Card 90 — `S-026` `admin_users`

Registry detail: [`S-026`](../../../docs/reports/generated/127-surface-registry.md#s-026) `admin_users`.

`SURFACE` · `LIST` · scope `platform_shared` · feature `F16` platform-admin · build order 3163 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

The operator's directory of every account. It searches by email, phone, name or company and filters by account persona, subscription status, trade, and whether a subscription cancellation failed at the payment provider. Results are paged by the server, and each row opens that account's detail page. A button opens a small form for creating a supplier or enterprise account directly.

**2. Which tables and columns, produced by which step?**

| | Table | Columns it touches | Full column list (introspected) | Produced by | Chain position | Owner spec |
|---|---|---|---|---|---|---|
| reads | `user_profiles` | `user_id` · `email` · `phone_number` · `full_name` · `company_name` · `trade_slug` · `trade_slugs_override` · `account_preset` · `onboarding_complete` · `account_deleted_at` · `created_at` · `stripe_cancel_failed_at` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/00-architecture/114_rls_policy_catalog.md §3.1` |
| reads | `entitlements` | `user_id` · `product` · `status` | `user_id` · `product` · `status` · `stripe_subscription_id` · `current_period_end` · `trial_started_at` · `last_stripe_event_at` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/116_multi_product_architecture.md` |
| reads | `profiles` | `is_admin` | `id` · `is_admin` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/114_rls_policy_catalog.md §5` |
| writes | `user_profiles` | `user_id` · `email` · `company_name` · `account_preset` · `trade_slug` · `trade_slugs_override` · `radius_cap_km` · `onboarding_complete` · `updated_at` | `user_id` · `trade_slug` · `display_name` · `created_at` · `updated_at` · `full_name` · `phone_number` · `company_name` · `email` · `backup_email` · `default_tab` · `location_mode` · `home_base_lat` · `home_base_lng` · `radius_km` · `supplier_selection` · `lead_views_count` · `stripe_customer_id` · `onboarding_complete` · `tos_accepted_at` · `account_deleted_at` · `account_preset` · `trade_slugs_override` · `radius_cap_km` · `new_lead_min_cost_tier` · `phase_changed` · `lifecycle_stalled_pref` · `start_date_urgent` · `notification_schedule` · `stripe_cancel_failed_at` | `none` | `n/a` | `docs/specs/00-architecture/114_rls_policy_catalog.md §3.1` |
| writes | `entitlements` | `user_id` · `product` · `status` · `created_at` · `updated_at` | `user_id` · `product` · `status` · `stripe_subscription_id` · `current_period_end` · `trial_started_at` · `last_stripe_event_at` · `created_at` · `updated_at` | `none` | `n/a` | `docs/specs/00-architecture/116_multi_product_architecture.md` |
| writes | `admin_audit_log` | `admin_uid` · `action` · `target_uid` · `new_value` · `reason` | `id` · `admin_uid` · `action` · `target_uid` · `old_value` · `new_value` · `reason` · `created_at` | `none` | `n/a` | `docs/specs/00-architecture/114_rls_policy_catalog.md §3.2` |

**3. Which contracts, and who calls them?**

Calls 1: `/api/admin/users`

**4. What gate, role or entitlement stands in front of it?**

session `admin` — There is no admin Postgres role: classifyRoute sends every /admin/* path down the admin arm, and the real boundary is verifyAdminAuth reading profiles.is_admin on the route. Both handlers verify on their first line and POST additionally refuses the x-admin-key credential, so an account cannot be provisioned by a CI token. · RLS class `A` · entitlement `none`

**5. What archetype, and why that one?**

`LIST` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/02-web-admin/21_admin_user_management.md`](../../../docs/specs/02-web-admin/21_admin_user_management.md) · anchors: `docs/specs/02-web-admin/21_admin_user_management.md §3.1` · `docs/specs/02-web-admin/21_admin_user_management.md §5` · `docs/specs/02-web-admin/21_admin_user_management.md §6` · `docs/specs/02-web-admin/21_admin_user_management.md §2`

**8. What is still unresearched?**

**4 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 27 entr(ies) in feature `F16`. It owns no component. Every table it touches is touched by something else, so removing it orphans none.

---

<a id="card-s-050"></a>

## Card 91 — `S-050` `web_login`

Registry detail: [`S-050`](../../../docs/reports/generated/127-surface-registry.md#s-050) `web_login`.

`SURFACE` · `GATE` · scope `platform_shared` · feature `F16` platform-admin · build order 3163 · batch UNRESEARCHED · **review: `unreviewed`**

**1. What does it do, and for whom?**

Where a visitor signs in or creates an account. It offers email-and-password sign-in, a sign-up form that also collects a name and whether the account is an individual or a company, and a Google sign-in button. Administrators with two-factor turned on get a second box asking for the six-digit code from their authenticator app. When the visitor was bounced here from a page that needed a login, it sends them back to that page afterwards, and only to pages on this site.

**2. Which tables and columns, produced by which step?**

_No table is reached by this entry — every value it shows arrives through a contract, or it shows no server data at all._

**3. Which contracts, and who calls them?**

It reaches no contract — every value is local, a prop, or device state.

**4. What gate, role or entitlement stands in front of it?**

session `anon` — `/login` is in PUBLIC_PATHS and the lock pins classifyRoute('/login') === 'public'; a signed-in visitor is never bounced away from it. · RLS class `none` · entitlement `none`

**5. What archetype, and why that one?**

`GATE` — its profile makes specific fields mandatory (see [the schema](../../../scripts/surfaces/_schema/surface.schema.json)). If this archetype is wrong, the wrong fields are being demanded and the right ones are not.

**6. Is any behaviour here lead-gen leakage?**

Swept; none found.

**7. Does it match its owning spec section?**

Spec: [`docs/specs/00-architecture/13_authentication.md`](../../../docs/specs/00-architecture/13_authentication.md) · anchors: `docs/specs/00-architecture/13_authentication.md §3.3` · `docs/specs/00-architecture/13_authentication.md §3.6` · `docs/specs/00-architecture/13_authentication.md §4` · `docs/specs/00-architecture/13_authentication.md §4a` · `docs/specs/00-architecture/13_authentication.md §3.5`

**8. What is still unresearched?**

**3 field(s).** They are the literal `UNRESEARCHED` in the descriptor; §2.2 of the registry groups them by reason.

**9. What would removing it delete?**

It is 1 of 27 entr(ies) in feature `F16`. Removing it deletes 1 owned component(s): `src/components/auth/LoginForm.tsx`. Every table it touches is touched by something else, so removing it orphans none.

---
