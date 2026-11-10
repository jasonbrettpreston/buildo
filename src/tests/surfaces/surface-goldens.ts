// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b.2 (one props golden per reachable state per declared target),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-31, FE-32.
//
// MF-37 · the golden builder (generalised by the binding standard, MF-40 plan delta 1 section 8 fold 4; was admin-media-goldens.ts, media only):
// every surface in the converted manifest (scripts/surfaces/_schema/converted-surfaces.json `converted`), its descriptor found by id under
// scripts/surfaces, one golden per state per declared target. Each golden is the binding's props tree (refs only) for one state, with the per-surface
// fingerprint (descriptor, content file, form schema; never bindings.json). Only the web target has a binding today: any other target throws.
// Pure over the files under `root`; writes nothing. T7 asserts the committed goldens equal this output byte for byte; `npx tsx` of a one-line caller
// rewrites them.
import fs from 'node:fs';
import path from 'node:path';
import { formTree, type FormState } from '../../components/surfaces/web/FormBinding';
import { listTree, type ListState } from '../../components/surfaces/web/ListBinding';
import { fingerprintFiles, GOLDEN_ROOT, MANIFEST, resolveSchemaRef } from '../../../scripts/surfaces/screen-checks.mjs';
import { sha16 } from '../../../scripts/surfaces/report-checks.mjs';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- descriptor JSON
const rj = (root: string, p: string): Json => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

/** The converted surface ids, in manifest order. */
export const convertedIds = (root: string): string[] => rj(root, MANIFEST).converted as string[];

/** The repo-relative descriptor file of surface `id` (exactly one under scripts/surfaces, else a throw). */
export const descriptorFile = (root: string, id: string): string => {
  const walk = (rel: string): string[] => fs.readdirSync(path.join(root, rel), { withFileTypes: true }).flatMap((e) => {
    const r = path.posix.join(rel, e.name);
    if (e.isDirectory()) return e.name === '_schema' ? [] : walk(r);
    return e.name === `${id}.descriptor.json` ? [r] : [];
  });
  const found = walk('scripts/surfaces');
  if (found.length !== 1) throw new Error(`surface-goldens: ${found.length} descriptor files for ${id}`);
  return found[0] as string;
};

/** The props tree of one surface in one state on one target. */
export const treeOf = (root: string, d: Json, state: string, target = 'web'): Json => {
  if (target !== 'web') throw new Error(`surface-goldens: no ${target} binding for ${d.identity.id}`);
  if (d.identity.archetype === 'LIST') return listTree(d as Parameters<typeof listTree>[0], state as ListState);
  if (d.identity.archetype !== 'FORM') throw new Error(`surface-goldens: no web ${d.identity.archetype} binding for ${d.identity.id}`);
  const r = resolveSchemaRef(root, d.render.form.schema_ref);
  if (r.problem) throw new Error(r.problem);
  return formTree(d as Parameters<typeof formTree>[0], r.target, state as FormState);
};

/** Golden path (repo-relative) -> exact text, for every state x target of every converted surface. */
export const buildGoldens = (root: string): Map<string, string> => {
  const out = new Map<string, string>();
  for (const id of convertedIds(root)) {
    const file = descriptorFile(root, id);
    const d = rj(root, file);
    const files = Object.fromEntries(fingerprintFiles(id, { d, file }).map((p: string) => [p, sha16(path.join(root, p))]));
    for (const target of d.identity.platforms as string[]) {
      for (const s of d.states) {
        const doc = { surface: id, state: s.name, target, covers: [s.name], props: treeOf(root, d, s.name, target), fingerprint: { files } };
        out.set(`${GOLDEN_ROOT}/${id}/${s.golden}.${target}.json`, `${JSON.stringify(doc, null, 2)}\n`);
      }
    }
  }
  return out;
};
