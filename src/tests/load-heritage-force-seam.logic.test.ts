// SPEC LINK: docs/specs/01-pipeline/61_source_heritage_properties.md
// Operator ruling 2026-10-01 (zoning O2 precedent): legacy HERITAGE_FORCE_RELOAD=1 seam so the
// ① PRE golden capture can force past the prior-run skip. Same key as the converted descriptor's
// override.force_run, so the PRE and POST golden captures force identically. Unset ⇒ byte-identical.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const heritage = require('../../scripts/load-heritage.js');

const root = join(__dirname, '..', '..');
const src = () => readFileSync(join(root, 'scripts', 'load-heritage.js'), 'utf8');

describe('load-heritage — applyForceReload seam (zoning O2 ruling 2026-10-01)', () => {
  it('force unset: returns the SAME decision object (identity, byte-identical)', () => {
    const decision = { skip: true, reason: 'unchanged' };
    expect(heritage.applyForceReload(decision, false)).toBe(decision);
  });

  it('force set + skip decision: overridden to { skip:false, reason:"forced" }', () => {
    expect(heritage.applyForceReload({ skip: true, reason: 'unchanged' }, true))
      .toEqual({ skip: false, reason: 'forced' });
  });

  it('force set + non-skip decision: returned unchanged (same object)', () => {
    const decision = { skip: false, reason: null };
    expect(heritage.applyForceReload(decision, true)).toBe(decision);
  });

  it('null decision: returned as null regardless of force', () => {
    expect(heritage.applyForceReload(null, true)).toBeNull();
    expect(heritage.applyForceReload(null, false)).toBeNull();
  });
});

describe('load-heritage — force seam source locks', () => {
  it('reads the same HERITAGE_FORCE_RELOAD key the descriptor override.force_run uses', () => {
    expect(src()).toContain("process.env.HERITAGE_FORCE_RELOAD === '1'");
  });

  it('both skip tiers wrap their decision in applyForceReload(...)', () => {
    const text = src();
    expect(text).toContain('const skip = applyForceReload(skipCheckDecision(');
    expect(text).toContain('tier2 = applyForceReload(sourceVersion.contentHashDecision(');
  });
});
