// SPEC LINK: docs/specs/02-web-admin/35_web_admin_state_architecture.md §7.3
//
// PostHog gets a HASHED admin uid, never the raw one. Shared by the MF-37 media routes only.

import { createHash } from 'node:crypto';

export function hashAdminUid(uid: string): string {
  return createHash('sha256').update(uid).digest('hex').slice(0, 16);
}
