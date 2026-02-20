-- 009_coa_applications.sql
-- Committee of Adjustment applications, optionally linked to permits.

CREATE TABLE IF NOT EXISTS coa_applications (
    id                  SERIAL          PRIMARY KEY,
    application_number  VARCHAR(50)     UNIQUE,
    address             VARCHAR(500),
    street_num          VARCHAR(20),
    street_name         VARCHAR(200),
    ward                VARCHAR(10),
    status              VARCHAR(50),
    decision            VARCHAR(50),
    decision_date       DATE,
    hearing_date        DATE,
    description         TEXT,
    applicant           VARCHAR(500),
    linked_permit_num   VARCHAR(30),
    linked_confidence   DECIMAL(3,2),
    data_hash           VARCHAR(64),
    first_seen_at       TIMESTAMP       NOT NULL DEFAULT NOW(),
    last_seen_at        TIMESTAMP       NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coa_applications_address
    ON coa_applications (address);

CREATE INDEX IF NOT EXISTS idx_coa_applications_ward
    ON coa_applications (ward);

CREATE INDEX IF NOT EXISTS idx_coa_applications_linked_permit
    ON coa_applications (linked_permit_num);
