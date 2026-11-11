// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.3 (closed status list), 11a.6 (headline), 11a.7 (dated note 2026-11-09, MF-14), 5.3 (the server projects),
//            docs/specs/02-web-admin/128_surface_standard_policy.md Rule 16 (no maths), Rule 17 (honest display),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-24 (throws on an unknown field or status), FE-29 (the one node contract).
//
// MF-20 (Spec 126 11a.10, FE-22, FE-23; Spec 128 R-17, R-34): the one closed source kind `ad_slot` is routed to the root `slots[]`, never to `nodes[]`.
// Which scenario a slot sits beside is DATA (the ad contract's scenario_fields map); no field is named here.
// MF-38 (Spec 126 11a.7 and FE-29 dated notes 2026-11-11; O-1 b): ONE closed image node kind. A declared content field typed object[] is the image
// list: one {scenario, asset_id, alt, caption?} item per scenario key; caption defaults to content.illustrations.caption_default; the tree never
// carries a URL. viewOf shows the picked scenario's one image with its injected URL (pick.urls), the same on every target; no layout key.
// MF-62 (Spec 126 11a.7 dated note 2026-11-11, FE-35; operator "Mf-62 - yes"): a loading response may carry `what_we_checked`; its tree then carries ONE
// root-only `checked` object (as `slots`, never a node; never on miss, error or a reading tree): every text a content template of
// states.checked filled with the server-formatted value, the pace as sent. MF-62 follow-up (operator 2026-11-11, the processing sequence): each
// line carries its loading verb (content `verbs`) and its resolve time done_ms; `ready` (the line naming the report and the address, at ready_ms),
// `open` (the reduce-motion action "View report"); the order is checked here: done after delay, ready after every fact and the dates, by the minimum. viewOf adds `paced` (layout rows with details: collapsed) and the skip href.
// MF-14 · McFrontend queue · lane E-MF14. THE one REPORT renderer core: three pure functions. Every datum (schema, declaration, content registry,
// headline lists, layout table) is an argument, so a test can inject a synthetic one and nothing here names a field. Runs on the server (the schema
// check is AJV, the engine of the gate: scripts/surfaces/report-checks.mjs). No maths: String(n), the declared unit, the dash for null.
import Ajv2020Module from 'ajv/dist/2020.js';

/* eslint-disable @typescript-eslint/no-explicit-any -- the inputs are committed JSON files of a declared shape; the schema check is the guard */
type Json = Record<string, any>;
// The injected data: { schema, decl, content, lists, layout }. Loosely typed on purpose: a test injects synthetic files of the same shape.
export type ReportCtx = Json;
export interface ReportNode { field: string; source: string; label: string; value: string | null; status: string; confidence: string; provenance: string; disclosures: string[] }
export interface ReportSlot { field: string; slot: string; source: string; label: string; value: string; disclosure: string; scenario?: string }
export interface ReportImageItem { scenario: string; asset_id: string; alt: string; caption: string }
export interface ReportImageNode { field: string; source: 'content'; kind: 'image'; label: string; images: ReportImageItem[] }
export interface CheckedLine { key: string; text: string; verb: string; delay_ms: number; done_ms: number }
export interface CheckedTree { summary: string; groups: Array<{ key: string; lines: CheckedLine[] }>; dates?: { text: string; delay_ms: number }; skip: { text: string; after_ms: number }; ready: { text: string; at_ms: number }; open: { text: string }; min_ms: number }
// MF-62: `paced` (lines fade in at their delay, the skip appears after its delay) on layout rows with details: collapsed; `href` the skip target, or null.
export interface ViewChecked extends CheckedTree { paced: boolean; href: string | null }
export interface ReportTree { lifecycle?: string; nodes: Array<ReportNode | ReportImageNode>; slots?: ReportSlot[]; checked?: CheckedTree }
export interface ViewImage { field: string; label: string; asset_id: string; alt: string; caption: string; src: string }
export interface ViewSlot { field: string; slot: string; scenario?: string; label: string; text: string; disclosure: string; placement: 'beside_card' | 'after_card' }
export interface ViewNode { field: string; label: string; text: string; status: string; badge: string | null; confidence: string; provenance: string; disclosures: string[]; showMeta: boolean; unavailable: boolean }
// image_state: shown (the picked option's image with a URL), none (no image for this pick), no_url (an image exists but no URL was issued).
export interface ReportView { target: string; layout: Json; lifecycle?: string; reason?: ViewNode; headline: ViewNode[]; detail: ViewNode[]; slots: ViewSlot[]; image?: ViewImage; image_state: 'shown' | 'none' | 'no_url'; checked?: ViewChecked }

// Control keys of a response pick the tree kind; information keys ride along and are never emitted (MF-14 D-11, closed list).
const CONTROL_KEYS = ['status', 'lifecycle'];
const INFO_KEYS = ['synthetic', 'roof_form'];
// The one field the renderer itself produces: the plain-words reason (or the lifecycle message). Declared as a content field.
const REASON_FIELD = 'status_text';
// MF-57: the declared field that reads the v21 page texts (content:page). Read by buildPage from the registry, never accepted from a response.
const PAGE_TEXT_FIELD = 'page_text';

export class ReportRenderError extends Error {
  problems: string[];
  constructor(problems: string[]) {
    super(problems.join('\n'));
    this.name = 'ReportRenderError';
    this.problems = problems;
  }
}

const Ajv2020 = ((Ajv2020Module as any).default ?? Ajv2020Module) as new (o: Json) => { compile: (s: Json) => any };
const compiled = new WeakMap<object, any>();
const validatorOf = (schema: Json): any => {
  let v = compiled.get(schema);
  if (!v) { v = new Ajv2020({ allErrors: true, strict: true }).compile(schema); compiled.set(schema, v); }
  return v;
};

