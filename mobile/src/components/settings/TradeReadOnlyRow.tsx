// SPEC LINK: docs/specs/03-mobile/95_mobile_user_profiles.md §9 Step 8
import { View, Text } from 'react-native';
import { Lock } from 'lucide-react-native';
import { useFilterStore } from '@/store/filterStore';

export function TradeReadOnlyRow() {
  const tradeSlug = useFilterStore((s) => s.tradeSlug);

  return (
    <View accessible={false}>
      <View
        className="flex-row items-center justify-between px-4 min-h-[52px] border-b border-zinc-800/50"
      >
        <Text className="text-zinc-400 text-sm">Trade</Text>
        <View
          className="flex-row items-center gap-2"
          accessibilityRole="text"
          accessibilityLabel={`Trade: ${tradeSlug}, locked`}
        >
          <Text className="text-zinc-500 text-sm font-mono">{tradeSlug}</Text>
          <Lock size={14} color="#52525b" />
        </View>
      </View>
      <Text
        className="text-zinc-600 text-xs mt-0.5 pb-3 px-4"
        accessibilityHint="To change trade, delete and re-register your account."
      >
        To change trade, delete and re-register your account.
      </Text>
    </View>
  );
}
