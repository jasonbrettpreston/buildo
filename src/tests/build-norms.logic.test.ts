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
});
