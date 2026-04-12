import { pgTable, index, foreignKey, check, serial, integer, varchar, numeric, boolean, timestamp, text, unique, date, jsonb, geometry, uniqueIndex, bigint, primaryKey, pgMaterializedView, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const entityTypeEnum = pgEnum("entity_type_enum", ['Corporation', 'Individual'])
export const projectRoleEnum = pgEnum("project_role_enum", ['Builder', 'Architect', 'Applicant', 'Owner', 'Agent', 'Engineer'])


export const tradeMappingRules = pgTable("trade_mapping_rules", {
	id: serial().primaryKey().notNull(),
	tradeId: integer("trade_id").notNull(),
	tier: integer().notNull(),
	matchField: varchar("match_field", { length: 50 }).notNull(),
	matchPattern: varchar("match_pattern", { length: 500 }).notNull(),
	confidence: numeric({ precision: 3, scale:  2 }).notNull(),
	phaseStart: integer("phase_start"),
	phaseEnd: integer("phase_end"),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_trade_mapping_rules_tier").using("btree", table.tier.asc().nullsLast().op("int4_ops"), table.isActive.asc().nullsLast().op("int4_ops")),
	index("idx_trade_mapping_rules_trade").using("btree", table.tradeId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.tradeId],
			foreignColumns: [trades.id],
			name: "trade_mapping_rules_trade_id_fkey"
		}),
	check("trade_mapping_rules_confidence_check", sql`(confidence >= (0)::numeric) AND (confidence <= (1)::numeric)`),
	check("trade_mapping_rules_tier_check", sql`tier = ANY (ARRAY[1, 2, 3])`),
]);

export const syncRuns = pgTable("sync_runs", {
	id: serial().primaryKey().notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	status: varchar({ length: 20 }).default('running').notNull(),
	recordsTotal: integer("records_total").default(0).notNull(),
	recordsNew: integer("records_new").default(0).notNull(),
	recordsUpdated: integer("records_updated").default(0).notNull(),
	recordsUnchanged: integer("records_unchanged").default(0).notNull(),
	recordsErrors: integer("records_errors").default(0).notNull(),
	errorMessage: text("error_message"),
	snapshotPath: varchar("snapshot_path", { length: 500 }),
	durationMs: integer("duration_ms"),
});

