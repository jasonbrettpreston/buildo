// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b (mount file), docs/specs/02-web-admin/33_web_admin_engineering_protocol.md :145
//            (a deliberate state, never a blank canvas).
//
// MF-46 stage C · the not-found boundary of the MaxBLD plain pages: web_maxbld_error in its `miss` state (the closed state vocabulary has no not_found; miss = found nothing), every word from content (plan v1 fold 4:
// a refused page path shows MaxBLD text). It reads nothing. The search page's own not-found (parcel-tool/not-found.tsx, MF-44) is unchanged.
import { StaticBinding, staticWebTree } from '@/components/surfaces/web/StaticBinding';
import { staticPage } from '@/lib/surfaces/maxbld-static';

export default function MaxbldStaticNotFound() {
  const { page, content } = staticPage('web_maxbld_error', 'miss');
  return <StaticBinding tree={staticWebTree(page)} content={content} />;
}
