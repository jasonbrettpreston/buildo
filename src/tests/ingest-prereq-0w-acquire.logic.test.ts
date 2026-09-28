// SPEC LINK: docs/specs/01-pipeline/122a_step_optimization_appendix.md §A16 (0w; RE-FREEZE #27, logged in 122 §8)
//
// INGESTOR prerequisite 0w (part A) — the acquisition seam learns role:"lookup" and
// format:"xlsx". The neighbourhoods source is TWO payloads today: a bare GeoJSON
// FeatureCollection (0v) AND a Census XLSX whose TRANSPOSED sheet the legacy loader parsed
// in-module (scripts/load-neighbourhoods.js, the "Convert ExcelJS sheet to array-of-objects"
// block: row-1 headers via eachCell({includeEmpty:true}), a "_<colNumber>" header for a null
// cell, eachRow({includeEmpty:false}) skipping row 1 with a '' fill for missing headers).
// Before this file the format axis had three arms (shapefile_zip, csv, geojson) and no
// role concept at all: a second url-bearing external was never fetched.
//
// parseXlsx reproduces that conversion as a GENERIC seam function (structure hard-wired like
// csv's agreed options — one consumer, so no knob) and returns {rows, rowsParsed, sheetName};
// rowsParsed is rows.length, the raw row count ctx.acquired.rows_parsed reports.
// role:"lookup" is never gated: a lookup has no staleness lifecycle of its own (the runner
// refuses a trigger naming one), so BOTH gate tiers short-circuit to
// {skip:false, reason:'lookup_ungated'} and the caller gets rows instead of features.
//
// Two construction refusals are named errors, BEFORE any fetch: a lookup is xlsx-only and an
// xlsx is lookup-only (isLookup !== (format === 'xlsx')), so a mismatched pairing is refused
// by name rather than silently acquired.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */
const ExcelJS = require('exceljs');
const LIB_PATH = path.join(process.cwd(), 'scripts/lib/step/acquire.js');
const RAVINES_PATH = path.join(process.cwd(), 'scripts/load-ravines.descriptor.json');
const acquireLib = require(LIB_PATH);
const LOAD_RAVINES = require(RAVINES_PATH);
/* eslint-enable @typescript-eslint/no-require-imports */

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
const noopLog = { info: () => {}, warn: () => {}, error: () => {} };

/** Every temp dir made by `workbook()` — removed in `afterEach`, one per test. */
const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/**
 * The T1 workbook: sheet 1 (`'Census'`) holds the five declared rows, plus a 2nd sheet whose
 * contents are never read (`worksheets[0]` is the contract). Rows are declared as cell
 * arrays; a `null` cell means "no value written" (`eachCell` still visits it via
 * `includeEmpty`, so it must reach the `String(v)`/`_${colNumber}` header arm).
 */
async function workbook(): Promise<{ file: string; dir: string; sheetName: string }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), '0w-'));
  tmpDirs.push(dir);
  const file = path.join(dir, 'profiles.xlsx');
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Census');
  sheet.addRow(['Characteristic', null, 'Agincourt']);
  sheet.addRow(['Neighbourhood Number', 7, 129]);
  sheet.addRow(['Owner', 10]);
  sheet.addRow([]); // one empty row — `includeEmpty:false` must SKIP it
  sheet.addRow(['Renter', 'x', 5]);
  wb.addWorksheet('Notes').addRow(['ignored']);
  await wb.xlsx.writeFile(file);
  return { file, dir, sheetName: 'Census' };
}

/**
 * A VERBATIM copy of `scripts/load-neighbourhoods.js`'s conversion — from the
 * `Convert ExcelJS sheet to array-of-objects` comment through the rows loop — applied to
 * sheet 0 of `p`. `parseXlsx(p).rows` must deep-equal this array, field for field.
 */
