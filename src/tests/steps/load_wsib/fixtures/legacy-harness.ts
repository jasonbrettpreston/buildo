// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §4.5 (legacy oracle, not source-text)
// SPEC LINK: docs/specs/01-pipeline/52_source_wsib.md
//
// WF2 batch-2 ① — the LOAD_WSIB legacy oracle.
//
// This module does NOT require `scripts/load-wsib.js` in-process. That live path is (or is about to
// become) the frozen `pipeline.step(...)` shell with no legacy logic left to observe, and it talks
// to Postgres when driven. So the oracle reads the BYTE-IDENTICAL frozen SOURCE, committed VERBATIM
// as the fixture copy `fixtures/legacy-load-wsib.js.txt` (= `scripts/load-wsib.js` @ 43056856), as
// SOURCE TEXT: it strips the shebang and evaluates it inside a `new Function` with a curated
// CommonJS `require` shim — `./lib/pipeline` is a fake, while every builtin (`fs`, `path`) and
// `csv-parse` resolve to the REAL modules, so the script's real CSV parsing path is exercised. The
// script's module-scope `pipeline.run('load-wsib', cb)` therefore only STORES the callback — the
// caller decides when to drive it via `runMain(argv)`.
//
// The oracle's job (Spec 123 §4.5): a future converted implementation must reproduce the legacy
// OBSERVABLE BEHAVIOUR — the ordered `pool.query()` SQL/params stream, the `emitSummary` /
// `emitMeta` payloads, the advisory-lock id, and the returned counts — without the legacy text
// being the source of truth for the new implementation. Every observable is captured on the
// returned handles so a red suite can pin it before any conversion lands.

import fs from 'fs';
import path from 'path';

/** Repo root, derived from this file's location (src/tests/steps/load_wsib/fixtures/). */
const REPO_ROOT = path.resolve(__dirname, '../../../../../');

/**
 * The frozen legacy source, committed verbatim as a fixture. The live `scripts/load-wsib.js` is the
 * conversion target, so the oracle reads this copy and — because the script never touches
 * `__dirname`-relative SOURCE files (only the optional `data/` scan on the chain-skip branch) — it
 * passes `scripts/` (or a test-supplied tmp dir) as `__dirname` below.
 */
const SCRIPT_REL = 'src/tests/steps/load_wsib/fixtures/legacy-load-wsib.js.txt';

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

/** One row destined for `wsib_registry`, rebuilt from an upsert's params. */
export type LegacyRow = Record<string, unknown>;

/** The subset of the legacy script's exports this oracle exposes (both are pure). */
export type NormalizeName = (n: string | null | undefined) => string | null;
export type IsGTA = (a: string | null | undefined) => boolean;

/**
 * The subset of `./lib/pipeline` the legacy script uses, named so the fake below can be typed
 * without reaching for `any`.
 */
interface FakePipelineRun {
  run(name: string, cb: (pool: FakePool) => Promise<void>): void;
}
interface FakePipelineTransaction {
  withTransaction<T>(pool: FakePool, fn: (client: FakePool) => Promise<T>): Promise<T>;
}
interface FakePipelineAdvisoryLock {
  withAdvisoryLock(
    pool: FakePool,
    lockId: number,
    fn: () => Promise<void>,
  ): Promise<{ acquired: boolean; lockId?: number }>;
}
interface FakePipelineClock {
  getDbTimestamp(pool: FakePool): Promise<Date>;
}
interface FakePipelineSummary {
  emitSummary(o: SummaryRecord): void;
}
interface FakePipelineMeta {
  emitMeta(reads: Record<string, string[]>, writes: Record<string, string[]>): void;
}
interface FakePipelineLog {
  log: { info(): void; warn(): void; error(): void };
}
type FakePipeline = FakePipelineLog &
  FakePipelineRun &
  FakePipelineTransaction &
  FakePipelineAdvisoryLock &
  FakePipelineClock &
  FakePipelineSummary &
  FakePipelineMeta;

/** Handle returned by `loadLegacy`. */
export interface LegacyOracle {
  /** The legacy `normalizeName()` (suffix stripping), evaluated from the frozen source. */
  normalizeName: NormalizeName;
  /** The legacy `isGTA()` (GTA municipality substring match), evaluated from the frozen source. */
  isGTA: IsGTA;
  /** Drive the stored `pipeline.run()` callback with `process.argv[2..]` set to `argv`. */
  runMain(argv: string[]): Promise<void>;
  pool: FakePool;
  summaries: SummaryRecord[];
  metas: MetaRecord[];
  /** Every advisory lock id requested, in call order. */
  lockIds: number[];
  /** Rebuild the rows passed to every `INSERT INTO wsib_registry` call, in order. */
  upsertRows(): LegacyRow[];
}

export interface LoadLegacyOpts {
  /** Value of `process.env.PIPELINE_CHAIN` seen by the script's MODULE-SCOPE read (:19). */
  chain?: string | null;
  /** `false` makes the fake advisory lock report `{ acquired: false }` (the :447 silent return). */
  lockAcquired?: boolean;
  /** `__dirname` handed to the evaluated source; defaults to the real `scripts/`. */
  scriptDir?: string;
  /** Override the upsert RETURNING rows (nRows = params.length / 13). */
  upsertReturn?: (nRows: number) => Array<{ is_insert: boolean }>;
}

