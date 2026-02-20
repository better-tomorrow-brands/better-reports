import { NextResponse } from "next/server";
import { getShopifySettings } from "@/lib/settings";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";

export const maxDuration = 300; // 5 minutes for large catalogs

interface ShopifyProduct {
  id: string;
  title: string;
  vendor: string;
  image: {
    src: string;
  } | null;
  images: {
    edges: Array<{
      node: {
        src: string;
      };
    }>;
  };
  variants: {
    edges: Array<{
      node: {
        id: string;
        sku: string;
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
        endCursor: string | null;
      };
    };
  };
  errors?: Array<{ message: string }>;
}

/**
 * GET /api/backfill/shopify-product-images
 *
 * Fetches all products from Shopify and updates image URLs in database
 * Matches products by SKU
 *
 * Query params:
 * - Uses org from auth context
 */
export async function GET(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);
    const settings = await getShopifySettings(orgId);

    if (!settings?.store_domain || !settings?.access_token) {
      return NextResponse.json(
        { error: "Shopify not configured for this organization" },
        { status: 400 }
      );
    }

    let hasNextPage = true;
    let cursor: string | null = null;
    let totalProducts = 0;
    let updated = 0;
    let skipped = 0;

    while (hasNextPage) {
      const query = `{
        products(first: 50${cursor ? `, after: "${cursor}"` : ""}) {
          edges {
            node {
              id
              title
              vendor
              image {
                src
              }
              images(first: 1) {
                edges {
                  node {
                    src
                  }
                }
              }
              variants(first: 50) {
                edges {
                  node {
                    id
                    sku
                  }
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
          { error: "Failed to fetch products from Shopify", details: data.errors[0]?.message },
          { status: 500 }
        );
      }

      if (!data.data?.products) {
        break;
      }

      const shopifyProducts = data.data.products.edges;
      totalProducts += shopifyProducts.length;

      // Process each product
      for (const edge of shopifyProducts) {
        const product = edge.node;
        const imageUrl = product.image?.src || product.images.edges[0]?.node.src || null;
        const brand = product.vendor;

        // Update all variants by SKU
        for (const variantEdge of product.variants.edges) {
          const sku = variantEdge.node.sku;
          if (!sku) continue;

          try {
            // Find product in our DB by SKU and orgId
            const existingProducts = await db
              .select()
              .from(products)
              .where(and(eq(products.sku, sku), eq(products.orgId, orgId)))
              .limit(1);

            if (existingProducts.length > 0) {
              // Update with image URL and brand
              await db
                .update(products)
                .set({
                  imageUrl,
                  brand: brand || existingProducts[0].brand,
                  updatedAt: new Date(),
                })
                .where(eq(products.id, existingProducts[0].id));

              updated++;
            } else {
              skipped++;
            }
          } catch (err) {
            console.error(`Error updating product ${sku}:`, err);
            // Continue with next product
          }
        }
      }

      // Pagination
      hasNextPage = data.data.products.pageInfo.hasNextPage;
      cursor = data.data.products.pageInfo.endCursor;

      // Add small delay to avoid rate limiting
      if (hasNextPage) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    return NextResponse.json({
      success: true,
      totalShopifyProducts: totalProducts,
      updated,
      skipped,
      message: `Updated ${updated} products with image URLs from Shopify. ${skipped} SKUs not found in database.`,
    });

  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Shopify product images backfill error:", error);
    return NextResponse.json(
      {
        error: "Backfill failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
