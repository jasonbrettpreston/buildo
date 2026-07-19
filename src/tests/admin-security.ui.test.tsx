// @vitest-environment jsdom
// 🔗 SPEC LINK: docs/specs/00-architecture/13_authentication.md §3.6 (MFA gate)
//             .cursor/phase1_plan.md Item 6 / P1-F4.3 (fold 22 minimums)
//
// UI tests for /admin/security: the four status states (loading/error/
// not-enrolled/enrolled), the enroll → QR+secret one-time screen → verify →
// one-time backup-codes screen flow, code validation (Zod, 6 digits), and
// the role="alertdialog" unenroll confirm.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

const mockUseMfaStatus = vi.fn();
const mockEnrollMutate = vi.fn();
const mockVerifyMutate = vi.fn();
const mockUnenrollMutate = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();

vi.mock('@/features/admin-security/api/useAdminSecurity', () => ({
  useMfaStatus: (...a: unknown[]) => mockUseMfaStatus(...a),
  useMfaEnroll: () => ({ mutate: mockEnrollMutate, isPending: false }),
  useMfaVerify: () => ({ mutate: mockVerifyMutate, isPending: false }),
  useMfaUnenroll: () => ({ mutate: mockUnenrollMutate, isPending: false }),
}));

vi.mock('sonner', () => ({
  Toaster: () => null,
  toast: {
    error: (...a: unknown[]) => mockToastError(...a),
    success: (...a: unknown[]) => mockToastSuccess(...a),
  },
}));

import AdminSecurityPage from '@/app/admin/security/page';

const idle = { data: undefined, isLoading: false, isError: false, error: null };

const notEnrolled = {
  ...idle,
  data: { factors: [], backup_codes_remaining: 0 },
};

const enrolled = {
  ...idle,
  data: {
    factors: [
      {
        id: 'factor-1',
        friendly_name: 'Buildo Admin TOTP',
        status: 'verified',
        created_at: '2026-07-18T12:00:00Z',
      },
    ],
    backup_codes_remaining: 10,
  },
};

const ENROLL_RESULT = {
  factor_id: 'factor-1',
  qr_code: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
  secret: 'JBSWY3DPEHPK3PXP',
  uri: 'otpauth://totp/buildo?secret=JBSWY3DPEHPK3PXP',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseMfaStatus.mockReturnValue(notEnrolled);
});

describe('<AdminSecurityPage> status states', () => {
  it('shows a loading line while the status query is in flight', () => {
    mockUseMfaStatus.mockReturnValue({ ...idle, isLoading: true });
    render(<AdminSecurityPage />);
    expect(screen.getByText(/Loading MFA status/i)).toBeTruthy();
  });

  it('shows the query error message on failure', () => {
    mockUseMfaStatus.mockReturnValue({ ...idle, isError: true, error: new Error('boom') });
    render(<AdminSecurityPage />);
    expect(screen.getByText(/Error: boom/i)).toBeTruthy();
  });

  it('not-enrolled: shows the enroll CTA and no unenroll button', () => {
    render(<AdminSecurityPage />);
    expect(screen.getByRole('button', { name: /Enroll authenticator/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Remove TOTP factor/i })).toBeNull();
  });

  it('enrolled: shows factor name, backup-code count, and the unenroll button', () => {
    mockUseMfaStatus.mockReturnValue(enrolled);
    render(<AdminSecurityPage />);
    expect(screen.getByText(/Buildo Admin TOTP/)).toBeTruthy();
    expect(screen.getByText('10')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Remove TOTP factor/i })).toBeTruthy();
  });

  it('enrolled with ≤2 codes left: shows the re-enroll warning', () => {
    mockUseMfaStatus.mockReturnValue({
      ...enrolled,
      data: { ...enrolled.data, backup_codes_remaining: 1 },
    });
    render(<AdminSecurityPage />);
    expect(screen.getByText(/re-enroll to issue a fresh set/i)).toBeTruthy();
  });
});

