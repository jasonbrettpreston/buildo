// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b (descriptor + content), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-31.
//
// MF-19 · the lot-size surfaces as data: the two emitted FORM descriptors, their content files and the form schemas of lot-size-entry-contract.json.
// The admin mount files import this module (an allowed @/lib/ path, FE-31 C-2) instead of reaching scripts/ themselves (the MF-40 placements pattern).
import revertDescriptor from '../../../scripts/surfaces/parcel_admin/F08/surfaces/admin_lot_size_revert.descriptor.json';
import revertContent from '../../../scripts/surfaces/parcel_admin/F08/surfaces/admin_lot_size_revert.content.json';
import entryDescriptor from '../../../scripts/surfaces/parcel_product/F02/surfaces/report_lot_size_entry.descriptor.json';
import entryContent from '../../../scripts/surfaces/parcel_product/F02/surfaces/report_lot_size_entry.content.json';
import contract from '../../../scripts/surfaces/_schema/lot-size-entry-contract.json';

export const LOT_SIZE_SURFACES = { revert: revertDescriptor, entry: entryDescriptor };
export const LOT_SIZE_CONTENT: Record<string, string> = { ...revertContent, ...entryContent };
export const LOT_SIZE_SCHEMAS = { revert: contract.revert_request, entry: contract.entry_request };
