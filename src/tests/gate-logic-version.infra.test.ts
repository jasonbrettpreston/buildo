// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.2 (registry-truth plan P2-C3 — fold 8 item 1 (b2), fold 8c item 4)
//
// WF2 gate — `scripts/analysis/gates/logic-version.mjs` (gate P2-C3).
//
// RED-FIRST against the STUB module: `hasCodeVersionTrigger` is always false,
// `logicVersionViolations` / `fingerprintInputViolations` return no violations
// and `checkLogicVersion` always passes (empty `selfTest`). The two LIVE tests
// are the stated direction:
//   * L1 (fingerprint_inputs half) is EXPECTED GREEN — 31 entries examined
//     (26 real imports + the 5 data signals wsib_registry:count,
//     parcels:count (x2), address_points:count, parcels:centroid_lat_null_count).
//   * L2 (logic_version half) is EXPECTED RED on this tree — 10 owed
//     (compute_centroids, compute_parcel_cost_estimates, enrich_heritage,
//     enrich_parcels, enrich_ravines, geocode_permits, link_parcel_addresses,
//     link_wsib, assert_engine_health, refresh_snapshot get `logic_version`
//     "none" in P2-C6 on seat B's tree, cleared at the FLEET-2 assembly).
// Every RED-direction fixture below (V3, V4, V5, V6, V8-true, F2, F3, F4, C1
// and G1's `hasCodeVersionTrigger` assertion) is EXPECTED RED against the stub.
// Do NOT make anything green in this brief.

import { describe, it, expect } from 'vitest';
import * as gate from '../../scripts/analysis/gates/logic-version.mjs';

const REPO_ROOT = process.cwd();

/** A descriptor skeleton deep enough to override nested fields with whole objects. */
const d = (over: Record<string, unknown> = {}): any => ({
  identity: { name: 'fixture_step', archetype: 'LINK' },
  staleness: { trigger: 'none', logic_version: 'none', fingerprint_inputs: 'none' },
  ...over,
});

const cv = { signal: 'code_version', position: 'pre_compute', emit_key: 'code_version' };
const always = { signal: 'always', position: 'pre_compute' };

/** True when `value` is a plain record we can index by string key (cast-free guard). */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** Read `descriptor.staleness.<field>` without `any`/`as`/`!`. */
const stalenessField = (descriptor: object, field: string): unknown => {
  if (!isRecord(descriptor) || !isRecord(descriptor.staleness)) return undefined;
  return descriptor.staleness[field];
};

