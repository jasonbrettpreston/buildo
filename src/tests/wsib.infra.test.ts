/**
 * SPEC LINK: docs/specs/35_wsib_registry.md
 *
 * Infrastructure tests for WSIB registry: table schema, pipeline registration,
 * and CQA integration.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('WSIB Registry Infrastructure', () => {
  describe('Migration 040 — wsib_registry table', () => {
    const migrationPath = path.resolve(__dirname, '../../migrations/040_wsib_registry.sql');

    it('migration file exists', () => {
      expect(fs.existsSync(migrationPath)).toBe(true);
    });

    it('creates wsib_registry table', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('CREATE TABLE');
      expect(sql).toContain('wsib_registry');
    });

    it('has legal_name column', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('legal_name');
    });

    it('has trade_name column', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('trade_name');
    });

    it('has normalized name columns', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('legal_name_normalized');
      expect(sql).toContain('trade_name_normalized');
    });

    it('has predominant_class column', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('predominant_class');
    });

    it('has linked_builder_id FK', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('linked_builder_id');
      expect(sql).toContain('REFERENCES builders(id)');
    });

    it('has unique constraint on (legal_name_normalized, mailing_address)', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('UNIQUE(legal_name_normalized, mailing_address)');
    });

    it('has indexes for matching performance', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      expect(sql).toContain('idx_wsib_trade_norm');
      expect(sql).toContain('idx_wsib_legal_norm');
      expect(sql).toContain('idx_wsib_class');
    });
  });

  describe('Pipeline Registration', () => {
    const routePath = path.resolve(__dirname, '../app/api/admin/pipelines/[slug]/route.ts');

    it('route.ts contains load_wsib pipeline slug', () => {
      const content = fs.readFileSync(routePath, 'utf-8');
      expect(content).toContain('load_wsib');
    });

    it('route.ts contains link_wsib pipeline slug', () => {
      const content = fs.readFileSync(routePath, 'utf-8');
      expect(content).toContain('link_wsib');
    });

    it('route.ts maps load_wsib to scripts/load-wsib.js', () => {
      const content = fs.readFileSync(routePath, 'utf-8');
      expect(content).toContain("load_wsib: 'scripts/load-wsib.js'");
    });

    it('route.ts maps link_wsib to scripts/link-wsib.js', () => {
      const content = fs.readFileSync(routePath, 'utf-8');
      expect(content).toContain("link_wsib: 'scripts/link-wsib.js'");
    });
  });

  describe('Pipeline Scripts', () => {
    it('load-wsib.js exists', () => {
      const scriptPath = path.resolve(__dirname, '../../scripts/load-wsib.js');
      expect(fs.existsSync(scriptPath)).toBe(true);
    });

    it('link-wsib.js exists', () => {
      const scriptPath = path.resolve(__dirname, '../../scripts/link-wsib.js');
      expect(fs.existsSync(scriptPath)).toBe(true);
    });

    it('load-wsib.js requires --file flag', () => {
      const content = fs.readFileSync(path.resolve(__dirname, '../../scripts/load-wsib.js'), 'utf-8');
      expect(content).toContain('--file');
    });

    it('link-wsib.js supports --dry-run', () => {
      const content = fs.readFileSync(path.resolve(__dirname, '../../scripts/link-wsib.js'), 'utf-8');
      expect(content).toContain('--dry-run');
    });
  });

  describe('Chain Orchestrator', () => {
    const chainPath = path.resolve(__dirname, '../../scripts/run-chain.js');

    it('run-chain.js contains load_wsib in PIPELINE_SCRIPTS', () => {
      const content = fs.readFileSync(chainPath, 'utf-8');
      expect(content).toContain('load_wsib');
    });

    it('run-chain.js contains link_wsib in PIPELINE_SCRIPTS', () => {
      const content = fs.readFileSync(chainPath, 'utf-8');
      expect(content).toContain('link_wsib');
    });
  });

  describe('CQA Integration', () => {
    const boundsPath = path.resolve(__dirname, '../../scripts/quality/assert-data-bounds.js');

    it('assert-data-bounds.js includes wsib_registry checks', () => {
      const content = fs.readFileSync(boundsPath, 'utf-8');
      expect(content).toContain('wsib_registry');
    });

    it('checks for NULL legal_name', () => {
      const content = fs.readFileSync(boundsPath, 'utf-8');
      expect(content).toContain('legal_name');
    });

    it('checks for non-G class entries', () => {
      const content = fs.readFileSync(boundsPath, 'utf-8');
      expect(content).toContain("NOT LIKE 'G%'");
      expect(content).toContain('no G class');
    });

    it('checks for orphaned linked_builder_id', () => {
      const content = fs.readFileSync(boundsPath, 'utf-8');
      expect(content).toContain('orphaned wsib_registry');
    });

    it('checks for non-numeric naics_code', () => {
      const content = fs.readFileSync(boundsPath, 'utf-8');
      expect(content).toContain('non-numeric naics_code');
    });
  });

  describe('Dashboard Integration', () => {
    const dashboardPath = path.resolve(__dirname, '../components/DataQualityDashboard.tsx');

    it('dashboard includes WSIB Registry data source circle', () => {
      const content = fs.readFileSync(dashboardPath, 'utf-8');
      expect(content).toContain('WSIB Registry');
    });

    it('dashboard references wsib_total', () => {
      const content = fs.readFileSync(dashboardPath, 'utf-8');
      expect(content).toContain('wsib_total');
    });

    it('dashboard references wsib_linked', () => {
      const content = fs.readFileSync(dashboardPath, 'utf-8');
      expect(content).toContain('wsib_linked');
    });

    it('dashboard references wsib_lead_pool', () => {
      const content = fs.readFileSync(dashboardPath, 'utf-8');
      expect(content).toContain('wsib_lead_pool');
    });

    it('dashboard references wsib_with_trade', () => {
      const content = fs.readFileSync(dashboardPath, 'utf-8');
      expect(content).toContain('wsib_with_trade');
    });
  });

  describe('FreshnessTimeline Integration', () => {
    const timelinePath = path.resolve(__dirname, '../components/FreshnessTimeline.tsx');

    it('registry contains load_wsib', () => {
      const content = fs.readFileSync(timelinePath, 'utf-8');
      expect(content).toContain('load_wsib');
    });

    it('registry contains link_wsib', () => {
      const content = fs.readFileSync(timelinePath, 'utf-8');
      expect(content).toContain('link_wsib');
    });
  });

  describe('Stats API', () => {
    const statsPath = path.resolve(__dirname, '../app/api/admin/stats/route.ts');

    it('stats API queries wsib_registry', () => {
      const content = fs.readFileSync(statsPath, 'utf-8');
      expect(content).toContain('wsib_registry');
    });

    it('stats API returns wsib_total', () => {
      const content = fs.readFileSync(statsPath, 'utf-8');
      expect(content).toContain('wsib_total');
    });

    it('stats API returns wsib_linked', () => {
      const content = fs.readFileSync(statsPath, 'utf-8');
      expect(content).toContain('wsib_linked');
    });

    it('stats API returns wsib_lead_pool', () => {
      const content = fs.readFileSync(statsPath, 'utf-8');
      expect(content).toContain('wsib_lead_pool');
    });

    it('stats API returns wsib_with_trade', () => {
      const content = fs.readFileSync(statsPath, 'utf-8');
      expect(content).toContain('wsib_with_trade');
    });
  });
});
