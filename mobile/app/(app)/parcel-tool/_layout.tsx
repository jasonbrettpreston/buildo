// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4 (screens)
//
// The Parcel Cost Tool tab hosts a nested Stack: search (index) → detail ([parcelId]).
// Routing stays inside the Stack — no router.replace effects here (AuthGate / AppLayout own the
// gate boundaries; Spec 99 §5). Headers are hidden; each screen renders its own SafeAreaView.
import { Stack } from 'expo-router';

export default function ParcelToolLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[parcelId]" />
    </Stack>
  );
}
