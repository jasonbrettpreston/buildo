'use client';
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b (mount file; the FORM error state), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-31.
//
// MF-19 · the admin lot-size error boundary: the revert FORM binding in its error state, every word from content.
import { useEffect } from 'react';
import { FormBinding, formTree } from '@/components/surfaces/web/FormBinding';
import { logError } from '@/lib/logger';
import { LOT_SIZE_CONTENT, LOT_SIZE_SCHEMAS, LOT_SIZE_SURFACES } from '@/lib/parcels/lot-size-surfaces';

type FormDescriptor = Parameters<typeof formTree>[0];
type FormSchema = Parameters<typeof formTree>[1];

export default function AdminLotSizeError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => { logError('[admin/lot-size]', error, { stage: 'boundary', digest: error.digest ?? null }); }, [error]);
  const schema = LOT_SIZE_SCHEMAS.revert as FormSchema;
  return <FormBinding tree={formTree(LOT_SIZE_SURFACES.revert as unknown as FormDescriptor, schema, 'error')} schema={schema} content={LOT_SIZE_CONTENT} runtime={{ disabled: true }} />;
}
