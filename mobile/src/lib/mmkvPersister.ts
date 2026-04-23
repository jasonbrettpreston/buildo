// SPEC LINK: docs/specs/03-mobile/90_mobile_engineering_protocol.md §MMKV
// MMKV-backed async storage adapter for TanStack Query PersistQueryClient.
// Provides a 24h cache persisted to native MMKV storage so the feed
// remains viewable offline without a separate fetch.
//
// Also exposes `getLastPersistedAt()` so the OfflineBanner can show the
// user when the cached data was last refreshed (spec 77 §4.2 timestamp).
import { createMMKV } from 'react-native-mmkv';
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';

const storage = createMMKV({ id: 'tq-persist' });

const CLIENT_KEY = 'tq-client';
const LAST_UPDATED_KEY = 'tq-last-updated';

export const mmkvPersister: Persister = {
  persistClient: (client: PersistedClient) => {
    storage.set(CLIENT_KEY, JSON.stringify(client));
    // Record the moment this cache was written so the offline UX can show
    // "Updated N min ago" — critical for field users who need to know how
    // stale their data is before acting on it.
    storage.set(LAST_UPDATED_KEY, Date.now().toString());
  },
  restoreClient: (): PersistedClient | undefined => {
    const raw = storage.getString(CLIENT_KEY);
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as PersistedClient;
    } catch {
      return undefined;
    }
  },
  removeClient: () => {
    storage.remove(CLIENT_KEY);
    storage.remove(LAST_UPDATED_KEY);
  },
};

/**
 * Returns the epoch-ms timestamp of the last persistClient() write, or null
 * if the cache has never been written (first install).
 */
export function getLastPersistedAt(): number | null {
  const raw = storage.getString(LAST_UPDATED_KEY);
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}
