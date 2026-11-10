// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b (mount file), §6.3 rows 4-6 (dated notes 2026-11-10),
//            docs/specs/02-web-admin/33_web_admin_engineering_protocol.md section 8 (dated note 2026-11-09: an admin RSC page that reads rows gates itself first),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-31.
//
// MF-40 · the admin placements page (mount file of admin_placements, admin_offers and admin_advertiser_entry). Gate first, read the offers,
// advertisers and flight defaults on the server, pass plain data to the client mount.
import { requireAdminPage } from '@/lib/auth/require-admin-page';
import { listPlacements } from '@/lib/placements/list';
import { PlacementsPageClient } from './PlacementsPageClient';

export const dynamic = 'force-dynamic';

export default async function AdminPlacementsPage() {
  await requireAdminPage();
  const read = await listPlacements();
  return <PlacementsPageClient read={read} state={read.offers.length === 0 ? 'empty' : 'hit'} />;
}
