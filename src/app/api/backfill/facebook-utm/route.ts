import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    success: false,
    message: 'This endpoint relied on Google Sheets and is no longer active. UTM campaigns are managed directly in the database.',
  }, { status: 410 });
}
