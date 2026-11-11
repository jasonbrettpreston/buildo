// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b (mount file), 11b.7 W4/W5, 11b.3 dated note 2026-11-11 (MF-44),
//            docs/specs/02-web-admin/33_web_admin_engineering_protocol.md section 8 (dated note 2026-11-09: a server page gates itself first).
//
// MF-44 · the MaxBLD web search page (mount file of mobile_parcel_search, web target). Gate first (signed in; parcel_tool plan), then the client
// mount: the idle page for a plan holder, the descriptor's own unauthorized state otherwise. Per-user, never cached.
import { requireParcelToolPage } from '@/lib/auth/require-parcel-tool-page';
import { WEB_STATIC_SITUATION, WEB_UNAUTHORIZED_SITUATION } from '@/lib/surfaces/maxbld-web';
import { SearchPageClient } from './SearchPageClient';

export const dynamic = 'force-dynamic';

export default async function MaxbldSearchPage() {
  const { entitled } = await requireParcelToolPage();
  return <SearchPageClient situation={entitled ? WEB_STATIC_SITUATION : WEB_UNAUTHORIZED_SITUATION} />;
}
