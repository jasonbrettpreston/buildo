// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6.1 (gate #44); registry-truth plan fold 14 (O4 full_rescan evidence) + fold 13 (invalidates[].by)
//
// RED-first lock for the `full_rescan` EVIDENCE rule (operator O4 ruling, registry-truth fold 14)
// and for fold 13's CLOSED `outputs.invalidates[].by` vocabulary.
//
// The rule. An `outputs.invalidates[]` row with `by: "full_rescan"` is ARMED only when BOTH hold:
//   (1) DECLARED — for an ENRICHER, every `execution.phases[]` entry whose `writes_ref` points at a
//       write target that writes `<table>.<column>` declares `scope: "full"`; for any other
//       archetype, `staleness.mode_select === "none"` AND every write target writing
//       `<table>.<column>` has a `write_discipline.scope` carrying no `IS NULL` predicate and no
//       `NOT EXISTS` anti-join (case-insensitive; `IS NOT NULL` / `IS DISTINCT FROM` are fine);
//   (2) WITNESSED — at least one FRESH (non-stale) post trace has a statement of `kind: "write"`
//       whose `writes[<table>]` includes `<column>`.
// Until (2) holds the row is UNWITNESSED.
//
// Contract locked here (scripts/analysis/gates/witness.mjs, pure ESM):
//   NEW export `fullRescanItems(descriptor, freshTraces)` ->
//     `full_rescan:arm:<table>.<column>`        when (1) fails (also when NO declared write target
//                                               writes that column at all),
//     `full_rescan:unwitnessed:<table>.<column>` when (1) holds and (2) fails,
//     nothing                                    when the row is armed — and nothing at all for a
//                                               row without `by`, or with a different `by`.
//   `evaluateWitness` adds `FAIL:WITNESS:<slug>:full_rescan:arm:<t>.<c>` (declaration-only, so it
//   fires with no traces at all) and `UNWITNESSED:<slug>:full_rescan:<t>.<c>` (NON-stale post
//   traces only).
//   `scripts/steps/_schema/step.schema.json` `outputs.invalidates[].items.by` is LDG-10's (WF1
//   LDG-10 fold 1d, which supersedes this file's fold-13 first draft): a REQUIRED closed enum
//   {trigger, set_null_on_change_of, step, pin, full_rescan} with direction fields `trigger` /
//   `step` / `set_null_on_change_of` and six direction rules. F10 pins that grammar; it is green
//   only when LDG-10's schema block and the link-neighbourhoods `by` rider are in the tree
//   (FLEET-2 assembly).
//
// RED today: `fullRescanItems` does not exist, so every test below fails (module exports are read
// lazily inside each test so a missing export is a FAILED ASSERTION, per-test, not a collection
// error). F8 (in-process, needs no new export) is the GREEN control that proves the same assertions
// pass on sibling input.

import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(REPO_ROOT, 'scripts', 'analysis', 'gates', 'witness.mjs');
const SCHEMA_PATH = path.join(REPO_ROOT, 'scripts', 'steps', '_schema', 'step.schema.json');
const DESCRIPTOR_PATH = path.join(REPO_ROOT, 'scripts', 'link-neighbourhoods.descriptor.json');

const FP = 'fp-current';

// ---------------------------------------------------------------------------
// Fixtures (in memory only — this file never reads a trace from disk).
// ---------------------------------------------------------------------------

type TraceDoc = {
  source_fingerprint?: string | null;
  statements?: Array<Record<string, unknown>>;
  transactions?: Array<{ client: string; write_fingerprints: string[] }>;
  autocommit_writes?: string[];
  touched?: { reads: Record<string, string[]>; writes: Record<string, string[]> };
  errors?: string[];
};

const PERMITS_COLUMN = { name: 'neighbourhood_id' };

/**
 * A LINK-shaped descriptor writing exactly `permits.neighbourhood_id`, with the invalidation row
 * and the declared scope under test. `readColumns` deliberately does NOT declare the write column
 * (no read-table overlap), so each fixture's one variable is the write/scope declaration.
 */
