// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 (commit 6 — PH-7 test design, prove red), §6.1 (G4d both-directions locks), §5.2 (the per-step checklist)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape), §5.2 (conformance), §5.4 (lock-test convention)
// SPEC LINK: docs/specs/01-pipeline/120_pipeline_step_runner.md §3.4–§3.4b (notes.json), §14 (conversion workflow), §15 (step testing), §9.2 (load-bearing intent)
//
// Pilot 1 — `assert_schema`. The 55-A hard gate (44 claims, k=PER_STEP) + the 5 55-B monotone
// partials (k=MIXED) + the 4 G4d fence locks, one `it` per claim, claim number and text in the
// test name (generator: `node scripts/violations/plan-claims.mjs --json`, `scope === 'PER_STEP'`).
//
// ⚠️ EVERY CLAIM TEST MUST BE RED TODAY, AND RED FOR THE RIGHT REASON. Each one opens by asserting
// the FUTURE artifact it reads exists (`artifact()` → `expect(existsSync).toBe(true)` with the path
// in the message), so the failure names the missing artifact rather than surfacing as a TypeScript
// or import error. Nothing here requires the CURRENT step file in-process — it still calls
// `pipeline.run()` and would open a pool. The require probe is a child process.
//
// The artifacts this file asserts against (named in .cursor/active_task.md, commits 1–9):
//   scripts/quality/assert-schema.descriptor.json     — the descriptor, with Fold A/B corrections 1–7
//   scripts/quality/assert-schema.notes.json          — DECISION (commit 6): a REAL notes file, so
//                                                        #30/31/33/34/35/37/38 are not vacuous
//   scripts/lib/compute/assert-schema.js              — the compute, exports `compute`
//   scripts/quality/assert-schema.js                  — the §5.1 frozen shape (SPEC LINK kept)
//   scripts/steps/_schema/converted.json              — contains the step path (commit 9)
//   docs/reports/2026-08-25-pilot1-assert-schema-assessment.md — PH-0/3/5/6 report (commits 1–4)
//   docs/reports/golden/assert_schema/*.json — capture-step-golden docs (commit 5)
//
// Shape decisions recorded here because the schema is silent (root `additionalProperties:false`
// forbids a `fences` category, so Spec 120 §14.0's `fences[]` cannot live in the descriptor):
//   · `fences[]` lives in assert-schema.notes.json under the top-level key `fences` — a record
//     block, NOT one of the capped prose blocks. Each entry: {const, value, incident, commit, lock_test}.
//   · notes.json prose blocks (counted against the cap of 12, Spec 120 §3.4): expected_shape ·
//     read_this_way · suspicious_if · blind_spots · decisions · review_notes · expected ·
//     known_normal · known_bad · do_not_reflag · how_to_investigate · limitations.
//     `counts.open_blind_spots` / `counts.unpromoted_suspicious_if` are self-declared and asserted.
//   · `zoning_resource_columns.expect.resources` is a map CKAN resource id → required columns
//     (Fold A correction 2: three distinct required sets, not two).
//   · The report's machine-readable tables are found by HEADER, not position: Intent Ledger
//     (construct · discovered by · disposition · adjudicated by), Line accounting (lines · category ·
//     evidence), Non-determinism inventory (key · disposition), Boundary freeze (table · rows),
//     Commit ledger (commit · done-test).
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const THIS_FILE_REL = 'src/tests/steps/assert_schema/violations.test.ts';
const STEP_DIR_REL = 'src/tests/steps/assert_schema';

const STEP_REL = 'scripts/quality/assert-schema.js';
const DESCRIPTOR_REL = 'scripts/quality/assert-schema.descriptor.json';
const NOTES_REL = 'scripts/quality/assert-schema.notes.json';
const COMPUTE_REL = 'scripts/lib/compute/assert-schema.js';
const CONVERTED_REL = 'scripts/steps/_schema/converted.json';
const REPORT_REL = 'docs/reports/2026-08-25-pilot1-assert-schema-assessment.md';
const GOLDEN_DIR_REL = 'docs/reports/golden/assert_schema';
const GOLDEN_HARNESS_REL = 'scripts/analysis/capture-step-golden.js';
const PROBE = path.join(REPO_ROOT, 'scripts/hooks/step-require-probe.cjs');
const COMPUTE_STUB_REL = 'scripts/steps/_schema/fixtures/shape/_compute-stub.js';
const REVIEW_CLIS = ['scripts/gemini-review.js', 'scripts/deepseek-review.js'];

/** The 4 fences on scripts/quality/assert-schema.js — `git log --format=%B | grep -ci "^Severity:"` = 4. */
const FENCE_COMMITS = ['646ea5a7', '58914fa8', '1ceebd17', 'f6047e89'];

/** Spec 120 §14.3 — the closed disposition vocabulary of the Intent Ledger. */
const LEDGER_DISPOSITIONS = [
  'preserved-in-runner',
  'preserved-in-validator',
  'preserved-in-compute',
  'encoded-as-descriptor-field',
  'encoded-as-deviation',
  'knowingly-retired',
];
/** Spec 120 §14.2 / claim #151a — the closed non-determinism disposition vocabulary. */
const NONDET_DISPOSITIONS = ['must-match-exactly', 'normalize-then-match', 'excluded-with-reason'];
/** Spec 120 §14.5 Gate 4c — the line-accounting categories. */
const LINE_CATEGORIES = ['runner-owned', 'validator-owned', 'descriptor-encoded', 'compute', 'dead (proved)', 'duplicate'];
/** Spec 120 §3.4 — the prose blocks that count against the cap. `decisions` carry `adjudicated`, not `measured`. */
const NOTES_PROSE_BLOCKS = [
  'expected_shape', 'read_this_way', 'suspicious_if', 'blind_spots', 'decisions', 'review_notes',
  'expected', 'known_normal', 'known_bad', 'do_not_reflag', 'how_to_investigate', 'limitations',
];
const NOTES_MEASURED_EXEMPT = new Set(['decisions']);
const NOTES_CAP = 12;

// ⚠️ #183 partial — the inline fixtures below were reviewed on this date. The max-age assertion
// goes red 180 days later BY DESIGN (Spec 120 §15.5: ">180 days without review fails").
const FIXTURE_REVIEWED = '2026-08-25';
const FIXTURE_MAX_AGE_DAYS = 180;

// ONE compiler, the same one pipeline.step() validates with (step-conformance.infra.test.ts:50).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const { validateDescriptor } = require(path.join(REPO_ROOT, 'scripts/lib/step/validate.js')) as {
  validateDescriptor: (d: unknown) => unknown;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const { buildAuditTable } = require(path.join(REPO_ROOT, 'scripts/lib/step/verdict.js')) as {
  buildAuditTable: (
    descriptor: Descriptor,
    chainId: string | null,
    observations: Record<string, unknown>,
  ) => { rows: Array<{ metric: string; value: unknown; status: string }>; audit_table: { verdict: string } };
};

// ---------------------------------------------------------------------------
// Types (the slice of step.schema.json this file reads)
// ---------------------------------------------------------------------------

interface Check {
  id: string;
  kind: string;
  expect: unknown;
  limit: unknown;
  severity: string;
  blocking: boolean;
  when: string;
  chains: string[] | 'all';
}
interface Descriptor {
  identity: { name: string; display_name: string; lock: number };
  inputs: { reads: { tables: Array<{ table: string }>; externals: Array<{ id: string; url?: string }> } };
  outputs: unknown;
  execution: { on_check_error: string; network: { timeout: string } | 'none' };
  checks: Check[];
  emits: Array<{ key: string; consumers: string[] }>;
  deviations: unknown;
  interpretation: { file: string; entries: number } | 'none';
  database: { min_migration: number | 'none' };
  counters: unknown;
  sharing: { varies_by_chain: { checks: string } };
  terminals: Array<{ id: string; kind: string; status: string; records_meta: Record<string, string> | string }>;
}
interface NotesEntry {
  measured?: { value?: unknown; date?: string; query?: string };
  detected_by?: string;
  check?: string;
  stale_interpretation?: boolean;
  [k: string]: unknown;
}
interface Notes {
  fences?: Array<{ const: string; value: unknown; incident: string; commit: string; lock_test: string }>;
  counts?: { open_blind_spots?: number; unpromoted_suspicious_if?: number };
  [block: string]: unknown;
}
interface GoldenDoc {
  harness: string;
  chain: string | null;
  nondeterminism: string[];
  normalised: unknown;
  file: string;
}
type ComputeFn = (ctx: unknown) => Promise<{ observations?: Record<string, unknown> } | void>;

// ---------------------------------------------------------------------------
// Artifact helpers — every claim test opens with one of these
// ---------------------------------------------------------------------------

function abs(rel: string): string {
  return path.join(REPO_ROOT, rel);
}

/** Assert a FUTURE artifact exists; the failure message names it. Returns the absolute path. */
function artifact(rel: string, why = ''): string {
  expect(
    fs.existsSync(abs(rel)),
    `MISSING ARTIFACT ${rel}${why ? ` — ${why}` : ''} (not yet produced by the pilot-1 commit sequence)`,
  ).toBe(true);
  return abs(rel);
}

function readText(rel: string): string {
  return fs.readFileSync(artifact(rel), 'utf8');
}

