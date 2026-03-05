/**
 * SPEC LINK: docs/specs/36_web_search_enrichment.md
 *
 * Infrastructure tests for web search enrichment: script existence, pipeline
 * registration, environment config, and CQA integration.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Web Search Enrichment Infrastructure', () => {
  describe('Enrichment Script', () => {
    const scriptPath = path.resolve(__dirname, '../../scripts/enrich-web-search.js');

    it('enrich-web-search.js exists', () => {
      expect(fs.existsSync(scriptPath)).toBe(true);
    });

    it('uses SERPER_API_KEY environment variable', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('SERPER_API_KEY');
    });

    it('does NOT hardcode any API key', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      // Should only reference env var, never contain a raw key
      expect(content).not.toMatch(/['"][0-9a-f]{30,}['"]/);
    });

    it('supports --limit flag', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('--limit');
    });

    it('supports --dry-run flag', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('--dry-run');
    });

    it('supports PIPELINE_CHAIN env var', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('PIPELINE_CHAIN');
    });

    it('calls Serper API at google.serper.dev', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('google.serper.dev');
    });

    it('uses COALESCE to preserve existing data', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('COALESCE');
    });
  });

  describe('Pipeline Registration', () => {
    const routePath = path.resolve(__dirname, '../app/api/admin/pipelines/[slug]/route.ts');

    it('route.ts contains enrich_web_search pipeline slug', () => {
      const content = fs.readFileSync(routePath, 'utf-8');
      expect(content).toContain('enrich_web_search');
    });

    it('route.ts maps to scripts/enrich-web-search.js', () => {
      const content = fs.readFileSync(routePath, 'utf-8');
      expect(content).toContain("enrich_web_search: 'scripts/enrich-web-search.js'");
    });
  });

  describe('Chain Orchestrator', () => {
    const chainPath = path.resolve(__dirname, '../../scripts/run-chain.js');

    it('run-chain.js contains enrich_web_search in PIPELINE_SCRIPTS', () => {
      const content = fs.readFileSync(chainPath, 'utf-8');
      expect(content).toContain('enrich_web_search');
    });
  });

  describe('FreshnessTimeline', () => {
    const timelinePath = path.resolve(__dirname, '../components/FreshnessTimeline.tsx');

    it('registry contains enrich_web_search', () => {
      const content = fs.readFileSync(timelinePath, 'utf-8');
      expect(content).toContain('enrich_web_search');
    });
  });

  describe('Environment Config', () => {
    const envExamplePath = path.resolve(__dirname, '../../.env.example');

    it('.env.example contains SERPER_API_KEY', () => {
      const content = fs.readFileSync(envExamplePath, 'utf-8');
      expect(content).toContain('SERPER_API_KEY');
    });
  });

  describe('Extract Contacts Module', () => {
    const modulePath = path.resolve(__dirname, '../lib/builders/extract-contacts.ts');

    it('extract-contacts.ts exists', () => {
      expect(fs.existsSync(modulePath)).toBe(true);
    });

    it('exports extractContacts function', () => {
      const content = fs.readFileSync(modulePath, 'utf-8');
      expect(content).toContain('export function extractContacts');
    });

    it('exports buildSearchQuery function', () => {
      const content = fs.readFileSync(modulePath, 'utf-8');
      expect(content).toContain('export function buildSearchQuery');
    });
  });
});
