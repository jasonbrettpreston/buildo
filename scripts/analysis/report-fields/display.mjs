// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §3.1 (REPORT / LIST archetypes) — generator home PROVISIONAL
//            docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §3.2 (the consumer whitelist), §4 (detail sections)
//            .cursor/mcbylaw/phase3-prework/generator-design.md §2 G1 (display)
//
// G1 — what reaches the screen. A static TSX walk (TypeScript compiler API) over each declared screen file:
// every property-access chain whose root resolves (through the component's own const/destructuring declarations,
// `.map((x) => …)` element params and `(a) => …` component props) to the contract payload is one rendered value, with
// its label (a `label=` attribute, the element's own text, or the nearest preceding `…:` caption), its formatter (the
// enclosing `format*`/`String` call) and its line. The cost menu is read from the exported COST_LINE_ORDER /
// COST_LINE_LABELS consts and the per-m² id set the card compares against. Payload paths map to DB columns through
// the consumer assembler's own consts (CONSUMER_HEADLINE_COLS, T1_COST_SCALAR_COLS, CONSUMER_COMPARABLE_FIELDS) and
// its `row.<col>` reads; the tracked-lots projection maps through the `parcels.<col>` doc comment on each TrackedLot
// property (the contract is `status: new` — no route exists to read).

import ts from 'typescript';
import { literalValue, moduleTop } from './js-lineage.mjs';

const unwrap = (n) => {
  let e = n;
  while (e && (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e))) e = e.expression;
  return e;
};

/** Access chain of an expression: {root: Identifier, props: string[]} (optional chaining included) or null. */
function chainOf(e) {
  const props = [];
  let cur = unwrap(e);
  for (;;) {
    if (ts.isPropertyAccessExpression(cur)) { props.unshift(cur.name.text); cur = unwrap(cur.expression); continue; }
    if (ts.isElementAccessExpression(cur) && ts.isStringLiteral(cur.argumentExpression)) { props.unshift(cur.argumentExpression.text); cur = unwrap(cur.expression); continue; }
    break;
  }
  return ts.isIdentifier(cur) ? { root: cur, props } : null;
}

function jsxTag(n) {
  if (ts.isJsxElement(n)) return n.openingElement.tagName.getText();
  if (ts.isJsxSelfClosingElement(n)) return n.tagName.getText();
  return null;
}

function attr(n, name) {
  const attrs = ts.isJsxElement(n) ? n.openingElement.attributes : ts.isJsxSelfClosingElement(n) ? n.attributes : null;
  if (!attrs) return null;
  for (const a of attrs.properties) if (ts.isJsxAttribute(a) && a.name.getText() === name) return a;
  return null;
}

function ownText(el) {
  if (!ts.isJsxElement(el)) return '';
  return el.children.filter((c) => ts.isJsxText(c)).map((c) => c.text).join(' ').replace(/\s+/g, ' ').trim();
}

function deepText(el) {
  const parts = [];
  const go = (n) => { if (ts.isJsxText(n)) parts.push(n.text); ts.forEachChild(n, go); };
  go(el);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** Label of a rendered value: label= attr of the enclosing element, its own text, or the nearest preceding caption. */
function labelFor(node, sf) {
  for (let p = node.parent, lvl = 0; p && lvl < 8; p = p.parent) {
    const tag = jsxTag(p);
    if (!tag) continue;
    lvl++;
    const la = attr(p, 'label');
    if (la && la.initializer && ts.isStringLiteral(la.initializer)) return { label: la.initializer.text, how: 'label_attr' };
    const own = ownText(p).replace(/[:\s]+$/, '');
    if (own) return { label: own, how: 'own_text' };
    // nearest preceding sibling caption ending in ':'
    const parent = p.parent;
    if (parent && ts.isJsxElement(parent)) {
      const kids = parent.children.filter((c) => ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c));
      const i = kids.indexOf(p);
      for (let j = i - 1; j >= 0; j--) {
        const t = deepText(kids[j]);
        if (/:$/.test(t)) return { label: t.replace(/[:\s]+$/, ''), how: 'caption' };
      }
    }
  }
  void sf;
  return { label: null, how: 'none' };
}

