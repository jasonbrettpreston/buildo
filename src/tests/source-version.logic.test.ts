// SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.2
// SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.7
//
// Phase B B1 — scripts/lib/source-version.js, the single source for source-version
// gating (report docs/reports/2026-08-04-sources-incremental-architecture.md §6 item 11).
// Locks:
//   1. The FOUR divergent skipCheckDecision semantics, each preserved as explicit
//      options (ravines / heritage / centreline-with-contentHash-bail / zoning
//      CKAN-metadata + max-age force-reload) — and the four loader scripts'
//      exported wrappers still produce byte-identical decisions.
//   2. Fail-safe LOAD (never skip) on: check unreachable / no prior meta / malformed meta.
//   3. The three distinguishable outcome constants.
//   3b. TIER-2 (D3): contentHashDecision fires on identical bytes when tier-1 metadata
//      said "changed" (the daily-regeneration class), is bytes-only, is fail-safe LOAD in
//      every unknown direction — AND all three file loaders actually feed it post-download
//      (the adoption lock: the lib having the function is not the same as the gate firing).
//   4. streamFileHash — correct hash AND streamed (createReadStream, no readFileSync);
//      no loader buffers a whole download/file either (§9.5).
//   5. The started_at DESC standardization + the two NAMED-EXCLUDED consumer-side
//      completed_at readers (massing-full-gate.js, enrich-permits.js assertCentrelineEnriched).
//   6. buildSkipReEmitMeta — the DS4 skip-emits-a-COMPLETED-row merge shape
//      (pins after the prior spread — the load-ravines BUG-2 rule).

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sv = require('../../scripts/lib/source-version.js');
// The ravines wrapper moved into the library at the pilot-2 conversion: the
// pre-acquisition gate is `scripts/lib/step/staleness.js` and takes the prior EMIT
// BLOCK rather than the whole records_meta (the library unwraps `emits[0].key`).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ravines = require('../../scripts/lib/step/staleness.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const heritage = require('../../scripts/load-heritage.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const centreline = require('../../scripts/load-centreline.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const zoning = require('../../scripts/load-zoning.js');

const LIB_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/lib/source-version.js'),
  'utf8',
);
/**
 * The file that OWNS each loader's adoption of the shared gate semantics.
 *
 * ⚠️ `load-ravines.js` points at `scripts/lib/step/acquire.js`, not at the step file.
 * At the pilot-2 conversion (Spec 122 §5.1) `scripts/load-ravines.js` became the
 * frozen three-line shape and the tier-2 content-hash gate, the streamed
 * hash-through-to-disk and the DS4 re-emit moved INTO the library's acquisition seam
 * — one home, shared by every converted loader. Re-pointing the lock is mandatory:
 * left aimed at the step file it would go green on an empty file, which is exactly
 * how fence 0b230472 (Severity HIGH) would be silently unlocked.
 */
const ADOPTION_SUBJECT: Record<string, string[]> = {
  // The acquisition seam owns the download, the streamed hash and the tier-2 gate;
  // the staleness module owns the prior-run read and the tier-1 gate. Both files are
  // the subject, in lifecycle order, because the constructs the locks below assert
  // were ONE file before the conversion and are two now.
  'load-ravines.js': ['lib/step/staleness.js', 'lib/step/acquire.js'],
  'load-heritage.js': ['load-heritage.js'],
  'load-centreline.js': ['load-centreline.js'],
  'load-zoning.js': ['load-zoning.js'],
};
const LOADER_SOURCES: Record<string, string> = Object.fromEntries(
  Object.entries(ADOPTION_SUBJECT).map(([f, subjects]) => [
    f,
    subjects.map((s) => fs.readFileSync(path.resolve(__dirname, '../../scripts', s), 'utf8')).join('\n'),
  ]),
);

/**
 * Source-locks that BAN a pattern must read CODE, not prose — a comment saying
 * "was Buffer.from(await res.arrayBuffer())" documents the fix and must not fail it.
 * Drops block comments and whole-line `//` / ` *` comments only; mid-line `//` is left
 * alone so URLs inside string literals survive intact.
 */
