// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §7.6 (eval-vectors.json: the six Spec 67 worked examples
//            + V1–V25; vector_status closed; every by_law_expected value has its Spec 67 anchor AND the by-law clause it
//            reads, checked against the page text, not Spec 67 prose), §10 (determinism: sorted keys, LF);
//            docs/specs/01-pipeline/69_mcbylaw_policy.md M-43, M-51; docs/reports/mcbylaw-phase1-plan.md S6b
//
// Offline provenance lock over scripts/seeds/bylaw/eval-vectors.json: anchors resolve to the exact Spec 67 line,
// clause literals occur in the pinned page of the cited chapter, the M-51 corrections are recorded as eval_vector
// adjudications, and the seed is byte-stable (sorted keys, LF, trailing newline).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- seed JSON
const ROOT = process.cwd();
const RAW = fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/eval-vectors.json'), 'utf8');
const SEED: Json = JSON.parse(RAW);
const V: Json[] = SEED.vectors;
const SPEC67 = fs.readFileSync(path.join(ROOT, SEED.spec67), 'utf8').split('\n').map((l) => l.replace(/\r$/, ''));
const ws = (s: string) => s.replace(/\s+/g, ' ');
const pageFor = (clause: string): string | null => {
  const m = /^(\d+)\.(\d+)\./.exec(clause);
  if (!m) return null;
  const p = path.join(ROOT, `scripts/seeds/bylaw/pages/ch${m[1]}_${m[2]}.txt`);
  return fs.existsSync(p) ? ws(fs.readFileSync(p, 'utf8')) : null;
};
const sortKeys = (v: unknown): unknown => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as Json).sort().map((k) => [k, sortKeys((v as Json)[k])])) : v);

describe('eval-vectors.json — membership and closed statuses (§7.6)', () => {
  it('the six worked examples and V1–V25 are all present; ids unique', () => {
    const ids = V.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    const sources = new Set(V.map((v) => v.source));
    for (const s of ['41 Derwyn Road', '64 Eastbourne Crescent', '96 Futura Drive', '68 Cordella Avenue', 'parcel 5071306', '7 Bijou Walk']) expect(sources).toContain(s);
    for (let n = 1; n <= 25; n++) expect(sources).toContain(`V${n}`);
  });
  it('vector_status is closed: by_law_expected · no_expected:<reason> · model_composite; V16 and V12 are no_expected, V25 composite', () => {
    const bad = V.filter((v) => !(v.vector_status === 'by_law_expected' || v.vector_status === 'model_composite' || /^no_expected:[a-z_]+$/.test(v.vector_status)));
    expect(bad.map((v) => v.id)).toEqual([]);
    expect([vec('V12').vector_status, vec('V16').vector_status, vec('V25').vector_status]).toEqual(['no_expected:policy_null', 'no_expected:unconfirmed_no_citation', 'model_composite']);
  });
  it('no worked example carries an exception (§7.6)', () => {
    expect(V.filter((v) => v.lot && v.lot.exception).map((v) => v.id)).toEqual([]);
  });
});
function vec(id: string): Json { return V.find((v) => v.id === id)!; }

describe('every expected value is anchored (§7.6)', () => {
  it('each vector names a Spec 67 line whose text is exactly that line', () => {
    const bad = V.filter((v) => !v.spec67_anchor || !(SPEC67[v.spec67_anchor.line - 1] || '').startsWith(v.spec67_anchor.text)).map((v) => `${v.id} line ${v.spec67_anchor && v.spec67_anchor.line}`);
    expect(bad).toEqual([]);
  });
  it('each by_law_expected vector cites a clause; its literals occur in the pinned page of that chapter', () => {
    const bad: string[] = [];
    for (const v of V.filter((x) => x.vector_status === 'by_law_expected')) {
      if (!v.bylaw_clause) { bad.push(`${v.id}: no bylaw_clause`); continue; }
      if (v.clause_check && v.clause_check.checked === false) { if (!v.expected.not_evaluated) bad.push(`${v.id}: unchecked clause with a value`); continue; }
      const page = pageFor(v.bylaw_clause);
      if (!page) { bad.push(`${v.id}: no pinned page for ${v.bylaw_clause}`); continue; }
      const lits: string[] = (v.clause_check && v.clause_check.literals) || [];
      if (!lits.length) bad.push(`${v.id}: no clause literal`);
      for (const l of lits) if (!page.includes(ws(l))) bad.push(`${v.id}: "${l}" not in ${v.bylaw_clause}'s page`);
    }
    expect(bad).toEqual([]);
  });
});

describe('M-51 — Spec 67 V1–V4 and V25 (side) corrected as eval_vector adjudications', () => {
  it.each(['V1', 'V2', 'V3', 'V4', 'V25:side_setback_m'])('%s keeps the Spec 67 value, states the by-law value and who ruled', (id) => {
    const v = vec(id);
    expect(v.expected).toEqual({ value: 1.2 });
    expect(v.adjudication).toMatchObject({ kind: 'eval_vector', ruling: 'Spec 69 M-51', wrong_side: 'Spec 67 vector (KFM-4)' });
    expect(v.spec67_value).toBe(v.adjudication.with_label_f_equal_to_frontage.value);
    expect(v.bylaw_clause).toBe('10.20.40.70(3)#(C)');
  });
  it('no other vector carries an adjudication', () => {
    expect(V.filter((v) => v.adjudication).map((v) => v.id)).toEqual(['V1', 'V2', 'V3', 'V4', 'V25:side_setback_m']);
  });
});

describe('determinism (§10): the seed is byte-stable', () => {
  it('sorted keys, 2-space JSON, LF only, one trailing newline', () => {
    expect(RAW.includes('\r')).toBe(false);
    expect(RAW).toBe(`${JSON.stringify(sortKeys(SEED), null, 2)}\n`);
  });
});

describe('absence-rulings.json (Spec 69 M-54 note 2026-10-07): every absence is executed against the pinned page', () => {
  const A: Json = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/absence-rulings.json'), 'utf8'));
  it('ABS-1: Ch.10.10 has no principal-building coverage regulation (no 10.10.30.40, no "Maximum Lot Coverage") and does have the ancillary cap 10.10.60.70', () => {
    const r = A.rulings.find((x: Json) => x.id === 'ABS-1');
    expect(r).toMatchObject({ zone: 'R', target: 'lot_coverage_pct', evidence_kind: 'absence', expert_sample: true });
    const page = ws(fs.readFileSync(path.join(ROOT, `scripts/seeds/bylaw/pages/${r.checked_page}.txt`), 'utf8'));
    for (const absent of r.absent_phrases) expect({ absent, found: page.includes(absent) }).toEqual({ absent, found: false });
    for (const present of r.present_phrases) expect({ present, found: page.includes(ws(present)) }).toEqual({ present, found: true });
  });
  it('the seed is byte-stable (sorted keys, LF)', () => {
    const raw = fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/absence-rulings.json'), 'utf8');
    expect(raw).toBe(`${JSON.stringify(sortKeys(JSON.parse(raw)), null, 2)}
`);
  });
});
