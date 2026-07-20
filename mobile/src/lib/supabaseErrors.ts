// SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §3.2, §4
// Maps GoTrue `AuthApiError.code` values to user-facing messages (renamed
// from firebaseErrors.ts in the Spec 93 SDK swap). The raw codes leak
// implementation detail and don't help the user — these messages tell them
// what to do next.
//
// Contract preserved from the Firebase version: signature shape
// `(code: string | undefined) => string`; user-cancelled native flows
// (Apple/Google sheet dismissed) reject from the PROVIDER SDK, not Supabase —
// handled at the call site with no error message, same as the old
// `auth/popup-closed-by-user` empty-string branch.
export function mapSupabaseError(code: string | undefined): string {
  switch (code) {
    case 'invalid_credentials':
      return 'Incorrect email or password.';
    case 'user_not_found':
      return 'No account found with that email.';
    case 'email_exists':
      return 'That email is already registered.';
    case 'weak_password':
      return 'Password must be at least 6 characters.';
    case 'email_address_invalid':
      return 'That email address is not valid.';
    case 'over_request_rate_limit':
    case 'over_sms_send_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Too many attempts. Try again in a few minutes.';
    case 'otp_expired':
      return 'That code has expired. Request a new one.';
    case 'validation_failed':
      return 'That phone number is not valid.';
    default:
      return 'Sign-in failed. Please try again.';
  }
}

export function isAccountLinkingError(code: string | undefined): boolean {
  return code === 'email_exists';
}
