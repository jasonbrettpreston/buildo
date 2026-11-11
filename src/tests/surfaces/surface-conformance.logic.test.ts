// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-31 (every MaxBLD page is descriptor + content + standard library components
//            configured by schema: the converted manifest, every string from content, every value through a binding kind, library imports only in binding
//            modules, generated and vendored files pass --check/manifest; the render-smoke clause is its own row, FE-33, owned by MF-37),
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md 3.1 and 11b, docs/specs/02-web-admin/128_surface_standard_policy.md rules 1, 4, 19, 20 and 4
//            (the closed render vocabulary grows only by the 128 section 4 route; C-7 is its lock), R-13 (owns.components).
//
// MF-42 · McFrontend queue · lane G. The FE-31 lock (plan.min section 2). Cases:
//   C-1  the arms on the REAL tree (exact counts) and the queue-state check (queueProblems, real queue + in-memory plants; never in the gate, M-0);
//   C-2  the import boundary: a UI library or the vendor dir only in a binding module, provider, test or the vendor dir; a mount file imports only
//        framework packages, binding modules and project-internal paths (coordinator input 2026-11-09: the closed list governs third-party imports);
//   C-2b no display text in mount files and binding modules (JSX text, string children, string display attributes);
//   C-3  bindings.json integrity (modules, owners, promoted entries, roots, policy globs);  C-4 a converted surface owns no component;
//   C-5  the vendored manifest both directions;  C-6 the generated types and validator equal a fresh emit;  C-7 schema closedness and the cutover plants.
//   C-8m / C-9m (MF-35; the binding standard, Spec 126 §11b.2 dated note 2026-11-10 item (5)) the mobile closed table and the mobile 44 px case.
//   C-11m (MF-35) the generated mobile library theme: scripts/surfaces/emit-mobile-theme.mjs --check on the real tree, and its planted RED cases.
// Each check is a function here, run GREEN on the real tree and RED on a planted temp tree or in-memory input. Counts are printed so a vacuous pass
// (0 modules, 0 vendored files) reads as a stated WAITS. No DB, no network.
import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { descArm, loadContext, queueProblems, sbindArm, screenArm, shapeProblems } from '../../../scripts/surfaces/screen-checks.mjs';
import { isFrontend } from '../../../scripts/analysis/mcbylaws/paths.mjs';
import { validateDescriptor, unresearchedCount } from '../../lib/surfaces/generated/validate-descriptor.mjs';
import { ARCHETYPES, buildFixture, convert, editDescriptor, rj } from './screen-fixture';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON documents
const REPO = process.cwd();
const SCHEMA = 'scripts/surfaces/_schema';
const B: Json = rj(path.join(REPO, SCHEMA, 'bindings.json'));
const POLICY: Json = rj(path.join(REPO, 'mcbylaws/protected-paths.json'));
const roots: string[] = [];
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); });
const tmp = (): string => { const r = fs.mkdtempSync(path.join(os.tmpdir(), 'mf42-c-')); roots.push(r); return r; };
const put = (root: string, rel: string, text: string): void => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
const sha256 = (p: string): string => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

// ---- C-2 / C-2b: the import boundary and display text ---------------------------------------------------------------------------------------------
const SKIP = new Set(['node_modules', '.expo', 'ios', 'android', '.next']);
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;
// The path aliases the walk resolves, per owning root; asserted equal to each tsconfig's compilerOptions.paths below.
const ALIASES: Record<string, Record<string, string>> = { '': { '@/': 'src/' }, 'mobile/': { '@/': 'mobile/src/', '@app/': 'mobile/app/' } };
const walk = (root: string, rel: string, vendor: string): string[] => {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    const r = path.posix.join(rel, e.name);
    if (e.isDirectory()) return SKIP.has(e.name) || r === vendor ? [] : walk(root, r, vendor);
    return e.isFile() && (CODE.test(e.name) || e.name.endsWith('.css')) ? [r] : [];
  });
};
interface Site { spec: string | null; line: number; kind: string }
/** Every import site of one file: import (incl. type), export from, import(), require(), vi.mock/jest.mock, CSS @import. null = non-literal. */
export const sitesOf = (text: string, file: string): Site[] => {
  if (file.endsWith('.css')) return [...text.matchAll(/@import\s+(?:url\()?\s*['"]([^'"]+)['"]/g)].map((m) => ({ spec: m[1] as string, line: text.slice(0, m.index).split('\n').length, kind: 'css @import' }));
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, /x$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: Site[] = [];
  const lit = (n: ts.Node | undefined): string | null => (n && ts.isStringLiteralLike(n) ? n.text : null);
  const at = (n: ts.Node): number => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const visit = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n)) out.push({ spec: lit(n.moduleSpecifier), line: at(n), kind: 'import' });
    else if (ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference)) out.push({ spec: lit(n.moduleReference.expression), line: at(n), kind: 'import =' });
    else if (ts.isExportDeclaration(n) && n.moduleSpecifier) out.push({ spec: lit(n.moduleSpecifier), line: at(n), kind: 'export from' });
    else if (ts.isCallExpression(n)) {
      const e = n.expression;
      const name = e.kind === ts.SyntaxKind.ImportKeyword ? 'import()' : ts.isIdentifier(e) && e.text === 'require' ? 'require'
        : ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && ['vi', 'jest'].includes(e.expression.text) && e.name.text === 'mock' ? 'mock' : null;
      if (name) out.push({ spec: lit(n.arguments[0]), line: at(n), kind: name });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
};
const libOf = (spec: string, libs: string[]): string | undefined => libs.find((l) => (l.endsWith('/*') ? spec.startsWith(l.slice(0, -1)) : spec === l || spec.startsWith(`${l}/`)));
const resolveSpec = (file: string, spec: string): string | null => {
  if (spec.startsWith('.')) return path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
  const owner = file.startsWith('mobile/') ? 'mobile/' : '';
  for (const [a, to] of Object.entries(ALIASES[owner] as Record<string, string>)) if (spec.startsWith(a)) return to + spec.slice(a.length);
  return null;
};
const globHit = (globs: string[], p: string): boolean => globs.some((g) => (g.endsWith('/**') ? p.startsWith(g.slice(0, -2)) : p === g));
// A component file outside the binding homes (R-13 roots minus the surfaces dirs) is hand-built: a mount file may not import it, by any path form.
const HAND_BUILT = (p: string): boolean => ['src/components/', 'mobile/src/components/'].some((r) => p.startsWith(r)) && !['src/components/surfaces/', 'mobile/src/components/surfaces/'].some((r) => p.startsWith(r));
const stem = (p: string): string => p.replace(/\.(tsx?|jsx?|mjs|cjs)$/, '').replace(/\/index$/, '');

