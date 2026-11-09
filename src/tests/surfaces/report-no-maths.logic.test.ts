// SPEC LINK: docs/specs/02-web-admin/128_surface_standard_policy.md Rule 16 (single source: no maths in a REPORT surface) and the 2026-11-09 dated note in 2.2a
//            (scope: the three projection directories),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05 (P4 single source; no maths in the UI),
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md 5.3 (the server projects, the client is glass).
//
// MF-16 · McFrontend queue · lane T. The FE-05 lock. An AST scan (the TypeScript compiler API, as scripts/analysis/gates/*.mjs) of EVERY .ts/.tsx file
// found by directory walk under the three projection directories. It bans: arithmetic and compound-assignment operators, ++ and --, unary + or -
// on a non-literal, bitwise operators, Math, Number (except the `.isFinite` property), parseFloat, parseInt, BigInt literals, .reduce, .toFixed,
// .toPrecision, .toExponential, and any numeric literal other than 0 and 1. The projection files hold none of these, so there is no allow-list: no
// named formatter exists (D-2 a). Token kinds are compared by SyntaxKind constants, literals by node.text.
// Pass-through (output digits = input digits) is already pinned at run time by report-render.logic.test.ts "no maths: a float is shown as the
// producer sent it" and is not copied here. Panel folds: also ban element access and destructured names of the banned methods, reduceRight, toLocaleString, Intl, BigInt, globalThis; the walk reads .js/.jsx/.mjs/.cjs/.mts/.cts too.
// Left to review (named, not scanned): eval, new Function, an import of maths from outside the three directories, isNaN, Date.
// Each ban has a planted case (in memory), one is planted in a copy of the REAL core.ts, and the walk is proven on disk. No DB, no network.
// MF-42 widening (card 2.4 "No maths (FE-05) | binding modules"; Spec 128 2.2a dated note): the same scan also reads every binding module listed in
// scripts/surfaces/_schema/bindings.json `modules`, as files, failing closed when the file is missing or not JSON, `modules` is not a list, or a listed
// module is not on disk. DIRS and coverageProblems are untouched. At MF-42 the list is empty (the first module is MF-37's), so the real-tree half is
// vacuous by design and says so; the planted half proves the read.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
// The projection directories (Spec 128 2.2a dated note 2026-11-09). A new file under any of them is covered by the walk.
const DIRS = ['src/lib/surfaces/report', 'src/components/report', 'src/app/admin/report-preview'];
const K = ts.SyntaxKind;
const BANNED_BINARY = new Set<ts.SyntaxKind>([
  K.PlusToken, K.MinusToken, K.AsteriskToken, K.SlashToken, K.PercentToken, K.AsteriskAsteriskToken,
  K.PlusEqualsToken, K.MinusEqualsToken, K.AsteriskEqualsToken, K.SlashEqualsToken, K.PercentEqualsToken, K.AsteriskAsteriskEqualsToken,
  K.BarToken, K.AmpersandToken, K.CaretToken, K.LessThanLessThanToken, K.GreaterThanGreaterThanToken, K.GreaterThanGreaterThanGreaterThanToken,
  K.BarEqualsToken, K.AmpersandEqualsToken, K.CaretEqualsToken, K.LessThanLessThanEqualsToken, K.GreaterThanGreaterThanEqualsToken,
  K.GreaterThanGreaterThanGreaterThanEqualsToken,
]);
const BANNED_METHODS = new Set(['reduce', 'reduceRight', 'toFixed', 'toPrecision', 'toExponential', 'toLocaleString']);
const BANNED_IDENTS = new Set(['Math', 'Number', 'parseFloat', 'parseInt', 'Intl', 'BigInt', 'globalThis']);
const ALLOWED_NUMBERS = new Set(['0', '1']);

interface Finding { file: string; line: number; rule: string; text: string }

