// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.4 (provenance), 11a.9 (user inputs; dated notes 2026-11-11),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05 (the server converts, checks and formats), FE-19 (shared, with
//            provenance), FE-20 (verified > user > City; history kept, a bad entry reverted); migrations/305_parcel_user_inputs.sql.
//
// MF-19 · Add lot size, the server half (operator 2026-11-11, D-1..D-8 "all as recommmended"; plan ~/Buildo-scratch/mcfrontend/MF-19/plan.v2.md):
//   readLotSizeSettings  the five logic variables in one read; the switch is OFF unless it reads exactly 1 inside the seed bounds (D-6 lock).
//   lotSizeProblems      the D-2 range in the typed unit against the SHOWN bound (so the shown edge passes) and the D-3 City ratio, with the
//                        server-formatted message (FE-05: no conversion or comparison on screen).
//   readLotSizeRead      ONE SQL statement: the City value and the active entry of one lot. effectiveLotSize is the pure precedence over it
//                        (FE-20): a verified source (none is declared, so the list is empty) > the active user entry > the City value.
//   lotSizePageFlags     the report page flags (D-5, D-6): the box and sheet show only while the switch is on and nothing is entered; the
//                        after-entry line shows once entered; "Every option is recalculated" only when the stored results carry the entry's stamp.
//   insertLotSizeEntry   the entry, once (the partial unique index; a 23505 is the 409 class, never a 500).
//   revertLotSizeEntry   the admin revert (D-4): status flips, the row stays (history); it returns the audit row the route writes with
//                        writeAdminAudit in the same transaction (Spec 128 R-12: the handler writes the audit row).
import type { PoolClient } from 'pg';
import type { Queryable } from '@/lib/entitlements';
import { SQM_TO_SQFT } from '@/lib/parcels/geometry';
import type { AdminAuditParams } from '@/lib/admin/admin-audit';
import contractJson from '../../../scripts/surfaces/_schema/lot-size-entry-contract.json';
import presentationJson from '../../../scripts/surfaces/_schema/report-presentation.json';
import seedJson from '../../../scripts/seeds/logic_variables.json';

export const CONTRACT = contractJson;
const PAGE = (presentationJson as unknown as { page: Record<string, string> }).page;

/** The five keys, spelled out so the variable-effect scan sees them read here; they must equal the contract's settings. */
export const LOT_SIZE_SETTING_KEYS = {
  enabled: 'user_lot_size_entry_enabled',
  min_sqm: 'user_lot_size_min_sqm',
  max_sqm: 'user_lot_size_max_sqm',
  ratio_max: 'user_lot_size_city_ratio_max',
  per_day: 'user_lot_size_entries_per_day',
} as const;
if (JSON.stringify(LOT_SIZE_SETTING_KEYS) !== JSON.stringify(CONTRACT.settings)) {
  throw new Error('lot-size-entry-contract.json settings differ from LOT_SIZE_SETTING_KEYS in src/lib/parcels/lot-size-entry.ts');
}

/** The verified lot-area sources (FE-20 "verified outranks user"). Closed and EMPTY: 'stated' and 'geom_backfill' are City values (migration 214). */
export const VERIFIED_LOT_AREA_SOURCES: readonly string[] = [];
export const UNITS = ['sqft', 'm2'] as const;
export type LotUnit = (typeof UNITS)[number];

export interface LotSizeSettings { enabled: boolean; min_sqm: number; max_sqm: number; ratio_max: number; per_day: number }

export class LotSizeSettingsError extends Error {
  constructor(readonly bad: string[]) {
    super(`logic_variables missing, non-numeric or outside the seed bounds: ${bad.join(', ')}`);
    this.name = 'LotSizeSettingsError';
  }
}

type SeedRow = { min?: number; max?: number; default?: number };
const SEED = seedJson as unknown as Record<string, SeedRow>;
/** The seed bounds of one key, read per call (the seed is the bound authority; a missing bound throws). */
const boundsOf = (k: string): { min: number; max: number } => {
  const s = SEED[k];
  if (!s || typeof s.min !== 'number' || typeof s.max !== 'number' || typeof s.default !== 'number') throw new Error(`logic_variables seed has no bounds for ${k}`);
  return { min: s.min, max: s.max };
};
for (const k of Object.values(LOT_SIZE_SETTING_KEYS)) boundsOf(k); // fail at load on a seed without bounds

