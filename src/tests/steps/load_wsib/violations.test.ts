// SPEC LINK: docs/specs/01-pipeline/52_source_wsib.md (the source producer contract)
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 (commit ① — PH-7, prove red)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1, §5.5
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rules 1–13
// SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (step 19 load_wsib)
// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §A.5 (lock 97)
//
// Batch-2 row 3.5 — `load_wsib`, the INGESTOR archetype — R-PACE-1 COMPRESSED form (one source → one
// target), class A `guarded_upsert`. Commit ① lands this suite + fixtures + the assessment report; ②
// lands the descriptor, compute, frozen shell and seeds (and flips every `it.fails` to `it`); ③ cuts over.
//
// ✅ THE 15 CONVERTED CLAIMS FLIPPED GREEN AT ②. ② landed the descriptor, compute, frozen shell, notes
// and seeds, and flipped every `it.fails` to a plain `it(` — the pinned artifacts now exist, so each
// claim passes against them. Part 1's 13 legacy oracle pins were green at ① and read the frozen
// SOURCE-TEXT copy `fixtures/legacy-load-wsib.js.txt` through `fixtures/legacy-harness.ts`
// (`loadLegacy`), never requiring `scripts/load-wsib.js` in-process.
// PART 2 — converted claims: at ① every one WAS `it.fails`, and each body's FIRST statement went
// through `artifact()` so it failed as a NAMED MISSING ARTIFACT (the descriptor / compute / shell /
// notes it pins did not exist yet) rather than as an import error.
//
// Ordering prerequisite (historical, already satisfied): the 0fs library entry (filesystem external
// declared as `path`, `guards.srid: "none"`, terminal state `skipped_no_source_file`) had to land
// BEFORE ② — the compressed form has exactly one source file, so the skip path has to be a
// first-class terminal.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadLegacy } from './fixtures/legacy-harness';
import type { LegacyRow } from './fixtures/legacy-harness';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const STEP_DIR_REL = 'src/tests/steps/load_wsib';

const DESCRIPTOR_REL = 'scripts/load-wsib.descriptor.json';
const NOTES_REL = 'scripts/load-wsib.notes.json';
const COMPUTE_REL = 'scripts/lib/compute/load-wsib.js';
const SHELL_REL = 'scripts/load-wsib.js';
const REPORT_REL = 'docs/reports/2026-09-29-batch2-p3-5-load-wsib-assessment.md';
const SEEDS_REL = 'scripts/seeds/logic_variables.json';

const FIXTURE_CSV_ABS = path.join(REPO_ROOT, STEP_DIR_REL, 'fixtures/wsib-sample.csv');

/** Spec 47 §A.5 lock registry row 97 [READ scripts/load-wsib.js `ADVISORY_LOCK_ID = 97`]. */
const LOCK_ID = 97;
/** The ONE write target (plan §4). */
const WRITE_TABLE = 'wsib_registry';
/** The de-duplication key (legacy header): normalised legal name + raw mailing address. */
const KEY_COLUMNS = ['legal_name_normalized', 'mailing_address'];
/** The CSV parse options pinned by the legacy oracle. */
const CSV_OPTIONS = { bom: true, relax_quotes: false };
/** The deterministic run timestamp the suite pins. */
const RUN_AT = new Date('2026-01-01T00:00:00.000Z');
/** The 9 guard columns — the IS DISTINCT FROM terms of the legacy upsert WHERE clause. */
const GUARD_COLUMNS = ['trade_name', 'trade_name_normalized', 'predominant_class', 'naics_code', 'naics_description', 'subclass', 'subclass_description', 'business_size', 'is_gta']; // legacy :242-250
/** Columns owned by OTHER steps — load_wsib must NEVER write them. */
const NEVER_WRITTEN = ['id', 'linked_entity_id', 'match_confidence', 'matched_at', 'primary_phone', 'primary_email', 'website', 'last_enriched_at', 'first_seen_at'];
/** The flat `records_meta` keys of the legacy emitSummary (beside `audit_table`). */
const LEGACY_META_KEYS = ['duration_ms', 'total_csv_rows', 'unique_class_g', 'records_inserted', 'records_updated', 'skipped_non_g', 'skipped_no_name']; // legacy :401-407

// ---------------------------------------------------------------------------
// Descriptor / compute shapes (used by part 2 — declared here so the types are one home)
// ---------------------------------------------------------------------------

interface Check {
  id: string;
  kind: string;
  severity: string;
  blocking: boolean;
  when: string;
  limit: unknown;
  limit_from_config?: string;
  [k: string]: unknown;
}

interface WriteSpec {
  table: string;
  key: string | string[];
  geometry_kind?: string;
  retract?: unknown;
  columns: Array<{ name: string; on_empty?: string; written?: string; bind?: string }>;
  write_discipline: { class: string; guard_columns: unknown; set_source?: string; [k: string]: unknown };
  [k: string]: unknown;
}

interface Descriptor {
  identity: { name: string; archetype: string; lock: number; spec: string; display_name?: string };
  /** Spec 122 §5.1 — the frozen shape lives under `execution` (massing ② precedent). */
  execution?: { shape?: string; [k: string]: unknown };
  inputs: { reads: { externals: Array<{ id: string; format: string; role?: string; key_property?: string; kind?: string; path?: string; url?: string; csv_options?: Record<string, unknown>; [k: string]: unknown }> } };
  outputs: 'none' | { writes: WriteSpec[]; invalidates?: unknown };
  checks: Check[];
  guards?: { srid?: unknown; [k: string]: unknown };
  staleness?: { trigger?: unknown; [k: string]: unknown };
  terminals?: Array<{ id: string; kind: string; status?: string; [k: string]: unknown }>;
  emits?: Array<{ key: string; skeleton?: Record<string, unknown>; [k: string]: unknown }>;
  counters?: Record<string, { source?: string; [k: string]: unknown }>;
  config?: { logic_variables?: Array<{ name: string; on_invalid?: string; [k: string]: unknown }>; [k: string]: unknown };
  [k: string]: unknown;
}

// ---------------------------------------------------------------------------
// Artifact helpers (copied from src/tests/steps/neighbourhoods/violations.test.ts:80-156)
// ---------------------------------------------------------------------------

function abs(rel: string): string {
  return path.join(REPO_ROOT, rel);
}

/** Assert a FUTURE artifact exists; the failure message names it. Returns the absolute path. */
function artifact(rel: string, why = ''): string {
  expect(
    fs.existsSync(abs(rel)),
    `MISSING ARTIFACT ${rel}${why ? ` — ${why}` : ''} (not yet produced by the row-3.5 commit sequence)`,
  ).toBe(true);
  return abs(rel);
}

function readText(rel: string): string {
  return fs.readFileSync(artifact(rel), 'utf8');
}

/** Collapse all whitespace runs to a single space — the fixture's declared normalisation. */
function normalizeWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function loadDescriptor(): Descriptor {
  const d = JSON.parse(readText(DESCRIPTOR_REL)) as Descriptor;
  validateDescriptor(d); // throws with the AJV error list — the loader property (Spec 122 §4.2)
  return d;
}

interface ComputeModule {
  compute?: (ctx: unknown) => Promise<unknown>;
  coerceKey?: (raw: unknown) => string | null;
  shapeRecord?: (record: unknown, seam: unknown) => Record<string, unknown> | string | null;
  dedupeBySourceId?: (rows: Record<string, unknown>[]) => { kept: Record<string, unknown>[]; duplicateCount: number };
  checks?: Record<string, (ctx: unknown) => unknown>;
  [k: string]: unknown;
}

function loadComputeModule(): ComputeModule {
  const mod = require(artifact(COMPUTE_REL)) as ComputeModule; // eslint-disable-line @typescript-eslint/no-require-imports -- the FUTURE CJS compute module
  return mod;
}

