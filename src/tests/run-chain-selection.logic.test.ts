// 🔗 SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md §Runbook — partial chain runs
// 🔗 SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.2 (platform timeout = backstop, never the mechanism)
// 🔗 SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.9 (step_completeness)
//
// WF2 partial chain runs (2026-09-17) — `--from=<slug>` / `--only=<a,b,c>`.
//
// THE MEASUREMENT THAT FORCED IT (re-executed, not inherited): chain-sources run
// 35140032614, `headSha df61d453`, `createdAt 2026-09-16T19:21:08Z`, killed by
// `##[error]The action 'Run sources chain' has timed out after 300 minutes.` at
// 2026-09-17T01:01:55Z. Cloud `pipeline_runs`: chain row 4996 plus step rows 4997-5010 =
// positions 1-14 of `manifest.chains.sources`, thirteen `completed` and
// `sources:enrich_centreline` killed mid-telemetry. `enrich_parcels` (position 22, ~87 min)
// never started. Two earlier runs died the same way. Position 15 is `massing`.
//
// The chain is not going to fit in one job: `compute_centroids` 50.0 min +
// `enrich_centreline` 59.6 + `enrich_heritage` 37.5 + `parcels` 37.1 + `geocode_permits` 31.7
// already exceeds half the 300-minute ceiling, and gate-skip is DISABLED after a failed
// predecessor (`prevChainFailed`), so every step processes FULL.
//
// WHAT THESE LOCKS PIN — the three declared rules, each in BOTH directions:
//  (1) manifest order is preserved, always — selection filters, it never reorders;
//  (2) an unknown slug THROWS, and the call site puts that throw before every DB write;
//  (3) `--from` + `--only` together are REFUSED (not intersected), because `--only` already
//      fully determines the set and an intersection would silently narrow the operator's
//      `--from`.
// Plus the two properties that make a partial run an honest ledger row: the chain row is
// still opened/closed, and `records_meta.partial_selection` is written on a partial run and
// ABSENT on a full one (absence is the full-run claim — no parallel boolean).

// ── WHY THIS FILE `require()`s run-chain.js WHILE run-chain-defer.logic.test.ts DOES NOT ──
// That file's header explains its own choice: before B2 (2026-08-14) run-chain.js called
// `run().catch(...)` at MODULE LOAD, so a bare require in a vitest worker opened a real pool
// and `process.exit(1)`-ed the shared test process. The `require.main === module` guard landed
// with B2 and the same header records that check-chain-verdict.js and enrich-parcels.js ARE
// required directly "where it's simpler than a regex". This is that case: `resolveStepSelection`
// is a pure function whose ORDER and THROW behaviour cannot be proven by a source scan at all.
// The source-scan locks below cover the placement claims, which behaviour cannot reach.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const runChain = require('../../scripts/run-chain.js') as {
  resolveStepSelection: (a: { steps: string[]; from?: string | null; only?: string | null }) => {
    selected: string[]; skipped: string[]; from: string | null; only: string[] | null; partial: boolean;
  };
  parseSelectionArgs: (argv: string[]) => { from: string | null; only: string | null };
  resolveExternalRunId: (argv: string[]) => number | null;
};

const SRC = readFileSync(join(process.cwd(), 'scripts/run-chain.js'), 'utf8');
const MANIFEST = JSON.parse(readFileSync(join(process.cwd(), 'scripts/manifest.json'), 'utf8')) as {
  chains: Record<string, string[]>;
};

/** run-chain.js with `//` comment lines removed — for scans that must not match prose. */
const CODE = SRC
  .split(/\r?\n/)
  .filter((l) => {
    const t = l.trim();
    return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  })
  .join('\n');

const CHAIN = ['reconcile', 'assert_schema', 'massing', 'link_massing', 'refresh_snapshot'];

describe('resolveStepSelection — no flags is the full chain, unchanged', () => {
  it('returns every step, in order, and reports partial=false', () => {
    const r = runChain.resolveStepSelection({ steps: CHAIN });
    expect(r.selected).toEqual(CHAIN);
    expect(r.skipped).toEqual([]);
    expect(r.partial, 'a flagless run must be indistinguishable from today\'s behaviour').toBe(false);
  });

  it('returns a COPY — a caller mutating the selection cannot reach back into manifest.chains', () => {
    const steps = CHAIN.slice();
    const r = runChain.resolveStepSelection({ steps });
    r.selected.push('injected');
    expect(steps).toEqual(CHAIN);
  });
});