/** C-2: library and vendor imports outside the allowed files, non-literal specifiers outside tests, and mount-file imports outside the closed list. */
export const boundaryProblems = (root: string, b: Json): { lines: string[]; files: number; sites: number; allowed: number } => {
  const libs: string[] = [...b.libraries.web, ...b.libraries.mobile];
  const allowedFiles = new Set<string>([...b.modules.map((m: Json) => m.path), ...b.providers]);
  const modules = new Set<string>(b.modules.map((m: Json) => stem(m.path)));
  const mounts = new Set<string>(b.mounts.map((m: Json) => m.path));
  const needle = new RegExp(['vendor/rnr', 'require(', 'import(', '.mock(', ...libs.map((l) => l.replace(/\/\*$/, '/'))].map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'));
  const lines: string[] = [];
  let files = 0; let sites = 0; let allowed = 0;
  for (const file of [...walk(root, 'src', b.vendor_dir), ...walk(root, 'mobile', b.vendor_dir)]) {
    files += 1;
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    const isMount = mounts.has(file);
    if (!isMount && !needle.test(text)) continue;
    const exempt = allowedFiles.has(file) || globHit(b.test_globs, file);
    for (const s of sitesOf(text, file)) {
      sites += 1;
      if (s.spec === null) { if (!globHit(b.test_globs, file)) lines.push(`C-2 ${file}:${s.line}: non-literal ${s.kind} specifier`); continue; }
      const resolved = resolveSpec(file, s.spec);
      const lib = libOf(s.spec, libs);
      const vendor = resolved !== null && (resolved === b.vendor_dir || resolved.startsWith(`${b.vendor_dir}/`));
      if ((lib || vendor) && !exempt) { lines.push(`C-2 ${file}:${s.line}: ${vendor ? 'vendor path' : 'library'} ${s.spec} (${s.kind}) outside a binding module`); continue; }
      if (isMount && resolved !== null && HAND_BUILT(resolved)) { lines.push(`C-2 ${file}:${s.line}: mount file imports hand-built component ${s.spec}`); continue; }
      if (isMount) {
        const ok = s.spec.startsWith('.') || b.mount_internal.some((p: string) => s.spec?.startsWith(p)) || libOf(s.spec, b.framework) !== undefined
          || (resolved !== null && modules.has(stem(resolved)));
        if (!ok) { lines.push(`C-2 ${file}:${s.line}: mount file imports ${s.spec}`); continue; }
      }
      if (lib || vendor) allowed += 1;
    }
  }
  return { lines, files, sites, allowed };
};

/** C-2b: display text written in a mount file or binding module (JSX text, a string child, a string display attribute). */
export const textProblems = (text: string, file: string, nonDisplay: string[]): string[] => {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const at = (n: ts.Node): number => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const visit = (n: ts.Node): void => {
    if (ts.isJsxText(n) && n.text.trim() !== '') out.push(`C-2b ${file}:${at(n)}: JSX text "${n.text.trim()}"`);
    else if (ts.isJsxExpression(n) && n.expression && ts.isStringLiteralLike(n.expression) && !ts.isJsxAttribute(n.parent)) out.push(`C-2b ${file}:${at(n)}: string child "${n.expression.text}"`);
    else if (ts.isJsxAttribute(n) && n.initializer && !nonDisplay.includes(n.name.getText(sf))) {
      const v = ts.isStringLiteral(n.initializer) ? n.initializer : ts.isJsxExpression(n.initializer) && n.initializer.expression && ts.isStringLiteralLike(n.initializer.expression) ? n.initializer.expression : null;
      if (v) out.push(`C-2b ${file}:${at(n)}: display attribute ${n.name.getText(sf)}="${v.text}"`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
};

/** Every emitted descriptor by id (the real tree). */
const DESCRIPTORS: Map<string, Json> = (() => {
  const out = new Map<string, Json>();
  const walkD = (d: string): void => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walkD(p); else if (e.name.endsWith('.descriptor.json')) { const j = rj(p); out.set(j.identity.id, j); } } };
  walkD(path.join(REPO, 'scripts/surfaces'));
  return out;
})();
const realDescriptor = (id: string): Json | undefined => DESCRIPTORS.get(id);
const B_CONVERTED: Json[] = rj(path.join(REPO, SCHEMA, 'converted-surfaces.json')).converted.map((id: string) => DESCRIPTORS.get(id));

// ---- C-3 / C-4 / C-5 -------------------------------------------------------------------------------------------------------------------------------
const rootsLiteral = (text: string): string | null => /const COMPONENT_ROOTS = (\[[^\]]*\]);/.exec(text)?.[1] ?? null;
interface C3In { b: Json; exists: (p: string) => boolean; descriptor: (id: string) => Json | undefined; policy: Json; rootsTexts: string[]; converted: Json[] }
/** C-3: bindings.json data integrity. */
export const bindingsProblems = ({ b, exists, descriptor, policy, rootsTexts, converted }: C3In): string[] => {
  const out: string[] = [];
  const lits = rootsTexts.map(rootsLiteral);
  if (lits.some((l) => l === null) || new Set(lits).size !== 1) out.push(`C-3 COMPONENT_ROOTS copies differ: ${lits.join(' vs ')}`);
  const compRoots: string[] = lits[0] ? JSON.parse((lits[0] as string).replace(/'/g, '"')) : [];
  for (const r of b.module_roots) if (!compRoots.some((c) => r.startsWith(`${c}/`))) out.push(`C-3 module root ${r} is not under COMPONENT_ROOTS`);
  for (const r of [...b.module_roots, `${b.vendor_dir}/`]) if (!isFrontend(policy, `${r}x.tsx`)) out.push(`C-3 ${r} is not a frontend glob in mcbylaws/protected-paths.json`);
  for (const m of b.modules) {
    if (/[*?[\]{}]/.test(m.path)) { out.push(`C-3 module ${m.path}: a glob, not one file`); continue; }
    if (!m.path.endsWith('.tsx') || m.path.endsWith('.test.tsx')) out.push(`C-3 module ${m.path}: not a .tsx component file`);
    if (!b.module_roots.some((r: string) => m.path.startsWith(r))) out.push(`C-3 module ${m.path}: not under a module root`);
    if (!exists(m.path)) out.push(`C-3 module ${m.path}: missing`);
    if (!b.promoted_entries.includes(m.owner)) out.push(`C-3 module ${m.path}: owner ${m.owner} is not a promoted entry`);
    else if (!(descriptor(m.owner)?.identity?.owns?.components ?? []).includes(m.path)) out.push(`C-3 module ${m.path}: owner ${m.owner} does not own it`);
  }
  for (const id of b.promoted_entries) {
    const d = descriptor(id);
    if (!d) { out.push(`C-3 promoted entry ${id}: no census descriptor`); continue; }
    if (d.programme?.scope !== 'platform_shared') out.push(`C-3 promoted entry ${id}: scope ${d.programme?.scope}, not platform_shared`);
    for (const e of validateDescriptor(d).errors) out.push(`C-3 promoted entry ${id}: ${e}`);
  }
  for (const m of b.mounts) {
    if (!converted.some((d) => d.identity.id === m.surface)) out.push(`C-3 mount ${m.path}: ${m.surface} is not converted`);
    if (!exists(m.path)) out.push(`C-3 mount ${m.path}: missing`);
  }
  for (const d of converted) for (const p of d.identity.platforms) {
    if (!b.modules.some((m: Json) => m.platform === p && m.archetypes.includes(d.identity.archetype))) out.push(`C-3 ${d.identity.id}: no ${p} binding module for ${d.identity.archetype}`);
  }
  return out;
};
/** MF-48 (dated 2026-11-11; operator "MF-35 a" amended by MF-48 D-2 a for the render half only): every module a promoted entry owns carries exactly
 * the entry's one archetype, except the ONE shared mobile renderer (RENDER_HALF), which lists every archetype it renders and must list its owner's. */
export const RENDER_HALF = 'mobile/src/components/surfaces/SurfaceRenderer.tsx';
export const archetypeProblems = (b: Json, archOf: (id: string) => string | undefined): string[] => {
  const out: string[] = [];
  for (const id of b.promoted_entries as string[]) {
    const owned = (b.modules as Json[]).filter((m) => m.owner === id);
    const want = archOf(id);
    const arch = [...new Set<string>(owned.filter((m) => m.path !== RENDER_HALF).flatMap((m) => m.archetypes))];
    if (JSON.stringify(arch) !== JSON.stringify([want])) out.push(`C-3 ${id}: owned modules carry ${JSON.stringify(arch)}, the entry is ${String(want)}`);
    for (const m of owned.filter((x) => x.path === RENDER_HALF)) if (!m.archetypes.includes(want)) out.push(`C-3 ${m.path}: the render half does not list its owner's archetype ${String(want)}`);
  }
  return out;
};
/** C-4: a converted surface renders through bindings only, so it owns no component (R-13). */
export const handProblems = (converted: Json[]): string[] => converted.flatMap((d) => (d.identity.owns?.components ?? []).map((c: string) => `C-4 ${d.identity.id}: owns ${c}`));
/** C-5: the vendored manifest exists, has its shape, and equals the vendor dir both directions with sha256. */
export const vendorProblems = (root: string, b: Json): { lines: string[]; files: number; waits: string | undefined } => {
  const mp = path.join(root, b.vendor_manifest);
  if (!fs.existsSync(mp)) return { lines: [`C-5 ${b.vendor_manifest}: missing`], files: 0, waits: undefined };
  const m = rj(mp);
  const shape = shapeProblems(root, 'vendor_manifest', m).map((p: string) => `C-5 ${path.basename(mp)}: ${p}`);
  if (shape.length > 0) return { lines: shape, files: 0, waits: undefined };
  const out: string[] = [];
  const listed = new Map<string, string>(m.files.map((f: Json) => [f.path, f.sha256]));
  const onDisk = walkAll(path.join(root, b.vendor_dir)).map((p) => path.posix.join(b.vendor_dir, p));
  for (const p of onDisk) if (!listed.has(p)) out.push(`C-5 ${p}: not in the manifest`);
  for (const [p, h] of listed) {
    if (!fs.existsSync(path.join(root, p))) out.push(`C-5 ${p}: listed but missing`);
    else if (sha256(path.join(root, p)) !== h) out.push(`C-5 ${p}: edited (sha256 differs)`);
  }
  return { lines: out, files: listed.size, waits: m.waits };
};
const walkAll = (dir: string, rel = ''): string[] => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walkAll(path.join(dir, e.name), path.posix.join(rel, e.name)) : [path.posix.join(rel, e.name)])) : []);

// ---- the cases -------------------------------------------------------------------------------------------------------------------------------------

