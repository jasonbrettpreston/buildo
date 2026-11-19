// SPEC LINK: docs/specs/00_engineering_standards.md (parameterised SQL); docs/specs/01-pipeline/69a_mcbylaw_register.md M-384 (read the stored Layer 3
//            rows, never recompute); docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.2 dated note 2026-11-11 (MF-48 D-4 a: never a second
//            resolver); docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05, FE-34.
//
// MB-44 W (task-123, 1.3) · the ONE stored read of a lot's report page, shared OUT of the admin preview producer so the customer read module
// (src/lib/parcels/report-page.ts) and the admin preview (src/lib/admin/report-preview-live/stored-page.ts) run the same SQL and the same
// projection without either importing the other (lock L1 in src/tests/admin-report-preview-live.logic.test.ts stays true: nothing outside the admin
// area imports the admin producer). Moved here unchanged from stored-page.ts (MB-93): the four statements, the K2 lineage CASE, the column check.
// Server only. No write, no meter, no entitlement, no usage, no user id: the caller decides who may read and what an absent lot means.
import type { QueryResult, QueryResultRow } from 'pg';
import { CURRENT_SEED_SHAS, type SeedShas } from './seed-shas';
import { pageBindings, projectStoredPage, type Lineage, type LotFacts, type LotStamp, type PageResponse, type StoredRow } from './project';

/** A pg Pool or PoolClient: anything exposing parameterised `query`. */
export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(queryText: string, values?: unknown[]): Promise<QueryResult<R>>;
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

/** One lot's stored page: the page response the renderer takes and the lineage (freshness verdict included). */
export interface StoredPage {
  response: PageResponse;
  lineage: Lineage;
}

/**
 * LOAD.1 (task-266): the parcels half of the read, shared OUT of readStoredPage so the one-lot compute (src/lib/parcels/report-compute.ts) builds the
 * same lot facts (the integer id, the address, the zoning and the page's parcels columns, the K2 lineage CASE included) from the same one static
 * statement, never a second parcels read. `null` = no such parcel.
 */
export async function readLotFacts(db: Queryable, parcelId: string): Promise<LotFacts | null> {
  const p = (await db.query<Record<string, unknown>>(PARCEL_SQL, [parcelId])).rows[0];
  if (!p) return null;
  const columns: Record<string, unknown> = {};
  for (const c of PARCEL_COLUMNS) columns[c] = p[c];
  return { id: Number(p.id), parcel_id: String(p.parcel_id), address: (p.address as string | null) ?? null, zoning: (p.zoning_zn_string as string | null) ?? null, columns };
}

/**
 * The lot by its parcel_id (varchar), its stamp and its stored scenario rows, projected. `null` = no such parcel. While parcel_maxbld_scenarios is
 * absent the read refuses cleanly through to_regclass and the projection takes the not-evaluated path ("a declared read that refuses cleanly").
 * A thrown query propagates: the caller logs it and decides (it is never read as a miss here).
 */
export async function readStoredPage(db: Queryable, parcelId: string, current: SeedShas = CURRENT_SEED_SHAS): Promise<StoredPage | null> {
  const lot = await readLotFacts(db, parcelId);
  if (lot === null) return null;
  const id = lot.id;
  const stamp = (await db.query<LotStamp>(STAMP_SQL, [id])).rows[0] ?? null;
  const present = Boolean((await db.query<{ present: boolean }>(TABLE_SQL)).rows[0]?.present);
  const rows = present ? (await db.query<StoredRow>(ROWS_SQL, [id])).rows : null;
  return projectStoredPage({
    lot,
    stamp,
    rows,
    current,
  });
}
