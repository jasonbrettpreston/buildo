// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §7.1 (archetypes), §7.3 (calculation_handling), §10 stage 6 (adjudication);
//            docs/specs/01-pipeline/69a_mcbylaw_register.md M-317 (CHAT-61 family ruling + five numeric adjudications),
//            M-172 / M-169 (undetermined-condition disclosure), M-315 (exception 528 corrections)
//
// Lane EXC-W2-APPLY, operator CHAT-61 (2026-10-22, adjudication page W2). Red first:
//   - the five numeric adjudications are applied through keying-cli apply (adjudicator operator, citing CHAT-61);
//   - the vocab pattern additions the cards flagged ("the front line" / "the front lot line"; "with a parking space");
//   - keying rule 31 (building-history conditions on the existing-building route) is in the keyer briefs;
//   - exception 528's lawfully_existing token is gone from the ASSEMBLED unit (M-315), whatever the raw shard says.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const read = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const mod = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);
const VOCAB = read('scripts/seeds/bylaw/vocab.json');
const ADJ = read('scripts/seeds/bylaw/adjudications.json').adjudications as Json[];

const assembled = async (): Promise<Map<string, Json>> => {
  const V = await mod('scripts/analysis/bylaw/validate.mjs');
  const AU = await mod('scripts/analysis/bylaw/authored.mjs');
  const AG = await mod('scripts/analysis/bylaw/agree.mjs');
  const I = V.loadInputs({ root: ROOT });
  const ag = AG.checkAgree({ shards: AU.loadAuthored(ROOT), adjudications: I.adjudications, vocab: I.vocab });
  return AG.agreedUnits(ag);
};

describe('CHAT-61 vocabulary pattern additions', () => {
  it('"setback from the front line" / "setback from the front lot line" license front_setback_m (199 (A), 291 (G)); the loose bare forms are not patterns (verify-37 item 5)', () => {
    const p: string[] = VOCAB.dsl_target.front_setback_m.patterns;
    expect(p).toEqual(expect.arrayContaining(['setback from the front line', 'setback from the front lot line']));
    expect(p).not.toContain('the front line');
    expect(p).not.toContain('the front lot line');
  });
  it('the new patterns license the 199 and 291 clause texts and not a height-measurement or designation sentence', () => {
    const p: string[] = VOCAB.dsl_target.front_setback_m.patterns;
    const lic = (t: string): boolean => p.some((x) => t.toLowerCase().includes(x));
    expect(lic('The minimum building setback from the front line is 9.0 metres;')).toBe(true);
    expect(lic('the minimum building setback from the front lot line is 5.4 metres.')).toBe(true);
    expect(lic('between the average elevation of the ground along the front lot line and the highest point')).toBe(false);
    expect(lic('any portion of a building that is farther from the front lot line')).toBe(false);
    expect(lic('the longest of the lot lines separating the lot from a street is the front line')).toBe(false);
  });
  it('"with a parking space" licenses the lot condition ancillary_contains_parking_space (287 (E))', () => {
    expect(VOCAB.lot_condition.ancillary_contains_parking_space.patterns).toEqual(expect.arrayContaining(['containing a parking space', 'with a parking space']));
  });
});

describe('CHAT-61 five numeric adjudications', () => {
  const rec = (unit: string, field: string): Json | undefined => ADJ.find((e) => e.kind === 'disagreement' && e.unit === unit && e.field === field);
  const cases: Array<[string, 'a' | 'b', string[], string]> = [
    ['900.3.10(199)#(199)[SSP](A)', 'b', ['archetype', 'target', 'bound', 'numeric_expression'], 'CHAT-61.W2-199-A'],
    ['900.3.10(291)#(291)[SSP](G)', 'b', ['archetype', 'target', 'bound', 'numeric_expression'], 'CHAT-61.W2-291-G'],
    ['900.3.10(287)#(287)[SSP](E)', 'b', ['archetype', 'target', 'bound', 'numeric_expression'], 'CHAT-61.W2-287-E'],
    ['900.3.10(117)#(117)[SSP](D)', 'a', ['archetype', 'target', 'bound', 'numeric_expression'], 'CHAT-61.W2-117-D'],
    ['900.3.10(258)#(258)[SSP](D)', 'a', ['numeric_expression'], 'CHAT-61.W2-258-D'],
  ];
  for (const [unit, decision, fields, chat] of cases) {
    it(`${unit}: operator decision ${decision} on ${fields.join(', ')} citing ${chat}`, () => {
      for (const f of fields) {
        const r = rec(unit, f);
        expect(r, `${unit} ${f}`).toBeDefined();
        expect(r!.adjudicator).toBe('operator');
        expect(r!.decision).toBe(decision);
        expect(r!.reason).toContain(chat);
      }
    });
  }
  it('the assembled units carry the adjudicated values; 291 (G) keeps keyer A named_addresses scope', async () => {
    const u = await assembled();
    const g = (id: string): Json => u.get(id) as Json;
    expect(g('900.3.10(199)#(199)[SSP](A)')).toMatchObject({ archetype: 'LIMIT', target: 'front_setback_m', bound: 'min' });
    expect(g('900.3.10(291)#(291)[SSP](G)')).toMatchObject({ archetype: 'LIMIT', target: 'front_setback_m', bound: 'min', applies_to: { part: 'named_addresses', refs: ['1160 and 1162 Pharmacy Ave.'] } });
    expect(g('900.3.10(287)#(287)[SSP](E)')).toMatchObject({ archetype: 'LIMIT', target: 'side_setback_m', bound: 'min' });
    expect(g('900.3.10(117)#(117)[SSP](D)')).toMatchObject({ archetype: 'LIMIT', target: 'side_setback_m', bound: 'min' });
    expect(g('900.3.10(258)#(258)[SSP](D)')).toMatchObject({ archetype: 'LIMIT', target: 'required_lot_area_m2', bound: 'min' });
  });
});