function codeOnly(file: string): string {
  const src = LOADER_SOURCES[file];
  if (!src) throw new Error(`codeOnly: no source loaded for ${file}`); // never assert against ''
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*');
    })
    .join('\n');
}

// ── 3. The three distinguishable outcomes ──────────────────────────────────
describe('outcome constants (three-way, distinguishable)', () => {
  it('exposes exactly the three named outcome strings', () => {
    expect(sv.OUTCOME_SKIP_UNCHANGED).toBe('skip_unchanged');
    expect(sv.OUTCOME_LOAD_CHANGED).toBe('load_changed');
    expect(sv.OUTCOME_LOAD_FAIL_SAFE).toBe('load_fail_safe');
  });
  it('the three are pairwise distinct', () => {
    const set = new Set([sv.OUTCOME_SKIP_UNCHANGED, sv.OUTCOME_LOAD_CHANGED, sv.OUTCOME_LOAD_FAIL_SAFE]);
    expect(set.size).toBe(3);
  });
});

// ── 1. Four branch semantics, each preserved ───────────────────────────────
describe('skipCheckDecision — ravines-style (validator equality; contentHash NOT in the bail)', () => {
  const opts = { style: sv.STYLE_VALIDATOR_EQUALITY, contentHashInNoValidatorsBail: false };
  const pm = { last_modified: 'Mon, 14 Mar 2022 15:25:09 GMT', etag: '"abc"', content_hash: 'h1' };

  it('no prior → load (no_prior_run)', () => {
    expect(sv.skipCheckDecision({ lastModified: 'x', priorMeta: null }, opts))
      .toEqual({ skip: false, reason: 'no_prior_run' });
  });
  it('no Last-Modified/ETag → no_validators bail EVEN IF the content hash matches (the ravines/heritage divergence)', () => {
    expect(sv.skipCheckDecision({ lastModified: null, etag: null, contentHash: 'h1', priorMeta: pm }, opts))
      .toEqual({ skip: false, reason: 'no_validators' });
  });
  it('Last-Modified match → skip (unchanged_last_modified)', () => {
    expect(sv.skipCheckDecision({ lastModified: pm.last_modified, priorMeta: pm }, opts))
      .toEqual({ skip: true, reason: 'unchanged_last_modified' });
  });
  it('ETag fallback match → skip (unchanged_etag)', () => {
    expect(sv.skipCheckDecision({ lastModified: null, etag: '"abc"', priorMeta: pm }, opts))
      .toEqual({ skip: true, reason: 'unchanged_etag' });
  });
  it('content-hash tier match → skip (unchanged_content_hash)', () => {
    expect(sv.skipCheckDecision({ lastModified: 'differs', etag: '"zzz"', contentHash: 'h1', priorMeta: pm }, opts))
      .toEqual({ skip: true, reason: 'unchanged_content_hash' });
  });
  it('all validators differ → load (changed)', () => {
    expect(sv.skipCheckDecision({ lastModified: 'differs', etag: '"zzz"', contentHash: 'h2', priorMeta: pm }, opts))
      .toEqual({ skip: false, reason: 'changed' });
  });

  it('the re-homed ravines wrapper (scripts/lib/step/staleness.js) preserves its exact prior decisions', () => {
    const prior = pm;
    expect(ravines.skipCheckDecision({ lastModified: 'x', prior: null })).toEqual({ skip: false, reason: 'no_prior_run' });
    expect(ravines.skipCheckDecision({ lastModified: null, etag: null, prior })).toEqual({ skip: false, reason: 'no_validators' });
    expect(ravines.skipCheckDecision({ lastModified: pm.last_modified, prior })).toEqual({ skip: true, reason: 'unchanged_last_modified' });
    expect(ravines.skipCheckDecision({ lastModified: null, etag: '"abc"', prior })).toEqual({ skip: true, reason: 'unchanged_etag' });
    expect(ravines.skipCheckDecision({ lastModified: 'Tue, 01 Jan 2030 00:00:00 GMT', etag: '"zzz"', prior }).skip).toBe(false);
  });
});

