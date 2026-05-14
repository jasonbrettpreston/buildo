// SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase D R5.1
//
// scripts/link-coa.js extension — adds a post-pass UPDATE that writes
// permits.linked_coa_application_number back-ref alongside the existing
// coa_applications.linked_permit_num write. Bidirectional linkage enables
// Phase E lifecycle JOINs.
//
// Structural test (regex over the script source). Behavior verified at
// R5.1.d Green Light against the existing link-coa db.test.ts.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('scripts/link-coa.js — back-ref extension (Phase D R5.1)', () => {
  let src: string;

  beforeAll(() => {
    src = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/link-coa.js'),
      'utf-8',
    );
  });

  it('contains an UPDATE permits SET linked_coa_application_number = ... statement', () => {
    expect(src).toMatch(/UPDATE\s+permits(\s+\w+)?\s+SET\s+linked_coa_application_number/i);
  });

  it('uses IS DISTINCT FROM guard to prevent WAL bloat on no-op writes', () => {
    // The back-ref UPDATE should skip rows where the value already matches.
    // Pattern: WHERE p.linked_coa_application_number IS DISTINCT FROM <new value>
    expect(src).toMatch(/linked_coa_application_number\s+IS\s+DISTINCT\s+FROM/i);
  });

  it('back-ref write is sourced from coa_applications.linked_permit_num (the existing forward link)', () => {
    // The back-ref pass derives from rows where coa_applications has a
    // linked_permit_num — the forward direction must already exist.
    expect(src).toMatch(/FROM\s+coa_applications[\s\S]*?WHERE[\s\S]*?linked_permit_num\s+IS\s+NOT\s+NULL/i);
  });

  it('back-ref write happens inside the existing advisory-lock envelope', () => {
    // The UPDATE permits statement must appear AFTER the existing
    // pipeline.withAdvisoryLock call AND BEFORE its closing brace.
    const lockOpen = src.search(/pipeline\.withAdvisoryLock/);
    const lockClose = src.search(/\}\s*\)\s*;\s*\n\s*if\s*\(\s*!\s*lockResult\.acquired/);
    const backRef = src.search(/UPDATE\s+permits(\s+\w+)?\s+SET\s+linked_coa_application_number/i);
    expect(lockOpen).toBeGreaterThan(-1);
    expect(backRef).toBeGreaterThan(lockOpen);
    if (lockClose > -1) expect(backRef).toBeLessThan(lockClose);
  });

  it('emits the back-ref count into audit_table metrics', () => {
    expect(src).toMatch(/permits_back_ref|back_ref_count|coa_back_ref/i);
  });

  it('emitMeta declares permits.linked_coa_application_number as a write target', () => {
    expect(src).toMatch(/"linked_coa_application_number"|'linked_coa_application_number'/);
  });
});
