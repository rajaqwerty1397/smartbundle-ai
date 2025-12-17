import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prisma } from "../db/prisma.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Add CORS headers
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  try {
    const url = new URL(request.url);
    const productId = url.searchParams.get("productId");
    const shopDomain = url.searchParams.get("shop");

    if (!productId || !shopDomain) {
      return json({ bundles: [], error: "Missing productId or shop" }, { headers });
    }

    // Find shop
    const shop = await prisma.shop.findUnique({
      where: { shopDomain },
    });

    if (!shop) {
      return json({ bundles: [], error: "Shop not found" }, { headers });
    }

    // Find bundles that contain this product
    const bundles = await prisma.bundle.findMany({
      where: {
        shopId: shop.id,
        status: "active",
        products: {
          some: {
            productId: {
              contains: productId.replace("gid://shopify/Product/", ""),
            },
          },
        },
      },
      include: {
        products: true,
      },
    });

    // Format bundles for the widget
    const formattedBundles = bundles.map((bundle) => ({
      id: bundle.id,
      title: bundle.title,
      description: bundle.description,
      discountType: bundle.discountType,
      discountValue: bundle.discountValue,
      discountCode: bundle.discountCode,
      products: bundle.products.map((p) => ({
        id: p.productId,
        title: p.title,
        price: p.price,
        imageUrl: p.imageUrl,
      })),
    }));

    return json({ bundles: formattedBundles }, { headers });
  } catch (error) {
    console.error("API bundles error:", error);
    return json({ bundles: [], error: "Internal server error" }, { headers, status: 500 });
  }
};

// Handle OPTIONS for CORS preflight
export const action = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }
  return json({ error: "Method not allowed" }, { status: 405 });
};
