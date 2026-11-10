// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.5 (dated note 2026-11-09)
//            docs/specs/00-architecture/114_rls_policy_catalog.md §6 (dated note 2026-11-09)
//            docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §8 + §13 (Zod at the boundary)
//
// The admin media contract, read from scripts/surfaces/_schema/media-contract.json (ONE home for the
// bucket, path template, MIME map, kinds, limit key names and the request schemas). The POST validator is
// built from `request_schema` with z.fromJSONSchema, then `kinds[kind].requires` is applied, then the
// route calls `decodeDataUrl` (strict data URL + magic bytes: what a JSON Schema `format` would claim).

import { z } from 'zod';
import type { Queryable } from '@/lib/entitlements';
import contractJson from '../../../scripts/surfaces/_schema/media-contract.json';

export type MediaKind = 'report_image' | 'ad_creative';
export type MediaMime = 'image/png' | 'image/jpeg' | 'image/webp';

type JsonSchemaNode = Record<string, unknown>;

export interface MediaContract {
  bucket: { id: string; public: boolean };
  path_template: string;
  ext_by_mime: Record<string, string>;
  kinds: Record<string, { requires: string[]; alt_required: boolean }>;
  limits: Record<keyof MediaLimits, string>;
  request_schema: JsonSchemaNode;
  delete_schema: JsonSchemaNode;
}

export const CONTRACT = contractJson as unknown as MediaContract;

/** MF-42's keyword subset: the only JSON Schema keywords a surface request schema may use. */
export const ALLOWED_SCHEMA_KEYWORDS: ReadonlySet<string> = new Set([
  'type', 'properties', 'required', 'enum', 'const', 'minLength', 'maxLength',
  'minimum', 'maximum', 'pattern', 'additionalProperties', '$comment',
]);

/** Every keyword outside the subset (and any `additionalProperties` other than false), as `path: keyword`. */
export function schemaKeywordViolations(node: JsonSchemaNode, at = '#'): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (!ALLOWED_SCHEMA_KEYWORDS.has(key)) out.push(`${at}: ${key}`);
    if (key === 'additionalProperties' && value !== false) out.push(`${at}: additionalProperties must be false`);
  }
  const props = node.properties;
  if (props && typeof props === 'object') {
    for (const [name, child] of Object.entries(props as Record<string, JsonSchemaNode>)) {
      out.push(...schemaKeywordViolations(child, `${at}/properties/${name}`));
    }
  }
  return out;
}

export interface MediaUploadBody {
  kind: MediaKind;
  scenario_key?: string;
  position?: number;
  alt: string;
  file: string;
}

/** The POST body validator: contract schema, then the per-kind `requires`. */
export const requestValidator = z
  .fromJSONSchema(CONTRACT.request_schema as Parameters<typeof z.fromJSONSchema>[0])
  .superRefine((value, ctx) => {
    const body = value as Record<string, unknown>;
    const kind = String(body.kind);
    for (const field of CONTRACT.kinds[kind]?.requires ?? []) {
      if (body[field] === undefined) {
        ctx.addIssue({ code: 'custom', path: [field], message: `${field} is required for ${kind}` });
      }
    }
  }) as unknown as z.ZodType<MediaUploadBody>;

/** The DELETE body validator ({asset_id from the path, confirm from the body}). */
export const deleteValidator = z.fromJSONSchema(
  CONTRACT.delete_schema as Parameters<typeof z.fromJSONSchema>[0],
) as unknown as z.ZodType<{ asset_id: string; confirm: string }>;

// ---------------------------------------------------------------------------
// Strict data-URL decode
// ---------------------------------------------------------------------------

export type DecodeFailure = 'shape' | 'mime' | 'base64' | 'empty' | 'magic';

export class MediaDecodeError extends Error {
  constructor(readonly reason: DecodeFailure) {
    super(`media decode failed: ${reason}`);
    this.name = 'MediaDecodeError';
  }
}

