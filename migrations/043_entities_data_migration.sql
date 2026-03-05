-- Migration 043: Data migration from builders → entities + backfill entity_projects
-- Spec: docs/specs/37_corporate_identity_hub.md

-- Step 1: Migrate existing builders → entities
INSERT INTO entities (legal_name, trade_name, name_normalized, primary_phone, primary_email, website,
                      google_place_id, google_rating, google_review_count,
                      permit_count, first_seen_at, last_seen_at, last_enriched_at)
SELECT name, NULL, name_normalized, phone, email, website,
       google_place_id, google_rating, google_review_count,
       permit_count, first_seen_at, last_seen_at, enriched_at
FROM builders
ON CONFLICT (name_normalized) DO NOTHING;

-- Step 2: Backfill entity_projects from permits (Builder role)
INSERT INTO entity_projects (entity_id, permit_num, revision_num, role)
SELECT DISTINCT e.id, p.permit_num, p.revision_num, 'Builder'::project_role_enum
FROM permits p
JOIN entities e ON e.name_normalized = UPPER(REGEXP_REPLACE(TRIM(p.builder_name), '\s+', ' ', 'g'))
WHERE p.builder_name IS NOT NULL AND TRIM(p.builder_name) != ''
ON CONFLICT DO NOTHING;

-- Step 3: Upsert CoA applicants into entities
INSERT INTO entities (legal_name, name_normalized, first_seen_at, last_seen_at)
SELECT DISTINCT ON (UPPER(REGEXP_REPLACE(TRIM(applicant), '\s+', ' ', 'g')))
       applicant,
       UPPER(REGEXP_REPLACE(TRIM(applicant), '\s+', ' ', 'g')),
       MIN(first_seen_at) OVER (PARTITION BY UPPER(REGEXP_REPLACE(TRIM(applicant), '\s+', ' ', 'g'))),
       MAX(last_seen_at) OVER (PARTITION BY UPPER(REGEXP_REPLACE(TRIM(applicant), '\s+', ' ', 'g')))
FROM coa_applications
WHERE applicant IS NOT NULL AND TRIM(applicant) != ''
ON CONFLICT (name_normalized) DO UPDATE SET last_seen_at = GREATEST(entities.last_seen_at, EXCLUDED.last_seen_at);

-- Step 4: Backfill entity_projects from CoA applications (Applicant role)
INSERT INTO entity_projects (entity_id, coa_file_num, role)
SELECT DISTINCT e.id, c.application_number, 'Applicant'::project_role_enum
FROM coa_applications c
JOIN entities e ON e.name_normalized = UPPER(REGEXP_REPLACE(TRIM(c.applicant), '\s+', ' ', 'g'))
WHERE c.applicant IS NOT NULL AND TRIM(c.applicant) != ''
ON CONFLICT DO NOTHING;
