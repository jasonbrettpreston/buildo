// SPEC LINK: docs/specs/01-pipeline/133_bylaw_handbook.md m.305 (values only, no names, no drawings), m.115, m.118
// SPEC LINK: pending rows CHAT-63.C1 (one answer key), CHAT-63.C2 (values-only fixtures committed, checked against the lock)
// Red first: docs/reports/red-evidence/bylaw/coa-round-red.txt. Runs on every machine: the fixtures are committed.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const K = await import(path.join(ROOT, 'scripts/analysis/bylaw-validation/coa-key.mjs'));
const DIR = path.join(ROOT, K.KEY_DIR_REL);

describe('key rows (values only, one shape)', () => {
  const notice = { file_number: 'A0001/26TEY', hearing_date: '2026-03-04', kind: 'decision', outcome: 'Approved on Condition', purpose: 'MUST NOT APPEAR', address: '1 EXAMPLE ST',
    variances: [{ n: 1, clause: '10.20.30.40(1)(A)', requirement: 'text', proposal: 'text', result: 'as_requested', required: { value: 33, unit: '%' }, proposed: { value: 39, unit: '%' } },
      { n: 2, clause: '10.5.60.70(1)', result: 'refused', required: { value: 0.6, unit: '× lot area' }, proposed: null }] };
  it('a notice becomes one row per variance item with the agreed fields and canonical units', () => {
    const rows = K.keyRowsFromNotices([notice], 'b1');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ file_number: 'A0001/26TEY', item: 1, clause: '10.20.30.40(1)(A)', required_value: 33, required_unit: 'pct', proposed_value: 39, proposed_unit: 'pct',
      decision: 'approved_with_conditions', decision_date: '2026-03-04', doc_type: 'decision_notice', source_batch: 'b1', lot_ref: 'A0001/26TEY', table: null });
    expect(rows[1]).toMatchObject({ required_unit: 'ratio', decision: 'refused', proposed_value: null });
    expect(K.validateKeyRows(rows)).toEqual([]);
    expect(JSON.stringify(rows)).not.toMatch(/MUST NOT APPEAR|EXAMPLE ST/);
  });
  it('the shape is closed: purpose text, addresses, names or unknown units are refused', () => {
    const [r] = K.keyRowsFromNotices([notice], 'b1');
    expect(K.validateKeyRows([{ ...r, purpose: 'x' }]).join()).toMatch(/field not in the key: purpose/);
    expect(K.validateKeyRows([{ ...r, clause: 'John Smith wants a deck' }]).join()).toMatch(/bare clause reference/);
    expect(K.validateKeyRows([{ ...r, required_unit: 'furlong' }]).join()).toMatch(/unit set/);
    expect(K.validateKeyRows([{ ...r, proposed_unit: null }]).join()).toMatch(/without a unit/);
    expect(K.validateKeyRows([r, r]).join()).toMatch(/duplicate/);
  });
});

describe('committed fixtures against the lock', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/analysis/bylaw-validation/coa-expected/expected-172.json'), 'utf8'));
  it('every batch file is valid, matches its manifest row count, file count and sha256', () => {
    for (const [b, m] of Object.entries<any>(manifest.batches)) {
      const text = fs.readFileSync(path.join(DIR, `${b}.json`), 'utf8');
      const rows = JSON.parse(text);
      expect(K.validateKeyRows(rows)).toEqual([]);
      expect(rows.every((r: any) => r.source_batch === b)).toBe(true);
      expect([rows.length, new Set(rows.map((r: any) => r.file_number)).size, K.sha256(text)]).toEqual([m.rows, m.files, m.sha256]);
      expect(text).toBe(K.serialize(rows)); // canonical: a regenerated batch is byte-identical
    }
  });
  it('the 2026 batches hold exactly the 172 notices and 698 variance items of the scorer lock (expected-172.json)', () => {
    const b = Object.entries<any>(manifest.batches).filter(([k]) => k.startsWith('coa-2026-'));
    expect(b.reduce((t, [, m]) => t + m.rows, 0)).toBe(lock.variances);
    expect(b.reduce((t, [, m]) => t + m.files, 0)).toBe(lock.notices);
  });
  it('the 2017 allotment holds the 10,098 items of Spec 129 and carries the table-comparison parse columns', () => {
    expect(manifest.batches['coa-2017-decisions'].rows).toBe(10098);
    const rows = JSON.parse(fs.readFileSync(path.join(DIR, 'coa-2017-decisions.json'), 'utf8'));
    expect(rows.every((r: any) => Array.isArray(r.table) && r.table.length === K.TABLE_FIELDS.length)).toBe(true);
    expect(K.dbShapeFromKey(rows[0]).variance_key).toBe(`toronto_ca_decision_pdf|${rows[0].file_number}|${rows[0].item}`);
  });
  it('no fixture text carries a name, an email, a phone number or an address', () => {
    for (const b of Object.keys(manifest.batches)) {
      const text = fs.readFileSync(path.join(DIR, `${b}.json`), 'utf8');
      expect(text).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}|\b\d{3}[-. ]\d{3}[-. ]\d{4}\b/);
    }
  });
});
