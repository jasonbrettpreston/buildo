// 🔗 SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §3, §3.2 (dated note 2026-11-11, MF-53: the map fields, map scope only)
// 🔗 SPEC LINK: docs/specs/02-web-admin/128_surface_standard_policy.md rule 3 (every page size is a registered logic variable)
//
// MF-53 · the "choose your lot" map read. CONSUMER ONLY: the consumer route calls it with the seed `resolveAddress` returned
// (src/lib/admin/parcel-lookup.ts), never on the `parcelId` path, so the admin tool never pays for geometry (Spec 89 chain budget).
//   multi_parcel  the matched lots (outline, area, frontage, zoning, marker point) + the pin of the typed house number
//   unlinked      the pin of the one unlinked address + the faint neighbour outlines within the radius (operator ruling 2026-09-16;
//                 DECISIONS-v3 item 1: neighbours on `unlinked` only)
// The neighbour radius and limit are admin-editable logic variables (DECISIONS-v3 item 2 b, migration 307), read only on that path and
// failing closed outside the seed bounds (the readMediaLimits pattern). READ-ONLY; parameterised static statements only.
import { query } from '@/lib/db/client';
import { logWarn } from '@/lib/logger';
import seedJson from '../../../scripts/seeds/logic_variables.json';

export type LatLng = { lat: number; lng: number };

/** What `resolveAddress` hands the map read (built only from its own rows). */
export type LotMapSeed =
  | { kind: 'multi_parcel'; parcelIds: string[]; num: string; truncated: boolean }
  | { kind: 'unlinked'; address: string; pin: LatLng | null };

/**
 * The parcels columns the map read promotes to the consumer response, exactly the lot statement's projection (security M-1; Spec 100 §3.2
 * dated note 2026-11-11). Locked both ways by src/tests/consumer-parcel-lookup.infra.test.ts.
 */
export const CONSUMER_MAP_COLS = ['parcel_id', 'lot_size_sqm', 'frontage_m', 'zoning_zn_string', 'centroid_lat', 'centroid_lng', 'geom'] as const;

export type LotRow = {
  parcel_id: string;
  lot_size_sqm: unknown;
  frontage_m: unknown;
  zoning_zn_string: string | null;
  centroid_lat: unknown;
  centroid_lng: unknown;
  /** ST_AsGeoJSON(geom, 6) text, or null (no geometry, or over OUTLINE_MAX_BYTES). */
  outline: string | null;
};
export type NeighbourRow = { parcel_id: string; outline: string | null };
export type LotMapRows = { address: string | null; pin: LatLng | null; truncated: boolean; lots: LotRow[]; neighbours: NeighbourRow[] };

/** An outline above this many bytes of GeoJSON is sent as null (no polygon drawn); measured max 61,910 (security L-3). */
export const OUTLINE_MAX_BYTES = 65536;

// ---- the two logic variables ---------------------------------------------------------------------------------------------------------------

export type LotMapLimits = { radius_m: number; limit: number };
/** Spelled out so the variable-effect scan sees them read here. */
export const LOT_MAP_LIMIT_KEYS = { radius_m: 'parcel_map_neighbour_radius_m', limit: 'parcel_map_neighbour_limit' } as const;

export class LotMapLimitsMissingError extends Error {
  constructor(readonly missing: string[]) {
    super(`logic_variables missing, non-numeric or outside the seed bounds: ${missing.join(', ')}`);
    this.name = 'LotMapLimitsMissingError';
  }
}

const SEED_BOUNDS: Record<string, { min: number; max: number }> = Object.fromEntries(
  Object.values(LOT_MAP_LIMIT_KEYS).map((k) => {
    const s = (seedJson as Record<string, { min?: number; max?: number }>)[k];
    if (!s || typeof s.min !== 'number' || typeof s.max !== 'number') throw new Error(`logic_variables seed has no bounds for ${k}`);
    return [k, { min: s.min, max: s.max }];
  }),
);

