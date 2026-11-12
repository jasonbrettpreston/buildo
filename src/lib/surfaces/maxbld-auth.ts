// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b.3 (`web_login`: new MaxBLD strings from content), 11b.7 W2.
//
// MF-46 · the MaxBLD strings of the shared web sign-in screen, read from the one content file beside the web_login descriptor (the
// maxbld-web.ts pattern: the mount files import this @/lib/ module, never scripts/ themselves). Keys are typed from the file, so a
// missing key is a type error, not a blank on screen.
import content from '../../../scripts/surfaces/platform_shared/F16/surfaces/web_login.content.json';

export type AuthKey = Exclude<keyof typeof content, '$comment'>;
export type AuthText = Readonly<Record<AuthKey, string>>;

/** Every MaxBLD auth string by key (the file's $comment is not a string the screen shows). */
export const AUTH_TEXT: AuthText = Object.fromEntries(Object.entries(content).filter(([k]) => k !== '$comment')) as AuthText;