const fieldsOf = (decl: Json): Json[] => (decl.sections as Json[]).flatMap((s) => s.fields as Json[]);
const kindOf = (f: Json): string => String(f.source).split(':')[0] as string;
const textKey = (status: string): string => (status.startsWith('not_permitted:') ? 'not_permitted' : status);
const statusPattern = (schema: Json): RegExp => new RegExp(schema.$defs.node.properties.status.pattern);
const registryText = (content: Json, status: string): string | undefined => {
  const t = content.status_text?.[textKey(status)];
  const clause = status.split(':')[1] ?? '';
  return typeof t === 'string' ? t.replace('{clause}', () => clause) : undefined; // a function replacer: the clause is literal, never a pattern
};
const disclosureCodes = (content: Json): string[] =>
  Object.entries(content.disclosure_texts ?? {}).filter(([, v]) => v !== null && typeof v === 'object').map(([k]) => k);

// MF-20: the one closed source kind routed to root slots. The ad contract (ctx.adContract) and the Sponsored label (content) are data.
const AD_KIND = 'ad_slot';
const slotOf = (f: Json, v: unknown, ctx: ReportCtx): Json | null => {
  const ad = ctx.adContract;
  if (!ad) throw new ReportRenderError(['RR-SLOT ad contract missing']);
  if (v === null || v === '') return null;
  const member = String(f.source).split(':')[1] as string;
  const scenario = Object.entries(ad.scenario_fields ?? {}).find(([, name]) => name === f.name)?.[0];
  return { field: String(f.name), slot: member, source: AD_KIND, label: String(f.label), value: String(v), disclosure: String(ctx.content.sponsored_label), ...(scenario !== undefined ? { scenario } : {}) };
};

// MF-38: the image list. A content field typed object[] (the decl type, fold CR-9); items are checked here and again by the schema (alt both ends, D-10).
const IMAGE_KIND = 'image';
const IMAGE_KEYS = ['scenario', 'asset_id', 'alt', 'caption'];
const isImageField = (f: Json): boolean => kindOf(f) === 'content' && f.type === 'object[]';
const concrete = (v: unknown): boolean => typeof v === 'string' && v.trim() !== '' && !/[{}]/.test(v);
const imageItemProblems = (field: string, items: unknown[], ctx: ReportCtx): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  items.forEach((it, i) => {
    const at = `RR-FIELD ${field}: item ${i}`;
    if (it === null || typeof it !== 'object' || Array.isArray(it)) { out.push(`${at} is not an object`); return; }
    const x = it as Json;
    for (const k of Object.keys(x)) if (!IMAGE_KEYS.includes(k)) out.push(`${at}: key ${k} is not allowed (the tree never carries a url or bytes)`);
    if (typeof x.scenario !== 'string' || !Object.prototype.hasOwnProperty.call(ctx.lists, x.scenario)) out.push(`${at}: scenario ${JSON.stringify(x.scenario)} is not a key of row-presentation.json`);
    else if (seen.has(x.scenario)) out.push(`${at}: scenario ${x.scenario} has two images (one image per option)`);
    else seen.add(x.scenario);
    if (typeof x.asset_id !== 'string' || x.asset_id === '') out.push(`${at}: asset_id is required`);
    if (!concrete(x.alt)) out.push(`${at}: alt is required, non-blank and concrete (no {placeholder})`);
    if ('caption' in x && !concrete(x.caption)) out.push(`${at}: caption, when sent, is non-blank and concrete`);
  });
  return out;
};

