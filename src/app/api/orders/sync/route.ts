import { NextResponse } from "next/server";
import { getShopifySettings } from "@/lib/settings";
import { upsertOrder, ShopifyOrderPayload } from "@/lib/shopify-orders";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";

interface ShopifyOrderEdge {
  node: {
    id: string;
    legacyResourceId: string;
    name: string;
    email: string | null;
    createdAt: string;
    displayFulfillmentStatus: string;
    totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
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
    };
  };
  errors?: Array<{ message: string }>;
}

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
    currency: node.totalPriceSet.shopMoney.currencyCode,
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

const ORDERS_QUERY = `{
  orders(first: 50, sortKey: CREATED_AT, reverse: true) {
    edges {
      node {
        id
        legacyResourceId
        name
        email
        createdAt
        displayFulfillmentStatus
        totalPriceSet { shopMoney { amount currencyCode } }
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
        body: JSON.stringify({ query: ORDERS_QUERY }),
      }
    );

    const data: GraphQLResponse = await response.json();

    if (data.errors) {
      return NextResponse.json(
        { error: "Failed to fetch orders", details: data.errors[0]?.message },
        { status: 500 }
      );
    }

    const orders = data.data?.orders.edges || [];
    let upserted = 0;
    let failed = 0;

    for (const edge of orders) {
      try {
        const payload = convertToPayload(edge.node);
        await upsertOrder(payload, orgId);
        upserted++;
      } catch (err) {
        failed++;
        console.error(`Sync: failed to upsert order ${edge.node.name}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      fetched: orders.length,
      upserted,
      failed,
    });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Order sync error:", error);
    return NextResponse.json(
      { error: "Sync failed", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
