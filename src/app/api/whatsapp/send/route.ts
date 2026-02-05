import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getMetaSettings } from "@/lib/settings";

interface ParamEntry {
  name: string;
  value: string;
}

interface SendRequest {
  phone: string;
  template_name: string;
  params: ParamEntry[];
}

function formatPhone(phone: string): string {
  // Strip spaces, dashes, parentheses
  let cleaned = phone.replace(/[\s\-()]/g, "");

  // If starts with +44, strip the +
  if (cleaned.startsWith("+44")) {
    cleaned = cleaned.slice(1);
  }

  // If starts with 0, replace with 44
  if (cleaned.startsWith("0")) {
    cleaned = "44" + cleaned.slice(1);
  }

  // If doesn't start with 44, prepend it
  if (!cleaned.startsWith("44")) {
    cleaned = "44" + cleaned;
  }

  return cleaned;
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const metaSettings = await getMetaSettings();
    if (!metaSettings?.access_token || !metaSettings?.phone_number_id) {
      return NextResponse.json(
        { error: "WhatsApp not configured. Go to Settings to add your Meta credentials." },
        { status: 400 }
      );
    }
    const body: SendRequest = await request.json();
    const { phone, template_name, params } = body;

    if (!phone || !template_name || !params?.length) {
      return NextResponse.json(
        { error: "Missing required fields: phone, template_name, params" },
        { status: 400 }
      );
    }

    const formattedPhone = formatPhone(phone);

    const payload = {
      messaging_product: "whatsapp",
      to: formattedPhone,
      type: "template",
      template: {
        name: template_name,
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: params.map((p) => ({ type: "text", parameter_name: p.name, text: p.value })),
          },
        ],
      },
    };

    const apiUrl = `https://graph.facebook.com/v22.0/${metaSettings.phone_number_id}/messages`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${metaSettings.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("WhatsApp API error:", data);
      return NextResponse.json(
        {
          error: "WhatsApp API error",
          details: data.error?.message || JSON.stringify(data),
        },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("WhatsApp send error:", error);
    return NextResponse.json(
      {
        error: "Failed to send message",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