// MF-62: the loading state "What we checked". Closed keys; every value a server-formatted string (FE-05); the pace as integer milliseconds.
const LOADING = 'loading';
const CHECKED_KEY = 'what_we_checked';
const CHECKED_KEYS = ['groups', 'dates', 'skip_after_ms', 'ready_ms', 'address', 'min_ms'];
// The closed placeholders of a checked template and the response key that fills each (N-1 b, 2026-11-11: the limits line also names its house types).
const SLOTS: Array<[string, string]> = [['{value}', 'value'], ['{types}', 'types'], ['{address}', 'address']];
const isObj = (v: unknown): v is Json => v !== null && typeof v === 'object' && !Array.isArray(v);
const isMs = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && /^\d+$/.test(String(v));
const strayKeys = (x: Json, keys: string[], at: string, out: string[]): void => { for (const k of Object.keys(x)) if (!keys.includes(k)) out.push(`RR-CHECKED ${at}: key ${k} is not allowed`); };
const checkedLine = (tpl: unknown, x: Json, at: string, out: string[]): string => {
  if (typeof tpl !== 'string' || tpl === '') { out.push(`RR-CHECKED ${at}: no content text for ${String(x.key)}`); return ''; }
  let text = tpl;
  for (const [slot, k] of SLOTS) {
    const wants = tpl.includes(slot);
    if (wants && !(typeof x[k] === 'string' && x[k] !== '')) out.push(`RR-CHECKED ${at}: ${k} is required and is a string (the server formats, FE-05)`);
    if (!wants && x[k] !== undefined) out.push(`RR-CHECKED ${at}: this line takes no ${k}`);
    if (wants) text = text.replace(slot, () => String(x[k]));
  }
  return text;
};
const buildChecked = (w: unknown, ctx: ReportCtx, out: string[]): Json | undefined => {
  const c = ctx.content.states?.checked;
  if (!isObj(c)) { out.push('RR-CONTENT states.checked: missing'); return undefined; }
  if (!isObj(w)) { out.push(`RR-CHECKED ${CHECKED_KEY}: not an object`); return undefined; }
  strayKeys(w, CHECKED_KEYS, CHECKED_KEY, out);
  if (!isMs(w.min_ms)) out.push(`RR-CHECKED ${CHECKED_KEY}.min_ms: not integer milliseconds`);
  if (!isMs(w.skip_after_ms)) out.push(`RR-CHECKED ${CHECKED_KEY}.skip_after_ms: not integer milliseconds`);
  else if (isMs(w.min_ms) && w.skip_after_ms > w.min_ms) out.push(`RR-CHECKED ${CHECKED_KEY}.skip_after_ms: above min_ms`);
  if (!isMs(w.ready_ms)) out.push(`RR-CHECKED ${CHECKED_KEY}.ready_ms: not integer milliseconds`);
  else if (isMs(w.min_ms) && w.ready_ms > w.min_ms) out.push(`RR-CHECKED ${CHECKED_KEY}.ready_ms: after min_ms (the report opens before the ready line)`);
  let lastDone = 0;
  const groups: unknown[] = Array.isArray(w.groups) ? w.groups : [];
  if (!groups.length) out.push(`RR-CHECKED ${CHECKED_KEY}.groups: at least one group`);
  const seen = new Set<string>();
  const built = groups.map((g, gi) => {
    const at = `groups.${gi}`;
    if (!isObj(g)) { out.push(`RR-CHECKED ${at}: not an object`); return {}; }
    strayKeys(g, ['key', 'lines'], at, out);
    const tpls = c.lines?.[g.key];
    if (!isObj(tpls)) { out.push(`RR-CHECKED ${at}: unknown group ${String(g.key)}`); return {}; }
    if (seen.has(g.key)) out.push(`RR-CHECKED ${at}: group ${String(g.key)} twice`);
    seen.add(g.key);
    const lines: unknown[] = Array.isArray(g.lines) ? g.lines : [];
    if (!lines.length) out.push(`RR-CHECKED ${at}: a group carries at least one line (the producer omits an empty group)`);
    return { key: g.key, lines: lines.map((x, li) => {
      const lat = `${at}.lines.${li}`;
      if (!isObj(x)) { out.push(`RR-CHECKED ${lat}: not an object`); return {}; }
      strayKeys(x, ['key', 'value', 'types', 'delay_ms', 'done_ms'], lat, out);
      if (!isMs(x.delay_ms)) out.push(`RR-CHECKED ${lat}.delay_ms: not integer milliseconds`);
      if (!isMs(x.done_ms)) out.push(`RR-CHECKED ${lat}.done_ms: not integer milliseconds`);
      else if (isMs(x.delay_ms) && x.done_ms <= x.delay_ms) out.push(`RR-CHECKED ${lat}.done_ms: not after delay_ms`);
      if (isMs(x.done_ms) && x.done_ms > lastDone) lastDone = x.done_ms;
      const verb = c.verbs?.[g.key]?.[x.key];
      if (typeof verb !== 'string' || verb === '') out.push(`RR-CHECKED ${lat}: no content verb for ${String(x.key)}`);
      return { key: x.key, text: checkedLine(tpls[x.key], x, lat, out), verb, delay_ms: x.delay_ms, done_ms: x.done_ms };
    }) };
  });
  const tree: Json = { summary: c.summary, groups: built };
  if (w.dates !== undefined) {
    const d = w.dates;
    if (!isObj(d)) out.push(`RR-CHECKED dates: not an object`);
    else {
      strayKeys(d, ['lines', 'delay_ms'], 'dates', out);
      if (!isMs(d.delay_ms)) out.push('RR-CHECKED dates.delay_ms: not integer milliseconds');
      else if (isMs(w.ready_ms) && d.delay_ms > w.ready_ms) out.push('RR-CHECKED dates.delay_ms: after ready_ms');
      const ls: unknown[] = Array.isArray(d.lines) ? d.lines : [];
      if (!ls.length) out.push('RR-CHECKED dates.lines: at least one date (the producer omits the dates when none)');
      const texts = ls.map((x, li) => {
        if (!isObj(x)) { out.push(`RR-CHECKED dates.lines.${li}: not an object`); return ''; }
        strayKeys(x, ['key', 'value'], `dates.lines.${li}`, out);
        return checkedLine(c.dates?.[x.key], x, `dates.lines.${li}`, out);
      });
      tree.dates = { text: texts.join(' '), delay_ms: d.delay_ms };
    }
  }
  tree.skip = { text: c.skip, after_ms: w.skip_after_ms };
  if (isMs(w.ready_ms) && w.ready_ms < lastDone) out.push(`RR-CHECKED ${CHECKED_KEY}.ready_ms: before the last fact resolves`);
  tree.ready = { text: checkedLine(c.ready, w, `${CHECKED_KEY}.ready`, out), at_ms: w.ready_ms };
  tree.open = { text: c.open };
  tree.min_ms = w.min_ms;
  return tree;
};
// What the schema cannot say about checked: a loading tree only, and every text is a content template.
const reEscape = (t: string): string => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const tplRe = (t: string): string => {
  let r = reEscape(t);
  for (const [slot] of SLOTS) r = r.split(reEscape(slot)).join('.+');
  return r;
};
const checkedProblems = (tree: Json, ctx: ReportCtx): string[] => {
  const out: string[] = [];
  const ch = tree.checked;
  if (tree.lifecycle !== LOADING) out.push(`RR-LIFECYCLE checked: only on a ${LOADING} tree`);
  const c = ctx.content.states?.checked;
  if (!isObj(c) || !isObj(ch)) return [...out, ...(isObj(c) ? [] : ['RR-CONTENT states.checked: missing'])];
  if (ch.skip?.text !== c.skip) out.push('RR-CONTENT checked.skip: not content states.checked.skip');
  if (ch.summary !== c.summary) out.push('RR-CONTENT checked.summary: not content states.checked.summary');
  if (ch.open?.text !== c.open) out.push('RR-CONTENT checked.open: not content states.checked.open');
  if (typeof c.ready !== 'string' || !new RegExp(`^${tplRe(c.ready)}$`).test(String(ch.ready?.text))) out.push('RR-CONTENT checked.ready: text is not its content template');
  for (const g of Array.isArray(ch.groups) ? ch.groups : []) {
    for (const l of Array.isArray(g?.lines) ? g.lines : []) {
      const t = c.lines?.[g.key]?.[l?.key];
      if (typeof t !== 'string' || !new RegExp(`^${tplRe(t)}$`).test(String(l?.text))) out.push(`RR-CONTENT checked.${String(g.key)}.${String(l?.key)}: text is not its content template`);
      if (l?.verb !== c.verbs?.[g.key]?.[l?.key]) out.push(`RR-CONTENT checked.${String(g.key)}.${String(l?.key)}: verb is not its content verb`);
    }
  }
  if (ch.dates !== undefined) {
    const alt = Object.values(isObj(c.dates) ? c.dates : {}).map((t) => tplRe(String(t))).join('|');
    if (!new RegExp(`^(?:${alt})(?: (?:${alt}))*$`).test(String(ch.dates?.text))) out.push('RR-CONTENT checked.dates: text is not its content templates');
  }
  return out;
};

