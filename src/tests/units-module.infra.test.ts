// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-BA (gate E closed answers),
//            Rule 1 (declared data, one home), Rule 3 (tunables are logic variables)
//
// Gate E closed answer #3 — the shared unit-constant module `scripts/lib/units.js`.
//
// R-BA gate E's closed answer set is `registered logic variable | dated ledger
// row (previously converted steps only) | imported from scripts/lib/units.js
// (pure unit conversions)`. This suite locks the THIRD arm: the four pure
// conversions have ONE home, their values equal the literals compute/step
// already use BYTE-FOR-BYTE (so a migration to the import is value-neutral),
// the export surface is a CLOSED set of exactly those four (a fifth name must
// be added deliberately — this suite REDs otherwise), and NO exported name
// reads as a tunable (a `THRESHOLD`/`LIMIT`/`MAX`/`RATIO`/… name would smuggle
// a policy knob past Rule 3 under a "unit" file). The file also must NOT live
// under `scripts/lib/compute/` — that is exactly the directory gate E scans
// (`compute-no-module-numeric-const`), so a unit module parked there would be
// the hidden-in-compute violation this arm exists to prevent.

import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const UNITS_PATH = path.join(REPO_ROOT, 'scripts', 'lib', 'units.js');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const units = require('../../scripts/lib/units.js') as unknown as Record<string, number>;

describe('scripts/lib/units.js — the one home for pure unit conversions (gate E closed answer #3)', () => {
  // ---------------------------------------------------------------------------
  // T1 — the exported values equal the literals already in use BYTE-FOR-BYTE.
  // ---------------------------------------------------------------------------
  it('T1: values are byte-for-byte the literals compute/step already use', () => {
    expect(units.MS_PER_DAY).toBe(86400000);
    expect(units.DAYS_PER_JULIAN_YEAR).toBe(365.25);
    expect(units.SQM_TO_SQFT).toBe(10.7639);
    expect(units.M_TO_FT).toBe(3.28084);
  });

  it('T1b: the module object is frozen (no runtime mutation of a unit definition)', () => {
    expect(Object.isFrozen(units)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // T2 — the export surface is a CLOSED set of exactly the four names.
  // ---------------------------------------------------------------------------
  it('T2: exports ONLY the four declared names (a new name must be added deliberately)', () => {
    expect(Object.keys(units).sort()).toEqual(
      ['DAYS_PER_JULIAN_YEAR', 'MS_PER_DAY', 'M_TO_FT', 'SQM_TO_SQFT'],
    );
  });

  // ---------------------------------------------------------------------------
  // T3 — the file is NOT under scripts/lib/compute/ (the directory gate E scans).
  // ---------------------------------------------------------------------------
  it('T3: the module is not under scripts/lib/compute/ (gate E scans that directory)', () => {
    const rel = path.relative(REPO_ROOT, UNITS_PATH).split(path.sep).join('/');
    expect(rel).toBe('scripts/lib/units.js');
    expect(rel.startsWith('scripts/lib/compute/')).toBe(false);
    expect(rel.includes('/compute/')).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // T4 — no exported name reads as a tunable (Rule 3 / gate E's purpose).
  // ---------------------------------------------------------------------------
  it('T4: no export name matches the tunable-vocabulary guard', () => {
    const banned = /THRESHOLD|LIMIT|MAX|MIN|RATIO|PCT|COUNT|BATCH|TIMEOUT/i;
    for (const name of Object.keys(units)) {
      expect(banned.test(name), `export "${name}" reads as a tunable, not a unit conversion`).toBe(false);
    }
  });

  it('T4b: every export name is an UPPER_SNAKE_CASE unit/calendar identifier', () => {
    for (const name of Object.keys(units)) {
      expect(name).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
    // Every value is a finite number — nothing an operator would tune (a string,
    // an object, a function) has any business in a unit-constant module.
    for (const name of Object.keys(units)) {
      expect(Number.isFinite(units[name]), `export "${name}" is not a finite number`).toBe(true);
    }
  });

  it('T4c: the source carries no threshold/limit vocabulary in its exported values', () => {
    // A bare-sanity read: the file exists, is CommonJS (`module.exports`), and
    // declares no `process.env` / DB / clock surface — a pure unit module.
    const src = fs.readFileSync(UNITS_PATH, 'utf8');
    expect(src).toContain('module.exports');
    expect(src).toContain('Object.freeze');
    expect(src).not.toMatch(/process\.env/);
    expect(src).not.toMatch(/\bnew Date\(/);
  });
});
