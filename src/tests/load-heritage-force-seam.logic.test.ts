// SPEC LINK: docs/specs/01-pipeline/61_source_heritage_properties.md
// Operator ruling 2026-10-01 (zoning O2 precedent): legacy HERITAGE_FORCE_RELOAD=1 seam so the
// ① PRE golden capture can force past the prior-run skip. Same key as the converted descriptor's
// override.force_run, so the PRE and POST golden captures force identically. Unset ⇒ byte-identical.
// RE-POINTED at batch-2 row 3.4 ② — the legacy seam is now the library's override.force_run; same key, same four facts.
//
// The step file is now the frozen 3-statement shell (it exports no domain functions), so the
// behaviour this file locks MOVED rather than retired: the seam's subject is the library's
// `forceRunRequested` / `resolveOverrides` / `preAcquisitionDecision`, the way the RAVINE_FORCE_RELOAD
// precedent (src/tests/load-ravines.logic.test.ts:135-160) and the library suite
// (src/tests/step-library.logic.test.ts:1855+) already read it. The four facts are unchanged.
//
// TIER 2 (content-hash) under force is library-owned — scripts/lib/step/acquire.js:947
// `forced ? { skip: false, reason: 'force_run' }` — and is already locked by the library suites
// (src/tests/step-library.logic.test.ts "TIER 2 — unforced skips on an identical content hash;
// forced walks past it into extraction"), so it is cited here, not re-tested.

import { describe, it, expect } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const descriptor = require('../../scripts/load-heritage.descriptor.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const staleness = require('../../scripts/lib/step/staleness.js');

// Any RFC-1123 Last-Modified the prior run and the HEAD can agree on — the comparison is what
// matters, not the date. Matches the ravines precedent's literal so the two read identically.
const L = 'Mon, 14 Mar 2022 15:25:09 GMT';

describe('load-heritage — force seam (zoning O2 ruling 2026-10-01, RE-POINTED ②)', () => {
  it('force unset ⇒ not forced; only the exact value "1" arms it (the legacy === "1")', () => {
    expect(staleness.forceRunRequested(descriptor, {})).toBe(false);
    expect(staleness.forceRunRequested(descriptor, { HERITAGE_FORCE_RELOAD: 'true' })).toBe(false);
  });

  it('force set ⇒ forced, and resolveOverrides projects it onto ctx.overrides.force_run', () => {
    expect(staleness.forceRunRequested(descriptor, { HERITAGE_FORCE_RELOAD: '1' })).toBe(true);
    expect(staleness.resolveOverrides(descriptor, { HERITAGE_FORCE_RELOAD: '1' }).force_run).toBe(true);
  });

  it('tier-1 parity: the legacy applyForceReload(skipCheckDecision(…)) — force bypasses the skip', () => {
    const validators = { lastModified: L, etag: null };
    const prior = { last_modified: L };
    const unforced = staleness.preAcquisitionDecision({ descriptor, validators, prior, forced: false });
    expect(unforced.skip).toBe(true);
    expect(unforced.reason).toBe('unchanged_last_modified');
    const forced = staleness.preAcquisitionDecision({ descriptor, validators, prior, forced: true });
    expect(forced.skip).toBe(false);
    expect(forced.reason).toBe('force_run');
  });

  it('the key is the one the legacy read, as DECLARED data (override.force_run / recovery.force)', () => {
    expect(descriptor.override.force_run).toBe('HERITAGE_FORCE_RELOAD');
    expect(descriptor.recovery.force).toBe('HERITAGE_FORCE_RELOAD');
  });
});
