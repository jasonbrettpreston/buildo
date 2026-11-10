// SPEC LINK: docs/specs/02-web-admin/33_web_admin_engineering_protocol.md (Spec 33 amendment 2026-11-09: Mantine CSS in `@layer mantine`
//            beside Tailwind 4; dated note 2026-11-09: `@mantine/dropzone` not installed), docs/specs/02-web-admin/126_maxbld_surface_standard.md
//            11b (the web library list), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-31 (library imports only in binding
//            modules and providers: globals.css stays library-free).
//
// MF-37 · McFrontend queue · lane W1-MF37 · T1 (plan v3 section 4, fold F4). The web library's CSS and pins:
//   (a) the compiled first-appearance layer order puts mantine and mantine-datatable after base and before components and utilities;
//   (b) every rule of the three layer sheets the provider imports sits inside @layer mantine / mantine-datatable (read from fixed paths);
//   (c) globals.css imports no library sheet and its compiled output carries no Mantine selector;
//   (d) each library package is pinned exactly in package.json and equals the lockfile; dropzone and carousel are not installed.
//   Dated 2026-11-09 (operator "a, 1-3 approved"): Mantine 8.3.18 / mantine-datatable 8.3.13 replace 9.8.0 / 9.7.5 (Next 15.5.15 bundles a React
//   19.2 canary without useEffectEvent/Activity); the react ^19.2.0 range pinned in acce4018a stays.
// Each check is a pure function, GREEN on the real tree and RED on an in-memory plant. No DB, no network.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

const REPO = process.cwd();
const GLOBALS = path.join(REPO, 'src/app/globals.css');
export const SHEETS: Record<string, string> = {
  'node_modules/@mantine/core/styles.layer.css': 'mantine',
  'node_modules/@mantine/dates/styles.layer.css': 'mantine',
  'node_modules/mantine-datatable/dist/styles.layer.css': 'mantine-datatable',
};
export const PINNED = ['@mantine/core', '@mantine/hooks', '@mantine/dates', '@rjsf/core', '@rjsf/utils', '@rjsf/validator-ajv8', '@rjsf/mantine', 'mantine-datatable', 'clsx', 'dayjs'];
export const NOT_INSTALLED = ['@mantine/dropzone', '@mantine/carousel'];
const ORDER = ['theme', 'base', 'mantine', 'mantine-datatable', 'components', 'utilities'];

/** Compile CSS text with Tailwind 4 as if it sat in src/app (so `tailwindcss` resolves); a temp base keeps the source scan empty. */
const compile = async (css: string): Promise<string> => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mf37-t1-'));
  try {
    return (await postcss([tailwind({ base })]).process(css, { from: path.join(REPO, 'src/app/__t1__.css') })).css;
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
};

/** (a) The layer names in first-appearance order (statements and blocks), then the order problems. */
export const layerOrder = (css: string): string[] => {
  const seen: string[] = [];
  postcss.parse(css).walkAtRules('layer', (r) => { for (const n of r.params.split(',').map((s) => s.trim()).filter(Boolean)) if (!seen.includes(n)) seen.push(n); });
  return seen;
};
export const orderProblems = (seen: string[]): string[] => {
  const at = (n: string): number => seen.indexOf(n);
  const out: string[] = [];
  for (const n of ORDER) if (at(n) < 0) out.push(`layer ${n}: absent`);
  if (out.length > 0) return out;
  for (let i = 1; i < ORDER.length; i += 1) if (at(ORDER[i - 1] as string) > at(ORDER[i] as string)) out.push(`layer ${ORDER[i - 1]} after ${ORDER[i]}`);
  return out;
};
/** (b) Every top-level node of a sheet is a comment or `@layer <name> { ... }`. */
export const unlayered = (css: string, name: string): number => (postcss.parse(css).nodes ?? [])
  .filter((n) => n.type !== 'comment' && !(n.type === 'atrule' && n.name === 'layer' && n.params.trim() === name && Array.isArray(n.nodes))).length;
