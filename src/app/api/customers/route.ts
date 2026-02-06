import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get("limit") || "100");
  const offset = parseInt(url.searchParams.get("offset") || "0");

  try {
    const [customerList, countResult] = await Promise.all([
      db.query.customers.findMany({
        orderBy: [desc(customers.createdAt)],
        limit,
        offset,
        with: {
          campaignsWaCustomers: {
            columns: {
              sentAt: true,
              status: true,
            },
          },
        },
      }),
      db.select().from(customers),
    ]);

    // Calculate lapse and lastWhatsappAt for each customer
    const customersWithExtras = customerList.map((customer) => {
      // Calculate lapse (days since last order)
      let lapse: number | null = null;
      if (customer.lastOrderAt) {
        const now = new Date();
        const lastOrder = new Date(customer.lastOrderAt);
        lapse = Math.floor((now.getTime() - lastOrder.getTime()) / (1000 * 60 * 60 * 24));
      }

      // Find the most recent WhatsApp sent date
      let lastWhatsappAt: Date | null = null;
      const sentMessages = customer.campaignsWaCustomers
        .filter((c) => c.status === "sent" && c.sentAt)
        .map((c) => new Date(c.sentAt!));

      if (sentMessages.length > 0) {
        lastWhatsappAt = new Date(Math.max(...sentMessages.map((d) => d.getTime())));
      }

      // Remove the junction data from response
      const { campaignsWaCustomers, ...customerData } = customer;

      return {
        ...customerData,
        lapse,
        lastWhatsappAt,
      };
    });

    return NextResponse.json({
      customers: customersWithExtras,
      total: countResult.length,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Failed to fetch customers:", error);
    return NextResponse.json(
      { error: "Failed to fetch customers" },
      { status: 500 }
    );
  }
}
