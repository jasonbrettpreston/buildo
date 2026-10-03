// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6.1 (Phase 1 WITNESS, P1-C4a fixture guard)
// Plan: .cursor/wf2_registry_truth_active_task.md PHASE 1 item 4 + "## Fold 7" (rulings 1–5); contract .cursor/engine-briefs/p1c4-contract.md §4
/**
 * The P1-C4a fixture guard: a unit-test-side witness for a step's own suites.
 *
 * `witnessGuard(slug, __filename)` wraps the FAKE db handle a suite hands to the step's
 * REAL compute/library (a synthetic `fixtureDescriptor()` handle is not the step and is
 * never wrapped; throwing stubs are untouched). Every SQL text the suite runs through the
 * wrapped handle is resolved with the SAME resolver the capture witness uses
 * (`scripts/lib/sql-witness/resolve.cjs`, Spec 122 §10.1 "one resolver"), and the touched
 * reads/writes are recorded against the step's REAL descriptor
 * (`scripts/manifest.json` `.scripts[slug].file` -> `<slug>.descriptor.json`).
 *
 * A touched table/column the descriptor does not declare is a violation
 * (`undeclaredItems`, contract §2; Spec 122 §6.6.1 — strict zero, NO allowlist):
 *   - the slug is `pending`  -> the violation is THROWN at the query call site,
 *     `FAIL:FIXTURE:<slug>:<suite>:<item>` — a red unit test, today;
 *   - the slug is `converted` -> the violation is only RECORDED (report-only until
 *     P1-C8, Fold 7 ruling 3), where gate #44 picks it up from the fixture record.
 *
 * Records are drift-checked against the committed `docs/reports/witness/<slug>.fixture.json`
 * (contract §3/§4): a full run must match the committed entry exactly, a filtered run must
 * be a subset of it. Regenerate a record with
 *   `BUILDO_WITNESS_WRITE=1 VITEST_MIN_FORKS=1 VITEST_MAX_FORKS=1 npx vitest run <suite files>`
 * (write mode read-modify-writes ONLY the suite being run, so piping several suites in one
 * process collects each entry).
 *
 * Legacy-oracle harnesses are excluded from adoption (Fold 7 ruling 4): they run the LEGACY
 * script, not the converted step, so their comparator is #44(g) PRE ⊆ POST over capture traces.
 * No DB, no network, no `process.exit`.
 */

import fs from 'fs';
import path from 'path';
import { beforeAll, afterAll, expect } from 'vitest';
import { undeclaredItems } from '../../../scripts/analysis/gates/witness.mjs';

/** The repo root, from `src/tests/steps/`. */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

/** Where the committed fixture records live (repo-relative POSIX). */
export const FIXTURE_RECORD_DIR = 'docs/reports/witness';

/** The committed catalog the resolver binds unqualified columns / `*` against. */
const CATALOG_REL = 'docs/reports/witness/_catalog.json';

/** The committed catalog the guard reads; the named error a missing file throws. */
const CATALOG_MISSING_MESSAGE =
  'witness catalog missing: docs/reports/witness/_catalog.json — written by ' +
  'scripts/analysis/capture-step-golden.js (capture-witness.writeCatalog)';

/** The marker `generated_by` field of a fixture record. */
const GENERATED_BY = 'src/tests/steps/_witness-guard.ts (BUILDO_WITNESS_WRITE=1)';

/** The shape of one resolved statement, as `resolve.cjs` returns it (never throws). */
interface ResolveResult {
  kind: 'read' | 'write' | 'utility';
  fingerprint: string;
  reads: Record<string, string[]>;
  writes: Record<string, string[]>;
  excluded: string[];
  error: string | null;
}