/**
 * Reads the frozen legacy source (fixture copy `fixtures/legacy-load-wsib.js.txt`) as SOURCE TEXT,
 * evaluates it with a curated `require` shim, and returns handles onto its exports plus the
 * observable capture surfaces.
 *
 * The script's module-scope `pipeline.run('load-wsib', cb)` only STORES `cb`; nothing runs until
 * the caller invokes `runMain(argv)`.
 */
export function loadLegacy(opts: LoadLegacyOpts = {}): LegacyOracle {
  const summaries: SummaryRecord[] = [];
  const metas: MetaRecord[] = [];
  const lockIds: number[] = [];

  let storedCb: ((pool: FakePool) => Promise<void>) | null = null;

  const pool: FakePool = {
    queries: [],
    async query(sql: string, params: unknown[] = []): Promise<{ rows: Record<string, unknown>[] }> {
      pool.queries.push({ sql, params });
      if (/INSERT INTO pipeline_runs/.test(sql)) {
        return { rows: [{ id: 4242 }] };
      }
      if (/INSERT INTO wsib_registry/.test(sql)) {
        const nRows = params.length / 13;
        const rows = opts.upsertReturn
          ? opts.upsertReturn(nRows)
          : Array.from({ length: nRows }, () => ({ is_insert: true }));
        return { rows };
      }
      if (/FROM wsib_registry/.test(sql)) {
        return { rows: [{ total: '0', linked: '0', with_trade: '0', class_count: '0' }] };
      }
      return { rows: [] };
    },
  };

  // --- fake ./lib/pipeline -------------------------------------------------
  const fakePipeline: FakePipeline = {
    log: { info(): void {}, warn(): void {}, error(): void {} },
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
      void lockPool;
      lockIds.push(lockId);
      if (opts.lockAcquired === false) {
        return { acquired: false };
      }
      await fn();
      return { acquired: true, lockId };
    },
    getDbTimestamp(): Promise<Date> {
      return Promise.resolve(new Date('2026-01-01T00:00:00.000Z'));
    },
    emitSummary(o: SummaryRecord): void {
      summaries.push(o);
    },
    emitMeta(reads: Record<string, string[]>, writes: Record<string, string[]>): void {
      metas.push({ reads, writes });
    },
  };

  // --- custom require ------------------------------------------------------
  const customRequire = (id: string): unknown => {
    if (id === './lib/pipeline') return fakePipeline;
    // fs | path | csv-parse (and any other dependency) resolve to the real module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(id);
  };

  // --- read + evaluate the frozen source text ------------------------------
  const rawSource = fs.readFileSync(path.join(REPO_ROOT, SCRIPT_REL), 'utf8');
  const source = rawSource.replace(/^#![^\n]*\n/, '');
  const factory = new Function(
    'require',
    'module',
    'exports',
    '__dirname',
    `${source}\n;module.exports = { normalizeName, isGTA };`,
  );

  // `CHAIN_ID` is captured at MODULE SCOPE (`process.env.PIPELINE_CHAIN`, legacy :19), so the env
  // var must be in place for the factory call itself — then restored exactly (including absent).
  const savedChain = process.env.PIPELINE_CHAIN;
  const scriptDir = opts.scriptDir ?? path.join(REPO_ROOT, 'scripts');
  const moduleShim = { exports: {} as Record<string, unknown> };
  try {
    if (opts.chain === undefined || opts.chain === null) {
      delete process.env.PIPELINE_CHAIN;
    } else {
      process.env.PIPELINE_CHAIN = opts.chain;
    }
    factory(customRequire, moduleShim, moduleShim.exports, scriptDir);
  } finally {
    if (savedChain === undefined) {
      delete process.env.PIPELINE_CHAIN;
    } else {
      process.env.PIPELINE_CHAIN = savedChain;
    }
  }

  const exported = moduleShim.exports;
  const normalizeName = exported.normalizeName as NormalizeName;
  const isGTA = exported.isGTA as IsGTA;

  const runMain = async (argv: string[]): Promise<void> => {
    if (!storedCb) {
      throw new Error('[legacy-harness] pipeline.run() callback was never registered');
    }
    const savedArgv = process.argv;
    process.argv = [savedArgv[0] ?? 'node', savedArgv[1] ?? SCRIPT_REL, ...argv];
    try {
      await storedCb(pool);
    } finally {
      process.argv = savedArgv;
    }
  };

  const upsertRows = (): LegacyRow[] => {
    const rows: LegacyRow[] = [];
    for (const call of pool.queries) {
      if (!/INSERT INTO wsib_registry/.test(call.sql)) continue;
      const flattened = call.sql.replace(/\s+/g, ' ');
      const match = /INSERT INTO wsib_registry \(([^)]*)\)/.exec(flattened);
      if (!match || match[1] === undefined) continue;
      const columns = match[1].split(',').map((c) => c.trim());
      if (columns.length === 0 || columns[0] === '') continue;
      for (let offset = 0; offset + columns.length <= call.params.length; offset += columns.length) {
        const row: LegacyRow = {};
        for (let i = 0; i < columns.length; i += 1) {
          row[columns[i] as string] = call.params[offset + i];
        }
        rows.push(row);
      }
    }
    return rows;
  };

  return {
    normalizeName,
    isGTA,
    runMain,
    pool,
    summaries,
    metas,
    lockIds,
    upsertRows,
  };
}
