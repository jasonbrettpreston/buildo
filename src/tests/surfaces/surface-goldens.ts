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
import { searchWebTree, type WebSituation } from '../../components/surfaces/web/SearchBinding';
import { staticWebTree, type StaticPage } from '../../components/surfaces/web/StaticBinding';
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

/**
 * MF-35 OUTPUT fold MEDIUM 2 (Spec 126 §11b.2 item (6)): the converted surfaces whose MOBILE goldens are built and checked by a mobile jest test,
 * because root vitest cannot import the mobile binding (test.yml). A converted mobile target not declared here makes the build throw.
 */
export const MOBILE_GOLDEN_TESTS: Record<string, string> = {
  mobile_parcel_search: 'mobile/__tests__/parcelScreens.golden.test.ts',
  // MF-53 (dated 2026-11-11): the choose-your-lot map page; its goldens are written by scripts/surfaces/lotmap-golden-capture.ts.
  mobile_parcel_disambiguation_map: 'mobile/__tests__/lotMapScreens.golden.test.ts',
  // SEMI-B (dated 2026-11-13): the one-question page before the report; its goldens are written by scripts/surfaces/semi-question-golden-capture.ts.
  mobile_parcel_semi_question: 'mobile/__tests__/semiQuestionScreens.golden.test.ts',
};

/** A non-web target: the declared mobile golden test of `id`, else a throw (fail closed; never a silent skip). */
export const otherTarget = (id: string, target: string): string => {
  if (target !== 'mobile') throw new Error(`surface-goldens: no ${target} binding for ${id}`);
  const t = MOBILE_GOLDEN_TESTS[id];
  if (!t) throw new Error(`surface-goldens: no mobile golden test declared for ${id}`);
  return t;
};

/**
 * MF-44 (dated 2026-11-11; Spec 126 §11b.5, FE-07): a web SEARCH golden renders the SAME situation as the committed mobile golden of its state
 * (its `situation` field, a key of the committed situations file the mobile golden test reads), so the two targets of one state cannot be built
 * from different inputs. A state with no committed mobile golden, or a situation name the file lacks, throws.
 */
export const SITUATIONS = 'mobile/__tests__/fixtures/parcelSearch.situations.json';
export const situationOf = (root: string, d: Json, state: string): string => {
  const s = (d.states as Json[]).find((x) => x.name === state);
  if (!s) throw new Error(`surface-goldens: ${d.identity.id} has no state ${state}`);
  const name = rj(root, `${GOLDEN_ROOT}/${d.identity.id}/${s.golden}.mobile.json`).situation;
  if (typeof name !== 'string' || !Object.hasOwn(rj(root, SITUATIONS), name)) throw new Error(`surface-goldens: no situation for ${d.identity.id} ${state}`);
  return name;
};

/**
 * MF-46 stage C (dated 2026-11-11; Spec 126 §11b.5, the first web STATIC consumer): a STATIC golden is the binding's tree of the surface's page for
 * that state in the static page table (scripts/surfaces/_schema/static-page.json, read under `root`). A surface or state the table lacks throws.
 */
export const STATIC_PAGES = 'scripts/surfaces/_schema/static-page.json';
export const staticPageOf = (root: string, id: string, state: string): StaticPage => {
  const page = (rj(root, STATIC_PAGES).pages as Json)[id]?.[state];
  if (!page) throw new Error(`surface-goldens: no static page for ${id} ${state}`);
  return page as StaticPage;
};

/** The props tree of one surface in one state on one target. */
export const treeOf = (root: string, d: Json, state: string, target = 'web'): Json => {
  if (target !== 'web') throw new Error(`surface-goldens: no ${target} binding for ${d.identity.id}`);
  if (d.identity.archetype === 'LIST') return listTree(d as Parameters<typeof listTree>[0], state as ListState);
  if (d.identity.archetype === 'STATIC') return staticWebTree(staticPageOf(root, d.identity.id, state));
  if (d.identity.archetype === 'SEARCH') return searchWebTree(rj(root, SITUATIONS)[situationOf(root, d, state)] as WebSituation);
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
      // MF-35 (dated 2026-11-10; OUTPUT fold MEDIUM 2): a non-web target is checked by its declared mobile golden test, or the build throws.
      if (target !== 'web') { otherTarget(id, target); continue; }
      for (const s of d.states) {
        const situation = d.identity.archetype === 'SEARCH' ? { situation: situationOf(root, d, s.name) } : {}; // MF-44: the mobile golden's key order
        const doc = { surface: id, state: s.name, target, covers: [s.name], ...situation, props: treeOf(root, d, s.name, target), fingerprint: { files } };
        out.set(`${GOLDEN_ROOT}/${id}/${s.golden}.${target}.json`, `${JSON.stringify(doc, null, 2)}\n`);
      }
    }
  }
  return out;
};
