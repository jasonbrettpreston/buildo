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
import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, copyFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
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

  // MV-DRIFT (tooling-fix-1, operator y 2026-10-20; Spec 124 R-GP): a --write whose measured VALUES are
  // unchanged leaves measured-validate.json byte-identical — only metadata (at/commit/cost_ms/sample_n)
  // would differ, and that churn re-dirtied the file and the descriptor generated from it on every run.
  // RED before the fix because … the fold re-stamps every executed entry whatever its value.
  const foldOf = async (): Promise<Fold> => {
    const sv = (await import(pathToFileURL(join(process.cwd(), 'scripts/analysis/step-validate.mjs')).href)) as { foldValidateOnlyMeasured: Fold };
    return sv.foldValidateOnlyMeasured;
  };
  const writeOf = (doc: unknown): string => `${JSON.stringify(doc, null, 2)}\n`;
  const vo = (id: string, value: unknown, duration_ms: number) => ({ id, source: 'invariant', frequency: 'validate_only', status: 'ok', value, duration_ms });

  it('M14 RED-first — two --write runs with unchanged values: the second folds nothing and the bytes are identical', async () => {
    const fold = await foldOf();
    const first = fold(null, [vo('vo_a', 61571, 3314), vo('vo_b', 0, 10314)], { at: AT, commit: 'aaaaaaa' });
    const text1 = writeOf(first.doc);
    const second = fold(JSON.parse(text1), [vo('vo_a', 61571, 2999), vo('vo_b', 0, 9001)], { at: '2026-10-20T02:04:28.378Z', commit: 'bbbbbbb' });
    expect(Object.keys(second.measured)).toEqual([]);
    expect(writeOf(second.doc)).toBe(text1);
  });

  it('M15 — a changed value DOES rewrite that entry (new at/commit/cost_ms, sample_n + 1); an unchanged sibling keeps its bytes', async () => {
    const fold = await foldOf();
    const first = fold(null, [vo('vo_a', 61571, 3314), vo('vo_b', 0, 10314)], { at: AT, commit: 'aaaaaaa' });
    const at2 = '2026-10-20T02:04:28.378Z';
    const second = fold(JSON.parse(writeOf(first.doc)), [vo('vo_a', 61572, 2999), vo('vo_b', 0, 9001)], { at: at2, commit: 'bbbbbbb' });
    expect(Object.keys(second.measured)).toEqual(['vo_a']);
    expect(second.doc.entries.vo_a).toMatchObject({ value: 61572, cost_ms: 2999, at: at2, commit: 'bbbbbbb', sample_n: 2 });
    expect(second.doc.entries.vo_b).toEqual(first.doc.entries.vo_b);
    // A value that changes TYPE but not JSON-equality (none here) is the same value; null -> 0 is a change.
    const third = fold(second.doc, [vo('vo_b', null, 1)], { at: at2, commit: 'ccccccc' });
    expect(Object.keys(third.measured)).toEqual(['vo_b']);
  });

  it('M16 wiring (structural lock) — the writer writes only when the fold reports a changed entry', () => {
    const src = readFileSync(join(process.cwd(), 'scripts/analysis/step-validate.mjs'), 'utf8');
    const start = src.indexOf('async function runDataValidatorsForWrite(');
    const body = src.slice(start, src.indexOf('\n}\n', start));
    const guard = body.indexOf('if (slug && n > 0)');
    expect(guard).toBeGreaterThan(-1);
    expect(body.indexOf('writeFileSync(sidecarPath', guard)).toBeGreaterThan(guard);
    expect(body.split('writeFileSync(sidecarPath').length - 1).toBe(1);
  });
});