describe('C-1 the arms on the real tree, and the queue state', () => {
  it('SV-DESC is clean with the exact counts (25 in scope: 7 converted, 5 pending, 9 parked, 4 report); SCREEN and SBIND judge the MF-37, MF-35 and MF-40 surfaces', async () => {
    const ctx = await loadContext(REPO);
    const d = descArm(ctx);
    expect(d.findings).toEqual([]);
    // MF-35 (dated 2026-11-10): mobile_parcel_search is converted (converted 3 -> 4, pending 7 -> 6); its 10 mobile goldens and 23 content strings join.
    // MF-40 (dated 2026-11-10; operator "y recommendation: C, with the four trims. approved"): admin_placements converted from pending, admin_offers and
    // admin_advertiser_entry new (25 in scope, converted 4 -> 7, pending 6 -> 5); 17 web goldens and 75 content strings join (re-measured on the MF-35 tip).
    expect(d.note).toBe('S-desc ok (examined 25 in scope: converted 8, pending 4, parked 9, report 4)'); // MF-53: the map page converted
    // MF-37 (dated 2026-11-09): converted was empty with waits MF-37 until this commit; the counts move with the three admin media surfaces.
    // MF-58 (dated 2026-11-10; ruling 2026-11-10 items 16 and 5): the search page legal line joins as one content key (154 -> 155 strings);
    // red evidence docs/reports/red-evidence/MF-58/legal-line-red.txt.
    // MF-44 (dated 2026-11-11; operator "01-a 0-2 b as long as they are complaint"): mobile_parcel_search gains its web target, so its 10 web goldens
    // join (44 -> 54); no content key is added (the web reads the same 23 strings).
    // MF-53 (dated 2026-11-11): + the map page (11 mobile goldens, 21 strings).
    expect([screenArm(ctx), sbindArm(ctx)]).toEqual([{ findings: [], note: 'S-screen ok (8 surfaces, 65 goldens)' }, { findings: [], note: 'S-sbind ok (8 surfaces, 176 strings)' }]);
  });
  it('every row the manifest names (waits and each pending row) is an open McFrontend queue heading', () => {
    const m = rj(path.join(REPO, SCHEMA, 'converted-surfaces.json'));
    expect(queueProblems(m, fs.readFileSync(path.join(REPO, m.queue), 'utf8'))).toEqual([]);
  });
  it('RED (in memory): a DONE waits row, an absent pending row, and a missing queue file', () => {
    const m = { queue: '.cursor/MCFRONTEND-QUEUE.md', waits: 'MF-37', pending_conversion: [{ id: 'admin_placements', row: 'MF-40' }, { id: 'web_landing', row: 'MF-46' }] };
    const q = '**MF-37 Admin media — DONE 2026-11-10 (MF-37@abc)** (E)\n**MF-46 Web front door — LATER** (E)\n';
    expect(queueProblems(m, q)).toEqual(['queue MF-37: heading is DONE (named by waits)', 'queue MF-40: no heading (named by admin_placements)']);
    expect(queueProblems(m, undefined)).toEqual(['queue .cursor/MCFRONTEND-QUEUE.md: missing']);
  });
});

describe('C-2 the import boundary (one tier: libraries only in binding modules, providers, tests and the vendor dir)', () => {
  it('the real tree: no finding; the pinned D-2/D-3 libraries are listed; the walk examined files', () => {
    for (const l of ['@mantine/core', 'mantine-datatable', '@rjsf/mantine', '@rjsf/validator-ajv8']) expect(B.libraries.web).toContain(l);
    expect(B.libraries.mobile).toEqual(['@rn-primitives/*']);
    const r = boundaryProblems(REPO, B);
    console.log(`C-2: examined ${r.files} files, ${r.sites} import sites, ${r.allowed} allowed`);
    expect(r.files).toBeGreaterThan(0);
    expect(r.lines).toEqual([]);
  });
  it('the alias map the walk resolves equals each tsconfig paths', () => {
    const read = (p: string): Json => (ts.readConfigFile(path.join(REPO, p), ts.sys.readFile).config as Json).compilerOptions.paths;
    expect(read('tsconfig.json')).toEqual({ '@/*': ['./src/*'] });
    expect(read('mobile/tsconfig.json')).toEqual({ '@/*': ['./src/*'], '@app/*': ['./app/*'] });
  });
  it('RED: one planted file per specifier form outside a binding module; tests, modules and mocks are allowed', () => {
    const root = tmp();
    const b = { ...B, modules: [{ path: 'src/components/surfaces/web/FormBinding.tsx', platform: 'web', archetypes: ['FORM'], owner: 'binding_web_form', exports: [] }] };
    put(root, 'src/app/x/Wrapper.tsx', "import { Button } from '@mantine/core';\nexport const W = Button;\n");
    put(root, 'mobile/app/y.tsx', "import { Slot } from '@rn-primitives/slot';\nexport const Y = Slot;\n");
    put(root, 'src/lib/foo.ts', "export { DataTable } from 'mantine-datatable';\n");
    put(root, 'src/components/z.tsx', "export const z = () => import('@rjsf/core');\n");
    put(root, 'mobile/app/w.tsx', "import { B1 } from '@/vendor/rnr/button';\nimport { B2 } from '../src/vendor/rnr/button';\nexport const w = [B1, B2];\n");
    put(root, 'src/lib/t.ts', "import type { MantineTheme } from '@mantine/core';\nexport type T = MantineTheme;\n");
    put(root, 'src/x.css', "@import '@mantine/core/styles.css';\n");
    put(root, 'src/lib/x.ts', 'const name = process.env.X as string;\nexport const m = require(name);\n');
    put(root, 'src/tests/x.test.ts', "const name = 'a';\nexport const m = require(name);\nvi.mock('@mantine/core');\n");
    put(root, 'src/components/surfaces/web/FormBinding.tsx', "import { Button } from '@mantine/core';\nexport const F = Button;\n");
    put(root, 'src/lib/q.ts', "import M = require('@mantine/core');\nexport const q = M;\n");
    expect(boundaryProblems(root, b).lines.sort()).toEqual([
      'C-2 mobile/app/w.tsx:1: vendor path @/vendor/rnr/button (import) outside a binding module',
      'C-2 mobile/app/w.tsx:2: vendor path ../src/vendor/rnr/button (import) outside a binding module',
      'C-2 mobile/app/y.tsx:1: library @rn-primitives/slot (import) outside a binding module',
      'C-2 src/app/x/Wrapper.tsx:1: library @mantine/core (import) outside a binding module',
      'C-2 src/components/z.tsx:1: library @rjsf/core (import()) outside a binding module',
      'C-2 src/lib/foo.ts:1: library mantine-datatable (export from) outside a binding module',
      'C-2 src/lib/q.ts:1: library @mantine/core (import =) outside a binding module',
      'C-2 src/lib/t.ts:1: library @mantine/core (import) outside a binding module',
      'C-2 src/lib/x.ts:2: non-literal require specifier',
      'C-2 src/x.css:1: library @mantine/core/styles.css (css @import) outside a binding module',
    ]);
  });
  it('a converted mount file: a UI library or any other third-party package is RED; framework, binding modules and project-internal paths are allowed', () => {
    const root = tmp();
    const page = 'src/app/(maxbld)/admin/media/page.tsx';
    const b = { ...B, mounts: [{ surface: 'admin_media', path: page }], modules: [{ path: 'src/components/surfaces/web/FormBinding.tsx', platform: 'web', archetypes: ['FORM'], owner: 'binding_web_form', exports: [] }] };
    put(root, page, ["import { notFound } from 'next/navigation';", "import { useState } from 'react';", "import { FormBinding } from '@/components/surfaces/web/FormBinding';",
      "import { requireAdminPage } from '@/lib/auth/admin';", "import { useMedia } from './useMedia';", "import { toast } from 'sonner';", "import { View } from 'react-native';",
      "import { Button } from '@mantine/core';", "import { Wrapper } from '../../../../components/admin/Wrapper';", "import { Tile } from '@/components/admin/Tile';",
      'export const p = [notFound, useState, FormBinding, requireAdminPage, useMedia, toast, View, Button, Wrapper, Tile];', ''].join('\n'));
    expect(boundaryProblems(root, b).lines).toEqual([
      'C-2 src/app/(maxbld)/admin/media/page.tsx:6: mount file imports sonner',
      'C-2 src/app/(maxbld)/admin/media/page.tsx:7: mount file imports react-native',
      'C-2 src/app/(maxbld)/admin/media/page.tsx:8: library @mantine/core (import) outside a binding module',
      'C-2 src/app/(maxbld)/admin/media/page.tsx:9: mount file imports hand-built component ../../../../components/admin/Wrapper',
      'C-2 src/app/(maxbld)/admin/media/page.tsx:10: mount file imports hand-built component @/components/admin/Tile',
    ]);
  });
});

describe('C-2b no display text in mount files and binding modules (the exempt list: tests, the vendor dir, non_display_keys attributes)', () => {
  it('the real tree: the mount files and binding modules bindings.json lists hold no display text (MF-37: 4 mounts, 2 modules)', () => {
    const files = [...B.mounts.map((m: Json) => m.path), ...B.modules.map((m: Json) => m.path)];
    const lines = files.flatMap((f: string) => textProblems(fs.readFileSync(path.join(REPO, f), 'utf8'), f, B.non_display_keys));
    console.log(`C-2b: ${files.length} files`);
    expect(files.length).toBeGreaterThan(0);
    expect(lines).toEqual([]);
  });
  it('RED: JSX text, a string child and a string display attribute; a non-display attribute and a content binding are allowed', () => {
    const src = "export const P = ({ c }: { c: Record<string, string> }) => (\n  <Stack variant=\"page\">\n    <Text>Save</Text>\n    <Text>{'Cancel'}</Text>\n    <Button title=\"Go\">{c['k']}</Button>\n    <Input title={'Name'} placeholder={`Type`} variant={'filled'} />\n  </Stack>\n);\n";
    expect(textProblems(src, 'page.tsx', B.non_display_keys)).toEqual([
      'C-2b page.tsx:3: JSX text "Save"',
      'C-2b page.tsx:4: string child "Cancel"',
      'C-2b page.tsx:5: display attribute title="Go"',
      'C-2b page.tsx:6: display attribute title="Name"',
      'C-2b page.tsx:6: display attribute placeholder="Type"',
    ]);
  });
});

