// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §0b dated note 2026-11-11 "Navigation is a route" and §5.3 item 5
//            ("Navigation position — expo-router owns which route is mounted"); the Spec 135 row for this lock is owed as FE-36 (reserved;
//            its text is in the §0b note until FE-35 is in the register, because the Spec 136 generator refuses a gap in the FE numbering).
//
// MF-75 · McFrontend queue · lane G. The navigation lock. Operator, verbatim (2026-11-11): "with impeccable review - can we ensuring all
// novaigation buttons use actual components or router pushes rather than local state toggles", then "yes" to landing it now with the six
// known violations as NAMED EXCEPTIONS, each tied to the task that will fix it (MF-46, MF-48/MF-74, MF-49). Record
// ~/Buildo-scratch/mcfrontend/phase1/open-questions.md (the two 2026-11-11 entries); audit ~/Buildo-scratch/mcfrontend/NAV-AUDIT-20261111.md.
//
// The FE-05 lock's form (report-no-maths.logic.test.ts): the TypeScript compiler API over EVERY .ts/.tsx file found by directory walk under
// DIRS (a new file is covered with no list edit); one planted case per rule in memory with a passing sibling; plants in copies of REAL files;
// the walk proven on disk. Mobile files are read as text, so the root vitest needs no jest. No DB, no network.
// The allow-list is fail-closed both ways: a finding no entry explains FAILS, and an entry that matches a different number of findings than
// its `count` (a stale entry: 0) FAILS. Entries are keyed by file + rule + component + handler text, never by line, so an edit above a
// control does not move its key. Four kinds: `exception` (the six audited VIOLATIONS; reason "owed: <row>"), `disclosure` (state that is
// not navigation: details, How?, sheets), `flag` (an audited FLAG the rule reaches: a real router call missing a guard, not navigation by
// state; reason "owed: <row>") and `ok` (an audited OK the rule shape reaches: the dev bypass, the Stripe hand-off).
//
// Rules (each finding is file + rule + component + handler):
//   NAV-1 state-as-route   In an onClick/onPress handler, a useState/useReducer setter is called with a string literal AND that state is a
//                          JSX branch discriminant in the same file (`x === 'lit' && <jsx>`, a ternary with JSX, or `switch (x)` returning
//                          JSX). Boolean toggles never match, so disclosure stays legal by construction.
//   NAV-2 non-semantic     A div/span/section/article/li/p (web) or View/Text/Image (mobile) with onClick/onPress/onKeyDown and no role.
//   NAV-3 unnamed nav      A Pressable/Touchable* whose handler calls router.push/replace/back/navigate with no accessibilityRole or no
//                          name (accessibilityLabel or text inside), or a mobile binding-tree node('Button'|'Pressable', {...}) whose
//                          onPress names a navigating action with no accessibilityRole key.
//   NAV-4 location hack    An assignment to (window|document.)location(.href), a (window.)location.assign/replace call, or
//                          history.pushState/replaceState. Reads are allowed.
//   NAV-5 back, no way out A mobile router.back() in a function that does not also reference canGoBack (a cold deep link has no history).
//   NAV-6 button navigates A web button/Button whose onClick calls router.push/replace with no component/href, or a web binding-tree
//                          node('Button', {...}) whose onClick names a navigating action with no href/component key.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
// The audited scope (NAV-AUDIT-20261111 "Scope"). A new file under any of them is covered by the walk.
const DIRS = [
  'src/app/(maxbld)', 'src/app/login', 'src/app/subscribe', 'src/app/admin/report-preview',
  'src/components/surfaces', 'src/components/report', 'src/components/auth', 'src/lib/surfaces',
  'mobile/app/(app)/parcel-tool', 'mobile/app/(auth)', 'mobile/src/components/surfaces', 'mobile/src/components/parcel',
];
// Named, not yet created: `/signup` is public in src/lib/auth/route-guard.ts with no page until MF-46 (Spec 126 §11b.7 W2). While a path is
// here it must NOT exist; the day MF-46 creates it this test fails until the path moves into DIRS (so the new page is scanned).
const NOT_YET = ['src/app/signup'];

