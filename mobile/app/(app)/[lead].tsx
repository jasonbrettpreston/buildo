// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §4.3 Detailed Investigation View
//             docs/specs/03-mobile/99_mobile_state_architecture.md §B1 (TanStack canonical)
//             docs/specs/03-mobile/99_mobile_state_architecture.md §B4 (idToken gate)
//             docs/specs/03-mobile/98_mobile_testing_protocol.md §3.2 (testIDs)
//             docs/specs/01-pipeline/83_lead_cost_model.md §2 (cost source-of-truth)
//             docs/specs/01-pipeline/85_trade_forecast_engine.md §2 (timing source-of-truth)
//             docs/specs/01-pipeline/57_source_neighbourhoods.md §2 (income source-of-truth)
//
// WF1-A rewrite (2026-05-06): replaces the pre-Spec-99 queryClient
// cache-walk with the canonical useLeadDetail hook (Spec 99 §B1) and
// renders the four §4.3 sections that were dead-coded prior — Cost
// Estimate (with range), Square Footage Projection, Target Start Date,
// Neighborhood Profile. SaveButton now reads is_saved from the detail
// query; useSaveLead mirrors optimistic state across both ['lead-feed']
// and ['lead-detail', id] cache keys for cold-boot deep-link correctness.

import React, { useCallback } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { OpportunityRing } from '@/components/feed/OpportunityRing';
import { SaveButton } from '@/components/shared/SaveButton';
import { useSaveLead } from '@/hooks/useSaveLead';
import { useLeadDetail } from '@/hooks/useLeadDetail';
import {
  formatCostTier,
  formatCurrencyAbbrev,
  formatIncome,
  formatSqft,
} from '@/lib/leadDetailFormat';

const MONTH_ABBR = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