describe('C-3 bindings.json integrity', () => {
  const rootsTexts = ['src/tests/surface-registry.infra.test.ts', 'scripts/violations/generate-surface-registry.mjs'].map((p) => fs.readFileSync(path.join(REPO, p), 'utf8'));
  const real: C3In = { b: B, exists: (p) => fs.existsSync(path.join(REPO, p)), descriptor: realDescriptor, policy: POLICY, rootsTexts, converted: B_CONVERTED };
  it('MF-35 OUTPUT fold MEDIUM 3 (operator "MF-35 a"): each promoted entry carries the one archetype of the modules it owns', () => {
    // MF-48 (dated 2026-11-11; D-2 a, Spec 126 §11b.2 dated note 2026-11-11): amended for the render half only (archetypeProblems above). The
    // shared mobile renderer lists every archetype it renders, its owner's among them; every other owned module still carries exactly the owner's one.
    expect(archetypeProblems(B, (id) => (DESCRIPTORS.get(id) as Json | undefined)?.identity?.archetype)).toEqual([]);
    expect(B.modules.find((m: Json) => m.path === RENDER_HALF).archetypes).toEqual(['SEARCH', 'REPORT', 'LIST']); // MF-53: + LIST (the map page)
  });
  it('MF-48 RED (in memory): the props half listing a second archetype, the render half without its owner\'s archetype, and a second render half all fail', () => {
    const arch = (id: string): string | undefined => (DESCRIPTORS.get(id) as Json | undefined)?.identity?.archetype;
    const edit = (f: (ms: Json[]) => void): Json => { const b = structuredClone(B); f(b.modules); return b; };
    expect(archetypeProblems(edit((ms) => { ms.find((m) => m.path === 'mobile/src/components/surfaces/SearchBinding.tsx')!.archetypes = ['SEARCH', 'REPORT']; }), arch))
      .toEqual(['C-3 shared_mobile_surface_binding: owned modules carry ["SEARCH","REPORT"], the entry is SEARCH']);
    expect(archetypeProblems(edit((ms) => { ms.find((m) => m.path === RENDER_HALF)!.archetypes = ['REPORT']; }), arch))
      .toEqual(['C-3 mobile/src/components/surfaces/SurfaceRenderer.tsx: the render half does not list its owner\'s archetype SEARCH']);
    expect(archetypeProblems(edit((ms) => { ms.find((m) => m.path.endsWith('ReportBinding.tsx'))!.archetypes = ['REPORT', 'SEARCH']; }), arch))
      .toEqual(['C-3 binding_mobile_report: owned modules carry ["REPORT","SEARCH"], the entry is REPORT']);
  });
  it('MF-53 RED (in memory): the props half listing a second archetype, the render half without its owner\'s archetype both fail', () => {
    const arch = (id: string): string | undefined => (DESCRIPTORS.get(id) as Json | undefined)?.identity?.archetype;
    const edit = (f: (ms: Json[]) => void): Json => { const b = structuredClone(B); f(b.modules); return b; };
    expect(archetypeProblems(edit((ms) => { ms.find((m) => m.path === 'mobile/src/components/surfaces/SearchBinding.tsx')!.archetypes = ['SEARCH', 'LIST']; }), arch))
      .toEqual(['C-3 shared_mobile_surface_binding: owned modules carry ["SEARCH","LIST"], the entry is SEARCH']);
    expect(archetypeProblems(edit((ms) => { ms.find((m) => m.path === RENDER_HALF)!.archetypes = ['LIST']; }), arch))
      .toEqual(['C-3 mobile/src/components/surfaces/SurfaceRenderer.tsx: the render half does not list its owner\'s archetype SEARCH']);
    expect(archetypeProblems(edit((ms) => { ms.find((m) => m.path.endsWith('LotMapBinding.tsx'))!.archetypes = ['LIST', 'SEARCH']; }), arch))
      .toEqual(['C-3 binding_mobile_list: owned modules carry ["LIST","SEARCH"], the entry is LIST']);
  });
  it('the real tree: no finding; the MF-37 modules, owners, promoted entries and mounts hold; the shape is valid', () => {
    expect(shapeProblems(REPO, 'bindings', B)).toEqual([]);
    expect(bindingsProblems(real)).toEqual([]);
    console.log(`C-3: ${B.modules.length} modules`);
    // MF-35 (dated 2026-11-10): + the two mobile modules, their promoted entry shared_mobile_surface_binding and the search screen mount.
    // MF-44 (dated 2026-11-11; Spec 126 §11b.5): + the web SEARCH module, its promoted entry binding_web_search and the four web search mounts.
    // MF-48 (dated 2026-11-11; D-2 a): + ReportBinding.tsx and ReportPageHost.tsx and their promoted entry binding_mobile_report; no mount (Stage A).
    expect([B.modules.length, B.promoted_entries.length, B.mounts.length]).toEqual([8, 6, 15]); // MF-53: + LotMapBinding.tsx, binding_mobile_list, the map page mount; // MF-40: +5 mounts (the placements page, client mount, error boundary)
  });
  it('RED (in memory): a glob as a path, a .ts module, a module under src/lib, an owner that does not own it, a promoted entry outside platform_shared', () => {
    const owner = { identity: { owns: { components: [] } }, programme: { scope: 'parcel_admin' } };
    const b = { ...B, promoted_entries: ['binding_web_form'], modules: [
      { path: 'src/components/surfaces/web/*.tsx', platform: 'web', archetypes: ['FORM'], owner: 'binding_web_form', exports: [] },
      { path: 'src/components/surfaces/web/props.ts', platform: 'web', archetypes: ['FORM'], owner: 'binding_web_form', exports: [] },
      { path: 'src/lib/surfaces/FormBinding.tsx', platform: 'web', archetypes: ['FORM'], owner: 'binding_web_form', exports: [] },
    ] };
    const lines = bindingsProblems({ ...real, b, exists: () => true, descriptor: (id) => (id === 'binding_web_form' ? owner : undefined) });
    expect(lines).toContain('C-3 module src/components/surfaces/web/*.tsx: a glob, not one file');
    expect(lines).toContain('C-3 module src/components/surfaces/web/props.ts: not a .tsx component file');
    expect(lines).toContain('C-3 module src/lib/surfaces/FormBinding.tsx: not under a module root');
    expect(lines).toContain('C-3 module src/components/surfaces/web/props.ts: owner binding_web_form does not own it');
    expect(lines).toContain('C-3 promoted entry binding_web_form: scope parcel_admin, not platform_shared');
  });
  it('RED (in memory): a COMPONENT_ROOTS copy changed, and the vendor glob absent from the policy', () => {
    const changed = [rootsTexts[0] as string, (rootsTexts[1] as string).replace("'mobile/src/components']", "'mobile/src/ui']")];
    expect(bindingsProblems({ ...real, rootsTexts: changed })).toContain("C-3 COMPONENT_ROOTS copies differ: ['src/components', 'mobile/src/components'] vs ['src/components', 'mobile/src/ui']");
    const policy = { ...POLICY, frontend: POLICY.frontend.filter((g: string) => g !== 'mobile/src/vendor/rnr/**') };
    expect(bindingsProblems({ ...real, policy })).toEqual(['C-3 mobile/src/vendor/rnr/ is not a frontend glob in mcbylaws/protected-paths.json']);
  });
  it('RED (in memory): a converted surface with no binding module for its platform and archetype', () => {
    const none = { ...B, modules: [], mounts: [], promoted_entries: [] };
    expect(bindingsProblems({ ...real, b: none, converted: [{ identity: { id: 'admin_media', platforms: ['web'], archetype: 'FORM' } }] })).toEqual(['C-3 admin_media: no web binding module for FORM']);
  });
});

describe('C-4 a converted surface owns no component', () => {
  it('the real tree: no converted surface owns a component', async () => {
    const ctx = await loadContext(REPO);
    expect(handProblems(ctx.manifest.converted.map((id: string) => ctx.inScope.get(id).d))).toEqual([]);
  });
  it('RED: a converted fixture that owns src/components/Foo.tsx', async () => {
    const fx = buildFixture('mf42-c4-'); roots.push(fx.root);
    editDescriptor(fx, 'FORM', (d) => { d.identity.owns.components = ['src/components/Foo.tsx']; });
    const ctx = await loadContext(fx.root);
    expect(handProblems(ctx.manifest.converted.map((id: string) => ctx.inScope.get(id).d))).toEqual(['C-4 admin_placements: owns src/components/Foo.tsx']);
  });
});

