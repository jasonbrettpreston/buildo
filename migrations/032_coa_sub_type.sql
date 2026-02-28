-- Migration 032: Add sub_type column to coa_applications
-- Separates SUB_TYPE data (e.g., "New Res dwellings <=3 Units") from applicant field.
-- Previously, SUB_TYPE was used as fallback when CONTACT_NAME was null, causing
-- application type strings to display as builder names.

ALTER TABLE coa_applications ADD COLUMN IF NOT EXISTS sub_type TEXT;

-- Backfill: move SUB_TYPE values from applicant to sub_type column
-- These patterns match known CKAN SUB_TYPE values that were incorrectly stored as applicant
UPDATE coa_applications
SET sub_type = applicant,
    applicant = NULL
WHERE applicant SIMILAR TO '%(dwellings|Existing Re|New Res|Add/Alt|Commercial|Industrial|Institutional|Detached|Semi-Det|Row House|Townhouse)%';
