// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §7.5 (the clause -> unit keying the evaluator uses); DRAFT RULING pending (see coa-parse.cjs)
// Clause (as printed on a CoA notice) → our keyed units → targets. Derived from the agreed unit set (adjudications applied).
// A printed clause that is a typo of an existing article (F-4D-SC-245, lane A): "10.50.60.70" is the article 10.5.60.70, whose one regulation is (1) (ancillary building coverage; there is no Article 10.50).
export const CLAUSE_ALIASES = Object.freeze({ '10.50.60.70': '10.5.60.70(1)' });
// Case-data corrections (M-75 form: the printed record is never edited; the correction is applied at read time, only while the record still holds the printed value it was made for, and its evidence is written on the row). Values only.
// evidence = the document and the value that fix the reading; the by-law unit named is the agreed unit whose figure the notice quotes.
export const CASE_DATA_CORRECTIONS = Object.freeze({
  'A0262/26NY#4': { printed: '10.10.40(2)A)', clause: '10.10.40.10(2)(A)', evidence: 'decision notice item 4 requirement text: 7.5 m for all side main walls, at least 70 %; the printed clause has no article; by-law unit 10.10.40.10(2)#(2)(A) states the side main wall height and the 70 % share' },
  'A0262/26NY#5': { printed: '10.10.40(2)A)', clause: '10.10.40.10(2)(A)', evidence: 'decision notice item 5 requirement text: 7.5 m for all side main walls, at least 70 %; the printed clause has no article; by-law unit 10.10.40.10(2)#(2)(A) states the side main wall height and the 70 % share' },
  'A0467/26TEY#1': { printed: '10.10.40.10(2)(iii)', clause: '10.10.40.10(2)(B)(iii)', evidence: 'decision notice item 1 requirement text: 8.5 m for 40 % of all front and rear main wall widths; the printed clause lacks (B); by-law unit 10.10.40.10(2)#(2)(B) carries the front and rear 40 % share' },
  'A0167/26EYK#2': { printed: '10.20.40.10(1)(A)', clause: '10.20.40.40(1)(A)', evidence: 'decision notice item 2 requirement text: floor space index 0.45 times the lot area (232.43 m2); the cited 10.20.40.10(1)(A) is the height clause; by-law unit 10.20.40.40(1)#(1)(A) is the floor space index' },
  'A0302/26NY#2': { printed: '10.20.40.20(1)', printed_required: 18, required_value: 17, evidence: 'decision notice item 2 requirement text: a building length of 17.0 m for a minimum required lot frontage of 18.0 m or less; the parser took the frontage condition 18 as the requirement; by-law unit 10.20.40.20(1)#whole is building_length_m = 17.0 m' },
});
/** The correction for one variance of one notice, or null. Applies only while the record still holds the printed clause (and printed required value) the correction was made for. */
export function correctionFor(fileNumber, v) {
  const e = CASE_DATA_CORRECTIONS[fileNumber + '#' + v.n];
  if (!e || v.clause !== e.printed) return null;
  if (e.printed_required !== undefined && (v.required && v.required.value) !== e.printed_required) return null;
  return e;
}
export function normClause(raw) {
  let s = String(raw || '').replace(/,?\s*-?\s*Exception\s+R[A-Z]*\s*\d+.*$/i, '').replace(/\s+and\s+\(.*$/i, '').trim();
  s = s.replace(/^(900\.\d+\.10)\(([A-Z])\)\s*\((\d+)\)/, '$1($3)($2)'); // "900.3.10(A) (559)" → 900.3.10(559)(A)
  s = s.replace(/\)([A-Za-z0-9]+)\)/g, ')($1)'); // "(1)A)" → "(1)(A)"
  s = s.replace(/^(\d+(?:\.\d+)+\(\d+\))\(\1\)/, '$1').replace(/^(\d+(?:\.\d+)+)\((\d+)\)\(\2\)/, '$1($2)'); // "10.20.40.10(6)(6)"
  s = s.replace(/\s+/g, '');
  for (const [from, to] of Object.entries(CLAUSE_ALIASES)) if (s === from || s.startsWith(from + '(')) s = to + s.slice(from.length);
  const m = /^(\d+(?:\.\d+)+)((?:\([^)]+\))*)$/.exec(s);
  if (!m) return { raw, norm: s, section: null, reg: null, path: null };
  const groups = m[2].match(/\([^)]+\)/g) || [];
  return { raw, norm: s, section: m[1], reg: groups.length ? m[1] + groups[0] : m[1], path: groups.join('').toLowerCase() };
}
export function unitKey(u) {
  const [regRaw, sub] = u.unit_id.split('#');
  const reg = regRaw.replace(/[@~].*$/, '').replace(/@.*$/, '');
  const first = (/\(\d+\)/.exec(reg) || [''])[0];
  let p = sub === 'whole' ? first : String(sub || '').replace(/\[[A-Z]+\]/g, '');
  return { reg: reg.replace(/@.*$/, ''), path: p.toLowerCase(), whole: sub === 'whole' };
}
export function unitsForClause(c, units) {
  if (!c.reg) return [];
  const regBase = c.reg;
  return units.filter((u) => {
    const k = unitKey(u); if (k.reg !== regBase) return false;
    if (!c.path || k.whole) return true;
    return k.path.startsWith(c.path) || c.path.startsWith(k.path);
  });
}
