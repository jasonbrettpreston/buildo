// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.7 (dated note 2026-11-11, MF-62: the loading state "What we checked"),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05 (the server formats every value), FE-35,
//            docs/specs/01-pipeline/60_shared_steps.md Refresh Snapshot (dated note 2026-11-11: the stored, dated citywide counts).
//
// MF-62 · McFrontend queue · lane E. THE producer of the report loading state's `what_we_checked` response (operator 2026-11-11 "Mf-62 - yes";
// "x-1 a of course, x-2 a x-3 a x-4 a - build this into McFront-end specs and rulings and handbook"). Read-only. Every value it returns is a
// server-formatted string (FE-05); the pace (each line's delay, the skip delay, the minimum) is computed here, never in the renderer (Rule 16).
//   - citywide: the newest stored, dated data_quality_snapshots row written by refresh_snapshot (X-1 a), never a live count; the by-law rules
//     count is the committed catalogue count (scripts/seeds/bylaw/universe.lock.json `rows`, equal to bylaw-provisions.json `counts.rows`).
//     A missing row or any missing or zero value omits the whole citywide group: never a literal, never a partial set.
//   - lot: lot area; the by-law line (the evaluated limit count, "exception noted, not yet modelled" on an exception_not_authored lot, or
//     "By-law limits not yet evaluated" on any other gate or no result: X-3 a, never "checked"); ravine and heritage only when that
//     enrichment ran (X-2 a: "designated"); decided CoA applications in the lot's neighbourhood (MF-51 D-2 a), omitted with no neighbourhood.
//   - pace: report_check_min_ms, report_check_skip_after_ms and report_check_ready_hold_ms (admin logic_variables; D-2 a, amended 2026-11-11). A missing or out-of-bounds value, or a skip
//     delay above the minimum, returns null with a warning: the screen is skipped and the report still opens (never a 500). A DB error is
//     caught here too (logError) and returns null: this screen is never a reason to fail a paid lookup (OUTPUT panel N-5, CR-2).
//   - the by-law date is sent only beside a counted limits line: never beside "not yet evaluated" or "not yet modelled" (N-4); a lot
//     area that rounds below 1 m² is omitted, never "Lot: 0 m²" (N-2).
//   - the sequence (MF-62 follow-up, operator 2026-11-11: "after the each fact runs - we need to paude and then have somet the possibilities
//     report for the address is ready and then transisiton.  Let's slow it down"): one step s = floor((min - hold) / (facts + 1)); fact i shows
//     its loading verb at i*s (delay_ms) and resolves at (i+1)*s (done_ms); the dates line with the last fact; the ready line one step later
//     (ready_ms, the pause = one step); the report opens at min_ms, at least the hold after the ready line. A step under 1 ms returns null.
//   - the address of the ready line: the lot's stored number and street (parcels.address_number, linear_name_full), formatted here (FE-05);
//     blank or the stored literal "None" returns null (the screen is skipped, never a sentence without its address).
// The GET /api/parcels/lookup wiring and the app render land with MF-48 (X-4 a); `showsWhatWeChecked` holds the re-opened-lot rule for it.
import universe from '../../../scripts/seeds/bylaw/universe.lock.json';
import { logError, logWarn } from '@/lib/logger';
import { readReportCheckPace, type Queryable, type ReportCheckPace } from './report-check-pace';

export { REPORT_CHECK_BOUNDS, REPORT_CHECK_KEYS, readReportCheckPace } from './report-check-pace';

/** The CoA decisions that count as "decided" (approved in any wording, or refused); withdrawn, deferred and blank do not (precedent: compute-build-norms.js). */
export const DECIDED_COA_PATTERN = '(approv|refus)';
/** The one gate that has its own line (X-3 a keeps the ruled mock text for it). */
export const GATE_EXCEPTION_NOT_AUTHORED = 'exception_not_authored';
/** Dates are shown as the calendar date in Toronto. */
const DATE_ZONE = 'America/Toronto';

export interface ProducedLine { key: string; value?: string; types?: string; delay_ms: number; done_ms: number }
export interface WhatWeChecked {
  groups: Array<{ key: 'citywide' | 'lot'; lines: ProducedLine[] }>;
  dates?: { lines: Array<{ key: string; value: string }>; delay_ms: number };
  skip_after_ms: number;
  ready_ms: number;
  address: string;
  min_ms: number;
}

/** Re-opened lot rule (MF-45 meter): the screen shows for a newly counted lot and on the unmetered transitional path; never for a lot already
 * opened this billing month (`already_counted`), nor for a refusal or a non-hit. */
export const showsWhatWeChecked = (meter: string): boolean => meter === 'counted' || meter === 'unmetered';

