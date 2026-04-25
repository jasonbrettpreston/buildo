// Infra Layer Tests — backfill-permits-location.js script structure
// 🔗 SPEC LINK: docs/specs/03-mobile/75_lead_feed_implementation_guide.md §11
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SCRIPT_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'scripts',
  'backfill',
  'backfill-permits-location.js'
);

describe('scripts/backfill/backfill-permits-location.js', () => {
  const src = fs.readFileSync(SCRIPT_PATH, 'utf-8');

  it('uses the Pipeline SDK (no inline new Pool)', () => {
    expect(src).toMatch(/require\('\.\.\/lib\/pipeline'\)/);
    expect(src).not.toMatch(/new Pool\(/);
  });

  it('streams candidates instead of loading them all', () => {
    expect(src).toMatch(/pipeline\.streamQuery/);
  });

  it('filters to permits where location IS NULL and lat+lng present', () => {
    expect(src).toMatch(/location IS NULL/);
    expect(src).toMatch(/latitude IS NOT NULL/);
    expect(src).toMatch(/longitude IS NOT NULL/);
  });

  it('updates inside withTransaction batches', () => {
    expect(src).toMatch(/pipeline\.withTransaction/);
  });

  it('supports a --dry-run flag', () => {
    expect(src).toMatch(/--dry-run/);
    expect(src).toMatch(/DRY_RUN/);
  });

  it('emits PIPELINE_SUMMARY and PIPELINE_META', () => {
    expect(src).toMatch(/pipeline\.emitSummary/);
    expect(src).toMatch(/pipeline\.emitMeta/);
  });

  it('idempotent guard via IS DISTINCT FROM in the UPDATE', () => {
    expect(src).toMatch(/IS DISTINCT FROM ST_SetSRID/);
  });

  it('includes audit_table in emitSummary records_meta — not SDK auto-inject UNKNOWN (Bundle B)', () => {
    // SDK auto-injects { verdict: 'UNKNOWN', rows: [] } when audit_table is absent.
    // FreshnessTimeline renders UNKNOWN instead of a real PASS/WARN/FAIL verdict.
    expect(src).toMatch(/audit_table\s*:/);
    expect(src).toMatch(/phase\s*:/);
    expect(src).not.toMatch(/name\s*:\s*['"]Auto['"]/);
    expect(src).toMatch(/rows\s*:/);
    // Verdict must reference a computed variable, not be hardcoded
    expect(src).toMatch(/verdict\s*:/);
  });
});
