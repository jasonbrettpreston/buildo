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
//                   enum (derived|internal|deprecated|migration-only —
//                   "unclassified" RETIRED batch 6 of the ADMIN-1 ratchet,
//                   see the HIDDEN_REASONS declaration below).
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

// WF2 ADMIN-1 ratchet, batch 6 (closeout, F3): "unclassified" RETIRED from the
// closed enum. It was ratified as "the transitional value ONLY; not a valid
// end state" (WF2 "Admin Tunable Coverage" commit 1) — batches 1-5 drove the
// live count to 0 (scripts/steps/_schema/admin-unclassified-high-water-mark.json
// pinned at 0) and this removal makes a NEW unclassified key structurally
// impossible to declare, not merely ratcheted. The monotonic ratchet stays
// (belt-and-braces, F1) — this is an ADDITIONAL lock, not a replacement.
const HIDDEN_REASONS = new Set(['derived', 'internal', 'deprecated', 'migration-only']);

const rawSeed = fs.readFileSync(SEED_PATH, 'utf-8');
const SEED: Seed = JSON.parse(rawSeed);

// The closed set of "known" group labels — derived from what the CURRENT
// seed actually declares (self-consistent with commit 3's derivation: GROUPS
// is generated FROM admin.group declarations, so "known" = "in use"). A
// brand-new group needs at least one real key declaring it; that is a
// deliberate future decision, not something this lock should silently permit
// via typo.
//
// NOTE (WF2 ADMIN-1 ratchet, batch 1): this set is derived FROM the real
// seed, so a seed-wide typo (every occurrence of a label spelled the same
// wrong way) is vacuously green here — it never disagrees with itself. The
// BINDING lock for label correctness is scripts/generate-logic-variable-groups.mjs's
// GROUP_ORDER cross-validation (`:336-380`), which is pinned independently of
// the seed and THROWS on a seed→GROUP_ORDER mismatch in both directions; see
// the "RED — a seed key naming a group absent from GROUP_ORDER throws"
// fixture in src/tests/logic-variable-groups.infra.test.ts.
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

  it('RED — batch 6: "unclassified" is RETIRED from the closed enum, so declaring it now reddens', () => {
    const someKey = Object.keys(SEED)[0]!;
    const fixture: Seed = structuredClone(SEED);
    fixture[someKey]!.admin = { hidden: 'unclassified' };
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

  it('RED — a key with zero consumers left hidden:"internal" reddens the dead⇒deprecated check', () => {
    // Built by concatenation, not a literal — the whole-corpus scanner reads
    // THIS test file too, so a literal fixture name would "consume" itself.
    const fixtureKey = ['zzz_wf2_admin_dead_fixture_never', 'consumed_anywhere'].join('_');
    // Confirm the fixture name is actually unreferenced anywhere in the
    // corpus BEFORE asserting on it — a name that happens to collide with
    // real source text would make this a false RED for the wrong reason.
    expect(findConsumer(fixtureKey), 'fixture key collided with a real consumer — pick a different name').toBeNull();
    // WF2 ADMIN-1 ratchet, batch 6 (F-5): the vehicle for "any non-deprecated
    // hidden reason on a dead key must still redden" was "unclassified" —
    // now RETIRED from the enum, so a non-deprecated-vehicle test can no
    // longer use it (it would redden for the WRONG reason, the closed-enum
    // check, not the dead⇒deprecated check this test targets). "internal" is
    // a live, still-valid non-deprecated member of the enum.
    const fixture: Seed = { ...structuredClone(SEED), [fixtureKey]: { admin: { hidden: 'internal' } } };
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

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN-1 monotonic ratchet (commit 4) — programme-items.json's ADMIN-1
// ("unclassified count = 0") is NOT enforced by a red vitest (G10: a red test
// with 302 members would wedge .husky/pre-commit for every future commit,
// including the ones that would fix it). Instead: the live unclassified count
// may never RISE above the recorded high-water mark
// (scripts/steps/_schema/admin-unclassified-high-water-mark.json, refreshed
// downward-only by scripts/generate-logic-variable-groups.mjs) — a new key
// can never be added unclassified, while genuine reclassification work is
// free to lower the mark over time. This IS a red/green vitest — because the
// assertion is an inequality with 302 slack today, not "== 0".
// ─────────────────────────────────────────────────────────────────────────────
const RATCHET_PATH = path.join(REPO_ROOT, 'scripts', 'steps', '_schema', 'admin-unclassified-high-water-mark.json');

function liveUnclassifiedCount(seed: Seed): number {
  return Object.values(seed).filter((v) => v.admin && 'hidden' in v.admin && v.admin.hidden === 'unclassified').length;
}

/** Pure ratchet check, mirrored by the RED/GREEN fixtures below. */
function checkRatchet(liveCount: number, highWaterMark: number): string[] {
  if (liveCount > highWaterMark) {
    return [
      `live unclassified count (${liveCount}) exceeds the recorded high-water mark (${highWaterMark}) — a key was added hidden:"unclassified" without lowering the mark, or the mark was tampered with; see scripts/steps/_schema/admin-unclassified-high-water-mark.json`,
    ];
  }
  return [];
}

describe('ADMIN-1 monotonic ratchet — unclassified count never rises above the recorded high-water mark', () => {
  const ratchet = JSON.parse(fs.readFileSync(RATCHET_PATH, 'utf-8')) as { high_water_mark: number };

  it('vacuous-pass guard: the ratchet file parsed a real number (not NaN/undefined/missing)', () => {
    // WF2 ADMIN-1 ratchet batch 5 drove the live count to its TARGET of 0 —
    // 0 is the legitimate terminal value (Math.min never raises it back), so
    // this guard can no longer assert > 0; it only needs to rule out a parse
    // failure silently vacuous-passing every check below (e.g. NaN, which
    // would make `live > NaN` always false and every count "pass").
    expect(typeof ratchet.high_water_mark).toBe('number');
    expect(Number.isFinite(ratchet.high_water_mark)).toBe(true);
    expect(ratchet.high_water_mark).toBeGreaterThanOrEqual(0);
  });

  it('GREEN — the real live count does not exceed the recorded high-water mark', () => {
    const live = liveUnclassifiedCount(SEED);
    const findings = checkRatchet(live, ratchet.high_water_mark);
    expect(findings, findings.join('\n')).toEqual([]);
  });

  it('RED — a live count exceeding the recorded high-water mark reddens (fixture, not the real seed)', () => {
    const findings = checkRatchet(ratchet.high_water_mark + 1, ratchet.high_water_mark);
    expect(
      findings.some((f) => f.includes('exceeds the recorded high-water mark')),
      findings.join('\n'),
    ).toBe(true);
  });

  it('GREEN — a live count BELOW the recorded high-water mark does not redden (decreasing is free)', () => {
    const findings = checkRatchet(ratchet.high_water_mark - 1, ratchet.high_water_mark);
    expect(findings, findings.join('\n')).toEqual([]);
  });

  it('GREEN — a live count EQUAL to the recorded high-water mark does not redden (boundary)', () => {
    const findings = checkRatchet(ratchet.high_water_mark, ratchet.high_water_mark);
    expect(findings, findings.join('\n')).toEqual([]);
  });
});