// R-GQ (tooling-fix-1 follow-on, operator y 2026-10-20 "a & b y"): generate-last-measured.mjs --check runs
// at pre-commit (R-DJ (1)) against a CLOSED, SHRINK-ONLY baseline of the 84 entries that were stale when it
// was wired, each waiting for REFREEZE-BUNDLE-1. RED before R-GQ because … the generator exports no
// staleEntries / baselineDecision, and its --check is RED on any stale entry at all.
describe('generate-last-measured --check stale baseline (R-GQ)', () => {
  type Entry = { step: string; key: string; pin?: string };
  type Decision = { pass: boolean; problems: string[]; fresh: Array<{ step: string; key: string }> };
  const load = async () => (await import(pathToFileURL(join(process.cwd(), 'scripts/analysis/generate-last-measured.mjs')).href)) as {
    staleEntries?: (report: unknown[]) => Entry[];
    baselineDecision?: (stale: Entry[], baseline: unknown) => Decision;
    run: (o: { check?: boolean; dryRun?: boolean; log?: (s: string) => void }) => { red: boolean; report: unknown[] };
    BASELINE_REL_PATH?: string;
  };
  const PIN = 'REFREEZE-BUNDLE-1';
  const base = (rows: Entry[]) => ({ entries: rows });

  it('B1 GREEN — exactly the listed stale entries, each citing REFREEZE-BUNDLE-1, pass', async () => {
    const g = await load();
    expect(typeof g.baselineDecision).toBe('function');
    const d = g.baselineDecision!([{ step: 's', key: 'a' }], base([{ step: 's', key: 'a', pin: PIN }]));
    expect(d).toEqual({ pass: true, problems: [], fresh: [] });
  });

  it('B2 RED — a NEW stale entry not on the list fails (the baseline never grows)', async () => {
    const g = await load();
    const d = g.baselineDecision!([{ step: 's', key: 'a' }, { step: 's', key: 'b' }], base([{ step: 's', key: 'a', pin: PIN }]));
    expect(d.pass).toBe(false);
    expect(d.problems.join('\n')).toContain('NEW stale last_measured s.b');
  });

  it('B3 RED — a listed entry that is fresh now must leave the list (shrink-only, R-X orphan)', async () => {
    const g = await load();
    const d = g.baselineDecision!([], base([{ step: 's', key: 'a', pin: PIN }]));
    expect(d.pass).toBe(false);
    expect(d.fresh).toEqual([{ step: 's', key: 'a' }]);
  });

  it('B4 RED — an entry without the REFREEZE-BUNDLE-1 citation, a duplicate, or a missing file fails', async () => {
    const g = await load();
    expect(g.baselineDecision!([{ step: 's', key: 'a' }], base([{ step: 's', key: 'a' }])).pass).toBe(false);
    expect(g.baselineDecision!([{ step: 's', key: 'a' }], base([{ step: 's', key: 'a', pin: PIN }, { step: 's', key: 'a', pin: PIN }])).pass).toBe(false);
    expect(g.baselineDecision!([], null).pass).toBe(false);
  });

  it('B5 staleEntries — one {step, key} per changed id, deduplicated and sorted', async () => {
    const g = await load();
    expect(g.staleEntries!([{ slug: 'b', changed: ['y', 'x', 'x'] }, { slug: 'a', changed: ['z'] }]))
      .toEqual([{ step: 'a', key: 'z' }, { step: 'b', key: 'x' }, { step: 'b', key: 'y' }]);
  });

  it('B6 LIVE — the committed baseline lists exactly the live stale set (84 at R-GQ, shrink-only) and --check is GREEN', async () => {
    const g = await load();
    const baseline = JSON.parse(readFileSync(join(process.cwd(), g.BASELINE_REL_PATH ?? 'missing'), 'utf8')) as { entries: Entry[] };
    expect(baseline.entries.length).toBeLessThanOrEqual(84);
    expect(baseline.entries.every((e) => e.pin === PIN)).toBe(true);
    const out = g.run({ check: true, log: () => {} });
    expect(out.red).toBe(false);
  });
});

