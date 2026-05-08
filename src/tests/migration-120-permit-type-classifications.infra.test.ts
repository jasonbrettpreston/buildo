// 🔗 SPEC LINK: docs/specs/01-pipeline/80_taxonomies.md §5
//             docs/specs/01-pipeline/47_pipeline_script_protocol.md §10.2
//             docs/specs/02-web-admin/86_control_panel.md §1
//
// SQL-string assertions on migration 120. Same pattern as migration-118-realtor-trade
// and migration-119-lifecycle-bands tests — text-based regex checks on the migration
// body, no live DB needed.
//
// Migration 120 lands the foundation for WF2 #2 (classifier gating) + WF2 #3
// (cost-model gating): a `permit_type_class` enum + `permit_type_classifications`
// lookup table seeded with 25 rows from the research agent's 247K-permit survey.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 120 — permit_type_class taxonomy + lookup table', () => {
  let sql: string;
  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/120_permit_type_classifications.sql'),
      'utf-8',
    );
  });

  // ─── 1. Enum type ────────────────────────────────────────────────

  it('creates the permit_type_class enum', () => {
    expect(sql).toMatch(/CREATE\s+TYPE\s+permit_type_class\s+AS\s+ENUM/i);
  });

  it('enum has all 5 expected values (construction, signage, administrative, safety_upgrade, unclassified)', () => {
    expect(sql).toMatch(/'construction'/);
    expect(sql).toMatch(/'signage'/);
    expect(sql).toMatch(/'administrative'/);
    expect(sql).toMatch(/'safety_upgrade'/);
    expect(sql).toMatch(/'unclassified'/);
  });

  // ─── 2. Lookup table ─────────────────────────────────────────────

  it('creates the permit_type_classifications table with permit_type as PRIMARY KEY', () => {
    expect(sql).toMatch(/CREATE\s+TABLE\s+permit_type_classifications/i);
    expect(sql).toMatch(/permit_type\s+TEXT\s+PRIMARY\s+KEY/i);
  });

  it('table has class column typed as permit_type_class NOT NULL DEFAULT unclassified', () => {
    expect(sql).toMatch(/class\s+permit_type_class\s+NOT\s+NULL\s+DEFAULT\s+'unclassified'/i);
  });

  it('table has notes column for operator-facing rationale', () => {
    expect(sql).toMatch(/notes\s+TEXT/i);
  });

  it('table has updated_at column with NOW() default', () => {
    expect(sql).toMatch(/updated_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+NOW\(\)/i);
  });

  // ─── 3. Seed integrity ──────────────────────────────────────────

  it('uses ON CONFLICT (permit_type) DO NOTHING for idempotency', () => {
    // Same pattern as migration 118/119 — re-running the migration must not
    // silently revert operator-tuned classifications.
    expect(sql).toMatch(/ON\s+CONFLICT\s*\(\s*permit_type\s*\)\s+DO\s+NOTHING/i);
  });

  it('seeds all 12 construction permit_types', () => {
    const expected = [
      'Small Residential Projects',
      'Plumbing(PS)',
      'Mechanical(MS)',
      'Building Additions/Alterations',
      'Drain and Site Service',
      'New Houses',
      'Residential Building Permit',
      'Demolition Folder (DM)',
      'New Building',
      'Non-Residential Building Permit',
      'Portable Classrooms',
      'Building Historical data - Converted',
    ];
    for (const permitType of expected) {
      // Escape parentheses in the permit_type for the regex
      const escaped = permitType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(sql, `seed missing construction row: ${permitType}`).toMatch(
        new RegExp(`'${escaped}'[\\s\\S]*?'construction'`),
      );
    }
  });

  it('seeds all 8 administrative permit_types', () => {
    const expected = [
      'DCs DeferredFees',
      'AS Alternative Solution',
      'Multiple Use Permit',
      'Pre-Permit',
      'Toronto Buildings Contacts',
      'Site Inspection(Scarborough)',
      'Rental Renovation Licence',
      'Toronto Building Standard Attachments',
    ];
    for (const permitType of expected) {
      const escaped = permitType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(sql, `seed missing administrative row: ${permitType}`).toMatch(
        new RegExp(`'${escaped}'[\\s\\S]*?'administrative'`),
      );
    }
  });

  it('seeds Fire/Security Upgrade as safety_upgrade', () => {
    expect(sql).toMatch(/'Fire\/Security Upgrade'[\s\S]*?'safety_upgrade'/);
  });

  it('seeds the 4 unclassified permit_types pending WF3 subtype detection', () => {
    const expected = [
      'Designated Structures',
      'Partial Permit',
      'Conditional Permit',
      'Temporary Structures',
    ];
    for (const permitType of expected) {
      expect(sql, `seed missing unclassified row: ${permitType}`).toMatch(
        new RegExp(`'${permitType}'[\\s\\S]*?'unclassified'`),
      );
    }
  });

  it('total seed row count is 25 (12 construction + 8 administrative + 1 safety_upgrade + 4 unclassified)', () => {
    // Each VALUES tuple starts with `('permit_type', 'class', 'notes')`. Count
    // the opening parens at the start of a tuple line. `,\s*` (zero+ whitespace)
    // because the alignment whitespace is dropped on rows whose permit_type is
    // longer than the column width.
    const tupleStarts = sql.match(/^\s*\('[^']+',\s*'(construction|signage|administrative|safety_upgrade|unclassified)'/gm);
    expect(tupleStarts?.length ?? 0).toBe(25);
  });

  it('does NOT seed any row with class=signage (reserved for future WF3)', () => {
    // Tuple shape: a line that STARTS with `('permit_type', 'class', ...`. The
    // line-start anchor (`^\s*\(`, multiline mode) excludes the enum CREATE
    // TYPE block, where each value lives on its own line that starts with `  '`
    // (no open paren).
    expect(sql).not.toMatch(/^\s*\('[^']+',\s*'signage'/m);
  });

  // ─── 4. UP/DOWN markers (Rule 6 compliance — commit 8b1c10b) ────

  it('has -- UP marker (Rule 6 / migrate.js convention)', () => {
    expect(sql).toMatch(/^-- UP\b/m);
  });

  it('has -- DOWN marker', () => {
    expect(sql).toMatch(/^-- DOWN\b/m);
  });

  it('DOWN block contains no executable SQL — Rule 6 (commit 8b1c10b)', () => {
    // Same regression-lock as the existing assert-script test. Walk the
    // post-DOWN slice and confirm every non-blank line is a comment.
    const downIdx = sql.search(/^-- DOWN\b/m);
    expect(downIdx).toBeGreaterThan(-1);
    const postDown = sql.slice(downIdx).split('\n').slice(1); // skip the marker line itself
    for (const line of postDown) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      expect(
        trimmed.startsWith('--'),
        `DOWN block must contain only comments — found executable line: ${line}`,
      ).toBe(true);
    }
  });
});
