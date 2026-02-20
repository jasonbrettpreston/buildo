CREATE TABLE IF NOT EXISTS neighbourhoods (
    id                      SERIAL PRIMARY KEY,
    neighbourhood_id        INTEGER UNIQUE NOT NULL,
    name                    VARCHAR(100) NOT NULL,
    geometry                JSONB,
    avg_household_income    INTEGER,
    median_household_income INTEGER,
    avg_individual_income   INTEGER,
    low_income_pct          DECIMAL(5,2),
    tenure_owner_pct        DECIMAL(5,2),
    tenure_renter_pct       DECIMAL(5,2),
    period_of_construction  VARCHAR(50),
    couples_pct             DECIMAL(5,2),
    lone_parent_pct         DECIMAL(5,2),
    married_pct             DECIMAL(5,2),
    university_degree_pct   DECIMAL(5,2),
    immigrant_pct           DECIMAL(5,2),
    visible_minority_pct    DECIMAL(5,2),
    english_knowledge_pct   DECIMAL(5,2),
    top_mother_tongue       VARCHAR(50),
    census_year             INTEGER DEFAULT 2021,
    created_at              TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_neighbourhoods_nid ON neighbourhoods(neighbourhood_id);
