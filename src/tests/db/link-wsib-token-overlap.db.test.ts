// SPEC LINK: docs/specs/01-pipeline/60_shared_steps.md
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md
//
// LW-D18 (2026-08-29) — the tier3_token_overlap predicate (LW-D14) still passed 15-25%
// precision (60-row live sample, S/lwd14_precision_recall.md) because 80% of the
// confirmed-DIFFERENT precision failures shared ONE of 15 industry-generic words the
// declared stopword list did not yet cover, and the tokenizer split on whitespace only —
// a name differing from its true match purely by punctuation (T.T.S. vs TTS) never
// overlapped. Fix: widen `link-wsib.descriptor.json`'s `tier3_token_overlap` stopword
// list with the 15 words, and strip `-`/`.`/`'`/`&`/`+` before tokenizing
// (`tokenOverlapClause`, scripts/lib/compute/link-wsib.js).
//
// This file locks BOTH halves against `tokenOverlapClause`'s own generated SQL, executed
// for real (regexp_replace/regexp_split_to_array/unnest/array_agg are built-in Postgres
// functions — no table dependency, safe against any reachable Postgres incl. the live
// dev DB). Each word-class fixture is a NEGATIVE control: two synthetic, unrelated
// companies whose ONLY shared token is one of the 15 newly-declared stopwords (plus an
// already-declared one, matching the real evidence pairs) — under the OLD (narrower)
// list that shared word was still "signal" and the pair falsely overlapped; under the
// FIX it must not. The T.T.S. fixture is the inverse: a POSITIVE control proving the
// punctuation strip makes a genuine punctuation-only variant overlap.
//
// Run: BUILDO_TEST_DB=1 npx vitest run src/tests/db/link-wsib-token-overlap.db.test.ts --no-file-parallelism

import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();
const REPO_ROOT = path.resolve(__dirname, '../../../');

// eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS compute module
const compute = require(path.join(REPO_ROOT, 'scripts/lib/compute/link-wsib.js')) as {
  tokenOverlapClause: (stopwords: string[], leftExpr: string, rightExpr: string) => string;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the real descriptor
const descriptor = require(path.join(REPO_ROOT, 'scripts/link-wsib.descriptor.json')) as {
  checks: Array<{ id: string; expect?: { stopwords?: string[] } }>;
};

function currentStopwords(): string[] {
  const check = descriptor.checks.find((c) => c.id === 'tier3_token_overlap');
  const stopwords = check?.expect?.stopwords;
  if (!stopwords) throw new Error('descriptor has no tier3_token_overlap check with expect.stopwords');
  return stopwords;
}

/** The LW-D14 list, BEFORE LW-D18's 15-word widening — frozen here so the OLD-list
 * assertions below can never accidentally read the live (now-wider) declared list. */
const LW_D14_STOPWORDS = [
  'CONSTRUCTION', 'CONTRACTING', 'BUILDERS', 'HOMES', 'GROUP', 'INC', 'LTD', 'LIMITED',
  'CO', 'COMPANY', 'CORP', 'ENTERPRISES', 'DEVELOPMENTS', 'SERVICES', 'ONTARIO', 'CANADA',
];

const LW_D18_NEW_WORDS = [
  'GENERAL', 'RENOVATION', 'RENOVATIONS', 'MANAGEMENT', 'DESIGN', 'BUILD', 'CUSTOM',
  'HOME', 'IMPROVEMENT', 'IMPROVEMENTS', 'BUILDING', 'ASSOCIATES', 'TOP', 'ALL', 'QUALITY',
];

async function overlap(sqlPool: NonNullable<ReturnType<typeof getTestPool>>, stopwords: string[], left: string, right: string): Promise<boolean> {
  const clause = compute.tokenOverlapClause(stopwords, `'${left.replace(/'/g, "''")}'`, `'${right.replace(/'/g, "''")}'`);
  const r = await sqlPool.query(`SELECT ${clause} AS overlap`);
  return r.rows[0].overlap === true;
}

describe.skipIf(!dbAvailable())('LW-D18 — tokenOverlapClause: widened stopwords + punctuation strip', () => {
  if (!pool) {
    if (process.env.BUILDO_TEST_DB === '1' || process.env.CI === 'true') {
      throw new Error('dbAvailable() is true but pool is missing — refusing to silently register zero tests.');
    }
    return;
  }

  it('the descriptor\'s declared list is EXACTLY the LW-D14 set plus the 15 LW-D18 words (no drift, no accidental drop)', () => {
    const live = [...currentStopwords()].sort();
    const expected = [...LW_D14_STOPWORDS, ...LW_D18_NEW_WORDS].sort();
    expect(live).toEqual(expected);
  });

  // One negative-control fixture per LW-D18 word class — a synthetic pair whose ONLY
  // shared non-numeric token is the named word (plus, in several, an already-LW-D14
  // stopword, mirroring the real evidence pairs exactly). UPPERCASE throughout: the real
  // *_normalized columns tokenOverlapClause reads are always uppercase, and the stopword
  // comparison is case-sensitive — a mixed-case fixture would silently never match a
  // stopword at all, passing "under" for the wrong reason (masking the class it targets).
  const WORD_CLASS_FIXTURES: Array<[label: string, left: string, right: string]> = [
    ['GENERAL', 'ASTRO GENERAL CONTRACTING', 'ARC GENERAL CONTRACTING'],
    ['RENOVATION/RENOVATIONS', 'INNOVATIVE RENOVATIONS', 'I & R RENOVATIONS'],
    ['MANAGEMENT', 'SPM CONSTRUCTION MANAGEMENT', 'SWINGHAMMER CONSTRUCTION MANAGEMENT'],
    ['DESIGN+BUILD', 'TRC DESIGN BUILD', 'TAAK DESIGN BUILD'],
    ['CUSTOM', 'ROBERTS CUSTOM HOMES', 'RON CUSTOM HOMES'],
    ['HOME/IMPROVEMENT', 'ARTISTIC HOME IMPROVEMENTS', 'ARA HOME IMPROVEMENT'],
    ['BUILDING', 'MST BUILDING GROUP', 'MGB BUILDING GROUP'],
    ['ASSOCIATES', 'PS ASSOCIATES', 'XYZ ASSOCIATES'],
    ['TOP', 'TOP GALO CONSTRUCTION', 'TOP FRAME CONSTRUCTION'],
    ['ALL', 'ALL AROUND CONTRACTING', 'ALL WIN CONTRACTING'],
    ['QUALITY', 'ELITE QUALITY CONSTRUCTION', 'EUROPEAN QUALITY CONSTRUCTION'],
  ];

  for (const [label, left, right] of WORD_CLASS_FIXTURES) {
    it(`${label}: two unrelated companies sharing ONLY "${label.split('/')[0]}" (± an already-stopworded word) do NOT overlap under the LW-D18 list`, async () => {
      const under = await overlap(pool, currentStopwords(), left, right);
      expect(under, `"${left}" vs "${right}" — LW-D18 list must reject this as a false match`).toBe(false);
    });

    it(`${label}: the SAME pair DID falsely overlap under the pre-LW-D18 (LW-D14-only) stopword list — proves the fixture is genuinely discriminating`, async () => {
      const before = await overlap(pool, LW_D14_STOPWORDS, left, right);
      expect(before, `"${left}" vs "${right}" — the OLD list must have treated this as a match (that is the bug LW-D18 fixes)`).toBe(true);
    });
  }

  it('T.T.S. vs TTS: a punctuation-only variant overlaps AFTER the strip (positive control)', async () => {
    const after = await overlap(pool, currentStopwords(), 'T.T.S. CONTRACTING', 'TTS ENTERPRISES INC.');
    expect(after, 'periods stripped before tokenizing — T.T.S. must tokenize identically to TTS').toBe(true);
  });

  it('T.T.S. vs TTS: did NOT overlap before the punctuation strip (proves the fixture is genuinely discriminating)', async () => {
    // Simulate the pre-fix tokenizer directly: split on whitespace only, no strip.
    const clause = `(SELECT array_agg(t) FROM unnest(regexp_split_to_array('T.T.S. CONTRACTING', '\\s+')) t WHERE t <> ALL(ARRAY['CONTRACTING']::text[]) AND t !~ '^[0-9]+$') && (SELECT array_agg(t) FROM unnest(regexp_split_to_array('TTS ENTERPRISES INC', '\\s+')) t WHERE t <> ALL(ARRAY['ENTERPRISES','INC']::text[]) AND t !~ '^[0-9]+$')`;
    const r = await pool.query(`SELECT ${clause} AS overlap`);
    expect(r.rows[0].overlap === true, 'pre-strip, "T.T.S." and "TTS" are different tokens — no overlap').toBe(false);
  });

  it('hyphens/apostrophes/plus are also stripped (Cole\'s ≡ Coles token, A+B ≡ AB token) — direct regexp_replace probe', async () => {
    const r = await pool.query(`SELECT regexp_replace($1, '[-.''&+]', '', 'g') AS stripped`, ["A-B.C'D&E+F"]);
    expect(r.rows[0].stripped).toBe('ABCDEF');
  });
});