/** The narrow slice of `scripts/lib/sql-witness/resolve.cjs` this module calls. */
interface SqlWitnessResolver {
  init(): Promise<void>;
  resolveStatement(
    sql: string,
    catalog: Record<string, string[]>,
    opts?: { sessionTemps?: Set<string> },
  ): ResolveResult;
  collectSessionTemps(sql: string, catalog: Record<string, string[]>): Set<string>;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const resolve = require(path.join(REPO_ROOT, 'scripts/lib/sql-witness/resolve.cjs')) as SqlWitnessResolver;

/** One suite's recorded witness, all arrays sorted unique, all object keys sorted. */
export interface SuiteRecord {
  reads: Record<string, string[]>;
  writes: Record<string, string[]>;
  violations: string[];
  errors: string[];
}

/** Which tier of P1-C4a adoption a step is on (Fold 7 rulings 2–4) (P1-C4b moved the 10 no-DB suites to `guarded`). */
export type AdoptionClass = 'guarded' | 'zero_statement' | 'legacy_oracle_excluded';

/**
 * The CLOSED adoption map: exactly the 25 slugs registered in
 * `scripts/steps/_schema/converted.json` (converted + pending), each in one of three
 * classes (Fold 7 rulings 2 and 4; the P1-C4b class retired when its 10 slugs gained
 * guarded fixture tests). `guarded` suites carry `witnessGuard(`, the
 * `zero_statement` ones a "must not touch the pool" marker, the excluded legacy-oracle
 * harnesses a "legacy-harness" marker. The lock test pins the key set and the
 * 18 / 4 / 3 counts.
 */
export const ADOPTION: Readonly<Record<string, AdoptionClass>> = Object.freeze({
  compute_centroids: 'guarded',
  enrich_parcels: 'guarded',
  load_ravines: 'guarded',
  compute_parcel_cost_estimates: 'guarded',
  geocode_permits: 'guarded',
  load_centreline: 'guarded',
  assert_data_bounds: 'guarded',
  assert_parcel_sanity: 'guarded',
  assert_schema: 'zero_statement',
  link_massing: 'zero_statement',
  link_parcel_addresses: 'zero_statement',
  link_wsib: 'zero_statement',
  load_heritage: 'legacy_oracle_excluded',
  load_wsib: 'legacy_oracle_excluded',
  neighbourhoods: 'legacy_oracle_excluded',
  address_points: 'guarded',
  assert_engine_health: 'guarded',
  assert_global_coverage: 'guarded',
  enrich_heritage: 'guarded',
  enrich_ravines: 'guarded',
  link_neighbourhoods: 'guarded',
  link_parcels: 'guarded',
  massing: 'guarded',
  parcels: 'guarded',
  refresh_snapshot: 'guarded',
});

/** The witness handle a suite uses to wrap its fake db pool/client. */
export interface WitnessGuard {
  /** Wrap a fake db handle IN PLACE; returns the same object (double-wrap is a no-op). */
  wrap<T>(handle: T): T;
  /** A snapshot of everything recorded so far (plain, sorted, never a live Set/Map). */
  record(): SuiteRecord;
  readonly slug: string;
  readonly suite: string;
}

/** Options for `createWitnessGuard`; every field a test may override (see the contract). */
export interface WitnessGuardOptions {
  slug: string;
  suite: string;
  descriptor?: unknown;
  status?: 'pending' | 'converted';
  catalog?: Record<string, string[]>;
}

/** A `{ type, mode, result: { state }, tasks }` task node (vitest's `suite` object). */
interface TestTask {
  type?: string;
  mode?: string;
  result?: { state?: string };
  tasks?: unknown[];
}

/** The committer-side record document (`docs/reports/witness/<slug>.fixture.json`). */
interface FixtureDoc {
  fixture_version: 1;
  slug: string;
  generated_by: string;
  suites: Record<string, SuiteRecord>;
}

/** Sort + dedupe a list of strings (sets are never returned — contract). */
function sortedUnique(xs: string[]): string[] {
  return Array.from(new Set(xs)).sort();
}

/** Sorted keys of a table -> columns map, each column list materialised + sorted unique. */
function sortColumns(map: Map<string, Set<string>>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const table of Array.from(map.keys()).sort()) {
    out[table] = sortedUnique(Array.from(map.get(table) as Set<string>));
  }
  return out;
}

/** The repo-relative POSIX form of a suite path (absolute or already relative). */
function normalizeSuite(suite: string): string {
  const relative = path.isAbsolute(suite) ? path.relative(REPO_ROOT, suite) : suite;
  return relative.split(path.sep).join('/').split('\\').join('/');
}