function formatDateLong(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export default function LeadDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { mutate: saveLead } = useSaveLead();
  const insets = useSafeAreaInsets();

  // Spec 99 §B1 — canonical useQuery pattern. Replaces the pre-Spec-99
  // queryClient.getQueryCache().subscribe walk that this screen used to
  // rely on, which was a §B1 violation and broke cold-boot deep-link.
  const { data: detail, isLoading, isError } = useLeadDetail(id);

  const handleSaveToggle = useCallback(
    (leadId: string, saved: boolean) => {
      // LeadDetail.lead_type is 'permit' | 'coa'. CoA leads currently 404
      // from the backend (Spec 91 §4.3.1) so detail.lead_type is always
      // 'permit' here — narrow to the useSaveLead-accepted union.
      saveLead({ leadId, leadType: 'permit', saved });
    },
    [saveLead],
  );

  const cost = detail?.cost;
  const neighbourhood = detail?.neighbourhood;
  const costTierFmt = formatCostTier(cost?.tier ?? null);
  const costEstimated = formatCurrencyAbbrev(cost?.estimated ?? null);
  const costRangeLow = formatCurrencyAbbrev(cost?.range_low ?? null);
  const costRangeHigh = formatCurrencyAbbrev(cost?.range_high ?? null);
  const sqftLabel = formatSqft(cost?.modeled_gfa_sqm ?? null);

  // Per Multi-Agent Review null-handling rules: a section header renders
  // only when at least one leaf field has a non-null value. Avoids
  // "Neighborhood Profile: — / — / —" empty-shell rendering.
  const hasCostContent =
    cost !== null && cost !== undefined &&
    (costEstimated !== null || cost.tier !== null || costRangeLow !== null || costRangeHigh !== null);
  const hasSqft = sqftLabel !== null;
  const hasTargetDate = detail?.predicted_start != null;
  const hasNeighbourhood =
    neighbourhood !== null && neighbourhood !== undefined &&
    (neighbourhood.name !== null ||
      neighbourhood.avg_household_income !== null ||
      neighbourhood.median_household_income !== null ||
      neighbourhood.period_of_construction !== null);
  const hasDescription = !!(detail?.work_description || detail?.applicant);

  // Stale-data UX (Multi-Agent Review): render existing detail even on a
  // subsequent refetch error. Only show the not-found / error empty state
  // when there's no cached detail at all.
  const showStaleBanner = isError && !!detail;
  const showLoading = isLoading && !detail;
  const showNotFound = !isLoading && isError && !detail;

  return (
    <SafeAreaView className="flex-1 bg-zinc-950" edges={['top']}>
      <View className="px-4 pt-4 pb-3 border-b border-zinc-800 flex-row items-center">
        <Pressable
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
          style={{ minHeight: 44, justifyContent: 'center' }}
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

      {showLoading ? (
        <View testID="lead-detail-skeleton" className="flex-1 px-4 pt-6">
          <View className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-4 h-24" />
          <View className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-4 h-32" />
          <View className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-4 h-20" />
          <View className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 h-32" />
        </View>
      ) : showNotFound ? (
        <View testID="lead-detail-not-found" className="flex-1 items-center justify-center px-8">
          <Text className="text-zinc-300 text-base font-semibold">Lead not found</Text>
          <Text className="text-zinc-500 text-sm text-center mt-2 leading-5">
            This permit is no longer available. Return to the Lead Feed to reload.
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
      ) : detail ? (
        <>
          {showStaleBanner ? (
            <View
              testID="lead-detail-stale-banner"
              className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2"
            >
              <Text className="font-mono text-xs text-amber-300">
                Showing last loaded — refetch failed.
              </Text>
            </View>
          ) : null}

          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          >
            {/* Hero: address + permit + ring */}
            <View className="flex-row items-start gap-4">
              <OpportunityRing score={detail.opportunity_score ?? 0} />
              <View className="flex-1">
                <Text
                  className="text-zinc-100 text-xl font-bold"
                  numberOfLines={2}
                  accessibilityRole="header"
                >
                  {detail.address}
                </Text>
                {detail.permit_num ? (
                  <Text className="font-mono text-zinc-400 text-xs tracking-wider mt-1">
                    {detail.permit_num}
                    {detail.revision_num && detail.revision_num !== '00'
                      ? ` · Rev ${detail.revision_num}`
                      : ''}
                  </Text>
                ) : null}
                {neighbourhood?.name ? (
                  <Text className="text-zinc-500 text-xs mt-0.5" numberOfLines={1}>
                    {neighbourhood.name}
                  </Text>
                ) : null}
              </View>
            </View>

            {/* Signal pills — Spec 91 §4.1 rounded-md */}
            <View className="flex-row flex-wrap gap-2 mt-4">
              {detail.target_window === 'work' ? (
                <View className="bg-red-500/20 border border-red-500/40 rounded-md px-3 py-1">
                  <Text className="font-mono text-xs text-red-400">🚨 Rescue Mission</Text>
                </View>
              ) : detail.target_window === 'bid' ? (
                <View className="bg-amber-500/20 border border-amber-500/40 rounded-md px-3 py-1">
                  <Text className="font-mono text-xs text-amber-400">💎 Early Bid</Text>
                </View>
              ) : null}
              {cost?.tier ? (
                <View className="bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1">
                  <Text className="font-mono text-xs text-zinc-300">{costTierFmt.symbol}</Text>
                </View>
              ) : null}
              {detail.lifecycle_stalled ? (
                <View className="bg-red-500/20 border border-red-500/40 rounded-md px-3 py-1">
                  <Text className="font-mono text-xs text-red-400">⚠ Delayed</Text>
                </View>
              ) : null}
              {detail.competition_count > 0 ? (
                <View className="bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1">
                  <Text className="font-mono text-xs text-zinc-400">
                    👁 {detail.competition_count} tracking
                  </Text>
                </View>
              ) : null}
            </View>

            <View className="border-b border-zinc-800 my-5" />

            {/* Target Start Date — Spec 91 §4.3 */}
            {hasTargetDate ? (
              <>
                <Text className="font-mono text-xs text-zinc-500 uppercase tracking-widest mb-3">
                  Target Start Date
                </Text>
                <View
                  testID="lead-detail-target-date"
                  className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-5"
                >
                  <Text className="font-mono text-amber-500 text-2xl font-bold">
                    {formatDateLong(detail.predicted_start)}
                  </Text>
                  {detail.p25_days != null && detail.p75_days != null ? (
                    <Text className="font-mono text-xs text-zinc-500 mt-2 uppercase tracking-wider">
                      Range: {detail.p25_days >= 0 ? '+' : ''}{detail.p25_days} to {detail.p75_days >= 0 ? '+' : ''}{detail.p75_days} days
                    </Text>
                  ) : null}
                </View>
              </>
            ) : null}

            {/* Cost Estimate — Spec 91 §4.3 */}
            {hasCostContent ? (
              <>
                <Text className="font-mono text-xs text-zinc-500 uppercase tracking-widest mb-3">
                  Cost Estimate
                </Text>
                <View
                  testID="lead-detail-cost"
                  className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-5"
                >
                  {costEstimated ? (
                    <Text className="text-zinc-100 text-2xl font-bold">{costEstimated}</Text>
                  ) : (
                    <Text className="text-zinc-500 text-sm">Cost not disclosed</Text>
                  )}
                  {cost?.tier ? (
                    <Text className="font-mono text-xs text-zinc-400 mt-1 uppercase tracking-wider">
                      {costTierFmt.label} tier
                    </Text>
                  ) : null}
                  {costRangeLow && costRangeHigh ? (
                    <Text className="font-mono text-xs text-zinc-500 mt-2">
                      Range {costRangeLow} – {costRangeHigh}
                    </Text>
                  ) : null}
                </View>
              </>
            ) : null}

            {/* Square Footage Projection — Spec 91 §4.3, Spec 83 §2 */}
            {hasSqft ? (
              <>
                <Text className="font-mono text-xs text-zinc-500 uppercase tracking-widest mb-3">
                  Square Footage
                </Text>
                <View
                  testID="lead-detail-sqft"
                  className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-5"
                >
                  <Text className="text-zinc-100 text-2xl font-bold">{sqftLabel}</Text>
                  <Text className="font-mono text-xs text-zinc-500 mt-1 uppercase tracking-wider">
                    Modeled effective area
                  </Text>
                </View>
              </>
            ) : null}

            {/* Neighborhood Profile — Spec 91 §4.3, Spec 57 §2 */}
            {hasNeighbourhood ? (
              <>
                <Text className="font-mono text-xs text-zinc-500 uppercase tracking-widest mb-3">
                  Neighborhood Profile
                </Text>
                <View
                  testID="lead-detail-neighborhood"
                  className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-5"
                >
                  {neighbourhood?.name ? (
                    <Text className="text-zinc-100 text-base font-semibold mb-2">
                      {neighbourhood.name}
                    </Text>
                  ) : null}
                  {neighbourhood?.avg_household_income !== null && neighbourhood?.avg_household_income !== undefined ? (
                    <View className="flex-row items-center justify-between py-1">
                      <Text className="font-mono text-xs text-zinc-500 uppercase tracking-wider">
                        Avg Household Income
                      </Text>
                      <Text className="text-zinc-200 text-sm">
                        {formatIncome(neighbourhood.avg_household_income) ?? '—'}
                      </Text>
                    </View>
                  ) : null}
                  {neighbourhood?.median_household_income !== null && neighbourhood?.median_household_income !== undefined ? (
                    <View className="flex-row items-center justify-between py-1">
                      <Text className="font-mono text-xs text-zinc-500 uppercase tracking-wider">
                        Median Household Income
                      </Text>
                      <Text className="text-zinc-200 text-sm">
                        {formatIncome(neighbourhood.median_household_income) ?? '—'}
                      </Text>
                    </View>
                  ) : null}
                  {neighbourhood?.period_of_construction ? (
                    <View className="flex-row items-center justify-between py-1">
                      <Text className="font-mono text-xs text-zinc-500 uppercase tracking-wider">
                        Period of Construction
                      </Text>
                      <Text className="text-zinc-200 text-sm">
                        {neighbourhood.period_of_construction}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </>
            ) : null}

            {/* Project Details — Spec 91 §4.3 */}
            {hasDescription ? (
              <>
                <Text className="font-mono text-xs text-zinc-500 uppercase tracking-widest mb-3">
                  Project Details
                </Text>
                <View
                  testID="lead-detail-description"
                  className="bg-zinc-900 border border-zinc-800 rounded-xl p-4"
                >
                  {detail.applicant ? (
                    <View className="flex-row items-center gap-2 mb-2">
                      <Text className="font-mono text-xs text-zinc-500 uppercase tracking-wider">
                        Applicant
                      </Text>
                      <Text className="text-zinc-200 text-xs">{detail.applicant}</Text>
                    </View>
                  ) : null}
                  {detail.work_description ? (
                    <Text className="text-zinc-300 text-sm leading-5 mt-1">
                      {detail.work_description}
                    </Text>
                  ) : null}
                </View>
              </>
            ) : null}
          </ScrollView>

          {/* Sticky bottom CTA — Spec 91 §4.3 Primary Call to Action */}
          <View
            style={{ paddingBottom: insets.bottom + 12, paddingTop: 12 }}
            className="absolute left-0 right-0 bottom-0 border-t border-zinc-800 bg-zinc-950 px-4 flex-row items-center justify-between"
          >
            <View className="flex-1 mr-3">
              <Text className="text-zinc-400 text-xs">
                {detail.is_saved ? 'On your Flight Board' : 'Track this job'}
              </Text>
              <Text className="text-zinc-100 text-sm font-semibold" numberOfLines={1}>
                {detail.address}
              </Text>
            </View>
            {/* SaveButton testID follows the `save-button-{slot}` convention
                so the component's internal `.replace('save-button-', ...)` at
                SaveButton.tsx:75 produces the canonical filled/unfilled
                testIDs (`save-heart-filled-detail` / `save-heart-detail`).
                Multi-Agent Review BUG-1 (worktree): a non-conforming testID
                like `lead-detail-save-button` no-ops the replace and breaks
                Maestro state-discriminated assertions. */}
            <SaveButton
              leadId={detail.lead_id}
              isSaved={detail.is_saved}
              onToggle={handleSaveToggle}
              testID="save-button-detail"
            />
          </View>
        </>
      ) : null}
    </SafeAreaView>
  );
}
