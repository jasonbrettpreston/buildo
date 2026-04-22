/**
 * PostHog telemetry wrappers for the Control Panel feature.
 * SPEC LINK: docs/specs/02-web-admin/86_control_panel.md §5 Phase 6
 */

import { captureEvent } from '@/lib/observability/capture';

type AdminEventName =
  | 'admin_gravity_adjusted'
  | 'admin_gravity_discarded'
  | 'admin_gravity_save_failed'
  | 'admin_pipeline_resync_triggered';

export function captureAdminEvent(
  name: AdminEventName,
  properties?: Record<string, unknown>,
): void {
  captureEvent(name, properties ?? {});
}
