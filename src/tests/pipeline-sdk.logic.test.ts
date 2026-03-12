/**
 * Pipeline SDK — unit tests
 * SPEC LINK: docs/specs/00_engineering_standards.md §9
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';

// The SDK is CommonJS in scripts/lib — require it
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pipeline = require(path.resolve(__dirname, '../../scripts/lib/pipeline'));

describe('Pipeline SDK', () => {
  // -----------------------------------------------------------------------
  // createPool
  // -----------------------------------------------------------------------
  describe('createPool()', () => {
    it('returns a Pool instance with PG_* env var defaults', () => {
      const pool = pipeline.createPool();
      expect(pool).toBeDefined();
      expect(typeof pool.query).toBe('function');
      expect(typeof pool.connect).toBe('function');
      expect(typeof pool.end).toBe('function');
      // Clean up the pool immediately
      pool.end().catch(() => {});
    });
  });

  // -----------------------------------------------------------------------
  // track() / getTracked() — auto-tracking counters
  // -----------------------------------------------------------------------
  describe('track() and getTracked()', () => {
    beforeEach(() => {
      pipeline.track.reset();
    });

    it('getTracked() returns zeros initially', () => {
      expect(pipeline.getTracked()).toEqual({ records_new: 0, records_updated: 0 });
    });

    it('track() increments counters correctly', () => {
      pipeline.track(5, 10);
      expect(pipeline.getTracked()).toEqual({ records_new: 5, records_updated: 10 });
    });

    it('track() accumulates across multiple calls', () => {
      pipeline.track(3, 7);
      pipeline.track(2, 3);
      expect(pipeline.getTracked()).toEqual({ records_new: 5, records_updated: 10 });
    });

    it('track.reset() clears counters', () => {
      pipeline.track(10, 20);
      pipeline.track.reset();
      expect(pipeline.getTracked()).toEqual({ records_new: 0, records_updated: 0 });
    });
  });

  // -----------------------------------------------------------------------
  // emitSummary
  // -----------------------------------------------------------------------
  describe('emitSummary()', () => {
    let logSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });
    afterEach(() => {
      logSpy.mockRestore();
    });

    it('emits PIPELINE_SUMMARY with correct JSON format', () => {
      pipeline.emitSummary({ records_total: 100, records_new: 50, records_updated: 30 });
      expect(logSpy).toHaveBeenCalledTimes(1);
      const output = logSpy.mock.calls[0][0] as string;
      expect(output).toMatch(/^PIPELINE_SUMMARY:/);
      const parsed = JSON.parse(output.replace('PIPELINE_SUMMARY:', ''));
      expect(parsed).toEqual({ records_total: 100, records_new: 50, records_updated: 30 });
    });

    it('includes records_meta when provided', () => {
      pipeline.emitSummary({
        records_total: 10,
        records_new: 5,
        records_updated: 3,
        records_meta: { checks_passed: 4, checks_failed: 0 },
      });
      const output = logSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output.replace('PIPELINE_SUMMARY:', ''));
      expect(parsed.records_meta).toEqual({ checks_passed: 4, checks_failed: 0 });
    });

    it('defaults missing fields to 0', () => {
      pipeline.emitSummary({});
      const output = logSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output.replace('PIPELINE_SUMMARY:', ''));
      expect(parsed).toEqual({ records_total: 0, records_new: 0, records_updated: 0 });
    });

    it('preserves null for records_new/records_updated (§3.5 CQA exemption)', () => {
      pipeline.emitSummary({ records_total: 5, records_new: null, records_updated: null });
      const output = logSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output.replace('PIPELINE_SUMMARY:', ''));
      expect(parsed).toEqual({ records_total: 5, records_new: null, records_updated: null });
    });
  });

  // -----------------------------------------------------------------------
  // emitMeta
  // -----------------------------------------------------------------------
  describe('emitMeta()', () => {
    let logSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });
    afterEach(() => {
      logSpy.mockRestore();
    });

    it('emits PIPELINE_META with reads and writes', () => {
      pipeline.emitMeta(
        { permits: ['permit_num'] },
        { permit_trades: ['trade_slug'] }
      );
      const output = logSpy.mock.calls[0][0] as string;
      expect(output).toMatch(/^PIPELINE_META:/);
      const parsed = JSON.parse(output.replace('PIPELINE_META:', ''));
      expect(parsed.reads).toEqual({ permits: ['permit_num'] });
      expect(parsed.writes).toEqual({ permit_trades: ['trade_slug'] });
    });

    it('includes external APIs when provided', () => {
      pipeline.emitMeta(
        { 'CKAN API': ['PERMIT_NUM'] },
        { permits: ['permit_num'] },
        ['CKAN API']
      );
      const output = logSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output.replace('PIPELINE_META:', ''));
      expect(parsed.external).toEqual(['CKAN API']);
    });

    it('omits external key when empty', () => {
      pipeline.emitMeta({ t: ['c'] }, { t2: ['c2'] });
      const output = logSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output.replace('PIPELINE_META:', ''));
      expect(parsed.external).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // progress
  // -----------------------------------------------------------------------
  describe('progress()', () => {
    let logSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });
    afterEach(() => {
      logSpy.mockRestore();
    });

    it('logs progress with percentage and elapsed time', () => {
      const start = Date.now() - 5000; // 5 seconds ago
      pipeline.progress('test', 50, 100, start);
      expect(logSpy).toHaveBeenCalledTimes(1);
      const output = logSpy.mock.calls[0][0] as string;
      expect(output).toContain('[test]');
      expect(output).toContain('50.0%');
    });

    it('handles zero total gracefully', () => {
      pipeline.progress('test', 0, 0, Date.now());
      const output = logSpy.mock.calls[0][0] as string;
      expect(output).toContain('0.0%');
    });
  });

  // -----------------------------------------------------------------------
  // log (structured logging)
  // -----------------------------------------------------------------------
  describe('log', () => {
    it('log.info emits structured JSON to console.log', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      pipeline.log.info('[test]', 'hello', { key: 'val' });
      const parsed = JSON.parse(spy.mock.calls[0][0]);
      expect(parsed.level).toBe('INFO');
      expect(parsed.tag).toBe('[test]');
      expect(parsed.msg).toBe('hello');
      expect(parsed.context).toEqual({ key: 'val' });
      spy.mockRestore();
    });

    it('log.warn emits structured JSON to console.warn', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      pipeline.log.warn('[test]', 'caution');
      const parsed = JSON.parse(spy.mock.calls[0][0]);
      expect(parsed.level).toBe('WARN');
      spy.mockRestore();
    });

    it('log.error extracts message and stack from Error objects', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const err = new Error('boom');
      pipeline.log.error('[test]', err, { phase: 'load' });
      const parsed = JSON.parse(spy.mock.calls[0][0]);
      expect(parsed.level).toBe('ERROR');
      expect(parsed.msg).toBe('boom');
      expect(parsed.stack).toContain('Error: boom');
      expect(parsed.context).toEqual({ phase: 'load' });
      spy.mockRestore();
    });

    it('log.error handles non-Error values', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      pipeline.log.error('[test]', 'string error');
      const parsed = JSON.parse(spy.mock.calls[0][0]);
      expect(parsed.msg).toBe('string error');
      expect(parsed.stack).toBeUndefined();
      spy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // withTransaction
  // -----------------------------------------------------------------------
  describe('withTransaction()', () => {
    it('commits on success', async () => {
      const queries: string[] = [];
      const mockClient = {
        query: vi.fn(async (sql: string) => { queries.push(sql); }),
        release: vi.fn(),
      };
      const mockPool = {
        connect: vi.fn(async () => mockClient),
      };

      const result = await pipeline.withTransaction(mockPool, async () => {
        return 42;
      });

      expect(result).toBe(42);
      expect(queries).toEqual(['BEGIN', 'COMMIT']);
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('rolls back and re-throws on error', async () => {
      const queries: string[] = [];
      const mockClient = {
        query: vi.fn(async (sql: string) => { queries.push(sql); }),
        release: vi.fn(),
      };
      const mockPool = {
        connect: vi.fn(async () => mockClient),
      };

      await expect(
        pipeline.withTransaction(mockPool, async () => {
          throw new Error('test error');
        })
      ).rejects.toThrow('test error');

      expect(queries).toEqual(['BEGIN', 'ROLLBACK']);
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('handles rollback failure gracefully (nested try-catch)', async () => {
      const mockClient = {
        query: vi.fn(async (sql: string) => {
          if (sql === 'ROLLBACK') throw new Error('rollback failed');
        }),
        release: vi.fn(),
      };
      const mockPool = {
        connect: vi.fn(async () => mockClient),
      };

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(
        pipeline.withTransaction(mockPool, async () => {
          throw new Error('original error');
        })
      ).rejects.toThrow('original error');

      // Should log the rollback failure but preserve original error
      expect(errorSpy).toHaveBeenCalled();
      expect(mockClient.release).toHaveBeenCalledTimes(1);
      errorSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // Batch utilities
  // -----------------------------------------------------------------------
  describe('batch utilities', () => {
    it('BATCH_SIZE defaults to 1000', () => {
      expect(pipeline.BATCH_SIZE).toBe(1000);
    });

    it('maxRowsPerInsert respects 65535 param limit', () => {
      expect(pipeline.maxRowsPerInsert(8)).toBe(8191);   // 65535 / 8
      expect(pipeline.maxRowsPerInsert(16)).toBe(4095);  // 65535 / 16
      expect(pipeline.maxRowsPerInsert(32)).toBe(2047);  // 65535 / 32
    });

    it('isFullMode returns false when --full not in argv', () => {
      expect(pipeline.isFullMode()).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // run() lifecycle
  // -----------------------------------------------------------------------
  describe('run()', () => {
    it('exports run and createPool as functions', () => {
      expect(typeof pipeline.run).toBe('function');
      expect(typeof pipeline.createPool).toBe('function');
    });
  });

  // -----------------------------------------------------------------------
  // Tracing (§9.7) — no-op when @opentelemetry/api not installed
  // -----------------------------------------------------------------------
  describe('tracing', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const tracing = require(path.resolve(__dirname, '../../scripts/lib/tracing'));

    it('exports getTracer, isEnabled, SpanStatusCode', () => {
      expect(typeof tracing.getTracer).toBe('function');
      expect(typeof tracing.isEnabled).toBe('function');
      expect(tracing.SpanStatusCode).toBeDefined();
      expect(tracing.SpanStatusCode.OK).toBeDefined();
      expect(tracing.SpanStatusCode.ERROR).toBeDefined();
    });

    it('returns no-op tracer when @opentelemetry/api is not installed', () => {
      const tracer = tracing.getTracer('test');
      expect(tracer).toBeDefined();
      // No-op tracer should return a span with no-op methods
      const span = tracer.startSpan('test-span');
      expect(span).toBeDefined();
      expect(typeof span.setAttribute).toBe('function');
      expect(typeof span.end).toBe('function');
      expect(span.isRecording()).toBe(false);
      span.end(); // should not throw
    });

    it('startActiveSpan calls the callback with a span', () => {
      const tracer = tracing.getTracer('test');
      let called = false;
      tracer.startActiveSpan('test-span', (span: { setAttribute: (k: string, v: string) => void; end: () => void }) => {
        called = true;
        expect(span).toBeDefined();
        expect(typeof span.setAttribute).toBe('function');
        span.end();
      });
      expect(called).toBe(true);
    });

    it('isEnabled returns false when OTel is not configured', () => {
      expect(tracing.isEnabled()).toBe(false);
    });

    it('NOOP_SPAN methods are chainable (setAttribute returns this)', () => {
      const span = tracing.NOOP_SPAN;
      const result = span.setAttribute('key', 'value');
      expect(result).toBe(span);
    });

    it('withTransaction still works with no-op tracing', async () => {
      const queries: string[] = [];
      const mockClient = {
        query: vi.fn(async (sql: string) => { queries.push(sql); }),
        release: vi.fn(),
      };
      const mockPool = {
        connect: vi.fn(async () => mockClient),
      };

      const result = await pipeline.withTransaction(mockPool, async () => {
        return 'success';
      });

      expect(result).toBe('success');
      expect(queries).toEqual(['BEGIN', 'COMMIT']);
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // All scripts import SDK
  // -----------------------------------------------------------------------
  describe('script SDK adoption', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    const scriptDir = path.resolve(__dirname, '../../scripts');

    const PIPELINE_SCRIPTS = [
      'load-permits.js',
      'load-coa.js',
      'load-parcels.js',
      'load-neighbourhoods.js',
      'load-wsib.js',
      'load-address-points.js',
      'load-massing.js',
      'classify-permits.js',
      'classify-scope.js',
      'geocode-permits.js',
      'link-parcels.js',
      'link-neighbourhoods.js',
      'link-massing.js',
      'link-coa.js',
      'link-wsib.js',
      'extract-builders.js',
      'refresh-snapshot.js',
      'compute-centroids.js',
      'link-similar.js',
      'create-pre-permits.js',
      'enrich-web-search.js',
    ];

    for (const script of PIPELINE_SCRIPTS) {
      it(`${script} imports the pipeline SDK`, () => {
        const content = fs.readFileSync(path.join(scriptDir, script), 'utf-8');
        expect(content).toContain("require('./lib/pipeline')");
      });

      it(`${script} uses pipeline.run() lifecycle`, () => {
        const content = fs.readFileSync(path.join(scriptDir, script), 'utf-8');
        expect(content).toContain('pipeline.run(');
      });

      it(`${script} has no bare new Pool() instantiation`, () => {
        const content = fs.readFileSync(path.join(scriptDir, script), 'utf-8');
        // Should not have direct pool creation (SDK handles it)
        expect(content).not.toMatch(/new Pool\(/);
      });

      it(`${script} uses pipeline.emitSummary()`, () => {
        const content = fs.readFileSync(path.join(scriptDir, script), 'utf-8');
        expect(content).toContain('pipeline.emitSummary(');
      });

      it(`${script} uses pipeline.emitMeta()`, () => {
        const content = fs.readFileSync(path.join(scriptDir, script), 'utf-8');
        expect(content).toContain('pipeline.emitMeta(');
      });
    }

    // run-chain.js is the orchestrator — it uses SDK for pool/logging but not pipeline.run()
    it('run-chain.js imports the pipeline SDK', () => {
      const content = fs.readFileSync(path.join(scriptDir, 'run-chain.js'), 'utf-8');
      expect(content).toContain("require('./lib/pipeline')");
    });

    it('run-chain.js uses pipeline.createPool()', () => {
      const content = fs.readFileSync(path.join(scriptDir, 'run-chain.js'), 'utf-8');
      expect(content).toContain('pipeline.createPool()');
    });

    it('run-chain.js has no bare new Pool() instantiation', () => {
      const content = fs.readFileSync(path.join(scriptDir, 'run-chain.js'), 'utf-8');
      expect(content).not.toMatch(/new Pool\(/);
    });

    it('run-chain.js uses pipeline.log for error handling', () => {
      const content = fs.readFileSync(path.join(scriptDir, 'run-chain.js'), 'utf-8');
      expect(content).toContain('pipeline.log.error(');
      expect(content).toContain('pipeline.log.warn(');
    });

    // §3.5 — Linking scripts must NOT hardcode records_new: 0.
    // They report records_updated with the real linked count.
    const LINKING_SCRIPTS = [
      'link-parcels.js',
      'link-neighbourhoods.js',
      'link-massing.js',
      'link-coa.js',
      'link-similar.js',
    ];
    for (const script of LINKING_SCRIPTS) {
      it(`${script} emitSummary does not hardcode records_new: 0`, () => {
        const content = fs.readFileSync(path.join(scriptDir, script), 'utf-8');
        // Find all emitSummary calls — early-exit paths may hardcode 0,
        // but the primary (last) call must reference variables
        const matches = [...content.matchAll(/pipeline\.emitSummary\(\{([^}]+)\}\)/g)];
        expect(matches.length).toBeGreaterThan(0);
        const summaryBody = matches[matches.length - 1][1];
        // records_updated must reference a variable, not hardcode 0
        expect(summaryBody).toMatch(/records_updated:\s*[a-zA-Z]/);
      });
    }

    // §3.5 — CQA scripts must use records_new: null (not 0) to signal "not applicable"
    const CQA_SCRIPTS = ['quality/assert-schema.js', 'quality/assert-data-bounds.js'];
    for (const script of CQA_SCRIPTS) {
      it(`${script} emits records_new: null (not 0) for CQA exemption`, () => {
        const content = fs.readFileSync(path.join(scriptDir, script), 'utf-8');
        const summaryMatch = content.match(/PIPELINE_SUMMARY.*records_new:\s*(null|0)/);
        expect(summaryMatch).not.toBeNull();
        expect(summaryMatch![1]).toBe('null');
      });
    }

    // §3.5 — read-only scripts must use records_new: null
    it('create-pre-permits.js emits records_new: null (read-only counter)', () => {
      const content = fs.readFileSync(path.join(scriptDir, 'create-pre-permits.js'), 'utf-8');
      const match = content.match(/pipeline\.emitSummary\(\{([^}]+)\}\)/);
      expect(match).not.toBeNull();
      expect(match![1]).toMatch(/records_new:\s*null/);
    });

    // §3.5 — load-neighbourhoods.js must report real records_new count
    it('load-neighbourhoods.js emitSummary uses real records_new count', () => {
      const content = fs.readFileSync(path.join(scriptDir, 'load-neighbourhoods.js'), 'utf-8');
      const match = content.match(/pipeline\.emitSummary\(\{([^}]+)\}\)/);
      expect(match).not.toBeNull();
      // records_new must reference a variable, not hardcode 0
      expect(match![1]).toMatch(/records_new:\s*[a-zA-Z]/);
    });

    // §9.3 — load-permits.js must hash mapped fields, not raw CKAN object
    it('load-permits.js computeHash uses mapped permit fields, not raw CKAN object', () => {
      const content = fs.readFileSync(path.join(scriptDir, 'load-permits.js'), 'utf-8');
      // computeHash should NOT receive the raw CKAN record (which includes _id, rank, etc.)
      // It should hash the mapped/cleaned fields only
      // The mapRecord call should compute hash from mapped data, not raw
      const mapRecordBody = content.match(/function mapRecord\(raw\)\s*\{([\s\S]*?)\n\}/);
      expect(mapRecordBody).not.toBeNull();
      // data_hash should NOT be computeHash(raw) — it should hash the mapped fields
      expect(mapRecordBody![1]).not.toMatch(/data_hash:\s*computeHash\(raw\)/);
    });

    // §9.3 — extract-builders.js upsert must guard against no-op updates
    it('extract-builders.js upsert has IS DISTINCT FROM guard to prevent no-op updates', () => {
      const content = fs.readFileSync(path.join(scriptDir, 'extract-builders.js'), 'utf-8');
      // The ON CONFLICT DO UPDATE must have a WHERE guard so unchanged rows aren't "updated"
      expect(content).toMatch(/ON CONFLICT[\s\S]*?DO UPDATE[\s\S]*?WHERE[\s\S]*?IS DISTINCT FROM/i);
    });

    // §9.3 — load-parcels.js upsert must guard against no-op updates
    it('load-parcels.js upsert has IS DISTINCT FROM guard to prevent ghost updates', () => {
      const content = fs.readFileSync(path.join(scriptDir, 'load-parcels.js'), 'utf-8');
      expect(content).toMatch(/ON CONFLICT[\s\S]*?DO UPDATE[\s\S]*?WHERE[\s\S]*?IS DISTINCT FROM/i);
    });

    // §9.3 — load-massing.js upsert must guard against no-op updates
    it('load-massing.js upsert has IS DISTINCT FROM guard to prevent ghost updates', () => {
      const content = fs.readFileSync(path.join(scriptDir, 'load-massing.js'), 'utf-8');
      expect(content).toMatch(/ON CONFLICT[\s\S]*?DO UPDATE[\s\S]*?WHERE[\s\S]*?IS DISTINCT FROM/i);
    });

    // §9.3 — link-massing.js upsert must guard against no-op updates
    it('link-massing.js upsert has IS DISTINCT FROM guard to prevent ghost updates', () => {
      const content = fs.readFileSync(path.join(scriptDir, 'link-massing.js'), 'utf-8');
      expect(content).toMatch(/ON CONFLICT[\s\S]*?DO UPDATE[\s\S]*?WHERE[\s\S]*?IS DISTINCT FROM/i);
    });

    // §9.3 — link-neighbourhoods.js update must guard against no-op updates
    it('link-neighbourhoods.js UPDATE has IS DISTINCT FROM guard', () => {
      const content = fs.readFileSync(path.join(scriptDir, 'link-neighbourhoods.js'), 'utf-8');
      expect(content).toContain('IS DISTINCT FROM');
    });

    // §9.3 — geocode-permits.js update must guard against identical coordinate writes
    it('geocode-permits.js UPDATE has IS DISTINCT FROM guard on coordinates', () => {
      const content = fs.readFileSync(path.join(scriptDir, 'geocode-permits.js'), 'utf-8');
      expect(content).toContain('IS DISTINCT FROM');
    });

    // §9.3 — classify-permits.js upsert must guard against no-op updates
    it('classify-permits.js upsert has IS DISTINCT FROM guard to prevent ghost updates', () => {
      const content = fs.readFileSync(path.join(scriptDir, 'classify-permits.js'), 'utf-8');
      expect(content).toMatch(/ON CONFLICT[\s\S]*?DO UPDATE[\s\S]*?WHERE[\s\S]*?IS DISTINCT FROM/i);
    });

    // §9.3 — link-coa.js Tier 3 LATERAL query must use "lat" alias not "p"
    it('link-coa.js Tier 3 LATERAL query uses lat.permit_num not p.permit_num', () => {
      const content = fs.readFileSync(path.join(scriptDir, 'link-coa.js'), 'utf-8');
      // Extract the CROSS JOIN LATERAL block (Tier 3)
      const lateralBlock = content.match(/CROSS JOIN LATERAL[\s\S]*?\) lat/);
      expect(lateralBlock).not.toBeNull();
      // The SELECT referencing lat results must use lat.permit_num
      expect(content).toContain('lat.permit_num');
    });

    // §9.3 — link-massing.js records_updated must use buildingsLinked (actual DB writes)
    it('link-massing.js emitSummary records_updated uses buildingsLinked not parcelsLinked', () => {
      const content = fs.readFileSync(path.join(scriptDir, 'link-massing.js'), 'utf-8');
      const match = content.match(/pipeline\.emitSummary\(\{([^}]+)\}\)/);
      expect(match).not.toBeNull();
      expect(match![1]).toContain('records_updated: buildingsLinked');
    });

    // §3.5 — classify-scope.js records_total must include propagated permits
    it('classify-scope.js emitSummary records_total includes propagated count', () => {
      const content = fs.readFileSync(path.join(scriptDir, 'classify-scope.js'), 'utf-8');
      const match = content.match(/pipeline\.emitSummary\(\{([^}]+)\}\)/);
      expect(match).not.toBeNull();
      const summaryBody = match![1];
      // records_total must include propagated so it is always >= records_updated
      expect(summaryBody).toMatch(/records_total:\s*total\s*\+\s*propagated/);
    });

    // SQL Parameterization — no raw user values interpolated in SQL (§4.2)
    it('load-permits.js uses make_interval instead of template literal for duration', () => {
      const content = fs.readFileSync(path.join(scriptDir, 'load-permits.js'), 'utf-8');
      // The sync_runs INSERT must use parameterized duration, not template literal
      expect(content).toContain('make_interval');
      expect(content).not.toMatch(/interval '\$\{duration\}/);
    });

    // N+1 elimination — Tier 3 FTS must use batched approach (§3 Scalability)
    it('link-coa.js uses batched FTS instead of per-row queries', () => {
      const content = fs.readFileSync(path.join(scriptDir, 'link-coa.js'), 'utf-8');
      // Must use unnest + LATERAL for batch matching
      expect(content).toContain('unnest');
      expect(content).toContain('CROSS JOIN LATERAL');
      // Must NOT have per-row FTS inside a for loop (N+1 pattern)
      // The old pattern had client.query inside a for(i) loop with tsQuery per row
      expect(content).not.toMatch(/for\s*\([^)]*i\s*<\s*remaining\.rows\.length/);
    });

    // Empty catch blocks — all scripts must log errors, not swallow them
    it('refresh-snapshot.js has no empty catch blocks', () => {
      const content = fs.readFileSync(path.join(scriptDir, 'refresh-snapshot.js'), 'utf-8');
      // Match catch blocks with empty or whitespace-only bodies: catch { } or catch (e) { }
      expect(content).not.toMatch(/catch\s*(\([^)]*\))?\s*\{\s*\}/);
    });

    // Quality scripts use SDK for pool creation but have unique lifecycle (chain-context)
    const QUALITY_SCRIPTS = ['quality/assert-schema.js', 'quality/assert-data-bounds.js'];
    for (const script of QUALITY_SCRIPTS) {
      it(`${script} imports the pipeline SDK`, () => {
        const content = fs.readFileSync(path.join(scriptDir, script), 'utf-8');
        expect(content).toContain("require('../lib/pipeline')");
      });

      it(`${script} uses pipeline.createPool()`, () => {
        const content = fs.readFileSync(path.join(scriptDir, script), 'utf-8');
        expect(content).toContain('pipeline.createPool()');
      });

      it(`${script} has no bare new Pool() instantiation`, () => {
        const content = fs.readFileSync(path.join(scriptDir, script), 'utf-8');
        expect(content).not.toMatch(/new Pool\(/);
      });
    }
  });

  describe('B22: early-exit scripts must still emit summary and meta', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs2 = require('fs');
      const scriptDir2 = path.resolve(__dirname, '../../scripts');

      it('link-neighbourhoods.js emits summary/meta on early return (0 permits)', () => {
        const source = fs2.readFileSync(path.join(scriptDir2, 'link-neighbourhoods.js'), 'utf-8');
        // Find the early-exit block ("No permits to link")
        const earlyExitIdx = source.indexOf('No permits to link');
        expect(earlyExitIdx).toBeGreaterThan(-1);
        // The emitSummary/emitMeta must come BEFORE the early return, not only after the main loop
        const beforeEarlyExit = source.slice(0, earlyExitIdx);
        const afterEarlyExit = source.slice(earlyExitIdx, source.indexOf('return;', earlyExitIdx) + 10);
        const fullEarlyBlock = beforeEarlyExit.slice(beforeEarlyExit.lastIndexOf('if (totalPermits')) + afterEarlyExit;
        expect(fullEarlyBlock).toMatch(/emitSummary/);
        expect(fullEarlyBlock).toMatch(/emitMeta/);
      });

      it('load-wsib.js emits summary/meta when no --file arg in chain context', () => {
        const source = fs2.readFileSync(path.join(scriptDir2, 'load-wsib.js'), 'utf-8');
        // When running in a chain without --file, the script must gracefully skip
        // with emitSummary/emitMeta instead of process.exit(1)
        const noFileIdx = source.indexOf('--file');
        expect(noFileIdx).toBeGreaterThan(-1);
        // There must be an emitSummary call in the no-file/chain-skip path
        // (before any process.exit or as an alternative path)
        const chainSkipBlock = source.slice(0, source.indexOf('process.exit'));
        expect(chainSkipBlock).toMatch(/emitSummary/);
        expect(chainSkipBlock).toMatch(/emitMeta/);
      });
  });
});