// `data:<mime>;base64,<b64>` or RJSF's `data:<mime>;name=<encodeURIComponent name>;base64,<b64>`. Nothing else.
const DATA_URL_RE = /^data:([a-z]+\/[a-z0-9.+-]+)(?:;name=[A-Za-z0-9%._~!*'()-]+)?;base64,([A-Za-z0-9+/]*={0,2})$/;

const MAGIC: Record<MediaMime, (b: Buffer) => boolean> = {
  'image/png': (b) => b.length >= 4 && b.readUInt32BE(0) === 0x89504e47,
  'image/jpeg': (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/webp': (b) =>
    b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP',
};

export function decodeDataUrl(s: string): { mime: MediaMime; bytes: Buffer; ext: string } {
  const m = DATA_URL_RE.exec(s);
  if (!m) throw new MediaDecodeError('shape');
  const mime = m[1] as MediaMime;
  const ext = CONTRACT.ext_by_mime[mime];
  if (!ext || !(mime in MAGIC)) throw new MediaDecodeError('mime');
  const b64 = m[2]!;
  if (b64.length === 0) throw new MediaDecodeError('empty');
  if (b64.length % 4 !== 0) throw new MediaDecodeError('base64');
  const bytes = Buffer.from(b64, 'base64');
  // Round-trip: Node's decoder is lenient; a strict decode re-encodes to the same text.
  if (bytes.toString('base64') !== b64) throw new MediaDecodeError('base64');
  if (!MAGIC[mime](bytes)) throw new MediaDecodeError('magic');
  return { mime, bytes, ext };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The object path for one asset: `path_template` with kind, asset_id and the MIME's extension. */
export function pathFor(kind: string, assetId: string, mime: string): string {
  const ext = CONTRACT.ext_by_mime[mime];
  if (!CONTRACT.kinds[kind] || !ext || !UUID_RE.test(assetId)) {
    throw new Error(`pathFor: invalid kind/asset_id/mime (${kind}, ${mime})`);
  }
  return CONTRACT.path_template.replace('{kind}', kind).replace('{asset_id}', assetId).replace('{ext}', ext);
}

// ---------------------------------------------------------------------------
// Limits (logic_variables, keys named by the contract)
// ---------------------------------------------------------------------------

export interface MediaLimits {
  max_bytes: number;
  signed_url_ttl_seconds: number;
  list_page_max: number;
  list_cache_seconds: number;
  storage_timeout_ms: number;
}

/** JSON envelope headroom over the base64 file (T2: max × 4/3 + this < 4.5 MB request limit). */
export const REQUEST_OVERHEAD_BYTES = 65536;

export function maxRequestBytes(limits: Pick<MediaLimits, 'max_bytes'>): number {
  return Math.ceil((limits.max_bytes * 4) / 3) + REQUEST_OVERHEAD_BYTES;
}

export class MediaLimitsMissingError extends Error {
  constructor(readonly missing: string[]) {
    super(`logic_variables missing or non-numeric: ${missing.join(', ')}`);
    this.name = 'MediaLimitsMissingError';
  }
}

/** Reads the five limits from logic_variables (migration 301). A missing row fails loud, never a guess. */
/**
 * The five Admin Media logic_variables keys, spelled out so the R-EO variable-effect scan sees them read here; they must equal the
 * contract's limits (checked at load, and by T2).
 */
export const LIMIT_KEYS = {
  max_bytes: 'media_upload_max_bytes',
  signed_url_ttl_seconds: 'media_signed_url_ttl_seconds',
  list_page_max: 'media_list_page_max',
  list_cache_seconds: 'media_list_cache_seconds',
  storage_timeout_ms: 'media_storage_timeout_ms',
} as const;
if (JSON.stringify(LIMIT_KEYS) !== JSON.stringify(CONTRACT.limits)) {
  throw new Error('media-contract.json limits differ from LIMIT_KEYS in src/lib/media/contract.ts');
}

export async function readMediaLimits(db: Queryable): Promise<MediaLimits> {
  const keys = Object.values(LIMIT_KEYS);
  const res = await db.query<{ variable_key: string; variable_value: string | number | null }>(
    `SELECT variable_key, variable_value FROM logic_variables WHERE variable_key = ANY($1::text[])`,
    [keys],
  );
  const byKey = new Map(res.rows.map((r) => [r.variable_key, Number(r.variable_value)]));
  const out: Partial<MediaLimits> = {};
  const missing: string[] = [];
  for (const [field, key] of Object.entries(CONTRACT.limits) as Array<[keyof MediaLimits, string]>) {
    const v = byKey.get(key);
    if (v === undefined || !Number.isFinite(v)) missing.push(key);
    else out[field] = v;
  }
  if (missing.length > 0) throw new MediaLimitsMissingError(missing);
  return out as MediaLimits;
}
