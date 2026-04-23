// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §4.3 Detailed Investigation View
// Full-screen permit detail pulled from the TanStack Query feed cache (no new API call).
// Reads across all cached `['lead-feed', ...]` pages to find the lead_id; if the cache
// was evicted, shows an empty state with a back CTA (rather than firing a fetch).
// SaveButton fixed at bottom per spec §4.3 Primary CTA.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react-native';
import { OpportunityRing } from '@/components/feed/OpportunityRing';
import { SaveButton } from '@/components/shared/SaveButton';
import { useSaveLead } from '@/hooks/useSaveLead';
import type { LeadFeedResult, PermitLeadFeedItem } from '@/lib/schemas';

const COST_TIER_LABEL: Record<string, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
  major: 'Major',
  mega: 'Mega',
};

const COST_TIER_SYMBOL: Record<string, string> = {
  small: '$',
  medium: '$$',
  large: '$$$',
  major: '$$$$',
  mega: '$$$$$',
};

function formatDistance(m: number): string {
  // Guard against NaN / negative values (would render "NaN m" or "-50 m" to the UI otherwise).
  if (!Number.isFinite(m) || m < 0) return '—';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

function formatCurrency(v: number | null): string | null {
  if (v === null || !Number.isFinite(v)) return null;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${Math.round(v)}`;
}

function findInCache(
  queryClient: ReturnType<typeof useQueryClient>,
  id: string | undefined,
): PermitLeadFeedItem | null {
  if (!id) return null;
  const caches = queryClient.getQueriesData<InfiniteData<LeadFeedResult>>({
    queryKey: ['lead-feed'],
  });
  for (const [, data] of caches) {
    if (!data) continue;
    for (const page of data.pages) {
      const found = page.data.find((d) => d.lead_id === id);
      if (found && found.lead_type === 'permit') return found;
    }
  }
  return null;
}

export default function LeadDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { mutate: saveLead } = useSaveLead();
  const insets = useSafeAreaInsets();

  // Reactive cache walk: subscribe to the QueryCache so the detail screen
  // re-renders when the feed query hydrates after navigation (cold deep-link
  // from a push notification commonly hits this path).
  const [item, setItem] = useState<PermitLeadFeedItem | null>(() =>
    findInCache(queryClient, id),
  );
  useEffect(() => {
    setItem(findInCache(queryClient, id));
    const unsub = queryClient.getQueryCache().subscribe((event) => {
      const key = event.query.queryKey;
      if (Array.isArray(key) && key[0] === 'lead-feed') {
        setItem(findInCache(queryClient, id));
      }
    });
    return unsub;
  }, [id, queryClient]);

  const handleSaveToggle = useCallback(
    (leadId: string, saved: boolean) => {
      saveLead({ leadId, leadType: 'permit', saved });
    },
    [saveLead],
  );

  const address = item
    ? [item.street_num, item.street_name].filter(Boolean).join(' ') || '—'
    : '—';
  const costSymbol = item?.cost_tier ? COST_TIER_SYMBOL[item.cost_tier] ?? '' : '';
  const costLabel = item?.cost_tier ? COST_TIER_LABEL[item.cost_tier] ?? '' : '';
  const currencyLabel = item ? formatCurrency(item.estimated_cost) : null;

  return (
    <SafeAreaView className="flex-1 bg-zinc-950" edges={['top']}>
      {/* Nav bar — contextual "Feed" label on the back button per design-audit finding. */}
      <View className="px-4 pt-4 pb-3 border-b border-zinc-800 flex-row items-center">
        <Pressable
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Back to Lead Feed"
          className="mr-2 active:opacity-70 flex-row items-center"
        >
          <ChevronLeft size={20} color="#fbbf24" strokeWidth={2.5} />
          <Text className="text-amber-400 font-mono text-sm -ml-0.5">Feed</Text>
        </Pressable>
        <Text className="font-mono text-xs text-zinc-400 uppercase tracking-widest flex-1 text-right">
          Permit Details
        </Text>
      </View>

      {!item ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-zinc-300 text-base font-semibold">Details not available</Text>
          <Text className="text-zinc-500 text-sm text-center mt-2 leading-5">
            This lead is no longer in your cached feed. Return to the Lead Feed to reload.
          </Text>
          <Pressable
            onPress={() => router.back()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            className="mt-6 active:opacity-70"
            accessibilityRole="button"
            accessibilityLabel="Back to Lead Feed"
          >
            <Text className="font-mono text-amber-400 text-sm">← Back to Feed</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          >
            {/* Hero: address + permit + ring */}
            <View className="flex-row items-start gap-4">
              <OpportunityRing score={item.opportunity_score} />
              <View className="flex-1">
                <Text
                  className="text-zinc-100 text-xl font-bold"
                  numberOfLines={2}
                  accessibilityRole="header"
                >
                  {address}
                </Text>
                <Text className="font-mono text-zinc-400 text-xs tracking-wider mt-1">
                  {item.permit_num}
                  {item.revision_num && item.revision_num !== '00'
                    ? ` · Rev ${item.revision_num}`
                    : ''}
                </Text>
                {item.neighbourhood_name ? (
                  <Text className="text-zinc-500 text-xs mt-0.5" numberOfLines={1}>
                    {item.neighbourhood_name} · {formatDistance(item.distance_m)}
                  </Text>
                ) : (
                  <Text className="text-zinc-500 text-xs mt-0.5">
                    {formatDistance(item.distance_m)} away
                  </Text>
                )}
              </View>
            </View>

            {/* Signal pills */}
            <View className="flex-row flex-wrap gap-2 mt-4">
              {item.target_window === 'work' ? (
                <View className="bg-red-500/20 border border-red-500/40 rounded-full px-3 py-1">
                  <Text className="font-mono text-xs text-red-400">🚨 Rescue Mission</Text>
                </View>
              ) : (
                <View className="bg-amber-500/20 border border-amber-500/40 rounded-full px-3 py-1">
                  <Text className="font-mono text-xs text-amber-400">💎 Early Bid</Text>
                </View>
              )}
              {item.cost_tier ? (
                <View className="bg-zinc-800 border border-zinc-700 rounded-full px-3 py-1">
                  <Text className="font-mono text-xs text-zinc-300">{costSymbol}</Text>
                </View>
              ) : null}
              {item.lifecycle_stalled ? (
                <View className="bg-red-500/20 border border-red-500/40 rounded-full px-3 py-1">
                  <Text className="font-mono text-xs text-red-400">⚠ Delayed</Text>
                </View>
              ) : null}
              {item.competition_count > 0 ? (
                <View className="bg-zinc-800 border border-zinc-700 rounded-full px-3 py-1">
                  <Text className="font-mono text-xs text-zinc-400">
                    👁 {item.competition_count} tracking
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Divider */}
            <View className="border-b border-zinc-800 my-5" />

            {/* Timing */}
            <Text className="font-mono text-xs text-zinc-500 uppercase tracking-widest mb-3">
              Timing
            </Text>
            <View className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-5">
              <Text className="font-mono text-amber-500 text-lg font-bold">
                {item.timing_display}
              </Text>
              <View className="flex-row items-center gap-2 mt-2">
                <Text className="font-mono text-xs text-zinc-500 uppercase tracking-wider">
                  Confidence
                </Text>
                <Text
                  className={`font-mono text-xs uppercase ${
                    item.timing_confidence === 'high'
                      ? 'text-green-400'
                      : item.timing_confidence === 'medium'
                        ? 'text-amber-400'
                        : 'text-zinc-400'
                  }`}
                >
                  {item.timing_confidence}
                </Text>
              </View>
              {item.lifecycle_phase ? (
                <View className="flex-row items-center gap-2 mt-1.5">
                  <Text className="font-mono text-xs text-zinc-500 uppercase tracking-wider">
                    Phase
                  </Text>
                  <Text className="font-mono text-xs text-zinc-300">
                    {item.lifecycle_phase}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Value */}
            <Text className="font-mono text-xs text-zinc-500 uppercase tracking-widest mb-3">
              Value
            </Text>
            <View className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-5">
              {currencyLabel ? (
                <Text className="text-zinc-100 text-2xl font-bold">{currencyLabel}</Text>
              ) : (
                <Text className="text-zinc-500 text-sm">Cost not disclosed</Text>
              )}
              {costLabel ? (
                <Text className="font-mono text-xs text-zinc-400 mt-1 uppercase tracking-wider">
                  {costLabel} tier
                </Text>
              ) : null}
            </View>

            {/* Project */}
            {(item.description || item.permit_type || item.status) && (
              <>
                <Text className="font-mono text-xs text-zinc-500 uppercase tracking-widest mb-3">
                  Project
                </Text>
                <View className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-5">
                  {item.permit_type ? (
                    <View className="flex-row items-center gap-2 mb-2">
                      <Text className="font-mono text-xs text-zinc-500 uppercase tracking-wider">
                        Type
                      </Text>
                      <Text className="text-zinc-200 text-xs">{item.permit_type}</Text>
                    </View>
                  ) : null}
                  {item.status ? (
                    <View className="flex-row items-center gap-2 mb-2">
                      <Text className="font-mono text-xs text-zinc-500 uppercase tracking-wider">
                        Status
                      </Text>
                      <Text className="text-zinc-200 text-xs">{item.status}</Text>
                    </View>
                  ) : null}
                  {item.description ? (
                    <Text className="text-zinc-300 text-sm leading-5 mt-1">
                      {item.description}
                    </Text>
                  ) : null}
                </View>
              </>
            )}

            {/* Scoring pillars (audit transparency) */}
            <Text className="font-mono text-xs text-zinc-500 uppercase tracking-widest mb-3">
              Scoring Breakdown
            </Text>
            <View className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <ScoreRow label="Proximity" value={item.proximity_score} />
              <ScoreRow label="Timing" value={item.timing_score} />
              <ScoreRow label="Value" value={item.value_score} />
              <ScoreRow label="Relevance" value={item.relevance_score} />
              <View className="border-b border-zinc-800 my-2" />
              <ScoreRow label="Opportunity" value={item.opportunity_score} bold />
            </View>
          </ScrollView>

          {/* Sticky bottom CTA — spec §4.3 Primary Call to Action. Bottom padding
              respects the device safe area (home indicator) so the SaveButton
              stays fully tappable on iPhones with a home gesture area. */}
          <View
            style={{ paddingBottom: insets.bottom + 12, paddingTop: 12 }}
            className="absolute left-0 right-0 bottom-0 border-t border-zinc-800 bg-zinc-950 px-4 flex-row items-center justify-between"
          >
            <View className="flex-1 mr-3">
              <Text className="text-zinc-400 text-xs">
                {item.is_saved ? 'On your Flight Board' : 'Track this job'}
              </Text>
              <Text className="text-zinc-100 text-sm font-semibold" numberOfLines={1}>
                {address}
              </Text>
            </View>
            <SaveButton
              leadId={item.lead_id}
              isSaved={item.is_saved}
              onToggle={handleSaveToggle}
              testID="lead-detail-save-button"
            />
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

interface ScoreRowProps {
  label: string;
  value: number;
  bold?: boolean;
}

function ScoreRow({ label, value, bold }: ScoreRowProps) {
  const displayValue = Math.round(value);
  return (
    <View className="flex-row items-center justify-between py-1">
      <Text
        className={`font-mono text-xs uppercase tracking-wider ${
          bold ? 'text-zinc-200' : 'text-zinc-500'
        }`}
      >
        {label}
      </Text>
      <Text
        className={`font-mono text-sm ${
          bold ? 'text-amber-500 font-bold' : 'text-zinc-300'
        }`}
      >
        {displayValue}
      </Text>
    </View>
  );
}
