// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-15 (the McFront proof canaries, EXECUTABLE: a planted defect in a temp copy is red,
//            a clean copy is green; rules 2 and 5: one lock, this path),
//            docs/specs/02-web-admin/128_surface_standard_policy.md 2.2a (canary b = generator --check, the Rule 20 lock, the Rule 16 scan) and Rule 17 (dated note
//            2026-11-09: canary a runs as "a-now"), docs/specs/02-web-admin/126_maxbld_surface_standard.md 552 (R-27: one home, no second copy of a check),
//            docs/specs/02-web-admin/127_surface_conversion_procedure.md 6.
//
// MF-23 · McFrontend queue · lane T. The FE-15 lock. A canary is a test case that runs a SHIPPED checker (a CLI, or a shipped lock file under a nested
// `vitest run`) on a temp COPY of the tree, twice: clean (exit 0, tests ran) and with one planted defect (red, and the red names the defect). No check is
// re-implemented here. The canaries: a honest display ("at least" and disclosures), b generated output and binding and no maths, c a new catalogue row
// reaches every target with no front-end code, d one target differs. Canary e (25 lots against the answer key) is FE-25 / MF-22 and canary f (error count)
// is FE-26 / MF-21: each has its own lock and is not built here.
// Honest limits: canary a is "a-now": its oracle is the shipped locks' own literals and the golden compare, NOT the catalogue flags (the generator emits no
// flag today; card MF-23-F1). The at_least leg is red in report-render.logic.test.ts and report-generated-only.infra.test.ts (the parity lock reads the stored
// golden tree, so it does not see a dropped suffix); the disclosure leg is red in parity.golden.test.ts and report-view.ui.test.tsx on SYNTHETIC trees only.
// Canary d plants in viewOf (core.ts), not in ReportView.tsx, which holds no target. Canary c's probe repeats the FE-24 lock's render step but goes through the
// generator. A red counts only when the nested run's JSON parses, no suite crashed, and a failed test carries the checker's own token. Serial spawnSync; no DB.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON documents
const ROOT = process.cwd();
const CANARIES = ['a', 'b', 'c', 'd'];
const OWNED_ELSEWHERE: Record<string, string> = { e: 'FE-25 answer-key-e2e.db.test.ts (MF-22)', f: 'FE-26 error-count.db.test.ts (MF-21)' };

const SCHEMA_DIR = 'scripts/surfaces/_schema';
const GEN = `${SCHEMA_DIR}/seed-report-v2.mjs`;
const GATE = 'scripts/surfaces/surface-validate.mjs';
const DECL = `${SCHEMA_DIR}/report-v2.decl.json`;
const CORE = 'src/lib/surfaces/report/core.ts';
const VIEW = 'src/components/report/ReportView.tsx';
const GOLD = 'src/tests/fixtures/surfaces/report';
const CATALOGUE = 'scripts/seeds/bylaw/layer3-catalogue.json';
const SWITCHBOARD = 'scripts/seeds/bylaw/switchboard.json';
const SUR = 'src/tests/surfaces';
const TARGETS = ['mobile', 'web', 'admin', 'pdf'];
// The shipped locks the canaries run (never this file: no recursion).
const L = {
  binding: `${SUR}/report-binding.logic.test.ts`, honest: `${SUR}/report-honest.logic.test.ts`, noMaths: `${SUR}/report-no-maths.logic.test.ts`,
  genOnly: `${SUR}/report-generated-only.infra.test.ts`, render: `${SUR}/report-render.logic.test.ts`, parity: `${SUR}/parity.golden.test.ts`, viewUi: `${SUR}/report-view.ui.test.tsx`,
};
const LOCKS = Object.values(L);
// Measured copy list (about 16 MB, 11 s for the file); node_modules is a symlink, the rest is copied.
// MF-37 (dated 2026-11-09): src/components/surfaces joins the copy: report-no-maths (FE-05) reads bindings.json modules, which now list the two
// web binding modules, and fails closed on a listed module that is missing from the tree.
const COPY = [
  'scripts/surfaces', 'scripts/analysis/report-schema.mjs', 'scripts/analysis/bylaw', CATALOGUE, SWITCHBOARD, 'scripts/seeds/bylaw/vocab.json', 'scripts/seeds/bylaw/adjudications.json',
  'docs/reports/decisions/2026-10-20-chat-batch-b.json', 'docs/specs/01-pipeline/78_optimal_lot_configuration.md', 'src/lib/parcels/consumer-lookup.ts', 'mobile/src/lib/parcelCostFormat.ts',
  'migrations', 'docs/reference/maxbld-report-v2-schema.md', 'docs/reference/maxbld-report-v2.sample.json', 'docs/reference/maxbld-report-v2.schema.json', 'docs/reference/maxbld-report-v2.types.ts',
  'src/tests/fixtures/surfaces', 'src/lib/surfaces', 'src/components/report', 'src/components/surfaces', 'src/app/admin/report-preview', 'src/tests/setup.ts', 'src/tests/helpers/before-image-sandbox.ts',
  'package.json', 'tsconfig.json', ...LOCKS,
  // MF-35 (dated 2026-11-10): the gate's S-gen now spawns emit-mobile-theme.mjs and emit-mobile-surfaces.mjs, which read these mobile files.
  'mobile/tailwind.config.js', 'mobile/global.css', 'mobile/theme.rnr.generated.js', 'mobile/src/constants/parcelSearch.ts', 'mobile/src/generated/surfaces',
  'mobile/__tests__/fixtures/surfaces', 'mobile/src/components/surfaces', // and report-no-maths (FE-05) reads the two mobile binding modules bindings.json now lists
];
const CONFIG = `import { defineConfig } from 'vitest/config';
import path from 'path';
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: { globals: true, environment: 'node', include: ['src/tests/surfaces/*.test.ts', 'src/tests/surfaces/*.test.tsx'], setupFiles: ['src/tests/setup.ts'] },
});
`;
const EMPTY_LOCK = "import { describe, it } from 'vitest';\ndescribe('empty', () => { it('does nothing', () => {}); });\n";
const DEAD_CLI = 'process.exit(0);\n';

