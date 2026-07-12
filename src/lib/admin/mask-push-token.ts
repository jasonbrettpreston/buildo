// 🔗 SPEC LINK: docs/specs/02-web-admin/102_admin_notifications_tool.md §2
//
// A full Expo push token lets anyone send pushes to that device — it must never
// reach the browser. Admin surfaces show only enough to visually distinguish
// devices: the token shape + the LAST 6 characters of the inner id.

export function maskPushToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const m = /^ExponentPushToken\[(.+)\]$/.exec(token);
  const inner = m?.[1];
  if (inner) {
    return `ExponentPushToken[…${inner.slice(-6)}]`;
  }
  // Unknown shape — mask everything but the tail, never echo the whole value.
  return `…${token.slice(-6)}`;
}
