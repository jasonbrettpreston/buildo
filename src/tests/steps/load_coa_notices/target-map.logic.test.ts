// SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §D6
//
// RED/GREEN lock for the CoA variance → McBylaw `dsl_target` phrase map
// (`scripts/lib/coa-notices/target-map.json`) and the mapping rule it feeds
// (`mapTarget` in `scripts/lib/coa-notices/parse-values.js`).
//
// T-MAP-1 pins every entry's `target` and `unit` to `scripts/seeds/bylaw/vocab.json`
// (`dsl_target`); T-MAP-2 locks the exact `{target, target_status}` output on the REQUIRED
// sentence of a variance. Ambiguity is fixed by adding `none` phrases, never by a tiebreak.
//
// ALL test sentences are SYNTHETIC — invented text, no real person, lot or by-law named.
import { describe, it, expect } from 'vitest';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');

// eslint-disable-next-line @typescript-eslint/no-require-imports -- JSON + CJS module under test
const TARGET_MAP = require(
  path.join(REPO_ROOT, 'scripts/lib/coa-notices/target-map.json'),
) as {
  $comment: string;
  version: string;
  entries: Array<{ target: string; unit: string; any: string[]; none: string[] }>;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS module under test
const VOCAB = require(path.join(REPO_ROOT, 'scripts/seeds/bylaw/vocab.json')) as {
  dsl_target: Record<string, { unit: string; patterns: string[] }>;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS module under test
const { mapTarget } = require(
  path.join(REPO_ROOT, 'scripts/lib/coa-notices/parse-values.js'),
) as {
  mapTarget: (
    text: unknown,
    entries: Array<{ target: string; any: string[]; none: string[] }>,
  ) => { target: string; target_status: string; matched: string[] };
};

type Entry = { target: string; unit: string; any: string[]; none: string[] };

// RED BASELINE (Spec 08 §11.4, both directions): `COA_TARGET_MAP=naive` swaps the committed map for the
// naive one the plan measured (G9/G10) — every McBylaw `dsl_target` with its own `patterns` as `any` and
// no `none` phrases. T-MAP-2 must FAIL under it (red evidence: docs/reports/red-evidence/load_coa_notices/).
const entries: Entry[] = process.env.COA_TARGET_MAP === 'naive'
  ? Object.entries(VOCAB.dsl_target).map(([target, v]) => ({ target, unit: v.unit, any: v.patterns.map((p) => p.toLowerCase()), none: [] }))
  : TARGET_MAP.entries;

/**
 * The T-MAP-1 checker. Returns the list of problems with `list`; an empty list means
 * every target is a McBylaw `dsl_target` with its unit, ids are unique and every phrase
 * is a non-empty lower-case string. Shared by the real entries and the injected-copy
 * NEGATIVE assertion below.
 */
function checkEntries(list: Entry[], dslTarget: Record<string, { unit: string }>): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const entry of list) {
    const known = Object.prototype.hasOwnProperty.call(dslTarget, entry.target)
      ? dslTarget[entry.target]
      : undefined;
    if (!known) {
      problems.push(`unknown dsl_target: ${entry.target}`);
    } else if (known.unit !== entry.unit) {
      problems.push(`unit mismatch for ${entry.target}: map has ${entry.unit}, vocab has ${known.unit}`);
    }
    if (seen.has(entry.target)) problems.push(`duplicate target id: ${entry.target}`);
    seen.add(entry.target);
    for (const phrase of [...entry.any, ...entry.none]) {
      if (typeof phrase !== 'string' || phrase.trim() === '') {
        problems.push(`empty phrase on ${entry.target}`);
      } else if (phrase !== phrase.toLowerCase()) {
        problems.push(`non-lower-case phrase on ${entry.target}: ${phrase}`);
      }
    }
  }
  return problems;
}

describe('T-MAP target-map', () => {
  it('T-MAP-1 every target is a McBylaw dsl_target with its unit', () => {
    expect(checkEntries(entries, VOCAB.dsl_target)).toEqual([]);

    // NEGATIVE: a synthetic entry with an unknown target id fails the SAME check.
    const injected: Entry[] = [
      ...entries,
      { target: 'fsi_typo', unit: 'ratio', any: ['x'], none: [] },
    ];
    const injectedProblems = checkEntries(injected, VOCAB.dsl_target);
    expect(injectedProblems).toContain('unknown dsl_target: fsi_typo');
  });

  it('T-MAP-2 exact outputs', () => {
    const map = (
      sentence: string,
    ): { target: string; target_status: string; matched: string[] } =>
      mapTarget(sentence, entries);

    // G9: the FSI sentence must NOT map to required_lot_area_m2.
    const fsiSentence = map(
      'the By-law permits a maximum floor space index of 0.6 times the area of the lot.',
    );
    expect(fsiSentence.target).toBe('fsi');
    expect(fsiSentence.target_status).toBe('mapped');
    expect(fsiSentence.matched).toEqual(['fsi']);

    expect(map('the By-law permits a maximum of 0.6 times the lot area.')).toMatchObject({
      target: 'fsi',
      target_status: 'mapped',
    });

    expect(map('the By-law requires a minimum lot frontage of 12 metres.')).toMatchObject({
      target: 'required_lot_frontage_m',
      target_status: 'mapped',
    });

    // G10: the lot-frontage qualifier does not map to frontage.
    expect(
      map(
        'the By-law requires a minimum side yard setback of 1.2 metres where the required minimum lot frontage is less than 12 metres.',
      ),
    ).toMatchObject({ target: 'side_setback_m', target_status: 'mapped' });

    expect(
      map(
        'the By-law permits a maximum building length of 17 metres for a lot with a lot frontage under 12 metres.',
      ),
    ).toMatchObject({ target: 'building_length_m', target_status: 'mapped' });

    expect(map('the By-law permits a maximum lot coverage of 33 percent.')).toMatchObject({
      target: 'lot_coverage_pct',
      target_status: 'mapped',
    });

    expect(
      map('the By-law permits a maximum height of the exterior main walls of 7 metres.'),
    ).toMatchObject({ target: 'main_wall_height_m', target_status: 'mapped' });

    expect(map('the By-law permits a maximum building height of 10 metres.')).toMatchObject({
      target: 'height_m',
      target_status: 'mapped',
    });

    expect(map('the By-law requires a minimum rear yard setback of 7.5 metres.')).toMatchObject({
      target: 'rear_setback_m',
      target_status: 'mapped',
    });

    expect(map('the By-law requires a minimum front yard setback of 6 metres.')).toMatchObject({
      target: 'front_setback_m',
      target_status: 'mapped',
    });

    // Eaves encroachment: `encroachment_m` is suppressed by its `eaves` none phrase.
    expect(map('the By-law permits eaves to encroach a maximum of 0.9 metres.')).toMatchObject({
      target: 'unmapped',
      target_status: 'unmapped',
      matched: [],
    });

    // Two setbacks in one sentence → ambiguous, matched sorted, no tiebreak.
    expect(
      map(
        'the By-law requires a minimum front yard setback of 6 metres and a minimum rear yard setback of 7.5 metres.',
      ),
    ).toEqual({
      target: 'ambiguous',
      target_status: 'ambiguous',
      matched: ['front_setback_m', 'rear_setback_m'],
    });

    expect(map('the By-law requires a minimum lot area of 370 square metres.')).toMatchObject({
      target: 'required_lot_area_m2',
      target_status: 'mapped',
    });
  });
});