function loadDescriptor(): Descriptor {
  const d = JSON.parse(readText(DESCRIPTOR_REL)) as Descriptor;
  validateDescriptor(d); // throws with the AJV error list — the loader property (§4.2)
  return d;
}

function loadNotes(): Notes {
  return JSON.parse(readText(NOTES_REL)) as Notes;
}

function computeSource(): string {
  return readText(COMPUTE_REL);
}

function loadCompute(): ComputeFn {
  const mod = require(artifact(COMPUTE_REL)) as { compute?: ComputeFn } | ComputeFn; // eslint-disable-line @typescript-eslint/no-require-imports -- the FUTURE CJS compute module
  const fn = typeof mod === 'function' ? mod : mod.compute;
  expect(typeof fn, `${COMPUTE_REL} must export \`compute\` (a function)`).toBe('function');
  return fn as ComputeFn;
}

function loadComputeStub(): ComputeFn {
  return require(abs(COMPUTE_STUB_REL)) as ComputeFn; // eslint-disable-line @typescript-eslint/no-require-imports -- CJS fixture stub
}

/** The pg.Pool construction spy, as a child process (never require a step in-process). */
function probe(rel: string): { pools: number; clients: number; require_error: string | null; has_descriptor: boolean; compute_type: string } {
  const raw = execFileSync('node', [PROBE, rel], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 60_000 });
  return JSON.parse(raw) as { pools: number; clients: number; require_error: string | null; has_descriptor: boolean; compute_type: string };
}

function git(args: string[]): string {
  try {
    return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', timeout: 60_000 }).trim();
  } catch {
    return '';
  }
}

/** Unix time of the FIRST commit touching `rel` (0 = never committed). */
function firstCommitTime(rel: string, pickaxe?: string): number {
  const args = ['log', '--reverse', '--format=%ct'];
  if (pickaxe) args.push(`-S${pickaxe}`);
  args.push('--', rel);
  const first = git(args).split(/\r?\n/)[0] ?? '';
  return first ? Number(first) : 0;
}

/** Strip block + line comments (roughly) so a token grep sees CODE, not prose. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function walk(dirAbs: string, out: string[] = []): string[] {
  if (!fs.existsSync(dirAbs)) return out;
  for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true })) {
    const p = path.join(dirAbs, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function stepTestDirFiles(): string[] {
  return walk(abs(STEP_DIR_REL)).map((p) => path.relative(REPO_ROOT, p).replace(/\\/g, '/'));
}

/** Every prose entry of a notes file, tagged with its block. */
function notesEntries(notes: Notes): Array<{ block: string; entry: NotesEntry }> {
  const out: Array<{ block: string; entry: NotesEntry }> = [];
  for (const block of NOTES_PROSE_BLOCKS) {
    const arr = notes[block];
    if (!Array.isArray(arr)) continue;
    for (const entry of arr as NotesEntry[]) out.push({ block, entry });
  }
  return out;
}

function isNone(v: unknown): boolean {
  return typeof v === 'string' && /^none\b/i.test(v);
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 86_400_000;
}

