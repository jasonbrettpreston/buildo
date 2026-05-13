// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.6.F
//             docs/specs/00-architecture/01_database_schema.md §3.A
//             docs/specs/02-web-admin/34_web_admin_testing_protocol.md (PG16 testcontainer)
//
// SQL-shape regression-lock for migration 135 (phase_stay_calibration cohort columns).
//
// Adds 4 nullable cohort-dim columns to phase_stay_calibration (migration
// 123). Existing PK on (permit_type, from_phase) is preserved through
// Phase E — only a UNIQUE NULLS NOT DISTINCT constraint is added for the
// new shape so Phase E can swap the PK over once cohort dims are populated.
//
// R2.v3 fix: the prior revision had an ADD PRIMARY KEY ... DROP sequence
// that would fail because new columns are NULL (PK cannot have NULL).
// Removed entirely; the legacy PK stays untouched in Phase B.
//
// PostgreSQL 16+ required for UNIQUE NULLS NOT DISTINCT. Verified deployed
// in testcontainer per Spec 34.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 135 — phase_stay_calibration cohort key extension (WF1 #coa-pipeline-parity-phase-b R5.3)', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/135_extend_phase_stay_calibration.sql'),
      'utf-8',
    );
  });

  it('ALTERs phase_stay_calibration with the 4 cohort-dim columns', () => {
    expect(sql).toMatch(/ALTER\s+TABLE\s+phase_stay_calibration[\s\S]*?ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+from_seq\s+INTEGER/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+to_seq\s+INTEGER/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+project_type\s+VARCHAR\s*\(\s*50\s*\)/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+coa_type_class\s+VARCHAR\s*\(\s*30\s*\)/i);
  });

  it('adds UNIQUE NULLS NOT DISTINCT on the new cohort key shape (PG16+ syntax)', () => {
    expect(sql).toMatch(/ADD\s+CONSTRAINT\s+phase_stay_calibration_new_unique\s+UNIQUE\s+NULLS\s+NOT\s+DISTINCT\s*\(\s*permit_type\s*,\s*project_type\s*,\s*coa_type_class\s*,\s*from_seq\s*,\s*to_seq\s*\)/i);
  });

  it('R2.v3 Item 10 regression-lock: does NOT attempt to swap the PK (Phase E does that, not Phase B)', () => {
    // The prior revision had ADD PRIMARY KEY → DROP sequence which would
    // fail at ADD (NULL cohort dims). The fix: leave existing PK on
    // (permit_type, from_phase) intact. Phase E swaps it once cohort
    // dims are backfilled. Asserts the bug pattern is absent.
    expect(sql).not.toMatch(/ADD\s+CONSTRAINT\s+phase_stay_calibration_pkey\s+PRIMARY\s+KEY[\s\S]*?\(\s*permit_type\s*,\s*project_type/i);
    expect(sql).not.toMatch(/DROP\s+CONSTRAINT\s+phase_stay_calibration_pkey/i);
  });

  it('R2.v3 IF-NOT-EXISTS regression-lock: UNIQUE constraint wrapped in DO/EXCEPTION', () => {
    // Same idempotency pattern — re-run after partial success must not fail.
    expect(sql).toMatch(/DO\s+\$\$[\s\S]*?ADD\s+CONSTRAINT\s+phase_stay_calibration_new_unique[\s\S]*?EXCEPTION\s+WHEN\s+duplicate_object\s+THEN\s+NULL/i);
  });

  it('does NOT use CREATE INDEX CONCURRENTLY (phase_stay_calibration is small, transactional apply is fine)', () => {
    // Only the executable form is asserted; the word "CONCURRENTLY" may
    // appear in comments explaining why this migration is non-CONCURRENTLY.
    expect(sql).not.toMatch(/CREATE\s+INDEX\s+CONCURRENTLY/i);
  });

  it('wraps the ALTERs + UNIQUE add in an explicit BEGIN/COMMIT for atomicity', () => {
    expect(sql).toMatch(/BEGIN\s*;/i);
    expect(sql).toMatch(/COMMIT\s*;/i);
  });

  it('comment-only DOWN block per Rule 6', () => {
    expect(sql).toMatch(/--\s*DOWN\b/i);
    const downIdx = sql.search(/--\s*DOWN\b/i);
    expect(downIdx).toBeGreaterThan(0);
    const afterDown = sql.slice(downIdx);
    const offending = afterDown
      .split('\n')
      .filter((line) => {
        const t = line.trim();
        if (t === '' || t.startsWith('--')) return false;
        return /\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\b/i.test(t);
      });
    expect(offending).toEqual([]);
  });
});