// 1. The capture: the declaration plus a response produce the tree. Accumulates every problem, then throws once.
export const buildTree = (response: Json, ctx: ReportCtx): Json => {
  const out: string[] = [];
  const fields = fieldsOf(ctx.decl);
  const reason = fields.find((f) => f.name === REASON_FIELD);
  const hasStatus = 'status' in response;
  const hasLife = 'lifecycle' in response;
  if (hasStatus === hasLife) out.push(`RR-STATUS response: exactly one of status and lifecycle is required`);
  const mk = (f: Json, value: string | null, status: string, label = String(f.label)): Json =>
    ({ field: String(f.name), source: kindOf(f), label, value, status, confidence: 'none', provenance: 'none', disclosures: [] });

  if (hasLife && !hasStatus) {
    const life = ctx.content.states?.lifecycle ?? {};
    const text = life[response.lifecycle];
    if (typeof text !== 'string' || text === '') out.push(`RR-LIFECYCLE response: unknown lifecycle: ${String(response.lifecycle)}`);
    if (!reason) out.push(`RR-FIELD declaration: no field ${REASON_FIELD}`);
    const withChecked = response.lifecycle === LOADING && CHECKED_KEY in response; // MF-62: only a loading response carries it
    for (const k of Object.keys(response)) if (k !== 'lifecycle' && !INFO_KEYS.includes(k) && !(withChecked && k === CHECKED_KEY)) out.push(`RR-FIELD unexpected field on a lifecycle response: ${k}`);
    const checked = withChecked ? buildChecked(response[CHECKED_KEY], ctx, out) : undefined;
    if (out.length) throw new ReportRenderError(out);
    return { lifecycle: response.lifecycle, nodes: [mk(reason as Json, text, 'none')], ...(checked ? { checked } : {}) };
  }

  const status = response.status;
  if (hasStatus && (typeof status !== 'string' || !statusPattern(ctx.schema).test(status))) out.push(`RR-STATUS response: unknown status: ${String(status)}`);
  const keys = Object.keys(response).filter((k) => !CONTROL_KEYS.includes(k) && !INFO_KEYS.includes(k));
  const picked: Json[] = [];
  for (const k of keys) {
    const hits = fields.filter((f) => f.name === k);
    const v = response[k];
    if (k === REASON_FIELD || k === PAGE_TEXT_FIELD) out.push(`RR-FIELD ${k}: produced by the renderer, not accepted from a response`);
    else if (hits.length === 0) out.push(`RR-FIELD unknown field: ${k}`);
    else if (hits.length > 1) out.push(`RR-FIELD ambiguous field name: ${k}`);
    else if (isImageField(hits[0] as Json)) { // MF-38: the image list
      if (v !== null && !Array.isArray(v)) out.push(`RR-FIELD ${k}: value is not a list of images`);
      else { const ps = imageItemProblems(k, v ?? [], ctx); out.push(...ps); if (!ps.length) picked.push(hits[0] as Json); }
    }
    else if (!(v === null || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)))) out.push(`RR-FIELD ${k}: value is not a scalar`);
    else picked.push(hits[0] as Json);
  }
  const text = typeof status === 'string' ? registryText(ctx.content, status) : undefined;
  if (typeof status === 'string' && /^not_(permitted|evaluated):/.test(status) && text === undefined) out.push(`RR-CONTENT status: no content text for ${status}`);
  if (text !== undefined && !reason) out.push(`RR-FIELD declaration: no field ${REASON_FIELD}`);
  const captionDefault = ctx.content.illustrations?.caption_default;
  if (picked.some(isImageField) && !concrete(captionDefault)) out.push('RR-CONTENT illustrations.caption_default: missing');
  if (out.length) throw new ReportRenderError(out);

  const nodes: Json[] = [];
  const slots: Json[] = [];
  if (text !== undefined) nodes.push(mk(reason as Json, text, status));
  for (const f of fields) {
    if (!picked.includes(f)) continue;
    if (kindOf(f) === AD_KIND) { // MF-20: an ad field is a root slot, never a node; a null or empty value yields no slot (no empty box)
      const slot = slotOf(f, response[f.name], ctx);
      if (slot && slot.scenario !== undefined && /^not_(permitted|evaluated):/.test(String(status))) continue; // operator "4. D-7 yes": no scenario ad beside a card that is not permitted or not evaluated
      if (slot) slots.push(slot);
      continue;
    }
    if (isImageField(f)) { // MF-38: one image node; an empty or null list emits nothing (empty renders nothing)
      const items = (response[f.name] ?? []) as Json[];
      if (items.length) nodes.push({ field: String(f.name), source: kindOf(f), kind: IMAGE_KIND, label: String(f.label), images: items.map((x) => ({ scenario: x.scenario, asset_id: x.asset_id, alt: x.alt, caption: x.caption ?? captionDefault })) });
      continue;
    }
    const v = response[f.name];
    const value = v === null ? null : `${String(v)}${f.unit ? ` ${f.unit}` : ''}`;
    nodes.push(mk(f, value, status, status === 'at_least' ? `${f.label}, at least` : String(f.label)));
  }
  return slots.length ? { nodes, slots } : { nodes };
};

