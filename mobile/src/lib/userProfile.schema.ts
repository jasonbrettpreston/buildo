// SPEC LINK: docs/specs/03-mobile/95_mobile_user_profiles.md §9 Step 5
import { z } from 'zod';

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