/** The formatter applied to a rendered value: the nearest enclosing call to an identifier callee. */
function formatterFor(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isJsxExpression(p) || ts.isJsxAttribute(p)) break;
    if (ts.isCallExpression(p) && ts.isIdentifier(p.expression)) return p.expression.text;
  }
  return null;
}

/**
 * Resolve an identifier inside a component to a payload path prefix. Local consts/destructuring are followed; a
 * `.map` callback element param appends `[]`; the hook result root is `data`.
 */
function makeResolver(sf, rootNames) {
  const memo = new Map();
  const declOf = (id) => {
    for (let s = id.parent; s; s = s.parent) {
      if (ts.isBlock(s) || ts.isSourceFile(s) || ts.isFunctionLike(s)) {
        let hit = null;
        const look = (n) => {
          if (hit) return;
          if (n !== s && (ts.isFunctionLike(n))) {
            // parameters of a nested function are visible only inside it
            return;
          }
          if (ts.isVariableDeclaration(n)) {
            if (ts.isIdentifier(n.name) && n.name.text === id.text) hit = { decl: n, prop: null };
            else if (ts.isObjectBindingPattern(n.name)) for (const el of n.name.elements) if (el.name.getText(sf) === id.text) hit = { decl: n, prop: el.propertyName ? el.propertyName.getText(sf) : id.text };
          }
          ts.forEachChild(n, look);
        };
        if (ts.isFunctionLike(s)) {
          for (const p of s.parameters || []) {
            if (ts.isIdentifier(p.name) && p.name.text === id.text) return { param: p, fn: s };
            if (ts.isObjectBindingPattern(p.name)) for (const el of p.name.elements) if (el.name.getText(sf) === id.text) return { param: p, fn: s, prop: el.propertyName ? el.propertyName.getText(sf) : id.text };
          }
          if (s.body) ts.forEachChild(s.body, look);
        } else ts.forEachChild(s, look);
        if (hit) return hit;
      }
    }
    return null;
  };
  const resolve = (id) => {
    const key = id.getStart(sf);
    if (memo.has(key)) return memo.get(key);
    memo.set(key, null);
    let out = null;
    if (rootNames.has(id.text)) out = rootNames.get(id.text);
    else {
      const d = declOf(id);
      if (d && d.decl && d.decl.initializer) {
        let init = unwrap(d.decl.initializer);
        if (ts.isBinaryExpression(init) && init.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) init = unwrap(init.left);
        const base = pathOf(init);
        if (base) out = { path: d.prop ? [...base.path, d.prop] : base.path, via: base.via };
      } else if (d && d.param && d.fn && ts.isArrowFunction(d.fn) && d.fn.parent && ts.isCallExpression(d.fn.parent)) {
        const call = d.fn.parent;
        if (ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === 'map' && d.fn.parameters[0] === d.param) {
          const base = pathOf(call.expression.expression);
          if (base) out = { path: [...base.path, '[]'], via: base.via };
        }
      }
    }
    memo.set(key, out);
    return out;
  };
  const pathOf = (e) => {
    const c = chainOf(e);
    if (!c) return null;
    const r = resolve(c.root);
    return r ? { path: [...r.path, ...c.props], via: r.via } : null;
  };
  return { pathOf, resolve };
}

/**
 * Rendered payload paths of a screen file. rootNames: Map<identifier, {path: string[]}> for the hook result.
 * → [{path, line, label, label_how, formatter, component}]
 */
export function renderedPaths(file, rootNames, { skipComponents = new Set() } = {}) {
  const { sf } = file;
  const { pathOf } = makeResolver(sf, rootNames);
  const out = [];
  const seen = new Set();
  const visit = (n, comp) => {
    let c = comp;
    if (ts.isFunctionDeclaration(n) && n.name) c = n.name.text;
    if (skipComponents.has(c)) return;
    if ((ts.isPropertyAccessExpression(n) || ts.isIdentifier(n)) && !(n.parent && ts.isPropertyAccessExpression(n.parent) && n.parent.expression === n)) {
      // only maximal chains inside JSX (rendered) or a JSX-referenced local
      const p = pathOf(n);
      if (p && p.path.length > 1 && inJsx(n)) {
        const key = `${p.path.join('.')}@${file.lineOf(n.getStart(sf))}`;
        if (!seen.has(key)) {
          seen.add(key);
          const lab = labelFor(n, sf);
          out.push({ path: p.path.join('.'), line: file.lineOf(n.getStart(sf)), label: lab.label, label_how: lab.how, formatter: formatterFor(n), component: c || null });
        }
      }
    }
    ts.forEachChild(n, (k) => visit(k, c));
  };
  visit(sf, null);
  return out;
}