function checkById(d: Descriptor, id: string): Check {
  const c = d.checks.find((x) => x.id === id);
  expect(c, `descriptor declares no check "${id}"`).toBeDefined();
  return c as Check;
}

function writes(d: Descriptor): WriteSpec[] {
  expect(d.outputs, 'an INGESTOR may not declare outputs:"none"').not.toBe('none');
  return (d.outputs as { writes: WriteSpec[] }).writes;
}

/** Drive ONE check function from the compute's dispatch table, capturing its report() calls. */
function driveCheck(checkId: string, ctx: Record<string, unknown>): Array<[string, Record<string, unknown>]> {
  const mod = loadComputeModule();
  const fn = (mod.checks ?? {})[checkId];
  expect(typeof fn, `the compute dispatch carries no function for check "${checkId}"`).toBe('function');
  const calls: Array<[string, Record<string, unknown>]> = [];
  (fn as (c: unknown) => unknown)({
    ...ctx,
    report: (id: string, o: Record<string, unknown>) => { calls.push([id, o]); },
  } as never);
  return calls;
}

// ONE compiler, the same one pipeline.step() validates with.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const { validateDescriptor } = require(path.join(REPO_ROOT, 'scripts/lib/step/validate.js')) as {
  validateDescriptor: (d: unknown) => unknown;
};

// ---------------------------------------------------------------------------
// Fixture drivers — a CSV on a tmp path, and the legacy run helper
// ---------------------------------------------------------------------------

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeCsv(dir: string, name: string, lines: string[]): string {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
  return filePath;
}

const CSV_HEADER = fs.readFileSync(FIXTURE_CSV_ABS, 'utf8').split('\n')[0]!;

/** Drive the legacy oracle's `runMain` over the on-disk fixture CSV. */
async function legacyRunStandalone(opts: Parameters<typeof loadLegacy>[0] = {}): Promise<ReturnType<typeof loadLegacy>> {
  const o = loadLegacy(opts);
  await o.runMain(['--file', FIXTURE_CSV_ABS]);
  return o;
}

/** Shallow copies of the rows with the `last_seen_at` key dropped. */
function dropLastSeen(rows: LegacyRow[]): LegacyRow[] {
  return rows.map((row) => {
    const copy = { ...row };
    delete copy.last_seen_at;
    return copy;
  });
}

function byKey(a: Record<string, unknown>, b: Record<string, unknown>): number {
  const nameCmp = String(a.legal_name_normalized).localeCompare(String(b.legal_name_normalized));
  if (nameCmp !== 0) return nameCmp;
  return String(a.mailing_address).localeCompare(String(b.mailing_address));
}

// The real acquire library — the conversion's parse contract.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const acquireLib = require(path.join(REPO_ROOT, 'scripts/lib/step/acquire.js')) as {
  parseCsv: (
    p: string,
    o: unknown,
    kp: string,
    ck: (r: unknown) => unknown,
    kc: string,
  ) => Promise<{ features: Array<Record<string, unknown> & { record: Record<string, unknown> }>; badKey: number; rowsParsed: number }>;
};

// ---------------------------------------------------------------------------
// Small readers over the legacy emit payloads
// ---------------------------------------------------------------------------

interface AuditRow {
  metric: string;
  value: unknown;
  threshold: unknown;
  status: string;
}

function auditRows(meta: Record<string, unknown>): AuditRow[] {
  const table = meta.audit_table as { rows?: AuditRow[] } | undefined;
  return table?.rows ?? [];
}

void [os, tmpDir, writeCsv, CSV_HEADER];

// ---------------------------------------------------------------------------
// PART 1 — legacy oracle pins (GREEN today). Every expected value below is
// derived from the frozen source `fixtures/legacy-load-wsib.js.txt`; the cited
// line numbers are comments only (the oracle reads the SOURCE TEXT fixture).
// ---------------------------------------------------------------------------

