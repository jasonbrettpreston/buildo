// SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-5 P5.10 (the fields table is GENERATED from
//            the registry, never hand-kept: Spec 124 R-BF), P5.15 (field lineage, invariants INV-16 / INV-17 / INV-24),
//            docs/specs/01-pipeline/131_lot_configuration_policy.md LC-41
//
// MaxBLD FIELD-LINEAGE GENERATOR. Reads docs/reference/maxbld-field-lineage.json (one entry per parcel_maxbld_scenarios
// field: scenarios, by-law regulation_ids, keyed unit ids / Layer 2 targets or OWED, input columns with their migration,
// logic variables, trust tier, invariants) and
//   1. validates it: every regulation_id (and clause path) exists in docs/reference/bylaw-provisions.json; every keyed
//      unit id is an AGREED unit (agree.mjs); every Layer 2 target is a vocab `dsl_target`; every input column is defined
//      by its named migration; every logic variable is in the registry, named in the Spec 78 P5.9 table, and either
//      seeded by a migration or listed OWED (a seeded variable still marked OWED is stale); every invariant id exists;
//      every scenario code and trust tier is in the closed sets;
//   2. renders the Spec 78 P5.10 fields table and the P5.15 invariant table inside their generated markers.
//
//   node scripts/analysis/bylaw/generate-maxbld-lineage.mjs --write   rewrite the two generated blocks in Spec 78
//   node scripts/analysis/bylaw/generate-maxbld-lineage.mjs --check   exit 1 on a dangling reference or drift; 2 = structural
//
// Deterministic: no clock, no DB, sorted output, LF.

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { findBlocks, replaceBlockBody } from '../gates/generated-blocks.mjs';
import {
  SPEC78_REL, agreedUnitIds, cell, dslTargets, migrationColumns, p59Names, provisionsIndex, readJson, readText,
  resolveRegulation, seededLogicVariables, uniqSorted,
} from './maxbld-trace-lib.mjs';

export const REGISTRY_REL = 'docs/reference/maxbld-field-lineage.json';
export const FIELDS_BLOCK = 'maxbld-lineage-fields';
export const INVARIANTS_BLOCK = 'maxbld-invariants';
const SCHEMA = 'maxbld-field-lineage-v1';

export class LineageError extends Error {}

/** Validate the registry. Returns { problems: string[], stats }. */
export function validate(root, reg, specText) {
  const problems = [];
  if (reg.schema !== SCHEMA) throw new LineageError(`registry schema is ${reg.schema}, expected ${SCHEMA}`);
  const tiers = new Set(Object.keys(reg.trust_tiers || {}));
  const scen = new Set(Object.keys(reg.scenario_codes || {}));
  const inv = new Set((reg.invariants || []).map((i) => i.id));
  const lvReg = new Map((reg.logic_variables || []).map((v) => [v.name, v]));
  const prov = provisionsIndex(root);
  const units = agreedUnitIds(root);
  const targets = dslTargets(root);
  const cols = migrationColumns(root);
  const seeded = seededLogicVariables(root, reg.logic_variable_prefix);
  const p59 = p59Names(specText);
  const seen = new Set();
  let owedEntries = 0;
  for (const f of reg.fields || []) {
    const at = `field ${f.field}`;
    if (seen.has(f.field)) problems.push(`${at}: duplicate field`);
    seen.add(f.field);
    if (!tiers.has(f.trust_tier)) problems.push(`${at}: trust tier "${f.trust_tier}" not in trust_tiers`);
    for (const s of f.scenarios || []) if (!scen.has(s)) problems.push(`${at}: scenario code "${s}" unknown`);
    if (!(f.scenarios || []).length) problems.push(`${at}: no scenarios`);
    for (const r of f.regulation_ids || []) {
      const why = resolveRegulation(prov, r);
      if (why) problems.push(`${at}: regulation_id ${r} — ${why}`);
    }
    for (const u of f.keyed?.units || []) if (!units.has(u)) problems.push(`${at}: keyed unit ${u} is not an agreed unit`);
    for (const t of f.keyed?.layer2_targets || []) if (!targets.has(t)) problems.push(`${at}: Layer 2 target ${t} is not a vocab dsl_target`);
    for (const o of f.keyed?.owed || []) { owedEntries += 1; if (!o.owner) problems.push(`${at}: OWED entry without an owner`); }
    for (const c of f.inputs || []) {
      const [table, column] = String(c.column).split('.');
      const file = path.basename(String(c.migration || ''));
      const files = cols.get(table)?.get(column);
      if (!files) problems.push(`${at}: column ${c.column} is defined by no migration`);
      else if (!files.has(file)) problems.push(`${at}: column ${c.column} is not defined in ${c.migration} (defined in ${[...files].sort().join(', ')})`);
    }
    for (const v of f.logic_variables || []) {
      if (!lvReg.has(v)) problems.push(`${at}: logic variable ${v} is not in the registry's logic_variables`);
    }
    for (const i of f.invariants || []) if (!inv.has(i)) problems.push(`${at}: invariant ${i} unknown`);
    if (!f.computation) problems.push(`${at}: no computation text`);
    if (!f.null_when) problems.push(`${at}: no NULL-when text`);
  }
  for (const [name, v] of lvReg) {
    if (!p59.has(name)) problems.push(`logic variable ${name}: not named in the Spec 78 P5.9 table`);
    if (seeded.has(name) && v.status === 'OWED') problems.push(`logic variable ${name}: seeded by a migration but still marked OWED (stale)`);
    if (!seeded.has(name) && v.status !== 'OWED') problems.push(`logic variable ${name}: not seeded by any migration and not marked OWED`);
    if (v.status === 'OWED' && !v.owner) problems.push(`logic variable ${name}: OWED without an owner`);
  }
  const byTier = {};
  for (const f of reg.fields || []) byTier[f.trust_tier] = (byTier[f.trust_tier] || 0) + 1;
  const stats = {
    fields: (reg.fields || []).length,
    persisted: (reg.fields || []).filter((f) => f.persisted !== false).length,
    by_tier: byTier,
    regulation_ids: uniqSorted((reg.fields || []).flatMap((f) => f.regulation_ids || [])).length,
    keyed_units: uniqSorted((reg.fields || []).flatMap((f) => f.keyed?.units || [])).length,
    owed_entries: owedEntries,
    fields_with_owed: (reg.fields || []).filter((f) => (f.keyed?.owed || []).length).length,
    logic_variables_owed: [...lvReg.values()].filter((v) => v.status === 'OWED').length,
    logic_variables_seeded: [...lvReg.keys()].filter((n) => seeded.has(n)).length,
  };
  return { problems, stats };
}

