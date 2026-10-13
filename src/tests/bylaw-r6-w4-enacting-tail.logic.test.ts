// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §9 G-TEXT; docs/specs/01-pipeline/69a_mcbylaw_register.md M-81
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs modules / seed JSON
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const SL = await load('scripts/analysis/bylaw/slice.mjs');
const FX = await load('scripts/analysis/bylaw/authored-fixtures.mjs');

const T = '1. The lands are outlined. 2. Zoning By-law 569-2013, as amended, is further amended by adding Article 900.2.10 Exception Number 9 so that it reads: (9) Exception 9 Site Specific Provisions: (A) The minimum lot frontage is 8.0 metres; and (B) Delete Regulation 900.2.10(942) in its entirety. 3. Nothing in By-law 1-2024 will prevent the erection of a building filed on or prior to February 7, 2024. 4. Nothing in By-law 1-2024 will prevent the use of land. Enacted and passed on January 1, 2024.';

describe('R6 W-4 — an enacting row ends at the next section number, not at the end of the by-law', () => {
  const scope = { carve: new Map(), sections: new Set(['900.2']) };
  const r = SL.sliceEnacting({ bylaw: '1-2024', scope, text: T });

  it('(a) one row for the amended article', () => {
    expect(r.rows.map((x: Json) => x.regulation_id)).toEqual(['900.2.10@1-2024']);
  });

  it('(b) the row stops at the amending section, excluding the by-law\u2019s own later provisions', () => {
    expect(r.rows[0].verbatim.endsWith('Delete Regulation 900.2.10(942) in its entirety.')).toBe(true);
    expect(r.rows[0].verbatim.includes('Nothing in By-law')).toBe(false);
    expect(T.slice(r.rows[0].start, r.rows[0].end)).toBe(r.rows[0].verbatim);
  });

  it('(c) no leaked provision numbers become literals', () => {
    expect(r.rows[0].literals.map((l: Json) => l.raw)).toEqual(['9', '9', '8.0 metres']);
  });

  it('(d) the last clause does not contain the leaked provisions', () => {
    expect(r.rows[0].clauses[r.rows[0].clauses.length - 1].text.includes('Nothing')).toBe(false);
  });

  it('(e) the live 900.2.10(912)@63-2024 row no longer captures provisions 32-35', () => {
    const row = FX.liveSlice().rows.find((x: Json) => x.regulation_id === '900.2.10(912)@63-2024');
    expect(row.end - row.start).toBe(1720);
    expect(row.verbatim.includes('32. Nothing in By-law 63-2024')).toBe(false);
    expect(row.verbatim.endsWith('(N) Delete Regulation 900.2.10(942) in its entirety.')).toBe(true);
  });
});