describe('C-5 the vendored Reusables manifest (unmodified, both directions)', () => {
  it('the real tree: the manifest exists and is valid; MF-35 vendored 6 files (5 CLI parts with their registry sha256, the docs cn helper), no waits', () => {
    const r = vendorProblems(REPO, B);
    expect(r.lines).toEqual([]);
    const m = rj(path.join(REPO, B.vendor_manifest));
    expect(m.cli).toBe('@react-native-reusables/cli@0.7.1');
    console.log(r.files === 0 ? `C-5: vendored 0 files WAITS ${r.waits}` : `C-5: vendored ${r.files} files`);
    // MF-35 (dated 2026-11-10; P35-D8 a, P35-D9): the manifest was empty with waits MF-35 until the library commit. The CLI pin does not pin the
    // output (shadcn@latest), so the resolved shadcn version and each CLI file's registry JSON sha256 are recorded; the cn helper is source docs.
    expect([r.files, r.waits, m.shadcn_version]).toEqual([6, undefined, '4.23.0']);
    expect(m.files.map((f: Json) => [f.path.slice(B.vendor_dir.length + 1), f.source, typeof f.registry_sha256])).toEqual([
      ['components/ui/alert.tsx', 'cli', 'string'], ['components/ui/button.tsx', 'cli', 'string'], ['components/ui/icon.tsx', 'cli', 'string'],
      ['components/ui/input.tsx', 'cli', 'string'], ['components/ui/text.tsx', 'cli', 'string'], ['lib/utils.ts', 'docs', 'undefined'],
    ]);
  });
  const oneFile = (): string => {
    const root = tmp();
    fs.cpSync(path.join(REPO, SCHEMA, 'screen-data.schema.json'), path.join(root, SCHEMA, 'screen-data.schema.json'));
    put(root, `${B.vendor_dir}/button.tsx`, 'export const Button = 1;\n');
    put(root, B.vendor_manifest, JSON.stringify({ cli: '@react-native-reusables/cli@0.7.1', registry: 'nativewind', files: [{ path: `${B.vendor_dir}/button.tsx`, sha256: sha256(path.join(root, B.vendor_dir, 'button.tsx')), source: 'cli' }] }));
    return root;
  };
  it('control: a synthesized one-file manifest is clean', () => {
    expect(vendorProblems(oneFile(), B)).toEqual({ lines: [], files: 1, waits: undefined });
  });
  it('RED: an added file, an edited file, a listed file deleted, an absent manifest, cli missing', () => {
    let root = oneFile(); put(root, `${B.vendor_dir}/extra.tsx`, 'x\n');
    expect(vendorProblems(root, B).lines).toEqual([`C-5 ${B.vendor_dir}/extra.tsx: not in the manifest`]);
    root = oneFile(); fs.appendFileSync(path.join(root, B.vendor_dir, 'button.tsx'), '// edit\n');
    expect(vendorProblems(root, B).lines).toEqual([`C-5 ${B.vendor_dir}/button.tsx: edited (sha256 differs)`]);
    root = oneFile(); fs.rmSync(path.join(root, B.vendor_dir, 'button.tsx'));
    expect(vendorProblems(root, B).lines).toEqual([`C-5 ${B.vendor_dir}/button.tsx: listed but missing`]);
    root = oneFile(); fs.rmSync(path.join(root, B.vendor_manifest));
    expect(vendorProblems(root, B).lines).toEqual([`C-5 ${B.vendor_manifest}: missing`]);
    root = oneFile(); const m = rj(path.join(root, B.vendor_manifest)); delete m.cli; put(root, B.vendor_manifest, JSON.stringify(m));
    expect(vendorProblems(root, B).lines).toEqual(["C-5 vendor-rnr.manifest.json: / must have required property 'cli'"]);
  });
});

describe('C-6 the generated types and validator equal a fresh emit', () => {
  const emit = (): { dts: string; val: string } => {
    const out = tmp();
    const r = spawnSync(process.execPath, [path.join(REPO, 'scripts/violations/generate-surface-registry.mjs'), '--emit-descriptors'], {
      cwd: REPO, encoding: 'utf8', env: { ...process.env, BUILDO_SURFACE_DESCRIPTOR_DIR: path.join(out, 'd'), BUILDO_SURFACE_TYPES_OUT: path.join(out, 't.d.ts'), BUILDO_SURFACE_VALIDATOR_OUT: path.join(out, 'v.mjs') },
    });
    expect(r.status, r.stderr).toBe(0);
    return { dts: fs.readFileSync(path.join(out, 't.d.ts'), 'utf8'), val: fs.readFileSync(path.join(out, 'v.mjs'), 'utf8') };
  };
  it('a temp emit is byte-identical to the committed d.ts and validator; RED: a hand edit of the d.ts differs', () => {
    const fresh = emit();
    const dts = fs.readFileSync(path.join(REPO, 'src/lib/surfaces/generated/surface-descriptor.d.ts'), 'utf8');
    expect(fresh.dts).toBe(dts);
    expect(fresh.val).toBe(fs.readFileSync(path.join(REPO, 'src/lib/surfaces/generated/validate-descriptor.mjs'), 'utf8'));
    expect(dts).toContain('columns?: Array<{');
    // Binding standard (MF-40 plan delta 1, option C, 2026-11-10): the column display union gains "image"; the plant follows it.
    expect(fresh.dts).not.toBe(dts.replace('display: "text" | "boolean" | "enum" | "image";', 'display: string;'));
  }, 60000);
});

describe('C-7 schema closedness and the cutover (the closed render vocabulary grows only by the 128 section 4 route)', () => {
  const v = (d: Json): string[] => validateDescriptor(d).errors;
  it('controls: each converted fixture is valid with 0 sentinels; every live descriptor is valid; a non-generated FORM and LIST need no new key', () => {
    for (const a of ARCHETYPES) { const d = convert(a); expect([a, v(d), unresearchedCount(d)]).toEqual([a, [], 0]); }
    const walkD = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walkD(path.join(d, e.name)) : e.name.endsWith('.descriptor.json') ? [path.join(d, e.name)] : []));
    const all = walkD(path.join(REPO, 'scripts/surfaces'));
    // MF-48 (dated 2026-11-11; D-2 a): +1 promoted binding entry (binding_mobile_report).
    expect(all.length).toBe(159); // MF-53: +1 promoted binding entry (binding_mobile_list); MF-48: +1 promoted binding entry; MF-44: +1 promoted binding entry (binding_web_search); MF-45: +1 CONTRACT (contract_parcels_entitlement, operator 2026-11-11 "4. ... we have the tokens now"); MF-37: +3 SURFACE, +3 CONTRACT, +2 promoted binding entries (was 141 at MF-42); MF-35: +1 promoted binding entry (shared_mobile_surface_binding); MF-40: +2 SURFACE, +3 CONTRACT
    expect(all.filter((f) => v(rj(f)).length > 0)).toEqual([]);
    // MF-40 converted admin_placements; the non-generated FORM control is now binding_web_form (status new, no render.form).
    // Regression guardian LOW-1 (MF-40 OUTPUT panel): binding_web_form is a platform_shared promoted binding entry, not a pending user-facing surface;
    // it serves only as the "a FORM that is not generated carries no render.form" control. When it, too, gains render.form, pick another non-generated FORM.
    const form = rj(path.join(REPO, 'scripts/surfaces/platform_shared/F14/surfaces/binding_web_form.descriptor.json'));
    expect([form.status, form.render.form]).toEqual(['new', undefined]);
  });
  it('X4: a generated LIST whose projection is not list needs no columns', () => {
    const d = convert('LIST'); d.render.projection = 'map'; delete d.render.list.columns;
    expect(v(d)).toEqual([]);
  });
  it('RED: an extra key in render.form, in a form field and in a column is refused', () => {
    const f = convert('FORM'); f.render.form.props = {};
    expect(v(f)).toContain('/render/form must NOT have additional properties');
    const g = convert('FORM'); g.render.form.fields[0].ui = {};
    expect(v(g)).toContain('/render/form/fields/0 must NOT have additional properties');
    const l = convert('LIST'); l.render.list.columns[0].render = 'x';
    expect(v(l)).toContain('/render/list/columns/0 must NOT have additional properties');
  });
  it('RED: the sentinel loophole is closed (render.form and render.list must be objects once generated), golden "none" refused, a label owed', () => {
    const f = convert('FORM'); f.render.form = 'UNRESEARCHED';
    expect(v(f)).toContain('/render/form must be object');
    const l = convert('LIST'); l.render.list = 'UNRESEARCHED';
    expect(v(l)).toContain('/render/list must be object');
    const s = convert('SEARCH'); s.states[0].golden = 'none';
    expect(v(s)).toContain('/states/0/golden must NOT be valid');
    const g = convert('FORM'); delete g.render.form.fields[0].label;
    expect(v(g)).toContain("/render/form/fields/0 must have required property 'label'");
    const h = convert('FORM'); h.render.form.fields[0].widget = 'hidden'; delete h.render.form.fields[0].label;
    expect(v(h).filter((e) => e.startsWith('/render/form/fields/0'))).toEqual([]);
  });
});

// ---- C-8 / C-9 / C-11 (MF-37; MF-42 size ruling and batch C-1, C-11: the web closed mapping, the web 44 px case and the theme check) -------------

