#!/usr/bin/env tsx
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.2 (one props golden per state per target; regenerated, never
//            hand-edited), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-02 (generated, not hand-written).
//
// GAP.13 (task-12) · writes or checks the mobile props goldens of S-002 `mobile_parcel_search`
// (src/tests/fixtures/surfaces/mobile_parcel_search/<golden>.mobile.json). Sibling of lotmap-golden-capture.ts and semi-question-golden-capture.ts: no
// writer existed for these ten goldens and their fingerprints move with the content file. For each state of the descriptor, the golden is the props
// tree searchProps(situation) of the situation the committed golden already names (mobile/__tests__/fixtures/parcelSearch.situations.json), plus the
// descriptor/content fingerprint SV-SCREEN checks. The mobile jest test (mobile/__tests__/parcelScreens.golden.test.ts) asserts the same equality.
// Run from the repo root with the mobile path aliases:
//   node_modules/.bin/tsx --tsconfig mobile/tsconfig.json scripts/surfaces/search-golden-capture.ts --write | --check
// Pure over committed files; no DB, no network. After a --write, run scripts/surfaces/emit-mobile-surfaces.mjs --write (the mobile copy).
import fs from 'node:fs';
import path from 'node:path';
import { searchProps } from '../../mobile/src/components/surfaces/SearchBinding';
import type { SearchSituation } from '../../mobile/src/lib/parcelSearchMatch';
// @ts-expect-error plain ESM helper without types
import { sha16 } from './report-checks.mjs';

const REPO = path.resolve(__dirname, '..', '..');
const ID = 'mobile_parcel_search';
const DIR = path.join(REPO, 'src/tests/fixtures/surfaces', ID);
const DESCRIPTOR = 'scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.descriptor.json';
const CONTENT = 'scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.content.json';

const rj = (p: string): Record<string, any> => JSON.parse(fs.readFileSync(p, 'utf8')); // eslint-disable-line @typescript-eslint/no-explicit-any -- golden JSON
const situations = rj(path.join(REPO, 'mobile/__tests__/fixtures/parcelSearch.situations.json')) as Record<string, SearchSituation>;
const states = rj(path.join(REPO, DESCRIPTOR)).states as { name: string; golden: string }[];

function goldenText(s: { name: string; golden: string }): string {
  const situation = rj(path.join(DIR, `${s.golden}.mobile.json`)).situation as string;
  if (!Object.hasOwn(situations, situation)) throw new Error(`search-golden-capture: no situation ${situation} for ${s.golden}`);
  const files = [CONTENT, DESCRIPTOR].sort();
  const doc = {
    surface: ID,
    state: s.name,
    target: 'mobile',
    covers: [s.name],
    situation,
    props: searchProps(situations[situation] as SearchSituation),
    fingerprint: { files: Object.fromEntries(files.map((f) => [f, sha16(path.join(REPO, f)) as string])) },
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

function main(argv: string[]): void {
  const problems: string[] = [];
  for (const s of states) {
    const p = path.join(DIR, `${s.golden}.mobile.json`);
    const fresh = goldenText(s);
    if (argv.includes('--write')) fs.writeFileSync(p, fresh);
    else if (fs.readFileSync(p, 'utf8') !== fresh) problems.push(`STALE ${path.relative(REPO, p)}`);
  }
  const names = states.map((s) => s.golden);
  for (const f of fs.readdirSync(DIR)) if (f.endsWith('.mobile.json') && !names.includes(f.replace(/\.mobile\.json$/, ''))) problems.push(`STRAY ${f}`);
  for (const l of problems) console.error(l);
  console.log(argv.includes('--write') ? `wrote ${states.length} goldens` : problems.length ? `search goldens FAIL (${problems.length})` : `search goldens ok (${states.length})`);
  if (problems.length) process.exitCode = 1;
}

main(process.argv.slice(2));
