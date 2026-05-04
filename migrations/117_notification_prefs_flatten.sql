-- Migration 117: flatten user_profiles.notification_prefs JSONB → 5 atomic columns
-- SPEC LINK: docs/specs/03-mobile/99_mobile_state_architecture.md §9.14
--            docs/specs/03-mobile/92_mobile_engagement_hardware.md §2.3
--            docs/specs/03-mobile/95_mobile_user_profiles.md §6
--
-- Replaces the JSONB notification_prefs column (added in migration 108) with
-- 5 sibling columns: 3 booleans + 2 enum-checked text columns. Eliminates the
-- mobile `fast-deep-equal` hot path in userProfileStore.hydrate() — flat
-- primitive fields compare via Object.is — and removes the JSONB merge
-- (`COALESCE(notification_prefs, '{}'::jsonb) || $::jsonb`) syntax from
-- API routes and the lifecycle-classifier push-dispatch script.
--
-- Naming note: the user-pref column is named `lifecycle_stalled_pref`, not
-- `lifecycle_stalled`, to avoid silent ambiguity in pipeline SELECTs that
-- join `permits` (where `lifecycle_stalled` is a derived classification of
-- the progress of a permit) with `user_profiles`. The mobile-side store field
-- stays `lifecycleStalled` — no naming collision in the mobile bundle.
--
-- Backfill strategy: every user has a NOT NULL DEFAULT JSONB at this point
-- (per migration 108), so the JSONB extracts will produce a value for every
-- row. The COALESCE wrappers guard against any row that was force-cleared
-- to NULL post-migration-108 (defensive — none observed in production).
--
-- Row count is small (one row per user, < 10K projected). Single-statement
-- ALTER TABLE ADD COLUMN ... DEFAULT ... is fast at this scale.
--
-- This migration is destructive (DROP COLUMN at the end) — `-- ALLOW-DESTRUCTIVE`
-- marker required by validate-migration.js Rule 1 (scoped to UP block).

-- ============================================================
-- UP
-- ============================================================

-- ALLOW-DESTRUCTIVE: the final ALTER TABLE drops the JSONB column after
-- the data has been backfilled into the 5 new sibling columns.

-- Step 1: ADD the 5 atomic columns with safe defaults matching the JSONB
-- defaults from migration 108. NOT NULL is safe because of the DEFAULT.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS new_lead_min_cost_tier TEXT NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS phase_changed BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS lifecycle_stalled_pref BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS start_date_urgent BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notification_schedule TEXT NOT NULL DEFAULT 'anytime';

-- Step 2: BACKFILL from JSONB. Defensive CASE wrappers per WF2 §9.14
-- adversarial review (Gemini + DeepSeek + code-reviewer consensus):
--
--  (a) Boolean cast safety — `(jsonb ->> 'k')::boolean` throws
--      `invalid input syntax` on any non-canonical scalar (e.g., a stray
--      `'1'`/`'yes'`/`''` from a past hand-edit). CASE on the canonical
--      strings avoids the unconditional cast.
--
--  (b) Enum sanitization — Spec 99 §9.14 reconciled the cost-tier enum
--      from a divergent 5-value set (`small/medium/large/major/mega`,
--      previously accepted by `notifications/preferences/route.ts` Zod
--      only — never written through `userProfile.schema.ts`). Reviewers
--      flagged that ANY non-canonical value in the JSONB (whether from
--      the divergent route, hand-edits, or future drift) would survive
--      COALESCE, then fail the CHECK constraint added in Step 3 and
--      abort the entire migration. The CASE projection maps known
--      legacy values to their nearest canonical equivalent and
--      defaults the rest, so the CHECK can never fail at constraint-
--      add time.
UPDATE user_profiles
SET
  new_lead_min_cost_tier = CASE notification_prefs ->> 'new_lead_min_cost_tier'
    WHEN 'low'    THEN 'low'
    WHEN 'medium' THEN 'medium'
    WHEN 'high'   THEN 'high'
    -- Legacy 5-value enum projection (defensive — see comment above):
    WHEN 'small'  THEN 'low'
    WHEN 'large'  THEN 'high'
    WHEN 'major'  THEN 'high'
    WHEN 'mega'   THEN 'high'
    ELSE 'medium'
  END,
  phase_changed = CASE notification_prefs ->> 'phase_changed'
    WHEN 'true'  THEN TRUE
    WHEN 'false' THEN FALSE
    ELSE TRUE
  END,
  lifecycle_stalled_pref = CASE notification_prefs ->> 'lifecycle_stalled'
    WHEN 'true'  THEN TRUE
    WHEN 'false' THEN FALSE
    ELSE TRUE
  END,
  start_date_urgent = CASE notification_prefs ->> 'start_date_urgent'
    WHEN 'true'  THEN TRUE
    WHEN 'false' THEN FALSE
    ELSE TRUE
  END,
  notification_schedule = CASE notification_prefs ->> 'notification_schedule'
    WHEN 'morning'  THEN 'morning'
    WHEN 'anytime'  THEN 'anytime'
    WHEN 'evening'  THEN 'evening'
    ELSE 'anytime'
  END
WHERE notification_prefs IS NOT NULL;

-- Step 3: ADD CHECK constraints to enforce the canonical enum values. Safe
-- because the Step 2 CASE projections guarantee every row was written with
-- a value from the canonical set.
ALTER TABLE user_profiles
  ADD CONSTRAINT chk_new_lead_min_cost_tier
    CHECK (new_lead_min_cost_tier IN ('low', 'medium', 'high')),
  ADD CONSTRAINT chk_notification_schedule
    CHECK (notification_schedule IN ('morning', 'anytime', 'evening'));

-- Step 4: DROP the JSONB column. Forward-only — there is no rollback path
-- once this commits because the JSONB is gone.
ALTER TABLE user_profiles DROP COLUMN IF EXISTS notification_prefs;

-- ============================================================
-- DOWN
-- ============================================================
-- (commented out — scripts/migrate.js executes the entire file as one transaction
-- and does NOT respect `-- DOWN` as a section marker. Uncommenting any line below
-- would cause the migration's UP work to be immediately reversed. See
-- tasks/lessons.md "migration runner UP/DOWN convention" for the full context.)
--
-- Rollback would require:
--   ALTER TABLE user_profiles ADD COLUMN notification_prefs JSONB NOT NULL DEFAULT
--     '{"new_lead_min_cost_tier": "medium", "phase_changed": true,
--       "lifecycle_stalled": true, "start_date_urgent": true,
--       "notification_schedule": "anytime"}'::jsonb;
--   UPDATE user_profiles SET notification_prefs = jsonb_build_object(
--     'new_lead_min_cost_tier', new_lead_min_cost_tier,
--     'phase_changed', phase_changed,
--     'lifecycle_stalled', lifecycle_stalled_pref,
--     'start_date_urgent', start_date_urgent,
--     'notification_schedule', notification_schedule);
--   ALTER TABLE user_profiles
--     DROP CONSTRAINT chk_new_lead_min_cost_tier,
--     DROP CONSTRAINT chk_notification_schedule,
--     DROP COLUMN new_lead_min_cost_tier,
--     DROP COLUMN phase_changed,
--     DROP COLUMN lifecycle_stalled_pref,
--     DROP COLUMN start_date_urgent,
--     DROP COLUMN notification_schedule;