const HANDLER_ATTRS = new Set(['onClick', 'onPress']);
const NON_INTERACTIVE = new Set(['div', 'span', 'section', 'article', 'li', 'p', 'View', 'Text', 'Image']);
const PRESSABLES = new Set(['Pressable', 'TouchableOpacity', 'TouchableHighlight', 'TouchableWithoutFeedback']);
// Web elements that can carry a navigating onClick (a role on a div does not make an imperative push a link; panel fold, code-reviewer MED 2).
const WEB_BUTTONS = new Set(['button', 'Button', 'a', 'div', 'span', 'li']);
const ROUTER_METHODS = new Set(['push', 'replace', 'back', 'navigate']);
const ROUTER_OBJECTS = new Set(['router', 'Router']);
// Binding-tree action names that move the user (the hosts map them to router calls: mobile SearchBinding `push`/`open_account`,
// LotMapBinding `back` on MF-53). Disclosure actions (toggle_panel, toggle_how, open_sheet, close_sheet, select) are not here.
const NAV_ACTIONS = new Set(['push', 'replace', 'back', 'navigate', 'open_account']);

interface Finding { file: string; line: number; rule: string; component: string; handler: string }

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim().slice(0, 80);
const isMobile = (file: string): boolean => file.startsWith('mobile/');
const isWeb = (file: string): boolean => file.startsWith('src/');

const strOf = (e: ts.Expression | undefined): string | null => (e && ts.isStringLiteralLike(e) ? e.text : null);
const unparen = (n: ts.Node): ts.Node => { let p = n.parent; while (p && ts.isParenthesizedExpression(p)) p = p.parent; return p; };
const hasJsx = (n: ts.Node | undefined): boolean => {
  if (!n) return false;
  if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) return true;
  return ts.forEachChild(n, (c) => (hasJsx(c) ? true : undefined)) === true;
};

type JsxOpen = ts.JsxOpeningElement | ts.JsxSelfClosingElement;
const attrsOf = (el: JsxOpen): Map<string, ts.JsxAttribute> => {
  const m = new Map<string, ts.JsxAttribute>();
  for (const a of el.attributes.properties) if (ts.isJsxAttribute(a)) m.set(a.name.getText(), a);
  return m;
};
const attrString = (a: ts.JsxAttribute | undefined): string | null => {
  const init = a?.initializer;
  if (!init) return null;
  if (ts.isStringLiteral(init)) return init.text;
  if (ts.isJsxExpression(init)) return strOf(init.expression);
  return null;
};
/** The component key: tag, plus the first literal testID / data-testid / accessibilityLabel / aria-label, so two same-tag controls differ. */
const componentOf = (el: JsxOpen): string => {
  const at = attrsOf(el);
  const id = attrString(at.get('testID')) ?? attrString(at.get('data-testid'));
  if (id) return `${el.tagName.getText()}#${id}`;
  const label = attrString(at.get('accessibilityLabel')) ?? attrString(at.get('aria-label'));
  return label ? `${el.tagName.getText()}[${label}]` : el.tagName.getText();
};
const hasText = (n: ts.Node): boolean => {
  if (ts.isJsxText(n) && n.text.trim() !== '') return true;
  return ts.forEachChild(n, (c) => (hasText(c) ? true : undefined)) === true;
};

/** router.push/replace/back/navigate(...) calls in `body`, as their call text. */
const routerCalls = (body: ts.Node, methods: Set<string> = ROUTER_METHODS): ts.CallExpression[] => {
  const out: ts.CallExpression[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ts.isIdentifier(n.expression.expression)
      && ROUTER_OBJECTS.has(n.expression.expression.text) && methods.has(n.expression.name.text)) out.push(n);
    ts.forEachChild(n, visit);
  };
  visit(body);
  return out;
};

/** The action names in an object-literal handler value (`{ action: 'push', route }`, or inside a ternary). */
const actionsIn = (n: ts.Node): string[] => {
  const out: string[] = [];
  const visit = (c: ts.Node): void => {
    if (ts.isObjectLiteralExpression(c)) {
      for (const p of c.properties) {
        if (ts.isPropertyAssignment(p) && p.name.getText() === 'action') { const s = strOf(p.initializer); if (s) out.push(s); }
      }
    }
    ts.forEachChild(c, visit);
  };
  visit(n);
  return out;
};

