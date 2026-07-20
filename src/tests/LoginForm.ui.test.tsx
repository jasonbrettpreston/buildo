// @vitest-environment jsdom
// SPEC LINK: docs/specs/00-architecture/13_authentication.md §3.3, §3.6, §4, §4a
//            .cursor/phase1_plan.md Item 1 + Item 2 (LoginForm.tsx row)
//
// WF3 2026-07-20: LoginForm never rendered a login-time TOTP step — an
// MFA-enrolled admin's password sign-in silently left the session at aal1
// forever with no code-entry UI and no error, which read as the "Please
// wait..." button hanging. These tests lock: (1) an aal2-required sign-in
// renders the code step instead of calling onSuccess, (2) a wrong code
// resets the Verify button and shows an error without dropping back to the
// password form, (3) the plain (no-MFA) success path is unchanged, (4) a
// hard failure on the password step itself always resets the loading state.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

const mockSignInAction = vi.fn();
const mockSignUpAction = vi.fn();
const mockMfaChallengeAction = vi.fn();
const mockMfaVerifyAction = vi.fn();

vi.mock('@/lib/supabase/actions', () => ({
  signInAction: (...a: unknown[]) => mockSignInAction(...a),
  signUpAction: (...a: unknown[]) => mockSignUpAction(...a),
  mfaChallengeAction: (...a: unknown[]) => mockMfaChallengeAction(...a),
  mfaVerifyAction: (...a: unknown[]) => mockMfaVerifyAction(...a),
}));

vi.mock('@/lib/supabase/browser', () => ({
  createClient: () => ({
    auth: { signInWithOAuth: vi.fn().mockResolvedValue({ error: null }) },
  }),
}));

import { LoginForm } from '@/components/auth/LoginForm';

async function fillAndSubmitPassword() {
  fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: 'jasonbrettpreston@gmail.com' } });
  fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: 'MaxBLD-local-2026!' } });
  fireEvent.click(screen.getByRole('button', { name: /^Sign In$/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('<LoginForm> plain password sign-in (no MFA)', () => {
  it('calls onSuccess directly when signInAction reports no mfaRequired', async () => {
    mockSignInAction.mockResolvedValue({ error: null });
    const onSuccess = vi.fn();
    render(<LoginForm onSuccess={onSuccess} />);

    await fillAndSubmitPassword();

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(mockMfaChallengeAction).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/Code/i)).toBeNull();
  });

  it('shows the server error and resets the button on a bad password (loading never sticks)', async () => {
    mockSignInAction.mockResolvedValue({ error: 'Invalid login credentials' });
    const onSuccess = vi.fn();
    render(<LoginForm onSuccess={onSuccess} />);

    await fillAndSubmitPassword();

    expect(await screen.findByText(/Invalid login credentials/i)).toBeTruthy();
    expect(onSuccess).not.toHaveBeenCalled();
    const button = screen.getByRole('button', { name: /^Sign In$/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe('Sign In');
  });

  it('resets the button and shows an error if signInAction throws', async () => {
    mockSignInAction.mockRejectedValue(new Error('network down'));
    render(<LoginForm onSuccess={vi.fn()} />);

    await fillAndSubmitPassword();

    expect(await screen.findByText(/network down/i)).toBeTruthy();
    const button = screen.getByRole('button', { name: /^Sign In$/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });
});

describe('<LoginForm> admin TOTP step-up', () => {
  it('renders the code step (not onSuccess) when signInAction reports mfaRequired', async () => {
    mockSignInAction.mockResolvedValue({ error: null, mfaRequired: true, factorId: 'factor-1' });
    const onSuccess = vi.fn();
    render(<LoginForm onSuccess={onSuccess} />);

    await fillAndSubmitPassword();

    expect(await screen.findByText(/Verification code/i)).toBeTruthy();
    expect(screen.getByLabelText(/Code/i)).toBeTruthy();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('wrong code: resets the Verify button, shows the error, and stays on the code step', async () => {
    mockSignInAction.mockResolvedValue({ error: null, mfaRequired: true, factorId: 'factor-1' });
    mockMfaChallengeAction.mockResolvedValue({ challengeId: 'challenge-1', error: null });
    mockMfaVerifyAction.mockResolvedValue({ error: 'Invalid one-time code' });
    const onSuccess = vi.fn();
    render(<LoginForm onSuccess={onSuccess} />);

    await fillAndSubmitPassword();
    await screen.findByText(/Verification code/i);

    fireEvent.change(screen.getByLabelText(/Code/i), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: /^Verify$/i }));

    expect(await screen.findByText(/Invalid one-time code/i)).toBeTruthy();
    expect(onSuccess).not.toHaveBeenCalled();
    const verifyButton = screen.getByRole('button', { name: /^Verify$/i });
    // Button re-disables on an empty code (the field is cleared on failure)
    // rather than staying stuck in "Verifying..." — the exact regression
    // this WF3 fixes for the password step now also holds for the MFA step.
    expect(verifyButton.textContent).toBe('Verify');
    expect(mockMfaVerifyAction).toHaveBeenCalledWith('factor-1', 'challenge-1', '000000');
  });

  it('correct code calls onSuccess after challenge + verify', async () => {
    mockSignInAction.mockResolvedValue({ error: null, mfaRequired: true, factorId: 'factor-1' });
    mockMfaChallengeAction.mockResolvedValue({ challengeId: 'challenge-1', error: null });
    mockMfaVerifyAction.mockResolvedValue({ error: null });
    const onSuccess = vi.fn();
    render(<LoginForm onSuccess={onSuccess} />);

    await fillAndSubmitPassword();
    await screen.findByText(/Verification code/i);

    fireEvent.change(screen.getByLabelText(/Code/i), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /^Verify$/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(mockMfaChallengeAction).toHaveBeenCalledWith('factor-1');
    expect(mockMfaVerifyAction).toHaveBeenCalledWith('factor-1', 'challenge-1', '123456');
  });

  it('a challenge-start failure surfaces its error and does not call verify', async () => {
    mockSignInAction.mockResolvedValue({ error: null, mfaRequired: true, factorId: 'factor-1' });
    mockMfaChallengeAction.mockResolvedValue({ challengeId: null, error: 'rate limited' });
    render(<LoginForm onSuccess={vi.fn()} />);

    await fillAndSubmitPassword();
    await screen.findByText(/Verification code/i);

    fireEvent.change(screen.getByLabelText(/Code/i), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /^Verify$/i }));

    expect(await screen.findByText(/rate limited/i)).toBeTruthy();
    expect(mockMfaVerifyAction).not.toHaveBeenCalled();
  });

  it('"Back to sign in" discards the challenge state and returns to the password form', async () => {
    mockSignInAction.mockResolvedValue({ error: null, mfaRequired: true, factorId: 'factor-1' });
    render(<LoginForm onSuccess={vi.fn()} />);

    await fillAndSubmitPassword();
    await screen.findByText(/Verification code/i);

    fireEvent.click(screen.getByRole('button', { name: /Back to sign in/i }));

    expect(screen.getByText(/Sign In to MaxBLD/i)).toBeTruthy();
    expect(screen.queryByLabelText(/Code/i)).toBeNull();
  });
});
