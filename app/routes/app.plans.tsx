import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import { useState, useEffect } from "react";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Badge,
  Divider,
  InlineGrid,
  Banner,
  Box,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Check if billing is in test mode (default to test mode if not set)
const isTestMode = process.env.BILLING_MODE !== "live";

// Revenue-based pricing plans
const PLANS = [
  {
    id: "FREE",
    name: "Free",
    price: 0,
    interval: "month",
    revenueLimit: "Up to $500 revenue/month",
    features: [
      "Up to 3 bundles",
      "Basic widget",
      "Email support",
    ],
    popular: false,
  },
  {
    id: "GROWTH",
    name: "Growth",
    price: 19,
    interval: "month",
    revenueLimit: "Up to $1,000 revenue/month",
    trialDays: 7,
    features: [
      "Unlimited bundles",
      "AI bundle suggestions",
      "Priority support",
      "Custom widget styling",
    ],
    popular: true,
  },
  {
    id: "SCALE",
    name: "Scale",
    price: 49,
    interval: "month",
    revenueLimit: "Up to $5,000 revenue/month",
    trialDays: 7,
    features: [
      "Everything in Growth",
      "Advanced reporting",
      "A/B testing",
      "Dedicated support",
      "API access",
    ],
    popular: false,
  },
  {
    id: "PRO",
    name: "Pro",
    price: 99,
    interval: "month",
    revenueLimit: "Unlimited revenue",
    trialDays: 7,
    features: [
      "Everything in Scale",
      "White-label option",
      "Custom integrations",
      "Account manager",
      "SLA guarantee",
    ],
    popular: false,
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  
  let currentPlan = "FREE";
  let monthlyRevenue = 0;
  
  // Always check Shopify for active subscriptions (source of truth)
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
    }
  } catch (e) {
    console.error("Failed to check subscriptions:", e);
  }
  
  // Get shop for revenue calculation
  try {
    const shop = await prisma.shop.findUnique({
      where: { shopDomain: session.shop },
    });
    
    if (shop?.id) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const revenueData = await prisma.analytics.aggregate({
        where: {
          shopId: shop.id,
          eventType: "purchase",
          createdAt: { gte: thirtyDaysAgo },
        },
        _sum: { revenue: true },
      });
      monthlyRevenue = revenueData._sum.revenue || 0;
    }
  } catch (e) {
    console.error("Failed to load revenue data:", e);
  }
  
  return json({ 
    shopDomain: session.shop,
    currentPlan,
    monthlyRevenue,
    isTestMode,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const planId = formData.get("planId") as string;
  
  const plan = PLANS.find(p => p.id === planId);
  
  if (!plan) {
    return json({ error: "Invalid plan", planId });
  }
  
  // For free plan or downgrades, just return success
  if (plan.price === 0) {
    return json({ success: true, message: "You are on the Free plan", planId });
  }
  
  // For paid plans, create Shopify subscription
  try {
    // Get the app handle from environment or use default
    const appHandle = process.env.SHOPIFY_APP_HANDLE || "alintro-bundles";
    
    // Return URL - go to app root after billing
    const returnUrl = `https://${session.shop}/admin/apps/${appHandle}`;
    
    console.log("Creating subscription with return URL:", returnUrl);
    
    const response = await admin.graphql(`
      mutation AppSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $trialDays: Int, $test: Boolean) {
        appSubscriptionCreate(
          name: $name
          returnUrl: $returnUrl
          trialDays: $trialDays
          lineItems: $lineItems
          test: $test
        ) {
          appSubscription {
            id
          }
          confirmationUrl
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: {
        name: `Alintro ${plan.name} Plan`,
        returnUrl: returnUrl,
        trialDays: plan.trialDays || 0,
        test: isTestMode,
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: {
                  amount: plan.price,
                  currencyCode: "USD",
                },
                interval: "EVERY_30_DAYS",
              },
            },
          },
        ],
      },
    });
    
    const result = await response.json();
    
    if (result.data?.appSubscriptionCreate?.confirmationUrl) {
      // Return confirmation URL - client will handle redirect
      return json({ 
        confirmationUrl: result.data.appSubscriptionCreate.confirmationUrl,
        planId 
      });
    }
    
    if (result.data?.appSubscriptionCreate?.userErrors?.length > 0) {
      const errorMsg = result.data.appSubscriptionCreate.userErrors
        .map((e: any) => e.message)
        .join(", ");
      return json({ error: errorMsg, planId });
    }
    
    return json({ error: "Failed to create subscription. Please try again.", planId });
  } catch (error: any) {
    console.error("Subscription error:", error);
    return json({ error: error.message || "Failed to process subscription", planId });
  }
};

export default function Plans() {
  const { currentPlan, monthlyRevenue, isTestMode } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  
  // Track which plan is being submitted
  const [submittingPlan, setSubmittingPlan] = useState<string | null>(null);
  const isSubmitting = navigation.state === "submitting";
  
  // Handle redirect to billing page
  useEffect(() => {
    if (actionData?.confirmationUrl) {
      // Open billing page in new tab
      window.open(actionData.confirmationUrl, '_blank');
    }
  }, [actionData?.confirmationUrl]);
  
  // Get current plan limit
  const getCurrentPlanLimit = () => {
    switch (currentPlan) {
      case "FREE": return 500;
      case "GROWTH": return 1000;
      case "SCALE": return 5000;
      case "PRO": return Infinity;
      default: return 500;
    }
  };
  
  const planLimit = getCurrentPlanLimit();
  const usagePercent = planLimit === Infinity ? 0 : Math.min((monthlyRevenue / planLimit) * 100, 100);
  
  // Recommend plan based on revenue
  const getRecommendedPlan = () => {
    if (monthlyRevenue <= 500) return "FREE";
    if (monthlyRevenue <= 1000) return "GROWTH";
    if (monthlyRevenue <= 5000) return "SCALE";
    return "PRO";
  };
  
  const recommendedPlan = getRecommendedPlan();
  
  const handleSelectPlan = (planId: string) => {
    setSubmittingPlan(planId);
    const formData = new FormData();
    formData.append("planId", planId);
    submit(formData, { method: "post" });
  };

  return (
    <Page 
      title="Plans & Pricing"
      backAction={{ content: "Settings", url: "/app/settings" }}
    >
      <BlockStack gap="500">
        {actionData?.error && (
          <Banner tone="critical">
            <p>{actionData.error}</p>
          </Banner>
        )}
        
        {actionData?.success && (
          <Banner tone="success">
            <p>{actionData.message}</p>
          </Banner>
        )}
        
        {/* Confirmation URL banner - show link if redirect failed */}
        {actionData?.confirmationUrl && (
          <Banner tone="warning">
            <p>
              A new tab should have opened. If not, click here to complete your subscription: {" "}
              <a 
                href={actionData.confirmationUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ color: '#2C6ECB', textDecoration: 'underline' }}
              >
                Complete Subscription →
              </a>
            </p>
          </Banner>
        )}
        
        {/* Test mode indicator */}
        {isTestMode && (
          <Banner tone="info">
            <p>💡 Billing is in <strong>test mode</strong>. No real charges will be made.</p>
          </Banner>
        )}
        
        {/* Revenue Info */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">Your Usage This Month</Text>
                <Text as="p" variant="bodyMd">
                  <Text as="span" fontWeight="bold">${monthlyRevenue.toFixed(2)}</Text> revenue generated
                </Text>
              </BlockStack>
              {usagePercent >= 80 && currentPlan !== "PRO" && (
                <Badge tone="warning">Upgrade recommended</Badge>
              )}
            </InlineStack>
            {recommendedPlan !== currentPlan && (
              <Text as="p" variant="bodySm" tone="subdued">
                Based on your revenue, we recommend the {PLANS.find(p => p.id === recommendedPlan)?.name} plan.
              </Text>
            )}
          </BlockStack>
        </Card>
        
        {/* Plans Grid */}
        <InlineGrid columns={{ xs: 1, sm: 2, lg: 4 }} gap="400">
          {PLANS.map((plan) => {
            const isCurrent = currentPlan === plan.id;
            const isRecommended = recommendedPlan === plan.id && !isCurrent;
            const isThisPlanSubmitting = isSubmitting && submittingPlan === plan.id;
            
            return (
              <Card key={plan.id}>
                <BlockStack gap="400">
                  {/* Plan Header */}
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h3" variant="headingMd">{plan.name}</Text>
                    <InlineStack gap="100">
                      {plan.popular && <Badge tone="success">Popular</Badge>}
                      {isCurrent && <Badge tone="info">Current</Badge>}
                      {isRecommended && <Badge tone="attention">Recommended</Badge>}
                    </InlineStack>
                  </InlineStack>
                  
                  {/* Price */}
                  <BlockStack gap="100">
                    <InlineStack gap="100" blockAlign="baseline">
                      <Text as="span" variant="headingXl">${plan.price}</Text>
                      <Text as="span" tone="subdued">/{plan.interval}</Text>
                    </InlineStack>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {plan.revenueLimit}
                    </Text>
                    {plan.trialDays && (
                      <Box paddingBlockStart="100">
                        <Badge tone="success">{plan.trialDays}-day free trial</Badge>
                      </Box>
                    )}
                  </BlockStack>
                  
                  <Divider />
                  
                  {/* Features */}
                  <BlockStack gap="200">
                    {plan.features.map((feature, index) => (
                      <InlineStack key={index} gap="200" blockAlign="center">
                        <Text as="span" tone="success">✓</Text>
                        <Text as="span" variant="bodySm">{feature}</Text>
                      </InlineStack>
                    ))}
                  </BlockStack>
                  
                  {/* Action Button */}
                  <Box paddingBlockStart="200">
                    <Button
                      fullWidth
                      variant={isCurrent ? "secondary" : (isRecommended || plan.popular) ? "primary" : "secondary"}
                      disabled={isCurrent || isSubmitting}
                      loading={isThisPlanSubmitting}
                      onClick={() => handleSelectPlan(plan.id)}
                    >
                      {isCurrent 
                        ? "Current Plan" 
                        : plan.price === 0 
                          ? "Downgrade" 
                          : plan.trialDays 
                            ? `Start ${plan.trialDays}-Day Trial`
                            : "Upgrade"
                      }
                    </Button>
                  </Box>
                </BlockStack>
              </Card>
            );
          })}
        </InlineGrid>
        
        {/* Enterprise */}
        <Card>
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="100">
              <Text as="h3" variant="headingMd">Need a custom plan?</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Contact us for enterprise pricing, custom features, and dedicated support.
              </Text>
            </BlockStack>
            <Button url="/app/support">Contact Sales</Button>
          </InlineStack>
        </Card>
      </BlockStack>
    </Page>
  );
}