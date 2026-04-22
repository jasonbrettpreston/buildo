import { Tabs } from 'expo-router';
import { View } from 'react-native';

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#18181b',
          borderTopColor: '#3f3f46',
        },
        tabBarActiveTintColor: '#f59e0b',
        tabBarInactiveTintColor: '#71717a',
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Lead Feed' }} />
      <Tabs.Screen name="flight-board" options={{ title: 'Flight Board' }} />
      <Tabs.Screen name="map" options={{ title: 'Map' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
