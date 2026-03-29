/**
 * SPEC LINK: docs/specs/38_inspection_scraping.md
 * Tests: HTML table parser, status normalization, date parsing
 */
import { describe, it, expect } from 'vitest';
import {
  parseInspectionTable,
  normalizeStatus,
  parseInspectionDate,
} from '@/lib/inspections/parser';
import { createMockInspection } from './factories';

describe('Inspection Parser', () => {
  describe('parseInspectionTable', () => {
    it('extracts stages from a typical AIC HTML table', () => {
      const html = `
        <table>
          <tr><th>Inspection Stage</th><th>Status</th><th>Date</th></tr>
          <tr><td>Excavation/Shoring</td><td>Passed</td><td>01/15/2024</td></tr>
          <tr><td>Structural Framing</td><td>Outstanding</td><td>-</td></tr>
          <tr><td>Final Inspection</td><td>Not Passed</td><td>03/20/2024</td></tr>
        </table>
      `;
      const result = parseInspectionTable(html, '24 101234');

      expect(result).toHaveLength(3);
      expect(result[0].stage_name).toBe('Excavation/Shoring');
      expect(result[0].status).toBe('Passed');
      expect(result[0].inspection_date).toBe('2024-01-15');
      expect(result[0].permit_num).toBe('24 101234');

      expect(result[1].stage_name).toBe('Structural Framing');
      expect(result[1].status).toBe('Outstanding');
      expect(result[1].inspection_date).toBeNull();

      expect(result[2].stage_name).toBe('Final Inspection');
      expect(result[2].status).toBe('Not Passed');
      expect(result[2].inspection_date).toBe('2024-03-20');
    });

    it('skips header rows', () => {
      const html = `
        <table>
          <tr><td>Inspection Stage</td><td>Status</td><td>Date</td></tr>
          <tr><td>Rough-in Plumbing</td><td>Passed</td><td>02/10/2024</td></tr>
        </table>
      `;
      const result = parseInspectionTable(html, 'PLB-001');
      expect(result).toHaveLength(1);
      expect(result[0].stage_name).toBe('Rough-in Plumbing');
    });

    it('handles rows with only 2 columns (no date)', () => {
      const html = `
        <tr><td>Underground Plumbing</td><td>Outstanding</td></tr>
      `;
      const result = parseInspectionTable(html, 'PLB-001');
      expect(result).toHaveLength(1);
      expect(result[0].inspection_date).toBeNull();
    });

    it('returns empty array for empty table', () => {
      const result = parseInspectionTable('<table></table>', '24 101234');
      expect(result).toEqual([]);
    });

    it('returns empty array for empty string', () => {
      const result = parseInspectionTable('', '24 101234');
      expect(result).toEqual([]);
    });

    it('strips inner HTML tags from cell content', () => {
      const html = `
        <tr><td><b>Insulation</b></td><td><span>Partial</span></td><td>05/01/2024</td></tr>
      `;
      const result = parseInspectionTable(html, '24 101234');
      expect(result[0].stage_name).toBe('Insulation');
      expect(result[0].status).toBe('Partial');
    });

    it('handles Partially Completed status', () => {
      const html = `
        <tr><td>Vapour Barrier</td><td>Partially Completed</td><td>04/12/2024</td></tr>
      `;
      const result = parseInspectionTable(html, '24 101234');
      expect(result[0].status).toBe('Partial');
    });

    it('skips rows with unknown status', () => {
      const html = `
        <tr><td>Some Stage</td><td>Cancelled</td><td>01/01/2024</td></tr>
        <tr><td>Real Stage</td><td>Passed</td><td>01/02/2024</td></tr>
      `;
      const result = parseInspectionTable(html, '24 101234');
      expect(result).toHaveLength(1);
      expect(result[0].stage_name).toBe('Real Stage');
    });

    it('handles all 4 AIC portal status values in one table', () => {
      const html = `
        <tr><td>Stage A</td><td>Outstanding</td><td>-</td></tr>
        <tr><td>Stage B</td><td>Passed</td><td>01/10/2026</td></tr>
        <tr><td>Stage C</td><td>Not Passed</td><td>02/15/2026</td></tr>
        <tr><td>Stage D</td><td>Partial</td><td>03/01/2026</td></tr>
      `;
      const result = parseInspectionTable(html, '26 100000');
      expect(result).toHaveLength(4);
      expect(result.map(r => r.status)).toEqual([
        'Outstanding', 'Passed', 'Not Passed', 'Partial',
      ]);
    });
  });

  describe('normalizeStatus', () => {
    it('maps portal status values', () => {
      expect(normalizeStatus('Outstanding')).toBe('Outstanding');
      expect(normalizeStatus('Passed')).toBe('Passed');
      expect(normalizeStatus('Not Passed')).toBe('Not Passed');
      expect(normalizeStatus('Partial')).toBe('Partial');
    });

    it('handles case-insensitive variants', () => {
      expect(normalizeStatus('PASSED')).toBe('Passed');
      expect(normalizeStatus('not passed')).toBe('Not Passed');
      expect(normalizeStatus('outstanding')).toBe('Outstanding');
      expect(normalizeStatus('partially completed')).toBe('Partial');
    });

    it('handles legacy Pass/Fail values', () => {
      expect(normalizeStatus('Pass')).toBe('Passed');
      expect(normalizeStatus('Fail')).toBe('Not Passed');
      expect(normalizeStatus('Failed')).toBe('Not Passed');
    });

    it('returns null for unknown status', () => {
      expect(normalizeStatus('Cancelled')).toBeNull();
      expect(normalizeStatus('')).toBeNull();
    });
  });

  describe('parseInspectionDate', () => {
    it('parses MM/DD/YYYY format', () => {
      expect(parseInspectionDate('01/15/2024')).toBe('2024-01-15');
      expect(parseInspectionDate('12/05/2023')).toBe('2023-12-05');
    });

    it('parses single-digit month/day', () => {
      expect(parseInspectionDate('3/4/2026')).toBe('2026-03-04');
    });

    it('parses ISO format', () => {
      expect(parseInspectionDate('2024-01-15')).toBe('2024-01-15');
      expect(parseInspectionDate('2024-01-15T10:00:00Z')).toBe('2024-01-15');
    });

    it('parses "Mon D, YYYY" named month format from AIC portal', () => {
      expect(parseInspectionDate('Mar 4, 2026')).toBe('2026-03-04');
      expect(parseInspectionDate('Jan 15, 2024')).toBe('2024-01-15');
      expect(parseInspectionDate('December 25, 2025')).toBe('2025-12-25');
    });

    it('parses named month without comma', () => {
      expect(parseInspectionDate('Mar 4 2026')).toBe('2026-03-04');
    });

    it('returns null for empty/placeholder values', () => {
      expect(parseInspectionDate('')).toBeNull();
      expect(parseInspectionDate('-')).toBeNull();
      expect(parseInspectionDate('N/A')).toBeNull();
    });
  });

  describe('scraper statusChanges scoping', () => {
    /**
     * Regression: statusChanges was declared inside the for-loop body (let, block-scoped)
     * but referenced outside the loop in the return statement → ReferenceError.
     * This test validates the fix by replicating the accumulation pattern.
     */
    function simulateScrapeAccumulation(results: Array<{ error?: string; stages?: Array<{ status: string }> }>) {
      let scraped = 0;
      let upserted = 0;
      let totalStatusChanges = 0;

      for (const result of results) {
        if (result.error) continue;

        let statusChanges = 0;
        for (const stage of result.stages!) {
          upserted++;
          if (stage.status === 'changed') statusChanges++;
        }
        totalStatusChanges += statusChanges;
        scraped++;
      }

      return { searched: 1, scraped, upserted, statusChanges: totalStatusChanges };
    }

    it('returns statusChanges when results have stages', () => {
      const result = simulateScrapeAccumulation([
        { stages: [{ status: 'Outstanding' }, { status: 'changed' }] },
      ]);
      expect(result.statusChanges).toBe(1);
      expect(result.scraped).toBe(1);
      expect(result.upserted).toBe(2);
    });

    it('returns statusChanges=0 when results array is empty', () => {
      const result = simulateScrapeAccumulation([]);
      expect(result.statusChanges).toBe(0);
      expect(result.scraped).toBe(0);
    });

    it('accumulates statusChanges across multiple results', () => {
      const result = simulateScrapeAccumulation([
        { stages: [{ status: 'changed' }, { status: 'changed' }] },
        { stages: [{ status: 'Outstanding' }] },
        { stages: [{ status: 'changed' }] },
      ]);
      expect(result.statusChanges).toBe(3);
      expect(result.scraped).toBe(3);
    });

    it('skips error results without affecting statusChanges', () => {
      const result = simulateScrapeAccumulation([
        { error: 'no_processes' },
        { stages: [{ status: 'changed' }] },
      ]);
      expect(result.statusChanges).toBe(1);
      expect(result.scraped).toBe(1);
    });
  });

  describe('enrichedStatus computation', () => {
    function computeEnrichedStatus(stages: Array<{ status: string }>): string | null {
      if (!stages.length) return null;
      const statuses = stages.map(s => s.status);
      if (statuses.some(s => s === 'Not Passed')) return 'Not Passed';
      if (statuses.every(s => s === 'Outstanding')) return 'Permit Issued';
      if (statuses.every(s => s === 'Passed')) return 'Inspections Complete';
      return 'Active Inspection';
    }

    it('returns null for empty stages', () => {
      expect(computeEnrichedStatus([])).toBeNull();
    });

    it('returns Not Passed when any stage failed', () => {
      expect(computeEnrichedStatus([
        { status: 'Passed' }, { status: 'Not Passed' }, { status: 'Outstanding' },
      ])).toBe('Not Passed');
    });

    it('returns Permit Issued when all outstanding', () => {
      expect(computeEnrichedStatus([
        { status: 'Outstanding' }, { status: 'Outstanding' },
      ])).toBe('Permit Issued');
    });

    it('returns Inspections Complete when all passed', () => {
      expect(computeEnrichedStatus([
        { status: 'Passed' }, { status: 'Passed' },
      ])).toBe('Inspections Complete');
    });

    it('returns Active Inspection for mixed passed/outstanding', () => {
      expect(computeEnrichedStatus([
        { status: 'Passed' }, { status: 'Outstanding' },
      ])).toBe('Active Inspection');
    });
  });

  describe('orchestrator telemetry aggregation', () => {
    interface WorkerTelemetry {
      permits_attempted: number;
      permits_found: number;
      permits_scraped: number;
      not_found_count: number;
      proxy_errors: number;
      session_bootstraps: number;
      session_failures: number;
      total_upserted: number;
      status_changes: number;
      enriched_updates: number;
      preflight_passed: boolean;
      latencies: number[];
    }

    function aggregateTelemetry(workers: WorkerTelemetry[]) {
      const agg = {
        permits_attempted: 0,
        permits_found: 0,
        permits_scraped: 0,
        not_found_count: 0,
        proxy_errors: 0,
        session_bootstraps: 0,
        session_failures: 0,
        total_upserted: 0,
        status_changes: 0,
        enriched_updates: 0,
        preflight_failures: 0,
        all_latencies: [] as number[],
      };

      for (const w of workers) {
        agg.permits_attempted += w.permits_attempted;
        agg.permits_found += w.permits_found;
        agg.permits_scraped += w.permits_scraped;
        agg.not_found_count += w.not_found_count;
        agg.proxy_errors += w.proxy_errors;
        agg.session_bootstraps += w.session_bootstraps;
        agg.session_failures += w.session_failures;
        agg.total_upserted += w.total_upserted;
        agg.status_changes += w.status_changes;
        agg.enriched_updates += w.enriched_updates;
        if (!w.preflight_passed) agg.preflight_failures++;
        agg.all_latencies.push(...w.latencies);
      }

      return agg;
    }

    it('sums all counters from multiple workers', () => {
      const result = aggregateTelemetry([
        { permits_attempted: 25, permits_found: 20, permits_scraped: 18, not_found_count: 5, proxy_errors: 1, session_bootstraps: 1, session_failures: 0, total_upserted: 30, status_changes: 5, enriched_updates: 3, preflight_passed: true, latencies: [100, 200] },
        { permits_attempted: 25, permits_found: 22, permits_scraped: 22, not_found_count: 3, proxy_errors: 0, session_bootstraps: 1, session_failures: 0, total_upserted: 40, status_changes: 8, enriched_updates: 5, preflight_passed: true, latencies: [150, 250] },
      ]);
      expect(result.permits_attempted).toBe(50);
      expect(result.permits_found).toBe(42);
      expect(result.total_upserted).toBe(70);
      expect(result.status_changes).toBe(13);
      expect(result.preflight_failures).toBe(0);
      expect(result.all_latencies).toHaveLength(4);
    });

    it('counts preflight failures', () => {
      const result = aggregateTelemetry([
        { permits_attempted: 0, permits_found: 0, permits_scraped: 0, not_found_count: 0, proxy_errors: 0, session_bootstraps: 1, session_failures: 0, total_upserted: 0, status_changes: 0, enriched_updates: 0, preflight_passed: false, latencies: [] },
        { permits_attempted: 25, permits_found: 20, permits_scraped: 18, not_found_count: 5, proxy_errors: 0, session_bootstraps: 1, session_failures: 0, total_upserted: 30, status_changes: 5, enriched_updates: 3, preflight_passed: true, latencies: [100] },
      ]);
      expect(result.preflight_failures).toBe(1);
    });

    it('handles empty worker list', () => {
      const result = aggregateTelemetry([]);
      expect(result.permits_attempted).toBe(0);
      expect(result.preflight_failures).toBe(0);
    });
  });

  describe('preflight stealth check', () => {
    function checkPreflight(webdriver: unknown, chromeRuntime: unknown): { passed: boolean; reason?: string } {
      if (webdriver === true) return { passed: false, reason: 'navigator.webdriver is true' };
      if (!chromeRuntime) return { passed: false, reason: 'window.chrome.runtime is falsy' };
      return { passed: true };
    }

    it('passes when webdriver is undefined and chrome.runtime exists', () => {
      expect(checkPreflight(undefined, { id: 'xxx' })).toEqual({ passed: true });
    });

    it('passes when webdriver is false', () => {
      expect(checkPreflight(false, { id: 'xxx' })).toEqual({ passed: true });
    });

    it('fails when webdriver is true', () => {
      const result = checkPreflight(true, { id: 'xxx' });
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('webdriver');
    });

    it('fails when chrome.runtime is falsy', () => {
      const result = checkPreflight(undefined, undefined);
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('chrome.runtime');
    });
  });

  describe('batch claim SQL pattern', () => {
    // Validates the claim logic pattern used in the Python orchestrator
    function simulateBatchClaim(
      queue: Array<{ year_seq: string; status: string }>,
      workerId: string,
      batchSize: number,
    ) {
      const claimed: string[] = [];
      for (const item of queue) {
        if (claimed.length >= batchSize) break;
        if (item.status === 'pending') {
          item.status = 'claimed';
          claimed.push(item.year_seq);
        }
      }
      return claimed;
    }

    it('claims up to batchSize pending items', () => {
      const queue = [
        { year_seq: '24 100001', status: 'pending' },
        { year_seq: '24 100002', status: 'pending' },
        { year_seq: '24 100003', status: 'pending' },
      ];
      const claimed = simulateBatchClaim(queue, 'worker-1', 2);
      expect(claimed).toEqual(['24 100001', '24 100002']);
      expect(queue[0].status).toBe('claimed');
      expect(queue[2].status).toBe('pending');
    });

    it('skips already claimed items', () => {
      const queue = [
        { year_seq: '24 100001', status: 'claimed' },
        { year_seq: '24 100002', status: 'pending' },
      ];
      const claimed = simulateBatchClaim(queue, 'worker-2', 2);
      expect(claimed).toEqual(['24 100002']);
    });

    it('returns empty when nothing pending', () => {
      const queue = [
        { year_seq: '24 100001', status: 'completed' },
        { year_seq: '24 100002', status: 'failed' },
      ];
      expect(simulateBatchClaim(queue, 'worker-1', 5)).toEqual([]);
    });
  });

  describe('factory', () => {
    it('creates a valid mock inspection', () => {
      const insp = createMockInspection();
      expect(insp.permit_num).toBe('24 101234');
      expect(insp.stage_name).toBe('Structural Framing');
      expect(insp.status).toBe('Passed');
    });

    it('accepts overrides', () => {
      const insp = createMockInspection({ status: 'Outstanding', inspection_date: null });
      expect(insp.status).toBe('Outstanding');
      expect(insp.inspection_date).toBeNull();
    });
  });
});
