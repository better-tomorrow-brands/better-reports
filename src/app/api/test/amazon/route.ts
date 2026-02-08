import { NextResponse } from "next/server";
import { testAmazonConnection } from "@/lib/amazon";

export async function GET() {
  try {
    const result = await testAmazonConnection();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
