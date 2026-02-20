import { NextResponse } from "next/server";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";
import { db } from "@/lib/db";
import { creatives } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { orgId } = await requireOrgFromRequest(request);
    const { id } = await params;
    const creativeId = parseInt(id);

    if (isNaN(creativeId)) {
      return NextResponse.json({ error: "Invalid creative ID" }, { status: 400 });
    }

    // Delete only if belongs to the org
    const result = await db
      .delete(creatives)
      .where(
        and(
          eq(creatives.id, creativeId),
          eq(creatives.orgId, orgId)
        )
      )
      .returning({ id: creatives.id });

    if (result.length === 0) {
      return NextResponse.json({ error: "Creative not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, id: result[0].id });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Delete creative error:", error);
    return NextResponse.json(
      { error: "Failed to delete creative" },
      { status: 500 }
    );
  }
}