export const dataQualitySnapshots = pgTable("data_quality_snapshots", {
	id: serial().primaryKey().notNull(),
	snapshotDate: date("snapshot_date").default(sql`CURRENT_DATE`).notNull(),
	totalPermits: integer("total_permits").notNull(),
	activePermits: integer("active_permits").notNull(),
	permitsWithTrades: integer("permits_with_trades").notNull(),
	tradeMatchesTotal: integer("trade_matches_total").notNull(),
	tradeAvgConfidence: numeric("trade_avg_confidence", { precision: 4, scale:  3 }),
	tradeTier1Count: integer("trade_tier1_count").notNull(),
	tradeTier2Count: integer("trade_tier2_count").notNull(),
	tradeTier3Count: integer("trade_tier3_count").notNull(),
	permitsWithBuilder: integer("permits_with_builder").notNull(),
	buildersTotal: integer("builders_total").notNull(),
	buildersEnriched: integer("builders_enriched").notNull(),
	buildersWithPhone: integer("builders_with_phone").notNull(),
	buildersWithEmail: integer("builders_with_email").notNull(),
	buildersWithWebsite: integer("builders_with_website").notNull(),
	buildersWithGoogle: integer("builders_with_google").notNull(),
	buildersWithWsib: integer("builders_with_wsib").notNull(),
	permitsWithParcel: integer("permits_with_parcel").notNull(),
	parcelExactMatches: integer("parcel_exact_matches").notNull(),
	parcelNameMatches: integer("parcel_name_matches").notNull(),
	parcelAvgConfidence: numeric("parcel_avg_confidence", { precision: 4, scale:  3 }),
	permitsWithNeighbourhood: integer("permits_with_neighbourhood").notNull(),
	permitsGeocoded: integer("permits_geocoded").notNull(),
	coaTotal: integer("coa_total").notNull(),
	coaLinked: integer("coa_linked").notNull(),
	coaAvgConfidence: numeric("coa_avg_confidence", { precision: 4, scale:  3 }),
	coaHighConfidence: integer("coa_high_confidence").notNull(),
	coaLowConfidence: integer("coa_low_confidence").notNull(),
	permitsUpdated24H: integer("permits_updated_24h").notNull(),
	permitsUpdated7D: integer("permits_updated_7d").notNull(),
	permitsUpdated30D: integer("permits_updated_30d").notNull(),
	lastSyncAt: timestamp("last_sync_at", { withTimezone: true, mode: 'string' }),
	lastSyncStatus: varchar("last_sync_status", { length: 20 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	parcelSpatialMatches: integer("parcel_spatial_matches").default(0),
	permitsWithScope: integer("permits_with_scope").default(0),
	scopeProjectTypeBreakdown: jsonb("scope_project_type_breakdown"),
	buildingFootprintsTotal: integer("building_footprints_total").default(0).notNull(),
	parcelsWithBuildings: integer("parcels_with_buildings").default(0).notNull(),
	permitsWithScopeTags: integer("permits_with_scope_tags").default(0),
	scopeTagsTop: jsonb("scope_tags_top"),
	permitsWithDetailedTags: integer("permits_with_detailed_tags").default(0),
	tradeResidentialClassified: integer("trade_residential_classified").default(0),
	tradeResidentialTotal: integer("trade_residential_total").default(0),
	tradeCommercialClassified: integer("trade_commercial_classified").default(0),
	tradeCommercialTotal: integer("trade_commercial_total").default(0),
	nullDescriptionCount: integer("null_description_count").default(0),
	nullBuilderNameCount: integer("null_builder_name_count").default(0),
	nullEstConstCostCount: integer("null_est_const_cost_count").default(0),
	nullStreetNumCount: integer("null_street_num_count").default(0),
	nullStreetNameCount: integer("null_street_name_count").default(0),
	nullGeoIdCount: integer("null_geo_id_count").default(0),
	violationCostOutOfRange: integer("violation_cost_out_of_range").default(0),
	violationFutureIssuedDate: integer("violation_future_issued_date").default(0),
	violationMissingStatus: integer("violation_missing_status").default(0),
	violationsTotal: integer("violations_total").default(0),
	schemaColumnCounts: jsonb("schema_column_counts"),
	slaPermitsIngestionHours: numeric("sla_permits_ingestion_hours", { precision: 8, scale:  2 }).default('NULL'),
	inspectionsTotal: integer("inspections_total").default(0),
	inspectionsPermitsScraped: integer("inspections_permits_scraped").default(0),
	inspectionsOutstandingCount: integer("inspections_outstanding_count").default(0),
	inspectionsPassedCount: integer("inspections_passed_count").default(0),
	inspectionsNotPassedCount: integer("inspections_not_passed_count").default(0),
	costEstimatesTotal: integer("cost_estimates_total"),
	costEstimatesFromPermit: integer("cost_estimates_from_permit"),
	costEstimatesFromModel: integer("cost_estimates_from_model"),
	costEstimatesNullCost: integer("cost_estimates_null_cost"),
	timingCalibrationTotal: integer("timing_calibration_total"),
	timingCalibrationAvgSample: integer("timing_calibration_avg_sample"),
	timingCalibrationFreshnessHours: numeric("timing_calibration_freshness_hours", { precision: 6, scale:  1 }),
}, (table) => [
	index("idx_dqs_snapshot_date").using("btree", table.snapshotDate.desc().nullsFirst().op("date_ops")),
	unique("data_quality_snapshots_snapshot_date_key").on(table.snapshotDate),
]);

export const userProfiles = pgTable("user_profiles", {
	userId: varchar("user_id", { length: 128 }).primaryKey().notNull(),
	tradeSlug: varchar("trade_slug", { length: 50 }).notNull(),
	displayName: varchar("display_name", { length: 200 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	check("user_profiles_trade_slug_not_empty", sql`TRIM(BOTH FROM trade_slug) <> ''::text`),
]);

export const permitHistory = pgTable("permit_history", {
	id: serial().primaryKey().notNull(),
	permitNum: varchar("permit_num", { length: 30 }).notNull(),
	revisionNum: varchar("revision_num", { length: 10 }).notNull(),
	syncRunId: integer("sync_run_id"),
	fieldName: varchar("field_name", { length: 100 }).notNull(),
	oldValue: text("old_value"),
	newValue: text("new_value"),
	changedAt: timestamp("changed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_permit_history_permit").using("btree", table.permitNum.asc().nullsLast().op("text_ops"), table.revisionNum.asc().nullsLast().op("text_ops")),
	index("idx_permit_history_sync_run").using("btree", table.syncRunId.asc().nullsLast().op("int4_ops")),
]);

export const trades = pgTable("trades", {
	id: serial().primaryKey().notNull(),
	slug: varchar({ length: 50 }).notNull(),
	name: varchar({ length: 100 }).notNull(),
	icon: varchar({ length: 50 }),
	color: varchar({ length: 7 }),
	sortOrder: integer("sort_order"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("trades_slug_key").on(table.slug),
]);

export const permitTrades = pgTable("permit_trades", {
	id: serial().primaryKey().notNull(),
	permitNum: varchar("permit_num", { length: 30 }).notNull(),
	revisionNum: varchar("revision_num", { length: 10 }).notNull(),
	tradeId: integer("trade_id").notNull(),
	tier: integer(),
	confidence: numeric({ precision: 3, scale:  2 }),
	isActive: boolean("is_active").default(true).notNull(),
	phase: varchar({ length: 20 }),
	leadScore: integer("lead_score").default(0).notNull(),
	classifiedAt: timestamp("classified_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_permit_trades_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("idx_permit_trades_lead_score").using("btree", table.leadScore.desc().nullsFirst().op("int4_ops")),
	index("idx_permit_trades_permit").using("btree", table.permitNum.asc().nullsLast().op("text_ops"), table.revisionNum.asc().nullsLast().op("text_ops")),
	index("idx_permit_trades_trade").using("btree", table.tradeId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.tradeId],
			foreignColumns: [trades.id],
			name: "permit_trades_trade_id_fkey"
		}),
	unique("permit_trades_permit_num_revision_num_trade_id_key").on(table.permitNum, table.revisionNum, table.tradeId),
]);

export const entityContacts = pgTable("entity_contacts", {
	id: serial().primaryKey().notNull(),
	entityId: integer("entity_id").notNull(),
	contactType: varchar("contact_type", { length: 20 }),
	contactValue: varchar("contact_value", { length: 500 }),
	source: varchar({ length: 50 }).default('user').notNull(),
	contributedBy: varchar("contributed_by", { length: 100 }),
	verified: boolean().default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_entity_contacts_entity").using("btree", table.entityId.asc().nullsLast().op("int4_ops")),
	index("idx_entity_contacts_type").using("btree", table.contactType.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.entityId],
			foreignColumns: [entities.id],
			name: "entity_contacts_entity_id_fkey"
		}).onDelete("cascade"),
]);

export const timingCalibration = pgTable("timing_calibration", {
	id: serial().primaryKey().notNull(),
	permitType: varchar("permit_type", { length: 100 }).notNull(),
	medianDaysToFirstInspection: integer("median_days_to_first_inspection").notNull(),
	p25Days: integer("p25_days").notNull(),
	p75Days: integer("p75_days").notNull(),
	sampleSize: integer("sample_size").notNull(),
	computedAt: timestamp("computed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("timing_calibration_permit_type_key").on(table.permitType),
]);

export const builders = pgTable("builders", {
	id: serial().primaryKey().notNull(),
	name: varchar({ length: 500 }).notNull(),
	nameNormalized: varchar("name_normalized", { length: 500 }).notNull(),
	phone: varchar({ length: 50 }),
	email: varchar({ length: 200 }),
	website: varchar({ length: 500 }),
	googlePlaceId: varchar("google_place_id", { length: 200 }),
	googleRating: numeric("google_rating", { precision: 2, scale:  1 }),
	googleReviewCount: integer("google_review_count"),
	obrBusinessNumber: varchar("obr_business_number", { length: 50 }),
	wsibStatus: varchar("wsib_status", { length: 50 }),
	permitCount: integer("permit_count").default(0).notNull(),
	firstSeenAt: timestamp("first_seen_at", { mode: 'string' }).defaultNow().notNull(),
	lastSeenAt: timestamp("last_seen_at", { mode: 'string' }).defaultNow().notNull(),
	enrichedAt: timestamp("enriched_at", { mode: 'string' }),
}, (table) => [
	index("idx_builders_name_normalized").using("btree", table.nameNormalized.asc().nullsLast().op("text_ops")),
	index("idx_builders_permit_count").using("btree", table.permitCount.desc().nullsFirst().op("int4_ops")),
	unique("builders_name_normalized_key").on(table.nameNormalized),
]);

export const notifications = pgTable("notifications", {
	id: serial().primaryKey().notNull(),
	userId: varchar("user_id", { length: 100 }).notNull(),
	type: varchar({ length: 50 }).notNull(),
	title: varchar({ length: 200 }),
	body: text(),
	permitNum: varchar("permit_num", { length: 30 }),
	tradeSlug: varchar("trade_slug", { length: 50 }),
	channel: varchar({ length: 20 }).default('in_app').notNull(),
	isRead: boolean("is_read").default(false).notNull(),
	isSent: boolean("is_sent").default(false).notNull(),
	sentAt: timestamp("sent_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_notifications_user_created").using("btree", table.userId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("text_ops")),
	index("idx_notifications_user_read").using("btree", table.userId.asc().nullsLast().op("bool_ops"), table.isRead.asc().nullsLast().op("bool_ops")),
]);

export const parcels = pgTable("parcels", {
	id: serial().primaryKey().notNull(),
	parcelId: varchar("parcel_id", { length: 20 }).notNull(),
	featureType: varchar("feature_type", { length: 20 }),
	addressNumber: varchar("address_number", { length: 20 }),
	linearNameFull: varchar("linear_name_full", { length: 200 }),
	addrNumNormalized: varchar("addr_num_normalized", { length: 20 }),
	streetNameNormalized: varchar("street_name_normalized", { length: 200 }),
	streetTypeNormalized: varchar("street_type_normalized", { length: 20 }),
	statedAreaRaw: varchar("stated_area_raw", { length: 100 }),
	lotSizeSqm: numeric("lot_size_sqm", { precision: 12, scale:  2 }),
	lotSizeSqft: numeric("lot_size_sqft", { precision: 12, scale:  2 }),
	frontageM: numeric("frontage_m", { precision: 8, scale:  2 }),
	frontageFt: numeric("frontage_ft", { precision: 8, scale:  2 }),
	depthM: numeric("depth_m", { precision: 8, scale:  2 }),
	depthFt: numeric("depth_ft", { precision: 8, scale:  2 }),
	geometry: jsonb(),
	dateEffective: date("date_effective"),
	dateExpiry: date("date_expiry"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	centroidLat: numeric("centroid_lat", { precision: 10, scale:  7 }),
	centroidLng: numeric("centroid_lng", { precision: 10, scale:  7 }),
	isIrregular: boolean("is_irregular").default(false),
	geom: geometry({ type: "geometry", srid: 4326 }),
}, (table) => [
	index("idx_parcels_address").using("btree", table.addrNumNormalized.asc().nullsLast().op("text_ops"), table.streetNameNormalized.asc().nullsLast().op("text_ops")),
	index("idx_parcels_centroid").using("btree", table.centroidLat.asc().nullsLast().op("numeric_ops"), table.centroidLng.asc().nullsLast().op("numeric_ops")).where(sql`(centroid_lat IS NOT NULL)`),
	index("idx_parcels_feature_type").using("btree", table.featureType.asc().nullsLast().op("text_ops")),
	index("idx_parcels_geom_gist").using("gist", table.geom.asc().nullsLast().op("gist_geometry_ops_2d")),
	index("idx_parcels_street_name").using("btree", table.streetNameNormalized.asc().nullsLast().op("text_ops")),
	unique("parcels_parcel_id_key").on(table.parcelId),
]);

export const builderContacts = pgTable("builder_contacts", {
	id: serial().primaryKey().notNull(),
	builderId: integer("builder_id").notNull(),
	contactType: varchar("contact_type", { length: 20 }),
	contactValue: varchar("contact_value", { length: 500 }),
	source: varchar({ length: 50 }).default('user').notNull(),
	contributedBy: varchar("contributed_by", { length: 100 }),
	verified: boolean().default(false).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_builder_contacts_builder").using("btree", table.builderId.asc().nullsLast().op("int4_ops")),
	index("idx_builder_contacts_type").using("btree", table.contactType.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.builderId],
			foreignColumns: [builders.id],
			name: "builder_contacts_builder_id_fkey"
		}),
]);

export const neighbourhoods = pgTable("neighbourhoods", {
	id: serial().primaryKey().notNull(),
	neighbourhoodId: integer("neighbourhood_id").notNull(),
	name: varchar({ length: 100 }).notNull(),
	geometry: jsonb(),
	avgHouseholdIncome: integer("avg_household_income"),
	medianHouseholdIncome: integer("median_household_income"),
	avgIndividualIncome: integer("avg_individual_income"),
	lowIncomePct: numeric("low_income_pct", { precision: 5, scale:  2 }),
	tenureOwnerPct: numeric("tenure_owner_pct", { precision: 5, scale:  2 }),
	tenureRenterPct: numeric("tenure_renter_pct", { precision: 5, scale:  2 }),
	periodOfConstruction: varchar("period_of_construction", { length: 50 }),
	couplesPct: numeric("couples_pct", { precision: 5, scale:  2 }),
	loneParentPct: numeric("lone_parent_pct", { precision: 5, scale:  2 }),
	marriedPct: numeric("married_pct", { precision: 5, scale:  2 }),
	universityDegreePct: numeric("university_degree_pct", { precision: 5, scale:  2 }),
	immigrantPct: numeric("immigrant_pct", { precision: 5, scale:  2 }),
	visibleMinorityPct: numeric("visible_minority_pct", { precision: 5, scale:  2 }),
	englishKnowledgePct: numeric("english_knowledge_pct", { precision: 5, scale:  2 }),
	topMotherTongue: varchar("top_mother_tongue", { length: 50 }),
	censusYear: integer("census_year").default(2021),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	geom: geometry({ type: "geometry", srid: 4326 }),
}, (table) => [
	index("idx_neighbourhoods_geom_gist").using("gist", table.geom.asc().nullsLast().op("gist_geometry_ops_2d")),
	index("idx_neighbourhoods_nid").using("btree", table.neighbourhoodId.asc().nullsLast().op("int4_ops")),
	unique("neighbourhoods_neighbourhood_id_key").on(table.neighbourhoodId),
]);

export const permitParcels = pgTable("permit_parcels", {
	id: serial().primaryKey().notNull(),
	permitNum: varchar("permit_num", { length: 30 }).notNull(),
	revisionNum: varchar("revision_num", { length: 10 }).notNull(),
	parcelId: integer("parcel_id").notNull(),
	matchType: varchar("match_type", { length: 30 }).notNull(),
	confidence: numeric({ precision: 3, scale:  2 }).notNull(),
	linkedAt: timestamp("linked_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_permit_parcels_parcel").using("btree", table.parcelId.asc().nullsLast().op("int4_ops")),
	index("idx_permit_parcels_permit").using("btree", table.permitNum.asc().nullsLast().op("text_ops"), table.revisionNum.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.parcelId],
			foreignColumns: [parcels.id],
			name: "permit_parcels_parcel_id_fkey"
		}),
	unique("permit_parcels_permit_num_revision_num_parcel_id_key").on(table.parcelId, table.permitNum, table.revisionNum),
]);

