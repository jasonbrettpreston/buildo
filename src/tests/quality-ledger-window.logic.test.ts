// 🔗 SPEC LINK: docs/specs/01-pipeline/120_pipeline_step_runner.md §9.3 ① (strand factories)
// 🔗 SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §R12
//
// P3 strand-window fix (2026-08-24). THE CORRECTED PREMISE, stated up front so a
// future reader does not re-inherit the refuted one:
//
//   Spec 120 §9.3 ① claimed the three quality asserts "strand a `running` row on
//   ANY throw". EXECUTED against the files, that is FALSE. All three wrap their
//   whole check body in an outer try/catch (assert-schema.js `:289…:449`,
//   assert-data-bounds.js `:113…:957`, assert-engine-health.js `:60…:182`) that
//   converts every provokable throw into an `errors.push`, and each script's
//   terminal `throw` fires AFTER its finalize UPDATE has already written
//   status='failed'. The 8 throws the claim counted are all INSIDE that catch.
//
// What IS real, and what this fix closes:
//   (a) the region between the outer catch and the finalize UPDATE (audit-table
//       assembly + JSON.stringify) is NOT inside any try — a throw there strands;
//   (b) the finalize UPDATE itself is `.catch`-warned, so a failed UPDATE leaves
//       the row 'running' with only a log line;
//   (c) process death (SIGKILL, the GH step-timeout kill, OOM, runner cancel)
//       anywhere in the window.
//
// (a) and (b) are what a `finally` closes. (c) it CANNOT — no JS handler runs on
// SIGKILL; that stays reaper/reconcile work (B6.6). The deliverable is precisely:
// any THROWN error inside the window still finalizes the row.
//
// Scope note: `runId` is non-null ONLY on the standalone path (`!CHAIN_ID`) — in a
// chain, run-chain.js owns the row. So this window is a standalone-invocation
// defect, which is why it survived every chain run.
//
// Run: npx vitest run src/tests/quality-ledger-window.logic.test.ts

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

