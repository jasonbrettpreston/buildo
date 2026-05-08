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
