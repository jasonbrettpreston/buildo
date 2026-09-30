// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-BD; docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.3
//
// R-BD (Spec 124 §5) — "retired input argv <-> declared filesystem input".
// GOLD-PRE (Spec 122 §5.3, `preInvocationsMissing`) matches a PRE capture to a
// declared invocation by key `${chain}::${args.join(',')}`. load_wsib's legacy
// loader only loads via `--file <csv>`, so its PRE captures carry that pair
// while the converted step reads the same file through a declared
// `kind:"filesystem"` external and retires `--file` (deviation WS-D4). A PRE
// doc stands in for the declared key ONLY when (a) same chain, args = declared
// args + one [flag, path] pair whose flag is named verbatim in a deviations[].from;
// (b) exactly one filesystem external whose path-pattern basename matches the
// path's basename (stem case-insensitive, extension case-sensitive); (c) every
// table_state content_hash equals the paired POST doc's. `--full` is a mode
// flag, never a retired input.
//
// This suite locks the two NEW exports this fix introduces:
//   * `retiredInputPreMatch(invocation, preDoc, postDoc, descriptor)` — the
//     per-invocation recognizer (GREEN when the argv pair IS the retired seam;
//     RED on every near-miss: extension case, undeclared flag, flag-prefix,
//     bad basename, hash drift, missing external, chain mismatch, extra arg).
//   * `computePreInvocationsMissing(slug, invocations, preDocs, postDocs,
//     descriptor)` — the array-level sweep, which must still exclude the
//     existing GOLD_PRE_KNOWN_GAPS pins.
//
// RED LOCK: neither export exists yet, so every `it` here fails today with
// `sv.<name> is not a function` — the expected red evidence for brief 1/3.
// Brief 2/3 implements them; this suite is the both-directions proof.

import { describe, it, expect } from 'vitest';

// `step-validate.mjs` is a plain `.mjs` with inferred (loosely-typed)
// signatures; the suite imports it for its exports only, as the sibling gate
// suites (e.g. gate-matrix-statuses.infra.test.ts) do.
import * as stepValidateRaw from '../../scripts/analysis/step-validate.mjs';

type Inv = { chain: string; args: string[] };
type Doc = { chain: string; args: string[]; table_state?: { table: string; content_hash: string }[] };
type Desc = Record<string, unknown>;

const sv = stepValidateRaw as unknown as {
  retiredInputPreMatch: (inv: Inv, pre: Doc, post: Doc | undefined, d: Desc) => { match: boolean; reason: string };
  computePreInvocationsMissing: (slug: string, inv: Inv[], pre: Doc[], post: Doc[], d: Desc) => string[];
};

// ---------------------------------------------------------------------------
// Fixtures — the REAL load_wsib shape (descriptor deviation + a filesystem
// external whose `path` glob is `data/BusinessClassificationDetails*.csv`).
// ---------------------------------------------------------------------------

const TS = [{ table: 'wsib_registry', content_hash: '9d0c2316ea47dedc36679612bd1bd733' }];
const FILE = 'C:/Users/User/Buildo-wt-wsib/data/BusinessClassificationDetails(2025).csv';

/** The descriptor shape `load_wsib` actually ships: one filesystem external
 * (the csv glob) plus the declared deviation naming the retired argv seam. */
const desc: Desc = {
  inputs: {
    reads: {
      externals: [
        { id: 'local:wsib', kind: 'filesystem', path: 'data/BusinessClassificationDetails*.csv' },
      ],
    },
  },
  deviations: [{ from: 'the argv `--file <csv>` input seam (legacy :87-133)' }],
};

const pre: Doc = { chain: 'sources', args: ['--file', FILE], table_state: TS };
const post: Doc = { chain: 'sources', args: [], table_state: TS };
const inv: Inv = { chain: 'sources', args: [] };

/** Shallow-clone a capture doc, overriding only the fields a test perturbs. */
function doc(base: Doc, over: Partial<Doc>): Doc {
  return { ...base, ...over };
}

// ---------------------------------------------------------------------------
// T1-T11 — `retiredInputPreMatch`, per invocation.
// ---------------------------------------------------------------------------