const scanSource = (text: string, file: string): Finding[] => {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: Finding[] = [];
  const add = (n: ts.Node, rule: string, component: string, handler: string): void => {
    out.push({ file, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, rule, component, handler: squash(handler) });
  };

  // Pass 1: state pairs, JSX discriminants, local functions.
  const setterOf = new Map<string, string>(); // setter -> state name
  const discriminants = new Set<string>();
  const localFns = new Map<string, ts.Node>();
  const pass1 = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && n.initializer) {
      const init = n.initializer;
      const callee = ts.isCallExpression(init) ? init.expression.getText(sf) : '';
      if (ts.isArrayBindingPattern(n.name) && /^(React\.)?use(State|Reducer)$/.test(callee)) {
        const [a, b] = n.name.elements;
        if (a && b && ts.isBindingElement(a) && ts.isBindingElement(b) && ts.isIdentifier(a.name) && ts.isIdentifier(b.name)) setterOf.set(b.name.text, a.name.text);
      }
      if (ts.isIdentifier(n.name)) {
        if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) localFns.set(n.name.text, init);
        else if (ts.isCallExpression(init) && /^(React\.)?useCallback$/.test(callee) && init.arguments[0]) localFns.set(n.name.text, init.arguments[0]);
      }
    }
    if (ts.isFunctionDeclaration(n) && n.name) localFns.set(n.name.text, n);
    if (ts.isBinaryExpression(n) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken].includes(n.operatorToken.kind)) {
      const id = ts.isIdentifier(n.left) && ts.isStringLiteralLike(n.right) ? n.left : ts.isIdentifier(n.right) && ts.isStringLiteralLike(n.left) ? n.right : null;
      const p = unparen(n);
      const jsxBranch = (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && hasJsx(p.right))
        || (ts.isConditionalExpression(p) && (hasJsx(p.whenTrue) || hasJsx(p.whenFalse)))
        || (ts.isIfStatement(p) && hasJsx(p.thenStatement)); // `if (x === 'lit') return <jsx>` (panel fold, code-reviewer MED 1)
      if (id && jsxBranch) discriminants.add(id.text);
    }
    if (ts.isSwitchStatement(n) && ts.isIdentifier(n.expression) && n.caseBlock.clauses.some((c) => c.statements.some((s) => ts.isReturnStatement(s) && hasJsx(s)))) {
      discriminants.add(n.expression.text);
    }
    ts.forEachChild(n, pass1);
  };
  pass1(sf);

  /** The body a handler expression runs: an inline function, or a same-file function it names. */
  const handlerBody = (e: ts.Expression): ts.Node | null => {
    if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) return e;
    if (ts.isIdentifier(e)) return localFns.get(e.text) ?? null;
    return null;
  };

  const visit = (n: ts.Node): void => {
    // JSX controls.
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      const tag = n.tagName.getText(sf);
      const at = attrsOf(n);
      const comp = componentOf(n);
      // NAV-2
      if (NON_INTERACTIVE.has(tag) && ['onClick', 'onPress', 'onKeyDown'].some((k) => at.has(k)) && !at.has('role') && !at.has('accessibilityRole')) {
        add(n, 'NAV-2', comp, ['onClick', 'onPress', 'onKeyDown'].filter((k) => at.has(k)).join('+'));
      }
      for (const name of HANDLER_ATTRS) {
        const a = at.get(name);
        const e = a?.initializer && ts.isJsxExpression(a.initializer) ? a.initializer.expression : undefined;
        const body = e ? handlerBody(e) : null;
        if (!e || !body) continue;
        // NAV-1
        const walk1 = (c: ts.Node): void => {
          if (ts.isCallExpression(c) && ts.isIdentifier(c.expression) && setterOf.has(c.expression.text)
            && c.arguments[0] && ts.isStringLiteralLike(c.arguments[0]) && discriminants.has(setterOf.get(c.expression.text) as string)) {
            add(c, 'NAV-1', comp, c.getText(sf));
          }
          ts.forEachChild(c, walk1);
        };
        walk1(body);
        const calls = routerCalls(body);
        // NAV-3
        if (PRESSABLES.has(tag) && calls.length > 0) {
          const named = at.has('accessibilityLabel') || (ts.isJsxOpeningElement(n) && hasText(n.parent));
          if (!at.has('accessibilityRole') && !at.has('role')) add(n, 'NAV-3', comp, `${calls[0]!.getText(sf)} (no role)`);
          else if (!named) add(n, 'NAV-3', comp, `${calls[0]!.getText(sf)} (no name)`);
        }
        // NAV-6
        if (isWeb(file) && WEB_BUTTONS.has(tag) && !at.has('component') && !at.has('href')) {
          const nav = routerCalls(body, new Set(['push', 'replace']));
          if (nav.length > 0) add(n, 'NAV-6', comp, nav[0]!.getText(sf));
        }
      }
    }
    // Binding-tree nodes: node('Button', { ... onPress/onClick: { action } }).
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'node') {
      const kind = strOf(n.arguments[0]);
      const props = n.arguments[1];
      if ((kind === 'Button' || kind === 'Pressable') && props && ts.isObjectLiteralExpression(props)) {
        const keys = new Map<string, ts.ObjectLiteralElementLike>();
        for (const p of props.properties) if (p.name) keys.set(p.name.getText(sf), p);
        const keyProp = keys.get('key');
        const k = keyProp && ts.isPropertyAssignment(keyProp) ? strOf(keyProp.initializer) : null;
        const comp = `node:${kind}${k ? `#${k}` : ''}`;
        for (const h of ['onPress', 'onClick']) {
          const p = keys.get(h);
          if (!p || !ts.isPropertyAssignment(p)) continue;
          const nav = actionsIn(p.initializer).filter((x) => NAV_ACTIONS.has(x));
          if (nav.length === 0) continue;
          if (isMobile(file) && !keys.has('accessibilityRole') && !keys.has('role')) add(n, 'NAV-3', comp, `action:${nav[0]} (no role)`);
          if (isWeb(file) && !keys.has('href') && !keys.has('component')) add(n, 'NAV-6', comp, `action:${nav[0]}`);
        }
      }
    }
    // NAV-4
    const locTarget = (e: ts.Expression): boolean => /^(window\.|document\.|globalThis\.)?location(\.href)?$/.test(e.getText(sf));
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && locTarget(n.left)) add(n, 'NAV-4', enclosingName(n), n.getText(sf));
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const obj = n.expression.expression.getText(sf);
      const m = n.expression.name.text;
      if ((/^(window\.|document\.|globalThis\.)?location$/.test(obj) && (m === 'assign' || m === 'replace'))
        || (/^(window\.|globalThis\.)?history$/.test(obj) && (m === 'pushState' || m === 'replaceState'))) {
        add(n, 'NAV-4', enclosingName(n), `${obj}.${m}`);
      }
    }
    // NAV-5
    if (isMobile(file) && ts.isCallExpression(n) && routerCalls(n, new Set(['back'])).includes(n)) {
      const fn = enclosingFn(n);
      if (!fn || !/\bcanGoBack\b/.test(fn.getText(sf))) add(n, 'NAV-5', enclosingName(n), n.getText(sf));
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
};

