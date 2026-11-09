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
  it('SV-DESC is clean with the exact counts (20 in scope: 0 converted, 7 pending, 9 parked, 4 report); SCREEN and SBIND WAIT on the named row', async () => {
    const ctx = await loadContext(REPO);
    const d = descArm(ctx);
    expect(d.findings).toEqual([]);
    expect(d.note).toBe('S-desc ok (examined 20 in scope: converted 0, pending 7, parked 9, report 4)');
    expect([screenArm(ctx), sbindArm(ctx)]).toEqual([{ findings: [], note: 'S-screen WAITS MF-37' }, { findings: [], note: 'S-sbind WAITS MF-37' }]);
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
  it('the real tree: 0 mount files and 0 binding modules at MF-42 (WAITS the first binding row)', () => {
    const files = [...B.mounts.map((m: Json) => m.path), ...B.modules.map((m: Json) => m.path)];
    const lines = files.flatMap((f: string) => textProblems(fs.readFileSync(path.join(REPO, f), 'utf8'), f, B.non_display_keys));
    console.log(files.length === 0 ? `C-2b: 0 files WAITS ${rj(path.join(REPO, SCHEMA, 'converted-surfaces.json')).waits}` : `C-2b: ${files.length} files`);
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
  const real: C3In = { b: B, exists: (p) => fs.existsSync(path.join(REPO, p)), descriptor: () => undefined, policy: POLICY, rootsTexts, converted: [] };
  it('the real tree: no finding; 0 modules WAITS the first binding row; the shape is valid', () => {
    expect(shapeProblems(REPO, 'bindings', B)).toEqual([]);
    expect(bindingsProblems(real)).toEqual([]);
    console.log(B.modules.length === 0 ? 'C-3: 0 modules WAITS MF-37' : `C-3: ${B.modules.length} modules`);
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
    expect(bindingsProblems({ ...real, converted: [{ identity: { id: 'admin_media', platforms: ['web'], archetype: 'FORM' } }] })).toEqual(['C-3 admin_media: no web binding module for FORM']);
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
  it('the real tree: the manifest exists and is valid; 0 vendored files WAITS MF-35', () => {
    const r = vendorProblems(REPO, B);
    expect(r.lines).toEqual([]);
    expect(rj(path.join(REPO, B.vendor_manifest)).cli).toBe('@react-native-reusables/cli@0.7.1');
    console.log(r.files === 0 ? `C-5: vendored 0 files WAITS ${r.waits}` : `C-5: vendored ${r.files} files`);
    expect(r.files > 0 || r.waits === 'MF-35').toBe(true);
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
    expect(fresh.dts).not.toBe(dts.replace('display: "text" | "boolean" | "enum";', 'display: string;'));
  }, 60000);
});

describe('C-7 schema closedness and the cutover (the closed render vocabulary grows only by the 128 section 4 route)', () => {
  const v = (d: Json): string[] => validateDescriptor(d).errors;
  it('controls: each converted fixture is valid with 0 sentinels; every live descriptor is valid; a non-generated FORM and LIST need no new key', () => {
    for (const a of ARCHETYPES) { const d = convert(a); expect([a, v(d), unresearchedCount(d)]).toEqual([a, [], 0]); }
    const walkD = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walkD(path.join(d, e.name)) : e.name.endsWith('.descriptor.json') ? [path.join(d, e.name)] : []));
    const all = walkD(path.join(REPO, 'scripts/surfaces'));
    expect(all.length).toBe(141);
    expect(all.filter((f) => v(rj(f)).length > 0)).toEqual([]);
    const form = rj(path.join(REPO, 'scripts/surfaces/parcel_admin/F04/surfaces/admin_placements.descriptor.json'));
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
