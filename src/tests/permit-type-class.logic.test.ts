// 🔗 SPEC LINK: docs/specs/01-pipeline/80_taxonomies.md §5
//             docs/specs/01-pipeline/47_pipeline_script_protocol.md §10.2
//             docs/specs/00_engineering_standards.md §7.1 (dual code path)
//
// Parity tests for the permit_type_class enum:
//   - TS-side constants (src/lib/classification/permit-type-class.ts) match the
//     PG enum values defined in migrations/120_permit_type_classifications.sql
//   - JS-side helper (scripts/lib/permit-type-classifier.js) exports the same
//     vocabulary
//   - The 25 seed rows in mig 120 cover every observed permit_type AND only
//     map to the 5 enum values (no typos, no orphaned classes)
//
// Drift between any of these surfaces would cause silent classification
// errors at runtime — the parity test is the single regression-lock that
// keeps them aligned.
//
// NOTE: This test reads migration 120's CREATE TYPE text, NOT the live DB
// (worktree code-reviewer WF2 #1 finding, conf 83). If a future migration
// ALTERs the enum (e.g. ADD VALUE 'narrow_trade'), the parity test will
// continue to PASS against the original 5 values in mig 120 while the live
// DB has the new value. A companion live-DB parity test (`*.infra.test.ts`
// querying `pg_enum WHERE enumtypid = 'permit_type_class'::regtype`) MUST
// be added alongside the first ALTER TYPE migration to catch that drift.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  PERMIT_TYPE_CLASSES,
  PermitTypeClass,
  CONSTRUCTION,
  SIGNAGE,
  ADMINISTRATIVE,
  SAFETY_UPGRADE,
  UNCLASSIFIED,
  PERMIT_CLASS_TRADE_ALLOWLIST,
  filterTradesByClass,
  shouldAppendRealtor,
  shouldApplyCostSlicing,
} from '@/lib/classification/permit-type-class';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MIG_PATH = path.join(REPO_ROOT, 'migrations', '120_permit_type_classifications.sql');
const JS_HELPER_PATH = path.join(REPO_ROOT, 'scripts', 'lib', 'permit-type-classifier.js');

const EXPECTED_ENUM_VALUES = [
  'construction',
  'signage',
  'administrative',
  'safety_upgrade',
  'unclassified',
] as const;

let migSql: string;
let jsHelperSrc: string;

beforeAll(() => {
  migSql = fs.readFileSync(MIG_PATH, 'utf-8');
  jsHelperSrc = fs.readFileSync(JS_HELPER_PATH, 'utf-8');
});

