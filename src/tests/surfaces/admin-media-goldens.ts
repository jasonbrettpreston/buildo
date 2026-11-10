// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b.2 (one props golden per reachable state per declared target),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-31, FE-32.
//
// MF-37 · the golden builder for the three admin media surfaces: each golden is the binding's props tree (refs only) for one state, with the
// per-surface fingerprint (descriptor, content file, form schema; never bindings.json). Pure over the files under `root`; writes nothing.
// T7 asserts the committed goldens equal this output byte for byte; `npx tsx` of a one-line caller rewrites them.
import fs from 'node:fs';
import path from 'node:path';
import { formTree, type FormState } from '../../components/surfaces/web/FormBinding';
import { listTree, type ListState } from '../../components/surfaces/web/ListBinding';
import { fingerprintFiles, GOLDEN_ROOT, resolveSchemaRef } from '../../../scripts/surfaces/screen-checks.mjs';
import { sha16 } from '../../../scripts/surfaces/report-checks.mjs';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- descriptor JSON
export const MEDIA_IDS = ['admin_media', 'admin_media_upload', 'admin_media_delete'] as const;
export const DESCRIPTOR_DIR = 'scripts/surfaces/parcel_admin/F08/surfaces';
export const descriptorFile = (id: string): string => `${DESCRIPTOR_DIR}/${id}.descriptor.json`;
const rj = (root: string, p: string): Json => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

/** The props tree of one surface in one state. */
export const treeOf = (root: string, d: Json, state: string): Json => {
  if (d.identity.archetype === 'LIST') return listTree(d as Parameters<typeof listTree>[0], state as ListState);
  const r = resolveSchemaRef(root, d.render.form.schema_ref);
  if (r.problem) throw new Error(r.problem);
  return formTree(d as Parameters<typeof formTree>[0], r.target, state as FormState);
};

/** Golden path (repo-relative) -> exact text, for every state of the three surfaces on web. */
export const buildGoldens = (root: string): Map<string, string> => {
  const out = new Map<string, string>();
  for (const id of MEDIA_IDS) {
    const file = descriptorFile(id);
    const d = rj(root, file);
    const files = Object.fromEntries(fingerprintFiles(id, { d, file }).map((p: string) => [p, sha16(path.join(root, p))]));
    for (const s of d.states) {
      const doc = { surface: id, state: s.name, target: 'web', covers: [s.name], props: treeOf(root, d, s.name), fingerprint: { files } };
      out.set(`${GOLDEN_ROOT}/${id}/${s.golden}.web.json`, `${JSON.stringify(doc, null, 2)}\n`);
    }
  }
  return out;
};