describe('resolveStepSelection — `--from` is a contiguous tail in MANIFEST order', () => {
  it('selects the named step and everything after it; everything before it is `skipped`', () => {
    const r = runChain.resolveStepSelection({ steps: CHAIN, from: 'massing' });
    expect(r.selected).toEqual(['massing', 'link_massing', 'refresh_snapshot']);
    expect(r.skipped).toEqual(['reconcile', 'assert_schema']);
    expect(r.partial).toBe(true);
    expect(r.from).toBe('massing');
    expect(r.only).toBeNull();
  });

  it('`--from` the FIRST step is a full run that still declares itself partial (the operator asked, so the row says so)', () => {
    const r = runChain.resolveStepSelection({ steps: CHAIN, from: 'reconcile' });
    expect(r.selected).toEqual(CHAIN);
    expect(r.skipped).toEqual([]);
    expect(r.partial, 'partial is a statement about the DISPATCH, not about the resulting length').toBe(true);
  });

  it('`--from` the LAST step selects exactly one step', () => {
    const r = runChain.resolveStepSelection({ steps: CHAIN, from: 'refresh_snapshot' });
    expect(r.selected).toEqual(['refresh_snapshot']);
    expect(r.skipped).toHaveLength(4);
  });

  it('an unknown `--from` slug THROWS, and the message lists the real steps (a typo must not run a shorter chain)', () => {
    expect(() => runChain.resolveStepSelection({ steps: CHAIN, from: 'masing' }))
      .toThrow(/--from=masing is not a step of this chain[\s\S]*reconcile, assert_schema, massing/);
  });
});

describe('resolveStepSelection — `--only` is an explicit set, still in MANIFEST order', () => {
  it('ORDER IS THE MANIFEST\'S, NEVER THE ORDER TYPED — the load-bearing rule (step order is a dependency order)', () => {
    const r = runChain.resolveStepSelection({ steps: CHAIN, only: 'refresh_snapshot,massing' });
    expect(r.selected).toEqual(['massing', 'refresh_snapshot']);
    expect(r.only, 'the DECLARED request is recorded as given, deduped').toEqual(['refresh_snapshot', 'massing']);
  });

  it('whitespace is trimmed and a duplicate is collapsed — a step can never run twice in one chain run', () => {
    const r = runChain.resolveStepSelection({ steps: CHAIN, only: ' massing , massing ,link_massing' });
    expect(r.selected).toEqual(['massing', 'link_massing']);
  });

  it('every unselected step is reported in `skipped` (the row must account for all 5, not just the 2 that ran)', () => {
    const r = runChain.resolveStepSelection({ steps: CHAIN, only: 'massing,link_massing' });
    expect([...r.selected, ...r.skipped].sort()).toEqual(CHAIN.slice().sort());
  });

  it('ANY unknown name in the list THROWS — validation is over the whole list, before anything is selected', () => {
    expect(() => runChain.resolveStepSelection({ steps: CHAIN, only: 'massing,nope' }))
      .toThrow(/--only names step\(s\) that are not in this chain: nope/);
  });

  it('an empty or comma-only `--only` THROWS rather than silently selecting nothing', () => {
    expect(() => runChain.resolveStepSelection({ steps: CHAIN, only: '' })).not.toThrow(); // '' is falsy = flag absent
    expect(() => runChain.resolveStepSelection({ steps: CHAIN, only: ' , , ' }))
      .toThrow(/--only was given but names no step/);
  });
});

describe('resolveStepSelection — `--from` + `--only` together are REFUSED, not intersected', () => {
  it('throws, naming both flags and why (an intersection would silently narrow the operator\'s --from)', () => {
    expect(() => runChain.resolveStepSelection({ steps: CHAIN, from: 'massing', only: 'massing,link_massing' }))
      .toThrow(/--from and --only cannot be combined/);
  });

  it('the refusal fires even when the intersection would have been non-empty and obvious', () => {
    expect(() => runChain.resolveStepSelection({ steps: CHAIN, from: 'reconcile', only: 'reconcile' }))
      .toThrow(/cannot be combined/);
  });
});

