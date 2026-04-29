// SPEC LINK: docs/specs/03-mobile/94_mobile_onboarding.md §7, §9 Design
// Manufacturer holding screen — shown when account_preset='manufacturer' and
// onboarding_complete=false. The admin activates the account via the back office;
// a notification email is sent. Push token is NOT registered here (user has not
// completed onboarding and the permission prompt hasn't fired yet).
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';

export default function ManufacturerHoldScreen() {
  return (
    <SafeAreaView className="flex-1 bg-zinc-950 items-center justify-center px-8">
      {/* Emoji color is not CSS-controllable — use inline style */}
      <Text style={{ fontSize: 48, textAlign: 'center', marginBottom: 24 }}>🏗️</Text>

      <Text className="text-zinc-100 text-xl font-bold text-center">
        Your account is being configured.
      </Text>

      <Text className="text-zinc-400 text-sm text-center mt-2 leading-relaxed">
        We'll email you when your custom feed is ready.
      </Text>

      <Pressable
        onPress={() => void WebBrowser.openBrowserAsync('mailto:support@buildo.app')}
        className="bg-zinc-800 border border-zinc-700 rounded-2xl py-4 px-8 mt-10 min-h-[52px] flex-row items-center justify-center"
        accessibilityRole="button"
        accessibilityLabel="Contact Buildo support"
      >
        <Text className="text-zinc-100 font-bold text-base">Contact Buildo</Text>
      </Pressable>
    </SafeAreaView>
  );
}