describe('skipCheckDecision — heritage-style (per-dataset sub-block passed directly)', () => {
  const priorSub = { last_modified: 'Thu, 21 May 2026 19:34:35 GMT', etag: '"abc"', content_hash: 'hh' };
  it('load-heritage.js wrapper: no prior sub-block → cannot skip (DEC-K first-run guard)', () => {
    expect(heritage.skipCheckDecision({ lastModified: 'x', priorSub: null })).toEqual({ skip: false, reason: 'no_prior_run' });
  });
  it('load-heritage.js wrapper: no validators → load; matching validators → skip', () => {
    expect(heritage.skipCheckDecision({ lastModified: null, etag: null, priorSub })).toEqual({ skip: false, reason: 'no_validators' });
    expect(heritage.skipCheckDecision({ lastModified: priorSub.last_modified, priorSub })).toEqual({ skip: true, reason: 'unchanged_last_modified' });
    expect(heritage.skipCheckDecision({ etag: '"abc"', priorSub })).toEqual({ skip: true, reason: 'unchanged_etag' });
    expect(heritage.skipCheckDecision({ lastModified: 'Fri, 22 May 2026 00:00:00 GMT', priorSub }).skip).toBe(false);
  });
});

describe('skipCheckDecision — centreline-style (contentHash IS in the no-validators bail)', () => {
  const opts = { style: sv.STYLE_VALIDATOR_EQUALITY, contentHashInNoValidatorsBail: true };
  const pm = { last_modified: 'Mon, 25 May 2026 00:00:00 GMT', etag: null, content_hash: 'ch1' };

  it('no Last-Modified/ETag but a matching contentHash → SKIP (not the bail) — the centreline divergence', () => {
    expect(sv.skipCheckDecision({ lastModified: null, etag: null, contentHash: 'ch1', priorMeta: pm }, opts))
      .toEqual({ skip: true, reason: 'unchanged_content_hash' });
  });
  it('no validators at all (incl. no contentHash) → no_validators bail', () => {
    expect(sv.skipCheckDecision({ lastModified: null, etag: null, contentHash: null, priorMeta: pm }, opts))
      .toEqual({ skip: false, reason: 'no_validators' });
  });
  it('load-centreline.js wrapper preserves its exact prior signature + decisions', () => {
    const prior = { centreline_load: pm };
    expect(centreline.skipCheckDecision({ lastModified: 'x', etag: 'y', prior: null })).toEqual({ skip: false, reason: 'no_prior_run' });
    expect(centreline.skipCheckDecision({ lastModified: 'Mon, 25 May 2026 00:00:00 GMT', prior })).toEqual({ skip: true, reason: 'unchanged_last_modified' });
    expect(centreline.skipCheckDecision({ lastModified: null, etag: null, contentHash: 'ch1', prior })).toEqual({ skip: true, reason: 'unchanged_content_hash' });
    expect(centreline.skipCheckDecision({ lastModified: null, etag: null, contentHash: null, prior })).toEqual({ skip: false, reason: 'no_validators' });
  });
});

