/**
 * Classification Sync Gate — enforces §7.1 dual-code-path invariant.
 *
 * Verifies that the TAG_ALIASES and TAG_TRADE_MATRIX in the batch script
 * (scripts/classify-permits.js) stay in sync with the TypeScript API
 * (src/lib/classification/tag-trade-matrix.ts).
 *
 * If a developer updates one but not the other, this test blocks the commit.
 *
 * SPEC LINK: docs/specs/00-architecture/00_engineering_standards.md §7.1
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { TAG_TRADE_MATRIX as TS_MATRIX } from '@/lib/classification/tag-trade-matrix';

// ---------------------------------------------------------------------------
// Parse the JS script's TAG_ALIASES and TAG_TRADE_MATRIX from source
// ---------------------------------------------------------------------------

const SCRIPT_PATH = path.resolve(__dirname, '../../scripts/classify-permits.js');
const scriptSource = fs.readFileSync(SCRIPT_PATH, 'utf-8');

/**
 * Extract TAG_ALIASES object from the JS script source.
 * Returns a Map<string, string>.
 */
function extractJsAliases(): Map<string, string> {
  const match = scriptSource.match(/const TAG_ALIASES\s*=\s*\{([^}]+)\}/);
  if (!match) throw new Error('Could not find TAG_ALIASES in classify-permits.js');
  const aliases = new Map<string, string>();
  const entries = match[1]!.matchAll(/'([^']+)':\s*'([^']+)'/g);
  for (const [, key, value] of entries) {
    aliases.set(key!, value!);
  }
  return aliases;
}

/**
 * Extract TAG_TRADE_MATRIX keys from the JS script source.
 * Returns the set of tag keys (e.g., 'kitchen', 'bathroom', etc.).
 */
