// SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §3.2 Account Linking, §4 Account Linking Bottom Sheet
import { forwardRef, useImperativeHandle, useRef, useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { Link2 } from 'lucide-react-native';

interface AccountLinkingSheetProps {
  existingMethod: string;
  newMethod: string;
  onLinkPress: () => void;
  onDismiss: () => void;
}

export interface AccountLinkingSheetRef {
  expand: () => void;
  close: () => void;
}

// Map Firebase provider IDs to user-facing names. fetchSignInMethodsForEmail
// returns provider IDs like 'password', 'google.com', 'apple.com', 'phone'.
export function providerName(providerId: string): string {
  switch (providerId) {
    case 'password':
      return 'email';
    case 'google.com':
      return 'Google';
    case 'apple.com':
      return 'Apple';
    case 'phone':
      return 'phone';
    default:
      return providerId;
  }
}

export const AccountLinkingSheet = forwardRef<AccountLinkingSheetRef, AccountLinkingSheetProps>(
  ({ existingMethod, newMethod, onLinkPress, onDismiss }, ref) => {
    const sheetRef = useRef<BottomSheet>(null);

    useImperativeHandle(ref, () => ({
      expand: () => sheetRef.current?.expand(),
      close: () => sheetRef.current?.close(),
    }));

    const handleSheetChanges = useCallback(
      (index: number) => {
        if (index === -1) onDismiss();
      },
      [onDismiss],
    );

    return (
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={['50%']}
        enablePanDownToClose
        keyboardBehavior="interactive"
        backgroundStyle={{ backgroundColor: '#18181b' }}
        handleIndicatorStyle={{ backgroundColor: '#3f3f46' }}
        onChange={handleSheetChanges}
      >
        <BottomSheetView style={{ flex: 1, padding: 24 }}>
          <View className="items-center mb-3">
            <Link2 size={24} color="#f59e0b" />
          </View>
          <Text className="text-zinc-100 text-base font-bold text-center mb-2">
            Email already registered
          </Text>
          <Text className="text-zinc-400 text-sm text-center mb-6">
            An account with this email already exists. Sign in with {existingMethod} to link your{' '}
            {newMethod} account.
          </Text>
          <Pressable
            onPress={onLinkPress}
            className="bg-amber-500 active:bg-amber-600 rounded-2xl py-3.5 mx-4 w-full items-center min-h-[52px] justify-center"
            accessibilityRole="button"
            accessibilityLabel={`Sign in with ${existingMethod}`}
          >
            <Text className="text-zinc-950 font-semibold text-sm">
              Sign in with {existingMethod}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => sheetRef.current?.close()}
            className="mt-3 items-center justify-center"
            style={{ minHeight: 44 }}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text className="text-zinc-500 text-sm text-center">Cancel</Text>
          </Pressable>
        </BottomSheetView>
      </BottomSheet>
    );
  },
);

AccountLinkingSheet.displayName = 'AccountLinkingSheet';
