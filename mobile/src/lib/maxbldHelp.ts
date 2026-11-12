// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.3 (dated note 2026-11-12, MF-46: Help & Support contact), §11b.7 (dated
//            note 2026-11-11 item 3); ~/Buildo-scratch/mcfrontend/MF-46/plan.v1.md fold 8 (the prefill travels in the URL fragment).
//
// MF-46 follow-up (P35-D18 a) · the app's way to the MaxBLD Help & Support web page: it leaves the app for the browser (Linking.openURL, a
// leave-the-origin move, never a router push) with the topic and the query in the URL FRAGMENT, which the page reads on the client and never sends
// to a server. MAXBLD_HELP_URL is MAXBLD_ORIGIN + /help of src/lib/auth/host-policy.ts (the app cannot import outside mobile/);
// src/tests/surfaces/static-page.logic.test.ts T8 pins the two equal.
import { Linking } from 'react-native';

export const MAXBLD_HELP_URL = 'https://maxbld.ca/help';

/** The Help & Support URL for one topic and one value (both URI-encoded into the fragment). */
export const helpUrl = (topic: string, q: string): string => `${MAXBLD_HELP_URL}#topic=${encodeURIComponent(topic)}&q=${encodeURIComponent(q)}`;

/** Opens the Help & Support page in the browser. */
export const openHelp = (topic: string, q: string): void => {
  void Linking.openURL(helpUrl(topic, q));
};