/** The pg-Pool surface this helper touches — nothing else. */
interface QueryablePool {
  query: (sql: string, params: unknown[]) => Promise<unknown>;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ledgerWindow = require('../../scripts/lib/ledger-window.js') as {
  finalizeStrandedRun: (
    pool: QueryablePool,
    opts: {
      runId: number | null | undefined;
      finalized: boolean;
      slug: string;
      durationMs: number;
      error: unknown;
      log?: { warn: (tag: string, msg: string, ctx?: unknown) => void };
    },
  ) => Promise<boolean>;
  shouldFinalizeStranded: (o: { runId: number | null | undefined; finalized: boolean }) => boolean;
  strandErrorMessage: (error: unknown) => string;
};

const { finalizeStrandedRun, shouldFinalizeStranded, strandErrorMessage } = ledgerWindow;

/** Minimal pg-Pool double — only `query` is exercised. */
function fakePool(impl?: (sql: string, params: unknown[]) => unknown) {
  const query = vi.fn(async (sql: string, params: unknown[]) =>
    impl ? impl(sql, params) : { rowCount: 1, rows: [] },
  );
  return { pool: { query }, query };
}

function fakeLog() {
  return { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
}

describe('ledger-window — shouldFinalizeStranded (the decision)', () => {
  it('finalizes only when a row was actually opened AND the normal finalize did not land', () => {
    expect(shouldFinalizeStranded({ runId: 42, finalized: false })).toBe(true);
  });

  it('no row opened (chain path, or the INSERT itself failed) → nothing to finalize', () => {
    // The INSERT is deliberately left in its own try/catch: a failed INSERT must
    // not become a second failure mode. runId stays null and the window is inert.
    expect(shouldFinalizeStranded({ runId: null, finalized: false })).toBe(false);
    expect(shouldFinalizeStranded({ runId: undefined, finalized: false })).toBe(false);
  });

  it('already finalized by the normal path → the finally is a no-op (no double-write)', () => {
    expect(shouldFinalizeStranded({ runId: 42, finalized: true })).toBe(false);
  });
});

describe('ledger-window — strandErrorMessage (the row must explain itself)', () => {
  it('carries the original throw message, tagged as an unfinalized window', () => {
    const msg = strandErrorMessage(new Error('boom in the audit assembly'));
    expect(msg).toMatch(/boom in the audit assembly/);
    expect(msg).toMatch(/interrupted/i);
  });

  it('distinguishes "the finalize UPDATE never landed" from "the body threw" (no error present)', () => {
    // The finally also runs on the NORMAL path. If the normal UPDATE was
    // `.catch`-warned away, finalized stays false with no error — the row must
    // say THAT, not report a phantom throw.
    const msg = strandErrorMessage(null);
    expect(msg).toMatch(/never finalized/i);
    expect(msg).not.toMatch(/undefined|null/);
  });

  it('a non-Error throw is still stringified, never dropped', () => {
    expect(strandErrorMessage('a bare string throw')).toMatch(/a bare string throw/);
  });

  it('truncates rather than blowing the error_message column on a giant message', () => {
    const msg = strandErrorMessage(new Error('x'.repeat(50_000)));
    expect(msg.length).toBeLessThanOrEqual(2000);
  });
});

describe('ledger-window — finalizeStrandedRun (the write)', () => {
  it('writes status=failed + duration + message, guarded on the row still being running', async () => {
    const { pool, query } = fakePool();
    const ok = await finalizeStrandedRun(pool, {
      runId: 7,
      finalized: false,
      slug: 'assert-schema',
      durationMs: 1234,
      error: new Error('assembly blew up'),
      log: fakeLog(),
    });

    expect(ok).toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/UPDATE\s+pipeline_runs/i);
    expect(sql).toMatch(/status\s*=\s*'failed'/);
    // THE guard: never clobber a row some other path already finalized. This is
    // what makes the finally safe to run unconditionally.
    expect(sql).toMatch(/status\s*=\s*'running'/);
    expect(sql).toMatch(/completed_at/);
    expect(params).toContain(7);
    expect(params).toContain(1234);
    expect(String(params[2])).toMatch(/assembly blew up/);
  });

  it('is a no-op when the normal finalize already landed', async () => {
    const { pool, query } = fakePool();
    const ok = await finalizeStrandedRun(pool, {
      runId: 7, finalized: true, slug: 's', durationMs: 1, error: new Error('x'), log: fakeLog(),
    });
    expect(ok).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it('is a no-op when no row was opened', async () => {
    const { pool, query } = fakePool();
    const ok = await finalizeStrandedRun(pool, {
      runId: null, finalized: false, slug: 's', durationMs: 1, error: new Error('x'), log: fakeLog(),
    });
    expect(ok).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it('reports false (not true) when the guarded UPDATE matched nothing', async () => {
    const { pool } = fakePool(() => ({ rowCount: 0, rows: [] }));
    const ok = await finalizeStrandedRun(pool, {
      runId: 7, finalized: false, slug: 's', durationMs: 1, error: new Error('x'), log: fakeLog(),
    });
    expect(ok).toBe(false);
  });

  it('NEVER throws — a throwing finally would REPLACE the original error (the masking trap)', async () => {
    const log = fakeLog();
    const pool: QueryablePool = { query: vi.fn(async () => { throw new Error('connection terminated'); }) };
    await expect(
      finalizeStrandedRun(pool, {
        runId: 7, finalized: false, slug: 'assert-schema', durationMs: 1, error: new Error('original'), log,
      }),
    ).resolves.toBe(false);
    expect(log.warn).toHaveBeenCalled();
    expect(String(log.warn.mock.calls[0]?.[1])).toMatch(/connection terminated/);
  });

  it('tolerates a missing log (never a TypeError inside a finally)', async () => {
    const pool: QueryablePool = { query: vi.fn(async () => { throw new Error('nope'); }) };
    await expect(
      finalizeStrandedRun(pool, { runId: 7, finalized: false, slug: 's', durationMs: 1, error: null }),
    ).resolves.toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Source locks — these are what tie the mechanism above to the three scripts.
// The helper being correct proves nothing until each script actually opens the
// window. Stated ceiling: these are STATIC. They prove the shape is present,
// not that a live throw traverses it (see the .db test for that), and they
// cannot prove anything at all about SIGKILL.
// ---------------------------------------------------------------------------
// ⚠️ RE-HOMED, NOT RETIRED (pilot 1, Spec 122 §5.1). `assert-schema` used to sit in this
// list. Its conversion to the frozen 7-line shape makes an in-file window unsatisfiable —
// there is no INSERT and no `finally` left in the step file to assert on — so the library
// gained the window instead and the five source locks below follow it onto
// scripts/lib/step/index.js. Every assertion is preserved; only the file it reads moved.
const SCRIPTS: Array<[string, string]> = [
  ['assert-data-bounds', 'scripts/quality/assert-data-bounds.js'],
  ['assert-engine-health', 'scripts/quality/assert-engine-health.js'],
];

describe.each(SCRIPTS)('%s — the INSERT→finalize window is wrapped', (slug, rel) => {
  // ⚠️ CRLF normalization is load-bearing on a Windows checkout (core.autocrlf=true,
  // no .gitattributes yet — P0b item 2). JS `.` and `$` do not match past a `\r`, so a
  // `\n`-anchored regex over a CRLF file silently never matches and every lock below
  // would pass vacuously. This was found live: the gap assertion below reported the
  // comment lines it was supposed to have stripped.
  const src = readFileSync(join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');

  it('requires the shared ledger-window helper (one implementation, not three)', () => {
    expect(src).toMatch(/require\(['"].*ledger-window['"]\)/);
    expect(src).toMatch(/finalizeStrandedRun/);
  });

  it('the strand finalize runs in a `finally`, not on a happy path', () => {
    // Anchored on the helper call site sitting inside a finally block.
    expect(src).toMatch(/finally\s*\{[\s\S]{0,400}finalizeStrandedRun/);
  });

  it('tracks whether the NORMAL finalize landed (a bare finally would double-write)', () => {
    expect(src).toMatch(/ledgerFinalized\s*=\s*false/);
    expect(src).toMatch(/ledgerFinalized\s*=\s*true/);
  });

  it('captures the thrown error and RE-THROWS it (the window must not swallow a halt)', () => {
    expect(src).toMatch(/catch\s*\(\s*\w+\s*\)\s*\{[\s\S]{0,300}windowError\s*=\s*\w+;[\s\S]{0,120}throw\s+\w+;/);
  });

  it('the window opens immediately after the INSERT block — nothing throwable in between', () => {
    // The gap between `runId = res.rows[0].id` closing out and the `try {` must
    // contain only declarations/comments. Anything else re-opens the hole.
    const m = src.match(/runId = res\.rows\[0\]\.id;[\s\S]*?\n(\s*)try \{/);
    expect(m, 'no INSERT→try window found').not.toBeNull();
    const between = m![0];
    // Only the INSERT's own catch, comments, and closing braces may sit here.
    const code = between
      .split('\n')
      .slice(1, -1)
      .map((l) => l.replace(/\/\/.*$/, '').trim())
      .filter(Boolean)
      .filter((l) => !/^[})\];]+$/.test(l));
    const disallowed = code.filter((l) => !/^(pipeline\.log\.warn|\} catch|\})/.test(l));
    expect(disallowed, `throwable statements between INSERT and try: ${JSON.stringify(disallowed)}`).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The same five source locks, re-homed onto the step LIBRARY (pilot 1, commit 7).
//
// A step converted to the Spec 122 §5.1 frozen shape has no INSERT, no `finally`
// and no error handling of its own — `pipeline.step(descriptor, compute)` owns the
// whole lifecycle. The window therefore lives in scripts/lib/step/index.js, once,
// for every converted step, instead of being copy-pasted per script. Stated ceiling
// is unchanged: these are STATIC. They prove the shape is present, not that a live
// throw traverses it, and they cannot prove anything at all about SIGKILL.
// ---------------------------------------------------------------------------
describe('scripts/lib/step/index.js — the INSERT→finalize window is wrapped (converted steps)', () => {
  const src = readFileSync(join(process.cwd(), 'scripts/lib/step/index.js'), 'utf8').replace(/\r\n/g, '\n');

  it('requires the shared ledger-window helper (one implementation, not three)', () => {
    expect(src).toMatch(/require\(['"].*ledger-window['"]\)/);
    expect(src).toMatch(/finalizeStrandedRun/);
  });

  it('the strand finalize runs in a `finally`, not on a happy path', () => {
    expect(src).toMatch(/finally\s*\{[\s\S]{0,400}finalizeStrandedRun/);
  });

  it('tracks whether the NORMAL finalize landed (a bare finally would double-write)', () => {
    expect(src).toMatch(/ledgerFinalized\s*=\s*false/);
    expect(src).toMatch(/ledgerFinalized\s*=\s*true/);
  });

  it('captures the thrown error and RE-THROWS it (the window must not swallow a halt)', () => {
    expect(src).toMatch(/catch\s*\(\s*\w+\s*\)\s*\{[\s\S]{0,300}windowError\s*=\s*\w+;[\s\S]{0,120}throw\s+\w+;/);
  });

  it('the window opens BEFORE the ledger row is INSERTed — the gap the hand-rolled form had cannot exist here', () => {
    // The hand-rolled scripts open their window AFTER the INSERT, so the assertion
    // there is "nothing throwable in between". The library opens the try FIRST and
    // calls openLedgerRow() inside it, which is strictly stronger: there is no
    // between. This asserts that ordering, which is the property the gap check was
    // protecting all along.
    const tryAt = src.indexOf('\n  try {');
    const openAt = src.indexOf('openLedgerRow(pool');
    expect(tryAt, 'no top-level try in runWithPool').toBeGreaterThan(-1);
    expect(openAt, 'no openLedgerRow call').toBeGreaterThan(-1);
    expect(tryAt, 'the ledger row is opened OUTSIDE the window').toBeLessThan(openAt);
  });
});
