// 🔗 SPEC LINK: docs/specs/02-web-admin/102_admin_notifications_tool.md §2
//
// /admin/notifications — dispatch log + test-send + read-only kill-switch
// status. Desktop-first internal tool (Spec 33).

import { NotificationsTool } from '@/components/admin/NotificationsTool';

export const dynamic = 'force-dynamic';

export default function AdminNotificationsPage() {
  return <NotificationsTool />;
}
