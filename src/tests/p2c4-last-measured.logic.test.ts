// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.5 (invariants[]/plausibility[] last_measured); registry-truth plan P2-C4 (PLAN :223); fold 19 MQ-A3 (a) + compliance amendment; FLEET-2 A-5
//
// P2-C4 / MQ-A3 (a), fold 19. The capture harness (`scripts/analysis/capture-step-golden.js`)
// records ONE run of a step; the descriptor's `invariants[]`/`plausibility[]` entries carry a
// `last_measured` object that must be sourced FROM a capture, never typed by hand:
//
//   capture run → sidecar `docs/reports/golden/<slug>/measured.json` (CJS harness)
//   sidecar     → `last_measured` in every entry of the descriptor (ESM generator)
//   `--check`   → regenerate and go RED on a hand edit (the sidecar is the only writer)
//
// Fold 19 fixes the reduction rule now: the LATEST capture per entry wins, and `sample_n`
// counts how many captures were folded in (informational ONLY — it is not a statistic to
// reason about, it is a "how much evidence is behind this number" note).
//
// RED today: `capture-step-golden.js` exports none of `measuredPathFor` /
// `measuredFromCapture` / `mergeMeasured`, and `scripts/analysis/generate-last-measured.mjs`
// does not exist at all — every assertion below is against an API written by the green steps.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS harness
const cap = require(join(process.cwd(), 'scripts/analysis/capture-step-golden.js')) as {
  measuredPathFor: (slug: string) => string;
  measuredFromCapture: (doc: unknown, descriptor: unknown, at: string) => Record<string, MeasuredEntry>;
  mergeMeasured: (existing: unknown, measured: unknown) => { entries: Record<string, MeasuredEntry> };
  stripLastMeasuredForFingerprint: (text: string) => string;
};

/** The sidecar/generator entry shape — loose by design (every field is read, none is asserted on). */
interface MeasuredEntry {
  value?: unknown;
  cost_ms?: unknown;
  at?: unknown;
  commit?: unknown;
  run_id?: unknown;
  chain?: unknown;
  sample_n?: unknown;
  event?: unknown;
}

/** The generator's return shape. */
interface ApplyResult {
  text: string;
  changed: string[];
  unsourced: string[];
  skipped: string[];
  missing: string[];
}

/** The real ESM generator, loaded fresh per test (it does not exist yet — RED). */
async function loadGen(): Promise<{
  lastMeasuredFromSidecar: (e: unknown) => unknown;
  applyMeasuredText: (text: string, entries: Record<string, unknown>) => ApplyResult;
}> {
  return import(pathToFileURL(join(process.cwd(), 'scripts/analysis/generate-last-measured.mjs')).href) as Promise<{
    lastMeasuredFromSidecar: (e: unknown) => unknown;
    applyMeasuredText: (text: string, entries: Record<string, unknown>) => ApplyResult;
  }>;
}

const AT = '2026-10-04T00:00:00.000Z';

/** A capture document shaped exactly like `buildCapture()`'s output (only the fields under test). */
function doc(): Record<string, unknown> {
  return {
    git_head: 'abc1234',
    chain: 'sources',
    pipeline_runs: [],
    summary: {
      records_meta: {
        audit_table: {
          rows: [
            { metric: 'inv_a', value: 5 },
            { metric: 'sys_inv_a_duration_ms', value: 12 },
            { metric: 'pl_c', value: 0.5 },
            { metric: 'chk', value: 1 },
          ],
        },
      },
    },
  };
}

/** A descriptor: inv_a is run every run, pl_b is validate_only (never run → never captured). */
function desc(): Record<string, unknown> {
  return {
    invariants: [{ id: 'inv_a', frequency: 'every_run' }],
    plausibility: [
      { id: 'pl_b', frequency: 'validate_only' },
      { id: 'pl_c', frequency: 'every_run' },
    ],
  };
}

/**
 * A descriptor file that is NOT stringify-identical: it carries a `checks[]` entry with the
 * SAME id as the invariant (so the surgical replacement must land inside `invariants[]`, never
 * in `checks[]`) and a `pl_d` entry with no `last_measured` at all (never inserted).
 */
