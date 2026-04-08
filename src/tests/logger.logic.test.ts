// 🔗 SPEC LINK: docs/specs/00_engineering_standards.md §13.3
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

describe('logger — logInfo extension', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('logInfo is exported from src/lib/logger', async () => {
    const mod = await import('@/lib/logger');
    expect(typeof mod.logInfo).toBe('function');
  });

  it('logInfo emits a structured JSON line', async () => {
    const { logInfo } = await import('@/lib/logger');
    logInfo('[test]', 'thing_happened', { user_id: 'abc', count: 42 });
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const logged = consoleLogSpy.mock.calls[0]?.[0];
    expect(typeof logged).toBe('string');
    const parsed = JSON.parse(logged as string);
    expect(parsed.level).toBe('info');
    expect(parsed.tag).toBe('[test]');
    expect(parsed.event).toBe('thing_happened');
    expect(parsed.user_id).toBe('abc');
    expect(parsed.count).toBe(42);
    expect(typeof parsed.timestamp).toBe('string');
    // Timestamp should parse as a valid ISO date
    expect(new Date(parsed.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('logInfo works without context', async () => {
    const { logInfo } = await import('@/lib/logger');
    logInfo('[test]', 'simple_event');
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(consoleLogSpy.mock.calls[0]?.[0] as string);
    expect(parsed.tag).toBe('[test]');
    expect(parsed.event).toBe('simple_event');
  });

  it('logInfo handles non-serializable context gracefully (Date)', async () => {
    const { logInfo } = await import('@/lib/logger');
    expect(() => {
      logInfo('[test]', 'date_event', { when: new Date('2026-04-08') });
    }).not.toThrow();
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    // Date should serialize via toJSON()
    const parsed = JSON.parse(consoleLogSpy.mock.calls[0]?.[0] as string);
    expect(typeof parsed.when).toBe('string');
  });

  it('logInfo handles circular references without crashing', async () => {
    const { logInfo } = await import('@/lib/logger');
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    expect(() => {
      logInfo('[test]', 'circular_event', circular);
    }).not.toThrow();
    // Should still produce output (with the circular ref handled or the
    // whole context replaced by an error marker — either is acceptable)
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('existing logError still works (regression)', async () => {
    const consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { logError } = await import('@/lib/logger');
    logError('[test]', new Error('boom'), { context: 'value' });
    expect(consoleErrSpy).toHaveBeenCalled();
    consoleErrSpy.mockRestore();
  });

  it('existing logWarn still works (regression)', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { logWarn } = await import('@/lib/logger');
    logWarn('[test]', 'warning message', { reason: 'test' });
    expect(consoleWarnSpy).toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });
});
