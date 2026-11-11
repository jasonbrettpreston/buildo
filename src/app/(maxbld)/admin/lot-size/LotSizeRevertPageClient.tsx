'use client';
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b (mount file), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-31
//            (a mount file imports only framework packages, binding modules and project-internal paths; it holds no display text).
//
// MF-19 · the client mount of admin_lot_size_revert (D-4): the web FORM binding and the revert hook, nothing else.
import { FormBinding, formTree, type FormState } from '@/components/surfaces/web/FormBinding';
import { LOT_SIZE_CONTENT, LOT_SIZE_SCHEMAS, LOT_SIZE_SURFACES } from '@/lib/parcels/lot-size-surfaces';
import { useLotSizeRevert } from '@/lib/parcels/useLotSizeRevert';

type FormDescriptor = Parameters<typeof formTree>[0];
type FormSchema = Parameters<typeof formTree>[1];

const stateOf = (m: { isPending: boolean; isError: boolean; isSuccess: boolean }): FormState =>
  m.isPending ? 'loading' : m.isError ? 'error' : m.isSuccess ? 'hit' : 'static';

export function LotSizeRevertPageClient() {
  const revert = useLotSizeRevert({ errorText: LOT_SIZE_CONTENT['admin_lot_size_revert.state.error'] as string });
  const descriptor = LOT_SIZE_SURFACES.revert as unknown as FormDescriptor;
  const schema = LOT_SIZE_SCHEMAS.revert as FormSchema;
  return (
    <FormBinding
      tree={formTree(descriptor, schema, stateOf(revert))}
      schema={schema}
      content={LOT_SIZE_CONTENT}
      runtime={{ disabled: revert.isPending, onSubmit: (data) => revert.mutate(data as { parcel_id: string }) }}
    />
  );
}