const ONE_LINE = [
  '{',
  '  "identity": { "name": "fx" },',
  '  "checks": [ { "id": "inv_a", "last_measured_note": "a check with the same id" } ],',
  '  "invariants": [',
  '    {',
  '      "id": "inv_a",',
  '      "sql": "SELECT 1",',
  '      "last_measured": { "value": 1, "at": "2026-08-30T13:17:49.000Z", "commit": "9019c3d", "cost_ms": 7, "sample_n": 3, "source_run": { "run_id": null, "chain": null, "event": "manual_timing" } },',
  '      "why": "x"',
  '    }',
  '  ],',
  '  "plausibility": [',
  '    { "id": "pl_b", "last_measured": { "value": 2, "at": "2026-08-30T13:17:49.000Z", "commit": "9019c3d", "cost_ms": 9, "sample_n": 1, "source_run": { "run_id": null, "chain": null, "event": "manual_timing" } } },',
  '    { "id": "pl_d", "sql": "SELECT 2" }',
  '  ]',
  '}',
  '',
].join('\n');

/** The M4 sidecar entry — one capture of inv_a with a real exit/run/chain provenance. */
const M4_ENTRIES: Record<string, unknown> = {
  inv_a: { value: 5, cost_ms: 12, at: AT, commit: 'abc1234', run_id: '9', chain: 'sources', sample_n: 4 },
};

/** M4's expected one-line rendering of the replaced `last_measured` object. */
const M4_LINE =
  '      "last_measured": { "value": 5, "at": "2026-10-04T00:00:00.000Z", "commit": "abc1234", "cost_ms": 12, "sample_n": 4, "source_run": { "run_id": "9", "chain": "sources", "event": "golden_capture" } },';

describe('capture-step-golden → measured.json sidecar (CJS)', () => {
  // RED today because … `measuredFromCapture` does not exist on the harness export surface.
  it('M1 measuredFromCapture — folds the audit rows for the entries that ran, skips validate_only', () => {
    expect(cap.measuredFromCapture(doc(), desc(), AT)).toEqual({
      inv_a: { value: 5, cost_ms: 12, at: AT, commit: 'abc1234', run_id: null, chain: 'sources' },
      pl_c: { value: 0.5, cost_ms: null, at: AT, commit: 'abc1234', run_id: null, chain: 'sources' },
    });
    const withRuns = { ...doc(), pipeline_runs: [{ id: 7 }, { id: 9 }], chain: 'none' };
    const measured = cap.measuredFromCapture(withRuns, desc(), AT);
    expect(measured.inv_a?.run_id).toBe('9');
    expect(measured.inv_a?.chain).toBeNull();
  });

  // RED today because … `mergeMeasured` does not exist on the harness export surface.
  it('M2 mergeMeasured — the latest capture wins and sample_n counts the captures folded in', () => {
    expect(
      cap.mergeMeasured(
        {
          entries: {
            inv_a: { value: 1, cost_ms: 3, at: 'old', commit: 'old', run_id: null, chain: null, sample_n: 2 },
            other: { value: 9, sample_n: 1 },
          },
        },
        { inv_a: { value: 5, cost_ms: 12, at: AT, commit: 'abc1234', run_id: null, chain: 'sources' } },
      ),
    ).toEqual({
      entries: {
        inv_a: { value: 5, cost_ms: 12, at: AT, commit: 'abc1234', run_id: null, chain: 'sources', sample_n: 3 },
        other: { value: 9, sample_n: 1 },
      },
    });
    expect(cap.mergeMeasured(null, { x: { value: 1 } }).entries.x?.sample_n).toBe(1);
  });

  // RED today because … `measuredPathFor` does not exist on the harness export surface.
  it('M3 measuredPathFor — the sidecar lives beside the slug golden directory', () => {
    expect(cap.measuredPathFor('load_ravines').replace(/\\/g, '/')).toMatch(
      /docs\/reports\/golden\/load_ravines\/measured\.json$/,
    );
  });
});

