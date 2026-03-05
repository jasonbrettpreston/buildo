-- Migration 042: Corporate Identity Hub — entities + entity_projects
-- Spec: docs/specs/37_corporate_identity_hub.md

-- Entity type classification
CREATE TYPE entity_type_enum AS ENUM ('Corporation', 'Individual');

-- Roles an entity can play on a project
CREATE TYPE project_role_enum AS ENUM ('Builder', 'Architect', 'Applicant', 'Owner', 'Agent', 'Engineer');

-- Unified entity hub (replaces builders table)
CREATE TABLE IF NOT EXISTS entities (
    id                  SERIAL PRIMARY KEY,
    legal_name          VARCHAR(500) NOT NULL,
    trade_name          VARCHAR(500),
    name_normalized     VARCHAR(750) NOT NULL UNIQUE,
    entity_type         entity_type_enum,
    primary_phone       VARCHAR(50),
    primary_email       VARCHAR(200),
    website             VARCHAR(500),
    linkedin_url        VARCHAR(500),
    google_place_id     VARCHAR(200),
    google_rating       DECIMAL(2,1),
    google_review_count INTEGER,
    is_wsib_registered  BOOLEAN DEFAULT false,
    permit_count        INTEGER NOT NULL DEFAULT 0,
    first_seen_at       TIMESTAMP NOT NULL DEFAULT NOW(),
    last_seen_at        TIMESTAMP NOT NULL DEFAULT NOW(),
    last_enriched_at    TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_entities_name_norm ON entities(name_normalized);
CREATE INDEX IF NOT EXISTS idx_entities_permit_count ON entities(permit_count DESC);

-- Junction table: entity ↔ project (permit or CoA) with role
CREATE TABLE IF NOT EXISTS entity_projects (
    id              SERIAL PRIMARY KEY,
    entity_id       INTEGER NOT NULL REFERENCES entities(id),
    permit_num      VARCHAR(50),
    revision_num    VARCHAR(10),
    coa_file_num    VARCHAR(50),
    role            project_role_enum NOT NULL,
    observed_at     TIMESTAMP DEFAULT NOW(),
    UNIQUE(entity_id, permit_num, revision_num, role),
    UNIQUE(entity_id, coa_file_num, role)
);

CREATE INDEX IF NOT EXISTS idx_entity_projects_entity ON entity_projects(entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_projects_permit ON entity_projects(permit_num, revision_num);
CREATE INDEX IF NOT EXISTS idx_entity_projects_coa ON entity_projects(coa_file_num) WHERE coa_file_num IS NOT NULL;
