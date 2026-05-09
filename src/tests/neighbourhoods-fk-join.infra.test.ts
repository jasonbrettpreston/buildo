// 🔗 SPEC LINK: docs/specs/01-pipeline/57_source_neighbourhoods.md §2
//             docs/specs/01-pipeline/47_pipeline_script_protocol.md §18.2
//             docs/specs/00-architecture/01_database_schema.md (mig 109 fk_permits_neighbourhoods)
//
// Layer 1 SQL-shape regression-lock for the neighbourhoods FK-correct join.
//
// Why this test exists (WF3 2026-05-08):
//   permits.neighbourhood_id is a FK to neighbourhoods.id (the SERIAL) per
//   migration 109 step 4 (fk_permits_neighbourhoods VALIDATEd against
//   237K permits after step 4b nullified non-matching rows). Four
//   production code paths joined on n.neighbourhood_id = p.neighbourhood_id
//   instead — silent miss because both columns are INTEGER. Every permit
//   got the WRONG neighbourhood (and consequently wrong neighbourhood
//   premium for cost estimates, wrong income display in the lead feed,
//   wrong grouping in admin market-metrics dashboards).
//
//   The 4 affected sites + their truth-rooted siblings:
//     WRONG (silently miss-matched, fixed in this WF):
//       - src/features/leads/lib/get-lead-feed.ts:224
//       - scripts/compute-cost-estimates.js:94
//       - src/lib/market-metrics/queries.ts:344
//       - src/lib/market-metrics/queries.ts:358
//     CORRECT (already FK-aligned):
//       - src/lib/leads/lead-detail-query.ts (n.id = p.neighbourhood_id)
//       - src/lib/leads/lead-inspect-query.ts (n.id = p.neighbourhood_id, post-WF2 76dd665 revert)
//       - src/app/api/permits/[id]/route.ts (WHERE id = $1 with permit.neighbourhood_id)
//
// What this test catches: any future regression that re-introduces the
// wrong-join shape in any of the 4 sites at the text level. Layer 2
// (live-DB) at neighbourhoods-fk-join.db.test.ts proves the join works
// end-to-end against the real schema.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../..');

interface Site {
  /** Human-readable label used in test names + assertion messages. */
  label: string;
  /** Absolute path to the source file. */
  file: string;
}

const FIXED_SITES: Site[] = [
  {
    label: 'src/features/leads/lib/get-lead-feed.ts',
    file: path.join(REPO_ROOT, 'src', 'features', 'leads', 'lib', 'get-lead-feed.ts'),
  },
  {
    label: 'scripts/compute-cost-estimates.js',
    file: path.join(REPO_ROOT, 'scripts', 'compute-cost-estimates.js'),
  },
  {
    label: 'src/lib/market-metrics/queries.ts',
    file: path.join(REPO_ROOT, 'src', 'lib', 'market-metrics', 'queries.ts'),
  },
];

const TRUTH_SITES: Site[] = [
  {
    label: 'src/lib/leads/lead-detail-query.ts',
    file: path.join(REPO_ROOT, 'src', 'lib', 'leads', 'lead-detail-query.ts'),
  },
  {
    label: 'src/lib/leads/lead-inspect-query.ts',
    file: path.join(REPO_ROOT, 'src', 'lib', 'leads', 'lead-inspect-query.ts'),
  },
];

const sourceFor = new Map<string, string>();

beforeAll(() => {
  for (const site of [...FIXED_SITES, ...TRUTH_SITES]) {
    sourceFor.set(site.file, fs.readFileSync(site.file, 'utf-8'));
  }
});

describe('neighbourhoods FK-correct join — Layer 1 SQL-shape regression-lock (WF3 2026-05-08)', () => {
  // ── Forbid the wrong shape across the 4 fixed sites ─────────────────────

  describe.each(FIXED_SITES)('$label', ({ file }) => {
    it('does NOT join on n.neighbourhood_id = p.neighbourhood_id (silent-miss bug class)', () => {
      const src = sourceFor.get(file);
      expect(src).toBeDefined();
      expect(src!).not.toMatch(/n\.neighbourhood_id\s*=\s*p\.neighbourhood_id/);
    });

    it('joins on n.id = p.neighbourhood_id (FK-correct per mig 109 fk_permits_neighbourhoods)', () => {
      const src = sourceFor.get(file);
      expect(src).toBeDefined();
      expect(src!).toMatch(/JOIN\s+neighbourhoods\s+n\s+ON\s+n\.id\s*=\s*p\.neighbourhood_id/i);
    });
  });

  // ── Truth-rooted siblings — confirm they STILL use the correct shape ────
  // (regression-lock against someone "fixing" them in the wrong direction)

  describe.each(TRUTH_SITES)('$label (truth-rooted reference)', ({ file }) => {
    it('continues to join on n.id = p.neighbourhood_id', () => {
      const src = sourceFor.get(file);
      expect(src).toBeDefined();
      expect(src!).toMatch(/JOIN\s+neighbourhoods\s+n\s+ON\s+n\.id\s*=\s*p\.neighbourhood_id/i);
    });
  });
});