const enclosingFn = (n: ts.Node): ts.Node | null => {
  for (let p = n.parent; p; p = p.parent) if (ts.isArrowFunction(p) || ts.isFunctionExpression(p) || ts.isFunctionDeclaration(p) || ts.isMethodDeclaration(p)) return p;
  return null;
};
/** The component key for a non-JSX finding: the JSX control whose attribute holds it, else the enclosing named function. */
const enclosingName = (n: ts.Node): string => {
  for (let p = n.parent; p; p = p.parent) {
    if (ts.isJsxAttribute(p)) return componentOf(p.parent.parent as JsxOpen);
    if (ts.isFunctionDeclaration(p) && p.name) return `fn:${p.name.text}`;
    if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return `fn:${p.name.text}`;
  }
  return 'module';
};

// The walk: every .ts/.tsx (and .js/.jsx/.mjs/.cjs/.mts/.cts) file under each directory of `root`, at any depth.
const walk = (dir: string): string[] => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(p);
    return /\.[cm]?[jt]sx?$/.test(e.name) && !/\.d\.ts$/.test(e.name) ? [p] : [];
  });
};
const scanTree = (root: string, dirs: string[] = DIRS): { files: string[]; findings: Finding[] } => {
  const files = dirs.flatMap((d) => walk(path.join(root, d)));
  return { files, findings: files.flatMap((f) => scanSource(fs.readFileSync(f, 'utf8'), path.relative(root, f).split(path.sep).join('/'))) };
};
const coverageProblems = (root: string, files: string[], dirs: string[] = DIRS): string[] => [
  ...dirs.filter((d) => !files.some((f) => f.startsWith(path.join(root, d) + path.sep))).map((d) => `no source file under ${d}`),
  ...NOT_YET.filter((d) => fs.existsSync(path.join(root, d))).map((d) => `${d} now exists: move it from NOT_YET into DIRS`),
];

