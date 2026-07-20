// SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §3.2 Account Linking, §4 Account Linking Bottom Sheet
//
// P2-G7: Supabase Auth has no `fetchSignInMethodsForEmail` equivalent — a
// deliberate anti-account-enumeration design choice. The sheet therefore
// names ONLY the attempted method ({newMethod}); the old `existingMethod`
// prop and the Firebase provider-ID → display-name `providerName()` mapper
// are removed. The primary action is a generic "Back to sign in" that
// returns the user to the standard sign-in stack — they pick their original
// method themselves (Spec 93 §4 Account Linking Bottom Sheet).
import { forwardRef, useImperativeHandle, useRef, useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { Link2 } from 'lucide-react-native';

interface AccountLinkingSheetProps {
  newMethod: string;
  onLinkPress: () => void;
  onDismiss: () => void;
}

export interface AccountLinkingSheetRef {
  expand: () => void;
  close: () => void;
}

export const AccountLinkingSheet = forwardRef<AccountLinkingSheetRef, AccountLinkingSheetProps>(
  ({ newMethod, onLinkPress, onDismiss }, ref) => {
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
            An account with this email already exists. Sign in with your original method, then
            link your {newMethod} account from there.
          </Text>
          <Pressable
            onPress={onLinkPress}
            className="bg-amber-500 active:bg-amber-600 rounded-2xl py-3.5 mx-4 w-full items-center min-h-[52px] justify-center"
            accessibilityRole="button"
            accessibilityLabel="Back to sign in"
          >
            <Text className="text-zinc-950 font-semibold text-sm">
              Back to sign in
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