function inJsx(n) {
  for (let p = n.parent; p; p = p.parent) {
    if (ts.isJsxExpression(p)) return true;
    if (ts.isFunctionLike(p) || ts.isVariableDeclaration(p)) return false;
  }
  return false;
}

/** Identifiers rendered through a JSX `{local}` whose local is initialised from a payload path (`const ruling = f(lot.x)`). */
export function renderedLocals(file, rootNames) {
  const { sf } = file;
  const { pathOf } = makeResolver(sf, rootNames);
  const out = [];
  const visit = (n) => {
    if (ts.isJsxExpression(n) && n.expression && ts.isIdentifier(unwrap(n.expression))) {
      const id = unwrap(n.expression);
      // find the local's initializer and the chains in it
      let decl = null;
      const look = (m) => { if (!decl && ts.isVariableDeclaration(m) && ts.isIdentifier(m.name) && m.name.text === id.text) decl = m; ts.forEachChild(m, look); };
      look(sf);
      if (decl && decl.initializer) {
        const chains = [];
        const g = (m) => { if (ts.isPropertyAccessExpression(m) && !(m.parent && ts.isPropertyAccessExpression(m.parent) && m.parent.expression === m)) { const p = pathOf(m); if (p && p.path.length > 1) chains.push(p.path.join('.')); } ts.forEachChild(m, g); };
        g(decl.initializer);
        const lab = labelFor(id, sf);
        const fmt = ts.isCallExpression(unwrap(decl.initializer)) && ts.isIdentifier(unwrap(decl.initializer).expression) ? unwrap(decl.initializer).expression.text : null;
        for (const pth of chains) out.push({ path: pth, line: file.lineOf(id.getStart(sf)), label: lab.label, label_how: lab.how, formatter: fmt, component: null, via_local: id.text });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** Exported const array/object literal of a module (TS or JS). */
export function exportedConst(files, rel, name) {
  const f = files.get(rel);
  if (!f) return undefined;
  for (const st of f.sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && d.name.text === name && d.initializer) {
        return { value: literalValue(d.initializer), line: f.lineOf(d.getStart(f.sf)) };
      }
    }
  }
  const top = moduleTop(files, rel);
  if (top && top.consts.has(name)) return { value: literalValue(top.consts.get(name).initializer), line: f.lineOf(top.consts.get(name).getStart(f.sf)) };
  return undefined;
}

/** The per-m² id set of the cost card: string literals compared against `id` in the `isPerSqm` initializer. */
export function perSqmIds(file, varName) {
  const ids = [];
  let line = null;
  const visit = (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === varName && n.initializer) {
      line = file.lineOf(n.getStart(file.sf));
      const g = (m) => { if (ts.isStringLiteral(m)) ids.push(m.text); ts.forEachChild(m, g); };
      g(n.initializer);
    }
    ts.forEachChild(n, visit);
  };
  visit(file.sf);
  return { ids: ids.sort(), line };
}

/** Line of the first JSX element with tag `tag` (e.g. the CostCard usage). */
export function jsxLine(file, tag) {
  let line = null;
  const visit = (n) => { if (line == null && jsxTag(n) === tag && !ts.isJsxElement(n.parent)) line = file.lineOf(n.getStart(file.sf)); if (line == null && jsxTag(n) === tag) line = file.lineOf(n.getStart(file.sf)); ts.forEachChild(n, visit); };
  visit(file.sf);
  return line;
}

/**
 * Consumer assembler map: payload path → {column, key?, line}. Reads the assembler's own consts and `row.<col>`
 * reads (compStats object literal; `X.safeParse(row.<col>)` for the JSONB tiers).
 */
export function consumerMap(files, rel, fnName, headlineConst, scalarConstFile, scalarConst, comparableConst) {
  const f = files.get(rel);
  const map = new Map();
  const head = exportedConst(files, rel, headlineConst);
  for (const c of head.value) map.set(`parcel.areas.${c}`, { column: c, line: head.line, whitelist: headlineConst });
  const sc = exportedConst(files, scalarConstFile, scalarConst);
  for (const c of sc.value) map.set(`parcel.costMenu.scalars.${c}`, { column: c, line: sc.line, whitelist: scalarConst });
  const cmp = exportedConst(files, rel, comparableConst);
  const top = moduleTop(files, rel);
  const fn = top.functions.get(fnName);
  // compStats: { k: num(row.col) }
  const visit = (n) => {
    if (ts.isPropertyAssignment(n) && n.name.getText(f.sf) === 'compStats' && ts.isObjectLiteralExpression(n.initializer)) {
      for (const p of n.initializer.properties) {
        if (!ts.isPropertyAssignment(p)) continue;
        const g = (m) => { if (ts.isPropertyAccessExpression(m) && m.expression.getText(f.sf) === 'row') map.set(`parcel.neighbourhood.compStats.${p.name.getText(f.sf)}`, { column: m.name.text, line: f.lineOf(p.getStart(f.sf)), whitelist: 'compStats' }); ts.forEachChild(m, g); };
        g(p.initializer);
      }
    }
    // `if (row.X != null) { const parsed = S.safeParse(row.X); … local = parsed.data }`
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'safeParse'
      && n.arguments[0] && ts.isPropertyAccessExpression(n.arguments[0]) && n.arguments[0].expression.getText(f.sf) === 'row') {
      const col = n.arguments[0].name.text;
      // the local the parsed data lands in: an assignment `local = parsed.data` in the same if-block
      let blk = n.parent;
      while (blk && !ts.isIfStatement(blk)) blk = blk.parent;
      let local = null;
      if (blk) {
        const g = (m) => { if (!local && ts.isBinaryExpression(m) && m.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(m.left) && /\.data$/.test(m.right.getText(f.sf))) local = m.left.text; ts.forEachChild(m, g); };
        g(blk);
      }
      const where = { summary: 'parcel.neighbourhood.summary', menu: 'parcel.costMenu.menu' }[local];
      if (where) map.set(where, { column: col, json: true, line: f.lineOf(n.getStart(f.sf)), whitelist: local });
    }
    ts.forEachChild(n, visit);
  };
  visit(fn);
  if (cmp) for (const k of cmp.value) map.set(`parcel.neighbourhood.comparableBuilds[].${k}`, { column: 'comparable_builds', key: k, json: true, line: cmp.line, whitelist: comparableConst });
  return map;
}

