// 🔗 SPEC LINK: docs/specs/01-pipeline/40_pipeline_system.md (manifest telemetry_tables)
//   + docs/specs/01-pipeline/26_*.md §3.1 (Step-Output Inspector host)
//
// Manifest-derived helpers for the Step-Output Inspector: slug → primary output table
// (the table/step axis), a Postgres identifier quoter, and table column/type listing.

import manifest from '../../../scripts/manifest.json';
import { query } from '@/lib/db/client';

// User-behavioral tables (Firebase user_id per row) — EXCLUDED from the inspector allow-list.
// The inspector is for pipeline data-quality transparency, not end-user behavior.
// Per-user behavior/notification tables are NOT inspectable via the admin
// step-output surface (same policy as lead_views/tracked_projects/lead_analytics):
// notifications + notification_dispatches record who was messaged about which
// lead (P25 dispatch_notifications step) — sensitive per-user history, excluded.
const PII_EXCLUDED = new Set<string>([
  'lead_views',
  'tracked_projects',
  'lead_analytics',
  'notifications',
  'notification_dispatches',
]);

type ManifestScripts = Record<string, { telemetry_tables?: string[] }>;
const SCRIPTS = (manifest as unknown as { scripts?: ManifestScripts }).scripts ?? {};

/**
 * slug → primary output table, derived from manifest `telemetry_tables[0]` (Spec 40 SoT).
 * Tableless steps (asserts/observers) and PII tables are OMITTED — a slug absent from this
 * map has no inspectable output. Derived at module load, not hand-maintained.
 */
export const STEP_TELEMETRY_TABLES: Record<string, string> = Object.fromEntries(
  Object.entries(SCRIPTS)
    .map(([slug, s]) => [slug, s?.telemetry_tables?.[0]] as const)
    .filter((e): e is readonly [string, string] => typeof e[1] === 'string' && !PII_EXCLUDED.has(e[1]))
);

/** The slug's primary output table, or null if the step has no inspectable table. */
export function getStepTelemetryTable(slug: string): string | null {
  return STEP_TELEMETRY_TABLES[slug] ?? null;
}

const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Quote a Postgres identifier (table/column). Throws on anything outside [A-Za-z0-9_] —
 * the load-bearing second fence behind the manifest/information_schema allow-lists.
 * (TS mirror of scripts/lib/pipeline.js quoteIdent; the CJS one can't cross the §10.2 boundary.)
 */
export function quoteIdent(name: string): string {
  if (!IDENT_RE.test(name)) throw new Error(`Invalid identifier: ${name}`);
  return `"${name}"`;
}

export interface TableColumn {
  name: string;
  dataType: string;
}

// data_types whose ::text cast is not usefully filterable (hex EWKB / blob / array / json).
const NON_FILTERABLE_TYPES = new Set<string>(['USER-DEFINED', 'jsonb', 'json', 'ARRAY', 'bytea']);

/** True when a column can back a `::text ILIKE` prefix filter (scalar/text-castable). */
export function isFilterable(col: TableColumn): boolean {
  return !NON_FILTERABLE_TYPES.has(col.dataType);
}

/** Columns of a public table in definition order. Parameterized; safe for any table name. */
export async function fetchTableColumns(table: string): Promise<TableColumn[]> {
  const rows = await query<{ column_name: string; data_type: string }>(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table]
  );
  return rows.map((r) => ({ name: r.column_name, dataType: r.data_type }));
}
