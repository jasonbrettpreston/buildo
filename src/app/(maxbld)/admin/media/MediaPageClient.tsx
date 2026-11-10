'use client';
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b (mount file), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-31
//            (a mount file imports only framework packages, binding modules and project-internal paths; it holds no display text).
//
// MF-37 · the client mount of admin_media_upload, admin_media and admin_media_delete: the two bindings, the two mutation hooks, nothing else.
import { FormBinding, formTree, type FormState } from '@/components/surfaces/web/FormBinding';
import { ListBinding, listTree, type ListState, type Row } from '@/components/surfaces/web/ListBinding';
import type { MediaUploadBody } from '@/lib/media/contract';
import { MEDIA_CONTENT, MEDIA_SCHEMAS, MEDIA_SURFACES } from '@/lib/media/surfaces';
import { useDeleteMedia } from '@/lib/media/useDeleteMedia';
import { useUploadMedia } from '@/lib/media/useUploadMedia';

type FormDescriptor = Parameters<typeof formTree>[0];
type FormSchema = Parameters<typeof formTree>[1];
type ListDescriptor = Parameters<typeof listTree>[0];

export function MediaPageClient({ rows, state }: { rows: Row[]; state: ListState }) {
  const upload = useUploadMedia({ errorText: MEDIA_CONTENT['admin_media_upload.state.error'] as string });
  const remove = useDeleteMedia({ errorText: MEDIA_CONTENT['admin_media_delete.state.error'] as string });
  const uploadState: FormState = upload.isPending ? 'loading' : upload.isError ? 'error' : upload.isSuccess ? 'hit' : 'static';
  const removeState: FormState = remove.isPending ? 'loading' : remove.isError ? 'error' : 'static';
  const list = MEDIA_SURFACES.list as unknown as ListDescriptor;
  return (
    <>
      <FormBinding
        tree={formTree(MEDIA_SURFACES.upload as unknown as FormDescriptor, MEDIA_SCHEMAS.upload as FormSchema, uploadState)}
        schema={MEDIA_SCHEMAS.upload as FormSchema}
        content={MEDIA_CONTENT}
        runtime={{ disabled: upload.isPending, onSubmit: (data) => upload.mutate(data as unknown as MediaUploadBody) }}
      />
      <ListBinding
        descriptor={list}
        tree={listTree(list, state)}
        rows={rows}
        content={MEDIA_CONTENT}
        actionForm={(row, close) => (
          <FormBinding
            tree={formTree(MEDIA_SURFACES.remove as unknown as FormDescriptor, MEDIA_SCHEMAS.remove as FormSchema, removeState)}
            schema={MEDIA_SCHEMAS.remove as FormSchema}
            content={MEDIA_CONTENT}
            runtime={{
              formData: { asset_id: String(row.asset_id) },
              constants: { confirm: String(row.alt) },
              disabled: remove.isPending,
              onSubmit: (data) => remove.mutate({ asset_id: String(row.asset_id), confirm: String(data.confirm) }, { onSuccess: close }),
            }}
          />
        )}
      />
    </>
  );
}
