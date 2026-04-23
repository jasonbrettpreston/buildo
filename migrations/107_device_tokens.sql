-- Migration 107 — device_tokens
-- SPEC LINK: docs/specs/03-mobile/92_mobile_engagement_hardware.md §3 Payload Schema
--
-- Stores Expo push tokens for mobile notification dispatch.
-- user_id mirrors the VARCHAR(128) width of user_profiles for consistency.
-- UNIQUE(user_id, push_token) prevents duplicate rows for the same device —
-- the register API upserts on this constraint.

-- UP
CREATE TABLE device_tokens (
  id          SERIAL PRIMARY KEY,
  user_id     VARCHAR(128)  NOT NULL,
  push_token  TEXT          NOT NULL,
  platform    VARCHAR(10)   CHECK (platform IN ('ios', 'android')),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, push_token)
);

CREATE INDEX idx_device_tokens_user_id ON device_tokens (user_id);

-- DOWN
-- ALLOW-DESTRUCTIVE
-- DROP TABLE IF EXISTS device_tokens;