const scanSource = (text: string, file: string): Finding[] => {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: Finding[] = [];
  const add = (n: ts.Node, rule: string): void => {
    out.push({ file, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, rule, text: n.getText(sf).slice(0, 60) });
  };
  const visit = (n: ts.Node): void => {
    if (ts.isBinaryExpression(n) && BANNED_BINARY.has(n.operatorToken.kind)) add(n, 'operator');
    else if ((ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) && (n.operator === K.PlusPlusToken || n.operator === K.MinusMinusToken)) add(n, 'increment');
    else if (ts.isPrefixUnaryExpression(n) && n.operator === K.TildeToken) add(n, 'bitwise');
    else if (ts.isPrefixUnaryExpression(n) && (n.operator === K.PlusToken || n.operator === K.MinusToken) && !ts.isNumericLiteral(n.operand)) add(n, 'unary');
    else if (ts.isNumericLiteral(n) && !ALLOWED_NUMBERS.has(n.text)) add(n, 'literal');
    else if (ts.isBigIntLiteral(n)) add(n, 'bigint');
    else if (ts.isPropertyAccessExpression(n) && BANNED_METHODS.has(n.name.text)) add(n, 'method');
    else if (ts.isElementAccessExpression(n) && ts.isStringLiteralLike(n.argumentExpression) && BANNED_METHODS.has(n.argumentExpression.text)) add(n, 'method'); // xs["reduce"]
    else if (ts.isBindingElement(n) && ts.isIdentifier(n.propertyName ?? n.name) && BANNED_METHODS.has((n.propertyName ?? n.name).getText(sf))) add(n, 'method'); // const { toFixed } = v
    else if (ts.isIdentifier(n) && BANNED_IDENTS.has(n.text)) {
      const p = n.parent;
      const isProp = ts.isPropertyAccessExpression(p) && p.name === n; // x.Math is a property name, not the global
      const isType = ts.isTypeReferenceNode(p) || ((ts.isPropertySignature(p) || ts.isPropertyAssignment(p)) && p.name === n); // a type or a declared key, not a use
      const isIsFinite = n.text === 'Number' && ts.isPropertyAccessExpression(p) && p.expression === n && p.name.text === 'isFinite';
      if (!isProp && !isType && !isIsFinite) add(n, 'global');
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
};

// The walk: every .ts/.tsx file under each projection directory of `root`, at any depth.
const walk = (dir: string): string[] => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.[cm]?[jt]sx?$/.test(e.name) ? [p] : [];
  });
};
const scanTree = (root: string): { files: string[]; findings: Finding[] } => {
  const files = DIRS.flatMap((d) => walk(path.join(root, d)));
  return { files, findings: files.flatMap((f) => scanSource(fs.readFileSync(f, 'utf8'), path.relative(root, f))) };
};
// Vacuity: every projection directory must contribute at least one file, else the scan proves nothing.
const coverageProblems = (root: string, files: string[]): string[] =>
  DIRS.filter((d) => !files.some((f) => f.startsWith(path.join(root, d) + path.sep))).map((d) => `no .ts/.tsx file under ${d}`);

const rulesOf = (src: string): string[] => scanSource(src, 'probe.ts').map((f) => f.rule);

// MF-42: the binding modules named in bindings.json, as absolute file paths. Throws (fails closed) on any read problem.
const BINDINGS = 'scripts/surfaces/_schema/bindings.json';
const moduleFiles = (root: string): string[] => {
  const modules = (JSON.parse(fs.readFileSync(path.join(root, BINDINGS), 'utf8')) as { modules?: unknown }).modules;
  if (!Array.isArray(modules)) throw new Error('bindings.json modules is not a list');
  return modules.map((m: { path?: unknown }) => {
    const p = path.join(root, String(m?.path));
    if (!fs.existsSync(p) || !fs.statSync(p).isFile()) throw new Error(`binding module missing: ${String(m?.path)}`);
    return p;
  });
};
const scanModules = (root: string): Finding[] => moduleFiles(root).flatMap((f) => scanSource(fs.readFileSync(f, 'utf8'), path.relative(root, f)));

