// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-DD (McDonald's Airtight V3)
// SPEC LINK: docs/reports/defect-ledger.md LBMA-D7
//
// R-DD — a source-version skip is honoured only over a non-empty target.
//
// LBMA-D7 (H6 recapture, 2026-10-16): load_bylaw_map_areas took `skipped_content_hash` over an
// EMPTIED `bylaw_map_areas` — the content-hash decision (`scripts/lib/source-version.js:241`)
// compares the hash with the prior run's meta only, so a target emptied since that run read as
// "nothing to do" and the run wrote 0 rows. The fail-safe LOAD rule (source-version.js:42,
// "never a skip on doubt") is that an ambiguous input LOADs.
//
// The fix is ONE shared helper in `scripts/lib/step/staleness.js`, used at every source-version
// skip site: the tier-1 validator gate and the tier-2 content-hash gate inside
// `acquire.acquireExternal`, and the all-primaries pre-loop in `index.js` ingestPrimaries.
// Before a skip is honoured the library probes the first `outputs.writes[].table`
// (`SELECT 1 AS target_has_rows FROM "<table>" LIMIT 1`); empty → LOAD with reason `target_empty`.
// No descriptor field. The probe runs only when a skip would be taken (a load run issues none).
//
// RED on HEAD: `staleness.targetIsEmpty` / `staleness.skipOnlyOverRows` do not exist, and the
// runner honours the skip over an empty target (end-to-end case below).
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */
const staleness = require(join(process.cwd(), 'scripts/lib/step/staleness.js'));
const acquire = require(join(process.cwd(), 'scripts/lib/step/acquire.js'));
/* eslint-enable @typescript-eslint/no-require-imports */

type Call = { text: string; params: unknown[] | undefined };

/** A pool whose target probe answers `rows` (a non-probe query answers nothing). */
function probePool(hasRows: boolean) {
  const calls: Call[] = [];
  return {
    calls,
    query: async (text: string, params?: unknown[]) => {
      calls.push({ text, params });
      if (/SELECT 1 AS target_has_rows FROM/.test(text)) return { rows: hasRows ? [{ target_has_rows: 1 }] : [] };
      return { rows: [] };
    },
  };
}

const descriptor = (table = 'bylaw_map_areas') => ({ outputs: { writes: [{ table }] } });

describe('R-DD — a source-version skip needs a non-empty target (LBMA-D7)', () => {
  it('targetIsEmpty probes the FIRST outputs.writes[].table with a quoted, LIMIT 1 query', async () => {
    const empty = probePool(false);
    expect(await staleness.targetIsEmpty(empty, descriptor())).toBe(true);
    expect(empty.calls).toHaveLength(1);
    expect(empty.calls[0]!.text).toBe('SELECT 1 AS target_has_rows FROM "bylaw_map_areas" LIMIT 1');
    const full = probePool(true);
    expect(await staleness.targetIsEmpty(full, descriptor())).toBe(false);
  });

  it('targetIsEmpty refuses an unsafe identifier by name (never interpolated)', async () => {
    await expect(staleness.targetIsEmpty(probePool(true), descriptor('x"; DROP TABLE y; --'))).rejects.toThrow(/Invalid identifier/);
  });

  it('skipOnlyOverRows turns a skip over an empty target into a LOAD with reason target_empty', async () => {
    const skip = { skip: true, reason: 'unchanged_content_hash' };
    expect(await staleness.skipOnlyOverRows(skip, async () => true, '[t]')).toEqual({ skip: false, reason: 'target_empty' });
    expect(await staleness.skipOnlyOverRows(skip, async () => false, '[t]')).toEqual(skip);
  });

  it('skipOnlyOverRows never probes on a load decision (a load run issues no extra query)', async () => {
    let probed = 0;
    const load = { skip: false, reason: 'changed' };
    expect(await staleness.skipOnlyOverRows(load, async () => { probed++; return true; }, '[t]')).toBe(load);
    expect(probed).toBe(0);
  });

  it('skipOnlyOverRows refuses a skip with no probe by name (no silent bypass)', async () => {
    await expect(staleness.skipOnlyOverRows({ skip: true, reason: 'unchanged_etag' }, undefined, '[t]'))
      .rejects.toThrow(/R-DD/);
  });

  it('target_empty is a fail-safe LOAD outcome, not a "changed" load', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the shared outcome mapping
    const sv = require(join(process.cwd(), 'scripts/lib/source-version.js'));
    expect(sv.classifyOutcome({ decision: { skip: false, reason: 'target_empty' } })).toBe(sv.OUTCOME_LOAD_FAIL_SAFE);
  });

  it('acquireExternal: an unchanged tier-1 validator over an EMPTY target LOADs (no skip return)', async () => {
    // A filesystem-free url external whose HEAD validators equal the prior's: the gate says skip.
    const lastModified = 'Wed, 01 Jan 2025 00:00:00 GMT';
    const prior = { last_modified: lastModified, etag: null, content_hash: 'h' };
    const desc = {
      identity: { name: 'fixture', spec_version: '1' },
      outputs: { writes: [{ table: 'bylaw_map_areas' }] },
      staleness: { trigger: [{ position: 'pre_acquisition' }] },
    };
    const external = { id: 'x', url: 'https://ex/x.zip', format: 'shapefile_zip' };
    let downloadAttempted = false;
    const ctxFetch = async (_url: string, init?: { method?: string }) => {
      if (init && init.method === 'HEAD') {
        return { ok: true, status: 200, headers: { get: (h: string) => (h.toLowerCase() === 'last-modified' ? lastModified : null) } };
      }
      downloadAttempted = true;
      throw new Error('download reached (the skip was not honoured)');
    };
    const log = { info: () => {}, warn: () => {}, error: () => {} };
    const common = {
      ctxFetch, log, tag: '[t]', slug: 'fixture', external, descriptor: desc, config: {}, prior, timeoutMs: 1000,
      keyProperty: 'k', keyColumn: 'k', coerceKey: (v: unknown) => v, forced: false,
      preAcquisitionGate: (head: { lastModified: string | null; etag: string | null }) => staleness.preAcquisitionDecision({
        descriptor: desc, validators: head, prior, forced: false,
      }),
    };
    // Non-empty target: the unchanged validator is honoured — the skip return, nothing downloaded.
    const kept = await acquire.acquireExternal({ ...common, targetEmpty: async () => false });
    expect(kept.tier1).toMatchObject({ skip: true, reason: 'unchanged_last_modified' });
    expect(downloadAttempted).toBe(false);
    // Empty target: the skip is refused and the arm proceeds to download (the fixture's fetch throws there).
    await expect(acquire.acquireExternal({ ...common, targetEmpty: async () => true })).rejects.toThrow(/download reached/);
    expect(downloadAttempted).toBe(true);
  });
});
