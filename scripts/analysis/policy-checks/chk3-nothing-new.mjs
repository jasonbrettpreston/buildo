// SPEC LINK: MORNING-DECISIONS.md:725 ("nothing new without a ruling" is one of the eight automatic checks); docs/specs/02-web-admin/126_maxbld_surface_standard.md:782 (binding-sources.json is protected: adding a source or a member needs a register row and a panel);
//            operator 2026-11-11 "build with existing components": new ones need a named reason and a ruling. M-246 is the dated-note convention, not an approval.
// CHK.3, from the STAGED diff (it runs in the commit-msg hook, where the message carries the ruling id the escape needs):
//   (a) an ADDED non-test file under the client component globs (config chk3_component_globs; a rename or copy is not "added");
//   (b) a new KEY in package.json dependencies or devDependencies (a version or script change is not new);
//   (c) any staged change to the binding-sources file (config chk3_binding_sources_path): cite the Spec 126 :782 register row and panel in the ledger quote.
// Each needs a policy-ledger row (chk3-new-component@<path>, chk3-new-dependency@<name>, chk3-binding-source@binding-sources.json) in the same commit, with its ruling id in an Operator-Ruling trailer.
// Known limit (stated, not widened): a new component outside the named roots is not seen; the roots widen only by a ruling and a re-measure (origin 2026-10-01..11-18: 14 of 1742 commits hit).
import { finding, matchAny, isTest } from './lib.mjs';

export const RULES = ['chk3-new-component', 'chk3-new-dependency', 'chk3-binding-source'];
const [R_COMP, R_DEP, R_BIND] = RULES;
const CONFIG_PATH = 'docs/reports/policy/policy-config.json';
export const depNames = (json) => { try { const p = JSON.parse(json || '{}'); return new Set([...Object.keys(p.dependencies || {}), ...Object.keys(p.devDependencies || {})]); } catch { return new Set(); } };

/** @returns {{findings: object[], waits: string[]}} */
export function check({ changes, pkgBefore, pkgAfter, config }) {
  if (!Array.isArray(config.chk3_component_globs) || typeof config.chk3_binding_sources_path !== 'string') {
    return { findings: [{ rule: R_COMP, file: CONFIG_PATH, line: 0, item: 'chk3 config', msg: 'chk3_component_globs and chk3_binding_sources_path are required (fail closed)' }], waits: [] };
  }
  const findings = [];
  for (const c of changes) {
    if (c.status === 'A' && !isTest(c.path) && matchAny(config.chk3_component_globs, c.path)) findings.push(finding(R_COMP, c.path, 0, 'new client component file with no ruling (nothing new without a ruling)'));
    if (c.path === config.chk3_binding_sources_path) findings.push({ rule: R_BIND, file: c.path, line: 0, item: 'binding-sources.json', msg: 'binding-sources.json changed: a register row and a panel are required (Spec 126 :782); cite them in the ledger row quote' });
  }
  const before = depNames(pkgBefore);
  for (const d of depNames(pkgAfter)) if (!before.has(d)) findings.push({ rule: R_DEP, file: 'package.json', line: 0, item: d, msg: `new dependency ${d} with no ruling` });
  return { findings, waits: [] };
}

/** Rows whose approved thing is gone are orphans (R-X closing-row posture: the remediation deletes its own row). `exists(path)` and the live dependency set come from the caller. */
export function goneRows(rows, { exists, deps }) {
  return rows.filter((r) => (r.rule === R_COMP && !exists(r.item)) || (r.rule === R_DEP && !deps.has(r.item)));
}
