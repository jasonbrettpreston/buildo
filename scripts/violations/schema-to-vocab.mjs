#!/usr/bin/env node
/**
 * Vocabulary generator — renders the step contract FROM the canonical schema.
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md
 *
 * WHY THIS EXISTS. Operator ruling R2 (2026-08-23) makes
 * `scripts/steps/_schema/step.schema.json` THE CANONICAL VOCABULARY. Prose is
 * downstream of it, never the other way round: `122-vocabulary.md` and Spec
 * 122's menu tables are GENERATED here. `extract-vocab.mjs` — which extracted
 * the menus out of Spec 120 §3.2 prose and covered 8 of 17 categories — is
 * demoted to a one-time migration tool by the same ruling. Its conflict list
 * seeded rulings V1-V6; it is not extended and not re-run as a gate.
 *
 * WHAT MAKES IT MORE THAN A PRETTY-PRINTER. Spec 120 §12b.5 records that the
 * `!` marker ("extending this vocabulary is a runner change") is prose unless
 * the vocabulary is generated and drift-checked. This generator is the other
 * half of that: it REFUSES TO EMIT when the schema itself has gone soft —
 * a category declared but never defined, a category missing from `required`
 * (omission must be a build failure), a `x-banned` value that is not actually
 * in its sibling enum (a decorative ban is laundering), a `checks` node that
 * would admit "none", a BLOCKING menu-completeness finding that the rendered
 * doc would silently drop, a gap downgraded to EXPRESSIBLE with no declaration
 * behind it, or a banned-for-new rule with no evaluable predicate.
 *
 * TOOLING GATE (Spec 121 §12b.6): --self-test proves every one of those
 * refusals FIRES against a known-bad fixture, plus a negative control on a
 * clean one. Eleven measured green-because-it-never-looked instances is why.
 *
 * Usage:
 *   node scripts/violations/schema-to-vocab.mjs                  # print
 *   node scripts/violations/schema-to-vocab.mjs docs/reports/generated/122-vocabulary.md
 *   node scripts/violations/schema-to-vocab.mjs --check <file>   # drift guard, no write
 *   node scripts/violations/schema-to-vocab.mjs --json
 *   node scripts/violations/schema-to-vocab.mjs --self-test
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMA_PATH = path.join(ROOT, 'scripts/steps/_schema/step.schema.json');
const DEFAULT_OUT = path.join(ROOT, 'docs/reports/generated/122-vocabulary.md');
const MAX_DEPTH = 7;

// ---------------------------------------------------------------------------
// schema walking
// ---------------------------------------------------------------------------

function deref(schema, node) {
  let n = node;
  let hops = 0;
  while (n && typeof n.$ref === 'string' && hops < 10) {
    const key = n.$ref.replace('#/definitions/', '');
    const target = (schema.definitions || {})[key];
    if (!target) return n;
    n = { ...target, ...Object.fromEntries(Object.entries(n).filter(([k]) => k !== '$ref')) };
    hops += 1;
  }
  return n;
}

const tick = (v) => `\`${typeof v === 'string' ? v : JSON.stringify(v)}\``;

/** One-line human menu for a node. */
function menuOf(schema, rawNode, depth = 0) {
  const n = deref(schema, rawNode);
  if (!n || typeof n !== 'object') return 'OPEN';
  if (Object.keys(n).filter((k) => !k.startsWith('x-') && k !== 'description').length === 0) return '**OPEN** — domain knowledge';
  if (Array.isArray(n.enum)) return n.enum.map(tick).join(' · ');
  if (n.const !== undefined) return tick(n.const);
  if (Array.isArray(n.anyOf) && depth < MAX_DEPTH) {
    return n.anyOf.map((b) => menuOf(schema, b, depth + 1)).join(' \\| ');
  }
  if (n.type === 'array') {
    const item = n.items ? menuOf(schema, n.items, depth + 1) : 'any';
    const min = n.minItems ? ` (min ${n.minItems})` : '';
    return `list${min} of ${item}`;
  }
  if (n.type === 'object') {
    const props = Object.keys(n.properties || {});
    if (props.length) return `object {${props.join(', ')}}`;
    if (n.additionalProperties && typeof n.additionalProperties === 'object') {
      return `map of ${menuOf(schema, n.additionalProperties, depth + 1)}`;
    }
    return 'object';
  }
  if (n.type === 'integer' || n.type === 'number') {
    const b = [];
    if (n.minimum !== undefined) b.push(`>= ${n.minimum}`);
    if (n.maximum !== undefined) b.push(`<= ${n.maximum}`);
    return `${n.type}${b.length ? ` ${b.join(', ')}` : ''}`;
  }
  if (n.type === 'boolean') return '`true` · `false`';
  if (n.type === 'string') return n.pattern ? `string \`${n.pattern}\`` : 'string';
  return 'OPEN';
}

