import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getMetaSettings, saveMetaSettings } from "@/lib/settings";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const meta = await getMetaSettings();
    // Mask the access token for display
    const masked = meta
      ? {
          ...meta,
          access_token: meta.access_token
            ? `${meta.access_token.slice(0, 10)}...${meta.access_token.slice(-4)}`
            : "",
        }
      : null;
    return NextResponse.json({ meta: masked });
  } catch (error) {
    console.error("Settings GET error:", error);
    return NextResponse.json(
      { error: "Failed to load settings", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (body.meta) {
      // If access_token looks masked (contains ...), keep the existing one
      if (body.meta.access_token?.includes("...")) {
        const existing = await getMetaSettings();
        if (existing) {
          body.meta.access_token = existing.access_token;
        }
      }
      await saveMetaSettings(body.meta);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Settings POST error:", error);
    return NextResponse.json(
      { error: "Failed to save settings", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
