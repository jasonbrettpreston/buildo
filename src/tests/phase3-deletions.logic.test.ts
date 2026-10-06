// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §8 (Phase 3 WIRE-OR-DELETE: DELETE row — registry-truth plan, PHASE 3 table)
//
// PHASE 3 DELETE ROW — the lock that proves every INERT schema field group is GONE, from BOTH
// the schema AND the live step fleet.
//
// Each DELETED entry below names (a) the JSON-pointer(s) into step.schema.json that must NOT
// resolve after the deletion, and (b) a `carried(descriptor)` predicate testing the descriptor
// key path(s) no live descriptor may carry. It is written to be RED before the deletion (every
// pointer still resolves; every live descriptor still carries its group) and GREEN after.
//
// `carried` walks each descriptor DEFENSIVELY: any array member may be the literal "none"
// (a legal value per the schema's own "omission is a build failure; 'none' must be written
// down" rule), so a non-object member is skipped rather than dereferenced.
//
// The FENCE cases at the bottom are kept ON PURPOSE and must stay GREEN throughout: they are
// ADJACENT fields with colliding names that the deletion must NOT touch.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const SCHEMA_PATH = path.join(REPO_ROOT, 'scripts/steps/_schema/step.schema.json');
const CONVERTED_PATH = path.join(REPO_ROOT, 'scripts/steps/_schema/converted.json');

type Json = Record<string, unknown>;

/**
 * Resolve a JSON pointer (RFC 6901 subset). Object keys are walked as properties; a numeric
 * segment addresses an ARRAY element, which the DELETE-row pointers need because several of the
 * target fields sit under an `anyOf/1` array arm (e.g. `/properties/outputs/anyOf/1/properties/cascades`).
 * No `~0`/`~1` escaping is needed for the pointers this file uses.
 */
function resolvePointer(obj: unknown, ptr: string): unknown {
  if (ptr === '' || ptr === '/') return obj;
  const segments = ptr.split('/').filter((s) => s.length > 0);
  let cur: unknown = obj;
  for (const seg of segments) {
    if (cur === null || typeof cur !== 'object') return undefined;
    if (Array.isArray(cur)) {
      if (!/^[0-9]+$/.test(seg)) return undefined;
      const idx = Number(seg);
      if (idx >= cur.length) return undefined;
      cur = cur[idx];
      continue;
    }
    const rec = cur as Json;
    if (!Object.prototype.hasOwnProperty.call(rec, seg)) return undefined;
    cur = rec[seg];
  }
  return cur;
}

