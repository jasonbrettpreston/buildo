// PAGE.TABLE (task-390) · the old-versus-new comparator: the semi question props tree drawn by the binding BEFORE the page table (the version at the parent of the
// commit that added PageTableBinding.tsx) against the one drawn from the rows now, for every fixture input x every error kind x busy off/on.
// Re-run from the repo root: node_modules/.bin/tsx --tsconfig mobile/tsconfig.json docs/reports/lanes/2026-11-20/BL-PAGETABLE/compare-semi-old-new.cts
// It writes the old binding to a temporary file beside the new one and removes it at the end. Pure over committed files; no DB, no network.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { semiQuestionProps as newP } from '../../../../../mobile/src/components/surfaces/SemiQuestionBinding';
import { buildSemiQuestionSituation } from '../../../../../mobile/src/lib/semiQuestion';
import { ApiError, RateLimitError } from '../../../../../mobile/src/lib/errors';

const git = (...a: string[]): string => execFileSync('git', a, { encoding: 'utf8' }).trim();
const added = git('log', '--diff-filter=A', '--format=%H', '-1', '--', 'mobile/src/components/surfaces/PageTableBinding.tsx');
const OLD = 'mobile/src/components/surfaces/OldSemiTmp.tsx';
async function main(): Promise<void> {
fs.writeFileSync(OLD, git('show', `${added}^:mobile/src/components/surfaces/SemiQuestionBinding.tsx`) + '\n');
try {
  const { semiQuestionProps: oldP } = await import('../../../../../mobile/src/components/surfaces/OldSemiTmp');
  const fx = JSON.parse(fs.readFileSync('mobile/__tests__/fixtures/semiQuestion.situations.json', 'utf8')) as { inputs: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const errorOf = (k?: string): unknown => k === 'rate_limited' ? new RateLimitError(30) : k === 'entitlement' ? new ApiError(403, 'forbidden') : k === 'unexpected' || k === 'schema_drift' ? new Error('boom') : null;
  let bad = 0, n = 0;
  for (const [name, i] of Object.entries(fx.inputs)) for (const k of [i.error, undefined, 'rate_limited', 'entitlement', 'unexpected', 'schema_drift']) for (const sub of [false, true]) {
    const s = buildSemiQuestionSituation({ parcelId: i.parcelId, data: i.data, error: errorOf(k), isFetching: i.isFetching ?? false, schemaDrift: k === 'schema_drift', selected: i.selected ?? null, submitting: sub });
    n++;
    if (JSON.stringify(oldP(s)) !== JSON.stringify(newP(s))) { bad++; console.log('DIFF', name, k, sub); }
  }
  console.log(`old binding at ${added.slice(0, 9)}^ vs new: compared ${n} situations, ${bad} differ`);
  if (bad) process.exitCode = 1;
} finally {
  fs.rmSync(OLD, { force: true });
}
}
main().catch((e) => { fs.rmSync(OLD, { force: true }); console.error(e); process.exitCode = 1; });
