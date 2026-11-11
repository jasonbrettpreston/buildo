// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b (mount file), 11b.3 dated note 2026-11-11 (MF-44),
//            docs/specs/02-web-admin/33_web_admin_engineering_protocol.md :145 (a deliberate state, never a blank canvas).
//
// MF-44 · the MaxBLD web pages' not-found state (under the prefix, not the group: MF-46 plan :170). It shows the search page's idle state, every word
// from content, with every control disabled while the live switch is off. It reads nothing.
import { WEB_STATIC_SITUATION } from '@/lib/surfaces/maxbld-web';
import { SearchPageClient } from './SearchPageClient';

export default function MaxbldNotFound() {
  return <SearchPageClient situation={WEB_STATIC_SITUATION} />;
}
