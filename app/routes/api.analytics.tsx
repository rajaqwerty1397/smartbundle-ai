import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, ngrok-skip-browser-warning",
  "Access-Control-Max-Age": "86400",
};

// Handle OPTIONS preflight
export const loader = async ({ request }: LoaderFunctionArgs) => {
  return new Response(null, { 
    status: 204,
    headers: corsHeaders 
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  // Handle OPTIONS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { 
      status: 204,
      headers: corsHeaders 
    });
  }

  try {
    const body = await request.json();
    const { eventType, bundleId, productId, shopDomain } = body;

    if (!shopDomain || !eventType) {
      return json({ error: "Missing required fields" }, { 
        status: 400, 
        headers: corsHeaders 
      });
    }

    const shop = await prisma.shop.findUnique({
      where: { shopDomain },
    });

    if (!shop || !shop.analyticsEnabled) {
      return json({ success: true }, { headers: corsHeaders });
    }

    await prisma.analytics.create({
      data: {
        shopId: shop.id,
        bundleId: bundleId || null,
        eventType,
        eventSource: "storefront",
        productId: productId || null,
      },
    });

    return json({ success: true }, { headers: corsHeaders });
    
  } catch (error) {
    console.error("Analytics error:", error);
    return json({ success: false }, { headers: corsHeaders });
  }
};