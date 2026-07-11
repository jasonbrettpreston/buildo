// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4 (ParcelDetailScreen)
//
// The full parcel story for one lot: envelope headlines · cost-menu cards (absent ≠ fits:false;
// max_build labeled "maximum envelope" on opt_aor fallback) · neighbours summary · EXAMPLES
// (FSI + build type prominent) · the reserved sponsor slot. Read-only; NO Layer-3 store.
import React from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useParcelLookup } from '@/hooks/useParcelLookup';
import { SponsorSlot } from '@/components/parcel/SponsorSlot';
import {
  COST_LINE_ORDER,
  COST_LINE_LABELS,
  getCostLine,
  costLineState,
  maxBuildBasisLabel,
  formatCurrency,
  formatFsi,
  formatSqft,
  formatSqm,
} from '@/lib/parcelCostFormat';
import type { ParcelCostLine } from '@/lib/schemas';

function Headline({ label, value }: { label: string; value: string | null }) {
  return (
    <View className="w-1/2 mb-3 pr-2">
      <Text className="text-zinc-500 text-xs uppercase tracking-wide">{label}</Text>
      <Text className="text-white text-base mt-0.5">{value ?? '—'}</Text>
    </View>
  );
}

function CostCard({ id, line, basisLabel }: { id: string; line: ParcelCostLine | null; basisLabel?: string }) {
  const state = costLineState(line);
  const label = COST_LINE_LABELS[id as keyof typeof COST_LINE_LABELS] ?? id;
  const isPerSqm = id === 'kitchen' || id === 'bath' || id === 'basement' || id === 'basement_underpin';
  const amount = state === 'available'
    ? (isPerSqm ? formatCurrency(line?.per_sqm) : formatCurrency(line?.total))
    : null;
  return (
    <View
      testID={`parcel-cost-${id}`}
      className="flex-row items-center justify-between py-3 px-3 mb-2 bg-zinc-900 rounded-xl border border-zinc-800"
    >
      <View className="flex-1 pr-3">
        <Text className="text-white text-sm">{label}</Text>
        {basisLabel ? (
          <Text testID={`parcel-cost-${id}-basis`} className="text-zinc-500 text-xs mt-0.5">
            {basisLabel}
          </Text>
        ) : null}
      </View>
      {state === 'available' ? (
        <Text className="text-amber-400 text-base">
          {amount ?? '—'}{isPerSqm ? '/m²' : ''}
        </Text>
      ) : state === 'no_fit' ? (
        <Text testID={`parcel-cost-${id}-nofit`} className="text-zinc-500 text-xs">
          doesn&apos;t fit this lot
        </Text>
      ) : (
        <Text testID={`parcel-cost-${id}-na`} className="text-zinc-600 text-xs">
          n/a
        </Text>
      )}
    </View>
  );
}

