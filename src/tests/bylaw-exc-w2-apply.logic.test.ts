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
  it('"the front line" and "the front lot line" license front_setback_m (199 (A), 291 (G))', () => {
    expect(VOCAB.dsl_target.front_setback_m.patterns).toEqual(expect.arrayContaining(['the front line', 'the front lot line']));
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

describe('keying-cli rekey on a wave batch (EXC-W2-APPLY)', () => {
  it('rekey --batch W2 reaches the unit check (rekey_unit_unknown), not the planBatch refusal', async () => {
    const { spawnSync } = await import('node:child_process');
    const r = spawnSync(process.execPath, ['scripts/analysis/bylaw/keying-cli.mjs', 'rekey', '--batch', 'W2', '--shard', 'ch900_3/900.3.10.w2-s04', '--units', 'no-such-unit'], { cwd: ROOT, encoding: 'utf8' });
    const out = `${r.stdout}${r.stderr}`;
    expect(out).not.toContain('is planned by planWave');
  });
});
