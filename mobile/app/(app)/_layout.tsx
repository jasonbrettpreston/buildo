import { Tabs } from 'expo-router';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function AppLayout() {
  return (
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
}