/** Reads both values (migration 307). Missing, null, non-numeric, non-integer or outside the seed bounds: throws, never a guess. */
export async function readLotMapLimits(): Promise<LotMapLimits> {
  const keys = Object.values(LOT_MAP_LIMIT_KEYS);
  const res = await query<{ variable_key: string; variable_value: string | number | null }>(
    `SELECT variable_key, variable_value FROM logic_variables WHERE variable_key = ANY($1::text[])`,
    [keys],
  );
  const byKey = new Map(res.map((r) => [r.variable_key, r.variable_value === null || r.variable_value === '' ? Number.NaN : Number(r.variable_value)]));
  const out: Partial<LotMapLimits> = {};
  const missing: string[] = [];
  for (const [field, key] of Object.entries(LOT_MAP_LIMIT_KEYS) as Array<[keyof LotMapLimits, string]>) {
    const v = byKey.get(key);
    const b = SEED_BOUNDS[key]!;
    if (v === undefined || !Number.isInteger(v) || v < b.min || v > b.max) missing.push(key);
    else out[field] = v;
  }
  if (missing.length > 0) throw new LotMapLimitsMissingError(missing);
  return out as LotMapLimits;
}

// ---- the map read --------------------------------------------------------------------------------------------------------------------------

const capOutline = (outline: string | null, parcelId: string): string | null => {
  if (outline !== null && outline.length > OUTLINE_MAX_BYTES) {
    logWarn('[api/parcel-lookup]', 'outline-over-cap', { parcelId, bytes: outline.length });
    return null;
  }
  return outline;
};
const num = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export async function resolveLotMap(seed: LotMapSeed): Promise<LotMapRows> {
  if (seed.kind === 'multi_parcel') {
    if (seed.truncated) return { address: null, pin: null, truncated: true, lots: [], neighbours: [] };
    const lots = await query<LotRow>(
      `SELECT parcel_id, lot_size_sqm, frontage_m, zoning_zn_string, centroid_lat, centroid_lng, ST_AsGeoJSON(geom, 6) AS outline
       FROM parcels
       WHERE parcel_id = ANY($1::text[])
       ORDER BY parcel_id`,
      [seed.parcelIds],
    );
    // The pin: a LIVE address point linked to one of the matched lots that carries the typed house number (the same filters as the
    // typeahead, retired_at in WHERE). None -> no pin; the view fits the lots.
    const pins = await query<{ latitude: unknown; longitude: unknown }>(
      `SELECT ap.latitude, ap.longitude
       FROM address_points ap
       JOIN parcel_address_points pap ON pap.address_point_id = ap.address_point_id
       JOIN parcels p ON p.id = pap.parcel_id
       WHERE p.parcel_id = ANY($1::text[])
         AND ap.addr_num_normalized = $2
         AND (ap.address_status IS NULL OR UPPER(ap.address_status) IN ('CURRENT', 'NONE'))
         AND UPPER(ap.maint_stage) = 'REGULAR'
         AND ap.retired_at IS NULL
       ORDER BY ap.address_point_id LIMIT 1`,
      [seed.parcelIds, seed.num],
    );
    const lat = num(pins[0]?.latitude);
    const lng = num(pins[0]?.longitude);
    return {
      address: null,
      pin: lat !== null && lng !== null ? { lat, lng } : null,
      truncated: false,
      lots: lots.map((l) => ({ ...l, outline: capOutline(l.outline, l.parcel_id) })),
      neighbours: [],
    };
  }
  if (seed.pin === null) return { address: seed.address, pin: null, truncated: false, lots: [], neighbours: [] };
  const limits = await readLotMapLimits();
  // The pin arrives as parameters, so this statement reads no address_points row (nothing to filter). The bounding-box test uses the
  // parcels GIST index (idx_parcels_geom_gist); the geography test is in metres.
  const neighbours = await query<NeighbourRow>(
    `SELECT p.parcel_id, ST_AsGeoJSON(p.geom, 6) AS outline
     FROM parcels p
     WHERE p.geom && ST_Envelope(ST_Buffer(ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)::geometry)
       AND ST_DWithin(p.geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
     ORDER BY ST_Distance(p.geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography), p.parcel_id
     LIMIT $4`,
    [seed.pin.lng, seed.pin.lat, limits.radius_m, limits.limit],
  );
  return {
    address: seed.address,
    pin: seed.pin,
    truncated: false,
    lots: [],
    neighbours: neighbours.map((n) => ({ ...n, outline: capOutline(n.outline, n.parcel_id) })),
  };
}
