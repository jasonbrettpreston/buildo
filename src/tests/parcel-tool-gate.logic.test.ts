// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §5; docs/specs/00_engineering_standards.md §10.3
// STD.ROUTE (task-383, Increment 1·B) · the one parcel-tool gate helper (src/lib/parcels/tool-gate.ts) the lookup and lot-size routes share. Red first: the helper did not exist.
// G1..G4: the arms; G5 a failed read is never "not entitled"; G6 both routes call the helper and neither holds the status set; G7 RED plant.
import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const getEntitlementStatus = vi.fn();
vi.mock('@/lib/entitlements', async (orig) => ({ ...(await orig<typeof import('@/lib/entitlements')>()), getEntitlementStatus: (...a: unknown[]) => getEntitlementStatus(...a) }));
import { parcelToolAccess } from '@/lib/parcels/tool-gate';

const DB = {} as never;
const ROOT = path.resolve(__dirname, '../..');
const read = (p: string): string => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('parcelToolAccess', () => {
  it.each(['trial', 'active', 'past_due', 'admin_managed'])('G1 parcel_tool %s -> parcel_tool', async (s) => {
    getEntitlementStatus.mockResolvedValueOnce({ status: s });
    expect(await parcelToolAccess(DB, { uid: 'u', subscription_status: null })).toBe('parcel_tool');
  });
  it.each(['trial', 'active', 'past_due', 'admin_managed'])('G2 no parcel_tool, lead_gen %s -> lead_gen_transitional', async (s) => {
    getEntitlementStatus.mockResolvedValueOnce(null);
    expect(await parcelToolAccess(DB, { uid: 'u', subscription_status: s })).toBe('lead_gen_transitional');
  });
  it('G2b parcel_tool expired with lead_gen active -> lead_gen_transitional (D-4 a)', async () => {
    getEntitlementStatus.mockResolvedValueOnce({ status: 'expired' });
    expect(await parcelToolAccess(DB, { uid: 'u', subscription_status: 'active' })).toBe('lead_gen_transitional');
  });
  it.each(['expired', 'cancelled_pending_deletion'])('G3 parcel_tool %s and no lead_gen -> null', async (s) => {
    getEntitlementStatus.mockResolvedValueOnce({ status: s });
    expect(await parcelToolAccess(DB, { uid: 'u', subscription_status: null })).toBeNull();
  });
  it('G4 nothing at all (no entitlement, no status, empty status) -> null', async () => {
    getEntitlementStatus.mockResolvedValueOnce(null);
    expect(await parcelToolAccess(DB, { uid: 'u' })).toBeNull();
    getEntitlementStatus.mockResolvedValueOnce(null);
    expect(await parcelToolAccess(DB, { uid: 'u', subscription_status: '' })).toBeNull();
  });
  it('G5 a thrown entitlement read propagates; it is never read as not entitled', async () => {
    getEntitlementStatus.mockRejectedValueOnce(new Error('db down'));
    await expect(parcelToolAccess(DB, { uid: 'u', subscription_status: 'active' })).rejects.toThrow('db down');
  });
});

/** The share lock: a route calls the helper and holds no status set of its own (comment lines are not code). */
const usesSharedGate = (src: string): boolean => /parcelToolAccess\(/.test(src) && !/ACTIVE_SUBSCRIPTION_STATUSES/.test(src.replace(/^\s*\/\/.*$/gm, ''));
describe('the two routes share the one gate', () => {
  it('G6 lookup and lot-size call parcelToolAccess and hold no ACTIVE_SUBSCRIPTION_STATUSES test; the helper holds it', () => {
    expect(usesSharedGate(read('src/app/api/parcels/lookup/route.ts'))).toBe(true);
    expect(usesSharedGate(read('src/app/api/parcels/lot-size/route.ts'))).toBe(true);
    expect(read('src/lib/parcels/tool-gate.ts')).toContain('ACTIVE_SUBSCRIPTION_STATUSES.has');
  });
  it('G7 RED plant: a route that writes its own status test again is caught', () => {
    expect(usesSharedGate('const a = await parcelToolAccess(pool, ctx);')).toBe(true);
    expect(usesSharedGate("const e = ACTIVE_SUBSCRIPTION_STATUSES.has(ctx.subscription_status ?? '');")).toBe(false);
    expect(usesSharedGate('await parcelToolAccess(pool, ctx); ACTIVE_SUBSCRIPTION_STATUSES.has(x);')).toBe(false);
  });
});
