// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md
//
// Pure-logic locks for `scripts/analysis/capture-guard.js` — the two pre-conditions
// for a POST golden capture under Spec 123 ①②③ "capture last": (1) the step's
// Spec 124 §5 R-BA five-word verdict must PASS, except a FAIL whose every named
// gate is capture-derived (gate G, which this very capture feeds); and (2) the
// POST must have seen the SAME upstream bytes as the committed PRE (same session).
//
// No DB, no network, no child process, no disk — every export here is pure.
// The rendered row shapes are the EXACT strings step-validate's
// `renderScorecard` emits (`| ${word} | ${v.status} | ${v.detail} |`).
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const guard = require('../../scripts/analysis/capture-guard.js');
const {
  FIVE_WORDS,
  CAPTURE_DERIVED_GATES,
  parseFiveWords,
  captureGuardDecision,
  contentHashes,
  sameSessionDecision,
  prePathFor,
} = guard;

/** A rendered stdout block with the given row lines (one per five-word row). */
function stdout(rows: string[]) {
  return [
    '```',
    '[step-validate] link_massing (converted) — 88/90, hard-stop=false',
    '```',
    '',
    '## Validation scorecard (generated)',
    '',
    "### Five-word verdict (Spec 124 §5 R-BA — \"McDonald's Airtight\")",
    '',
    '| Word | Status | Detail |',
    '|---|---|---|',
    ...rows,
    '',
    '| Gate | Score | Max | Detail |',
    '|---|---:|---:|---|',
    '| A | 8 | 10 | ok |',
  ].join('\n');
}

/** All five words PASS, so a test can change exactly one row. */
function allPassStdout(override?: string) {
  const rows = [
    '| STANDARDIZED | PASS | PASS |',
    '| OBSERVABLE | PASS | PASS |',
    '| SCALABLE | PASS | PASS |',
    '| UNDERSTANDABLE | PASS | PASS |',
    '| ACCURATE | PASS | PASS |',
  ];
  if (!override) return stdout(rows);
  // The override REPLACES the row for its word (one verdict per word per step).
  const word = override.split('|')[1].trim();
  return stdout(rows.map((r) => (r.split('|')[1].trim() === word ? override : r)));
}

// ── 1. vocabulary ───────────────────────────────────────────────────────────
describe('vocabulary', () => {
  it('FIVE_WORDS is the frozen Spec 124 §5 R-BA five-word set in render order', () => {
    expect(FIVE_WORDS).toEqual([
      'STANDARDIZED', 'OBSERVABLE', 'SCALABLE', 'UNDERSTANDABLE', 'ACCURATE',
    ]);
    expect(Object.isFrozen(FIVE_WORDS)).toBe(true);
  });

  it('CAPTURE_DERIVED_GATES is exactly the frozen [G] set', () => {
    expect(CAPTURE_DERIVED_GATES).toEqual(['G']);
    expect(Object.isFrozen(CAPTURE_DERIVED_GATES)).toBe(true);
  });
});

