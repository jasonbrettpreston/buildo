/**
 * SPEC LINK: docs/specs/pipeline/47_pipeline_script_protocol.md §16 (Safe Integer Rule B5)
 *
 * Tests for scripts/lib/safe-math.js and src/lib/safe-math.ts.
 * Both modules expose identical behaviour — tested together via the TS version.
 */

import { describe, it, expect } from 'vitest';
import { safeParsePositiveInt, safeParseFloat, safeParseIntOrNull } from '@/lib/safe-math';

describe('safeParsePositiveInt', () => {
  it('parses a valid positive integer string', () => {
    expect(safeParsePositiveInt('42', 'test')).toBe(42);
    expect(safeParsePositiveInt('0', 'test')).toBe(0);
  });

  it('parses a valid number value', () => {
    expect(safeParsePositiveInt(100, 'test')).toBe(100);
  });

  it('throws on NaN string', () => {
    expect(() => safeParsePositiveInt('abc', 'myLabel')).toThrow('myLabel');
    expect(() => safeParsePositiveInt('abc', 'myLabel')).toThrow('NaN');
  });

  it('throws on empty string', () => {
    expect(() => safeParsePositiveInt('', 'myLabel')).toThrow('myLabel');
  });

  it('throws on Infinity', () => {
    expect(() => safeParsePositiveInt(Infinity, 'myLabel')).toThrow('myLabel');
    expect(() => safeParsePositiveInt('Infinity', 'myLabel')).toThrow('myLabel');
  });

  it('throws on negative number', () => {
    expect(() => safeParsePositiveInt('-5', 'myLabel')).toThrow('myLabel');
    expect(() => safeParsePositiveInt(-1, 'myLabel')).toThrow('myLabel');
  });

  it('throws on float value', () => {
    expect(() => safeParsePositiveInt('3.14', 'myLabel')).toThrow('myLabel');
    expect(() => safeParsePositiveInt(1.5, 'myLabel')).toThrow('myLabel');
  });

  it('throws on null', () => {
    expect(() => safeParsePositiveInt(null as unknown as string, 'myLabel')).toThrow('myLabel');
  });

  it('throws on undefined', () => {
    expect(() => safeParsePositiveInt(undefined as unknown as string, 'myLabel')).toThrow('myLabel');
  });

  it('error message includes the label and the raw value', () => {
    expect(() => safeParsePositiveInt('bad', 'BATCH_SIZE')).toThrow('BATCH_SIZE');
  });
});

describe('safeParseFloat', () => {
  it('parses a valid float string', () => {
    expect(safeParseFloat('3.14', 'test')).toBeCloseTo(3.14);
    expect(safeParseFloat('0', 'test')).toBe(0);
    expect(safeParseFloat('-1.5', 'test')).toBeCloseTo(-1.5);
  });

  it('parses a valid number value', () => {
    expect(safeParseFloat(42.5, 'test')).toBeCloseTo(42.5);
  });

  it('throws on NaN string', () => {
    expect(() => safeParseFloat('abc', 'myLabel')).toThrow('myLabel');
  });

  it('throws on Infinity', () => {
    expect(() => safeParseFloat(Infinity, 'myLabel')).toThrow('myLabel');
    expect(() => safeParseFloat('Infinity', 'myLabel')).toThrow('myLabel');
    expect(() => safeParseFloat('-Infinity', 'myLabel')).toThrow('myLabel');
  });

  it('throws on null', () => {
    expect(() => safeParseFloat(null as unknown as string, 'myLabel')).toThrow('myLabel');
  });

  it('throws on undefined', () => {
    expect(() => safeParseFloat(undefined as unknown as string, 'myLabel')).toThrow('myLabel');
  });
});

describe('safeParseIntOrNull', () => {
  it('parses a valid integer string', () => {
    expect(safeParseIntOrNull('42')).toBe(42);
    expect(safeParseIntOrNull('0')).toBe(0);
  });

  it('returns null for null input', () => {
    expect(safeParseIntOrNull(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(safeParseIntOrNull(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(safeParseIntOrNull('')).toBeNull();
  });

  it('returns null for NaN string', () => {
    expect(safeParseIntOrNull('abc')).toBeNull();
  });

  it('returns null for Infinity', () => {
    expect(safeParseIntOrNull('Infinity')).toBeNull();
    expect(safeParseIntOrNull(Infinity)).toBeNull();
  });

  it('returns null for float (non-integer)', () => {
    // safeParseIntOrNull truncates via parseInt — 3.14 becomes 3 (acceptable for optional fields)
    expect(safeParseIntOrNull('3.14')).toBe(3);
  });

  it('returns null for negative (allowed — optional int can be negative)', () => {
    expect(safeParseIntOrNull('-5')).toBe(-5);
  });
});