/** C-8: every JSX element a web binding module renders is a library component listed in bindings.json mapping.web for its archetypes. */
export const mappingProblems = (text: string, file: string, allowed: string[], libs: string[] = B.libraries.web): string[] => {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const imported = new Map<string, string>(); // local name -> imported name, for every named or default import
  const fromSpec = new Map<string, string>(); // local name -> its module specifier (a JSX tag must come from a UI library: code-reviewer OUTPUT F2)
  const locals = new Set<string>(); // names declared in the module itself (functions, consts, classes)
  const out: string[] = [];
  const at = (n: ts.Node): number => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  for (const s of sf.statements) {
    if (ts.isImportDeclaration(s) && s.importClause) {
      const c = s.importClause;
      const spec = ts.isStringLiteral(s.moduleSpecifier) ? s.moduleSpecifier.text : '';
      for (const n of [c.name?.text, ...(c.namedBindings && ts.isNamedImports(c.namedBindings) ? c.namedBindings.elements.map((e) => e.name.text) : []), c.namedBindings && ts.isNamespaceImport(c.namedBindings) ? c.namedBindings.name.text : undefined]) if (n) fromSpec.set(n, spec);
      if (c.name) imported.set(c.name.text, c.name.text);
      if (c.namedBindings && ts.isNamedImports(c.namedBindings)) for (const e of c.namedBindings.elements) imported.set(e.name.text, (e.propertyName ?? e.name).text);
      if (c.namedBindings && ts.isNamespaceImport(c.namedBindings)) imported.set(c.namedBindings.name.text, `${c.namedBindings.name.text}.*`);
    }
  }
  const declare = (n: ts.Node): void => {
    if ((ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) && n.name) locals.add(n.name.text);
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) locals.add(n.name.text);
    ts.forEachChild(n, declare);
  };
  declare(sf);
  const tagOf = (tag: ts.JsxTagNameExpression): string => {
    if (ts.isIdentifier(tag)) return imported.get(tag.text) ?? (locals.has(tag.text) ? `local:${tag.text}` : tag.text);
    if (ts.isPropertyAccessExpression(tag)) { const base = tagOf(tag.expression as ts.JsxTagNameExpression); return `${base.replace(/\.\*$/, '')}.${tag.name.text}`; }
    return tag.getText(sf);
  };
  const visit = (n: ts.Node): void => {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      const name = tagOf(n.tagName);
      if (name.startsWith('local:')) out.push(`C-8 ${file}:${at(n)}: hand-built component ${name.slice(6)}`);
      else if (/^[a-z]/.test(name)) out.push(`C-8 ${file}:${at(n)}: intrinsic element <${name}>`);
      else if (!allowed.includes(name)) out.push(`C-8 ${file}:${at(n)}: ${name} is not in mapping.web`);
      else if (ts.isIdentifier(n.tagName) && libOf(fromSpec.get(n.tagName.text) ?? '', libs) === undefined) out.push(`C-8 ${file}:${at(n)}: ${name} is imported from ${fromSpec.get(n.tagName.text) ?? 'nowhere'}, not a UI library`);
    }
    if (ts.isCallExpression(n)) {
      const e = n.expression;
      const callee = ts.isIdentifier(e) ? imported.get(e.text) ?? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : '';
      if (callee === 'createElement' || callee === 'jsx' || callee === 'jsxs') out.push(`C-8 ${file}:${at(n)}: ${callee}() call (JSX only, so the mapping can judge it)`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
};
const allowedFor = (m: Json): string[] => [...new Set<string>(m.archetypes.flatMap((a: string) => B.mapping?.web?.[a] ?? []))];

describe('C-8 the web closed mapping (every JSX element of a web binding module is a listed library component)', () => {
  it('the real tree: each web module renders only mapping.web names for its archetypes', () => {
    const mods = B.modules.filter((m: Json) => m.platform === 'web');
    console.log(`C-8: ${mods.length} web modules`);
    expect(mods.length).toBeGreaterThan(0);
    for (const m of mods) expect([m.path, mappingProblems(fs.readFileSync(path.join(REPO, m.path), 'utf8'), m.path, allowedFor(m))]).toEqual([m.path, []]);
  });
  it('RED: a mapped name imported from a hand-built file (code-reviewer OUTPUT F2)', () => {
    const src = "import { Button } from './handbuilt';\nexport const P = () => <Button />;\n";
    expect(mappingProblems(src, 'h.tsx', ['Button'])).toEqual(['C-8 h.tsx:2: Button is imported from ./handbuilt, not a UI library']);
  });
  it('RED: an unexported in-binding component, React.createElement of a table, an unmapped <Card/>, an intrinsic <div>, an aliased import', () => {
    const allowed = ['Stack', 'Button'];
    const src = [
      "import React from 'react';", "import { Card, Stack, Button as Btn } from '@mantine/core';",
      'const Row = () => <Stack />;', 'export const P = () => (', '  <Stack>', '    <Row />', '    <Card />', '    <Btn />', '    <div />', "    {React.createElement('table')}", '  </Stack>', ');', '',
    ].join('\n');
    expect(mappingProblems(src, 'm.tsx', allowed)).toEqual([
      'C-8 m.tsx:6: hand-built component Row',
      'C-8 m.tsx:7: Card is not in mapping.web',
      'C-8 m.tsx:9: intrinsic element <div>',
      "C-8 m.tsx:10: createElement() call (JSX only, so the mapping can judge it)",
    ]);
  });
});

/** C-9: every golden node whose component is in touch_targets.web carries a listed size; returns the problems and the nodes examined. */
export const touchProblems = (node: unknown, at: string, sizes: Record<string, string[]>): { lines: string[]; n: number } => {
  if (Array.isArray(node)) return node.reduce((acc: { lines: string[]; n: number }, x, i) => { const r = touchProblems(x, `${at}/${i}`, sizes); return { lines: [...acc.lines, ...r.lines], n: acc.n + r.n }; }, { lines: [], n: 0 });
  if (node === null || typeof node !== 'object') return { lines: [], n: 0 };
  const o = node as Json;
  let lines: string[] = [];
  let n = 0;
  if (typeof o.component === 'string' && sizes[o.component]) {
    n += 1;
    const s = o.props?.size;
    if (!sizes[o.component]?.includes(s)) lines.push(`C-9 ${at}: ${o.component} size ${s ?? 'none'} (needs ${sizes[o.component]?.join('|')})`);
  }
  for (const [k, v] of Object.entries(o)) { const r = touchProblems(v, `${at}/${k}`, sizes); lines = [...lines, ...r.lines]; n += r.n; }
  return { lines, n };
};

describe('C-9 the web 44 px case (golden nodes of a sized component carry a 44 px size)', () => {
  it('the real tree: every converted web golden passes, with a non-vacuous count per archetype', () => {
    const m = rj(path.join(REPO, SCHEMA, 'converted-surfaces.json'));
    const per: Record<string, number> = {};
    for (const id of m.converted) {
      const d = DESCRIPTORS.get(id) as Json;
      if (!d.identity.platforms.includes('web')) continue; // MF-35 (dated 2026-11-10): a mobile-only surface is judged by C-9m below
      for (const s of d.states) {
        const g = rj(path.join(REPO, 'src/tests/fixtures/surfaces', id, `${s.golden}.web.json`));
        const r = touchProblems(g.props, `${id}/${s.golden}`, B.touch_targets.web);
        expect(r.lines).toEqual([]);
        per[d.identity.archetype] = (per[d.identity.archetype] ?? 0) + r.n;
      }
    }
    console.log(`C-9: sized nodes per archetype ${JSON.stringify(per)}`);
    // MF-44 (dated 2026-11-11): the web SEARCH goldens join, judged by the same touch_targets.web (Button and TextInput lg).
    expect(Object.keys(per).sort()).toEqual(['FORM', 'LIST', 'SEARCH']);
    for (const v of Object.values(per)) expect(v).toBeGreaterThan(0);
  });
  it('RED: Button size sm, a Button with no size, ActionIcon lg, a bare Select', () => {
    const tree = { component: 'Stack', props: {}, children: [
      { component: 'Button', props: { size: 'sm' } }, { component: 'Button', props: {} }, { component: 'ActionIcon', props: { size: 'lg' } }, { component: 'Select', props: { name: 'x' } }, { component: 'Button', props: { size: 'lg' } },
    ] };
    expect(touchProblems(tree, 'g', B.touch_targets.web)).toEqual({ n: 5, lines: [
      'C-9 g/children/0: Button size sm (needs lg|xl)', 'C-9 g/children/1: Button size none (needs lg|xl)',
      'C-9 g/children/2: ActionIcon size lg (needs xl)', 'C-9 g/children/3: Select size none (needs lg|xl)',
    ] });
  });
});

describe('C-11 the generated web theme (scripts/surfaces/emit-web-theme.mjs --check)', () => {
  it('--check exits 0 and prints theme ok (N pairs, S shades) with N > 0', () => {
    const r = spawnSync(process.execPath, [path.join(REPO, 'scripts/surfaces/emit-web-theme.mjs'), '--check'], { cwd: REPO, encoding: 'utf8' });
    expect([r.status, r.stderr]).toEqual([0, '']);
    const m = /^theme ok \((\d+) pairs, (\d+) shades\)$/m.exec(r.stdout);
    expect(m).not.toBeNull();
    expect(Number(m?.[1])).toBeGreaterThan(0);
  });
  it('RED: a hand edit, a stale token, a pair below its minimum, no pairs, a shade in no pair', async () => {
    const T = await import('../../../scripts/surfaces/emit-web-theme.mjs');
    const gen = fs.readFileSync(path.join(REPO, 'src/lib/surfaces/web/theme.generated.json'), 'utf8');
    const css = fs.readFileSync(path.join(REPO, 'src/app/globals.css'), 'utf8');
    const spec = rj(path.join(REPO, SCHEMA, 'web-theme.json'));
    const withSpec = (f: (s: Json) => void): string[] => { const s = structuredClone(spec); f(s); return T.checkTheme(REPO, { specText: JSON.stringify(s) }).lines; };
    expect(T.checkTheme(REPO, { generatedText: gen.replace('#b45309', '#b45300') }).lines).toEqual(['GEN-HAND-EDIT src/lib/surfaces/web/theme.generated.json']);
    expect(T.checkTheme(REPO, { cssText: css.replace('--color-action-primary: #F59E0B', '--color-action-primary: #F59E0C') }).lines).toEqual(['GEN-STALE src/lib/surfaces/web/theme.generated.json']);
    expect(withSpec((s) => { s.amber[5] = { token: '--color-action-gone' }; })).toContain('THEME-TOKEN --color-action-gone: not in globals.css');
    expect(withSpec((s) => { s.on_primary = '#ffffff'; })).toContain('THEME-CONTRAST on_primary/amber.5: 2.14 < 4.5');
    expect(withSpec((s) => { s.contrast.pairs = []; })).toContain('THEME-CONTRAST: no pairs');
    expect(withSpec((s) => { s.contrast.pairs = s.contrast.pairs.filter((p: Json) => p.bg !== 'amber.3'); })).toContain('THEME-CONTRAST amber.3: no pair');
  });
});

describe('C-11m the generated mobile theme (MF-35; scripts/surfaces/emit-mobile-theme.mjs --check)', () => {
  it('--check exits 0 and prints theme ok (N roles, P pairs) with N = 18 and P > 0', () => {
    const r = spawnSync(process.execPath, [path.join(REPO, 'scripts/surfaces/emit-mobile-theme.mjs'), '--check'], { cwd: REPO, encoding: 'utf8' });
    expect([r.status, r.stderr]).toEqual([0, '']);
    const m = /^theme ok \((\d+) roles, (\d+) pairs\)$/m.exec(r.stdout);
    expect(m).not.toBeNull();
    expect([Number(m?.[1]), Number(m?.[2]) > 0]).toEqual([18, true]);
  });
  it('the three @tailwind directives stay byte-identical at the top of mobile/global.css; :root and .dark:root carry the same values', () => {
    const css = fs.readFileSync(path.join(REPO, 'mobile/global.css'), 'utf8');
    expect(css.startsWith('@tailwind base;\n@tailwind components;\n@tailwind utilities;\n')).toBe(true);
    const block = (sel: string): string => (new RegExp(`${sel.replace(/[.:]/g, '\\$&')} \\{([^}]*)\\}`).exec(css)?.[1] ?? 'absent');
    expect(block('.dark:root')).toBe(block(':root'));
    expect(block(':root')).not.toBe('absent');
  });
  it('RED: a hand edit of either output, a changed source hex, an import in the constants file, an unknown source key, a 2:1 pair, an HSL that does not round-trip', async () => {
    const T = await import('../../../scripts/surfaces/emit-mobile-theme.mjs');
    const css = fs.readFileSync(path.join(REPO, 'mobile/global.css'), 'utf8');
    const js = fs.readFileSync(path.join(REPO, 'mobile/theme.rnr.generated.js'), 'utf8');
    const cfg = fs.readFileSync(path.join(REPO, 'mobile/tailwind.config.js'), 'utf8');
    const consts = fs.readFileSync(path.join(REPO, 'mobile/src/constants/parcelSearch.ts'), 'utf8');
    const spec = rj(path.join(REPO, SCHEMA, 'mobile-theme.json'));
    const withSpec = (f: (s: Json) => void): string[] => { const s = structuredClone(spec); f(s); return T.checkTheme(REPO, { specText: JSON.stringify(s) }).lines; };
    expect(T.checkTheme(REPO, { cssText: css.replace('--input: ', '--input:  ') }).lines).toEqual(['GEN-HAND-EDIT mobile/global.css']);
    expect(T.checkTheme(REPO, { jsText: js.replace("card: {", "borderRadius: { lg: '8px' },\n  card: {") }).lines).toEqual(['GEN-HAND-EDIT mobile/theme.rnr.generated.js']);
    expect(T.checkTheme(REPO, { configText: cfg.replace("'red-alert': '#ef4444'", "'red-alert': '#ef4445'") }).lines).toEqual(['GEN-STALE mobile/global.css', 'GEN-STALE mobile/theme.rnr.generated.js']);
    expect(T.checkTheme(REPO, { constantsText: `import x from 'y';\n${consts}` }).lines).toContain('GEN-SOURCE-IMPORT mobile/src/constants/parcelSearch.ts: the constants file must stay import-free');
    expect(withSpec((s) => { s.roles['--destructive'] = { file: 'mobile/tailwind.config.js', key: 'red-gone' }; })).toContain('GEN-SOURCE --destructive: mobile/tailwind.config.js has no colour key red-gone');
    expect(withSpec((s) => { s.roles['--muted-foreground'] = { file: 'mobile/tailwind.config.js', key: 'text-muted' }; s.contrast.pairs.push({ fg: '--muted-foreground', bg: '--secondary', role: 'text' }); }))
      .toContain('THEME-CONTRAST --muted-foreground/--secondary: 3.08 < 4.5');
    expect(T.toHsl('#f59e0b', 0)).toBe('38 92% 50%');
    expect(T.hslToHex('38 92% 50%')).not.toBe('#f59e0b');
    expect(T.hslToHex(T.toHsl('#f59e0b'))).toBe('#f59e0b');
  });
});

// ---- C-8m / C-9m (MF-35): the mobile half of the closed mapping and the 44 px case ------------------------------------------------------------------
// The binding standard (Spec 126 §11b.2 dated note 2026-11-10, item (5)): component names have one home, bindings.json mapping.<platform>.<archetype>.
// A mobile binding module may render <C/> only where C is bound from ONE object literal named COMPONENTS (const C = COMPONENTS[...]) whose keys equal
// mapping.mobile.<archetype> and whose values are identifiers imported from the vendored Reusables (the vendor dir), React Native core or
// react-native-safe-area-context (the layout parts plan v2 §2.2 names); no intrinsic tag, no createElement/jsx call, no other JSX tag.
// MF-53 (dated 2026-11-11; plan v4 §8 item 1): + react-native-maps, whose own MapView, Polygon and Marker the renderer draws for the map
// projection (S-071). It is a part source here, not a libraries.mobile entry (two Buildo-app files import it; the MF-48 L-1 precedent).
const MOBILE_PARTS = ['react-native', 'react-native-safe-area-context', 'react-native-maps'];
// MF-48 (dated 2026-11-11; D-3 a, Spec 126 §11b.4 dated note 2026-11-11): the C-8m HOST LIST. A listed host module's COMPONENTS table equals
// mapping.mobile.<archetype>_HOST, and its values may also come from the packages listed for it here: the app's existing bottom sheet and the one
// shared renderer. Any other package still fails, and no other module may take a part from them.
export const MOBILE_HOSTS: Record<string, string[]> = { 'mobile/src/components/surfaces/ReportPageHost.tsx': ['@gorhom/bottom-sheet', '@/components/surfaces/SurfaceRenderer'] };
const fromVendorOrParts = (spec: string, extra: string[] = []): boolean => spec.startsWith('@/vendor/rnr/') || MOBILE_PARTS.includes(spec) || extra.includes(spec);
export const mobileMappingProblems = (text: string, file: string, allowed: string[], hostParts: string[] = []): string[] => {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const at = (n: ts.Node): number => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const fromSpec = new Map<string, string>();
  for (const s of sf.statements) {
    if (!ts.isImportDeclaration(s) || !s.importClause || !ts.isStringLiteral(s.moduleSpecifier)) continue;
    const c = s.importClause;
    if (c.name) fromSpec.set(c.name.text, s.moduleSpecifier.text);
    if (c.namedBindings && ts.isNamedImports(c.namedBindings)) for (const e of c.namedBindings.elements) fromSpec.set(e.name.text, s.moduleSpecifier.text);
  }
  let table: ts.ObjectLiteralExpression | undefined;
  const fromTable = new Set<string>(); // locals bound as COMPONENTS[...] (an element access on the table)
  const scan = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      let init: ts.Expression = n.initializer;
      while (ts.isAsExpression(init) || ts.isParenthesizedExpression(init)) init = init.expression;
      if (n.name.text === 'COMPONENTS' && ts.isObjectLiteralExpression(init)) table = init;
      if (ts.isElementAccessExpression(init) && ts.isIdentifier(init.expression) && init.expression.text === 'COMPONENTS') fromTable.add(n.name.text);
    }
    ts.forEachChild(n, scan);
  };
  scan(sf);
  if (table) {
    const keys: string[] = [];
    for (const p of table.properties) {
      const name = p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : '?';
      keys.push(name);
      const value = ts.isShorthandPropertyAssignment(p) ? p.name.text : ts.isPropertyAssignment(p) && ts.isIdentifier(p.initializer) ? p.initializer.text : undefined;
      if (value === undefined || !fromVendorOrParts(fromSpec.get(value) ?? '', hostParts)) out.push(`C-8m ${file}:${at(p)}: COMPONENTS.${name} is not an imported library part`);
    }
    if (JSON.stringify([...keys].sort()) !== JSON.stringify([...allowed].sort())) out.push(`C-8m ${file}: COMPONENTS keys ${JSON.stringify(keys)} differ from mapping.mobile ${JSON.stringify(allowed)}`);
  }
  const visit = (n: ts.Node): void => {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      const tag = n.tagName.getText(sf);
      if (/^[a-z]/.test(tag)) out.push(`C-8m ${file}:${at(n)}: intrinsic element <${tag}>`);
      else if (!fromTable.has(tag)) out.push(`C-8m ${file}:${at(n)}: <${tag}> is not rendered through the COMPONENTS table`);
    }
    if (ts.isJsxFragment(n)) out.push(`C-8m ${file}:${at(n)}: a fragment`);
    if (ts.isCallExpression(n)) {
      const e = n.expression;
      const callee = ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : '';
      if (callee === 'createElement' || callee === 'jsx' || callee === 'jsxs') out.push(`C-8m ${file}:${at(n)}: ${callee}() call`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
};

describe('C-8m the mobile closed table (MF-35; every element of a mobile binding module comes through COMPONENTS = mapping.mobile)', () => {
  const mods = B.modules.filter((m: Json) => m.platform === 'mobile');
  it('the real tree: the mobile modules render only through a COMPONENTS table equal to mapping.mobile for their archetypes (SEARCH; the renderer SEARCH and LIST); no FlashList', () => {
    console.log(`C-8m: ${mods.length} mobile modules`);
    // MF-48 (dated 2026-11-11): + ReportBinding.tsx (no JSX) and the host ReportPageHost.tsx (its own table, mapping.mobile.REPORT_HOST, host list). MF-53: + LotMapBinding.tsx (no JSX).
    expect(mods.map((m: Json) => m.path)).toEqual(['mobile/src/components/surfaces/SurfaceRenderer.tsx', 'mobile/src/components/surfaces/SearchBinding.tsx', 'mobile/src/components/surfaces/LotMapBinding.tsx', 'mobile/src/components/surfaces/ReportBinding.tsx', 'mobile/src/components/surfaces/ReportPageHost.tsx']);
    for (const m of mods) {
      const host = MOBILE_HOSTS[m.path];
      const allowed = [...new Set<string>(m.archetypes.flatMap((a: string) => B.mapping.mobile[host ? `${a}_HOST` : a] ?? []))];
      expect([m.path, mobileMappingProblems(fs.readFileSync(path.join(REPO, m.path), 'utf8'), m.path, allowed, host)]).toEqual([m.path, []]);
    }
    expect(Object.keys(MOBILE_HOSTS).every((p) => mods.some((m: Json) => m.path === p))).toBe(true);
    expect(B.mapping.mobile.SEARCH).not.toContain('FlashList');
    // MF-48 OUTPUT fold RG R5: the renderer's REPORT list is a subset of its SEARCH parts (so its COMPONENTS table is unchanged), and no FlashList.
    expect((B.mapping.mobile.REPORT as string[]).filter((c) => !B.mapping.mobile.SEARCH.includes(c))).toEqual([]);
    expect(B.mapping.mobile.REPORT).not.toContain('FlashList');
    // MF-53: the LIST table adds exactly react-native-maps' three parts to the SEARCH parts it reuses, and no FlashList.
    expect((B.mapping.mobile.LIST as string[]).filter((c) => !B.mapping.mobile.SEARCH.includes(c))).toEqual(['MapView', 'Polygon', 'Marker']);
    expect(B.mapping.mobile.LIST).not.toContain('FlashList');
  });
  it('MF-53 RED (in memory): a map part taken from any other package is not an imported library part', () => {
    const real = fs.readFileSync(path.join(REPO, 'mobile/src/components/surfaces/SurfaceRenderer.tsx'), 'utf8');
    const allowed = [...new Set<string>(['SEARCH', 'REPORT', 'LIST'].flatMap((a) => B.mapping.mobile[a] as string[]))];
    expect(mobileMappingProblems(real, 'r.tsx', allowed)).toEqual([]);
    const other = real.replace("from 'react-native-maps';", "from '@/components/map/HandMap';");
    expect(mobileMappingProblems(other, 'r.tsx', allowed).filter((l) => l.includes('is not an imported library part')).map((l) => l.replace(/:\d+:/, ':'))).toEqual([
      'C-8m r.tsx: COMPONENTS.MapView is not an imported library part', 'C-8m r.tsx: COMPONENTS.Polygon is not an imported library part', 'C-8m r.tsx: COMPONENTS.Marker is not an imported library part',
    ]);
  });
  it('every component a converted mobile golden names is in mapping.mobile for its archetype', () => {
    const conv = rj(path.join(REPO, SCHEMA, 'converted-surfaces.json')).converted as string[];
    let n = 0;
    for (const id of conv) {
      const dir = path.join(REPO, 'src/tests/fixtures/surfaces', id);
      for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.mobile.json'))) {
        const walkC = (o: Json): string[] => [o.component, ...((o.children ?? []) as Json[]).filter((c) => c && typeof c === 'object' && 'component' in c).flatMap(walkC)];
        const names = walkC(rj(path.join(dir, f)).props);
        n += names.length;
        // MF-53 (CR F-2): the surface's own archetype table (SEARCH for the search page, LIST for the map page).
        const archetype = (DESCRIPTORS.get(id) as Json).identity.archetype as string;
        expect([f, names.filter((c) => !(B.mapping.mobile[archetype] as string[]).includes(c))]).toEqual([f, []]);
      }
    }
    expect(n).toBeGreaterThan(0);
  });
  it('MF-48 RED (in memory): the host list admits only its listed packages, and only for the listed host', () => {
    const host = MOBILE_HOSTS['mobile/src/components/surfaces/ReportPageHost.tsx'] as string[];
    const real = fs.readFileSync(path.join(REPO, 'mobile/src/components/surfaces/ReportPageHost.tsx'), 'utf8');
    const allowed = B.mapping.mobile.REPORT_HOST as string[];
    expect(mobileMappingProblems(real, 'h.tsx', allowed, host)).toEqual([]);
    const other = real.replace("from '@gorhom/bottom-sheet';", "from 'react-native-modal';");
    const at = real.split('\n').findIndex((l) => l.startsWith('const COMPONENTS = ')) + 1; // the table line, read from the file (no pinned line number)
    expect(mobileMappingProblems(other, 'h.tsx', allowed, host)).toEqual([
      `C-8m h.tsx:${at}: COMPONENTS.BottomSheet is not an imported library part`,
      `C-8m h.tsx:${at}: COMPONENTS.BottomSheetView is not an imported library part`,
      `C-8m h.tsx:${at}: COMPONENTS.BottomSheetBackdrop is not an imported library part`,
    ]);
    expect(mobileMappingProblems(real, 'h.tsx', allowed).filter((l) => l.includes('is not an imported library part')).length).toBe(4);
  });
  it('RED: a hand-built Row, an intrinsic <view>, a fragment, createElement, a table entry from a hand-built file, a table missing a mapped key', () => {
    const src = [
      "import * as React from 'react';", "import { View } from 'react-native';", "import { Card } from './Card';",
      'export const COMPONENTS = { View, Card };', 'const Row = () => null;',
      'export function R({ n }: { n: string }) {', '  const C = COMPONENTS[n as "View"];', '  return (<C><Row /><view /><>{React.createElement(View)}</></C>);', '}', '',
    ].join('\n');
    expect(mobileMappingProblems(src, 'r.tsx', ['View', 'Text'])).toEqual([
      'C-8m r.tsx:4: COMPONENTS.Card is not an imported library part',
      'C-8m r.tsx: COMPONENTS keys ["View","Card"] differ from mapping.mobile ["View","Text"]',
      'C-8m r.tsx:8: <Row> is not rendered through the COMPONENTS table',
      'C-8m r.tsx:8: intrinsic element <view>',
      'C-8m r.tsx:8: a fragment',
      'C-8m r.tsx:8: createElement() call',
    ]);
  });
});