// ── 2. parseFiveWords ───────────────────────────────────────────────────────
describe('parseFiveWords', () => {
  it('parses the four exact row shapes from the brief', () => {
    const words = parseFiveWords(stdout([
      '| SCALABLE | FAIL | FAIL (gate B — unledgered) |',
      '| ACCURATE | FAIL | FAIL (gate G/K — unledgered) |',
      '| OBSERVABLE | PASS | PASS (3 deferred) |',
      '| STANDARDIZED | PASS | PASS |',
    ]));
    expect(words.get('SCALABLE')).toEqual({ status: 'FAIL', gates: ['B'] });
    expect(words.get('ACCURATE')).toEqual({ status: 'FAIL', gates: ['G', 'K'] });
    expect(words.get('OBSERVABLE')).toEqual({ status: 'PASS', gates: [] });
    expect(words.get('STANDARDIZED')).toEqual({ status: 'PASS', gates: [] });
    expect(words.size).toBe(4);
  });

  it('ignores rows whose first cell is not one of FIVE_WORDS', () => {
    const words = parseFiveWords(stdout([
      '| Gate | Status | Detail |',
      '| A | FAIL | FAIL (gate B) |',
      '| STANDARDIZED | PASS | PASS |',
    ]));
    expect([...words.keys()]).toEqual(['STANDARDIZED']);
  });

  it('ignores a row whose status is not exactly PASS or FAIL', () => {
    const words = parseFiveWords(stdout([
      '| SCALABLE | MAYBE | HMM |',
      '| ACCURATE | PASS | PASS |',
    ]));
    expect([...words.keys()]).toEqual(['ACCURATE']);
  });

  it('normalises Windows CRLF line endings', () => {
    const words = parseFiveWords(allPassStdout().split('\n').join('\r\n'));
    expect(words.size).toBe(5);
    expect(words.get('ACCURATE')).toEqual({ status: 'PASS', gates: [] });
  });

  it('is empty for a non-string or empty stdout', () => {
    expect(parseFiveWords('').size).toBe(0);
    expect(parseFiveWords(null as unknown as string).size).toBe(0);
    expect(parseFiveWords(undefined as unknown as string).size).toBe(0);
  });

  it('a repeated row with IDENTICAL content is idempotent (no throw)', () => {
    const words = parseFiveWords(allPassStdout('| SCALABLE | PASS | PASS |'));
    expect(words.size).toBe(5);
    expect(words.get('SCALABLE')).toEqual({ status: 'PASS', gates: [] });
  });

  it('THROWS when a word appears twice with DIFFERENT content (several steps in one run)', () => {
    expect(() => parseFiveWords(`${allPassStdout()}\n| SCALABLE | FAIL | FAIL (gate B — unledgered) |`))
      .toThrow(/ambiguous five-word output: SCALABLE/);
  });
});

// ── 3. captureGuardDecision ─────────────────────────────────────────────────
describe('captureGuardDecision', () => {
  it('allows an all-PASS verdict', () => {
    const out = captureGuardDecision(parseFiveWords(allPassStdout()));
    expect(out.allow).toBe(true);
    expect(out.failing).toEqual([]);
  });

  it('refuses when a word is missing, naming it as an unreadable verdict', () => {
    const words = parseFiveWords(stdout([
      '| STANDARDIZED | PASS | PASS |',
      '| OBSERVABLE | PASS | PASS |',
      '| SCALABLE | PASS | PASS |',
      '| ACCURATE | PASS | PASS |',
    ]));
    const out = captureGuardDecision(words);
    expect(out.allow).toBe(false);
    expect(out.reason).toContain('UNDERSTANDABLE');
    expect(out.reason).toContain('verdict unreadable');
    expect(out.failing).toEqual(['UNDERSTANDABLE']);
  });

  it('refuses on a raw empty Map (nothing readable at all)', () => {
    const out = captureGuardDecision(new Map());
    expect(out.allow).toBe(false);
    expect(out.failing).toEqual(['STANDARDIZED']);
  });

  it('refuses SCALABLE on gate B, naming "SCALABLE (gate B)"', () => {
    const out = captureGuardDecision(parseFiveWords(allPassStdout('| SCALABLE | FAIL | FAIL (gate B — unledgered) |')));
    expect(out.allow).toBe(false);
    expect(out.failing).toEqual(['SCALABLE (gate B)']);
    expect(out.reason).toBe('five-word verdict not PASS: SCALABLE (gate B)');
  });

  it('ALLOWS ACCURATE on gate G only (capture-derived — the capture is the fix)', () => {
    const out = captureGuardDecision(parseFiveWords(allPassStdout('| ACCURATE | FAIL | FAIL (gate G — unledgered) |')));
    expect(out.allow).toBe(true);
    expect(out.failing).toEqual([]);
  });

  it('refuses ACCURATE on gate G/K (K is not capture-derived)', () => {
    const out = captureGuardDecision(parseFiveWords(allPassStdout('| ACCURATE | FAIL | FAIL (gate G/K — unledgered) |')));
    expect(out.allow).toBe(false);
    expect(out.failing).toEqual(['ACCURATE (gate G/K)']);
    expect(out.reason).toBe('five-word verdict not PASS: ACCURATE (gate G/K)');
  });

  it('refuses a FAIL that names no gate', () => {
    const out = captureGuardDecision(parseFiveWords(allPassStdout('| OBSERVABLE | FAIL | FAIL |')));
    expect(out.allow).toBe(false);
    expect(out.failing).toEqual(['OBSERVABLE (gate none)']);
  });

  it('names EVERY failing word, in FIVE_WORDS order', () => {
    const out = captureGuardDecision(parseFiveWords(stdout([
      '| STANDARDIZED | PASS | PASS |',
      '| OBSERVABLE | PASS | PASS |',
      '| SCALABLE | FAIL | FAIL (gate B — unledgered) |',
      '| UNDERSTANDABLE | FAIL | FAIL (gate C) |',
      '| ACCURATE | FAIL | FAIL (gate G/K — unledgered) |',
    ])));
    expect(out.allow).toBe(false);
    expect(out.failing).toEqual(['SCALABLE (gate B)', 'UNDERSTANDABLE (gate C)', 'ACCURATE (gate G/K)']);
    expect(out.reason).toBe(
      'five-word verdict not PASS: SCALABLE (gate B), UNDERSTANDABLE (gate C), ACCURATE (gate G/K)',
    );
  });

  it('tolerates a non-Map argument by refusing (never authorizing blindly)', () => {
    expect(captureGuardDecision(null as unknown as Map<string, never>).allow).toBe(false);
    expect(captureGuardDecision(undefined as unknown as Map<string, never>).allow).toBe(false);
  });
});