describe('generate-last-measured.mjs → descriptor last_measured (ESM, --check)', () => {
  // RED today because … scripts/analysis/generate-last-measured.mjs does not exist (dynamic import throws).
  it('M4 surgical replace — only the inv_a last_measured line moves, every other byte is untouched', async () => {
    const gen = await loadGen();
    const res = gen.applyMeasuredText(ONE_LINE, M4_ENTRIES);
    expect(res.changed).toEqual(['inv_a']);
    const parsed = JSON.parse(res.text) as {
      checks: unknown[];
      invariants: Array<{ last_measured: unknown }>;
    };
    expect(parsed.invariants[0]?.last_measured).toEqual({
      value: 5,
      at: AT,
      commit: 'abc1234',
      cost_ms: 12,
      sample_n: 4,
      source_run: { run_id: '9', chain: 'sources', event: 'golden_capture' },
    });
    expect(parsed.checks[0]).toEqual({ id: 'inv_a', last_measured_note: 'a check with the same id' });
    expect(res.text).toContain(M4_LINE);
    const before = ONE_LINE.split('\n');
    const after = res.text.split('\n');
    expect(after.length).toBe(before.length);
    after.forEach((line, i) => {
      if (line === M4_LINE) return;
      expect(line).toBe(before[i]);
    });
  });

  // RED today because … the generator module does not exist, so there is no unsourced/missing reporting.
  it('M5 unsourced / missing — a hand-written last_measured with no sidecar entry is reported, never silently kept', async () => {
    const gen = await loadGen();
    const res = gen.applyMeasuredText(ONE_LINE, M4_ENTRIES);
    expect(res.unsourced).toEqual(['pl_b']);
    expect(res.missing).toEqual(['pl_d']);
    expect(res.text).toContain('    { "id": "pl_d", "sql": "SELECT 2" }');
  });

  // RED today because … the generator module does not exist, so there is no --check no-op / hand-edit detection.
  it('M6 --check — a regenerate of a generated file is a no-op, a hand edit of the value goes RED', async () => {
    const gen = await loadGen();
    const first = gen.applyMeasuredText(ONE_LINE, M4_ENTRIES);
    const again = gen.applyMeasuredText(first.text, M4_ENTRIES);
    expect(again.changed).toEqual([]);
    expect(again.text).toBe(first.text);
    const edited = first.text.replace('"value": 5,', '"value": 6,');
    expect(edited).not.toBe(first.text);
    const repaired = gen.applyMeasuredText(edited, M4_ENTRIES);
    expect(repaired.changed).toEqual(['inv_a']);
    expect(repaired.text).toBe(first.text);
  });

  // RED today because … the generator module does not exist, so a non-finite cost_ms is not reported as skipped.
  it('M7 skipped — an entry whose measured cost_ms is not finite never gets a last_measured', async () => {
    const gen = await loadGen();
    const res = gen.applyMeasuredText(ONE_LINE, {
      inv_a: { value: 5, cost_ms: null, at: AT, commit: 'c', run_id: null, chain: null, sample_n: 1 },
    });
    expect(res.skipped).toEqual(['inv_a']);
    expect(res.changed).toEqual([]);
    expect(res.text).toBe(ONE_LINE);
  });

  // RED before R1 (2026-10-06) because … lastMeasuredFromSidecar hard-codes event 'golden_capture', so a
  // measured-validate.json entry (step-validate --write) would be relabelled as a golden capture.
  it('M11 provenance — a sidecar entry carrying its own event keeps it; an entry without one is a golden_capture', async () => {
    const gen = await loadGen();
    const base = { value: 0, cost_ms: 21095, at: AT, commit: 'abc1234', run_id: null, chain: null, sample_n: 1 };
    expect(gen.lastMeasuredFromSidecar({ ...base, event: 'step_validate_write' })).toEqual({
      value: 0,
      at: AT,
      commit: 'abc1234',
      cost_ms: 21095,
      sample_n: 1,
      source_run: { run_id: null, chain: null, event: 'step_validate_write' },
    });
    expect((gen.lastMeasuredFromSidecar(base) as { source_run: { event: string } }).source_run.event).toBe('golden_capture');
  });

  // RED today because … the generator module does not exist, so a pretty file is not re-serialised as a whole.
  it('M8 stringify-identical file — a pretty-printed file is re-serialised, not surgically line-edited', async () => {
    const gen = await loadGen();
    const pretty = JSON.stringify(JSON.parse(ONE_LINE), null, 2) + '\n';
    const res = gen.applyMeasuredText(pretty, M4_ENTRIES);
    const parsed = JSON.parse(res.text) as { invariants: Array<{ last_measured: { value: number } }> };
    expect(res.text).toBe(JSON.stringify(JSON.parse(res.text), null, 2) + '\n');
    expect(parsed.invariants[0]?.last_measured?.value).toBe(5);
  });
});

