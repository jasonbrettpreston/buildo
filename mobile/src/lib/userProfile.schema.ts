// SPEC LINK: docs/specs/03-mobile/95_mobile_user_profiles.md §9 Step 5
//             docs/specs/03-mobile/99_mobile_state_architecture.md §2.1 (PII layer boundary)
//
// WF3 2026-05-04 hardening (review_followups.md mobile-PII bundle):
//
//  (1) `stripe_customer_id` REMOVED from this schema. Per Spec 99 §2.1
//      anything in this schema lands in TanStack Query's MMKV persister
//      (Layer 4a — UNENCRYPTED). PII MUST go through Layer 4b
//      (SecureStore/Keychain). The field has no mobile consumer
//      (verified by grep — only test fixtures and the schema itself
//      referenced it), and Spec 96 subscription flow handles the
//      customer-portal redirect server-side. The §9.13 drift script's
//      matching §3.1 row was also updated to remove the field.
//
//  (2) Zod refinements tightened for fields that previously had bare
//      types (`z.string()` for timestamps, bare `z.coerce.number()` for
//      coords, non-nullable `z.number().int()` for `lead_views_count`).
//      The schema is the boundary contract — a malformed server response
//      would have passed through and crashed downstream consumers
//      (paywall counter, map rendering on NaN coords, date pickers on
//      non-ISO timestamps).
import { z } from 'zod';

export const UserProfileSchema = z.object({
  user_id: z.string(),
  trade_slug: z.string().nullable(),
  display_name: z.string().nullable(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
  // Identity
  full_name: z.string().nullable(),
  phone_number: z.string().nullable(),
  company_name: z.string().nullable(),
  email: z.string().nullable(),
  backup_email: z.string().nullable(),
  // Profession / feed-scoping
  default_tab: z.enum(['feed', 'flight_board']).nullable(),
  location_mode: z.enum(['gps_live', 'home_base_fixed']).nullable(),
  // pg returns NUMERIC(9,6) as string → coerce to number, then bound-check.
  // The .refine for finiteness catches malformed strings (`Number("N/A")`
  // → NaN passes a bare `z.number()`).
  home_base_lat: z.coerce
    .number()
    .refine((n) => Number.isFinite(n), { message: 'home_base_lat must be a finite number' })
    .refine((n) => n >= -90 && n <= 90, { message: 'home_base_lat out of range' })
    .nullable(),
  home_base_lng: z.coerce
    .number()
    .refine((n) => Number.isFinite(n), { message: 'home_base_lng must be a finite number' })
    .refine((n) => n >= -180 && n <= 180, { message: 'home_base_lng out of range' })
    .nullable(),
  radius_km: z.number().int().nullable(),
  supplier_selection: z.string().nullable(),
  // Default 0 covers new accounts where the LEFT JOIN to lead_views
  // returns NULL — pre-WF3 this would have failed schema parse and
  // broken the entire settings screen.
  lead_views_count: z.number().int().nonnegative().nullable().default(0),
  // Subscription
  subscription_status: z
    .enum(['trial', 'active', 'past_due', 'expired', 'cancelled_pending_deletion', 'admin_managed'])
    .nullable(),
  trial_started_at: z.string().datetime({ offset: true }).nullable(),
  // stripe_customer_id INTENTIONALLY OMITTED — see header comment (1).
  // Account state
  onboarding_complete: z.boolean(),
  tos_accepted_at: z.string().datetime({ offset: true }).nullable(),
  account_deleted_at: z.string().datetime({ offset: true }).nullable(),
  // Admin-configured
  account_preset: z.enum(['tradesperson', 'realtor', 'manufacturer']).nullable(),
  trade_slugs_override: z.array(z.string()).nullable(),
  radius_cap_km: z.number().int().nullable(),
  // Notification preferences — flattened from JSONB to 5 sibling columns
  // in migration 117 per Spec 99 §9.14 (eliminates the deep-equal hot path
  // in userProfileStore.hydrate()). DB column for `lifecycle_stalled` was
  // renamed `lifecycle_stalled_pref` to avoid silent ambiguity in pipeline
  // SELECTs that join `permits.lifecycle_stalled`.
  new_lead_min_cost_tier: z.enum(['low', 'medium', 'high']),
  phase_changed: z.boolean(),
  lifecycle_stalled_pref: z.boolean(),
  start_date_urgent: z.boolean(),
  notification_schedule: z.enum(['morning', 'anytime', 'evening']),
});

export type UserProfileType = z.infer<typeof UserProfileSchema>;
