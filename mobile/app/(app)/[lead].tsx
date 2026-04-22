import { useLocalSearchParams } from 'expo-router';
import { View, Text } from 'react-native';

export default function LeadDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <View className="flex-1 bg-bg-feed items-center justify-center">
      <Text className="text-text-primary text-xl font-semibold">Permit Details</Text>
      <Text className="text-text-secondary font-mono mt-1 text-sm">{id}</Text>
      <Text className="text-text-muted mt-1 text-xs">Phase 3 — Spec 91 §4.3</Text>
    </View>
  );
}