function extractJsMatrixKeys(): Set<string> {
  const match = scriptSource.match(/const TAG_TRADE_MATRIX\s*=\s*\{([\s\S]*?)\n\};\s*\n/);
  if (!match) throw new Error('Could not find TAG_TRADE_MATRIX in classify-permits.js');
  const keys = new Set<string>();
  const entries = match[1]!.matchAll(/^\s+'?([a-z_-]+[a-z0-9_-]*)'?:\s*\[/gm);
  for (const [, key] of entries) {
    keys.add(key!);
  }
  return keys;
}

/**
 * Extract trade slugs for a given tag key from the JS script's TAG_TRADE_MATRIX.
 * Returns array of [slug, confidence] tuples.
 */
function extractJsTradesForKey(tagKey: string): [string, number][] {
  // Find the line for this key and extract the array
  const escapedKey = tagKey.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
  const pattern = new RegExp(`'?${escapedKey}'?:\\s*\\[(.+?)\\]`, 's');
  const match = scriptSource.match(pattern);
  if (!match) return [];
  const trades: [string, number][] = [];
  const tradeEntries = match[1]!.matchAll(/\['([a-z-]+)',\s*([\d.]+)\]/g);
  for (const [, slug, conf] of tradeEntries) {
    trades.push([slug!, parseFloat(conf!)]);
  }
  return trades;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Classification Sync Gate (§7.1)', () => {
  const jsAliases = extractJsAliases();
  const jsMatrixKeys = extractJsMatrixKeys();
  const tsMatrixKeys = new Set(Object.keys(TS_MATRIX));

  // -----------------------------------------------------------------------
  // TAG_ALIASES sync
  // -----------------------------------------------------------------------
  describe('TAG_ALIASES sync', () => {
    it('JS script has TAG_ALIASES defined', () => {
      expect(jsAliases.size).toBeGreaterThan(0);
    });

    it('all JS aliases exist in TS aliases with same target', () => {
      // Read the TS TAG_ALIASES from source (not exported, but we can verify via normalizeTag behavior)
      const tsAliasSource = fs.readFileSync(
        path.resolve(__dirname, '../lib/classification/tag-trade-matrix.ts'),
        'utf-8'
      );
      for (const [key, value] of jsAliases) {
        // Check the TS source contains the same alias mapping
        expect(tsAliasSource, `TS missing alias: '${key}' -> '${value}'`).toContain(`'${key}'`);
        expect(tsAliasSource, `TS alias '${key}' has different target`).toContain(`'${value}'`);
      }
    });
  });

  // -----------------------------------------------------------------------
  // TAG_TRADE_MATRIX key sync
  // -----------------------------------------------------------------------
  describe('TAG_TRADE_MATRIX key sync', () => {
    it('JS script has TAG_TRADE_MATRIX defined', () => {
      expect(jsMatrixKeys.size).toBeGreaterThan(0);
    });

    it('every JS matrix key exists in TS matrix', () => {
      const missingInTs: string[] = [];
      for (const key of jsMatrixKeys) {
        if (!tsMatrixKeys.has(key)) missingInTs.push(key);
      }
      expect(missingInTs, `JS has keys not in TS: ${missingInTs.join(', ')}`).toHaveLength(0);
    });

    it('every TS matrix key exists in JS matrix', () => {
      const missingInJs: string[] = [];
      for (const key of tsMatrixKeys) {
        if (!jsMatrixKeys.has(key)) missingInJs.push(key);
      }
      expect(missingInJs, `TS has keys not in JS: ${missingInJs.join(', ')}`).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Per-tag trade output sync
  // -----------------------------------------------------------------------
  describe('trade assignments match per tag', () => {
    // For each key in BOTH matrices, verify the JS script's trades are a
    // subset of the TS trades (JS may omit low-confidence extras).
    // And verify that shared trades have the SAME confidence.
    const sharedKeys = [...jsMatrixKeys].filter((k) => tsMatrixKeys.has(k));

    for (const key of sharedKeys) {
      it(`"${key}" — JS trades are subset of TS trades with matching confidence`, () => {
        const jsTrades = extractJsTradesForKey(key);
        const tsEntries = TS_MATRIX[key] || [];
        const tsTradeMap = new Map(tsEntries.map((e) => [e.tradeSlug, e.confidence]));

        for (const [slug, conf] of jsTrades) {
          expect(
            tsTradeMap.has(slug),
            `JS has trade "${slug}" for tag "${key}" but TS does not`
          ).toBe(true);
          expect(
            tsTradeMap.get(slug),
            `Confidence mismatch for "${key}" -> "${slug}": JS=${conf}, TS=${tsTradeMap.get(slug)}`
          ).toBe(conf);
        }
      });
    }
  });

  // -----------------------------------------------------------------------
  // NARROW_SCOPE_CODES sync
  // -----------------------------------------------------------------------
  describe('NARROW_SCOPE_CODES sync', () => {
    it('JS script has NARROW_SCOPE_CODES defined', () => {
      expect(scriptSource).toContain('NARROW_SCOPE_CODES');
    });

    it('JS NARROW_SCOPE_CODES keys match TS classifier', () => {
      // Extract keys from JS
      const jsNarrowMatch = scriptSource.match(
        /const NARROW_SCOPE_CODES\s*=\s*\{([\s\S]*?)\n\};\s*\n/
      );
      expect(jsNarrowMatch).not.toBeNull();
      const jsNarrowKeys = new Set<string>();
      const keyEntries = jsNarrowMatch![1]!.matchAll(/'([A-Z]{2,4})':/g);
      for (const [, key] of keyEntries) jsNarrowKeys.add(key!);

      // Read TS classifier
      const classifierSource = fs.readFileSync(
        path.resolve(__dirname, '../lib/classification/classifier.ts'),
        'utf-8'
      );
      const tsNarrowMatch = classifierSource.match(
        /NARROW_SCOPE_CODES[\s\S]*?\{([\s\S]*?)\n\s*\}/
      );
      expect(tsNarrowMatch).not.toBeNull();
      const tsNarrowKeys = new Set<string>();
      const tsKeyEntries = tsNarrowMatch![1]!.matchAll(/'([A-Z]{2,4})':/g);
      for (const [, key] of tsKeyEntries) tsNarrowKeys.add(key!);

      // Every JS key should be in TS and vice versa
      for (const key of jsNarrowKeys) {
        expect(tsNarrowKeys, `JS has NARROW_SCOPE_CODE "${key}" not in TS`).toContain(key);
      }
      for (const key of tsNarrowKeys) {
        expect(jsNarrowKeys, `TS has NARROW_SCOPE_CODE "${key}" not in JS`).toContain(key);
      }
    });
  });
});