describe('parseSelectionArgs — the flag spelling', () => {
  it('reads --from= / --only= from anywhere in argv, and returns null for an absent flag', () => {
    expect(runChain.parseSelectionArgs(['node', 'run-chain.js', 'sources', '--from=massing']))
      .toEqual({ from: 'massing', only: null });
    expect(runChain.parseSelectionArgs(['node', 'run-chain.js', 'sources', '1234', '--only=a,b']))
      .toEqual({ from: null, only: 'a,b' });
    expect(runChain.parseSelectionArgs(['node', 'run-chain.js', 'sources'])).toEqual({ from: null, only: null });
  });
});

// ── resolveExternalRunId — BEHAVIOURAL, not a source scan ────────────────────────────────
// Regression Guardian 2026-09-17: the only locks on this behaviour were `toMatch()` regexes
// over run-chain.js's own source (here and in admin.ui.test.tsx), which cannot tell a changed
// spelling from a changed meaning — a refactor that kept a matching substring while inverting
// the logic would have passed both. The computation was inline in `run()` and unreachable to a
// unit test; it is now exported, and this is the case table.
//
// The fence (`da8620dd`, "Ghost chain: parse externalRunId before chain validation, mark as
// failed on invalid chain_id"): a caller-supplied `pipeline_runs.id` must be REUSED, never
// left `running` in the admin UI. Every case below is a real argv shape from a real caller.
describe('resolveExternalRunId — the first NON-FLAG positional, proven on real argv', () => {
  const R = (...rest: string[]) => runChain.resolveExternalRunId(['node', 'run-chain.js', 'sources', ...rest]);

  it('a numeric positional is the run id (the admin/pre-created-row caller)', () => {
    expect(R('1234')).toBe(1234);
  });

  it('no positional at all is null (every workflow caller: `node scripts/run-chain.js sources`)', () => {
    expect(R()).toBeNull();
  });

  it('an EMPTY-STRING placeholder is null — preserved exactly (src/tests/db/run-chain-step-timeout.db.test.ts passes `[CHAIN_ID, "", "--manifest=…"]`)', () => {
    expect(R('', '--manifest=/tmp/x.json')).toBeNull();
  });

  it('a selection flag is NEVER a run id, wherever it sits — the guarantee the old argv[3] spelling could not state', () => {
    expect(R('--from=massing')).toBeNull();
    expect(R('--only=massing,link_massing')).toBeNull();
    expect(R('--force')).toBeNull();
    expect(R('--manifest=/tmp/x.json')).toBeNull();
  });

  it('flags and a run id together still resolve the run id — strictly more correct than the old positional read', () => {
    expect(R('--force', '5678')).toBe(5678);
    expect(R('5678', '--from=massing')).toBe(5678);
  });
});

describe('the live `sources` chain — the partial dispatch this WF exists to enable', () => {
  it('position 15 is `massing`, so `--from=massing` is exactly the 14-step tail run 35140032614 never reached', () => {
    const sources = MANIFEST.chains.sources!;
    expect(sources[14], 'if the manifest changes, the runbook dispatch line must change with it').toBe('massing');
    const r = runChain.resolveStepSelection({ steps: sources, from: 'massing' });
    expect(r.selected).toHaveLength(14);
    expect(r.skipped).toHaveLength(14);
    expect(r.selected[r.selected.length - 1]).toBe('assert_engine_health');
    expect(r.skipped, 'a tail run does NOT reap stranded rows — reconcile is Step 0 and is not selected').toContain('reconcile');
  });

  it('Spec 43\'s copy-paste HEAD-half dispatch line is exactly the manifest\'s first 14 slugs (a hand-typed 14-slug input must not rot)', () => {
    // There is no `--to`, so the head half is spelled as an explicit `only` set. A drifted
    // runbook line is refused only AFTER a runner has spun up and done `npm ci` — which is
    // exactly the cost this lock exists to avoid.
    const spec = readFileSync(join(process.cwd(), 'docs/specs/01-pipeline/43_chain_sources.md'), 'utf8');
    const head = MANIFEST.chains.sources!.slice(0, 14).join(',');
    expect(spec, 'the -f only=… line in Spec 43 §Runbook drifted from manifest.chains.sources').toContain(`-f only=${head}`);
    expect(spec, 'and the tail half must still start at the slug that follows it').toContain('-f from=massing');
  });
});