describe('skipCheckDecision — zoning-style (CKAN metadata equality + max-age force reload)', () => {
  const now = Date.parse('2026-08-01T00:00:00Z');
  const opts = { style: sv.STYLE_CKAN_METADATA, forceReloadMaxAgeDays: 730 };

  it('no stored version → load (no_prior_version)', () => {
    expect(sv.skipCheckDecision({ lastModified: 'x', storedVersion: null, nowMs: now }, opts))
      .toEqual({ skip: false, reason: 'no_prior_version' });
  });
  it('no validators → load (no_validators)', () => {
    expect(sv.skipCheckDecision({ lastModified: null, etag: null, storedVersion: 'v', nowMs: now }, opts))
      .toEqual({ skip: false, reason: 'no_validators' });
  });
  it('unchanged metadata → skip (unchanged — the zoning reason string)', () => {
    const v = '2026-02-20T00:00:00Z';
    expect(sv.skipCheckDecision({ lastModified: v, storedVersion: v, nowMs: now }, opts))
      .toEqual({ skip: true, reason: 'unchanged' });
  });
  it('stored version older than the max age → forced LOAD even when unchanged (cache_stale_force_reload)', () => {
    const old = '2024-01-01T00:00:00Z'; // > 730 days before now
    expect(sv.skipCheckDecision({ lastModified: old, storedVersion: old, nowMs: now }, opts))
      .toEqual({ skip: false, reason: 'cache_stale_force_reload' });
  });
  it('changed metadata → load (changed)', () => {
    expect(sv.skipCheckDecision({ lastModified: '2026-05-01T00:00:00Z', storedVersion: '2026-02-20T00:00:00Z', nowMs: now }, opts))
      .toEqual({ skip: false, reason: 'changed' });
  });
  it('the ckan-metadata style REQUIRES forceReloadMaxAgeDays (divergence must be a visible parameter)', () => {
    expect(() => sv.skipCheckDecision({ lastModified: 'x', storedVersion: 'v', nowMs: now }, { style: sv.STYLE_CKAN_METADATA }))
      .toThrow(/forceReloadMaxAgeDays/);
  });
  it('load-zoning.js wrapper preserves its exact prior signature + decisions', () => {
    const v = '2026-02-20T00:00:00Z';
    expect(zoning.skipCheckDecision({ lastModified: v, storedVersion: v, nowMs: now })).toEqual({ skip: true, reason: 'unchanged' });
    expect(zoning.skipCheckDecision({ lastModified: 'x', storedVersion: null, nowMs: now }).skip).toBe(false);
    expect(zoning.skipCheckDecision({ lastModified: null, etag: null, storedVersion: 'v', nowMs: now }).reason).toBe('no_validators');
    const old = '2024-01-01T00:00:00Z';
    expect(zoning.skipCheckDecision({ lastModified: old, storedVersion: old, nowMs: now }).reason).toBe('cache_stale_force_reload');
  });
});

// ── 1b. TIER-2: the post-download content-hash gate (D3) ───────────────────
describe('contentHashDecision — tier-2, the gate that eats the daily-regeneration class', () => {
  const pm = { last_modified: 'Mon, 25 May 2026 00:00:00 GMT', etag: '"e"', content_hash: 'abc123' };

  it('matching bytes → SKIP even though tier-1 metadata said "changed"', () => {
    // The whole point: CKAN re-stamped BOTH metadata validators on a re-export whose bytes
    // are identical, so tier-1 cannot skip — it reports 'changed'.
    expect(sv.skipCheckDecision({ lastModified: 'Tue, 26 May 2026 00:00:00 GMT', etag: '"e-regenerated"', priorMeta: pm },
      { style: sv.STYLE_VALIDATOR_EQUALITY })).toEqual({ skip: false, reason: 'changed' });
    expect(sv.contentHashDecision({ contentHash: 'abc123', priorMeta: pm }))
      .toEqual({ skip: true, reason: 'unchanged_content_hash' });
  });
  it('different bytes → load (changed) — a real edit is never skipped', () => {
    expect(sv.contentHashDecision({ contentHash: 'deadbeef', priorMeta: pm }))
      .toEqual({ skip: false, reason: 'changed' });
  });
  it('fail-safe LOAD in every unknown direction: no prior meta / no hash / garbage prior / no args', () => {
    expect(sv.contentHashDecision({ contentHash: 'abc123', priorMeta: null }).skip).toBe(false);
    expect(sv.contentHashDecision({ contentHash: null, priorMeta: pm }).skip).toBe(false);
    expect(sv.contentHashDecision({ contentHash: 'abc123', priorMeta: 'garbage' }).skip).toBe(false);
    expect(sv.contentHashDecision().skip).toBe(false);
  });
  it('prior meta carrying NO content_hash baseline → load (cannot skip on an absent baseline)', () => {
    expect(sv.contentHashDecision({ contentHash: 'abc123', priorMeta: { last_modified: 'x', content_hash: null } }))
      .toEqual({ skip: false, reason: 'changed' });
  });
  it('does NOT consult last_modified/etag — tier-2 is bytes-only (a stale-metadata match cannot make it fire)', () => {
    expect(sv.contentHashDecision({ contentHash: 'differs', priorMeta: pm }).reason).toBe('changed');
  });

  it('adoption-lock: all three file loaders feed tier-2 post-download, and none still buffers a whole file', () => {
    for (const f of ['load-ravines.js', 'load-heritage.js', 'load-centreline.js']) {
      const src = codeOnly(f);
      expect(src, `${f} must run the tier-2 gate`).toContain('contentHashDecision(');
      // §9.5: hash the bytes as they stream to disk — never Buffer.from(await res.arrayBuffer()).
      expect(src, `${f} must not buffer the download`).not.toContain('arrayBuffer()');
      expect(src, `${f} must not buffer a file read`).not.toContain('readFileSync');
      expect(src, `${f} must hash through the stream`).toMatch(/hashThrough|streamFileHash/);
    }
  });
  it('adoption-lock: the tier-2 skip re-emits prior meta (DS4 completed row), not a bare skeleton', () => {
    // Each loader's tier-2 branch must build its meta through the shared merge helper.
    for (const f of ['load-ravines.js', 'load-heritage.js', 'load-centreline.js']) {
      const src = codeOnly(f);
      const tier2Idx = src.indexOf('tier2.skip');
      expect(tier2Idx, `${f} must have a tier-2 skip branch`).toBeGreaterThan(-1);
      expect(src.slice(tier2Idx), `${f} tier-2 skip must re-emit prior meta`).toContain('buildSkipReEmitMeta(');
    }
  });
});

