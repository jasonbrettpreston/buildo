/**
 * Control Panel — shared types, Zod schemas, and DB query helpers.
 *
 * Single source of truth for the MarketplaceConfig interface used by:
 *   - API routes: src/app/api/admin/control-panel/**
 *   - Frontend:   src/features/admin-controls/lib/schemas.ts (re-exports)
 *
 * SPEC LINK: docs/specs/product/future/86_control_panel.md
 *
 * DUAL PATH NOTE: scripts/lib/config-loader.js is the pipeline-side reader of
 * these same tables. Do NOT modify config-loader.js from this file. Schema
 * parity is enforced by src/tests/control-panel.logic.test.ts.
 */

import { z } from 'zod';
import type { Pool } from 'pg';

// ─────────────────────────────────────────────────────────────────────────────
// §1 — TypeScript interfaces (stable API field names — see §10.3)
// ─────────────────────────────────────────────────────────────────────────────

/** A single row from the logic_variables table. */
export interface LogicVariableRow {
  key: string;
  /** Numeric value (null if this is a JSON-type variable like income_premium_tiers) */
  value: number | null;
  /** JSON value for non-numeric variables (null for numeric-only variables) */
  jsonValue: Record<string, number> | null;
  description: string | null;
  updatedAt: string;
}

/** A merged row from trade_configurations JOIN trade_sqft_rates. */
export interface TradeConfigRow {
  tradeSlug: string;
  // From trade_configurations:
  bidPhaseCutoff: string;
  workPhaseTarget: string;
  imminentWindowDays: number;
  allocationPct: number;
  multiplierBid: number;
  multiplierWork: number;
  // From trade_sqft_rates:
  baseRateSqft: number;
  structureComplexityFactor: number;
}

/** A single cell in the scope intensity matrix. */
export interface ScopeMatrixRow {
  permitType: string;
  structureType: string;
  gfaAllocationPercentage: number;
}

/** Complete current state of all control-panel tables. */
export interface MarketplaceConfig {
  logicVariables: LogicVariableRow[];
  tradeConfigs: TradeConfigRow[];
  scopeMatrix: ScopeMatrixRow[];
}

/** Partial diff payload for PUT /api/admin/control-panel/configs */
export interface ConfigUpdatePayload {
  logicVariables?: Array<{
    key: string;
    /** Updated numeric value (null if updating a JSON variable) */
    value?: number | null;
    /** Updated JSON value (null to clear) */
    jsonValue?: Record<string, number> | null;
  }>;
  tradeConfigs?: Array<{
    tradeSlug: string;
    bidPhaseCutoff?: string;
    workPhaseTarget?: string;
    imminentWindowDays?: number;
    allocationPct?: number;
    multiplierBid?: number;
    multiplierWork?: number;
    baseRateSqft?: number;
    structureComplexityFactor?: number;
  }>;
  scopeMatrix?: ScopeMatrixRow[];
}

/** GET /api/admin/control-panel/configs response shape */
export interface ConfigsGetResponse {
  data: MarketplaceConfig;
  meta: { fetched_at: string };
}

/** PUT /api/admin/control-panel/configs response shape */
export interface ConfigsPutResponse {
  data: { rows_updated: number };
  error: string | null;
  meta: { updated_at: string };
}

/** POST /api/admin/control-panel/resync response shape */
export interface ResyncPostResponse {
  data: { pipeline_run_ids: string[] };
  error: string | null;
  meta: { triggered_at: string; steps: string[] };
}

// ─────────────────────────────────────────────────────────────────────────────
// §2 — Zod schemas (validates inbound PUT payloads; enforce on both sides)
// ─────────────────────────────────────────────────────────────────────────────

/** Validates a single logic_variable update in the diff payload. */
export const LogicVariableUpdateSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.number().finite().nullable().optional(),
  jsonValue: z.record(z.string(), z.number().finite()).nullable().optional(),
});