/** Markers on a node, including inside anyOf branches. */
function markersOf(schema, rawNode, isRequired) {
  const out = new Set();
  if (isRequired) out.add('†');
  const visit = (raw, d) => {
    const n = deref(schema, raw);
    if (!n || typeof n !== 'object' || d > MAX_DEPTH) return;
    if (n['x-frozen']) out.add('!');
    if (n['x-derived']) out.add('~');
    if (Array.isArray(n.anyOf)) n.anyOf.forEach((b) => visit(b, d + 1));
    if (Array.isArray(n.allOf)) n.allOf.forEach((b) => visit(b, d + 1));
  };
  visit(rawNode, 0);
  return [...out];
}

function bannedOf(schema, rawNode) {
  const out = [];
  const visit = (raw, d) => {
    const n = deref(schema, raw);
    if (!n || typeof n !== 'object' || d > MAX_DEPTH) return;
    if (Array.isArray(n['x-banned'])) out.push(...n['x-banned']);
    if (Array.isArray(n.anyOf)) n.anyOf.forEach((b) => visit(b, d + 1));
  };
  visit(rawNode, 0);
  return [...new Set(out)];
}

/** Every declarable field, as a flat row list, per category. */
export function collectRows(schema) {
  const rows = [];

  const walk = (rawNode, dotted, category, depth) => {
    if (depth > MAX_DEPTH) return;
    const n = deref(schema, rawNode);
    if (!n || typeof n !== 'object') return;

    const objectBranches = [n, ...(Array.isArray(n.anyOf) ? n.anyOf.map((b) => deref(schema, b)) : [])];

    for (const branch of objectBranches) {
      if (!branch || typeof branch !== 'object') continue;
      if (branch.type === 'array' && branch.items) {
        walk(branch.items, `${dotted}[]`, category, depth + 1);
        continue;
      }
      if (!branch.properties) continue;
      const req = new Set(branch.required || []);
      for (const [name, child] of Object.entries(branch.properties)) {
        const p = dotted ? `${dotted}.${name}` : name;
        const c = deref(schema, child);
        rows.push({
          category,
          field: p,
          menu: menuOf(schema, child),
          markers: markersOf(schema, child, req.has(name)),
          banned: bannedOf(schema, child),
          description: (c && c.description) || '',
        });
        walk(child, p, category, depth + 1);
      }
    }
  };

  for (const cat of schema['x-categories']) {
    const node = (schema.properties || {})[cat];
    if (!node) continue;
    walk(node, '', cat, 0);
  }
  return rows;
}

/** Archetype required-field profiles, read out of the root allOf. */
export function collectProfiles(schema) {
  return (schema.allOf || [])
    .filter((b) => b['x-profile'])
    .map((b) => {
      const arch = b.if?.properties?.identity?.properties?.archetype;
      const forced = Object.entries(b.then?.properties || {}).map(([k, v]) => {
        if (v.const !== undefined) return `${k} = ${tick(v.const)}`;
        if (v.type === 'object' && v.properties) {
          const inner = Object.entries(v.properties).map(([ik, iv]) => {
            if (iv.minItems) return `${k}.${ik} min ${iv.minItems}`;
            if (iv.not && iv.not.const !== undefined) return `${k}.${ik} != ${tick(iv.not.const)}`;
            if (iv.enum) return `${k}.${ik} in ${iv.enum.map(tick).join('/')}`;
            return `${k}.${ik} declared`;
          });
          return inner.length ? inner.join(' · ') : `${k} is an object`;
        }
        if (v.type) return `${k} is ${v.type}`;
        return k;
      });
      // Nested conditionals — e.g. ENRICHER's claim #54, which only bites when
      // staleness.scope is a lineage predicate. Rendering only the outer `then`
      // would drop the marquee rule from the generated contract.
      for (const inner of b.then?.allOf || []) {
        const cond = Object.entries(inner.if?.properties || {})
          .flatMap(([ck, cv]) => Object.keys(cv.properties || {}).map((f) => `${ck}.${f}`))
          .join(' + ');
        const eff = Object.entries(inner.then?.properties || {})
          .flatMap(([ek, ev]) => Object.entries(ev.properties || {}).map(([ik, iv]) => `${ek}.${ik}${iv.minItems ? ` min ${iv.minItems}` : ''}`))
          .join(' · ');
        if (cond && eff) forced.push(`**if ${cond} is a predicate ⇒ ${eff}**`);
      }
      return {
        archetype: arch?.const || (arch?.enum || []).join(' / ') || '?',
        forces: forced,
        note: b['x-profile'],
      };
    });
}

