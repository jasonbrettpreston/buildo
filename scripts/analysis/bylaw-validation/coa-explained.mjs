// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-287 (vocab.explained_differences: a City figure that differs from ours by a recorded operator
//            ruling), M-313 (the table has a validated consumer); docs/specs/01-pipeline/68_mcbylaw_standard.md §7.5
//
// The consumer of vocab.explained_differences: the CoA scorecard reports a DIFFER row as an explained difference when the clause, target, our figure and the
// City figure all equal an entry. The table is checked before it is read, so a malformed or unruled entry stops the scorer (exit 2) instead of
// silently relabelling a miss. PURE: no file reads here; the scorer passes the vocab and the register's row ids.
const isMap = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

/** violations of vocab.explained_differences: [] when every entry is well formed, names a modelled target, and cites a register row. */
export function checkExplainedDifferences(vocab, registerRowIds) {
  const v = [];
  const table = (vocab || {}).explained_differences;
  if (table === undefined) return v;
  if (!isMap(table)) return ['explained_differences is not an object'];
  const targets = (vocab || {}).dsl_target || {};
  for (const [clause, e] of Object.entries(table)) {
    if (clause === '$comment') continue;
    if (!/^\d+(\.\d+)+(\([^)]+\))*$/.test(clause)) v.push(`${clause}: the key is not a normalised clause`);
    if (!isMap(e)) { v.push(`${clause}: entry is not an object`); continue; }
    if (!Object.prototype.hasOwnProperty.call(targets, e.target)) v.push(`${clause}: target ${e.target} is not a dsl_target`);
    if (!isNum(e.ours) || !isNum(e.city)) v.push(`${clause}: ours and city must be numbers`);
    else if (e.ours === e.city) v.push(`${clause}: ours equals city, so there is nothing to explain`);
    if (e.class !== undefined && e.class !== 'DATA') v.push(`${clause}: class must be DATA when present (R5-5 HELD: an explained data flag, M-308)`);
    if (e.class === 'DATA') { // R5-5 (HELD): a DATA flag names the notice rows and the parcel it covers
      if (!Array.isArray(e.rows) || !e.rows.length || !e.rows.every((x) => /^A\d+\/\d+[A-Z]+#\d+$/.test(x))) v.push(`${clause}: a DATA entry needs rows: ["<file number>#<variance n>", ...]`);
      if (typeof e.parcel_id !== 'string' || !e.parcel_id) v.push(`${clause}: a DATA entry needs the parcel_id it covers`);
    }
    if (typeof e.reading !== 'string' || e.reading.length < 20) v.push(`${clause}: reading is missing`);
    if (typeof e.ruling !== 'string' || !/^M-\d+$/.test(e.ruling)) v.push(`${clause}: ruling must be a register row id (M-n)`);
    else if (registerRowIds && !registerRowIds.has(e.ruling)) v.push(`${clause}: ruling ${e.ruling} has no register row`);
  }
  return v;
}

/** the entry that explains one scored row, or null: same clause, target, our figure and City figure (an unexplained change of either figure is a new finding). */
export function explainRow(vocab, clauseNorm, target, ours, city, scope = null) {
  const e = ((vocab || {}).explained_differences || {})[clauseNorm];
  if (!isMap(e) || clauseNorm === '$comment') return null;
  if (e.target !== target || Number(e.ours) !== Number(ours) || Number(e.city) !== Number(city)) return null;
  // R5-5 (HELD): a DATA entry applies only to its named notice rows on its parcel; the same figures anywhere else stay a DIFFER
  if (e.class === 'DATA' && !(scope && Array.isArray(e.rows) && e.rows.includes(`${scope.notice}#${scope.n}`) && String(scope.parcelId) === e.parcel_id)) return null;
  return e;
}