// MF-20 R-17 / R-34: what the schema cannot say about slots. A slot is declared with kind ad_slot, in the contract, carries the Sponsored label, and is never a node.
const slotProblems = (tree: Json, ctx: ReportCtx): string[] => {
  const out: string[] = [];
  const slots: Json[] = Array.isArray(tree?.slots) ? tree.slots : [];
  const nodes: Json[] = Array.isArray(tree?.nodes) ? tree.nodes : [];
  const fields = fieldsOf(ctx.decl);
  const ad = ctx.adContract;
  if (slots.length && !ad) out.push('RR-SLOT ad contract missing');
  if (tree?.lifecycle !== undefined && slots.length) out.push('RR-SLOT a lifecycle tree carries no slots');
  for (const n of nodes) if (n?.source === AD_KIND) out.push(`RR-SLOT ${String(n.field)}: an ad_slot source is never a node (R-34)`);
  const seen = new Set<string>();
  for (const sl of slots) {
    const at = `RR-SLOT ${String(sl?.field)}:`;
    if (seen.has(sl?.field)) out.push(`${at} duplicate slot`);
    seen.add(sl?.field);
    const hit = fields.find((f) => f.name === sl?.field);
    if (!hit || kindOf(hit) !== AD_KIND) out.push(`${at} field is not declared with kind ${AD_KIND}`);
    else if (String(hit.source).split(':')[1] !== sl.slot) out.push(`${at} slot ${String(sl.slot)} is not the declared member`);
    else if (sl.label !== hit.label) out.push(`${at} label is not the declared label`);
    if (ad && !(ad.slots ?? []).includes(sl?.slot)) out.push(`${at} slot ${String(sl?.slot)} is not in the ad contract`);
    const want = ad ? Object.entries(ad.scenario_fields ?? {}).find(([, name]) => name === sl?.field)?.[0] : undefined;
    if (sl?.slot === 'scenario_card' ? sl.scenario === undefined || sl.scenario !== want : sl?.scenario !== undefined) out.push(`${at} scenario ${String(sl?.scenario)} does not match the contract`);
    if (sl?.disclosure !== ctx.content.sponsored_label) out.push(`${at} disclosure is not content.sponsored_label (R-17)`);
  }
  return out;
};

// 2. The throw: schema (AJV, the one contract) plus what the schema cannot say. Accumulates, then throws once.
export const assertTree = (tree: Json, ctx: ReportCtx): void => {
  const out: string[] = [];
  const validate = validatorOf(ctx.schema);
  if (!validate(tree)) for (const e of validate.errors ?? []) out.push(`RR-SCHEMA ${e.instancePath || '/'}: ${e.message}`);
  const nodes: Json[] = Array.isArray(tree?.nodes) ? tree.nodes : [];
  const fields = fieldsOf(ctx.decl);
  const codes = disclosureCodes(ctx.content);
  const isLife = tree?.lifecycle !== undefined;
  if (isLife && nodes.length !== 1) out.push('RR-LIFECYCLE tree: a lifecycle tree carries exactly one message node');
  const seen = new Set<string>();
  if (nodes.filter((n) => n?.kind === IMAGE_KIND).length > 1) out.push(`RR-FIELD ${String(nodes.find((n) => n?.kind === IMAGE_KIND)?.field)}: at most one image node per tree`);
  nodes.forEach((n, i) => {
    if (seen.has(n?.field)) out.push(`RR-FIELD ${String(n?.field)}: duplicate node`);
    seen.add(n?.field);
    const hits = fields.filter((f) => f.name === n?.field);
    if (hits.length === 0) out.push(`RR-FIELD ${String(n?.field)}: node ${i} field is not declared`);
    else if (!hits.some((f) => kindOf(f) === n.source)) out.push(`RR-SOURCE ${String(n.field)}: node ${i} source ${String(n.source)} is not the declared kind`);
    if (n?.kind === IMAGE_KIND) { // MF-38: an image is not a reading; its own checks, and never in a lifecycle tree
      if (hits.length && !hits.some(isImageField)) out.push(`RR-FIELD ${String(n.field)}: node ${i} is an image but the field is not a content object[] field`);
      imageItemProblems(String(n.field), Array.isArray(n.images) ? n.images : [], ctx).forEach((p) => out.push(p));
      if (isLife) out.push(`RR-LIFECYCLE ${String(n.field)}: a lifecycle tree carries no image`);
      return;
    }
    const s = n?.status;
    if (typeof s === 'string' && /^not_(permitted|evaluated):/.test(s) && registryText(ctx.content, s) === undefined) out.push(`RR-CONTENT ${String(n.field)}: no content text for ${s}`);
    for (const c of Array.isArray(n?.disclosures) ? n.disclosures : []) if (!codes.includes(c)) out.push(`RR-CONTENT ${String(n.field)}: disclosure code not in disclosure_texts: ${String(c)}`);
    if (s === 'none' && !isLife) out.push(`RR-LIFECYCLE ${String(n.field)}: none outside a lifecycle tree`);
    if (isLife && s !== 'none') out.push(`RR-LIFECYCLE ${String(n?.field)}: a lifecycle node must carry none`);
    if (isLife && n?.field !== REASON_FIELD) out.push(`RR-LIFECYCLE ${String(n?.field)}: a lifecycle node must be ${REASON_FIELD}`);
  });
  slotProblems(tree, ctx).forEach((p) => out.push(p));
  if (tree?.checked !== undefined) checkedProblems(tree, ctx).forEach((p) => out.push(p)); // MF-62
  if (out.length) throw new ReportRenderError(out);
};

