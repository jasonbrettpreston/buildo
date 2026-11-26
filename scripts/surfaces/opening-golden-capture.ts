#!/usr/bin/env tsx
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.2 (one props golden per state per target; regenerated, never
//            hand-edited), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-02 (generated, not hand-written).
//
// task-313 McApp card 1 · writes or checks the mobile props goldens of S-097 `mobile_parcel_opening` (src/tests/fixtures/surfaces/mobile_parcel_opening/<golden>.mobile.json):
// for each committed golden named in mobile/__tests__/fixtures/opening.situations.json, the props tree openingProps(situation) plus the descriptor/content
// fingerprint SV-SCREEN checks. The mobile jest test (mobile/__tests__/openingScreens.golden.test.ts) asserts the same equality. The wall's capture
// (wall-golden-capture.ts) on this surface. Run from the repo root with the mobile path aliases:
//   node_modules/.bin/tsx --tsconfig mobile/tsconfig.json scripts/surfaces/opening-golden-capture.ts --write | --check
// Pure over committed files; no DB, no network. After a --write, run scripts/surfaces/emit-mobile-surfaces.mjs --write (the mobile copy).
import fs from 'node:fs';
import path from 'node:path';
import { openingProps, type OpeningSituation } from '../../mobile/src/components/surfaces/OpeningBinding';
// @ts-expect-error plain ESM helper without types
import { sha16 } from './report-checks.mjs';

const REPO = path.resolve(__dirname, '..', '..');
const ID = 'mobile_parcel_opening';
const DIR = path.join(REPO, 'src/tests/fixtures/surfaces', ID);
const DESCRIPTOR = 'scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_opening.descriptor.json';
const CONTENT = 'scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_opening.content.json';

const fixture = JSON.parse(fs.readFileSync(path.join(REPO, 'mobile/__tests__/fixtures/opening.situations.json'), 'utf8')) as {
  goldens: Record<string, { state: string; situation: string }>;
  inputs: Record<string, OpeningSituation>;
};

function goldenText(name: string): string {
  const g = fixture.goldens[name]!;
  const s = fixture.inputs[g.situation];
  if (!s) throw new Error(`opening-golden-capture: no input ${g.situation}`);
  const files = [CONTENT, DESCRIPTOR].sort();
  const doc = {
    surface: ID,
    state: g.state,
    target: 'mobile',
    covers: [g.state],
    situation: g.situation,
    props: openingProps(s),
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
  console.log(argv.includes('--write') ? `wrote ${names.length} goldens` : problems.length ? `opening goldens FAIL (${problems.length})` : `opening goldens ok (${names.length})`);
  if (problems.length) process.exitCode = 1;
}

main(process.argv.slice(2));
