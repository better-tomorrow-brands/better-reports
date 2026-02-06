import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { campaignsWaCustomers } from "@/lib/db/schema";

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

    if (!body.customers || !Array.isArray(body.customers)) {
      return NextResponse.json({ error: "Customers array required" }, { status: 400 });
    }

    // Insert customers into junction table
    const customerRecords = body.customers.map((c: { id: number; phone: string; firstName: string }) => ({
      campaignId,
      customerId: c.id,
      phone: c.phone,
      firstName: c.firstName,
      status: "pending",
    }));

    if (customerRecords.length > 0) {
      await db.insert(campaignsWaCustomers).values(customerRecords);
    }

    return NextResponse.json({
      success: true,
      added: customerRecords.length
    });
  } catch (error) {
    console.error("Add customers to campaign error:", error);
    return NextResponse.json(
      { error: "Failed to add customers", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// PUT replaces all customers for the campaign
export async function PUT(
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

    if (!body.customers || !Array.isArray(body.customers)) {
      return NextResponse.json({ error: "Customers array required" }, { status: 400 });
    }

    // Delete existing customers for this campaign
    await db.delete(campaignsWaCustomers).where(eq(campaignsWaCustomers.campaignId, campaignId));

    // Insert new customers
    const customerRecords = body.customers.map((c: { id: number; phone: string; firstName: string }) => ({
      campaignId,
      customerId: c.id,
      phone: c.phone,
      firstName: c.firstName,
      status: "pending",
    }));

    if (customerRecords.length > 0) {
      await db.insert(campaignsWaCustomers).values(customerRecords);
    }

    return NextResponse.json({
      success: true,
      count: customerRecords.length
    });
  } catch (error) {
    console.error("Update campaign customers error:", error);
    return NextResponse.json(
      { error: "Failed to update customers", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
