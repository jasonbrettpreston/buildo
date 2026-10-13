// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §9 G-XREF, §6.5 (declared spans); docs/specs/01-pipeline/69a_mcbylaw_register.md M-83
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs modules / seed JSON
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const TX = await load('scripts/analysis/bylaw/text.mjs');
const FX = await load('scripts/analysis/bylaw/authored-fixtures.mjs');
const cites = (t: string): string[] => TX.extractRefs(t).map((r: Json) => r.citation);

describe('W-2 numbering illustration is not a cross-reference', () => {
  it('a. 1.20.1(1) worked example yields no citations', () => {
    expect(cites('(1) By-law Structure and Numbering This By-law is divided into parts using a numeric decimal system as follows: 20. Chapter 20.10 Section 20.10.30 Article 20.10.30.15 Clause')).toEqual([]);
  });

  it('b. 1.20.2(2) example text yields no citations', () => {
    expect(cites('(2) Reference to a Sub-section of a Regulation If reference is made to a sub-section of a regulation, the sub-section itself may be referred to for the sake of brevity. For example, "20.10.30.15" would be Clause 15 of Article 30 of Section 10 of Chapter 20, but may be referred to as "Clause 20.10.30.15"; so too "20.10.30.15(1)" may be referred to as "regulation 20.10.30.15(1)".')).toEqual([]);
  });

  it('c. text before the marker is still scanned', () => {
    expect(cites('Despite regulation 600.60.10(1), the by-law is divided using a numeric decimal system as follows: 20.10.30')).toEqual(['600.60.10(1)']);
  });

  it('d. only the exact "20.10.30.15" example is skipped', () => {
    expect(cites('For example, 10.5.40.10(1) applies; see Chapter 800')).toEqual(['10.5.40.10(1)', 'Chapter 800']);
  });

  it('e. live slice rows 1.20.1(1) and 1.20.2(2) carry no refs', () => {
    const rows = FX.liveSlice().rows;
    expect(rows.find((r: Json) => r.regulation_id === '1.20.1(1)').refs.length).toBe(0);
    expect(rows.find((r: Json) => r.regulation_id === '1.20.2(2)').refs.length).toBe(0);
  });

  it('f. two illustration markers are declared', () => {
    expect(TX.REF_ILLUSTRATIONS.length).toBe(2);
  });
});
