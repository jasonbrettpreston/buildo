// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §9 G-CODE (iv) (report-only; SC-6 "0 open at Phase 3 close"), §6.3
//            docs/specs/01-pipeline/133_bylaw_handbook.md m.11 (code linkage reports until Phase 3), m.22 (a code != by-law
//            disagreement is a Phase 3 input, never a table edit)
//
// P3-13 part 1: the G-CODE (iv) arm over the Phase 3 compute modules. It REUSES code-link.mjs (createContext,
// classifyConstants) for the named-constant classification and adds one registry, scripts/analysis/phase3/phase3-literals.json:
// the clause literals the modules receive as INPUTS. Until a commit sources an input from its keyed clause the arm reports
// it `unmapped`.
//
//   mode 'report'   (default, m.11): unmapped literals and constants are findings; `pass` is false only on registry drift.
//   mode 'blocking' (the Phase 3 close switch): any unmapped literal also fails. Wired nowhere; switching it on needs a ruling.
//
// Drift (the registry disagreeing with docs/reference/bylaw-provisions.json) fails in every mode: a wrong registry would
// make "sourced from the clause" mean nothing. HELD on P3-Q1. Not wired into any gate, hook or step-validate arm.

import fs from 'node:fs';
import path from 'node:path';
import { createContext, classifyConstants } from '../bylaw/code-link.mjs';

export const PHASE3_MODULES = Object.freeze([
  'scripts/lib/maxbld-coa-tier.js',
  'scripts/lib/maxbld-houseplex-units.js',
  'scripts/lib/maxbld-layer2-view.js',
  'scripts/lib/maxbld-lineage.js',
  'scripts/lib/maxbld-main-building.js',
  'scripts/lib/maxbld-scenario-status.js',
  'scripts/lib/maxbld-shadow-classifier.js',
  'src/features/leads/lib/renovation-shared.js',
]);
export const REGISTRY_REL = 'scripts/analysis/phase3/phase3-literals.json';
export const PROVISIONS_REL = 'docs/reference/bylaw-provisions.json';
export const MODES = Object.freeze(['report', 'blocking']);

const readJson = (root, rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));

/** Drift items: a registry entry that does not match the bylaw tree. */
function driftItems(registry, provisions) {
  const items = [];
  const byReg = new Map(provisions.rows.map((r) => [r.regulation_id, r]));
  const allUnits = new Set(provisions.rows.flatMap((r) => (r.units || []).map((u) => u.unit_id)));
  for (const l of registry.literals) {
    const row = byReg.get(l.regulation_id);
    if (!row) { items.push({ code: 'phase3_literal_registry_drift', id: l.id, detail: `regulation ${l.regulation_id} is not in the bylaw tree` }); continue; }
    if (l.kind === 'numeric' && !(row.numeric_literals || []).some((x) => x.clause_path === l.clause_path && x.value === l.value)) {
      items.push({ code: 'phase3_literal_registry_drift', id: l.id, detail: `${l.regulation_id} ${l.clause_path} has no numeric literal ${l.value}` });
    }
    for (const u of l.unit_ids || []) {
      if (!allUnits.has(u)) items.push({ code: 'phase3_literal_registry_drift', id: l.id, detail: `unit ${u} is not in the bylaw tree` });
    }
  }
  return items;
}

export function checkPhase3Linkage({ root, mode = 'report', registry, provisions, modules = PHASE3_MODULES }) {
  if (!MODES.includes(mode)) throw new Error(`checkPhase3Linkage: mode ${JSON.stringify(mode)} is not one of ${MODES.join(', ')}`);
  const reg = registry || readJson(root, REGISTRY_REL);
  const prov = provisions || readJson(root, PROVISIONS_REL);
  const items = driftItems(reg, prov);
  const drift = items.length;
  let unmapped = 0;
  let sourced = 0;
  for (const l of reg.literals) {
    if (l.source) { sourced += 1; continue; }
    unmapped += 1;
    items.push({ code: 'phase3_literal_unmapped', id: l.id, module: l.module, detail: `${l.module_input} (${l.kind}) from ${l.regulation_id}${l.clause_path ? ` ${l.clause_path}` : ''} is not sourced from its clause` });
  }
  const constants = classifyConstants({ ctx: createContext({ root }), codeRoots: [...modules], rows: [], heuristics: [] });
  for (const f of constants.findings) items.push(f);
  const pass = drift === 0 && (mode === 'report' || unmapped === 0);
  return { mode, pass, literals: { total: reg.literals.length, unmapped, sourced }, constants: { counts: constants.counts, files: constants.files }, items };
}