/** C-9m: every mobile golden node whose component is in touch_targets.mobile carries exactly one min-h- token, and it is a listed one. */
export const mobileTouchProblems = (tree: Json, at: string, sizes: Record<string, string[]>): { n: number; lines: string[] } => {
  const lines: string[] = [];
  let n = 0;
  const walkT = (o: Json, p: string): void => {
    if (sizes[o.component]) {
      n += 1;
      const tk = String(o.props?.className ?? '').split(/\s+/).filter(Boolean);
      const mins = tk.filter((x) => /(^|:)min-h-/.test(x));
      if (mins.length !== 1 || !sizes[o.component]!.includes(mins[0]!)) lines.push(`C-9m ${p}: ${o.component} ${JSON.stringify(mins)} (needs exactly ${sizes[o.component]!.join('|')})`);
    }
    ((o.children ?? []) as Json[]).forEach((c, i) => { if (c && typeof c === 'object' && 'component' in c) walkT(c, `${p}/children/${i}`); });
  };
  walkT(tree, at);
  return { n, lines };
};

describe('C-9m the mobile 44 px case (MF-35; min-h-[44px], because NativeWind rem is 14 here and min-h-11 is 38.5 px)', () => {
  it('the real tree: every Button and Input of every converted mobile golden carries min-h-[44px] and no other min-h-', () => {
    const conv = rj(path.join(REPO, SCHEMA, 'converted-surfaces.json')).converted as string[];
    let n = 0;
    for (const id of conv) {
      const dir = path.join(REPO, 'src/tests/fixtures/surfaces', id);
      for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.mobile.json'))) {
        const r = mobileTouchProblems(rj(path.join(dir, f)).props, `${id}/${f}`, B.touch_targets.mobile);
        n += r.n;
        expect(r.lines).toEqual([]);
      }
    }
    console.log(`C-9m: ${n} sized nodes`);
    expect(n).toBeGreaterThan(0);
  });
  it('RED: a chip without min-h-[44px], min-h-11, and min-h-[44px] with sm:min-h-8', () => {
    const tree = { component: 'View', props: {}, children: [
      { component: 'Button', props: { className: 'rounded-full px-3' }, children: [] },
      { component: 'Button', props: { className: 'min-h-11' }, children: [] },
      { component: 'Input', props: { className: 'min-h-[44px] sm:min-h-8' }, children: [] },
      { component: 'Input', props: { className: 'flex-1 min-h-[44px]' }, children: [] },
    ] };
    expect(mobileTouchProblems(tree, 'g', B.touch_targets.mobile)).toEqual({ n: 4, lines: [
      'C-9m g/children/0: Button [] (needs exactly min-h-[44px])',
      'C-9m g/children/1: Button ["min-h-11"] (needs exactly min-h-[44px])',
      'C-9m g/children/2: Input ["min-h-[44px]","sm:min-h-8"] (needs exactly min-h-[44px])',
    ] });
  });
});
