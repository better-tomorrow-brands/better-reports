import { NextResponse } from "next/server";
import { getShopifySettings } from "@/lib/settings";
import { upsertOrder, ShopifyOrderPayload } from "@/lib/shopify-orders";

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
      edges: Array<{
        node: {
          sku: string | null;
          title: string;
          quantity: number;
        };
      }>;
    };
    fulfillments: Array<{
      trackingInfo: Array<{ number: string | null }>;
    }>;
  };
}

interface GraphQLResponse {
  data?: {
    orders: {
      edges: ShopifyOrderEdge[];
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string;
      };
    };
  };
  errors?: Array<{ message: string }>;
}

// Convert GraphQL order to webhook payload format
function convertToPayload(node: ShopifyOrderEdge["node"]): ShopifyOrderPayload {
  return {
    id: parseInt(node.legacyResourceId),
    order_number: parseInt(node.name.replace("#", "")),
    email: node.email || undefined,
    customer: node.customer ? {
      email: node.customer.email || undefined,
      first_name: node.customer.firstName || undefined,
      last_name: node.customer.lastName || undefined,
      phone: node.customer.phone || undefined,
    } : undefined,
    shipping_address: node.shippingAddress ? {
      first_name: node.shippingAddress.firstName || undefined,
      last_name: node.shippingAddress.lastName || undefined,
      phone: node.shippingAddress.phone || undefined,
    } : undefined,
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
  // Check for secret key to prevent unauthorized access
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");

  if (secret !== process.env.CRON_SECRET && secret !== "dev-backfill") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getShopifySettings();
  if (!settings?.store_domain || !settings?.access_token) {
    return NextResponse.json({ error: "Shopify not configured" }, { status: 400 });
  }

  const limit = parseInt(url.searchParams.get("limit") || "50");
  const cursor = url.searchParams.get("cursor") || null;

  const query = `{
    orders(first: ${limit}, sortKey: CREATED_AT, reverse: true${cursor ? `, after: "${cursor}"` : ""}) {
      edges {
        node {
          id
          legacyResourceId
          name
          email
          createdAt
          displayFulfillmentStatus
          totalPriceSet { shopMoney { amount } }
          subtotalPriceSet { shopMoney { amount } }
          totalShippingPriceSet { shopMoney { amount } }
          totalTaxSet { shopMoney { amount } }
          tags
          customer {
            id
            email
            firstName
            lastName
            phone
          }
          shippingAddress {
            firstName
            lastName
            phone
          }
          discountCodes
          lineItems(first: 50) {
            edges {
              node {
                sku
                title
                quantity
              }
            }
          }
          fulfillments {
            trackingInfo {
              number
            }
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
    console.log(`Fetching ${limit} orders from Shopify...`);

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
        { error: "Failed to fetch orders", details: data.errors[0]?.message },
        { status: 500 }
      );
    }

    const orders = data.data?.orders.edges || [];
    console.log(`Fetched ${orders.length} orders, upserting...`);

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const edge of orders) {
      try {
        const payload = convertToPayload(edge.node);
        await upsertOrder(payload);
        success++;
        console.log(`Upserted order #${edge.node.name}`);
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Order ${edge.node.name}: ${msg}`);
        console.error(`Failed to upsert order ${edge.node.name}:`, err);
      }
    }

    const pageInfo = data.data?.orders.pageInfo;
    return NextResponse.json({
      success: true,
      fetched: orders.length,
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