describe('R-BD — retiredInputPreMatch', () => {
  it('T1 GREEN: the retired `--file <csv>` pair IS the declared retired seam', () => {
    expect(sv.retiredInputPreMatch(inv, pre, post, desc).match).toBe(true);
  });

  it('T2 GREEN: basename stem match is case-insensitive', () => {
    const lowerPre = doc(pre, {
      args: ['--file', 'C:/Users/User/Buildo-wt-wsib/data/businessclassificationdetails(2025).csv'],
    });
    expect(sv.retiredInputPreMatch(inv, lowerPre, post, desc).match).toBe(true);
  });

  it('T3 RED: extension case differs', () => {
    const upperExtPre = doc(pre, {
      args: ['--file', 'C:/Users/User/Buildo-wt-wsib/data/BusinessClassificationDetails(2025).CSV'],
    });
    expect(sv.retiredInputPreMatch(inv, upperExtPre, post, desc).match).toBe(false);
  });

  it('T4 RED: flag is not named in any deviation', () => {
    const otherFlagPre = doc(pre, { args: ['--input', FILE] });
    expect(sv.retiredInputPreMatch(inv, otherFlagPre, post, desc).match).toBe(false);
  });

  it('T5 RED: flag is only a PREFIX of a deviation word', () => {
    const prefixDesc: Desc = {
      ...desc,
      deviations: [{ from: 'the argv `--filename` seam' }],
    };
    expect(sv.retiredInputPreMatch(inv, pre, post, prefixDesc).match).toBe(false);
  });

  it('T6 RED: basename misses the declared filesystem pattern', () => {
    const otherCsvPre = doc(pre, {
      args: ['--file', 'C:/Users/User/Buildo-wt-wsib/data/other.csv'],
    });
    expect(sv.retiredInputPreMatch(inv, otherCsvPre, post, desc).match).toBe(false);
  });

  it('T7 RED: content_hash drift, missing table, or no post doc', () => {
    const driftedPre = doc(pre, {
      table_state: [{ table: 'wsib_registry', content_hash: '00000000000000000000000000000000' }],
    });
    expect(sv.retiredInputPreMatch(inv, driftedPre, post, desc).match).toBe(false);

    const shortPost = doc(post, { table_state: [] });
    expect(sv.retiredInputPreMatch(inv, pre, shortPost, desc).match).toBe(false);

    expect(sv.retiredInputPreMatch(inv, pre, undefined, desc).match).toBe(false);
  });

  it('T8 RED: no filesystem external, or more than one', () => {
    const emptyDesc: Desc = {
      ...desc,
      inputs: { reads: { externals: [] } },
    };
    expect(sv.retiredInputPreMatch(inv, pre, post, emptyDesc).match).toBe(false);

    const twoExternalDesc: Desc = {
      ...desc,
      inputs: {
        reads: {
          externals: [
            { id: 'local:wsib', kind: 'filesystem', path: 'data/BusinessClassificationDetails*.csv' },
            { id: 'local:other', kind: 'filesystem', path: 'data/other*.csv' },
          ],
        },
      },
    };
    expect(sv.retiredInputPreMatch(inv, pre, post, twoExternalDesc).match).toBe(false);
  });

  it('T9 RED: chains differ between the declared invocation and the pre doc', () => {
    const nonePre = doc(pre, { chain: 'none' });
    expect(sv.retiredInputPreMatch(inv, nonePre, post, desc).match).toBe(false);
  });

  it('T10 RED: args are the declared args plus the pair PLUS an extra arg', () => {
    const extraArgPre = doc(pre, { args: ['--file', FILE, '--extra'] });
    expect(sv.retiredInputPreMatch(inv, extraArgPre, post, desc).match).toBe(false);
  });

  it('T11 RED: enrich_parcels `--full` shape is not a retired filesystem input', () => {
    const fullDesc: Desc = {
      ...desc,
      deviations: [{ from: 'the forced `--full` enrichment invocation' }],
    };
    const fullInv: Inv = { chain: 'none', args: [] };
    const fullPre: Doc = { chain: 'none', args: ['--full'], table_state: TS };
    const fullPost: Doc = { chain: 'none', args: [], table_state: TS };
    expect(sv.retiredInputPreMatch(fullInv, fullPre, fullPost, fullDesc).match).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T12-T15 — `computePreInvocationsMissing`, the array-level sweep.
// ---------------------------------------------------------------------------

describe('R-BD — computePreInvocationsMissing', () => {
  it('T12 GREEN: a content_hash-matched retired pre counts as present', () => {
    const missing = sv.computePreInvocationsMissing(
      'load_wsib',
      [inv, { chain: 'none', args: [] }],
      [pre, doc(pre, { chain: 'none' })],
      [post, doc(post, { chain: 'none' })],
      desc,
    );
    expect(missing).toEqual([]);
  });

  it('T13 RED: content_hash drift makes both invocations missing', () => {
    const drifted = doc(pre, {
      table_state: [{ table: 'wsib_registry', content_hash: '00000000000000000000000000000000' }],
    });
    const missing = sv.computePreInvocationsMissing(
      'load_wsib',
      [inv, { chain: 'none', args: [] }],
      [drifted, doc(drifted, { chain: 'none' })],
      [post, doc(post, { chain: 'none' })],
      desc,
    );
    expect(missing).toEqual(['sources::', 'none::']);
  });

  it('T14: `--full` shape — unpinned slug reported, existing pin excluded', () => {
    const fullDesc: Desc = {
      ...desc,
      deviations: [{ from: 'the forced `--full` enrichment invocation' }],
    };
    const invocations: Inv[] = [{ chain: 'none', args: [] }];
    const preDocs: Doc[] = [{ chain: 'none', args: ['--full'], table_state: TS }];
    const postDocs: Doc[] = [{ chain: 'none', args: [], table_state: TS }];

    expect(sv.computePreInvocationsMissing('fixture_slug', invocations, preDocs, postDocs, fullDesc)).toEqual(['none::']);
    expect(sv.computePreInvocationsMissing('enrich_parcels', invocations, preDocs, postDocs, fullDesc)).toEqual([]);
  });

  it('T15: an exact-key pre still counts, even with an empty descriptor', () => {
    const missing = sv.computePreInvocationsMissing(
      'fixture_slug',
      [{ chain: 'sources', args: [] }],
      [{ chain: 'sources', args: [], table_state: TS }],
      [{ chain: 'sources', args: [], table_state: TS }],
      {},
    );
    expect(missing).toEqual([]);
  });
});
