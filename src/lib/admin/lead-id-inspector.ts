// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.2 + §3.5
//
// Canonical-lead-id → Lead Detail Inspector URL-segment translation. ONE
// source of truth shared by:
//   - the admin Feed Browser click-through (Spec 76 §3.2 — TestFeedTool)
//   - the LeadDetailInspector cross-stream navigation (Spec 76 §3.5 —
//     handleNavigate)
//
// Feed emits per-lead ids WITHOUT the `permit:` prefix (get-lead-feed.ts:120
// → `NUM:REV`); coa ids already carry the `coa:` prefix (get-lead-feed.ts:562
// → `coa:APP-NUM`). Callers must therefore normalize a permit feed id to the
// canonical `permit:NUM:REV` shape (see `feedLeadIdToCanonical`) BEFORE
// translating to the inspector segment.
//
// URL-segment encoding the inspector page consumes (inspector/page.tsx):
//   permits : `NUM--REV`     (e.g. 20-101234--00)
//   coa     : `COA-APP-NUM`  (e.g. COA-A0001-2024)

/**
 * Translate a canonical DB lead_id (`permit:NUM:REV` or `coa:APP-NUM`) to the
 * Lead Detail Inspector URL segment. Returns null for a malformed / unknown
 * shape (builder leads, empty revision) so callers can skip the link rather
 * than route to a broken deep-link.
 */
export function leadIdToInspectorSegment(leadId: string): string | null {
  if (leadId.startsWith('permit:')) {
    const rest = leadId.slice('permit:'.length);
    const sep = rest.indexOf(':');
    if (sep <= 0) return null;
    const permitNum = rest.slice(0, sep);
    const revisionNum = rest.slice(sep + 1);
    if (permitNum.length === 0 || revisionNum.length === 0) return null;
    return `${permitNum}--${revisionNum}`;
  }
  if (leadId.startsWith('coa:')) {
    const app = leadId.slice('coa:'.length);
    if (app.length === 0) return null;
    return `COA-${app}`;
  }
  return null;
}

/**
 * Normalize a Lead Feed item id to the canonical DB lead_id. The feed emits
 * bare `NUM:REV` for permit rows (no prefix) and already-prefixed `coa:APP`
 * for CoA rows, so a permit id gets `permit:` prepended and everything else
 * passes through unchanged.
 */
export function feedLeadIdToCanonical(
  leadType: string,
  feedLeadId: string,
): string {
  return leadType === 'permit' ? `permit:${feedLeadId}` : feedLeadId;
}