// ---------------------------------------------------------------------------------------------------------------------------------
// The allow-list. Every entry: file + rule + component + handler (the finding's key), how many findings it explains, kind, why.
// `audit` is the row number in NAV-AUDIT-20261111.md. An `exception` reason is "owed: <row>" (operator 2026-11-11 "yes").
// ---------------------------------------------------------------------------------------------------------------------------------
interface Allow { file: string; rule: string; component: string; handler: string; count: number; kind: 'exception' | 'disclosure' | 'flag' | 'ok'; audit: number; why: string }
const SIGN_IN = 'mobile/app/(auth)/sign-in.tsx';
const SIGN_UP = 'mobile/app/(auth)/sign-up.tsx';
const DETAIL = 'mobile/app/(app)/parcel-tool/[parcelId].tsx';
const LOGIN_FORM = 'src/components/auth/LoginForm.tsx';
const WEB_SEARCH = 'src/components/surfaces/web/SearchBinding.tsx';
const ALLOW: Allow[] = [
  // --- The six audited VIOLATIONS, named exceptions (operator 2026-11-11 "yes"). Audit #3 is one control that breaks two rules. ---
  { file: DETAIL, rule: 'NAV-3', component: 'Pressable#parcel-detail-back', handler: 'router.back() (no role)', count: 1, kind: 'exception', audit: 3,
    why: 'owed: MF-48 Stage B / MF-74 (the A4 report screen replaces this one; icon-only Back with no role or label)' },
  { file: DETAIL, rule: 'NAV-5', component: 'Pressable#parcel-detail-back', handler: 'router.back()', count: 1, kind: 'exception', audit: 3,
    why: 'owed: MF-48 Stage B / MF-74 (same control: no canGoBack fallback for a cold tracked-lot or share link)' },
  { file: SIGN_IN, rule: 'NAV-1', component: 'Pressable#email-button', handler: "setMode('email')", count: 1, kind: 'exception', audit: 15,
    why: "owed: MF-49 (A1: the email form becomes a route param, as sign-up.tsx resolveSignUpMethod)" },
  { file: SIGN_IN, rule: 'NAV-1', component: 'Pressable', handler: "setMode('idle')", count: 1, kind: 'exception', audit: 16,
    why: 'owed: MF-49 (A1: router.back() with role and label once #15 is a route)' },
  { file: SIGN_UP, rule: 'NAV-3', component: 'Pressable', handler: "router.replace('/(auth)/sign-in') (no role)", count: 1, kind: 'exception', audit: 22,
    why: 'owed: MF-49 (A1: role and label; canGoBack ? back : replace)' },
  { file: LOGIN_FORM, rule: 'NAV-1', component: 'button', handler: "setMode('signup')", count: 1, kind: 'exception', audit: 29,
    why: 'owed: MF-46 (W2: src/app/signup/page.tsx and a <Link href="/signup">)' },
  { file: LOGIN_FORM, rule: 'NAV-1', component: 'button', handler: "setMode('login')", count: 1, kind: 'exception', audit: 30,
    why: 'owed: MF-46 (W2: <Link href="/login"> once /signup exists)' },
  // --- Disclosure: state that is not navigation (details, How?, sheets). ---
  { file: 'src/components/report/ReportPageToggles.tsx', rule: 'NAV-2', component: 'div', handler: 'onClick+onKeyDown', count: 1, kind: 'disclosure', audit: 43,
    why: 'event delegation to the real <button data-toggle> children (See details, Hide, How?, the Add lot size sheet); the wrapper is not itself interactive (MF-57, MF-19). Dated note 2026-11-11 (MF-19 restack onto 07ecb3a4e): the key reads onClick+onKeyDown, because the MF-19 accessibility fold A12 delegates Escape in the open sheet from the same wrapper; the same one wrapper, count 1' },
  { file: SIGN_IN, rule: 'NAV-1', component: 'Pressable#phone-button', handler: "setMode('phone-input')", count: 1, kind: 'disclosure', audit: 17,
    why: 'opens the phone bottom sheet (a sheet is a self-contained task, ios.md:14), gated off by PHONE_AUTH_ENABLED' },
  { file: SIGN_IN, rule: 'NAV-1', component: 'Pressable#send-code-button', handler: "setMode('phone-otp')", count: 1, kind: 'disclosure', audit: 17,
    why: 'the code stage inside the same phone sheet, after the send (a stage of the sheet, not a screen)' },
  { file: SIGN_UP, rule: 'NAV-1', component: 'Pressable#signup-send-code', handler: "setPhoneStage('otp')", count: 1, kind: 'disclosure', audit: 21,
    why: 'the code stage inside the sign-up phone sheet, gated off by PHONE_AUTH_ENABLED' },
  // --- Audited FLAGs the rules reach: a real router call missing a guard; not navigation by state. Owed by the named row. ---
  { file: WEB_SEARCH, rule: 'NAV-6', component: 'node:Button#account', handler: 'action:open_account', count: 1, kind: 'flag', audit: 45,
    why: 'owed: MF-44 / MF-52 (Button component={Link} href; unwired while MAXBLD_WEB_LIVE=false, fixed before the switch flips)' },
  { file: WEB_SEARCH, rule: 'NAV-6', component: 'node:Button#select', handler: 'action:push', count: 1, kind: 'flag', audit: 46,
    why: 'owed: MF-44 (Button component={Link} href={route}, disabled while route is null; unwired while MAXBLD_WEB_LIVE=false)' },
  // --- Audited OK: a real mechanism the rule's shape reaches. ---
  { file: 'src/app/login/page.tsx', rule: 'NAV-6', component: 'button', handler: "router.push(safeRedirectPath(params.get('redirect')))", count: 1, kind: 'ok', audit: 27,
    why: 'Continue as Dev (dev mode only): a programmatic move to a computed, same-origin-guarded target (src/lib/auth/safe-redirect.ts, protected), not a link' },
  { file: 'src/app/subscribe/page.tsx', rule: 'NAV-4', component: 'fn:SubscribeInner', handler: 'window.location.assign', count: 1, kind: 'ok', audit: 32,
    why: 'Stripe Checkout is another origin (https only); router.push cannot leave the app' },
];
// The operator's ruling names exactly these six audited violations; this list may only shrink as MF-46, MF-48/MF-74 and MF-49 land.
const EXCEPTION_AUDIT_ROWS = [3, 15, 16, 22, 29, 30];

