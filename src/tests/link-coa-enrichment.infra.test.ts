// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.6.D + §6.9 + §6.11 Phase D R5.6 + new §6.6.X Lead-Identity Continuity
//             docs/specs/01-pipeline/47_pipeline_script_protocol.md §R1-R12
//             docs/specs/01-pipeline/48_pipeline_observability.md §3 (downstream observer consumes audit_table)
//
// WF1 R5.6 Part A — SQL-string + behavior regression-lock for `link-coa.js`
// permit→CoA enrichment pass. Locks in the 14 fold-driven design decisions
// from the 4-reviewer plan-review (Gemini + DeepSeek + independent + observability).
//
// Folds locked-in here:
//   - Indep C1 (CRIT): DISTINCT ON subquery for revision_num disambiguation
//   - Obs L1-1 (CRIT): coa_below_confidence_floor_count audit metric
//   - Obs L1-3 (HIGH): lead_identity_lat_lng_mismatch_count audit metric (== 0 FAIL)
//   - Obs L3-4 (HIGH): coa_ward_filled_from_permit_count + coa_ward_mismatch_with_permit_count
//   - DeepSeek (CRIT): stale_back_refs_cleared_count audit metric + pre-pass extension
//   - Gemini + DeepSeek + Obs L3-3 (HIGH): confidence floor 0.60 (excludes Tier 2b + Tier 3)
//   - Gemini (HIGH): p.latitude IS NOT NULL AND p.longitude IS NOT NULL (atomic pair guard)
//   - Indep H3 (HIGH): enrichment in its own withTransaction (post-tier)
//   - Indep H5 (HIGH): lead_parcels.parcel_id unaffected by enrichment
//   - Indep M2 (MED): Zod explicit field for new logic_var
//   - Indep M4 + Obs L3-7 (MED): emitMeta includes new column reads/writes
//   - Indep H1 (REJECT): §R3.5 false positive — getDbTimestamp inside lock is Spec 47 §15 compliant

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SCRIPT = path.resolve(__dirname, '../../scripts/link-coa.js');
const src = fs.readFileSync(SCRIPT, 'utf-8');

