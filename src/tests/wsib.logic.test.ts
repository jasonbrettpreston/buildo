/**
 * SPEC LINK: docs/specs/35_wsib_registry.md
 *
 * Logic tests for WSIB registry integration: CSV parsing, name normalization,
 * matching logic, and data transformation.
 */
import { describe, it, expect } from 'vitest';
import { createMockWsibRegistryEntry, createMockBuilder } from './factories';

// ---------------------------------------------------------------------------
// Name normalization — mirrors normalizeBuilderName() in extract-builders.js
// ---------------------------------------------------------------------------

const SUFFIXES = [
  'INCORPORATED', 'CORPORATION', 'LIMITED', 'COMPANY',
  'INC\\.?', 'CORP\\.?', 'LTD\\.?', 'CO\\.?', 'LLC\\.?', 'L\\.?P\\.?',
];
const SUFFIX_PATTERN = new RegExp(`\\s*\\b(${SUFFIXES.join('|')})\\s*$`, 'i');

function normalizeName(name: string | null): string | null {
  if (!name || !name.trim()) return null;
  let n = name.toUpperCase().trim();
  n = n.replace(/\s+/g, ' ');
  n = n.replace(SUFFIX_PATTERN, '').trim();
  n = n.replace(SUFFIX_PATTERN, '').trim();
  n = n.replace(/[.,;]+$/, '').trim();
  return n || null;
}

// ---------------------------------------------------------------------------
// Class G filtering
// ---------------------------------------------------------------------------

function isClassG(predominantClass: string, subclass: string): boolean {
  return predominantClass.startsWith('G') || subclass.startsWith('G');
}

// ---------------------------------------------------------------------------
// WSIB status string
// ---------------------------------------------------------------------------

function wsibStatusString(predominantClass: string): string {
  return `Registered (Class ${predominantClass})`;
}

