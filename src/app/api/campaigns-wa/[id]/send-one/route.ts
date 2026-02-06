import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { campaignsWa, campaignsWaCustomers, customers } from "@/lib/db/schema";
import { getMetaSettings, getShopifySettings } from "@/lib/settings";

function formatPhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-()]/g, "");
  if (cleaned.startsWith("+44")) cleaned = cleaned.slice(1);
  if (cleaned.startsWith("0")) cleaned = "44" + cleaned.slice(1);
  if (!cleaned.startsWith("44")) cleaned = "44" + cleaned;
  return cleaned;
}

async function addShopifyCustomerNote(
  storeDomain: string,
  accessToken: string,
  shopifyCustomerId: string,
  newNote: string
) {
  const customerId = shopifyCustomerId.replace("gid://shopify/Customer/", "");

  const getResponse = await fetch(
    `https://${storeDomain}/admin/api/2024-10/customers/${customerId}.json`,
    {
      headers: { "X-Shopify-Access-Token": accessToken },
    }
  );

  let existingNote = "";
  if (getResponse.ok) {
    const getData = await getResponse.json();
    existingNote = getData.customer?.note || "";
  }

  const updatedNote = existingNote
    ? `${newNote}\n\n---\n\n${existingNote}`
    : newNote;

  await fetch(
    `https://${storeDomain}/admin/api/2024-10/customers/${customerId}.json`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        customer: { id: customerId, note: updatedNote },
      }),
    }
  );
}

export async function POST(
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
    const { campaignCustomerId } = body;

    if (!campaignCustomerId) {
      return NextResponse.json({ error: "campaignCustomerId required" }, { status: 400 });
    }

    // Get Meta settings
    const metaSettings = await getMetaSettings();
    if (!metaSettings?.access_token || !metaSettings?.phone_number_id) {
      return NextResponse.json({ error: "WhatsApp not configured" }, { status: 400 });
    }

    // Get campaign and customer record
    const campaign = await db.query.campaignsWa.findFirst({
      where: eq(campaignsWa.id, campaignId),
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const customerRecord = await db.query.campaignsWaCustomers.findFirst({
      where: and(
        eq(campaignsWaCustomers.id, campaignCustomerId),
        eq(campaignsWaCustomers.campaignId, campaignId)
      ),
      with: { customer: true },
    });

    if (!customerRecord) {
      return NextResponse.json({ error: "Customer record not found" }, { status: 404 });
    }

    if (!customerRecord.phone) {
      await db
        .update(campaignsWaCustomers)
        .set({ status: "failed", errorMessage: "No phone number" })
        .where(eq(campaignsWaCustomers.id, campaignCustomerId));
      return NextResponse.json({ success: false, error: "No phone number" });
    }

    // Build template params
    const templateParams: { name: string; value: string }[] = [];
    if (customerRecord.firstName) {
      templateParams.push({ name: "first_name", value: customerRecord.firstName });
    }

    // Build payload
    const formattedPhone = formatPhone(customerRecord.phone);
    const payload: {
      messaging_product: string;
      to: string;
      type: string;
      template: {
        name: string;
        language: { code: string };
        components?: { type: string; parameters: { type: string; parameter_name: string; text: string }[] }[];
      };
    } = {
      messaging_product: "whatsapp",
      to: formattedPhone,
      type: "template",
      template: {
        name: campaign.templateName,
        language: { code: "en" },
      },
    };

    if (templateParams.length > 0) {
      payload.template.components = [
        {
          type: "body",
          parameters: templateParams.map((p) => ({ type: "text", parameter_name: p.name, text: p.value })),
        },
      ];
    }

    // Send WhatsApp message
    const response = await fetch(
      `https://graph.facebook.com/v22.0/${metaSettings.phone_number_id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${metaSettings.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data.error?.message || "WhatsApp API error";
      await db
        .update(campaignsWaCustomers)
        .set({ status: "failed", errorMessage: errorMsg })
        .where(eq(campaignsWaCustomers.id, campaignCustomerId));
      return NextResponse.json({ success: false, error: errorMsg });
    }

    // Mark as sent
    await db
      .update(campaignsWaCustomers)
      .set({ status: "sent", sentAt: new Date() })
      .where(eq(campaignsWaCustomers.id, campaignCustomerId));

    // Add Shopify note
    const shopifySettings = await getShopifySettings();
    if (shopifySettings?.store_domain && shopifySettings?.access_token && customerRecord.customer?.shopifyCustomerId) {
      const timestamp = new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const noteText = `[${timestamp}] WhatsApp campaign "${campaign.name}" sent (template: ${campaign.templateName})`;

      await addShopifyCustomerNote(
        shopifySettings.store_domain,
        shopifySettings.access_token,
        customerRecord.customer.shopifyCustomerId,
        noteText
      ).catch((err) => console.error("Shopify note error:", err));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Send one error:", error);
    return NextResponse.json(
      { error: "Failed to send", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