/** Validates a single trade_config update in the diff payload. */
export const TradeConfigUpdateSchema = z.object({
  tradeSlug: z.string().min(1).max(50),
  bidPhaseCutoff: z.string().min(2).max(10).optional(),
  workPhaseTarget: z.string().min(2).max(10).optional(),
  imminentWindowDays: z.number().int().min(0).max(365).optional(),
  allocationPct: z.number().finite().min(0).max(1).optional(),
  multiplierBid: z.number().finite().positive().max(10).optional(),
  multiplierWork: z.number().finite().positive().max(10).optional(),
  baseRateSqft: z.number().finite().positive().optional(),
  structureComplexityFactor: z.number().finite().min(0.5).max(3.0).optional(),
});

/** Validates a single scope_intensity_matrix update. */
export const ScopeMatrixUpdateSchema = z.object({
  permitType: z.string().min(1).max(100),
  structureType: z.string().min(1).max(100),
  gfaAllocationPercentage: z.number().finite().min(0.0001).max(1.0),
});

/** Full PUT body schema. */
export const ConfigUpdatePayloadSchema = z.object({
  logicVariables: z.array(LogicVariableUpdateSchema).optional(),
  tradeConfigs: z.array(TradeConfigUpdateSchema).optional(),
  scopeMatrix: z.array(ScopeMatrixUpdateSchema).optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// §3 — System defaults (mirror of scripts/lib/config-loader.js FALLBACK_LOGIC_VARS)
//
// These are the "ground truth" defaults the Delta Guard compares drafts against.
// Schema parity with config-loader.js FALLBACK_LOGIC_VARS is enforced by:
//   src/tests/control-panel.logic.test.ts — reads config-loader.js as text and
//   asserts every key here is present there.
// ─────────────────────────────────────────────────────────────────────────────

export const LOGIC_VAR_DEFAULTS: Record<string, number> = {
  los_multiplier_bid: 2.5,
  los_multiplier_work: 1.5,
  los_penalty_tracking: 50,
  los_penalty_saving: 10,
  los_base_cap: 30,
  los_base_divisor: 10000,
  stall_penalty_precon: 45,
  stall_penalty_active: 14,
  expired_threshold_days: -90,
  liar_gate_threshold: 0.25,
  lead_expiry_days: 90,
  coa_stall_threshold: 30,
  calibration_min_sample_size: 5,
  urban_coverage_ratio: 0.70,
  suburban_coverage_ratio: 0.40,
  trust_threshold_pct: 0.25,
  commercial_shell_multiplier: 0.60,
  placeholder_cost_threshold: 1000,
};

// ─────────────────────────────────────────────────────────────────────────────
// §4 — Delta Guard utility
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if the draft value deviates from the system default by more
 * than 50%. Used to trigger the amber warning UI in the Control Panel.
 *
 * @example deltaExceeds50pct('los_base_divisor', 4000, LOGIC_VAR_DEFAULTS) → true (10000 * 0.5 = 5000, 4000 < 5000)
 */
export function deltaExceeds50pct(
  key: string,
  draftValue: number,
  defaults: Record<string, number> = LOGIC_VAR_DEFAULTS,
): boolean {
  const defaultValue = defaults[key];
  if (defaultValue === undefined || defaultValue === 0) return false;
  const deviation = Math.abs(draftValue - defaultValue) / Math.abs(defaultValue);
  return deviation > 0.5;
}

// ─────────────────────────────────────────────────────────────────────────────
// §5 — DB query helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Loads the complete current state of all control-panel tables.
 * Issues 3 SELECTs (logic_variables, trade_configurations + trade_sqft_rates JOIN, scope_intensity_matrix).
 *
 * @param pool - pg Pool instance (use src/lib/db/client.ts pool)
 */
export async function loadAllConfigs(pool: Pool): Promise<MarketplaceConfig> {
  // 1. Logic variables (all rows, including new JSONB ones)
  const { rows: lvRows } = await pool.query<{
    variable_key: string;
    variable_value: string | null;
    variable_value_json: Record<string, number> | null;
    description: string | null;
    updated_at: Date;
  }>(
    `SELECT variable_key, variable_value, variable_value_json, description, updated_at
       FROM logic_variables
      ORDER BY variable_key`,
  );

  const logicVariables: LogicVariableRow[] = lvRows.map((r) => ({
    key: r.variable_key,
    value: r.variable_value !== null ? parseFloat(r.variable_value) : null,
    jsonValue: r.variable_value_json ?? null,
    description: r.description,
    updatedAt: r.updated_at.toISOString(),
  }));

  // 2. Trade configs — JOIN trade_configurations + trade_sqft_rates
  const { rows: tcRows } = await pool.query<{
    trade_slug: string;
    bid_phase_cutoff: string;
    work_phase_target: string;
    imminent_window_days: number;
    allocation_pct: string;
    multiplier_bid: string;
    multiplier_work: string;
    base_rate_sqft: string | null;
    structure_complexity_factor: string | null;
  }>(
    `SELECT tc.trade_slug,
            tc.bid_phase_cutoff,
            tc.work_phase_target,
            tc.imminent_window_days,
            tc.allocation_pct,
            tc.multiplier_bid,
            tc.multiplier_work,
            tsr.base_rate_sqft,
            tsr.structure_complexity_factor
       FROM trade_configurations tc
       LEFT JOIN trade_sqft_rates tsr ON tsr.trade_slug = tc.trade_slug
      ORDER BY tc.trade_slug`,
  );

  const tradeConfigs: TradeConfigRow[] = tcRows.map((r) => ({
    tradeSlug: r.trade_slug,
    bidPhaseCutoff: r.bid_phase_cutoff,
    workPhaseTarget: r.work_phase_target,
    imminentWindowDays: r.imminent_window_days,
    allocationPct: parseFloat(r.allocation_pct),
    multiplierBid: parseFloat(r.multiplier_bid),
    multiplierWork: parseFloat(r.multiplier_work),
    baseRateSqft: r.base_rate_sqft !== null ? parseFloat(r.base_rate_sqft) : 0,
    structureComplexityFactor: r.structure_complexity_factor !== null
      ? parseFloat(r.structure_complexity_factor)
      : 1.0,
  }));

  // 3. Scope intensity matrix
  const { rows: simRows } = await pool.query<{
    permit_type: string;
    structure_type: string;
    gfa_allocation_percentage: string;
  }>(
    `SELECT permit_type, structure_type, gfa_allocation_percentage
       FROM scope_intensity_matrix
      ORDER BY permit_type, structure_type`,
  );

  const scopeMatrix: ScopeMatrixRow[] = simRows.map((r) => ({
    permitType: r.permit_type,
    structureType: r.structure_type,
    gfaAllocationPercentage: parseFloat(r.gfa_allocation_percentage),
  }));

  return { logicVariables, tradeConfigs, scopeMatrix };
}

/**
 * Applies a ConfigUpdatePayload diff to the database inside a single transaction.
 * Uses IS DISTINCT FROM guards to avoid touching unchanged rows (WAL health).
 *
 * @param pool - pg Pool instance
 * @param payload - Validated diff from ConfigUpdatePayloadSchema
 * @returns Total number of rows actually updated
 */
export async function applyConfigUpdate(
  pool: Pool,
  payload: z.infer<typeof ConfigUpdatePayloadSchema>,
): Promise<number> {
  const client = await pool.connect();
  let rowsUpdated = 0;

  try {
    await client.query('BEGIN');

    // ── logic_variables updates ──────────────────────────────────────
    if (payload.logicVariables?.length) {
      for (const lv of payload.logicVariables) {
        const { rowCount } = await client.query(
          `UPDATE logic_variables
              SET variable_value      = COALESCE($2, variable_value),
                  variable_value_json = $3,
                  updated_at          = NOW()
            WHERE variable_key = $1
              AND (
                (variable_value IS DISTINCT FROM $2 AND $2 IS NOT NULL)
                OR (variable_value_json IS DISTINCT FROM $3)
              )`,
          [lv.key, lv.value ?? null, lv.jsonValue ?? null],
        );
        rowsUpdated += rowCount ?? 0;
      }
    }

    // ── trade_configurations updates ─────────────────────────────────
    if (payload.tradeConfigs?.length) {
      for (const tc of payload.tradeConfigs) {
        // Update trade_configurations fields
        const tcFields: { col: string; val: unknown }[] = [];
        if (tc.bidPhaseCutoff !== undefined) tcFields.push({ col: 'bid_phase_cutoff', val: tc.bidPhaseCutoff });
        if (tc.workPhaseTarget !== undefined) tcFields.push({ col: 'work_phase_target', val: tc.workPhaseTarget });
        if (tc.imminentWindowDays !== undefined) tcFields.push({ col: 'imminent_window_days', val: tc.imminentWindowDays });
        if (tc.allocationPct !== undefined) tcFields.push({ col: 'allocation_pct', val: tc.allocationPct });
        if (tc.multiplierBid !== undefined) tcFields.push({ col: 'multiplier_bid', val: tc.multiplierBid });
        if (tc.multiplierWork !== undefined) tcFields.push({ col: 'multiplier_work', val: tc.multiplierWork });

        if (tcFields.length > 0) {
          const setClauses = tcFields
            .map((f, i) => `${f.col} = $${i + 2}`)
            .join(', ');
          // IS DISTINCT FROM guard: skip rows where all payload fields already match
          // (consistent with logic_variables and scope_intensity_matrix — prevents WAL bloat)
          const distinctClauses = tcFields
            .map((f, i) => `${f.col} IS DISTINCT FROM $${i + 2}`)
            .join(' OR ');
          const params = [tc.tradeSlug, ...tcFields.map((f) => f.val)];
          const { rowCount } = await client.query(
            `UPDATE trade_configurations
                SET ${setClauses}, updated_at = NOW()
              WHERE trade_slug = $1
                AND (${distinctClauses})`,
            params,
          );
          rowsUpdated += rowCount ?? 0;
        }

        // Update trade_sqft_rates fields
        const tsrFields: { col: string; val: unknown }[] = [];
        if (tc.baseRateSqft !== undefined) tsrFields.push({ col: 'base_rate_sqft', val: tc.baseRateSqft });
        if (tc.structureComplexityFactor !== undefined) tsrFields.push({ col: 'structure_complexity_factor', val: tc.structureComplexityFactor });

        if (tsrFields.length > 0) {
          const setClauses = tsrFields
            .map((f, i) => `${f.col} = $${i + 2}`)
            .join(', ');
          const distinctClauses = tsrFields
            .map((f, i) => `${f.col} IS DISTINCT FROM $${i + 2}`)
            .join(' OR ');
          const params = [tc.tradeSlug, ...tsrFields.map((f) => f.val)];
          const { rowCount } = await client.query(
            `UPDATE trade_sqft_rates
                SET ${setClauses}, updated_at = NOW()
              WHERE trade_slug = $1
                AND (${distinctClauses})`,
            params,
          );
          rowsUpdated += rowCount ?? 0;
        }
      }
    }

    // ── scope_intensity_matrix upserts ───────────────────────────────
    if (payload.scopeMatrix?.length) {
      for (const cell of payload.scopeMatrix) {
        const { rowCount } = await client.query(
          `INSERT INTO scope_intensity_matrix (permit_type, structure_type, gfa_allocation_percentage, updated_at)
               VALUES ($1, $2, $3, NOW())
           ON CONFLICT (permit_type, structure_type)
           DO UPDATE SET
               gfa_allocation_percentage = EXCLUDED.gfa_allocation_percentage,
               updated_at = NOW()
             WHERE scope_intensity_matrix.gfa_allocation_percentage IS DISTINCT FROM EXCLUDED.gfa_allocation_percentage`,
          [cell.permitType, cell.structureType, cell.gfaAllocationPercentage],
        );
        rowsUpdated += rowCount ?? 0;
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return rowsUpdated;
}
