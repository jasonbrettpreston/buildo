/**
 * Typed TanStack Query keys for the Control Panel feature.
 * SPEC LINK: docs/specs/02-web-admin/86_control_panel.md §5 Phase 2
 */

export const controlPanelKeys = {
  all: ['admin-controls'] as const,
  configs: () => [...controlPanelKeys.all, 'configs'] as const,
};
