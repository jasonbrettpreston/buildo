// SPEC LINK: docs/specs/00_engineering_standards.md §2.3 (:45-47)
//
// task-441 FINAL.6 (RR-0385 item 6, tests that mirror the engineering standards). The rule, :47:
//   "Do NOT use the non-null assertion operator (`!`) unless the value's existence is mathematically guaranteed by a prior validation
//    step. If using `!`, you must document why in an inline comment."
// TESTED: "If using `!`, you must document why in an inline comment". DOCUMENTED means a comment (leading or trailing comment ranges,
// collected over the file) touches the line of the `!` or the line directly above it (plan Q3).
// NOT TESTED: "mathematically guaranteed" (a judgment). The first sentence of §2.3 (:46) is already compiler-enforced wherever no `!`
// overrides it (tsconfig.json `strict` and `noUncheckedIndexedAccess`; mobile/tsconfig.json `strict`).
// OTHER CHECKS: Biome's recommended noNonNullAssertion also covers two folders (src/features/leads and src/lib/observability, biome.json);
// it warns on every `!`, documented or not. This test is the comment-present half of §2.3, the half no other check reads.
// SCOPE: tracked src/**/*.ts(x) minus src/tests/**, *.test.* and *.d.ts; plus tracked mobile/**/*.ts(x) minus mobile/__tests__/**, *.test.*
// and anything SKIP (scripts/analysis/gates/mobile-never-do.mjs) matches. 535 files at the launch head.
// LIMITS (stated, not widened): any comment counts as "document why"; the test cannot read whether the comment gives a reason.
// Files come from `git ls-files` (the src/tests/script-source-scan.ts pattern), so a staged file is seen. No DB, no network.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { SKIP } from '../../scripts/analysis/gates/mobile-never-do.mjs';

const ROOT = process.cwd();

/**
 * UNDOCUMENTED `!` per file, a CEILING (plan review round 1 ruling), measured by the lane at its own head just before commit 1:
 * 166 in 60 files (148 in 49 src files, 18 in 11 mobile files). Counts are AST nodes (`x!!` counts twice).
 * A file may hold FEWER than its number: nothing is edited when a `!` is fixed or documented. A file with MORE than its number, or a
 * file not in this list with any, turns the test red. NO NUMBER IS EVER RAISED: a new undocumented `!` is fixed by writing its why
 * comment on its line or the line above, which is what §2.3 asks, in the lane's own file. Slack: a file that falls below its number
 * leaves room for new undocumented `!` up to that number until the next re-measure. Only task-441 edits this list.
 */
