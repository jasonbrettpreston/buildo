// 🔗 SPEC LINK: docs/specs/01-pipeline/54_source_address_points.md
//             docs/specs/01-pipeline/47_pipeline_script_protocol.md §R2 + §R6
//
// SQL-string assertions on the one-time address_points.geom backfill.
// Migration 162 added the geom column GEOMETRY(Point, 4326) but did NOT
// backfill existing rows (525K) in-transaction — per WF1 plan v4 fold C3
// that would block VACUUM and bloat the table. This script populates
// geom from the existing latitude/longitude columns in batches.
//
// The script MUST be:
//   - idempotent (only UPDATE where geom IS NULL)
//   - batched (LIMIT N per transaction, lock duration bounded)
//   - resumable (each batch commits; partial run is safe)
//   - logged (operator visibility on row count + ETA)
//   - audit_table-emitting (Spec 47 §R10 + Spec 48 §3.6 cascade)

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('scripts/one-time/backfill-address-points-geom.js — WF1 Phase 2a', () => {
  let src: string;
  beforeAll(() => {
    src = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/one-time/backfill-address-points-geom.js'),
      'utf-8',
    );
  });

  it('runs as a Spec 47 pipeline script (pipeline.run wrapper + advisory lock)', () => {
    expect(src).toMatch(/pipeline\.run\(\s*['"]backfill-address-points-geom['"]/);
    expect(src).toMatch(/withAdvisoryLock\(/);
  });

  it('uses advisory lock 116 (free ID; 115 is reserved for link-parcel-addresses Phase 2c)', () => {
    expect(src).toMatch(/ADVISORY_LOCK_ID\s*=\s*116\b/);
    expect(src).not.toMatch(/ADVISORY_LOCK_ID\s*=\s*115\b/);
  });

  it('uses server-side ST_SetSRID(ST_MakePoint(lng, lat), 4326) to compute geom', () => {
    expect(src).toMatch(/ST_SetSRID\s*\(\s*ST_MakePoint\s*\(\s*ap\.longitude\s*,\s*ap\.latitude\s*\)\s*,\s*4326\s*\)/);
  });

  it('is idempotent — only UPDATEs rows where geom IS NULL', () => {
    expect(src).toMatch(/geom\s+IS\s+NULL/i);
    expect(src).toMatch(/AND\s+ap\.geom\s+IS\s+NULL/i);
  });

  it('skips rows that have NULL latitude or longitude (cannot compute geom)', () => {
    expect(src).toMatch(/latitude\s+IS\s+NOT\s+NULL/i);
    expect(src).toMatch(/longitude\s+IS\s+NOT\s+NULL/i);
  });

  it('uses FOR UPDATE SKIP LOCKED to allow concurrent batches to make forward progress', () => {
    expect(src).toMatch(/FOR\s+UPDATE\s+SKIP\s+LOCKED/i);
  });

  it('batches via LIMIT to keep per-transaction lock duration bounded', () => {
    expect(src).toMatch(/BATCH_SIZE\s*=\s*\d+/);
    expect(src).toMatch(/LIMIT\s+\$1/i);
  });

  it('commits each batch in its own withTransaction (resumable on operator Ctrl-C)', () => {
    expect(src).toMatch(/pipeline\.withTransaction/);
  });

  it('terminates naturally when a batch returns 0 rows (forward-progress guarantee)', () => {
    expect(src).toMatch(/updated\s*===\s*0/);
    expect(src).toMatch(/break;/);
  });

  it('logs progress per batch + final summary', () => {
    expect(src).toMatch(/pipeline\.log\.info/);
    expect(src).toMatch(/Batch \$\{iteration\}|Batch.*\${iteration}/);
  });

  it('emits Spec 48 §3.6 row-derived verdict cascade (no parallel-boolean)', () => {
    expect(src).toMatch(/\w+\.some\(\(?r\)?\s*=>\s*r\.status\s*===\s*['"]FAIL['"]\)\s*\?\s*['"]FAIL['"]/);
    expect(src).toMatch(/\w+\.some\(\(?r\)?\s*=>\s*r\.status\s*===\s*['"]WARN['"]\)\s*\?\s*['"]WARN['"]/);
  });

  it('emitMeta declares the reads (address_points coords) + writes (address_points.geom)', () => {
    expect(src).toMatch(/emitMeta\(/);
    expect(src).toMatch(/address_points.*['"]latitude['"]/);
    expect(src).toMatch(/address_points.*['"]longitude['"]/);
    expect(src).toMatch(/['"]geom['"]/);
  });

  it('audit_table includes rows_backfilled + remaining_pending + rows_with_null_coords + errors', () => {
    expect(src).toMatch(/['"]rows_backfilled['"]/);
    expect(src).toMatch(/['"]remaining_pending['"]/);
    expect(src).toMatch(/['"]rows_with_null_coords['"]/);
    expect(src).toMatch(/metric:\s*['"]errors['"]/);
  });

  it('records_total = totalUpdated (rows evaluated this run per Spec 47 §11.1, NOT pre-run backlog per §11.2)', () => {
    // Independent IMPL F1 + Observability I1 regression lock: pendingTotal
    // is the pre-run backlog count — it MUST live only in audit_table.rows
    // as `pending_pre_run`. Using it as records_total inflates velocity on
    // first run and breaks counter semantics on resume.
    expect(src).toMatch(/records_total:\s*totalUpdated/);
    expect(src).not.toMatch(/records_total:\s*pendingTotal/);
  });

  it('candidates CTE uses ORDER BY address_point_id to avoid progressive scan slowdown', () => {
    // Gemini CRIT + DeepSeek MED IMPL regression lock: without ORDER BY the
    // planner may re-scan already-NULL pages on later batches as more rows
    // are filled. ORDER BY + LIMIT enables a forward PK-btree scan.
    expect(src).toMatch(/ORDER\s+BY\s+address_point_id/i);
  });
});