describe('run-chain.js source locks — where the selection sits and what it records', () => {
  it('selection is resolved BEFORE the chain advisory lock and BEFORE the chain-row INSERT (a bad flag leaves no ledger row)', () => {
    const selIdx = SRC.indexOf('selection = resolveStepSelection(');
    const lockIdx = SRC.indexOf('pg_try_advisory_lock(2, hashtext');
    const insertIdx = SRC.search(/INSERT INTO pipeline_runs \(pipeline, started_at, status\)/);
    expect(selIdx).toBeGreaterThan(-1);
    expect(lockIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(-1);
    expect(selIdx, 'a throw must precede the chain advisory lock').toBeLessThan(lockIdx);
    expect(selIdx, 'a throw must precede every pipeline_runs write').toBeLessThan(insertIdx);
  });

  it('a pre-created externalRunId is terminalized on a bad selection — it must not ghost as running (the invalid-chain_id precedent)', () => {
    expect(SRC).toMatch(/Invalid step selection[\s\S]{0,600}status = 'failed'/);
  });

  it('externalRunId comes from the exported pure resolver, and nothing reads argv[3] positionally any more', () => {
    // The BEHAVIOUR is proven by the resolveExternalRunId case table above; this pins only the
    // placement claim a behavioural test cannot reach — that run() uses that same resolver.
    expect(SRC).toMatch(/const externalRunId = resolveExternalRunId\(process\.argv\);/);
    // Comments stripped first — `tasks/lessons.md`'s recurring class: a text scan over a corpus
    // that documents its own rules reports the promise as the breach (the resolver's docblock
    // quotes the retired `process.argv[3]` expression verbatim, on purpose).
    expect(CODE, 'no positional argv[3] read may survive').not.toMatch(/process\.argv\[3\]/);
  });

  it('records_meta.partial_selection is written ONLY on a partial run — absence of the key is the full-run claim', () => {
    expect(SRC).toMatch(/if \(selection\.partial\) \{\s*\n\s*metaObj\.partial_selection = \{/);
    expect(SRC).toMatch(/steps_selected: steps/);
    expect(SRC).toMatch(/steps_skipped_by_selection: selection\.skipped/);
  });

  it('step_completeness.expected stays the SELECTED steps, so per-slug adjudication reconciles for what ran', () => {
    expect(SRC).toMatch(/metaObj\.step_completeness = \{\s*\n\s*expected: steps,/);
  });

  it('the chain row is still opened and closed on a partial run — no branch skips the terminal UPDATE', () => {
    // The finalization UPDATE is unconditional on `chainRunId`, never on the selection.
    expect(SRC).toMatch(/if \(chainRunId\) \{\s*\n\s*await pool\.query\(\s*\n\s*`UPDATE pipeline_runs\s*\n\s*SET completed_at = NOW\(\), status = \$1/);
    expect(SRC, 'no early return may be gated on the selection').not.toMatch(/selection\.partial[\s\S]{0,80}return;/);
  });

  it('the Phase-0 bloat gate scopes to the SELECTION, not the full manifest chain — knowingly narrowed, and locked so it cannot silently widen back', () => {
    // Regression Guardian 2026-09-17: `2a2fa96e` made Phase 0 the SOLE bloat defence, "checks
    // all chain tables BEFORE any steps run". On a partial run "all chain tables" now means the
    // selection's tables. That is the right reading — a partial dispatch must not be warned
    // about (or at >50% loudly flagged on) a table it will never touch — but it IS a behaviour
    // change, so it gets a lock rather than a silent reinterpretation.
    expect(CODE).toMatch(/const allTables = new Set\(\);\s*\n\s*for \(const slug of steps\) \{/);
    expect(CODE, 'the union must never be rebuilt from the full chain').not.toMatch(/for \(const slug of allSteps\)/);
  });

  it('step ORDERING and gate-skip semantics are untouched — the loop still walks `steps` and still consults resolveGateExempt', () => {
    expect(SRC).toMatch(/for \(let i = 0; i < steps\.length; i\+\+\)/);
    expect(SRC).toMatch(/if \(gateSkipped && !resolveGateExempt\(slug, manifest\.scripts\[slug\]\)\)/);
  });
});