describe('row 3.5 — legacy oracle pins (GREEN today; the converted claims below must reproduce these)', () => {
  it('L1 — standalone run on the fixture: lock 97, 10 rows read, 2 non-G, 2 no-name, 4 unique Class G keys', async () => {
    const o = await legacyRunStandalone();
    // legacy :84 ADVISORY_LOCK_ID = 97.
    expect(o.lockIds).toEqual([97]);
    expect(o.summaries).toHaveLength(1);
    // legacy :401-407 — the emitSummary records_meta counter keys.
    const meta = o.summaries[0]!.records_meta as Record<string, unknown>;
    expect(meta.total_csv_rows).toBe(10);
    expect(meta.unique_class_g).toBe(4);
    expect(meta.skipped_non_g).toBe(2);
    expect(meta.skipped_no_name).toBe(2);
    expect(Object.keys(meta).filter((k) => k !== 'audit_table').sort()).toEqual([...LEGACY_META_KEYS].sort());
  });

  it('L2 — the G filter keeps predominant-G and subclass-G rows and drops rows G on neither (:289-292)', async () => {
    const o = await legacyRunStandalone();
    const rows = o.upsertRows();
    expect(rows).toHaveLength(4);
    const names = rows.map((r) => r.legal_name_normalized).sort();
    expect(names).toEqual(['ACME CONSTRUCTION', 'BETA PAVING', 'DELTA BUILDERS', 'EPSILON RENO']);
    // Beta is kept by its subclass G5 even though its predominant class is F2 (:289-292).
    const beta = rows.find((r) => r.legal_name_normalized === 'BETA PAVING')!;
    expect(beta.predominant_class).toBe('F2');
    expect(beta.subclass).toBe('G5');
    expect(rows.some((r) => r.legal_name_normalized === 'GAMMA FOODS')).toBe(false);
  });

  it('L3 — dedupe keeps the G-predominant row per (legal_name_normalized, address): r7 replaces r6, r8 does not replace r7 (:305-319)', async () => {
    const o = await legacyRunStandalone();
    const rows = o.upsertRows();
    const delta = rows.find((r) => r.legal_name_normalized === 'DELTA BUILDERS')!;
    expect(delta.legal_name).toBe('DELTA BUILDERS LTD.');
    expect(delta.trade_name).toBe('Delta Two');
    expect(delta.trade_name_normalized).toBe('DELTA TWO');
    expect(delta.predominant_class).toBe('G3');
    expect(delta.naics_code).toBe('238140');
    expect(delta.business_size).toBe('Large Business');
  });

  it('L4 — is_gta is a case-insensitive substring match over 25 GTA names (:45-58)', async () => {
    const o = await legacyRunStandalone();
    const rows = o.upsertRows();
    const acme = rows.find((r) => r.legal_name_normalized === 'ACME CONSTRUCTION')!;
    expect(acme.mailing_address).toBe('100 King St W, TORONTO ON');
    expect(acme.is_gta).toBe(true);
    const delta = rows.find((r) => r.legal_name_normalized === 'DELTA BUILDERS')!;
    expect(delta.is_gta).toBe(true); // Oakville is in GTA_CITIES.
    const beta = rows.find((r) => r.legal_name_normalized === 'BETA PAVING')!;
    expect(beta.is_gta).toBe(false); // Sudbury is not.
    const epsilon = rows.find((r) => r.legal_name_normalized === 'EPSILON RENO')!;
    expect(epsilon.is_gta).toBe(false); // No address.
    // Direct isGTA — case-insensitive substring over the 25 GTA names.
    expect(o.isGTA('1 A St, toronto on')).toBe(true);
    expect(o.isGTA('x, North York')).toBe(true);
    expect(o.isGTA('x, Sudbury ON')).toBe(false);
    expect(o.isGTA('')).toBe(false);
    expect(o.isGTA(null)).toBe(false);
    // Substring quirk: 'milton' is a GTA city, and Sudbury's 'Miltonvale' contains it (:54-58).
    expect(o.isGTA('12 Miltonvale Rd, Sudbury ON')).toBe(true);
  });

  it('L5 — normalizeName: upper-case, collapse spaces, strip one or two suffixes, strip trailing punctuation (:34-42)', async () => {
    const o = await legacyRunStandalone();
    expect(o.normalizeName('Acme Construction Inc.')).toBe('ACME CONSTRUCTION');
    expect(o.normalizeName('Foo Co. Ltd.')).toBe('FOO');
    expect(o.normalizeName('  a   b  ')).toBe('A B');
    expect(o.normalizeName('Acme, Inc.')).toBe('ACME');
    expect(o.normalizeName('INC.')).toBeNull();
    expect(o.normalizeName('   ')).toBeNull();
    expect(o.normalizeName('')).toBeNull();
    expect(o.normalizeName(null)).toBeNull();
  });

  it('L6 — the upsert writes exactly 13 columns, never the link/contact/identity columns (:225-229)', async () => {
    const o = await legacyRunStandalone();
    const insert = o.pool.queries.find((q) => /INSERT INTO wsib_registry/.test(q.sql))!;
    const sql = normalizeWs(insert.sql);
    const match = /INSERT INTO wsib_registry \(([^)]*)\)/.exec(sql)!;
    const columns = match[1]!.split(',').map((c) => c.trim());
    expect(columns).toHaveLength(13);
    for (const col of GUARD_COLUMNS) expect(columns).toContain(col);
    expect(columns).toContain('legal_name');
    expect(columns).toContain('legal_name_normalized');
    expect(columns).toContain('mailing_address');
    expect(columns).toContain('last_seen_at');
    for (const col of NEVER_WRITTEN) expect(columns).not.toContain(col);
    expect(sql).toContain('ON CONFLICT (legal_name_normalized, mailing_address)');
  });

  it('L7 — the guard: 9 IS DISTINCT FROM terms, last_seen_at written but never compared (:231-250)', async () => {
    const o = await legacyRunStandalone();
    const insert = o.pool.queries.find((q) => /INSERT INTO wsib_registry/.test(q.sql))!;
    const s = normalizeWs(insert.sql);
    // :231-250 — the DO UPDATE SET ... WHERE clause holds exactly the 9 guard terms.
    expect((s.match(/IS DISTINCT FROM/g) ?? []).length).toBe(9);
    for (const c of GUARD_COLUMNS) {
      expect(s).toContain(`wsib_registry.${c} IS DISTINCT FROM EXCLUDED.${c}`);
    }
    // last_seen_at is SET on every conflict but deliberately NOT part of the guard.
    expect(s).not.toContain('last_seen_at IS DISTINCT FROM');
    expect(s).toContain('last_seen_at = EXCLUDED.last_seen_at');
  });

  it('L8 — WS-D1: csv-parse keeps only the LAST duplicate Description header, so naics_description carries subclass text and subclass_description is null', async () => {
    // (a) the real library parser — csv-parse dedupes the duplicate "Description" header to the LAST one.
    const p = await acquireLib.parseCsv(
      FIXTURE_CSV_ABS,
      CSV_OPTIONS,
      'Legal name',
      (r) => loadLegacy().normalizeName(r as string),
      'legal_name_normalized',
    );
    const descKeys = Object.keys(p.features[0]!.record).filter((k) => k.startsWith('Description'));
    expect(descKeys).toEqual(['Description']);
    expect(p.features[0]!.record['Description']).toBe('SUBCLASS-G1-TEXT');

    // (b) legacy upsert — buildRow reads only descKeys[0], so the second arm (:64-66) is dead.
    const o = await legacyRunStandalone();
    const acme = o.upsertRows().find((r) => r.legal_name_normalized === 'ACME CONSTRUCTION')!;
    expect(acme.naics_description).toBe('SUBCLASS-G1-TEXT');
    expect(acme.subclass_description).toBeNull();
  });

  it('L9 — WS-D3: records_total = inserted + updated (not rows read, not unique keys) (:397-399)', async () => {
    const o = await legacyRunStandalone({
      upsertReturn: () => [{ is_insert: true }, { is_insert: true }, { is_insert: false }],
    });
    const summary = o.summaries[0]!;
    expect(summary.records_total).toBe(3);
    expect(summary.records_new).toBe(2);
    expect(summary.records_updated).toBe(1);
    // ...NOT the rows read, and NOT the unique Class G count.
    const meta = summary.records_meta;
    expect(meta.total_csv_rows).toBe(10);
    expect(meta.unique_class_g).toBe(4);
  });

  it('L10 — WS-D6/WS-D7: an empty address binds NULL; a non-G row with no name counts as non-G, not no-name', async () => {
    const o = await legacyRunStandalone();
    // WS-D6 — Epsilon has a blank Mailing Address cell; it binds NULL, not ''.
    const epsilon = o.upsertRows().find((r) => r.legal_name_normalized === 'EPSILON RENO')!;
    expect(epsilon.mailing_address).toBeNull();
    const meta = o.summaries[0]!.records_meta;
    // WS-D7 — the G filter runs BEFORE the name check, so the nameless A2 row is counted non-G.
    expect(auditRows(meta).find((r) => r.metric === 'skipped_non_g')!.value).toBe(2);
    expect(auditRows(meta).find((r) => r.metric === 'skipped_no_name')!.value).toBe(2);
  });

  it('L11 — the no-name rate WARNs at exactly 1.0% (:378-392, denominator unique + no-name)', async () => {
    // 99 named G rows + 1 blank-name G row: unique_class_g = 99, skipped_no_name = 1.
    const smallDir = tmpDir('wsib-rate-');
    const smallLines = [CSV_HEADER];
    for (let i = 1; i <= 99; i += 1) {
      smallLines.push(`Company ${i},,"${i} Main St, Sudbury ON",G1,236110,N,G1,S,Small Business`);
    }
    smallLines.push(',,"1 X St, Sudbury ON",G1,236110,N,G1,S,Small Business');
    const small = loadLegacy();
    await small.runMain(['--file', writeCsv(smallDir, 'r.csv', smallLines)]);
    const smallMeta = small.summaries[0]!.records_meta;
    // :379-381 — 1 / (99 + 1) = 1.0%; :392 — the WARN boundary is `>= 1`.
    expect(auditRows(smallMeta).find((r) => r.metric === 'skip_no_name_rate')!.value).toBe('1.0%');
    expect(auditRows(smallMeta).find((r) => r.metric === 'skip_no_name_rate')!.threshold).toBe('< 1%');
    expect(auditRows(smallMeta).find((r) => r.metric === 'skip_no_name_rate')!.status).toBe('WARN');

    // 199 named G rows + 1 blank-name G row: 1 / 200 = 0.5%.
    const bigDir = tmpDir('wsib-rate-');
    const bigLines = [CSV_HEADER];
    for (let i = 1; i <= 199; i += 1) {
      bigLines.push(`Company ${i},,"${i} Main St, Sudbury ON",G1,236110,N,G1,S,Small Business`);
    }
    bigLines.push(',,"1 X St, Sudbury ON",G1,236110,N,G1,S,Small Business');
    const big = loadLegacy();
    await big.runMain(['--file', writeCsv(bigDir, 'r.csv', bigLines)]);
    const bigMeta = big.summaries[0]!.records_meta;
    expect(auditRows(bigMeta).find((r) => r.metric === 'skip_no_name_rate')!.value).toBe('0.5%');
    expect(auditRows(bigMeta).find((r) => r.metric === 'skip_no_name_rate')!.status).toBe('PASS');

    // The fixture run (4 unique keys < 110000) WARNs on the unique-key threshold.
    const fx = await legacyRunStandalone();
    const fxMeta = fx.summaries[0]!.records_meta;
    const uniqueRow = auditRows(fxMeta).find((r) => r.metric === 'unique_class_g')!;
    expect(uniqueRow.threshold).toBe('>= 110000');
    expect(uniqueRow.status).toBe('WARN');
    const table = fxMeta.audit_table as { name: string; phase: number; verdict: string };
    expect(table.name).toBe('WSIB Registry Ingestion');
    expect(table.phase).toBe(11);
    expect(table.verdict).toBe('WARN');
  });

  it('L12 — Commit E (1ffa7478): standalone self-inserts pipeline_runs and ALWAYS finalizes — completed on success, failed on a schema-drift throw', async () => {
    // A standalone run INSERTs its own `running` row (:146) then finalizes it (:431).
    const ok = await legacyRunStandalone();
    expect(ok.pool.queries.some((q) => /INSERT INTO pipeline_runs/.test(q.sql))).toBe(true);
    const finalUpdates = ok.pool.queries.filter((q) => /UPDATE pipeline_runs/.test(q.sql));
    const lastUpdate = finalUpdates[finalUpdates.length - 1]!;
    expect(lastUpdate.params[0]).toBe('completed');
    expect(lastUpdate.params[2]).toBe(4);
    expect(lastUpdate.params[4]).toBe(4242);

    // Failure direction: a header missing the third required column destroys the parser inside the
    // try (:277-283), the pessimistic default survives, and `finally` still finalizes a row (:426-443).
    const driftDir = tmpDir('wsib-drift-');
    const driftPath = writeCsv(driftDir, 'drift.csv', ['Legal name,Predominant class', 'X Inc,G1']);
    const drift = loadLegacy();
    await expect(drift.runMain(['--file', driftPath])).rejects.toThrow(
      /Schema drift: missing column "Mailing Address"/,
    );
    const failedUpdate = drift.pool.queries.find((q) => /UPDATE pipeline_runs/.test(q.sql));
    expect(failedUpdate, 'no finalize UPDATE ran after the schema-drift throw').toBeDefined();
    expect(failedUpdate!.params[0]).toBe('failed');

    // Chain mode owns no pipeline_runs row at all (`if (!CHAIN_ID)`, :143).
    const chained = loadLegacy({ chain: 'sources' });
    await chained.runMain(['--file', FIXTURE_CSV_ABS]);
    expect(chained.pool.queries.some((q) => /INSERT INTO pipeline_runs/.test(q.sql))).toBe(false);
  });

  it('L13 — input seam: chain with no --file SKIPs PASS naming the newest data/ file; standalone throws; lock contention is silent (:87-133, :447)', async () => {
    const root = tmpDir('wsib-seam-');
    const scriptDir = path.join(root, 'scripts');
    const dataDir = path.join(root, 'data');
    fs.mkdirSync(scriptDir);
    fs.mkdirSync(dataDir);
    for (const name of [
      'BusinessClassificationDetails(2024).csv',
      'BusinessClassificationDetails(2025).csv',
      'businessclassificationdetails(2026).CSV',
    ]) {
      fs.writeFileSync(path.join(dataDir, name), '', 'utf8');
    }

    const o = loadLegacy({ chain: 'sources', scriptDir });
    await o.runMain([]);
    const summary = o.summaries[0]!;
    // :105-120 — the SKIP summary records nothing and verdicts PASS.
    expect(summary.records_total).toBe(0);
    const meta = summary.records_meta;
    const rows = auditRows(meta);
    expect(rows.find((r) => r.metric === 'status')!.value).toBe('SKIPPED');
    // :96 — `endsWith('.csv')` is case-sensitive, so the `(2026).CSV` file is invisible; :100 `sort().pop()`
    // takes the newest of the two remaining names.
    expect(rows.find((r) => r.metric === 'current_file')!.value).toBe('BusinessClassificationDetails(2025).csv');
    expect(rows.find((r) => r.metric === 'file_date')!.value).toBeDefined();
    expect(rows.find((r) => r.metric === 'reason')!.value).toBeDefined();
    expect(rows.find((r) => r.metric === 'instructions')!.value).toBeDefined();
    const table = meta.audit_table as { name: string; phase: number; verdict: string };
    expect(table.name).toBe('WSIB Registry Ingestion');
    expect(table.phase).toBe(11);
    expect(table.verdict).toBe('PASS');
    // The SKIP path touches neither the DB nor the lock.
    expect(o.pool.queries).toHaveLength(0);
    expect(o.lockIds).toHaveLength(0);

    // No CHAIN_ID and no --file: the legacy contract is a hard usage error (:87, :127).
    await expect(loadLegacy().runMain([])).rejects.toThrow(/Usage: node scripts\/load-wsib\.js --file/);
    // A --file that does not exist is a hard error too (:131-133).
    await expect(legacyRunMissingFile()).rejects.toThrow(/File not found/);

    // Lock contention: withAdvisoryLock reports acquired:false and the callback never runs (:447).
    const contended = loadLegacy({ lockAcquired: false });
    await contended.runMain(['--file', FIXTURE_CSV_ABS]);
    expect(contended.summaries).toHaveLength(0);
    expect(contended.pool.queries.some((q) => /INSERT INTO wsib_registry/.test(q.sql))).toBe(false);
  });
});

