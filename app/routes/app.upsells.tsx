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
  EmptyState,
  Banner,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return json({ shop: session.shop });
};

export default function Upsells() {
  const { shop } = useLoaderData<typeof loader>();

  return (
    <Page title="Upsells">
      <Layout>
        <Layout.Section>
          <Banner tone="info">
            <p>
              Upsells feature is coming soon! This will allow you to show 
              targeted product recommendations on product pages, cart, and checkout.
            </p>
          </Banner>
        </Layout.Section>
        
        <Layout.Section>
          <Card>
            <EmptyState
              heading="Smart Upsells Coming Soon"
              action={{ content: "Create Bundle Instead", url: "/app/bundles/new" }}
              secondaryAction={{ content: "View AI Suggestions", url: "/app/bundles/ai-suggest" }}
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <BlockStack gap="400">
                <Text as="p">
                  The upsells feature will include:
                </Text>
                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="200">
                    <InlineStack gap="200" blockAlign="center">
                      <Badge tone="success">✓</Badge>
                      <Text as="span">Product page recommendations</Text>
                    </InlineStack>
                    <InlineStack gap="200" blockAlign="center">
                      <Badge tone="success">✓</Badge>
                      <Text as="span">Cart drawer upsells</Text>
                    </InlineStack>
                    <InlineStack gap="200" blockAlign="center">
                      <Badge tone="success">✓</Badge>
                      <Text as="span">Checkout upsells</Text>
                    </InlineStack>
                    <InlineStack gap="200" blockAlign="center">
                      <Badge tone="success">✓</Badge>
                      <Text as="span">Post-purchase offers</Text>
                    </InlineStack>
                    <InlineStack gap="200" blockAlign="center">
                      <Badge tone="success">✓</Badge>
                      <Text as="span">AI-powered targeting</Text>
                    </InlineStack>
                  </BlockStack>
                </Box>
                <Text as="p" tone="subdued">
                  In the meantime, you can use bundles to offer product combinations 
                  at discounted prices.
                </Text>
              </BlockStack>
            </EmptyState>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
