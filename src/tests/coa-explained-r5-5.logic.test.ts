// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-308 (explained data flag), M-287 (vocab.explained_differences); docs/specs/01-pipeline/68_mcbylaw_standard.md §7.5
// HELD on R5-5 (recommendation awaiting the operator): a DATA-class explained difference is scoped to named notice rows and a parcel id,
// so the same clause and figures on any other notice stay DIFFER (a real error is never hidden).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const VOCAB = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/vocab.json'), 'utf8'));
const E = (): Promise<Json> => import(pathToFileURL(path.join(ROOT, 'scripts/analysis/bylaw-validation/coa-explained.mjs')).href);

describe('R5-5 (HELD): the Johnston DATA flag is scoped to its notices and parcel', () => {
  it('the named rows are explained', async () => {
    const { explainRow } = await E();
    const ok = (notice: string, n: number, clause: string, target: string) =>
      explainRow(VOCAB, clause, target, 1.5, 0.9, { notice, n, parcelId: '5128608' });
    expect(ok('A0255/26NY', 2, '900.3.10(559)(A)', 'side_setback_m')?.class).toBe('DATA');
    expect(ok('A0263/21NY', 1, '900.3.10(559)(A)', 'side_setback_m')?.class).toBe('DATA');
    expect(ok('A0263/21NY', 2, '10.5.40.50(2)', 'platform_side_setback_m')?.class).toBe('DATA');
  });
  it('the same clause and figures on another notice, another row or another parcel stay unexplained', async () => {
    const { explainRow } = await E();
    expect(explainRow(VOCAB, '900.3.10(559)(A)', 'side_setback_m', 1.5, 0.9, { notice: 'A9999/26XX', n: 2, parcelId: '5128608' })).toBeNull();
    expect(explainRow(VOCAB, '900.3.10(559)(A)', 'side_setback_m', 1.5, 0.9, { notice: 'A0255/26NY', n: 3, parcelId: '5128608' })).toBeNull();
    expect(explainRow(VOCAB, '900.3.10(559)(A)', 'side_setback_m', 1.5, 0.9, { notice: 'A0255/26NY', n: 2, parcelId: '1' })).toBeNull();
    expect(explainRow(VOCAB, '900.3.10(559)(A)', 'side_setback_m', 1.5, 0.9)).toBeNull();
  });
  it('a DATA entry without a notice list and a parcel id is refused at load', async () => {
    const { checkExplainedDifferences } = await E();
    const bad = JSON.parse(JSON.stringify(VOCAB));
    delete bad.explained_differences['900.3.10(559)(A)'].rows;
    const ids = new Set(['M-308', 'M-287']);
    expect(checkExplainedDifferences(VOCAB, ids)).toEqual([]);
    expect(checkExplainedDifferences(bad, ids).join(' ')).toMatch(/rows/);
  });
});