/** Map a payload path to its column via the consumer map (exact, or a JSON root prefix + key). */
export function columnOfPath(cmap, pth) {
  if (cmap.has(pth)) return cmap.get(pth);
  for (const [k, v] of cmap) {
    if (v.json && pth.startsWith(`${k}.`)) return { ...v, key: pth.slice(k.length + 1) };
  }
  return null;
}

/** TrackedLot projection: property → `parcels.<col>` from its doc comment, or DERIVED. */
export function trackedProjection(file, typeName) {
  const out = new Map();
  const visit = (n) => {
    if (ts.isTypeAliasDeclaration(n) && n.name.text === typeName && ts.isTypeLiteralNode(n.type)) {
      for (const m of n.type.members) {
        if (!ts.isPropertySignature(m)) continue;
        const docs = ts.getJSDocCommentsAndTags(m).map((d) => d.getText(file.sf)).join(' ');
        const col = /\bparcels\.([a-z_0-9]+)/.exec(docs);
        const derived = /\bDERIVED\b/.test(docs);
        out.set(m.name.getText(file.sf), { column: col ? col[1] : null, derived, doc: docs.replace(/\s+/g, ' ').replace(/^\/\*\*\s*|\s*\*\/$/g, '').trim(), line: file.lineOf(m.getStart(file.sf)) });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(file.sf);
  return out;
}
