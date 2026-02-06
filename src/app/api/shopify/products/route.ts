import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getShopifySettings } from "@/lib/settings";

interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  variants: {
    edges: Array<{
      node: {
        id: string;
        sku: string;
        title: string;
      };
    }>;
  };
}

interface GraphQLResponse {
  data?: {
    products: {
      edges: Array<{
        node: ShopifyProduct;
      }>;
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string;
      };
    };
  };
  errors?: Array<{ message: string }>;
}

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getShopifySettings();
  if (!settings?.store_domain || !settings?.access_token) {
    return NextResponse.json(
      { error: "Shopify not configured" },
      { status: 400 }
    );
  }

  const url = new URL(request.url);
  const search = url.searchParams.get("search") || "";

  // Build GraphQL query with optional search
  const searchFilter = search ? `query: "title:*${search}*"` : "";

  const query = `{
    products(first: 50${searchFilter ? `, ${searchFilter}` : ""}) {
      edges {
        node {
          id
          title
          handle
          variants(first: 10) {
            edges {
              node {
                id
                sku
                title
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
        { error: "Failed to fetch products", details: data.errors[0]?.message },
        { status: 500 }
      );
    }

    const products = data.data?.products.edges.map((edge) => ({
      id: edge.node.id,
      title: edge.node.title,
      handle: edge.node.handle,
      variants: edge.node.variants.edges.map((v) => ({
        id: v.node.id,
        sku: v.node.sku,
        title: v.node.title,
      })),
    })) || [];

    return NextResponse.json({ products });
  } catch (error) {
    console.error("Shopify products error:", error);
    return NextResponse.json(
      { error: "Failed to fetch products", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
