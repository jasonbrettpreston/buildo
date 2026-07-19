// SPEC LINK: docs/specs/00-architecture/13_authentication.md §3.6 (MFA gate)
//            .cursor/phase1_plan.md Item 6 / P1-F4.3 (fold 22 minimums)
//
// Logic tests for src/lib/admin/backup-codes.ts — generation format/entropy,
// hash determinism + salt separation + normalization, the replace-set
// transaction (hashes only, never plaintext, exactly 10), and the consume
// path (match/no-match/raced-double-use/empty input).

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPoolQuery = vi.fn();
const mockClientQuery = vi.fn();
vi.mock('@/lib/db/client', () => ({
  pool: { query: (...args: unknown[]) => mockPoolQuery(...args) },
  withTransaction: async (fn: (client: { query: typeof mockClientQuery }) => Promise<unknown>) =>
    fn({ query: mockClientQuery }),
}));

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
}));

import {
  BACKUP_CODE_COUNT,
  consumeBackupCode,
  countUnusedBackupCodes,
  deleteBackupCodes,
  generateBackupCode,
  hashBackupCode,
  newSalt,
  normalizeBackupCode,
  replaceBackupCodes,
} from '@/lib/admin/backup-codes';

const UID = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  mockPoolQuery.mockReset();
  mockClientQuery.mockReset();
});

describe('generateBackupCode', () => {
  it('emits 16 hex chars in 4-char groups (xxxx-xxxx-xxxx-xxxx)', () => {
    for (let i = 0; i < 20; i++) {
      expect(generateBackupCode()).toMatch(/^[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}$/);
    }
  });

  it('codes are unique across a generation batch (64-bit entropy sanity)', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateBackupCode()));
    expect(codes.size).toBe(100);
  });
});

describe('normalizeBackupCode / hashBackupCode', () => {
  it('normalization is case- and separator-insensitive', () => {
    expect(normalizeBackupCode('A1B2-C3D4-E5F6-A7B8')).toBe('a1b2c3d4e5f6a7b8');
    expect(normalizeBackupCode(' a1b2 c3d4_e5f6.a7b8 ')).toBe('a1b2c3d4e5f6a7b8');
  });

  it('hash is deterministic for the same (code, salt) regardless of formatting', () => {
    const salt = newSalt();
    expect(hashBackupCode('A1B2-C3D4-E5F6-A7B8', salt)).toBe(
      hashBackupCode('a1b2c3d4e5f6a7b8', salt),
    );
  });

  it('the same code under two different salts produces different hashes (per-code salt)', () => {
    const code = generateBackupCode();
    expect(hashBackupCode(code, newSalt())).not.toBe(hashBackupCode(code, newSalt()));
  });

  it('produces a 64-char hex sha256 digest', () => {
    expect(hashBackupCode(generateBackupCode(), newSalt())).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('replaceBackupCodes', () => {
  it('deletes the old set then inserts exactly BACKUP_CODE_COUNT hashed rows, returning plaintext once', async () => {
    mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    const codes = await replaceBackupCodes(UID);

    expect(codes).toHaveLength(BACKUP_CODE_COUNT);
    expect(new Set(codes).size).toBe(BACKUP_CODE_COUNT);

    // First statement wipes the previous set (used AND unused).
    expect(mockClientQuery.mock.calls[0]?.[0]).toMatch(/DELETE FROM admin_backup_codes/);
    expect(mockClientQuery.mock.calls[0]?.[1]).toEqual([UID]);

    // Then one INSERT per code — and NO insert parameter ever contains a
    // plaintext code (fold 22: hashed at rest, shown once).
    const inserts = mockClientQuery.mock.calls.slice(1);
    expect(inserts).toHaveLength(BACKUP_CODE_COUNT);
    for (const [sqlText, params] of inserts) {
      expect(sqlText).toMatch(/INSERT INTO admin_backup_codes/);
      const [userId, codeHash, codeSalt] = params as [string, string, string];
      expect(userId).toBe(UID);
      expect(codeHash).toMatch(/^[0-9a-f]{64}$/);
      for (const plaintext of codes) {
        expect(codeHash).not.toContain(normalizeBackupCode(plaintext));
        expect(codeSalt).not.toContain(normalizeBackupCode(plaintext));
      }
    }

    // And each stored (hash, salt) pair actually corresponds to one of the
    // returned plaintext codes — the admin's saved codes will verify.
    for (const [, params] of inserts) {
      const [, codeHash, codeSalt] = params as [string, string, string];
      const matches = codes.filter((c) => hashBackupCode(c, codeSalt) === codeHash);
      expect(matches).toHaveLength(1);
    }
  });
});

describe('consumeBackupCode', () => {
  function seededRow(code: string, id = '1') {
    const salt = newSalt();
    return { id, code_hash: hashBackupCode(code, salt), code_salt: salt };
  }

  it('consumes a valid unused code (marks used_at, race-guarded) and returns true', async () => {
    const code = generateBackupCode();
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [seededRow(code)], rowCount: 1 }) // SELECT unused
      .mockResolvedValueOnce({ rows: [{ id: '1' }], rowCount: 1 }); // UPDATE ... RETURNING

    await expect(consumeBackupCode(UID, code.toUpperCase())).resolves.toBe(true);

    const updateCall = mockPoolQuery.mock.calls[1];
    expect(updateCall?.[0]).toMatch(/SET used_at = NOW\(\)/);
    expect(updateCall?.[0]).toMatch(/used_at IS NULL/); // single-use race guard
    expect(updateCall?.[1]).toEqual(['1']);
  });

  it('returns false for a non-matching code without issuing an UPDATE', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [seededRow(generateBackupCode())],
      rowCount: 1,
    });
    await expect(consumeBackupCode(UID, generateBackupCode())).resolves.toBe(false);
    expect(mockPoolQuery).toHaveBeenCalledTimes(1); // SELECT only
  });

  it('returns false when the consume UPDATE races (0 rows — code already used)', async () => {
    const code = generateBackupCode();
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [seededRow(code)], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // raced away

    await expect(consumeBackupCode(UID, code)).resolves.toBe(false);
  });

  it('returns false with no DB round-trip for an empty/garbage candidate', async () => {
    await expect(consumeBackupCode(UID, '   --- ')).resolves.toBe(false);
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  it('returns false when the admin has no unused codes', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(consumeBackupCode(UID, generateBackupCode())).resolves.toBe(false);
  });
});

describe('deleteBackupCodes / countUnusedBackupCodes', () => {
  it('deleteBackupCodes removes all rows for the uid', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 3 });
    await deleteBackupCodes(UID);
    expect(mockPoolQuery.mock.calls[0]?.[0]).toMatch(/DELETE FROM admin_backup_codes/);
    expect(mockPoolQuery.mock.calls[0]?.[1]).toEqual([UID]);
  });

  it('countUnusedBackupCodes counts only used_at IS NULL rows', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ count: '7' }], rowCount: 1 });
    await expect(countUnusedBackupCodes(UID)).resolves.toBe(7);
    expect(mockPoolQuery.mock.calls[0]?.[0]).toMatch(/used_at IS NULL/);
  });

  it('countUnusedBackupCodes returns 0 on an empty result', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(countUnusedBackupCodes(UID)).resolves.toBe(0);
  });
});
