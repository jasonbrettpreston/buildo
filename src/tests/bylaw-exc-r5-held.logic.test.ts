// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-76 A1 (namedTypes), M-75 (corrections)
// HELD on R5-1: the street-name exemption of the any_with_named_type check is a drafted recommendation, not yet ruled.
// A building-type word that is part of a street name ("500 Duplex Ave.") is not a named building type.
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const mod = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);

describe('R5-1 (HELD): namedTypes ignores a type word that is a street name', async () => {
  const C = await mod('scripts/analysis/bylaw/clause.mjs');
  const vocab = { building_type: { detached_house: {}, duplex: {}, townhouse: {} } };
  it('"On 500 Duplex Ave." names no building type', () => {
    expect(C.namedTypes('On 500 Duplex Ave., former City of Toronto by-laws 184-69.', vocab)).toEqual([]);
  });
  it('a real mention of a duplex still counts, also beside an address', () => {
    expect(C.namedTypes('A duplex is permitted on 500 Duplex Ave.', vocab)).toEqual(['duplex']);
    expect(C.namedTypes('The maximum height is 9.5 metres for a detached house.', vocab)).toEqual(['detached_house']);
  });
});
