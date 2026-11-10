// SPEC LINK: docs/specs/02-web-admin/33_web_admin_engineering_protocol.md section 11 (every caught error reaches Sentry with a feature tag).
//
// MF-37 · the admin media error boundary's report (code-reviewer OUTPUT seat F4): the boundary is a mount file, which may not import a
// third-party package itself (FE-31 C-2), so the Sentry call lives here, as the control-panel boundary does it.
import * as Sentry from '@sentry/nextjs';

export function reportMediaBoundary(error: Error & { digest?: string }): void {
  Sentry.captureException(error, { tags: { feature: 'admin-media' }, extra: { digest: error.digest ?? null } });
}
