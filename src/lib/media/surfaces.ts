// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b (descriptor + content), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-31.
//
// MF-37 · the admin media surfaces as data: the three emitted descriptors, their content files (merged) and the two form schemas of
// media-contract.json. The mount files import this module (an allowed @/lib/ path, FE-31 C-2) instead of reaching scripts/ themselves.
import listDescriptor from '../../../scripts/surfaces/parcel_admin/F08/surfaces/admin_media.descriptor.json';
import uploadDescriptor from '../../../scripts/surfaces/parcel_admin/F08/surfaces/admin_media_upload.descriptor.json';
import deleteDescriptor from '../../../scripts/surfaces/parcel_admin/F08/surfaces/admin_media_delete.descriptor.json';
import listContent from '../../../scripts/surfaces/parcel_admin/F08/surfaces/admin_media.content.json';
import uploadContent from '../../../scripts/surfaces/parcel_admin/F08/surfaces/admin_media_upload.content.json';
import deleteContent from '../../../scripts/surfaces/parcel_admin/F08/surfaces/admin_media_delete.content.json';
import contract from '../../../scripts/surfaces/_schema/media-contract.json';

export const MEDIA_SURFACES = { list: listDescriptor, upload: uploadDescriptor, remove: deleteDescriptor };
export const MEDIA_CONTENT: Record<string, string> = { ...listContent, ...uploadContent, ...deleteContent };
export const MEDIA_SCHEMAS = { upload: contract.request_schema, remove: contract.delete_schema };
