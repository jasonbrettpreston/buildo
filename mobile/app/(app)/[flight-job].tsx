import { useLocalSearchParams } from 'expo-router';
import { View, Text } from 'react-native';

export default function FlightJobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <View className="flex-1 bg-bg-feed items-center justify-center">
      <Text className="text-text-primary text-xl font-semibold">Flight Board Detail</Text>
      <Text className="text-text-secondary font-mono mt-1 text-sm">{id}</Text>
      <Text className="text-text-muted mt-1 text-xs">Best Case</Text>
      <Text className="text-text-muted mt-1 text-xs">Worst Case</Text>
      <Text className="text-text-muted mt-1 text-xs">Phase 5 — Spec 77 §3.3</Text>
    </View>
  );
}