/** L13 helper — a standalone run against a path that does not exist. */
async function legacyRunMissingFile(): Promise<void> {
  const dir = tmpDir('wsib-missing-');
  const o = loadLegacy();
  await o.runMain(['--file', path.join(dir, 'nope.csv')]);
}

// ===========================================================================
// PART 2 — the converted claims, FLIPPED GREEN at ② (row 3.5 ①).
// These WERE `it.fails` at ① — vitest INVERTED them, because the body genuinely
// THREW: the throw WAS a NAMED MISSING ARTIFACT (`artifact()`), never a
// require/TS error, since the FIRST statement of every body that touches a
// future file goes through `loadDescriptor()` / `loadComputeModule()` /
// `readText()`. At ② that throw is gone: every body now passes as a plain `it(`.
//
// The pre-② state, for the record: `scripts/load-wsib.js` is the legacy argv
// loader — a bare `pipeline.run('load-wsib', …)` at module scope (:86 of the
// frozen fixture) with an `--file` argument and a chain-mode glob fallback; it
// has no `scripts/load-wsib.descriptor.json`, no `scripts/load-wsib.notes.json`
// and no `scripts/lib/compute/load-wsib.js`.
// ===========================================================================

async function convertedPipeline(compute: ComputeModule, csvAbs = FIXTURE_CSV_ABS) {
  const parsed = await acquireLib.parseCsv(csvAbs, CSV_OPTIONS, 'Legal name', (r) => compute.coerceKey!(r), 'legal_name_normalized');
  const skipped: Record<string, number> = {};
  const shaped: Record<string, unknown>[] = [];
  for (const f of parsed.features) {
    const r = compute.shapeRecord!(f.record, { geojson: undefined, config: {}, run_at: RUN_AT, tag: () => {} });
    if (r == null || typeof r === 'string') { const k = typeof r === 'string' && r ? r : 'unspecified'; skipped[k] = (skipped[k] ?? 0) + 1; continue; }
    shaped.push({ legal_name_normalized: f.legal_name_normalized, ...r });
  }
  const { kept, duplicateCount } = compute.dedupeBySourceId!(shaped);
  return { rowsParsed: parsed.rowsParsed, badKey: parsed.badKey, skipped, kept, duplicateCount };
}

