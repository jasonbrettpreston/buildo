import { NextResponse } from 'next/server';
import { PRODUCT_GROUPS } from '@/lib/classification/products';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';

export const GET = withApiEnvelope(async function GET() {
  return NextResponse.json({ products: PRODUCT_GROUPS });
});