function linkDescriptor(overrides: {
  scope?: string;
  modeSelect?: string;
  invalidates?: unknown[];
  writeColumns?: Array<{ name: string }>;
} = {}): Record<string, unknown> {
  const written = overrides.writeColumns ?? [PERMITS_COLUMN];
  const scope = overrides.scope ?? 'p.latitude IS NOT NULL AND p.longitude IS NOT NULL';
  return {
    identity: { archetype: 'LINK' },
    staleness: { mode_select: overrides.modeSelect ?? 'none' },
    inputs: { reads: { tables: [{ table: 'permits', columns: ['permit_num', 'latitude'] }] } },
    outputs: {
      writes: [
        {
          table: 'permits',
          columns: written,
          write_discipline: { class: 'set_based_join_update', scope },
        },
      ],
      write_inventory: { statements: 1 },
      invalidates: overrides.invalidates ?? [
        { table: 'permits', column: 'neighbourhood_id', when: 'x', by: 'full_rescan' },
      ],
    },
  };
}

/** F2's descriptor: the incremental `IS NULL` conjunct is still in the declared scope. */
function armByIsNull(): Record<string, unknown> {
  return linkDescriptor({
    scope: 'p.neighbourhood_id IS NULL AND p.latitude IS NOT NULL',
  });
}

/** F3's descriptor: an anti-join rather than a predicate. */
function armByNotExists(): Record<string, unknown> {
  return linkDescriptor({
    scope: 'NOT EXISTS (SELECT 1 FROM permit_links l WHERE l.permit_num = p.permit_num)',
  });
}

/** F5's descriptor: the scope is clean, so the only thing that can be missing is the witness. */
function unwitnessedDescriptor(): Record<string, unknown> {
  return linkDescriptor();
}

/**
 * An ENRICHER writing exactly `parcels.comp_count` through ONE phase. `phaseScope` is the one
 * variable: `execution.phases[0]` is what fills `outputs.writes[0]`.
 */
function enricherDescriptor(phaseScope: string): Record<string, unknown> {
  return {
    identity: { archetype: 'ENRICHER' },
    staleness: { mode_select: 'none' },
    inputs: { reads: { tables: [{ table: 'parcels', columns: ['id', 'geom'] }] } },
    outputs: {
      writes: [{ table: 'parcels', columns: [{ name: 'comp_count' }] }],
      write_inventory: { statements: 1 },
      invalidates: [
        { table: 'parcels', column: 'comp_count', when: 'x', by: 'full_rescan' },
      ],
    },
    execution: {
      txn_scope: 'step',
      phases: [{ order: 1, txn: 'main', writes_ref: 0, scope: phaseScope }],
    },
  };
}

/**
 * A post trace the gate accepts on its own terms (a) and (b): it reads the declared read columns
 * and writes the declared write targets. `writtenColumns` is the one variable — F5's trace writes
 * a different column of the same table, so the declaration is intact and only the WITNESS is
 * missing.
 */
function trace(opts: {
  writtenColumns?: string[];
  fingerprint?: string;
  writeTables?: string[];
} = {}): TraceDoc {
  const writtenColumns = opts.writtenColumns ?? ['neighbourhood_id'];
  const tables = opts.writeTables ?? ['permits'];
  const writes: Record<string, string[]> = {};
  for (const table of tables) writes[table] = writtenColumns;
  return {
    source_fingerprint: opts.fingerprint ?? FP,
    statements: [
      {
        fingerprint: 'w1',
        kind: 'write',
        count: 1,
        reads: { permits: ['permit_num', 'latitude'] },
        writes,
        excluded: [],
        error: null,
      },
    ],
    transactions: [{ client: '1:1', write_fingerprints: ['w1'] }],
    autocommit_writes: [],
    touched: { reads: { permits: ['permit_num', 'latitude'] }, writes },
    errors: [],
  };
}