// 3. The projection: tree -> view. Target and scenario are checked first, then the tree.
export const viewOf = (tree: Json, pick: Json, ctx: ReportCtx): Json => {
  const row = ctx.layout.targets[pick.target];
  if (typeof pick.target !== 'string' || !Object.prototype.hasOwnProperty.call(ctx.layout.targets, pick.target) || !row) throw new ReportRenderError([`RR-TARGET ${String(pick.target)}: not a key of the layout table`]);
  const sc = pick.scenario;
  const noScenario = sc === undefined || sc === null;
  if (!noScenario && !(typeof sc === 'string' && Object.prototype.hasOwnProperty.call(ctx.lists, sc))) throw new ReportRenderError([`RR-SCENARIO ${JSON.stringify(sc)}: not a key of row-presentation.json`]);
  assertTree(tree, ctx);

  const dash = String(ctx.content.states.null_value);
  const fields = fieldsOf(ctx.decl);
  const view = (n: Json): ViewNode => {
    const s = String(n.status);
    const set = n.confidence !== 'none' || n.provenance !== 'none';
    return {
      field: n.field, label: n.label, text: n.value === null ? dash : n.value, status: s,
      badge: s.startsWith('not_') ? (s.split(':')[0] as string).replace(/_/g, ' ') : null,
      confidence: n.confidence, provenance: n.provenance,
      disclosures: (n.disclosures as string[]).map((c) => String(ctx.content.disclosure_texts[c].template ?? c)),
      showMeta: row.meta === 'always' || set, unavailable: false,
    };
  };
  const all: Json[] = (tree.nodes as Json[]).filter((n) => n.kind !== IMAGE_KIND);
  const reasonNode = all.find((n) => n.field === REASON_FIELD);
  const rest = all.filter((n) => n !== reasonNode);
  const listed: string[] = noScenario ? [] : (ctx.lists[sc as string] as string[]);
  const headline: ViewNode[] = listed.map((id) => {
    const n = rest.find((x) => x.field === id);
    if (n) return view(n);
    const f = fields.find((x) => x.name === id);
    return { field: id, label: String(f?.label ?? id), text: dash, status: 'none', badge: null, confidence: 'none', provenance: 'none', disclosures: [], showMeta: false, unavailable: true };
  });
  const detail = rest.filter((n) => !listed.includes(n.field)).map(view);
  const slots: ViewSlot[] = ((tree.slots ?? []) as Json[]).filter((x) => x.scenario === undefined || x.scenario === sc).map((x) => ({ field: x.field, slot: x.slot, ...(x.scenario !== undefined ? { scenario: x.scenario } : {}), label: x.label, text: x.value, disclosure: x.disclosure, placement: x.scenario !== undefined ? 'beside_card' : 'after_card' }));
  // MF-38: the picked option's one image, the same on every target; src only from the injected URL map (never from the tree).
  const imageNode = (tree.nodes as Json[]).find((n) => n.kind === IMAGE_KIND);
  const item = noScenario ? undefined : (imageNode?.images as Json[] | undefined)?.find((x) => x.scenario === sc);
  const src = item ? pick.urls?.[item.asset_id] : undefined;
  const out: Json = { target: pick.target, layout: row, headline, detail, slots, image_state: !item ? 'none' : typeof src === 'string' && src !== '' ? 'shown' : 'no_url' };
  if (item && out.image_state === 'shown') out.image = { field: imageNode?.field, label: imageNode?.label, asset_id: item.asset_id, alt: item.alt, caption: item.caption, src } as ViewImage;
  if (tree.lifecycle !== undefined) out.lifecycle = tree.lifecycle;
  if (reasonNode) out.reason = view(reasonNode);
  // MF-62: pace and the skip only on details: collapsed rows (mobile, web); admin and pdf draw every line at once and no skip (the D-K precedent:
  // data, not a target name). The skip href is the host's (pick.reportHref); without one no skip is drawn, never an inert control.
  if (tree.checked !== undefined) {
    const paced = row.details === 'collapsed';
    const href = typeof pick.reportHref === 'string' && /^\/(?![/\\])/.test(pick.reportHref) ? pick.reportHref : null; // same-origin path only (OUTPUT panel N-7)
    out.checked = { ...tree.checked, paced, href: paced ? href : null };
  }
  return out;
};

// ---- MF-57: the v21 report PAGE (approved mock v21; decision D-A (a), held for the operator) ------------------------------------------------
// A page tree is built from the page table (ctx.page = scripts/surfaces/_schema/report-page.json) and a page response
// { page, synthetic?, values: { <part key>: <server-formatted string> | null } }. Every shown text is a value the producer sent (R17, FE-05: a string,
// never a number, shown as sent), a content text (report-presentation.json `page`) or a ruled pending text (Q-G4 a: never a value).
// The contract is report-page.schema.json (it reuses the node contract's slot by $ref). Accumulates every problem, then throws once.
export interface PagePart { role: string; brief: string; kind: 'value' | 'content' | 'pending'; field?: string; key?: string; rule?: string; content?: string; pending?: string; text: string }
export interface PageSection { kind: string; id: string; brief?: string; scenario?: string; ad?: ReportSlot; parts: PagePart[] }
export interface PageTree { page: string; sections: PageSection[] }
// MF-38 follow-up (operator 2026-11-11, "y to all as built"): `images` maps a scenario key to that option's one image (the MF-38 view image, its URL
// injected, never in the tree). The server read that signs image URLs is owed (MF-44 / MF-22), so pageViewOf sets none yet: the ruled empty state.
export interface PageView { target: string; layout: Json; sections: PageSection[]; images?: Record<string, ViewImage> }