// ---------------------------------------------------------------------------
// the refusal gate
// ---------------------------------------------------------------------------

export function auditSchema(schema) {
  const findings = [];
  const cats = schema['x-categories'] || [];
  const rootRequired = new Set(schema.required || []);

  if (!cats.length) findings.push('x-categories is empty — the category list IS the contract.');

  for (const cat of cats) {
    if (!(schema.properties || {})[cat]) {
      findings.push(`category "${cat}" is declared in x-categories but has no properties entry — it would vanish from the rendered contract.`);
      continue;
    }
    if (!rootRequired.has(cat)) {
      findings.push(`category "${cat}" is not in the root required list — omission must be a build failure, not a default.`);
    }
  }

  // A decorative ban is laundering: x-banned must name values the enum admits.
  const visit = (raw, where, depth) => {
    const n = deref(schema, raw);
    if (!n || typeof n !== 'object' || depth > MAX_DEPTH) return;
    if (Array.isArray(n['x-banned'])) {
      const allowed = new Set(n.enum || []);
      for (const b of n['x-banned']) {
        if (!allowed.has(b)) findings.push(`x-banned value "${b}" at ${where} is not in that node's enum — a ban on a value nothing can declare enforces nothing.`);
      }
    }
    for (const key of ['anyOf', 'allOf', 'oneOf']) {
      if (Array.isArray(n[key])) n[key].forEach((b, i) => visit(b, `${where}.${key}[${i}]`, depth + 1));
    }
    if (n.properties) for (const [k, v] of Object.entries(n.properties)) visit(v, `${where}.${k}`, depth + 1);
    if (n.items) visit(n.items, `${where}[]`, depth + 1);
  };
  for (const [k, v] of Object.entries(schema.properties || {})) visit(v, k, 0);
  for (const [k, v] of Object.entries(schema.definitions || {})) visit(v, `definitions.${k}`, 0);

  // checks is the one category that may never be "none" (claim #7).
  const checks = (schema.properties || {}).checks;
  if (!checks || checks.type !== 'array' || !(checks.minItems >= 1)) {
    findings.push('checks must be an array with minItems >= 1 — it is the ONE category that may never be "none".');
  }

  // A BLOCKING menu-completeness finding may never be dropped from the doc.
  const mc = schema['x-menu-completeness'];
  if (mc && String(mc.status || '').startsWith('BLOCKING') && !(mc.gaps || []).length) {
    findings.push('x-menu-completeness is BLOCKING but lists no gaps — the finding would render as an empty section.');
  }
  // ...and a gap may not be downgraded to EXPRESSIBLE without the declaration
  // that makes it so. "Resolved" with nothing behind it is the same laundering
  // as a checker tuned until it stops firing.
  for (const g of mc?.gaps || []) {
    if (String(g.status || '').startsWith('EXPRESSIBLE') && !g.now_expressible_as) {
      findings.push(`gap ${g.id} is marked EXPRESSIBLE but names no declaration that expresses it.`);
    }
  }

  // The banned-for-new registry must carry something enforceable.
  const bfn = schema['x-banned-for-new'];
  if (bfn) {
    for (const [k, v] of Object.entries(bfn.values || {})) {
      if (!Array.isArray(v) || !v.length) findings.push(`x-banned-for-new.values["${k}"] is empty — a ban with no values enforces nothing.`);
    }
    for (const r of bfn.rules || []) {
      if (!r.id || !r.banned_when) findings.push(`x-banned-for-new rule ${JSON.stringify(r.id ?? r)} has no banned_when predicate — an unevaluable rule is prose.`);
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// self-test — every refusal proven to FIRE, plus a negative control
// ---------------------------------------------------------------------------

const CLEAN_FIXTURE = {
  'x-categories': ['identity', 'checks'],
  required: ['identity', 'checks'],
  'x-menu-completeness': { status: 'CLOSED', gaps: [] },
  properties: {
    identity: {
      type: 'object',
      required: ['archetype'],
      properties: {
        archetype: { enum: ['INGESTOR', 'ASSERT'], 'x-frozen': true },
        replay: { enum: ['idempotent_upsert', 'append_unsafe'], 'x-banned': ['append_unsafe'] },
        fingerprint: { const: 'derived', 'x-derived': true },
      },
    },
    checks: { type: 'array', minItems: 1, items: { type: 'object', properties: { id: { type: 'string' } } } },
  },
};

function selfTest() {
  const fail = [];
  const kb = (mutate) => {
    const f = JSON.parse(JSON.stringify(CLEAN_FIXTURE));
    mutate(f);
    return auditSchema(f);
  };

  // Negative control first — a checker that fires on everything is as useless
  // as one that never fires.
  if (auditSchema(CLEAN_FIXTURE).length) fail.push('negative control: a clean schema reported findings');

  const rows = collectRows(CLEAN_FIXTURE);
  const arch = rows.find((r) => r.field === 'archetype');
  if (!arch || !arch.markers.includes('†') || !arch.markers.includes('!')) fail.push('markers † / ! not derived for a required frozen enum');
  const replay = rows.find((r) => r.field === 'replay');
  if (!replay || !replay.banned.includes('append_unsafe')) fail.push('x-banned not captured into a row');
  const fp = rows.find((r) => r.field === 'fingerprint');
  if (!fp || !fp.markers.includes('~')) fail.push('~ derived marker not captured');
  if (!rows.some((r) => r.category === 'checks' && r.field === '[].id')) fail.push('array item fields not walked');

  // KB1 — a category declared but never defined would silently vanish.
  if (!kb((f) => { f['x-categories'].push('ghost'); }).some((x) => x.includes('ghost'))) {
    fail.push('KB1 did not fire: undefined category');
  }
  // KB2 — a ban on a value the enum does not admit enforces nothing.
  if (!kb((f) => { f.properties.identity.properties.replay['x-banned'] = ['never_declared']; }).some((x) => x.includes('never_declared'))) {
    fail.push('KB2 did not fire: decorative x-banned value');
  }
  // KB3 — omission must be a build failure.
  if (!kb((f) => { f.required = ['identity']; }).some((x) => x.includes('required list'))) {
    fail.push('KB3 did not fire: category missing from required');
  }
  // KB4 — checks admitting "none".
  if (!kb((f) => { f.properties.checks = { anyOf: [{ const: 'none' }] }; }).some((x) => x.includes('never be "none"'))) {
    fail.push('KB4 did not fire: checks allowed to be "none"');
  }
  // KB5 — a BLOCKING gap with nothing behind it.
  if (!kb((f) => { f['x-menu-completeness'] = { status: 'BLOCKING — UNRESOLVED', gaps: [] }; }).some((x) => x.includes('renders as an empty section') || x.includes('empty section'))) {
    fail.push('KB5 did not fire: BLOCKING status with no gaps');
  }

  // KB6 — a gap downgraded to EXPRESSIBLE with nothing behind it.
  if (!kb((f) => { f['x-menu-completeness'] = { status: 'RESOLVED', gaps: [{ id: 'GAP-X', status: 'EXPRESSIBLE' }] }; }).some((x) => x.includes('GAP-X'))) {
    fail.push('KB6 did not fire: gap marked EXPRESSIBLE with no declaration behind it');
  }
  // KB7 — an unevaluable banned-for-new rule.
  if (!kb((f) => { f['x-banned-for-new'] = { values: {}, rules: [{ id: 'ghost_rule' }] }; }).some((x) => x.includes('ghost_rule'))) {
    fail.push('KB7 did not fire: banned-for-new rule with no banned_when predicate');
  }

  if (fail.length) {
    console.error('SELF-TEST FAILED:');
    for (const x of fail) console.error(`  - ${x}`);
    return false;
  }
  console.log('SELF-TEST PASSED — 7 known-bad fixtures fired, 1 negative control clean, 4 marker assertions.');
  return true;
}

// ---------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------

export function render(schema, rows) {
  const o = [];
  const cats = schema['x-categories'];
  o.push('<!-- GENERATED by scripts/violations/schema-to-vocab.mjs - do not hand-edit. -->');
  o.push('<!-- Source of truth: scripts/steps/_schema/step.schema.json (operator ruling R2). -->');
  o.push('<!-- Regenerate: node scripts/violations/schema-to-vocab.mjs docs/reports/generated/122-vocabulary.md -->');
  o.push('');
  o.push(`# The step contract — ${cats.length} categories, ${rows.length} declarable fields`);
  o.push('');
  o.push(`**Contract version ${schema['x-contract-version']} · status \`${schema['x-contract-status']}\`.** The schema is canonical; this document is generated from it. Editing this file changes nothing.`);
  o.push('');
  o.push('**Legend:** † required · ~ derived, do not declare · ! extending is a RUNNER CHANGE, never a per-step invention · ⛔ banned for new steps.');
  o.push('');
  o.push('> **Omission is a build failure; `"none"` is a legal value that must be written down — per field, not per category.** The schema is closed: an unknown key fails the build, which is what stops `"None"` and `"n/a"` existing as improvised strings.');
  o.push('');

  o.push('## Categories');
  o.push('');
  o.push('| # | Category | Fields | Frozen menus | Banned values |');
  o.push('|---:|---|---:|---:|---:|');
  cats.forEach((c, i) => {
    const cr = rows.filter((r) => r.category === c);
    o.push(`| ${i + 1} | \`${c}\` | ${cr.length} | ${cr.filter((r) => r.markers.includes('!')).length} | ${cr.reduce((a, r) => a + r.banned.length, 0)} |`);
  });
  o.push('');

  o.push('## Archetype required-field profiles');
  o.push('');
  o.push('`identity.archetype` is not a label — it drives which of the categories are live. A new ENRICHER cannot omit its invalidator, because its archetype makes the field required.');
  o.push('');
  o.push('| Archetype | Forces |');
  o.push('|---|---|');
  for (const p of collectProfiles(schema)) {
    o.push(`| \`${p.archetype}\` | ${p.forces.join(' · ') || '—'} |`);
  }
  o.push('');

  const notes = schema['x-mechanic-notes'] || {};
  if (Object.keys(notes).length) {
    o.push('## Mechanic semantics (V7)');
    o.push('');
    if (notes.V7) { o.push(`> ${notes.V7}`); o.push(''); }
    o.push('| Class value | Read it as |');
    o.push('|---|---|');
    for (const [k, v] of Object.entries(notes)) {
      if (k === 'V7') continue;
      o.push(`| \`${k}\` | ${v} |`);
    }
    o.push('');
  }

  const banned = schema['x-banned-for-new'] || {};
  if (Object.keys(banned.values || {}).length || (banned.rules || []).length) {
    o.push('## ⛔ Banned for new steps');
    o.push('');
    o.push('Grandfathered, never legal for a new step: an existing step must be able to declare its truth.');
    o.push('');
    o.push('| Field | Banned values |');
    o.push('|---|---|');
    for (const [k, v] of Object.entries(banned.values || {})) o.push(`| \`${k}\` | ${v.map(tick).join(' · ')} |`);
    o.push('');
    if ((banned.rules || []).length) {
      o.push('**Rules, not fused class identities (V7).** A ban evaluated over the decoupled axes says what is actually wrong; a ban carried inside a class name says only what the label was.');
      o.push('');
      o.push('| Rule | Banned when | Was | Why |');
      o.push('|---|---|---|---|');
      for (const r of banned.rules) o.push(`| \`${r.id}\` | ${r.banned_when} | ${r.was} | ${r.why} |`);
      o.push('');
    }
  }

  const mc = schema['x-menu-completeness'];
  if (mc) {
    o.push(`## ⚠️ Menu completeness — ${mc.status}`);
    o.push('');
    o.push(`*${mc.method}* \`[MEASURED ${mc.measured}]\``);
    o.push('');
    o.push('| Step | Correction |');
    o.push('|---|---|');
    for (const [k, v] of Object.entries(mc.corrections || {})) o.push(`| \`${k}\` | ${v} |`);
    o.push('');
    if ((mc.gaps || []).length) {
      o.push('| Gap | Pattern | Sites | Why no value fitted | Now declarable as | Status |');
      o.push('|---|---|---|---|---|---|');
      for (const g of mc.gaps) {
        o.push(`| **${g.id}** | ${g.pattern} | \`${g.sites}\` | ${g.why_inexpressible} | ${g.now_expressible_as || '—'} | ${g.status || '—'} |`);
      }
      o.push('');
      o.push(`**Root cause:** ${mc.root_cause}`);
      o.push('');
      o.push(`**Resolution:** ${mc.resolution}`);
      o.push('');
    }
    for (const w of mc.wording_ambiguities || []) o.push(`- ${w}`);
    o.push('');
  }

  o.push('## Rulings encoded');
  o.push('');
  o.push('| # | Ruling |');
  o.push('|---|---|');
  for (const [k, v] of Object.entries(schema['x-rulings'] || {})) o.push(`| **${k}** | ${v} |`);
  o.push('');
  o.push('## Refuted — must not be re-asserted');
  o.push('');
  for (const [k, v] of Object.entries(schema['x-refuted'] || {})) o.push(`- \`${k}\` — ${v}`);
  o.push('');

  o.push('## The menus');
  o.push('');
  for (const cat of cats) {
    const cr = rows.filter((r) => r.category === cat);
    if (!cr.length) continue;
    o.push(`### ${cat}`);
    o.push('');
    const catNode = schema.properties[cat];
    if (catNode && catNode.description) { o.push(`> ${catNode.description}`); o.push(''); }
    o.push('| Field | Menu | Markers |');
    o.push('|---|---|---|');
    for (const r of cr) {
      const ban = r.banned.length ? ` ⛔ **banned for new:** ${r.banned.map(tick).join(', ')}` : '';
      o.push(`| \`${r.field}\` | ${r.menu}${ban} | ${r.markers.join(' ') || '—'} |`);
    }
    o.push('');
  }
  return o.join('\n');
}

// ---------------------------------------------------------------------------

function main(argv) {
  if (argv.includes('--self-test')) return selfTest() ? 0 : 1;
  if (!selfTest()) { console.error('Refusing to emit from an unproven generator.'); return 1; }

  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  const findings = auditSchema(schema);
  if (findings.length) {
    console.error(`\nRefusing to emit — ${findings.length} schema finding(s):`);
    for (const f of findings) console.error(`  - ${f}`);
    return 1;
  }

  const rows = collectRows(schema);
  if (rows.length < 100) {
    console.error(`Collected only ${rows.length} field rows — refusing to emit a truncated contract.`);
    return 1;
  }

  if (argv.includes('--json')) {
    console.log(JSON.stringify({ rows, profiles: collectProfiles(schema) }, null, 2));
    return 0;
  }

  const text = `${render(schema, rows)}\n`;
  const checkIdx = argv.indexOf('--check');
  if (checkIdx !== -1) {
    const target = argv[checkIdx + 1] || DEFAULT_OUT;
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
    if (current !== text) {
      console.error(`DRIFT: ${path.relative(ROOT, target)} is stale. Regenerate it.`);
      return 1;
    }
    console.log(`No drift — ${rows.length} field rows across ${schema['x-categories'].length} categories.`);
    return 0;
  }

  const out = argv.find((a) => !a.startsWith('--'));
  if (out) {
    fs.writeFileSync(out, text);
    console.log(`Wrote ${rows.length} field rows across ${schema['x-categories'].length} categories -> ${out}`);
  } else {
    console.log(text);
  }
  return 0;
}

const isEntry = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isEntry) process.exitCode = main(process.argv.slice(2));