// ---- the two runners: no logic beyond spawn and parse -------------------------------------------------------------------------------------------------
interface Failed { file: string; title: string }
interface Run { code: number | null; text: string; failed: Failed[]; tests: number; crashed: boolean }

const runCli = (tree: string, script: string, args: string[]): Run => {
  const r = spawnSync(process.execPath, [path.join(tree, script), ...args], { cwd: tree, encoding: 'utf8', timeout: 120000 });
  return { code: r.status, text: r.stderr, failed: [], tests: 0, crashed: r.status === null };
};
const runLock = (tree: string, files: string[]): Run => {
  const out = path.join(tree, 'nested-result.json');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'node_modules/vitest/vitest.mjs'), 'run', '--root', tree, '--config', path.join(tree, 'vitest.config.ts'),
    '--reporter=json', `--outputFile=${out}`, '--reporter=default', ...files], { cwd: tree, encoding: 'utf8', timeout: 120000 });
  const text = `${r.stdout}\n${r.stderr}`;
  let json: Json | null = null;
  try { json = JSON.parse(fs.readFileSync(out, 'utf8')) as Json; } catch { json = null; }
  if (!json) return { code: r.status, text, failed: [], tests: 0, crashed: true };
  const suites: Json[] = json.testResults ?? [];
  const failed: Failed[] = suites.flatMap((s) => (s.assertionResults as Json[]).filter((a) => a.status === 'failed').map((a) => ({ file: String(s.name), title: String(a.fullName) })));
  const loadFailure = suites.some((s) => s.status === 'failed' && (s.assertionResults as Json[]).length === 0) || /failed to load config/i.test(text);
  return { code: r.status, text, failed, tests: Number(json.numTotalTests), crashed: loadFailure };
};

// ---- the red discriminator --------------------------------------------------------------------------------------------------------------------------
// Red = the run did not crash, and a failed test of the named lock file carries the checker's own token. An exit code alone proves nothing.
const lockRed = (r: Run, token: string, file: string): boolean => !r.crashed && r.failed.some((f) => f.file.endsWith(file) && f.title.includes(token));
const cliRed = (r: Run, token: string): boolean => !r.crashed && r.code === 1 && r.text.includes(token);
const green = (r: Run): void => {  expect(r.crashed).toBe(false); expect(r.code).toBe(0); expect(r.failed).toEqual([]); };

// ---- the temp copy ----------------------------------------------------------------------------------------------------------------------------------
let tmpRoot = '';
let base = '';
beforeAll(() => {
  tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mf23-'))); // realpath: /var is a symlink on macOS and breaks the nested jsdom setup path
  base = path.join(tmpRoot, 'base');
  for (const rel of COPY) {
    fs.mkdirSync(path.dirname(path.join(base, rel)), { recursive: true });
    fs.cpSync(path.join(ROOT, rel), path.join(base, rel), { recursive: true });
  }
  fs.writeFileSync(path.join(base, 'vitest.config.ts'), CONFIG);
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(base, 'node_modules'));
}, 120000);
afterAll(() => { fs.rmSync(tmpRoot, { recursive: true, force: true }); });

