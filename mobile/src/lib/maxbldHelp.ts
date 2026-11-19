// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.3 (dated note 2026-11-12, MF-46: Help & Support contact), §11b.7 (dated
//            note 2026-11-11 item 3); ~/Buildo-scratch/mcfrontend/MF-46/plan.v1.md fold 8 (the prefill travels in the URL fragment).
//
// MF-46 follow-up (P35-D18 a) · the app's way to the MaxBLD Help & Support web page, with the topic and the query in the URL FRAGMENT, which the
// page reads on the client and never sends to a server.
// task-362 SRCH.LOTMAP-2 (small-pages-v8 search.html:235 "in-app browser sheet (B10): Help, Terms, Privacy open the web page with Done"): the page
// opens in the in-app browser sheet through expo-web-browser, the same call as useSubscribeCheckout.ts:61, instead of leaving the app through Linking.
// MAXBLD_HELP_URL is MAXBLD_ORIGIN + /help of src/lib/auth/host-policy.ts (the app cannot import outside mobile/);
// src/tests/surfaces/static-page.logic.test.ts T8 pins the two equal.
import * as WebBrowser from 'expo-web-browser';

export const MAXBLD_HELP_URL = 'https://maxbld.ca/help';

/** The Help & Support URL for one topic and one value (both URI-encoded into the fragment). */
export const helpUrl = (topic: string, q: string): string => `${MAXBLD_HELP_URL}#topic=${encodeURIComponent(topic)}&q=${encodeURIComponent(q)}`;

/**
 * Opens the Help & Support page in the in-app browser sheet. Resolves when the person dismisses the sheet (iOS shows Done; an Android Custom Tab has
 * no Done button, the system back closes it). A rejecting openBrowserAsync is caught and logged with the topic only (never the typed address),
 * so the caller never sees a rejection.
 */
export const openHelp = async (topic: string, q: string): Promise<void> => {
  try {
    await WebBrowser.openBrowserAsync(helpUrl(topic, q));
  } catch {
    console.warn(`[maxbldHelp] could not open Help & Support (topic ${topic})`);
  }
};
