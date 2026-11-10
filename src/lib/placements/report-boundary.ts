// SPEC LINK: docs/specs/02-web-admin/33_web_admin_engineering_protocol.md section 11 (every caught error reaches Sentry with a feature tag).
//
// MF-40 · the admin placements error boundary's report: the boundary is a mount file, which may not import a third-party package itself
// (FE-31 C-2), so the Sentry call lives here (the MF-37 media precedent).
import * as Sentry from '@sentry/nextjs';

export function reportPlacementsBoundary(error: Error & { digest?: string }): void {
  Sentry.captureException(error, { tags: { feature: 'admin-placements' }, extra: { digest: error.digest ?? null } });
}