const keyOf = (x: { file: string; rule: string; component: string; handler: string }): string => `${x.file} | ${x.rule} | ${x.component} | ${x.handler}`;

/** Findings no entry explains, and entries whose match count is not their `count` (a stale entry matches 0). */
const judge = (findings: Finding[], allow: Allow[]): { unexplained: string[]; miscounted: string[] } => {
  const byKey = new Map<string, number>();
  for (const f of findings) byKey.set(keyOf(f), (byKey.get(keyOf(f)) ?? 0) + 1);
  const allowed = new Set(allow.map(keyOf));
  const unexplained = findings.filter((f) => !allowed.has(keyOf(f))).map((f) => `${f.file}:${f.line} ${f.rule} ${f.component} ${f.handler}`);
  const miscounted = allow.filter((a) => (byKey.get(keyOf(a)) ?? 0) !== a.count).map((a) => `${keyOf(a)}: expected ${a.count}, found ${byKey.get(keyOf(a)) ?? 0}`);
  return { unexplained, miscounted };
};

let tmpRoot = '';
beforeAll(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'navlock-')); });
afterAll(() => { fs.rmSync(tmpRoot, { recursive: true, force: true }); });

const rulesOf = (src: string, file = 'mobile/app/probe.tsx'): string[] => scanSource(src, file).map((f) => f.rule);

describe('NAV lock: the real tree', () => {
  it('the walk finds the known files, every directory contributes, and NOT_YET paths are still absent', () => {
    const { files } = scanTree(ROOT);
    const names = files.map((f) => path.basename(f));
    for (const n of ['LoginForm.tsx', 'sign-in.tsx', 'sign-up.tsx', 'disambiguate.tsx', 'ReportPageToggles.tsx', 'SearchBinding.tsx']) expect(names).toContain(n);
    expect(coverageProblems(ROOT, files)).toEqual([]);
  });
  it('every finding is explained by an allow-list entry, and every entry matches exactly its count (a stale entry fails)', () => {
    expect(judge(scanTree(ROOT).findings, ALLOW)).toEqual({ unexplained: [], miscounted: [] });
  });
  it('the exceptions are exactly the six audited violations, each reason "owed: <row>"', () => {
    const ex = ALLOW.filter((a) => a.kind === 'exception');
    expect([...new Set(ex.map((a) => a.audit))].sort((a, b) => a - b)).toEqual(EXCEPTION_AUDIT_ROWS);
    for (const a of ex) expect(a.why).toMatch(/^owed: MF-\d+/);
    for (const a of ALLOW.filter((x) => x.kind === 'flag')) expect(a.why).toMatch(/^owed: MF-\d+/);
  });
  it('every allow-list entry has a reason and names one rule; no two entries share a key', () => {
    for (const a of ALLOW) {
      expect(a.why.length).toBeGreaterThan(20);
      expect(a.rule).toMatch(/^NAV-[1-6]$/);
      expect(a.count).toBeGreaterThan(0);
    }
    expect(new Set(ALLOW.map(keyOf)).size).toBe(ALLOW.length);
  });
});

describe('NAV lock RED: removing any exception entry fails the real tree', () => {
  it.each(ALLOW.filter((a) => a.kind === 'exception').map((a) => [`#${a.audit} ${a.rule} ${a.handler}`, a] as const))('%s', (_n, entry) => {
    const { unexplained } = judge(scanTree(ROOT).findings, ALLOW.filter((a) => a !== entry));
    expect(unexplained).toHaveLength(entry.count);
    expect(unexplained[0]).toContain(`${entry.rule} ${entry.component} ${entry.handler}`);
  });
  it('a stale entry (the control was fixed but the entry stayed) fails', () => {
    const stale: Allow = { ...(ALLOW[0] as Allow), handler: 'router.back() (fixed)' };
    expect(judge(scanTree(ROOT).findings, [...ALLOW, stale]).miscounted).toEqual([`${keyOf(stale)}: expected 1, found 0`]);
  });
  it('a second identical violation beside an excepted one fails (count is exact)', () => {
    const findings = scanTree(ROOT).findings;
    const dup = findings.find((f) => f.rule === 'NAV-1' && f.handler === "setMode('email')") as Finding;
    expect(judge([...findings, dup], ALLOW).miscounted).toHaveLength(1);
  });
});

