// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-72, M-377 (MB-31 Layer 3 step; plan sections 18, 19.7)
//
// MB-31 · E31-01 oracle-only brief B0d (part 4 of 5). RED FIRST: `scripts/lib/compute/compute-maxbld-scenarios.js`
// does not exist yet.
//   E31-13 the upsert is idempotent: it only writes when the content hash changes (`IS DISTINCT FROM`) and never
//          stamps `computed_at` in its WHERE. `contentSha` hashes the content only: key order, flag order and a
//          wall-clock stamp change nothing; value, reason, settings sha or trace change it.
import { describe, expect, it, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CommonJS module surface
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const DESCRIPTOR = 'scripts/compute-maxbld-scenarios.descriptor.json';

const ROW_BASE: Json = {
  parcel_id: 1,
  building_type: 'detached_house',
  field_id: 'height_max_m',
  increment: '1',
  status: 'computed',
  value: 9,
  unit: 'm',
  reason: null,
  flags: ['b', 'a'],
  trace: [{ kind: 'l2', id: 'height_m', value: 9 }],
  switches: [{ id: 'formula:height_max_m', state: 'on' }],
  catalogue_sha: 'c',
  switchboard_sha: 'w',
  settings_sha: 's',
  layer2_table_version: 'v',
};

const clone = (): Json => JSON.parse(JSON.stringify(ROW_BASE)) as Json;
const reversed = (obj: Json): Json => Object.fromEntries([...Object.entries(obj)].reverse());
const HEX64 = /^[0-9a-f]{64}$/;

describe('MB-31 zero-write re-run, E31-13 (B10)', () => {
  let S: Json;
  beforeAll(() => {
    S = req(path.join(ROOT, 'scripts/lib/compute/compute-maxbld-scenarios.js')) as Json;
  });

  it('the descriptor declares the guarded upsert on content_sha (waits B12)', () => {
    const descriptor = JSON.parse(fs.readFileSync(path.join(ROOT, DESCRIPTOR), 'utf8')) as Json;
    const entry = (descriptor.outputs.writes as Json[]).find((w) => w.table === 'parcel_maxbld_scenarios') as Json;
    expect(entry, 'parcel_maxbld_scenarios').toBeTruthy();
    expect(entry.key).toEqual(['parcel_id', 'building_type', 'field_id']);
    expect(entry.write_discipline.class).toBe('guarded_upsert');
    expect(entry.write_discipline.guard).toBe('is_distinct_from');
    expect(entry.write_discipline.guard_columns).toEqual(['content_sha']);
    expect(entry.write_discipline.idempotent_rerun).toBe('zero_writes');
    expect(entry.write_discipline.guard_columns).not.toContain('computed_at');
  });

  it('contentSha is a 64-hex digest of the content', () => {
    const sha = S.contentSha(clone()) as string;
    expect(sha).toMatch(HEX64);
  });

  it('key order, flag order and a computed_at stamp do not change the hash', () => {
    const sha = S.contentSha(clone()) as string;
    expect(S.contentSha(reversed(clone()))).toBe(sha);

    const flags = clone();
    flags.flags = ['a', 'b'];
    expect(S.contentSha(flags)).toBe(sha);

    const stamped = clone();
    stamped.computed_at = '2026-10-31T00:00:00.000Z';
    expect(S.contentSha(stamped)).toBe(sha);
  });

  it('value, reason, settings sha or trace do change the hash', () => {
    const sha = S.contentSha(clone()) as string;

    const value = clone();
    value.value = 9.5;
    expect(S.contentSha(value)).not.toBe(sha);

    const reason = clone();
    reason.reason = 'x';
    expect(S.contentSha(reason)).not.toBe(sha);

    const settings = clone();
    settings.settings_sha = 's2';
    expect(S.contentSha(settings)).not.toBe(sha);

    const trace = clone();
    trace.trace = [{ kind: 'l2', id: 'height_m', value: 10 }];
    expect(S.contentSha(trace)).not.toBe(sha);
  });
});