// ── 2. Fail-safe LOAD (never skip) ─────────────────────────────────────────
describe('classifyOutcome — fail-safe LOAD on unreachable / no prior / malformed', () => {
  it('check unreachable (CKAN/HEAD error) → load_fail_safe', () => {
    expect(sv.classifyOutcome({ checkError: new Error('CKAN HTTP 503') })).toBe(sv.OUTCOME_LOAD_FAIL_SAFE);
  });
  it('no prior meta → decision is a non-skip AND classifies load_fail_safe', () => {
    const d = sv.skipCheckDecision({ lastModified: 'x', priorMeta: null }, { style: sv.STYLE_VALIDATOR_EQUALITY });
    expect(d.skip).toBe(false);
    expect(sv.classifyOutcome({ decision: d })).toBe(sv.OUTCOME_LOAD_FAIL_SAFE);
  });
  it('malformed prior meta (non-object) → non-skip decision AND load_fail_safe', () => {
    const d = sv.skipCheckDecision(
      { lastModified: 'x', priorMeta: 'garbage-not-an-object' },
      { style: sv.STYLE_VALIDATOR_EQUALITY },
    );
    expect(d.skip).toBe(false);
    expect(sv.classifyOutcome({ decision: d })).toBe(sv.OUTCOME_LOAD_FAIL_SAFE);
  });
  it('malformed decision object → load_fail_safe (never skip on garbage)', () => {
    expect(sv.classifyOutcome({ decision: {} })).toBe(sv.OUTCOME_LOAD_FAIL_SAFE);
    expect(sv.classifyOutcome({ decision: null })).toBe(sv.OUTCOME_LOAD_FAIL_SAFE);
    expect(sv.classifyOutcome({})).toBe(sv.OUTCOME_LOAD_FAIL_SAFE);
  });
  it('the three outcomes remain distinguishable end-to-end: skip → skip_unchanged; changed → load_changed', () => {
    expect(sv.classifyOutcome({ decision: { skip: true, reason: 'unchanged_last_modified' } })).toBe(sv.OUTCOME_SKIP_UNCHANGED);
    expect(sv.classifyOutcome({ decision: { skip: false, reason: 'changed' } })).toBe(sv.OUTCOME_LOAD_CHANGED);
  });
});

