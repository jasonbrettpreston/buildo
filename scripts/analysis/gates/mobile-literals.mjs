// SPEC LINK: docs/specs/02-web-admin/136_mcfrontend_handbook.md fe.05, fe.44; 132_step_standard_handbook.md §6 R-BA, core.8
//
// GATE B (COMPLY.3 stage 1, task-367) — numbers in phone and surface code. REPORT-ONLY.
//
// WHAT THE RULES ACTUALLY BIND (read first, quoted; not stretched):
//  - 132_step_standard_handbook.md:154 core.8 "Every number a step, gate, admin surface or tool uses is a registered logic variable or an exact zero."
//    It names step, gate, admin surface, tool. It does NOT name the phone app, so by its own words it does not bind mobile code. (UNVERIFIED: whether the
//    operator reads "admin surface" to include the app; that is a ruling for stage 2.)
//  - 136_mcfrontend_handbook.md:163 fe.44 "the client only switches which is shown, with no maths ...; the conversion factor is content/settings, never code".
//    Binds the client: a unit-conversion factor written in code. -> BOUND class B1.
//  - 136_mcfrontend_handbook.md:46 fe.05 "every number from McBylaws; no maths in the UI." Binds displayed numbers and arithmetic on them; a timer or retry
//    count is not a displayed number and not maths on one. The only arithmetic this gate can see without guessing is a conversion factor (B1).
//  Neither rule binds a wait, a retry count or a query option. Those are listed as INFORMATIONAL classes U1-U4 (a baseline for the operator, never
//  counted by --strict) so the operator can see them and decide whether a rule should bind them.
// NOT covered (no rule located, searched 136, 97, 90, 00_engineering_standards.md for hardcode/hard-coded/externali[sz]/never code): min-h and pixel numbers
//  (Spec 97:328 names tabBarHeight only; Spec 90 §9 sets a 44px minimum, which is a floor, not a ban).
//
// Scope globs (closed): mobile/src and mobile/app, *.ts *.tsx *.js *.jsx. Skipped: node_modules, tests (__tests__ dirs, *.test.* and *.spec.*), __mocks__,
// *.generated.*, *.d.ts. Exit 0 with a list; --strict exits 1 when a BOUND finding exists. Not wired into any hook, station or CI.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { walk } from './compute-reach.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export const SCAN_ROOTS = ['mobile/src', 'mobile/app'];
export const SKIP_EXTRA = /(^|\/)__mocks__(\/|$)|\.generated\.|\.d\.ts$/;
/** BOUND (fe.44): area and length conversion factors, metric <-> imperial (closed). */
export const CONVERSION_FACTORS = ['10.7639', '10.764', '3.28084', '3.2808', '0.3048', '0.092903', '0.0929'];
/** INFORMATIONAL name sets (closed). */
export const TIMER_CALLEES = ['setTimeout', 'setInterval'];
export const RETRY_NAME = /^(failureCount|attempt|attempts|retries|retryCount|tries)$/i;
export const QUERY_OPTION_KEYS = ['retry', 'staleTime', 'gcTime', 'refetchInterval', 'timeout', 'debounceMs', 'duration', 'delay'];

export const isSkipped = (rel) => SKIP_EXTRA.test(rel) || /(^|\/)__tests__(\/|$)|\.(test|spec)\.[cm]?[jt]sx?$/.test(rel);

const numVal = (n) => {
  if (ts.isNumericLiteral(n)) return Number(n.text.replace(/_/g, ''));
  if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(n.operand)) return -Number(n.operand.text.replace(/_/g, ''));
  return null;
};
const nonZero = (n) => { const v = numVal(n); return v !== null && v !== 0; };

/** Scan; returns `{bound, info}` of `{file, line, id, text}`. */
export function scan(root = REPO_ROOT, roots = SCAN_ROOTS) {
  const bound = [];
  const info = [];
  for (const r of roots) {
    for (const rel of walk(root, r)) {
      if (isSkipped(rel)) continue;
      const text = fs.readFileSync(path.join(root, rel), 'utf8');
      const kind = /\.tsx$/.test(rel) ? ts.ScriptKind.TSX : /\.jsx$/.test(rel) ? ts.ScriptKind.JSX : /\.jsx?$/.test(rel) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
      const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, kind);
      const lines = text.split('\n');
      const add = (list, node, id) => {
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        list.push({ file: rel, line, id, text: (lines[line - 1] || '').trim() });
      };
      const visit = (n) => {
        if (ts.isNumericLiteral(n) && CONVERSION_FACTORS.includes(n.text.replace(/_/g, ''))) add(bound, n, 'B1-conversion-factor');
        if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && /^[A-Z][A-Z0-9_]*$/.test(n.name.text) && n.initializer && nonZero(n.initializer)
          && ts.isVariableDeclarationList(n.parent) && ts.isVariableStatement(n.parent.parent) && ts.isSourceFile(n.parent.parent.parent)) add(info, n, 'U1-upper-snake-number');
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && TIMER_CALLEES.includes(n.expression.text) && n.arguments[1] && nonZero(n.arguments[1])) add(info, n, 'U2-timer-number');
        if (ts.isBinaryExpression(n) && [ts.SyntaxKind.LessThanToken, ts.SyntaxKind.LessThanEqualsToken].includes(n.operatorToken.kind)
          && ts.isIdentifier(n.left) && RETRY_NAME.test(n.left.text) && nonZero(n.right)) add(info, n, 'U3-retry-count');
        if (ts.isPropertyAssignment(n) && (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name)) && QUERY_OPTION_KEYS.includes(n.name.text) && nonZero(n.initializer)) add(info, n, 'U4-query-option-number');
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
  }
  return { bound, info };
}

function main() {
  const t0 = Date.now();
  const { bound, info } = scan();
  console.log(`GATE B mobile-literals (report-only): ${bound.length} BOUND finding(s) (fe.44 conversion factor); ${info.length} INFORMATIONAL (no rule binds mobile code for these; core.8 names step/gate/admin surface/tool)`);
  for (const f of bound) console.log(`BOUND ${f.file}:${f.line} ${f.id} | ${f.text}`);
  const by = {};
  for (const f of info) by[f.id] = (by[f.id] || 0) + 1;
  console.log(`INFORMATIONAL by class: ${Object.entries(by).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  for (const f of info) console.log(`INFO ${f.file}:${f.line} ${f.id} | ${f.text}`);
  console.log(`run time ${Date.now() - t0} ms`);
  if (process.argv.includes('--strict') && bound.length) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
