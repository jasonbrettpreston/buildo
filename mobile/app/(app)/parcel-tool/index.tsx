// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4 (ParcelSearchScreen), §2.6
//            (the response shape drives the client state machine), §2.8 (never log the raw query),
//            §2.9 (Toronto scoping is UX, not security)
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md §3.1 (SEARCH archetype)
//            docs/specs/00-architecture/117_maxbld_brand.md §6.1 (this surface's brand application)
//            docs/specs/03-mobile/99_mobile_state_architecture.md §4 (query keys), §6.1 (atomic
//            Zustand selectors)
//
// Surface S-002 `mobile_parcel_search` — the Lookup tab of the MaxBLD product shell, S-004
// `shell_parcel_tool_stack`. S-004 draws the three-tab shelf (Lookup · Tracked Lots · Account);
// this screen MUST NOT draw navigation of its own, and only reserves the shelf's height.
//
// It branches on a MATCH TYPE, never on a result count (operator ruling 2026-09-16). The whole of
// that decision lives in `deriveMatchType` — see mobile/src/lib/parcelSearchMatch.ts for which of
// the five types are derivable from today's contract and which two await the API change.
//
// MaxBLD is its own product (Spec 116 OD5): nothing here may reference a lead-gen concept. The
// former "home base" Toronto hint — which read the lead-gen filter store — is DELETED per the
// operator's ruling 2026-09-16 (b). The owner's location does not matter; the only geography rule
// is that an address outside Toronto is refused, visibly, before the query is ever sent.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Search, MapPin, AlertTriangle, RefreshCw, Lock, Ban } from 'lucide-react-native';
import { useParcelSearch, ParcelLookupSchemaError } from '@/hooks/useParcelLookup';
import { ApiError, RateLimitError } from '@/lib/errors';
import {
  deriveMatchType,
  diffCandidateAddress,
  isOutsideToronto,
  isOverCandidateCap,
  parcelSearchRoute,
  type ParcelSearchOutcome,
} from '@/lib/parcelSearchMatch';
import {
  PARCEL_SEARCH_HEX,
  PARCEL_SEARCH_TOKENS as T,
  PARCEL_SHELF_HEIGHT,
  SEARCH_CANDIDATE_LIMIT,
  SEARCH_DEBOUNCE_MS,
  SEARCH_MAX_WIDTH,
  SEARCH_MIN_QUERY_LEN,
} from '@/constants/parcelSearch';
import type { ParcelCandidate } from '@/lib/schemas';

// Pre-filled query helpers (Spec 117 §6.1 "suggestion chips"). Each one simply feeds `?q=` through
// the same debounced path as typing — they are not a second search mechanism.
const SUGGESTIONS: ReadonlyArray<{ label: string; query: string }> = [
  { label: 'Hurlingham Cres', query: '26 Hurlingham Cres' },
  { label: 'Queen & Spadina', query: 'Queen & Spadina' },
  { label: 'Bathurst St', query: 'Bathurst St' },
];

