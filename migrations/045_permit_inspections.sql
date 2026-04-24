-- Migration 045: permit_inspections table for AIC portal inspection stages
-- Spec: docs/specs/38_inspection_scraping.md

-- UP
CREATE TABLE IF NOT EXISTS permit_inspections (
  id             SERIAL PRIMARY KEY,
  permit_num     VARCHAR(30) NOT NULL,
  stage_name     TEXT NOT NULL,
  status         VARCHAR(20) NOT NULL,
  inspection_date DATE,
  scraped_at     TIMESTAMP NOT NULL DEFAULT now(),
  created_at     TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT uq_permit_inspection UNIQUE (permit_num, stage_name)
);

CREATE INDEX IF NOT EXISTS idx_permit_inspections_permit_num
  ON permit_inspections (permit_num);

CREATE INDEX IF NOT EXISTS idx_permit_inspections_outstanding
  ON permit_inspections (permit_num)
  WHERE status = 'Outstanding';

-- DOWN
DROP INDEX IF EXISTS idx_permit_inspections_outstanding;
DROP INDEX IF EXISTS idx_permit_inspections_permit_num;
DROP TABLE IF EXISTS permit_inspections;