describe('wiring + fingerprint neutrality', () => {
  // RED today because … main() writes the golden but never folds the run into measured.json.
  it('M9 harness wiring (structural lock) — main() folds the capture into the sidecar AFTER writing the golden', () => {
    const src = readFileSync(join(process.cwd(), 'scripts/analysis/capture-step-golden.js'), 'utf8');
    const mainStart = src.indexOf('async function main(');
    expect(mainStart).toBeGreaterThan(-1);
    const writeAt = src.indexOf("fs.writeFileSync(outPath, JSON.stringify(doc, null, 2) + '\\n');", mainStart);
    expect(writeAt).toBeGreaterThan(-1);
    const tail = src.slice(writeAt);
    for (const call of ['measuredFromCapture(', 'mergeMeasured(', 'measuredPathFor(']) {
      expect(tail, `main() must call ${call} after writing the golden`).toContain(call);
    }
  });

  // RED today because … applyMeasuredText does not exist, so there is no re-timed output to compare against.
  it('M10 fingerprint neutrality (GREEN control) — last_measured is outside source_fingerprint', async () => {
    const gen = await loadGen();
    const res = gen.applyMeasuredText(ONE_LINE, M4_ENTRIES);
    expect(cap.stripLastMeasuredForFingerprint(res.text)).toBe(cap.stripLastMeasuredForFingerprint(ONE_LINE));
  });
});

// Operator R1 (2026-10-06), MQ-A3 (a): "validate_only entries keep `step-validate --write` as their source".
// The runner's run-end hook never fires a validate_only entry (scripts/lib/step/index.js), so the capture
// sidecar can never carry one; step-validate --write executes them and folds them into the second input.
describe('step-validate --write → measured-validate.json (R1 writer)', () => {
  type Fold = (
    existing: unknown,
    results: unknown[],
    meta: { at: string; commit: string },
  ) => { measured: Record<string, MeasuredEntry>; doc: { entries: Record<string, MeasuredEntry> } };

  // RED before R1 because … step-validate.mjs exports no foldValidateOnlyMeasured (the second input had no writer).
  it('M12 writer — a measured validate_only entry is folded; every_run, errored and untimed entries are not', async () => {
    const sv = (await import(pathToFileURL(join(process.cwd(), 'scripts/analysis/step-validate.mjs')).href)) as {
      foldValidateOnlyMeasured?: Fold;
    };
    expect(typeof sv.foldValidateOnlyMeasured).toBe('function');
    const fold = sv.foldValidateOnlyMeasured as Fold;
    const results = [
      { id: 'vo_a', source: 'invariant', frequency: 'validate_only', status: 'ok', value: 61560, duration_ms: 21095 },
      { id: 'er_b', source: 'invariant', frequency: 'every_run', status: 'ok', value: 3, duration_ms: 40 },
      { id: 'vo_err', source: 'invariant', frequency: 'validate_only', status: 'ERROR', detail: 'boom', duration_ms: 5 },
      { id: 'vo_untimed', source: 'plausibility', frequency: 'validate_only', status: 'ok', value: 1 },
    ];
    const existing = {
      entries: {
        vo_a: { value: 1, cost_ms: 9, at: 'x', commit: 'y', run_id: null, chain: null, event: 'step_validate_write', sample_n: 2 },
        keep: { value: 7, sample_n: 1 },
      },
    };
    const out = fold(existing, results, { at: AT, commit: 'abc1234' });
    expect(Object.keys(out.measured)).toEqual(['vo_a']);
    expect(out.doc.entries.vo_a).toEqual({
      value: 61560,
      cost_ms: 21095,
      at: AT,
      commit: 'abc1234',
      run_id: null,
      chain: null,
      event: 'step_validate_write',
      sample_n: 3,
    });
    expect(out.doc.entries).not.toHaveProperty('er_b');
    expect(out.doc.entries).not.toHaveProperty('vo_err');
    expect(out.doc.entries).not.toHaveProperty('vo_untimed');
    expect(out.doc.entries.keep).toEqual({ value: 7, sample_n: 1 });
    expect(fold(null, results, { at: AT, commit: 'abc1234' }).doc.entries.vo_a?.sample_n).toBe(1);
  });

  // RED before R1 because … runDataValidatorsForWrite neither keeps duration_ms nor writes measured-validate.json.
  it('M13 wiring (structural lock) — runDataValidatorsForWrite keeps duration_ms and writes measured-validate.json via the fold', () => {
    const src = readFileSync(join(process.cwd(), 'scripts/analysis/step-validate.mjs'), 'utf8');
    const start = src.indexOf('async function runDataValidatorsForWrite(');
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf('\n}\n', start));
    for (const s of ['duration_ms', 'foldValidateOnlyMeasured(', "'measured-validate.json'", 'writeFileSync(']) {
      expect(body, `runDataValidatorsForWrite must contain ${s}`).toContain(s);
    }
  });
});
