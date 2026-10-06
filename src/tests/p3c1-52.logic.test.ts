// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.4 (checks[].when); registry-truth plan Phase 3 → E #52 (PLAN :240); fold 19 MQ-A1 (a) + compliance amendment; FLEET-2 A-2
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const verdict = require(join(process.cwd(), 'scripts/lib/step/verdict.js')) as {
  buildAuditTable: (...a: unknown[]) => { rows: Array<Record<string, unknown>> };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const stepLib = require(join(process.cwd(), 'scripts/lib/step/index.js')) as {
  makePreWriteGate: (opts: Record<string, unknown>) => ((phaseState: Record<string, unknown>) => Promise<Record<string, unknown>>) | null;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const pipeline = require(join(process.cwd(), 'scripts/lib/pipeline.js')) as {
  step: (d: unknown, c: unknown) => { run: (opts: Record<string, unknown>) => Promise<Record<string, unknown>> };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real step descriptor
const LN = require(join(process.cwd(), 'scripts/link-neighbourhoods.descriptor.json')) as Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real step compute
const lnCompute = require(join(process.cwd(), 'scripts/lib/compute/link-neighbourhoods.js')) as unknown;

type FxDescriptor = {
  identity: { name: string; display_name: string };
  checks: Array<{ id: string; when: string; severity: string; limit: string; chains: string }>;
};

/** The fixture descriptor: exactly one pre_write check (`pw`) and one post check (`po`). */
function fx(): FxDescriptor {
  return {
    identity: { name: 'fixture_when', display_name: 'Fixture When' },
    checks: [
      { id: 'pw', when: 'pre_write', severity: 'FAIL', limit: 'viol == 0', chains: 'all' },
      { id: 'po', when: 'post', severity: 'WARN', limit: 'viol == 0', chains: 'all' },
    ],
  };
}

/** A gate-usable stepCtx whose `checks` list is the fixture's own check ids. */
function ctxFor(d: FxDescriptor): Record<string, unknown> {
  return {
    pool: null,
    chainId: null,
    runId: 1,
    descriptor: d,
    checks: d.checks.map((c) => c.id),
    log: { info() {}, warn() {}, error() {} },
    clock: () => 0,
    config: {},
    acquired: null,
    written: null,
    prior: null,
    overrides: null,
    gate: null,
    report: () => {},
  };
}

// ── W1..W6: the library contract, in isolation ─────────────────────────────────
describe('P3C1-#52 — checks[].when observation stamping (buildAuditTable + makePreWriteGate)', () => {
  it('W1 — buildAuditTable stamps checks[] + synthetic rows with observedFor, and never extraRows', () => {
    // RED today: buildAuditTable takes no 8th `observedFor` argument, so no row carries `observed`.
    const built = verdict.buildAuditTable(
      fx(),
      null,
      { pw: { violations: 0 }, po: { violations: 0 } },
      [{ metric: 'extra', value: 1, threshold: null, status: 'INFO' }],
      null,
      null,
      null,
      (id: string) => (id === 'pw' ? 'before_write' : 'after_write'),
    );
    const rows = built.rows;
    const pw = rows.find((r) => r.metric === 'pw');
    const po = rows.find((r) => r.metric === 'po');
    const extra = rows.find((r) => r.metric === 'extra');
    expect(pw).toBeDefined();
    expect(po).toBeDefined();
    expect(extra).toBeDefined();
    expect(pw && pw.observed).toBe('before_write');
    expect(po && po.observed).toBe('after_write');
    expect(extra && Object.prototype.hasOwnProperty.call(extra, 'observed')).toBe(false);
  });

  it('W2 — GREEN control: with observedFor null no row carries an observed property', () => {
    const built = verdict.buildAuditTable(
      fx(),
      null,
      { pw: { violations: 0 }, po: { violations: 0 } },
      [{ metric: 'extra', value: 1, threshold: null, status: 'INFO' }],
      null,
      null,
      null,
    );
    for (const row of built.rows) {
      expect(Object.prototype.hasOwnProperty.call(row, 'observed')).toBe(false);
    }
  });

  it('W3 — makePreWriteGate records each observed gated check into the sink', async () => {
    // RED today: makePreWriteGate ignores any `sink` option, so the sink stays empty.
    const sink: Record<string, unknown> = {};
    const gate = stepLib.makePreWriteGate({
      descriptor: fx(),
      chainId: null,
      stepCtx: ctxFor(fx()),
      compute: async (ctx: Record<string, unknown>) => {
        (ctx.report as (id: string, obs: unknown) => void)('pw', { violations: 0, detail: 'gate' });
      },
      config: {},
      sink,
    });
    await gate!({ acquired: {}, prior: null, overrides: {} });
    expect(sink).toEqual({ pw: { violations: 0, detail: 'gate' } });
  });

  it('W4 — the worst lane wins: higher severity rank, then larger magnitude', async () => {
    // RED today: no sink at all; and once wired, the fold-19 rule keeps the worst observation.
    const sink: Record<string, unknown> = {};
    const gate = stepLib.makePreWriteGate({
      descriptor: fx(),
      chainId: null,
      stepCtx: ctxFor(fx()),
      compute: async (ctx: Record<string, unknown>) => {
        const primary = ctx.primary as string;
        const n = primary === 'a' ? 0 : primary === 'b' ? 3 : 1;
        (ctx.report as (id: string, obs: unknown) => void)('pw', { violations: n, detail: `lane${n}` });
      },
      config: {},
      sink,
    });
    await gate!({ acquired: {}, prior: null, overrides: {}, primary: 'a' });
    await gate!({ acquired: {}, prior: null, overrides: {}, primary: 'b' });
    await gate!({ acquired: {}, prior: null, overrides: {}, primary: 'c' });
    expect(sink.pw).toEqual({ violations: 3, detail: 'lane3' });
  });

  it('W5 — GREEN control: the gate decision object is unchanged ({abort, failed})', async () => {
    const sink: Record<string, unknown> = {};
    const gate = stepLib.makePreWriteGate({
      descriptor: fx(),
      chainId: null,
      stepCtx: ctxFor(fx()),
      compute: async (ctx: Record<string, unknown>) => {
        (ctx.report as (id: string, obs: unknown) => void)('pw', { violations: 0, detail: 'gate' });
      },
      config: {},
      sink,
    });
    const decision = await gate!({ acquired: {}, prior: null, overrides: {} });
    expect(decision).toEqual({ abort: false, failed: [] });
  });

  it('W6 — structural lock: runWithPool wires the sink into every gate and re-stamps observations', () => {
    // RED today: runWithPool neither declares preWriteObserved nor passes observedFor.
    const src = readFileSync(join(process.cwd(), 'scripts/lib/step/index.js'), 'utf8');
    const start = src.indexOf('async function runWithPool(');
    expect(start).toBeGreaterThan(-1);
    const rest = src.slice(start);
    const endCandidates = [rest.indexOf('\nasync function ', 1), rest.indexOf('\nfunction ', 1)].filter((i) => i > 0);
    const end = endCandidates.length > 0 ? Math.min(...endCandidates) : rest.length;
    const slice = rest.slice(0, end);

    expect(slice).toContain('const preWriteObserved = Object.create(null);');
    const gateCalls = slice.split('makePreWriteGate({').length - 1;
    const sinkPasses = slice.split('sink: preWriteObserved').length - 1;
    expect(gateCalls).toBe(sinkPasses);
    expect(gateCalls).toBeGreaterThanOrEqual(9);
    const computeAt = slice.indexOf('runnable.compute(stepCtx)');
    const mergeAt = slice.indexOf('for (const id of Object.keys(preWriteObserved)) observations[id] = preWriteObserved[id];');
    expect(computeAt).toBeGreaterThan(-1);
    expect(mergeAt).toBeGreaterThan(computeAt);
    expect(slice).toContain('buildAuditTable(descriptor, chainId, observations, extraRows, configValues, onlyChecks, synthetic, observedFor)');
  });
});

// ── W7: end-to-end on the real descriptor + real compute ───────────────────────
type Answer = { rows: unknown[]; rowCount?: number };

/** Every declared logic variable, seeded at its declared `min`. */
function seededVars(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const v of ((LN.config as { logic_variables: Array<{ name: string; min?: number }> }).logic_variables)) {
    out[v.name] = v.min ?? 0;
  }
  return out;
}

/** A row whose every property reads 0. */
const zeroRow = (): Answer => ({
  rows: [new Proxy({}, { get: (_t, k) => (typeof k === 'string' && k !== 'then' && k !== 'toJSON' ? 0 : undefined) })],
  rowCount: 0,
});

/** The recording fake pool of the witness fixture, WITHOUT the guard wrapper. */
function recordingPool(stepAnswer: (text: string, values: unknown[]) => Answer | null, fallback: () => Answer) {
  const sql: string[] = [];
  const logicVars = seededVars();
  const answer = (text: string, values: unknown[]): Answer => {
    const own = stepAnswer(text, values);
    if (own) return own;
    if (text.includes('current_database()')) return { rows: [{ database: 'postgres', db_user: 'postgres', has_tracking: true }] };
    if (text.includes('FROM logic_variables')) {
      return { rows: Object.entries(logicVars).map(([variable_key, variable_value]) => ({ variable_key, variable_value, variable_value_json: null })) };
    }
    if (text.includes('FROM public.schema_migrations')) return { rows: [{ n: 999 }] };
    if (text.includes('pg_try_advisory_xact_lock')) return { rows: [{ acquired: true }] };
    if (text.startsWith('INSERT INTO pipeline_runs')) return { rows: [{ id: 4242 }] };
    if (/SELECT NOW\(\)/i.test(text)) return { rows: [{ now: new Date('2026-09-28T00:00:00Z') }] };
    if (/^SELECT 1 FROM (pg_|information_schema)/.test(text.trim())) return { rows: [{ '?column?': 1 }] };
    return fallback();
  };
  const query = async (q: string | { text: string }, values?: unknown[]) => {
    const text = typeof q === 'string' ? q : q.text;
    if (sql.length > 2000) throw new Error('runaway statement loop');
    sql.push(text);
    return answer(text, values ?? []);
  };
  return { sql, query, connect: async () => ({ query, release: () => {} }) };
}

function silenceLogs() {
  const spies = [vi.spyOn(console, 'log').mockImplementation(() => {}), vi.spyOn(console, 'error').mockImplementation(() => {}), vi.spyOn(console, 'warn').mockImplementation(() => {})];
  return () => spies.forEach((s) => s.mockRestore());
}

describe('P3C1-#52 — W7 link_neighbourhoods end-to-end observed stamping', () => {
  it('stamps the pre_write row before_write and every post row after_write through the ONE table', async () => {
    // RED today: no `observed` key is ever emitted on audit_table.rows.
    const stepAnswer = (text: string): Answer | null => {
      if (/^SELECT COUNT\(\*\)::bigint AS n FROM \w+$/.test(text.trim())) return { rows: [{ n: '1' }] };
      if (text.includes('count(*)::int AS n FROM neighbourhoods')) return { rows: [{ n: 150 }] };
      if (/UPDATE permits/i.test(text)) return { rows: [{ permit_num: '24 100001 BLD', revision_num: '00' }], rowCount: 1 };
      return null;
    };
    const pool = recordingPool(stepAnswer, zeroRow);
    const restore = silenceLogs();
    let out: Record<string, unknown>;
    try {
      out = await pipeline.step(LN, lnCompute).run({ pool, chainId: 'sources' });
    } finally {
      restore();
    }

    const audit = (out.recordsMeta as { audit_table: { rows: Array<Record<string, unknown>> } }).audit_table;
    const rows = audit.rows;
    expect(Array.isArray(rows)).toBe(true);

    const pre = rows.find((r) => r.metric === 'neighbourhoods_loaded_before_write');
    expect(pre).toBeDefined();
    expect(pre && pre.observed).toBe('before_write');

    const postIds = ((LN.checks as Array<{ id: string; when: string }>) || []).filter((c) => c.when === 'post').map((c) => c.id);
    let foundPost = 0;
    for (const id of postIds) {
      const row = rows.find((r) => r.metric === id);
      if (row) {
        expect(row.observed).toBe('after_write');
        foundPost += 1;
      }
    }
    expect(foundPost).toBeGreaterThanOrEqual(1);
  });
});