// ── 4. streamFileHash ──────────────────────────────────────────────────────
describe('streamFileHash — streamed sha256 (a ~327MB file must hash without buffering)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-version-hash-'));
  afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  it('hashes a fixture file to the exact sha256 of its bytes', async () => {
    const content = Buffer.from('phase-b b1 stream-hash fixture éè\n'.repeat(1000));
    const fixture = path.join(tmpDir, 'fixture.bin');
    fs.writeFileSync(fixture, content);
    const expected = crypto.createHash('sha256').update(content).digest('hex');
    await expect(sv.streamFileHash(fixture)).resolves.toBe(expected);
  });
  it('rejects (never resolves a hash) for a missing file', async () => {
    await expect(sv.streamFileHash(path.join(tmpDir, 'nope.bin'))).rejects.toThrow();
  });
  it('source-lock: the hash path uses createReadStream and the lib never uses readFileSync', () => {
    expect(LIB_SOURCE).toContain('createReadStream');
    expect(LIB_SOURCE).not.toContain('readFileSync');
  });
});

// ── 5. started_at DESC standardization + the two named-excluded readers ────
describe('readPriorRunMeta — started_at DESC standardization', () => {
  it('reads the latest COMPLETED run by started_at DESC (never completed_at)', async () => {
    const captured: { sql?: string; params?: unknown[] } = {};
    const fakePool = {
      query: async (sql: string, params: unknown[]) => {
        captured.sql = sql;
        captured.params = params;
        return { rows: [{ records_meta: { ravine_load: { content_hash: 'h1' } } }] };
      },
    };
    const meta = await sv.readPriorRunMeta(fakePool, 'sources:load_ravines');
    expect(meta).toEqual({ ravine_load: { content_hash: 'h1' } });
    expect(captured.sql).toMatch(/status = 'completed'/);
    expect(captured.sql).toMatch(/ORDER BY started_at DESC/);
    expect(captured.sql).not.toMatch(/completed_at/);
    expect(captured.params).toEqual(['sources:load_ravines']);
  });
  it('returns null when no completed run exists / records_meta is null', async () => {
    const empty = { query: async () => ({ rows: [] }) };
    await expect(sv.readPriorRunMeta(empty, 'x')).resolves.toBeNull();
    const nullMeta = { query: async () => ({ rows: [{ records_meta: null }] }) };
    await expect(sv.readPriorRunMeta(nullMeta, 'x')).resolves.toBeNull();
  });
  it('source-lock: the header NAMES the two consumer-side completed_at readers as EXCLUDED from the standardization', () => {
    expect(LIB_SOURCE).toContain('massing-full-gate.js');
    expect(LIB_SOURCE).toContain('enrich-permits.js');
    expect(LIB_SOURCE).toContain('assertCentrelineEnriched');
  });
  it('adoption-lock: all four loader gate sites read prior meta via the lib (no inline pipeline_runs reader SQL left)', () => {
    for (const [file, src] of Object.entries(LOADER_SOURCES)) {
      expect(src, file).toContain('readPriorRunMeta(');
      expect(src, file).not.toContain('records_meta FROM pipeline_runs');
    }
  });
});