/** The `writes[table]` union of a fresh-trace map, mirroring the gate's `touchedOf`. */
function writesOf(traces: Record<string, TraceDoc>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const t of Object.values(traces)) {
    for (const [table, cols] of Object.entries(t.touched?.writes ?? {})) {
      out[table] = [...new Set([...(out[table] ?? []), ...(cols as string[])])];
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The module under test, read through the file URL so a missing export/unbuilt module is a
// per-test FAILED ASSERTION (never a collection error that reports 0 tests).
// ---------------------------------------------------------------------------
type GateModule = {
  evaluateWitness: (args: {
    slug: string;
    descriptor: unknown;
    status: 'pending' | 'converted';
    currentFingerprint: string;
    postTraces: Record<string, TraceDoc>;
    preTraces: Record<string, TraceDoc>;
    explainedDiffs: string[];
  }) => { answer: string; rows: string[]; hardStop: boolean };
  fullRescanItems?: (
    descriptor: unknown,
    freshTraces: Record<string, { writes: Record<string, string[]> }>,
  ) => string[];
};

async function gate(): Promise<GateModule> {
  return (await import(pathToFileURL(MODULE_PATH).href)) as GateModule;
}

/** `fullRescanItems` through the real ESM module — RED today (the export does not exist yet). */
async function fullRescan(
  descriptor: unknown,
  freshTraces: Record<string, TraceDoc>,
): Promise<string[]> {
  const G = (await gate()) as unknown as Record<string, unknown>;
  expect(
    typeof G.fullRescanItems,
    'witness.mjs must export fullRescanItems(descriptor, freshTraces)',
  ).toBe('function');
  const fn = G.fullRescanItems as (
    d: unknown,
    f: Record<string, { writes: Record<string, string[]> }>,
  ) => string[];
  return fn(descriptor, writesOf(freshTraces) as unknown as Record<string, { writes: Record<string, string[]> }>);
}

/** `evaluateWitness` through the real ESM module, with this file's fixture shape. */
function runWitness(args: {
  slug?: string;
  descriptor: unknown;
  status?: 'pending' | 'converted';
  postTraces?: Record<string, TraceDoc>;
}): { answer: string; rows: string[]; hardStop: boolean } {
  const G = (globalThis as { __fleet2Gate?: GateModule }).__fleet2Gate;
  if (!G) throw new Error('witness.mjs was not loaded (beforeAll failed)');
  return G.evaluateWitness({
    slug: args.slug ?? 'link_neighbourhoods',
    descriptor: args.descriptor,
    status: args.status ?? 'converted',
    currentFingerprint: FP,
    postTraces: args.postTraces ?? { link_neighbourhoods: trace() },
    preTraces: {},
    explainedDiffs: [],
  });
}

// ===========================================================================
// F1–F8 (and F9) all go through the same lazily-loaded module. A missing module is a
// per-test failure, not a skipped file: without it a RED has no evidence.
// ===========================================================================
let loadError: unknown = null;
try {
  // Top-level await inside the ESM test module: imported once, shared by every test.
  (globalThis as { __fleet2Gate?: GateModule }).__fleet2Gate = (await import(
    pathToFileURL(MODULE_PATH).href
  )) as GateModule;
} catch (err) {
  loadError = err;
}

function requireGate(): GateModule {
  if (loadError) throw loadError;
  return (globalThis as { __fleet2Gate?: GateModule }).__fleet2Gate as GateModule;
}

describe('full_rescan evidence — the DECLARED half (gate #44, O4 fold 14)', () => {
  // F1 (RED) — a clean declaration plus a fresh write witness is ARMED: nothing to report.
  it('F1 (RED) — full rescan declared and witnessed → no row', async () => {
    expect(loadError).toBe(null);
    const items = await fullRescan(linkDescriptor(), { permits: trace() });
    expect(items).toEqual([]);
  });

  // F2 (RED) — `IS NULL` in the declared scope is the INCREMENTAL write, so `full_rescan` is a lie.
  it('F2 (RED) — scope carries `IS NULL` → arm row', async () => {
    expect(loadError).toBe(null);
    const items = await fullRescan(armByIsNull(), { permits: trace() });
    expect(items).toEqual(['full_rescan:arm:permits.neighbourhood_id']);
  });

  // F3 (RED) — a NOT EXISTS anti-join narrows the write just as hard as `IS NULL` does.
  it('F3 (RED) — scope uses a NOT EXISTS anti-join → arm row', async () => {
    expect(loadError).toBe(null);
    const items = await fullRescan(armByNotExists(), { permits: trace() });
    expect(items).toEqual(['full_rescan:arm:permits.neighbourhood_id']);
  });

  // F4 (RED) — a tri_state mode CAN narrow the write by itself, so `full_rescan` cannot be declared.
  it('F4 (RED) — staleness.mode_select is tri_state → arm row', async () => {
    expect(loadError).toBe(null);
    const items = await fullRescan(linkDescriptor({ modeSelect: 'tri_state' }), {
      permits: trace(),
    });
    expect(items).toEqual(['full_rescan:arm:permits.neighbourhood_id']);
  });

  // F5 (RED) — declared clean but no FRESH trace writes the column: unwitnessed, not armed.
  it('F5 (RED) — no trace writes the column → unwitnessed row', async () => {
    expect(loadError).toBe(null);
    const items = await fullRescan(unwitnessedDescriptor(), {
      permits: trace({ writtenColumns: ['permit_num'] }),
    });
    expect(items).toEqual(['full_rescan:unwitnessed:permits.neighbourhood_id']);
  });

  // F6 (RED) — an ENRICHER's declared field is its PHASES: `scope: "full"` arms, anything else does not.
  it('F6 (RED) — ENRICHER: every filling phase scope "full" → no row (same phase "incremental" → arm row)', async () => {
    expect(loadError).toBe(null);
    const fullPhase = await fullRescan(enricherDescriptor('full'), {
      parcels: trace({ writtenColumns: ['comp_count'], writeTables: ['parcels'] }),
    });
    expect(fullPhase).toEqual([]);
    const incrementalPhase = await fullRescan(enricherDescriptor('incremental'), {
      parcels: trace({ writtenColumns: ['comp_count'], writeTables: ['parcels'] }),
    });
    expect(incrementalPhase).toEqual(['full_rescan:arm:parcels.comp_count']);
  });

  // F7 (RED) — no declared write target writes the column at all: the declaration itself fails.
  it('F7 (RED) — no declared write target writes the column → arm row', async () => {
    expect(loadError).toBe(null);
    const descriptor = linkDescriptor({ writeColumns: [{ name: 'permit_num' }] });
    const items = await fullRescan(descriptor, { permits: trace() });
    expect(items).toEqual(['full_rescan:arm:permits.neighbourhood_id']);
  });

  // F8 (GREEN after the fix) — the rule is scoped to `by: "full_rescan"`: a sibling `by` and an
  // absent `by` are OTHER invalidators and yield nothing. (In-process today: the closed vocabulary
  // is exactly what this test pins, so it needs no new export.)
  it('F8 (GREEN after fix) — another `by` and no `by` both yield nothing, and `fullRescanItems` exists', async () => {
    const G = requireGate();
    expect(typeof G.fullRescanItems).toBe('function');
    const siblingBy = await fullRescan(linkDescriptor({
      invalidates: [
        {
          table: 'permits',
          column: 'neighbourhood_id',
          when: 'x',
          by: 'set_null_on_change_of',
          set_null_on_change_of: 'geometry',
        },
      ],
    }), { permits: trace() });
    expect(siblingBy).toEqual([]);
    const noBy = await fullRescan(linkDescriptor({
      invalidates: [{ table: 'permits', column: 'neighbourhood_id', when: 'x' }],
    }), { permits: trace() });
    expect(noBy).toEqual([]);
  });
});

describe('full_rescan evidence — the WITNESSED half, through evaluateWitness (gate #44)', () => {
  // F9 (RED) — the gate rows. Arm is DECLARATION-ONLY (it fires with no traces at all); unwitnessed
  // needs a fresh trace and a clean declaration; a STALE trace proves nothing and stays unwitnessed.
  it('F9 (RED) — evaluateWitness reports the arm failure on an F2-shaped descriptor', () => {
    expect(loadError).toBe(null);
    const out = runWitness({ descriptor: armByIsNull(), postTraces: {} });
    expect(out.rows).toContain('FAIL:WITNESS:link_neighbourhoods:full_rescan:arm:permits.neighbourhood_id');
  });

  it('F9 (RED) — evaluateWitness reports UNWITNESSED on an F5-shaped descriptor', () => {
    expect(loadError).toBe(null);
    const out = runWitness({
      descriptor: unwitnessedDescriptor(),
      postTraces: { link_neighbourhoods: trace({ writtenColumns: ['permit_num'] }) },
    });
    expect(out.rows).toContain('UNWITNESSED:link_neighbourhoods:full_rescan:permits.neighbourhood_id');
    expect(out.rows).not.toContain(
      'FAIL:WITNESS:link_neighbourhoods:full_rescan:arm:permits.neighbourhood_id',
    );
  });

  it('F9 (RED) — a STALE-only trace on an F1-shaped descriptor is still unwitnessed', () => {
    expect(loadError).toBe(null);
    const out = runWitness({
      descriptor: linkDescriptor(),
      postTraces: { link_neighbourhoods: trace({ fingerprint: 'fp-old' }) },
    });
    expect(out.rows).toContain('UNWITNESSED:link_neighbourhoods:full_rescan:permits.neighbourhood_id');
    expect(out.rows).not.toContain(
      'FAIL:WITNESS:link_neighbourhoods:full_rescan:arm:permits.neighbourhood_id',
    );
  });
});

// ===========================================================================
// F10 — LDG-10's REQUIRED closed `invalidates[].by` enum + direction fields in the step schema.
// ===========================================================================
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS validator
const { compileStepSchema } = require(path.join(REPO_ROOT, 'scripts/lib/step/validate.js')) as {
  compileStepSchema: (schema: unknown) => {
    (data: unknown): boolean;
    errors: Array<Record<string, unknown>> | null;
  };
};
const validateStep = compileStepSchema(
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- node:fs, the schema is read from disk
  JSON.parse(require('node:fs').readFileSync(SCHEMA_PATH, 'utf8')) as unknown,
);

/**
 * The real descriptor with invalidates[0]'s by-arm (by + its direction field) replaced by
 * `fields`, or removed when absent.
 */
function descriptorWithBy(fields?: Record<string, string>): Record<string, unknown> {
  const descriptor = JSON.parse(
    /* eslint-disable-next-line @typescript-eslint/no-require-imports -- node:fs, the descriptor is read from disk */
    require('node:fs').readFileSync(DESCRIPTOR_PATH, 'utf8'),
  ) as { outputs: { invalidates: Array<Record<string, unknown>> } };
  const entry = descriptor.outputs.invalidates[0]!;
  delete entry.by;
  delete entry.trigger;
  delete entry.step;
  delete entry.set_null_on_change_of;
  if (fields !== undefined) Object.assign(entry, fields);
  return descriptor as unknown as Record<string, unknown>;
}

describe('LDG-10 — invalidates[].by is a REQUIRED closed enum with direction fields (step.schema.json)', () => {
  // LDG-10 grammar (fold 1d supersedes fold 13's first draft): closed enum + direction field.
  // RED today: this tree's schema has no `by` yet (LDG-10 lands at FLEET-2 assembly).
  it.each([
    { by: 'full_rescan' },
    { by: 'pin' },
    { by: 'trigger', trigger: 'permits.trg_permits_set_location' },
    { by: 'step', step: 'load_parcels' },
    { by: 'set_null_on_change_of', set_null_on_change_of: 'latitude' },
  ])('F10 — by-arm %j validates', (fields) => {
    expect(
      validateStep(descriptorWithBy(fields)),
      JSON.stringify(validateStep.errors),
    ).toBe(true);
  });

  // LDG-10 grammar (fold 1d supersedes fold 13's first draft): closed enum + direction field.
  // No escape value, no open-string form, and each direction field is required by its `by`.
  it.each([
    { by: 'manual' },
    { by: 'trigger:permits.trg_permits_set_location' },
    { by: '' },
    { by: 'trigger' },
    { by: 'step' },
    { by: 'set_null_on_change_of' },
    { by: 'pin', trigger: 'permits.trg_permits_set_location' },
  ])('F10 — by-arm %j does NOT validate', (fields) => {
    expect(validateStep(descriptorWithBy(fields))).toBe(false);
  });

  // LDG-10 grammar (fold 1d supersedes fold 13's first draft): closed enum + direction field.
  it('F10 — by is REQUIRED: an invalidates entry without by does NOT validate', () => {
    expect(validateStep(descriptorWithBy(undefined))).toBe(false);
  });

  it('F10 — the unmutated link-neighbourhoods descriptor validates', () => {
    /* eslint-disable @typescript-eslint/no-require-imports -- the real descriptor */
    const descriptor = JSON.parse(require('node:fs').readFileSync(DESCRIPTOR_PATH, 'utf8'));
    /* eslint-enable @typescript-eslint/no-require-imports */
    expect(validateStep(descriptor)).toBe(true);
  });
});
