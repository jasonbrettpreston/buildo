#!/usr/bin/env tsx
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.2 (one props golden per state per target; regenerated, never
//            hand-edited), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-02 (generated, not hand-written).
//
// SEMI-B · writes or checks the mobile props goldens of S-093 `mobile_parcel_semi_question`
// (src/tests/fixtures/surfaces/mobile_parcel_semi_question/<golden>.mobile.json): for each committed golden named in
// mobile/__tests__/fixtures/semiQuestion.situations.json, the props tree semiQuestionProps(buildSemiQuestionSituation(inputs)) plus the
// descriptor/content fingerprint SV-SCREEN checks. The mobile jest test (mobile/__tests__/semiQuestionScreens.golden.test.ts) asserts the same equality.
// Run from the repo root with the mobile path aliases:
//   node_modules/.bin/tsx --tsconfig mobile/tsconfig.json scripts/surfaces/semi-question-golden-capture.ts --write | --check
// Pure over committed files; no DB, no network. After a --write, run scripts/surfaces/emit-mobile-surfaces.mjs --write (the mobile copy).
import fs from 'node:fs';
import path from 'node:path';
import { semiQuestionProps } from '../../mobile/src/components/surfaces/SemiQuestionBinding';
import { buildSemiQuestionSituation } from '../../mobile/src/lib/semiQuestion';
import { ApiError, RateLimitError } from '../../mobile/src/lib/errors';
import type { ConsumerParcelLookupResult } from '../../mobile/src/lib/schemas';
import type { SemiAnswer } from '../../mobile/src/lib/lotForm';
// @ts-expect-error plain ESM helper without types
import { sha16 } from './report-checks.mjs';

const REPO = path.resolve(__dirname, '..', '..');
const ID = 'mobile_parcel_semi_question';
const DIR = path.join(REPO, 'src/tests/fixtures/surfaces', ID);
const DESCRIPTOR = 'scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_semi_question.descriptor.json';
const CONTENT = 'scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_semi_question.content.json';

type Input = { parcelId: string; data?: ConsumerParcelLookupResult; error?: string; isFetching?: boolean; selected?: SemiAnswer | null };
const fixture = JSON.parse(fs.readFileSync(path.join(REPO, 'mobile/__tests__/fixtures/semiQuestion.situations.json'), 'utf8')) as {
  goldens: Record<string, { state: string; situation: string }>;
  inputs: Record<string, Input>;
};

/** The same error construction as the mobile tests. */
export function errorOf(kind: string | undefined): unknown {
  if (kind === 'rate_limited') return new RateLimitError(30);
  if (kind === 'entitlement') return new ApiError(403, 'forbidden');
  if (kind === 'unexpected' || kind === 'schema_drift') return new Error('boom');
  return null;
}

function goldenText(name: string): string {
  const g = fixture.goldens[name]!;
  const i = fixture.inputs[g.situation]!;
  const s = buildSemiQuestionSituation({
    parcelId: i.parcelId, data: i.data, error: errorOf(i.error), isFetching: i.isFetching ?? false,
    schemaDrift: i.error === 'schema_drift', selected: i.selected ?? null,
  });
  const files = [CONTENT, DESCRIPTOR].sort();
  const doc = {
    surface: ID,
    state: g.state,
    target: 'mobile',
    covers: [g.state],
    situation: g.situation,
    props: semiQuestionProps(s),
    fingerprint: { files: Object.fromEntries(files.map((f) => [f, sha16(path.join(REPO, f)) as string])) },
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

function main(argv: string[]): void {
  const names = Object.keys(fixture.goldens).sort();
  const problems: string[] = [];
  for (const n of names) {
    const p = path.join(DIR, `${n}.mobile.json`);
    const fresh = goldenText(n);
    if (argv.includes('--write')) {
      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(p, fresh);
    } else if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== fresh) problems.push(`STALE ${path.relative(REPO, p)}`);
  }
  if (fs.existsSync(DIR)) for (const f of fs.readdirSync(DIR)) if (!names.includes(f.replace(/\.mobile\.json$/, ''))) problems.push(`STRAY ${f}`);
  for (const l of problems) console.error(l);
  console.log(argv.includes('--write') ? `wrote ${names.length} goldens` : problems.length ? `semi-question goldens FAIL (${problems.length})` : `semi-question goldens ok (${names.length})`);
  if (problems.length) process.exitCode = 1;
}

main(process.argv.slice(2));
