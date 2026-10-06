// SPEC LINK: docs/specs/01-pipeline/56_source_massing.md (link_massing mode gate); docs/specs/01-pipeline/122_pipeline_step_optimization.md (registry-truth P2-C6 — massing-full-gate retirement)
//
// RE-HOMED from src/tests/massing-full-gate.logic.test.ts (fence 2f3d0e4e, WF2 P11-2) when
// FLEET-2 P2-C6 retired scripts/lib/massing-full-gate.js (runtime-dead since pilot 3: the gate
// moved to scripts/lib/step/staleness.js selectMode, truth table ported verbatim). The same
// properties are now proven against the runtime reader itself. The semantic-bump fence
// ("bump on ANY change to the matching predicate") now lives in the descriptor:
// staleness.logic_version is hand-bumped, and the code_version trigger compares it.
//
// FLEET-2 dry-merge D9 (O4 row 5, fold 14/15, LM-D17; fold 17 item 1): link_massing is now
// full_rescan — mode_select "none", resolved by index.js resolveLinkGate (FULL every run; the
// savings come from the IS DISTINCT FROM guard rewriting only changed links). The selectMode
// truth table below is kept, proven on a tri_state CLONE (it still binds every tri_state step);
// the real descriptor is proven through resolveLinkGate. The R6 semantic-bump fence survives:
// logic_version is still the measured code signal.

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const REPO = path.resolve(__dirname, '..', '..');

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the CJS library (the mode gate)
const staleness = require(path.join(REPO, 'scripts/lib/step/staleness.js')) as {
  selectMode: (args: {
    descriptor: unknown;
    pool: unknown;
    prior: Record<string, unknown> | null;
    argv: string[];
    env: Record<string, string>;
    ownRunId?: number | null;
  }) => Promise<{
    mode: 'full' | 'incremental';
    reason: string;
    changed: boolean;
    explicit_full: boolean;
    forced: boolean;
    signals: Array<{ key: string; signal: string; current: string | null; prior: string | null; changed: boolean }>;
    interrupted_retraction: unknown;
  }>;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the CJS runner (the real mode path under mode_select "none")
const runner = require(path.join(REPO, 'scripts/lib/step/index.js')) as {
  resolveLinkGate: (args: { descriptor: unknown; pool: unknown; prior: Record<string, unknown> | null; ownRunId: number | null; tag: string }) => Promise<{
    mode: 'full' | 'incremental'; reason: string; changed: boolean; explicit_full: boolean; forced: boolean;
    signals: Array<{ key: string; signal: string; current: string | null; prior: string | null; changed: boolean }>;
    interrupted_retraction: unknown;
  }>;
};

const DESCRIPTOR_PATH = path.join(REPO, 'scripts/link-massing.descriptor.json');
const descriptor = JSON.parse(fs.readFileSync(DESCRIPTOR_PATH, 'utf8')) as {
  identity: { name: string };
  staleness: {
    mode_select: string;
    logic_version: string;
    fingerprint_inputs: string[];
    trigger: Array<{ signal: string; position: string; emit_key?: string; table?: string }>;
  };
  outputs: {
    writes: Array<{ table: string; retract: string; retract_when?: string; write_discipline: { scope: string; class: string } }>;
    invalidates: Array<{ table: string; column: string; by?: string }>;
  };
  execution: { invocation: { sources: { argv: string[] } } };
  emits: Array<{ key: string; type: string; consumers: string[] }>;
  terminals: Array<{ kind: string; records_meta: Record<string, string> }>;
};

describe('selectMode truth table on a tri_state CLONE of the link_massing descriptor — full only when permitted AND changed (or forced); the real descriptor is full_rescan (O4 row 5)', () => {
  const TRI_STATE = JSON.parse(JSON.stringify(descriptor)) as typeof descriptor;
  TRI_STATE.staleness.mode_select = 'tri_state';

  /**
   * The `selectMode` path touches the pool in exactly one place:
   *   · `measureTrigger` for the `upstream_ledger` signal — `SELECT COUNT(*)::bigint … FROM
   *     building_footprints` (the DATA signal; `code_version` is pure and touches nothing).
   * FLEET-2 §5 triage 2026-10-06: `recovery.interrupted` is now "none" (FLEET-2 R2), so
   * `detectInterruptedRetraction` returns without a `pipeline_runs` read; the two declared signals decide the mode.
   */
  function mockPool(count: string, interruptedRows: Array<Record<string, unknown>> = []) {
    return {
      query: async (sql: string) => {
        if (/FROM building_footprints/.test(sql)) return { rows: [{ n: count }] };
        if (/pipeline_runs/.test(sql)) return { rows: interruptedRows };
        return { rows: [] };
      },
    };
  }

  /** The prior run's `records_meta`, on the measured steady state — both signals present and equal. */
  const SAME = {
    code_version: 'v2-building-centroid-in-parcel',
    building_footprints_count: '427077',
  };

  /** The `sources` chain argv — the chain whose invocation carries `--full` (descriptor-declared, never hand-typed). */
  const SOURCES_ARGV = descriptor.execution.invocation.sources.argv;
  /**
   * A run with NO `--full` (full-capability is tied to the flag). FLEET-2 §5 triage 2026-10-06: FLEET-2 §2.1 removed the
   * permits invocation (link_massing runs in sources only), so the no-flag row is the standalone run's argv — none.
   */
  const NO_FULL_ARGV: string[] = [];

  it('force env → full regardless of gate', async () => {
    // MQ-B2 (a), fold 19: the REAL link_massing override.force_full is "none" (retired; its negative
    // lock is in step-library.logic.test.ts). The library's override arm is proven on a tri_state
    // CLONE that declares one — the same env name, so the truth table is unchanged.
    const FORCEABLE = JSON.parse(JSON.stringify(TRI_STATE)) as typeof TRI_STATE & { override: { force_full: string } };
    FORCEABLE.override = { ...(FORCEABLE.override ?? {}), force_full: 'LINK_MASSING_FORCE_FULL' };
    const r = await staleness.selectMode({
      descriptor: FORCEABLE,
      pool: mockPool('427077'),
      prior: { ...SAME },
      argv: NO_FULL_ARGV,
      env: { LINK_MASSING_FORCE_FULL: '1' },
    });
    expect(r.mode, 'the operator override bypasses BOTH the invocation and the signals').toBe('full');
    expect(r.reason).toBe('force_full_env');
    expect(r.forced).toBe(true);
  });

  it('sources chain (--full) + changed → full', async () => {
    const r = await staleness.selectMode({
      descriptor: TRI_STATE,
      pool: mockPool('427077'),
      prior: { ...SAME, building_footprints_count: '426000' },
      argv: SOURCES_ARGV,
      env: {},
    });
    expect(r.mode).toBe('full');
    expect(r.reason).toBe('gate:building_footprints_count_changed(426000->427077)');
    expect(r.changed).toBe(true);
    expect(r.explicit_full).toBe(true);
  });

  it('sources chain (--full) + unchanged → INCREMENTAL (the savings)', async () => {
    const r = await staleness.selectMode({
      descriptor: TRI_STATE,
      pool: mockPool('427077'),
      prior: { ...SAME },
      argv: SOURCES_ARGV,
      env: {},
    });
    expect(r.mode, '--full is a PERMIT, never a decision — the 21.9-minute relink is not paid').toBe('incremental');
    expect(r.reason).toBe('incremental:gate_unchanged');
    expect(r.changed).toBe(false);
    expect(r.explicit_full).toBe(true);
  });

  it('standalone (no --full) + changed → still incremental (full-capability tied to --full)', async () => {
    const r = await staleness.selectMode({
      descriptor: TRI_STATE,
      pool: mockPool('427077'),
      prior: { ...SAME, code_version: 'v1-OLD-predicate' },
      argv: NO_FULL_ARGV,
      env: {},
    });
    expect(r.mode).toBe('incremental');
    expect(r.reason).toBe('incremental:no_full_arg');
    expect(r.changed, 'the change is still MEASURED and reported — only the permission is absent').toBe(true);
    expect(r.explicit_full).toBe(false);
  });

  it('no prior run → changed (bootstrap full)', async () => {
    const r = await staleness.selectMode({
      descriptor: TRI_STATE,
      pool: mockPool('427077'),
      prior: null,
      argv: SOURCES_ARGV,
      env: {},
    });
    expect(r.mode).toBe('full');
    expect(r.reason).toBe('gate:no_prior_run');
    expect(r.changed).toBe(true);
  });

  it('prior code_version differs → the b16c036-class guard', async () => {
    const r = await staleness.selectMode({
      descriptor: TRI_STATE,
      pool: mockPool('427077'),
      prior: { ...SAME, code_version: 'v1-OLD-predicate' },
      argv: SOURCES_ARGV,
      env: {},
    });
    expect(r.mode, 'a pure data gate would have silently skipped the predicate FLIP').toBe('full');
    expect(r.reason).toBe('gate:code_version_changed(v1-OLD-predicate->v2-building-centroid-in-parcel)');
    expect(r.changed).toBe(true);
  });

  it('same code + same count → unchanged (incremental)', async () => {
    const r = await staleness.selectMode({
      descriptor: TRI_STATE,
      pool: mockPool('427077'),
      prior: { ...SAME },
      argv: SOURCES_ARGV,
      env: {},
    });
    expect(r.changed).toBe(false);
    expect(r.mode).toBe('incremental');
  });

  it('pre-P11 prior with no recorded signals → UNCHANGED (trusts the last full relink)', async () => {
    const r = await staleness.selectMode({
      descriptor: TRI_STATE,
      pool: mockPool('427077'),
      prior: { parcels_linked: 485135 },
      argv: SOURCES_ARGV,
      env: {},
    });
    expect(r.changed, 'an ABSENT baseline is not a change — else every upgrade pays a 21.9-minute relink').toBe(false);
    expect(r.mode).toBe('incremental');
    expect(r.reason).toBe('incremental:gate_unchanged');
  });

  it('building_footprints_count compares by STRING (jsonb may hand back either form)', async () => {
    const r = await staleness.selectMode({
      descriptor: TRI_STATE,
      pool: mockPool('427077'),
      prior: { ...SAME, building_footprints_count: 427077 as unknown as string },
      argv: SOURCES_ARGV,
      env: {},
    });
    expect(r.changed, '427077 and "427077" are the same corpus').toBe(false);
    expect(r.mode).toBe('incremental');
  });
});

describe('resolveLinkGate on the REAL link_massing descriptor — O4 row 5 full_rescan (fold 14/15, LM-D17; fold 17 item 1)', () => {
  /**
   * Under `mode_select: "none"` the runner never reaches the tri-state truth table: it measures
   * every declared `pre_compute` trigger (code_version is pure; upstream_ledger reads the table)
   * and returns a FULL / full_rescan verdict unconditionally — the savings moved into the IS
   * DISTINCT FROM upsert guard, which rewrites only the links that actually changed.
   */
  function mockPool(count: string) {
    return {
      query: async (sql: string) => {
        if (/FROM building_footprints/.test(sql)) return { rows: [{ n: count }] };
        return { rows: [] };
      },
    };
  }

  /** The prior run's `records_meta`, on the measured steady state — both signals present and equal. */
  const SAME = {
    code_version: 'v2-building-centroid-in-parcel',
    building_footprints_count: '427077',
  };

  it('G1 the descriptor routes through resolveLinkGate: mode_select none + a full_rescan invalidates row', () => {
    expect(descriptor.staleness.mode_select).toBe('none');
    expect(
      descriptor.outputs.invalidates.some((r) => r.table === 'parcel_buildings' && r.column === 'parcel_id' && r.by === 'full_rescan'),
    ).toBe(true);
  });

  it('G2 unchanged corpus → still FULL / full_rescan (no tri-state savings path; the guard rewrites only changed links)', async () => {
    const r = await runner.resolveLinkGate({ descriptor, pool: mockPool('427077'), prior: { ...SAME }, ownRunId: null, tag: '[link_massing]' });
    expect(r.mode).toBe('full');
    expect(r.reason).toBe('full_rescan');
    expect(r.forced).toBe(false);
    expect(r.explicit_full).toBe(false);
    expect(r.interrupted_retraction).toBeNull();
  });

  it('G3 changed corpus and no prior run → FULL / full_rescan either way, and the data signal is still MEASURED', async () => {
    const changedRun = await runner.resolveLinkGate({ descriptor, pool: mockPool('427077'), prior: { ...SAME, building_footprints_count: '426000' }, ownRunId: null, tag: '[link_massing]' });
    const dataSignal = changedRun.signals.find((s) => s.key === 'building_footprints_count');
    expect(dataSignal).toBeDefined();
    expect(dataSignal!.prior).toBe('426000');
    expect(dataSignal!.current).toBe('427077');
    expect(changedRun.reason).toBe('full_rescan');

    const bootstrap = await runner.resolveLinkGate({ descriptor, pool: mockPool('427077'), prior: null, ownRunId: null, tag: '[link_massing]' });
    for (const s of bootstrap.signals) expect(s.prior).toBeNull();
    expect(bootstrap.mode).toBe('full');
  });

  it('G4 R6 safeguard survives: a logic_version bump is still RECORDED — the code_version signal measures the descriptor logic_version', async () => {
    const r = await runner.resolveLinkGate({ descriptor, pool: mockPool('427077'), prior: { ...SAME, code_version: 'v1-OLD-predicate' }, ownRunId: null, tag: '[link_massing]' });
    const codeSignal = r.signals.find((s) => s.key === 'code_version');
    expect(codeSignal).toBeDefined();
    expect(codeSignal!.current).toBe(descriptor.staleness.logic_version);
    expect(codeSignal!.prior).toBe('v1-OLD-predicate');
    expect(descriptor.staleness.logic_version).not.toBe('none');
  });

  it('G5 building_footprints_count is measured as a STRING', async () => {
    const r = await runner.resolveLinkGate({ descriptor, pool: mockPool('427077'), prior: { ...SAME }, ownRunId: null, tag: '[link_massing]' });
    const dataSignal = r.signals.find((s) => s.key === 'building_footprints_count');
    expect(dataSignal).toBeDefined();
    expect(dataSignal!.current).toBe('427077');
    expect(typeof dataSignal!.current).toBe('string');
  });

  it('G6 a retract "all" target is REFUSED under mode_select none (the runner never mass-deletes on a full_rescan step)', async () => {
    const bad = JSON.parse(JSON.stringify(descriptor)) as typeof descriptor;
    bad.outputs.writes[1]!.retract = 'all';
    await expect(
      runner.resolveLinkGate({ descriptor: bad, pool: mockPool('427077'), prior: { ...SAME }, ownRunId: null, tag: '[link_massing]' }),
    ).rejects.toThrow(/retract "all"/);
  });
});

// ── RE-HOMED from src/tests/massing-full-gate.logic.test.ts (lines 91-146) ──────────────────
//
// This describe used to read scripts/link-massing.js as TEXT and assert four strings:
// `decideMassingFull(`, `const FULL_MODE = decideMassingFull(`, `if (FULL_MODE)`, and
// the two records_meta gate fields. All of them left that file — the whole gate moved to
// scripts/lib/step/staleness.js `selectMode` (the tri-state mode decision) and the
// retraction became a DECLARED write axis (`retract: "all"` + `retract_when: "full_only"`).
// O4 row 5 (fold 14/15, LM-D17) then retired that axis for link_massing: full_rescan + a keyed per-batch stale-link delete.
//
// ⚠️ RE-HOMED, NOT DELETED, AND THE THREE PROPERTIES ARE THE SAME THREE. What changed is that
// each is now asserted where it can no longer be satisfied by a coincidence of source text:
// the gate's truth table is proven against the pure `selectMode` decision (above), the
// ghost-link cleanup is proven against the SQL write.js actually generates, and the two
// self-consumed signals are proven against the descriptor's frozen producer contract — which
// is what `selectMode` reads back on the NEXT run.
describe('the FULL relink contract (descriptor)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS library
  const write = require(path.join(REPO, 'scripts/lib/step/write.js')) as {
    buildWritePlan: (w: unknown, d: unknown) => { delete_sql: string | null; retract_when: string };
  };

  it('FULL comes from the GATE, not from a raw --full flag (was: const FULL_MODE = decideMassingFull(...))', () => {
    // The truth table itself, unchanged — its arbiter is now staleness.selectMode (proven above).
    // And the declaration that routes the step through a MODE gate rather than a skip gate.
    expect(descriptor.staleness.mode_select, 'O4 row 5 (fold 17 item 1): FULL every run via resolveLinkGate — still a MODE gate, never a skip gate').toBe('none');
    const signals = descriptor.staleness.trigger.map((t) => t.signal).sort();
    expect(signals, 'both the CODE and the DATA signal, or a predicate flip goes unnoticed').toEqual(['code_version', 'upstream_ledger']);
    for (const t of descriptor.staleness.trigger) expect(t.position).toBe('pre_compute');
  });

  it('ghost-link cleanup — O4 row 5 (fold 14/15, LM-D17): the full-mode mass DELETE is retired; links no longer derived are removed per batch by the keyed link_full_retraction delete, scoped to the batch\'s parcels', () => {
    expect(descriptor.outputs.writes.some((w) => w.retract === 'all'), 'no retract "all" target remains').toBe(false);
    const del = descriptor.outputs.writes.find((w) => w.write_discipline.class === 'link_full_retraction');
    expect(del, 'the keyed stale-link delete is declared').toBeDefined();
    expect(del!.table).toBe('parcel_buildings');
    expect(del!.write_discipline.scope, 'scoped to the batch\'s parcels — never an unscoped retraction (B-7 intent kept)').toMatch(/parcel_id = ANY/);
    const plan = write.buildWritePlan(descriptor.outputs.writes[1], descriptor);
    expect(plan.delete_sql ?? null, 'the upsert target generates no delete').toBeNull();
  });

  it('records the gate signals (code_version + building_footprints_count) for the next run — as a DECLARED emit, and building_footprints_count stays a STRING', () => {
    const emits = Object.fromEntries(descriptor.emits.map((e) => [e.key, e]));
    for (const key of ['code_version', 'building_footprints_count']) {
      expect(emits[key], `${key} is no longer published for the next run's gate`).toBeDefined();
      expect(emits[key]!.consumers, 'the consumer is the step itself').toContain('link_massing');
    }
    // The gate compares String(prevCount): a type change would make every
    // comparison unequal and force a 21.9-minute relink on every run.
    expect(emits.building_footprints_count!.type).toBe('string');
    expect(descriptor.staleness.logic_version, 'the code signal is the descriptor value the gate compares').toBe('v2-building-centroid-in-parcel');
    const success = descriptor.terminals.find((t) => t.kind === 'success')!;
    for (const key of ['code_version', 'building_footprints_count']) {
      expect(Object.keys(success.records_meta), `${key} missing from the success terminal shape`).toContain(key);
    }
  });
});

