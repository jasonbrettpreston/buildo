// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.5 step 5, §6.6.D
//             docs/specs/01-pipeline/84_lifecycle_phase_engine.md §7 (TS↔JS dual-path)
//
// WF1 R5.3 (2026-05-14): SUPERSEDES the R5.1 stub (commit cea6d47) whose
// asserted contract (`'uncategorized'` enum, empty-array sentinel, `sub_type`
// param that doesn't exist on coa_applications) violated Spec 42 §6.6.D
// enums + R8 plan-review FAIL-1/-2.
//
// Pure-function tests for the CoA scope classifier. Locks in:
//   - Spec 42 §6.6.D enum conformance (no `'other'`, `'VarianceOnly'`,
//     `'ChangeOfUse'`, `'uncategorized'`)
//   - NULL sentinel for no-keyword-match (not empty array)
//   - JS/TS dual-path parity on a 15-row fixture matrix
//   - Live R0-audit sample regression (5 actual CoA descriptions)

import { describe, it, expect } from 'vitest';
import { classifyCoaScope } from '@/lib/classification/coa-scope-classifier';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jsLib: any = require('../../scripts/lib/coa-scope-classifier');

const ALLOWED_CLASSES = new Set(['residential', 'commercial', 'institutional', 'mixed']);
const ALLOWED_PROJECT_TYPES = new Set([
  'NewConstruction',
  'Addition',
  'Alteration',
  'Demolition',
  'Severance',
  'Mixed',
]);

describe('coa-scope-classifier — Spec 42 §6.6.D enum conformance', () => {
  it('coa_type_class is always one of {residential, commercial, institutional, mixed} or null', () => {
    const fixtures = [
      'To construct a new dwelling.',
      'To permit the use of a personal service shop.',
      'To construct an addition to the rear of the existing dwelling.',
      'To adjust the parking standards for the proposed buildings.',
      'Build a new school.',
      'To convert a warehouse into a residential apartment building.',
      'minor variance for setback',
      '',
      'xyz',
    ];
    for (const desc of fixtures) {
      const out = classifyCoaScope({ description: desc });
      expect(out.coa_type_class === null || ALLOWED_CLASSES.has(out.coa_type_class as string)).toBe(true);
    }
  });

  it('project_type is always one of {NewConstruction, Addition, Alteration, Demolition, Severance, Mixed} or null', () => {
    const fixtures = [
      'To construct a new dwelling.',
      'To construct a rear two-storey addition.',
      'To alter the existing dwelling.',
      'To demolish the existing dwelling.',
      'Consent to sever the lot.',
      'To construct a new dwelling and demolish the existing garage.',
      'minor variance for setback',
      '',
    ];
    for (const desc of fixtures) {
      const out = classifyCoaScope({ description: desc });
      expect(out.project_type === null || ALLOWED_PROJECT_TYPES.has(out.project_type as string)).toBe(true);
    }
  });

  it('never emits "other", "uncategorized", "VarianceOnly", or "ChangeOfUse" (R8 FAIL-1 fix)', () => {
    const provocative = [
      'minor variance for setback only',
      'permit the use of a personal service shop',
      'convert garage into living space',
      'adjust parking standards',
      'random text',
    ];
    for (const desc of provocative) {
      const out = classifyCoaScope({ description: desc });
      expect(out.coa_type_class).not.toBe('other');
      expect(out.coa_type_class).not.toBe('uncategorized');
      expect(out.project_type).not.toBe('VarianceOnly');
      expect(out.project_type).not.toBe('ChangeOfUse');
      expect(out.project_type).not.toBe('unclassified');
    }
  });
});

describe('coa-scope-classifier — NULL sentinel for scope_tags (R8 FAIL-2 fix)', () => {
  it('returns scope_tags=null (not []) when description is empty', () => {
    expect(classifyCoaScope({ description: '' }).scope_tags).toBeNull();
    expect(classifyCoaScope({ description: null }).scope_tags).toBeNull();
    expect(classifyCoaScope({ description: undefined }).scope_tags).toBeNull();
  });

  it('returns scope_tags=null when no keyword matches', () => {
    const out = classifyCoaScope({ description: 'random nonsense text with no relevant terms' });
    expect(out.scope_tags).toBeNull();
  });

  it('returns scope_tags as non-empty sorted array when keywords match', () => {
    const out = classifyCoaScope({ description: 'To construct a new dwelling.' });
    expect(Array.isArray(out.scope_tags)).toBe(true);
    expect(out.scope_tags!.length).toBeGreaterThan(0);
    expect(out.scope_tags).toEqual([...out.scope_tags!].sort());
  });
});

