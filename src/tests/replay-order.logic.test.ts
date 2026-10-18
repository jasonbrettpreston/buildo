// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-DQ
//
// R-DQ (operator y 2026-10-18): within one step, `capture-step-golden.js --replay-all` retakes every
// plain/env capture first and every bracket capture last. A bracket's heal is a real step write and
// its restore puts back only the perturbed column, so plain captures on both sides of a bracket
// would observe two table states (link_wsib matched_at, measured 2026-10-18).

import { describe, expect, it } from 'vitest';
import * as path from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS harness */
const harness = require(path.join(process.cwd(), 'scripts/analysis/capture-step-golden.js')) as {
  replayOrder: (names: string[], entries: Record<string, { via: string }>) => string[];
  replayAll: (repoRoot: string, base: Date) => { blocks: Array<{ rel: string; via: string }>; errors: unknown[] };
};

describe('R-DQ — --replay-all retakes a step\'s brackets after its plain/env captures', () => {
  it('orders plain/env by filename, then brackets by filename', () => {
    const entries = {
      'post/a-forced.json': { via: 'bracket' },
      'post/permits.json': { via: 'plain' },
      'post/z.json': { via: 'env' },
    };
    expect(harness.replayOrder(['z.json', 'permits.json', 'a-forced.json', 'sources.json'], entries))
      .toEqual(['permits.json', 'sources.json', 'z.json', 'a-forced.json']);
  });

  it('on the committed fleet, no step retakes a plain/env capture after one of its brackets', () => {
    const { blocks } = harness.replayAll(process.cwd(), new Date('2026-10-18T00:00:00Z'));
    const seenBracket = new Set<string>();
    const late: string[] = [];
    for (const b of blocks) {
      const slug = b.rel.split('/')[3]!;
      if (!b.rel.includes('/post/')) continue;
      if (b.via === 'bracket') seenBracket.add(slug);
      else if (seenBracket.has(slug)) late.push(b.rel);
    }
    expect(late).toEqual([]);
    expect(blocks.some((b) => b.rel.startsWith('docs/reports/golden/link_wsib/post/') && b.via === 'bracket')).toBe(true);
  });
});
