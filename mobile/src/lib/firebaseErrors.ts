// SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §3.2, §4
// Maps Firebase Auth error codes to user-facing messages. The raw codes leak
// implementation detail and don't help the user — these messages tell them
// what to do next.
export function mapFirebaseError(code: string | undefined): string {
  switch (code) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
      return 'Incorrect email or password.';
    case 'auth/user-not-found':
      return 'No account found with that email.';
    case 'auth/email-already-in-use':
      return 'That email is already registered.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/invalid-email':
      return 'That email address is not valid.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Try again in a few minutes.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    case 'auth/invalid-verification-code':
      return 'Incorrect code — try again.';
    case 'auth/invalid-phone-number':
      return 'That phone number is not valid.';
    case 'auth/missing-phone-number':
      return 'Enter a phone number to continue.';
    case 'auth/code-expired':
      return 'That code has expired. Request a new one.';
    case 'auth/cancelled-popup-request':
    case 'auth/popup-closed-by-user':
      return ''; // user cancelled — no error message
    default:
      return 'Sign-in failed. Please try again.';
  }
}

export function isAccountLinkingError(code: string | undefined): boolean {
  return code === 'auth/account-exists-with-different-credential';
}