describe('coa-scope-classifier — live R0 sample regression', () => {
  it('classifies "construct new dwelling" → residential / NewConstruction', () => {
    const out = classifyCoaScope({ description: 'To construct a new dwelling.' });
    expect(out.coa_type_class).toBe('residential');
    expect(out.project_type).toBe('NewConstruction');
    expect(out.scope_tags).toContain('dwelling');
    expect(out.scope_tags).toContain('residential');
  });

  it('classifies "rear addition + third storey + secondary suite" → residential / Mixed-or-Addition', () => {
    const out = classifyCoaScope({
      description:
        'To alter the existing two-storey detached dwelling by constructing a rear two-storey addition, a complete third storey addition, and to construct a secondary suite within the basement with a walkout',
    });
    expect(out.coa_type_class).toBe('residential');
    // 2+ DISTINCT verbs (alter + addition) → Mixed by design
    expect(['Addition', 'Mixed', 'Alteration']).toContain(out.project_type);
    expect(out.scope_tags).toContain('dwelling');
    expect(out.scope_tags).toContain('rear-addition');
    expect(out.scope_tags).toContain('secondary-suite');
    expect(out.scope_tags).toContain('basement');
    expect(out.scope_tags).toContain('walkout');
  });

  it('classifies "personal service shop" → commercial / Alteration + change-of-use tag', () => {
    const out = classifyCoaScope({
      description: 'To permit the use of a personal service shop (esthetician) within the two-storey building.',
    });
    expect(out.coa_type_class).toBe('commercial');
    expect(out.project_type).toBe('Alteration');
    expect(out.scope_tags).toContain('change-of-use');
    expect(out.scope_tags).toContain('service-shop');
  });

  it('classifies "adjust parking standards" → null class / Alteration + parking tag', () => {
    const out = classifyCoaScope({ description: 'To adjust the parking standards for the proposed buildings.' });
    expect(out.coa_type_class).toBeNull();
    expect(out.project_type).toBe('Alteration');
    expect(out.scope_tags).toContain('parking');
  });

  it('classifies "consent to sever lot" → Severance', () => {
    const out = classifyCoaScope({ description: 'Consent to sever the property into two lots.' });
    expect(out.project_type).toBe('Severance');
    expect(out.scope_tags).toContain('severance');
  });
});

describe('coa-scope-classifier — renovation regex consistency (WF3 #r5-3-observability-fixes BUG-2)', () => {
  it('"renovated dwelling" fires both project_type=Alteration AND renovation scope tag', () => {
    // R8 follow-up review BUG-2: prior regex `/\brenovat(e|ion|ing)\b/i` missed
    // "renovated" / "renovates" past tense, so project_type fired (via the
    // ALTERATION_PATTERNS catch-all `\brenovat\w*\b`) but the `renovation`
    // scope_tag did NOT. The fix makes both regexes use the same catch-all.
    const out = classifyCoaScope({ description: 'Permit use of the renovated dwelling for a secondary suite.' });
    expect(out.project_type).toBe('Alteration');
    expect(out.scope_tags).toContain('renovation');
  });

  it('"renovates the office" fires renovation scope tag', () => {
    const out = classifyCoaScope({ description: 'Owner renovates the office space.' });
    expect(out.scope_tags).toContain('renovation');
  });
});

describe('coa-scope-classifier — Mixed type-class precedence', () => {
  it('residential + commercial keywords → mixed (per spec enum)', () => {
    const out = classifyCoaScope({
      description: 'Convert the office in the basement of the dwelling into a retail space.',
    });
    expect(out.coa_type_class).toBe('mixed');
  });

  it('pure commercial → commercial (no residential signal)', () => {
    const out = classifyCoaScope({ description: 'Variance for retail signage on warehouse facade.' });
    expect(out.coa_type_class).toBe('commercial');
  });

  it('pure institutional → institutional', () => {
    const out = classifyCoaScope({ description: 'Construct a school addition with parking variance.' });
    expect(out.coa_type_class).toBe('institutional');
  });
});

describe('coa-scope-classifier — JS/TS dual-path parity (Spec 84 §7)', () => {
  const fixtures = [
    { description: 'To construct a new dwelling.' },
    { description: 'To construct a rear two-storey addition.' },
    { description: 'To alter the existing dwelling.' },
    { description: 'To demolish the existing dwelling.' },
    { description: 'Consent to sever the lot.' },
    { description: 'To construct a new dwelling and demolish the existing garage.' },
    { description: 'To permit the use of a personal service shop.' },
    { description: 'minor variance for setback' },
    { description: 'To alter the office building.' },
    { description: 'To build a new school.' },
    { description: 'To extend the residential building into the commercial space.' },
    { description: 'Convert the warehouse into apartments.' },
    { description: '' },
    { description: 'xyz' },
    { description: 'fence variance' },
    // structure_type-bearing fixtures (4th output — keep dual-path parity honest)
    { description: 'To construct a new detached dwelling.' },
    { description: 'Semi-detached dwelling containing two residential dwelling units.' },
    { description: 'New mixed-use building with retail and apartments above.' },
    { description: 'Convert dwelling into a place of worship.' },
    { description: 'Legalize the existing detached garage.' },
  ];

  for (const f of fixtures) {
    const labelDesc = f.description.length === 0 ? '(empty)' : f.description.substring(0, 50);
    it(`TS and JS produce identical output for "${labelDesc}"`, () => {
      const tsOut = classifyCoaScope(f);
      const jsOut = jsLib.classifyCoaScope(f);
      expect(jsOut).toEqual(tsOut);
    });
  }
});

