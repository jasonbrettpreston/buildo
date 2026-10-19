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

  it('(a) enrich_permits / enrich_coa_zoning copy window: every step-owned copy takes effect at cutover', () => {
    for (const slug of ['enrich_permits', 'enrich_coa_zoning']) {
      for (const suffix of ['zoning_coverage_fail_pct', 'zoning_coverage_pass_min_pct', 'bylaw_max_fsi_null_warn_pct', 'bylaw_max_coverage_null_warn_pct', 'centreline_coverage_min']) {
        expect(committed.entries[`${slug}_${suffix}`], `${slug}_${suffix}`).toMatchObject({ badge: BADGE_CUTOVER, step: slug });
      }
    }
    expect(committed.entries.enrich_coa_zoning_centreline_coverage_min?.legacy_name).toBe('centreline_propagation_coverage_min');
    expect(committed.entries.enrich_coa_zoning_bylaw_max_fsi_null_warn_pct?.legacy_name).toBe('coa_bylaw_max_fsi_null_warn_pct');
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
