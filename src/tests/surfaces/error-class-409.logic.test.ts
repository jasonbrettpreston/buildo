// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b.2 (the binding standard, dated note 2026-11-10 (MF-54): the closed
//            error-class list gains 409), docs/specs/02-web-admin/128_surface_standard_policy.md §6 ASK-24 (the §4 escalation record),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-31 (descriptor valid), FE-32 (contract errors segment).
//
// MF-54 · McFrontend queue · lane G (operator 2026-11-10, answer c: "c. yes"). The closed list errors.classes[].class in
// scripts/surfaces/_schema/surface.schema.json gains 409, a conflict the client must reload for (a stale updated_at); the two contracts that
// return 409 (contract_admin_offer_upsert STALE_OFFER, contract_admin_advertiser_upsert ADVERTISER_ID_TAKEN) declare it in its own class row,
// no longer inside the 400 row. The list stays closed: a planted unknown class still fails the generated validator.
// Not an FE lock of its own. No DB, no network.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateDescriptor } from '../../lib/surfaces/generated/validate-descriptor.mjs';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- descriptor JSON
const REPO = path.resolve(__dirname, '../../..');
const read = (rel: string): string => fs.readFileSync(path.join(REPO, rel), 'utf8');
const CONTRACTS = 'scripts/surfaces/parcel_admin/F04/contracts';
const offer: Json = JSON.parse(read(`${CONTRACTS}/contract_admin_offer_upsert.descriptor.json`));
const advertiser: Json = JSON.parse(read(`${CONTRACTS}/contract_admin_advertiser_upsert.descriptor.json`));

/** A live contract descriptor with its errors.classes replaced. */
const withClasses = (d: Json, classes: Json[]): Json => ({ ...d, errors: { ...d.errors, classes } });
const rowOf = (d: Json, cls: string): Json | undefined => (d.errors.classes as Json[]).find((c) => c.class === cls);

describe('MF-54: the closed error-class list gains 409', () => {
  it('the live contracts are valid as committed (the base the plants below start from)', () => {
    expect(validateDescriptor(offer).errors).toEqual([]);
    expect(validateDescriptor(advertiser).errors).toEqual([]);
  });

  it('a 409 class row validates', () => {
    expect(validateDescriptor(withClasses(offer, [{ class: '409', ui: 'reload' }])).errors).toEqual([]);
  });

  it('the list stays closed: a planted unknown class fails, and so does a numeric 409', () => {
    const planted = validateDescriptor(withClasses(offer, [{ class: '418', ui: 'x' }]));
    expect(planted.valid).toBe(false);
    expect(planted.errors.some((e: string) => e.startsWith('/errors/classes/0/class '))).toBe(true);
    expect(validateDescriptor(withClasses(offer, [{ class: 409, ui: 'x' }])).valid).toBe(false);
  });

  it('the generated descriptor type names 409 in the class union', () => {
    const line = read('src/lib/surfaces/generated/surface-descriptor.d.ts').split('\n').find((l) => /^\s*class: "400"/.test(l));
    expect(line).toBeDefined();
    expect(line).toContain('"409"');
  });

  it.each([
    ['contract_admin_offer_upsert', offer, 'STALE_OFFER'],
    ['contract_admin_advertiser_upsert', advertiser, 'ADVERTISER_ID_TAKEN'],
  ])('%s declares its 409 in a 409 row, and its 400 row no longer carries it', (_id, d, code) => {
    expect(rowOf(d, '409')?.ui).toContain(code);
    expect(rowOf(d, '400')?.ui).not.toContain(code);
    expect(rowOf(d, '400')?.ui).not.toContain('409');
  });
});
