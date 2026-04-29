// SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §4 Phone Input
// Custom Canada-first phone input. Replaces react-native-international-phone-number
// which was excluded due to a supply chain attack on its dependency
// @agnoliaarisian7180/string-argv (resolves to "latest" with no published version).
//
// This component supports CA only at launch — primary market is Canadian
// tradespeople. Country switching is a future enhancement when warranted.
import { View, Text, TextInput } from 'react-native';
import { useCallback } from 'react';

interface PhoneInputFieldProps {
  value: string; // E.164: "+14165551234" (or "" while user is typing)
  onChange: (e164: string) => void;
  editable?: boolean;
}

// Strip non-digits and group as XXX-XXX-XXXX (max 10 digits).
function formatDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function digitsOf(value: string): string {
  // E.164 stored as "+1XXXXXXXXXX". Strip leading "+1" to recover the
  // 10 national digits for display formatting.
  const digits = value.replace(/\D/g, '');
  return digits.startsWith('1') ? digits.slice(1) : digits;
}

export function PhoneInputField({ value, onChange, editable = true }: PhoneInputFieldProps) {
  const display = formatDisplay(digitsOf(value));

  const handleChange = useCallback(
    (text: string) => {
      const digits = text.replace(/\D/g, '').slice(0, 10);
      // Always emit E.164 with +1 prefix once user has entered any digits;
      // empty string while field is empty so callers can detect "no input yet".
      onChange(digits.length === 0 ? '' : `+1${digits}`);
    },
    [onChange],
  );

  return (
    <View className="bg-zinc-800 rounded-xl overflow-hidden flex-row mx-4">
      <View className="bg-zinc-700 px-4 py-4 flex-row items-center">
        <Text className="text-zinc-100 text-base">🇨🇦  +1</Text>
      </View>
      <View className="w-px bg-zinc-600" />
      <TextInput
        className="flex-1 px-4 py-4 text-zinc-100 text-base"
        keyboardType="phone-pad"
        placeholder="416-555-1234"
        placeholderTextColor="#71717a"
        value={display}
        onChangeText={handleChange}
        maxLength={12} // 10 digits + 2 hyphens
        editable={editable}
        autoComplete="tel"
        textContentType="telephoneNumber"
        accessibilityLabel="Phone number"
        testID="phone-input"
      />
    </View>
  );
}