/** Read + parse a JSON file under the repo root, or null when it is missing. */
function readJson(relPath: string): unknown {
  const full = path.join(REPO_ROOT, relPath);
  if (!fs.existsSync(full)) return null;
  return JSON.parse(fs.readFileSync(full, 'utf8')) as unknown;
}

/** Load the `resolve.cjs` WASM grammar exactly once (idempotent, safe at module scope). */
export async function initWitnessGuard(): Promise<void> {
  await resolve.init();
}

/** The step's descriptor path: manifest `.scripts[slug].file` with `.js` -> `.descriptor.json`. */
function descriptorRelFor(slug: string): string {
  const manifest = readJson('scripts/manifest.json') as
    | { scripts?: Record<string, { file?: string }> }
    | null;
  const entry = manifest && manifest.scripts ? manifest.scripts[slug] : undefined;
  if (!entry || typeof entry.file !== 'string') {
    throw new Error(
      `witness guard: unknown slug '${slug}' — scripts/manifest.json .scripts has no entry with a .file`,
    );
  }
  return entry.file.replace(/\.js$/, '.descriptor.json');
}

/** The descriptor the guard checks touched items against (overridable in tests). */
function defaultDescriptor(slug: string): unknown {
  const rel = descriptorRelFor(slug);
  const descriptor = readJson(rel);
  if (descriptor === null) {
    throw new Error(`witness guard: descriptor missing: ${rel} — no real descriptor for '${slug}'`);
  }
  return descriptor;
}

/** `'pending'` / `'converted'` from `scripts/steps/_schema/converted.json`, else throw. */
function defaultStatus(slug: string): 'pending' | 'converted' {
  const doc = readJson('scripts/steps/_schema/converted.json') as
    | { converted?: string[]; pending?: Array<{ file?: string }> }
    | null;
  if (!doc || !Array.isArray(doc.converted) || !Array.isArray(doc.pending)) {
    throw new Error('witness guard: malformed scripts/steps/_schema/converted.json');
  }
  const file = descriptorRelFor(slug).replace(/\.descriptor\.json$/, '.js');
  if (doc.pending.some((p) => p && p.file === file)) return 'pending';
  if (doc.converted.indexOf(file) !== -1) return 'converted';
  throw new Error(
    `witness guard: '${slug}' (${file}) is neither converted[] nor pending[] in ` +
      'scripts/steps/_schema/converted.json',
  );
}

/** The committed table -> columns catalog (missing file -> the named error). */
function defaultCatalog(): Record<string, string[]> {
  const doc = readJson(CATALOG_REL) as { tables?: Record<string, string[]> } | null;
  if (doc === null || !doc.tables) throw new Error(CATALOG_MISSING_MESSAGE);
  return doc.tables;
}

/** Module-private marker: a handle is wrapped exactly once. */
const WRAPPED = Symbol('buildo-witness-guard-wrapped');

/** Internal state of one guard (kept in a closure, exposed as a plain record only). */
interface GuardState {
  readonly slug: string;
  readonly suite: string;
  readonly descriptor: unknown;
  readonly status: 'pending' | 'converted';
  readonly catalog: Record<string, string[]>;
  readonly reads: Map<string, Set<string>>;
  readonly writes: Map<string, Set<string>>;
  readonly violations: Set<string>;
  readonly errors: Set<string>;
  readonly sessionTemps: Set<string>;
}

/** Record a read/write of a table (bare table touch -> empty column list). */
function mergeTouch(map: Map<string, Set<string>>, touched: Record<string, string[]>): void {
  for (const table of Object.keys(touched)) {
    let cols = map.get(table);
    if (!cols) {
      cols = new Set<string>();
      map.set(table, cols);
    }
    for (const col of touched[table] ?? []) cols.add(col);
  }
  // (arrays pass through `sortColumns` at record() time: sorted, unique, keys sorted.)
}

/** The plain, sorted `SuiteRecord` view of a guard's state. */
function recordOf(state: GuardState): SuiteRecord {
  return {
    reads: sortColumns(state.reads),
    writes: sortColumns(state.writes),
    violations: sortedUnique(Array.from(state.violations)),
    errors: sortedUnique(Array.from(state.errors)),
  };
}

