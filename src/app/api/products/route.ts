import { NextResponse } from 'next/server';
import { PRODUCT_GROUPS } from '@/lib/classification/products';

export async function GET() {
  return NextResponse.json({ products: PRODUCT_GROUPS });
}
