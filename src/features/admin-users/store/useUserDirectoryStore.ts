// 🔗 SPEC LINK: docs/specs/02-web-admin/21_admin_user_management.md §3.1
//             docs/specs/02-web-admin/35_web_admin_state_architecture.md §3.1 + §B5
//
// Directory search/filter/pagination state for the admin User Management tool.
// Feature-scoped Zustand store (Spec 35 §3). Registered in resetAdminStores()
// (session.ts) per the §8.5 store-enumeration coverage contract.

'use client';

import { create } from 'zustand';

export interface UserDirectoryFilters {
  q: string;
  preset: string; // '' = any
  subscription_status: string; // '' = any
  trade_slug: string; // '' = any
  stripe_cancel_failed: boolean; // P26 Subscription-Ops directory filter
  offset: number;
}

const INITIAL: UserDirectoryFilters = {
  q: '',
  preset: '',
  subscription_status: '',
  trade_slug: '',
  stripe_cancel_failed: false,
  offset: 0,
};

interface UserDirectoryState extends UserDirectoryFilters {
  setFilter: <K extends keyof UserDirectoryFilters>(key: K, value: UserDirectoryFilters[K]) => void;
  nextPage: () => void;
  prevPage: (pageSize: number) => void;
  reset: () => void;
}

export const useUserDirectoryStore = create<UserDirectoryState>((set, get) => ({
  ...INITIAL,
  setFilter(key, value) {
    // Any filter change resets pagination (offset) so the user does not land
    // on an out-of-range page of a freshly-filtered result set.
    set({ [key]: value, ...(key !== 'offset' ? { offset: 0 } : {}) } as Partial<UserDirectoryState>);
  },
  nextPage() {
    set({ offset: get().offset + 1 });
  },
  prevPage(pageSize) {
    set({ offset: Math.max(0, get().offset - 1 * (pageSize > 0 ? 1 : 1)) });
  },
  reset() {
    const s = get();
    if (
      s.q === '' &&
      s.preset === '' &&
      s.subscription_status === '' &&
      s.trade_slug === '' &&
      s.stripe_cancel_failed === false &&
      s.offset === 0
    ) {
      return; // already initial — keep the reference stable (Spec 35 §6.2)
    }
    set({ ...INITIAL });
  },
}));