describe('link-coa.js — R5.6 Part A enrichment SQL structure', () => {
  it('SPEC LINK header includes Phase D R5.6 reference', () => {
    expect(src).toMatch(/SPEC LINK:\s*docs\/specs\/01-pipeline\/42_chain_coa\.md/i);
    expect(src).toMatch(/R5\.6/);
  });

  it('Indep C1 fold (CRIT): enrichment UPDATE uses DISTINCT ON subquery for revision_num disambiguation', () => {
    // The enrichment UPDATE must include a subquery (CTE or inline) that picks
    // a single "best" permit revision per permit_num. Mirrors existing Tier 1a pattern.
    // Capture the entire enrichment block — from the "Phase D R5.6 Part A"
    // header through the next section's `// -------` divider (next pass of
    // ~30 dashes), bounded to 12000 chars for safety.
    const enrichmentBlock = src.match(/Phase D R5\.6 Part A[\s\S]{1,12000}/);
    expect(enrichmentBlock, 'R5.6 enrichment block must be present').not.toBeNull();
    expect(enrichmentBlock?.[0]).toMatch(/DISTINCT\s+ON\s*\(\s*[a-z_]*\.?permit_num\s*\)/i);
    expect(enrichmentBlock?.[0]).toMatch(/ORDER\s+BY[\s\S]{0,200}?revision_num/i);
  });

  it('Gemini HIGH fold: atomic lat/long pair guard — both p.latitude IS NOT NULL AND p.longitude IS NOT NULL', () => {
    // Capture the entire enrichment block — from the "Phase D R5.6 Part A"
    // header through the next section's `// -------` divider (next pass of
    // ~30 dashes), bounded to 12000 chars for safety.
    const enrichmentBlock = src.match(/Phase D R5\.6 Part A[\s\S]{1,12000}/);
    expect(enrichmentBlock, 'R5.6 enrichment block must be present').not.toBeNull();
    expect(enrichmentBlock?.[0]).toMatch(
      /p\.latitude\s+IS\s+NOT\s+NULL[\s\S]{0,80}?p\.longitude\s+IS\s+NOT\s+NULL/i,
    );
  });

  it('Confidence floor raised to 0.60 (excludes Tier 2b name-only @ 0.50 + Tier 3 FTS cap @ 0.50)', () => {
    // Logic_var name must be coa_inherit_from_permit_min_confidence.
    // The enrichment SQL must reference it as the >= floor.
    expect(src).toMatch(/coa_inherit_from_permit_min_confidence/);
    // Capture the entire enrichment block — from the "Phase D R5.6 Part A"
    // header through the next section's `// -------` divider (next pass of
    // ~30 dashes), bounded to 12000 chars for safety.
    const enrichmentBlock = src.match(/Phase D R5\.6 Part A[\s\S]{1,12000}/);
    expect(enrichmentBlock?.[0]).toMatch(
      /linked_confidence\s*>=\s*\$\d+[\s\S]{0,40}?(?:numeric|::numeric)/i,
    );
  });

  it('IS DISTINCT FROM guards on lat/long + ward (idempotent, no dead-tuple bloat)', () => {
    // Capture the entire enrichment block — from the "Phase D R5.6 Part A"
    // header through the next section's `// -------` divider (next pass of
    // ~30 dashes), bounded to 12000 chars for safety.
    const enrichmentBlock = src.match(/Phase D R5\.6 Part A[\s\S]{1,12000}/);
    expect(enrichmentBlock?.[0]).toMatch(/ca\.latitude\s+IS\s+DISTINCT\s+FROM/i);
    expect(enrichmentBlock?.[0]).toMatch(/ca\.longitude\s+IS\s+DISTINCT\s+FROM/i);
    expect(enrichmentBlock?.[0]).toMatch(/ca\.ward\s+IS\s+NULL[\s\S]{0,80}?bp\.ward\s+IS\s+NOT\s+NULL/i);
  });

  it('Indep M5 + checklist (e): ward COALESCE direction preserves CoA ward (fills NULL only)', () => {
    // Capture the entire enrichment block — from the "Phase D R5.6 Part A"
    // header through the next section's `// -------` divider (next pass of
    // ~30 dashes), bounded to 12000 chars for safety.
    const enrichmentBlock = src.match(/Phase D R5\.6 Part A[\s\S]{1,12000}/);
    // SET ward = COALESCE(ca.ward, bp.ward) — keeps CoA's ward when set
    expect(enrichmentBlock?.[0]).toMatch(/ward\s*=\s*COALESCE\s*\(\s*ca\.ward\s*,\s*[a-z_]*\.?ward\s*\)/i);
  });

  it('Indep H3 fold: enrichment runs in its own pipeline.withTransaction (post-tier)', () => {
    // The enrichment block must contain a withTransaction wrapper.
    // Capture the entire enrichment block — from the "Phase D R5.6 Part A"
    // header through the next section's `// -------` divider (next pass of
    // ~30 dashes), bounded to 12000 chars for safety.
    const enrichmentBlock = src.match(/Phase D R5\.6 Part A[\s\S]{1,12000}/);
    expect(enrichmentBlock?.[0]).toMatch(/pipeline\.withTransaction\(/);
  });
});

describe('link-coa.js — R5.6 DeepSeek CRIT fold: stale back-ref cleanup in pre-pass', () => {
  it('Pre-pass cross-ward unlink ALSO clears permits.linked_coa_application_number for affected permits', () => {
    // After the pre-pass UPDATE that NULLs coa.linked_permit_num for cross-ward
    // mismatches, the script must also NULL permits.linked_coa_application_number
    // when there's no other CoA still linked to the permit.
    expect(src).toMatch(/DeepSeek[\s\S]{0,200}?stale\s+back-ref/i);
    // The fix must reference permits.linked_coa_application_number = NULL
    expect(src).toMatch(/permits[\s\S]{0,400}?linked_coa_application_number\s*=\s*NULL/i);
  });
});

describe('link-coa.js — R5.6 Zod schema + logic_var (Indep M2 fold)', () => {
  it('LOGIC_VARS_SCHEMA includes coa_inherit_from_permit_min_confidence as explicit z.coerce.number field', () => {
    // NOT relying on .passthrough() — must be an explicit field.
    expect(src).toMatch(
      /coa_inherit_from_permit_min_confidence\s*:\s*z\.coerce\.number\(\)[\s\S]{0,100}?(?:positive|max)/i,
    );
  });

  it('logic_var value is read from validated logicVars (not a hardcoded literal)', () => {
    expect(src).toMatch(/logicVars\.coa_inherit_from_permit_min_confidence/);
  });
});

describe('link-coa.js — diff-review folds (3-reviewer triage)', () => {
  it('3-way concur (DeepSeek MED + Indep H2 + Obs L10): wardFillRes CTE filters on lat/lng to match main UPDATE', () => {
    // The wardFillRes CTE must add `AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL`
    // so its count aligns with the main UPDATE's best_permit CTE filter.
    const wardFillBlock = src.match(/wardFillRes[\s\S]{0,600}/);
    expect(wardFillBlock).not.toBeNull();
    expect(wardFillBlock?.[0]).toMatch(/p\.latitude\s+IS\s+NOT\s+NULL/i);
    expect(wardFillBlock?.[0]).toMatch(/p\.longitude\s+IS\s+NOT\s+NULL/i);
  });

  it('Indep H1 + Obs L1 + L11 fold: lead_identity_lat_lng_mismatch_count demoted from FAIL to WARN', () => {
    // Race-condition signal — non-zero usually means concurrent geocode-permits.js
    // committed mid-run. Operator response is "re-run CoA chain", not "file WF3".
    const metricRow = src.match(/metric:\s*['"]lead_identity_lat_lng_mismatch_count['"][\s\S]{0,400}/);
    expect(metricRow).not.toBeNull();
    expect(metricRow?.[0]).toMatch(/WARN/);
    expect(metricRow?.[0]).not.toMatch(/['"]FAIL['"]/);
  });

  it('Obs L3 fold: enrichment_eligible_count surfaces "no CoAs linked yet" vs "broken enrichment"', () => {
    expect(src).toMatch(/enrichment_eligible_count/);
    expect(src).toMatch(/enrichmentEligible/);
  });

  it('Indep M2 fold: SPEC LINK references §6.6.X (not §6.X)', () => {
    expect(src).toMatch(/§6\.6\.X Lead-Identity Continuity/);
    expect(src).not.toMatch(/§6\.X(?![0-9])/);   // disallow §6.X with no further digit/version
  });

  it('Obs L7 fold: Tier 1c transient back-ref note documented in pre-pass', () => {
    // The pre-pass should reference that Tier 1c + high-confidence overlap
    // produces a transient state repaired by the R5.1 back-ref pass.
    expect(src).toMatch(/Tier 1c[\s\S]{0,400}?(R5\.1|back-ref pass)/i);
  });

  it('Obs L8 fold: belowFloorRes advisory-lock dependency documented inline', () => {
    // Look for the documenting comment within ~600 chars BEFORE belowFloorRes.
    const belowFloorContext = src.match(/[\s\S]{0,600}belowFloorRes\s*=\s*await\s+pool\.query/);
    expect(belowFloorContext).not.toBeNull();
    expect(belowFloorContext?.[0]).toMatch(/advisory[\s_]?lock|ADVISORY_LOCK/i);
  });
});

describe('link-coa.js — R5.6 audit_table extensions (folds Obs L1-1, L1-3, L3-4 + DeepSeek)', () => {
  it('Obs L1-1 CRIT: coa_below_confidence_floor_count audit row present (INFO)', () => {
    expect(src).toMatch(/coa_below_confidence_floor_count/);
  });

  it('Obs L1-3 HIGH: lead_identity_lat_lng_mismatch_count audit row present (demoted from FAIL to WARN per diff-review fold)', () => {
    expect(src).toMatch(/lead_identity_lat_lng_mismatch_count/);
    // After the Indep H1 + Obs L1 + L11 diff-review fold, this metric is WARN
    // (not FAIL) — it fires on a race condition that resolves on next run.
    // The threshold string still starts with "== 0" but the status maps to WARN.
    const metricRow = src.match(/lead_identity_lat_lng_mismatch_count[\s\S]{0,500}/);
    expect(metricRow?.[0]).toMatch(/threshold:\s*['"]==\s*0/);
    expect(metricRow?.[0]).toMatch(/['"]WARN['"]/);
  });

  it('Obs L3-4 HIGH: coa_ward_filled_from_permit_count (renamed) + coa_ward_mismatch_with_permit_count', () => {
    expect(src).toMatch(/coa_ward_filled_from_permit_count/);
    expect(src).toMatch(/coa_ward_mismatch_with_permit_count/);
    // The old misleading name should NOT appear.
    expect(src).not.toMatch(/coa_ward_upgraded_from_permit_count/);
  });

  it('Inheritance counters present: coa_inherited_from_permit_count + coa_lat_lng_upgraded_from_permit_count', () => {
    expect(src).toMatch(/coa_inherited_from_permit_count/);
    expect(src).toMatch(/coa_lat_lng_upgraded_from_permit_count/);
  });

  it('DeepSeek CRIT fold: stale_back_refs_cleared_count audit row present', () => {
    expect(src).toMatch(/stale_back_refs_cleared_count/);
  });

  it('inherited_confidence_floor INFO row surfaces the logic_var value used (operator visibility)', () => {
    expect(src).toMatch(/inherited_confidence_floor/);
  });
});

describe('link-coa.js — R5.6 emitMeta extensions (Indep M4 + Obs L3-7 fold)', () => {
  it('emitMeta reads include permits.latitude + permits.longitude (new read columns)', () => {
    const emitMeta = src.match(/pipeline\.emitMeta\([\s\S]*?\)\s*;/g);
    expect(emitMeta).not.toBeNull();
    // At least one emitMeta call must include latitude + longitude in permits reads.
    const allEmitMetaText = (emitMeta ?? []).join('\n');
    expect(allEmitMetaText).toMatch(/permits[\s\S]{0,400}?latitude/);
    expect(allEmitMetaText).toMatch(/permits[\s\S]{0,400}?longitude/);
  });

  it('emitMeta reads include permits.revision_num + permits.application_date for DISTINCT ON subquery', () => {
    const emitMeta = src.match(/pipeline\.emitMeta\([\s\S]*?\)\s*;/g);
    const allEmitMetaText = (emitMeta ?? []).join('\n');
    expect(allEmitMetaText).toMatch(/permits[\s\S]{0,400}?revision_num/);
    expect(allEmitMetaText).toMatch(/permits[\s\S]{0,400}?application_date/);
  });

  it('emitMeta writes include coa_applications.latitude + coa_applications.longitude + coa_applications.ward', () => {
    const emitMeta = src.match(/pipeline\.emitMeta\([\s\S]*?\)\s*;/g);
    const allEmitMetaText = (emitMeta ?? []).join('\n');
    // The writes (second arg) must include lat/long/ward for coa_applications.
    expect(allEmitMetaText).toMatch(/coa_applications[\s\S]{0,400}?latitude/);
    expect(allEmitMetaText).toMatch(/coa_applications[\s\S]{0,400}?longitude/);
    expect(allEmitMetaText).toMatch(/coa_applications[\s\S]{0,400}?ward/);
  });
});

describe('link-coa.js — R5.6 lead_parcels safety (Indep H5 + Obs L2-1 fold)', () => {
  it('Enrichment UPDATE targets coa_applications ONLY — NO writes to lead_parcels', () => {
    // The enrichment block must not contain any UPDATE/INSERT/DELETE on lead_parcels.
    // Capture the entire enrichment block — from the "Phase D R5.6 Part A"
    // header through the next section's `// -------` divider (next pass of
    // ~30 dashes), bounded to 12000 chars for safety.
    const enrichmentBlock = src.match(/Phase D R5\.6 Part A[\s\S]{1,12000}/);
    expect(enrichmentBlock, 'R5.6 enrichment block must be present').not.toBeNull();
    expect(enrichmentBlock?.[0]).not.toMatch(/(?:UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+lead_parcels/i);
  });
});