export default function ParcelSearchScreen() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [debounced, setDebounced] = useState('');

  // Debounce (config.debounce_ms) so typeahead exploration does not burn the 60/min rate bucket.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(input), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [input]);

  // The Toronto-only rule (operator ruling 2026-09-16 (b)). MaxBLD has no home-base concept and
  // the owner's location is irrelevant — the ONLY geography rule is about the address being
  // searched. An out-of-Toronto address is refused here, visibly, and the query is never sent:
  // passing '' disables the hook, so a refusal costs nothing against the 60/min bucket.
  const outsideToronto = isOutsideToronto(debounced);
  const { data, isFetching, error, refetch } = useParcelSearch(outsideToronto ? '' : debounced);

  const outcome: ParcelSearchOutcome = useMemo(
    () => deriveMatchType(debounced, error ? undefined : data),
    [debounced, data, error],
  );

  const candidates: ParcelCandidate[] = useMemo(
    () => (outcome === 'text_candidates' && data ? data.candidates.slice(0, SEARCH_CANDIDATE_LIMIT) : []),
    [outcome, data],
  );

  const goToParcel = useCallback(
    (parcelId: string) => {
      const route = parcelSearchRoute('unique', { parcelId, query: debounced });
      if (route) router.push(route);
    },
    [router, debounced],
  );

  // `unique` navigates straight to the lot — no intermediate screen (operator ruling 2026-09-16).
  // `multi_parcel` / `unlinked` / `intersection` navigate to the map disambiguation surface.
  //
  // The ref stops the screen bouncing the user forward again when they navigate BACK with the
  // query still in the box. It is cleared the moment the outcome stops being navigable (an edited
  // or cleared query), so retyping the same address navigates again rather than dead-ending.
  const navigatedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (isFetching) return;
    const route = parcelSearchRoute(outcome, {
      parcelId: data?.match?.parcelId ?? null,
      query: debounced,
    });
    if (!route) {
      navigatedForRef.current = null;
      return;
    }
    if (navigatedForRef.current === route) return;
    navigatedForRef.current = route;
    router.push(route);
  }, [outcome, data?.match?.parcelId, debounced, isFetching, router]);

  // ── Error classification. Every class gets its OWN visible state; nothing is presented as a
  // data miss that is not one. This closes the limitation the descriptor recorded, where a 403
  // entitlement refusal rendered as "No parcel found for that address."
  const retryAfter = error instanceof RateLimitError ? error.retryAfterSeconds : null;
  const isEntitlementRefusal = error instanceof ApiError && error.status === 403;
  const isSchemaDrift = error instanceof ParcelLookupSchemaError;
  const isUnexpectedError = error != null && !retryAfter && !isEntitlementRefusal;

  const belowMinLength =
    outcome !== 'outside_toronto' && debounced.trim().length < SEARCH_MIN_QUERY_LEN;
  const showEmpty = outcome === 'no_match' && !isFetching && error == null;
  const overCap = isOverCandidateCap(candidates, SEARCH_CANDIDATE_LIMIT);

  return (
    <SafeAreaView className={`flex-1 ${T.screenBg}`} edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: PARCEL_SHELF_HEIGHT + 24, alignItems: 'center' }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="w-full px-4" style={{ maxWidth: SEARCH_MAX_WIDTH }}>
          {/* Branding header — Spec 117 §5 placeholder policy: text-only wordmark, amber on dark. */}
          <View className="items-center pt-10 pb-6">
            <Text
              className="text-2xl font-bold tracking-tight text-zinc-100"
              accessibilityRole="header"
            >
              Max<Text className={T.primaryText}>BLD</Text>
            </Text>
            <Text className={`font-mono text-[11px] mt-1 tracking-widest uppercase ${T.textSecondary}`}>
              Toronto lot lookup
            </Text>
          </View>

          {/* Search field */}
          <View
            className={`flex-row items-center rounded-2xl px-3 border ${T.searchSurface} ${T.borderSearch}`}
          >
            <Search size={18} color={PARCEL_SEARCH_HEX.textMuted} />
            <TextInput
              testID="parcel-search-input"
              value={input}
              onChangeText={setInput}
              placeholder="Search an address, e.g. 26 Hurlingham Cres"
              placeholderTextColor={PARCEL_SEARCH_HEX.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Search a Toronto address"
              accessibilityHint={`Enter at least ${SEARCH_MIN_QUERY_LEN} characters to search for a lot`}
              className="flex-1 text-zinc-100 py-3 px-2 text-base"
              style={{ minHeight: 44 }}
            />
            {isFetching ? (
              <ActivityIndicator
                size="small"
                color={PARCEL_SEARCH_HEX.primary}
                accessibilityLabel="Searching"
              />
            ) : null}
          </View>

          {/* Suggestion chips — pre-filled query helpers feeding the same ?q= path. */}
          <View className="flex-row flex-wrap gap-2 mt-3">
            {SUGGESTIONS.map((s) => (
              <Pressable
                key={s.query}
                testID={`parcel-search-suggestion-${s.query}`}
                onPress={() => setInput(s.query)}
                accessibilityRole="button"
                accessibilityLabel={`Search ${s.label}`}
                className={`rounded-full px-3 border ${T.chipBg} ${T.borderChip} ${T.chipBgPressed}`}
                style={{ minHeight: 44, justifyContent: 'center' }}
              >
                <Text className={`font-mono text-xs ${T.textSecondary}`}>{s.label}</Text>
              </Pressable>
            ))}
          </View>

          {outcome === 'outside_toronto' ? (
            <View
              testID="parcel-search-outside-toronto"
              className={`flex-row items-center gap-2 mt-3 rounded-xl px-3 py-3 border ${T.chipBg} ${T.borderRow}`}
            >
              <Ban size={14} color="#f87171" />
              <Text className="text-red-400 text-xs flex-1">Lots are only available in Toronto.</Text>
            </View>
          ) : null}

          {/* ── Unhappy paths, each with its own visible state ─────────────────────────── */}

          {retryAfter != null ? (
            <View className="flex-row items-center gap-2 mt-3">
              <AlertTriangle size={14} color="#f87171" />
              <Text testID="parcel-search-ratelimit" className="text-red-400 text-xs flex-1">
                Too many searches. Try again in {retryAfter}s.
              </Text>
            </View>
          ) : null}

          {isEntitlementRefusal ? (
            <View
              testID="parcel-search-entitlement"
              className={`flex-row items-center gap-2 mt-3 rounded-xl px-3 py-3 border ${T.chipBg} ${T.borderRow}`}
            >
              <Lock size={14} color={PARCEL_SEARCH_HEX.primary} />
              <Text className="text-zinc-300 text-xs flex-1">
                Your subscription doesn&apos;t include the parcel tool right now. This isn&apos;t a
                missing address — reactivate to search lots again.
              </Text>
            </View>
          ) : null}

          {isUnexpectedError ? (
            <View testID="parcel-search-error" className="mt-3">
              <View className="flex-row items-center gap-2">
                <AlertTriangle size={14} color="#f87171" />
                <Text className="text-red-400 text-xs flex-1">
                  {isSchemaDrift
                    ? 'We couldn’t read the response for that address. This is our problem, not yours — it has been reported.'
                    : 'Couldn’t reach the lot service. Check your connection and try again.'}
                </Text>
              </View>
              {!isSchemaDrift ? (
                <Pressable
                  testID="parcel-search-retry"
                  onPress={() => void refetch()}
                  accessibilityRole="button"
                  accessibilityLabel="Retry the search"
                  className={`flex-row items-center justify-center gap-2 mt-2 rounded-xl ${T.primaryBg} active:opacity-80`}
                  style={{ minHeight: 44 }}
                >
                  <RefreshCw size={14} color={PARCEL_SEARCH_HEX.onPrimary} />
                  <Text className={`text-xs font-semibold ${T.onPrimaryText}`}>Try again</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {/* ── text_candidates: capped list, differing part highlighted ───────────────── */}

          {candidates.map((c) => (
            <Pressable
              key={c.parcelId}
              testID={`parcel-candidate-${c.parcelId}`}
              onPress={() => goToParcel(c.parcelId)}
              accessibilityRole="button"
              accessibilityLabel={`Open lot at ${c.address || c.parcelId}`}
              className={`mt-2 rounded-xl px-3 py-3 border ${T.searchSurface} ${T.borderRow} active:opacity-70`}
              style={{ minHeight: 44 }}
            >
              <Text className="text-zinc-100 text-base">
                {diffCandidateAddress(debounced, c.address || c.parcelId).map((seg, i) => (
                  <Text
                    key={`${c.parcelId}-${i}`}
                    className={seg.differs ? `${T.primaryText} font-semibold` : 'text-zinc-100'}
                  >
                    {seg.text}
                  </Text>
                ))}
              </Text>
              <Text className={`font-mono text-[11px] mt-0.5 ${T.textSecondary}`}>
                Parcel {c.parcelId}
              </Text>
            </Pressable>
          ))}

          {overCap ? (
            <Text testID="parcel-search-refine" className={`text-xs text-center mt-3 ${T.textSecondary}`}>
              More than {SEARCH_CANDIDATE_LIMIT} lots match. Add a house number to narrow it down.
            </Text>
          ) : null}

          {/* ── miss / prompt ──────────────────────────────────────────────────────────── */}

          {showEmpty ? (
            <View className="items-center mt-10">
              <MapPin size={20} color={PARCEL_SEARCH_HEX.textMuted} />
              <Text testID="parcel-search-empty" className={`text-center mt-2 ${T.textSecondary}`}>
                No parcel found for that address.
              </Text>
            </View>
          ) : null}

          {belowMinLength && error == null ? (
            <Text testID="parcel-search-prompt" className="text-zinc-600 text-center mt-10">
              Type at least {SEARCH_MIN_QUERY_LEN} characters to search.
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
