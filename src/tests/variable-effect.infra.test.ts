// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-EO, R-DL
//
// R-EO on the real tree: the committed admin badge file is the derivation (no drift), the known copy-window
// members carry "Takes effect at cutover" with their legacy names, and the admin logic-variable card renders the
// badge. The derivation itself is proven over fixtures in variable-effect.logic.test.ts.
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { BADGE_CUTOVER, BADGE_UNREAD, loadVariableEffect, checkVariableEffect } from '../../scripts/analysis/gates/variable-effect.mjs';

const ROOT = path.resolve(__dirname, '../..');
const EFFECT_REL = 'src/features/admin-controls/generated/logic-variable-effect.json';
const committed = JSON.parse(fs.readFileSync(path.join(ROOT, EFFECT_REL), 'utf8')) as {
  entries: Record<string, { badge: string; reason: string; step?: string; legacy_name?: string | null }>;
};
const derived = loadVariableEffect(ROOT);

describe('R-EO — admin shows whether a setting is in effect (real tree)', () => {
  it('the committed badge file equals the derivation (fast invariant #53 is green)', () => {
    const r = checkVariableEffect(derived, committed);
    expect(r.violations).toEqual([]);
    expect(r.pass).toBe(true);
  });

  it('(a) assert_coa_freshness copy window: both step-owned bounds take effect at cutover, naming the legacy variables', () => {
    expect(committed.entries.assert_coa_freshness_warn_max_days).toMatchObject({ badge: BADGE_CUTOVER, step: 'assert_coa_freshness', legacy_name: 'coa_freshness_warn_days' });
    expect(committed.entries.assert_coa_freshness_fail_max_days).toMatchObject({ badge: BADGE_CUTOVER, step: 'assert_coa_freshness', legacy_name: 'coa_freshness_fail_days' });
  });

  // Night P4 R-EQ shell swap (b2ea1532, 2026-10-20): enrich_coa_zoning left the copy window (stage runner_wired), so its
  // step-owned copies are read by the live frozen shell and carry no badge. enrich_permits is still in its window.
  it('(a) enrich_permits copy window: its step-owned copies take effect at cutover; enrich_coa_zoning (runner_wired) reads its own', () => {
    // centreline_coverage_min is left out for enrich_permits: the shared, now-live scripts/lib/enrich-lead-zoning.js reads
    // `${slug}_centreline_coverage_min`, which R-EO's template-literal rule counts as a read for BOTH slugs (the
    // documented known limit, variable-effect.mjs header). PIN VAR-EFFECT-SHARED-TEMPLATE (lane night-p4-c report).
    for (const suffix of ['zoning_coverage_fail_pct', 'zoning_coverage_pass_min_pct', 'bylaw_max_fsi_null_warn_pct', 'bylaw_max_coverage_null_warn_pct']) {
      expect(committed.entries[`enrich_permits_${suffix}`], `enrich_permits_${suffix}`).toMatchObject({ badge: BADGE_CUTOVER, step: 'enrich_permits' });
    }
    for (const suffix of ['zoning_coverage_fail_pct', 'zoning_coverage_pass_min_pct', 'bylaw_max_fsi_null_warn_pct', 'bylaw_max_coverage_null_warn_pct', 'centreline_coverage_min']) {
      expect(committed.entries[`enrich_coa_zoning_${suffix}`], `enrich_coa_zoning_${suffix}`).toBeUndefined();
    }
  });

  it('the legacy variables those steps still read are in effect, so they carry no badge', () => {
    for (const k of ['coa_freshness_warn_days', 'coa_freshness_fail_days', 'centreline_propagation_coverage_min']) {
      expect(committed.entries[k], k).toBeUndefined();
    }
  });

  it('every badge is one of the two kinds and carries a reason', () => {
    for (const [k, e] of Object.entries(committed.entries)) {
      expect([BADGE_CUTOVER, BADGE_UNREAD], k).toContain(e.badge);
      expect(e.reason.length, k).toBeGreaterThan(20);
    }
  });

  it('the admin logic-variable card renders the badge next to the variable, read from the generated badge file', () => {
    const card = fs.readFileSync(path.join(ROOT, 'src/features/admin-controls/components/GlobalConfigCard.tsx'), 'utf8');
    const badge = fs.readFileSync(path.join(ROOT, 'src/features/admin-controls/components/EffectBadge.tsx'), 'utf8');
    expect(badge).toContain("from '../generated/logic-variable-effect.json'");
    expect(card.match(/<EffectBadge varKey=\{key\} \/>/g)?.length).toBe(3); // enum, JSON and numeric rows
  });
});