describe('NAV lock RED: one planted source per rule, with a passing sibling', () => {
  const STATE = "const [view, setView] = useState('a');";
  const planted: Array<[string, string, string, string]> = [
    ['NAV-1 setter with a literal, state picks the JSX', `export function P() { ${STATE} return <div>{view === 'b' && <p>B</p>}<button onClick={() => setView('b')}>Go</button></div>; }`, 'src/app/(maxbld)/p.tsx', 'NAV-1'],
    ['NAV-1 through a ternary and a named handler', `export function P() { ${STATE} const go = () => setView('b'); return view === 'a' ? <button onClick={go}>Go</button> : <p>B</p>; }`, 'src/app/(maxbld)/p.tsx', 'NAV-1'],
    ['NAV-1 switch returning JSX (useReducer)', "export function P() { const [s, dispatch] = useReducer(r, 'a'); switch (s) { case 'a': return <Pressable accessibilityRole=\"button\" onPress={() => dispatch('b')}><Text>Go</Text></Pressable>; default: return null; } }", 'mobile/app/(auth)/p.tsx', 'NAV-1'],
    ['NAV-2 div with onClick', 'export const P = () => <div onClick={() => go()}>x</div>;', 'src/app/(maxbld)/p.tsx', 'NAV-2'],
    ['NAV-2 View with onPress', 'export const P = () => <View onPress={() => go()} />;', 'mobile/app/(auth)/p.tsx', 'NAV-2'],
    ['NAV-3 Pressable that routes, no role', "export const P = () => <Pressable onPress={() => router.push('/x')}><Text>Go</Text></Pressable>;", 'mobile/app/(auth)/p.tsx', 'NAV-3'],
    ['NAV-3 icon-only Pressable that routes, role but no name', "export const P = () => <Pressable accessibilityRole=\"button\" onPress={() => router.push('/x')}><Icon /></Pressable>;", 'mobile/app/(auth)/p.tsx', 'NAV-3'],
    ['NAV-3 mobile binding Button with a navigating action, no role', "export const t = node('Button', { key: 'go', onPress: { action: 'push', route } }, []);", 'mobile/src/components/surfaces/p.tsx', 'NAV-3'],
    ['NAV-4 location.href assigned', "export const go = () => { window.location.href = '/x'; };", 'src/app/(maxbld)/p.tsx', 'NAV-4'],
    ['NAV-4 history.pushState', "export const go = () => window.history.pushState({}, '', '/x');", 'src/app/(maxbld)/p.tsx', 'NAV-4'],
    ['NAV-5 back with no canGoBack', "export const P = () => <Pressable accessibilityRole=\"button\" accessibilityLabel=\"Back\" onPress={() => router.back()} />;", 'mobile/app/(auth)/p.tsx', 'NAV-5'],
    ['NAV-6 web button that pushes', "export const P = () => <button onClick={() => router.push('/x')}>Go</button>;", 'src/app/(maxbld)/p.tsx', 'NAV-6'],
    ['NAV-1 early return picks the JSX (panel fold)', `export function P() { ${STATE} if (view === 'b') return <p>B</p>; return <button onClick={() => setView('b')}>Go</button>; }`, 'src/app/(maxbld)/p.tsx', 'NAV-1'],
    ['NAV-6 div with a role that pushes (panel fold)', "export const P = () => <div role=\"button\" onClick={() => router.push('/x')}>Go</div>;", 'src/app/(maxbld)/p.tsx', 'NAV-6'],
    ['NAV-6 anchor with no href that pushes (panel fold)', "export const P = () => <a onClick={() => router.push('/x')}>Go</a>;", 'src/app/(maxbld)/p.tsx', 'NAV-6'],
    ['NAV-6 web binding Button with a push action', "export const t = node('Button', { key: 'go', onClick: route === null ? null : { action: 'push', route } }, []);", 'src/components/surfaces/web/p.tsx', 'NAV-6'],
  ];
  it.each(planted)('%s', (_n, src, file, rule) => { expect(rulesOf(src, file)).toContain(rule); });

  const passing: Array<[string, string, string]> = [
    ['boolean disclosure toggle', 'export function P() { const [open, setOpen] = useState(false); return <div>{open && <p>x</p>}<button onClick={() => setOpen(!open)}>How?</button></div>; }', 'src/app/(maxbld)/p.tsx'],
    ['literal setter whose state never picks JSX', "export function P() { const [msg, setMsg] = useState(''); return <button onClick={() => setMsg('sent')}>Send</button>; }", 'src/app/(maxbld)/p.tsx'],
    ['a <button> delegate and a div with a role', 'export const P = () => <div role="group" onClick={f}><button data-toggle="x">x</button></div>;', 'src/app/(maxbld)/p.tsx'],
    ['Pressable with role and text that routes', "export const P = () => <Pressable accessibilityRole=\"button\" onPress={() => router.push('/x')}><Text>Go</Text></Pressable>;", 'mobile/app/(auth)/p.tsx'],
    ['back guarded by canGoBack', "export const P = () => <Pressable accessibilityRole=\"button\" accessibilityLabel=\"Back\" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />;", 'mobile/app/(auth)/p.tsx'],
    ['a location read', 'export const q = () => new URLSearchParams(window.location.search).get("x");', 'src/app/(maxbld)/p.tsx'],
    ['web Button rendered as a Link', "export const P = () => <Button component={Link} href=\"/x\" onClick={() => router.push('/x')}>Go</Button>;", 'src/app/(maxbld)/p.tsx'],
    ['web binding Button with href', "export const t = node('Button', { key: 'go', href: route, onClick: { action: 'push', route } }, []);", 'src/components/surfaces/web/p.tsx'],
    ['binding disclosure action', "export const t = node('Button', { key: 'how', onPress: { action: 'toggle_how' } }, []);", 'mobile/src/components/surfaces/p.tsx'],
    ['router.back on web is not NAV-5', "export const go = () => router.back();", 'src/app/(maxbld)/p.tsx'],
  ];
  it.each(passing)('passes: %s', (_n, src, file) => { expect(rulesOf(src, file)).toEqual([]); });
});