export const UNDOCUMENTED_BANG_PIN: Readonly<Record<string, number>> = {
  'mobile/app/(app)/[flight-job].tsx': 1,
  'mobile/src/components/feed/FlightCard.tsx': 1,
  'mobile/src/components/surfaces/LotMapBinding.tsx': 2,
  'mobile/src/components/surfaces/ReportBinding.tsx': 5,
  'mobile/src/hooks/useFlightJobDetail.ts': 1,
  'mobile/src/hooks/useLeadDetail.ts': 1,
  'mobile/src/hooks/useParcelLookup.ts': 1,
  'mobile/src/lib/debug/stateDebug.ts': 2,
  'mobile/src/lib/lotMap.ts': 1,
  'mobile/src/lib/parcelSearchMatch.ts': 2,
  'mobile/src/lib/trackedLots.ts': 1,
  'src/app/api/admin/parcels/lookup/route.ts': 1,
  'src/app/api/admin/pipelines/status/route.ts': 1,
  'src/app/api/admin/stats/route.ts': 1,
  'src/app/api/admin/users/[uid]/route.ts': 12,
  'src/app/api/admin/users/[uid]/subscription/reconcile/route.ts': 1,
  'src/app/api/admin/users/route.ts': 3,
  'src/app/api/parcels/lookup/route.ts': 1,
  'src/app/api/permits/route.ts': 1,
  'src/app/api/subscribe/exchange/route.ts': 1,
  'src/app/api/subscribe/portal-session/route.ts': 2,
  'src/app/api/subscribe/session/route.ts': 2,
  'src/app/api/user-profile/reactivate/route.ts': 1,
  'src/app/api/user-profile/route.ts': 3,
  'src/app/permits/[id]/page.tsx': 2,
  'src/components/DataQualityDashboard.tsx': 2,
  'src/components/FreshnessTimeline.tsx': 4,
  'src/components/admin/LeadDetailInspector.tsx': 1,
  'src/components/admin/ParcelCostTool.tsx': 2,
  'src/components/funnel/FunnelPanels.tsx': 5,
  'src/components/report/ReportPage.tsx': 4,
  'src/features/admin-users/api/useAdminUsers.ts': 1,
  'src/lib/admin/github-dispatch.ts': 1,
  'src/lib/admin/parcel-lookup.ts': 11,
  'src/lib/auth/get-user-context.ts': 1,
  'src/lib/auth/verify-admin.ts': 1,
  'src/lib/builders/enrichment.ts': 1,
  'src/lib/builders/extract-contacts.ts': 1,
  'src/lib/classification/classifier.ts': 1,
  'src/lib/classification/coa-scope-classifier.ts': 1,
  'src/lib/inspections/parser.ts': 7,
  'src/lib/leads/build-lifecycle-timeline.ts': 1,
  'src/lib/leads/lead-inspect-query.ts': 4,
  'src/lib/market-metrics/queries.ts': 2,
  'src/lib/massing/geometry.ts': 12,
  'src/lib/media/contract.ts': 1,
  'src/lib/parcels/address.ts': 1,
  'src/lib/parcels/geometry.ts': 19,
  'src/lib/parcels/lot-map.ts': 1,
  'src/lib/parcels/lot-size-entry.ts': 2,
  'src/lib/parcels/lot-view.ts': 1,
  'src/lib/quality/metrics.ts': 17,
  'src/lib/quality/types.ts': 1,
  'src/lib/stripe/parcel-checkout.ts': 1,
  'src/lib/stripe/parcel-plans.ts': 1,
  'src/lib/supabase/admin.ts': 1,
  'src/lib/supabase/browser.ts': 2,
  'src/lib/supabase/middleware.ts': 2,
  'src/lib/supabase/server.ts': 2,
  'src/lib/surfaces/report/core.ts': 1,
};

export interface Hit { file: string; line: number; what: string }

/** Every non-null assertion with no comment on its own line or the line above. Pure: path and text in, hits out. */
export function findUndocumentedBangs(rel: string, text: string): Hit[] {
  const kind = rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, kind);
  const lineOf = (pos: number): number => sf.getLineAndCharacterOfPosition(pos).line;
  const commentLines = new Set<number>();
  const seen = new Set<number>();
  const addRanges = (ranges: ts.CommentRange[] | undefined): void => {
    for (const r of ranges ?? []) {
      if (seen.has(r.pos)) continue;
      seen.add(r.pos);
      for (let l = lineOf(r.pos); l <= lineOf(r.end); l++) commentLines.add(l);
    }
  };
  const bangLines: number[] = [];
  const visit = (n: ts.Node): void => {
    // JSX text is not trivia: `// x` inside it is text, not a comment.
    if (n.kind !== ts.SyntaxKind.JsxText) {
      addRanges(ts.getLeadingCommentRanges(text, n.pos));
      addRanges(ts.getTrailingCommentRanges(text, n.end));
    }
    if (ts.isNonNullExpression(n)) bangLines.push(lineOf(n.end - 1));
    for (const c of n.getChildren(sf)) visit(c);
  };
  visit(sf);
  return bangLines
    .filter((l) => !commentLines.has(l) && !commentLines.has(l - 1))
    .map((l) => ({ file: rel, line: l + 1, what: 'undocumented !' }));
}

