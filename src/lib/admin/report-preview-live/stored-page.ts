// SPEC LINK: docs/specs/02-web-admin/33_web_admin_engineering_protocol.md section 8 (admin reads); docs/specs/00_engineering_standards.md
//            (parameterised SQL, logError in every catch); docs/specs/01-pipeline/69a_mcbylaw_register.md M-384 (read the stored Layer 3 rows);
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05, FE-34.
//
// MB-93 · the internal preview producer, DB side (server only; imported by the admin preview page, never by a customer route: lock L1 in
// src/tests/admin-report-preview-live.logic.test.ts). Operator 2026-11-11 "D-1 b and D-2 to D-8 a"; plan ~/Buildo-scratch/mcfrontend/PREVIEW/plan.md
// sections 3-4 with the section 9 folds. Order, each step fail-closed:
//   1. the lookup id is validated with the admin lookup contract's own rule (ParcelLookupQuerySchema) before any read or log (L6);
//   2. the switch `maxbld_internal_preview_enabled` is read strictly (only the exact value 1 is on; a missing row, a read error or any other
//      value is off) and OFF reads no lot data (L3, fold 12);
//   3. the varchar lookup id resolves to the integer parcels.id ONCE (fold 5: the Layer 2/3 tables key on parcels.id);
//   4. the lot stamp and the stored rows are read by that id; while parcel_maxbld_scenarios is absent (it lands at MB-35) the read refuses
//      cleanly through to_regclass and every option takes the not-evaluated path ("a declared read that refuses cleanly", the MB-86 precedent).
// No write, no usage_events, no openReport, no entitlement read (the preview is unmetered, plan section 4).
import type { QueryResult, QueryResultRow } from 'pg';
import { ParcelLookupQuerySchema } from '@/app/api/admin/parcels/lookup/types';
import { logError, logInfo } from '@/lib/logger';
import { CURRENT_SEED_SHAS, type SeedShas } from './seed-shas';
import { pageBindings, projectStoredPage, type Lineage, type LotStamp, type PageResponse, type StoredRow } from './project';

/** A pg Pool or PoolClient: anything exposing parameterised `query`. */
export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(queryText: string, values?: unknown[]): Promise<QueryResult<R>>;
}

const TAG = '[admin/report-preview]';
export const PREVIEW_SWITCH_KEY = 'maxbld_internal_preview_enabled';
/** The one value that turns the preview on (D-3 a, Security S4/S5: one exact encoding, anything else off). */
const SWITCH_ON = 1;

export type PreviewOutcome =
  | { outcome: 'invalid_id' }
  | { outcome: 'off' }
  | { outcome: 'not_found'; parcelId: string }
  | { outcome: 'ok'; parcelId: string; response: PageResponse; lineage: Lineage };

/** The switch, read strictly: true only for a row whose numeric value is exactly 1 (the column is NUMERIC, so pg sends "1" for 1, 1.0 and 1.00: the same number). A read error is logged and reads as off. */
export async function readPreviewSwitch(db: Queryable): Promise<boolean> {
  try {
    const r = await db.query<{ variable_value: string | number | null }>(
      'SELECT variable_value FROM logic_variables WHERE variable_key = $1',
      [PREVIEW_SWITCH_KEY],
    );
    const v = r.rows[0]?.variable_value;
    return v !== null && v !== undefined && v !== '' && Number(v) === SWITCH_ON;
  } catch (cause) {
    logError(TAG, cause, { stage: 'switch-read', key: PREVIEW_SWITCH_KEY });
    return false;
  }
}

/** The parcels columns the page binds (declared `parcels:<column>` sources). The parcels read is ONE static statement (the src SQL ledger
 *  witnesses it; no interpolated text), so every bound column must be in its select list: a new parcels-sourced page field fails here at load. */
