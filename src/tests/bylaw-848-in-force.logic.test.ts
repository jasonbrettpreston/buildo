// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-481 (dated note 2026-11-11: D-1 b, By-law 848-2025 in force from
//            2025-07-24 and the reading row reading:suite_fsi_release_848, confidence medium), M-182(4); docs/specs/01-pipeline/68_mcbylaw_standard.md §6
//
// MB-27 increment 4 · McBylaws queue · lane E · RED FIRST (on the parent 848-2025 is not_verified and the reading row is absent).
// Card ~/Buildo-scratch/mcbylaws/inc4/cards/CARD-848-INFORCE.md; research ~/Buildo-scratch/mcbylaws/inc4/mcproof/D1-RESEARCH-20261111.md.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const AM = await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/bylaw/amendments.mjs')).href);

describe('D-1 b: By-law 848-2025 is recorded in force (the 849-2025 form)', () => {
  it('statuses["848-2025"] is in_force, enacted and in force 2025-07-24, from law0848.pdf, and passes statusProblems', () => {
    const s = readJson('scripts/seeds/bylaw/amendments.json').statuses['848-2025'] as Json;
    expect([s.status, s.enacted_on, s.in_force_on, s.verified_on]).toEqual(['in_force', '2025-07-24', '2025-07-24', '2026-11-11']);
    expect(s.source_url).toBe('https://www.toronto.ca/legdocs/bylaws/2025/law0848.pdf');
    expect(s.source_sha256).toBe('3458ed2fdbde119dc5cee29963578b50d5bf700eb01d015a76af9e32a44ff0ca');
    expect(s.basis).toBe('M-481');
    expect(String(s.in_force_trigger)).toMatch(/D-1 b/);
    expect(AM.statusProblems(s)).toEqual([]);
  });
  it('the generated amendment index reads the R FSI release units in force (worst status per row; RD and RS stay not_verified through 66-2024)', () => {
    const idx = readJson('docs/reference/maxbld-amendment-index.json').index as Json;
    expect(['(A)', '(B)', '(C)', '(D)'].map((x) => idx[`10.10.40.40(1)#(1)${x}`])).toEqual(['in_force', 'in_force', 'in_force', 'in_force']);
    expect(idx['10.20.40.40(1)#(1)(C)']).toBe('not_verified');
  });
});

describe('D-1 b / D-0: the suite FSI release carries a medium confidence reading row citing C15 and A0464 (M-481)', () => {
  it('reading:suite_fsi_release_848 is an on reading row, confidence medium, evidence naming C15 and A0464/26TEY', () => {
    const r = (readJson('scripts/seeds/bylaw/switchboard.json').rows as Json[]).find((x) => x.id === 'reading:suite_fsi_release_848') as Json;
    expect([r && r.kind, r && r.state, r && r.confidence]).toEqual(['reading', 'on', 'medium']);
    expect(/\bC15\b/.test(r.evidence) && r.evidence.includes('A0464/26TEY')).toBe(true);
    expect(String(r.ruling)).toMatch(/D-1 b/);
  });
});
