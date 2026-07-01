// SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-1 (neighbourhood build-norms)
//
// Logic locks for scripts/lib/build-norms.js (the pure lib behind compute-build-norms.js):
//  - classifyKind() branch coverage + precedence (suite > demo > new_build > addition > kitchen > bath > reno > other)
//  - SQL↔JS parity: buildKindCaseSql() WHEN-order mirrors classifyKind()'s branch order (the generated-SQL
//    dual-path guard — Spec engineering-standards §7), and each branch's literal predicate is present
//  - structural constants pinned (also cross-checked against _contracts.json by contracts.infra.test.ts)

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bn = require('../../scripts/lib/build-norms.js');

describe('build-norms classifyKind() — branch coverage + precedence', () => {
  it('laneway / rear-yard-suite structure_type → suite (highest precedence)', () => {
    expect(bn.classifyKind({ structure_type: 'Laneway Suite' })).toBe('suite');
    expect(bn.classifyKind({ structure_type: 'REAR YARD SUITE' })).toBe('suite');
    // suite wins even when project_type would otherwise classify as new_build
    expect(bn.classifyKind({ project_type: 'new_build', structure_type: 'laneway suite' })).toBe('suite');
  });

  it('project_type demolition → demo (before new_build/addition)', () => {
    expect(bn.classifyKind({ project_type: 'demolition' })).toBe('demo');
  });

  it('project_type new_build → new_build', () => {
    expect(bn.classifyKind({ project_type: 'new_build' })).toBe('new_build');
  });

  it('project_type addition → addition', () => {
    expect(bn.classifyKind({ project_type: 'addition' })).toBe('addition');
  });

  it('kitchen in description (word-boundary) → kitchen', () => {
    expect(bn.classifyKind({ project_type: 'renovation', description: 'New kitchen and island' })).toBe('kitchen');
    // word-boundary: "kitchenette" should NOT match \bkitchen\b... actually \bkitchen\b matches the
    // "kitchen" prefix of "kitchenette" only if followed by a word boundary — it is not, so → not kitchen.
    expect(bn.classifyKind({ project_type: 'renovation', description: 'kitchenette' })).not.toBe('kitchen');
  });

  it('bathroom / washroom / ensuite in description → bath', () => {
    expect(bn.classifyKind({ project_type: 'renovation', description: 'gut the bathroom' })).toBe('bath');
    expect(bn.classifyKind({ project_type: 'renovation', description: 'new washroom' })).toBe('bath');
    expect(bn.classifyKind({ project_type: 'renovation', description: 'add an ensuite' })).toBe('bath');
  });

  it('kitchen takes precedence over bath when both appear', () => {
    expect(bn.classifyKind({ project_type: 'renovation', description: 'kitchen and bathroom reno' })).toBe('kitchen');
  });

  it('renovation with no scope keyword → reno', () => {
    expect(bn.classifyKind({ project_type: 'renovation', description: 'interior alterations' })).toBe('reno');
  });

  it('unknown / empty → other', () => {
    expect(bn.classifyKind({})).toBe('other');
    expect(bn.classifyKind({ project_type: 'mechanical', description: 'HVAC' })).toBe('other');
  });
});

describe('build-norms SQL↔JS parity (generated-SQL dual-path)', () => {
  const sql = bn.buildKindCaseSql('p');

  it('emits a CASE keyed on the given alias', () => {
    expect(sql).toMatch(/^CASE/);
    expect(sql).toContain('p.structure_type');
    expect(sql).toContain('p.project_type');
    expect(sql).toContain('p.description');
  });

  it('WHEN-branch order mirrors classifyKind() precedence', () => {
    const order = ['suite', 'demo', 'new_build', 'addition', 'kitchen', 'bath', 'reno'];
    // Each result literal appears, and in strictly increasing position (same precedence as the JS).
    const positions = order.map((k) => sql.indexOf(`'${k}'`));
    positions.forEach((pos, i) => {
      expect(pos, `branch '${order[i]}' present`).toBeGreaterThan(-1);
      if (i > 0) expect(pos, `'${order[i]}' after '${order[i - 1]}'`).toBeGreaterThan(positions[i - 1]);
    });
    expect(sql).toContain("ELSE 'other'");
  });

  it('carries the same predicate literals as the JS classifier', () => {
    expect(sql).toContain('laneway|rear yard suite');
    expect(sql).toContain("'demolition'");
    expect(sql).toContain("'new_build'");
    expect(sql).toContain("'addition'");
    expect(sql).toContain('kitchen'); // \mkitchen\M word-boundary
    expect(sql).toContain('washroom|ensuite');
    expect(sql).toContain("'renovation'");
  });
});

describe('build-norms structural constants', () => {
  it('pins the 5-year window, 1.1 over-capture clamp, min-sample 5, null-rate WARN 0.5', () => {
    expect(bn.BUILD_NORM_WINDOW_YEARS).toBe(5);
    expect(bn.OVER_CAPTURE_CLAMP).toBe(1.1);
    expect(bn.BUILD_NORM_MIN_SAMPLE_DEFAULT).toBe(5);
    expect(bn.BUILD_RATIO_NULL_RATE_WARN).toBe(0.5);
  });
  it('pins the plausibility backstops (also cross-checked vs _contracts.json)', () => {
    expect(bn.FSI_PLAUSIBILITY_MAX).toBe(10);
    expect(bn.STOREYS_PLAUSIBILITY_MAX).toBe(8);
  });
});

