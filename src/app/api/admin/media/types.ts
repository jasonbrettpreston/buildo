// SPEC LINK: docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §13 (Zod in and out)
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.5
//
// Response schemas for GET/POST /api/admin/media and DELETE /api/admin/media/[asset_id]. Request bodies are
// validated by the contract-built validators in src/lib/media/contract.ts (one schema home).

import { z } from 'zod';
import type { MediaListMeta, MediaListRow } from '@/lib/media/list';

const KindSchema = z.enum(['report_image', 'ad_creative']);
const MimeSchema = z.enum(['image/png', 'image/jpeg', 'image/webp']);

export const MediaListRowSchema = z.object({
  asset_id: z.string().uuid(),
  kind: KindSchema,
  scenario_key: z.string().nullable(),
  position: z.number().int().nonnegative().nullable(),
  alt: z.string().min(1),
  mime: MimeSchema,
  bytes: z.number().int().positive(),
  bytes_display: z.string(),
  created_at: z.string(),
  created_display: z.string(),
  signed_url: z.string().nullable(),
}) satisfies z.ZodType<MediaListRow>;

export const MediaListMetaSchema = z.object({
  total: z.number().int().nonnegative(),
  unsigned: z.number().int().nonnegative(),
  cap: z.number().int().positive(),
  partial: z.boolean(),
}) satisfies z.ZodType<MediaListMeta>;

export const MediaListResponseSchema = z.array(MediaListRowSchema);

export const MediaUploadResponseSchema = z.object({
  asset_id: z.string().uuid(),
  kind: KindSchema,
  path: z.string(),
  mime: MimeSchema,
  bytes: z.number().int().positive(),
});
export type MediaUploadResponse = z.infer<typeof MediaUploadResponseSchema>;

export const MediaDeleteResponseSchema = z.object({ asset_id: z.string().uuid(), deleted: z.literal(true) });
export const MediaDeleteMetaSchema = z.object({ object_removed: z.boolean() });
export type MediaDeleteResponse = z.infer<typeof MediaDeleteResponseSchema>;

/** Error codes the media routes return (the hooks map them; display text comes from content). */
export type MediaErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INVALID_JSON'
  | 'VALIDATION_FAILED'
  | 'INVALID_FILE'
  | 'FILE_TOO_LARGE'
  | 'POSITION_TAKEN'
  | 'NOT_FOUND'
  | 'CONFIRM_MISMATCH'
  | 'STORAGE_SESSION_REQUIRED'
  | 'STORAGE_UPLOAD_FAILED'
  | 'INTERNAL_ERROR';
