// SPEC LINK: docs/specs/03-mobile/90_mobile_engineering_protocol.md §5; 132_step_standard_handbook.md §6 R-BA
//
// GATE C (COMPLY.3 stage 1, task-367) — the Spec 90 §5 never-do list as data, six rows, one per bullet, each with its quote. REPORT-ONLY.
//
// RULE (docs/specs/03-mobile/90_mobile_engineering_protocol.md:53-60, "Strict Anti-Patterns (NEVER DO THESE)"): the six quotes are in ROWS below, verbatim.
// EXISTING ENFORCEMENT CHECKED, none found (so nothing is duplicated): eslint.config.mjs has no `mobile` entry (grep mobile eslint.config.mjs: no match);
// no test under src/tests or mobile/__tests__ names the list (grep 'NO HTML|anti-pattern': only unrelated hits).
// READ AS WRITTEN: row C2 names `lucide-react`; the phone app imports `lucide-react-native`, a different package, so the gate does not flag it (exact
// package-name match, path suffix allowed). Whether the list was meant to cover the native package is a question for the operator (stage 2), not a gate stretch.
// Scope: mobile/ minus node_modules, tests, mocks, maestro, scripts, assets, *.generated.*. Exit 0 with a list; --strict exits 1 on findings. Not wired.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { walk } from './compute-reach.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export const SCAN_ROOTS = ['mobile'];
export const SKIP = /(^|\/)(node_modules|__mocks__)(\/|$)|^mobile\/(maestro|scripts|assets)\/|\.generated\.|\.d\.ts$/;
export const SPEC = 'docs/specs/03-mobile/90_mobile_engineering_protocol.md';

/** The closed list: one row per bullet of §5. `names` is the closed set the rule text names. */
export const ROWS = [
  { id: 'C1-no-html-dom', cite: '90_mobile_engineering_protocol.md:55', quote: '**NO HTML/DOM:** Never use `<div>`, `<span>`, `<a>`, `<p>`, or `<button>`.', names: ['div', 'span', 'a', 'p', 'button'] },
  { id: 'C2-no-web-libraries', cite: '90_mobile_engineering_protocol.md:56', quote: '**NO Web Libraries:** Never import `shadcn/ui`, `@tremor/react`, `framer-motion`, or `lucide-react`.', names: ['shadcn/ui', '@tremor/react', 'framer-motion', 'lucide-react'] },
  { id: 'C3-no-dom-apis', cite: '90_mobile_engineering_protocol.md:57', quote: '**NO DOM APIs:** Never use `window`, `document`, `localStorage`, `navigator.geolocation`.', names: ['window', 'document', 'localStorage'] },
  { id: 'C4-no-useeffect-fetch', cite: '90_mobile_engineering_protocol.md:58', quote: '**NO `useEffect` for Fetching:** Never fetch API data inside a `useEffect`. Always use TanStack Query.', names: ['fetch', 'fetchWithAuth'] },
  { id: 'C5-no-inline-renderitem', cite: '90_mobile_engineering_protocol.md:59', quote: '**NO Inline `renderItem`:** Never pass an inline arrow function to a FlashList/FlatList `renderItem`. Always use `useCallback` or extract the function.', names: ['renderItem'] },
  { id: 'C6-no-base-image', cite: '90_mobile_engineering_protocol.md:60', quote: '**NO standard `<Image>`:** Never use the base React Native `<Image>` for external URLs.', names: ['Image'] },
];
const row = (id) => ROWS.find((r) => r.id === id);

const matchesPkg = (spec, pkg) => spec === pkg || spec.startsWith(`${pkg}/`);

