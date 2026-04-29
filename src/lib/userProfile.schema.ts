// SPEC LINK: docs/specs/03-mobile/95_mobile_user_profiles.md §5 API Contract
import { z } from 'zod';

// Full shape of a user_profiles row as returned by GET/PATCH responses.
export const UserProfileSchema = z.object({
  user_id: z.string(),
  trade_slug: z.string().nullable(),
  display_name: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  // Identity
  full_name: z.string().nullable(),
  phone_number: z.string().nullable(),
  company_name: z.string().nullable(),
  email: z.string().nullable(),
  backup_email: z.string().nullable(),
  // Profession / feed-scoping
  default_tab: z.enum(['feed', 'flight_board']).nullable(),
  location_mode: z.enum(['gps_live', 'home_base_fixed']).nullable(),
  // pg returns NUMERIC(9,6) as string — coerce to number before storing
  home_base_lat: z.coerce.number().nullable(),
  home_base_lng: z.coerce.number().nullable(),
  radius_km: z.number().int().nullable(),
  supplier_selection: z.string().nullable(),
  lead_views_count: z.number().int(),
  // Subscription
  subscription_status: z
    .enum(['trial', 'active', 'past_due', 'expired', 'cancelled_pending_deletion', 'admin_managed'])
    .nullable(),
  trial_started_at: z.string().nullable(),
  stripe_customer_id: z.string().nullable(),
  // Account state
  onboarding_complete: z.boolean(),
  tos_accepted_at: z.string().nullable(),
  account_deleted_at: z.string().nullable(),
  // Admin-configured
  account_preset: z.enum(['tradesperson', 'realtor', 'manufacturer']).nullable(),
  trade_slugs_override: z.array(z.string()).nullable(),
  radius_cap_km: z.number().int().nullable(),
  // notification_prefs stored as JSONB — canonical 5-key shape per §2.4
  notification_prefs: z.object({
    new_lead_min_cost_tier: z.enum(['low', 'medium', 'high']),
    phase_changed: z.boolean(),
    lifecycle_stalled: z.boolean(),
    start_date_urgent: z.boolean(),
    notification_schedule: z.enum(['morning', 'anytime', 'evening']),
  }).nullable(),
});

export type UserProfileType = z.infer<typeof UserProfileSchema>;

// Whitelist for PATCH body — only these fields are client-writable.
// .strip() silently discards any extra keys (subscription_status, account_deleted_at, etc.)
export const UserProfileUpdateSchema = z
  .object({
    full_name: z.string().max(120).nullable().optional(),
    phone_number: z.string().max(30).nullable().optional(),
    company_name: z.string().max(120).nullable().optional(),
    backup_email: z.string().email().nullable().optional(),
    default_tab: z.enum(['feed', 'flight_board']).nullable().optional(),
    location_mode: z.enum(['gps_live', 'home_base_fixed']).nullable().optional(),
    home_base_lat: z.number().min(-90).max(90).nullable().optional(),
    home_base_lng: z.number().min(-180).max(180).nullable().optional(),
    radius_km: z.number().int().min(1).max(200).nullable().optional(),
    supplier_selection: z.string().nullable().optional(),
    notification_prefs: z.object({
      new_lead_min_cost_tier: z.enum(['low', 'medium', 'high']),
      phase_changed: z.boolean(),
      lifecycle_stalled: z.boolean(),
      start_date_urgent: z.boolean(),
      notification_schedule: z.enum(['morning', 'anytime', 'evening']),
    }).partial().optional(),
    // Onboarding-only fields written by Spec 94 screens
    onboarding_complete: z.boolean().optional(),
    tos_accepted_at: z.string().optional(),
  })
  .strip();

export type UserProfileUpdateType = z.infer<typeof UserProfileUpdateSchema>;