const PARCEL_COLUMNS: string[] = [...new Set(pageBindings().flatMap((b) => (b.source.kind === 'parcels' ? [b.source.column] : [])))];
// K2: a heritage / ravine yes-no column is NOT NULL DEFAULT false, so a never-enriched lot would read "No"; the lineage column nulls it (the page then shows the dash).
const PARCEL_SQL = `SELECT id, parcel_id, zoning_zn_string, lot_size_sqm, is_corner_lot,
       CASE WHEN heritage_dataset_version_when_enriched IS NULL THEN NULL ELSE is_heritage_designated END AS is_heritage_designated,
       CASE WHEN ravine_dataset_version_when_enriched IS NULL THEN NULL ELSE is_in_ravine_protection_area END AS is_in_ravine_protection_area,
       NULLIF(TRIM(COALESCE(address_number, '') || ' ' || COALESCE(linear_name_full, '')), '') AS address
  FROM parcels WHERE parcel_id = $1 LIMIT 1`;
const PARCEL_SELECTED = ['lot_size_sqm', 'is_corner_lot', 'is_heritage_designated', 'is_in_ravine_protection_area'];
for (const c of PARCEL_COLUMNS) if (!PARCEL_SELECTED.includes(c)) throw new Error(`MB-93: page field source parcels:${c} is not in the static parcels read`);
const STAMP_SQL = 'SELECT lot_gate, table_version, evaluator_version FROM bylaw_resolution_lot_stamps WHERE parcel_id = $1 LIMIT 1';
const TABLE_SQL = "SELECT to_regclass('public.parcel_maxbld_scenarios') IS NOT NULL AS present";
const ROWS_SQL = `SELECT building_type, field_id, increment, status, value, unit, reason, flags, content_sha,
       catalogue_sha, switchboard_sha, settings_sha, layer2_table_version, switches
  FROM parcel_maxbld_scenarios WHERE parcel_id = $1 ORDER BY building_type, field_id`;

/**
 * One admin preview read. `uid` is the admin the page already verified (requireAdminPage); it is logged, never used for access.
 * Every attempt logs one `maxbld_internal_preview_view` line with its outcome; a thrown read is logged with logError and rethrown.
 */
export async function storedPageResponse(db: Queryable, rawParcelId: unknown, opts: { uid?: string; current?: SeedShas } = {}): Promise<PreviewOutcome> {
  const started = Date.now();
  const log = (outcome: string, extra: Record<string, unknown> = {}): void =>
    logInfo(TAG, 'maxbld_internal_preview_view', { uid: opts.uid ?? null, outcome, duration_ms: Date.now() - started, ...extra });

  const parsed = ParcelLookupQuerySchema.safeParse({ parcelId: typeof rawParcelId === 'string' ? rawParcelId : undefined });
  if (!parsed.success || !parsed.data.parcelId) {
    log('invalid_id');
    return { outcome: 'invalid_id' };
  }
  const parcelId = parsed.data.parcelId;
  if (!(await readPreviewSwitch(db))) {
    log('off', { parcelId });
    return { outcome: 'off' };
  }
  try {
    const p = (await db.query<Record<string, unknown>>(PARCEL_SQL, [parcelId])).rows[0];
    if (!p) {
      log('not_found', { parcelId });
      return { outcome: 'not_found', parcelId };
    }
    const id = Number(p.id);
    const stamp = (await db.query<LotStamp>(STAMP_SQL, [id])).rows[0] ?? null;
    const present = Boolean((await db.query<{ present: boolean }>(TABLE_SQL)).rows[0]?.present);
    const rows = present ? (await db.query<StoredRow>(ROWS_SQL, [id])).rows : null;
    const columns: Record<string, unknown> = {};
    for (const c of PARCEL_COLUMNS) columns[c] = p[c];
    const { response, lineage } = projectStoredPage({
      lot: { id, parcel_id: String(p.parcel_id), address: (p.address as string | null) ?? null, zoning: (p.zoning_zn_string as string | null) ?? null, columns },
      stamp,
      rows,
      current: opts.current ?? CURRENT_SEED_SHAS,
    });
    log('ok', {
      parcelId,
      freshness: lineage.freshness.verdict,
      layer3_rows: lineage.layer3.rows,
      values_shown: Object.keys(response.values).length,
      options_hidden: response.hidden.length,
      options_not_evaluated: response.not_evaluated.length,
    });
    return { outcome: 'ok', parcelId, response, lineage };
  } catch (cause) {
    logError(TAG, cause, { stage: 'stored-page-read', parcelId, uid: opts.uid ?? null });
    throw cause;
  }
}