const mig = (m) => (/^migrations\/(\d+)_/.exec(m) || [])[1] || m;

export function renderFields(reg) {
  const L = [];
  L.push(`<!-- do not hand-edit: node scripts/analysis/bylaw/generate-maxbld-lineage.mjs --write renders this block from ${REGISTRY_REL} -->`);
  L.push('');
  L.push('| Field | Type / unit | Scenarios | How it is computed (clause) | Trust tier | Keyed: units · Layer 2 targets · OWED | Inputs (migration) | Logic variables | Invariants | NULL when |');
  L.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const f of reg.fields) {
    const keyed = [
      ...(f.keyed?.units || []).map((u) => `\`${u}\``),
      ...(f.keyed?.layer2_targets || []).map((t) => `l2:\`${t}\``),
      ...(f.keyed?.owed || []).map((o) => `**OWED** ${o.what} (${o.owner})`),
    ].join('; ') || '—';
    const inputs = (f.inputs || []).map((c) => `\`${c.column}\` (${mig(c.migration)})`).join(', ') || '—';
    const lvs = (f.logic_variables || []).map((v) => `\`${v}\``).join(', ') || '—';
    const name = f.persisted === false ? `\`${f.field}\` (reference, not persisted)` : `\`${f.field}\``;
    const change = f.change ? ` *[${f.change}]*` : '';
    L.push(`| ${name} | ${cell(f.type)} | ${f.scenarios.join(', ')} | ${cell(f.computation)}${change} | ${f.trust_tier} | ${cell(keyed)} | ${cell(inputs)} | ${lvs} | ${(f.invariants || []).join(', ') || '—'} | ${cell(f.null_when)} |`);
  }
  return L.join('\n') + '\n';
}

export function renderInvariants(reg) {
  const L = [];
  L.push(`<!-- do not hand-edit: node scripts/analysis/bylaw/generate-maxbld-lineage.mjs --write renders this block from ${REGISTRY_REL} -->`);
  L.push('');
  L.push('| Id | Invariant | Runs at | Fields it checks |');
  L.push('|---|---|---|---|');
  for (const i of reg.invariants) {
    const fs_ = reg.fields.filter((f) => (f.invariants || []).includes(i.id)).map((f) => `\`${f.field}\``);
    L.push(`| ${i.id} | ${cell(i.statement)} | ${cell(i.runs_at)} | ${fs_.join(', ') || 'whole row / generator'} |`);
  }
  return L.join('\n') + '\n';
}

export function expectedSpec(specText, reg) {
  let out = replaceBlockBody(specText, FIELDS_BLOCK, renderFields(reg));
  out = replaceBlockBody(out, INVARIANTS_BLOCK, renderInvariants(reg));
  return out;
}

export function run({ root, mode }) {
  const reg = readJson(root, REGISTRY_REL);
  const specText = readText(root, SPEC78_REL);
  const ids = findBlocks(specText).map((b) => b.id);
  for (const id of [FIELDS_BLOCK, INVARIANTS_BLOCK]) if (!ids.includes(id)) throw new LineageError(`Spec 78 has no generated block "${id}"`);
  const { problems, stats } = validate(root, reg, specText);
  const expected = expectedSpec(specText, reg);
  const drift = expected !== specText;
  if (mode === 'write' && drift) fs.writeFileSync(path.join(root, SPEC78_REL), expected);
  return { problems, stats, drift: mode === 'write' ? false : drift };
}

function main() {
  const flags = process.argv.slice(2);
  const unknown = flags.filter((f) => f !== '--write' && f !== '--check');
  if (unknown.length || flags.length !== 1) {
    console.error('usage: node scripts/analysis/bylaw/generate-maxbld-lineage.mjs --write | --check');
    process.exitCode = 2;
    return;
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  try {
    const r = run({ root, mode: flags[0] === '--write' ? 'write' : 'check' });
    console.log(`[maxbld-lineage] ${JSON.stringify(r.stats)}`);
    for (const p of r.problems) console.error(`[maxbld-lineage] DANGLING: ${p}`);
    if (r.drift) console.error(`[maxbld-lineage] DRIFT: ${SPEC78_REL} generated blocks differ from the registry — rerun with --write`);
    if (r.problems.length || r.drift) process.exitCode = 1;
    else console.log(`[maxbld-lineage] ${flags[0] === '--write' ? 'written' : 'clean'} — ${r.stats.fields} fields, 0 dangling references, no drift.`);
  } catch (err) {
    if (err instanceof LineageError) { console.error(`[maxbld-lineage] refused — ${err.message}`); process.exitCode = 2; return; }
    console.error(err && err.stack ? err.stack : String(err));
    process.exitCode = 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
