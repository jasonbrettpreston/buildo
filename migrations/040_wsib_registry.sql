-- Migration 040: WSIB Registry table for Class G construction businesses
-- Source: WSIB Open Data "Businesses classification details" annual CSV
-- CONCURRENTLY-EXEMPT: indexes created before CONCURRENTLY was required; table was empty at migration time.

-- UP
CREATE TABLE IF NOT EXISTS wsib_registry (
    id                    SERIAL PRIMARY KEY,
    legal_name            VARCHAR(500) NOT NULL,
    trade_name            VARCHAR(500),
    legal_name_normalized VARCHAR(500) NOT NULL,
    trade_name_normalized VARCHAR(500),
    mailing_address       VARCHAR(500),
    predominant_class     VARCHAR(10) NOT NULL,
    naics_code            VARCHAR(20),
    naics_description     VARCHAR(500),
    subclass              VARCHAR(50),
    subclass_description  TEXT,
    business_size         VARCHAR(100),
    linked_builder_id     INTEGER REFERENCES builders(id) ON DELETE SET NULL,
    match_confidence      NUMERIC(3,2),
    matched_at            TIMESTAMP,
    first_seen_at         TIMESTAMP NOT NULL DEFAULT NOW(),
    last_seen_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(legal_name_normalized, mailing_address)
);

CREATE INDEX idx_wsib_trade_norm ON wsib_registry(trade_name_normalized);
CREATE INDEX idx_wsib_legal_norm ON wsib_registry(legal_name_normalized);
CREATE INDEX idx_wsib_class ON wsib_registry(predominant_class);
CREATE INDEX idx_wsib_linked ON wsib_registry(linked_builder_id) WHERE linked_builder_id IS NOT NULL;

-- DOWN
-- DROP TABLE IF EXISTS wsib_registry;
