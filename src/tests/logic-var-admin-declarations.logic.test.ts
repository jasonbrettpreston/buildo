// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §10.3
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 3, "the admin intersection")
//
// WF2 "Admin Tunable Coverage" (.cursor/wf2_admin_tunable_coverage_active_task.md)
// commit 2 — the REVERSE-direction lock the followup found missing
// (src/tests/control-panel.logic.test.ts:355-371 only asserts the FORWARD
// direction, GROUPS ⊆ seed). Every seed key MUST now carry a declared
// `admin` field (commit 1's codemod), and that declaration must be
// structurally honest:
//   (a) reverse   — every seed key HAS an admin declaration.
//   (b) XOR+enum  — exactly one of group/hidden; hidden reason ∈ a closed
//                   enum (derived|internal|deprecated|migration-only|unclassified).
//   (c) dead⇒deprecated — a key with ZERO consumers anywhere in
//                   scripts/src/migrations (scripts/lib/logic-var-consumers.js,
//                   the ONE scanner shared with any future generator) MUST be
//                   hidden:"deprecated". Today: 0 members (G6 grounding,
//                   2026-09-03) — this is a live gate for the NEXT dead key,
//                   not a currently-failing assertion.
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { findConsumer } from '../../scripts/lib/logic-var-consumers.js';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SEED_PATH = path.join(REPO_ROOT, 'scripts', 'seeds', 'logic_variables.json');

type AdminDecl = { group: string } | { hidden: string };
type SeedEntry = { admin?: AdminDecl; [k: string]: unknown };
type Seed = Record<string, SeedEntry>;

const HIDDEN_REASONS = new Set(['derived', 'internal', 'deprecated', 'migration-only', 'unclassified']);

const rawSeed = fs.readFileSync(SEED_PATH, 'utf-8');
const SEED: Seed = JSON.parse(rawSeed);

// The closed set of "known" group labels — derived from what the CURRENT
// seed actually declares (self-consistent with commit 3's derivation: GROUPS
// is generated FROM admin.group declarations, so "known" = "in use"). A
// brand-new group needs at least one real key declaring it; that is a
// deliberate future decision, not something this lock should silently permit
// via typo.
const KNOWN_GROUP_LABELS = new Set(
  Object.values(SEED)
    .map((v) => (v.admin && 'group' in v.admin ? v.admin.group : undefined))
    .filter((g): g is string => typeof g === 'string'),
);

type ConsumerFinder = (key: string) => { kind: string; evidence: string } | null;

/**
 * Pure check over a seed-shaped object — returns human-readable findings
 * (empty array = clean). Reused by every GREEN/RED test below on both the
 * REAL committed seed and hand-built fixtures, exactly like
 * step-conformance.infra.test.ts's configFindings pattern.
 */
function checkAdminDeclarations(seed: Seed, findConsumerFn: ConsumerFinder): string[] {
  const findings: string[] = [];
  for (const [key, entry] of Object.entries(seed)) {
    const admin = entry.admin;
    if (admin === undefined) {
      findings.push(`"${key}" has no admin declaration — reverse-coverage gap`);
      continue;
    }
    const hasGroup = Object.prototype.hasOwnProperty.call(admin, 'group');
    const hasHidden = Object.prototype.hasOwnProperty.call(admin, 'hidden');
    if (hasGroup === hasHidden) {
      findings.push(
        `"${key}" admin declaration must have EXACTLY ONE of group/hidden (has group=${hasGroup}, hidden=${hasHidden})`,
      );
      continue;
    }
    if (hasGroup) {
      const group = (admin as { group: string }).group;
      if (!KNOWN_GROUP_LABELS.has(group)) {
        findings.push(`"${key}" admin.group "${group}" is not a known GlobalConfigCard group label`);
      }
    } else {
      const hidden = (admin as { hidden: string }).hidden;
      if (!HIDDEN_REASONS.has(hidden)) {
        findings.push(
          `"${key}" admin.hidden "${hidden}" is not in the closed enum (${[...HIDDEN_REASONS].join('|')})`,
        );
      }
      if (hidden !== 'deprecated') {
        const consumer = findConsumerFn(key);
        if (!consumer) {
          findings.push(
            `"${key}" has zero consumers anywhere in scripts/src/migrations and admin.hidden="${hidden}" — dead keys MUST be hidden:"deprecated"`,
          );
        }
      }
    }
  }
  return findings;
}