describe('row 3.5 — D1 the descriptor and its ① artifacts (flipped GREEN at ②)', () => {
  it('D1 — descriptor AJV-valid; identity load_wsib INGESTOR spec 52 lock 97 display_name WSIB Registry Ingestion; shape ingest; notes exist; shell calls pipeline.step (flipped GREEN at ②)', () => {
    const d = loadDescriptor(); // the ① RED reason was MISSING ARTIFACT scripts/load-wsib.descriptor.json
    expect(d.identity.name).toBe('load_wsib');
    expect(d.identity.archetype).toBe('INGESTOR');
    expect(d.identity.spec).toBe('52');
    expect(d.identity.lock).toBe(LOCK_ID); // legacy :84 ADVISORY_LOCK_ID = 97 [READ fixtures/legacy-load-wsib.js.txt:84]
    // the audit-table NAME the legacy emits on both paths (:110 skip, :410 run).
    expect(d.identity.display_name).toBe('WSIB Registry Ingestion');
    // Spec 122 §5.1 — the frozen shape lives under `execution` (massing ② precedent).
    expect(d.execution!.shape).toBe('ingest');
    expect(fs.existsSync(abs(NOTES_REL)), `MISSING ARTIFACT ${NOTES_REL} — publisher vocabulary + storage-format constants`).toBe(true);
    const shell = readText(SHELL_REL);
    expect(shell).toContain('pipeline.step(');
    expect(shell).not.toContain('pipeline.run('); // RED today: the legacy shell's outer statement IS pipeline.run( (:86)
  });
});

describe('row 3.5 — D2 the ONE external (flipped GREEN at ②)', () => {
  it('D2 — the ONE external is a filesystem path primary: data glob, csv, bom, key Legal name, no url; guards.srid none; staleness trigger none (flipped GREEN at ②)', () => {
    const d = loadDescriptor();
    const externals = d.inputs.reads.externals;
    expect(externals).toHaveLength(1);
    const primary = externals[0]!;
    expect(primary.kind).toBe('filesystem');
    // legacy chain-skip glob :94-97 — `readdirSync(data)` filtered
    // `/^BusinessClassificationDetails/i` + `endsWith('.csv')` (decision D1).
    expect(primary.path).toBe('data/BusinessClassificationDetails*.csv');
    expect(primary.format).toBe('csv');
    expect(primary.csv_options).toEqual(CSV_OPTIONS);
    expect(primary.key_property).toBe('Legal name'); // legacy :294-295 — the name the key is normalized from
    expect(primary.url).toBeUndefined(); // a filesystem source has no remote URL
    expect(d.guards!.srid).toBe('none'); // a CSV has no CRS
    expect(d.staleness!.trigger).toBe('none'); // plan §2 row 15 — nothing gates this step's freshness
  });
});

describe('row 3.5 — D3 the absent-file terminal and the pre checks (flipped GREEN at ②)', () => {
  it('D3 — an absent file lands the skipped_no_source_file skip_gated terminal, and at least one pre check exists (LPA-D4) (flipped GREEN at ②)', () => {
    const d = loadDescriptor();
    // The legacy chain-skip (:89-120) emits a PASS/SKIPPED summary with no DB
    // writes and no lock; the converted form declares it as a terminal state.
    const terminal = (d.terminals ?? []).find((t) => t.id === 'skipped_no_source_file');
    expect(terminal, 'descriptor declares no terminal "skipped_no_source_file"').toBeDefined();
    expect(terminal!.kind).toBe('skip_gated');
    expect(terminal!.status).toBe('completed');
    // LPA-D4 (src/tests/step-conformance.infra.test.ts:2092-2125): a descriptor with a
    // skip_gated terminal must declare ≥1 `when:"pre"` check, so a gated skip says WHY.
    expect(d.checks.filter((c) => c.when === 'pre').length).toBeGreaterThanOrEqual(1);
  });
});

describe('row 3.5 — D4 coerceKey reproduces the legacy normalizeName (flipped GREEN at ②)', () => {
  it('D4 — coerceKey reproduces the legacy normalizeName on every vector (flipped GREEN at ②)', () => {
    const compute = loadComputeModule(); // the ① RED reason was MISSING ARTIFACT scripts/lib/compute/load-wsib.js
    const legacy = loadLegacy();
    // legacy L5 / normalizeName (:34-42): upper-case, collapse spaces, strip one
    // or two legal suffixes, strip trailing punctuation — a null for empty input.
    const VECTORS = ['Acme Construction Inc.', 'Foo Co. Ltd.', '  a   b  ', 'Acme, Inc.', 'INC.', '   ', '', 'DELTA BUILDERS LTD.', 'Delta Builders Limited', 'Smith & Sons L.P.'];
    for (const v of VECTORS) {
      expect(compute.coerceKey!(v), `coerceKey(${JSON.stringify(v)}) must equal the legacy normalizeName`).toBe(legacy.normalizeName(v));
    }
    // A null cell is a bad key (the library counts it in bad_key_count), never a throw. An ABSENT
    // `Legal name` column (undefined) is legacy schema drift (:274-284) — pinned by D17 (panel F3).
    expect(() => compute.coerceKey!(undefined)).toThrow(/Schema drift: missing column "Legal name"/);
    expect(compute.coerceKey!(null)).toBeNull();
  });
});

// ===========================================================================
// D5-D9 — the remaining converted claims (plan §2 rows 3/5/6/7, §3 WS-D1/D6/D7).
//
// `base` (a minimal, VALID legacy CSV record, predominant/subclass both G1) and
// `seam` (the 0n/0p runner seam verbatim — `shapeRecord(record, { geojson,
// config, run_at, tag })` [READ scripts/lib/step/index.js:1059-1061]) are declared
// ONCE here at module scope, not per test. The D8/D9 `compute.shapeRecord!(…)`
// forms are legitimate today: `loadComputeModule()` is the body's FIRST statement,
// so each test still fails as a NAMED MISSING ARTIFACT, never as an import error.
// ===========================================================================

const base: Record<string, string> = {
  'Legal name': 'X Co',
  'Trade name': '',
  'Mailing Address': '',
  'Predominant class': 'G1',
  'NAICS code': '1',
  Description: 'D',
  'Class/subclass': 'G1',
  'Business size': 'S',
};

const seam: Record<string, unknown> = { geojson: undefined, config: {}, run_at: RUN_AT, tag: () => {} };

describe('row 3.5 — D5 the converted shape and dedupe equal the legacy oracle (flipped GREEN at ②)', () => {
  it('D5 — oracle parity: the converted shape and dedupe of the fixture equal the legacy upsert rows, all 12 non-clock columns (flipped GREEN at ②)', async () => {
    const compute = loadComputeModule(); // the ① RED reason was MISSING ARTIFACT scripts/lib/compute/load-wsib.js
    const conv = await convertedPipeline(compute);
    const legacy = dropLastSeen((await legacyRunStandalone()).upsertRows()).sort(byKey);
    // The 13 write columns minus the one clock column, in the INSERT's own order
    // [READ scripts/load-wsib.js:225-229]. `upsertRows()` rebinds the params in that order
    // [READ src/tests/steps/load_wsib/fixtures/legacy-harness.ts:259-277].
    const cols = Object.keys(legacy[0]!);
    const mine = conv.kept.map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? null]))).sort(byKey);
    // Covers the G filter (:289-292), buildRow's column mapping (:60-82), is_gta (:80) and
    // the G-preference dedupe (:305-319) in one comparison — WS-D1 carried (subclass text in
    // naics_description, L8) and WS-D6 (`''` → null, L10) both ride along.
    expect(mine).toEqual(legacy);
  });
});

