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

  // P16 16C [GRD-1]: the P13-3 demoted bundle-prior loop is KNOWINGLY RETIRED, and its old lock
  // ("bundle-prior tier-2 emission sets is_active: false") retires WITH it. The fence's intent
  // (bundle-only recall must not inflate forecasts/scores at full weight) carries forward via the
  // lean inference layer: hard-gated on p16_inference_layer_enabled, attachment_basis='inference'
  // (consumers rank/weight by basis, D5), confidence 0.50 descriptive-only [FAB4].
  it('P16 16C: the coarse bundle-prior loop is retired from the TRADE path', () => {
    const content = src();
    const body = content.slice(
      content.indexOf('function classifyPermit('),
      content.indexOf('// Main'),
    );
    // classifyPermit must not emit archetype bundle trades any more (bundleSlugsFor survives
    // ONLY in the products path) and must carry NO inactive emission site.
    expect(body).not.toMatch(/bundleSlugsFor\(/);
    expect(body).not.toMatch(/is_active\s*:\s*false/);
  });

  it('P16 16C: lean inference emission is HARD-GATED, active, basis-inference, conf 0.50', () => {
    const content = src();
    // Gate guard present…
    expect(content).toMatch(/if\s*\(\s*inferenceEnabled\s*\)\s*\{/);
    // …and the emission block: tier 2 + INFERENCE_TIER_CONFIDENCE + is_active: true + basis.
    const block = content.match(/tier:\s*2,[\s\S]{0,120}?confidence:\s*INFERENCE_TIER_CONFIDENCE,[\s\S]{0,700}?is_active:\s*(true|false),[\s\S]{0,220}?attachment_basis:\s*'inference'/);
    expect(block, 'inference tradeMatch block not found').toBeTruthy();
    expect(block?.[1], 'inference rows must SERVE (is_active: true — D1/D5)').toBe('true');
    expect(content).toMatch(/INFERENCE_TIER_CONFIDENCE\s*=\s*0\.50?\b/);
    // The evidence-hit union guard + downstream gates are preserved [GRD-2].
    expect(content).toMatch(/if\s*\(\s*merged\.has\(slug\)\s*\)\s*continue/);
    expect(content).toMatch(/applyScopeLimit\(/);
    // The gate reads the logic variable (seeded default OFF).
    expect(content).toMatch(/p16_inference_layer_enabled/);
  });

  // [GRD-2] narrow-permit-gains-no-inference lock: the inference block sits INSIDE the
  // broad-scope path — narrow (code-carrying) permits early-return BEFORE it.
  it('P16 16C: narrow-scope permits early-return BEFORE the inference layer', () => {
    const content = src();
    const body = content.slice(
      content.indexOf('function classifyPermit('),
      content.indexOf('// Main'),
    );
    const narrowReturn = body.indexOf('if (isNarrowScope)');
    const inferenceBlock = body.indexOf('if (inferenceEnabled)');
    expect(narrowReturn).toBeGreaterThan(-1);
    expect(inferenceBlock).toBeGreaterThan(-1);
    expect(narrowReturn, 'narrow early-return must precede the inference layer').toBeLessThan(inferenceBlock);
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

  // P16 16C dual-path mirror lock (supersedes the P13-3 bundle lock, retired knowingly with the
  // bundle loop): the TS trade path carries the SAME gated lean inference layer as the JS.
  it('P16 16C: TS classifier mirrors the retired bundle + gated inference layer', () => {
    const content = tsSrc();
    // The trade bundle loop is gone — no bundleConf-carrying trade emission remains.
    expect(content).not.toMatch(/confidence:\s*bundleConf,/);
    // Gated inference block present, is_active: true, basis 'inference'.
    expect(content).toMatch(/options\?\.inferenceEnabled/);
    const block = content.match(/confidence:\s*INFERENCE_TIER_CONFIDENCE,[\s\S]{0,400}?is_active:\s*true,[\s\S]{0,200}?attachment_basis:\s*'inference'/);
    expect(block, 'TS inference emission block not found').toBeTruthy();
    // Products bundle survives (bundleSlugsFor still used in classifyProducts).
    expect(content).toMatch(/bundleSlugsFor\(/);
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

// ─── P16 16F — §R10 corpus-wide band rows (D7 global band + [FAB2] + [FAB1v2]) ──
describe('classify-permits.js — P16 16F audit bands', () => {
  it('D7 global band: inference_mean_trades_per_permit with WARN/FAIL thresholds from contracts', () => {
    const content = src();
    expect(content).toMatch(/INFERENCE_MEAN_WARN\s*=\s*11\b/);
    expect(content).toMatch(/INFERENCE_MEAN_FAIL\s*=\s*13\b/);
    expect(content).toMatch(/metric:\s*'inference_mean_trades_per_permit'/);
    // p95/max companions (an average hides permit-level spikes — DeepSeek).
    expect(content).toMatch(/metric:\s*'inference_p95_trades_per_permit'/);
    expect(content).toMatch(/metric:\s*'inference_max_trades_per_permit'/);
  });

  it('[FAB2] starvation two-band: FAIL band DERIVED from LINE_TRADE_COMPLEMENT (not hand-maintained)', () => {
    const content = src();
    expect(content).toMatch(/complementTradesFor\(Object\.keys\(LINE_TRADE_COMPLEMENT\)\)/);
    expect(content).toMatch(/metric:\s*'starved_trades_recovered_fail_band'/);
    expect(content).toMatch(/metric:\s*'starved_trades_uncovered_band'/);
    // temporary-fencing stays OUT of the starvation list (D8d).
    const listBlock = content.match(/STARVED_TRADE_SLUGS\s*=\s*\[([\s\S]*?)\]/);
    expect(listBlock?.[1]).not.toMatch(/temporary-fencing/);
  });

  it('[FAB1v2] attachment_basis_null_count is a hard == 0 gate', () => {
    const content = src();
    expect(content).toMatch(/metric:\s*'attachment_basis_null_count'/);
    expect(content).toMatch(/basisNullCount === 0 \? 'PASS' : 'FAIL'/);
  });

  it('the audit verdict is ROW-DERIVED (Spec 47 §8.2 — no parallel boolean)', () => {
    const content = src();
    expect(content).toMatch(/verdict:\s*classifyAuditRows\.some\(\(r\) => r\.status === 'FAIL'\)/);
    expect(content).not.toMatch(/verdict:\s*classifyHasWarns/);
  });

  it('band statuses are gated on inferenceEnabled (gate OFF → INFO, no false FAIL)', () => {
    const content = src();
    expect(content).toMatch(/!inferenceEnabled \? 'INFO'/);
  });
});