const fmtCount = (n: number): string => n.toLocaleString('en-CA');
const fmtDate = (d: Date | string): string => new Date(d).toLocaleDateString('en-CA', { timeZone: DATE_ZONE });
const fmtArea = (sqm: number): string => `${Math.round(sqm).toLocaleString('en-CA')} m²`;
const positive = (v: unknown): number | null => {
  const n = v === null || v === undefined ? Number.NaN : Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

interface LotRow {
  lot_size_sqm: string | number | null; neighbourhood_id: string | number | null;
  is_in_ravine_protection_area: boolean | null; ravine_dataset_version_when_enriched: string | null;
  is_heritage_designated: boolean | null; heritage_dataset_version_when_enriched: string | null;
  has_resolution: boolean; lot_gate: string | null; resolved_at: Date | string | null; limits_evaluated: string | number | null;
  types_evaluated: string | number | null;
  address_number: string | null; linear_name_full: string | null;
}
export interface CitywideRow {
  parcels_total: unknown; building_footprints_total: unknown; permits_active_distinct: unknown; coa_total: unknown; map_areas_total: unknown;
  zoning_layer_version: Date | string | null; permits_last_seen_at: Date | string | null; coa_last_seen_at: Date | string | null;
}

// The lot's own rows by key: parcels by parcel_id, its bylaw_resolution_lots row (parcels.id), and its evaluated results (status not not_evaluated).
export const LOT_SQL = `SELECT p.lot_size_sqm, p.neighbourhood_id, p.address_number, p.linear_name_full,
       p.is_in_ravine_protection_area, p.ravine_dataset_version_when_enriched,
       p.is_heritage_designated, p.heritage_dataset_version_when_enriched,
       (l.parcel_id IS NOT NULL) AS has_resolution, l.lot_gate, l.resolved_at,
       (SELECT COUNT(*) FROM bylaw_resolution_results r WHERE r.parcel_id = p.id AND r.status <> 'not_evaluated') AS limits_evaluated,
       (SELECT COUNT(DISTINCT r.class) FROM bylaw_resolution_results r WHERE r.parcel_id = p.id AND r.status <> 'not_evaluated') AS types_evaluated
  FROM parcels p
  LEFT JOIN bylaw_resolution_lots l ON l.parcel_id = p.id
 WHERE p.parcel_id = $1
 LIMIT 1`;
export const DECISIONS_SQL = 'SELECT COUNT(*) AS n FROM coa_applications WHERE neighbourhood_id = $1 AND decision ~* $2';
export const CITYWIDE_SQL = `SELECT parcels_total, building_footprints_total, permits_active_distinct, coa_total, map_areas_total,
       zoning_layer_version, permits_last_seen_at, coa_last_seen_at
  FROM data_quality_snapshots
 WHERE parcels_total IS NOT NULL
 ORDER BY snapshot_date DESC
 LIMIT 1`;

/** The newest stored, dated citywide row, or undefined. MF-76 (dated 2026-11-11): the landing reads the same row through this one SQL home
 * (src/lib/surfaces/maxbld-landing.ts); the lookup path below is unchanged. */
export async function readCitywideRow(db: Queryable): Promise<CitywideRow | undefined> {
  return (await db.query<CitywideRow>(CITYWIDE_SQL)).rows[0];
}

/** The citywide lines (operator order), or [] when the stored row or any value is missing. */
export function citywideLines(row: CitywideRow | undefined, regulations: number): Array<{ key: string; value: string }> {
  if (!row) return [];
  const vals: Array<[string, number | null]> = [
    ['lots', positive(row.parcels_total)],
    ['regulations', positive(regulations)],
    ['buildings', positive(row.building_footprints_total)],
    ['builds', positive(row.permits_active_distinct) !== null && positive(row.coa_total) !== null ? Number(row.permits_active_distinct) + Number(row.coa_total) : null],
    ['map_areas', positive(row.map_areas_total)],
  ];
  if (vals.some(([, v]) => v === null)) return [];
  return vals.map(([key, v]) => ({ key, value: fmtCount(v as number) }));
}

/** The per-lot lines (operator order). */
export function lotLines(lot: LotRow, decisions: number | null): Array<{ key: string; value?: string; types?: string }> {
  const out: Array<{ key: string; value?: string; types?: string }> = [];
  const area = lot.lot_size_sqm === null ? null : Number(lot.lot_size_sqm);
  if (area !== null && Number.isFinite(area) && Math.round(area) >= 1) out.push({ key: 'area', value: fmtArea(area) });
  const limits = positive(lot.limits_evaluated);
  const types = positive(lot.types_evaluated); // N-1 (b): the house types the count runs across, from data
  if (lot.has_resolution && lot.lot_gate === GATE_EXCEPTION_NOT_AUTHORED) out.push({ key: 'limits_gated' });
  else if (lot.has_resolution && lot.lot_gate === null && limits !== null && types !== null) out.push({ key: 'limits', value: fmtCount(limits), types: fmtCount(types) });
  else out.push({ key: 'limits_not_evaluated' });
  if (lot.ravine_dataset_version_when_enriched !== null) out.push({ key: lot.is_in_ravine_protection_area ? 'ravine_in' : 'ravine_out' });
  if (lot.heritage_dataset_version_when_enriched !== null) out.push({ key: lot.is_heritage_designated ? 'heritage_in' : 'heritage_out' });
  if (decisions !== null) out.push({ key: 'decisions', value: fmtCount(decisions) });
  return out;
}

/** The stored address as shown ("100 Example Ave"), or null when either part is blank or the stored literal "None". */
export function lotAddress(lot: Pick<LotRow, 'address_number' | 'linear_name_full'>): string | null {
  const part = (v: string | null): string | null => {
    const t = (v ?? '').trim();
    return t === '' || t.toLowerCase() === 'none' ? null : t;
  };
  const n = part(lot.address_number);
  const st = part(lot.linear_name_full);
  return n && st ? `${n} ${st}` : null;
}

/** The step of the sequence; below 1 when the minimum leaves no room after the hold (the caller then skips the screen). Pure. */
export const stepMs = (facts: number, pace: ReportCheckPace): number => Math.floor((pace.minMs - pace.readyHoldMs) / (facts + 1));

/** The processing sequence: each fact shows its verb at i*s and resolves at (i+1)*s; the dates with the last fact; the ready line one step
 * after the last fact (the pause); the report opens at the minimum. Pure. */
export function paced(
  groups: Array<{ key: 'citywide' | 'lot'; lines: Array<{ key: string; value?: string; types?: string }> }>,
  dates: Array<{ key: string; value: string }>,
  pace: ReportCheckPace,
  address: string,
): WhatWeChecked {
  const kept = groups.filter((g) => g.lines.length > 0);
  const facts = kept.reduce((n, g) => n + g.lines.length, 0);
  const s = stepMs(facts, pace);
  let i = 0;
  const out: WhatWeChecked = {
    groups: kept.map((g) => ({ key: g.key, lines: g.lines.map((l) => { const at = i++; return { ...l, delay_ms: at * s, done_ms: (at + 1) * s }; }) })),
    skip_after_ms: pace.skipAfterMs,
    ready_ms: (facts + 1) * s,
    address,
    min_ms: pace.minMs,
  };
  if (dates.length) out.dates = { lines: dates, delay_ms: facts * s };
  return out;
}

/** The whole `what_we_checked` response for one lot (parcels.parcel_id), or null when the pace settings are unusable or the lot is unknown. */
export async function readWhatWeChecked(db: Queryable, parcelId: string): Promise<WhatWeChecked | null> {
  try {
    return await readOnce(db, parcelId);
  } catch (err) {
    logError('[what-we-checked]', err, { parcelId });
    return null;
  }
}

async function readOnce(db: Queryable, parcelId: string): Promise<WhatWeChecked | null> {
  const pace = await readReportCheckPace(db);
  if ('bad' in pace) {
    logWarn('[what-we-checked]', 'pace settings unusable; screen skipped', { keys: pace.bad });
    return null;
  }
  const lot = (await db.query<LotRow>(LOT_SQL, [parcelId])).rows[0];
  if (!lot) return null;
  const address = lotAddress(lot);
  if (address === null) {
    logWarn('[what-we-checked]', 'no stored address; screen skipped', { parcelId });
    return null;
  }
  const nbhd = lot.neighbourhood_id === null ? null : Number(lot.neighbourhood_id);
  const decisions = nbhd === null ? null : Number((await db.query<{ n: string | number }>(DECISIONS_SQL, [nbhd, DECIDED_COA_PATTERN])).rows[0]?.n ?? 0);
  const city = (await db.query<CitywideRow>(CITYWIDE_SQL)).rows[0];
  const lines = lotLines(lot, decisions);
  const dates: Array<{ key: string; value: string }> = [];
  if (lot.resolved_at && lines.some((l) => l.key === 'limits')) dates.push({ key: 'bylaw', value: fmtDate(lot.resolved_at) });
  if (city?.zoning_layer_version) dates.push({ key: 'zoning', value: fmtDate(city.zoning_layer_version) });
  if (city?.permits_last_seen_at) dates.push({ key: 'permits', value: fmtDate(city.permits_last_seen_at) });
  if (city?.coa_last_seen_at) dates.push({ key: 'decisions', value: fmtDate(city.coa_last_seen_at) });
  const groups: Array<{ key: 'citywide' | 'lot'; lines: Array<{ key: string; value?: string; types?: string }> }> = [
    { key: 'citywide', lines: citywideLines(city, Number((universe as { rows: number }).rows)) }, { key: 'lot', lines },
  ];
  const facts = groups.reduce((n, g) => n + g.lines.length, 0);
  if (stepMs(facts, pace) < 1) {
    logWarn('[what-we-checked]', 'pace leaves no room for the facts; screen skipped', { facts, ...pace });
    return null;
  }
  return paced(groups, dates, pace, address);
}
