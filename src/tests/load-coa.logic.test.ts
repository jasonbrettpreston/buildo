// SPEC LINK: docs/specs/01-pipeline/51_source_coa.md (Target Table: zoning_designation)
// SPEC LINK: .cursor/wf1_mcbylaw_phase2_inputs_active_task.md (C3)
// RE-HOMED (Night P4 R-EQ shell swap, 42c9d3d5, 2026-10-20): the shipped script is now the frozen pipeline.step()
// shell (Spec 122 §5.1); these legacy pins read the verbatim legacy text kept as the red suite's oracle
// (src/tests/steps/coa/fixtures/legacy-load-coa.js.txt). The converted behaviour is pinned by src/tests/steps/coa/violations.test.ts.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';

const SRC = fs.readFileSync(path.resolve(__dirname, './steps/coa/fixtures/legacy-load-coa.js.txt'), 'utf-8');

/**
 * Slice the pure/behavioural regions of load-coa.js out of the source text and
 * evaluate them in an isolated vm context (the script has no exports and calls
 * `pipeline.run(...)` at top level, so it cannot be required).
 *
 * Region 1: CRITICAL_FIELDS, the STATUS map, trimToNull, parseDate, computeHash.
 * Region 2: mapRecord (everything after region 1's helpers up to the writer).
 *
 * No DB, no network — just the mapping logic under test.
 */
function loadMapRecord(): {
  mapRecord: (raw: Record<string, unknown>, schemaDrift: string[]) => { record: Record<string, unknown> | null; skipReason: string | null };
  computeHash: (record: Record<string, unknown>) => string;
  CRITICAL_FIELDS: readonly string[];
} {
  const region1Start = SRC.indexOf('const CRITICAL_FIELDS');
  const region1End = SRC.indexOf('async function fetchAllRecords');
  const region2Start = SRC.indexOf('function mapRecord(');
  const region2End = SRC.indexOf('async function upsertBatch');
  if (region1Start === -1) throw new Error("load-coa.js: marker 'const CRITICAL_FIELDS' not found");
  if (region1End === -1) throw new Error("load-coa.js: marker 'async function fetchAllRecords' not found");
  if (region2Start === -1) throw new Error("load-coa.js: marker 'function mapRecord(' not found");
  if (region2End === -1) throw new Error("load-coa.js: marker 'async function upsertBatch' not found");
  if (!(region1Start < region1End && region1End <= region2Start && region2Start < region2End)) {
    throw new Error('load-coa.js: helper regions are out of order — source layout changed');
  }

  const region1 = SRC.slice(region1Start, region1End);
  const region2 = SRC.slice(region2Start, region2End);
  const code = region1 + region2 + '\n;({ mapRecord, computeHash, CRITICAL_FIELDS })';

  return vm.runInNewContext(code, {
    crypto,
    normalizeStreetName: (s: string | null) => (s == null ? null : s.toUpperCase()),
    Date,
    Object,
    JSON,
    String,
    Number,
    isNaN,
  });
}

const ACTIVE = {
  'REFERENCE_FILE#': 'A0001/26TEY',
  C_OF_A_DESCISION: null,
  STATUSDESC: 'Hearing Scheduled',
  HEARING_DATE: '2026-09-01',
  STREET_NUM: '12',
  STREET_NAME: 'SAMPLE',
  STREET_TYPE: 'AVE',
  WARD: '14',
  DESCRIPTION: 'x',
  ZONING_DESIGNATION: '  RD (f12.0; a370) (x5) [ZAP]  ',
};

const CLOSED: Record<string, unknown> = {
  ...ACTIVE,
  'REFERENCE_FILE#': 'A0002/19TEY',
  WARD_NUMBER: '14',
  WARD_NAME: 'Toronto-Danforth',
  ZONING_DESIGNATION: 'R (d0.6) (ZZC)',
};
delete CLOSED.WARD;