export const addressPoints = pgTable("address_points", {
	addressPointId: integer("address_point_id").primaryKey().notNull(),
	latitude: numeric({ precision: 10, scale:  7 }).notNull(),
	longitude: numeric({ precision: 10, scale:  7 }).notNull(),
});

export const parcelBuildings = pgTable("parcel_buildings", {
	id: serial().primaryKey().notNull(),
	parcelId: integer("parcel_id").notNull(),
	buildingId: integer("building_id").notNull(),
	isPrimary: boolean("is_primary").default(false).notNull(),
	structureType: varchar("structure_type", { length: 20 }).default('other').notNull(),
	linkedAt: timestamp("linked_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	matchType: varchar("match_type", { length: 30 }).default('polygon').notNull(),
	confidence: numeric({ precision: 3, scale:  2 }).default('0.85').notNull(),
}, (table) => [
	index("idx_parcel_buildings_building").using("btree", table.buildingId.asc().nullsLast().op("int4_ops")),
	uniqueIndex("idx_parcel_buildings_one_primary").using("btree", table.parcelId.asc().nullsLast().op("int4_ops")).where(sql`(is_primary = true)`),
	index("idx_parcel_buildings_parcel").using("btree", table.parcelId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.buildingId],
			foreignColumns: [buildingFootprints.id],
			name: "parcel_buildings_building_id_fkey"
		}),
	foreignKey({
			columns: [table.parcelId],
			foreignColumns: [parcels.id],
			name: "parcel_buildings_parcel_id_fkey"
		}),
	unique("parcel_buildings_parcel_id_building_id_key").on(table.buildingId, table.parcelId),
]);

