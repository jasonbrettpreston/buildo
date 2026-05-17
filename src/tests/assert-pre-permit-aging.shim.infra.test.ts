// SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 row "Phase G"
//
// Phase G assert-pre-permit-aging retirement shim — regression lock on the
// no-op-shim source-code shape. Paired with create-pre-permits retirement.

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/quality/assert-pre-permit-aging.js'),
  'utf-8',
);

describe('assert-pre-permit-aging.js — RETIRED shim (Phase G)', () => {
  it('emits verdict=SKIP (NOT PASS — distinguishes retired step from successful assertion)', () => {
    expect(SRC).toMatch(/verdict:\s*'SKIP'/);
    // The pre-Phase-G verdict was conditional on hasWarns: 'WARN' | 'PASS'.
    expect(SRC).not.toMatch(/verdict:\s*hasWarns/);
  });

  it('emits records_total/_new/_updated all = 0 (no work performed)', () => {
    expect(SRC).toMatch(/records_total:\s*0/);
    expect(SRC).toMatch(/records_new:\s*0/);
    expect(SRC).toMatch(/records_updated:\s*0/);
  });

  it('audit_table has one INFO/SKIP row labeled "retired"', () => {
    expect(SRC).toMatch(/metric:\s*'retired'/);
    expect(SRC).toMatch(/value:\s*'Phase G'/);
  });

  it('no DB reads (no pool.query / coa_applications references)', () => {
    expect(SRC).not.toMatch(/pool\.query/);
    expect(SRC).not.toMatch(/coa_applications/);
  });

  it('emitMeta reads={} and writes={} (no DB surface area)', () => {
    expect(SRC).toMatch(/pipeline\.emitMeta\(\s*\{\s*\}\s*,\s*\{\s*\}\s*\)/);
  });

  it('preserves advisory lock 107', () => {
    expect(SRC).toMatch(/ADVISORY_LOCK_ID = 107/);
    expect(SRC).toMatch(/pipeline\.withAdvisoryLock/);
  });

  it('no longer reads pre_permit_*_months via logicVars (vestigial)', () => {
    expect(SRC).not.toMatch(/logicVars\.pre_permit_expiry_months/);
    expect(SRC).not.toMatch(/logicVars\.pre_permit_stale_months/);
    expect(SRC).not.toMatch(/loadMarketplaceConfigs/);
  });
});