async function legacyRows(p: string): Promise<Array<Record<string, unknown>>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(p);
  const sheet = wb.worksheets[0]!;

  // Convert ExcelJS sheet to array-of-objects (like xlsx sheet_to_json)
  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell: { value: unknown }, colNumber: number) => {
    headers[colNumber] = cell.value != null ? String(cell.value) : `_${colNumber}`;
  });
  const rows: Array<Record<string, unknown>> = [];
  sheet.eachRow({ includeEmpty: false }, (row: { eachCell: (o: object, f: (c: { value: unknown }, n: number) => void) => void }, rowNumber: number) => {
    if (rowNumber === 1) return; // skip header
    const obj: Record<string, unknown> = {};
    row.eachCell({ includeEmpty: true }, (cell: { value: unknown }, colNumber: number) => {
      const key = headers[colNumber] || `_${colNumber}`;
      obj[key] = cell.value != null ? cell.value : '';
    });
    // Fill missing columns with default ''
    for (const h of headers) {
      if (h && !(h in obj)) obj[h] = '';
    }
    rows.push(obj);
  });
  return rows;
}

/** md5 of arbitrary bytes — the digest the acquisition seam hashes as the download lands. */
const md5 = (body: Buffer) => crypto.createHash('md5').update(body).digest('hex');

/**
 * A fetch whose Nth call returns the Nth queued response (copied from 0q's `fetchOf`,
 * widened to `body?: string | Buffer`). A REAL `Response` — `Readable.fromWeb(res.body)`
 * requires a genuine WHATWG stream, which only `new Response(...)` provides.
 */
const fetchOf = (queue: Array<{ status: number; body?: string | Buffer }>) => {
  let i = 0;
  return vi.fn(async () => {
    const next = queue[i++];
    if (!next) throw new Error(`fetchOf: call ${i} exceeds the queued response list`);
    const buf = Buffer.isBuffer(next.body) ? next.body : Buffer.from(next.body ?? 'x');
    return new Response(new Uint8Array(buf), {
      status: next.status,
      statusText: String(next.status),
    });
  });
};

