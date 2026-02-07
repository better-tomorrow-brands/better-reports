import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { campaignsFcb } from "@/lib/db/schema";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await db
      .select({ utmCampaign: campaignsFcb.utmCampaign })
      .from(campaignsFcb);

    const uniqueValues = [
      ...new Set(
        rows
          .map((r) => r.utmCampaign)
          .filter((v): v is string => !!v)
      ),
    ].sort();

    return NextResponse.json({ utmCampaigns: uniqueValues });
  } catch (error) {
    console.error("UTM options error:", error);
    return NextResponse.json(
      { error: "Failed to fetch UTM options" },
      { status: 500 }
    );
  }
}