const AD_KIND_SECTION = 'ad';
const PAGE_RESPONSE_KEYS = ['page', 'synthetic', 'values', 'hidden', 'not_evaluated'];
const pageValidators = new WeakMap<object, any>();
const pageValidatorOf = (pageSchema: Json, treeSchema: Json): any => {
  let v = pageValidators.get(pageSchema);
  if (!v) {
    const ajv = new Ajv2020({ allErrors: true, strict: true }) as any;
    ajv.addSchema(treeSchema);
    v = ajv.compile(pageSchema);
    pageValidators.set(pageSchema, v);
  }
  return v;
};
const pageTexts = (ctx: ReportCtx): Json => (ctx.content.page ?? {}) as Json;
const oneField = (fields: Json[], name: unknown, at: string, out: string[]): Json | undefined => {
  const hits = fields.filter((f) => f.name === name);
  if (hits.length === 0) out.push(`RR-FIELD ${String(name)}: not declared (${at})`);
  else if (hits.length > 1) out.push(`RR-FIELD ${String(name)}: ambiguous field name (${at})`);
  return hits.length === 1 ? hits[0] : undefined;
};

export const buildPage = (response: Json, ctx: ReportCtx): Json => {
  const out: string[] = [];
  const T = ctx.page as Json;
  const texts = pageTexts(ctx);
  const fields = fieldsOf(ctx.decl);
  const dash = String(ctx.content.states.null_value);
  if (response?.page !== T.layout) out.push(`RR-PAGE response: page is not ${String(T.layout)}`);
  for (const k of Object.keys(response ?? {})) if (!PAGE_RESPONSE_KEYS.includes(k)) out.push(`RR-PAGE response: unexpected key ${k}`);
  const values: Json = response?.values !== null && typeof response?.values === 'object' ? response.values : {};
  if (values !== response?.values) out.push('RR-PAGE response: values is not an object');
  const keys = new Set<string>();
  const built: [Json, Json | null][] = []; // [table section, built section or null], in table order
  for (const s of T.sections as Json[]) {
    const vocab: unknown = T.kinds?.[s.kind];
    if (!Array.isArray(vocab)) out.push(`RR-PAGE ${String(s.id)}: unknown section kind ${String(s.kind)}`);
    if (s.kind === AD_KIND_SECTION) { // MF-20 path: a declared ad_slot field; a null or empty creative yields no section (no empty box)
      const f = oneField(fields, s.field, String(s.id), out);
      if (f && kindOf(f) !== AD_KIND) out.push(`RR-SLOT ${String(s.field)}: field is not declared with kind ${AD_KIND}`);
      keys.add(String(s.field));
      const v = values[s.field];
      if (!(v === undefined || v === null || typeof v === 'string')) out.push(`RR-PAGE ${String(s.field)}: value is not a string`);
      const slot = f && kindOf(f) === AD_KIND && typeof v === 'string' ? slotOf(f, v, ctx) : null;
      built.push([s, slot ? { kind: s.kind, id: s.id, brief: s.brief, ad: slot, parts: [] } : null]);
      continue;
    }
    const parts = (s.parts as Json[]).map((p): Json => {
      const at = `${String(s.id)}.${String(p.role)}`;
      if (Array.isArray(vocab) && !vocab.includes(p.role)) out.push(`RR-PAGE ${at}: role not in the ${String(s.kind)} vocabulary`);
      const base = { role: p.role, brief: p.brief };
      if (p.field !== undefined) {
        const f = oneField(fields, p.field, at, out);
        if (f && kindOf(f) === AD_KIND) out.push(`RR-FIELD ${String(p.field)}: an ad_slot field is a section, never a part (R-34)`);
        if (typeof p.key !== 'string' || p.key === '') out.push(`RR-PAGE ${at}: a value part has no key`);
        else if (keys.has(p.key)) out.push(`RR-PAGE ${p.key}: duplicate key`);
        keys.add(String(p.key));
        const v = values[p.key];
        if (!(v === undefined || v === null || typeof v === 'string')) out.push(`RR-PAGE ${String(p.key)}: value is not a string (the server formats, R17)`);
        return { ...base, kind: 'value', field: p.field, key: p.key, rule: p.rule, text: typeof v === 'string' && v !== '' ? v : dash };
      }
      if (p.key !== undefined) { out.push(`RR-PAGE ${String(p.key)}: a ${p.content !== undefined ? 'content' : 'pending'} part takes no value (Q-G4 a)`); keys.add(String(p.key)); }
      if (p.content !== undefined) {
        const t = texts[p.content];
        if (typeof t !== 'string' || t === '') out.push(`RR-CONTENT ${String(p.content)}: no page text`);
        return { ...base, kind: 'content', content: p.content, text: String(t) };
      }
      const key = T.pending_texts?.[p.pending];
      const t = typeof key === 'string' ? texts[key] : undefined;
      if (typeof t !== 'string' || t === '') out.push(`RR-CONTENT ${at}: no pending text for ${String(p.pending)}`);
      return { ...base, kind: 'pending', pending: p.pending, text: String(t) };
    });
    built.push([s, { kind: s.kind, id: s.id, ...(s.scenario !== undefined ? { scenario: s.scenario } : {}), parts }]);
  }
  for (const k of Object.keys(values)) if (!keys.has(k)) out.push(`RR-PAGE ${k}: not a key of the page table`);
  // Which options show is the server's: `hidden` (option section ids the server hides: report-presentation.json states.hidden) and `not_evaluated`
  // (option ids shown with a not_evaluated result). A hidden option is left out. A section anchored `after_option: N` follows the N-th SHOWN option,
  // or the last shown option when fewer show: positions follow the visible cards (brief v4 review). A scenario ad (its slot names a scenario,
  // ad-contract.json scenario_fields) follows ITS OWN option card and is left out when that option is hidden or not_evaluated (MF-20 D-7, operator
  // "4. D-7 yes": no scenario ad beside a card that is not permitted or not evaluated). Nothing anchored is ever dropped silently.
  const optionIds = (T.sections as Json[]).filter((x) => x.kind === 'option').map((x) => x.id);
  const listOf = (k: string): unknown[] => {
    const v = response?.[k];
    if (v !== undefined && !Array.isArray(v)) out.push(`RR-PAGE response: ${k} is not a list`);
    const xs: unknown[] = Array.isArray(v) ? v : [];
    for (const h of xs) if (!optionIds.includes(h)) out.push(`RR-PAGE ${k} ${String(h)}: not an option section id`);
    return xs;
  };
  const hidden = listOf('hidden');
  const notEvaluated = listOf('not_evaluated');
  if (out.length) throw new ReportRenderError(out);
  const scenarioOf = (b: [Json, Json | null]): unknown => b[1]?.ad?.scenario;
  let lastOption = -1;
  built.forEach(([t], i) => { if (t.kind === 'option') lastOption = i; });
  const anchored = built.filter(([t]) => t.after_option !== undefined);
  const placed = new Set<[Json, Json | null]>();
  const ordered: Json[] = [];
  const shown: string[] = [];
  const place = (b: [Json, Json | null]): void => { placed.add(b); if (b[1]) ordered.push(b[1]); };
  built.forEach((b, i) => {
    const [t, x] = b;
    if (t.after_option !== undefined || scenarioOf(b) !== undefined) return;
    if (t.kind === 'option') {
      if (hidden.includes(t.id)) return;
      if (x) ordered.push(x);
      shown.push(t.id);
      for (const a of anchored) if (a[0].after_option === shown.length) place(a);
      if (!notEvaluated.includes(t.id)) for (const a of built) if (scenarioOf(a) === t.scenario) place(a);
      return;
    }
    if (i > lastOption) for (const a of anchored) if (!placed.has(a)) place(a);
    if (x) ordered.push(x);
  });
  for (const a of anchored) if (!placed.has(a)) place(a);
  return { page: T.layout, sections: ordered };
};

