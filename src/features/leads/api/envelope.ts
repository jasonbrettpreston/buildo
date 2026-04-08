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

export function ok<T, M = null>(
  data: T,
  meta: M = null as M,
  status = 200,
): NextResponse<ApiSuccess<T, M>> {
  return NextResponse.json<ApiSuccess<T, M>>({ data, error: null, meta }, { status });
}

export function err(
  code: string,
  message: string,
  status: number,
  details?: unknown,
): NextResponse<ApiErrorBody> {
  const error: ApiErrorBody['error'] =
    details !== undefined ? { code, message, details } : { code, message };
  return NextResponse.json<ApiErrorBody>({ data: null, error, meta: null }, { status });
}