let n = 0;
const mkTree = (): string => { const dir = path.join(tmpRoot, `t${n++}`); fs.cpSync(base, dir, { recursive: true, verbatimSymlinks: true }); return dir; };
const sha = (file: string): string => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
// A plant: rewrite one file of the copy. It throws unless the bytes change (the dead-man: a plant that did not apply is an error, never a green).
const edit = (tree: string, rel: string, fn: (s: string) => string): void => {
  const p = path.join(tree, rel);
  const before = fs.readFileSync(p, 'utf8');
  fs.writeFileSync(p, fn(before));
  if (sha(p) === crypto.createHash('sha256').update(before).digest('hex')) throw new Error(`plant did not change ${rel}`);
};
const swap = (from: string, to: string) => (s: string): string => { if (!s.includes(from)) throw new Error(`plant text not found: ${from}`); return s.replace(from, () => to); };
const writeNew = (tree: string, rel: string, text: string): void => { fs.mkdirSync(path.dirname(path.join(tree, rel)), { recursive: true }); fs.writeFileSync(path.join(tree, rel), text); };
const disable = (tree: string, rels: string[], text: string): void => { for (const rel of rels) fs.writeFileSync(path.join(tree, rel), text); };
const readJson = (tree: string, rel: string): Json => JSON.parse(fs.readFileSync(path.join(tree, rel), 'utf8'));
const writeJson = (tree: string, rel: string, doc: Json): void => fs.writeFileSync(path.join(tree, rel), `${JSON.stringify(doc, null, 2)}\n`);

