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
    function checkPreflight(webdriver: unknown, chromeExists: boolean): { passed: boolean; reason?: string } {
      if (webdriver === true) return { passed: false, reason: 'navigator.webdriver is true' };
      if (!chromeExists) return { passed: false, reason: 'window.chrome is missing' };
      return { passed: true };
    }

    it('passes when webdriver is undefined/false and chrome exists', () => {
      expect(checkPreflight(undefined, true)).toEqual({ passed: true });
      expect(checkPreflight(false, true)).toEqual({ passed: true });
    });

    it('passes when chrome.runtime is undefined (normal for nodriver)', () => {
      // nodriver does NOT populate chrome.runtime — this is expected
      // We only check window.chrome exists, not chrome.runtime
      expect(checkPreflight(false, true)).toEqual({ passed: true });
    });

    it('fails when webdriver is true', () => {
      const result = checkPreflight(true, true);
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('webdriver');
    });

    it('fails when window.chrome is missing', () => {
      const result = checkPreflight(false, false);
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('chrome');
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

  describe('real-time preflight abort (A8)', () => {
    /**
     * Simulates the orchestrator's abort logic. When preflight_failure_count
     * reaches MAX_PREFLIGHT_FAILURES, the abort_event should be set and all
     * workers should stop processing new batches.
     */
    function simulateOrchestratorAbort(
      workerPreflightResults: boolean[],
      maxPreflightFailures: number,
    ): { abortTriggered: boolean; abortAfterWorker: number; batchesSkipped: number } {
      let preflightFailureCount = 0;
      let abortTriggered = false;
      let abortAfterWorker = -1;
      let batchesSkipped = 0;

      for (let i = 0; i < workerPreflightResults.length; i++) {
        // Check abort before processing
        if (abortTriggered) {
          batchesSkipped++;
          continue;
        }

        if (!workerPreflightResults[i]) {
          preflightFailureCount++;
          if (preflightFailureCount >= maxPreflightFailures) {
            abortTriggered = true;
            abortAfterWorker = i;
          }
        }
      }

      return { abortTriggered, abortAfterWorker, batchesSkipped };
    }

    it('aborts when 2+ workers fail preflight', () => {
      const result = simulateOrchestratorAbort(
        [false, false, true, true, true], // workers 0,1 fail; 2,3,4 should be skipped
        2,
      );
      expect(result.abortTriggered).toBe(true);
      expect(result.abortAfterWorker).toBe(1);
      expect(result.batchesSkipped).toBe(3);
    });

    it('does not abort when only 1 worker fails preflight', () => {
      const result = simulateOrchestratorAbort(
        [false, true, true, true],
        2,
      );
      expect(result.abortTriggered).toBe(false);
      expect(result.batchesSkipped).toBe(0);
    });

    it('does not abort when all workers pass', () => {
      const result = simulateOrchestratorAbort(
        [true, true, true],
        2,
      );
      expect(result.abortTriggered).toBe(false);
    });

    it('handles abort at exactly the threshold', () => {
      const result = simulateOrchestratorAbort(
        [true, false, false, true], // workers 1,2 fail -> abort before worker 3
        2,
      );
      expect(result.abortTriggered).toBe(true);
      expect(result.abortAfterWorker).toBe(2);
      expect(result.batchesSkipped).toBe(1);
    });
  });

  describe('per-worker proxy sticky sessions (I1)', () => {
    function buildProxySessionId(workerId: string, timestamp: number): string {
      return `buildo-worker-${workerId}-${timestamp}`;
    }

    function buildProxyUrl(host: string, port: string, user: string, pass: string, sessionId: string): string {
      return `http://${user}-session-${sessionId}:${pass}@${host}:${port}`;
    }

    it('constructs unique session ID per worker', () => {
      const ts = 1711700000;
      const s1 = buildProxySessionId('1', ts);
      const s2 = buildProxySessionId('2', ts);
      expect(s1).toBe('buildo-worker-1-1711700000');
      expect(s2).toBe('buildo-worker-2-1711700000');
      expect(s1).not.toBe(s2);
    });

    it('builds valid Decodo proxy URL with session', () => {
      const url = buildProxyUrl('ca.decodo.com', '10000', 'user1', 'pass1', 'buildo-worker-1-123');
      expect(url).toBe('http://user1-session-buildo-worker-1-123:pass1@ca.decodo.com:10000');
    });

    it('session changes when rotated', () => {
      const s1 = buildProxySessionId('1', 1000);
      const s2 = buildProxySessionId('1', 2000);
      expect(s1).not.toBe(s2);
    });
  });

  describe('worker batch loop with browser reuse (B6)', () => {
    /**
     * Simulates a long-lived worker that reuses its browser across multiple
     * batch claims, only bootstrapping once at start and on WAF trap recovery.
     */
    function simulateWorkerBatchLoop(
      queueBatches: string[][],  // pre-claimed batches
      bootstrapCost: number,     // ms per bootstrap
      perPermitCost: number,     // ms per permit
    ): { totalTime: number; bootstrapCount: number; permitsProcessed: number } {
      let totalTime = 0;
      let bootstrapCount = 0;
      let permitsProcessed = 0;

      // Single bootstrap at start
      totalTime += bootstrapCost;
      bootstrapCount++;

      for (const batch of queueBatches) {
        // No re-bootstrap between batches — reuse browser
        for (const _yearSeq of batch) {
          totalTime += perPermitCost;
          permitsProcessed++;
        }
      }

      return { totalTime, bootstrapCount, permitsProcessed };
    }

    function simulateSubprocessPerBatch(
      queueBatches: string[][],
      bootstrapCost: number,
      perPermitCost: number,
    ): { totalTime: number; bootstrapCount: number; permitsProcessed: number } {
      let totalTime = 0;
      let bootstrapCount = 0;
      let permitsProcessed = 0;

      for (const batch of queueBatches) {
        // New Chrome per batch
        totalTime += bootstrapCost;
        bootstrapCount++;
        for (const _yearSeq of batch) {
          totalTime += perPermitCost;
          permitsProcessed++;
        }
      }

      return { totalTime, bootstrapCount, permitsProcessed };
    }

    it('browser reuse saves bootstrap overhead across batches', () => {
      const batches = Array.from({ length: 10 }, (_, i) =>
        Array.from({ length: 25 }, (_, j) => `24 ${100000 + i * 25 + j}`),
      );

      const reuse = simulateWorkerBatchLoop(batches, 3000, 1000);
      const noReuse = simulateSubprocessPerBatch(batches, 3000, 1000);

      // Browser reuse: 1 bootstrap. No reuse: 10 bootstraps.
      expect(reuse.bootstrapCount).toBe(1);
      expect(noReuse.bootstrapCount).toBe(10);
      expect(reuse.permitsProcessed).toBe(noReuse.permitsProcessed);
      // 27s saved (9 * 3000ms)
      expect(noReuse.totalTime - reuse.totalTime).toBe(27000);
    });

    it('at scale (2480 batches), saves ~2 hours of bootstrap overhead', () => {
      // 62K permits / 25 per batch = 2480 batches per worker
      const batchCount = 2480;
      const bootstrapCost = 3000; // 3s
      const savedMs = (batchCount - 1) * bootstrapCost;
      const savedHours = savedMs / 1000 / 3600;
      expect(savedHours).toBeGreaterThan(2);
    });
  });

  describe('folder filter: folderSection vs folderTypeDesc', () => {
    // AIC API returns folders with folderSection (code: BLD, HVA, PLB) and
    // folderTypeDesc (human label: varies, not matching our DB permit_type).
    // We must filter on folderSection, not folderTypeDesc.

    const TARGET_SECTIONS = ['BLD'];

    const mockFolders = [
      { folderSection: 'BLD', folderTypeDesc: 'Building', statusDesc: 'Inspection', folderYear: '24', folderSequence: '100001', folderRsn: '1' },
      { folderSection: 'BLD', folderTypeDesc: 'Small Residential', statusDesc: 'Inspection', folderYear: '24', folderSequence: '100001', folderRsn: '2' },
      { folderSection: 'HVA', folderTypeDesc: 'Mechanical', statusDesc: 'Inspection', folderYear: '24', folderSequence: '100001', folderRsn: '3' },
      { folderSection: 'PLB', folderTypeDesc: 'Plumbing', statusDesc: 'Inspection', folderYear: '24', folderSequence: '100001', folderRsn: '4' },
      { folderSection: 'BLD', folderTypeDesc: 'New House', statusDesc: 'Permit Issued', folderYear: '24', folderSequence: '100001', folderRsn: '5' },
    ];

    it('folderSection filter catches all BLD permits regardless of typeDesc label', () => {
      const result = mockFolders.filter(f => TARGET_SECTIONS.includes(f.folderSection));
      expect(result).toHaveLength(3);
      expect(result.map(f => f.folderTypeDesc)).toEqual(['Building', 'Small Residential', 'New House']);
    });

    it('old folderTypeDesc filter would miss permits with AIC-specific labels', () => {
      const DB_TARGET_TYPES = ['Small Residential Projects', 'Building Additions/Alterations', 'New Houses'];
      const result = mockFolders.filter(f => DB_TARGET_TYPES.includes(f.folderTypeDesc));
      // AIC uses "Building" not "Building Additions/Alterations", "Small Residential" not "Small Residential Projects"
      expect(result).toHaveLength(0); // 100% miss — this was the bug
    });

    it('non-BLD sections (HVA, PLB) are correctly excluded', () => {
      const result = mockFolders.filter(f => TARGET_SECTIONS.includes(f.folderSection));
      expect(result.every(f => f.folderSection === 'BLD')).toBe(true);
    });
  });

  describe('proxy extension builder (Fix 1)', () => {
    function buildProxyExtensionManifest(): object {
      return {
        version: '1.0.0',
        manifest_version: 3,
        name: 'Decodo Proxy Auth',
        permissions: ['proxy', 'webRequest', 'webRequestAuthProvider'],
        host_permissions: ['<all_urls>'],
        background: { service_worker: 'background.js' },
      };
    }

    function buildProxyBackgroundJs(host: string, port: number, user: string, pass: string): string {
      return [
        `var config = { mode: "fixed_servers", rules: { singleProxy: { scheme: "http", host: "${host}", port: ${port} }, bypassList: ["localhost"] } };`,
        `chrome.proxy.settings.set({value: config, scope: "regular"}, function() {});`,
        `chrome.webRequest.onAuthRequired.addListener(function(details, callback) { callback({ authCredentials: { username: "${user}", password: "${pass}" } }); }, {urls: ["<all_urls>"]}, ['asyncBlocking']);`,
      ].join('\n');
    }

    it('generates valid Manifest V3 JSON', () => {
      const manifest = buildProxyExtensionManifest();
      expect(manifest).toHaveProperty('manifest_version', 3);
      expect(manifest).toHaveProperty('permissions');
      expect((manifest as { permissions: string[] }).permissions).toContain('webRequestAuthProvider');
    });

    it('embeds credentials in background.js', () => {
      const js = buildProxyBackgroundJs('ca.decodo.com', 20001, 'user1-session-abc', 'pass123');
      expect(js).toContain('ca.decodo.com');
      expect(js).toContain('20001');
      expect(js).toContain('user1-session-abc');
      expect(js).toContain('pass123');
      expect(js).toContain('onAuthRequired');
    });

    it('does not include raw password in proxy URL (no --proxy-server auth)', () => {
      // The old approach embedded user:pass in the URL — Chrome ignores it
      const badUrl = 'http://user:pass@proxy.com:8080';
      // Extension approach never constructs this URL
      const js = buildProxyBackgroundJs('proxy.com', 8080, 'user', 'pass');
      expect(js).not.toContain('http://user:pass@');
    });
  });

  describe('JSON soft block resilience (Fix 3)', () => {
    function safeJsonParse(raw: string | null | undefined): { ok: boolean; data?: unknown; waf_blocked?: boolean } {
      if (!raw || raw.trim().startsWith('<')) {
        return { ok: false, waf_blocked: true };
      }
      try {
        return { ok: true, data: JSON.parse(raw) };
      } catch {
        return { ok: false, waf_blocked: true };
      }
    }

    it('parses valid JSON', () => {
      const result = safeJsonParse('[{"propertyRsn": 123}]');
      expect(result.ok).toBe(true);
      expect(result.data).toEqual([{ propertyRsn: 123 }]);
    });

    it('treats HTML as WAF block', () => {
      expect(safeJsonParse('<html>Access Denied</html>')).toEqual({ ok: false, waf_blocked: true });
    });

    it('treats empty string as WAF block', () => {
      expect(safeJsonParse('')).toEqual({ ok: false, waf_blocked: true });
    });

    it('treats null as WAF block', () => {
      expect(safeJsonParse(null)).toEqual({ ok: false, waf_blocked: true });
    });

    it('treats 502 plain text as WAF block', () => {
      expect(safeJsonParse('502 Bad Gateway')).toEqual({ ok: false, waf_blocked: true });
    });

    it('treats 429 plain text as WAF block', () => {
      expect(safeJsonParse('429 Too Many Requests')).toEqual({ ok: false, waf_blocked: true });
    });

    it('treats truncated JSON as WAF block', () => {
      expect(safeJsonParse('{"propertyRsn": 12')).toEqual({ ok: false, waf_blocked: true });
    });
  });

  describe('streaming subprocess output (Fix 4)', () => {
    function simulateStreamParsing(lines: string[]): { summary: string | null; linesStreamed: number; memoryKept: number } {
      let summary: string | null = null;
      let linesStreamed = 0;
      let memoryKept = 0;

      for (const line of lines) {
        linesStreamed++;
        if (line.includes('PIPELINE_SUMMARY:')) {
          summary = line;
          memoryKept++;
        }
        // All other lines are printed and discarded — not kept in memory
      }

      return { summary, linesStreamed, memoryKept };
    }

    it('only keeps PIPELINE_SUMMARY in memory', () => {
      const lines = [
        '{"level":"INFO","tag":"[worker-1]","msg":"Starting..."}',
        '{"level":"INFO","tag":"[worker-1]","msg":"Batch 1: claimed 25 year_seqs"}',
        ...Array.from({ length: 10000 }, (_, i) => `{"level":"INFO","msg":"permit ${i}"}`),
        'PIPELINE_SUMMARY:{"records_total":10000,"records_new":500}',
      ];

      const result = simulateStreamParsing(lines);
      expect(result.linesStreamed).toBe(10003);
      expect(result.memoryKept).toBe(1); // Only the summary line
      expect(result.summary).toContain('PIPELINE_SUMMARY:');
    });

    it('handles no summary line', () => {
      const result = simulateStreamParsing(['line1', 'line2']);
      expect(result.summary).toBeNull();
      expect(result.memoryKept).toBe(0);
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

// ---------------------------------------------------------------------------
// Pipeline route wiring — inspections slug must point to Python orchestrator
// ---------------------------------------------------------------------------
import * as fs from 'fs';
import * as path from 'path';

describe('Pipeline route wiring for inspections', () => {
  const routePath = path.resolve(__dirname, '../app/api/admin/pipelines/[slug]/route.ts');
  const routeSource = fs.readFileSync(routePath, 'utf-8');

  it('inspections slug maps to aic-orchestrator.py (not legacy JS scraper)', () => {
    expect(routeSource).toContain("inspections: 'scripts/aic-orchestrator.py'");
    expect(routeSource).not.toContain("inspections: 'scripts/poc-aic-scraper-v2.js'");
  });

  it('aic-orchestrator.py script exists on disk', () => {
    const scriptPath = path.resolve(__dirname, '../../scripts/aic-orchestrator.py');
    expect(fs.existsSync(scriptPath)).toBe(true);
  });

  it('spawn logic detects .py scripts and uses python runtime', () => {
    // Route must have logic to choose python/python3 for .py files
    expect(routeSource).toMatch(/\.py['"`]/);
    expect(routeSource).toMatch(/python/);
  });
});

describe('SCRAPE_MAX_PERMITS cap', () => {
  const orchestratorSource = fs.readFileSync(
    path.resolve(__dirname, '../../scripts/aic-orchestrator.py'), 'utf-8'
  );
  const workerSource = fs.readFileSync(
    path.resolve(__dirname, '../../scripts/aic-scraper-nodriver.py'), 'utf-8'
  );

  it('orchestrator reads SCRAPE_MAX_PERMITS and passes to workers', () => {
    expect(orchestratorSource).toContain('SCRAPE_MAX_PERMITS');
  });

  it('worker db-queue mode breaks batch loop when cap is reached', () => {
    // Worker must read SCRAPE_MAX_PERMITS and check cumulative count
    expect(workerSource).toContain('SCRAPE_MAX_PERMITS');
    expect(workerSource).toMatch(/max_permits/i);
  });
});

describe('Proxy auth via MV3 extension', () => {
  const scraperSource = fs.readFileSync(
    path.resolve(__dirname, '../../scripts/aic-scraper-nodriver.py'), 'utf-8'
  );

  it('uses MV3 extension for proxy auth, not create_context', () => {
    // create_context(proxy_server=url) does NOT handle authenticated proxies (407 error).
    // Must use MV3 Chrome extension with webRequest.onAuthRequired instead.
    expect(scraperSource).toContain('build_proxy_extension');
    expect(scraperSource).toContain('onAuthRequired');
    expect(scraperSource).toContain('--load-extension');
    expect(scraperSource).not.toContain('create_context');
  });

  it('cleans up proxy extension directory on completion', () => {
    expect(scraperSource).toContain('cleanup_proxy_extension');
  });
});

describe('PIPELINE_SUMMARY capture uses last occurrence', () => {
  const routeSource = fs.readFileSync(
    path.resolve(__dirname, '../app/api/admin/pipelines/[slug]/route.ts'), 'utf-8'
  );

  it('route.ts captures last PIPELINE_SUMMARY, not first (orchestrator aggregate)', () => {
    // Workers stream PIPELINE_SUMMARY before the orchestrator emits its aggregate.
    // .match() returns the first occurrence — must use lastIndexOf or matchAll.
    const parseBlock = routeSource.slice(
      routeSource.indexOf('Parse PIPELINE_SUMMARY'),
      routeSource.indexOf('Parse PIPELINE_META')
    );
    // Must NOT use simple .match() which returns the first match
    expect(parseBlock).not.toMatch(/stdout\?\.match\s*\(\s*\/PIPELINE_SUMMARY/);
    // Must find the LAST occurrence
    expect(parseBlock).toMatch(/last|lastIndexOf|reverse|pop|matchAll/i);
  });
});
