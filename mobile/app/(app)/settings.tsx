import { View, Text } from 'react-native';

export default function SettingsScreen() {
  return (
    <View className="flex-1 bg-bg-feed items-center justify-center">
      <Text className="text-text-primary text-xl font-semibold">Settings</Text>
      <Text className="text-text-secondary mt-1 text-sm">Phase 6 — Spec 92 §2.3</Text>
    </View>
  );
}