describe('INGESTOR prerequisite 0w — lookup acquisition', () => {
  // -------------------------------------------------------------------------
  // T1 — the parse itself: `parseXlsx(file).rows` deep-equals the legacy
  // conversion, `rowsParsed` is the row count, `sheetName` is sheet 1's name.
  // RED before 0w: parseXlsx is not a function.
  // -------------------------------------------------------------------------
  it('T1 — parseXlsx(sheet[0]) rows deep-equal the load-neighbourhoods conversion; rowsParsed 3; sheetName is sheet 1', async () => {
    const { file, sheetName } = await workbook();
    const parsed = await acquireLib.parseXlsx(file) as {
      rows: Array<Record<string, unknown>>; rowsParsed: number; sheetName: string;
    };
    expect(parsed.rows, 'the conversion is load-neighbourhoods.js byte-for-byte').toEqual(await legacyRows(file));
    // The empty row is skipped (`includeEmpty:false`); the five physical rows yield three.
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rowsParsed, 'rowsParsed IS rows.length (the raw row count)').toBe(3);
    expect(parsed.sheetName, 'sheet[0].name').toBe(sheetName);
    // The 2nd header cell was null → its header is `_2`; a ragged row (`Owner`) is
    // back-filled with `''` for the header it lacks, never `undefined`.
    expect(parsed.rows[0]).toEqual({ Characteristic: 'Neighbourhood Number', _2: 7, Agincourt: 129 });
    expect(parsed.rows[1]).toEqual({ Characteristic: 'Owner', _2: 10, Agincourt: '' });
  });

  // -------------------------------------------------------------------------
  // T2 — end to end through the seam: `role:"lookup"` + `format:"xlsx"` is
  // downloaded, hashed, parsed, and NEVER gated. The descriptor clone carries a
  // post_acquisition `content_hash` trigger (load_ravines) — both tiers must
  // short-circuit to `lookup_ungated`, and the parse returns rows, not features.
  // -------------------------------------------------------------------------
  it('T2 — acquireExternal(lookup xlsx) is ungated: gate not called, both tiers lookup_ungated, rows 3, features []', async () => {
    const { file } = await workbook();
    const xlsxBytes = fs.readFileSync(file);
    const descriptor = clone(LOAD_RAVINES) as { identity: { name: string } };
    const external = {
      id: 'l', kind: 'http_file', url: 'http://ex/p.xlsx', format: 'xlsx', role: 'lookup', cache: 'none',
    };
    const fetchImpl = fetchOf([
      { status: 200 }, // HEAD
      { status: 200, body: xlsxBytes }, // GET
    ]);
    const gate = vi.fn();
    const r = await acquireLib.acquireExternal({
      ctxFetch: fetchImpl,
      log: noopLog,
      tag: '[0w-t2]',
      slug: descriptor.identity.name,
      external,
      descriptor,
      prior: { content_hash: md5(xlsxBytes) },
      timeoutMs: null,
      keyProperty: undefined,
      keyColumn: undefined,
      coerceKey: undefined,
      forced: false,
      preAcquisitionGate: gate,
      emitSkeleton: {},
    }) as {
      acquired: { rows_parsed: number; download_attempts: number; content_hash: string };
      tier1: { reason: string };
      tier2: { reason: string };
      features: unknown[];
      rows: Array<Record<string, unknown>>;
    };
    expect(gate, 'a lookup is NEVER gated — the gate is not even consulted').not.toHaveBeenCalled();
    expect(r.tier1.reason, 'tier-1 short-circuits for a lookup').toBe('lookup_ungated');
    expect(r.tier2.reason, 'tier-2 short-circuits too — a post_acquisition trigger is not honoured for a lookup').toBe('lookup_ungated');
    expect(r.rows).toHaveLength(3);
    expect(r.features, 'a lookup has no features — the rows are handed back instead').toEqual([]);
    expect(r.acquired.rows_parsed).toBe(3);
    expect(r.acquired.download_attempts).toBe(1);
    expect(r.acquired.content_hash).toMatch(/^[0-9a-f]{32}$/);
  });

  // -------------------------------------------------------------------------
  // T3 — the two construction refusals, BEFORE any fetch. A lookup is xlsx-only
  // and an xlsx is lookup-only; a mismatch is refused BY NAME (the failure mode
  // is a declared, mis-paired external, not a network call).
  // -------------------------------------------------------------------------
  it('T3 — a lookup with format csv rejects /lookup/ and no role with xlsx rejects /xlsx/, both before any fetch', async () => {
    const descriptor = clone(LOAD_RAVINES) as { identity: { name: string } };
    const args = (external: Record<string, unknown>) => ({
      ctxFetch: vi.fn(),
      log: noopLog,
      tag: '[0w-t3]',
      slug: descriptor.identity.name,
      external,
      descriptor,
      prior: null,
      timeoutMs: null,
      keyProperty: undefined,
      keyColumn: undefined,
      coerceKey: undefined,
      forced: false,
      preAcquisitionGate: vi.fn(),
      emitSkeleton: {},
    });

    // A lookup that is NOT xlsx → refused by name.
    const lookupCsv = args({ id: 'l', kind: 'http_file', url: 'http://ex/p.csv', format: 'csv', role: 'lookup', cache: 'none' });
    await expect(acquireLib.acquireExternal(lookupCsv)).rejects.toThrow(/lookup/);
    expect(lookupCsv.ctxFetch, 'the pairing is refused BEFORE any fetch').not.toHaveBeenCalled();

    // xlsx with NO role (i.e. primary) → refused by name.
    const primaryXlsx = args({ id: 'p', kind: 'http_file', url: 'http://ex/p.xlsx', format: 'xlsx', cache: 'none' });
    await expect(acquireLib.acquireExternal(primaryXlsx)).rejects.toThrow(/xlsx/);
    expect(primaryXlsx.ctxFetch, 'the pairing is refused BEFORE any fetch').not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // T4 (T-pin) — absent `role` is byte-identical: a no-role csv external still
  // goes THROUGH the gate exactly as before, and a `{skip:true}` gate resolves
  // skipped. This is the pre-0w behaviour the whole estate depends on.
  // -------------------------------------------------------------------------
  it('T4 — a no-role csv external still consults the gate (once) and a {skip:true} reason resolves skipped', async () => {
    const descriptor = clone(LOAD_RAVINES) as { identity: { name: string } };
    const external = { id: 'p', kind: 'http_file', url: 'http://ex/p.csv', format: 'csv', cache: 'none' };
    const fetchImpl = fetchOf([{ status: 200 }]); // HEAD only — the gate skips before GET
    const gate = vi.fn(() => ({ skip: true, reason: 'x' }));
    const r = await acquireLib.acquireExternal({
      ctxFetch: fetchImpl,
      log: noopLog,
      tag: '[0w-t4]',
      slug: descriptor.identity.name,
      external,
      descriptor,
      prior: null,
      timeoutMs: null,
      keyProperty: 'OBJECTID',
      keyColumn: 'ravine_id',
      coerceKey: (raw: unknown) => { const n = Number(raw); return Number.isFinite(n) ? n : null; },
      forced: false,
      preAcquisitionGate: gate,
      emitSkeleton: {},
    }) as { tier1: { skip: boolean; reason: string } };
    expect(gate, 'absent role === primary === the gate is consulted exactly once').toHaveBeenCalledTimes(1);
    expect(r.tier1.skip).toBe(true);
    expect(r.tier1.reason).toBe('x');
  });

  // -------------------------------------------------------------------------
  // T5 — the schema declares the two 0w additions and NOTHING more: the item's
  // nested `role` field (absent = primary) and the `format` enum value "xlsx".
  // The pairing (xlsx ⇔ lookup) is deliberately NOT schema-enforced — CF-3 makes
  // it a RUNTIME refusal in acquire.js (T3), so a schema-level cap here would be
  // a second, divergent source of truth.
  // -------------------------------------------------------------------------
  it('T5 — externals[].role is schema-valid as primary/lookup (absent too); format "xlsx" validates; "join" and format "pdf" do not', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const Ajv: any = require('ajv');
    const ajv = new Ajv({ allErrors: true, strict: false });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const schema = require(path.join(process.cwd(), 'scripts/steps/_schema/step.schema.json'));
    const validate = ajv.compile(schema);

    /** load_ravines + a 2nd external, validated through the item's own allOf. */
    const withExternal = (extra: Record<string, unknown>) => {
      const d = clone(LOAD_RAVINES);
      d.inputs.reads.externals.push(extra);
      return { descriptor: d, valid: validate(d), errors: validate.errors };
    };
    const errText = (errors: unknown) => JSON.stringify(errors ?? []);

    const lookup = withExternal({ id: 'l', kind: 'http_file', url: 'http://ex/p.xlsx', format: 'xlsx', role: 'lookup', cache: 'none' });
    expect(lookup.valid, `a lookup xlsx external is valid: ${errText(lookup.errors)}`).toBe(true);

    const primary = withExternal({ id: 'l', kind: 'http_file', url: 'http://ex/p.xlsx', format: 'xlsx', role: 'primary', cache: 'none' });
    expect(primary.valid, `"primary" is an allowed role value: ${errText(primary.errors)}`).toBe(true);

    // The pre-0w descriptors declare NO role: still valid (absent = primary).
    expect(Object.prototype.hasOwnProperty.call(LOAD_RAVINES.inputs.reads.externals[0], 'role')).toBe(false);
    expect(validate(clone(LOAD_RAVINES)), 'role is optional — every existing descriptor is byte-identical').toBe(true);

    const join = withExternal({ id: 'l', kind: 'http_file', url: 'http://ex/p.xlsx', format: 'xlsx', role: 'join', cache: 'none' });
    expect(join.valid, 'role is a closed enum — "join" is not one of its two values').toBe(false);

    const pdf = withExternal({ id: 'l', kind: 'http_file', url: 'http://ex/p.pdf', format: 'pdf', cache: 'none' });
    expect(pdf.valid, 'format is a closed enum — "pdf" is not one of its four values').toBe(false);
  });
});
