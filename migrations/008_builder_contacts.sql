-- 008_builder_contacts.sql
-- User-contributed contact information for builders.

CREATE TABLE IF NOT EXISTS builder_contacts (
    id              SERIAL          PRIMARY KEY,
    builder_id      INTEGER         NOT NULL REFERENCES builders(id),
    contact_type    VARCHAR(20),
    contact_value   VARCHAR(500),
    source          VARCHAR(50)     NOT NULL DEFAULT 'user',
    contributed_by  VARCHAR(100),
    verified        BOOLEAN         NOT NULL DEFAULT false,
    created_at      TIMESTAMP       NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_builder_contacts_builder
    ON builder_contacts (builder_id);

CREATE INDEX IF NOT EXISTS idx_builder_contacts_type
    ON builder_contacts (contact_type);
