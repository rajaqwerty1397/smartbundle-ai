import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, session, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  switch (topic) {
    case "APP_UNINSTALLED":
      if (session) {
        console.log(`App uninstalled from ${shop}`);
        // Clean up shop data
        try {
          const shopRecord = await prisma.shop.findUnique({
            where: { shopDomain: shop },
          });
          
          if (shopRecord) {
            // Delete all related data
            await prisma.analytics.deleteMany({
              where: { shopId: shopRecord.id },
            });
            await prisma.bundleProduct.deleteMany({
              where: { bundle: { shopId: shopRecord.id } },
            });
            await prisma.bundle.deleteMany({
              where: { shopId: shopRecord.id },
            });
            await prisma.shop.delete({
              where: { id: shopRecord.id },
            });
            console.log(`Cleaned up data for ${shop}`);
          }
        } catch (error) {
          console.error(`Error cleaning up shop data for ${shop}:`, error);
        }
      }
      break;
      
    // GDPR Webhooks - Required for Built for Shopify badge
    case "CUSTOMERS_DATA_REQUEST":
      // Customer requested their data - respond with what data we store
      console.log(`Customer data request for ${shop}`);
      // SmartBundle AI stores minimal customer data (only analytics with customerId)
      // In production, you would compile and send the customer's data
      break;
      
    case "CUSTOMERS_REDACT":
      // Customer requested deletion of their data
      console.log(`Customer redact request for ${shop}`);
      try {
        const customerId = (payload as any)?.customer?.id;
        if (customerId) {
          // Delete analytics data for this customer
          await prisma.analytics.deleteMany({
            where: { customerId: customerId.toString() },
          });
          console.log(`Deleted analytics for customer ${customerId}`);
        }
      } catch (error) {
        console.error(`Error handling customer redact for ${shop}:`, error);
      }
      break;
      
    case "SHOP_REDACT":
      // Shop data should be deleted (48 hours after uninstall)
      console.log(`Shop redact request for ${shop}`);
      try {
        const shopRecord = await prisma.shop.findUnique({
          where: { shopDomain: shop },
        });
        
        if (shopRecord) {
          // Delete all shop data
          await prisma.recommendation.deleteMany({
            where: { shopDomain: shop },
          });
          await prisma.analytics.deleteMany({
            where: { shopId: shopRecord.id },
          });
          await prisma.bundleProduct.deleteMany({
            where: { bundle: { shopId: shopRecord.id } },
          });
          await prisma.bundle.deleteMany({
            where: { shopId: shopRecord.id },
          });
          await prisma.shop.delete({
            where: { id: shopRecord.id },
          });
          console.log(`Completed shop redact for ${shop}`);
        }
      } catch (error) {
        console.error(`Error handling shop redact for ${shop}:`, error);
      }
      break;
      
    default:
      console.log(`Unhandled webhook topic: ${topic}`);
  }

  return new Response();
};
