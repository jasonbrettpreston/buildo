-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE "permit_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"permit_num" varchar(30) NOT NULL,
	"revision_num" varchar(10) NOT NULL,
	"sync_run_id" integer,
	"field_name" varchar(100) NOT NULL,
	"old_value" text,
	"new_value" text,
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"status" varchar(20) DEFAULT 'running' NOT NULL,
	"records_total" integer DEFAULT 0 NOT NULL,
	"records_new" integer DEFAULT 0 NOT NULL,
	"records_updated" integer DEFAULT 0 NOT NULL,
	"records_unchanged" integer DEFAULT 0 NOT NULL,
	"records_errors" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"snapshot_path" varchar(500),
	"duration_ms" integer
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"icon" varchar(50),
	"color" varchar(7),
	"sort_order" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "trades_slug_key" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "trade_mapping_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"trade_id" integer NOT NULL,
	"tier" integer NOT NULL,
	"match_field" varchar(50) NOT NULL,
	"match_pattern" varchar(500) NOT NULL,
	"confidence" numeric(3, 2) NOT NULL,
	"phase_start" integer,
	"phase_end" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "trade_mapping_rules_tier_check" CHECK (tier = ANY (ARRAY[1, 2, 3])),
	CONSTRAINT "trade_mapping_rules_confidence_check" CHECK ((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))
);
--> statement-breakpoint
CREATE TABLE "permit_trades" (
	"id" serial PRIMARY KEY NOT NULL,
	"permit_num" varchar(30) NOT NULL,
	"revision_num" varchar(10) NOT NULL,
	"trade_id" integer NOT NULL,
	"tier" integer,
	"confidence" numeric(3, 2),
	"is_active" boolean DEFAULT true NOT NULL,
	"phase" varchar(20),
	"lead_score" integer DEFAULT 0 NOT NULL,
	"classified_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "permit_trades_permit_num_revision_num_trade_id_key" UNIQUE("permit_num","revision_num","trade_id")
);
--> statement-breakpoint
CREATE TABLE "builders" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(500) NOT NULL,
	"name_normalized" varchar(500) NOT NULL,
	"phone" varchar(50),
	"email" varchar(200),
	"website" varchar(500),
	"google_place_id" varchar(200),
	"google_rating" numeric(2, 1),
	"google_review_count" integer,
	"obr_business_number" varchar(50),
	"wsib_status" varchar(50),
	"permit_count" integer DEFAULT 0 NOT NULL,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"enriched_at" timestamp,
	CONSTRAINT "builders_name_normalized_key" UNIQUE("name_normalized")
);
--> statement-breakpoint
CREATE TABLE "builder_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"builder_id" integer NOT NULL,
	"contact_type" varchar(20),
	"contact_value" varchar(500),
	"source" varchar(50) DEFAULT 'user' NOT NULL,
	"contributed_by" varchar(100),
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coa_applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"application_number" varchar(50),
	"address" varchar(500),
	"street_num" varchar(20),
	"street_name" varchar(200),
	"ward" varchar(10),
	"status" varchar(50),
	"decision" varchar(50),
	"decision_date" date,
	"hearing_date" date,
	"description" text,
	"applicant" varchar(500),
	"linked_permit_num" varchar(30),
	"linked_confidence" numeric(3, 2),
	"data_hash" varchar(64),
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"sub_type" text,
	CONSTRAINT "coa_applications_application_number_key" UNIQUE("application_number")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(100) NOT NULL,
	"type" varchar(50) NOT NULL,
	"title" varchar(200),
	"body" text,
	"permit_num" varchar(30),
	"trade_slug" varchar(50),
	"channel" varchar(20) DEFAULT 'in_app' NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"is_sent" boolean DEFAULT false NOT NULL,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permit_parcels" (
	"id" serial PRIMARY KEY NOT NULL,
	"permit_num" varchar(30) NOT NULL,
	"revision_num" varchar(10) NOT NULL,
	"parcel_id" integer NOT NULL,
	"match_type" varchar(30) NOT NULL,
	"confidence" numeric(3, 2) NOT NULL,
	"linked_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "permit_parcels_permit_num_revision_num_parcel_id_key" UNIQUE("parcel_id","permit_num","revision_num")
);
--> statement-breakpoint
CREATE TABLE "neighbourhoods" (
	"id" serial PRIMARY KEY NOT NULL,
	"neighbourhood_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"geometry" jsonb,
	"avg_household_income" integer,
	"median_household_income" integer,
	"avg_individual_income" integer,
	"low_income_pct" numeric(5, 2),
	"tenure_owner_pct" numeric(5, 2),
	"tenure_renter_pct" numeric(5, 2),
	"period_of_construction" varchar(50),
	"couples_pct" numeric(5, 2),
	"lone_parent_pct" numeric(5, 2),
	"married_pct" numeric(5, 2),
	"university_degree_pct" numeric(5, 2),
	"immigrant_pct" numeric(5, 2),
	"visible_minority_pct" numeric(5, 2),
	"english_knowledge_pct" numeric(5, 2),
	"top_mother_tongue" varchar(50),
	"census_year" integer DEFAULT 2021,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "neighbourhoods_neighbourhood_id_key" UNIQUE("neighbourhood_id")
);
--> statement-breakpoint
CREATE TABLE "parcels" (
	"id" serial PRIMARY KEY NOT NULL,
	"parcel_id" varchar(20) NOT NULL,
	"feature_type" varchar(20),
	"address_number" varchar(20),
	"linear_name_full" varchar(200),
	"addr_num_normalized" varchar(20),
	"street_name_normalized" varchar(200),
	"street_type_normalized" varchar(20),
	"stated_area_raw" varchar(100),
	"lot_size_sqm" numeric(12, 2),
	"lot_size_sqft" numeric(12, 2),
	"frontage_m" numeric(8, 2),
	"frontage_ft" numeric(8, 2),
	"depth_m" numeric(8, 2),
	"depth_ft" numeric(8, 2),
	"geometry" jsonb,
	"date_effective" date,
	"date_expiry" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"centroid_lat" numeric(10, 7),
	"centroid_lng" numeric(10, 7),
	"is_irregular" boolean DEFAULT false,
	CONSTRAINT "parcels_parcel_id_key" UNIQUE("parcel_id")
);
--> statement-breakpoint
CREATE TABLE "address_points" (
	"address_point_id" integer PRIMARY KEY NOT NULL,
	"latitude" numeric(10, 7) NOT NULL,
	"longitude" numeric(10, 7) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"pipeline" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"records_total" integer DEFAULT 0,
	"records_new" integer DEFAULT 0,
	"records_updated" integer DEFAULT 0,
	"error_message" text,
	"duration_ms" integer
);
--> statement-breakpoint
CREATE TABLE "building_footprints" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" varchar(50) NOT NULL,
	"geometry" jsonb NOT NULL,
	"footprint_area_sqm" numeric(12, 2),
	"footprint_area_sqft" numeric(12, 2),
	"max_height_m" numeric(8, 2),
	"min_height_m" numeric(8, 2),
	"elev_z" numeric(8, 2),
	"estimated_stories" integer,
	"centroid_lat" numeric(10, 7),
	"centroid_lng" numeric(10, 7),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "building_footprints_source_id_key" UNIQUE("source_id")
);
--> statement-breakpoint
CREATE TABLE "parcel_buildings" (
	"id" serial PRIMARY KEY NOT NULL,
	"parcel_id" integer NOT NULL,
	"building_id" integer NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"structure_type" varchar(20) DEFAULT 'other' NOT NULL,
	"linked_at" timestamp DEFAULT now() NOT NULL,
	"match_type" varchar(30) DEFAULT 'polygon' NOT NULL,
	"confidence" numeric(3, 2) DEFAULT '0.85' NOT NULL,
	CONSTRAINT "parcel_buildings_parcel_id_building_id_key" UNIQUE("building_id","parcel_id")
);
--> statement-breakpoint
CREATE TABLE "data_quality_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"snapshot_date" date DEFAULT CURRENT_DATE NOT NULL,
	"total_permits" integer NOT NULL,
	"active_permits" integer NOT NULL,
	"permits_with_trades" integer NOT NULL,
	"trade_matches_total" integer NOT NULL,
	"trade_avg_confidence" numeric(4, 3),
	"trade_tier1_count" integer NOT NULL,
	"trade_tier2_count" integer NOT NULL,
	"trade_tier3_count" integer NOT NULL,
	"permits_with_builder" integer NOT NULL,
	"builders_total" integer NOT NULL,
	"builders_enriched" integer NOT NULL,
	"builders_with_phone" integer NOT NULL,
	"builders_with_email" integer NOT NULL,
	"builders_with_website" integer NOT NULL,
	"builders_with_google" integer NOT NULL,
	"builders_with_wsib" integer NOT NULL,
	"permits_with_parcel" integer NOT NULL,
	"parcel_exact_matches" integer NOT NULL,
	"parcel_name_matches" integer NOT NULL,
	"parcel_avg_confidence" numeric(4, 3),
	"permits_with_neighbourhood" integer NOT NULL,
	"permits_geocoded" integer NOT NULL,
	"coa_total" integer NOT NULL,
	"coa_linked" integer NOT NULL,
	"coa_avg_confidence" numeric(4, 3),
	"coa_high_confidence" integer NOT NULL,
	"coa_low_confidence" integer NOT NULL,
	"permits_updated_24h" integer NOT NULL,
	"permits_updated_7d" integer NOT NULL,
	"permits_updated_30d" integer NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_sync_status" varchar(20),
	"created_at" timestamp with time zone DEFAULT now(),
	"parcel_spatial_matches" integer DEFAULT 0,
	"permits_with_scope" integer DEFAULT 0,
	"scope_project_type_breakdown" jsonb,
	"building_footprints_total" integer DEFAULT 0 NOT NULL,
	"parcels_with_buildings" integer DEFAULT 0 NOT NULL,
	"permits_with_scope_tags" integer DEFAULT 0,
	"scope_tags_top" jsonb,
	"permits_with_detailed_tags" integer DEFAULT 0,
	"trade_residential_classified" integer DEFAULT 0,
	"trade_residential_total" integer DEFAULT 0,
	"trade_commercial_classified" integer DEFAULT 0,
	"trade_commercial_total" integer DEFAULT 0,
	CONSTRAINT "data_quality_snapshots_snapshot_date_key" UNIQUE("snapshot_date")
);
--> statement-breakpoint
CREATE TABLE "permits" (
	"permit_num" varchar(30) NOT NULL,
	"revision_num" varchar(10) NOT NULL,
	"permit_type" varchar(100),
	"structure_type" varchar(100),
	"work" varchar(200),
	"street_num" varchar(20),
	"street_name" varchar(200),
	"street_type" varchar(20),
	"street_direction" varchar(10),
	"city" varchar(100),
	"postal" varchar(10),
	"geo_id" varchar(30),
	"building_type" varchar(100),
	"category" varchar(100),
	"application_date" date,
	"issued_date" date,
	"completed_date" date,
	"status" varchar(50),
	"description" text,
	"est_const_cost" numeric(15, 2),
	"builder_name" varchar(500),
	"owner" varchar(500),
	"dwelling_units_created" integer,
	"dwelling_units_lost" integer,
	"ward" varchar(20),
	"council_district" varchar(50),
	"current_use" varchar(200),
	"proposed_use" varchar(200),
	"housing_units" integer,
	"storeys" integer,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"geocoded_at" timestamp,
	"data_hash" varchar(64),
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"raw_json" jsonb,
	"neighbourhood_id" integer,
	"project_type" varchar(20),
	"scope_tags" text[],
	"scope_classified_at" timestamp with time zone,
	"scope_source" varchar(20) DEFAULT 'classified',
	CONSTRAINT "permits_pkey" PRIMARY KEY("permit_num","revision_num")
);
--> statement-breakpoint
ALTER TABLE "trade_mapping_rules" ADD CONSTRAINT "trade_mapping_rules_trade_id_fkey" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permit_trades" ADD CONSTRAINT "permit_trades_trade_id_fkey" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "builder_contacts" ADD CONSTRAINT "builder_contacts_builder_id_fkey" FOREIGN KEY ("builder_id") REFERENCES "public"."builders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permit_parcels" ADD CONSTRAINT "permit_parcels_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "public"."parcels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcel_buildings" ADD CONSTRAINT "parcel_buildings_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "public"."parcels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcel_buildings" ADD CONSTRAINT "parcel_buildings_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "public"."building_footprints"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_permit_history_permit" ON "permit_history" USING btree ("permit_num" text_ops,"revision_num" text_ops);--> statement-breakpoint
CREATE INDEX "idx_permit_history_sync_run" ON "permit_history" USING btree ("sync_run_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_trade_mapping_rules_tier" ON "trade_mapping_rules" USING btree ("tier" int4_ops,"is_active" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_trade_mapping_rules_trade" ON "trade_mapping_rules" USING btree ("trade_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_permit_trades_active" ON "permit_trades" USING btree ("is_active" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_permit_trades_lead_score" ON "permit_trades" USING btree ("lead_score" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_permit_trades_permit" ON "permit_trades" USING btree ("permit_num" text_ops,"revision_num" text_ops);--> statement-breakpoint
CREATE INDEX "idx_permit_trades_trade" ON "permit_trades" USING btree ("trade_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_builders_name_normalized" ON "builders" USING btree ("name_normalized" text_ops);--> statement-breakpoint
CREATE INDEX "idx_builders_permit_count" ON "builders" USING btree ("permit_count" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_builder_contacts_builder" ON "builder_contacts" USING btree ("builder_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_builder_contacts_type" ON "builder_contacts" USING btree ("contact_type" text_ops);--> statement-breakpoint
CREATE INDEX "idx_coa_applications_address" ON "coa_applications" USING btree ("address" text_ops);--> statement-breakpoint
CREATE INDEX "idx_coa_applications_linked_permit" ON "coa_applications" USING btree ("linked_permit_num" text_ops);--> statement-breakpoint
CREATE INDEX "idx_coa_applications_ward" ON "coa_applications" USING btree ("ward" text_ops);--> statement-breakpoint
CREATE INDEX "idx_coa_decision_date" ON "coa_applications" USING btree ("decision_date" date_ops);--> statement-breakpoint
CREATE INDEX "idx_coa_upcoming_leads" ON "coa_applications" USING btree ("decision_date" date_ops) WHERE (((decision)::text = ANY ((ARRAY['Approved'::character varying, 'Approved with Conditions'::character varying])::text[])) AND (linked_permit_num IS NULL));--> statement-breakpoint
CREATE INDEX "idx_notifications_user_created" ON "notifications" USING btree ("user_id" timestamp_ops,"created_at" text_ops);--> statement-breakpoint
CREATE INDEX "idx_notifications_user_read" ON "notifications" USING btree ("user_id" bool_ops,"is_read" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_permit_parcels_parcel" ON "permit_parcels" USING btree ("parcel_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_permit_parcels_permit" ON "permit_parcels" USING btree ("permit_num" text_ops,"revision_num" text_ops);--> statement-breakpoint
CREATE INDEX "idx_neighbourhoods_nid" ON "neighbourhoods" USING btree ("neighbourhood_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_parcels_address" ON "parcels" USING btree ("addr_num_normalized" text_ops,"street_name_normalized" text_ops);--> statement-breakpoint
CREATE INDEX "idx_parcels_centroid" ON "parcels" USING btree ("centroid_lat" numeric_ops,"centroid_lng" numeric_ops) WHERE (centroid_lat IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_parcels_feature_type" ON "parcels" USING btree ("feature_type" text_ops);--> statement-breakpoint
CREATE INDEX "idx_parcels_street_name" ON "parcels" USING btree ("street_name_normalized" text_ops);--> statement-breakpoint
CREATE INDEX "idx_pipeline_runs_lookup" ON "pipeline_runs" USING btree ("pipeline" text_ops,"started_at" text_ops);--> statement-breakpoint
CREATE INDEX "idx_building_footprints_centroid" ON "building_footprints" USING btree ("centroid_lat" numeric_ops,"centroid_lng" numeric_ops);--> statement-breakpoint
CREATE INDEX "idx_building_footprints_source" ON "building_footprints" USING btree ("source_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_parcel_buildings_building" ON "parcel_buildings" USING btree ("building_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_parcel_buildings_parcel" ON "parcel_buildings" USING btree ("parcel_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_dqs_snapshot_date" ON "data_quality_snapshots" USING btree ("snapshot_date" date_ops);--> statement-breakpoint
CREATE INDEX "idx_permits_builder_name" ON "permits" USING btree ("builder_name" text_ops);--> statement-breakpoint
CREATE INDEX "idx_permits_data_hash" ON "permits" USING btree ("data_hash" text_ops);--> statement-breakpoint
CREATE INDEX "idx_permits_description_fts" ON "permits" USING gin (to_tsvector('english'::regconfig, COALESCE(description, ''::tex tsvector_ops);--> statement-breakpoint
CREATE INDEX "idx_permits_issued_date" ON "permits" USING btree ("issued_date" date_ops);--> statement-breakpoint
CREATE INDEX "idx_permits_neighbourhood_id" ON "permits" USING btree ("neighbourhood_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_permits_permit_type" ON "permits" USING btree ("permit_type" text_ops);--> statement-breakpoint
CREATE INDEX "idx_permits_project_type" ON "permits" USING btree ("project_type" text_ops) WHERE (project_type IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_permits_scope_tags" ON "permits" USING gin ("scope_tags" array_ops) WHERE (scope_tags IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_permits_status" ON "permits" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_permits_ward" ON "permits" USING btree ("ward" text_ops);--> statement-breakpoint
CREATE MATERIALIZED VIEW "public"."mv_monthly_permit_stats" AS (SELECT date_trunc('month'::text, issued_date::timestamp with time zone)::date AS month, permit_type, count(*)::integer AS permit_count, COALESCE(sum(est_const_cost), 0::numeric)::bigint AS total_value FROM permits WHERE issued_date IS NOT NULL GROUP BY (date_trunc('month'::text, issued_date::timestamp with time zone)), permit_type);
*/