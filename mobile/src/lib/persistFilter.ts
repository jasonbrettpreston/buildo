// SPEC LINK: docs/specs/03-mobile/99_mobile_state_architecture.md §2.1 (PII layer boundary)
//
// `dehydrateOptions.shouldDehydrateQuery` predicate for the
// `PersistQueryClientProvider` in `mobile/app/_layout.tsx`.
//
// WF3 follow-up amendment (code-reviewer HIGH 1): extracted from
// `_layout.tsx` to its own module so `mobile/__tests__/offline.test.ts`
// can import the ACTUAL production predicate (not a local mirror that
// could silently drift). Importing `_layout.tsx` from a node-environment
// test is also impractical — it pulls in React, expo-router, and a tree
// of native-only modules.
//
// Why exclude `['user-profile']` specifically:
//   - The user-profile query payload carries 5 PII identity fields
//     (full_name / phone_number / company_name / email / backup_email).
//   - MMKV is Layer 4a (UNENCRYPTED on disk per `mmkvPersister.ts:11` —
//     no `encryptionKey` passed to createMMKV).
//   - Spec 99 §2.1 mandates Layer 4b (SecureStore/Keychain) for PII.
// Other queries (`['lead-feed']`, `['flight-board']`,
// `['notification-prefs']`) carry only public permit data or non-PII
// toggles and continue to persist normally.

export interface QueryShape {
  queryKey: readonly unknown[];
}

// SRCH.A6 (task-320): ['parcel-entitlement'] is the reports-left count; a count kept from a previous session would be a wrong number, so it is not persisted.
// task-267 (PLAN-267-v2 step 4; Spec 99 §4 B1 row parcel-checking): ['parcel-checking'] is the fast read of the loading screen; its lines and pace are for
// this visit only, so it is not persisted (a page it finds is stored under ['parcel-lookup', id], which is).
const NOT_PERSISTED = ['user-profile', 'parcel-entitlement', 'parcel-checking'];

export const shouldDehydrateQueryFn = (query: QueryShape): boolean =>
  !NOT_PERSISTED.includes(String(query.queryKey[0]));
