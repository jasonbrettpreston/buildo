// SPEC LINK: docs/specs/02-web-admin/26_admin_dashboard.md (funnel audit badge); docs/specs/01-pipeline/124_step_standard_policy.md §7, §5 R-T
//
// The funnel audit badge must read the metric the PRODUCER actually wrote.
// The hand-typed `validMetrics` lock in admin.ui.test.tsx only catches a typo'd
// metric NAME — it stayed green through the whole LW-D22 regression, because a
// hand-typed consumer vocabulary does not move when the producer changes. This
// file resolves the binding against the producers' GROUP-COMMITTED POST goldens,
// so a disappeared / reshaped metric reds here (R-T: derive the lock from the
// producer's golden, never re-type it).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { FUNNEL_SOURCE_BY_SLUG, resolveAuditPct, resolveAuditPctFromHistory } from '@/lib/admin/funnel';

type AuditRow = { metric: string; value: unknown };

const GOLDEN_ROOT = path.resolve(__dirname, '../../docs/reports/golden');

/**
 * newestPostRows — read every `docs/reports/golden/<slug>/post/*.json`, pick the
 * one with a non-skip `summary.records_meta.terminal` (a gated-skip run carries
 * no link-rate rows at all — the LW-D18 / GC-14 skip-state), else the first.
 * Returns its `summary.records_meta.audit_table.rows`.
 */
function newestPostRows(slug: string): AuditRow[] {
  const dir = path.join(GOLDEN_ROOT, slug, 'post');
  const files = fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(f => path.join(dir, f));

  let chosen: { rows: AuditRow[]; measured: boolean } | null = null;
  for (const file of files) {
    const doc = JSON.parse(fs.readFileSync(file, 'utf-8')) as {
      summary?: { records_meta?: { terminal?: string; audit_table?: { rows?: AuditRow[] } } };
    };
    const meta = doc.summary?.records_meta;
    const rows = meta?.audit_table?.rows ?? [];
    const terminal = meta?.terminal ?? '';
    const measured = !!terminal && !terminal.startsWith('skip');
    if (chosen === null) chosen = { rows, measured };
    if (measured) return rows;
  }
  if (chosen === null) throw new Error(`no POST golden JSON files under ${dir}`);
  return chosen.rows;
}