export default function ParcelDetailScreen() {
  const router = useRouter();
  const { parcelId } = useLocalSearchParams<{ parcelId: string }>();
  const { data, isLoading, isError } = useParcelLookup(parcelId);

  const header = (
    <View className="flex-row items-center px-2 pt-2 pb-2 border-b border-zinc-800/50">
      <Pressable onPress={() => router.back()} className="p-2" testID="parcel-detail-back">
        <ChevronLeft size={24} color="#e4e4e7" />
      </Pressable>
      <Text className="text-white text-base flex-1" numberOfLines={1}>
        {data?.match?.address || 'Parcel'}
      </Text>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-zinc-950" edges={['top']}>
        {header}
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#f59e0b" />
        </View>
      </SafeAreaView>
    );
  }

  if (isError || !data || data.parcel == null) {
    return (
      <SafeAreaView className="flex-1 bg-zinc-950" edges={['top']}>
        {header}
        <View className="flex-1 items-center justify-center px-6">
          <Text testID="parcel-detail-empty" className="text-zinc-500 text-center">
            {isError ? 'Could not load this parcel. Pull back and try again.' : 'No parcel found.'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const { parcel } = data;
  const { areas, costMenu, neighbourhood } = parcel;
  const menu = costMenu.menu;
  const comps = neighbourhood.comparableBuilds ?? [];
  const coa = neighbourhood.coaProjects;

  return (
    <SafeAreaView className="flex-1 bg-zinc-950" edges={['top']}>
      {header}
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 120 }}>
        {/* 1. Lot + envelope headlines */}
        <View className="px-4 pt-4">
          <Text className="font-mono text-xs text-zinc-400 uppercase tracking-widest mb-3">
            The lot
          </Text>
          <View className="flex-row flex-wrap">
            <Headline label="Lot size" value={formatSqm(areas.lot_size_sqm)} />
            <Headline label="Max buildable GFA" value={formatSqft(areas.max_buildable_gfa_sqm)} />
            <Headline label="As-of-right GFA" value={formatSqft(areas.opt_aor_gfa_sqm)} />
            <Headline label="Max build storeys" value={areas.max_build_stories != null ? String(areas.max_build_stories) : null} />
            <Headline label="Max build FSI" value={formatFsi(areas.max_build_fsi)} />
            <Headline label="CoA FSI" value={formatFsi(areas.coa_fsi)} />
          </View>
          {areas.envelope_constrained ? (
            <Text className="text-zinc-500 text-xs">
              Envelope constrained{areas.envelope_constraint_reason ? `: ${areas.envelope_constraint_reason}` : ''}
            </Text>
          ) : null}
        </View>

        {/* 2. Cost menu */}
        <View className="px-4 pt-6">
          <Text className="font-mono text-xs text-zinc-400 uppercase tracking-widest mb-3">
            What it costs
          </Text>
          {menu == null ? (
            <Text testID="parcel-cost-none" className="text-zinc-500 text-sm">
              Cost menu not yet computed for this parcel.
            </Text>
          ) : (
            COST_LINE_ORDER.map((id) => (
              <CostCard
                key={id}
                id={id}
                line={getCostLine(menu, id)}
                basisLabel={id === 'max_build' ? maxBuildBasisLabel(areas) : undefined}
              />
            ))
          )}
        </View>

        {/* 3. Neighbours summary */}
        {neighbourhood.summary != null || neighbourhood.compStats.compCount != null ? (
          <View className="px-4 pt-6">
            <Text className="font-mono text-xs text-zinc-400 uppercase tracking-widest mb-3">
              The neighbourhood
            </Text>
            {neighbourhood.summary?.headline ? (
              <Text className="text-white text-sm mb-1">{neighbourhood.summary.headline}</Text>
            ) : null}
            <View className="flex-row flex-wrap mt-1">
              <Headline label="Comparable builds" value={neighbourhood.compStats.compCount != null ? String(neighbourhood.compStats.compCount) : null} />
              <Headline label="Typical FSI (p50)" value={formatFsi(neighbourhood.compStats.compFsiP50)} />
              <Headline label="Dominant build" value={neighbourhood.compStats.compDominantBuild} />
            </View>
          </View>
        ) : null}

        {/* 4. EXAMPLES — FSI + build type prominent */}
        {comps.length > 0 ? (
          <View className="px-4 pt-6">
            <Text className="font-mono text-xs text-zinc-400 uppercase tracking-widest mb-3">
              Nearby examples
            </Text>
            {comps.map((c, i) => (
              <View key={`${c.address ?? 'comp'}-${i}`} testID={`parcel-comp-${i}`} className="py-3 px-3 mb-2 bg-zinc-900 rounded-xl border border-zinc-800">
                <View className="flex-row items-center justify-between">
                  <Text className="text-amber-400 text-sm">
                    FSI {formatFsi(c.permit_fsi) ?? '—'}
                  </Text>
                  <Text className="text-zinc-300 text-xs">
                    {c.structure_family ?? c.work_type ?? 'build'}
                  </Text>
                </View>
                <Text className="text-white text-sm mt-1">{c.address ?? 'Nearby parcel'}</Text>
                <Text className="text-zinc-500 text-xs mt-0.5">
                  {formatSqft(c.permit_gfa_sqm) ?? '—'}
                  {c.coa_decision ? ` · CoA: ${c.coa_decision}` : ''}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {coa.length > 0 ? (
          <View className="px-4 pt-6">
            <Text className="font-mono text-xs text-zinc-400 uppercase tracking-widest mb-3">
              In front of the Committee of Adjustment
            </Text>
            {coa.map((p, i) => (
              <View key={p.applicationNumber ?? `coa-${i}`} testID={`parcel-coa-${i}`} className="py-3 px-3 mb-2 bg-zinc-900 rounded-xl border border-zinc-800">
                <View className="flex-row items-center justify-between">
                  <Text className="text-zinc-300 text-xs">{p.projectType ?? 'Application'}</Text>
                  <Text className="text-zinc-400 text-xs">{p.decision ?? p.status ?? 'undecided'}</Text>
                </View>
                <Text className="text-white text-sm mt-1">{p.address ?? p.applicationNumber ?? '—'}</Text>
                {p.description ? (
                  <Text className="text-zinc-500 text-xs mt-0.5" numberOfLines={2}>{p.description}</Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {/* 5. Reserved sponsor slot (Spec 100 §8) — renders null in v1. */}
        <SponsorSlot placement="detail_footer" />
      </ScrollView>
    </SafeAreaView>
  );
}
