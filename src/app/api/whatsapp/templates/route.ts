import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getMetaSettings } from "@/lib/settings";

export interface TemplateParam {
  name: string;
}

export interface WhatsAppTemplate {
  name: string;
  status: string;
  language: string;
  params: TemplateParam[];
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const metaSettings = await getMetaSettings();
  if (!metaSettings?.access_token || !metaSettings?.waba_id) {
    return NextResponse.json(
      { error: "Meta credentials not configured. Go to Settings to add your WABA ID and Access Token." },
      { status: 400 }
    );
  }

  try {
    const url = `https://graph.facebook.com/v22.0/${metaSettings.waba_id}/message_templates?fields=name,status,language,components&limit=100`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${metaSettings.access_token}` },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Templates API error:", data);
      return NextResponse.json(
        { error: data.error?.message || "Failed to fetch templates" },
        { status: response.status }
      );
    }

    // Parse templates - extract body params from each
    const templates: WhatsAppTemplate[] = (data.data || [])
      .filter((t: { status: string }) => t.status === "APPROVED")
      .map((t: { name: string; status: string; language: string; components?: Array<{ type: string; text?: string }> }) => {
        const bodyComponent = t.components?.find((c: { type: string }) => c.type === "BODY");
        const paramMatches = bodyComponent?.text?.match(/\{\{(\w+)\}\}/g) || [];
        const params = paramMatches.map((m: string) => ({
          name: m.replace(/[{}]/g, ""),
        }));

        return {
          name: t.name,
          status: t.status,
          language: t.language,
          params,
        };
      });

    return NextResponse.json({ templates });
  } catch (error) {
    console.error("Templates fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch templates", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