describe('funnel audit metric — resolved against the producers\' committed POST goldens', () => {
  // T1 — every converted-producer funnel binding resolves `ok` on its newest
  // measured POST golden. This is the golden-backed truth; admin.ui.test.tsx's
  // validMetrics list is only a typo lock on top of it.
  it.each([
    'link_wsib',
    'link_massing',
    'link_parcels',
    'link_neighbourhoods',
    'geocode_permits',
  ])('T1 resolves a real percentage for %s', (slug) => {
    const rows = newestPostRows(slug);
    // Guard the fixture itself: the golden must actually carry audit rows.
    expect(rows.length, `${slug}: golden audit_table.rows is empty`).toBeGreaterThan(0);
    const src = FUNNEL_SOURCE_BY_SLUG[slug];
    expect(src, `${slug}: no FUNNEL_SOURCE_BY_SLUG entry`).toBeDefined();

    const result = resolveAuditPct(rows, src);
    expect(result.kind, `${slug}: ${JSON.stringify(result)}`).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.pct).toBeGreaterThanOrEqual(0);
      expect(result.pct).toBeLessThanOrEqual(100);
    }
  });

  // T2 — unit cases for the resolver itself.
  describe('T2 resolveAuditPct unit cases', () => {
    const src = (auditValuePath?: string) => ({
      id: 'x', name: 'x', statusSlug: 'x', triggerSlug: 'x', yieldFields: [],
      auditMetric: 'm', ...(auditValuePath ? { auditValuePath } : {}),
    });

    it('parses a "x%" string', () => {
      expect(resolveAuditPct([{ metric: 'm', value: '11.5%' }], src())).toEqual({ kind: 'ok', pct: 11.5 });
    });

    it('accepts a bare number', () => {
      expect(resolveAuditPct([{ metric: 'm', value: 94.8 }], src())).toEqual({ kind: 'ok', pct: 94.8 });
    });

    it('reads the declared dot-path out of an object value', () => {
      expect(resolveAuditPct([{ metric: 'm', value: { link_rate_pct: 7.6 } }], src('link_rate_pct')))
        .toEqual({ kind: 'ok', pct: 7.6 });
    });

    it('reports not_numeric for an object value with no declared path', () => {
      expect(resolveAuditPct([{ metric: 'm', value: { link_rate_pct: 7.6 } }], src()))
        .toEqual({ kind: 'missing', reason: 'not_numeric' });
    });

    it('reports no_row when the metric is absent from the audit table', () => {
      expect(resolveAuditPct([{ metric: 'other', value: 1 }], src()))
        .toEqual({ kind: 'missing', reason: 'no_row' });
    });

    it('reports not_numeric for a null value', () => {
      expect(resolveAuditPct([{ metric: 'm', value: null }], src()))
        .toEqual({ kind: 'missing', reason: 'not_numeric' });
    });
  });

  // T4 — GC-14 lookback: locks BOTH directions named by the orchestrator fold
  // (2026-09-25): "latest run skipped + older measured run ⇒ shows older value
  // with age; no measured run ⇒ marker".
  describe('T4 resolveAuditPctFromHistory (GC-14 lookback)', () => {
    const wsibSrc = () => ({
      id: 'wsib', name: 'WSIB Registry', statusSlug: 'link_wsib', triggerSlug: 'link_wsib', yieldFields: [],
      auditMetric: 'link_rate_warn', auditValuePath: 'link_rate_pct',
    });

    it('direction 1: newest run is a gated skip (no rows) but an older run measured it — returns that older run\'s value + started_at', () => {
      const runs = [
        { started_at: '2026-09-24T00:00:00Z', records_meta: { audit_table: { rows: [{ metric: 'gate_decision', value: 'skip_gated_no_activity' }] } } },
        { started_at: '2026-06-24T00:00:00Z', records_meta: { audit_table: { rows: [{ metric: 'link_rate_warn', value: { link_rate_pct: 7.6241 } }] } } },
        { started_at: '2026-03-24T00:00:00Z', records_meta: { audit_table: { rows: [{ metric: 'link_rate_warn', value: { link_rate_pct: 5.1 } }] } } },
      ];
      expect(resolveAuditPctFromHistory(runs, wsibSrc()))
        .toEqual({ kind: 'ok', pct: 7.6241, started_at: '2026-06-24T00:00:00Z' });
    });

    it('direction 1 holds regardless of input order (sorts newest-first internally)', () => {
      const runs = [
        { started_at: '2026-03-24T00:00:00Z', records_meta: { audit_table: { rows: [{ metric: 'link_rate_warn', value: { link_rate_pct: 5.1 } }] } } },
        { started_at: '2026-09-24T00:00:00Z', records_meta: { audit_table: { rows: [] } } },
        { started_at: '2026-06-24T00:00:00Z', records_meta: { audit_table: { rows: [{ metric: 'link_rate_warn', value: { link_rate_pct: 7.6241 } }] } } },
      ];
      expect(resolveAuditPctFromHistory(runs, wsibSrc()))
        .toEqual({ kind: 'ok', pct: 7.6241, started_at: '2026-06-24T00:00:00Z' });
    });

    it('direction 2: no run in the window ever measured it — reports missing (the visible-marker case)', () => {
      const runs = [
        { started_at: '2026-09-24T00:00:00Z', records_meta: { audit_table: { rows: [{ metric: 'gate_decision', value: 'skip_gated_no_activity' }] } } },
        { started_at: '2026-06-24T00:00:00Z', records_meta: { audit_table: { rows: [{ metric: 'gate_decision', value: 'skip_gated_no_activity' }] } } },
      ];
      expect(resolveAuditPctFromHistory(runs, wsibSrc())).toEqual({ kind: 'missing', reason: 'no_row' });
    });

    it('an empty/undefined history window is also missing', () => {
      expect(resolveAuditPctFromHistory([], wsibSrc())).toEqual({ kind: 'missing', reason: 'no_row' });
      expect(resolveAuditPctFromHistory(undefined, wsibSrc())).toEqual({ kind: 'missing', reason: 'no_row' });
    });

    it('no auditMetric declared — no_metric, same short-circuit as resolveAuditPct', () => {
      expect(resolveAuditPctFromHistory([{ started_at: '2026-09-24T00:00:00Z', records_meta: null }], undefined))
        .toEqual({ kind: 'missing', reason: 'no_metric' });
    });
  });

  // T3 — source lock: the inline parse is gone, the resolver + GC-14 lookback +
  // missing/stale markers remain.
  it('T3 FreshnessTimeline routes the badge through resolveAuditPct(FromHistory) and marks missing/stale metrics', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../components/FreshnessTimeline.tsx'), 'utf-8'
    );
    expect(source).not.toContain('parseFloat(String(row.value)');
    expect(source).toContain('resolveAuditPct');
    expect(source).toContain('resolveAuditPctFromHistory');
    expect(source).toContain('audit-metric-missing');
    expect(source).toContain('audit-metric-stale');
  });
});