describe('keying rule 31 — building-history conditions (operator CHAT-61 family ruling)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/analysis/bylaw/keying.mjs'), 'utf8');
  it('rule 31 follows rule 30 in the shared numbered rules block and names the existing-building route', () => {
    const i30 = src.indexOf('30. Rule 17 again');
    const i31 = src.indexOf('31. Building-history conditions');
    expect(i30).toBeGreaterThan(0);
    expect(i31).toBeGreaterThan(i30);
    const block = src.slice(i31, i31 + 1800);
    for (const t of ['relevance existing_building', 'existing_building_facts', 'lawfully_existing_status', 'If <the condition', 'pre-1953 FSI 0.69', 'as if the condition does not apply']) expect(block).toContain(t);
  });
});

describe('exception 528 (M-315): the assembled units carry no lawfully_existing token', () => {
  it('(A) and (B) have condition none and no lawfully_existing lot condition after the CHAT-50 corrections', async () => {
    const u = await assembled();
    for (const p of ['(A)', '(B)']) {
      const x = u.get(`900.3.10(528)#(528)[SSP]${p}`) as Json;
      expect(x, p).toBeDefined();
      expect(x.condition).toBe('none');
      expect(x.application.lot_conditions ?? []).not.toContain('lawfully_existing');
      expect(JSON.stringify([x.condition, x.application])).not.toContain('lawfully_existing');
      // the user INPUT name stays, as on the 10 sibling existed-on-enactment units (an input, not a condition token)
      expect(x.calculation_handling.user_inputs).toEqual(['lawfully_existing_status']);
    }
  });
});

describe('CHAT-67 (2026-10-22-batch-z2): 1434 (A) provenance and 258 (D) token', () => {
  it('1434 (A): the live correction on each of the four fields is a lane-labelled record citing CHAT-67.1434A; the values are unchanged', async () => {
    const live = (field: string): Json | undefined => {
      const rows = ADJ.filter((a) => a.kind === 'correction' && a.unit === '900.3.10(1434)#(1434)[SSP](A)' && a.field === field);
      const superseded = new Set(rows.map((a) => a.supersedes).filter(Boolean));
      return rows.find((a) => !superseded.has(a.id));
    };
    for (const f of ['archetype', 'requirement', 'calculation_handling', 'disclosure']) {
      const r = live(f);
      expect(r, f).toBeDefined();
      expect(r?.adjudicator).toBe('lane-exc-w2-apply');
      expect(r?.rule).toContain('CHAT-67.1434A');
    }
    const x = (await assembled()).get('900.3.10(1434)#(1434)[SSP](A)') as Json;
    expect([x.archetype, x.requirement, x.disclosure, x.calculation_handling.not_modelled_reason]).toEqual(['REQUIRE', 'comply_with_bylaw', 'none', 'needs_user_input']);
    expect(x.application.lot_conditions).toContain('lawfully_existing');
  });
  it('258 (D): no lawfully_existing token on the assembled unit (the 528 form, CHAT-67.258D); the user input name stays; the LIMIT is unchanged', async () => {
    const x = (await assembled()).get('900.3.10(258)#(258)[SSP](D)') as Json;
    expect(x).toBeDefined();
    expect(x.condition).toBe('none');
    expect(x.application.lot_conditions ?? []).not.toContain('lawfully_existing');
    expect(JSON.stringify([x.condition, x.application])).not.toContain('lawfully_existing');
    expect(x.calculation_handling.user_inputs).toEqual(['lawfully_existing_status']);
    expect([x.archetype, x.target ?? null]).toEqual(['LIMIT', 'required_lot_area_m2']);
    const live = ADJ.filter((a) => a.kind === 'correction' && a.unit === '900.3.10(258)#(258)[SSP](D)' && a.adjudicator === 'lane-exc-w2-apply');
    expect(live.length).toBe(3);
    for (const a of live) expect(a.rule).toContain('CHAT-67.258D');
  });
});

