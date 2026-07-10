// SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md §Step-13
// SPEC LINK: docs/specs/01-pipeline/85_trade_forecast_engine.md §3 (is_active always-true WF1)
//
// Infra tests for scripts/classify-permits.js:
//   (a) is_active is ALWAYS true — phase-based time-gating removed (WF1)
//   (b) isTradeActiveInPhase still exists for the lead-score +15 phase boost
//   (c) --full mode support
//   (d) Advisory lock, streaming, dual code path shape

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'classify-permits.js');
const TS_PATH = path.join(
  REPO_ROOT,
  'src',
  'lib',
  'classification',
  'classifier.ts',
);

function src(): string {
  return fs.readFileSync(SCRIPT_PATH, 'utf8');
}
function tsSrc(): string {
  return fs.readFileSync(TS_PATH, 'utf8');
}

describe('classify-permits.js — file existence', () => {
  it('script file exists', () => {
    expect(fs.existsSync(SCRIPT_PATH)).toBe(true);
  });
});

describe('classify-permits.js — is_active (WF1 time-gate removed; P13-3 bundle-prior demotion)', () => {
  it('is_active is never set from isTradeActiveInPhase result (phase time-gate removed WF1)', () => {
    const content = src();
    // Must NOT assign is_active from the isActive variable inside classifyPermit
    expect(content).not.toMatch(/is_active\s*:\s*isActive/);
    // Must NOT call isTradeActiveInPhase and assign result to is_active directly
    expect(content).not.toMatch(/is_active\s*:\s*isTradeActiveInPhase/);
  });

  it('DIRECT classification tiers (tag/rule/fallback/realtor) stay is_active: true', () => {
    const content = src();
    // The direct tag/rule/fallback/realtor emissions must remain active — at least 4
    // is_active: true sites survive the P13-3 bundle-prior demotion.
    const matches = content.match(/is_active\s*:\s*true/g);
    expect(matches).toBeTruthy();
    expect((matches ?? []).length).toBeGreaterThanOrEqual(4);
  });

  // P13-3 regression lock: the archetype bundle-prior tier-2 emission is DEMOTED to
  // is_active: false so bundle-only recall no longer inflates every forecast/score.
  // The direct-hit guard (`merged.has(slug)` → continue) keeps direct matches active.
  it('P13-3: the bundle-prior tier-2 emission sets is_active: false', () => {
    const content = src();
    // The bundle-prior tradeMatch is the block carrying `confidence: bundleConf`;
    // its is_active must be false (the only false site in classifyPermit).
    const bundleBlock = content.match(/tier:\s*2,[\s\S]{0,220}?confidence:\s*bundleConf,[\s\S]{0,900}?is_active:\s*(true|false)/);
    expect(bundleBlock, 'bundle-prior tradeMatch block not found').toBeTruthy();
    expect(bundleBlock?.[1], 'bundle-prior must be is_active: false (P13-3)').toBe('false');
    // And the direct-hit dedup guard that keeps direct matches active is preserved.
    expect(content).toMatch(/if\s*\(\s*merged\.has\(slug\)\s*\)\s*continue/);
    // applyScopeLimit / NARROW_SCOPE_CODES gate stays wired (scope-limit preserved).
    expect(content).toMatch(/applyScopeLimit\(/);
  });

  it('isTradeActiveInPhase function still exists — used by calculateLeadScore for +15 boost', () => {
    const content = src();
    expect(content).toMatch(/function isTradeActiveInPhase/);
    // Must still be called inside calculateLeadScore for the phase-match boost
    expect(content).toMatch(/isTradeActiveInPhase\(match\.trade_slug/);
  });

  it('calculateLeadScore still awards +15 boost for phase-matching trades', () => {
    const content = src();
    expect(content).toMatch(/isTradeActiveInPhase/);
    expect(content).toMatch(/score\s*\+=\s*15/);
  });
});

describe('classifier.ts — dual code path mirrors classify-permits.js (§7.1; P13-3)', () => {
  it('TS classifier does not set is_active from isTradeActiveInPhase result', () => {
    const content = tsSrc();
    expect(content).not.toMatch(/is_active\s*:\s*isActive\b/);
    expect(content).not.toMatch(/is_active\s*:\s*isTradeActiveInPhase/);
  });

  it('TS classifier keeps DIRECT trade match sites is_active: true', () => {
    const content = tsSrc();
    const matches = content.match(/is_active\s*:\s*true/g);
    expect(matches).toBeTruthy();
    expect((matches ?? []).length).toBeGreaterThanOrEqual(4);
  });

  // P13-3 dual-path mirror lock: the TS bundle prior must match the JS (is_active: false).
  it('P13-3: TS classifier bundle prior sets is_active: false (mirrors classify-permits.js)', () => {
    const content = tsSrc();
    const bundleBlock = content.match(/tier:\s*2,[\s\S]{0,80}?confidence:\s*bundleConf,[\s\S]{0,120}?is_active:\s*(true|false)/g);
    expect(bundleBlock, 'TS bundle-prior blocks not found').toBeTruthy();
    // Both bundle-prior sites (partial + merged.set) must be is_active: false.
    for (const block of bundleBlock ?? []) {
      expect(block, 'TS bundle prior must be is_active: false (P13-3)').toMatch(/is_active:\s*false/);
    }
  });
});

describe('classify-permits.js — protocol compliance', () => {
  it('uses ADVISORY_LOCK_ID = 88 with pipeline.withAdvisoryLock', () => {
    const content = src();
    expect(content).toMatch(/ADVISORY_LOCK_ID\s*=\s*88/);
    expect(content).toMatch(/pipeline\.withAdvisoryLock\(pool,\s*ADVISORY_LOCK_ID/);
  });

  it('supports --full re-run via pipeline.isFullMode()', () => {
    const content = src();
    expect(content).toMatch(/pipeline\.isFullMode\(\)/);
    expect(content).toMatch(/fullMode/);
  });

  it('uses keyset-paginated pool.query loop for the main permit scan', () => {
    const content = src();
    // classify-permits uses keyset pagination (while-true + cursor) rather than streamQuery
    expect(content).toMatch(/while\s*\(\s*true\s*\)/);
    expect(content).toMatch(/permit_num.*revision_num.*>\s*\(\s*\$\d+/);
  });

  it('emits PIPELINE_SUMMARY with audit_table', () => {
    const content = src();
    expect(content).toMatch(/pipeline\.emitSummary/);
    expect(content).toMatch(/audit_table\s*:/);
  });

  it('emits PIPELINE_META with reads and writes', () => {
    const content = src();
    expect(content).toMatch(/pipeline\.emitMeta/);
    expect(content).toMatch(/permit_trades/);
  });

  // ─── WF2 #2 (2026-05-08) — permit_type_class gating regression-locks ──

  it('imports the permit-type-class helpers (loadPermitTypeClassMap, classifyPermitType, filterTradesByClass, shouldAppendRealtor)', () => {
    const content = src();
    expect(content).toMatch(/require\(\s*['"]\.\/lib\/permit-type-classifier['"]\s*\)/);
    expect(content).toMatch(/loadPermitTypeClassMap/);
    expect(content).toMatch(/classifyPermitType/);
    expect(content).toMatch(/filterTradesByClass/);
    expect(content).toMatch(/shouldAppendRealtor/);
  });

  it('loads the permit_type class map at startup (Spec 47 §R5 startup-guard pattern)', () => {
    const content = src();
    expect(content).toMatch(/await\s+loadPermitTypeClassMap\(\s*pool/);
  });

  it('threads permitClass through classifyPermit at every call site', () => {
    const content = src();
    // Every classifyPermit invocation with arguments must reference permitClass
    // or classifyPermitType — the new gating axis. Empty-paren references like
    // "classifyPermit()" inside comments are skipped (literal-prose mention).
    const callMatches = content.match(/classifyPermit\([^)]+\)/g) ?? [];
    expect(callMatches.length).toBeGreaterThan(0);
    for (const call of callMatches) {
      expect(call, `classifyPermit call missing permitClass: ${call}`).toMatch(/permitClass|classifyPermitType/);
    }
  });

  it('gates realtor append on shouldAppendRealtor (construction class only)', () => {
    const content = src();
    expect(content).toMatch(/shouldAppendRealtor\(/);
    // The bare unconditional appendRealtorMatch return (no class gate) should
    // no longer exist — it must be wrapped in shouldAppendRealtor() before invoke.
    expect(content).not.toMatch(/return\s+appendRealtorMatch\(matches,\s*permit,\s*phase,\s*runAt,\s*realtorAvailable\s*\);/);
  });

  it('filters trade matches via filterTradesByClass before appending realtor', () => {
    const content = src();
    expect(content).toMatch(/filterTradesByClass\(/);
  });
});

// ─── P16 D2 — permit_type family ceiling (complement to NARROW_SCOPE_CODES) ──
describe('classify-permits.js — P16 permit_type ceiling (D2)', () => {
  it('defines PERMIT_TYPE_CEILING for the plumbing/mechanical/drain permit_types', () => {
    const content = src();
    expect(content).toMatch(/PERMIT_TYPE_CEILING\s*=/);
    expect(content).toMatch(/'Plumbing\(PS\)'\s*:\s*\[\s*'plumbing'\s*\]/);
    expect(content).toMatch(/'Mechanical\(MS\)'\s*:\s*\[\s*'hvac'\s*\]/);
    expect(content).toMatch(/'Drain and Site Service'\s*:\s*\[\s*'drain-plumbing'\s*\]/);
  });

  it('applies the ceiling on the BROAD-scope final set (after applyScopeLimit, before applyClassGating)', () => {
    const content = src();
    // The ceiling filter must sit between applyScopeLimit and the final applyClassGating return —
    // narrow (code-carrying) permits early-return above and are never touched.
    expect(content).toMatch(/permitTypeCeilingFor\(permit\.permit_type\)/);
    expect(content).toMatch(/final\s*=\s*final\.filter\(\(m\)\s*=>\s*ceiling\.includes\(m\.trade_slug\)\)/);
  });

  it('emits the permit_type_ceiling_applied_count audit row (§R10, [BUG-1])', () => {
    const content = src();
    expect(content).toMatch(/permit_type_ceiling_applied_count/);
  });

  it('dual-path: classifier.ts mirrors PERMIT_TYPE_CEILING', () => {
    const content = tsSrc();
    expect(content).toMatch(/PERMIT_TYPE_CEILING/);
    expect(content).toMatch(/permitTypeCeilingFor\(permit\.permit_type\)/);
  });
});

// ─── P16 D4 — attachment_basis provenance emission ──
describe('classify-permits.js — P16 attachment_basis (D4)', () => {
  it('derives attachment_basis from is_active (evidence|inference) when not set explicitly', () => {
    const content = src();
    expect(content).toMatch(/attachment_basis\s*\|\|\s*\(m\.is_active\s*\?\s*'evidence'\s*:\s*'inference'\)/);
  });

  it('INSERT + ON CONFLICT SET carry attachment_basis', () => {
    const content = src();
    expect(content).toMatch(/INSERT INTO permit_trades[\s\S]*?attachment_basis\)/);
    expect(content).toMatch(/attachment_basis\s*=\s*EXCLUDED\.attachment_basis/);
  });

  it('emitMeta writes list includes attachment_basis on permit_trades', () => {
    const content = src();
    expect(content).toMatch(/"permit_trades":\s*\[[^\]]*"attachment_basis"[^\]]*\]/);
  });
});
