import { NextResponse } from "next/server";
import { getShopifySettings } from "@/lib/settings";
import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";

interface ShopifyCustomerEdge {
  node: {
    id: string;
    legacyResourceId: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    emailMarketingConsent: {
      marketingState: string;
    } | null;
    numberOfOrders: string;
    amountSpent: {
      amount: string;
    };
    tags: string[];
    createdAt: string;
    lastOrder: {
      createdAt: string;
    } | null;
  };
}

interface GraphQLResponse {
  data?: {
    customers: {
      edges: ShopifyCustomerEdge[];
    };
  };
  errors?: Array<{ message: string }>;
}

const CUSTOMERS_QUERY = `{
  customers(first: 50, sortKey: CREATED_AT, reverse: true) {
    edges {
      node {
        id
        legacyResourceId
        firstName
        lastName
        email
        phone
        emailMarketingConsent {
          marketingState
        }
        numberOfOrders
        amountSpent {
          amount
        }
        tags
        createdAt
        lastOrder {
          createdAt
        }
      }
    }
  }
}`;

export async function POST(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);

    const settings = await getShopifySettings(orgId);
    if (!settings?.store_domain || !settings?.access_token) {
      return NextResponse.json({ error: "Shopify not configured" }, { status: 400 });
    }

    const response = await fetch(
      `https://${settings.store_domain}/admin/api/2024-10/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": settings.access_token,
        },
        body: JSON.stringify({ query: CUSTOMERS_QUERY }),
      }
    );

    const data: GraphQLResponse = await response.json();

    if (data.errors) {
      return NextResponse.json(
        { error: "Failed to fetch customers", details: data.errors[0]?.message },
        { status: 500 }
      );
    }

    const customerEdges = data.data?.customers.edges || [];
    let upserted = 0;
    let failed = 0;

    for (const edge of customerEdges) {
      const node = edge.node;
      try {
        const customerData = {
          orgId,
          shopifyCustomerId: node.legacyResourceId,
          firstName: node.firstName || undefined,
          lastName: node.lastName || undefined,
          email: node.email || undefined,
          phone: node.phone || undefined,
          emailMarketingConsent: node.emailMarketingConsent?.marketingState === "SUBSCRIBED",
          ordersCount: parseInt(node.numberOfOrders) || 0,
          totalSpent: node.amountSpent?.amount || "0",
          tags: node.tags.join(", ") || undefined,
          createdAt: new Date(node.createdAt),
          lastOrderAt: node.lastOrder ? new Date(node.lastOrder.createdAt) : undefined,
        };

        if (customerData.email) {
          const existing = await db
            .select()
            .from(customers)
            .where(and(eq(customers.orgId, orgId), eq(customers.email, customerData.email)))
            .limit(1);

          if (existing.length > 0) {
            await db
              .update(customers)
              .set(customerData)
              .where(and(eq(customers.orgId, orgId), eq(customers.email, customerData.email)));
          } else {
            await db.insert(customers).values(customerData);
          }
        } else {
          const existing = await db
            .select()
            .from(customers)
            .where(and(eq(customers.orgId, orgId), eq(customers.shopifyCustomerId, node.legacyResourceId)))
            .limit(1);

          if (existing.length > 0) {
            await db
              .update(customers)
              .set(customerData)
              .where(and(eq(customers.orgId, orgId), eq(customers.shopifyCustomerId, node.legacyResourceId)));
          } else {
            await db.insert(customers).values(customerData);
          }
        }

        upserted++;
      } catch (err) {
        failed++;
        console.error(`Sync: failed to upsert customer ${node.email || node.legacyResourceId}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      fetched: customerEdges.length,
      upserted,
      failed,
    });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Customer sync error:", error);
    return NextResponse.json(
      { error: "Sync failed", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