describe('FE-15: the canaries are a closed list; e and f are owned elsewhere', () => {
  it('a-d here plus e and f elsewhere partition a-f exactly', () => {
    expect([...CANARIES, ...Object.keys(OWNED_ELSEWHERE)].sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });
});

describe('canary a (a-now): "at least" and a disclosure are dropped from real output', () => {
  const files = [L.render, L.genOnly, L.parity, L.honest, L.viewUi];
  it('control: a clean copy runs the honest, parity and golden locks green', () => {
    const r = runLock(mkTree(), files);
    green(r);
    expect(r.tests).toBeGreaterThan(100);
  });
  it('RED: the ", at least" label suffix dropped in core.ts is reported at_least by the golden compare (report-render.logic) and the capture compare (report-generated-only)', () => {
    const t = mkTree();
    edit(t, CORE, swap('`${f.label}, at least`', 'String(f.label)'));
    const r = runLock(t, files);
    expect(lockRed(r, 'at_least', 'report-render.logic.test.ts')).toBe(true);
    expect(lockRed(r, 'FE-02', 'report-generated-only.infra.test.ts')).toBe(true);
    // The defect itself: the received label has lost the suffix (a changed suffix, e.g. ', at least QQ', would not match). Names the lock's own diff line.
    expect(r.text).toMatch(/^\+\s+"label": "GFA \(flat roof\)",?$/m);
  });
  it('RED (synthetic trees): ReportView.tsx stops rendering disclosures: the parity lock and the view lock name disclosure', () => {
    const t = mkTree();
    edit(t, VIEW, (s) => s.replace(/^.*data-disclosure.*\n/m, ''));
    const r = runLock(t, files);
    expect(lockRed(r, 'disclosures', 'parity.golden.test.ts')).toBe(true);
    expect(lockRed(r, 'disclosure', 'report-view.ui.test.tsx')).toBe(true);
  });
  it('dead checker: with the locks emptied the planted run is NOT red', () => {
    const t = mkTree();
    edit(t, CORE, swap('`${f.label}, at least`', 'String(f.label)'));
    disable(t, files, EMPTY_LOCK);
    const r = runLock(t, files);
    expect(r.crashed).toBe(false);
    expect(lockRed(r, 'at_least', 'report-render.logic.test.ts')).toBe(false);
    expect(r.failed).toEqual([]);
  });
});

describe('canary b: a hand edit, an invented field and a bare number', () => {
  it('control: a clean copy passes the generator --check, the gate --check and the three locks', () => {
    const t = mkTree();
    const g = runCli(t, GEN, ['--check']);
    green(g);
    green(runCli(t, GATE, ['--check']));
    const r = runLock(t, [L.genOnly, L.binding, L.noMaths]);
    green(r);
    expect(r.tests).toBeGreaterThan(50);
  });
  it('RED (hand edit): one byte of the generated declaration: generator --check, the gate and the generated-only lock all name it', () => {
    const t = mkTree();
    edit(t, DECL, swap('"label": "', '"label": "X'));
    expect(cliRed(runCli(t, GEN, ['--check']), `GEN-HAND-EDIT ${DECL}`)).toBe(true);
    expect(cliRed(runCli(t, GATE, ['--check']), `SV-GEN seed-report-v2.mjs: GEN-HAND-EDIT ${DECL}`)).toBe(true);
    expect(lockRed(runLock(t, [L.genOnly]), 'FE-02 controls', 'report-generated-only.infra.test.ts')).toBe(true);
  });
  it('RED (invented field): a golden node renamed in all four targets: the gate names it SV-BIND; a declaration source naming no row: the Rule 20 lock names RS-1', () => {
    const t = mkTree();
    for (const target of TARGETS) edit(t, `${GOLD}/permitted.${target}.json`, (s) => s.replaceAll('"field": "gfa_flat_m2"', '"field": "zz_invented"'));
    expect(cliRed(runCli(t, GATE, ['--check']), 'SV-BIND permitted.web.json: node zz_invented: field not in declaration')).toBe(true);
    const u = mkTree();
    edit(u, DECL, swap('"source": "catalogue:gfa_flat_m2"', '"source": "catalogue:zz_invented"'));
    expect(lockRed(runLock(u, [L.binding]), 'RS-1', 'report-binding.logic.test.ts')).toBe(true);
  });
  it('RED (numeric literal): String(v * 2) in core.ts, and a bare 7 in a new subdirectory of src/components/report: the no-maths lock names carry no maths', () => {
    const t = mkTree();
    edit(t, CORE, swap('${String(v)}', '${String(v * 2)}'));
    expect(lockRed(runLock(t, [L.noMaths]), 'carry no maths', 'report-no-maths.logic.test.ts')).toBe(true);
    const u = mkTree();
    writeNew(u, 'src/components/report/zz/extra.ts', 'export const x = 7;\n');
    expect(lockRed(runLock(u, [L.noMaths]), 'carry no maths', 'report-no-maths.logic.test.ts')).toBe(true);
  });
  it('dead checker: a generator that exits 0 and an emptied no-maths lock do NOT report red', () => {
    const t = mkTree();
    edit(t, DECL, swap('"label": "', '"label": "X'));
    disable(t, [GEN], DEAD_CLI);
    expect(cliRed(runCli(t, GEN, ['--check']), `GEN-HAND-EDIT ${DECL}`)).toBe(false);
    const u = mkTree();
    edit(u, CORE, swap('${String(v)}', '${String(v * 2)}'));
    disable(u, [L.noMaths], EMPTY_LOCK);
    const r = runLock(u, [L.noMaths]);
    expect(r.crashed).toBe(false);
    expect(r.failed).toEqual([]);
  });
});

describe('canary c: a new catalogue row reaches every target with no front-end code', () => {
  const ROW = 'zz_mf23_probe_m2';
  const PROBE_FILE = `${SUR}/zz-mf23-probe.test.ts`;
  // The ~25-line probe, written INTO the copy: it imports the copy's reportCtx, whose declaration the generator just wrote.
  const PROBE = `import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildTree, viewOf } from '../../lib/surfaces/report/core';
import { reportCtx } from '../../lib/surfaces/report/data';
import { ReportView } from '../../components/report/ReportView';
import { TARGETS } from '../../../scripts/surfaces/report-checks.mjs';
const ROW = '${ROW}';
const field = (reportCtx.decl.sections as any[]).flatMap((s) => s.fields).find((f: any) => f.name === ROW);
describe('MF23 PROBE: the new catalogue row', () => {
  it('MF23 PROBE is a generated field', () => { expect(field).toBeDefined(); });
  for (const target of TARGETS as string[]) {
    it('MF23 PROBE reaches ' + target + ' with its label, value and unit', () => {
      const view = viewOf(buildTree({ status: 'permitted', [ROW]: 77.5 }, reportCtx), { scenario: null, target }, reportCtx);
      const out = target === 'mobile' ? JSON.stringify(view) : renderToStaticMarkup(createElement(ReportView, { view } as never));
      expect(out).toContain(field.label);
      expect(out).toContain('77.5');
      expect(out).toContain(field.unit);
    });
  }
  it('MF23 PROBE an unknown key throws', () => { expect(() => buildTree({ status: 'permitted', zz_not_a_field: 1 }, reportCtx)).toThrow(); });
});
`;
  const rendererSha = (t: string): string => {
    const walk = (d: string): string[] => fs.readdirSync(path.join(t, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    return ['src/lib/surfaces/report', 'src/components/report'].flatMap(walk).sort().map((f) => `${f}:${sha(path.join(t, f))}`).join('|');
  };
  // Clean copy + catalogue row ON: the generator is red until --write, the renderer sources are untouched by it, then the probe is written.
  const withRow = (t: string): void => {
    const cat = readJson(t, CATALOGUE);
    const model = structuredClone(cat.rows.find((r: Json) => r.id === 'gfa_flat_m2'));
    cat.rows.push({ ...model, id: ROW, switch: `formula:${ROW}` });
    writeJson(t, CATALOGUE, cat);
    const sw = readJson(t, SWITCHBOARD);
    sw.rows.push({ id: `formula:${ROW}`, kind: 'formula', state: 'on', ruling: 'MF-23 probe', reason: 'throwaway tree only' });
    writeJson(t, SWITCHBOARD, sw);
    expect(cliRed(runCli(t, GEN, ['--check']), `GEN-ROW-NO-FIELD ${ROW}`)).toBe(true);
    const before = rendererSha(t);
    expect(runCli(t, GEN, ['--write']).code).toBe(0);
    green(runCli(t, GEN, ['--check']));
    expect(rendererSha(t)).toBe(before);
    writeNew(t, PROBE_FILE, PROBE);
  };
  it('control: the row without a field is red in the generator; after --write the renderer is untouched and the probe is green on all four targets', () => {
    const t = mkTree();
    withRow(t);
    const r = runLock(t, [PROBE_FILE]);
    green(r);
    expect(r.tests).toBe(6);
  });
  it('RED: a renderer that filters fields through a hard-coded list loses the new row: the probe names it', () => {
    const t = mkTree();
    withRow(t);
    edit(t, CORE, swap('const fields = fieldsOf(ctx.decl);\n  const reason', "const fields = fieldsOf(ctx.decl).filter((f) => f.name === 'status_text' || f.name === 'gfa_flat_m2');\n  const reason"));
    expect(lockRed(runLock(t, [PROBE_FILE]), 'MF23 PROBE reaches', 'zz-mf23-probe.test.ts')).toBe(true);
  });
  it('dead checker: with the probe emptied the planted run is NOT red', () => {
    const t = mkTree();
    withRow(t);
    edit(t, CORE, swap('const fields = fieldsOf(ctx.decl);\n  const reason', "const fields = fieldsOf(ctx.decl).filter((f) => f.name === 'status_text' || f.name === 'gfa_flat_m2');\n  const reason"));
    disable(t, [PROBE_FILE], EMPTY_LOCK);
    const r = runLock(t, [PROBE_FILE]);
    expect(r.crashed).toBe(false);
    expect(lockRed(r, 'MF23 PROBE', 'zz-mf23-probe.test.ts')).toBe(false);
  });
});

describe('canary d: one target differs from the others', () => {
  // Each plant changes a value in viewOf for ONE target; the parity lock must name exactly that target against the golden.
  const plant = (t: string, target: string): void => edit(t, CORE, swap('text: n.value === null ? dash : n.value,', `text: n.value === null ? dash : (pick.target === '${target}' ? n.value + '!' : n.value),`));
  it('control: a clean copy is green', () => {
    const r = runLock(mkTree(), [L.parity]);
    green(r);
    expect(r.tests).toBeGreaterThan(10);
  });
  it.each(['admin', 'mobile'])('RED: a changed value in the %s output only: the parity lock names that target and no other', (target) => {
    const t = mkTree();
    plant(t, target);
    const r = runLock(t, [L.parity]);
    expect(lockRed(r, 'FE-07 parity', 'parity.golden.test.ts')).toBe(true);
    expect(r.text).toContain(`${target} vs golden:`);
    for (const other of TARGETS.filter((x) => x !== target)) expect(r.text).not.toContain(`${other} vs golden:`);
  });
  it('dead checker: with the parity lock emptied the planted run is NOT red', () => {
    const t = mkTree();
    plant(t, 'admin');
    disable(t, [L.parity], EMPTY_LOCK);
    const r = runLock(t, [L.parity]);
    expect(r.crashed).toBe(false);
    expect(r.failed).toEqual([]);
  });
});