// ── 4. contentHashes ────────────────────────────────────────────────────────
describe('contentHashes', () => {
  it('walks summary.records_meta recursively, two levels deep', () => {
    const doc = {
      summary: {
        records_meta: {
          ravine_load: { content_hash: 'aaa' },
          audit_table: { rows: [{ content_hash: 'bbb' }, { content_hash: 'ccc' }] },
          nested: { deeper: { content_hash: 'aaa' } },
        },
      },
    };
    expect(contentHashes(doc)).toEqual(['aaa', 'bbb', 'ccc']);
  });

  it('ignores table_state.content_hash (the LOCAL table, not the upstream bytes)', () => {
    const doc = {
      summary: { records_meta: { load: { content_hash: 'upstream' } } },
      table_state: [{ table: 'ravines', content_hash: 'local-table-hash' }],
    };
    expect(contentHashes(doc)).toEqual(['upstream']);
  });

  it('ignores a content_hash anywhere outside summary.records_meta', () => {
    const doc = {
      content_hash: 'top',
      meta: [{ content_hash: 'meta-level' }],
      summary: { content_hash: 'summary-level', records_meta: { load: { content_hash: 'real' } } },
    };
    expect(contentHashes(doc)).toEqual(['real']);
  });

  it('collects every matching string and de-duplicates + sorts them', () => {
    const doc = { summary: { records_meta: { a: { content_hash: 'zzz' }, b: [{ content_hash: 'aaa' }, { content_hash: 'zzz' }] } } };
    expect(contentHashes(doc)).toEqual(['aaa', 'zzz']);
  });

  it('skips non-string content_hash values without throwing', () => {
    const doc = { summary: { records_meta: { a: { content_hash: 123 }, b: { content_hash: null }, c: { content_hash: '' }, d: { content_hash: 'ok' } } } };
    expect(contentHashes(doc)).toEqual(['ok']);
  });

  it('returns [] for a doc with no summary / no records_meta / a non-object', () => {
    expect(contentHashes({ summary: {} })).toEqual([]);
    expect(contentHashes({})).toEqual([]);
    expect(contentHashes(null)).toEqual([]);
    expect(contentHashes(undefined)).toEqual([]);
  });
});

