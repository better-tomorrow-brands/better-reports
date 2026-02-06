import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getLifecycleSettings, saveLifecycleSettings, LifecycleSettings } from "@/lib/settings";

async function isSuperAdmin(userId: string): Promise<boolean> {
  const user = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user[0]?.role === "super_admin";
}

export async function GET() {
  try {
    const settings = await getLifecycleSettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error("Failed to fetch lifecycle settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is super_admin
    const isAdmin = await isSuperAdmin(userId);
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Only super admins can modify lifecycle settings" },
        { status: 403 }
      );
    }

    const body: LifecycleSettings = await request.json();

    // Validate the settings
    if (
      typeof body.newMaxDays !== "number" ||
      typeof body.reorderMaxDays !== "number" ||
      typeof body.lapsedMaxDays !== "number"
    ) {
      return NextResponse.json(
        { error: "Invalid settings format" },
        { status: 400 }
      );
    }

    // Ensure values are in order
    if (body.newMaxDays >= body.reorderMaxDays || body.reorderMaxDays >= body.lapsedMaxDays) {
      return NextResponse.json(
        { error: "Values must be in ascending order: New < Reorder < Lapsed" },
        { status: 400 }
      );
    }

    await saveLifecycleSettings(body);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to save lifecycle settings:", error);
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 }
    );
  }
}