function isJsonObject(v: unknown): v is Json {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** The descriptor's writes[] array, or [] when absent/"none"/unexpected shape. */
function writesOf(d: Json): Json[] {
  const outs = d.outputs;
  if (!isJsonObject(outs)) return [];
  const writes = outs.writes;
  if (!Array.isArray(writes)) return [];
  return writes.filter(isJsonObject);
}

/** The descriptor's reads.externals[] array, or [] when absent/"none"/unexpected shape. */
function externalsOf(d: Json): Json[] {
  const inputs = d.inputs;
  if (!isJsonObject(inputs)) return [];
  const reads = inputs.reads;
  if (!isJsonObject(reads)) return [];
  const externals = reads.externals;
  if (!Array.isArray(externals)) return [];
  return externals.filter(isJsonObject);
}

/** The descriptor's counters object (records_total/new/updated), or null when "none"/absent. */
function countersOf(d: Json): Json | null {
  const counters = d.counters;
  return isJsonObject(counters) ? counters : null;
}

function hasKey(obj: Json | null, key: string): boolean {
  return obj !== null && Object.prototype.hasOwnProperty.call(obj, key);
}

/** The descriptor's reads.steps[] array, or [] when absent/"none"/unexpected shape. */
function readsStepsOf(d: Json): Json[] {
  const inputs = d.inputs;
  if (!isJsonObject(inputs)) return [];
  const reads = inputs.reads;
  if (!isJsonObject(reads)) return [];
  const steps = reads.steps;
  if (!Array.isArray(steps)) return [];
  return steps.filter(isJsonObject);
}

interface DeletedGroup {
  group: string;
  pointers: string[];
  carried: (d: Json) => boolean;
}

const DELETED: DeletedGroup[] = [
  {
    group: '#64 interpretation.entries',
    pointers: ['/properties/interpretation/anyOf/1/properties/entries'],
    carried: (d) => hasKey(isJsonObject(d.interpretation) ? d.interpretation : null, 'entries'),
  },
  {
    group: '#11 externals cache',
    pointers: [
      '/properties/inputs/properties/reads/properties/externals/items/properties/cache',
      '/properties/inputs/properties/reads/properties/externals/items/properties/cache_why',
      '/properties/inputs/properties/reads/properties/externals/items/properties/cache_ttl',
    ],
    carried: (d) =>
      externalsOf(d).some((e) => hasKey(e, 'cache') || hasKey(e, 'cache_why') || hasKey(e, 'cache_ttl')),
  },
  {
    group: '#18 replay / source_key_policy',
    pointers: [
      '/definitions/write/properties/replay',
      '/definitions/write/properties/replay_why',
      '/definitions/write/properties/source_key_policy',
      '/definitions/sourceKeyPolicy',
    ],
    carried: (d) =>
      writesOf(d).some((w) => hasKey(w, 'replay') || hasKey(w, 'replay_why') || hasKey(w, 'source_key_policy')),
  },
  {
    group: '#21 cascades',
    pointers: ['/properties/outputs/anyOf/1/properties/cascades'],
    carried: (d) => hasKey(isJsonObject(d.outputs) ? d.outputs : null, 'cascades'),
  },
  {
    group: '#22 publish',
    pointers: ['/properties/outputs/anyOf/1/properties/publish'],
    carried: (d) => hasKey(isJsonObject(d.outputs) ? d.outputs : null, 'publish'),
  },
  {
    group: '#28 checkpoint/interval/scope',
    pointers: [
      '/properties/staleness/properties/checkpoint',
      '/properties/staleness/properties/interval',
      '/properties/staleness/properties/scope',
    ],
    carried: (d) => {
      const st = isJsonObject(d.staleness) ? d.staleness : null;
      return hasKey(st, 'checkpoint') || hasKey(st, 'interval') || hasKey(st, 'scope');
    },
  },
  {
    group: '#41 budget/txn_budget',
    pointers: [
      '/properties/execution/properties/budget',
      '/properties/execution/properties/txn_budget',
    ],
    carried: (d) => {
      const ex = isJsonObject(d.execution) ? d.execution : null;
      return hasKey(ex, 'budget') || hasKey(ex, 'txn_budget');
    },
  },
  {
    group: '#45 criticality',
    pointers: ['/properties/execution/properties/criticality'],
    carried: (d) => hasKey(isJsonObject(d.execution) ? d.execution : null, 'criticality'),
  },
  {
    group: '#47 egress/redact',
    pointers: [
      '/properties/execution/properties/network/anyOf/1/properties/egress',
      '/properties/execution/properties/network/anyOf/1/properties/redact',
    ],
    carried: (d) => {
      const ex = isJsonObject(d.execution) ? d.execution : null;
      const net = ex !== null && isJsonObject(ex.network) ? ex.network : null;
      return hasKey(net, 'egress') || hasKey(net, 'redact');
    },
  },
  {
    group: '#69 scoped_by',
    pointers: ['/definitions/counter/anyOf/1/properties/scoped_by'],
    carried: (d) => {
      const counters = countersOf(d);
      if (counters === null) return false;
      return Object.values(counters).some((slot) => isJsonObject(slot) && hasKey(slot, 'scoped_by'));
    },
  },
  {
    group: '#7 version_pin/assert_health',
    pointers: [
      '/properties/inputs/properties/reads/properties/steps/items/properties/version_pin',
      '/properties/inputs/properties/reads/properties/steps/items/properties/assert_health',
    ],
    carried: (d) => readsStepsOf(d).some((s) => hasKey(s, 'version_pin') || hasKey(s, 'assert_health')),
  },
  {
    group: '#42 partial_fill/chunked/needs_disk_mb',
    pointers: [
      '/properties/execution/properties/partial_fill',
      '/properties/execution/properties/chunked',
      '/properties/execution/properties/needs_disk_mb',
    ],
    carried: (d) => {
      const ex = isJsonObject(d.execution) ? d.execution : null;
      return hasKey(ex, 'partial_fill') || hasKey(ex, 'chunked') || hasKey(ex, 'needs_disk_mb');
    },
  },
];

// ---------------------------------------------------------------------------
// Fixture loading
// ---------------------------------------------------------------------------

const schema: Json = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8')) as Json;

const convertedRaw: Json = JSON.parse(fs.readFileSync(CONVERTED_PATH, 'utf8')) as Json;
const convertedList: string[] = Array.isArray(convertedRaw.converted)
  ? convertedRaw.converted.filter((f): f is string => typeof f === 'string')
  : [];

interface LiveDescriptor {
  slug: string;
  descriptor: Json;
}

/** converted.json lists repo-relative STEP files; the sibling descriptor is the same stem. */
function descriptorPathFor(stepFile: string): string {
  return stepFile.replace(/\.(js|mjs|cjs|py)$/, '.descriptor.json');
}

const liveDescriptors: LiveDescriptor[] = convertedList
  .map((stepFile) => ({ stepFile, descriptorPath: descriptorPathFor(stepFile) }))
  .filter(({ descriptorPath }) => fs.existsSync(path.join(REPO_ROOT, descriptorPath)))
  .map(({ descriptorPath }) => {
    const descriptor = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, descriptorPath), 'utf8')) as Json;
    const identity = isJsonObject(descriptor.identity) ? descriptor.identity : null;
    const name = identity !== null && typeof identity.name === 'string' ? identity.name : descriptorPath;
    return { slug: name, descriptor };
  });