// ── 7. buildSkipGateRecordsMeta — Commit B (B3 output-panel remediation) ───
// SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.7
describe('buildSkipGateRecordsMeta — skip re-emits its own coverage/threshold rows, never a bare PASS', () => {
  const baseGate = (overrides: Partial<{ reason: string; nonCompleted: number; completedWithChanges: number; ownCompleted: string | null; ownLastRecordsMeta: object | null }> = {}) => ({
    reason: 'no_upstream_changes',
    nonCompleted: 0,
    completedWithChanges: 0,
    ownCompleted: '2026-08-01T00:00:00.000Z',
    ownLastRecordsMeta: null,
    ...overrides,
  });

  it('B-R1: carries forward a named metric row (e.g. link_rate) from priorMeta.audit_table.rows', () => {
    const priorMeta = {
      audit_table: {
        rows: [
          { metric: 'link_rate', value: '11.5%', threshold: '>= 5%', status: 'PASS' },
          { metric: 'unrelated_metric', value: 42, threshold: null, status: 'INFO' },
        ],
      },
    };
    const meta = sv.buildSkipGateRecordsMeta({
      gate: baseGate({ ownLastRecordsMeta: priorMeta }),
      runAt: '2026-08-16T00:00:00.000Z',
      auditMeta: { phase: 7, name: 'Link WSIB' },
      carryMetricNames: ['link_rate'],
    });
    const rows = meta.audit_table.rows as Array<{ metric: string }>;
    expect(rows.some((r) => r.metric === 'link_rate')).toBe(true);
    expect(rows.some((r) => r.metric === 'unrelated_metric')).toBe(false);
  });

  it('B-R2: stamps own_started + a carried-forward last_full_run_at reconstructable as "days since last real execution"', () => {
    // First skip after a REAL run: last_full_run_at = that run's ownCompleted.
    const meta1 = sv.buildSkipGateRecordsMeta({
      gate: baseGate({ ownCompleted: '2026-07-08T00:00:00.000Z', ownLastRecordsMeta: { duration_ms: 300 } }),
      runAt: '2026-08-16T00:00:00.000Z',
      auditMeta: { phase: 7, name: 'Link WSIB' },
    });
    expect(meta1.own_started).toBe('2026-08-16T00:00:00.000Z');
    expect(meta1.last_full_run_at).toBe('2026-07-08T00:00:00.000Z');
    // A SECOND consecutive skip: last_full_run_at is carried forward unchanged
    // (NOT bumped to the second skip's own_started — the last REAL run hasn't moved).
    const meta2 = sv.buildSkipGateRecordsMeta({
      gate: baseGate({ ownCompleted: '2026-08-16T00:00:00.000Z', ownLastRecordsMeta: meta1 }),
      runAt: '2026-08-17T00:00:00.000Z',
      auditMeta: { phase: 7, name: 'Link WSIB' },
    });
    expect(meta2.last_full_run_at).toBe('2026-07-08T00:00:00.000Z');
  });

  it('B-R3: consecutive_skips increments across a chain of skips; the WARN threshold fires and the cascade propagates', () => {
    let priorMeta: Record<string, unknown> | null = null;
    let lastVerdict = 'PASS';
    for (let i = 1; i <= 5; i++) {
      const meta: Record<string, unknown> = sv.buildSkipGateRecordsMeta({
        gate: baseGate({ ownLastRecordsMeta: priorMeta }),
        runAt: `2026-08-${10 + i}T00:00:00.000Z`,
        auditMeta: { phase: 7, name: 'Link WSIB' },
        consecutiveSkipsWarnAt: 4,
      });
      expect(meta.consecutive_skips).toBe(i);
      const auditTable = meta.audit_table as { verdict: string; rows: Array<{ metric: string; status: string }> };
      const consecutiveRow = auditTable.rows.find((r) => r.metric === 'consecutive_skips');
      expect(consecutiveRow?.status).toBe(i >= 4 ? 'WARN' : 'INFO');
      lastVerdict = auditTable.verdict;
      priorMeta = meta;
    }
    // Proves the cascade fix is load-bearing: verdict is ROW-DERIVED, not a
    // hardcoded 'PASS' — the 5th skip's WARN row propagates to the verdict.
    expect(lastVerdict).toBe('WARN');
  });

  it('a carried FAIL row propagates to the skip verdict (the whole point of the row-derived cascade)', () => {
    const priorMeta = {
      audit_table: { rows: [{ metric: 'errors', value: 3, threshold: '== 0', status: 'FAIL' }] },
    };
    const meta = sv.buildSkipGateRecordsMeta({
      gate: baseGate({ ownLastRecordsMeta: priorMeta }),
      runAt: '2026-08-16T00:00:00.000Z',
      auditMeta: { phase: 54, name: 'Parcel ↔ Address Points spatial bridge' },
      carryMetricNames: ['errors'],
    });
    expect((meta.audit_table as { verdict: string }).verdict).toBe('FAIL');
  });

  it('B-R4 (stamping half): stamps gated_skip:true so the duration-anomaly baseline query can exclude this row', () => {
    const meta = sv.buildSkipGateRecordsMeta({
      gate: baseGate(),
      runAt: '2026-08-16T00:00:00.000Z',
      auditMeta: { phase: 88, name: 'Parcel Cost Estimation' },
    });
    expect(meta.gated_skip).toBe(true);
  });

  it('consecutive_skips resets to 1 when the own-last run was a REAL run (no carried SKIPPED status row)', () => {
    const realRunMeta = { audit_table: { rows: [{ metric: 'residential_parcels_examined', value: 100, status: 'PASS' }] } };
    const meta = sv.buildSkipGateRecordsMeta({
      gate: baseGate({ ownLastRecordsMeta: realRunMeta }),
      runAt: '2026-08-16T00:00:00.000Z',
      auditMeta: { phase: 88, name: 'Parcel Cost Estimation' },
    });
    expect(meta.consecutive_skips).toBe(1);
  });

  it('adoption-lock: all three B3 callers wire the run-ledger-gate skip path through buildSkipGateRecordsMeta (not a hardcoded verdict)', () => {
    for (const f of ['link-wsib.js', 'link-parcel-addresses.js', 'compute-parcel-cost-estimates.js']) {
      const src = fs.readFileSync(path.resolve(__dirname, '../../scripts', f), 'utf8');
      expect(src, `${f} must call buildSkipGateRecordsMeta`).toContain('buildSkipGateRecordsMeta(');
      // The gate.skip branch itself must build its records_meta via the helper,
      // not a literal { ..., verdict: 'PASS', ... } object — scoped to the
      // `if (gate...skip...)` block, since link-wsib.js's UNRELATED
      // "nothing to link" vacuous-skip branch legitimately hardcodes PASS.
      const gateSkipIdx = src.indexOf('gate.skip');
      expect(gateSkipIdx, `${f} must have a gate.skip branch`).toBeGreaterThan(-1);
      const gateSkipBlock = src.slice(gateSkipIdx, gateSkipIdx + 800);
      expect(gateSkipBlock, `${f} gate.skip branch must not hardcode verdict: 'PASS'`).not.toMatch(/verdict:\s*'PASS'/);
      expect(gateSkipBlock, `${f} gate.skip branch must call buildSkipGateRecordsMeta`).toContain('buildSkipGateRecordsMeta(');
    }
  });
});

