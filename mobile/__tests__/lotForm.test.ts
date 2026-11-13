/** @jest-environment node */
// SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md O-4, ML-4, the lot_form_user_override and lot_form_effective rows (dated note 2026-11-13)
//            docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4 (dated note 2026-11-13, SEMI-B)
//
// SEMI-B · the pure rules of the pre-report semi question (operator "semi all y" and "semi ask a", 2026-11-13): the question is asked ONLY in the
// unsure band; the three answers and what each writes to lot_form_user_override (yes -> semi_half, no -> detached, not sure -> nothing);
// the report is told the question was answered through a route param so it never asks twice; lotFormEffective = override ?? detected (P5.7, O-12).
import { ConsumerParcelLookupResultSchema } from '@/lib/schemas';
import {
  SEMI_ANSWERS,
  answerToOverride,
  lotFormEffective,
  needsSemiQuestion,
  reportRouteAfterAnswer,
  semiQuestionRoute,
} from '@/lib/lotForm';

const base = { match: null, candidates: [], warnings: [], parcel: null };
const form = (unsure: boolean, detected: 'semi_half' | 'detached' = 'semi_half') => ({ detected, basis: 'doubt_multi_parcel_abut' as const, unsure });

describe('lotForm (pure)', () => {
  it('the three answers, in the ruled order', () => {
    expect([...SEMI_ANSWERS]).toEqual(['yes', 'no', 'not_sure']);
  });
  it('the question route carries the lot id, encoded', () => {
    expect(semiQuestionRoute('PCL-1')).toBe('/(app)/parcel-tool/semi-question?parcelId=PCL-1');
    expect(semiQuestionRoute('a b/c')).toBe('/(app)/parcel-tool/semi-question?parcelId=a%20b%2Fc');
  });
  it('asks only in the unsure band (semi ask a): unsure true, no `semi` param', () => {
    expect(needsSemiQuestion({ ...base, lotForm: form(true) }, undefined)).toBe(true);
    expect(needsSemiQuestion({ ...base, lotForm: form(false) }, undefined)).toBe(false); // a clear semi goes straight to the report
    expect(needsSemiQuestion({ ...base, lotForm: form(false, 'detached') }, undefined)).toBe(false); // a clear detached lot too
  });
  it('never asks twice: a `semi` param on the report route means it was answered', () => {
    expect(needsSemiQuestion({ ...base, lotForm: form(true) }, 'answered')).toBe(false);
    expect(needsSemiQuestion({ ...base, lotForm: form(true) }, '')).toBe(true); // a stray value is not the sentinel: it asks, never skips
    expect(needsSemiQuestion({ ...base, lotForm: form(true) }, 'foo')).toBe(true);
  });
  it('an older server (no lotForm), a null block, or no data never asks', () => {
    expect(needsSemiQuestion({ ...base }, undefined)).toBe(false);
    expect(needsSemiQuestion({ ...base, lotForm: null }, undefined)).toBe(false);
    expect(needsSemiQuestion(undefined, undefined)).toBe(false);
  });
  it('answer -> lot_form_user_override: yes semi_half, no detached, not sure writes nothing', () => {
    expect(answerToOverride('yes')).toBe('semi_half');
    expect(answerToOverride('no')).toBe('detached');
    expect(answerToOverride('not_sure')).toBeNull();
  });
  it('the report route after an answer carries semi=answered and the override only when one is written', () => {
    expect(reportRouteAfterAnswer('PCL-1', 'yes')).toBe('/(app)/parcel-tool/PCL-1?semi=answered&lotFormOverride=semi_half');
    expect(reportRouteAfterAnswer('PCL-1', 'no')).toBe('/(app)/parcel-tool/PCL-1?semi=answered&lotFormOverride=detached');
    expect(reportRouteAfterAnswer('PCL-1', 'not_sure')).toBe('/(app)/parcel-tool/PCL-1?semi=answered');
  });
  it('lotFormEffective = override ?? detected (the shared pure function; mirrors src/lib/parcels/lot-form.ts)', () => {
    expect(lotFormEffective('semi_half', null)).toBe('semi_half');
    expect(lotFormEffective('semi_half', 'detached')).toBe('detached');
    expect(lotFormEffective('detached', 'semi_half')).toBe('semi_half');
    expect(lotFormEffective('detached', undefined)).toBe('detached');
  });
});

describe('the mobile mirror of the lookup block', () => {
  it('parses a payload with the block, without it (older server) and with null', () => {
    expect(ConsumerParcelLookupResultSchema.safeParse({ ...base, lotForm: form(true) }).success).toBe(true);
    expect(ConsumerParcelLookupResultSchema.safeParse({ ...base }).success).toBe(true);
    expect(ConsumerParcelLookupResultSchema.safeParse({ ...base, lotForm: null }).success).toBe(true);
  });
  it('refuses a block outside the contract', () => {
    expect(ConsumerParcelLookupResultSchema.safeParse({ ...base, lotForm: { detected: 'maybe', basis: 'o4_not_met', unsure: false } }).success).toBe(false);
    expect(ConsumerParcelLookupResultSchema.safeParse({ ...base, lotForm: { detected: 'semi_half', basis: 'x', unsure: false } }).success).toBe(false);
    expect(ConsumerParcelLookupResultSchema.safeParse({ ...base, lotForm: { ...form(true), extra: 1 } }).success).toBe(false);
  });
});