function slugsCarrying(group: DeletedGroup): string[] {
  return liveDescriptors.filter(({ descriptor }) => group.carried(descriptor)).map(({ slug }) => slug);
}

// ---------------------------------------------------------------------------
// The live fleet is not vacuous
// ---------------------------------------------------------------------------

describe('phase 3 deletions — fleet fixture', () => {
  it('loads the converted fleet, and it is not vacuous (> 20 descriptors)', () => {
    expect(liveDescriptors.length).toBeGreaterThan(20);
  });

  it('every converted step file has a sibling descriptor on disk', () => {
    const missing = convertedList
      .map((stepFile) => descriptorPathFor(stepFile))
      .filter((descriptorPath) => !fs.existsSync(path.join(REPO_ROOT, descriptorPath)));
    expect(missing).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The deletions themselves
// ---------------------------------------------------------------------------

describe('phase 3 deletions — deferred schema field groups are gone', () => {
  it.each(DELETED)('$group is gone from the schema', ({ pointers }) => {
    const stillResolving = pointers.filter((ptr) => resolvePointer(schema, ptr) !== undefined);
    expect(stillResolving).toEqual([]);
  });

  it.each(DELETED)('no live descriptor carries $group', (group) => {
    expect(slugsCarrying(group)).toEqual([]);
  });

  it('x-banned-for-new.values names no deleted field', () => {
    const banned = isJsonObject(schema['x-banned-for-new']) ? schema['x-banned-for-new'] : null;
    const values = banned !== null && isJsonObject(banned.values) ? banned.values : {};
    const keys = Object.keys(values);
    expect(keys).not.toContain('outputs.writes[].replay');
    expect(keys).not.toContain('execution.criticality');
  });

  it('no schema rule keys an `if` on the deleted staleness.scope (the dead claim-#54 arm is removed; the phases arm is the survivor)', () => {
    // RE-FREEZE item (dry-merge D3 / handoff-D "Seat A D3"): after #28 deletes staleness.scope, an `if`
    // that requires it can never match — a rule that can never fire is deleted, not kept.
    const text = JSON.stringify(schema);
    expect(text).not.toContain('"staleness":{"properties":{"scope"');
  });
});

// ---------------------------------------------------------------------------
// FENCES — DIFFERENT fields whose names collide. These must keep resolving.
// ---------------------------------------------------------------------------

describe('phase 3 deletions — fences (keep on purpose)', () => {
  it('recovery.cascades STILL resolves (recovery.cascades is not outputs.cascades)', () => {
    expect(resolvePointer(schema, '/properties/recovery/anyOf/1/properties/cascades')).toBeDefined();
  });

  it('enrichPhase.scope STILL resolves (execution.phases[].scope is not staleness.scope)', () => {
    expect(resolvePointer(schema, '/definitions/enrichPhase/properties/scope')).toBeDefined();
  });

  it('interpretation.file STILL resolves (interpretation.file is not interpretation.entries)', () => {
    expect(resolvePointer(schema, '/properties/interpretation/anyOf/1/properties/file')).toBeDefined();
  });

  it('inputs.reads.steps[].step STILL resolves (only version_pin/assert_health are deleted, staleness.pins replaces them)', () => {
    expect(resolvePointer(schema, '/properties/inputs/properties/reads/properties/steps/items/properties/step')).toBeDefined();
  });

  it('execution.txn_scope STILL resolves (#42 keeps txn_scope; only partial_fill/chunked/needs_disk_mb are deleted)', () => {
    expect(resolvePointer(schema, '/properties/execution/properties/txn_scope')).toBeDefined();
  });
});