describe('logic-version (P2-C3) — logic_version closed rule + fingerprint_inputs E', () => {
  // -------------------------------------------------------------------------
  // V1/V2 — the two GREEN directions of rule (1).
  // -------------------------------------------------------------------------
  it('V1: GREEN — a code_version trigger with a non-none logic_version', () => {
    const fixture = d({ staleness: { trigger: [cv], logic_version: 'v1-x', fingerprint_inputs: 'none' } });
    expect(gate.logicVersionViolations(fixture).length).toBe(0);
  });

  it('V2: GREEN — trigger "none" with logic_version "none"', () => {
    const fixture = d({ staleness: { trigger: 'none', logic_version: 'none', fingerprint_inputs: 'none' } });
    expect(gate.logicVersionViolations(fixture).length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // V3/V4 — direction A: a hand-bumped value NOTHING reads is RED.
  // -------------------------------------------------------------------------
  it('V3: RED — logic_version "v1-x" with trigger "none"', () => {
    const fixture = d({ staleness: { trigger: 'none', logic_version: 'v1-x', fingerprint_inputs: 'none' } });
    const list = gate.logicVersionViolations(fixture);
    expect(list.length).toBe(1);
    expect(list[0]?.item).toBe('staleness.logic_version');
    expect(list[0]?.step).toBe('fixture_step');
  });

  it('V4: RED — logic_version "v1-x" with only an always trigger', () => {
    const fixture = d({ staleness: { trigger: [always], logic_version: 'v1-x', fingerprint_inputs: 'none' } });
    expect(gate.logicVersionViolations(fixture).length).toBe(1);
  });

  // -------------------------------------------------------------------------
  // V5/V6 — direction B: a code_version trigger that compares nothing is RED.
  // -------------------------------------------------------------------------
  it('V5: RED — a code_version trigger with logic_version "none"', () => {
    const fixture = d({ staleness: { trigger: [cv], logic_version: 'none', fingerprint_inputs: 'none' } });
    const list = gate.logicVersionViolations(fixture);
    expect(list.length).toBe(1);
    expect(list[0]?.item).toBe('staleness.logic_version');
    expect(list[0]?.step).toBe('fixture_step');
  });

  it('V6: RED — a code_version trigger with logic_version ABSENT (missing counts as "none")', () => {
    const fixture = d({ staleness: { trigger: [cv], fingerprint_inputs: 'none' } });
    expect(gate.logicVersionViolations(fixture).length).toBe(1);
  });

  // -------------------------------------------------------------------------
  // V7 — a code_version trigger inside a longer trigger list still counts.
  // -------------------------------------------------------------------------
  it('V7: GREEN — config_version + code_version triggers with logic_version "v2"', () => {
    const fixture = d({
      staleness: { trigger: [{ signal: 'config_version' }, cv], logic_version: 'v2', fingerprint_inputs: 'none' },
    });
    expect(gate.logicVersionViolations(fixture).length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // V8 — the trigger predicate itself.
  // -------------------------------------------------------------------------
  it('V8: hasCodeVersionTrigger is true only for a code_version trigger entry', () => {
    expect(gate.hasCodeVersionTrigger(d({ staleness: { trigger: [cv], logic_version: 'v1', fingerprint_inputs: 'none' } }))).toBe(true);
    expect(gate.hasCodeVersionTrigger(d({ staleness: { trigger: 'none', logic_version: 'none', fingerprint_inputs: 'none' } }))).toBe(false);
    expect(gate.hasCodeVersionTrigger(d({ staleness: { trigger: [always], logic_version: 'v1', fingerprint_inputs: 'none' } }))).toBe(false);
  });

  // -------------------------------------------------------------------------
  // W1/W2 — the import walk (REAL in the stub): reachability, not a rule.
  // -------------------------------------------------------------------------
  it('W1: requireWalk expands the transitive relative require/import closure', () => {
    const map: Record<string, string> = {
      'scripts/s.js': "const c = require('./lib/compute/s');\nconst j = require('./s.descriptor.json');",
      'scripts/lib/compute/s.js': "const h = require('../helper');\nimport x from './esm.mjs';",
      'scripts/lib/helper.js': 'module.exports = 1;',
      'scripts/lib/compute/esm.mjs': 'export default 1;',
      'scripts/lib/unused.js': '',
    };
    const read = (rel: string): string | null => map[rel] ?? null;
    const got = [...gate.requireWalk('scripts/s.js', read)].sort();
    expect(got).toEqual([
      'scripts/lib/compute/esm.mjs',
      'scripts/lib/compute/s.js',
      'scripts/lib/helper.js',
      'scripts/s.js',
    ]);
    expect(got.includes('scripts/lib/unused.js')).toBe(false);
  });

  it('W2: requireWalk terminates on a relative cycle and visits both files', () => {
    const map: Record<string, string> = {
      'scripts/a.js': "const b = require('./b');",
      'scripts/b.js': "const a = require('./a');",
    };
    const read = (rel: string): string | null => map[rel] ?? null;
    expect([...gate.requireWalk('scripts/a.js', read)].sort()).toEqual(['scripts/a.js', 'scripts/b.js']);
  });

  // -------------------------------------------------------------------------
  // F1..F5 — the fingerprint_inputs half (rule (2)).
  // -------------------------------------------------------------------------
  const imports = new Set<string>([
    'scripts/s.js',
    'scripts/lib/compute/s.js',
    'scripts/lib/helper.js',
    'scripts/lib/compute/esm.mjs',
  ]);

  it('F1: GREEN — a reached import plus declared data signals', () => {
    const fixture = d({
      staleness: {
        trigger: 'none',
        logic_version: 'none',
        fingerprint_inputs: ['scripts/lib/compute/s.js', 'parcels:count', 'parcels:centroid_lat_null_count'],
      },
    });
    expect(gate.fingerprintInputViolations(fixture, imports).length).toBe(0);
  });

  it('F2: RED — an entry the walk does not reach is not a real import', () => {
    const fixture = d({
      staleness: { trigger: 'none', logic_version: 'none', fingerprint_inputs: ['scripts/lib/unused.js'] },
    });
    const list = gate.fingerprintInputViolations(fixture, imports);
    expect(list.length).toBe(1);
    expect(list[0]?.item).toBe('staleness.fingerprint_inputs');
    expect(list[0]?.detail).toContain('scripts/lib/unused.js');
  });

  it('F3: RED — a colon entry outside the declared data-signal grammar', () => {
    const fixture = d({
      staleness: { trigger: 'none', logic_version: 'none', fingerprint_inputs: ['parcels:max_updated_at'] },
    });
    expect(gate.fingerprintInputViolations(fixture, imports).length).toBe(1);
  });

  it('F4: RED — a data signal must be lower-case ([a-z_][a-z0-9_]*)', () => {
    const fixture = d({
      staleness: { trigger: 'none', logic_version: 'none', fingerprint_inputs: ['Parcels:count'] },
    });
    expect(gate.fingerprintInputViolations(fixture, imports).length).toBe(1);
  });

  it('F5: GREEN — fingerprint_inputs "none" declares nothing', () => {
    const fixture = d({
      staleness: { trigger: 'none', logic_version: 'none', fingerprint_inputs: 'none' },
    });
    expect(gate.fingerprintInputViolations(fixture, imports).length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // F6 — the grammar itself, locked against the 4 live data-signal forms.
  // -------------------------------------------------------------------------
  it('F6: DATA_SIGNAL_RE accepts the 4 live forms and rejects near misses', () => {
    for (const good of ['wsib_registry:count', 'parcels:count', 'address_points:count', 'parcels:centroid_lat_null_count']) {
      expect(gate.DATA_SIGNAL_RE.test(good), good).toBe(true);
    }
    for (const bad of ['parcels', 'parcels:', 'parcels:sum', ':count']) {
      expect(gate.DATA_SIGNAL_RE.test(bad), bad).toBe(false);
    }
  });

  // -------------------------------------------------------------------------
  // C1/C2 — the fleet-shaped result.
  // -------------------------------------------------------------------------
  it('C1: RED — both halves block the slug and count the examined entries', () => {
    const out = gate.checkLogicVersion([
      {
        descriptor: d({
          identity: { name: 's1', archetype: 'ENRICHER' },
          staleness: { trigger: 'none', logic_version: 'v1', fingerprint_inputs: ['x.js'] },
        }),
        imports: new Set<string>(),
      },
    ]);
    expect(out.pass).toBe(false);
    expect(out.blockedSlugs).toEqual(['s1']);
    expect(out.violations.length).toBe(2);
    expect(out.checked).toBe(1);
    expect(out.detail.startsWith('LOGIC-VERSION (P2-C3):')).toBe(true);
  });

  it('C2: GREEN — an all-good entry passes', () => {
    const out = gate.checkLogicVersion([
      {
        descriptor: d({
          identity: { name: 's2', archetype: 'LINK' },
          staleness: { trigger: [cv], logic_version: 'v1', fingerprint_inputs: ['scripts/lib/compute/s.js'] },
        }),
        imports,
      },
    ]);
    expect(out.pass).toBe(true);
    expect(out.blockedSlugs).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // T1 — the module's own self-test runs.
  // -------------------------------------------------------------------------
  it('T1: selfTest() does not throw', () => {
    expect(() => gate.selfTest()).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // G1 — GREEN CONTROL (live): the two fully-declared LINKs are clean.
  // -------------------------------------------------------------------------
  it('G1: live — link_parcels and link_neighbourhoods are clean on both halves', () => {
    const fleet = gate.loadLogicVersionFleet(REPO_ROOT);
    const bySlug = new Map(fleet.map((e) => [e.slug, e]));
    const pairs: Array<[string, string]> = [
      ['link_parcels', 'scripts/lib/compute/link-parcels.js'],
      ['link_neighbourhoods', 'scripts/lib/compute/link-neighbourhoods.js'],
    ];
    for (const [slug, computeRel] of pairs) {
      const entry = bySlug.get(slug);
      expect(entry, `${slug} missing from the converted fleet`).toBeDefined();
      if (!entry) throw new Error(`${slug} missing from the converted fleet`);
      expect(gate.logicVersionViolations(entry.descriptor).length, `${slug} logic_version`).toBe(0);
      expect(gate.fingerprintInputViolations(entry.descriptor, entry.imports).length, `${slug} fingerprint_inputs`).toBe(0);
      expect(gate.hasCodeVersionTrigger(entry.descriptor), `${slug} hasCodeVersionTrigger`).toBe(true);
      expect(stalenessField(entry.descriptor, 'logic_version'), `${slug} logic_version value`).not.toBe('none');
      expect(entry.imports?.has(computeRel), `${slug} imports ${computeRel}`).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // L1 — LIVE fingerprint_inputs half. EXPECTED GREEN (31 examined entries).
  // -------------------------------------------------------------------------
  it('L1: live — no fingerprint_inputs violations and at least 30 examined entries', () => {
    const fleet = gate.loadLogicVersionFleet(REPO_ROOT);
    const list: Array<object> = [];
    let checked = 0;
    for (const entry of fleet) {
      list.push(...gate.fingerprintInputViolations(entry.descriptor, entry.imports));
      const declared = stalenessField(entry.descriptor, 'fingerprint_inputs');
      if (Array.isArray(declared)) checked += declared.length;
    }
    expect(list, JSON.stringify(list)).toEqual([]);
    expect(checked, `checked=${checked}`).toBeGreaterThanOrEqual(30);
  });

  // -------------------------------------------------------------------------
  // L2 — LIVE logic_version half. EXPECTED RED until the FLEET-2 assembly.
  // -------------------------------------------------------------------------
  it('L2: live — no logic_version violations across the converted fleet', () => {
    const fleet = gate.loadLogicVersionFleet(REPO_ROOT);
    const list: Array<object> = [];
    for (const entry of fleet) list.push(...gate.logicVersionViolations(entry.descriptor));
    expect(list, JSON.stringify(list)).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // R1 — the rule text is exported and survives the stub (final wording).
  // -------------------------------------------------------------------------
  it('R1: LOGIC_VERSION_RULE states the closed rule', () => {
    expect(gate.LOGIC_VERSION_RULE).toContain('code_version');
    expect(gate.LOGIC_VERSION_RULE).toContain('HAND-BUMPED');
  });
});
