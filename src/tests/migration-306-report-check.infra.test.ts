// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.7 (dated note 2026-11-11, MF-62),
//            docs/specs/01-pipeline/60_shared_steps.md Refresh Snapshot (dated note 2026-11-11), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-35.
//
// MF-62 · McFrontend queue · lane E. Reads migrations/306_report_check_trust_counts.sql as text (no DB; the DB job applies it):
//   (a) six nullable columns on data_quality_snapshots, no default (NULL = not captured; the producer then omits the citywide group), each the
//       type the refresh_snapshot write binds; nothing backfilled, no other table altered;
//   (b) the two pace rows as first inserted (operator D-2 a: 6000 and 2000), ON CONFLICT (variable_key) DO NOTHING, and the seed lists them in
//       the "MaxBLD Report" admin group (the existing Admin Control Panel shows them through the generated groups). Dated 2026-11-11 (MF-62
//       follow-up, the processing-sequence ruling): the seed defaults moved on (23000, 0) by migration 312, which is pinned to the seed by
//       src/tests/migration-312-report-check-sequence.infra.test.ts; this file keeps 306's own first values as history;
//   (c) one transaction; the DOWN is comment-only.
// Each RED plant is an in-memory copy of the text, never a file edit.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
// The two pace keys (src/lib/parcels/what-we-checked.ts REPORT_CHECK_KEYS reads the same names; report-checked-producer.logic.test.ts pins its bounds to the seed).
const REPORT_CHECK_KEYS = { minMs: 'report_check_min_ms', skipAfterMs: 'report_check_skip_after_ms' } as const;

const ROOT = process.cwd();
const MIGRATION = 'migrations/306_report_check_trust_counts.sql';
const read = (p: string): string => fs.readFileSync(path.join(ROOT, p), 'utf8');
const upOf = (s: string): string => (s.split(/^--\s*DOWN/m)[0] ?? '').split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
const SEED = JSON.parse(read('scripts/seeds/logic_variables.json'));
const COLS: Array<[string, string]> = [
  ['parcels_total', 'INTEGER'], ['permits_active_distinct', 'INTEGER'], ['map_areas_total', 'INTEGER'],
  ['zoning_layer_version', 'TIMESTAMPTZ'], ['permits_last_seen_at', 'TIMESTAMPTZ'], ['coa_last_seen_at', 'TIMESTAMPTZ'],
];

export const columnProblems = (s: string): string[] => {
  const up = upOf(s);
  const out: string[] = [];
  for (const [c, t] of COLS) if (!new RegExp(`ADD COLUMN IF NOT EXISTS ${c}\\s+${t}\\s*[,;]`).test(up)) out.push(`${c}: not a nullable ${t} with no default`);
  if (/\bNOT NULL\b|\bDEFAULT\b/.test((/ALTER TABLE data_quality_snapshots[^;]*;/.exec(up) ?? [''])[0])) out.push('a NOT NULL or DEFAULT on the new columns');
  if (/(UPDATE|INSERT INTO)\s+data_quality_snapshots/i.test(up)) out.push('a backfill of data_quality_snapshots');
  const altered = [...up.matchAll(/ALTER TABLE (\w+)/g)].map((m) => m[1]);
  if (altered.some((t) => t !== 'data_quality_snapshots')) out.push(`another table altered: ${altered.join(',')}`);
  return out;
};

describe('(a) the six stored, dated citywide columns', () => {
  it('the committed migration is clean', () => {
    expect(columnProblems(read(MIGRATION))).toEqual([]);
  });
  it('RED: a NOT NULL DEFAULT 0 column (a zero would read as a count)', () => {
    expect(columnProblems(read(MIGRATION).replace('parcels_total INTEGER', 'parcels_total INTEGER NOT NULL DEFAULT 0')).length).toBeGreaterThan(0);
  });
  it('RED: a backfill', () => {
    expect(columnProblems(`${read(MIGRATION).split(/^--\s*DOWN/m)[0]}\nUPDATE data_quality_snapshots SET parcels_total = 1;\n`).length).toBeGreaterThan(0);
  });
});

describe('(b) the two pace rows as first inserted (D-2 a)', () => {
  it('both keys inserted with their first values (6000, 2000), ON CONFLICT DO NOTHING; the seed lists them in "MaxBLD Report"', () => {
    const up = upOf(read(MIGRATION));
    const FIRST: Record<string, number> = { report_check_min_ms: 6000, report_check_skip_after_ms: 2000 };
    for (const k of Object.values(REPORT_CHECK_KEYS)) {
      expect(up).toMatch(new RegExp(`\\('${k}',\\s*${FIRST[k]},\\s*NULL,`));
      expect(SEED[k].admin.group).toBe('MaxBLD Report');
      expect(SEED[k].type).toBe('number');
    }
    expect(up).toMatch(/ON CONFLICT \(variable_key\) DO NOTHING;/);
  });
});

describe('(c) one transaction; DOWN comment-only', () => {
  it('BEGIN ... COMMIT around the UP; every DOWN line is a comment', () => {
    const s = read(MIGRATION);
    const up = upOf(s);
    expect(up.trim().startsWith('BEGIN;')).toBe(true);
    expect(up.trim().endsWith('COMMIT;')).toBe(true);
    const down = (s.split(/^--\s*DOWN/m)[1] ?? '').split('\n').slice(1); // the rest of the DOWN marker line is its heading
    for (const l of down) if (l.trim() !== '') expect(l.trim().startsWith('--')).toBe(true);
  });
});
