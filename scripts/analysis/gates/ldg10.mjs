// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-DI (LDG-10), R-BC (c), R-BF, R-BL
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6 / §6.6.1
//
// LDG-10 (McDonald's Airtight V3, operator y 2026-10-17): the cross-step ledger is proven complete for the
// sources chain from WITNESSED traces, never from re-emitted declarations. This module is the ONE status
// line (#50): a PURE conjunction of gates that already run, each at hard posture — it adds no allowlist and
// no new check of its own, so a red here is always a red of a named gate first.
//
//   class 1 table edges   — #44 (a)(b)(c)(d)(e) with no FAIL row on every converted sources slug (P1-C9:
//                           #44 is hard for converted slugs), and every sources step converted or exempt;
//   class 2 contracts     — gate D #31 PASS (its consumer set includes unconverted steps' observed reads);
//   class 3 pins          — #44 (h) (inside class 1's rows);
//   class 4 invalidation  — PENDING: #44 check (i) is not ruled (drafted ruling, LDG-10 report);
//   class 5 ordering      — zero hard ORDER / ORDER-UNPLACED rows for the sources chain (L-A);
//   cloud proof           — EP-PIN-D17, operator-run; PENDING until its programme item is BUILT.
//
// Answer: FAIL when a measured class fails; PARTIAL when every measured class passes but a pending clause
// remains; PASS only when nothing is pending. Never PASS by absence.

/**
 * @param {{
 *   sourcesSlugs: string[],
 *   convertedSlugs: Iterable<string>,
 *   exemptSlugs?: Iterable<string>,
 *   witnessRowsBySlug: Record<string, string[]>,
 *   gateD: {pass: boolean},
 *   orderRows: string[],
 *   pending: string[],
 * }} input
 * @returns {{answer: 'PASS'|'PARTIAL'|'FAIL', classes: Record<string, string>, detail: string}}
 */
export function ldg10Status({ sourcesSlugs, convertedSlugs, exemptSlugs = [], witnessRowsBySlug, gateD, orderRows, pending }) {
  const converted = new Set(convertedSlugs || []);
  const exempt = new Set(exemptSlugs || []);
  const slugs = Array.isArray(sourcesSlugs) ? sourcesSlugs : [];
  const notConverted = slugs.filter((s) => !converted.has(s) && !exempt.has(s));
  const witnessFails = [];
  for (const s of slugs.filter((x) => converted.has(x))) {
    const rows = witnessRowsBySlug && Array.isArray(witnessRowsBySlug[s]) ? witnessRowsBySlug[s] : null;
    if (rows === null) { witnessFails.push(`${s}:unevaluated`); continue; }
    for (const r of rows) if (r.startsWith('FAIL:')) witnessFails.push(r);
  }
  const classes = {
    '1 table edges + 3 pins (#44)': witnessFails.length === 0 ? 'PASS' : `FAIL (${witnessFails.length})`,
    '1 converted set (R-BC a)': notConverted.length === 0 ? 'PASS' : `PENDING (${notConverted.join(', ')})`,
    '2 contracts (gate D #31)': gateD && gateD.pass ? 'PASS' : 'FAIL',
    '4 invalidation (#44 i)': 'PENDING (check (i) not ruled)',
    '5 ordering (L-A)': (orderRows || []).length === 0 ? 'PASS' : `FAIL (${orderRows.length})`,
  };
  const extra = Array.isArray(pending) ? pending : [];
  const measuredFail = Object.values(classes).some((v) => v.startsWith('FAIL'));
  const anyPending = extra.length > 0 || Object.values(classes).some((v) => v.startsWith('PENDING'));
  const answer = measuredFail ? 'FAIL' : (anyPending ? 'PARTIAL' : 'PASS');
  const detail = `LDG-10 (sources): ${answer} — ${Object.entries(classes).map(([k, v]) => `${k}: ${v}`).join('; ')}`
    + (extra.length ? `; pending: ${extra.join('; ')}` : '')
    + (witnessFails.length ? ` [${witnessFails.slice(0, 10).join('; ')}${witnessFails.length > 10 ? `; … +${witnessFails.length - 10}` : ''}]` : '');
  return { answer, classes, detail };
}

/** Both directions on fixtures (Spec 121 §12b.6): a clean fleet is PARTIAL (pending clauses), one FAIL row is FAIL. */
export function selfTest() {
  const base = {
    sourcesSlugs: ['a', 'b', 'r'],
    convertedSlugs: ['a', 'b'],
    exemptSlugs: ['r'],
    witnessRowsBySlug: { a: [], b: ['UNWITNESSED:b:full_rescan:t.c'] },
    gateD: { pass: true },
    orderRows: [],
    pending: ['EP-PIN-D17 cloud proof (operator)'],
  };
  const clean = ldg10Status(base);
  const red = ldg10Status({ ...base, witnessRowsBySlug: { a: ['FAIL:WITNESS:a:a:t.x'], b: [] } });
  const missing = ldg10Status({ ...base, witnessRowsBySlug: { a: [] } });
  const order = ldg10Status({ ...base, orderRows: ['ORDER:sources:b>a:t.x'] });
  const ok = clean.answer === 'PARTIAL' && red.answer === 'FAIL' && missing.answer === 'FAIL' && order.answer === 'FAIL';
  return { ok, detail: ok ? 'self-test ok: clean → PARTIAL (pending), a #44 FAIL / unevaluated slug / ORDER row → FAIL' : `self-test FAILED: ${JSON.stringify({ clean, red, missing, order })}` };
}