// ── 5. sameSessionDecision ──────────────────────────────────────────────────
describe('sameSessionDecision', () => {
  const preDoc = { summary: { records_meta: { load: { content_hash: 'same' } } } };
  const postDocSame = { summary: { records_meta: { load: { content_hash: 'same' } } } };
  const postDocDiff = { summary: { records_meta: { load: { content_hash: 'changed' } } } };

  it('treats a null PRE as same, with the no-comparison reason', () => {
    const out = sameSessionDecision(null, postDocDiff);
    expect(out.same).toBe(true);
    expect(out.pre).toEqual([]);
    expect(out.reason).toBe('no upstream content hash to compare');
  });

  it('treats a PRE with no upstream hash as same', () => {
    const out = sameSessionDecision({ summary: { records_meta: {} } }, postDocDiff);
    expect(out.same).toBe(true);
    expect(out.reason).toBe('no upstream content hash to compare');
  });

  it('same when the arrays are equal', () => {
    const out = sameSessionDecision(preDoc, postDocSame);
    expect(out.same).toBe(true);
    expect(out.pre).toEqual(['same']);
    expect(out.post).toEqual(['same']);
  });

  it('NOT same when the arrays differ, with the exact recapture-back-to-back reason', () => {
    const out = sameSessionDecision(preDoc, postDocDiff);
    expect(out.same).toBe(false);
    expect(out.pre).toEqual(['same']);
    expect(out.post).toEqual(['changed']);
    expect(out.reason).toBe(
      'upstream content_hash changed since the PRE capture (pre [same] vs post [changed]) — recapture PRE and POST back-to-back in one session',
    );
  });

  it('NOT same when the POST lost the upstream hash entirely', () => {
    const out = sameSessionDecision(preDoc, { summary: { records_meta: {} } });
    expect(out.same).toBe(false);
    expect(out.post).toEqual([]);
  });
});

// ── 6. prePathFor ───────────────────────────────────────────────────────────
describe('prePathFor', () => {
  it('replaces a POSIX /post/ segment with /pre/', () => {
    expect(prePathFor('docs/reports/golden/link_massing/post/sources.json'))
      .toBe('docs/reports/golden/link_massing/pre/sources.json');
  });

  it('normalises a Windows path first, then replaces', () => {
    expect(prePathFor('docs\\reports\\golden\\link_massing\\post\\sources.json'))
      .toBe('docs/reports/golden/link_massing/pre/sources.json');
  });

  it('replaces the LAST /post/ when the slug itself contains one', () => {
    expect(prePathFor('/repo/post_zone/step/post/x.json')).toBe('/repo/post_zone/step/pre/x.json');
  });

  it('returns null when there is no /post/ segment, or for a non-string', () => {
    expect(prePathFor('docs/reports/golden/link_massing/pre/sources.json')).toBeNull();
    expect(prePathFor('')).toBeNull();
    expect(prePathFor(null)).toBeNull();
    expect(prePathFor(undefined)).toBeNull();
  });
});

// ── wiring: capture-step-golden.js#postCaptureGuard (orchestrator-added) ─────
describe('capture-step-golden postCaptureGuard — refuses a POST capture on a non-PASS step', () => {
  const harness = require('../../scripts/analysis/capture-step-golden.js');
  const fs = require('node:fs');
  const path = require('node:path');

  it('RED: a SCALABLE gate-B FAIL refuses, naming the word and the step-validate exit', () => {
    const run = () => ({ status: 1, stdout: allPassStdout('| SCALABLE | FAIL | FAIL (gate B — unledgered) |') });
    expect(() => harness.postCaptureGuard({ step: 'scripts/load-parcels.js', runStepValidate: run }))
      .toThrow(/REFUSING POST capture of \w+: five-word verdict not PASS: SCALABLE \(gate B\) \(step-validate --step=\w+ --fast exit 1\)/);
  });

  it('GREEN: five-word PASS allows, resolving the slug from scripts/manifest.json', () => {
    let asked = '';
    const run = (slug: string) => { asked = slug; return { status: 0, stdout: allPassStdout() }; };
    const g = harness.postCaptureGuard({ step: 'scripts/load-parcels.js', runStepValidate: run });
    expect(g.decision.allow).toBe(true);
    expect(g.slug).toBe(asked);
  });

  it('a step no manifest entry points at is refused (nothing can vouch for it)', () => {
    expect(() => harness.postCaptureGuard({ step: 'scripts/no-such-step.js', runStepValidate: () => ({ status: 0, stdout: allPassStdout() }) }))
      .toThrow(/no scripts\/manifest.json entry/);
  });

  it('main() runs the guard BEFORE the step is spawned, and the same-session check before the rerun proof', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../scripts/analysis/capture-step-golden.js'), 'utf8');
    const main = src.slice(src.indexOf('async function main()'));
    expect(main.indexOf('postCaptureGuard({ step })')).toBeGreaterThan(-1);
    expect(main.indexOf('postCaptureGuard({ step })')).toBeLessThan(main.indexOf('await capture({'));
    expect(main.indexOf('sameSessionDecision(preDoc, doc)')).toBeLessThan(main.indexOf('runRerunProof({'));
  });
});