/** (c) A library sheet imported into globals.css, by specifier. */
export const globalsImports = (css: string): string[] => {
  const out: string[] = [];
  postcss.parse(css).walkAtRules('import', (r) => { if (/@mantine\/|mantine-datatable|@rjsf\//.test(r.params)) out.push(r.params); });
  return out;
};
/** (d) Pin problems: not exact, not equal to the lockfile, or a not-installed package present. */
export const pinProblems = (pkg: Record<string, any>, lock: Record<string, any>): string[] => { // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON documents
  const deps = { ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>;
  const out: string[] = [];
  for (const n of PINNED) {
    const v = deps[n];
    if (v === undefined) { out.push(`${n}: not in package.json`); continue; }
    if (!/^\d+\.\d+\.\d+$/.test(v)) out.push(`${n}: ${v} is not an exact pin`);
    const locked = lock.packages?.[`node_modules/${n}`]?.version;
    if (locked !== v.replace(/^[\^~]/, '')) out.push(`${n}: package.json ${v} vs lockfile ${locked}`);
  }
  for (const n of NOT_INSTALLED) if (deps[n] !== undefined || lock.packages?.[`node_modules/${n}`] !== undefined) out.push(`${n}: installed`);
  if (deps.react !== '^19.2.0' || deps['react-dom'] !== '^19.2.0') out.push(`react range ${deps.react} / ${deps['react-dom']}: the pinned range is ^19.2.0`);
  return out;
};
const readJson = (p: string): Record<string, any> => JSON.parse(fs.readFileSync(path.join(REPO, p), 'utf8')); // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON documents

describe('T1 (a) the compiled layer order', () => {
  it('the real globals.css: mantine and mantine-datatable after base, before components and utilities', async () => {
    const seen = layerOrder(await compile(fs.readFileSync(GLOBALS, 'utf8')));
    expect(orderProblems(seen)).toEqual([]);
    expect(seen.slice(0, ORDER.length)).toEqual(ORDER);
  });
  it('RED: the order statement with mantine after utilities, and with no order statement at all', async () => {
    const real = fs.readFileSync(GLOBALS, 'utf8');
    const swapped = real.replace(/^@layer [^;]+;/m, '@layer theme, base, components, utilities, mantine, mantine-datatable;');
    expect(swapped).not.toBe(real);
    expect(orderProblems(layerOrder(await compile(swapped)))).toEqual(['layer mantine-datatable after components']);
    expect(orderProblems(layerOrder(await compile(real.replace(/^@layer [^;]+;\n/m, ''))))).toEqual(['layer mantine: absent', 'layer mantine-datatable: absent']);
  });
});

describe('T1 (b) the three layer sheets (fixed node_modules paths)', () => {
  it('every rule sits inside its layer', () => {
    for (const [p, name] of Object.entries(SHEETS)) expect([p, unlayered(fs.readFileSync(path.join(REPO, p), 'utf8'), name)]).toEqual([p, 0]);
  });
  it('RED: the unlayered styles.css of @mantine/core', () => {
    expect(unlayered(fs.readFileSync(path.join(REPO, 'node_modules/@mantine/core/styles.css'), 'utf8'), 'mantine')).toBeGreaterThan(0);
  });
});

describe('T1 (c) globals.css stays library-free', () => {
  it('no library import, and no Mantine selector in the compiled output', async () => {
    const real = fs.readFileSync(GLOBALS, 'utf8');
    expect(globalsImports(real)).toEqual([]);
    expect(await compile(real)).not.toContain('[data-mantine');
  });
  it('RED: a planted @mantine/core import shows in both checks', async () => {
    const planted = fs.readFileSync(GLOBALS, 'utf8').replace('@import "tailwindcss";', '@import "tailwindcss";\n@import "@mantine/core/styles.css";');
    expect(globalsImports(planted)).toEqual(['"@mantine/core/styles.css"']);
    expect(await compile(planted)).toContain('[data-mantine');
  });
});

describe('T1 (d) exact pins equal to the lockfile; dropzone and carousel not installed', () => {
  it('the real package.json and lockfile', () => {
    expect(pinProblems(readJson('package.json'), readJson('package-lock.json'))).toEqual([]);
  });
  it('RED: a caret pin, dropzone added, the old react range', () => {
    const pkg = readJson('package.json');
    const lock = readJson('package-lock.json');
    const bad = { ...pkg, dependencies: { ...pkg.dependencies, '@mantine/core': '^8.3.18', '@mantine/dropzone': '8.3.18', react: '^19.0.0' } };
    expect(pinProblems(bad, lock)).toEqual(['@mantine/core: ^8.3.18 is not an exact pin', '@mantine/dropzone: installed', 'react range ^19.0.0 / ^19.2.0: the pinned range is ^19.2.0']);
  });
});