/** Scan; returns `[{file, line, id, text}]`. */
export function scan(root = REPO_ROOT, roots = SCAN_ROOTS) {
  const out = [];
  for (const r of roots) {
    for (const rel of walk(root, r)) {
      if (SKIP.test(rel) || /(^|\/)__tests__(\/|$)|\.(test|spec)\.[cm]?[jt]sx?$/.test(rel)) continue;
      const text = fs.readFileSync(path.join(root, rel), 'utf8');
      const kind = /\.tsx$/.test(rel) ? ts.ScriptKind.TSX : /\.jsx$/.test(rel) ? ts.ScriptKind.JSX : /\.jsx?$/.test(rel) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
      const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, kind);
      const lines = text.split('\n');
      const add = (node, id) => {
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        out.push({ file: rel, line, id, text: (lines[line - 1] || '').trim() });
      };
      let rnImage = false; // `Image` imported from 'react-native'
      const effectDepth = { n: 0 };
      const isDeclName = (n) => {
        const p = n.parent;
        return (ts.isVariableDeclaration(p) && p.name === n) || (ts.isParameter(p) && p.name === n) || (ts.isBindingElement(p) && p.name === n)
          || (ts.isPropertyAssignment(p) && p.name === n) || (ts.isPropertyAccessExpression(p) && p.name === n) || ts.isImportSpecifier(p) || ts.isFunctionDeclaration(p)
          || (ts.isShorthandPropertyAssignment(p) && p.name === n);
      };
      // local bindings that shadow a DOM global name (const document = ...): skip references to them
      const shadowed = new Set();
      const collect = (n) => {
        if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && row('C3-no-dom-apis').names.includes(n.name.text)) shadowed.add(n.name.text);
        if (ts.isParameter(n) && ts.isIdentifier(n.name) && row('C3-no-dom-apis').names.includes(n.name.text)) shadowed.add(n.name.text);
        ts.forEachChild(n, collect);
      };
      collect(sf);
      const visit = (n) => {
        if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
          const spec = n.moduleSpecifier.text;
          if (row('C2-no-web-libraries').names.some((p) => matchesPkg(spec, p))) add(n, 'C2-no-web-libraries');
          if (spec === 'react-native' && n.importClause?.namedBindings && ts.isNamedImports(n.importClause.namedBindings)
            && n.importClause.namedBindings.elements.some((e) => e.name.text === 'Image' && (!e.propertyName || e.propertyName.text === 'Image'))) rnImage = true;
        }
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && (n.expression.text === 'require' || n.expression.text === 'import') && n.arguments[0] && ts.isStringLiteral(n.arguments[0])
          && row('C2-no-web-libraries').names.some((p) => matchesPkg(n.arguments[0].text, p))) add(n, 'C2-no-web-libraries');
        if (n.kind === ts.SyntaxKind.CallExpression && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteral(n.arguments[0])
          && row('C2-no-web-libraries').names.some((p) => matchesPkg(n.arguments[0].text, p))) add(n, 'C2-no-web-libraries');
        if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && ts.isIdentifier(n.tagName)) {
          if (row('C1-no-html-dom').names.includes(n.tagName.text)) add(n, 'C1-no-html-dom');
          if (rnImage && n.tagName.text === 'Image') {
            const src = n.attributes.properties.find((a) => ts.isJsxAttribute(a) && a.name.text === 'source');
            const obj = src?.initializer && ts.isJsxExpression(src.initializer) ? src.initializer.expression : null;
            const uri = obj && ts.isObjectLiteralExpression(obj) ? obj.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText(sf) === 'uri') : null;
            const v = uri?.initializer;
            if (uri && !(v && ts.isStringLiteral(v) && /^(file|data):/.test(v.text))) add(n, 'C6-no-base-image');
          }
        }
        if (ts.isJsxAttribute(n) && n.name.text === 'renderItem' && n.initializer && ts.isJsxExpression(n.initializer) && n.initializer.expression
          && (ts.isArrowFunction(n.initializer.expression) || ts.isFunctionExpression(n.initializer.expression))) add(n, 'C5-no-inline-renderitem');
        if (ts.isIdentifier(n) && row('C3-no-dom-apis').names.includes(n.text) && !shadowed.has(n.text) && !isDeclName(n) && !ts.isTypeReferenceNode(n.parent)) add(n, 'C3-no-dom-apis');
        if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'navigator' && n.name.text === 'geolocation') add(n, 'C3-no-dom-apis');
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'useEffect') {
          effectDepth.n++;
          ts.forEachChild(n, visit);
          effectDepth.n--;
          return;
        }
        if (effectDepth.n > 0 && ts.isCallExpression(n) && ts.isIdentifier(n.expression) && row('C4-no-useeffect-fetch').names.includes(n.expression.text)) add(n, 'C4-no-useeffect-fetch');
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
  }
  return out;
}

function main() {
  const t0 = Date.now();
  const findings = scan();
  const by = {};
  for (const f of findings) by[f.id] = (by[f.id] || 0) + 1;
  console.log(`GATE C mobile-never-do (report-only; ${SPEC} §5, 6 rows): ${findings.length} finding(s)`);
  console.log(`by row: ${ROWS.map((r) => `${r.id}=${by[r.id] || 0}`).join(' ')}`);
  for (const f of findings) console.log(`FINDING ${f.file}:${f.line} ${f.id} | ${f.text}`);
  console.log(`run time ${Date.now() - t0} ms`);
  if (process.argv.includes('--strict') && findings.length) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
