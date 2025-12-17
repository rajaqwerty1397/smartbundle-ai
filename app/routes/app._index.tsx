import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Box,
  InlineStack,
  Badge,
  Button,
  InlineGrid,
  Divider,
  ProgressBar,
  Banner,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  
  // Check URL params for billing callback
  const url = new URL(request.url);
  const chargeId = url.searchParams.get("charge_id");
  
  let currentPlan = "FREE";
  let billingConfirmed = false;
  
  let shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
  });
  
  if (!shop) {
    shop = await prisma.shop.create({
      data: {
        shopDomain: session.shop,
        name: session.shop.replace('.myshopify.com', ''),
      },
    });
  }
  
  // Always check for active subscriptions from Shopify (source of truth)
  try {
    const subscriptionResponse = await admin.graphql(`
      query {
        currentAppInstallation {
          activeSubscriptions {
            id
            name
            status
            lineItems {
              plan {
                pricingDetails {
                  ... on AppRecurringPricing {
                    price {
                      amount
                    }
                  }
                }
              }
            }
          }
        }
      }
    `);
    
    const subscriptionData = await subscriptionResponse.json();
    const activeSubscriptions = subscriptionData.data?.currentAppInstallation?.activeSubscriptions || [];
    
    if (activeSubscriptions.length > 0) {
      const activeSub = activeSubscriptions[0];
      const price = parseFloat(activeSub.lineItems?.[0]?.plan?.pricingDetails?.price?.amount || "0");
      
      // Determine plan from price
      if (price >= 99) currentPlan = "PRO";
      else if (price >= 49) currentPlan = "SCALE";
      else if (price >= 19) currentPlan = "GROWTH";
      
      // If we have a charge_id, this is a billing callback - show confirmation
      if (chargeId) {
        billingConfirmed = true;
      }
    }
  } catch (e) {
    console.error("Failed to check subscriptions:", e);
  }
  
  const bundleCount = await prisma.bundle.count({
    where: { shopId: shop.id },
  });
  
  const activeBundles = await prisma.bundle.count({
    where: { shopId: shop.id, status: "active" },
  });
  
  // Get analytics counts
  const bundleViews = await prisma.analytics.count({
    where: { shopId: shop.id, eventType: "view" },
  });
  
  const addToCarts = await prisma.analytics.count({
    where: { shopId: shop.id, eventType: "add_to_cart" },
  });
  
  return json({
    shop: session.shop,
    shopSettings: shop,
    currentPlan,
    billingConfirmed,
    stats: {
      totalBundles: bundleCount,
      activeBundles,
      bundleViews,
      addToCarts,
    },
  });
};

export default function Dashboard() {
  const { shop, shopSettings, currentPlan, billingConfirmed, stats } = useLoaderData<typeof loader>();
  
  const setupComplete = stats.totalBundles > 0;
  const conversionRate = stats.bundleViews > 0 
    ? ((stats.addToCarts / stats.bundleViews) * 100).toFixed(0)
    : "0";
  
  // Format plan name for display
  const planDisplayName = currentPlan === "FREE" ? "Free Plan" : 
    currentPlan === "GROWTH" ? "Growth Plan" :
    currentPlan === "SCALE" ? "Scale Plan" :
    currentPlan === "PRO" ? "Pro Plan" : "Free Plan";
  
  // Get badge tone based on plan
  const planBadgeTone = currentPlan === "FREE" ? "attention" : "success";
  
  // Theme editor URL - opens in new window
  const themeEditorUrl = `https://${shop}/admin/themes/current/editor?context=apps`;
  
  // Handle opening theme editor in new window
  const handleOpenThemeEditor = () => {
    window.open(themeEditorUrl, '_blank');
  };

  return (
    <Page title="Alintro AI Upsell and Bundles">
      <BlockStack gap="500">
        {/* Billing confirmation banner - shows when returning from billing approval */}
        {billingConfirmed && (
          <Banner tone="success">
            <p>🎉 Your subscription has been activated! You are now on the <strong>{planDisplayName}</strong>.</p>
          </Banner>
        )}
        
        {/* Welcome Banner */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text as="h2" variant="headingLg">Welcome to Alintro!</Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Create bundle deals to increase your average order value.
                </Text>
              </BlockStack>
              <Badge tone={planBadgeTone}>{planDisplayName}</Badge>
            </InlineStack>
            <ProgressBar progress={setupComplete ? 100 : 50} tone="primary" size="small" />
            <Text as="p" variant="bodySm" tone="success">
              {setupComplete ? "Setup Complete" : "Complete setup to start selling bundles"}
            </Text>
          </BlockStack>
        </Card>

        {/* Stats Grid */}
        <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
          <Card>
            <BlockStack gap="200">
              <Text as="p" variant="bodyMd" tone="subdued">Bundle Views</Text>
              <Text as="p" variant="headingXl">{stats.bundleViews}</Text>
            </BlockStack>
          </Card>
          
          <Card>
            <BlockStack gap="200">
              <Text as="p" variant="bodyMd" tone="subdued">Add to Carts</Text>
              <Text as="p" variant="headingXl">{stats.addToCarts}</Text>
            </BlockStack>
          </Card>
          
          <Card>
            <BlockStack gap="200">
              <Text as="p" variant="bodyMd" tone="subdued">Conversion</Text>
              <Text as="p" variant="headingXl">{conversionRate}%</Text>
            </BlockStack>
          </Card>
        </InlineGrid>

        {/* Main Content */}
        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              {/* Getting Started */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Getting Started</Text>
                  <Divider />
                  
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <InlineStack gap="200" blockAlign="center">
                        <Box
                          background="bg-fill-info"
                          padding="100"
                          borderRadius="full"
                          minWidth="24px"
                        >
                          <Text as="span" variant="bodySm" fontWeight="bold" alignment="center">1</Text>
                        </Box>
                        <Text as="p" variant="bodyMd">Activate app embed in theme</Text>
                      </InlineStack>
                    </BlockStack>
                    <Button onClick={handleOpenThemeEditor}>
                      Open
                    </Button>
                  </InlineStack>
                  
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <InlineStack gap="200" blockAlign="center">
                        <Box
                          background="bg-fill-info"
                          padding="100"
                          borderRadius="full"
                          minWidth="24px"
                        >
                          <Text as="span" variant="bodySm" fontWeight="bold" alignment="center">2</Text>
                        </Box>
                        <Text as="p" variant="bodyMd">Create your first bundle</Text>
                      </InlineStack>
                    </BlockStack>
                    <Button url="/app/bundles/new">Create</Button>
                  </InlineStack>
                </BlockStack>
              </Card>
              
              {/* Active Bundles */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Active Bundles</Text>
                  <Divider />
                  <Text as="p" variant="bodyMd" tone="subdued">
                    View and manage your bundles from the Bundles page.
                  </Text>
                  <Button url="/app/bundles" variant="plain">View all bundles</Button>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              {/* Quick Actions */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Quick Actions</Text>
                  <BlockStack gap="200">
                    <Button url="/app/bundles/new" fullWidth>
                      Create New Bundle
                    </Button>
                    <Button url="/app/bundles" fullWidth variant="secondary">
                      View All Bundles
                    </Button>
                    <Button url="/app/plans" fullWidth variant="secondary">
                      {currentPlan === "FREE" ? "Upgrade Plan" : "Manage Plan"}
                    </Button>
                  </BlockStack>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}