describe('logic-var-admin-declarations — reverse coverage (seed key ⇒ admin declaration)', () => {
  it('vacuous-pass guard: the seed parsed a non-trivial number of keys', () => {
    // Mirrors step-conformance.infra.test.ts:1072-1074 — a silent parse miss
    // (bad path, empty file) would make every check below vacuously pass.
    expect(Object.keys(SEED).length, 'seed JSON parsed empty or near-empty').toBeGreaterThan(300);
    expect(KNOWN_GROUP_LABELS.size, 'zero admin.group labels found — vacuous group-enum check').toBeGreaterThan(10);
  });

  it('GREEN — the real committed seed is clean (every key declared, XOR+enum honest, no undeprecated dead keys)', () => {
    const findings = checkAdminDeclarations(SEED, findConsumer);
    expect(findings, findings.join('\n')).toEqual([]);
  });

  it('RED — deleting a key\'s admin declaration reddens the reverse direction', () => {
    const someKey = Object.keys(SEED)[0]!;
    const fixture: Seed = structuredClone(SEED);
    delete fixture[someKey]!.admin;
    const findings = checkAdminDeclarations(fixture, findConsumer);
    expect(
      findings.some((f) => f.includes(`"${someKey}" has no admin declaration`)),
      findings.join('\n'),
    ).toBe(true);
  });

  it('RED — declaring BOTH group and hidden reddens the XOR check', () => {
    const someKey = Object.keys(SEED)[0]!;
    const fixture: Seed = structuredClone(SEED);
    fixture[someKey]!.admin = { group: 'Lead Scoring', hidden: 'unclassified' } as unknown as AdminDecl;
    const findings = checkAdminDeclarations(fixture, findConsumer);
    expect(
      findings.some((f) => f.includes(`"${someKey}"`) && f.includes('EXACTLY ONE of group/hidden')),
      findings.join('\n'),
    ).toBe(true);
  });

  it('RED — declaring NEITHER group nor hidden reddens the XOR check', () => {
    const someKey = Object.keys(SEED)[0]!;
    const fixture: Seed = structuredClone(SEED);
    fixture[someKey]!.admin = {} as unknown as AdminDecl;
    const findings = checkAdminDeclarations(fixture, findConsumer);
    expect(
      findings.some((f) => f.includes(`"${someKey}"`) && f.includes('EXACTLY ONE of group/hidden')),
      findings.join('\n'),
    ).toBe(true);
  });

  it('RED — an unknown hidden reason reddens the closed-enum check', () => {
    const someKey = Object.keys(SEED)[0]!;
    const fixture: Seed = structuredClone(SEED);
    fixture[someKey]!.admin = { hidden: 'because_i_said_so' };
    const findings = checkAdminDeclarations(fixture, findConsumer);
    expect(
      findings.some((f) => f.includes(`"${someKey}"`) && f.includes('is not in the closed enum')),
      findings.join('\n'),
    ).toBe(true);
  });

  it('RED — an unknown group label reddens the known-groups check', () => {
    const someKey = Object.keys(SEED)[0]!;
    const fixture: Seed = structuredClone(SEED);
    fixture[someKey]!.admin = { group: '___NOT_A_REAL_GROUP___' };
    const findings = checkAdminDeclarations(fixture, findConsumer);
    expect(
      findings.some((f) => f.includes(`"${someKey}"`) && f.includes('is not a known GlobalConfigCard group label')),
      findings.join('\n'),
    ).toBe(true);
  });

  it('RED — a key with zero consumers left hidden:"unclassified" reddens the dead⇒deprecated check', () => {
    // Built by concatenation, not a literal — the whole-corpus scanner reads
    // THIS test file too, so a literal fixture name would "consume" itself.
    const fixtureKey = ['zzz_wf2_admin_dead_fixture_never', 'consumed_anywhere'].join('_');
    // Confirm the fixture name is actually unreferenced anywhere in the
    // corpus BEFORE asserting on it — a name that happens to collide with
    // real source text would make this a false RED for the wrong reason.
    expect(findConsumer(fixtureKey), 'fixture key collided with a real consumer — pick a different name').toBeNull();
    const fixture: Seed = { ...structuredClone(SEED), [fixtureKey]: { admin: { hidden: 'unclassified' } } };
    const findings = checkAdminDeclarations(fixture, findConsumer);
    expect(
      findings.some((f) => f.includes(`"${fixtureKey}"`) && f.includes('MUST be hidden:"deprecated"')),
      findings.join('\n'),
    ).toBe(true);
  });

  it('GREEN — the same zero-consumer key marked hidden:"deprecated" does NOT redden (the escape valve works)', () => {
    const fixtureKey = ['zzz_wf2_admin_dead_fixture_never', 'consumed_anywhere'].join('_');
    const fixture: Seed = { ...structuredClone(SEED), [fixtureKey]: { admin: { hidden: 'deprecated' } } };
    const findings = checkAdminDeclarations(fixture, findConsumer);
    expect(findings.some((f) => f.includes(`"${fixtureKey}"`)), findings.join('\n')).toBe(false);
  });
});
