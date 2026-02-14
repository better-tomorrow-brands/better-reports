import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema";
import { desc, eq, count } from "drizzle-orm";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";

export async function GET(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "100");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    const [customerList, countResult] = await Promise.all([
      db.query.customers.findMany({
        where: eq(customers.orgId, orgId),
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
      db
        .select({ total: count() })
        .from(customers)
        .where(eq(customers.orgId, orgId)),
    ]);

    // Calculate lapse and lastWhatsappAt for each customer
    const customersWithExtras = customerList.map((customer) => {
      let lapse: number | null = null;
      if (customer.lastOrderAt) {
        const now = new Date();
        const lastOrder = new Date(customer.lastOrderAt);
        lapse = Math.floor((now.getTime() - lastOrder.getTime()) / (1000 * 60 * 60 * 24));
      }

      let lastWhatsappAt: Date | null = null;
      const sentMessages = customer.campaignsWaCustomers
        .filter((c) => c.status === "sent" && c.sentAt)
        .map((c) => new Date(c.sentAt!));

      if (sentMessages.length > 0) {
        lastWhatsappAt = new Date(Math.max(...sentMessages.map((d) => d.getTime())));
      }

      const { campaignsWaCustomers, ...customerData } = customer;

      return {
        ...customerData,
        lapse,
        lastWhatsappAt,
      };
    });

    return NextResponse.json({
      customers: customersWithExtras,
      total: countResult[0]?.total ?? 0,
      limit,
      offset,
    });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to fetch customers:", error);
    return NextResponse.json(
      { error: "Failed to fetch customers" },
      { status: 500 }
    );
  }
}
