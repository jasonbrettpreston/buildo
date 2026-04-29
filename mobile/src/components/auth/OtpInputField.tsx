// SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §4 OTP Entry
// Wraps input-otp-native using its actual render-prop API.
// The spec text described `pinCount` / `cellStyle` / `focusedCellStyle` props —
// those do NOT exist in v0.6.0. The library uses a render-prop pattern where
// each slot is rendered manually with full styling control.
import { OTPInput } from 'input-otp-native';
import { View, Text } from 'react-native';

interface OtpInputFieldProps {
  maxLength?: number;
  onComplete: (code: string) => void;
  onChange?: (value: string) => void;
  errorMode?: boolean;
  autoFocus?: boolean;
}

export function OtpInputField({
  maxLength = 6,
  onComplete,
  onChange,
  errorMode = false,
  autoFocus = true,
}: OtpInputFieldProps) {
  return (
    <View className="flex-row gap-2 justify-center mx-4">
      <OTPInput
        maxLength={maxLength}
        onComplete={onComplete}
        onChange={onChange}
        autoFocus={autoFocus}
        testID="otp-input"
        render={({ slots }) => (
          <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
            {slots.map((slot, idx) => (
              <View
                key={idx}
                style={{
                  width: 48,
                  height: 56,
                  borderRadius: 12,
                  backgroundColor: '#27272a',
                  borderWidth: 2,
                  borderColor: errorMode
                    ? '#f87171'
                    : slot.isActive
                      ? '#f59e0b'
                      : '#3f3f46',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    color: '#f4f4f5',
                    fontSize: 24,
                    fontFamily: 'SpaceMono',
                  }}
                >
                  {slot.char ?? (slot.hasFakeCaret ? '|' : '')}
                </Text>
              </View>
            ))}
          </View>
        )}
      />
    </View>
  );
}
