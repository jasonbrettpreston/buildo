import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setAuth } = useAuthStore();

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      // TODO Phase 1b — wire full OAuth flow:
      //   1. npm install firebase expo-web-browser
      //   2. expo-auth-session/providers/google → promptAsync()
      //   3. GoogleAuthProvider.credential(id_token)
      //   4. signInWithCredential(auth, credential)
      //   5. user.getIdToken() → setAuth(user, idToken)
      //
      // Stub: simulates the auth shape so navigation and store are testable.
      await new Promise((r) => setTimeout(r, 500));
      setAuth(
        { uid: 'stub-uid', email: 'user@example.com', displayName: 'Dev User' },
        'stub.id.token',
      );
    } catch {
      setError('Sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-bg-feed">
      <View className="flex-1 px-6 justify-between py-12">
        {/* Brand */}
        <View className="items-center pt-16">
          <Text className="text-amber-hardhat font-mono text-5xl font-bold tracking-widest">
            BUILDO
          </Text>
          <Text className="text-text-secondary text-sm font-mono tracking-wider mt-2 uppercase">
            Construction Lead Intelligence
          </Text>
        </View>

        {/* CTA */}
        <View className="gap-4">
          {error && (
            <View className="bg-red-alert/10 border border-red-alert/30 rounded px-4 py-3">
              <Text className="text-red-alert text-sm font-mono">{error}</Text>
            </View>
          )}

          <TouchableOpacity
            onPress={handleGoogleSignIn}
            disabled={loading}
            className="bg-amber-hardhat rounded-sm py-4 px-6 items-center flex-row justify-center gap-3 active:opacity-80"
            accessibilityRole="button"
            accessibilityLabel="Sign in with Google"
          >
            {loading ? (
              <ActivityIndicator color="#09090b" />
            ) : (
              <>
                <Text className="text-zinc-950 font-semibold text-base tracking-wide">
                  Continue with Google
                </Text>
              </>
            )}
          </TouchableOpacity>

          <Text className="text-text-muted text-xs text-center leading-relaxed">
            By continuing you agree to Buildo&apos;s Terms of Service and Privacy Policy.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
