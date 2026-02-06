import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { campaignsWa } from "@/lib/db/schema";

export async function PATCH(
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
    const body = await request.json();
    const { status } = body;

    if (!status || !["draft", "sending", "completed"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const updates: { status: string; sentAt?: Date } = { status };
    if (status === "completed") {
      updates.sentAt = new Date();
    }

    await db
      .update(campaignsWa)
      .set(updates)
      .where(eq(campaignsWa.id, campaignId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update campaign status error:", error);
    return NextResponse.json(
      { error: "Failed to update status", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
