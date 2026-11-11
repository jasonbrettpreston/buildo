// SPEC LINK: docs/specs/02-web-admin/33_web_admin_engineering_protocol.md section 11 (every caught error reaches Sentry with a feature tag).
//
// MF-44 · the MaxBLD web pages' error boundary report: the boundary is a mount file, which may not import a third-party package itself (FE-31
// C-2), so the Sentry call lives here (the MF-37 report-boundary.ts pattern). The message is never shown to the user.
import * as Sentry from '@sentry/nextjs';

export function reportMaxbldWebBoundary(error: Error & { digest?: string }): void {
  Sentry.captureException(error, { tags: { feature: 'maxbld-web' }, extra: { digest: error.digest ?? null } });
}