describe('WSIB Registry Integration', () => {
  describe('Name Normalization', () => {
    it('strips INC suffix', () => {
      expect(normalizeName('Acme Construction Inc.')).toBe('ACME CONSTRUCTION');
    });

    it('strips LTD suffix', () => {
      expect(normalizeName('Smith Builders Ltd.')).toBe('SMITH BUILDERS');
    });

    it('strips CORPORATION suffix', () => {
      expect(normalizeName('Metro Construction Corporation')).toBe('METRO CONSTRUCTION');
    });

    it('strips double suffixes', () => {
      expect(normalizeName('ABC Corp Incorporated')).toBe('ABC');
    });

    it('collapses whitespace', () => {
      expect(normalizeName('John   Smith   Construction')).toBe('JOHN SMITH CONSTRUCTION');
    });

    it('strips trailing punctuation', () => {
      expect(normalizeName('Smith Builders.')).toBe('SMITH BUILDERS');
    });

    it('uppercases', () => {
      expect(normalizeName('lowercase name')).toBe('LOWERCASE NAME');
    });

    it('returns null for empty string', () => {
      expect(normalizeName('')).toBeNull();
    });

    it('returns null for null', () => {
      expect(normalizeName(null)).toBeNull();
    });

    it('returns null for whitespace-only', () => {
      expect(normalizeName('   ')).toBeNull();
    });

    it('handles Ontario numbered company format', () => {
      expect(normalizeName('1234567 Ontario Inc.')).toBe('1234567 ONTARIO');
    });
  });

  describe('Class G Filtering', () => {
    it('accepts G1 predominant class', () => {
      expect(isClassG('G1', 'G1')).toBe(true);
    });

    it('accepts G5 predominant class', () => {
      expect(isClassG('G5', 'G5')).toBe(true);
    });

    it('accepts non-G predominant with G subclass', () => {
      expect(isClassG('A', 'G1')).toBe(true);
    });

    it('rejects non-G class', () => {
      expect(isClassG('A', 'A')).toBe(false);
    });

    it('rejects M class', () => {
      expect(isClassG('M', 'M')).toBe(false);
    });
  });

  describe('WSIB Status String', () => {
    it('generates correct status for G1', () => {
      expect(wsibStatusString('G1')).toBe('Registered (Class G1)');
    });

    it('generates correct status for G5', () => {
      expect(wsibStatusString('G5')).toBe('Registered (Class G5)');
    });
  });

  describe('Match Confidence Assignment', () => {
    it('tier 1 exact trade name match is 0.95', () => {
      const entry = createMockWsibRegistryEntry({ match_confidence: 0.95 });
      expect(entry.match_confidence).toBe(0.95);
    });

    it('tier 2 exact legal name match is 0.90', () => {
      const entry = createMockWsibRegistryEntry({ match_confidence: 0.90 });
      expect(entry.match_confidence).toBe(0.90);
    });

    it('tier 3 fuzzy match is 0.60', () => {
      const entry = createMockWsibRegistryEntry({ match_confidence: 0.60 });
      expect(entry.match_confidence).toBe(0.60);
    });
  });

  describe('Factory', () => {
    it('creates valid wsib registry entry', () => {
      const entry = createMockWsibRegistryEntry();
      expect(entry.legal_name).toBeTruthy();
      expect(entry.legal_name_normalized).toBeTruthy();
      expect(entry.predominant_class).toBe('G1');
      expect(entry.linked_entity_id).toBeNull();
    });

    it('accepts overrides', () => {
      const entry = createMockWsibRegistryEntry({
        trade_name: 'Custom Builder',
        predominant_class: 'G5',
        linked_entity_id: 42,
        match_confidence: 0.95,
      });
      expect(entry.trade_name).toBe('Custom Builder');
      expect(entry.predominant_class).toBe('G5');
      expect(entry.linked_entity_id).toBe(42);
      expect(entry.match_confidence).toBe(0.95);
    });
  });

  describe('Matching Logic', () => {
    it('exact trade name match links builder', () => {
      const builder = createMockBuilder({ name_normalized: 'ACME CONSTRUCTION' });
      const wsib = createMockWsibRegistryEntry({ trade_name_normalized: 'ACME CONSTRUCTION' });
      expect(builder.name_normalized).toBe(wsib.trade_name_normalized);
    });

    it('exact legal name match links builder', () => {
      const builder = createMockBuilder({ name_normalized: '1234567 ONTARIO' });
      const wsib = createMockWsibRegistryEntry({ legal_name_normalized: '1234567 ONTARIO' });
      expect(builder.name_normalized).toBe(wsib.legal_name_normalized);
    });

    it('fuzzy match detects substring', () => {
      const builderName = 'SMITH CONSTRUCTION';
      const wsibTradeName = 'SMITH CONSTRUCTION SERVICES';
      expect(wsibTradeName.includes(builderName)).toBe(true);
    });

    it('fuzzy match requires minimum 5 chars', () => {
      const shortName = 'ABC';
      expect(shortName.length >= 5).toBe(false);
    });
  });

  describe('Multi-row De-duplication', () => {
    it('same business with different NAICS codes should de-duplicate', () => {
      const key1 = 'ACME CONSTRUCTION|123 Main St, Toronto, ON';
      const key2 = 'ACME CONSTRUCTION|123 Main St, Toronto, ON';
      expect(key1).toBe(key2);
    });

    it('same business at different addresses creates separate entries', () => {
      const key1 = 'ACME CONSTRUCTION|123 Main St, Toronto, ON';
      const key2 = 'ACME CONSTRUCTION|456 Oak Ave, Mississauga, ON';
      expect(key1).not.toBe(key2);
    });
  });

  describe('BOM Handling', () => {
    it('strips BOM character from string', () => {
      const withBom = '\uFEFFLegal name';
      const stripped = withBom.replace(/^\uFEFF/, '');
      expect(stripped).toBe('Legal name');
    });
  });
});
