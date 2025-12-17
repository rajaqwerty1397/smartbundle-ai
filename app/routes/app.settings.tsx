import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  FormLayout,
  Checkbox,
  Banner,
  Divider,
  Link,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Support email
const SUPPORT_EMAIL = "support@alintro.com";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
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
  
  return json({ shop, shopDomain: session.shop });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  
  const bundlesEnabled = formData.get("bundlesEnabled") === "true";
  
  await prisma.shop.update({
    where: { shopDomain: session.shop },
    data: {
      bundlesEnabled,
    },
  });
  
  return json({ success: true, message: "Settings saved successfully" });
};

export default function Settings() {
  const { shop, shopDomain } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  
  const isSubmitting = navigation.state === "submitting";
  
  const [bundlesEnabled, setBundlesEnabled] = useState(shop.bundlesEnabled);
  
  const handleSubmit = useCallback(() => {
    const formData = new FormData();
    formData.append("bundlesEnabled", bundlesEnabled.toString());
    submit(formData, { method: "post" });
  }, [bundlesEnabled, submit]);

  return (
    <Page 
      title="Settings"
      backAction={{ content: "Dashboard", url: "/app" }}
      primaryAction={{
        content: isSubmitting ? "Saving..." : "Save Settings",
        onAction: handleSubmit,
        loading: isSubmitting,
      }}
    >
      <BlockStack gap="500">
        {actionData?.success && (
          <Banner tone="success" onDismiss={() => {}}>
            <p>{actionData.message}</p>
          </Banner>
        )}
        
        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              {/* General Settings */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">General Settings</Text>
                  <Divider />
                  <FormLayout>
                    <Checkbox
                      label="Enable Bundles"
                      helpText="Show bundle widgets on product pages"
                      checked={bundlesEnabled}
                      onChange={setBundlesEnabled}
                    />
                  </FormLayout>
                </BlockStack>
              </Card>
              
              {/* Account Info */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Account</Text>
                  <Divider />
                  <BlockStack gap="200">
                    <InlineStack align="space-between">
                      <Text as="span" tone="subdued">Store</Text>
                      <Text as="span">{shopDomain}</Text>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text as="span" tone="subdued">Plan</Text>
                      <Text as="span">Free</Text>
                    </InlineStack>
                  </BlockStack>
                  <Button url="/app/plans" fullWidth>
                    Upgrade Plan
                  </Button>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
          
          <Layout.Section variant="oneThird">
            {/* Support */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Need Help?</Text>
                <Divider />
                <Text as="p" variant="bodySm" tone="subdued">
                  Contact our support team for any questions or issues.
                </Text>
                <Button 
                  url={`mailto:${SUPPORT_EMAIL}`} 
                  external 
                  fullWidth
                >
                  Contact Support
                </Button>
                <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                  {SUPPORT_EMAIL}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}