export interface PinProblem { file: string; count: number; ceiling: number | null }

/** The ceiling refuses growth only: a file not in the pin with hits, or a count above its pin. A count below, a file at 0 or a gone file is no problem. */
export function pinProblems(actual: Readonly<Record<string, number>>, pin: Readonly<Record<string, number>>): PinProblem[] {
  const out: PinProblem[] = [];
  for (const [file, count] of Object.entries(actual)) {
    if (count <= 0) continue;
    const ceiling = pin[file];
    if (ceiling === undefined) out.push({ file, count, ceiling: null });
    else if (count > ceiling) out.push({ file, count, ceiling });
  }
  return out;
}

function scannedFiles(): string[] {
  const ls = (dir: string): string[] =>
    execFileSync('git', ['ls-files', '--', dir], { cwd: ROOT, stdio: 'pipe' })
      .toString()
      .split('\n')
      .map((s) => s.trim())
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f));
  const src = ls('src/').filter((f) => !f.startsWith('src/tests/') && !f.endsWith('.d.ts'));
  const mobile = ls('mobile/').filter((f) => !f.startsWith('mobile/__tests__/') && !SKIP.test(f));
  return [...src, ...mobile];
}

describe('§2.3: every non-null assertion carries a why comment (per-file ceiling for the known breaks)', () => {
  it('A. the real tree holds no undocumented `!` above the ceiling', () => {
    const files = scannedFiles();
    const actual: Record<string, number> = {};
    for (const f of files) {
      const n = findUndocumentedBangs(f, readFileSync(join(ROOT, f), 'utf8')).length;
      if (n > 0) actual[f] = n;
    }
    const problems = pinProblems(actual, UNDOCUMENTED_BANG_PIN);
    const pinSum = Object.values(UNDOCUMENTED_BANG_PIN).reduce((a, b) => a + b, 0);
    const actualSum = Object.values(actual).reduce((a, b) => a + b, 0);
    console.log(`§2.3: scanned ${files.length} files, ${actualSum} undocumented ! in ${Object.keys(actual).length} files, pin sum ${pinSum}`);
    const report = problems
      .map((p) =>
        p.ceiling === null
          ? `  ${p.file}: not in the pin, ${p.count}`
          : `  ${p.file}: ${p.count} undocumented, above its ceiling ${p.ceiling}`,
      )
      .join('\n');
    expect(
      problems,
      `§2.3 (00_engineering_standards.md:47) undocumented non-null assertions above the ceiling:\n${report}\n` +
        'Document the `!` with a why comment on the line or the line above; do not raise the number.',
    ).toEqual([]);
    expect(files.length).toBeGreaterThan(400);
  });

  it('B. RED planted (KNOWN_BAD): each undocumented `!` form gives exactly one hit', () => {
    for (const code of ['x!.a;', 'const v = m.get(k)!;', 'foo!();']) {
      expect(findUndocumentedBangs('planted.ts', code), code).toHaveLength(1);
    }
  });

  it('C. controls: a comment on the line or the line above, optional chaining and a definite assignment give 0 hits', () => {
    const controls = ['x!.a; // guarded by parse() above', '// why\nx!.a;', 'x?.a;', 'let y!: number;'];
    for (const code of controls) expect(findUndocumentedBangs('control.ts', code), code).toEqual([]);
    // The imported mobile SKIP still matches node_modules, so a rename of the export fails loudly.
    expect(SKIP.test('mobile/node_modules/x.ts')).toBe(true);
  });

  it('D. pinProblems refuses growth only', () => {
    expect(pinProblems({ a: 2 }, { a: 1 })).toHaveLength(1);
    expect(pinProblems({ a: 0 }, { a: 1 })).toEqual([]);
    expect(pinProblems({ b: 1 }, {})).toHaveLength(1);
    expect(pinProblems({ a: 1 }, { a: 1 })).toEqual([]);
  });
});
