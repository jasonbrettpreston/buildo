// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md MB-58 (queue ~/Buildo/.cursor/MCBYLAWS-QUEUE.md: the notice parser never carries an applicant's name), CHAT-166 (no personal names in files)
//
// MB-58: an "Applicant:" label is a name line like Agent: and Owner(s):. It splits the header, so the name never stays in the address (or any) field, and the name's words are scrubbed
// from the free text. Synthetic placeholder words only (no real names).
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { createRequire } from 'node:module';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .cjs surface
const CP = createRequire(import.meta.url)(path.join(process.cwd(), 'scripts/analysis/bylaw-validation/coa-parse.cjs'));
const BODY = ['PURPOSE OF THE APPLICATION', 'To construct a laneway suite for Testapplicant Placeholder at the rear.', 'REQUESTED VARIANCE(S) TO THE ZONING BY-LAW', '1. Section 150.8.60.40(1)(A), By-law 569-2013',
  'The maximum permitted height of an ancillary building containing a laneway suite is 4 m.', 'The height of the ancillary building will be 7.19 m.'];
const carries = (rec: Json): boolean => JSON.stringify(rec).toLowerCase().split(/[^a-z]+/).some((w) => w === 'testapplicant' || w === 'placeholder');

describe('MB-58: the notice parser never carries an applicant name', () => {
  it('an Applicant label on the address line does not leave the name in the address', () => {
    const rec = CP.parse(['File Number: A0001/26ZZ Property Address: 1 EXAMPLE AVE Applicant: Testapplicant Placeholder Ward: 99', ...BODY].join('\n')).record;
    expect(rec.address).toBe('1 EXAMPLE AVE');
    expect(carries(rec)).toBe(false);
  });
  it('an Applicant line (with a continuation line) is a name line: no field carries it, the purpose is scrubbed', () => {
    const rec = CP.parse(['File Number: A0001/26ZZ', 'Property Address: 1 EXAMPLE AVE', 'Applicant: Testapplicant', 'Placeholder', 'Ward: 99', ...BODY].join('\n')).record;
    expect(rec.address).toBe('1 EXAMPLE AVE');
    expect(carries(rec)).toBe(false);
  });
  it('the existing Agent and Owner(s) behaviour is unchanged', () => {
    const rec = CP.parse(['File Number: A0001/26ZZ Property Address: 1 EXAMPLE AVE Agent: Testapplicant Placeholder Owner(s): Another Person Ward: 99', ...BODY].join('\n')).record;
    expect(rec.address).toBe('1 EXAMPLE AVE');
    expect(carries(rec)).toBe(false);
  });
});