export const pipelineRuns = pgTable("pipeline_runs", {
	id: serial().primaryKey().notNull(),
	pipeline: text().notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	status: text().default('running').notNull(),
	recordsTotal: integer("records_total").default(0),
	recordsNew: integer("records_new").default(0),
	recordsUpdated: integer("records_updated").default(0),
	errorMessage: text("error_message"),
	durationMs: integer("duration_ms"),
	recordsMeta: jsonb("records_meta"),
}, (table) => [
	index("idx_pipeline_runs_lookup").using("btree", table.pipeline.asc().nullsLast().op("text_ops"), table.startedAt.desc().nullsFirst().op("text_ops")),
]);

export const pipelineSchedules = pgTable("pipeline_schedules", {
	pipeline: text().primaryKey().notNull(),
	cadence: text().default('Daily').notNull(),
	cronExpression: text("cron_expression"),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	enabled: boolean().default(true).notNull(),
});

export const buildingFootprints = pgTable("building_footprints", {
	id: serial().primaryKey().notNull(),
	sourceId: varchar("source_id", { length: 50 }).notNull(),
	geometry: jsonb().notNull(),
	footprintAreaSqm: numeric("footprint_area_sqm", { precision: 12, scale:  2 }),
	footprintAreaSqft: numeric("footprint_area_sqft", { precision: 12, scale:  2 }),
	maxHeightM: numeric("max_height_m", { precision: 8, scale:  2 }),
	minHeightM: numeric("min_height_m", { precision: 8, scale:  2 }),
	elevZ: numeric("elev_z", { precision: 8, scale:  2 }),
	estimatedStories: integer("estimated_stories"),
	centroidLat: numeric("centroid_lat", { precision: 10, scale:  7 }),
	centroidLng: numeric("centroid_lng", { precision: 10, scale:  7 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_building_footprints_centroid").using("btree", table.centroidLat.asc().nullsLast().op("numeric_ops"), table.centroidLng.asc().nullsLast().op("numeric_ops")),
	index("idx_building_footprints_source").using("btree", table.sourceId.asc().nullsLast().op("text_ops")),
	unique("building_footprints_source_id_key").on(table.sourceId),
]);

export const permitInspections = pgTable("permit_inspections", {
	id: serial().primaryKey().notNull(),
	permitNum: varchar("permit_num", { length: 30 }).notNull(),
	stageName: text("stage_name").notNull(),
	status: varchar({ length: 20 }).notNull(),
	inspectionDate: date("inspection_date"),
	scrapedAt: timestamp("scraped_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_permit_inspections_outstanding").using("btree", table.permitNum.asc().nullsLast().op("text_ops")).where(sql`((status)::text = 'Outstanding'::text)`),
	index("idx_permit_inspections_permit_num").using("btree", table.permitNum.asc().nullsLast().op("text_ops")),
	unique("uq_permit_inspection").on(table.permitNum, table.stageName),
]);

export const wsibRegistry = pgTable("wsib_registry", {
	id: serial().primaryKey().notNull(),
	legalName: varchar("legal_name", { length: 500 }).notNull(),
	tradeName: varchar("trade_name", { length: 500 }),
	legalNameNormalized: varchar("legal_name_normalized", { length: 500 }).notNull(),
	tradeNameNormalized: varchar("trade_name_normalized", { length: 500 }),
	mailingAddress: varchar("mailing_address", { length: 500 }),
	predominantClass: varchar("predominant_class", { length: 10 }).notNull(),
	naicsCode: varchar("naics_code", { length: 20 }),
	naicsDescription: varchar("naics_description", { length: 500 }),
	subclass: varchar({ length: 50 }),
	subclassDescription: text("subclass_description"),
	businessSize: varchar("business_size", { length: 100 }),
	matchConfidence: numeric("match_confidence", { precision: 3, scale:  2 }),
	matchedAt: timestamp("matched_at", { withTimezone: true, mode: 'string' }),
	firstSeenAt: timestamp("first_seen_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	linkedEntityId: integer("linked_entity_id"),
	primaryEmail: varchar("primary_email", { length: 200 }),
	website: varchar({ length: 500 }),
	lastEnrichedAt: timestamp("last_enriched_at", { mode: 'string' }),
	primaryPhone: varchar("primary_phone", { length: 50 }),
	isGta: boolean("is_gta").default(false),
}, (table) => [
	index("idx_wsib_class").using("btree", table.predominantClass.asc().nullsLast().op("text_ops")),
	index("idx_wsib_enrichment_queue").using("btree", table.lastEnrichedAt.asc().nullsLast().op("timestamp_ops")).where(sql`((last_enriched_at IS NULL) AND (trade_name IS NOT NULL))`),
	index("idx_wsib_is_gta_unenriched").using("btree", table.isGta.asc().nullsLast().op("bool_ops")).where(sql`((is_gta = true) AND (last_enriched_at IS NULL))`),
	index("idx_wsib_legal_norm").using("btree", table.legalNameNormalized.asc().nullsLast().op("text_ops")),
	index("idx_wsib_legal_trgm").using("gin", table.legalNameNormalized.asc().nullsLast().op("gin_trgm_ops")),
	index("idx_wsib_linked_entity").using("btree", table.linkedEntityId.asc().nullsLast().op("int4_ops")).where(sql`(linked_entity_id IS NOT NULL)`),
	index("idx_wsib_trade_norm").using("btree", table.tradeNameNormalized.asc().nullsLast().op("text_ops")),
	index("idx_wsib_trade_trgm").using("gin", table.tradeNameNormalized.asc().nullsLast().op("gin_trgm_ops")),
	foreignKey({
			columns: [table.linkedEntityId],
			foreignColumns: [entities.id],
			name: "wsib_registry_linked_entity_id_fkey"
		}),
	unique("wsib_registry_legal_name_normalized_mailing_address_key").on(table.legalNameNormalized, table.mailingAddress),
]);

export const engineHealthSnapshots = pgTable("engine_health_snapshots", {
	id: serial().primaryKey().notNull(),
	tableName: text("table_name").notNull(),
	snapshotDate: date("snapshot_date").default(sql`CURRENT_DATE`).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	nLiveTup: bigint("n_live_tup", { mode: "number" }).default(0).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	nDeadTup: bigint("n_dead_tup", { mode: "number" }).default(0).notNull(),
	deadRatio: numeric("dead_ratio", { precision: 6, scale:  4 }).default('0').notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	seqScan: bigint("seq_scan", { mode: "number" }).default(0).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	idxScan: bigint("idx_scan", { mode: "number" }).default(0).notNull(),
	seqRatio: numeric("seq_ratio", { precision: 6, scale:  4 }).default('0').notNull(),
	capturedAt: timestamp("captured_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("uq_engine_health_table_date").using("btree", table.tableName.asc().nullsLast().op("date_ops"), table.snapshotDate.asc().nullsLast().op("date_ops")),
]);

export const entityProjects = pgTable("entity_projects", {
	id: serial().primaryKey().notNull(),
	entityId: integer("entity_id").notNull(),
	permitNum: varchar("permit_num", { length: 50 }),
	revisionNum: varchar("revision_num", { length: 10 }),
	coaFileNum: varchar("coa_file_num", { length: 50 }),
	role: projectRoleEnum().notNull(),
	observedAt: timestamp("observed_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_entity_projects_coa").using("btree", table.coaFileNum.asc().nullsLast().op("text_ops")).where(sql`(coa_file_num IS NOT NULL)`),
	index("idx_entity_projects_entity").using("btree", table.entityId.asc().nullsLast().op("int4_ops")),
	index("idx_entity_projects_permit").using("btree", table.permitNum.asc().nullsLast().op("text_ops"), table.revisionNum.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.entityId],
			foreignColumns: [entities.id],
			name: "entity_projects_entity_id_fkey"
		}),
	unique("entity_projects_entity_id_permit_num_revision_num_role_key").on(table.entityId, table.permitNum, table.revisionNum, table.role),
	unique("entity_projects_entity_id_coa_file_num_role_key").on(table.coaFileNum, table.entityId, table.role),
]);

export const scraperQueue = pgTable("scraper_queue", {
	yearSeq: varchar("year_seq", { length: 20 }).primaryKey().notNull(),
	permitType: text("permit_type").notNull(),
	claimedAt: timestamp("claimed_at", { withTimezone: true, mode: 'string' }),
	claimedBy: text("claimed_by"),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	status: varchar({ length: 20 }).default('pending').notNull(),
	errorMsg: text("error_msg"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_scraper_queue_pending").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")).where(sql`((status)::text = 'pending'::text)`),
	check("scraper_queue_status_check", sql`(status)::text = ANY ((ARRAY['pending'::character varying, 'claimed'::character varying, 'completed'::character varying, 'failed'::character varying])::text[])`),
]);

export const productGroups = pgTable("product_groups", {
	id: serial().primaryKey().notNull(),
	slug: varchar({ length: 50 }).notNull(),
	name: varchar({ length: 100 }).notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("idx_product_groups_slug").using("btree", table.slug.asc().nullsLast().op("text_ops")),
	unique("product_groups_slug_key").on(table.slug),
]);

export const leadViews = pgTable("lead_views", {
	id: serial().primaryKey().notNull(),
	userId: varchar("user_id", { length: 128 }).notNull(),
	leadKey: varchar("lead_key", { length: 100 }).notNull(),
	leadType: varchar("lead_type", { length: 20 }).notNull(),
	permitNum: varchar("permit_num", { length: 30 }),
	revisionNum: varchar("revision_num", { length: 10 }),
	entityId: integer("entity_id"),
	tradeSlug: varchar("trade_slug", { length: 50 }).notNull(),
	viewedAt: timestamp("viewed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	saved: boolean().default(false).notNull(),
	savedAt: timestamp("saved_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_lead_views_lead_trade_viewed").using("btree", table.leadKey.asc().nullsLast().op("text_ops"), table.tradeSlug.asc().nullsLast().op("timestamptz_ops"), table.viewedAt.asc().nullsLast().op("timestamptz_ops"), table.userId.asc().nullsLast().op("text_ops")),
	index("idx_lead_views_saved_at").using("btree", table.savedAt.asc().nullsLast().op("timestamptz_ops")).where(sql`(saved = true)`),
	index("idx_lead_views_user_viewed").using("btree", table.userId.asc().nullsLast().op("timestamptz_ops"), table.viewedAt.desc().nullsFirst().op("text_ops")),
	index("idx_lead_views_viewed_brin").using("brin", table.viewedAt.asc().nullsLast().op("timestamptz_minmax_ops")),
	foreignKey({
			columns: [table.entityId],
			foreignColumns: [entities.id],
			name: "lead_views_entity_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.permitNum, table.revisionNum],
			foreignColumns: [permits.permitNum, permits.revisionNum],
			name: "lead_views_permit_num_revision_num_fkey"
		}).onDelete("cascade"),
	unique("lead_views_user_id_lead_key_trade_slug_key").on(table.leadKey, table.tradeSlug, table.userId),
	check("lead_views_check", sql`(((lead_type)::text = 'permit'::text) AND (permit_num IS NOT NULL) AND (revision_num IS NOT NULL) AND (entity_id IS NULL)) OR (((lead_type)::text = 'builder'::text) AND (entity_id IS NOT NULL) AND (permit_num IS NULL) AND (revision_num IS NULL))`),
	check("lead_views_lead_type_check", sql`(lead_type)::text = ANY ((ARRAY['permit'::character varying, 'builder'::character varying])::text[])`),
]);

export const inspectionStageMap = pgTable("inspection_stage_map", {
	id: serial().primaryKey().notNull(),
	stageName: text("stage_name").notNull(),
	stageSequence: integer("stage_sequence").notNull(),
	tradeSlug: varchar("trade_slug", { length: 50 }).notNull(),
	relationship: varchar({ length: 20 }).notNull(),
	minLagDays: integer("min_lag_days").notNull(),
	maxLagDays: integer("max_lag_days").notNull(),
	precedence: integer().default(100).notNull(),
}, (table) => [
	uniqueIndex("idx_inspection_stage_map_stage_trade_prec").using("btree", table.stageName.asc().nullsLast().op("int4_ops"), table.tradeSlug.asc().nullsLast().op("int4_ops"), table.precedence.asc().nullsLast().op("text_ops")),
	index("idx_inspection_stage_map_trade").using("btree", table.tradeSlug.asc().nullsLast().op("text_ops")),
	check("inspection_stage_map_check", sql`(min_lag_days >= 0) AND (max_lag_days >= min_lag_days)`),
	check("inspection_stage_map_precedence_check", sql`precedence > 0`),
	check("inspection_stage_map_relationship_check", sql`(relationship)::text = ANY ((ARRAY['follows'::character varying, 'concurrent'::character varying])::text[])`),
	check("inspection_stage_map_stage_sequence_check", sql`stage_sequence = ANY (ARRAY[10, 20, 30, 40, 50, 60, 70])`),
]);

export const schemaMigrations = pgTable("schema_migrations", {
	filename: text().primaryKey().notNull(),
	appliedAt: timestamp("applied_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	checksum: text().notNull(),
	durationMs: integer("duration_ms").notNull(),
});

export const entities = pgTable("entities", {
	id: serial().primaryKey().notNull(),
	legalName: varchar("legal_name", { length: 500 }).notNull(),
	tradeName: varchar("trade_name", { length: 500 }),
	nameNormalized: varchar("name_normalized", { length: 750 }).notNull(),
	entityType: entityTypeEnum("entity_type"),
	primaryPhone: varchar("primary_phone", { length: 50 }),
	primaryEmail: varchar("primary_email", { length: 200 }),
	website: varchar({ length: 500 }),
	linkedinUrl: varchar("linkedin_url", { length: 500 }),
	googlePlaceId: varchar("google_place_id", { length: 200 }),
	googleRating: numeric("google_rating", { precision: 2, scale:  1 }),
	googleReviewCount: integer("google_review_count"),
	isWsibRegistered: boolean("is_wsib_registered").default(false),
	permitCount: integer("permit_count").default(0).notNull(),
	firstSeenAt: timestamp("first_seen_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	lastEnrichedAt: timestamp("last_enriched_at", { withTimezone: true, mode: 'string' }),
	photoUrl: varchar("photo_url", { length: 500 }),
	photoValidatedAt: timestamp("photo_validated_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_entities_name_norm").using("btree", table.nameNormalized.asc().nullsLast().op("text_ops")),
	index("idx_entities_name_trgm").using("gin", table.nameNormalized.asc().nullsLast().op("gin_trgm_ops")),
	index("idx_entities_permit_count").using("btree", table.permitCount.desc().nullsFirst().op("int4_ops")),
	unique("entities_name_normalized_key").on(table.nameNormalized),
	check("entities_photo_url_https", sql`(photo_url IS NULL) OR ((photo_url)::text ~~ 'https://%'::text)`),
]);

export const coaApplications = pgTable("coa_applications", {
	id: serial().primaryKey().notNull(),
	applicationNumber: varchar("application_number", { length: 50 }),
	address: varchar({ length: 500 }),
	streetNum: varchar("street_num", { length: 20 }),
	streetName: varchar("street_name", { length: 200 }),
	ward: varchar({ length: 10 }),
	status: varchar({ length: 50 }),
	decision: varchar({ length: 50 }),
	decisionDate: date("decision_date"),
	hearingDate: date("hearing_date"),
	description: text(),
	applicant: varchar({ length: 500 }),
	linkedPermitNum: varchar("linked_permit_num", { length: 30 }),
	linkedConfidence: numeric("linked_confidence", { precision: 3, scale:  2 }),
	dataHash: varchar("data_hash", { length: 64 }),
	firstSeenAt: timestamp("first_seen_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	subType: text("sub_type"),
	streetNameNormalized: varchar("street_name_normalized"),
	lifecyclePhase: varchar("lifecycle_phase", { length: 10 }).default(sql`NULL`),
	lifecycleClassifiedAt: timestamp("lifecycle_classified_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_coa_applications_address").using("btree", table.address.asc().nullsLast().op("text_ops")),
	index("idx_coa_applications_linked_permit").using("btree", table.linkedPermitNum.asc().nullsLast().op("text_ops")),
	index("idx_coa_applications_ward").using("btree", table.ward.asc().nullsLast().op("text_ops")),
	index("idx_coa_decision_date").using("btree", table.decisionDate.desc().nullsFirst().op("date_ops")),
	index("idx_coa_hearing_date").using("btree", table.hearingDate.asc().nullsLast().op("date_ops")),
	index("idx_coa_lifecycle_dirty").using("btree", table.id.asc().nullsLast().op("int4_ops")).where(sql`(lifecycle_classified_at IS NULL)`),
	index("idx_coa_lifecycle_phase").using("btree", table.lifecyclePhase.asc().nullsLast().op("text_ops")).where(sql`(lifecycle_phase IS NOT NULL)`),
	index("idx_coa_street_name_normalized").using("btree", table.streetNameNormalized.asc().nullsLast().op("text_ops")).where(sql`(street_name_normalized IS NOT NULL)`),
	index("idx_coa_upcoming_leads").using("btree", table.decisionDate.desc().nullsFirst().op("date_ops")).where(sql`(((decision)::text = ANY ((ARRAY['Approved'::character varying, 'Approved with Conditions'::character varying])::text[])) AND (linked_permit_num IS NULL))`),
	unique("coa_applications_application_number_key").on(table.applicationNumber),
]);

export const permitPhaseTransitions = pgTable("permit_phase_transitions", {
	id: serial().primaryKey().notNull(),
	permitNum: varchar("permit_num", { length: 30 }).notNull(),
	revisionNum: varchar("revision_num", { length: 10 }).notNull(),
	fromPhase: varchar("from_phase", { length: 10 }),
	toPhase: varchar("to_phase", { length: 10 }).notNull(),
	transitionedAt: timestamp("transitioned_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	permitType: varchar("permit_type", { length: 100 }),
	neighbourhoodId: integer("neighbourhood_id"),
}, (table) => [
	index("idx_phase_transitions_neighbourhood").using("btree", table.neighbourhoodId.asc().nullsLast().op("text_ops"), table.fromPhase.asc().nullsLast().op("int4_ops"), table.toPhase.asc().nullsLast().op("int4_ops")),
	index("idx_phase_transitions_pair").using("btree", table.fromPhase.asc().nullsLast().op("text_ops"), table.toPhase.asc().nullsLast().op("text_ops")),
	index("idx_phase_transitions_permit").using("btree", table.permitNum.asc().nullsLast().op("timestamptz_ops"), table.revisionNum.asc().nullsLast().op("timestamptz_ops"), table.transitionedAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_phase_transitions_target").using("btree", table.toPhase.asc().nullsLast().op("text_ops"), table.transitionedAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.permitNum, table.revisionNum],
			foreignColumns: [permits.permitNum, permits.revisionNum],
			name: "fk_transitions_permit"
		}).onDelete("cascade"),
	check("chk_transitions_from_phase", sql`(from_phase IS NULL) OR ((from_phase)::text = ANY ((ARRAY['P1'::character varying, 'P2'::character varying, 'P3'::character varying, 'P4'::character varying, 'P5'::character varying, 'P6'::character varying, 'P7a'::character varying, 'P7b'::character varying, 'P7c'::character varying, 'P7d'::character varying, 'P8'::character varying, 'P9'::character varying, 'P10'::character varying, 'P11'::character varying, 'P12'::character varying, 'P13'::character varying, 'P14'::character varying, 'P15'::character varying, 'P16'::character varying, 'P17'::character varying, 'P18'::character varying, 'P19'::character varying, 'P20'::character varying, 'O1'::character varying, 'O2'::character varying, 'O3'::character varying, 'O4'::character varying])::text[]))`),
	check("chk_transitions_to_phase", sql`(to_phase)::text = ANY ((ARRAY['P1'::character varying, 'P2'::character varying, 'P3'::character varying, 'P4'::character varying, 'P5'::character varying, 'P6'::character varying, 'P7a'::character varying, 'P7b'::character varying, 'P7c'::character varying, 'P7d'::character varying, 'P8'::character varying, 'P9'::character varying, 'P10'::character varying, 'P11'::character varying, 'P12'::character varying, 'P13'::character varying, 'P14'::character varying, 'P15'::character varying, 'P16'::character varying, 'P17'::character varying, 'P18'::character varying, 'P19'::character varying, 'P20'::character varying, 'O1'::character varying, 'O2'::character varying, 'O3'::character varying, 'O4'::character varying])::text[])`),
]);

export const phaseCalibration = pgTable("phase_calibration", {
	id: serial().primaryKey().notNull(),
	fromPhase: varchar("from_phase", { length: 10 }).notNull(),
	toPhase: varchar("to_phase", { length: 10 }).notNull(),
	permitType: varchar("permit_type", { length: 100 }),
	medianDays: integer("median_days").notNull(),
	p25Days: integer("p25_days").notNull(),
	p75Days: integer("p75_days").notNull(),
	sampleSize: integer("sample_size").notNull(),
	computedAt: timestamp("computed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_phase_calibration_from").using("btree", table.fromPhase.asc().nullsLast().op("text_ops"), table.permitType.asc().nullsLast().op("text_ops")),
	uniqueIndex("idx_phase_calibration_unique").using("btree", sql`from_phase`, sql`to_phase`, sql`COALESCE(permit_type, '__ALL__'::character varying)`),
	check("chk_calibration_from_phase", sql`(from_phase)::text = ANY ((ARRAY['P1'::character varying, 'P2'::character varying, 'P3'::character varying, 'P4'::character varying, 'P5'::character varying, 'P6'::character varying, 'P7a'::character varying, 'P7b'::character varying, 'P7c'::character varying, 'P7d'::character varying, 'P8'::character varying, 'P9'::character varying, 'P10'::character varying, 'P11'::character varying, 'P12'::character varying, 'P13'::character varying, 'P14'::character varying, 'P15'::character varying, 'P16'::character varying, 'P17'::character varying, 'P18'::character varying, 'P19'::character varying, 'P20'::character varying, 'O1'::character varying, 'O2'::character varying, 'O3'::character varying, 'O4'::character varying, 'ISSUED'::character varying])::text[])`),
	check("chk_calibration_sample", sql`sample_size >= 5`),
	check("chk_calibration_to_phase", sql`(to_phase)::text = ANY ((ARRAY['P1'::character varying, 'P2'::character varying, 'P3'::character varying, 'P4'::character varying, 'P5'::character varying, 'P6'::character varying, 'P7a'::character varying, 'P7b'::character varying, 'P7c'::character varying, 'P7d'::character varying, 'P8'::character varying, 'P9'::character varying, 'P10'::character varying, 'P11'::character varying, 'P12'::character varying, 'P13'::character varying, 'P14'::character varying, 'P15'::character varying, 'P16'::character varying, 'P17'::character varying, 'P18'::character varying, 'P19'::character varying, 'P20'::character varying, 'O1'::character varying, 'O2'::character varying, 'O3'::character varying, 'O4'::character varying])::text[])`),
]);

export const trackedProjects = pgTable("tracked_projects", {
	id: serial().primaryKey().notNull(),
	userId: varchar("user_id", { length: 128 }).notNull(),
	permitNum: varchar("permit_num", { length: 30 }).notNull(),
	revisionNum: varchar("revision_num", { length: 10 }).notNull(),
	tradeSlug: varchar("trade_slug", { length: 50 }).notNull(),
	status: varchar({ length: 50 }).default('claimed_unverified').notNull(),
	claimedAt: timestamp("claimed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_tracked_projects_permit").using("btree", table.permitNum.asc().nullsLast().op("text_ops"), table.revisionNum.asc().nullsLast().op("text_ops")),
	index("idx_tracked_projects_user").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.claimedAt.desc().nullsFirst().op("text_ops")),
	unique("uq_tracked_user_permit_trade").on(table.permitNum, table.revisionNum, table.tradeSlug, table.userId),
	check("chk_tracked_status", sql`(status)::text = ANY ((ARRAY['claimed_unverified'::character varying, 'verified'::character varying, 'expired'::character varying])::text[])`),
]);

export const permitProducts = pgTable("permit_products", {
	permitNum: varchar("permit_num", { length: 20 }).notNull(),
	revisionNum: varchar("revision_num", { length: 10 }).notNull(),
	productId: integer("product_id").notNull(),
	productSlug: varchar("product_slug", { length: 50 }).notNull(),
	productName: varchar("product_name", { length: 100 }).notNull(),
	confidence: numeric({ precision: 3, scale:  2 }).default('0.75').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_permit_products_product").using("btree", table.productId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.productId],
			foreignColumns: [productGroups.id],
			name: "permit_products_product_id_fkey"
		}),
	primaryKey({ columns: [table.permitNum, table.productId, table.revisionNum], name: "permit_products_pkey"}),
]);

export const costEstimates = pgTable("cost_estimates", {
	permitNum: varchar("permit_num", { length: 30 }).notNull(),
	revisionNum: varchar("revision_num", { length: 10 }).notNull(),
	estimatedCost: numeric("estimated_cost", { precision: 15, scale:  2 }),
	costSource: varchar("cost_source", { length: 20 }).notNull(),
	costTier: varchar("cost_tier", { length: 20 }),
	costRangeLow: numeric("cost_range_low", { precision: 15, scale:  2 }),
	costRangeHigh: numeric("cost_range_high", { precision: 15, scale:  2 }),
	premiumFactor: numeric("premium_factor", { precision: 3, scale:  2 }),
	complexityScore: integer("complexity_score"),
	modelVersion: integer("model_version").default(1).notNull(),
	computedAt: timestamp("computed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	tradeContractValues: jsonb("trade_contract_values").default({}).notNull(),
}, (table) => [
	index("idx_cost_estimates_tier").using("btree", table.costTier.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.permitNum, table.revisionNum],
			foreignColumns: [permits.permitNum, permits.revisionNum],
			name: "cost_estimates_permit_num_revision_num_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.permitNum, table.revisionNum], name: "cost_estimates_pkey"}),
	check("cost_estimates_check", sql`(cost_range_low IS NULL) OR (cost_range_high IS NULL) OR (cost_range_low <= cost_range_high)`),
	check("cost_estimates_complexity_score_check", sql`(complexity_score >= 0) AND (complexity_score <= 100)`),
	check("cost_estimates_cost_source_check", sql`(cost_source)::text = ANY ((ARRAY['permit'::character varying, 'model'::character varying])::text[])`),
	check("cost_estimates_cost_tier_check", sql`(cost_tier)::text = ANY ((ARRAY['small'::character varying, 'medium'::character varying, 'large'::character varying, 'major'::character varying, 'mega'::character varying])::text[])`),
	check("cost_estimates_premium_factor_check", sql`(premium_factor IS NULL) OR (premium_factor >= 1.0)`),
]);

export const tradeForecasts = pgTable("trade_forecasts", {
	permitNum: varchar("permit_num", { length: 30 }).notNull(),
	revisionNum: varchar("revision_num", { length: 10 }).notNull(),
	tradeSlug: varchar("trade_slug", { length: 50 }).notNull(),
	predictedStart: date("predicted_start"),
	confidence: varchar({ length: 10 }).default('low').notNull(),
	urgency: varchar({ length: 20 }).default('unknown').notNull(),
	calibrationMethod: varchar("calibration_method", { length: 30 }),
	sampleSize: integer("sample_size"),
	medianDays: integer("median_days"),
	p25Days: integer("p25_days"),
	p75Days: integer("p75_days"),
	computedAt: timestamp("computed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_trade_forecasts_trade_start").using("btree", table.tradeSlug.asc().nullsLast().op("date_ops"), table.predictedStart.asc().nullsLast().op("text_ops")).where(sql`(predicted_start IS NOT NULL)`),
	index("idx_trade_forecasts_trade_urgency").using("btree", table.tradeSlug.asc().nullsLast().op("text_ops"), table.urgency.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.permitNum, table.revisionNum],
			foreignColumns: [permits.permitNum, permits.revisionNum],
			name: "fk_forecasts_permit"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.permitNum, table.revisionNum, table.tradeSlug], name: "trade_forecasts_pkey"}),
	check("chk_forecast_confidence", sql`(confidence)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying])::text[])`),
	check("chk_forecast_urgency", sql`(urgency)::text = ANY ((ARRAY['unknown'::character varying, 'on_time'::character varying, 'upcoming'::character varying, 'imminent'::character varying, 'delayed'::character varying, 'overdue'::character varying, 'expired'::character varying])::text[])`),
]);

