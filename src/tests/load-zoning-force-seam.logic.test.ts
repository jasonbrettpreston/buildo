// SPEC LINK: docs/specs/01-pipeline/58_source_zoning_bylaw.md §3 (step 0a skip-check, R2-12)
// Plan O2 (operator "y" 2026-09-27; heritage 451962ac precedent): legacy ZONING_FORCE_RELOAD=1 seam so the
// ① PRE golden capture can force past the all-layers skip. Same key as the converted descriptor's
// override.force_run, so PRE and POST force identically. Unset ⇒ byte-identical.
//
// The behaviour (a forced run loads all ten layers past an all-unchanged prior and pushes the
// `zoning_override_force_reload_present` WARN row; unset, the run skips and the row is absent) is
// executed by the ① oracle pin L22 — here we lock the seam's own algebra and its source text, so a
// refactor of scripts/load-zoning.js cannot silently move the force arm off the descriptor's key.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// scripts/load-zoning.js only runs under `require.main === module` — the same load the sibling
// src/tests/source-version.logic.test.ts:42 uses, which is why requiring it here is safe.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const zoning = require('../../scripts/load-zoning.js') as { applyForceReload: (d: unknown, f: boolean) => unknown };

const ZONING_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/load-zoning.js'),
  'utf8',
);

describe('load-zoning — ZONING_FORCE_RELOAD seam (plan O2)', () => {
  it('force unset ⇒ the SAME decision object is returned (byte-identical)', () => {
    const d = { skip: true, reason: 'unchanged' };
    expect(zoning.applyForceReload(d, false)).toBe(d);
  });

  it('force set ⇒ a skip becomes { skip:false, reason:"forced" }', () => {
    const d = { skip: true, reason: 'unchanged' };
    expect(zoning.applyForceReload(d, true)).toEqual({ skip: false, reason: 'forced' });
    expect(d.skip).toBe(true); // the input object is NOT mutated
  });

  it('force set never touches a load decision or a null', () => {
    const d = { skip: false, reason: 'changed' };
    expect(zoning.applyForceReload(d, true)).toBe(d);
    expect(zoning.applyForceReload(null, true)).toBeNull();
  });

  it('the seam reads exactly ZONING_FORCE_RELOAD === "1", wraps the per-layer decisions, and pushes a WARN row only when set', () => {
    // Source-text lock: the behaviour itself is executed by the ① oracle pin L22.
    expect(ZONING_SOURCE).toContain("process.env.ZONING_FORCE_RELOAD === '1'");
    expect(ZONING_SOURCE).toContain('const decisions = LAYERS.map((l) => applyForceReload(');
    expect(ZONING_SOURCE).toContain("metric: 'zoning_override_force_reload_present', value: true, status: 'WARN'");
  });
});
