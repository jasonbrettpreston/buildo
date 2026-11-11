// SPEC LINK: docs/specs/02-web-admin/127_surface_conversion_procedure.md 4.3 (golden = fixture + rendered tree; capture twice),
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.7 (golden render states), 135 FE-24.
//
// MF-57 · McFrontend queue. The v21 PAGE golden capture, the twin of report-capture.ts for the page tree: every page golden's `rendered_tree` and
// `fingerprint` are rebuilt from its `response_fixture` by buildPage. The fixtures are never changed. Run twice it writes identical bytes.
// The page goldens sit OUTSIDE the gate's golden root (src/tests/fixtures/surfaces) until decision D-D places them (SV-SCREEN accepts only the
// REPORT dir and converted surfaces there); src/tests/surfaces/report-page.logic.test.ts holds the capture and parity proof meanwhile.
//   npx tsx scripts/surfaces/report-page-capture.ts            rewrite the four page goldens
//   npx tsx scripts/surfaces/report-page-capture.ts --check    exit 1 if any page golden would change (writes nothing)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPage } from '../../src/lib/surfaces/report/core';
import { reportCtx } from '../../src/lib/surfaces/report/data';
import { FP_FILES, TARGETS, readJson, sha16, sha16Text } from './report-checks.mjs';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- golden JSON

export const PAGE_GOLDEN_DIR = 'src/tests/fixtures/report-page';
export const PAGE_FP_FILES = [...(FP_FILES as string[]), 'scripts/surfaces/_schema/report-page.json', 'scripts/surfaces/_schema/report-page.schema.json'];

export const capturePages = (root: string): Map<string, string> => {
  const files: Record<string, string> = {};
  for (const p of PAGE_FP_FILES) files[p] = sha16(path.join(root, p));
  const out = new Map<string, string>();
  for (const target of TARGETS as string[]) {
    const name = `v21.${target}.json`;
    const g = readJson(path.join(root, PAGE_GOLDEN_DIR, name)) as Json;
    const next = {
      harness: g.harness, spec: g.spec, surface: g.surface, state: g.state, target: g.target,
      response_fixture: g.response_fixture,
      rendered_tree: buildPage(g.response_fixture, reportCtx),
      fingerprint: { response_fixture: sha16Text(g.response_fixture), files },
    };
    out.set(name, `${JSON.stringify(next, null, 2)}\n`);
  }
  return out;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const check = process.argv.includes('--check');
  const all = capturePages(root);
  const stale = [...all].filter(([f, t]) => !fs.existsSync(path.join(root, PAGE_GOLDEN_DIR, f)) || fs.readFileSync(path.join(root, PAGE_GOLDEN_DIR, f), 'utf8') !== t).map(([f]) => f);
  if (check) {
    for (const f of stale) console.error(`PAGE-GOLDEN ${f}: stale (run without --check)`);
    process.exitCode = stale.length ? 1 : 0;
    if (!stale.length) console.log(`page goldens current (${all.size})`);
  } else {
    for (const [f, t] of all) fs.writeFileSync(path.join(root, PAGE_GOLDEN_DIR, f), t);
    console.log(`page goldens written (${all.size}; ${stale.length} changed)`);
  }
}