describe('NAV lock RED in copies of REAL files', () => {
  it('LoginForm: the MFA Back turned into a state swap is reported (NAV-1)', () => {
    const real = fs.readFileSync(path.join(ROOT, LOGIN_FORM), 'utf8');
    const planted = real.replace('onClick={cancelMfa}', "onClick={() => setMode('signup')}");
    expect(planted).not.toBe(real); // dead-man: the edit really changed the text
    const count = (t: string): number => scanSource(t, LOGIN_FORM).filter((f) => f.rule === 'NAV-1').length;
    expect(count(planted)).toBe(count(real) + 1);
  });
  it('confirm.tsx: the role removed from "Back to sign in" is reported (NAV-3)', () => {
    const file = 'mobile/app/(auth)/confirm.tsx';
    const real = fs.readFileSync(path.join(ROOT, file), 'utf8');
    expect(scanSource(real, file)).toEqual([]);
    const planted = real.replace(/accessibilityRole="button"/g, '');
    expect(planted).not.toBe(real);
    expect(scanSource(planted, file).map((f) => f.rule)).toContain('NAV-3');
  });
});

describe('NAV lock RED on disk: the walk reaches a new file in a new subdirectory of each directory', () => {
  it('a sandbox with one violating file per directory reports each directory', () => {
    const root = fs.mkdtempSync(path.join(tmpRoot, 'bad-'));
    for (const d of DIRS) {
      const sub = path.join(root, d, 'nested');
      fs.mkdirSync(sub, { recursive: true });
      fs.writeFileSync(path.join(sub, 'extra.tsx'), "export const P = () => <div onClick={() => go()}>x</div>;\n");
    }
    const { files, findings } = scanTree(root);
    expect(files).toHaveLength(DIRS.length);
    for (const d of DIRS) expect(findings.some((f) => f.file.startsWith(`${d}/`) && f.rule === 'NAV-2')).toBe(true);
  });
  it('an empty directory and a created NOT_YET path each fail the coverage guard', () => {
    const root = fs.mkdtempSync(path.join(tmpRoot, 'empty-'));
    for (const d of DIRS.slice(1)) { fs.mkdirSync(path.join(root, d), { recursive: true }); fs.writeFileSync(path.join(root, d, 'ok.ts'), 'export const x = 1;\n'); }
    fs.mkdirSync(path.join(root, NOT_YET[0] as string), { recursive: true });
    const { files } = scanTree(root);
    expect(coverageProblems(root, files)).toEqual([`no source file under ${DIRS[0]}`, `${NOT_YET[0]} now exists: move it from NOT_YET into DIRS`]);
  });
});
