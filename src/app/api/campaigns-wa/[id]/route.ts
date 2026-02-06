import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { campaignsWa } from "@/lib/db/schema";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const campaignId = parseInt(id);

    const campaign = await db.query.campaignsWa.findFirst({
      where: eq(campaignsWa.id, campaignId),
      with: {
        campaignsWaCustomers: {
          with: {
            customer: true,
          },
        },
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    return NextResponse.json({ campaign });
  } catch (error) {
    console.error("Campaign-WA GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch campaign", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
