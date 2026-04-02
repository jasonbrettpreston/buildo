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
  // progress — with velocity tracking (B19)
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

    it('handles zero total gracefully and shows 0 rows/s', () => {
      pipeline.progress('test', 0, 0, Date.now());
      const output = logSpy.mock.calls[0][0] as string;
      expect(output).toContain('0.0%');
      expect(output).toContain('0 rows/s');
    });

    it('includes velocity (rows/s) in progress output (B19)', () => {
      const start = Date.now() - 10000; // 10 seconds ago
      pipeline.progress('test', 5000, 10000, start);
      const output = logSpy.mock.calls[0][0] as string;
      expect(output).toMatch(/rows\/s/);
      // 5000 rows in 10 seconds = ~500 rows/s
      expect(output).toMatch(/\d+ rows\/s/);
    });
  });

  // -----------------------------------------------------------------------
  // streamQuery — async generator for large result sets (B4)
  // -----------------------------------------------------------------------
  describe('streamQuery()', () => {
    it('is exported as a function', () => {
      expect(typeof pipeline.streamQuery).toBe('function');
    });

    it('is an async generator function', () => {
      // AsyncGeneratorFunction constructor name check
      expect(pipeline.streamQuery.constructor.name).toBe('AsyncGeneratorFunction');
    });

    it('destroys stream and releases client in finally block (source check)', () => {
      // Verify the implementation has the cursor-leak fix
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const nodeFs = require('fs');
      const source = nodeFs.readFileSync(path.resolve(__dirname, '../../scripts/lib/pipeline.js'), 'utf-8');
      const fnBlock = source.slice(
        source.indexOf('async function* streamQuery'),
        source.indexOf('// Exports') > 0 ? source.indexOf('// Exports') : source.length
      );
      // Must destroy the stream before releasing client
      expect(fnBlock).toContain('stream.destroy()');
      expect(fnBlock).toContain('client.release()');
      // destroy must come before release in the finally block
      const destroyIdx = fnBlock.indexOf('stream.destroy()');
      const releaseIdx = fnBlock.indexOf('client.release()');
      expect(destroyIdx).toBeLessThan(releaseIdx);
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
  // withTransaction
  // -----------------------------------------------------------------------
  describe('withTransaction', () => {
    it('wraps callback in BEGIN/COMMIT and releases client', async () => {
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
        // Linking scripts must reference a variable for records_updated, not hardcode 0
        // Check content directly — nested records_meta breaks single-line regex
        expect(content).toMatch(/records_updated:\s*[a-zA-Z]/);
      });
    }

    // §3.5 — CQA scripts must use records_new: null (not 0) to signal "not applicable"
    const CQA_SCRIPTS = ['quality/assert-schema.js', 'quality/assert-data-bounds.js'];
    for (const script of CQA_SCRIPTS) {
      it(`${script} emits records_new: null (not 0) for CQA exemption`, () => {
        const content = fs.readFileSync(path.join(scriptDir, script), 'utf-8');
        // Match both raw PIPELINE_SUMMARY and pipeline.emitSummary() calls
        const summaryMatch = content.match(/(?:PIPELINE_SUMMARY|emitSummary\().*records_new:\s*(null|0)/);
        expect(summaryMatch).not.toBeNull();
        expect(summaryMatch![1]).toBe('null');
      });
    }

    // §3.5 — read-only scripts must use records_new: null
    it('create-pre-permits.js emits records_new: inserted (generates Pre-Permits)', () => {
      const content = fs.readFileSync(path.join(scriptDir, 'create-pre-permits.js'), 'utf-8');
      // Script now INSERTs Pre-Permit rows — records_new tracks actual inserts
      expect(content).toMatch(/records_new:\s*inserted/);
    });

    // §3.5 — load-neighbourhoods.js must report real records_new count
    it('load-neighbourhoods.js emitSummary uses real records_new count', () => {
      const content = fs.readFileSync(path.join(scriptDir, 'load-neighbourhoods.js'), 'utf-8');
      // Check content directly — nested records_meta breaks single-line regex
      expect(content).toMatch(/records_new:\s*boundaryCount/);
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

    // §9.3 — classify-permits.js upsert must always update classified_at (no sticky record bug)
    it('classify-permits.js upsert updates classified_at unconditionally', () => {
      const content = fs.readFileSync(path.join(scriptDir, 'classify-permits.js'), 'utf-8');
      expect(content).toMatch(/ON CONFLICT[\s\S]*?DO UPDATE SET[\s\S]*?classified_at\s*=\s*NOW\(\)/i);
      // Must NOT have WHERE IS DISTINCT FROM guard that prevents classified_at from updating
      const upsertMatch = content.match(
        /ON CONFLICT \(permit_num, revision_num, trade_id\)\s*\n\s*DO UPDATE SET([\s\S]*?)(?:;|`)/
      );
      expect(upsertMatch).not.toBeNull();
      expect(upsertMatch![1]).not.toContain('IS DISTINCT FROM');
    });

    // §9.3 — classify-permits.js records_updated must use dbUpdated (actual DB writes)
    it('classify-permits.js emitSummary records_updated uses dbUpdated not permitsWithTrades', () => {
      const content = fs.readFileSync(path.join(scriptDir, 'classify-permits.js'), 'utf-8');
      // Check content directly — nested records_meta breaks single-line regex
      expect(content).toContain('records_updated: dbUpdated');
    });

    // Bug 1: N+1 ghost cleanup — must use bulk DELETE with unnest, not per-permit loop
    it('classify-permits.js ghost trade cleanup uses bulk unnest DELETE (no N+1)', () => {
      const content = fs.readFileSync(path.join(scriptDir, 'classify-permits.js'), 'utf-8');
      // Extract the ghost cleanup section
      const ghostSection = content.slice(
        content.indexOf('Ghost trade cleanup'),
        content.indexOf('Mark ALL processed')
      );
      // Must NOT have "for (const [key, tradeIds]" pattern that iterates permits with DELETE
      expect(ghostSection).not.toMatch(/for\s*\(\s*const\s*\[key,\s*tradeIds\]/);
      // Must use unnest for bulk deletion
      expect(ghostSection).toMatch(/unnest/);
    });

    // Bug 2: rowCount trap — upsert must use RETURNING + rows.length, not rowCount
    it('classify-permits.js upsert counts mutations via rows.length not rowCount', () => {
      const content = fs.readFileSync(path.join(scriptDir, 'classify-permits.js'), 'utf-8');
      // The INSERT ... ON CONFLICT block must use RETURNING and rows.length
      const upsertSection = content.slice(
        content.indexOf('INSERT INTO permit_trades'),
        content.indexOf('Ghost cleanup')
      );
      expect(upsertSection).toMatch(/RETURNING/);
      expect(upsertSection).not.toMatch(/result\.rowCount/);
    });

    // Bug 3: Hardcoded VACUUM — must not run VACUUM in application code
    it('classify-permits.js does not hardcode VACUUM', () => {
      const content = fs.readFileSync(path.join(scriptDir, 'classify-permits.js'), 'utf-8');
      expect(content).not.toMatch(/VACUUM/i);
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

    // §9.3 — link-massing.js records_updated must use buildingsUpserted (actual DB writes)
    it('link-massing.js emitSummary records_updated uses buildingsUpserted not parcelsLinked', () => {
      const content = fs.readFileSync(path.join(scriptDir, 'link-massing.js'), 'utf-8');
      // emitSummary has records_meta so regex won't match single-line — check content directly
      expect(content).toContain('records_updated: buildingsUpserted');
    });

    // §3.5 — classify-scope.js records_total must include propagated permits
    it('classify-scope.js emitSummary records_total includes propagated count', () => {
      const content = fs.readFileSync(path.join(scriptDir, 'classify-scope.js'), 'utf-8');
      // Check content directly — nested records_meta breaks single-line regex
      expect(content).toMatch(/records_total:\s*total\s*\+\s*propagated/);
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

  // -----------------------------------------------------------------------
  // B1/B3: reclassify-all.js — keyset pagination + SDK migration
  // -----------------------------------------------------------------------
  describe('B1/B3: reclassify-all.js uses keyset pagination and pipeline SDK', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fsB1 = require('fs');
    const reclassifyPath = path.resolve(__dirname, '../../scripts/reclassify-all.js');

    it('does NOT use SQL OFFSET (B1)', () => {
      const content = fsB1.readFileSync(reclassifyPath, 'utf-8');
      // Extract SQL queries (backtick-delimited) and check none use OFFSET
      const sqlBlocks = content.match(/`[^`]+`/g) || [];
      const withOffset = sqlBlocks.filter((b: string) => /\bOFFSET\b/i.test(b));
      expect(withOffset).toHaveLength(0);
    });

    it('uses keyset WHERE pagination (composite tuple cursor)', () => {
      const content = fsB1.readFileSync(reclassifyPath, 'utf-8');
      // Must use (permit_num, revision_num) > ($x, $y) pattern
      expect(content).toMatch(/permit_num.*revision_num.*>\s*\(\$\d/);
    });

    it('uses pipeline.run() for lifecycle management', () => {
      const content = fsB1.readFileSync(reclassifyPath, 'utf-8');
      expect(content).toMatch(/pipeline\.run\(/);
      // Must NOT create its own Pool
      expect(content).not.toMatch(/new pg\.Pool|new Pool\(/);
    });

    it('emits PIPELINE_SUMMARY', () => {
      const content = fsB1.readFileSync(reclassifyPath, 'utf-8');
      expect(content).toMatch(/pipeline\.emitSummary\(/);
    });
  });

  // -----------------------------------------------------------------------
  // B4: Memory overflow migration — scripts must use streaming patterns
  // -----------------------------------------------------------------------
  describe('B4: memory overflow scripts use streaming patterns', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fsB4 = require('fs');
    const scriptDirB4 = path.resolve(__dirname, '../../scripts');

    // link-massing.js: must use streamQuery for building footprints grid build
    it('link-massing.js uses streamQuery for building footprint loading (not pool.query)', () => {
      const content = fsB4.readFileSync(path.join(scriptDirB4, 'link-massing.js'), 'utf-8');
      // The grid build section must use streamQuery, not pool.query for the full table load
      const gridSection = content.slice(
        content.indexOf('building footprints'),
        content.indexOf('Phase 2') > 0 ? content.indexOf('Phase 2') : content.length
      );
      expect(gridSection).toMatch(/streamQuery/);
      // Must NOT load all rows into memory via pool.query for the full footprints table
      expect(gridSection).not.toMatch(/await pool\.query\(\s*\n?\s*`SELECT id, geometry/);
    });

    // enrich-wsib.js: must use streamQuery for enrichment queue
    it('enrich-wsib.js uses streamQuery for enrichment queue (not destructured pool.query)', () => {
      const content = fsB4.readFileSync(path.join(scriptDirB4, 'enrich-wsib.js'), 'utf-8');
      // Must NOT destructure full result set: { rows: entries }
      expect(content).not.toMatch(/\{\s*rows:\s*entries\s*\}\s*=\s*await pool\.query/);
      // Must use streamQuery or cursor-based iteration
      expect(content).toMatch(/streamQuery|for await/);
    });

    // load-wsib.js: dedup Map must flush in batches, not accumulate all rows
    it('load-wsib.js flushes dedup batch periodically (not unbounded accumulation)', () => {
      const content = fsB4.readFileSync(path.join(scriptDirB4, 'load-wsib.js'), 'utf-8');
      // Must have a batch flush inside the parsing section (not just the initial declaration)
      // Look for seen.clear() or a DEDUP_FLUSH_SIZE constant that triggers periodic upsert+clear
      expect(content).toMatch(/seen\.clear\(\)|DEDUP_FLUSH/);
    });
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

