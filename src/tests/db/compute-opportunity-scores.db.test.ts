// SPEC LINK: docs/specs/01-pipeline/81_opportunity_score_engine.md §2.1 + §3
// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §R10
//
// F.3 — End-to-end CoA scoring calc test (CRIT-v2-A).
// Seeds (CoA cost_estimates + trade_forecasts + lead_analytics + logic_variables),
// invokes scripts/compute-opportunity-scores.js end-to-end, asserts opportunity_score
// matches inline pen-and-paper expected value (CRIT-v3-Y: no formula recomputation in test).
//
// Coverage:
//   T1 — global multiplier fallback path (trade_configurations.framing deleted → falls back to
//        logic_variables.los_multiplier_bid). Asserts score = 3 derived from spec inputs.
//   T2 — per-trade multiplier override path (HIGH-v3-B: distinct expected value 5 vs fallback's 4).
//
// Hermeticity (HIGH-v3-D): beforeAll deletes pipeline_runs for this slug + clears framing trade
//   config + seeds explicit logic_variables overrides. Each test seeds its own lead_id.
//
// Run: BUILDO_TEST_DB=1 npm run test:db

import { execSync } from 'node:child_process';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();

describe.skipIf(!dbAvailable())('compute-opportunity-scores — CoA end-to-end scoring (F.3 CRIT-v2-A)', () => {
  if (!pool) return;

  // PG_* env vars for execSync — derived from DATABASE_URL (set by setup-testcontainer).
  const dbUrl = new URL(process.env.DATABASE_URL!);
  // Spec 00 §8.2: NODE_ENV is literal-typed; bypass via Record cast (used elsewhere in codebase).
  const childEnv: Record<string, string> = {
    ...(process.env as Record<string, string>),
    PG_HOST: dbUrl.hostname,
    PG_PORT: dbUrl.port,
    PG_USER: dbUrl.username,
    PG_PASSWORD: dbUrl.password,
    PG_DATABASE: dbUrl.pathname.slice(1),
  };

  beforeAll(async () => {
    // HIGH-v3-D: clear pipeline_runs for hermeticity (deploy-age query returns 0 → quiet-period).
    await pool.query(`DELETE FROM pipeline_runs WHERE pipeline = 'permits:compute_opportunity_scores'`);

    // C2 fold (Independent diff CRIT): hermetic seed of ALL 10 scoring constants so the
    //   pen-and-paper expected values (T1=3, T2=5) hold regardless of migration seed drift.
    //   `score_tier_*` are NOT migration-seeded — they live in scripts/seeds/logic_variables.json
    //   which the testcontainer migration runner doesn't apply. The other 7 ARE migration-seeded
    //   (mig 092 lines 81-86 + mig 102 for los_decay_divisor) but UPSERTing makes the test
    //   independent of future migration amendments.
    await pool.query(`
      INSERT INTO logic_variables (variable_key, variable_value, description) VALUES
        ('los_base_divisor',     10000, 'Test seed'),
        ('los_base_cap',         30,    'Test seed'),
        ('los_multiplier_bid',   2.5,   'Test seed'),
        ('los_multiplier_work',  1.5,   'Test seed'),
        ('los_penalty_tracking', 50,    'Test seed'),
        ('los_penalty_saving',   10,    'Test seed'),
        ('los_decay_divisor',    25,    'Test seed'),
        ('score_tier_elite',     80,    'Test seed'),
        ('score_tier_strong',    50,    'Test seed'),
        ('score_tier_moderate',  20,    'Test seed')
      ON CONFLICT (variable_key) DO UPDATE SET variable_value = EXCLUDED.variable_value
    `);
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  beforeEach(async () => {
    // Clean state for each test: remove any test fixtures from prior tests.
    if (!pool) return;
    await pool.query(`DELETE FROM trade_forecasts   WHERE lead_id LIKE 'coa:F3TEST%'`);
    await pool.query(`DELETE FROM cost_estimates    WHERE lead_id LIKE 'coa:F3TEST%'`);
    await pool.query(`DELETE FROM lead_analytics    WHERE lead_key LIKE 'coa:F3TEST%'`);
    await pool.query(`DELETE FROM coa_applications  WHERE application_number LIKE 'F3TEST%'`);
  });

  it('T1: CoA lead w/ global multiplier fallback produces score=3 per asymptotic decay formula', async () => {
    // HIGH-v3-A: delete framing row from trade_configurations to force global fallback path.
    await pool.query(`DELETE FROM trade_configurations WHERE trade_slug = 'framing'`);

    // Seed CoA application + lead_id continuity.
    const leadId = 'coa:F3TEST001';
    await pool.query(
      `INSERT INTO coa_applications (application_number, lead_id, status, decision)
       VALUES ($1, $2, 'Approved', 'Approved')`,
      ['F3TEST001', leadId],
    );

    // Seed a CoA forecast: framing trade, bid window, opportunity_score NULL (script will populate).
    // urgency intentionally OMITTED so the DB-side column default applies — trade_forecasts.urgency
    // is NOT NULL with a default; explicit NULL bypasses the default and fails 23502.
    await pool.query(
      `INSERT INTO trade_forecasts (lead_id, trade_slug, target_window, opportunity_score)
       VALUES ($1, 'framing', 'bid', NULL)`,
      [leadId],
    );

    // Seed cost_estimates (mig 145 lead_id PK): estimated_cost=200000, framing slice=30000.
    // cost_source='permit' satisfies the mig 071 NOT NULL + CHECK constraint
    // (mig 145 later extended CHECK to allow 'none' too). The value doesn't
    // affect compute-opportunity-scores — that script reads estimated_cost
    // and trade_contract_values, not cost_source.
    await pool.query(
      `INSERT INTO cost_estimates (lead_id, estimated_cost, trade_contract_values, computed_at, cost_source)
       VALUES ($1, 200000, '{"framing": 30000}'::jsonb, NOW(), 'permit')`,
      [leadId],
    );

    // Seed lead_analytics CoA row: 1 tracker, 0 savers (F.2 UNION lead_key shape).
    // mig 141 promoted lead_id to NOT NULL on lead_analytics — must be supplied
    // alongside the legacy lead_key column. Both hold the same canonical id for
    // CoA leads ('coa:F3TEST00N'). Split into $1/$2 (same value) to avoid PG's
    // 42P08 "inconsistent types deduced for parameter" error — lead_key is
    // VARCHAR, lead_id is TEXT, so a shared $1 fails type inference.
    await pool.query(
      `INSERT INTO lead_analytics (lead_key, lead_id, tracking_count, saving_count, updated_at)
       VALUES ($1, $2, 1, 0, NOW())`,
      [leadId, leadId],
    );

    // Run the script end-to-end.
    // H3 fold (Independent diff HIGH): stdio 'inherit' (NOT 'pipe') matches setup-testcontainer.ts
    //   convention and surfaces script errors directly to CI logs for diagnostic visibility.
    execSync('node scripts/compute-opportunity-scores.js', {
      env: childEnv as NodeJS.ProcessEnv,
      stdio: 'inherit',
    });

    // CRIT-v3-Y: inline pen-and-paper expected score. No formula recomputation in test.
    // Derivation:
    //   base       = min(30000/10000, 30)       = 3
    //   multiplier = los_multiplier_bid          = 2.5    (global fallback — framing row deleted)
    //   rawPenalty = 1*50 + 0*10                 = 50
    //   decayFactor= 50/25                       = 2
    //   raw        = 3 * 2.5 / (1 + 2)           = 7.5 / 3 = 2.5
    //   score      = clamp(0, round(2.5), 100)   = 3        (JS Math.round half-away-from-zero)
    const { rows } = await pool.query(
      `SELECT opportunity_score FROM trade_forecasts WHERE lead_id = $1 AND trade_slug = 'framing'`,
      [leadId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].opportunity_score).toBe(3);
  });

  it('T2: CoA lead w/ per-trade multiplier override path produces distinct score=5 (HIGH-v3-B)', async () => {
    // Per-trade override path: seed (or restore) framing row with multiplier_bid=2.8 (mig 093 default).
    await pool.query(`
      INSERT INTO trade_configurations
        (trade_slug, bid_phase_cutoff, work_phase_target, imminent_window_days, allocation_pct, multiplier_bid, multiplier_work)
      VALUES ('framing', 'P3', 'P9', 7, 0.0526, 2.8, 1.6)
      ON CONFLICT (trade_slug) DO UPDATE SET multiplier_bid = 2.8, multiplier_work = 1.6
    `);

    // Seed CoA application + lead_id continuity.
    const leadId = 'coa:F3TEST002';
    await pool.query(
      `INSERT INTO coa_applications (application_number, lead_id, status, decision)
       VALUES ($1, $2, 'Approved', 'Approved')`,
      ['F3TEST002', leadId],
    );

    // Higher cost slice for distinct expected output (5 vs 4 if global fallback fires).
    // urgency omitted — DB default applies (see T1 above for the 23502 rationale).
    await pool.query(
      `INSERT INTO trade_forecasts (lead_id, trade_slug, target_window, opportunity_score)
       VALUES ($1, 'framing', 'bid', NULL)`,
      [leadId],
    );
    // cost_source='permit' satisfies mig 071 NOT NULL + CHECK; see T1 above.
    await pool.query(
      `INSERT INTO cost_estimates (lead_id, estimated_cost, trade_contract_values, computed_at, cost_source)
       VALUES ($1, 300000, '{"framing": 50000}'::jsonb, NOW(), 'permit')`,
      [leadId],
    );
    // Same shape as T1 — see mig 141 note above.
    await pool.query(
      `INSERT INTO lead_analytics (lead_key, lead_id, tracking_count, saving_count, updated_at)
       VALUES ($1, $2, 1, 0, NOW())`,
      [leadId, leadId],
    );

    // H3 fold (Independent diff HIGH): stdio 'inherit' (NOT 'pipe') matches setup-testcontainer.ts
    //   convention and surfaces script errors directly to CI logs for diagnostic visibility.
    execSync('node scripts/compute-opportunity-scores.js', {
      env: childEnv as NodeJS.ProcessEnv,
      stdio: 'inherit',
    });

    // Derivation:
    //   base       = min(50000/10000, 30)       = 5
    //   multiplier = 2.8 (per-trade override — NOT global fallback's 2.5)
    //   rawPenalty = 50
    //   decayFactor= 2
    //   raw        = 5 * 2.8 / (1 + 2)           = 14 / 3 = 4.666...
    //   score      = clamp(0, round(4.667), 100) = 5
    //   (Global fallback would yield raw=5*2.5/3 = 4.17 → score=4 — distinct from per-trade path's 5.)
    const { rows } = await pool.query(
      `SELECT opportunity_score FROM trade_forecasts WHERE lead_id = $1 AND trade_slug = 'framing'`,
      [leadId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].opportunity_score).toBe(5);
  });
});