// ── 6. buildSkipReEmitMeta — the DS4 skip-emits-completed-row merge ────────
describe('buildSkipReEmitMeta — skip re-stamps the prior version meta (DS4)', () => {
  it('merges skeleton ← prior ← pins, pins winning (spec_version pinned AFTER the prior spread — BUG-2)', () => {
    const merged = sv.buildSkipReEmitMeta({
      skeleton: { spec_version: '1.2', source_dataset_version: null, feature_count: 0, skipped_reason: null },
      priorMeta: { spec_version: '1.0-stale', source_dataset_version: 'v9', feature_count: 854 },
      pins: { spec_version: '1.2', skipped_reason: 'unchanged_last_modified' },
    });
    expect(merged).toEqual({
      spec_version: '1.2', // pin beats the stale prior value
      source_dataset_version: 'v9', // prior version re-stamped (downstream HALT gates keep reading it)
      feature_count: 854,
      skipped_reason: 'unchanged_last_modified',
    });
  });
  it('tolerates a missing/garbage prior meta (skeleton + pins only)', () => {
    expect(sv.buildSkipReEmitMeta({ skeleton: { a: 1 }, priorMeta: null, pins: { b: 2 } })).toEqual({ a: 1, b: 2 });
    expect(sv.buildSkipReEmitMeta({ skeleton: { a: 1 }, priorMeta: 'garbage', pins: {} })).toEqual({ a: 1 });
  });
  it('adoption-lock: the ravines + centreline skip paths build their re-emit meta via the helper', () => {
    expect(LOADER_SOURCES['load-ravines.js']).toContain('buildSkipReEmitMeta(');
    expect(LOADER_SOURCES['load-centreline.js']).toContain('buildSkipReEmitMeta(');
  });
});
