// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §4.5 (legacy oracle, not source-text)
// SPEC LINK: docs/specs/01-pipeline/57_source_neighbourhoods.md
//
// Batch-2 row 3.8 ① — the NEIGHBOURHOODS legacy oracle. Re-pointed at ② to the PRE-② fixture copy.
//
// This module does NOT require `scripts/load-neighbourhoods.js` in-process. Two reasons, now:
// (1) at ② that live path became the §5.1 frozen `pipeline.step(...)` shell — a 40-line stub with
// no legacy logic left to observe; and (2) it still talks to Postgres when driven. So the oracle
// reads the BYTE-IDENTICAL PRE-② SOURCE, committed VERBATIM as the fixture copy
// `fixtures/legacy-load-neighbourhoods.js.txt` (= `git show 110c8c31:scripts/load-neighbourhoods.js`,
// sha256 9638974e…8729), as SOURCE TEXT: it strips the shebang and evaluates it inside a
// `new Function` with a curated CommonJS `require` shim: `./lib/pipeline` and `exceljs` are fakes,
// `./lib/safe-math` and the node builtins (`fs`/`path`/`https`/`http`) are the real modules. The
// script's top-level `pipeline.run('load-neighbourhoods', cb)` therefore only STORES the callback —
// the caller decides when to drive it via `runMain(argv2, argv3)`.
//
// The oracle's job (Spec 123 §4.5): a future converted implementation must reproduce the legacy
// OBSERVABLE BEHAVIOUR — the ordered `pool.query()` SQL/params stream, the `emitSummary` /
// `emitMeta` payloads, and the returned counts — without the legacy text being the source of truth
// for the new implementation. Every observable is captured on the returned handles so a red suite
// can pin it before any conversion lands.

import fs from 'fs';
import path from 'path';

/** Repo root, derived from this file's location (src/tests/steps/neighbourhoods/fixtures/). */
const REPO_ROOT = path.resolve(__dirname, '../../../../../');
// ② re-point: the live path `scripts/load-neighbourhoods.js` is now the frozen `pipeline.step(...)`
// shell, so the legacy oracle reads this VERBATIM copy of the pre-② source instead. The copy is
// byte-identical to `git show 110c8c31:scripts/load-neighbourhoods.js` (sha256 9638974e…8729), and
// `__dirname` is still passed as `scripts/` below, so the legacy relative requires resolve exactly
// as they did before the freeze.
const SCRIPT_REL = 'src/tests/steps/neighbourhoods/fixtures/legacy-load-neighbourhoods.js.txt';
const SAFE_MATH_REL = 'scripts/lib/safe-math.js';

/** A grid cell as it appears in the census fixture (`null`/`undefined` → absent). */
export type GridCell = string | number | boolean | null | undefined;
/** Row-major sheet grid: `grid[rowIndex][colIndex]`, 0-based in the fixture, 1-based in ExcelJS. */
export type Grid = ReadonlyArray<ReadonlyArray<GridCell>>;

/** One row of the legacy header→object conversion (see `gridToRows`). */
export type SheetRow = Record<string, string | number | boolean | null>;

/** A captured `pool.query(sql, params)` call. */
export interface QueryCall {
  sql: string;
  params: unknown[];
}

/** The recorded `emitSummary(...)` argument. */
export interface SummaryRecord {
  records_total: number;
  records_new: number;
  records_updated: number;
  records_meta: Record<string, unknown>;
}

/** The recorded `emitMeta(reads, writes)` pair. */
export interface MetaRecord {
  reads: Record<string, string[]>;
  writes: Record<string, string[]>;
}

