// SPEC LINK: docs/specs/02-web-admin/21_admin_user_management.md §4 (persona derivation)
//            docs/specs/03-mobile/95_mobile_user_profiles.md §2.5 / §2.5.1
//
// Deterministic account_preset derivation (P24-24A; AMENDED 2026-07-11 —
// supplier is EXPLICIT-ONLY). `account_preset` is a UX/billing/onboarding axis
// ONLY — it NEVER feeds the lead algorithm (that reads `trade_slug` / the trade
// set; Spec 95 §2.5.1 anti-pattern). This helper runs server-side at onboarding
// completion to stamp a preset on self-serve rows that would otherwise carry
// NULL (which makes the admin directory filter meaningless).
//
// Rules (Spec 21 §4, v2):
//   - realtor slug -> 'realtor'
//   - EVERYTHING else (any construction OR product trade, NULL, unknown)
//     -> 'tradesperson'
//
// 'supplier' is NEVER derived from the trade. Rationale (the amendment): a
// trade slug cannot distinguish a self-serve plumber from a plumbing-supply
// manufacturer — both pick 'plumbing' — and the majority self-serve persona
// must not be mislabeled (preset drives the admin directory + future billing).
// 'supplier' comes ONLY from an explicit signal:
//   1. admin provisioning (POST /api/admin/users sets it directly), or
//   2. the admin JOIN-editor re-labeling a self-serve account
//      (PATCH action 'set_preset' — one audited click),
// until a future onboarding persona step exists. This supersedes the v1
// trade_products-partition derivation (product trade -> 'supplier'), overruled
// 2026-07-11 for exactly the ambiguity above.
//
// 'manufacturer' is likewise admin-provisioned only and never derived here.
// The caller only invokes this function when the existing preset is NULL, so
// admin-set presets ('supplier'/'manufacturer') are always preserved.

export type AccountPreset = 'tradesperson' | 'realtor' | 'supplier' | 'manufacturer';

export const REALTOR_TRADE_SLUG = 'realtor';

/**
 * Derive the `account_preset` UX axis from a `trade_slug`. Deterministic and
 * pure: realtor -> 'realtor'; everything else (including NULL / unknown /
 * product trades) -> 'tradesperson'. 'supplier' / 'manufacturer' are
 * explicit-only and never returned by this function — see the module header.
 */
export function deriveAccountPreset(tradeSlug: string | null | undefined): AccountPreset {
  if (!tradeSlug || tradeSlug.trim().length === 0) return 'tradesperson';
  if (tradeSlug.trim() === REALTOR_TRADE_SLUG) return 'realtor';
  return 'tradesperson';
}
