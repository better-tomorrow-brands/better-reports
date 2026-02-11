import { NextResponse } from "next/server";
import { getLifecycleSettings, saveLifecycleSettings, LifecycleSettings } from "@/lib/settings";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";

export async function GET(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);
    const settings = await getLifecycleSettings(orgId);
    return NextResponse.json(settings);
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to fetch lifecycle settings:", error);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);

    const body: LifecycleSettings = await request.json();

    if (
      typeof body.newMaxDays !== "number" ||
      typeof body.reorderMaxDays !== "number" ||
      typeof body.lapsedMaxDays !== "number"
    ) {
      return NextResponse.json({ error: "Invalid settings format" }, { status: 400 });
    }

    if (body.newMaxDays >= body.reorderMaxDays || body.reorderMaxDays >= body.lapsedMaxDays) {
      return NextResponse.json(
        { error: "Values must be in ascending order: New < Reorder < Lapsed" },
        { status: 400 }
      );
    }

    await saveLifecycleSettings(orgId, body);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to save lifecycle settings:", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
