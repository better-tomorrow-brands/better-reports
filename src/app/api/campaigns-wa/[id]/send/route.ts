import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { campaignsWa, campaignsWaCustomers, customers } from "@/lib/db/schema";
import { getMetaSettings, getShopifySettings } from "@/lib/settings";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";

function formatPhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-()]/g, "");
  if (cleaned.startsWith("+44")) cleaned = cleaned.slice(1);
  if (cleaned.startsWith("0")) cleaned = "44" + cleaned.slice(1);
  if (!cleaned.startsWith("44")) cleaned = "44" + cleaned;
  return cleaned;
}

async function sendWhatsAppMessage(
  phoneNumberId: string,
  accessToken: string,
  phone: string,
  templateName: string,
  params: { name: string; value: string }[]
) {
  const formattedPhone = formatPhone(phone);

  // Build payload matching the working manual send structure
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
      name: templateName,
      language: { code: "en" },
    },
  };

  // Only include components if there are params (matching manual send behavior)
  if (params.length > 0) {
    payload.template.components = [
      {
        type: "body",
        parameters: params.map((p) => ({ type: "text", parameter_name: p.name, text: p.value })),
      },
    ];
  }

  const response = await fetch(
    `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || "WhatsApp API error");
  }
  return data;
}

async function addShopifyCustomerNote(
  storeDomain: string,
  accessToken: string,
  shopifyCustomerId: string,
  newNote: string
) {
  const customerId = shopifyCustomerId.replace("gid://shopify/Customer/", "");

  // First, fetch the existing customer to get their current note
  const getResponse = await fetch(
    `https://${storeDomain}/admin/api/2024-10/customers/${customerId}.json`,
    {
      headers: {
        "X-Shopify-Access-Token": accessToken,
      },
    }
  );

  let existingNote = "";
  if (getResponse.ok) {
    const getData = await getResponse.json();
    existingNote = getData.customer?.note || "";
  }

  // Append new note to existing
  const updatedNote = existingNote
    ? `${newNote}\n\n---\n\n${existingNote}`
    : newNote;

  // Update customer with appended note
  const response = await fetch(
    `https://${storeDomain}/admin/api/2024-10/customers/${customerId}.json`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        customer: {
          id: customerId,
          note: updatedNote,
        },
      }),
    }
  );

  if (!response.ok) {
    const data = await response.json();
    console.error("Shopify note update error:", data);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { orgId } = await requireOrgFromRequest(request);
    const { id } = await params;
    const campaignId = parseInt(id);

    // Get Meta settings
    const metaSettings = await getMetaSettings(orgId);
    if (!metaSettings?.access_token || !metaSettings?.phone_number_id) {
      return NextResponse.json(
        { error: "WhatsApp not configured" },
        { status: 400 }
      );
    }

    // Get Shopify settings for timeline updates
    const shopifySettings = await getShopifySettings(orgId);

    // Fetch campaign with customers
    const campaign = await db.query.campaignsWa.findFirst({
      where: and(eq(campaignsWa.id, campaignId), eq(campaignsWa.orgId, orgId)),
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

    if (campaign.status !== "draft") {
      return NextResponse.json(
        { error: "Campaign already sent or in progress" },
        { status: 400 }
      );
    }

    // Update campaign status to sending
    await db
      .update(campaignsWa)
      .set({ status: "sending" })
      .where(and(eq(campaignsWa.id, campaignId), eq(campaignsWa.orgId, orgId)));

    const results = {
      total: campaign.campaignsWaCustomers.length,
      sent: 0,
      failed: 0,
    };

    // Send to each customer
    for (const record of campaign.campaignsWaCustomers) {
      if (!record.phone) {
        // Update as failed - no phone
        await db
          .update(campaignsWaCustomers)
          .set({
            status: "failed",
            errorMessage: "No phone number",
          })
          .where(eq(campaignsWaCustomers.id, record.id));
        results.failed++;
        continue;
      }

      try {
        // Build params - use first_name as the common param name
        const params = [];
        if (record.firstName) {
          params.push({ name: "first_name", value: record.firstName });
        }

        await sendWhatsAppMessage(
          metaSettings.phone_number_id,
          metaSettings.access_token,
          record.phone,
          campaign.templateName,
          params
        );

        // Update junction table as sent
        await db
          .update(campaignsWaCustomers)
          .set({
            status: "sent",
            sentAt: new Date(),
          })
          .where(eq(campaignsWaCustomers.id, record.id));

        results.sent++;

        // Add Shopify customer note if configured
        if (shopifySettings?.store_domain && shopifySettings?.access_token && record.customer?.shopifyCustomerId) {
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
            record.customer.shopifyCustomerId,
            noteText
          ).catch((err) => console.error("Shopify note error:", err));
        }
      } catch (err) {
        // Update junction table as failed
        await db
          .update(campaignsWaCustomers)
          .set({
            status: "failed",
            errorMessage: err instanceof Error ? err.message : String(err),
          })
          .where(eq(campaignsWaCustomers.id, record.id));
        results.failed++;
      }
    }

    // Update campaign as completed
    await db
      .update(campaignsWa)
      .set({
        status: "completed",
        sentAt: new Date(),
      })
      .where(and(eq(campaignsWa.id, campaignId), eq(campaignsWa.orgId, orgId)));

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Campaign send error:", error);
    return NextResponse.json(
      { error: "Failed to send campaign", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
