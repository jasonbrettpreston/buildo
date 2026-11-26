// SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §5 (the sign-in screen), docs/specs/03-mobile/98_mobile_testing_protocol.md §4 (behaviour tests).
//
// task-313 McApp card 1 (PLAN-313-v1 M8, T8; phone walk finding 7: a wrong email showed nothing). A wrong email or password takes one path:
// signInWithPassword, handleAuthError, mapSupabaseError, which always returns text. The likely cause was the open keyboard covering the error line, so
// the email handler closes the keyboard first. This test pins the order and the text; the occlusion itself is proven only on a device (the phone walk
// types a wrong email with the keyboard up).
require('react-native-css-interop/test');
import * as React from 'react';
import { Keyboard } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false }), useLocalSearchParams: () => ({}) }));
jest.mock('expo-haptics', () => ({ notificationAsync: jest.fn(async () => undefined), NotificationFeedbackType: { Success: 'success', Error: 'error' } }));
jest.mock('expo-apple-authentication', () => ({ AppleAuthenticationButton: () => null, AppleAuthenticationButtonType: { SIGN_IN: 0 }, AppleAuthenticationButtonStyle: { WHITE: 0 } }));
jest.mock('@react-native-google-signin/google-signin', () => ({ GoogleSignin: { configure: jest.fn() }, isSuccessResponse: () => false, isErrorWithCode: () => false, statusCodes: {} }));
jest.mock('@gorhom/bottom-sheet', () => ({ __esModule: true, ...jest.requireActual('@gorhom/bottom-sheet/mock') }));
jest.mock('@sentry/react-native', () => ({ captureException: jest.fn(), captureMessage: jest.fn(), addBreadcrumb: jest.fn() }));
const mockSignIn = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: { auth: { signInWithPassword: (...a: unknown[]) => mockSignIn(...a), linkIdentity: jest.fn() } } }));
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('@/lib/appleAuth', () => ({ prepareAppleNonce: jest.fn() }));
jest.mock('@/components/auth/GoogleSignInButton', () => ({ GoogleSignInButton: () => null }));
jest.mock('@/components/auth/PhoneInputField', () => ({ PhoneInputField: () => null }));
jest.mock('@/components/auth/OtpInputField', () => ({ OtpInputField: () => null }));
jest.mock('@/components/auth/AccountLinkingSheet', () => {
  const R = jest.requireActual('react');
  return { AccountLinkingSheet: R.forwardRef(() => null) };
});

const SignIn = require('../app/(auth)/sign-in').default as React.ComponentType;

beforeEach(() => {
  mockSignIn.mockReset();
});

describe('sign-in: a wrong email or password shows the error with the keyboard closed (finding 7)', () => {
  it('invalid_credentials: Keyboard.dismiss is called before the call, and "Incorrect email or password." is shown', async () => {
    const order: string[] = [];
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => { order.push('dismiss'); });
    mockSignIn.mockImplementation(async () => { order.push('signIn'); return { data: { user: null }, error: { code: 'invalid_credentials', message: 'Invalid login credentials' } }; });
    render(<SignIn />);
    fireEvent.press(screen.getByTestId('email-button'));
    fireEvent.changeText(screen.getByTestId('email-input'), 'wrong@example.invalid');
    fireEvent.changeText(screen.getByTestId('password-input'), 'not-the-password');
    await act(async () => { fireEvent.press(screen.getByTestId('email-submit')); });
    expect(dismiss).toHaveBeenCalled();
    expect(order).toEqual(['dismiss', 'signIn']);
    expect(screen.getByText('Incorrect email or password.')).toBeTruthy();
    dismiss.mockRestore();
  });
  it('an empty form still closes the keyboard and says what is missing', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    render(<SignIn />);
    fireEvent.press(screen.getByTestId('email-button'));
    await act(async () => { fireEvent.press(screen.getByTestId('email-submit')); });
    expect(dismiss).toHaveBeenCalled();
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(screen.getByText('Enter your email and password.')).toBeTruthy();
    dismiss.mockRestore();
  });
});