describe('<AdminSecurityPage> enrollment flow', () => {
  function startEnrollment() {
    render(<AdminSecurityPage />);
    fireEvent.click(screen.getByRole('button', { name: /Enroll authenticator/i }));
    expect(mockEnrollMutate).toHaveBeenCalledTimes(1);
    // Drive the onSuccess callback the component passed to mutate — act()
    // because we invoke it directly (not via a fireEvent-wrapped path).
    const opts = mockEnrollMutate.mock.calls[0]?.[1] as { onSuccess: (d: unknown) => void };
    act(() => opts.onSuccess(ENROLL_RESULT));
  }

  it('enroll success shows the one-time QR (as <img>, not innerHTML) and the secret', () => {
    startEnrollment();
    const img = screen.getByAltText(/TOTP enrollment QR code/i) as HTMLImageElement;
    expect(img.src.startsWith('data:image/svg+xml')).toBe(true);
    expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeTruthy();
    expect(screen.getByText(/shown/i)).toBeTruthy(); // one-time warning banner
  });

  it('rejects a non-6-digit code client-side (Zod) without calling verify', () => {
    startEnrollment();
    fireEvent.change(screen.getByLabelText(/First 6-digit code/i), { target: { value: '12ab' } });
    fireEvent.click(screen.getByRole('button', { name: /^Verify$/i }));
    expect(mockVerifyMutate).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith(expect.stringMatching(/6-digit/i));
  });

  it('submits a valid 6-digit code and shows the one-time backup codes on success', () => {
    startEnrollment();
    fireEvent.change(screen.getByLabelText(/First 6-digit code/i), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /^Verify$/i }));

    expect(mockVerifyMutate).toHaveBeenCalledWith(
      { factor_id: 'factor-1', code: '123456' },
      expect.any(Object),
    );
    const opts = mockVerifyMutate.mock.calls[0]?.[1] as { onSuccess: (d: unknown) => void };
    act(() =>
      opts.onSuccess({ verified: true, backup_codes: ['aaaa-bbbb-cccc-dddd', 'eeee-ffff-0000-1111'] }),
    );

    expect(screen.getByText('aaaa-bbbb-cccc-dddd')).toBeTruthy();
    expect(screen.getByText('eeee-ffff-0000-1111')).toBeTruthy();
    expect(screen.getByText(/only hashes are kept/i)).toBeTruthy();

    // "I have saved these codes" dismisses the one-time screen for good.
    fireEvent.click(screen.getByRole('button', { name: /I have saved these codes/i }));
    expect(screen.queryByText('aaaa-bbbb-cccc-dddd')).toBeNull();
    expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringMatching(/complete/i));
  });

  // REGRESSION LOCK (P1-F4 shakeout, live repro 2026-07-19): after verify
  // succeeds, useMfaVerify invalidates the mfa-status query; the refetch
  // reports the factor as VERIFIED, and the old branch order let the
  // verified-factor view unmount the one-time backup-codes panel before the
  // operator could save the codes. The panel must survive any status refetch
  // and dismiss ONLY via the explicit "I have saved these codes" button.
  it('backup codes SURVIVE a simulated status refetch (factor now verified) and dismiss only via the explicit button', () => {
    const view = render(<AdminSecurityPage />);
    fireEvent.click(screen.getByRole('button', { name: /Enroll authenticator/i }));
    const enrollOpts = mockEnrollMutate.mock.calls[0]?.[1] as { onSuccess: (d: unknown) => void };
    act(() => enrollOpts.onSuccess(ENROLL_RESULT));

    fireEvent.change(screen.getByLabelText(/First 6-digit code/i), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /^Verify$/i }));
    const verifyOpts = mockVerifyMutate.mock.calls[0]?.[1] as { onSuccess: (d: unknown) => void };
    act(() => verifyOpts.onSuccess({ verified: true, backup_codes: ['aaaa-bbbb-cccc-dddd'] }));
    expect(screen.getByText('aaaa-bbbb-cccc-dddd')).toBeTruthy();

    // Simulate the invalidated mfa-status refetch landing: the hook now
    // returns a VERIFIED factor and the component re-renders.
    mockUseMfaStatus.mockReturnValue(enrolled);
    view.rerender(<AdminSecurityPage />);

    // The one-time panel is STILL up — not unmounted by the refetch — and
    // the verified-factor view is not shown yet.
    expect(screen.getByText('aaaa-bbbb-cccc-dddd')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Remove TOTP factor/i })).toBeNull();

    // Only the explicit dismissal removes it; then the verified view shows.
    fireEvent.click(screen.getByRole('button', { name: /I have saved these codes/i }));
    expect(screen.queryByText('aaaa-bbbb-cccc-dddd')).toBeNull();
    expect(screen.getByRole('button', { name: /Remove TOTP factor/i })).toBeTruthy();
  });

  it('cancel during the verify step discards the enrollment state', () => {
    startEnrollment();
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));
    expect(screen.queryByAltText(/TOTP enrollment QR code/i)).toBeNull();
    expect(screen.getByRole('button', { name: /Enroll authenticator/i })).toBeTruthy();
  });
});

describe('<AdminSecurityPage> unenroll confirm', () => {
  it('opens a role="alertdialog" confirm; confirming fires the unenroll mutation', () => {
    mockUseMfaStatus.mockReturnValue(enrolled);
    render(<AdminSecurityPage />);
    fireEvent.click(screen.getByRole('button', { name: /Remove TOTP factor/i }));

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toBeTruthy();
    expect(screen.getByText(/backup codes will be\s*deleted/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^Remove factor$/i }));
    expect(mockUnenrollMutate).toHaveBeenCalledWith({ factor_id: 'factor-1' }, expect.any(Object));
  });

  it('cancel closes the dialog without mutating', () => {
    mockUseMfaStatus.mockReturnValue(enrolled);
    render(<AdminSecurityPage />);
    fireEvent.click(screen.getByRole('button', { name: /Remove TOTP factor/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(mockUnenrollMutate).not.toHaveBeenCalled();
  });
});
