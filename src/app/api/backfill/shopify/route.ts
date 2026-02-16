import { NextResponse } from "next/server";
import { getShopifySettings } from "@/lib/settings";
import { upsertOrder, ShopifyOrderPayload } from "@/lib/shopify-orders";
import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";

// ── Orders ──────────────────────────────────────────────────────────────────

interface ShopifyOrderEdge {
  node: {
    id: string;
    legacyResourceId: string;
    name: string;
    email: string | null;
    createdAt: string;
    displayFulfillmentStatus: string;
    totalPriceSet: { shopMoney: { amount: string } };
    subtotalPriceSet: { shopMoney: { amount: string } };
    totalShippingPriceSet: { shopMoney: { amount: string } };
    totalTaxSet: { shopMoney: { amount: string } };
    tags: string[];
    customer: {
      id: string;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
      phone: string | null;
    } | null;
    shippingAddress: {
      firstName: string | null;
      lastName: string | null;
      phone: string | null;
    } | null;
    discountCodes: string[];
    lineItems: {
      edges: Array<{ node: { sku: string | null; title: string; quantity: number } }>;
    };
    fulfillments: Array<{ trackingInfo: Array<{ number: string | null }> }>;
  };
}

interface ShopifyCustomerEdge {
  node: {
    id: string;
    legacyResourceId: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    emailMarketingConsent: { marketingState: string } | null;
    numberOfOrders: string;
    amountSpent: { amount: string };
    tags: string[];
    createdAt: string;
    lastOrder: { createdAt: string } | null;
  };
}

interface GraphQLResponse {
  data?: {
    orders?: {
      edges: ShopifyOrderEdge[];
      pageInfo: { hasNextPage: boolean; endCursor: string };
    };
    customers?: {
      edges: ShopifyCustomerEdge[];
      pageInfo: { hasNextPage: boolean; endCursor: string };
    };
  };
  errors?: Array<{ message: string }>;
}

function convertOrderToPayload(node: ShopifyOrderEdge["node"]): ShopifyOrderPayload {
  return {
    id: parseInt(node.legacyResourceId),
    order_number: parseInt(node.name.replace("#", "")),
    email: node.email || undefined,
    customer: node.customer
      ? {
          email: node.customer.email || undefined,
          first_name: node.customer.firstName || undefined,
          last_name: node.customer.lastName || undefined,
          phone: node.customer.phone || undefined,
        }
      : undefined,
    shipping_address: node.shippingAddress
      ? {
          first_name: node.shippingAddress.firstName || undefined,
          last_name: node.shippingAddress.lastName || undefined,
          phone: node.shippingAddress.phone || undefined,
        }
      : undefined,
    created_at: node.createdAt,
    fulfillment_status: node.displayFulfillmentStatus?.toLowerCase() || undefined,
    total_price: node.totalPriceSet.shopMoney.amount,
    subtotal_price: node.subtotalPriceSet.shopMoney.amount,
    total_shipping_price_set: {
      shop_money: { amount: node.totalShippingPriceSet.shopMoney.amount },
    },
    total_tax: node.totalTaxSet.shopMoney.amount,
    tags: node.tags.join(", "),
    discount_codes: node.discountCodes.map((code) => ({ code })),
    line_items: node.lineItems.edges.map((e) => ({
      sku: e.node.sku || undefined,
      title: e.node.title,
      quantity: e.node.quantity,
    })),
    fulfillments: node.fulfillments.flatMap((f) =>
      f.trackingInfo.map((t) => ({ tracking_number: t.number || undefined }))
    ),
  };
}

export async function GET(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);

    const url = new URL(request.url);
    const type = url.searchParams.get("type");
    if (type !== "orders" && type !== "customers") {
      return NextResponse.json({ error: "type must be 'orders' or 'customers'" }, { status: 400 });
    }

    const startDate = url.searchParams.get("startDate") || null;
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 250);
    const cursor = url.searchParams.get("cursor") || null;

    const settings = await getShopifySettings(orgId);
    if (!settings?.store_domain || !settings?.access_token) {
      return NextResponse.json({ error: "Shopify not configured for this org" }, { status: 400 });
    }

    // Explicitly include all statuses — Shopify defaults to open-only without this.
    // Valid values: open, closed, cancelled, not_closed.
    // Use NOT status:open to capture closed+cancelled, combined with open separately.
    const statusFilter = "status:open OR status:closed OR status:cancelled";
    const dateFilter = startDate ? `created_at:>=${startDate}` : "";
    const ordersQuery = [statusFilter, dateFilter].filter(Boolean).join(" ");
    const ordersQueryClause = `, query: "${ordersQuery}"`;
    const afterClause = cursor ? `, after: "${cursor}"` : "";

    const query =
      type === "orders"
        ? `{
            orders(first: ${limit}, sortKey: CREATED_AT, reverse: false${ordersQueryClause}${afterClause}) {
              edges {
                node {
                  id legacyResourceId name email createdAt displayFulfillmentStatus
                  totalPriceSet { shopMoney { amount } }
                  subtotalPriceSet { shopMoney { amount } }
                  totalShippingPriceSet { shopMoney { amount } }
                  totalTaxSet { shopMoney { amount } }
                  tags
                  customer { id email firstName lastName phone }
                  shippingAddress { firstName lastName phone }
                  discountCodes
                  lineItems(first: 50) { edges { node { sku title quantity } } }
                  fulfillments { trackingInfo { number } }
                }
              }
              pageInfo { hasNextPage endCursor }
            }
          }`
        : `{
            customers(first: ${limit}, sortKey: CREATED_AT, reverse: false${startDate ? `, query: "created_at:>=${startDate}"` : ""}${afterClause}) {
              edges {
                node {
                  id legacyResourceId firstName lastName email phone
                  emailMarketingConsent { marketingState }
                  numberOfOrders
                  amountSpent { amount }
                  tags createdAt
                  lastOrder { createdAt }
                }
              }
              pageInfo { hasNextPage endCursor }
            }
          }`;

    console.log(`[backfill/shopify] type=${type} startDate=${startDate ?? "none"} limit=${limit} cursor=${cursor ?? "none"} orgId=${orgId}`);
    if (type === "orders") {
      console.log(`[backfill/shopify] orders query filter: ${ordersQuery}`);
    }

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
      console.error(`[backfill/shopify] Shopify API errors:`, JSON.stringify(data.errors));
      return NextResponse.json(
        { error: "Shopify API error", details: data.errors[0]?.message },
        { status: 500 }
      );
    }

    let upserted = 0;
    let failed = 0;
    const errors: string[] = [];
    let pageInfo: { hasNextPage: boolean; endCursor: string } | undefined;

    if (type === "orders") {
      const edges = data.data?.orders?.edges || [];
      pageInfo = data.data?.orders?.pageInfo;
      console.log(`[backfill/shopify] orders: returned ${edges.length} edges, hasNextPage=${pageInfo?.hasNextPage}, endCursor=${pageInfo?.endCursor ?? "none"}`);

      for (const edge of edges) {
        try {
          await upsertOrder(convertOrderToPayload(edge.node), orgId);
          upserted++;
        } catch (err) {
          failed++;
          errors.push(`Order ${edge.node.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } else {
      const edges = data.data?.customers?.edges || [];
      pageInfo = data.data?.customers?.pageInfo;

      for (const edge of edges) {
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
          errors.push(`Customer ${node.email || node.legacyResourceId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      upserted,
      failed,
      errors: errors.length > 0 ? errors : undefined,
      hasNextPage: pageInfo?.hasNextPage ?? false,
      endCursor: pageInfo?.endCursor ?? null,
    });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "Backfill failed", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