/** Extract the SQL text from a `query(...)` first argument; null when there is none. */
function textOf(arg: unknown): string | null {
  if (typeof arg === 'string') return arg;
  if (arg && typeof arg === 'object') {
    const obj = arg as { text?: unknown; cursor?: { text?: unknown } };
    if (typeof obj.text === 'string') return obj.text;
    if (obj.cursor && typeof obj.cursor.text === 'string') return obj.cursor.text;
  }
  return null;
}

/**
 * Wrap ONE handle in place (pool or client — they share the shape we need). `query` is
 * replaced with a resolver-first wrapper, and `connect` (when it is a function) with an
 * async wrapper that awaits the original and wraps the returned client the same way.
 */
function wrapHandle(state: GuardState, handle: object): void {
  const target = handle as {
    [WRAPPED]?: boolean;
    query?: unknown;
    connect?: unknown;
  };
  if (target[WRAPPED]) return;
  // Mark before recursing: `connect()`'s returned client is wrapped by `wrapHandle` again.
  Object.defineProperty(target, WRAPPED, { value: true, enumerable: false });

  if (typeof target.connect === 'function') {
    const originalConnect = target.connect as (...args: unknown[]) => unknown;
    target.connect = async (...args: unknown[]) => {
      const client = await originalConnect.apply(target, args);
      if (client && (typeof client === 'object' || typeof client === 'function')) {
        wrapHandle(state, client as object);
      }
      return client;
    };
  }

  if (typeof target.query === 'function') {
    const originalQuery = target.query as (...args: unknown[]) => unknown;
    target.query = (...args: unknown[]) => {
      const sql = textOf(args[0]);
      if (sql === null) {
        state.errors.add('no-text');
      } else {
        const sessionTemps = state.sessionTemps;
        for (const temp of resolve.collectSessionTemps(sql, state.catalog)) sessionTemps.add(temp);
        const r = resolve.resolveStatement(sql, state.catalog, { sessionTemps });
        if (r.error) state.errors.add(r.error);
        if (r.kind !== 'utility') {
          mergeTouch(state.reads, r.reads);
          mergeTouch(state.writes, r.writes);
        }
        const items = undeclaredItems(state.descriptor, { reads: r.reads, writes: r.writes });
        for (const item of items) state.violations.add(item);
        if (items.length > 0 && state.status === 'pending') {
          throw new Error('FAIL:FIXTURE:' + state.slug + ':' + state.suite + ':' + items[0]);
        }
      }
      return originalQuery.apply(target, args);
    };
  }
}

/**
 * Build a guard for one suite. Descriptor, status and catalog default from the repo
 * (synchronous reads), so this is safe to call at module top level of a suite.
 */
export function createWitnessGuard(opts: WitnessGuardOptions): WitnessGuard {
  const slug = opts.slug;
  if (!slug) throw new Error('witness guard: createWitnessGuard requires a slug');
  const state: GuardState = {
    slug,
    suite: normalizeSuite(opts.suite),
    descriptor: opts.descriptor !== undefined ? opts.descriptor : defaultDescriptor(slug),
    status: opts.status || defaultStatus(slug),
    catalog: opts.catalog || defaultCatalog(),
    reads: new Map<string, Set<string>>(),
    writes: new Map<string, Set<string>>(),
    violations: new Set<string>(),
    errors: new Set<string>(),
    sessionTemps: new Set<string>(),
  };
  return {
    slug: state.slug,
    suite: state.suite,
    wrap<T>(handle: T): T {
      if (handle && (typeof handle === 'object' || typeof handle === 'function')) {
        wrapHandle(state, handle as object);
      }
      return handle;
    },
    record(): SuiteRecord {
      return recordOf(state);
    },
  };
}

/** The record file for a slug (repo-relative POSIX). */
function fixtureRelFor(slug: string): string {
  return `${FIXTURE_RECORD_DIR}/${slug}.fixture.json`;
}

/** Read + parse a slug's fixture record, or null when the file is missing. */
function readFixtureDoc(slug: string): FixtureDoc | null {
  const full = path.join(REPO_ROOT, fixtureRelFor(slug));
  if (!fs.existsSync(full)) return null;
  return JSON.parse(fs.readFileSync(full, 'utf8')) as FixtureDoc;
}

