// SPEC LINK: docs/specs/00-architecture/13_authentication.md §3.3; plan ~/Buildo-scratch/mcfrontend/MF-46/plan.v1.md fold 6 (set-new-password
//            accepts only a session from the recovery link); MF-46 OUTPUT security F3 (within the link lifetime).
//
// MF-46 follow-up · the recovery-session check, out of the 'use server' module src/lib/supabase/maxbld-actions.ts (McTest 2026-11-12: a server-action
// module may export only async functions; a constant and a sync helper there made every page loading the sign-in form fail). Pure; no I/O.

/**
 * How long after the recovery link a session may set a password: the configured link lifetime, supabase/config.toml `otp_expiry = 3600`
 * (OUTPUT security F3; plan v1 fold 6). A session started from a recovery link cannot change the password days later through this screen.
 */
export const RECOVERY_WINDOW_S = 3600;

/** True when the session came from a recovery link (GoTrue sets `amr` method `recovery`, models.Recovery) within the window. */
export function fromRecovery(claims: Record<string, unknown> | undefined, nowS: number = Math.floor(Date.now() / 1000)): boolean {
  const amr = claims?.amr;
  return (
    Array.isArray(amr) &&
    amr.some((m) => {
      if (typeof m !== 'object' || m === null) return false;
      const { method, timestamp } = m as { method?: unknown; timestamp?: unknown };
      return method === 'recovery' && typeof timestamp === 'number' && nowS - timestamp >= 0 && nowS - timestamp <= RECOVERY_WINDOW_S;
    })
  );
}
