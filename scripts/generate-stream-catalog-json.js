#!/usr/bin/env node
/**
 * Generate universal-stream-catalog.json — one-shot build-time generator.
 *
 * Reads universal_stream_catalog (mig 128) and emits a Zod-validated JSON file
 * at src/lib/admin/universal-stream-catalog.json that the admin Lead Detail
 * Inspector's CoA Classification panel imports statically for the 110-position
 * lifecycle scrubber.
 *
 * Run manually after `universal_stream_catalog` migrations: `node scripts/generate-stream-catalog-json.js`
 * CI check (per CRIT-Gem-v4-1): after this runs, `git diff --exit-code src/lib/admin/universal-stream-catalog.json`
 * MUST pass — if the file changed without being committed, the build fails forcing the developer to commit.
 *
 * SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.5 Cycle 8 amendment
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { z } = require('zod');
const pipeline = require('./lib/pipeline');

// Spec 47 §R2: advisory lock per script. Two concurrent generator runs (dev re-running
// while CI emits the same artifact) would race on the local JSON file write. Owning
// spec for this generator is 76 (Lead Feed Health Dashboard — F.4 Cycle 8).
const ADVISORY_LOCK_ID = 76;

// v4.1 (HIGH-Ind-v4-2 + MED-Gem-v4-D): runtime Zod validation matching UniversalStreamCatalogRowSchema.
// Inlined here (rather than imported from src/lib/admin/lead-schemas.ts which is TS-only).
const UniversalStreamCatalogRowSchema = z.object({
  seq: z.number().int(),
  lifecycle_group: z.string().nullable(),
  lifecycle_block: z.string().nullable(),
  lifecycle_stage: z.string().nullable(),
  group_label: z.string().nullable(),  group_color: z.string().nullable(),  group_icon: z.string().nullable(),
  block_label: z.string().nullable(),  block_color: z.string().nullable(),  block_icon: z.string().nullable(),
  stage_label: z.string().nullable(),  stage_color: z.string().nullable(),  stage_icon: z.string().nullable(),
});

const EXPECTED_COLS = new Set([
  'seq', 'lifecycle_group', 'lifecycle_block', 'lifecycle_stage',
  'group_label', 'group_color', 'group_icon',
  'block_label', 'block_color', 'block_icon',
  'stage_label', 'stage_color', 'stage_icon',
]);

pipeline.run('generate-stream-catalog-json', async (pool) => {
  // Spec 47 §R6: wrap the side-effecting body in withAdvisoryLock so concurrent runs serialize.
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    // Column-drift detection. table_schema='public' guards against same-named tables in other
    // schemas (test fixtures, audit replicas) producing false-positive columns.
    const { rows: actualCols } = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'universal_stream_catalog'
          AND table_schema = 'public'`,
    );
    const actualColSet = new Set(actualCols.map((r) => r.column_name));
    const missing = [...EXPECTED_COLS].filter((c) => !actualColSet.has(c));
    const unknown = [...actualColSet].filter((c) => !EXPECTED_COLS.has(c));
    if (missing.length > 0) {
      throw new Error(`universal_stream_catalog missing expected columns: ${missing.join(', ')}`);
    }
    if (unknown.length > 0) {
      pipeline.log.warn(
        '[generate-stream-catalog-json]',
        `universal_stream_catalog has new columns NOT in JSON shape: ${unknown.join(', ')} — re-run AND amend UniversalStreamCatalogRowSchema in src/lib/admin/lead-schemas.ts`,
      );
    }

    const { rows } = await pool.query(`
      SELECT seq, lifecycle_group, lifecycle_block, lifecycle_stage,
             group_label, group_color, group_icon,
             block_label, block_color, block_icon,
             stage_label, stage_color, stage_icon
        FROM universal_stream_catalog
       ORDER BY seq ASC
    `);

    // Runtime Zod validation: catches generator-side bugs (wrong column name aliasing, type drift)
    // at write time rather than at admin-UI render time.
    const validated = z.array(UniversalStreamCatalogRowSchema).parse(rows);

    const outputPath = path.join(__dirname, '..', 'src', 'lib', 'admin', 'universal-stream-catalog.json');
    fs.writeFileSync(outputPath, JSON.stringify(validated, null, 2) + '\n');
    pipeline.log.info('[generate-stream-catalog-json]', `Wrote ${validated.length} rows to ${outputPath}`);

    // NO emitSummary/emitMeta — one-shot build-time script with no observer consumer
    // (writes a local artifact, not to pipeline_runs). pipeline.run wrapper used only for
    // pool lifecycle.
  });

  if (!lockResult.acquired) return; // Spec 47 §R12 — SDK emitted SKIP summary already
});
