import { NextResponse } from 'next/server';
import { TRADES } from '@/lib/classification/trades';

export async function GET() {
  return NextResponse.json({ trades: TRADES });
}