// verify-12 follow-up (operator y 2026-10-20, Spec 124 R-GQ): the baseline is a TRUE shrink-only set — the
// current entries must be a subset (by step + key) of the committed previous baseline, so an entry can be
// neither swapped for another nor re-added once removed (the R-DW / R-EB high-water-mark posture).
// RED before because … the only lock was `entries.length <= 84` and no shrink predicate existed.
describe('R-GQ baseline is shrink-only against the committed previous baseline', () => {
  type Entry = { step: string; key: string; pin?: string };
  const load = async () => (await import(pathToFileURL(join(process.cwd(), 'scripts/analysis/generate-last-measured.mjs')).href)) as {
    baselineShrinkFindings?: (current: unknown, previous: unknown) => string[];
    BASELINE_REL_PATH: string;
  };
  const doc = (rows: Array<[string, string]>) => ({ entries: rows.map(([step, key]) => ({ step, key, pin: 'REFREEZE-BUNDLE-1' })) });

  it('S1 GREEN — an unchanged or shrunk baseline passes; no committed previous baseline is vacuous', async () => {
    const g = await load();
    expect(typeof g.baselineShrinkFindings).toBe('function');
    expect(g.baselineShrinkFindings!(doc([['s', 'a'], ['s', 'b']]), doc([['s', 'a'], ['s', 'b']]))).toEqual([]);
    expect(g.baselineShrinkFindings!(doc([['s', 'a']]), doc([['s', 'a'], ['s', 'b']]))).toEqual([]);
    expect(g.baselineShrinkFindings!(doc([['s', 'a']]), null)).toEqual([]);
  });

  it('S2 RED — a swapped entry (same count) and a re-added entry both fail, naming step.key', async () => {
    const g = await load();
    const swapped = g.baselineShrinkFindings!(doc([['s', 'a'], ['t', 'z']]), doc([['s', 'a'], ['s', 'b']]));
    expect(swapped.join('\n')).toContain('t.z');
    const readded = g.baselineShrinkFindings!(doc([['s', 'a'], ['s', 'b']]), doc([['s', 'a']]));
    expect(readded.join('\n')).toContain('s.b');
  });

  it('S3 LIVE — the working baseline is a subset of HEAD\'s and of the one R-GQ first committed', async () => {
    const g = await load();
    const git = (args: string[]) => spawnSync('git', args, { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const current = JSON.parse(readFileSync(join(process.cwd(), g.BASELINE_REL_PATH), 'utf8')) as { entries: Entry[] };
    const first = git(['log', '--format=%H', '--diff-filter=A', '--', g.BASELINE_REL_PATH]).stdout.trim().split('\n').pop() ?? '';
    // A merge commit that brings the baseline in (integrate-12) has no HEAD copy yet: compare against the merged
    // branch's copy (MERGE_HEAD) instead, so the arm is never vacuous.
    const headHas = git(['cat-file', '-e', `HEAD:${g.BASELINE_REL_PATH}`]).status === 0;
    const headRev = headHas ? 'HEAD' : 'MERGE_HEAD';
    for (const rev of [headRev, first]) {
      const res = git(['show', `${rev}:${g.BASELINE_REL_PATH}`]);
      expect(res.status, `git show ${rev}`).toBe(0);
      expect(g.baselineShrinkFindings!(current, JSON.parse(res.stdout))).toEqual([]);
    }
  });
});

// verify-12 follow-up (operator y 2026-10-20): the generator WRITES only on an explicit --write; --help prints
// usage and writes nothing; an unknown flag or no flag exits non-zero with usage and writes nothing (a
// verifier's `--help` used to fall through to WRITE and rewrote 17 descriptors).
// RED before because … any argv without --check/--shrink-baseline ran the write path.
describe('generate-last-measured CLI — write is explicit', () => {
  // integrate-12 (verify-12h B note): the CLI runs against a TEMP COPY of its inputs (the generator, every descriptor,
  // every golden measured*.json, the stale baseline), never the live tree, so a regression that falls through to WRITE
  // rewrites only the copy. The copy carries the 84 real stale entries, so a fall-through write would change its bytes.
  const live = process.cwd();
  const root = mkdtempSync(join(tmpdir(), 'lm-cli-'));
  const copy = (rel: string) => { mkdirSync(join(root, rel, '..'), { recursive: true }); copyFileSync(join(live, rel), join(root, rel)); };
  copy('scripts/analysis/generate-last-measured.mjs');
  copy('scripts/steps/_schema/last-measured-stale-baseline.json');
  for (const dir of ['scripts', 'scripts/quality']) {
    for (const f of readdirSync(join(live, dir)).filter((n: string) => n.endsWith('.descriptor.json'))) copy(`${dir}/${f}`);
  }
  for (const slug of readdirSync(join(live, 'docs/reports/golden'))) {
    for (const f of ['measured.json', 'measured-validate.json']) if (existsSync(join(live, 'docs/reports/golden', slug, f))) copy(`docs/reports/golden/${slug}/${f}`);
  }
  // REFREEZE-BUNDLE-1 night 1 (item (7), R-GQ): the live tree has no stale entry left (baseline 84 -> 0), so the copy
  // gets ONE: the first measured sidecar entry with a numeric value is bumped by 1 in the copy only.
  (() => {
    for (const slug of readdirSync(join(root, 'docs/reports/golden')).sort()) {
      const f = join(root, 'docs/reports/golden', slug, 'measured.json');
      if (!existsSync(f)) continue;
      const doc = JSON.parse(readFileSync(f, 'utf8')) as { entries?: Record<string, { value?: unknown }> };
      const hit = Object.values(doc.entries ?? {}).find((e) => typeof e.value === 'number');
      if (!hit) continue;
      hit.value = (hit.value as number) + 1;
      writeFileSync(f, JSON.stringify(doc, null, 2) + '\n');
      return;
    }
    throw new Error('no numeric measured sidecar entry to perturb');
  })();
  const descriptorBytes = (): string => {
    const out: string[] = [];
    for (const dir of ['scripts', 'scripts/quality']) {
      for (const f of readdirSync(join(root, dir)).filter((n: string) => n.endsWith('.descriptor.json')).sort()) {
        out.push(readFileSync(join(root, dir, f), 'utf8'));
      }
    }
    return out.join('\u0000');
  };
  const cli = (args: string[]) => {
    return spawnSync(process.execPath, ['scripts/analysis/generate-last-measured.mjs', ...args], { cwd: root, encoding: 'utf8' });
  };

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('C0 the temp copy is a faithful fixture: --check there sees the same stale entries as the live tree', () => {
    const r = cli(['--check']);
    expect(`${r.stdout}`).toMatch(/changed [1-9][0-9]*/);
  });

  it('C1 --help prints usage, exits 0, writes nothing', () => {
    const before = descriptorBytes();
    const r = cli(['--help']);
    expect(r.status).toBe(0);
    expect(`${r.stdout}${r.stderr}`).toMatch(/usage/i);
    expect(descriptorBytes()).toBe(before);
  });

  it('C2 RED — an unknown flag exits non-zero with usage and writes nothing', () => {
    const before = descriptorBytes();
    const r = cli(['--frobnicate']);
    expect(r.status).not.toBe(0);
    expect(`${r.stdout}${r.stderr}`).toMatch(/usage/i);
    expect(descriptorBytes()).toBe(before);
  });

  it('C3 RED — no flag exits non-zero with usage and writes nothing', () => {
    const before = descriptorBytes();
    const r = cli([]);
    expect(r.status).not.toBe(0);
    expect(descriptorBytes()).toBe(before);
  });
});
