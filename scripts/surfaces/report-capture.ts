// SPEC LINK: docs/specs/02-web-admin/127_surface_conversion_procedure.md 4.3 (dated note 2026-11-09, MF-14: the capture script and the capture-twice proof),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-24, FE-29.
//
// MF-14 · lane E-MF14. The golden capture: every golden's `rendered_tree` and `fingerprint` are rebuilt from its `response_fixture` by the renderer's
// buildTree and the committed fingerprint inputs. The fixtures are never changed. Run twice it writes identical bytes.
//   npx tsx scripts/surfaces/report-capture.ts            rewrite every golden in the manifest
//   npx tsx scripts/surfaces/report-capture.ts --check    exit 1 if any golden would change (writes nothing)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTree } from '../../src/lib/surfaces/report/core';
import { reportCtx } from '../../src/lib/surfaces/report/data';
import { FP_FILES, GOLDEN_DIR, TARGETS, readJson, sha16, sha16Text } from './report-checks.mjs';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- golden JSON

// Returns file name -> exact text for every golden of the manifest. Pure over the files under `root`; writes nothing.
export const captureAll = (root: string): Map<string, string> => {
  const manifest = readJson(path.join(root, GOLDEN_DIR, 'states.json')) as Json;
  const files: Record<string, string> = {};
  for (const p of FP_FILES as string[]) files[p] = sha16(path.join(root, p));
  const out = new Map<string, string>();
  for (const state of manifest.states as string[]) for (const target of TARGETS as string[]) {
    const name = `${state}.${target}.json`;
    const g = readJson(path.join(root, GOLDEN_DIR, name)) as Json;
    const next = {
      harness: g.harness, spec: g.spec, surface: g.surface, state: g.state, target: g.target,
      response_fixture: g.response_fixture,
      rendered_tree: buildTree(g.response_fixture, reportCtx),
      fingerprint: { response_fixture: sha16Text(g.response_fixture), files },
    };
    out.set(name, `${JSON.stringify(next, null, 2)}\n`);
  }
  return out;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const check = process.argv.includes('--check');
  const all = captureAll(root);
  let changed = 0;
  for (const [name, text] of all) {
    const p = path.join(root, GOLDEN_DIR, name);
    if (fs.readFileSync(p, 'utf8') === text) continue;
    changed++;
    if (check) console.error(`CAPTURE-STALE ${name}`);
    else fs.writeFileSync(p, text);
  }
  console.log(`report-capture ${check ? 'checked' : 'wrote'} ${all.size} goldens; ${changed} ${check ? 'stale' : 'changed'}`);
  if (check && changed > 0) process.exitCode = 1;
}