describe('build-norms low-rise-residential allowlist (norm-cohort contamination filter)', () => {
  it('KEEPS every genuine low-rise residential StructureType', () => {
    for (const t of [
      'SFD - Detached', 'SFD - Semi-Detached', 'SFD - Townhouse', 'Stacked Townhouses',
      '2 Unit - Detached', '2 Unit - Semi-detached', '3+ Unit - Detached', '3+ Unit - Semi-detached',
      'Duplex', 'Converted House', 'Laneway / Rear Yard Suite',
    ]) {
      expect(bn.isLowRiseResidential(t), `keep ${t}`).toBe(true);
    }
  });
  it('EXCLUDES apartment / mixed-use / commercial / institutional forms', () => {
    for (const t of [
      'Apartment Building', 'Multiple Unit Building', 'Mixed Use/Res w Non Res', 'Multiple Use/Non Residential',
      'Office', 'Medical/Dental Office', 'Retail Store', 'Restaurant 30 Seats or Less', 'Industrial',
      'Elementary School', 'University', 'Hospital', 'Place of Worship',
    ]) {
      expect(bn.isLowRiseResidential(t), `exclude ${t}`).toBe(false);
    }
  });
  it('RETAINS NULL structure_type (unknown on a genuine new-build; contaminants are all named types)', () => {
    expect(bn.isLowRiseResidential(null)).toBe(true);
    expect(bn.isLowRiseResidential(undefined)).toBe(true);
  });
  it('lowRiseResidentialSql() mirrors the JS predicate: NULL-retained + the allowlist regex, keyed on alias', () => {
    const sql = bn.lowRiseResidentialSql('p');
    expect(sql).toContain('p.structure_type IS NULL OR');
    expect(sql).toContain('lower(p.structure_type)');
    expect(sql).toContain('sfd|townhouse|duplex|converted house|laneway|rear yard suite|unit - (detached|semi)');
  });
});

describe('build-norms family mapping (Spec 78 P2) — structureFamily(structure_type)', () => {
  it('detached forms (SFD + N-unit detached/semi) → detached', () => {
    for (const t of ['SFD - Detached', 'SFD - Semi-Detached', '2 Unit - Detached', '3+ Unit - Semi-detached']) {
      expect(bn.structureFamily(t), t).toBe('detached');
    }
  });
  it('townhouse forms → townhouse (wins over detached for "SFD - Townhouse")', () => {
    expect(bn.structureFamily('SFD - Townhouse')).toBe('townhouse');
    expect(bn.structureFamily('Stacked Townhouses')).toBe('townhouse');
  });
  it('duplex / converted house / multiple → multiplex', () => {
    expect(bn.structureFamily('Duplex')).toBe('multiplex');
    expect(bn.structureFamily('Converted House')).toBe('multiplex');
  });
  it('suite / unrecognized / NULL → null (rollup-only, no dwelling family)', () => {
    expect(bn.structureFamily('Laneway / Rear Yard Suite')).toBeNull();
    expect(bn.structureFamily(null)).toBeNull();
    expect(bn.structureFamily(undefined)).toBeNull();
  });
  it('structureFamilyCaseSql() mirrors the JS branch order (townhouse → detached → multiplex → NULL)', () => {
    const sql = bn.structureFamilyCaseSql('p');
    const order = ['townhouse', "'townhouse'", 'sfd|detached|semi', "'detached'", 'duplex|converted house|multiple', "'multiplex'", 'ELSE NULL'];
    let idx = -1;
    for (const token of order) {
      const next = sql.indexOf(token, idx + 1);
      expect(next, `token ${token} in order`).toBeGreaterThan(idx);
      idx = next;
    }
  });
});

describe('build-norms family mapping (Spec 78 P2) — parcelFamilyFromZoning(zoning_class)', () => {
  it('RD/RS → detached; RT → townhouse; RM → multiplex', () => {
    expect(bn.parcelFamilyFromZoning('RD')).toBe('detached');
    expect(bn.parcelFamilyFromZoning('RD3')).toBe('detached');
    expect(bn.parcelFamilyFromZoning('RS')).toBe('detached'); // semi grouped with detached
    expect(bn.parcelFamilyFromZoning('RT')).toBe('townhouse');
    expect(bn.parcelFamilyFromZoning('RM')).toBe('multiplex');
  });
  it("generic-R / non-residential / NULL → the literal 'all' backstop (never SQL NULL)", () => {
    expect(bn.parcelFamilyFromZoning('R')).toBe('all');
    expect(bn.parcelFamilyFromZoning('CR')).toBe('all');
    expect(bn.parcelFamilyFromZoning(null)).toBe('all');
    expect(bn.parcelFamilyFromZoning('')).toBe('all');
  });
  it('parcelFamilyFromZoningCaseSql() mirrors the prefixes + else-all', () => {
    const sql = bn.parcelFamilyFromZoningCaseSql('p.zoning_class');
    expect(sql).toContain("LIKE 'RD%'");
    expect(sql).toContain("LIKE 'RS%'");
    expect(sql).toContain("LIKE 'RT%'");
    expect(sql).toContain("LIKE 'RM%'");
    expect(sql).toContain("ELSE 'all'");
  });
});
