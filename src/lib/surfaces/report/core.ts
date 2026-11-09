// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.3 (closed status list), 11a.6 (headline), 11a.7 (dated note 2026-11-09, MF-14), 5.3 (the server projects),
//            docs/specs/02-web-admin/128_surface_standard_policy.md Rule 16 (no maths), Rule 17 (honest display),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-24 (throws on an unknown field or status), FE-29 (the one node contract).
//
// MF-20 (Spec 126 11a.10, FE-22, FE-23; Spec 128 R-17, R-34): the one closed source kind `ad_slot` is routed to the root `slots[]`, never to `nodes[]`.
// Which scenario a slot sits beside is DATA (the ad contract's scenario_fields map); no field is named here.
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
export interface ReportTree { lifecycle?: string; nodes: ReportNode[]; slots?: ReportSlot[] }
export interface ViewSlot { field: string; slot: string; scenario?: string; label: string; text: string; disclosure: string; placement: 'beside_card' | 'after_card' }
export interface ViewNode { field: string; label: string; text: string; status: string; badge: string | null; confidence: string; provenance: string; disclosures: string[]; showMeta: boolean; unavailable: boolean }
export interface ReportView { target: string; layout: Json; lifecycle?: string; reason?: ViewNode; headline: ViewNode[]; detail: ViewNode[]; slots: ViewSlot[] }

// Control keys of a response pick the tree kind; information keys ride along and are never emitted (MF-14 D-11, closed list).
const CONTROL_KEYS = ['status', 'lifecycle'];
const INFO_KEYS = ['synthetic', 'roof_form'];
// The one field the renderer itself produces: the plain-words reason (or the lifecycle message). Declared as a content field.
const REASON_FIELD = 'status_text';

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
    for (const k of Object.keys(response)) if (k !== 'lifecycle' && !INFO_KEYS.includes(k)) out.push(`RR-FIELD unexpected field on a lifecycle response: ${k}`);
    if (out.length) throw new ReportRenderError(out);
    return { lifecycle: response.lifecycle, nodes: [mk(reason as Json, text, 'none')] };
  }

  const status = response.status;
  if (hasStatus && (typeof status !== 'string' || !statusPattern(ctx.schema).test(status))) out.push(`RR-STATUS response: unknown status: ${String(status)}`);
  const keys = Object.keys(response).filter((k) => !CONTROL_KEYS.includes(k) && !INFO_KEYS.includes(k));
  const picked: Json[] = [];
  for (const k of keys) {
    const hits = fields.filter((f) => f.name === k);
    const v = response[k];
    if (k === REASON_FIELD) out.push(`RR-FIELD ${k}: produced by the renderer, not accepted from a response`);
    else if (hits.length === 0) out.push(`RR-FIELD unknown field: ${k}`);
    else if (hits.length > 1) out.push(`RR-FIELD ambiguous field name: ${k}`);
    else if (!(v === null || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)))) out.push(`RR-FIELD ${k}: value is not a scalar`);
    else picked.push(hits[0] as Json);
  }
  const text = typeof status === 'string' ? registryText(ctx.content, status) : undefined;
  if (typeof status === 'string' && /^not_(permitted|evaluated):/.test(status) && text === undefined) out.push(`RR-CONTENT status: no content text for ${status}`);
  if (text !== undefined && !reason) out.push(`RR-FIELD declaration: no field ${REASON_FIELD}`);
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
  nodes.forEach((n, i) => {
    if (seen.has(n?.field)) out.push(`RR-FIELD ${String(n?.field)}: duplicate node`);
    seen.add(n?.field);
    const hits = fields.filter((f) => f.name === n?.field);
    if (hits.length === 0) out.push(`RR-FIELD ${String(n?.field)}: node ${i} field is not declared`);
    else if (!hits.some((f) => kindOf(f) === n.source)) out.push(`RR-SOURCE ${String(n.field)}: node ${i} source ${String(n.source)} is not the declared kind`);
    const s = n?.status;
    if (typeof s === 'string' && /^not_(permitted|evaluated):/.test(s) && registryText(ctx.content, s) === undefined) out.push(`RR-CONTENT ${String(n.field)}: no content text for ${s}`);
    for (const c of Array.isArray(n?.disclosures) ? n.disclosures : []) if (!codes.includes(c)) out.push(`RR-CONTENT ${String(n.field)}: disclosure code not in disclosure_texts: ${String(c)}`);
    if (s === 'none' && !isLife) out.push(`RR-LIFECYCLE ${String(n.field)}: none outside a lifecycle tree`);
    if (isLife && s !== 'none') out.push(`RR-LIFECYCLE ${String(n?.field)}: a lifecycle node must carry none`);
    if (isLife && n?.field !== REASON_FIELD) out.push(`RR-LIFECYCLE ${String(n?.field)}: a lifecycle node must be ${REASON_FIELD}`);
  });
  slotProblems(tree, ctx).forEach((p) => out.push(p));
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
  const all: Json[] = tree.nodes;
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
  const out: Json = { target: pick.target, layout: row, headline, detail, slots };
  if (tree.lifecycle !== undefined) out.lifecycle = tree.lifecycle;
  if (reasonNode) out.reason = view(reasonNode);
  return out;
};
