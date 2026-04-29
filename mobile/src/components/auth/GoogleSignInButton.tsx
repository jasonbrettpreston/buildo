// SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §4 Google Sign-In Button
import { Pressable, Text, ActivityIndicator, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface GoogleSignInButtonProps {
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  label?: string;
}

// Google "G" logo SVG (Material brand mark — public Google identity).
function GoogleLogo() {
  return (
    <Svg width={20} height={20} viewBox="0 0 48 48">
      <Path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <Path
        fill="#FF3D00"
        d="M6.3 14.1l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.1z"
      />
      <Path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.4-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-8L6.1 33c3.3 6.5 10.1 11 17.9 11z"
      />
      <Path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.6l6.2 5.2C39.9 35.6 44 30.4 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </Svg>
  );
}

export function GoogleSignInButton({
  onPress,
  loading = false,
  disabled = false,
  label = 'Sign in with Google',
}: GoogleSignInButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading || disabled}
      style={({ pressed }) => ({
        opacity: loading ? 0.7 : pressed ? 0.85 : 1,
      })}
      className="bg-zinc-900 border border-zinc-700 rounded-2xl py-4 px-5 flex-row items-center justify-center w-full min-h-[52px]"
      accessibilityRole="button"
      accessibilityLabel={label}
      testID="google-sign-in-button"
    >
      {loading ? (
        <ActivityIndicator size="small" color="#71717a" />
      ) : (
        <>
          <View className="mr-3">
            <GoogleLogo />
          </View>
          <Text className="text-zinc-100 text-sm font-semibold">{label}</Text>
        </>
      )}
    </Pressable>
  );
}