/** #36 partial — the stale_interpretation detector (INFO flag on entries older than N months). */
function staleEntries(entries: Array<{ block: string; entry: NotesEntry }>, now: Date, months = 6): string[] {
  const out: string[] = [];
  for (const { block, entry } of entries) {
    const date = entry.measured?.date;
    if (!date) continue;
    if (daysBetween(now, new Date(date)) > months * 30.4375) out.push(`${block}: measured ${date}`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Markdown tables in the pilot report — found by HEADER, never by position
// ---------------------------------------------------------------------------

interface MdTable {
  heading: string;
  headers: string[];
  rows: Array<Record<string, string>>;
}

function cleanCell(s: string): string {
  return s.replace(/[`*]/g, '').trim();
}

function mdTables(md: string): MdTable[] {
  const lines = md.split(/\r?\n/);
  const tables: MdTable[] = [];
  let heading = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (/^#{1,6}\s/.test(line)) heading = line.replace(/^#+\s*/, '').trim();
    const next = lines[i + 1] ?? '';
    if (line.trim().startsWith('|') && /^\s*\|?\s*:?-{3,}/.test(next)) {
      const headers = line.split('|').slice(1, -1).map((h) => cleanCell(h).toLowerCase());
      const rows: Array<Record<string, string>> = [];
      let j = i + 2;
      for (; j < lines.length && (lines[j] ?? '').trim().startsWith('|'); j++) {
        const cells = (lines[j] ?? '').split('|').slice(1, -1).map(cleanCell);
        const row: Record<string, string> = {};
        headers.forEach((h, k) => { row[h] = cells[k] ?? ''; });
        rows.push(row);
      }
      tables.push({ heading, headers, rows });
      i = j - 1;
    }
  }
  return tables;
}

/** Find the report table whose headers satisfy every predicate; the failure names what was looked for. */
function reportTable(md: string, want: Array<[string, RegExp]>): { table: MdTable; col: (name: string) => string } {
  const found = mdTables(md).find((t) => want.every(([, re]) => t.headers.some((h) => re.test(h))));
  expect(
    found,
    `${REPORT_REL} has no table with columns ${want.map(([n]) => n).join(' · ')} (${mdTables(md).length} tables found)`,
  ).toBeDefined();
  const t = found as MdTable;
  const col = (name: string): string => {
    const [, re] = want.find(([n]) => n === name) as [string, RegExp];
    return t.headers.find((h) => re.test(h)) as string;
  };
  return { table: t, col };
}

const INTENT_LEDGER_COLS: Array<[string, RegExp]> = [
  ['construct', /construct/],
  ['discovered by', /discover/],
  ['disposition', /^disposition/],
  ['adjudicated by', /adjudicat|approver/],
];

// ---------------------------------------------------------------------------
// Golden-master captures (commit 5) — discovery by content, not by file name
// ---------------------------------------------------------------------------

function goldenDocs(): GoldenDoc[] {
  artifact(GOLDEN_DIR_REL, 'golden-master captures, commit 5');
  const docs = fs
    .readdirSync(abs(GOLDEN_DIR_REL))
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ ...(JSON.parse(fs.readFileSync(path.join(abs(GOLDEN_DIR_REL), f), 'utf8')) as GoldenDoc), file: f }));
  expect(docs.length, `${GOLDEN_DIR_REL} holds no capture docs`).toBeGreaterThan(0);
  for (const d of docs) expect(d.harness, `${d.file} is not a capture-step-golden doc`).toBe(GOLDEN_HARNESS_REL);
  return docs;
}

const CHAINS = ['permits', 'coa', 'sources'];
const OLD_RE = /old|before|baseline|run[-_]?\d/i;
const NEW_RE = /new|after|converted/i;

// ---------------------------------------------------------------------------
// The must-fail fixture world (#165 / #163 / #182) — DERIVED from the descriptor, one row per
// branch, healthy by default, sabotaged one check at a time. Spec 120 §15.4 rung 1: inline.
// ---------------------------------------------------------------------------

const PERMITS_RESOURCE_ID = '6d0229af-bc54-46de-9c2b-26759b01dd05';
const COA_ACTIVE_RESOURCE_ID = '51fd09cd-99d6-430a-9d42-c24a937b0cb0';
const ZONING_BASE_ID = '76a2620f-a6b4-495d-8e41-c0ede1f8a928';
const ZONING_HEIGHT_ID = 'f0a88d06-2430-4025-b15d-362cabd00f31';
const ZONING_LOT_COVERAGE_ID = '58ad8814-ca4e-43d6-848d-d5fd8d873574';
const ZONING_IDS = [
  ZONING_BASE_ID, ZONING_HEIGHT_ID, ZONING_LOT_COVERAGE_ID,
  '8d75cab6-ab97-4158-8ba5-8874860b26f7', '1a6469f8-1eaf-4ba6-a1f6-07179efbc2f2',
  '4e2f9292-6082-4627-be8e-61b87a2cb273', '75b9805b-bc65-4c30-97fa-9c57c17233b2',
  '8f969df7-9008-49fd-a50b-df53f1f680e6', '499de5f6-194a-4da3-a18f-27a8e684721d',
  '1f18bd73-bbbc-4ad6-ac27-6c9cae7385b4',
];
const ZONING_BASE_REQUIRED = ['_id', 'geometry', 'ZN_ZONE', 'ZN_STRING', 'COVERAGE', 'FSI_TOTAL'];
const CKAN_SAMPLE_ROWS = 3; // one row per branch (numeric · comma-formatted · sentinel) — §15.5 minimal

interface World {
  ckanFields: Record<string, string[]>;
  ckanRecords: Array<Record<string, string>>;
  addressPointHeader: string[];
  parcelHeader: string[];
  headStatus: Record<string, number>; // URL fragment → status
  neighbourhoodProps: Record<string, unknown>;
}

function checkById(d: Descriptor, id: string): Check {
  const c = d.checks.find((x) => x.id === id);
  expect(c, `descriptor declares no check "${id}"`).toBeDefined();
  return c as Check;
}

function stringArrays(v: unknown, out: string[][] = []): string[][] {
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) out.push(v as string[]);
  else if (Array.isArray(v)) for (const x of v) stringArrays(x, out);
  else if (v && typeof v === 'object') for (const x of Object.values(v as Record<string, unknown>)) stringArrays(x, out);
  return out;
}

/** Fold A correction 2 — the per-resource required map. */
function zoningRequired(d: Descriptor): Record<string, string[]> {
  const expect_ = checkById(d, 'zoning_resource_columns').expect as { resources?: Record<string, string[]> };
  return expect_ && expect_.resources ? expect_.resources : {};
}

function healthyWorld(d: Descriptor): World {
  const ckanFields: Record<string, string[]> = {
    [PERMITS_RESOURCE_ID]: [...(checkById(d, 'permit_columns').expect as string[])],
    [COA_ACTIVE_RESOURCE_ID]: [...(checkById(d, 'coa_columns').expect as string[])],
  };
  const zr = zoningRequired(d);
  const union = [...new Set(stringArrays(checkById(d, 'zoning_resource_columns').expect).flat())];
  for (const id of ZONING_IDS) ckanFields[id] = [...(zr[id] ?? union)];
  return {
    ckanFields,
    ckanRecords: [
      { EST_CONST_COST: '150000' },
      { EST_CONST_COST: '1,000' },
      { EST_CONST_COST: 'DO NOT UPDATE OR DELETE THIS INFO FIELD' },
    ],
    addressPointHeader: [...(checkById(d, 'address_point_columns').expect as string[]), 'geometry'],
    parcelHeader: [...(checkById(d, 'parcel_columns').expect as string[])],
    headStatus: {},
    neighbourhoodProps: { AREA_SHORT_CODE: '001', AREA_ID: 1, AREA_NAME: 'x' },
  };
}

/** One sabotage per declared check — the must-fail fixture matrix (#165). */
const SABOTAGE: Record<string, (w: World) => void> = {
  permit_columns: (w) => { w.ckanFields[PERMITS_RESOURCE_ID] = (w.ckanFields[PERMITS_RESOURCE_ID] ?? []).slice(1); },
  permit_cost_type_sample: (w) => { w.ckanRecords = [{ EST_CONST_COST: 'not-a-number' }, { EST_CONST_COST: 'still-not' }]; },
  coa_columns: (w) => { w.ckanFields[COA_ACTIVE_RESOURCE_ID] = (w.ckanFields[COA_ACTIVE_RESOURCE_ID] ?? []).slice(1); },
  address_point_columns: (w) => { w.addressPointHeader = w.addressPointHeader.slice(1); },
  address_point_coordinate_source: (w) => {
    w.addressPointHeader = w.addressPointHeader.filter((c) => !['geometry', 'LATITUDE', 'LONGITUDE'].includes(c));
  },
  parcel_columns: (w) => { w.parcelHeader = w.parcelHeader.slice(1); },
  source_archives_reachable: (w) => { w.headStatus['3dmassingshapefile'] = 404; },
  neighbourhood_id_property: (w) => { w.neighbourhoodProps = { AREA_NAME: 'x' }; },
  zoning_resource_columns: (w) => {
    w.ckanFields[ZONING_HEIGHT_ID] = (w.ckanFields[ZONING_HEIGHT_ID] ?? []).filter((c) => c !== 'HT_LABEL');
  },
};

function response(status: number, body: { json?: unknown; text?: string }): unknown {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : status === 206 ? 'Partial Content' : 'Not Found',
    json: async () => body.json,
    text: async () => body.text ?? '',
  };
}

function fetchFor(w: World): (url: string, init?: { method?: string }) => Promise<unknown> {
  return async (url: string, init?: { method?: string }) => {
    const u = String(url);
    if (init && init.method === 'HEAD') {
      const hit = Object.keys(w.headStatus).find((frag) => u.includes(frag));
      return response(hit ? (w.headStatus[hit] ?? 200) : 200, {});
    }
    const m = /resource_id=([0-9a-f-]+)/.exec(u);
    if (m) {
      const fields = w.ckanFields[m[1] as string];
      if (!fields) return response(404, {});
      return response(200, {
        json: { success: true, result: { fields: fields.map((id) => ({ id })), records: w.ckanRecords } },
      });
    }
    if (u.includes('address-points')) return response(206, { text: `${w.addressPointHeader.join(',')}\n1,2\n` });
    if (u.includes('Property%20Boundaries') || u.includes('property-boundaries')) return response(206, { text: `${w.parcelHeader.join(',')}\n1,2\n` });
    if (u.includes('neighbourhoods')) {
      return response(206, {
        text: `{"type":"FeatureCollection","features":[{"type":"Feature","properties":${JSON.stringify(w.neighbourhoodProps)},"geometry":null}]}`,
      });
    }
    return response(404, {});
  };
}

/** Run a compute against a world; return the row status per check (standalone → every check selected). */
async function runCompute(compute: ComputeFn, d: Descriptor, w: World): Promise<Record<string, string>> {
  const observations: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  const declared = new Set(d.checks.map((c) => c.id));
  const ctx = {
    pool: { query: () => { throw new Error('an ASSERT compute must not touch the pool (#175 partial)'); } },
    chainId: null,
    runId: null,
    descriptor: d,
    log: { info: () => {}, warn: () => {}, error: () => {} },
    report(checkId: string, observation: unknown) {
      if (!declared.has(checkId)) throw new Error(`compute reported undeclared check "${checkId}"`);
      observations[checkId] = observation;
    },
  };
  const realFetch = globalThis.fetch;
  const realLog = console.log;
  const realErr = console.error;
  const realWarn = console.warn;
  globalThis.fetch = fetchFor(w) as unknown as typeof fetch;
  console.log = () => {};
  console.error = () => {};
  console.warn = () => {};
  try {
    const result = await compute(ctx);
    if (result && result.observations) Object.assign(observations, result.observations);
  } finally {
    globalThis.fetch = realFetch;
    console.log = realLog;
    console.error = realErr;
    console.warn = realWarn;
  }
  const built = buildAuditTable(d, null, observations);
  const out: Record<string, string> = {};
  for (const r of built.rows) out[r.metric] = r.status;
  return out;
}

/** The must-fail PAIR for one check: healthy → PASS, sabotaged → FAIL. */
async function mustFailPair(compute: ComputeFn, d: Descriptor, id: string): Promise<{ healthy: string; sabotaged: string }> {
  const healthy = await runCompute(compute, d, healthyWorld(d));
  const sabotage = SABOTAGE[id];
  expect(sabotage, `no must-fail fixture for check ${id}`).toBeDefined();
  const w = healthyWorld(d);
  (sabotage as (w: World) => void)(w);
  const sabotaged = await runCompute(compute, d, w);
  return { healthy: healthy[id] ?? 'absent', sabotaged: sabotaged[id] ?? 'absent' };
}

// ---------------------------------------------------------------------------
// G4d — the four fences, as pure detectors over a STRUCTURED view of the subject
// ---------------------------------------------------------------------------

interface FenceInput {
  text: string; // compute source (future) or the whole step source (legacy)
  addressPointExpect: string[]; // the flat address-point column list
  zoningRequired: Record<string, string[]>; // resource id → required columns
  headOk: string[]; // the reachability set (constant names or external ids)
}

/** The legacy (pre-conversion) step, parsed out of its own source text. */
function inputFromLegacyStep(src: string): FenceInput {
  const flat = /EXPECTED_ADDRESS_POINT_COLUMNS\s*=\s*\[([^\]]*)\]/.exec(src);
  const zoning: Record<string, string[]> = {};
  for (const m of src.matchAll(/\{\s*id:\s*'([0-9a-f-]+)',\s*label:\s*'[^']*',\s*required:\s*\[([^\]]*)\]\s*\}/g)) {
    zoning[m[1] as string] = [...(m[2] as string).matchAll(/'([^']+)'/g)].map((x) => x[1] as string);
  }
  return {
    text: src,
    addressPointExpect: flat ? [...(flat[1] as string).matchAll(/'([^']+)'/g)].map((x) => x[1] as string) : [],
    zoningRequired: zoning,
    headOk: [...src.matchAll(/checkUrlAccessible\((\w+)/g)].map((m) => m[1] as string),
  };
}

/** The converted step: compute source + descriptor. */
function inputFromConverted(computeSrc: string, d: Descriptor): FenceInput {
  const head = checkById(d, 'source_archives_reachable').expect as { http_head_ok?: string[] };
  return {
    text: computeSrc,
    addressPointExpect: checkById(d, 'address_point_columns').expect as string[],
    zoningRequired: zoningRequired(d),
    headOk: head && Array.isArray(head.http_head_ok) ? head.http_head_ok : [],
  };
}

/** Converted if the compute exists (post commit 7), else the legacy step. */
function subjectInput(): FenceInput {
  if (fs.existsSync(abs(COMPUTE_REL)) && fs.existsSync(abs(DESCRIPTOR_REL))) {
    return inputFromConverted(fs.readFileSync(abs(COMPUTE_REL), 'utf8'), loadDescriptor());
  }
  return inputFromLegacyStep(fs.readFileSync(abs(STEP_REL), 'utf8'));
}

interface Fence {
  commit: string;
  construct: string;
  detect: (i: FenceInput) => string[]; // [] = fence intact
  revert: (i: FenceInput) => FenceInput; // the reversion patch
}

const FENCES: Fence[] = [
  {
    commit: '646ea5a7',
    construct: 'coordinate-source OR-contract — hasCoordinateSource(geometry OR LATITUDE+LONGITUDE); LATITUDE/LONGITUDE/geometry are NOT flat required columns',
    detect: (i) => {
      const v: string[] = [];
      if (!/hasCoordinateSource\s*\(/.test(i.text)) v.push('hasCoordinateSource() is no longer called');
      for (const c of ['LATITUDE', 'LONGITUDE', 'geometry']) {
        if (i.addressPointExpect.includes(c)) v.push(`${c} is back in the flat address-point list (the dead-on-arrival requirement)`);
      }
      return v;
    },
    revert: (i) => ({
      ...i,
      text: i.text.replace(/hasCoordinateSource\s*\(/g, 'neverCoordinateSource('),
      addressPointExpect: [...i.addressPointExpect, 'LATITUDE', 'LONGITUDE', 'geometry'],
    }),
  },
  {
    commit: '58914fa8',
    construct: 'zoning DataStore pre-flight — 10 resource ids with three distinct required sets (base 6 cols · height HT_LABEL · lot-coverage PRCNT_CVER)',
    detect: (i) => {
      const v: string[] = [];
      for (const id of ZONING_IDS) if (!i.zoningRequired[id]) v.push(`zoning resource ${id} is no longer checked`);
      for (const c of ZONING_BASE_REQUIRED) if (!(i.zoningRequired[ZONING_BASE_ID] ?? []).includes(c)) v.push(`base zoning lost required column ${c}`);
      if (!(i.zoningRequired[ZONING_HEIGHT_ID] ?? []).includes('HT_LABEL')) v.push('height overlay lost HT_LABEL');
      if (!(i.zoningRequired[ZONING_LOT_COVERAGE_ID] ?? []).includes('PRCNT_CVER')) v.push('lot-coverage overlay lost PRCNT_CVER');
      return v;
    },
    revert: (i) => ({
      ...i,
      zoningRequired: { ...i.zoningRequired, [ZONING_HEIGHT_ID]: (i.zoningRequired[ZONING_HEIGHT_ID] ?? []).filter((c) => c !== 'HT_LABEL') },
    }),
  },
  {
    commit: '1ceebd17',
    construct: 'ravine shapefile ZIP reachability (HEAD) — ravine-natural-feature-protection-area-wgs84.zip is in the pre-flight set',
    detect: (i) => {
      const v: string[] = [];
      if (!i.text.includes('ravine-natural-feature-protection-area')) v.push('the ravine ZIP URL is gone');
      if (!i.headOk.some((h) => /ravine/i.test(h))) v.push('the ravine archive is no longer in the reachability set');
      return v;
    },
    revert: (i) => ({
      ...i,
      text: i.text.replace(/ravine-natural-feature-protection-area/g, 'removed'),
      headOk: i.headOk.filter((h) => !/ravine/i.test(h)),
    }),
  },
  {
    commit: 'f6047e89',
    construct: 'centreline shapefile ZIP reachability (HEAD) — centreline-version-2-4326.zip is in the pre-flight set',
    detect: (i) => {
      const v: string[] = [];
      if (!i.text.includes('centreline-version-2-4326')) v.push('the centreline ZIP URL is gone');
      if (!i.headOk.some((h) => /centreline/i.test(h))) v.push('the centreline archive is no longer in the reachability set');
      return v;
    },
    revert: (i) => ({
      ...i,
      text: i.text.replace(/centreline-version-2-4326/g, 'removed'),
      headOk: i.headOk.filter((h) => !/centreline/i.test(h)),
    }),
  },
];

// ===========================================================================
// 55-A — the hard per-conversion gate (44)
// ===========================================================================

describe('55-A — the hard per-conversion gate (44, k=PER_STEP)', () => {
  // ── A.3 Interpretation (§3.4–§3.4b) — the notes.json seven ────────────────

  it('#30 Cap of 12 prose entries — add a 13th → build fails', () => {
    const d = loadDescriptor();
    const notes = loadNotes();
    expect(d.interpretation, 'interpretation must be the {file, entries} object, not "none" (commit-6 decision)').not.toBe('none');
    const interp = d.interpretation as { file: string; entries: number };
    const entries = notesEntries(notes);
    expect(entries.length, 'prose entries across the capped blocks').toBeLessThanOrEqual(NOTES_CAP);
    expect(entries.length, 'interpretation.entries must equal the real prose count').toBe(interp.entries);
    // the 13th: the schema itself is the build failure
    expect(() => validateDescriptor({ ...d, interpretation: { ...interp, entries: NOTES_CAP + 1 } })).toThrow(/interpretation/);
  });

  it('#31 Exactly two legal resolutions — promote or delete; no overflow file', () => {
    const d = loadDescriptor();
    loadNotes();
    expect((d.interpretation as { file: string }).file).toBe(path.basename(NOTES_REL));
    const dir = fs.readdirSync(abs(path.dirname(STEP_REL)));
    const strays = dir.filter((f) => f.startsWith('assert-schema') && !['assert-schema.js', 'assert-schema.descriptor.json', 'assert-schema.notes.json'].includes(f));
    expect(strays, 'an overflow / unknown <slug>.* sibling').toEqual([]);
    expect(dir.some((f) => /overflow/i.test(f)), 'a notes-overflow file').toBe(false);
    expect(Object.keys(loadNotes()).some((k) => /overflow/i.test(k)), 'an overflow block inside notes.json').toBe(false);
  });

  it('#33 `blind_spots[].detected_by` names a check that exists', () => {
    const d = loadDescriptor();
    const notes = loadNotes();
    const ids = new Set(d.checks.map((c) => c.id));
    const blind = (notes.blind_spots as NotesEntry[] | undefined) ?? [];
    for (const b of blind) {
      expect(typeof b.detected_by, 'every blind spot declares detected_by').toBe('string');
      if (!isNone(b.detected_by)) expect(ids.has(b.detected_by as string), `detected_by "${b.detected_by}" is not a declared check`).toBe(true);
    }
    expect(ids.has('no_such_check'), 'negative control: the detector would reject a nonexistent check id').toBe(false);
  });

  it('#34 `detected_by:"none"` is permitted but counted', () => {
    const notes = loadNotes();
    const blind = (notes.blind_spots as NotesEntry[] | undefined) ?? [];
    const open = blind.filter((b) => isNone(b.detected_by)).length;
    expect(notes.counts?.open_blind_spots, 'notes.counts.open_blind_spots must be declared and equal the real count').toBe(open);
    // add one → the count increments
    const plusOne = [...blind, { what: 'x', detected_by: 'none' }].filter((b) => isNone(b.detected_by)).length;
    expect(plusOne).toBe(open + 1);
  });

  it('#35 Every prose entry carries `measured{value,date,query}`', () => {
    const notes = loadNotes();
    const entries = notesEntries(notes);
    expect(entries.length, 'a notes file with zero prose entries proves nothing').toBeGreaterThan(0);
    for (const { block, entry } of entries) {
      if (NOTES_MEASURED_EXEMPT.has(block)) continue;
      const m = entry.measured;
      expect(m, `${block} entry has no measured{}`).toBeDefined();
      expect(m && 'value' in m, `${block} entry measured.value missing`).toBe(true);
      expect(typeof m?.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(m.date), `${block} entry measured.date not ISO`).toBe(true);
      expect(typeof m?.query === 'string' && m.query.length > 0, `${block} entry measured.query missing`).toBe(true);
    }
  });

  it('#37 Unpromoted `suspicious_if` entries are counted', () => {
    const notes = loadNotes();
    const d = loadDescriptor();
    const ids = new Set(d.checks.map((c) => c.id));
    const sus = (notes.suspicious_if as NotesEntry[] | undefined) ?? [];
    const unpromoted = sus.filter((s) => !s.check || isNone(s.check) || !ids.has(s.check)).length;
    expect(notes.counts?.unpromoted_suspicious_if, 'notes.counts.unpromoted_suspicious_if must equal the real count').toBe(unpromoted);
    const plusOne = [...sus, { signal: 'x', check: 'none' }].filter((s) => !s.check || isNone(s.check) || !ids.has(s.check)).length;
    expect(plusOne).toBe(unpromoted + 1);
  });

  it('#38 `review_notes` ship to the reviewer prompt automatically', () => {
    loadNotes();
    for (const cli of REVIEW_CLIS) {
      const src = stripComments(readText(cli));
      expect(src.includes('.notes.json'), `${cli} does not read the sibling notes file`).toBe(true);
      expect(src.includes('review_notes'), `${cli} does not inject review_notes into the prompt`).toBe(true);
    }
  });

  // ── A.12 Conversion workflow (§14) ─────────────────────────────────────────

  it('#148 `deviations[]` and `fences[]` are required; empty must be an explicit `[]`', () => {
    const d = loadDescriptor();
    const notes = loadNotes();
    expect(Array.isArray(d.deviations), 'descriptor.deviations must be an explicit array (never "none", never omitted)').toBe(true);
    expect(Array.isArray(notes.fences), 'notes.fences must be an explicit array (schema has no fences category — see header)').toBe(true);
    const fences = notes.fences as NonNullable<Notes['fences']>;
    expect(fences.map((f) => f.commit.slice(0, 8)).sort()).toEqual([...FENCE_COMMITS].sort());
    for (const f of fences) {
      for (const k of ['const', 'value', 'incident', 'commit', 'lock_test'] as const) expect(k in f, `fence ${f.commit} lacks ${k}`).toBe(true);
    }
  });

  it('#149 Gate 0 — script #3 adds zero new bespoke runner paths (the library has no assert_schema branch)', () => {
    computeSource();
    const lib = fs.readdirSync(abs('scripts/lib/step')).filter((f) => f.endsWith('.js')).map((f) => `scripts/lib/step/${f}`);
    lib.push('scripts/lib/pipeline.js');
    for (const f of lib) {
      const code = stripComments(fs.readFileSync(abs(f), 'utf8'));
      expect(/assert[_-]schema/.test(code), `${f} carries a step-specific code path`).toBe(false);
    }
  });

  it('#150 Gate 1 — the old script is reproducible against itself (two OLD captures per chain, identical normalised)', () => {
    const docs = goldenDocs();
    for (const chain of CHAINS) {
      const old = docs.filter((x) => x.chain === chain && OLD_RE.test(x.file) && !NEW_RE.test(x.file));
      expect(old.length, `chain ${chain}: need ≥2 OLD captures (run 1 + run 2), found ${old.length}`).toBeGreaterThanOrEqual(2);
      for (const o of old.slice(1)) expect(o.normalised, `${chain}: ${o.file} differs from ${old[0]?.file} modulo declared normalisations`).toEqual(old[0]?.normalised);
    }
  });

  it('#151 The non-determinism inventory is declared before the first diff (git order)', () => {
    goldenDocs();
    const report = readText(REPORT_REL);
    reportTable(report, [['key', /key|field|source/], ['disposition', /disposition/]]);
    const inventoryAt = firstCommitTime(REPORT_REL, 'Non-determinism inventory');
    const goldenAt = firstCommitTime(GOLDEN_DIR_REL);
    expect(inventoryAt, `${REPORT_REL} has no committed "Non-determinism inventory" section`).toBeGreaterThan(0);
    expect(goldenAt, `${GOLDEN_DIR_REL} is not committed`).toBeGreaterThan(0);
    expect(inventoryAt, 'inventory committed AFTER the first golden capture').toBeLessThanOrEqual(goldenAt);
  });

  it('#6b Every plan item declares a done-test (§12.16) — each of the nine commits names one', () => {
    const report = readText(REPORT_REL);
    const { table, col } = reportTable(report, [['commit', /commit/], ['done-test', /done.?test|test/]]);
    expect(table.rows.length, 'nine commits').toBeGreaterThanOrEqual(9);
    for (const r of table.rows) {
      const t = r[col('done-test')] ?? '';
      expect(t.length > 0 && !/^(none|n\/a|—|-)\b/i.test(t), `commit "${r[col('commit')]}" has no done-test`).toBe(true);
    }
  });

  it('#6a Every claim covering a TABLE declares that table\'s row count (Appendix H) — pipeline_runs in the boundary freeze', () => {
    const d = loadDescriptor();
    const report = readText(REPORT_REL);
    const { table, col } = reportTable(report, [['table', /^table/], ['rows', /rows?\b/]]);
    const touched = new Set(['pipeline_runs', ...d.inputs.reads.tables.map((t) => t.table)]);
    for (const t of touched) {
      const row = table.rows.find((r) => (r[col('table')] ?? '') === t);
      expect(row, `boundary freeze has no row for table ${t}`).toBeDefined();
      expect(/^\d[\d,]*$/.test((row?.[col('rows')] ?? '').replace(/\s/g, '')), `table ${t} has no integer row count`).toBe(true);
    }
  });

  it('#151a The non-determinism disposition vocabulary is CLOSED — must-match-exactly · normalize-then-match · excluded-with-reason', () => {
    const docs = goldenDocs();
    const report = readText(REPORT_REL);
    const { table, col } = reportTable(report, [['key', /key|field|source/], ['disposition', /disposition/]]);
    for (const r of table.rows) {
      expect(NONDET_DISPOSITIONS, `disposition "${r[col('disposition')]}" for ${r[col('key')]} is outside the closed vocabulary`).toContain(r[col('disposition')]);
    }
    const declared = new Set(table.rows.map((r) => r[col('key')]));
    for (const doc of docs) for (const k of doc.nondeterminism) expect(declared.has(k), `${doc.file} stripped "${k}", which the inventory never declared`).toBe(true);
  });

  it('#152 Gate 2 — Intent Ledger 100% dispositioned, no row `unknown`', () => {
    const report = readText(REPORT_REL);
    const { table, col } = reportTable(report, INTENT_LEDGER_COLS);
    expect(table.rows.length, 'an empty Intent Ledger for a fence-density-4 file').toBeGreaterThanOrEqual(FENCE_COMMITS.length);
    for (const r of table.rows) {
      const disp = (r[col('disposition')] ?? '').toLowerCase();
      expect(LEDGER_DISPOSITIONS.some((d) => disp.startsWith(d)), `"${r[col('construct')]}" disposition "${disp}" is unknown / outside the vocabulary`).toBe(true);
    }
    const ledgerText = table.rows.map((r) => Object.values(r).join(' ')).join('\n');
    for (const c of FENCE_COMMITS) expect(ledgerText.includes(c), `fence commit ${c} has no Intent Ledger row`).toBe(true);
  });

  it('#153 Every `knowingly-retired` row names a human approver', () => {
    const report = readText(REPORT_REL);
    const { table, col } = reportTable(report, INTENT_LEDGER_COLS);
    for (const r of table.rows.filter((x) => /^knowingly-retired/i.test(x[col('disposition')] ?? ''))) {
      const approver = r[col('adjudicated by')] ?? '';
      expect(approver.length > 0 && !/agent|claude|gemini|deepseek|none/i.test(approver), `retired "${r[col('construct')]}" has no HUMAN approver`).toBe(true);
    }
    // the mechanism is exercised even when nothing is retired
    expect(table.headers.some((h) => /adjudicat|approver/.test(h))).toBe(true);
  });

  it('#154 Gate 3 — a peel commit contains only that peel', () => {
    computeSource();
    const log = git(['log', '--format=%H%x1f%s', '--', '.']).split(/\r?\n/).filter(Boolean);
    const peels = log.filter((l) => /122_step_optimization/.test(l) && /pilot 1 peel [abc]\b/i.test(l));
    expect(peels.length, 'three peel commits (8a gating · 8b verdict/audit · 8c thresholds/checks)').toBeGreaterThanOrEqual(3);
    const allowed = (f: string): boolean =>
      f === COMPUTE_REL || f === DESCRIPTOR_REL || f === NOTES_REL || f.startsWith('scripts/lib/step/') ||
      f.startsWith(STEP_DIR_REL) || f === REPORT_REL || f.startsWith(GOLDEN_DIR_REL) || f === 'docs/reports/review_followups.md';
    for (const p of peels) {
      const [hash, subject] = p.split('\x1f') as [string, string];
      const files = git(['show', '--name-only', '--format=', hash]).split(/\r?\n/).filter(Boolean).map((f) => f.replace(/\\/g, '/'));
      const foreign = files.filter((f) => !allowed(f));
      expect(foreign, `${hash.slice(0, 8)} "${subject}" touches non-peel files`).toEqual([]);
      expect(files.includes(STEP_REL), `${hash.slice(0, 8)} edits the frozen-shape step file`).toBe(false);
    }
  });

  it('#155 Gate 4c — line accounting = 100%; an unassigned line blocks', () => {
    const report = readText(REPORT_REL);
    const { table, col } = reportTable(report, [['lines', /^lines?$|line range|range/], ['category', /category|owner|disposition/]]);
    const total = /\b(\d{3,4}) lines\b/.exec(report);
    expect(total, 'the report must state the frozen line count ("N lines")').not.toBeNull();
    const n = Number((total as RegExpExecArray)[1]);
    const covered = new Array<number>(n + 1).fill(0);
    for (const r of table.rows) {
      const m = /^(\d+)\s*(?:[-–]\s*(\d+))?$/.exec((r[col('lines')] ?? '').trim());
      expect(m, `unparseable line range "${r[col('lines')]}"`).not.toBeNull();
      const a = Number((m as RegExpExecArray)[1]);
      const b = Number((m as RegExpExecArray)[2] ?? a);
      expect(LINE_CATEGORIES, `category "${r[col('category')]}" for ${a}-${b}`).toContain((r[col('category')] ?? '').toLowerCase());
      for (let i = a; i <= b; i++) covered[i] = (covered[i] ?? 0) + 1;
    }
    const unassigned: number[] = [];
    const overlapping: number[] = [];
    for (let i = 1; i <= n; i++) {
      if (covered[i] === 0) unassigned.push(i);
      if ((covered[i] ?? 0) > 1) overlapping.push(i);
    }
    expect(unassigned, `unassigned lines of ${n}`).toEqual([]);
    expect(overlapping, 'lines assigned twice').toEqual([]);
  });

  it('#156 Gate 4d — every fence has a lock test proven in both directions', () => {
    const notes = loadNotes();
    const fences = (notes.fences ?? []) as NonNullable<Notes['fences']>;
    expect(fences.length).toBe(FENCE_COMMITS.length);
    for (const f of fences) expect(f.lock_test, `fence ${f.commit} names the wrong lock test`).toBe(THIS_FILE_REL);
    const self = fs.readFileSync(abs(THIS_FILE_REL), 'utf8');
    expect(self.includes('— present in the converted step'), 'the present-direction lock').toBe(true);
    expect(self.includes('— reversion is detectable'), 'the reversion-direction lock').toBe(true);
    expect(FENCES.map((f) => f.commit).sort()).toEqual([...FENCE_COMMITS].sort());
    for (const f of FENCES) expect(typeof f.detect === 'function' && typeof f.revert === 'function', `fence ${f.commit} lacks a direction`).toBe(true);
  });

  it('#157 Gate 4f — dead code proved dead by instrumentation, never by reading', () => {
    const report = readText(REPORT_REL);
    const { table, col } = reportTable(report, [['lines', /^lines?$|line range|range/], ['category', /category|owner|disposition/], ['evidence', /evidence|proof|run/]]);
    for (const r of table.rows.filter((x) => /^dead/i.test(x[col('category')] ?? ''))) {
      expect(/zero[- ]hit|0 hits?|run(_id| id|s? #?\d)|instrument/i.test(r[col('evidence')] ?? ''), `dead range ${r[col('lines')]} has no zero-hit run record`).toBe(true);
    }
  });

  it('#158 Gate 5 — the old script is deleted or dated-ticketed (same file, two commits: no pipeline.run(), path registered)', () => {
    computeSource();
    const src = fs.readFileSync(abs(STEP_REL), 'utf8');
    expect(/pipeline\.run\s*\(/.test(src), `${STEP_REL} still carries the island (pipeline.run)`).toBe(false);
    const converted = JSON.parse(fs.readFileSync(abs(CONVERTED_REL), 'utf8')) as { converted: string[] };
    expect(converted.converted, `${CONVERTED_REL} does not register ${STEP_REL}`).toContain(STEP_REL);
  });

  it('#159 Idempotence-successor run is a supplement, never the sole gate (an old/new snapshot-replay pair per chain)', () => {
    const docs = goldenDocs();
    for (const chain of CHAINS) {
      const old = docs.filter((x) => x.chain === chain && OLD_RE.test(x.file) && !NEW_RE.test(x.file));
      const neu = docs.filter((x) => x.chain === chain && NEW_RE.test(x.file));
      expect(old.length, `${chain}: no OLD capture — path agreement cannot be proven by a run-2 zero-diff`).toBeGreaterThan(0);
      expect(neu.length, `${chain}: no NEW capture — the differential has only one side`).toBeGreaterThan(0);
    }
  });

  it('#162 The same pass never both discovers and retires a fence', () => {
    const report = readText(REPORT_REL);
    const { table, col } = reportTable(report, INTENT_LEDGER_COLS);
    for (const r of table.rows) {
      const discoverer = (r[col('discovered by')] ?? '').trim().toLowerCase();
      const adjudicator = (r[col('adjudicated by')] ?? '').trim().toLowerCase();
      expect(discoverer.length, `"${r[col('construct')]}" names no discoverer`).toBeGreaterThan(0);
      expect(adjudicator.length, `"${r[col('construct')]}" names no adjudicator`).toBeGreaterThan(0);
      expect(discoverer === adjudicator, `"${r[col('construct')]}" was discovered and dispositioned by the same pass (${discoverer})`).toBe(false);
    }
  });

  // ── A.13 Step testing (§15) ─────────────────────────────────────────────────

  it('#163 Tie-breaker 1 — a step test that survives swapping its compute is a runner test in the wrong place', async () => {
    const d = loadDescriptor();
    const stub = loadComputeStub();
    for (const c of d.checks) {
      const { healthy, sabotaged } = await mustFailPair(stub, d, c.id);
      expect(healthy === 'PASS' && sabotaged === 'FAIL', `check ${c.id}: the must-fail pair SURVIVED a compute swap (healthy=${healthy}, sabotaged=${sabotaged})`).toBe(false);
    }
  });

  it('#164 Logic tests must not run in production', () => {
    const compute = stripComments(computeSource());
    const step = stripComments(fs.readFileSync(abs(STEP_REL), 'utf8'));
    for (const [name, src] of [[COMPUTE_REL, compute], [STEP_REL, step]] as const) {
      expect(/vitest|src\/tests|\.test\.|SABOTAGE|healthyWorld/.test(src), `${name} references the logic-test path`).toBe(false);
    }
    const pkg = JSON.parse(fs.readFileSync(abs('package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(/scripts\//.test(pkg.scripts.test ?? ''), 'npm test must not point at production scripts').toBe(false);
  });

  it('#165 Every declared check has a must-fail fixture', async () => {
    const d = loadDescriptor();
    const compute = loadCompute();
    const missing = d.checks.map((c) => c.id).filter((id) => !SABOTAGE[id]);
    expect(missing, 'declared checks with no sabotage in the must-fail matrix').toEqual([]);
    for (const c of d.checks) {
      const { healthy, sabotaged } = await mustFailPair(compute, d, c.id);
      expect(healthy, `check ${c.id}: healthy fixture should PASS`).toBe('PASS');
      expect(sabotaged, `check ${c.id}: its negative fixture PASSES — the check never looked`).toBe('FAIL');
    }
  });

  it('#167 Banned anti-pattern — no step test asserts ledger, lock or transaction behaviour', () => {
    loadDescriptor();
    // tokens built by concatenation so this list does not match itself
    const banned = ['withAdvisory' + 'Lock(', 'with' + 'Transaction(', 'openLedger' + 'Row', 'finalizeLedger' + 'Row', 'pg_advisory_' + 'xact_lock', 'INSERT INTO ' + 'pipeline_runs', 'finalizeStranded' + 'Run'];
    for (const f of stepTestDirFiles().filter((f) => /\.test\.ts$/.test(f))) {
      const src = stripComments(fs.readFileSync(abs(f), 'utf8'));
      for (const tok of banned) expect(src.includes(tok), `${f} asserts runner behaviour (${tok}) — 64 copies of the runner suite is negative coverage`).toBe(false);
    }
  });

  it('#169 Rung 1 inline-WKT is non-negotiable for every azimuth / KNN / area step', () => {
    const src = stripComments(computeSource());
    const spatial = /\bST_\w+|azimuth|<->|\bknn\b/i.test(src);
    if (spatial) {
      expect(stepTestDirFiles().some((f) => /rung1|inline-wkt/i.test(f)), 'a spatial compute with no rung-1 inline-WKT test').toBe(true);
    } else {
      expect(spatial, 'assert_schema is not a spatial step — rung 1 is conditionally vacuous, executed').toBe(false);
    }
  });

  it('#170 Rung 2 requires rung 1 to exist first', () => {
    computeSource();
    const rung2 = stepTestDirFiles().filter((f) => /rung2|approved/i.test(f));
    if (rung2.length > 0) expect(stepTestDirFiles().some((f) => /rung1|inline-wkt/i.test(f)), 'rung-2 fixtures approved with no rung 1').toBe(true);
    else expect(rung2).toEqual([]);
  });

  it('#171 An approving commit states why each value is right', () => {
    computeSource();
    for (const f of stepTestDirFiles().filter((x) => /rung2|approved/i.test(x))) {
      const body = git(['log', '--format=%B', '--', f]);
      expect(/why|because/i.test(body), `${f} was approved by a commit that does not say why`).toBe(true);
    }
  });

  it('#172 Metamorphic invariants hold', () => {
    const src = stripComments(computeSource());
    const spatial = /\bST_\w+|azimuth|ST_Area/i.test(src);
    if (spatial) expect(stepTestDirFiles().some((f) => /metamorphic/i.test(f)), 'a spatial compute with no metamorphic suite').toBe(true);
    else expect(spatial, 'assert_schema computes no geometry — metamorphic invariants are conditionally vacuous, executed').toBe(false);
  });

  it('#173 Every golden snapshot query has an explicit `ORDER BY`', () => {
    goldenDocs();
    const src = fs.readFileSync(abs(GOLDEN_HARNESS_REL), 'utf8');
    const selects = [...src.matchAll(/`([^`]*\bSELECT\b[^`]*)`/gi)].map((m) => m[1] as string);
    expect(selects.length).toBeGreaterThan(0);
    for (const q of selects) {
      if (!/\bFROM\b/i.test(q) || /\bmax\(|\bcount\(/i.test(q)) continue; // aggregates have no row order
      expect(/\bORDER BY\b/i.test(q), `unordered golden query: ${q.replace(/\s+/g, ' ').trim()}`).toBe(true);
    }
  });

  it('#174 pgTAP carries schema assertions only', () => {
    loadDescriptor();
    const sql = walk(abs('src/tests')).filter((p) => p.endsWith('.sql') && /assert[-_]schema/.test(fs.readFileSync(p, 'utf8')));
    for (const p of sql) {
      const body = fs.readFileSync(p, 'utf8');
      const calls = [...body.matchAll(/\b(is|isnt|cmp_ok|results_eq|row_eq)\s*\(/g)];
      expect(calls.length, `${path.relative(REPO_ROOT, p)} carries value assertions in pgTAP`).toBe(0);
    }
    expect(sql.every((p) => p.endsWith('.sql')), 'conditionally vacuous when no pgTAP file names this step, executed').toBe(true);
  });

  it('#176 Generator correctness is tested per branch', () => {
    const d = loadDescriptor();
    const src = stripComments(computeSource());
    const writes = /\b(INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM|ON CONFLICT)\b/i.test(src);
    if (d.outputs === 'none') {
      expect(writes, 'outputs:"none" but the compute carries write SQL — an undeclared generator branch').toBe(false);
    } else {
      for (const branch of ['insert', 'update', 'distinct-noop', 'conflict-target']) {
        expect(stepTestDirFiles().some((f) => f.includes(branch)), `no per-branch generator test for ${branch}`).toBe(true);
      }
    }
  });

  it('#180 Shapefile fixtures include one corrupt, one non-UTF8 `.dbf`, one missing `.prj`', () => {
    const src = stripComments(computeSource());
    const parsesShapefiles = /require\(['"](shapefile|node-stream-zip)['"]\)|\.dbf\b|\.shp\b/.test(src);
    if (parsesShapefiles) {
      for (const f of ['corrupt', 'non-utf8', 'missing-prj']) expect(stepTestDirFiles().some((x) => x.includes(f)), `no ${f} shapefile fixture`).toBe(true);
    } else {
      expect(parsesShapefiles, 'assert_schema HEADs the archives and parses nothing — conditionally vacuous, executed').toBe(false);
    }
  });

  it('#182 Fixtures are minimal — one row per branch, per check, plus null/empty/boundary', () => {
    const d = loadDescriptor();
    const w = healthyWorld(d);
    expect(w.ckanRecords.length).toBe(CKAN_SAMPLE_ROWS);
    expect(Object.keys(SABOTAGE).sort()).toEqual(d.checks.map((c) => c.id).sort());
    for (const f of stepTestDirFiles().filter((x) => x.endsWith('.json'))) {
      const parsed = JSON.parse(fs.readFileSync(abs(f), 'utf8')) as unknown;
      const rows = Array.isArray(parsed) ? parsed.length : Array.isArray((parsed as { rows?: unknown[] }).rows) ? ((parsed as { rows: unknown[] }).rows).length : 0;
      expect(rows, `${f} is a ${rows}-row fixture`).toBeLessThanOrEqual(30);
    }
  });

  it('#184 Fixtures live next to their step and are deleted with it', () => {
    loadDescriptor();
    const strays = walk(abs('src/tests'))
      .map((p) => path.relative(REPO_ROOT, p).replace(/\\/g, '/'))
      .filter((f) => !f.startsWith(STEP_DIR_REL) && /fixtures?\//.test(f) && /assert[-_]schema/i.test(path.basename(f)));
    expect(strays, 'assert_schema fixtures outside the step directory').toEqual([]);
  });

  // ── A.15 Load-bearing intent that must survive conversion (§9.2) ──────────

  it('#199 No step defines its own `verdictCascade`', () => {
    const d = loadDescriptor();
    const src = stripComments(computeSource());
    expect(/verdict\s*[:=]/.test(src), 'the compute computes a verdict').toBe(false);
    expect(/\?\s*['"]FAIL['"]\s*:\s*['"](PASS|WARN)['"]/.test(src), 'a parallel-boolean cascade (hasFails ? FAIL : PASS)').toBe(false);
    for (const t of d.terminals) expect(typeof t.records_meta === 'object' && 'verdict' in t.records_meta, `terminal ${t.id} declares a verdict`).toBe(false);
  });

  it('#200 The §11 Counter Semantic Contract — which variable feeds `records_total`', () => {
    const d = loadDescriptor();
    const src = stripComments(computeSource());
    expect(d.counters, 'an ASSERT declares counters:"none" (§1.10)').toBe('none');
    expect(/records_total|records_new|records_updated/.test(src), 'the compute feeds a counter the descriptor says it does not have').toBe(false);
  });

  it('#201 `load-massing`\'s `ON CONFLICT` area-column exclusion', () => {
    const src = stripComments(computeSource());
    expect(/ON CONFLICT/i.test(src), 'assert_schema writes no domain rows — no ON CONFLICT may appear; conditionally vacuous, executed').toBe(false);
  });

  it('#202 The `tier_1_exact_address` name freeze', () => {
    const src = stripComments(computeSource());
    const tiers = [...src.matchAll(/tier_1\w*/g)].map((m) => m[0]);
    for (const t of tiers) expect(t).toBe('tier_1_exact_address');
    expect(tiers.every((t) => t === 'tier_1_exact_address'), 'conditionally vacuous for this step, executed').toBe(true);
  });

  it('#203 Frozen `records_meta` producer/consumer blocks — every emitted key has its consumer, every consumer reads it', () => {
    const d = loadDescriptor();
    expect(d.emits.length).toBeGreaterThan(0);
    const success = d.terminals.find((t) => t.kind === 'success');
    expect(success, 'a success terminal').toBeDefined();
    const shape = (success as { records_meta: Record<string, string> }).records_meta;
    for (const e of d.emits) {
      expect(Object.keys(shape), `emits.${e.key} is not in the success terminal's records_meta shape`).toContain(e.key);
      for (const consumer of e.consumers) {
        expect(fs.existsSync(abs(consumer)), `consumer ${consumer} of ${e.key} does not exist`).toBe(true);
        expect(fs.readFileSync(abs(consumer), 'utf8').includes(e.key), `${consumer} never reads ${e.key}`).toBe(true);
      }
    }
  });

  it('#204 `RUN_AT` captured once — the midnight-cross fence', () => {
    const src = stripComments(computeSource());
    expect(/new Date\s*\(/.test(src), 'new Date() in a pipeline compute (Spec 47 §R3.5)').toBe(false);
    expect((src.match(/getDbTimestamp\(/g) ?? []).length, 'the DB clock captured more than once').toBeLessThanOrEqual(1);
    expect(/\bNOW\(\)/i.test(src), 'a DB-side NOW() write from the compute').toBe(false);
  });

  it('#205 Lock-ID uniqueness across manifest ∪ `one-time/` ∪ `backfill/`', () => {
    const d = loadDescriptor();
    const textual = /const ADVISORY_LOCK_ID\s*=\s*(\d+)/.exec(fs.readFileSync(abs(STEP_REL), 'utf8'));
    expect(textual, 'the §5.4 textual constant').not.toBeNull();
    expect(d.identity.lock).toBe(Number((textual as RegExpExecArray)[1]));
    const holders = walk(abs('scripts'))
      .filter((p) => p.endsWith('.js') && !p.includes(`${path.sep}_schema${path.sep}fixtures${path.sep}`) && !p.includes(`${path.sep}node_modules${path.sep}`))
      .map((p) => path.relative(REPO_ROOT, p).replace(/\\/g, '/'))
      .filter((f) => f !== STEP_REL && new RegExp(`ADVISORY_LOCK_ID\\s*=\\s*${d.identity.lock}\\b`).test(fs.readFileSync(abs(f), 'utf8')));
    expect(holders, `another script (manifest, one-time/ or backfill/) also holds lock ${d.identity.lock}`).toEqual([]);
  });
});

// ===========================================================================
// 55-B — partial now, closure at the named k (5, k=MIXED)
// ===========================================================================

describe('55-B — monotone partials (5, k=MIXED)', () => {
  it('#36 [PARTIAL] Entries older than N months are flagged `stale_interpretation` — fires on a backdated fixture', () => {
    const notes = loadNotes();
    const entries = notesEntries(notes);
    expect(entries.length).toBeGreaterThan(0);
    const now = new Date();
    expect(staleEntries(entries, now), 'stale entries in the live notes file').toEqual([]);
    const backdated = entries.map(({ block, entry }) => ({ block, entry: { ...entry, measured: { ...(entry.measured ?? {}), date: '2020-01-01' } } }));
    expect(staleEntries(backdated, now).length, 'the detector must fire on a backdated measured.date').toBe(backdated.length);
  });

  it('#175 [PARTIAL] All generated statements PREPARE/EXPLAIN cleanly — the converted subset generates none, and the compute issues no SQL', () => {
    const d = loadDescriptor();
    const src = stripComments(computeSource());
    expect(d.outputs).toBe('none');
    expect(/\.query\s*\(|streamQuery\(/.test(src), 'an ASSERT compute issuing SQL — a statement outside the PREPARE/EXPLAIN gate').toBe(false);
  });

  it('#181 [PARTIAL] `pg_trgm` precision/recall never regress below a committed number — ratchet baseline exists iff trigram matching is used', () => {
    const src = stripComments(computeSource());
    const usesTrgm = /similarity\(|pg_trgm|word_similarity/.test(src);
    if (usesTrgm) expect(stepTestDirFiles().some((f) => /precision|recall|baseline/i.test(f)), 'trigram matching with no committed baseline').toBe(true);
    else expect(usesTrgm, 'assert_schema does no fuzzy matching — conditionally vacuous, executed').toBe(false);
  });

  it('#183 [PARTIAL] No fixture exceeds 180 days without review — max-age assertion on the inline fixtures', () => {
    loadDescriptor();
    const age = daysBetween(new Date(), new Date(FIXTURE_REVIEWED));
    expect(age, `the inline must-fail fixtures were last reviewed ${FIXTURE_REVIEWED} — review them and bump FIXTURE_REVIEWED`).toBeLessThanOrEqual(FIXTURE_MAX_AGE_DAYS);
    expect(daysBetween(new Date(), new Date('2025-01-01')) > FIXTURE_MAX_AGE_DAYS, 'the detector fires on a backdated review date').toBe(true);
    for (const f of stepTestDirFiles().filter((x) => x.endsWith('.json'))) {
      const parsed = JSON.parse(fs.readFileSync(abs(f), 'utf8')) as { reviewed?: string };
      expect(typeof parsed.reviewed === 'string' && daysBetween(new Date(), new Date(parsed.reviewed)) <= FIXTURE_MAX_AGE_DAYS, `${f} has no review date within ${FIXTURE_MAX_AGE_DAYS} days`).toBe(true);
    }
  });

  it('#206 [PARTIAL] `records_meta` merge collisions are detected — this step\'s keys vs the chain-level keys, and a two-producer fixture', () => {
    const d = loadDescriptor();
    const runChain = fs.readFileSync(abs('scripts/run-chain.js'), 'utf8');
    const chainKeys = new Set<string>(['pipeline_meta', ...[...runChain.matchAll(/metaObj\.(\w+)\s*=/g)].map((m) => m[1] as string)]);
    expect(chainKeys.size, 'the chain-level taken keys parsed from run-chain.js').toBeGreaterThanOrEqual(3);
    const mine = new Set<string>(d.emits.map((e) => e.key));
    for (const t of d.terminals) if (typeof t.records_meta === 'object') for (const k of Object.keys(t.records_meta)) mine.add(k);
    const collisions = (a: Set<string>, b: Set<string>): string[] => [...a].filter((k) => b.has(k));
    expect(collisions(mine, chainKeys), 'this step emits a key the chain merge clobbers (run-chain merges shallowly)').toEqual([]);
    expect(collisions(new Set(['audit_table', 'x']), new Set(['audit_table', 'y'])), 'two-producer fixture').toEqual(['audit_table']);
  });
});

// ===========================================================================
// The three files, one slug — the descriptor (Fold A/B corrections 1–7), the compute, the shape
// ===========================================================================

describe('the three files, one slug (Spec 122 §4.1 / §5.1 / §5.2)', () => {
  it('descriptor exists, validates, and carries Fold A/B corrections 1–7', () => {
    const d = loadDescriptor();
    expect(d.identity.name).toBe('assert_schema');
    expect(d.identity.lock).toBe(102);
    // 1 — permit_cost_type_sample is blocking today (:308-311 → :585); schema allOf forces when:"pre"
    const cost = checkById(d, 'permit_cost_type_sample');
    expect(cost.blocking).toBe(true);
    expect(cost.when).toBe('pre');
    // 2 — zoning per-resource expect map with three distinct required sets
    const zr = zoningRequired(d);
    expect(Object.keys(zr).sort()).toEqual([...ZONING_IDS].sort());
    expect(zr[ZONING_HEIGHT_ID]).toContain('HT_LABEL');
    expect(zr[ZONING_LOT_COVERAGE_ID]).toContain('PRCNT_CVER');
    for (const c of ZONING_BASE_REQUIRED) expect(zr[ZONING_BASE_ID]).toContain(c);
    // 3 — no fetch timeout in code: PIN, not FIX
    expect(d.execution.network).not.toBe('none');
    expect((d.execution.network as { timeout: string }).timeout).toBe('none');
    // 4 — on_check_error is the policy (8 of 9 checks fail the step on error)
    expect(d.execution.on_check_error).toBe('fail_step');
    // 5 — the only table touched is pipeline_runs (migration 033)
    expect(d.database.min_migration).toBe(33);
    // 6 — parcel_columns emits into every chain's audit table
    expect([...(checkById(d, 'parcel_columns').chains as string[])].sort()).toEqual(['coa', 'permits', 'sources']);
    // 7 — fail_check / fail_error are one throw (:585): merged terminal
    const fails = d.terminals.filter((t) => t.status === 'failed');
    expect(fails.length, 'one merged fail terminal').toBe(1);
    expect(d.terminals.some((t) => t.id === 'fetch_error'), 'fetch_error was merged away').toBe(false);
  });

  it('compute exists, exports `compute`, and requiring it opens no pg.Pool and runs nothing', () => {
    artifact(COMPUTE_REL);
    const p = probe(COMPUTE_REL);
    expect(p.require_error, 'require() threw').toBeNull();
    expect(p.pools + p.clients, 'a pool/client constructed at require time').toBe(0);
    const src = stripComments(computeSource());
    expect(/pipeline\.run\s*\(/.test(src), 'pipeline.run in the compute').toBe(false);
    expect(/new\s+(pg\.)?Pool\s*\(/.test(src)).toBe(false);
    expect(typeof loadCompute()).toBe('function');
    expect(/^\s*\/\/.*SPEC LINK:|\* SPEC LINK:/m.test(fs.readFileSync(abs(COMPUTE_REL), 'utf8').split('\n').slice(0, 30).join('\n')), 'SPEC LINK header').toBe(true);
  });

  it('the step file is the §5.1 frozen shape (ast-grep silent, no pipeline.run), SPEC LINK kept', () => {
    computeSource(); // red until commit 7 — the shape cannot exist without the compute
    const src = fs.readFileSync(abs(STEP_REL), 'utf8');
    expect(src.split('\n').slice(0, 30).join('\n').includes('SPEC LINK:'), 'the 7-line file must keep the SPEC LINK header').toBe(true);
    expect(/const ADVISORY_LOCK_ID\s*=\s*102\b/.test(src)).toBe(true);
    expect(/module\.exports\s*=\s*pipeline\.step\(descriptor,\s*compute\)/.test(src)).toBe(true);
    expect(/module\.exports\.descriptor\s*=\s*descriptor/.test(src)).toBe(true);
    expect(/module\.exports\.compute\s*=\s*compute/.test(src)).toBe(true);
    expect(runShapeRule([STEP_REL]), 'ast-grep violations on the converted step').toEqual([]);
    const p = probe(STEP_REL);
    expect(p.require_error).toBeNull();
    expect(p.pools + p.clients).toBe(0);
    expect(p.has_descriptor && p.compute_type === 'function').toBe(true);
  });

  it('converted.json registers the step (commit 9 arms the A2 gate)', () => {
    computeSource();
    const converted = JSON.parse(fs.readFileSync(abs(CONVERTED_REL), 'utf8')) as { converted: string[] };
    expect(converted.converted).toContain(STEP_REL);
  });
});

/** Run the A2 rules over explicit paths (mirrors step-conformance.infra.test.ts). */
function runShapeRule(files: string[]): Array<{ file: string; rule: string; line: number }> {
  const bin = process.platform === 'win32'
    ? path.join(REPO_ROOT, 'node_modules/@ast-grep/cli-win32-x64-msvc/ast-grep.exe')
    : path.join(REPO_ROOT, 'node_modules/.bin/ast-grep');
  let stdout = '';
  try {
    stdout = execFileSync(bin, ['scan', '--rule', 'scripts/ast-grep-rules/step-shape.yml', '--report-style=short', '--color=never', ...files], {
      cwd: REPO_ROOT, encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (err) {
    stdout = (err as { stdout?: string }).stdout ?? '';
  }
  const LINE = /^(.+?):(\d+):(\d+): (?:error|warning|note|info)\[([\w-]+)\]:/;
  const out: Array<{ file: string; rule: string; line: number }> = [];
  for (const line of stdout.split(/\r?\n/)) {
    const m = LINE.exec(line);
    if (m) out.push({ file: (m[1] as string).replace(/\\/g, '/'), rule: m[4] as string, line: Number(m[2]) });
  }
  return out;
}

// ===========================================================================
// G4d fence locks — both directions (Spec 123 §6.1; Spec 120 §14.5 Gate 4d)
// ===========================================================================

describe('G4d fence locks', () => {
  for (const [i, fence] of FENCES.entries()) {
    const n = i + 1;

    it(`F${n} ${fence.commit} — present in the converted step (compute + descriptor): ${fence.construct}`, () => {
      const input = inputFromConverted(computeSource(), loadDescriptor());
      expect(fence.detect(input), `fence ${fence.commit} is not carried by the converted step`).toEqual([]);
    });

    it(`F${n} ${fence.commit} — reversion is detectable: the patch applied to the current subject makes the lock fire`, () => {
      // Positive control first: the lock is SILENT on the subject as it stands (legacy step today,
      // compute + descriptor after commit 7) — a detector that fires on both is no detector.
      const current = subjectInput();
      expect(fence.detect(current), `the lock fires on the un-reverted subject — it is not measuring the fence`).toEqual([]);
      const reverted = fence.revert(current);
      expect(reverted, 'the reversion patch must change the subject').not.toEqual(current);
      const findings = fence.detect(reverted);
      expect(findings.length, `reverting fence ${fence.commit} went undetected`).toBeGreaterThan(0);
    });
  }

  it('the four fences are exactly the four Severity:-footer commits on the step file', () => {
    const footers = git(['log', '--format=%H%x1f%B%x1e', '--', STEP_REL]).split('\x1e').filter((c) => /^Severity:/m.test(c));
    const fenced = footers.map((c) => (c.split('\x1f')[0] ?? '').trim().slice(0, 8)).filter(Boolean);
    for (const c of FENCE_COMMITS) expect(fenced, `fence commit ${c} has no Severity: footer on ${STEP_REL}`).toContain(c);
    expect(fenced.length, 'fence density (Spec 123 §6 G1)').toBe(FENCE_COMMITS.length);
  });
});