/**
 * The five settings in ONE read. The switch never throws: anything but exactly 1 inside its seed bounds (0-0 today) reads OFF. The other four are
 * checked only when the switch is on (an entry depends on them): missing, non-numeric, outside the seed bounds or min >= max throws (fail closed, 500).
 */
export async function readLotSizeSettings(db: Queryable): Promise<LotSizeSettings> {
  const res = await db.query<{ variable_key: string; variable_value: string | number | null }>(
    'SELECT variable_key, variable_value FROM logic_variables WHERE variable_key = ANY($1::text[])',
    [Object.values(LOT_SIZE_SETTING_KEYS)],
  );
  const raw = new Map(res.rows.map((r) => [r.variable_key, r.variable_value === null ? NaN : Number(r.variable_value)]));
  const sw = raw.get(LOT_SIZE_SETTING_KEYS.enabled);
  const swb = boundsOf(LOT_SIZE_SETTING_KEYS.enabled);
  const enabled = sw === 1 && sw >= swb.min && sw <= swb.max;
  const num = (k: string): number => raw.get(k) ?? NaN;
  const out: LotSizeSettings = {
    enabled,
    min_sqm: num(LOT_SIZE_SETTING_KEYS.min_sqm),
    max_sqm: num(LOT_SIZE_SETTING_KEYS.max_sqm),
    ratio_max: num(LOT_SIZE_SETTING_KEYS.ratio_max),
    per_day: num(LOT_SIZE_SETTING_KEYS.per_day),
  };
  if (!enabled) return out;
  const bad: string[] = [];
  for (const k of [LOT_SIZE_SETTING_KEYS.min_sqm, LOT_SIZE_SETTING_KEYS.max_sqm, LOT_SIZE_SETTING_KEYS.ratio_max, LOT_SIZE_SETTING_KEYS.per_day]) {
    const v = num(k);
    const b = boundsOf(k);
    if (!Number.isFinite(v) || v < b.min || v > b.max) bad.push(k);
  }
  if (!Number.isInteger(out.per_day)) bad.push(LOT_SIZE_SETTING_KEYS.per_day);
  if (bad.length === 0 && out.min_sqm >= out.max_sqm) bad.push(`${LOT_SIZE_SETTING_KEYS.min_sqm} >= ${LOT_SIZE_SETTING_KEYS.max_sqm}`);
  if (bad.length) throw new LotSizeSettingsError([...new Set(bad)]);
  return out;
}

// ---- server formatting (display rules area_sqft, area_m2, area_sqft_m2_dot, date_dmy; brief v4 display rules) -----------------------------

