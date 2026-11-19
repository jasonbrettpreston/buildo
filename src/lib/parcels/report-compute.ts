// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §3.2 (the nullable `page`); docs/specs/02-web-admin/126_maxbld_surface_standard.md §11a.7,
//            §11b.2 dated note 2026-11-11 (never a second resolver); docs/specs/01-pipeline/69a_mcbylaw_register.md M-384 (Layer 3 is the step's own pure
//            core); docs/specs/00_engineering_standards.md (parameterised SQL; Standard 10.2: this file imports scripts/ code, it modifies none).
//
// LOAD.1 (task-266, Increment 1·B; operator "2. y", MORNING-DECISIONS.md:1061, RR-0271, and "task 341 approved", :1160) · the one-lot report compute at
// the lookup pick. When a user picks a lot and the stored read W (src/lib/parcels/report-page.ts) answers a miss (no stored record, or a stale one), the
// lookup route calls this entry, which computes THAT lot's rows in memory with the Layer 3 step's OWN pure core (materializeRows and buildSourceSql, the
// exports the pipeline step runs; never a copy of a formula), maps them to the stored-row shape and hands them to the shared projection
// (src/lib/report-projection/project.ts), then applies W's miss rule (pageForVerdict, one place). Nothing is written (the record write is ST.P1, task-265).
//
// THE GATE is the existing web live switch ALONE, the first statement of the entry: decision D-1 (who sees numbers before launch, task-348) is not ruled,
// so this adds no session gate, no admin condition and no new switch. While the switch is false the entry answers null before any read and the core is
// never imported: the compute is dark code at landing, as W is. A later ruling on D-1 changes that one expression and its one test (C1).
// Null = a miss: the switch is off, no such parcel, no Layer 2 stamp for the lot, no batch row for it. A thrown query or a core error propagates (the
// route's error boundary makes it a 500 with no page and no meter); it is never read as a miss. No process cache: config and lookups are read per request.
// Server only: no meter, no entitlement, no usage, no user id, no write.
import { pool } from '@/lib/db/client';
import { pageForVerdict } from '@/lib/parcels/report-page';
import { projectStoredPage, type StoredRow } from '@/lib/report-projection/project';
import { readLotFacts } from '@/lib/report-projection/read-stored';
import { CURRENT_SEED_SHAS } from '@/lib/report-projection/seed-shas';
import { MAXBLD_WEB_LIVE } from '@/lib/surfaces/maxbld-web';

type Json = Record<string, unknown>;

/** The declared step setting the core's batch statement writes in as its population ids (a validated config list of decimal strings). For one lot the
 *  list is that lot alone, so the keyset bind [id - 1, 1] returns exactly that lot (the core's own statement, unchanged). */
const POPULATION_SETTING = 'compute_maxbld_scenarios_population_parcel_ids';

/** The two role-lookup reads of the step descriptor, as static statements (the runner reads them once per run; here once per request). A drift from the
 *  descriptor's declared lookup tables and columns fails src/tests/customer-report-compute.logic.test.ts (C2). */
const UNITS_SQL = 'SELECT unit_key, unit_id FROM bylaw_resolution_units';
const TEXTS_SQL = 'SELECT text_key, text FROM bylaw_resolution_texts';

interface Core {
  materializeRows(sourceRows: Json[], ctx: { config: Json; lookups: Json }): { rows: { e1: Json[] } };
  buildSourceSql(descriptor: unknown, config: Json, opts: Json): { batch_sql: string; batch_binds: string[] };
}
type ConfigReader = { resolveConfig(db: unknown, descriptor: unknown): Promise<{ values: Json }> };

/** A CommonJS module's export under either interop shape (named on the namespace, or on `default`). */
function exported<T>(mod: unknown, key: string): T {
  const m = mod as Record<string, unknown> & { default?: Record<string, unknown> };
  const v = m[key] ?? m.default?.[key];
  if (v === undefined) throw new Error(`report-compute: the step module does not export ${key}`);
  return v as T;
}

/** One core row as the stored read returns it: the same columns, the jsonb `switches` parsed (the core hands it over as JSON text at its write boundary). */
function toStoredRow(r: Json): StoredRow {
  return {
    building_type: String(r.building_type),
    field_id: String(r.field_id),
    increment: (r.increment ?? null) as StoredRow['increment'],
    status: String(r.status),
    value: (r.value ?? null) as StoredRow['value'],
    unit: (r.unit ?? null) as string | null,
    reason: (r.reason ?? null) as string | null,
    flags: (r.flags ?? null) as string[] | null,
    content_sha: (r.content_sha ?? null) as string | null,
    catalogue_sha: (r.catalogue_sha ?? null) as string | null,
    switchboard_sha: (r.switchboard_sha ?? null) as string | null,
    settings_sha: (r.settings_sha ?? null) as string | null,
    layer2_table_version: (r.layer2_table_version ?? null) as string | null,
    switches: (typeof r.switches === 'string' ? JSON.parse(r.switches) : r.switches ?? null) as NonNullable<StoredRow['switches']> | null,
  };
}

/**
 * The customer page for a lot the stored read missed, computed now. `parcelRef` is parcels.parcel_id. Null = a miss (see the header); otherwise the page
 * response ({page, values, hidden, not_evaluated}) W would have returned had the same rows been stored: the served page for a current or gated lot.
 */
export async function computeCustomerPageResponse(parcelRef: string): Promise<Json | null> {
  if (!MAXBLD_WEB_LIVE) return null;
  const lot = await readLotFacts(pool, parcelRef);
  if (lot === null) return null;
  const core = await import('../../../scripts/lib/compute/compute-maxbld-scenarios.js');
  const configReader = await import('../../../scripts/lib/step/config.js');
  const descriptorModule = await import('../../../scripts/compute-maxbld-scenarios.descriptor.json');
  const descriptor: unknown = (descriptorModule as { default?: unknown }).default ?? descriptorModule;
  const materializeRows = exported<Core['materializeRows']>(core, 'materializeRows');
  const buildSourceSql = exported<Core['buildSourceSql']>(core, 'buildSourceSql');
  const resolveConfig = exported<ConfigReader['resolveConfig']>(configReader, 'resolveConfig');
  const { values: config } = await resolveConfig(pool, descriptor);

  const plan = buildSourceSql(descriptor, { ...config, [POPULATION_SETTING]: [String(lot.id)] }, {});
  if (plan.batch_binds.join() !== 'last_key,batch_size') throw new Error('report-compute: the core batch statement no longer binds last_key and batch_size');
  const lookups = {
    bylaw_resolution_units: (await pool.query<Json>(UNITS_SQL)).rows,
    bylaw_resolution_texts: (await pool.query<Json>(TEXTS_SQL)).rows,
  };
  const row = (await pool.query<Json>(plan.batch_sql, [lot.id - 1, 1])).rows[0];
  if (!row || Number(row.id) !== lot.id || !row.parcel || !row.lot) return null; // no batch row, another lot, no parcels row, or no Layer 2 stamp: a miss

  const out = materializeRows([row], { config, lookups });
  const stamp = row.lot as { lot_gate?: string | null; table_version?: string | null; evaluator_version?: string | null };
  const stored = projectStoredPage({
    lot,
    stamp: { lot_gate: stamp.lot_gate ?? null, table_version: stamp.table_version ?? null, evaluator_version: stamp.evaluator_version ?? null },
    rows: out.rows.e1.map(toStoredRow),
    current: CURRENT_SEED_SHAS,
  });
  return pageForVerdict(stored);
}
