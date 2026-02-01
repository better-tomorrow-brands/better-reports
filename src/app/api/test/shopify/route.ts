import { NextResponse } from 'next/server';
import { testShopifyAccess } from '@/lib/shopify';

export async function GET() {
  try {
    const result = await testShopifyAccess();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
