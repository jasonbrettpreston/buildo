// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.7 (seq-level bands)
//             docs/specs/02-web-admin/86_control_panel.md §1 (logic_variables surface)
//             docs/specs/01-pipeline/82_crm_assistant_alerts.md (CoA stall + imminent)
//
// SQL-shape regression-lock for migration 136 (Phase B logic_variables seed).
//
// Seeds 333 new logic_variable rows for Phase E / F / G consumers:
//   - 110 × 3 = 330 seq-level distribution band keys (min, max,
//     sample_size_threshold per seq 1-110). All NULL until Phase E
//     recalibration populates real values.
//   - 5 standalone CoA / retention / orphan / preflight keys with
//     Spec-86-aligned defaults.
//
// ON CONFLICT (variable_key) DO NOTHING — re-runs are no-ops, and any
// operator-tuned values already present in the DB are preserved.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 136 — logic_variables Phase B seed (WF1 #coa-pipeline-parity-phase-b R5.4)', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/136_seed_logic_variables_phase_b.sql'),
      'utf-8',
    );
  });

  it('inserts into logic_variables (not creating a new table)', () => {
    expect(sql).toMatch(/INSERT\s+INTO\s+logic_variables/i);
    expect(sql).not.toMatch(/CREATE\s+TABLE/i);
  });

  it('declares (variable_key, variable_value, description) column list', () => {
    expect(sql).toMatch(/INSERT\s+INTO\s+logic_variables\s*\(\s*variable_key\s*,\s*variable_value\s*,\s*description\s*\)/i);
  });

  it('uses ON CONFLICT (variable_key) DO NOTHING for re-runnability', () => {
    expect(sql).toMatch(/ON\s+CONFLICT\s*\(\s*variable_key\s*\)\s+DO\s+NOTHING/i);
  });

  // Helper: strip the `-- DOWN` block + all comment-only lines so key
  // counts reflect ONLY executable INSERT rows (the DOWN block lists
  // example key names in comments which would otherwise inflate counts).
  const executableSql = () => {
    const downIdx = sql.search(/--\s*DOWN\b/i);
    const upBody = downIdx === -1 ? sql : sql.slice(0, downIdx);
    return upBody
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
  };

  it('seeds lifecycle_band_seq_<N>_min for all 110 seqs', () => {
    const minMatches = executableSql().match(/'lifecycle_band_seq_\d{1,3}_min'/g) ?? [];
    expect(minMatches.length).toBe(110);
  });

  it('seeds lifecycle_band_seq_<N>_max for all 110 seqs', () => {
    const maxMatches = executableSql().match(/'lifecycle_band_seq_\d{1,3}_max'/g) ?? [];
    expect(maxMatches.length).toBe(110);
  });

  it('seeds lifecycle_band_seq_<N>_sample_size_threshold for all 110 seqs', () => {
    const tierMatches = executableSql().match(/'lifecycle_band_seq_\d{1,3}_sample_size_threshold'/g) ?? [];
    expect(tierMatches.length).toBe(110);
  });

  it('boundary seqs (1, 55, 110) all have min + max + sample_size_threshold', () => {
    expect(sql).toMatch(/'lifecycle_band_seq_1_min'/);
    expect(sql).toMatch(/'lifecycle_band_seq_1_max'/);
    expect(sql).toMatch(/'lifecycle_band_seq_1_sample_size_threshold'/);
    expect(sql).toMatch(/'lifecycle_band_seq_55_min'/);
    expect(sql).toMatch(/'lifecycle_band_seq_55_max'/);
    expect(sql).toMatch(/'lifecycle_band_seq_55_sample_size_threshold'/);
    expect(sql).toMatch(/'lifecycle_band_seq_110_min'/);
    expect(sql).toMatch(/'lifecycle_band_seq_110_max'/);
    expect(sql).toMatch(/'lifecycle_band_seq_110_sample_size_threshold'/);
  });

  it('all band values are NULL initially (Phase E recalibration populates them)', () => {
    // Find every executable INSERT row that looks like a seq-band row and
    // assert the value field is NULL. Skip the DOWN block comments which
    // reference the keys without supplying values.
    const lines = executableSql()
      .split('\n')
      .filter((l) => /'lifecycle_band_seq_\d+_(min|max|sample_size_threshold)'/.test(l));
    expect(lines.length).toBeGreaterThanOrEqual(330);
    for (const line of lines) {
      expect(line).toMatch(/'lifecycle_band_seq_\d+_(?:min|max|sample_size_threshold)'\s*,\s*NULL\s*,/i);
    }
  });

  it('seeds lifecycle_status_history_retention_days = 1825 (5 years, per Spec 86)', () => {
    expect(sql).toMatch(/'lifecycle_status_history_retention_days'\s*,\s*'?1825'?\s*,/i);
  });

  it('seeds coa_stall_threshold_p2_days = 90 (per Spec 82)', () => {
    expect(sql).toMatch(/'coa_stall_threshold_p2_days'\s*,\s*'?90'?\s*,/i);
  });

  it('seeds coa_imminent_window_days = 7 (per Spec 82)', () => {
    expect(sql).toMatch(/'coa_imminent_window_days'\s*,\s*'?7'?\s*,/i);
  });

  it('seeds coa_orphan_lead_id_warn_threshold = 0 (CQA gate)', () => {
    expect(sql).toMatch(/'coa_orphan_lead_id_warn_threshold'\s*,\s*'?0'?\s*,/i);
  });

  it('seeds phase_b_revision_num_max_length = 2 (Phase B preflight)', () => {
    expect(sql).toMatch(/'phase_b_revision_num_max_length'\s*,\s*'?2'?\s*,/i);
  });

  it('does NOT use CONCURRENTLY (seed-only migration, no indexes)', () => {
    expect(sql).not.toMatch(/CREATE\s+INDEX\s+CONCURRENTLY/i);
  });

  it('comment-only DOWN block per Rule 6 — DELETE FROM enumerated explicitly (no wildcard)', () => {
    expect(sql).toMatch(/--\s*DOWN\b/i);
    const downIdx = sql.search(/--\s*DOWN\b/i);
    expect(downIdx).toBeGreaterThan(0);
    const afterDown = sql.slice(downIdx);
    const offending = afterDown
      .split('\n')
      .filter((line) => {
        const t = line.trim();
        if (t === '' || t.startsWith('--')) return false;
        return /\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\b/i.test(t);
      });
    expect(offending).toEqual([]);
  });
});
