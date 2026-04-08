// 🔗 SPEC LINK: docs/specs/00_engineering_standards.md §4.4 + spec 70 §API Endpoints
//
// Response envelope helpers. Every leads API response is `{data, error, meta}`
// with consistent shape regardless of success or failure. Phase 2 routes
// call `ok()` for 200/201 responses and one of the helpers in
// `error-mapping.ts` for 4xx/5xx.

import { NextResponse } from 'next/server';

export interface ApiSuccess<T, M = null> {
  data: T;
  error: null;
  meta: M;
}

export interface ApiErrorBody {
  data: null;
  error: { code: string; message: string; details?: unknown };
  meta: null;
}

/**
 * HTTP status code unions — type-level constraint preventing the wrong
 * code being passed to the wrong helper. `ok()` only accepts 2xx codes,
 * `err()` only accepts 4xx/5xx codes.
 */
export type SuccessStatus = 200 | 201 | 202 | 204;
export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 502 | 503;

export function ok<T>(data: T): NextResponse<ApiSuccess<T, null>>;
export function ok<T, M>(data: T, meta: M): NextResponse<ApiSuccess<T, M>>;
export function ok<T, M>(
  data: T,
  meta: M,
  status: SuccessStatus,
): NextResponse<ApiSuccess<T, M>>;
export function ok<T, M>(
  data: T,
  meta?: M,
  status: SuccessStatus = 200,
): NextResponse<ApiSuccess<T, M | null>> {
  const metaValue: M | null = meta === undefined ? null : meta;
  return NextResponse.json<ApiSuccess<T, M | null>>(
    { data, error: null, meta: metaValue },
    { status },
  );
}

export function err(
  code: string,
  message: string,
  status: ErrorStatus,
  details?: unknown,
  headers?: Record<string, string>,
): NextResponse<ApiErrorBody> {
  const error: ApiErrorBody['error'] =
    details !== undefined ? { code, message, details } : { code, message };
  const init: { status: ErrorStatus; headers?: Record<string, string> } = { status };
  if (headers !== undefined) init.headers = headers;
  return NextResponse.json<ApiErrorBody>({ data: null, error, meta: null }, init);
}