/** Fake `pg`-shaped pool: records every query and returns canned rows. */
export interface FakePool {
  queries: QueryCall[];
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/** The value injected for `require('./lib/safe-math')` — the real module, typed loosely. */
export interface SafeMathModule {
  safeParsePositiveInt(value: unknown, label: string): number;
  safeParseFloat(value: unknown, label: string): number;
  safeParseIntOrNull(value: unknown): number | null;
}

/** The subset of the legacy script's exports this oracle exposes. */
export type LoadBoundaries = (
  pool: FakePool,
  geojsonPath: string,
  hasPostGIS: boolean,
) => Promise<number>;

export type LoadProfiles = (pool: FakePool, xlsxPath: string) => Promise<number>;

export type ParseNumeric = (val: GridCell) => number | null;

/** Handle returned by `loadLegacy`. */
export interface LegacyOracle {
  loadBoundaries: LoadBoundaries;
  loadProfiles: LoadProfiles;
  parseNumeric: ParseNumeric;
  /** Drive the stored `pipeline.run()` callback with `process.argv[2]` / `[3]` set. */
  runMain: (argv2: string, argv3: string) => Promise<void>;
  pool: FakePool;
  summaries: SummaryRecord[];
  metas: MetaRecord[];
}

export interface LoadLegacyOpts {
  grid?: Grid;
  lockAcquired?: boolean;
}

// ---------------------------------------------------------------------------
// Fake ExcelJS sheet built from a grid
// ---------------------------------------------------------------------------

interface FakeCell {
  value: string | number | boolean | null;
}

interface FakeRow {
  eachCell(opts: { includeEmpty: boolean }, cb: (cell: FakeCell, colNumber: number) => void): void;
  rowNumber: number;
}

interface FakeSheet {
  name: string;
  getRow(rowNumber: number): FakeRow;
  eachRow(
    opts: { includeEmpty: boolean },
    cb: (row: FakeRow, rowNumber: number) => void,
  ): void;
}

interface FakeWorkbook {
  worksheets: FakeSheet[];
  xlsx: { readFile(filePath?: string): Promise<void> };
}

/** Constructor shim for the in-evaluated-source `new ExcelJS.Workbook()` call. */
type WorkbookCtor = new () => FakeWorkbook;

/**
 * Normalize a fixture cell to the value ExcelJS would hand back.
 * `null`/`undefined` → `null` (an EMPTY cell); everything else passes through.
 */
function cellValue(cell: GridCell): string | number | boolean | null {
  return cell === null || cell === undefined ? null : cell;
}

/**
 * Build a 1-based ExcelJS-shaped worksheet over a 0-based fixture grid.
 *
 * ExcelJS rows/columns are 1-based; the fixture grid is row-major from index 0. Only rows that
 * EXIST in the grid are materialized, but `eachRow({ includeEmpty: false }, ...)` must still report
 * the ORIGINAL rowNumber for each row it yields (the legacy loop skips `rowNumber === 1`), so the
 * row number and the row's position stay coupled here.
 */
function makeSheet(name: string, grid: Grid): FakeSheet {
  const rowAt = (rowNumber1: number): FakeRow => {
    const source = grid[rowNumber1 - 1] ?? [];
    return {
      rowNumber: rowNumber1,
      eachCell(opts, cb): void {
        const width = source.length;
        for (let col = 0; col < width; col += 1) {
          const raw = source[col];
          if (!opts.includeEmpty && (raw === null || raw === undefined)) continue;
          cb({ value: cellValue(raw) }, col + 1);
        }
      },
    };
  };

  return {
    name,
    getRow(rowNumber1: number): FakeRow {
      return rowAt(rowNumber1);
    },
    eachRow(opts, cb): void {
      for (let rowIndex = 0; rowIndex < grid.length; rowIndex += 1) {
        const rowNumber1 = rowIndex + 1;
        if (rowNumber1 === 1) continue; // header row is never yielded to the data loop
        cb(rowAt(rowNumber1), rowNumber1);
      }
      void opts;
    },
  };
}

function makeWorkbook(grid: Grid, sheetName: string): FakeWorkbook {
  return {
    worksheets: [makeSheet(sheetName, grid)],
    xlsx: {
      readFile(): Promise<void> {
        return Promise.resolve();
      },
    },
  };
}

// ---------------------------------------------------------------------------
// gridToRows — the legacy header→object conversion, copied verbatim in SPIRIT
// (loadProfiles: `headers[colNumber] = cell.value != null` … `rows.push(obj)`)
// ---------------------------------------------------------------------------

/**
 * Reproduce the legacy `loadProfiles` header→object conversion exactly:
 *
 *   - header row (grid row 1) keyed 1-based: `cell.value != null ? String(cell.value) : '_' + col`
 *   - every subsequent row: `obj[headers[col] || '_' + col] = cell.value != null ? value : ''`
 *   - then fill any header key still absent with `''`
 *
 * Rows are emitted in grid order, skipping row 1. `null`/`undefined` cells read as `''`.
 */
export function gridToRows(grid: Grid): SheetRow[] {
  const headers: string[] = [];
  const headerRow = grid[0] ?? [];
  for (let col = 0; col < headerRow.length; col += 1) {
    const raw = headerRow[col];
    headers[col + 1] = raw !== null && raw !== undefined ? String(raw) : `_${col + 1}`;
  }

  const rows: SheetRow[] = [];
  for (let rowIndex = 1; rowIndex < grid.length; rowIndex += 1) {
    const source = grid[rowIndex] ?? [];
    const obj: SheetRow = {};
    for (let col = 0; col < source.length; col += 1) {
      const colNumber = col + 1;
      const key = headers[colNumber] ?? `_${colNumber}`;
      const raw = source[col];
      obj[key] = raw !== null && raw !== undefined ? raw : '';
    }
    for (const h of headers) {
      if (h && !(h in obj)) obj[h] = '';
    }
    rows.push(obj);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// loadLegacy — evaluate the script's source text against the fakes
// ---------------------------------------------------------------------------

/**
 * Reads the PRE-② legacy source (fixture copy `fixtures/legacy-load-neighbourhoods.js.txt`) as
 * SOURCE TEXT, evaluates it with a curated `require` shim, and returns handles onto its exports
 * plus the observable capture surfaces.
 *
 * The script's module-scope `pipeline.run('load-neighbourhoods', cb)` only STORES `cb`; nothing runs
 * until the caller invokes `runMain(argv2, argv3)`.
 */
export function loadLegacy(opts: LoadLegacyOpts = {}): LegacyOracle {
  const grid: Grid = opts.grid ?? [];
  const sheetName = 'hd2021_census_profile';

  const summaries: SummaryRecord[] = [];
  const metas: MetaRecord[] = [];

  let storedCb: ((pool: FakePool) => Promise<void>) | null = null;

  const pool: FakePool = {
    queries: [],
    async query(sql: string, params: unknown[] = []): Promise<{ rows: Record<string, unknown>[] }> {
      pool.queries.push({ sql, params });
      return { rows: /pg_extension/.test(sql) ? [{ '?column?': 1 }] : [] };
    },
  };

  // --- fake ./lib/pipeline -------------------------------------------------
  const fakePipeline = {
    log: { info(): void {} },
    run(_name: string, cb: (pool: FakePool) => Promise<void>): void {
      storedCb = cb;
    },
    withTransaction<T>(txPool: FakePool, fn: (client: FakePool) => Promise<T>): Promise<T> {
      return fn(txPool);
    },
    async withAdvisoryLock(
      lockPool: FakePool,
      lockId: number,
      fn: () => Promise<void>,
    ): Promise<{ acquired: boolean; lockId?: number }> {
      if (opts.lockAcquired === false) {
        return { acquired: false };
      }
      await fn();
      void lockPool;
      return { acquired: true, lockId };
    },
    emitSummary(o: SummaryRecord): void {
      summaries.push(o);
    },
    emitMeta(reads: Record<string, string[]>, writes: Record<string, string[]>): void {
      metas.push({ reads, writes });
    },
  };

  // --- real ./lib/safe-math ------------------------------------------------
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const safeMath = require(path.join(REPO_ROOT, SAFE_MATH_REL)) as SafeMathModule;

  // --- custom require ------------------------------------------------------
  // `__dirname` for the evaluated source: the LEGACY location `scripts/`, NEVER derived from
  // SCRIPT_REL (which now points at `src/tests/…/fixtures/`). The pre-② script's relative requires
  // (`./lib/pipeline`, `./lib/safe-math`) must resolve exactly as they did before the ② freeze.
  const scriptDir = path.join(REPO_ROOT, 'scripts');

  // Each `new ExcelJS.Workbook()` gets a FRESH sheet view over the same grid, so repeated
  // `loadProfiles()` calls (and any future red-suite loop) never share mutable sheet state.
  class FakeWorkbookClass implements FakeWorkbook {
    worksheets: FakeSheet[];
    xlsx: { readFile(filePath?: string): Promise<void> };

    constructor() {
      const wb = makeWorkbook(grid, sheetName);
      this.worksheets = wb.worksheets;
      this.xlsx = wb.xlsx;
    }
  }

  const exceljsMock: { Workbook: WorkbookCtor } = { Workbook: FakeWorkbookClass };

  const customRequire = (id: string): unknown => {
    if (id === './lib/pipeline') return fakePipeline;
    if (id === './lib/safe-math') return safeMath;
    if (id === 'exceljs') return exceljsMock;
    // fs | path | https | http (and any other builtin) resolve to the real module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(id);
  };

  // --- read + evaluate the legacy source text ------------------------------
  const rawSource = fs.readFileSync(path.join(REPO_ROOT, SCRIPT_REL), 'utf8');
  const source = rawSource.replace(/^#![^\n]*\n/, '');
  const factory = new Function(
    'require',
    'module',
    'exports',
    '__dirname',
    `${source}\n;module.exports = { loadBoundaries, loadProfiles, parseNumeric };`,
  );

  const moduleShim = { exports: {} as Record<string, unknown> };
  factory(customRequire, moduleShim, moduleShim.exports, scriptDir);

  const exported = moduleShim.exports;
  const loadBoundaries = exported.loadBoundaries as LoadBoundaries;
  const loadProfiles = exported.loadProfiles as LoadProfiles;
  const parseNumeric = exported.parseNumeric as ParseNumeric;

  const runMain = async (argv2: string, argv3: string): Promise<void> => {
    if (!storedCb) {
      throw new Error('[legacy-harness] pipeline.run() callback was never registered');
    }
    const savedArgv = process.argv;
    const nextArgv = savedArgv.slice();
    nextArgv[2] = argv2;
    nextArgv[3] = argv3;
    process.argv = nextArgv;
    try {
      await storedCb(pool);
    } finally {
      process.argv = savedArgv;
    }
  };

  return {
    loadBoundaries,
    loadProfiles,
    parseNumeric,
    runMain,
    pool,
    summaries,
    metas,
  };
}