const whole = (n: number): string => Math.round(n).toLocaleString('en-CA');
const twoDp = (n: number): string => n.toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
/** area_sqft_m2_dot: "3,120 sq ft · 290 m²" from a stored m² value. */
export const formatAreaSqftM2Dot = (sqm: number): string => `${whole(sqm * SQM_TO_SQFT)} sq ft · ${whole(sqm)} m²`;
/** date_dmy: "10 Nov 2026", Toronto time. */
export const formatDateDmy = (d: Date): string => {
  const parts = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Toronto' }).formatToParts(d);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')} ${get('month')} ${get('year')}`;
};
const fill = (key: string, vars: Record<string, string>): string => {
  const t = PAGE[key];
  if (typeof t !== 'string') throw new Error(`report page text ${key} is missing`);
  return t.replace(/\{(\w+)\}/g, (_, v: string) => vars[v] ?? `{${v}}`);
};

// ---- the D-2 range and the D-3 City ratio --------------------------------------------------------------------------------------------------

/** The typed value in m², UNROUNDED (the check runs on it; rounding is for storage only). */
export const toSqm = (value: number, unit: LotUnit): number => (unit === 'm2' ? value : value / SQM_TO_SQFT);
export const round2 = (n: number): number => Math.round(n * 100) / 100;

/** The shown bounds per unit: the setting at the unit's display precision (whole sq ft; m² to 2 decimals). The typed value is checked against these. */
export const shownBounds = (s: Pick<LotSizeSettings, 'min_sqm' | 'max_sqm'>): Record<LotUnit, { lo: number; hi: number }> => ({
  sqft: { lo: Math.round(s.min_sqm * SQM_TO_SQFT), hi: Math.round(s.max_sqm * SQM_TO_SQFT) },
  m2: { lo: round2(s.min_sqm), hi: round2(s.max_sqm) },
});

export type LotSizeProblem = { code: 'OUT_OF_RANGE' | 'FAR_FROM_CITY_RECORD'; message: string };

/** null when the entry passes; else the refusal with the server-formatted message in the typed unit. */
export function lotSizeProblems(value: number, unit: LotUnit, citySqm: number | null, s: LotSizeSettings): LotSizeProblem | null {
  const b = shownBounds(s)[unit];
  if (!(value >= b.lo && value <= b.hi)) {
    const fmt = unit === 'sqft' ? whole : twoDp;
    return { code: 'OUT_OF_RANGE', message: fill(unit === 'sqft' ? 'sheet.err_range_sqft' : 'sheet.err_range_m2', { lo: fmt(b.lo), hi: fmt(b.hi) }) };
  }
  const sqm = toSqm(value, unit);
  if (citySqm !== null && citySqm > 0 && (sqm > citySqm * s.ratio_max || sqm < citySqm / s.ratio_max)) {
    return { code: 'FAR_FROM_CITY_RECORD', message: fill('sheet.err_ratio', { city: formatAreaSqftM2Dot(citySqm) }) };
  }
  return null;
}

// ---- the read and the precedence (FE-20) ---------------------------------------------------------------------------------------------------

export interface LotSizeEntry { id: string; value_sqm: number; source: 'user'; entered_at: Date }
export interface LotSizeRead { parcel_pk: number; city_sqm: number | null; city_source: string | null; entry: LotSizeEntry | null }

/** ONE statement: the lot (by its City parcel id), its City value and source, and its active lot_area entry if any. null when no such lot. */
export async function readLotSizeRead(db: Queryable, parcelRef: string): Promise<LotSizeRead | null> {
  const res = await db.query<{ parcel_pk: number; city_sqm: string | null; city_source: string | null; entry_id: string | null; value_sqm: string | null; entered_at: Date | string | null }>(
    `SELECT p.id AS parcel_pk, p.lot_size_sqm AS city_sqm, p.lot_size_source AS city_source,
            u.id::text AS entry_id, u.value_sqm, u.entered_at
       FROM parcels p
       LEFT JOIN parcel_user_inputs u
         ON u.parcel_id = p.id AND u.input_key = 'lot_area' AND u.status = 'active'
      WHERE p.parcel_id = $1
      LIMIT 1`,
    [parcelRef],
  );
  const r = res.rows[0];
  if (!r) return null;
  const entry = r.entry_id !== null && r.value_sqm !== null && r.entered_at !== null
    ? { id: r.entry_id, value_sqm: Number(r.value_sqm), source: 'user' as const, entered_at: new Date(r.entered_at) }
    : null;
  return { parcel_pk: Number(r.parcel_pk), city_sqm: r.city_sqm === null ? null : Number(r.city_sqm), city_source: r.city_source, entry };
}

export type EffectiveLotSize = { sqm: number; provenance: 'verified' | 'user' | 'estimated'; entered_at: Date | null } | null;

/** FE-20: a verified source > the active user entry > the City value. A reverted entry is never read (the SQL takes the active row only). */
export function effectiveLotSize(read: LotSizeRead): EffectiveLotSize {
  if (read.city_sqm !== null && read.city_source !== null && VERIFIED_LOT_AREA_SOURCES.includes(read.city_source)) {
    return { sqm: read.city_sqm, provenance: 'verified', entered_at: null };
  }
  if (read.entry) return { sqm: read.entry.value_sqm, provenance: 'user', entered_at: read.entry.entered_at };
  if (read.city_sqm !== null) return { sqm: read.city_sqm, provenance: 'estimated', entered_at: null };
  return null;
}

// ---- the report page flags and values (D-5, D-6) -------------------------------------------------------------------------------------------

export const PAGE_FLAGS = ['lot_size_entry_open', 'lot_size_entered', 'lot_size_entry_used'] as const;
export type PageFlags = Record<(typeof PAGE_FLAGS)[number], boolean>;

/**
 * resultsInputStamp: the entered_at the stored McBylaws results were computed with (the one-lot re-evaluation row, D-8, defines it; null
 * until then), so "Every option is recalculated" can never show before it is true.
 */
export function lotSizePageFlags(read: LotSizeRead, s: Pick<LotSizeSettings, 'enabled'>, resultsInputStamp: string | null): PageFlags {
  const entered = read.entry !== null;
  return {
    lot_size_entry_open: s.enabled && !entered,
    lot_size_entered: entered,
    lot_size_entry_used: entered && resultsInputStamp !== null && resultsInputStamp === read.entry!.entered_at.toISOString(),
  };
}

/** The after-entry line's two server-formatted values (page keys entered.value, entered.date); none without an entry. Never the author. */
export function lotSizeEntryValues(read: LotSizeRead): Record<string, string> {
  if (!read.entry) return {};
  return { 'entered.value': formatAreaSqftM2Dot(read.entry.value_sqm), 'entered.date': formatDateDmy(read.entry.entered_at) };
}

// ---- the writes ----------------------------------------------------------------------------------------------------------------------------

export class LotSizeRefusal extends Error {
  constructor(readonly status: 400 | 404 | 409, readonly code: string, message: string, readonly details?: unknown) {
    super(message);
    this.name = 'LotSizeRefusal';
  }
}

/** The stored-entry projection every response carries (never entered_by, never the typed value). */
export const entryView = (e: { value_sqm: number; entered_at: Date }) => ({
  sqm: e.value_sqm,
  display: formatAreaSqftM2Dot(e.value_sqm),
  entered_at: e.entered_at.toISOString(),
  entered_at_display: formatDateDmy(e.entered_at),
  source: 'user' as const,
});

const isUniqueViolation = (e: unknown): boolean => typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505';

/**
 * The entry, once, inside the caller's transaction: 404 unknown lot, 409 already entered (also a lost race: the 23505 of the partial unique index),
 * 400 out of range or far from the City record; else one insert with source 'user' and entered_at from the DB clock.
 */
export async function insertLotSizeEntry(
  client: PoolClient,
  body: { parcel_id: string; lot_area_value: number; lot_area_unit: LotUnit },
  enteredBy: string,
  s: LotSizeSettings,
): Promise<ReturnType<typeof entryView>> {
  const read = await readLotSizeRead(client, body.parcel_id);
  if (!read) throw new LotSizeRefusal(404, 'PARCEL_NOT_FOUND', 'No lot has that parcel id');
  if (read.entry) throw new LotSizeRefusal(409, 'LOT_SIZE_ALREADY_ENTERED', 'A lot size is already entered for this lot', { lot_size: entryView(read.entry) });
  const problem = lotSizeProblems(body.lot_area_value, body.lot_area_unit, read.city_sqm, s);
  if (problem) throw new LotSizeRefusal(400, problem.code, problem.message);
  const sqm = round2(toSqm(body.lot_area_value, body.lot_area_unit));
  try {
    const ins = await client.query<{ value_sqm: string; entered_at: Date | string }>(
      `INSERT INTO parcel_user_inputs (parcel_id, input_key, value_sqm, typed_value, typed_unit, source, entered_by)
       VALUES ($1, 'lot_area', $2, $3, $4, 'user', $5)
       RETURNING value_sqm, entered_at`,
      [read.parcel_pk, sqm, body.lot_area_value, body.lot_area_unit, enteredBy],
    );
    const row = ins.rows[0]!;
    return entryView({ value_sqm: Number(row.value_sqm), entered_at: new Date(row.entered_at) });
  } catch (e) {
    if (isUniqueViolation(e)) throw new LotSizeRefusal(409, 'LOT_SIZE_ALREADY_ENTERED', 'A lot size is already entered for this lot');
    throw e;
  }
}

/** The admin revert (D-4): the active entry flips to reverted (kept as history). Returns the response and the admin_audit_log row for the caller's transaction. */
export async function revertLotSizeEntry(client: PoolClient, parcelRef: string, adminUid: string): Promise<{ out: { parcel_id: string; reverted: ReturnType<typeof entryView> }; audit: AdminAuditParams }> {
  const read = await readLotSizeRead(client, parcelRef);
  if (!read) throw new LotSizeRefusal(404, 'PARCEL_NOT_FOUND', 'No lot has that parcel id');
  if (!read.entry) throw new LotSizeRefusal(404, 'NO_ACTIVE_ENTRY', 'This lot has no entered lot size to revert');
  const upd = await client.query(
    `UPDATE parcel_user_inputs SET status = 'reverted', reverted_at = NOW(), reverted_by = $2
      WHERE id = $1::bigint AND status = 'active'`,
    [read.entry.id, adminUid],
  );
  if (upd.rowCount !== 1) throw new LotSizeRefusal(409, 'STALE_ENTRY', 'The entry changed; reload and try again');
  const view = entryView(read.entry);
  return {
    out: { parcel_id: parcelRef, reverted: view },
    audit: { adminUid, action: 'lot_size_revert', targetUid: parcelRef, oldValue: { entry_id: read.entry.id, value_sqm: view.sqm, entered_at: view.entered_at, status: 'active' }, newValue: { status: 'reverted' }, reason: 'admin lot size revert' },
  };
}
