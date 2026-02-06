import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getShopifySettings } from "@/lib/settings";

interface DiscountNode {
  id: string;
  codeDiscount?: {
    title: string;
    codes: {
      edges: Array<{
        node: {
          code: string;
        };
      }>;
    };
    customerGets?: {
      value: {
        percentage?: number;
        amount?: { amount: string };
      };
    };
  };
}

interface GraphQLResponse {
  data?: {
    codeDiscountNodes?: {
      edges: Array<{ node: DiscountNode }>;
    };
    discountCodeBasicCreate?: {
      codeDiscountNode?: {
        id: string;
        codeDiscount?: {
          codes: {
            edges: Array<{ node: { code: string } }>;
          };
        };
      };
      userErrors?: Array<{ field: string[]; message: string }>;
    };
  };
  errors?: Array<{ message: string }>;
}

// GET - Fetch existing discount codes
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getShopifySettings();
  if (!settings?.store_domain || !settings?.access_token) {
    return NextResponse.json({ error: "Shopify not configured" }, { status: 400 });
  }

  const url = new URL(request.url);
  const search = url.searchParams.get("search") || "";

  const searchFilter = search ? `, query: "title:*${search}*"` : "";

  const query = `{
    codeDiscountNodes(first: 50${searchFilter}) {
      edges {
        node {
          id
          codeDiscount {
            ... on DiscountCodeBasic {
              title
              status
              codes(first: 1) {
                edges {
                  node {
                    code
                  }
                }
              }
              customerGets {
                value {
                  ... on DiscountPercentage {
                    percentage
                  }
                  ... on DiscountAmount {
                    amount {
                      amount
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }`;

  try {
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
        { error: "Failed to fetch discounts", details: data.errors[0]?.message },
        { status: 500 }
      );
    }

    const discounts = data.data?.codeDiscountNodes?.edges
      .filter((edge) => edge.node.codeDiscount)
      .map((edge) => {
        const discount = edge.node.codeDiscount!;
        const code = discount.codes?.edges[0]?.node?.code || "";
        const value = discount.customerGets?.value;
        let discountValue = "";
        if (value?.percentage) {
          discountValue = `${Math.round(value.percentage * 100)}% off`;
        } else if (value?.amount?.amount) {
          discountValue = `£${value.amount.amount} off`;
        }
        return {
          id: edge.node.id,
          title: discount.title,
          code,
          value: discountValue,
        };
      }) || [];

    return NextResponse.json({ discounts });
  } catch (error) {
    console.error("Shopify discounts error:", error);
    return NextResponse.json(
      { error: "Failed to fetch discounts", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// POST - Create new discount code
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getShopifySettings();
  if (!settings?.store_domain || !settings?.access_token) {
    return NextResponse.json({ error: "Shopify not configured" }, { status: 400 });
  }

  const body = await request.json();
  const { code, title, discountType, discountValue } = body;

  if (!code || !discountValue) {
    return NextResponse.json({ error: "Code and discount value are required" }, { status: 400 });
  }

  // Build the discount value based on type
  let customerGetsValue = "";
  if (discountType === "percentage") {
    const percentage = parseFloat(discountValue) / 100;
    customerGetsValue = `percentage: ${percentage}`;
  } else {
    customerGetsValue = `discountAmount: { amount: "${discountValue}", currencyCode: GBP }`;
  }

  const mutation = `
    mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
        codeDiscountNode {
          id
          codeDiscount {
            ... on DiscountCodeBasic {
              codes(first: 1) {
                edges {
                  node {
                    code
                  }
                }
              }
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    basicCodeDiscount: {
      title: title || code,
      code,
      startsAt: new Date().toISOString(),
      customerGets: {
        value: discountType === "percentage"
          ? { percentage: parseFloat(discountValue) / 100 }
          : { discountAmount: { amount: discountValue, currencyCode: "GBP" } },
        items: {
          all: true,
        },
      },
      customerSelection: {
        all: true,
      },
    },
  };

  try {
    const response = await fetch(
      `https://${settings.store_domain}/admin/api/2024-10/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": settings.access_token,
        },
        body: JSON.stringify({ query: mutation, variables }),
      }
    );

    const data: GraphQLResponse = await response.json();

    if (data.errors) {
      console.error("Shopify GraphQL errors:", data.errors);
      return NextResponse.json(
        { error: "Failed to create discount", details: data.errors[0]?.message },
        { status: 500 }
      );
    }

    const userErrors = data.data?.discountCodeBasicCreate?.userErrors;
    if (userErrors && userErrors.length > 0) {
      return NextResponse.json(
        { error: "Failed to create discount", details: userErrors[0].message },
        { status: 400 }
      );
    }

    const createdCode = data.data?.discountCodeBasicCreate?.codeDiscountNode?.codeDiscount?.codes?.edges[0]?.node?.code;

    return NextResponse.json({
      success: true,
      code: createdCode || code,
    });
  } catch (error) {
    console.error("Shopify create discount error:", error);
    return NextResponse.json(
      { error: "Failed to create discount", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
