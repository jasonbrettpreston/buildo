// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §5 (the server-side entitlement gate); docs/specs/00_engineering_standards.md §10.3 (API routes are thin)
//
// STD.ROUTE (task-383, Increment 1·B) · the ONE parcel-tool gate the lookup route and the lot-size route both use (it was written twice).
// Per product (MF-45, D-4 a): a parcel_tool entitlement in ACTIVE_SUBSCRIPTION_STATUSES -> 'parcel_tool' (metered); else the lead_gen status
// (ctx.subscription_status, the LEAD_GEN_ENTITLEMENT_JOIN) in the same set -> 'lead_gen_transitional' (the App A shelf, unmetered until MF-50 removes it);
// else null, and the caller answers 403 before any parcel DB work. ACTIVE_SUBSCRIPTION_STATUSES is the one Spec 96 §10 status set, shared by both arms.
// A thrown entitlement read propagates (the caller's catch or the envelope makes it a 500); it is never read as "not entitled". No write.
import { ACTIVE_SUBSCRIPTION_STATUSES, getEntitlementStatus, type Queryable } from '@/lib/entitlements';

export type ParcelToolAccess = 'parcel_tool' | 'lead_gen_transitional';

export async function parcelToolAccess(db: Queryable, ctx: { uid: string; subscription_status?: string | null }): Promise<ParcelToolAccess | null> {
  const parcelTool = await getEntitlementStatus(db, ctx.uid, 'parcel_tool');
  if (parcelTool && ACTIVE_SUBSCRIPTION_STATUSES.has(parcelTool.status)) return 'parcel_tool';
  if (ACTIVE_SUBSCRIPTION_STATUSES.has(ctx.subscription_status ?? '')) return 'lead_gen_transitional';
  return null;
}
