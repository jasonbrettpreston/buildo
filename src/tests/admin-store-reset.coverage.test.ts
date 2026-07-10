// @vitest-environment jsdom
// 🔗 SPEC LINK: docs/specs/02-web-admin/35_web_admin_state_architecture.md §8.1 (B4/B5) + §8.5
//             docs/specs/02-web-admin/36_flight_center_tool.md §5 ([PF13])
//
// The Spec 35 §8.5 store-enumeration coverage test — walks the admin Zustand
// stores on disk and asserts each one is fanned out from
// `resetAdminStores()` in src/lib/admin/session.ts. Adding a new admin store
// without wiring its reset FAILS this suite ([PF13]: lands in the SAME
// commit as the useFlightCenterStore).
//
// Also the §8.1 B4/B5 behavior locks: clearAdminSession purges the query
// cache + resets stores; handleAdminUidChange clears on uid CHANGE but is a
// no-op on uid REFRESH.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { QueryClient } from '@tanstack/react-query';

vi.mock('@sentry/nextjs', () => ({
  setUser: vi.fn(),
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
}));

import * as Sentry from '@sentry/nextjs';
import {
  clearAdminSession,
  handleAdminUidChange,
  resetAdminStores,
} from '@/lib/admin/session';
import { useAdminControlsStore } from '@/features/admin-controls/store/useAdminControlsStore';
import { useFlightCenterStore } from '@/features/admin-flight-center/store/useFlightCenterStore';

const SRC_ROOT = path.resolve(__dirname, '..');
const SESSION_SOURCE = fs.readFileSync(
  path.join(SRC_ROOT, 'lib', 'admin', 'session.ts'),
  'utf8',
);

/** Recursively find admin store modules: src/features/**\/store/use*Store.ts */
function findStoreFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findStoreFiles(full));
    } else if (/^use\w*Store\.tsx?$/.test(entry.name) && full.includes(`${path.sep}store${path.sep}`)) {
      out.push(full);
    }
  }
  return out;
}

describe('Spec 35 §8.5 — admin store reset enumeration', () => {
  it('every zustand admin store under src/features/**/store is enumerated in resetAdminStores()', () => {
    const storeFiles = findStoreFiles(path.join(SRC_ROOT, 'features'));
    expect(storeFiles.length).toBeGreaterThanOrEqual(2); // controls + flight-center today

    for (const file of storeFiles) {
      const source = fs.readFileSync(file, 'utf8');
      // Only zustand stores participate (create( from 'zustand').
      if (!/from 'zustand'/.test(source)) continue;
      const nameMatch = /export const (use\w+Store)\b/.exec(source);
      expect(nameMatch, `cannot find exported store name in ${file}`).not.toBeNull();
      const storeName = nameMatch![1];
      // The fan-out must reference the store's getState().<reset method>.
      const re = new RegExp(`${storeName}\\.getState\\(\\)\\.(reset|resetStore|discardDraft)`);
      expect(
        re.test(SESSION_SOURCE),
        `${storeName} (${path.relative(SRC_ROOT, file)}) is NOT fanned out in src/lib/admin/session.ts resetAdminStores() — Spec 35 §B5 requires every admin store to reset on logout`,
      ).toBe(true);
    }
  });
});

describe('Spec 35 §B5 — clearAdminSession behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Dirty both stores.
    useFlightCenterStore.getState().toggleSelected(42);
    useFlightCenterStore.getState().setSearchQuery('queen st');
    useFlightCenterStore.getState().openInspector('20-1--00');
  });

  it('resets every store, purges the query cache, and clears the Sentry user', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['admin', 'flight-center', 'board', 0], { data: [], meta: { total: 0, limit: 50, offset: 0 } });
    const clearSpy = vi.spyOn(queryClient, 'clear');

    clearAdminSession(queryClient);

    expect(clearSpy).toHaveBeenCalledOnce();
    const fc = useFlightCenterStore.getState();
    expect(fc.selectedIds.size).toBe(0);
    expect(fc.searchQuery).toBe('');
    expect(fc.inspectorOpen).toBe(false);
    expect(fc.selectedLeadId).toBeNull();
    expect(useAdminControlsStore.getState().draftConfig).toBeNull();
    expect(vi.mocked(Sentry.setUser)).toHaveBeenCalledWith(null);
  });

  it('resetAdminStores is idempotent (second call is a no-op on already-clean stores)', () => {
    resetAdminStores();
    const before = useFlightCenterStore.getState().selectedIds;
    resetAdminStores();
    // Reference-stable: the reset short-circuits when already initial (§6.2).
    expect(useFlightCenterStore.getState().selectedIds).toBe(before);
  });
});

describe('Spec 35 §B4 — handleAdminUidChange ([PF13])', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFlightCenterStore.getState().toggleSelected(7);
  });

  it('uid CHANGE purges the cache + resets stores + re-attributes Sentry', () => {
    const queryClient = new QueryClient();
    const clearSpy = vi.spyOn(queryClient, 'clear');

    handleAdminUidChange(queryClient, 'admin-a', 'admin-b');

    expect(clearSpy).toHaveBeenCalledOnce();
    // A different admin must NOT inherit selectedIds ([PF13]).
    expect(useFlightCenterStore.getState().selectedIds.size).toBe(0);
    expect(vi.mocked(Sentry.setUser)).toHaveBeenCalledWith({ id: 'admin-b' });
  });

  it('uid REFRESH (same uid) does NOT clear the cache — wasteful round-trip', () => {
    const queryClient = new QueryClient();
    const clearSpy = vi.spyOn(queryClient, 'clear');

    handleAdminUidChange(queryClient, 'admin-a', 'admin-a');

    expect(clearSpy).not.toHaveBeenCalled();
    // Stores untouched on a refresh.
    expect(useFlightCenterStore.getState().selectedIds.has(7)).toBe(true);
  });

  it('sign-out (next uid null) clears the Sentry user', () => {
    const queryClient = new QueryClient();
    handleAdminUidChange(queryClient, 'admin-a', null);
    expect(vi.mocked(Sentry.setUser)).toHaveBeenCalledWith(null);
  });
});