describe('keying-cli rekey on a wave batch (EXC-W2-APPLY)', () => {
  it('rekey --batch W2 reaches the unit check (rekey_unit_unknown), not the planBatch refusal', async () => {
    const { spawnSync } = await import('node:child_process');
    const r = spawnSync(process.execPath, ['scripts/analysis/bylaw/keying-cli.mjs', 'rekey', '--batch', 'W2', '--shard', 'ch900_3/900.3.10.w2-s04', '--units', 'no-such-unit'], { cwd: ROOT, encoding: 'utf8' });
    const out = `${r.stdout}${r.stderr}`;
    expect(out).not.toContain('is planned by planWave');
  });
});

describe('P5.12 building_history_permission — closed phrase set (operator CHAT-65.phrases)', () => {
  const PHRASES = [
    'keep or rebuild a semi-detached house or duplex',
    'add more than one secondary suite',
    'divide the house into a semi-detached pair',
    'build a rear addition up to FSI 0.69',
    'add above the first storey only within the required setbacks',
  ];
  const spec = fs.readFileSync(path.join(ROOT, 'docs/specs/01-pipeline/78_optimal_lot_configuration.md'), 'utf8');
  const row = spec.split('\n').find((l) => l.startsWith('| `building_history_permission` |')) ?? '';
  it('the Spec 78 row holds the four dated operator phrases as the closed {permission} alternatives, mapped per clause group, with no DRAFT mark ((D) moved to the undated code, CHAT-67.Dphrase)', () => {
    expect(row).not.toBe('');
    for (const p of PHRASES.slice(0, 4)) expect(row).toContain(p);
    expect(row).not.toContain('DRAFT');
    for (const m of ['(A) keep', '(B) add more', '(C) divide', '(E) build a rear']) expect(row).toContain(m);
  });
  it('the generated report schema carries the template with the closed alternatives and only the date slot besides', async () => {
    const schema = read('docs/reference/maxbld-report-v2.schema.json');
    const t = JSON.stringify(schema).includes('building_history_permission') ? JSON.stringify(schema) : '';
    expect(t).toContain('building_history_permission');
    for (const p of PHRASES.slice(0, 4)) expect(t).toContain(p);
    expect(t).not.toContain('{permission}');
  });
});

describe('P5.12 building_history_permission_undated — (D) is undated (operator CHAT-67.Dphrase)', () => {
  const UNDATED = 'If you are adding to an existing house, additions above the first storey must stay within the required setbacks';
  const spec = fs.readFileSync(path.join(ROOT, 'docs/specs/01-pipeline/78_optimal_lot_configuration.md'), 'utf8');
  const dated = spec.split('\n').find((l) => l.startsWith('| `building_history_permission` |')) ?? '';
  const undated = spec.split('\n').find((l) => l.startsWith('| `building_history_permission_undated` |')) ?? '';
  it('Spec 78 has a second P5.12 code whose template is exactly the operator phrase, no slots; the dated template no longer offers the (D) alternative', () => {
    expect(undated).toContain(`"${UNDATED}."`);
    expect(undated).toContain('CHAT-67.Dphrase');
    expect(undated).not.toMatch(/"[^"]*\{[^"]*"/);
    expect(dated).not.toContain('add above the first storey');
  });
  it('the generated report schema carries both codes; the undated template is the exact phrase', () => {
    const schema = read('docs/reference/maxbld-report-v2.schema.json');
    const t = schema['x-disclosure-templates'];
    expect(t.building_history_permission_undated.template).toBe(`${UNDATED}.`);
    expect(t.building_history_permission_undated.slots).toEqual([]);
    expect(JSON.stringify(t.building_history_permission)).not.toContain('above the first storey');
    expect(schema.$defs.disclosure_code.enum).toContain('building_history_permission_undated');
  });
  it('LC-52 lint passes the undated template (18 words, no plain-term glossary entry)', async () => {
    const LIB = await mod('scripts/analysis/bylaw/maxbld-trace-lib.mjs');
    expect(LIB.lintDisclosureTemplates(spec)).toEqual([]);
  });
});

describe('P5.12 lint reads one shown alternative per sentence (EXC-W2-APPLY, CHAT-65)', () => {
  it('a three-alternative slot is capped per shown sentence; a plain long template and an unglossed shown alternative still fail', async () => {
    const LIB = await mod('scripts/analysis/bylaw/maxbld-trace-lib.mjs');
    const alts = Array.from({ length: 5 }, (_, i) => `alternative ${'w '.repeat(18)}${i}`.trim()).join(' / ');
    const wrap = (tpl: string): string => `### P5.12 Disclosures\n| \`x_alt\` | "${tpl}" | M-1 |\n### P5.13`;
    expect(LIB.lintDisclosureTemplates(wrap(`If so, you may also {${alts}}.`))).toEqual([]);
    expect(LIB.lintDisclosureTemplates(wrap(`${'word '.repeat(50).trim()}`)).length).toBe(1);
    expect(LIB.lintDisclosureTemplates(wrap('If so, {keep it / add a floor / reach FSI 0.69}.')).some((p: string) => p.includes('FSI'))).toBe(true);
  });
});
