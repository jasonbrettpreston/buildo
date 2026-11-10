// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b (descriptor + content), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-31.
//
// MF-40 · the admin placements surfaces as data: the three emitted descriptors, their content files (merged) and the two form schemas of
// placements-contract.json. The mount files import this module (an allowed @/lib/ path, FE-31 C-2) instead of reaching scripts/ themselves.
import offerDescriptor from '../../../scripts/surfaces/parcel_admin/F04/surfaces/admin_placements.descriptor.json';
import listDescriptor from '../../../scripts/surfaces/parcel_admin/F04/surfaces/admin_offers.descriptor.json';
import advertiserDescriptor from '../../../scripts/surfaces/parcel_admin/F04/surfaces/admin_advertiser_entry.descriptor.json';
import offerContent from '../../../scripts/surfaces/parcel_admin/F04/surfaces/admin_placements.content.json';
import listContent from '../../../scripts/surfaces/parcel_admin/F04/surfaces/admin_offers.content.json';
import advertiserContent from '../../../scripts/surfaces/parcel_admin/F04/surfaces/admin_advertiser_entry.content.json';
import contract from '../../../scripts/surfaces/_schema/placements-contract.json';

export const PLACEMENTS_SURFACES = { offer: offerDescriptor, list: listDescriptor, advertiser: advertiserDescriptor };
export const PLACEMENTS_CONTENT: Record<string, string> = { ...offerContent, ...listContent, ...advertiserContent };
export const PLACEMENTS_SCHEMAS = { offer: contract.offer_request, advertiser: contract.advertiser_request };