describe('row 3.5 — D6 row conservation on the fixture, and WS-D7 (flipped GREEN at ②)', () => {
  it('D6 — row conservation on the fixture, and WS-D7: the library counts a nameless non-G row as bad_key before the G filter (flipped GREEN at ②)', async () => {
    const conv = await convertedPipeline(loadComputeModule()); // the ① RED reason was MISSING ARTIFACT scripts/lib/compute/load-wsib.js
    // The fixture's 10 data rows [READ src/tests/steps/load_wsib/fixtures/wsib-sample.csv:2-11].
    expect(conv.rowsParsed).toBe(10);
    // 3 rows carry no usable legal-name key and never reach shapeRecord (acquire.js:509-510): the
    // blank-name row, `INC.` (normalizeName → null, L5) and the nameless A2 row. The ONE non_g skip
    // is Gamma Foods (A1/A1), dropped by the G filter inside shapeRecord.
    expect(conv.badKey).toBe(3);
    expect(conv.skipped).toEqual({ non_g: 1 });
    // DELTA BUILDERS LIMITED (F1/G3) and DELTA BUILDERS LTD. (G3) share the key
    // `DELTA BUILDERS|2 Queen St, Oakville ON` with the third delta row; the G-preference keeps
    // r7 (the first G-predominant row) and counts r6 and r8 as the 2 duplicates (:309-319).
    expect(conv.duplicateCount).toBe(2);
    expect(conv.kept.length).toBe(4);
    // Conservation: every parsed row is exactly one bad key, or the one non-G skip, or a kept
    // key's duplicate, or a kept row. The legacy CONTRAST (L1) — skipped_non_g 2 / skipped_no_name 2
    // — is a DIFFERENT cut of the same fixture (L10): the legacy G filter runs BEFORE its name check,
    // so the nameless A2 row is counted non-G there, while the library's coerceKey counts it bad_key.
    expect(conv.rowsParsed).toBe(conv.badKey + 1 + conv.duplicateCount + conv.kept.length);
  });
});

describe('row 3.5 — D7 shapeRecord reasons, is_gta, and the null address (flipped GREEN at ②)', () => {
  it('D7 — shapeRecord: non_g skip reason; is_gta case-insensitive and equal to the legacy isGTA (flipped GREEN at ②)', () => {
    const compute = loadComputeModule(); // the ① RED reason was MISSING ARTIFACT scripts/lib/compute/load-wsib.js
    const legacy = loadLegacy();
    // A non-G record is the 0p skip-reason STRING `"non_g"` (plan §2 row 3), never null.
    expect(compute.shapeRecord!({ ...base, 'Predominant class': 'A1', 'Class/subclass': 'A1' }, seam)).toBe('non_g');
    // is_gta is a case-insensitive substring match over the 25 GTA municipalities (:45-58).
    const ADDRESSES = ['1 A St, TORONTO ON', '1 A St, toronto on', '1 A St, Sudbury ON', '12 Miltonvale Rd, Sudbury ON'];
    for (const addr of ADDRESSES) {
      const r = compute.shapeRecord!({ ...base, 'Mailing Address': addr }, seam) as Record<string, unknown>;
      expect(r.is_gta, `is_gta(${JSON.stringify(addr)}) must equal the legacy isGTA`).toBe(legacy.isGTA(addr));
    }
    // WS-D6: a blank Mailing Address binds NULL; is_gta false (no address).
    const blank = compute.shapeRecord!({ ...base, 'Mailing Address': '' }, seam) as Record<string, unknown>;
    expect(blank.mailing_address).toBeNull();
    expect(blank.is_gta).toBe(false);
  });
});

describe('row 3.5 — D8 header drift (flipped GREEN at ②)', () => {
  it('D8 — header drift: a record missing a required legacy header throws the legacy Schema drift message (flipped GREEN at ②)', () => {
    const compute = loadComputeModule(); // the ① RED reason was MISSING ARTIFACT scripts/lib/compute/load-wsib.js
    // legacy :274-284 — the required header list, checked on the FIRST row. There it FAILS the
    // whole run; the plan's `required_columns` check has no library seam today (the acquired block
    // carries no header list), so ① pins the behaviour at the compute — the orchestrator rules the
    // final seat (descriptor check vs compute) at ②.
    for (const col of ['Legal name', 'Predominant class', 'Mailing Address']) {
      const rec = { ...base };
      delete rec[col];
      expect(() => compute.shapeRecord!(rec, seam)).toThrow(new RegExp('Schema drift: missing column "' + col + '"'));
    }
  });
});