/** Write mode: read-modify-write ONLY this suite's entry (keys kept sorted). */
function writeFixtureRecord(guard: WitnessGuard): void {
  const existing = readFixtureDoc(guard.slug);
  const suites: Record<string, SuiteRecord> = existing && existing.suites ? existing.suites : {};
  suites[guard.suite] = guard.record();
  const sorted: Record<string, SuiteRecord> = {};
  for (const suite of Object.keys(suites).sort()) {
    const entry = suites[suite];
    if (entry !== undefined) sorted[suite] = entry;
  }
  const doc: FixtureDoc = {
    fixture_version: 1,
    slug: guard.slug,
    generated_by: GENERATED_BY,
    suites: sorted,
  };
  const outPath = path.join(REPO_ROOT, fixtureRelFor(guard.slug));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(doc, null, 2) + '\n');
}

/** Every test task of a vitest suite object, recursively (minimal, untyped walk). */
function collectTestTasks(task: unknown, out: TestTask[] = []): TestTask[] {
  if (!task || typeof task !== 'object') return out;
  const node = task as TestTask;
  if (node.type === 'test') out.push(node);
  if (Array.isArray(node.tasks)) {
    for (const child of node.tasks) collectTestTasks(child, out);
  }
  return out;
}

/** Did EVERY test task of the file run (not filtered out / skipped)? */
function ranEveryTask(task: unknown): boolean {
  const tasks = collectTestTasks(task);
  if (tasks.length === 0) return false;
  return tasks.every(
    (t) => t.mode === 'run' && (t.result?.state === 'pass' || t.result?.state === 'fail'),
  );
}

/** Every run item absent from the committed entry (identifier strings for the diff). */
function missingItems(record: SuiteRecord, committed: SuiteRecord): string[] {
  const missing: string[] = [];
  for (const kind of ['reads', 'writes'] as const) {
    for (const table of Object.keys(record[kind])) {
      const committedCols = new Set((committed[kind] && committed[kind][table]) || []);
      for (const col of record[kind][table] ?? []) {
        if (!committedCols.has(col)) missing.push(`${kind}.${table}.${col}`);
      }
    }
  }
  const committedViolations = new Set(committed.violations || []);
  for (const item of record.violations) {
    if (!committedViolations.has(item)) missing.push(`violations.${item}`);
  }
  const committedErrors = new Set(committed.errors || []);
  for (const item of record.errors) {
    if (!committedErrors.has(item)) missing.push(`errors.${item}`);
  }
  return sortedUnique(missing);
}

/**
 * Compare (or, under `BUILDO_WITNESS_WRITE=1`, regenerate) this suite's committed fixture
 * record. Register with `afterAll((suite) => checkFixtureRecord(guard, suite))`.
 */
export function checkFixtureRecord(guard: WitnessGuard, suiteTask?: unknown): void {
  if (process.env.BUILDO_WITNESS_WRITE === '1') {
    writeFixtureRecord(guard);
    return;
  }
  const doc = readFixtureDoc(guard.slug);
  const committed = doc && doc.suites ? doc.suites[guard.suite] : undefined;
  if (!committed) {
    throw new Error(
      `FIXTURE-RECORD missing for ${guard.slug} ${guard.suite} — run ` +
        `BUILDO_WITNESS_WRITE=1 npx vitest run ${guard.suite}`,
    );
  }
  const record = guard.record();
  if (ranEveryTask(suiteTask)) {
    expect(record).toEqual(committed);
    return;
  }
  // A filtered / skipped run watches only the subset it actually executed.
  expect(missingItems(record, committed)).toEqual([]);
}

/**
 * The one-liner a suite calls at module top level: build the guard for this step and
 * register the WASM init + the drift check with vitest. Returns the guard to wrap handles.
 */
export function witnessGuard(slug: string, suiteFile: string): WitnessGuard {
  const guard = createWitnessGuard({ slug, suite: suiteFile });
  beforeAll(async () => {
    await initWitnessGuard();
  });
  afterAll((suite: unknown) => {
    checkFixtureRecord(guard, suite);
  });
  return guard;
}