export const permits = pgTable("permits", {
	permitNum: varchar("permit_num", { length: 30 }).notNull(),
	revisionNum: varchar("revision_num", { length: 10 }).notNull(),
	permitType: varchar("permit_type", { length: 100 }),
	structureType: varchar("structure_type", { length: 100 }),
	work: varchar({ length: 200 }),
	streetNum: varchar("street_num", { length: 20 }),
	streetName: varchar("street_name", { length: 200 }),
	streetType: varchar("street_type", { length: 20 }),
	streetDirection: varchar("street_direction", { length: 10 }),
	city: varchar({ length: 100 }),
	postal: varchar({ length: 10 }),
	geoId: varchar("geo_id", { length: 30 }),
	buildingType: varchar("building_type", { length: 100 }),
	category: varchar({ length: 100 }),
	applicationDate: date("application_date"),
	issuedDate: date("issued_date"),
	completedDate: date("completed_date"),
	status: varchar({ length: 50 }),
	description: text(),
	estConstCost: numeric("est_const_cost", { precision: 15, scale:  2 }),
	builderName: varchar("builder_name", { length: 500 }),
	owner: varchar({ length: 500 }),
	dwellingUnitsCreated: integer("dwelling_units_created"),
	dwellingUnitsLost: integer("dwelling_units_lost"),
	ward: varchar({ length: 20 }),
	councilDistrict: varchar("council_district", { length: 50 }),
	currentUse: varchar("current_use", { length: 200 }),
	proposedUse: varchar("proposed_use", { length: 200 }),
	housingUnits: integer("housing_units"),
	storeys: integer(),
	latitude: numeric({ precision: 10, scale:  7 }),
	longitude: numeric({ precision: 10, scale:  7 }),
	geocodedAt: timestamp("geocoded_at", { withTimezone: true, mode: 'string' }),
	dataHash: varchar("data_hash", { length: 64 }),
	firstSeenAt: timestamp("first_seen_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	rawJson: jsonb("raw_json"),
	neighbourhoodId: integer("neighbourhood_id"),
	projectType: varchar("project_type", { length: 20 }),
	scopeTags: text("scope_tags").array(),
	scopeClassifiedAt: timestamp("scope_classified_at", { withTimezone: true, mode: 'string' }),
	scopeSource: varchar("scope_source", { length: 20 }).default('classified'),
	enrichedStatus: varchar("enriched_status", { length: 30 }).default(sql`NULL`),
	streetNameNormalized: varchar("street_name_normalized"),
	lastScrapedAt: timestamp("last_scraped_at", { withTimezone: true, mode: 'string' }),
	tradeClassifiedAt: timestamp("trade_classified_at", { withTimezone: true, mode: 'string' }),
	parcelLinkedAt: timestamp("parcel_linked_at", { withTimezone: true, mode: 'string' }),
	photoUrl: text("photo_url"),
	location: geometry({ type: "point", srid: 4326 }),
	lifecyclePhase: varchar("lifecycle_phase", { length: 10 }).default(sql`NULL`),
	lifecycleStalled: boolean("lifecycle_stalled").default(false).notNull(),
	lifecycleClassifiedAt: timestamp("lifecycle_classified_at", { withTimezone: true, mode: 'string' }),
	phaseStartedAt: timestamp("phase_started_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_permits_addr_normalized").using("btree", table.streetNum.asc().nullsLast().op("text_ops"), table.streetNameNormalized.asc().nullsLast().op("text_ops")).where(sql`(street_name_normalized IS NOT NULL)`),
	index("idx_permits_application_date").using("btree", table.applicationDate.asc().nullsLast().op("date_ops")),
	index("idx_permits_builder_name").using("btree", table.builderName.asc().nullsLast().op("text_ops")),
	index("idx_permits_data_hash").using("btree", table.dataHash.asc().nullsLast().op("text_ops")),
	index("idx_permits_description_fts").using("gin", sql`to_tsvector('english'::regconfig, COALESCE(description, ''::tex`),
	index("idx_permits_enriched_active").using("btree", table.permitNum.asc().nullsLast().op("text_ops")).where(sql`((enriched_status)::text = 'Active Inspection'::text)`),
	index("idx_permits_enriched_status_scrape").using("btree", table.issuedDate.desc().nullsFirst().op("date_ops")).where(sql`((enriched_status IS NULL) OR ((enriched_status)::text = ANY ((ARRAY['Permit Issued'::character varying, 'Active Inspection'::character varying, 'Not Passed'::character varying])::text[])))`),
	index("idx_permits_est_const_cost").using("btree", table.estConstCost.asc().nullsLast().op("numeric_ops")),
	index("idx_permits_issued_date").using("btree", table.issuedDate.asc().nullsLast().op("date_ops")),
	index("idx_permits_last_scraped_at").using("btree", table.lastScrapedAt.asc().nullsLast().op("timestamptz_ops")).where(sql`(last_scraped_at IS NOT NULL)`),
	index("idx_permits_lifecycle_dirty").using("btree", table.permitNum.asc().nullsLast().op("text_ops")).where(sql`(lifecycle_classified_at IS NULL)`),
	index("idx_permits_lifecycle_phase").using("btree", table.lifecyclePhase.asc().nullsLast().op("text_ops")).where(sql`(lifecycle_phase IS NOT NULL)`),
	index("idx_permits_location_geography_gist").using("gist", sql`((location)::geography)`),
	index("idx_permits_location_gist").using("gist", table.location.asc().nullsLast().op("gist_geometry_ops_2d")),
	index("idx_permits_neighbourhood_id").using("btree", table.neighbourhoodId.asc().nullsLast().op("int4_ops")),
	index("idx_permits_permit_type").using("btree", table.permitType.asc().nullsLast().op("text_ops")),
	index("idx_permits_project_type").using("btree", table.projectType.asc().nullsLast().op("text_ops")).where(sql`(project_type IS NOT NULL)`),
	index("idx_permits_scope_tags").using("gin", table.scopeTags.asc().nullsLast().op("array_ops")).where(sql`(scope_tags IS NOT NULL)`),
	index("idx_permits_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_permits_street_name_normalized").using("btree", table.streetNameNormalized.asc().nullsLast().op("text_ops")).where(sql`(street_name_normalized IS NOT NULL)`),
	index("idx_permits_ward").using("btree", table.ward.asc().nullsLast().op("text_ops")),
	primaryKey({ columns: [table.permitNum, table.revisionNum], name: "permits_pkey"}),
]);
export const mvMonthlyPermitStats = pgMaterializedView("mv_monthly_permit_stats", {	month: date(),
	permitType: varchar("permit_type", { length: 100 }),
	permitCount: integer("permit_count"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	totalValue: bigint("total_value", { mode: "number" }),
}).as(sql`SELECT date_trunc('month'::text, issued_date::timestamp with time zone)::date AS month, permit_type, count(*)::integer AS permit_count, COALESCE(sum(est_const_cost), 0::numeric)::bigint AS total_value FROM permits WHERE issued_date IS NOT NULL GROUP BY (date_trunc('month'::text, issued_date::timestamp with time zone)), permit_type`);