// The throw: the page schema (AJV) plus what it cannot say. Accumulates, then throws once.
export const assertPage = (tree: Json, ctx: ReportCtx): void => {
  const out: string[] = [];
  const validate = pageValidatorOf(ctx.pageSchema, ctx.schema);
  if (!validate(tree)) for (const e of validate.errors ?? []) out.push(`RR-SCHEMA ${e.instancePath || '/'}: ${e.message}`);
  const T = ctx.page as Json;
  const texts = pageTexts(ctx);
  const pend = new Set(Object.values(T.pending_texts ?? {}).map((k) => texts[k as string]));
  const fields = fieldsOf(ctx.decl);
  const ad = ctx.adContract;
  for (const s of (Array.isArray(tree?.sections) ? tree.sections : []) as Json[]) {
    const vocab: unknown = T.kinds?.[s?.kind];
    if (s?.kind === AD_KIND_SECTION) {
      const sl = s.ad as Json | undefined;
      const f = sl ? fields.find((x) => x.name === sl.field) : undefined;
      if (!sl || !f || kindOf(f) !== AD_KIND) out.push(`RR-SLOT ${String(s?.id)}: an ad section carries one declared ${AD_KIND} slot`);
      if (sl && !(ad?.slots ?? []).includes(sl.slot)) out.push(`RR-SLOT ${String(sl.field)}: slot ${String(sl.slot)} is not in the ad contract`);
      if (sl && sl.disclosure !== ctx.content.sponsored_label) out.push(`RR-SLOT ${String(sl.field)}: disclosure is not content.sponsored_label (R-17)`);
      if ((s.parts ?? []).length) out.push(`RR-SLOT ${String(s.id)}: an ad section has no parts`);
      continue;
    }
    if (s?.ad !== undefined) out.push(`RR-SLOT ${String(s?.id)}: an ad is never inside a ${String(s?.kind)} section (R-34)`);
    for (const p of (Array.isArray(s?.parts) ? s.parts : []) as Json[]) {
      const at = `${String(s?.id)}.${String(p?.role)}`;
      if (Array.isArray(vocab) && !vocab.includes(p?.role)) out.push(`RR-PAGE ${at}: role not in the ${String(s?.kind)} vocabulary`);
      if (p?.kind === 'value' && fields.filter((x) => x.name === p.field).length !== 1) out.push(`RR-FIELD ${String(p?.field)}: not one declared field (${at})`);
      if (p?.kind === 'pending' && !pend.has(p.text)) out.push(`RR-CONTENT ${at}: a pending part shows only a ruled pending text (Q-G4 a)`);
    }
  }
  if (out.length) throw new ReportRenderError(out);
};

// The projection: the page tree plus the target's layout row. The target is checked first, then the tree.
// D-K (operator 2026-11-11, "y to all as built"): a page-table section that names `details` is drawn only on layout rows whose `details` equals it
// (the lot-size box and the Add lot size sheet: collapsed rows only, so admin and pdf print no inert input). Data, not a target name.
export const pageViewOf = (tree: Json, pick: Json, ctx: ReportCtx): Json => {
  const row = ctx.layout.targets[pick.target];
  if (typeof pick.target !== 'string' || !Object.prototype.hasOwnProperty.call(ctx.layout.targets, pick.target) || !row) throw new ReportRenderError([`RR-TARGET ${String(pick.target)}: not a key of the layout table`]);
  assertPage(tree, ctx);
  const only = new Map<string, unknown>(((ctx.page as Json).sections as Json[]).filter((s) => s.details !== undefined).map((s) => [String(s.id), s.details]));
  const bad = [...only].filter(([, d]) => !(ctx.layout.closed?.details ?? []).includes(d)).map(([id, d]) => `RR-PAGE ${id}: details ${String(d)} is not a layout details value`);
  if (bad.length) throw new ReportRenderError(bad);
  return { target: pick.target, layout: row, sections: (tree.sections as Json[]).filter((s) => !only.has(s.id) || only.get(s.id) === row.details) };
};