let tmpRoot = '';
beforeAll(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mf16-nomaths-')); });
afterAll(() => { fs.rmSync(tmpRoot, { recursive: true, force: true }); });

describe('FE-05 report-no-maths: the real projection files', () => {
  it('the walk reads .js, .mjs, .jsx, .mts and .cts files too', () => {
    const root = fs.mkdtempSync(path.join(tmpRoot, 'ext-'));
    for (const d of DIRS) fs.mkdirSync(path.join(root, d), { recursive: true });
    for (const n of ['a.js', 'b.mjs', 'c.jsx', 'd.mts', 'e.cts']) fs.writeFileSync(path.join(root, DIRS[0] as string, n), 'export const f = (a, b) => a * b;\n');
    expect(scanTree(root).files).toHaveLength(5);
  });
  it('the walk finds the known files and every directory contributes', () => {
    const { files } = scanTree(ROOT);
    const names = files.map((f) => path.basename(f));
    expect(files.length).toBeGreaterThanOrEqual(5);
    expect(names).toContain('core.ts');
    expect(names).toContain('ReportView.tsx');
    expect(coverageProblems(ROOT, files)).toEqual([]);
  });
  it('the real files carry no maths (zero findings, no allow-list)', () => {
    expect(scanTree(ROOT).findings).toEqual([]);
  });
});

describe('FE-05 RED: one planted source per ban', () => {
  const planted: Array<[string, string, string]> = [
    ['multiplication', 'export const f = (a: string, b: number) => a + b * 2;', 'operator'],
    ['addition', 'export const f = (a: number, b: number) => a + b;', 'operator'],
    ['subtraction', 'export const f = (a: number, b: number) => a - b;', 'operator'],
    ['division', 'export const f = (a: number, b: number) => a / b;', 'operator'],
    ['modulo', 'export const f = (a: number, b: number) => a % b;', 'operator'],
    ['exponent', 'export const f = (a: number, b: number) => a ** b;', 'operator'],
    ['compound assignment', 'let x = 0; x += 1; export { x };', 'operator'],
    ['increment', 'let x = 0; x++; export { x };', 'increment'],
    ['decrement', 'let x = 0; --x; export { x };', 'increment'],
    ['unary plus on a value', 'export const f = (v: string) => +v;', 'unary'],
    ['unary minus on a value', 'export const f = (v: number) => -v;', 'unary'],
    ['bitwise or', 'export const f = (a: number, b: number) => a | b;', 'operator'],
    ['bitwise not', 'export const f = (a: number) => ~a;', 'bitwise'],
    ['shift', 'export const f = (a: number) => a << 2;', 'operator'],
    ['Math.round', 'export const f = (v: number) => Math.round(v);', 'global'],
    ['Math destructured', 'const { round } = Math; export { round };', 'global'],
    ['reduce', 'export const f = (xs: number[]) => xs.reduce((a, b) => a, 0);', 'method'],
    ['Number()', 'export const f = (v: string) => Number(v);', 'global'],
    ['map(Number)', 'export const f = (xs: string[]) => xs.map(Number);', 'global'],
    ['new Number', 'export const f = (v: string) => new Number(v);', 'global'],
    ['parseFloat', 'export const f = (v: string) => parseFloat(v);', 'global'],
    ['parseInt', 'export const f = (v: string) => parseInt(v, 10);', 'global'],
    ['toFixed', 'export const f = (v: number) => v.toFixed(2);', 'method'],
    ['toPrecision', 'export const f = (v: number) => v.toPrecision(3);', 'method'],
    ['numeric literal 7', 'export const seven = 7;', 'literal'],
    ['numeric literal 0.5', 'export const half = 0.5;', 'literal'],
    ['bigint literal', 'export const big = 1n;', 'bigint'],
    // panel folds (code-reviewer-grounded 1, 2): bypasses with no banned operator
    ['element access reduce', 'export const f = (xs: number[]) => xs["reduce"]((a, b) => a, 0);', 'method'],
    ['destructured toFixed', 'export const f = (v: number) => { const { toFixed } = v; return toFixed; };', 'method'],
    ['reduceRight', 'export const f = (xs: number[]) => xs.reduceRight((a, b) => a, 0);', 'method'],
    ['toLocaleString', 'export const f = (v: number) => v.toLocaleString("en");', 'method'],
    ['Intl.NumberFormat', 'export const f = (v: number) => new Intl.NumberFormat("en").format(v);', 'global'],
    ['BigInt()', 'export const f = (v: string) => BigInt(v);', 'global'],
    ['globalThis.Math', 'export const f = (v: number) => globalThis.Math.round(v);', 'global'],
  ];
  it.each(planted)('%s is reported', (_name, src, rule) => {
    expect(rulesOf(src)).toContain(rule);
  });
  it('a copy of the REAL core.ts with String(v) turned into String(v * 2) is reported', () => {
    const real = fs.readFileSync(path.join(ROOT, 'src/lib/surfaces/report/core.ts'), 'utf8');
    const planted2 = real.replace('${String(v)}', '${String(v * 2)}');
    expect(planted2).not.toBe(real); // dead-man: the edit really changed the text
    const found = scanSource(planted2, 'src/lib/surfaces/report/core.ts');
    expect(found.map((f) => f.rule)).toContain('operator');
    expect(found.length).toBeGreaterThan(0);
  });
});

describe('FE-05 negative controls: allowed forms pass', () => {
  it.each([
    ['0 and 1', 'export const z = [0, 1];'],
    ['String(v)', 'export const f = (v: number) => String(v);'],
    ['Number.isFinite', 'export const f = (v: unknown) => Number.isFinite(v);'],
    ['template literal', 'export const f = (v: string, u: string) => `${v} ${u}`;'],
    ['split and index', "export const f = (s: string) => s.split(':')[1];"],
    ['negative one', 'export const f = () => -1;'],
    ['a property named Math', 'export const f = (o: { Math: string }) => o.Math;'],
    ['comparison and logic', 'export const f = (a: string, b: string) => a === b && a !== "" || b >= a;'],
  ])('%s', (_name, src) => {
    expect(rulesOf(src)).toEqual([]);
  });
});

describe('FE-05 RED on disk: the walk reaches a violating file in a new subdirectory of each projection directory', () => {
  it('a sandbox with one violating file per directory reports each directory', () => {
    const root = fs.mkdtempSync(path.join(tmpRoot, 'bad-'));
    for (const d of DIRS) {
      const sub = path.join(root, d, 'nested', 'deeper');
      fs.mkdirSync(sub, { recursive: true });
      fs.writeFileSync(path.join(sub, 'extra.tsx'), 'export const f = (a: number, b: number) => a * b;\n');
    }
    const { files, findings } = scanTree(root);
    expect(files).toHaveLength(DIRS.length);
    for (const d of DIRS) expect(findings.some((f) => f.file.startsWith(`${d}${path.sep}`))).toBe(true);
  });
  it('a sandbox of clean files reports nothing (control)', () => {
    const root = fs.mkdtempSync(path.join(tmpRoot, 'ok-'));
    for (const d of DIRS) {
      fs.mkdirSync(path.join(root, d), { recursive: true });
      fs.writeFileSync(path.join(root, d, 'ok.ts'), 'export const f = (v: number) => String(v);\n');
    }
    const { files, findings } = scanTree(root);
    expect(files).toHaveLength(DIRS.length);
    expect(findings).toEqual([]);
    expect(coverageProblems(root, files)).toEqual([]);
  });
  it('an empty or renamed directory fails the coverage guard', () => {
    const root = fs.mkdtempSync(path.join(tmpRoot, 'empty-'));
    fs.mkdirSync(path.join(root, DIRS[0] as string), { recursive: true });
    const { files } = scanTree(root);
    expect(coverageProblems(root, files)).toEqual([`no .ts/.tsx file under ${DIRS[0]}`, `no .ts/.tsx file under ${DIRS[1]}`, `no .ts/.tsx file under ${DIRS[2]}`]);
  });
});

describe('FE-05 widened to binding modules (MF-42): bindings.json modules are scanned, fail closed', () => {
  it('the real tree: bindings.json reads, every listed module exists, and none carries maths (0 modules at MF-42: vacuous until MF-37 lists one)', () => {
    const files = moduleFiles(ROOT);
    expect(Array.isArray(files)).toBe(true);
    expect(scanModules(ROOT)).toEqual([]);
  });
  it('RED: a + b in a listed module is reported', () => {
    const root = fs.mkdtempSync(path.join(tmpRoot, 'mod-'));
    const rel = 'src/components/surfaces/web/FormBinding.tsx';
    fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), 'export const f = (a: number, b: number) => a + b;\n');
    fs.mkdirSync(path.join(root, path.dirname(BINDINGS)), { recursive: true });
    fs.writeFileSync(path.join(root, BINDINGS), JSON.stringify({ modules: [{ path: rel }] }));
    expect(scanModules(root).map((f) => [f.file, f.rule])).toEqual([[rel, 'operator']]);
  });
  it('RED: a missing bindings.json, a non-list modules and a listed module not on disk each fail closed', () => {
    const root = fs.mkdtempSync(path.join(tmpRoot, 'nomod-'));
    expect(() => moduleFiles(root)).toThrow(/bindings\.json/);
    fs.mkdirSync(path.join(root, path.dirname(BINDINGS)), { recursive: true });
    fs.writeFileSync(path.join(root, BINDINGS), JSON.stringify({ modules: 'x' }));
    expect(() => moduleFiles(root)).toThrow('bindings.json modules is not a list');
    fs.writeFileSync(path.join(root, BINDINGS), JSON.stringify({ modules: [{ path: 'src/components/surfaces/web/Gone.tsx' }] }));
    expect(() => moduleFiles(root)).toThrow('binding module missing: src/components/surfaces/web/Gone.tsx');
  });
});
