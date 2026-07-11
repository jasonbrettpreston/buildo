// SPEC LINK: docs/specs/02-web-admin/21_admin_user_management.md §4 (persona derivation)
//            docs/specs/03-mobile/95_mobile_user_profiles.md §2.5 / §2.5.1
//            docs/specs/01-pipeline/80_taxonomies.md §5.B.4 (trade_products partition)
//
// Deterministic account_preset derivation (P24-24A). `account_preset` is a
// UX/billing/onboarding axis ONLY — it NEVER feeds the lead algorithm (that
// reads `trade_slug` / the trade set; Spec 95 §2.5.1 anti-pattern). This helper
// runs server-side at onboarding completion to stamp a preset on self-serve
// rows that would otherwise carry NULL (which makes the admin directory filter
// meaningless).
//
// Rules (Spec 21 §4):
//   - realtor slug           -> 'realtor'
//   - a product/supplier trade -> 'supplier'   (the 20 slugs that appear in
//                                trade_products, Spec 80 §5.B.4)
//   - any other construction trade -> 'tradesperson'
//   - NULL / unknown          -> 'tradesperson' (safe default; a real NULL-trade
//                                account is admin-provisioned 'manufacturer' and
//                                already carries a non-NULL preset, so derivation
//                                is skipped for it — see the caller guard)
//
// NOTE FOR REVIEW: a self-serve tradesperson and a product-supplier who both
// pick the same product trade (e.g. 'glazing') are indistinguishable by
// trade_slug alone — both derive 'supplier' here. This is the explicit mapping
// the plan mandated (P24 24A/24D "every product trade -> supplier"); if the
// business wants a persona choice to disambiguate, that is a signup-path signal
// layered on top of this function, not a change to the partition.

export type AccountPreset = 'tradesperson' | 'realtor' | 'supplier' | 'manufacturer';

// The 20 trade slugs that appear as a producer in `trade_products` (Spec 80
// §5.B.4 / migration 181). A trade in this set is treated as a product-supplier
// persona at onboarding. Sourced from the canonical partition, hardcoded here
// (an explicit const per the plan) so derivation needs no DB round-trip.
export const PRODUCT_TRADE_SLUGS = [
  'framing',
  'masonry',
  'roofing',
  'plumbing',
  'hvac',
  'electrical',
  'insulation',
  'drywall',
  'painting',
  'flooring',
  'glazing',
  'trim-work',
  'millwork-cabinetry',
  'tiling',
  'stone-countertops',
  'decking-fences',
  'eavestrough-siding',
  'overhead-doors',
  'site-preparation',
  'site-maintenance',
] as const;

const PRODUCT_TRADE_SET: ReadonlySet<string> = new Set<string>(PRODUCT_TRADE_SLUGS);

export const REALTOR_TRADE_SLUG = 'realtor';

/**
 * Derive the `account_preset` UX axis from a `trade_slug`. Deterministic and
 * pure. See the module header for the rules. Returns 'tradesperson' for the
 * NULL / unknown edge (safe default) — the caller only invokes this when the
 * existing preset is NULL, so a manufacturer's admin-set preset is preserved.
 */
export function deriveAccountPreset(tradeSlug: string | null | undefined): AccountPreset {
  if (!tradeSlug || tradeSlug.trim().length === 0) return 'tradesperson';
  const slug = tradeSlug.trim();
  if (slug === REALTOR_TRADE_SLUG) return 'realtor';
  if (PRODUCT_TRADE_SET.has(slug)) return 'supplier';
  return 'tradesperson';
}
