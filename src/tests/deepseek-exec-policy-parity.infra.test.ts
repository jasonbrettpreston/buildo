// SPEC LINK: docs/specs/00-architecture/08_agents.md §C.6.2
//
// Engine fence F5 — §C.6.2 ↔ scripts/lib/exec-policy.json parity lock (R-AN:
// derive, never retype). Spec 08's prose once named 8 reserved registries
// while the policy JSON held 11; the retyped list had drifted from the
// source of truth. This lock parses the spec's `` `key` = [...] `` lines and
// asserts they EQUAL the corresponding exec-policy.json arrays, so any future
// drift fails the build instead of surviving as prose.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './helpers/deepseek-exec-harness';

const SPEC_PATH = path.join(REPO_ROOT, 'docs/specs/00-architecture/08_agents.md');
const POLICY_PATH = path.join(REPO_ROOT, 'scripts/lib/exec-policy.json');

/**
 * Extract the backticked entries of the single `` `key` = [`a`, `b`] `` line
 * in the spec. Fail closed: anything other than exactly one such list for the
 * given key (absent, duplicated) is an error, never an empty silently-passing
 * list.
 */
function extractSpecList(specText: string, key: string): string[] {
  const re = new RegExp('`' + key + '` = \\[([^\\]]*)\\]', 'g');
  const hits = [...specText.matchAll(re)];
  if (hits.length !== 1) throw new Error(`expected exactly one \`${key}\` = [...] list in Spec 08, found ${hits.length}`);
  return [...(hits[0]?.[1] ?? '').matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? '');
}

function listDiff(specList: string[], policyList: string[]) {
  return {
    missingFromSpec: policyList.filter((p) => !specList.includes(p)),
    extraInSpec: specList.filter((s) => !policyList.includes(s)),
    duplicates: specList.filter((s, i) => specList.indexOf(s) !== i),
  };
}

const specText = fs.readFileSync(SPEC_PATH, 'utf8');
const policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8')) as Record<string, unknown>;

describe('F5: Spec 08 §C.6.2 lists equal exec-policy.json (R-AN)', () => {
  // LIVE and FIXTURE arms are separate tests so a live-pair failure never
  // masks the fixture (red-direction) proofs, and vice versa.
  it.each(['registry_reserved', 'claude_only_globs'])('LIVE: the Spec 08 %s list equals exec-policy.json', (key) => {
    const policyList = policy[key] as string[];
    const specList = extractSpecList(specText, key);
    expect(listDiff(specList, policyList)).toEqual({ missingFromSpec: [], extraInSpec: [], duplicates: [] });
    expect(specList.length).toBe(policyList.length);
  });

  it.each(['registry_reserved', 'claude_only_globs'])('FIXTURE: %s drift is caught in every direction', (key) => {
    const policyList = policy[key] as string[];

    // 2. FIXTURE red direction: dropping the first policy entry must be caught.
    const fixture = '`' + key + '` = [' + policyList.slice(1).map((p) => '`' + p + '`').join(', ') + ']';
    expect(listDiff(extractSpecList(fixture, key), policyList).missingFromSpec).toEqual([policyList[0]]);

    // 3. FIXTURE extra: an unknown entry must surface as extraInSpec.
    const fullFixture = '`' + key + '` = [' + policyList.map((p) => '`' + p + '`').join(', ') + ']';
    const extraFixture = '`' + key + '` = [' + policyList.map((p) => '`' + p + '`').join(', ') + ', `bogus/path.json`]';
    expect(listDiff(extractSpecList(extraFixture, key), policyList).extraInSpec).toEqual(['bogus/path.json']);

    // 4. FIXTURE absent / duplicated: both fail closed.
    expect(() => extractSpecList('no list here', key)).toThrow();
    expect(() => extractSpecList(`${fullFixture}\n${fullFixture}`, key)).toThrow();
  });

  it('registry_reserved names the self-referential registries', () => {
    // Counts (11) are deliberately NOT asserted — a count is a retyped list in
    // disguise; the equality lock above is the real guard. These two members
    // are the self-referential ones, asserted by identity.
    const reserved = policy.registry_reserved as string[];
    expect(reserved).toContain('scripts/lib/exec-policy.json');
    expect(reserved).toContain('docs/specs/00-architecture/00_system_map.md');
  });
});