describe('row 3.5 — D9 WS-D1 carried (flipped GREEN at ②)', () => {
  it('D9 — WS-D1 carried: naics_description takes the single parsed Description (subclass text), subclass_description null (flipped GREEN at ②)', () => {
    const compute = loadComputeModule(); // the ① RED reason was MISSING ARTIFACT scripts/lib/compute/load-wsib.js
    // WS-D1: csv-parse collapses the duplicate `Description` headers to the LAST one, so the
    // single `Description` value is the SUBCLASS text (L8) — buildRow's second arm (:64-66) is dead.
    // Fixed only by the D3 WF3 after cutover, together with the enrich-wsib whitelist.
    const r = compute.shapeRecord!({ ...base, Description: 'SUBCLASS-G1-TEXT' }, seam) as Record<string, unknown>;
    expect(r.naics_description).toBe('SUBCLASS-G1-TEXT');
    expect(r.subclass_description).toBeNull();
    // ② output panel F4 — the coupling, pinned BY NAME: scripts/enrich-wsib.js whitelists the
    // subclass strings naics_description actually holds (WS-D1). While subclass_description is
    // written null, that filter MUST stay on naics_description; fixing WS-D1 without moving
    // the enrich-wsib whitelist to subclass_description in the SAME commit empties the queue.
    const enrich = readText('scripts/enrich-wsib.js');
    expect(
      enrich,
      'scripts/enrich-wsib.js must still filter on `naics_description IN` while load_wsib writes subclass_description null (WS-D1 coupling)',
    ).toMatch(/AND naics_description IN \(/);
    expect(
      enrich,
      'scripts/enrich-wsib.js must not filter on subclass_description while load_wsib writes it null (WS-D1 coupling)',
    ).not.toMatch(/subclass_description IN \(/);
  });
});

// ===========================================================================
// D10-D12 — the write, and the two WARN boundaries (plan §2 rows 7-11, §3
// WS-D3/D6, §5, §8 Gate answers). D10 is modelled on the neighbourhoods D7
// (`buildWritePlan`), D11-D12 on its D10 (`driveCheck`).
// ===========================================================================

describe('row 3.5 — D10 the write (flipped GREEN at ②)', () => {
  it('D10 — the write: class A guarded upsert on the composite key, the same 9 guard columns, last_seen_at unguarded, never the link or contact columns (flipped GREEN at ②)', () => {
    const d = loadDescriptor(); // the ① RED reason was MISSING ARTIFACT scripts/load-wsib.descriptor.json
    const w = writes(d)[0]!;
    expect(w.table).toBe(WRITE_TABLE);
    // plan "Gate answers" — the class-A guarded-upsert write discipline, set at ②.
    expect(w.write_discipline.class).toBe('guarded_upsert');
    expect(w.write_discipline.guard).toBe('is_distinct_from');
    expect(w.write_discipline.txn_scope).toBe('step');
    expect(w.write_discipline.idempotent_rerun).toBe('zero_writes');
    expect(w.retract).toBe('none'); // one source → one target: nothing retracts
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS write codegen
    const writeLib = require(path.join(REPO_ROOT, 'scripts/lib/step/write.js')) as {
      buildWritePlan: (w: unknown, dd: unknown) => { upsertSqlFor: (n: number) => string; guard_columns: string[] };
    };
    const plan = writeLib.buildWritePlan(w, d);
    // L7: the guard is EXACTLY the 9 legacy guard columns — no more, no less.
    expect([...plan.guard_columns].sort()).toEqual([...GUARD_COLUMNS].sort());
    const sql = normalizeWs(plan.upsertSqlFor(1));
    // legacy :230 — the conflict key is the composite (legal_name_normalized, mailing_address).
    expect(sql).toContain('ON CONFLICT (legal_name_normalized, mailing_address)');
    for (const c of GUARD_COLUMNS) {
      expect(sql).toContain(`${WRITE_TABLE}.${c} IS DISTINCT FROM EXCLUDED.${c}`);
    }
    // legacy :241 SET vs :242-250 guard — last_seen_at is written on every conflict but NOT guarded.
    expect(sql).not.toContain('last_seen_at IS DISTINCT FROM');
    // The INSERT column list carries last_seen_at and both KEY_COLUMNS, and NEVER a
    // NEVER_WRITTEN column — the fence `link-wsib-ledger-gate.logic.test.ts` W3 pins.
    const insertCols = /INSERT INTO \w+ \(([^)]*)\)/.exec(sql)![1]!.split(',').map((c) => c.trim());
    expect(insertCols).toContain('last_seen_at');
    for (const c of KEY_COLUMNS) expect(insertCols).toContain(c);
    for (const c of NEVER_WRITTEN) expect(insertCols).not.toContain(c);
  });
});

describe('row 3.5 — D11 the no-name skip rate (flipped GREEN at ②)', () => {
  it('D11 — wsib_no_name_skip_rate reports the percentage only; the EVALUATED verdict is PASS at exactly 1.0 (WS-D9 declared deviation: legacy WARNed at >= 1.0), FAIL above (WS-D10, Spec 124 R-AX), PASS below (flipped GREEN at ②)', () => {
    const d = loadDescriptor(); // the ① RED reason was MISSING ARTIFACT scripts/load-wsib.descriptor.json
    const c = checkById(d, 'wsib_no_name_skip_rate');
    // Gate A (plan §8) — the bound comes from the registered logic variable, never a literal.
    expect(c.limit_from_config).toBe('load_wsib_no_name_skip_warn_pct');
    expect(c.severity, 'WS-D10 — the bound on_row_error:"skip" cites must be FAIL (R-AX)').toBe('FAIL');
    // Q1 doctrine (verdict.js :146-152, :177): the compute reports `value` — the PERCENTAGE
    // (1.0 / 1.5 / 0.5) — and NEVER a 0/1 `violations` flag; `checkRow` is the only comparator.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS verdict library
    const { checkRow } = require(path.join(REPO_ROOT, 'scripts/lib/step/verdict.js')) as {
      checkRow: (c: unknown, o: unknown, e: string, cfg?: unknown) => { status: string } | null;
    };
    const verdictOf = (ck: Check, o: Record<string, unknown>, cfg: Record<string, number>) =>
      checkRow(ck, o, 'fail_step', cfg)!.status;
    const cfg = { load_wsib_no_name_skip_warn_pct: 1 };
    // legacy L11 boundary (:378-392): 1 / (99 + 1) * 100 = 1.0. WS-D9 declared deviation —
    // the `pct <=` grammar is INCLUSIVE, so exactly 1.0 PASSes (the legacy WARNed at >= 1.0);
    // 0 rows affected on the 2025 file.
    const at = driveCheck('wsib_no_name_skip_rate', {
      acquired: { bad_key_count: 1, feature_count: 99 },
      config: cfg,
    });
    expect(at[0]![1]!.value).toBe(1);
    expect('violations' in at[0]![1]!).toBe(false);
    expect(verdictOf(c, at[0]![1]!, cfg)).toBe('PASS');
    // 3 / (197 + 3) * 100 = 1.5 ⇒ above the inclusive bound ⇒ FAIL (WS-D10).
    const over = driveCheck('wsib_no_name_skip_rate', {
      acquired: { bad_key_count: 3, feature_count: 197 },
      config: cfg,
    });
    expect(over[0]![1]!.value).toBe(1.5);
    expect(verdictOf(c, over[0]![1]!, cfg)).toBe('FAIL');
    // 1 / (199 + 1) * 100 = 0.5 ⇒ under the bound ⇒ PASS.
    const under = driveCheck('wsib_no_name_skip_rate', {
      acquired: { bad_key_count: 1, feature_count: 199 },
      config: cfg,
    });
    expect(under[0]![1]!.value).toBe(0.5);
    expect(verdictOf(c, under[0]![1]!, cfg)).toBe('PASS');
  });
});

describe('row 3.5 — D12 the unique-Class-G floor (flipped GREEN at ②)', () => {
  it('D12 — wsib_unique_class_g reports the count only; the evaluated verdict WARNs at 109999 and PASSes at 110000 (the legacy < boundary) (flipped GREEN at ②)', () => {
    const d = loadDescriptor(); // the ① RED reason was MISSING ARTIFACT scripts/load-wsib.descriptor.json
    const c = checkById(d, 'wsib_unique_class_g');
    // Gate A (plan §8) — the floor is the registered logic variable, not the legacy literal.
    expect(c.limit_from_config).toBe('load_wsib_unique_class_g_warn_min');
    expect(c.severity).toBe('WARN');
    // Q1 doctrine — the compute reports only the COUNT; `checkRow` compares it against the
    // config-substituted `value_min` (legacy :387 — `unique < 110000` WARNs).
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS verdict library
    const { checkRow } = require(path.join(REPO_ROOT, 'scripts/lib/step/verdict.js')) as {
      checkRow: (c: unknown, o: unknown, e: string, cfg?: unknown) => { status: string } | null;
    };
    const verdictOf = (ck: Check, o: Record<string, unknown>, cfg: Record<string, number>) =>
      checkRow(ck, o, 'fail_step', cfg)!.status;
    const cfg = { load_wsib_unique_class_g_warn_min: 110000 };
    // 109999 < 110000 ⇒ the legacy boundary WARNs.
    const below = driveCheck('wsib_unique_class_g', {
      acquired: { feature_count: 109999 },
      config: cfg,
    });
    expect(below[0]![1]!.value).toBe(109999);
    expect('violations' in below[0]![1]!).toBe(false);
    expect(verdictOf(c, below[0]![1]!, cfg)).toBe('WARN');
    // Exactly 110000 is the boundary: `value_min` is inclusive ⇒ PASS.
    const at = driveCheck('wsib_unique_class_g', {
      acquired: { feature_count: 110000 },
      config: cfg,
    });
    expect(verdictOf(c, at[0]![1]!, cfg)).toBe('PASS');
  });
});

// ===========================================================================
// D13-D15 — the null-address invariant, the emit skeleton + WS-D3 counters,
// and the two logic variables (plan §2 rows 7-11, §3 WS-D6, §5, §8 Gate
// answers). D13 is modelled on the neighbourhoods D10 (`driveCheck`).
// ===========================================================================

describe('row 3.5 — D13 WS-D6 the null-address invariant (flipped GREEN at ②)', () => {
  it('D13 — WS-D6: wsib_null_address_count is a viol == 0 invariant over acquired.column_nulls (flipped GREEN at ②)', () => {
    const d = loadDescriptor(); // the ① RED reason was MISSING ARTIFACT scripts/load-wsib.descriptor.json
    const c = checkById(d, 'wsib_null_address_count');
    // Gate A (plan §8) — every non-bound check is the `viol == 0` invariant form,
    // never a config-derived limit.
    expect(c.limit).toBe('viol == 0');
    // WS-D6 (L10): the legacy binds a blank Mailing Address cell as NULL; the converted
    // invariant FAILs if any acquired row carries a null address.
    const bad = driveCheck('wsib_null_address_count', {
      acquired: { column_nulls: { mailing_address: 1 } },
      config: {},
    });
    expect(bad[0]![1]!.violations).toBe(1);
    const ok = driveCheck('wsib_null_address_count', {
      acquired: { column_nulls: { mailing_address: 0 } },
      config: {},
    });
    expect(ok[0]![1]!.violations).toBe(0);
  });
});

describe('row 3.5 — D14 the emit skeleton and the WS-D3 counters (flipped GREEN at ②)', () => {
  it('D14 — emits audit_table and wsib_load holding the seven legacy records_meta keys; counters carry WS-D3 (flipped GREEN at ②)', () => {
    const d = loadDescriptor(); // the ① RED reason was MISSING ARTIFACT scripts/load-wsib.descriptor.json
    // Gate C (plan §8) — exactly the two emits, no more, no less.
    expect((d.emits ?? []).map((e) => e.key).sort()).toEqual(['audit_table', 'wsib_load']);
    // The `wsib_load` skeleton holds the seven legacy records_meta keys (L1, :401-407).
    const wl = (d.emits ?? []).find((e) => e.key === 'wsib_load')!;
    const skeletonKeys = Object.keys(wl.skeleton ?? {});
    for (const k of LEGACY_META_KEYS) {
      expect(skeletonKeys, `the wsib_load skeleton must carry the legacy key \"${k}\"`).toContain(k);
    }
    // WS-D3 (L9, :397-399) — records_total is the inserted + updated count, never rows read.
    expect(d.counters!.records_total!.source).toBe('written.inserted + written.updated');
    expect(d.counters!.records_new!.source).toBe('written.inserted');
  });
});

describe('row 3.5 — D15 the two logic variables and their seeds (flipped GREEN at ②)', () => {
  it('D15 — the two logic variables are declared on_invalid fail and seeded byte-equal to the legacy literals 110000 and 1 (flipped GREEN at ②)', () => {
    const d = loadDescriptor(); // the ① RED reason was MISSING ARTIFACT scripts/load-wsib.descriptor.json
    // Gate B (plan §8) — every declared literal is a registered variable that FAILs on
    // invalid input, never a silent fallback.
    const vars = d.config!.logic_variables!;
    const names = vars.map((v) => v.name);
    for (const n of ['load_wsib_unique_class_g_warn_min', 'load_wsib_no_name_skip_warn_pct']) {
      expect(names, `config.logic_variables must declare \"${n}\"`).toContain(n);
      expect(vars.find((v) => v.name === n)!.on_invalid, `on_invalid for ${n}`).toBe('fail');
    }
    // The seed rows carry the legacy literals byte for byte (L11, :387/:392).
    const seeds = JSON.parse(fs.readFileSync(abs(SEEDS_REL), 'utf8')) as Record<
      string,
      { default: unknown; admin?: { group?: string } }
    >;
    expect(seeds.load_wsib_unique_class_g_warn_min!.default).toBe(110000);
    expect(seeds.load_wsib_no_name_skip_warn_pct!.default).toBe(1);
    expect(seeds.load_wsib_unique_class_g_warn_min!.admin!.group).toBe('WSIB Registry');
    expect(seeds.load_wsib_no_name_skip_warn_pct!.admin!.group).toBe('WSIB Registry');
  });
});

// ===========================================================================
// D16-D17 — the runner clock and the drift-throwing key seam (panels F5/F3).
// ===========================================================================

describe('row 3.5 — D16 last_seen_at is the runner clock (panel F5)', () => {
  it('D16 — shapeRecord stamps last_seen_at with seam.run_at — the same Date, never a silent NULL', () => {
    const compute = loadComputeModule(); // the ① RED reason was MISSING ARTIFACT scripts/lib/compute/load-wsib.js
    const r = compute.shapeRecord!(base, seam) as Record<string, unknown>;
    // The runner seam's `run_at` IS the stamp — the same Date OBJECT, not a copy, and never a
    // silent NULL (D5 strips the column from its oracle parity, so nothing else pins it).
    expect(r.last_seen_at).toBe(RUN_AT);
    expect(r.last_seen_at).not.toBeNull();
  });
});

describe('row 3.5 — D17 a missing Legal name column is schema drift (panel F3)', () => {
  it('D17 — coerceKey throws the legacy Schema drift on an absent Legal name cell; the parse of a Legal-name-less CSV rejects before any row is carried', async () => {
    const compute = loadComputeModule(); // the ① RED reason was MISSING ARTIFACT scripts/lib/compute/load-wsib.js
    // legacy :274-284 — a CSV whose header lacks `Legal name` is SCHEMA DRIFT, a throw, not a
    // per-row skip; the key seam is where the legacy header check now fires.
    expect(() => compute.coerceKey!(undefined)).toThrow(/Schema drift: missing column "Legal name"/);
    // A BLANK cell is NOT drift — it is still just a bad key (D4 / the library's bad_key_count).
    expect(compute.coerceKey!('')).toBeNull();

    const dir = tmpDir('wsib-noname-');
    const p = writeCsv(dir, 'n.csv', ['Predominant class,Mailing Address', 'G1,123 Test St']);
    await expect(
      acquireLib.parseCsv(p, CSV_OPTIONS, 'Legal name', (x) => compute.coerceKey!(x), 'legal_name_normalized'),
    ).rejects.toThrow(/Schema drift: missing column "Legal name"/);
  });
});

// ===========================================================================
// D18 — row conservation made visible (② output panel F1, load_massing
// precedent): two INFO post checks, measured value in detail, null when not
// measured, violations 0 always (INFO never gates).
// ===========================================================================

describe('row 3.5 — D18 row conservation in the audit rows (② output panel F1)', () => {
  it('D18 — records_unchanged and duplicate_key_count are INFO post viol == 0 checks, the LAST two in descriptor order', () => {
    const d = loadDescriptor();
    const ids = d.checks.map((c) => c.id);
    expect(ids.slice(-2)).toEqual(['records_unchanged', 'duplicate_key_count']);
    for (const id of ['records_unchanged', 'duplicate_key_count']) {
      const c = checkById(d, id);
      expect(c.severity, id).toBe('INFO');
      expect(c.blocking, id).toBe(false);
      expect(c.when, id).toBe('post');
      expect(c.limit, id).toBe('viol == 0');
      expect(c.limit_from_config, id).toBeUndefined();
    }
  });

  it('D18 — records_unchanged reports written.unchanged when measured, null when not (never a fabricated 0)', () => {
    const measured = driveCheck('records_unchanged', { written: { inserted: 0, updated: 47040, unchanged: 74076 }, acquired: {}, config: {} });
    expect(measured).toEqual([['records_unchanged', { violations: 0, detail: 74076 }]]);
    const zero = driveCheck('records_unchanged', { written: { unchanged: 0 }, acquired: {}, config: {} });
    expect(zero[0]![1]!.detail).toBe(0);
    const absent = driveCheck('records_unchanged', { acquired: {}, config: {} });
    expect(absent).toEqual([['records_unchanged', { violations: 0, detail: null }]]);
  });

  it('D18 — duplicate_key_count reports acquired.duplicate_key_count when measured, null when not (never a fabricated 0)', () => {
    const measured = driveCheck('duplicate_key_count', { acquired: { duplicate_key_count: 12244 }, config: {} });
    expect(measured).toEqual([['duplicate_key_count', { violations: 0, detail: 12244 }]]);
    const zero = driveCheck('duplicate_key_count', { acquired: { duplicate_key_count: 0 }, config: {} });
    expect(zero[0]![1]!.detail).toBe(0);
    const absent = driveCheck('duplicate_key_count', { acquired: {}, config: {} });
    expect(absent).toEqual([['duplicate_key_count', { violations: 0, detail: null }]]);
  });
});

// ===========================================================================
// The commit-① report itself — plain `it`: GREEN today (the orchestrator
// lands docs/reports/2026-09-29-batch2-p3-5-load-wsib-assessment.md).
// ===========================================================================

describe('row 3.5 — the commit-① assessment report (plain it: GREEN today)', () => {
  it('the report states the compressed-form marker line (R-PACE-1)', () => {
    const report = readText(REPORT_REL);
    expect(report).toContain('**Commit form: compressed (R-PACE-1)**');
  });
});
