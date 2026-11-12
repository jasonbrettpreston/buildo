// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.7 (dated note 2026-11-11 item 3: the support inbox is ONE setting),
//            §11b.3 (dated note 2026-11-12, MF-46: the mailto role and the inbox setting), docs/specs/02-web-admin/128_surface_standard_policy.md §4
//            (dated note 2026-11-11: a STATIC page may read declared stored values on the server), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md
//            FE-37.
//
// MF-46 follow-up · the Help & Support inbox, the one server read of web_help (migration 313; DECISIONS-v1 D-6 (a)). It goes to the page through
// MF-76's STATIC value mechanism: the page table's mailto parts name the read `support_inbox`; an absent value leaves them out (keepValued).
import type { StaticValues } from '@/components/surfaces/web/StaticBinding';
import type { Queryable } from '@/lib/entitlements';
import { logError, logWarn } from '@/lib/logger';

const TAG = '[maxbld-support]';
export const SUPPORT_INBOX_KEY = 'maxbld_support_inbox';
/** The declared read name of the mailto parts (static-page.schema.json, the mailto rule). */
export const SUPPORT_READ = 'support_inbox';
/** A plain address: no character a mailto would read as a header, a query or a second address. */
const EMAIL = /^[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

/** The inbox as a page value, or {} when unset, not an address, or unreadable (logged once; the page then shows no mail links, never a 500). */
export async function readSupportInbox(db: Queryable): Promise<StaticValues> {
  try {
    const { rows } = await db.query('SELECT variable_value_json FROM logic_variables WHERE variable_key = $1', [SUPPORT_INBOX_KEY]);
    const v = (rows[0] as { variable_value_json?: unknown } | undefined)?.variable_value_json;
    const inbox = typeof v === 'string' ? v.trim() : '';
    if (EMAIL.test(inbox)) return { [SUPPORT_READ]: inbox };
    logWarn(TAG, 'support inbox unset or not an address; the mail links are left out', { key: SUPPORT_INBOX_KEY, set: inbox !== '' });
    return {};
  } catch (err) {
    logError(TAG, err, { read: SUPPORT_INBOX_KEY });
    return {};
  }
}
