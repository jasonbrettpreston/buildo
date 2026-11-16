// 🔗 SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md (FE-42, fail closed)
// 🔗 SPEC LINK: docs/specs/02-web-admin/128_surface_standard_policy.md rules 3, 17 (limits are settings; left out, not faked)
//
// MF-83 group 3 (plan-group3.md D-G3-1, D-G3-6, operator "Accepted" 2026-11-15) · the one-lot read of the stored lot view. READ-ONLY; one parameterised
// statement for the row, one for the three settings. NOT WIRED into any response (the drawing builder and the wiring are MB-44's). The table
// `parcel_lot_view` and its job are the pipeline task MB-109's; until that lands the table is absent (SQLSTATE 42P01) and the read answers null,
// as `lot-form.ts` does for `parcel_lot_form`. Every failure answers null ("no lot view": the panel is left out, never faked):
//   - table absent (42P01): warn, null            - no row for the lot: null
//   - a setting missing, non-numeric or outside the seed bounds: error log naming the keys, null (the panel is optional; the lookup must not 500)
//   - the lot is outside the population (not one polygon, or has a hole), the stored `geom_hash` is not the lot's hash now, the edge classes
//     are not one per vertex, or the row is outside the contract: warn, null
// Any other database error throws. The ring order is the contract: `edge_classes` is for ST_ExteriorRing(ST_GeometryN(geom,1)) with the closing
// point dropped. The job must store ratios in 0..1 (clamped); a value outside that is outside the contract here.
import { query } from '@/lib/db/client';
import { logError, logWarn } from '@/lib/logger';
import seedJson from '../../../scripts/seeds/logic_variables.json';
import { LOT_VIEW_CLASSES, type LotViewEdgeClass, type LotViewRow, type LotViewSettings } from '@/lib/parcels/lot-view-rule';

export const LOT_VIEW_TABLE = 'parcel_lot_view'; // the SQL below names it literally (the src-sql ledger allows no new interpolation); a test locks the two equal
export const LOT_VIEW_UNAPPLIED_SQLSTATE = '42P01';

/** The three settings the rule reads. Spelled out so the variable-effect scan sees them read here. */
export const LOT_VIEW_SETTING_KEYS = {
  requireConvex: 'lotview_require_convex',
  convexTol: 'lotview_convex_tol',
  minRectangularity: 'lotview_min_rectangularity',
} as const;

const SEED_BOUNDS: Record<string, { min: number; max: number }> = Object.fromEntries(
  Object.values(LOT_VIEW_SETTING_KEYS).map((k) => {
    const s = (seedJson as Record<string, { min?: number; max?: number }>)[k];
    if (!s || typeof s.min !== 'number' || typeof s.max !== 'number') throw new Error(`logic_variables seed has no bounds for ${k}`);
    return [k, { min: s.min, max: s.max }];
  }),
);

export interface LotViewRead { row: LotViewRow; settings: LotViewSettings }

type DbRow = {
  rectangularity: unknown; convexity: unknown; edge_classes: unknown; edge_confidence: unknown; reasons: unknown;
  geom_hash: unknown; geom_hash_now: unknown; vertex_count: unknown; polygons: unknown; holes: unknown;
};

/** The three settings, or null (with an error log naming the keys) when any is missing, non-numeric or outside the seed bounds. */
export async function readLotViewSettings(): Promise<LotViewSettings | null> {
  const res = await query<{ variable_key: string; variable_value: string | number | null }>(
    `SELECT variable_key, variable_value FROM logic_variables WHERE variable_key = ANY($1::text[])`,
    [Object.values(LOT_VIEW_SETTING_KEYS)],
  );
  const byKey = new Map(res.map((r) => [r.variable_key, r.variable_value === null || r.variable_value === '' ? Number.NaN : Number(r.variable_value)]));
  const bad: string[] = [];
  const val = (key: string, whole = false): number => {
    const v = byKey.get(key);
    const b = SEED_BOUNDS[key]!;
    if (v === undefined || !Number.isFinite(v) || v < b.min || v > b.max || (whole && !Number.isInteger(v))) { bad.push(key); return Number.NaN; }
    return v;
  };
  const requireConvex = val(LOT_VIEW_SETTING_KEYS.requireConvex, true);
  const convexTol = val(LOT_VIEW_SETTING_KEYS.convexTol);
  const minRectangularity = val(LOT_VIEW_SETTING_KEYS.minRectangularity);
  if (bad.length > 0) {
    logError('[parcels/lot-view]', new Error(`logic_variables missing, non-numeric or outside the seed bounds: ${bad.join(', ')}`), { keys: bad });
    return null;
  }
  return { requireConvex: requireConvex === 1, convexTol, minRectangularity };
}

const ratio = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
};

/** The lot's stored view and the settings, by the consumer parcel id (parcels.parcel_id); null whenever there is no trustworthy lot view. */
export async function readLotView(parcelId: string): Promise<LotViewRead | null> {
  let rows: DbRow[];
  try {
    rows = await query<DbRow>(
      `SELECT v.rectangularity, v.convexity, v.edge_classes, v.edge_confidence, v.reasons, v.geom_hash,
              md5(ST_AsBinary(p.geom)) AS geom_hash_now,
              ST_NPoints(ST_ExteriorRing(ST_GeometryN(p.geom, 1))) - 1 AS vertex_count,
              ST_NumGeometries(p.geom) AS polygons,
              ST_NumInteriorRings(ST_GeometryN(p.geom, 1)) AS holes
         FROM parcel_lot_view v
         JOIN parcels p ON p.parcel_id = v.parcel_id
        WHERE v.parcel_id = $1`,
      [parcelId],
    );
  } catch (err) {
    // The table is a DB job run AFTER the push (the pipeline task MB-109): until it lands it is absent (SQLSTATE 42P01). Only that case degrades to
    // "no lot view"; every other database error still throws.
    if ((err as { code?: string } | null)?.code === LOT_VIEW_UNAPPLIED_SQLSTATE) {
      logWarn('[parcels/lot-view]', 'parcel_lot_view is not applied yet: lot view omitted', { sqlstate: LOT_VIEW_UNAPPLIED_SQLSTATE });
      return null;
    }
    throw err;
  }
  const r = rows[0];
  if (!r) return null;
  const settings = await readLotViewSettings();
  if (!settings) return null;
  const refuse = (why: string): null => { logWarn('[parcels/lot-view]', 'lot view omitted', { parcelId, why }); return null; };
  const classes = r.edge_classes;
  const reasons = r.reasons;
  const rectangularity = ratio(r.rectangularity);
  const convexity = ratio(r.convexity);
  if (rectangularity === null || convexity === null) return refuse('ratio-outside-contract');
  if (r.edge_confidence !== 'high' && r.edge_confidence !== 'low') return refuse('confidence-outside-contract');
  if (!Array.isArray(classes) || !classes.every((c) => (LOT_VIEW_CLASSES as unknown[]).includes(c))) return refuse('edge-classes-outside-contract');
  if (!Array.isArray(reasons) || !reasons.every((x) => typeof x === 'string')) return refuse('reasons-outside-contract');
  if (Number(r.polygons) !== 1 || Number(r.holes) !== 0) return refuse('outside-population');
  if (typeof r.geom_hash !== 'string' || r.geom_hash !== r.geom_hash_now) return refuse('geom-hash-mismatch');
  if (classes.length !== Number(r.vertex_count)) return refuse('edge-classes-not-one-per-vertex');
  return { row: { rectangularity, convexity, edgeConfidence: r.edge_confidence, edgeClasses: classes as LotViewEdgeClass[], reasons: reasons as string[] }, settings };
}
