import { NextResponse } from "next/server";
import { getShopifySettings } from "@/lib/settings";
import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

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
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string;
      };
    };
  };
  errors?: Array<{ message: string }>;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");

  if (secret !== process.env.CRON_SECRET && secret !== "dev-backfill") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgIdParam = url.searchParams.get("orgId");
  if (!orgIdParam) {
    return NextResponse.json({ error: "orgId query param required" }, { status: 400 });
  }
  const orgId = parseInt(orgIdParam);

  const settings = await getShopifySettings(orgId);
  if (!settings?.store_domain || !settings?.access_token) {
    return NextResponse.json({ error: "Shopify not configured" }, { status: 400 });
  }

  const limit = parseInt(url.searchParams.get("limit") || "100");
  const cursor = url.searchParams.get("cursor") || null;

  const query = `{
    customers(first: ${limit}, sortKey: CREATED_AT, reverse: true${cursor ? `, after: "${cursor}"` : ""}) {
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
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }`;

  try {
    console.log(`Fetching ${limit} customers from Shopify...`);

    const response = await fetch(
      `https://${settings.store_domain}/admin/api/2024-10/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": settings.access_token,
        },
        body: JSON.stringify({ query }),
      }
    );

    const data: GraphQLResponse = await response.json();

    if (data.errors) {
      console.error("Shopify GraphQL errors:", data.errors);
      return NextResponse.json(
        { error: "Failed to fetch customers", details: data.errors[0]?.message },
        { status: 500 }
      );
    }

    const customerEdges = data.data?.customers.edges || [];
    console.log(`Fetched ${customerEdges.length} customers, upserting...`);

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

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

        // Upsert by email (if exists) or shopifyCustomerId, scoped to org
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
          // No email, upsert by shopifyCustomerId
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

        success++;
        console.log(`Upserted customer ${node.firstName} ${node.lastName} (${node.email || node.legacyResourceId})`);
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Customer ${node.email || node.legacyResourceId}: ${msg}`);
        console.error(`Failed to upsert customer ${node.email || node.legacyResourceId}:`, err);
      }
    }

    const pageInfo = data.data?.customers.pageInfo;
    return NextResponse.json({
      success: true,
      fetched: customerEdges.length,
      upserted: success,
      failed,
      errors: errors.length > 0 ? errors : undefined,
      hasNextPage: pageInfo?.hasNextPage,
      endCursor: pageInfo?.endCursor,
    });
  } catch (error) {
    console.error("Backfill error:", error);
    return NextResponse.json(
      { error: "Backfill failed", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
