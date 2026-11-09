// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.7 (golden = fixture + rendered tree; a screenshot is never a golden),
//            docs/specs/02-web-admin/127_surface_conversion_procedure.md 4.3 (the pair, one file per state per target; 2026-11-08 dated note),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-17 (roof variants).
//
// MF-12 tranche 1 · McFrontend queue · lane T. S-parity (operator D-3 a, 2026-11-08): the four target files of one state agree.
// Also: every state x target file exists (manifest states.json, F4), the node fields bind only to the declaration plus content (D-3 b),
// and the fingerprint is fresh. No DB, no network. Renderers (MF-14) compare their own output with these files later.
import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { FP_FILES, SOURCE_KINDS, TARGETS, TRANCHE1_KINDS, bindProblems, parityOk, sha16, sourceProblems } from '../../../scripts/surfaces/report-checks.mjs'; // MF-15 D-1 a: one home, shared with surface-validate.mjs (R-27)

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- golden JSON
const ROOT = process.cwd();
const DIR = path.join(ROOT, 'src/tests/fixtures/surfaces/report');
const STATES = [
  'permitted', 'not_permitted', 'not_evaluated', 'variant_flat', 'variant_pitched_a',
  'variant_pitched_b', 'at_least', 'loading', 'miss', 'error', 'not_buildable', 'not_modelled',
  'ad_slot_present', 'ad_slot_absent',
];
const readJson = (p: string): Json => JSON.parse(fs.readFileSync(p, 'utf8'));
const file = (s: string, t: string): string => path.join(DIR, `${s}.${t}.json`);
const have = (s: string, t: string): boolean => fs.existsSync(file(s, t));

describe('MF-12 tranche 1 goldens (S-golden, S-parity)', () => {
  it('manifest pins the tranche-1 states and the four targets', () => {
    const m = readJson(path.join(DIR, 'states.json'));
    expect(m.targets).toEqual(TARGETS);
    expect(m.states).toEqual(STATES);
  });

  it('every state x target file exists and nothing extra sits beside them', () => {
    const want = STATES.flatMap((s) => TARGETS.map((t) => `${s}.${t}.json`)).concat('states.json').sort();
    expect(fs.readdirSync(DIR).sort()).toEqual(want);
  });

  for (const s of STATES) {
    describe(s, () => {
      it('S-parity: the four target files carry the same fixture and tree', () => {
        const files = TARGETS.filter((t) => have(s, t)).map((t) => readJson(file(s, t)));
        expect(files).toHaveLength(4);
        expect(parityOk(files.map((f) => f.rendered_tree))).toBe(true);
        expect(parityOk(files.map((f) => f.response_fixture))).toBe(true);
        TARGETS.forEach((t, i) => expect(files[i]?.target).toBe(t));
      });

      it('shape: pair + fingerprint, state and target named, bound fields only (node keys: report-honest lock)', () => {
        const decl = readJson(path.join(ROOT, 'scripts/surfaces/_schema/report-v2.decl.json'));
        const decls: Json[] = decl.sections.flatMap((x: Json) => x.fields);
        const kindOf = (name: string): string | undefined => decls.find((f) => f.name === name)?.source?.split(':')[0];
        for (const t of TARGETS) {
          expect(have(s, t)).toBe(true);
          const g = readJson(file(s, t));
          expect(g.state).toBe(s);
          expect(g.response_fixture).toBeTypeOf('object');
          expect(g.response_fixture).not.toBeNull(); // MF-16 D-5 (F-12 a): typeof null is 'object'
          expect(g.rendered_tree.nodes.length).toBeGreaterThan(0);
          for (const n of g.rendered_tree.nodes) {
            expect(kindOf(n.field)).toBe(n.source);
            if (g.rendered_tree.lifecycle !== undefined) { expect(n.field).toBe('status_text'); expect(n.source).toBe('content'); } // MF-16 D-5 (F-12 c): FE-28, the lifecycle node
            const base = decls.find((f) => f.name === n.field)?.label;
            expect(n.label).toBe(n.status === 'at_least' ? `${base}, at least` : base);
            if (n.field === 'status_text' && g.rendered_tree.lifecycle === undefined) {
              const texts = readJson(path.join(ROOT, 'scripts/surfaces/_schema/report-presentation.json')).status_text;
              const key = String(n.status).startsWith('not_permitted:') ? 'not_permitted' : n.status;
              expect(typeof n.value).toBe('string'); // MF-16 D-5 (F-12 f): a string, not whatever String() would turn into one
              expect(n.value).toBe(String(texts[key]).replace('{clause}', String(n.status).split(':')[1] ?? ''));
            }
            expect(sourceProblems(n.source)).toEqual([]); // the closed binding set, then the tranche-1 constraint (D-3 b)
          }
        }
      });

      it('fingerprint is fresh (response_fixture hash and the three input files)', () => {
        for (const t of TARGETS) {
          const g = readJson(file(s, t));
          const fx = crypto.createHash('sha256').update(JSON.stringify(g.response_fixture)).digest('hex').slice(0, 16);
          expect(g.fingerprint.response_fixture).toBe(fx);
          expect(Object.keys(g.fingerprint.files).sort()).toEqual(FP_FILES);
          for (const [p, h] of Object.entries(g.fingerprint.files as Record<string, string>)) expect(sha16(path.join(ROOT, p))).toBe(h);
        }
      });
    });
  }

  it('MF-16 D-5: the shared bind check (the one the gate runs) finds no problem in the committed goldens; the inline expects above stay for per-state attribution', () => {
    expect(bindProblems()).toEqual([]);
  });

  it('tranche-1 constraint is a subset of the binding set', () => {
    for (const k of TRANCHE1_KINDS) expect(SOURCE_KINDS).toContain(k);
    expect(SOURCE_KINDS).not.toContain('made_up_kind');
  });

  it('RED fixture: a source outside binding-sources, or outside the tranche-1 subset, is caught', () => {
    expect(sourceProblems('content')).toEqual([]);
    expect(sourceProblems('made_up_kind').join()).toContain('not in binding-sources.json');
    expect(sourceProblems('parcels').join()).toContain('tranche-1 constraint'); // in the binding set, not in tranche 1
    expect(sourceProblems('parcels').join()).not.toContain('not in binding-sources.json');
  });

  it('RED fixture: a tree that differs from its siblings is caught by the parity check', () => {
    const a = { nodes: [{ field: 'gfa_flat_m2', value: '1 m2' }] };
    const b = { nodes: [{ field: 'gfa_flat_m2', value: '2 m2' }] };
    expect(parityOk([a, a, a, a])).toBe(true);
    expect(parityOk([a, a, b, a])).toBe(false);
  });
});