describe('coa-scope-classifier — structure_type archetype mapping (Spec 83 §3.A)', () => {
  const cases: Array<[string, string | null]> = [
    ['To construct a new detached dwelling.', 'SFD - Detached'],
    ['Alter the existing semi-detached dwelling.', 'SFD - Semi-Detached'],
    ['Construct a new townhouse block.', 'SFD - Townhouse'],
    ['Construct stacked townhouses.', 'Stacked Townhouses'],
    ['Construct a new duplex.', '2 Unit - Detached'],
    ['Semi-detached dwelling containing two residential dwelling units.', '2 Unit - Semi-detached'],
    ['Construct a new triplex dwelling.', '3+ Unit - Detached'],
    ['New detached building with 8 residential units.', 'Multiple Unit Building'],
    ['Alterations to a condominium building.', 'Apartment Building'],
    ['Convert the existing house into three dwelling units.', 'Converted House'],
    ['Construct a garden suite in the rear yard.', 'Laneway / Rear Yard Suite'],
    ['New medical office building.', 'Medical/Dental Office'],
    ['Interior alterations to existing office.', 'Office'],
    ['To permit a restaurant on the ground floor.', 'Restaurant 30 Seats or Less'],
    ['New industrial warehouse.', 'Industrial'],
    ['Addition to retail store.', 'Retail Store'],
    ['New elementary school.', 'Elementary School'],
    ['Addition to the university campus building.', 'University'],
    ['Expansion of the hospital.', 'Hospital'],
    ['Convert dwelling into a place of worship.', 'Place of Worship'],
    ['New mixed-use building with retail and apartments above.', 'Mixed Use/Res w Non Res'],
    // Output-review folds (edge cases):
    ['Construct a duplex within the existing multiplex site.', '2 Unit - Detached'], // explicit plex count wins over "multiplex" keyword
    ['New detached two-unit building.', '2 Unit - Detached'],                        // hyphenated unit count
    ['Construct a new detached dwelling and a detached garage.', 'SFD - Detached'],  // garage does not kill the detached-dwelling signal
    // Guards + honest under-emission (null, never a default-guess):
    ['Legalize the existing detached garage.', null], // accessory, not an SFD
    ['Alter the existing dwelling.', null],            // no form/unit keyword
    ['minor variance for setback', null],
    ['', null],
  ];
  for (const [desc, expected] of cases) {
    it(`"${(desc.substring(0, 48) || '(empty)')}" → ${expected ?? 'null'}`, () => {
      expect(classifyCoaScope({ description: desc }).structure_type).toBe(expected);
    });
  }
});

describe('coa-scope-classifier — structure_type drift-lock vs scope_intensity_matrix (mig 163)', () => {
  // Every archetype the classifier can emit MUST exist in the matrix vocab (Spec 83
  // §3.A) — else the cost model safe-skips on it. Derive the allow-set from migration
  // 163's INSERT tuples (the vocab owner), NOT from memory.
  const fs = require('node:fs');
  const path = require('node:path');
  const migSql: string = fs.readFileSync(
    path.resolve(__dirname, '../../migrations/163_scope_intensity_matrix_production_vocab.sql'),
    'utf-8',
  );
  // INSERT tuples are ('<permit_type>', '<structure_type>', <alloc>) — requiring the
  // numeric 3rd value distinguishes them from the 2-string DELETE tuples AND from the
  // header comment's example vocab lists (which have no numeric allocation).
  const vocab = new Set<string>();
  const re = /\(\s*'(?:[^']*)'\s*,\s*'([^']*)'\s*,\s*[\d.]+\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(migSql)) !== null) vocab.add(m[1]!);

  it('migration 163 yields the 25-value structure_type vocab', () => {
    expect(vocab.size).toBe(25);
  });

  it('every classifier-emitted structure_type ∈ matrix vocab', () => {
    const descs = [
      'new detached dwelling', 'semi-detached dwelling', 'townhouse', 'stacked townhouses',
      'duplex', 'semi-detached with two dwelling units', 'triplex', 'detached building with 8 units',
      'condominium building', 'convert house into 3 units', 'garden suite', 'medical office',
      'office', 'restaurant', 'industrial warehouse', 'retail store', 'elementary school',
      'university building', 'hospital', 'place of worship', 'mixed-use retail and apartments',
    ];
    const emitted = new Set<string>();
    for (const d of descs) {
      const st = classifyCoaScope({ description: d }).structure_type;
      if (st) emitted.add(st);
    }
    expect(emitted.size).toBeGreaterThan(15);
    for (const v of emitted) expect(vocab.has(v)).toBe(true);
  });
});
