// SPEC LINK: docs/specs/03-mobile/77_mobile_crm_flight_board.md §3.2 Temporal Grouping
// Three urgency tiers: red (action_required), amber (departing_soon), zinc (on_the_horizon).
// Left-border accent communicates urgency without requiring the label to be read first.
import React from 'react';
import { View, Text } from 'react-native';

type TemporalGroup = 'action_required' | 'departing_soon' | 'on_the_horizon';

const SECTION_CONFIG: Record<
  TemporalGroup,
  { label: string; borderColor: string; labelColor: string }
> = {
  action_required: {
    label: 'ACTION REQUIRED',
    borderColor: '#ef4444',
    labelColor: '#f87171',
  },
  departing_soon: {
    label: 'DEPARTING SOON',
    borderColor: '#f59e0b',
    labelColor: '#fbbf24',
  },
  on_the_horizon: {
    label: 'ON THE HORIZON',
    borderColor: '#52525b',
    labelColor: '#71717a',
  },
};

interface Props {
  group: TemporalGroup;
  count: number;
}

export function TemporalSectionHeader({ group, count }: Props) {
  const config = SECTION_CONFIG[group];
  return (
    <View
      accessibilityRole="header"
      accessibilityLabel={`${config.label}, ${count} ${count === 1 ? 'job' : 'jobs'}`}
      className="flex-row items-center justify-between py-3 px-4 bg-zinc-950 border-b border-zinc-800/50"
      style={{ borderLeftWidth: 2, borderLeftColor: config.borderColor }}
    >
      <Text
        className="font-mono text-xs tracking-widest uppercase pl-3"
        style={{ color: config.labelColor }}
      >
        {config.label}
      </Text>
      <Text className="font-mono text-xs text-zinc-600">{count}</Text>
    </View>
  );
}