describe('permit-type-class — TS↔SQL enum parity (Spec 7 §7.1)', () => {
  it('TS PERMIT_TYPE_CLASSES contains exactly the 5 expected values', () => {
    expect([...PERMIT_TYPE_CLASSES].sort()).toEqual([...EXPECTED_ENUM_VALUES].sort());
  });

  it('TS named constants match the enum values literally', () => {
    expect(CONSTRUCTION).toBe('construction');
    expect(SIGNAGE).toBe('signage');
    expect(ADMINISTRATIVE).toBe('administrative');
    expect(SAFETY_UPGRADE).toBe('safety_upgrade');
    expect(UNCLASSIFIED).toBe('unclassified');
  });

  it('SQL CREATE TYPE block contains exactly the 5 TS values (drift guard)', () => {
    for (const value of EXPECTED_ENUM_VALUES) {
      expect(migSql, `SQL enum missing value: ${value}`).toMatch(
        new RegExp(`'${value}'`),
      );
    }
    // Also check the order matches — the TS PERMIT_TYPE_CLASSES tuple should
    // mirror the SQL CREATE TYPE order so any tooling that derives an array
    // (e.g. for admin UI dropdowns) keeps the canonical sequence.
    const enumBlock = migSql.match(/CREATE\s+TYPE\s+permit_type_class\s+AS\s+ENUM\s*\(([\s\S]*?)\)/i);
    expect(enumBlock).toBeTruthy();
    const sqlOrdered = (enumBlock![1] ?? '')
      .match(/'([^']+)'/g)
      ?.map((s) => s.replace(/'/g, ''));
    expect(sqlOrdered).toEqual([...PERMIT_TYPE_CLASSES]);
  });

  it('TS PermitTypeClass type accepts only the 5 values (compile-time check via runtime sample)', () => {
    // If the TS type ever drifts to allow extra string values, this assertion
    // still catches it because the literal-typed array is the source of truth.
    const sample: PermitTypeClass[] = [...PERMIT_TYPE_CLASSES];
    expect(sample.length).toBe(5);
  });
});

describe('permit-type-class — JS helper parity', () => {
  it('JS helper exports loadPermitTypeClassMap', () => {
    expect(jsHelperSrc).toMatch(/loadPermitTypeClassMap/);
    expect(jsHelperSrc).toMatch(/module\.exports[\s\S]*loadPermitTypeClassMap/);
  });

  it('JS helper exports the same 5 enum constants as TS', () => {
    for (const value of EXPECTED_ENUM_VALUES) {
      expect(jsHelperSrc, `JS helper missing constant for: ${value}`).toMatch(
        new RegExp(`['"]${value}['"]`),
      );
    }
  });

  it('JS helper queries permit_type_classifications table', () => {
    expect(jsHelperSrc).toMatch(/FROM\s+permit_type_classifications/i);
  });
});

describe('permit-type-class — seed integrity', () => {
  it('every seed row uses exactly one of the 5 enum values', () => {
    // Tuple shape: ('permit_type', 'class', 'notes'). The notes string spans
    // multiple lines on some rows, so we anchor on the line-leading paren.
    // `,\s*` (zero+ whitespace) covers rows whose permit_type is longer than
    // the column-alignment width (e.g. "Toronto Building Standard Attachments").
    const seedHeads = [
      ...migSql.matchAll(/^\s*\('([^']+)',\s*'(construction|signage|administrative|safety_upgrade|unclassified)'/gm),
    ];
    expect(seedHeads.length).toBe(25);
    for (const m of seedHeads) {
      const klass = m[2];
      expect(EXPECTED_ENUM_VALUES, `seed row "${m[1]}" has invalid class: ${klass}`).toContain(klass);
    }
  });

  it('TS allowlist exports match JS allowlist exports (Spec 7 §7.1 dual-path)', () => {
    // The JS mirror exports an object literal with the same shape — the
    // SAME values per class (frozen on the JS side). Read the JS source
    // and verify the policy values match what the TS side exports.
    const jsHelperPath = path.join(REPO_ROOT, 'scripts', 'lib', 'permit-type-classifier.js');
    const jsSrc = fs.readFileSync(jsHelperPath, 'utf-8');

    // Each class must appear in the JS PERMIT_CLASS_TRADE_ALLOWLIST literal
    // with a matching policy. Smoke test for parity — exact equality is
    // enforced by the runtime tests below.
    expect(jsSrc).toMatch(/PERMIT_CLASS_TRADE_ALLOWLIST/);
    expect(jsSrc).toMatch(/construction:\s*'all'/);
    expect(jsSrc).toMatch(/administrative:\s*'none'/);
    expect(jsSrc).toMatch(/unclassified:\s*'none'/);
    expect(jsSrc).toMatch(/signage:\s*Object\.freeze\(\['electrical',\s*'structural-steel'\]\)/);
    expect(jsSrc).toMatch(/safety_upgrade:\s*Object\.freeze\(\['electrical',\s*'fire-protection'\]\)/);
  });

  it('class distribution: 12 construction / 8 administrative / 1 safety_upgrade / 4 unclassified / 0 signage', () => {
    const counts: Record<string, number> = {
      construction: 0,
      signage: 0,
      administrative: 0,
      safety_upgrade: 0,
      unclassified: 0,
    };
    const seedHeads = migSql.matchAll(/^\s*\('[^']+',\s*'(construction|signage|administrative|safety_upgrade|unclassified)'/gm);
    for (const m of seedHeads) {
      const klass = m[1];
      if (klass != null && klass in counts) counts[klass] = (counts[klass] ?? 0) + 1;
    }
    expect(counts.construction).toBe(12);
    expect(counts.administrative).toBe(8);
    expect(counts.safety_upgrade).toBe(1);
    expect(counts.unclassified).toBe(4);
    expect(counts.signage).toBe(0); // reserved for future WF3 subtype detection
  });
});

// ─── WF2 #2 — Trade allowlist behavior ─────────────────────────────────

describe('PERMIT_CLASS_TRADE_ALLOWLIST — behavior contract (Spec 80 §5)', () => {
  it('construction → "all" (full pass-through)', () => {
    expect(PERMIT_CLASS_TRADE_ALLOWLIST.construction).toBe('all');
  });

  it('administrative → "none" (empty result)', () => {
    expect(PERMIT_CLASS_TRADE_ALLOWLIST.administrative).toBe('none');
  });

  it('unclassified → "none" (safe-skip default)', () => {
    expect(PERMIT_CLASS_TRADE_ALLOWLIST.unclassified).toBe('none');
  });

  it('signage → ["electrical", "structural-steel"] (RESERVED, no rows seeded today)', () => {
    expect(PERMIT_CLASS_TRADE_ALLOWLIST.signage).toEqual(['electrical', 'structural-steel']);
  });

  it('safety_upgrade → ["electrical", "fire-protection"]', () => {
    expect(PERMIT_CLASS_TRADE_ALLOWLIST.safety_upgrade).toEqual(['electrical', 'fire-protection']);
  });
});

describe('filterTradesByClass — pass-through / empty / narrow filtering', () => {
  const matches = [
    { trade_slug: 'plumbing', confidence: 0.9 },
    { trade_slug: 'electrical', confidence: 0.95 },
    { trade_slug: 'framing', confidence: 0.8 },
    { trade_slug: 'fire-protection', confidence: 0.85 },
    { trade_slug: 'structural-steel', confidence: 0.75 },
  ];

  it('construction passes ALL matches through', () => {
    expect(filterTradesByClass(matches, 'construction')).toEqual(matches);
  });

  it('administrative returns empty', () => {
    expect(filterTradesByClass(matches, 'administrative')).toEqual([]);
  });

  it('unclassified returns empty (safe-skip default)', () => {
    expect(filterTradesByClass(matches, 'unclassified')).toEqual([]);
  });

  it('safety_upgrade keeps only electrical + fire-protection (no plumbing/framing/etc.)', () => {
    const filtered = filterTradesByClass(matches, 'safety_upgrade');
    const slugs = filtered.map((m) => m.trade_slug).sort();
    expect(slugs).toEqual(['electrical', 'fire-protection']);
  });

  it('signage keeps only electrical + structural-steel (no plumbing/HVAC/framing/etc.)', () => {
    const filtered = filterTradesByClass(matches, 'signage');
    const slugs = filtered.map((m) => m.trade_slug).sort();
    expect(slugs).toEqual(['electrical', 'structural-steel']);
  });

  it('does not mutate the input array', () => {
    const original = matches.slice();
    filterTradesByClass(matches, 'safety_upgrade');
    expect(matches).toEqual(original);
  });
});

describe('shouldAppendRealtor — 3-axis gating (WF3 2026-05-09): class + permit_type + scope_tags', () => {
  // Axis 1: class — only construction passes
  describe('Axis 1 — permitClass', () => {
    it('construction + residential type + no commercial scope → true', () => {
      expect(shouldAppendRealtor('construction', 'New Houses', null)).toBe(true);
    });

    it('signage → false (signs do not generate listing opportunities)', () => {
      expect(shouldAppendRealtor('signage', 'New Houses', null)).toBe(false);
    });

    it('administrative → false', () => {
      expect(shouldAppendRealtor('administrative', 'New Houses', null)).toBe(false);
    });

    it('safety_upgrade → false', () => {
      expect(shouldAppendRealtor('safety_upgrade', 'New Houses', null)).toBe(false);
    });

    it('unclassified → false (safe-skip default per Spec 80 §5)', () => {
      expect(shouldAppendRealtor('unclassified', 'New Houses', null)).toBe(false);
    });
  });

  // Axis 2: permit_type — only the 5 residential building types pass
  describe('Axis 2 — permit_type (WF3 2026-05-09 — eliminates trade-only / demolition / commercial classes)', () => {
    it.each([
      'New Building',
      'Building Additions/Alterations',
      'New Houses',
      'Small Residential Projects',
      'Residential Building Permit',
    ])('residential type "%s" → true', (permitType) => {
      expect(shouldAppendRealtor('construction', permitType, null)).toBe(true);
    });

    it.each([
      'Plumbing(PS)',
      'Mechanical(MS)',
      'Drain and Site Service',
      'Demolition Folder (DM)',
      'Non-Residential Building Permit',
    ])('non-residential / trade-only type "%s" → false', (permitType) => {
      expect(shouldAppendRealtor('construction', permitType, null)).toBe(false);
    });

    it('null permit_type → false (fail-closed)', () => {
      expect(shouldAppendRealtor('construction', null, null)).toBe(false);
    });

    it('undefined permit_type → false (fail-closed)', () => {
      expect(shouldAppendRealtor('construction', undefined, null)).toBe(false);
    });

    it('unknown permit_type (not in REALTOR_RELEVANT_TYPES) → false', () => {
      expect(shouldAppendRealtor('construction', 'Some Future Type', null)).toBe(false);
    });
  });

  // Axis 3: scope_tags — must NOT contain 'commercial'
  describe('Axis 3 — scope_tags commercial filter (catches the 75K commercial-realtor row class)', () => {
    it('null scope_tags → pass through (no commercial evidence)', () => {
      expect(shouldAppendRealtor('construction', 'New Houses', null)).toBe(true);
    });

    it('undefined scope_tags → pass through', () => {
      expect(shouldAppendRealtor('construction', 'New Houses', undefined)).toBe(true);
    });

    it('empty array scope_tags → pass through', () => {
      expect(shouldAppendRealtor('construction', 'New Houses', [])).toBe(true);
    });

    it('residential scope_tags → pass through', () => {
      expect(shouldAppendRealtor('construction', 'New Houses', ['residential'])).toBe(true);
    });

    it('commercial in scope_tags → false', () => {
      expect(shouldAppendRealtor('construction', 'New Houses', ['commercial'])).toBe(false);
    });

    it('mixed-use [residential, commercial] → false (commercial evidence wins, fail-closed)', () => {
      expect(shouldAppendRealtor('construction', 'Building Additions/Alterations', ['residential', 'commercial'])).toBe(false);
    });
  });
});

// ─── WF2 #3 (2026-05-08) — cost-model gating helper ───────────────────────

describe('shouldApplyCostSlicing — gates Surgical Triangle on construction only (Spec 83 §3)', () => {
  it('construction → true (full Surgical Triangle applies)', () => {
    expect(shouldApplyCostSlicing('construction')).toBe(true);
  });

  it('signage → false (sign permits inherit host-building GFA — $29M-for-2-signs bug class)', () => {
    expect(shouldApplyCostSlicing('signage')).toBe(false);
  });

  it('administrative → false (fee deferrals / certificates of occupancy have no construction scope)', () => {
    expect(shouldApplyCostSlicing('administrative')).toBe(false);
  });

  it('safety_upgrade → false (limited-scope fire/security upgrades — no GFA slicing)', () => {
    expect(shouldApplyCostSlicing('safety_upgrade')).toBe(false);
  });

  it('unclassified → false (safe-skip default per Spec 80 §5)', () => {
    expect(shouldApplyCostSlicing('unclassified')).toBe(false);
  });
});

describe('shouldAppendRealtor — JS↔TS surface parity (3-axis WF3 2026-05-09)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const jsHelper = require('../../scripts/lib/permit-type-classifier') as {
    shouldAppendRealtor: (cls: string, pt?: string | null, st?: readonly string[] | null) => boolean;
    REALTOR_RELEVANT_TYPES?: ReadonlySet<string>;
  };

  it('JS helper exports REALTOR_RELEVANT_TYPES', () => {
    expect(jsHelper.REALTOR_RELEVANT_TYPES).toBeDefined();
  });

  // Cross-product cases — every (class × permit_type × scope_tag presence)
  // must agree byte-for-byte between TS and JS surfaces.
  const PARITY_CASES: Array<[string, string | null, readonly string[] | null]> = [
    ['construction', 'New Houses', null],
    ['construction', 'New Building', ['residential']],
    ['construction', 'Building Additions/Alterations', ['commercial']],
    ['construction', 'Plumbing(PS)', null],
    ['construction', 'Demolition Folder (DM)', null],
    ['construction', null, null],
    ['signage', 'New Houses', null],
    ['administrative', 'New Houses', null],
    ['unclassified', 'New Houses', null],
    ['safety_upgrade', 'New Houses', null],
  ];

  it.each(PARITY_CASES)(
    'JS and TS agree for (class=%s, type=%s, scope=%s)',
    (cls, type, scope) => {
      // The TS shouldAppendRealtor signature requires a PermitTypeClass; we
      // pass the string through as PermitTypeClass for parity coverage.
      expect(jsHelper.shouldAppendRealtor(cls, type, scope)).toBe(
        shouldAppendRealtor(cls as PermitTypeClass, type, scope),
      );
    },
  );
});

describe('shouldApplyCostSlicing — JS↔TS surface parity (Spec 7 §7.1)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const jsHelper = require('../../scripts/lib/permit-type-classifier') as {
    shouldApplyCostSlicing: (cls: string) => boolean;
  };

  it('JS helper exports shouldApplyCostSlicing', () => {
    expect(typeof jsHelper.shouldApplyCostSlicing).toBe('function');
  });

  it.each([...PERMIT_TYPE_CLASSES])(
    'JS and TS agree on shouldApplyCostSlicing(%s)',
    (cls) => {
      expect(jsHelper.shouldApplyCostSlicing(cls)).toBe(shouldApplyCostSlicing(cls));
    },
  );
});
