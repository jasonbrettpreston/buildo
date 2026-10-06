#!/usr/bin/env node
'use strict';
/**
 * #73 generator (Spec 122 Phase 3 #73 `sharing` derived fields, WIRE -> G; FLEET-2 B-4;
 * MQ-B4 (a), registry-truth plan fold 19, operator 2026-10-04):
 *
 *   sharing.varies_by_chain.phase = the 1-based position of identity.name in
 *   scripts/manifest.json chains.<chain>, for every chain that lists the step.
 *
 * The value is the audit-table phase the runtime stamps (scripts/lib/step/verdict.js
 * resolvePhase), and the chain specs' Step Breakdown tables number steps the same way
 * (locked to the manifest by src/tests/system-map.infra.test.ts). It is generated, never
 * hand-kept (R-BF): `--check` reds a hand edit or a manifest move that was not regenerated.
 *
 *   node scripts/generate-sharing-phase.js --check   (drift lock; exitCode 1 on drift)
 *   node scripts/generate-sharing-phase.js --write   (rewrite the drifted phase maps)
 *
 * Format-preserving: only the text of the `phase` object inside `varies_by_chain` changes.
 * Its layout (compact / inline-spaced / multi-line), the file's line endings and the
 * order of chains it already declares are kept; a chain the step newly joins is appended
 * in manifest order, a chain it left is removed. A descriptor declaring `phase: "none"`
 * (or no phase) is skipped. The three ASSERT descriptor generators call phaseMapFor() so
 * their own --check agrees with this one byte for byte.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DESCRIPTOR_DIRS = ['scripts', 'scripts/quality'];

function loadManifest() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'manifest.json'), 'utf8'));
}

/** { chain: 1-based position } for every manifest chain listing `slug`, in manifest chain order. */
function phaseMapFor(slug, manifest = loadManifest()) {
  const out = {};
  for (const [chain, steps] of Object.entries(manifest.chains)) {
    const i = steps.indexOf(slug);
    if (i < 0) continue;
    if (steps.lastIndexOf(slug) !== i) {
      throw new Error(`generate-sharing-phase: ${slug} appears more than once in manifest chains.${chain}; its phase is ambiguous`);
    }
    out[chain] = i + 1;
  }
  return out;
}

/** Keep the declared chain order; append newly-joined chains in manifest order. */
function orderLike(declared, derived) {
  const out = {};
  for (const k of Object.keys(declared)) if (k in derived) out[k] = derived[k];
  for (const k of Object.keys(derived)) if (!(k in out)) out[k] = derived[k];
  return out;
}

function renderLike(originalText, map) {
  const keys = Object.keys(map);
  if (/\n/.test(originalText)) {
    const eol = originalText.includes('\r\n') ? '\r\n' : '\n';
    const inner = (originalText.match(/\n([ \t]*)"/) || [null, '  '])[1];
    const closing = (originalText.match(/\n([ \t]*)\}$/) || [null, ''])[1];
    return `{${keys.map((k) => `${eol}${inner}${JSON.stringify(k)}: ${map[k]}`).join(',')}${eol}${closing}}`;
  }
  if (/^\{\s/.test(originalText)) return `{ ${keys.map((k) => `${JSON.stringify(k)}: ${map[k]}`).join(', ')} }`;
  return `{${keys.map((k) => `${JSON.stringify(k)}:${map[k]}`).join(',')}}`;
}

/** Locate the phase object text inside varies_by_chain. Throws (fail loud) on any ambiguity. */
function locatePhase(text, rel) {
  const anchor = '"varies_by_chain"';
  const at = text.indexOf(anchor);
  if (at < 0 || text.indexOf(anchor, at + 1) >= 0) {
    throw new Error(`generate-sharing-phase: ${rel} must contain exactly one "varies_by_chain" key`);
  }
  const re = /"phase"\s*:\s*(\{[^{}]*\})/g;
  re.lastIndex = at;
  const m = re.exec(text);
  if (!m || text.slice(at, m.index).includes('}')) {
    throw new Error(`generate-sharing-phase: ${rel} has no phase object directly inside varies_by_chain`);
  }
  const start = m.index + m[0].length - m[1].length;
  return { start, end: start + m[1].length, objText: m[1] };
}

/** Returns null when the descriptor declares no phase map; else { rel, slug, declared, derived, drift, newText }. */
function planDescriptor(rel, text, manifest) {
  const d = JSON.parse(text);
  const declared = d.sharing && d.sharing.varies_by_chain && d.sharing.varies_by_chain.phase;
  if (declared === undefined || declared === 'none') return null;
  const slug = d.identity.name;
  const derived = orderLike(declared, phaseMapFor(slug, manifest));
  if (Object.keys(derived).length === 0) {
    throw new Error(`generate-sharing-phase: ${rel} (${slug}) declares a phase map but no manifest chain lists the step`);
  }
  const { start, end, objText } = locatePhase(text, rel);
  if (JSON.stringify(JSON.parse(objText)) !== JSON.stringify(declared)) {
    throw new Error(`generate-sharing-phase: ${rel} located phase text does not match the parsed descriptor`);
  }
  const drift = JSON.stringify(declared) !== JSON.stringify(derived);
  const newText = drift ? text.slice(0, start) + renderLike(objText, derived) + text.slice(end) : text;
  const reparsed = JSON.parse(newText);
  if (JSON.stringify(reparsed.sharing.varies_by_chain.phase) !== JSON.stringify(derived)) {
    throw new Error(`generate-sharing-phase: ${rel} self-check failed after render`);
  }
  return { rel, slug, declared, derived, drift, newText };
}

function descriptorFiles() {
  return DESCRIPTOR_DIRS.flatMap((dir) => fs.readdirSync(path.join(ROOT, dir))
    .filter((f) => f.endsWith('.descriptor.json'))
    .sort()
    .map((f) => `${dir}/${f}`));
}

function main(argv) {
  const check = argv.includes('--check');
  const write = argv.includes('--write');
  if (check === write) {
    console.error('usage: node scripts/generate-sharing-phase.js --check | --write');
    process.exitCode = 2;
    return;
  }
  const manifest = loadManifest();
  const plans = descriptorFiles()
    .map((rel) => planDescriptor(rel, fs.readFileSync(path.join(ROOT, rel), 'utf8'), manifest))
    .filter(Boolean);
  const drifted = plans.filter((p) => p.drift);
  for (const p of drifted) {
    console.log(`${check ? 'DRIFT' : 'WROTE'} ${p.rel} (${p.slug}): declared ${JSON.stringify(p.declared)} -> manifest ${JSON.stringify(p.derived)}`);
    if (write) fs.writeFileSync(path.join(ROOT, p.rel), p.newText, 'utf8');
  }
  console.log(`generate-sharing-phase: ${plans.length} phase maps, ${drifted.length} ${check ? 'drifted' : 'rewritten'}`);
  if (check && drifted.length > 0) process.exitCode = 1;
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { phaseMapFor, orderLike, renderLike, locatePhase, planDescriptor };