describe('load-coa mapRecord - zoning_designation (Spec 51)', () => {
  it('active shape: trims the raw designation and never parses it (review tag stays)', () => {
    const { mapRecord } = loadMapRecord();
    const { record } = mapRecord(ACTIVE, []);
    expect(record).not.toBeNull();
    expect(record!.zoning_designation).toBe('RD (f12.0; a370) (x5) [ZAP]');
  });

  it('closed shape: keeps the designation verbatim (trimmed)', () => {
    const { mapRecord } = loadMapRecord();
    const { record } = mapRecord(CLOSED, []);
    expect(record).not.toBeNull();
    expect(record!.zoning_designation).toBe('R (d0.6) (ZZC)');
  });

  it('key missing: no skip, record built, zoning_designation null', () => {
    const { mapRecord } = loadMapRecord();
    const copy: Record<string, unknown> = { ...ACTIVE };
    delete copy.ZONING_DESIGNATION;
    const { record, skipReason } = mapRecord(copy, []);
    expect(record).not.toBeNull();
    expect(skipReason).toBeNull();
    expect(record!.zoning_designation).toBeNull();
  });

  it('blank string: null', () => {
    const { mapRecord } = loadMapRecord();
    const { record } = mapRecord({ ...ACTIVE, ZONING_DESIGNATION: '   ' }, []);
    expect(record).not.toBeNull();
    expect(record!.zoning_designation).toBeNull();
  });

  it('data_hash changes when ONLY the designation changes; identical copies hash equal', () => {
    const { mapRecord, computeHash } = loadMapRecord();

    const a = mapRecord(ACTIVE, []).record!;
    const b = mapRecord({ ...ACTIVE, ZONING_DESIGNATION: 'RD (f13.5; a510) (ZAP)' }, []).record!;
    expect(b.data_hash).not.toBe(a.data_hash);

    const a2 = mapRecord(ACTIVE, []).record!;
    expect(a2.data_hash).toBe(a.data_hash);

    // computeHash is order-insensitive on the mapped field set.
    expect(computeHash({ x: 1, y: 'z' })).toBe(computeHash({ y: 'z', x: 1 }));
  });

  it('CRITICAL_FIELDS does not contain ZONING_DESIGNATION (optional field must not skip rows)', () => {
    const { CRITICAL_FIELDS } = loadMapRecord();
    expect([...CRITICAL_FIELDS]).not.toContain('ZONING_DESIGNATION');
  });
});

describe('load-coa wiring - zoning_designation (source locks)', () => {
  it('upsertBatch inserts + updates zoning_designation', () => {
    const start = SRC.indexOf('INSERT INTO coa_applications (');
    const end = SRC.indexOf('async function upsertBatch', start);
    const sql = SRC.slice(start, end === -1 ? SRC.length : end);
    expect(start).not.toBe(-1);

    const columnList = sql.slice(0, sql.indexOf(')') + 1);
    expect(columnList).toContain('zoning_designation');
    expect(sql).toContain('zoning_designation = EXCLUDED.zoning_designation');
  });

  it('unnest placeholders grew to 15 and RUN_AT is $16::timestamptz', () => {
    expect((SRC.match(/unnest\(\$\d+::/g) || []).length).toBe(15);
    expect(SRC).toContain('$16::timestamptz');
    expect(SRC).not.toContain('$15::timestamptz');
  });

  it('both emitMeta CKAN read lists and both coa_applications write lists carry the new field', () => {
    expect((SRC.match(/"CKAN API": \[[^\]]*"ZONING_DESIGNATION"/g) || []).length).toBe(2);
    expect((SRC.match(/"coa_applications": \["application_number", "address"[^\]]*"zoning_designation"/g) || []).length).toBe(2);
  });

  it('emits the zoning_designation_null audit row', () => {
    expect(SRC).toContain("metric: 'zoning_designation_null'");
    expect(SRC).toContain("deduplicated.every((m) => m.zoning_designation === null) ? 'WARN' : 'PASS'");
  });
});