describe('P2-C6 — scripts/lib/massing-full-gate.js is RETIRED (no live reference)', () => {
  const GATE_LIB_REL = 'scripts/lib/massing-full-gate.js';

  it('R1 the module file is gone', () => {
    expect(fs.existsSync(path.join(REPO, GATE_LIB_REL))).toBe(false);
  });

  it('R2 no live source file requires or imports it', () => {
    const RE = /require\(\s*['"][^'"]*massing-full-gate|from\s+['"][^'"]*massing-full-gate/;
    const EXT = /\.(js|cjs|mjs|ts|tsx)$/;
    const SKIP_DIRS = new Set(['node_modules', 'docs', 'fixtures', '.git']);

    function walk(dir: string, out: string[]): void {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name)) continue;
          walk(full, out);
        } else if (entry.isFile() && EXT.test(entry.name)) {
          out.push(full);
        }
      }
    }

    const files: string[] = [];
    for (const root of ['scripts', 'src']) walk(path.join(REPO, root), files);

    const offenders = files
      .filter((f) => RE.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(REPO, f))
      .sort();
    expect(offenders, 'a live importer of the retired gate would make the deletion a broken require').toEqual([]);
  });

  it('R3 the descriptor no longer names it, and its fingerprint_inputs is the compute alone', () => {
    const raw = fs.readFileSync(DESCRIPTOR_PATH, 'utf8');
    expect(raw, 'S10 / §1.5: fingerprint_inputs named this file; the semantic bump lives in logic_version now').not.toContain('massing-full-gate');
    expect(descriptor.staleness.fingerprint_inputs).toEqual(['scripts/lib/compute/link-massing.js']);
  });

  it('R4 the staleness-disposition registry has no row for it', () => {
    const raw = fs.readFileSync(path.join(REPO, 'scripts/steps/_schema/staleness-disposition.json'), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    expect(JSON.stringify(parsed), 'a disposition row for a deleted file is a rotted citation').not.toContain('massing-full-gate');
  });

  it('R5 scripts/lib/source-version.js no longer cites it', () => {
    const raw = fs.readFileSync(path.join(REPO, 'scripts/lib/source-version.js'), 'utf8');
    expect(raw, 'the header excluded this file from the standardization by name — the exclusion is now historical, not a live pointer').not.toContain('massing-full-gate');
  });

  it('R6 the code signal SURVIVES the retirement (logic_version ≠ none ⇔ a code_version trigger)', () => {
    expect(descriptor.staleness.logic_version, 'the semantic-bump fence must not be retired with the module').not.toBe('none');
    const codeTriggers = descriptor.staleness.trigger.filter((t) => t.signal === 'code_version');
    expect(codeTriggers.length, 'logic_version ≠ none requires a code_version trigger to compare it').toBeGreaterThan(0);
  });
});
