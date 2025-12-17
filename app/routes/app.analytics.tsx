import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Select,
  DataTable,
} from "@shopify/polaris";
import { useState } from "react";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  
  return json({ 
    totals: { views: 0, clicks: 0, addToCarts: 0, purchases: 0 }, 
    bundleStats: [], 
    recentActivity: [] 
  });
};

export default function Analytics() {
  const { totals, bundleStats, recentActivity } = useLoaderData<typeof loader>();
  const [timeRange, setTimeRange] = useState("7d");

  const conversionRate = totals.views > 0 ? ((totals.addToCarts / totals.views) * 100).toFixed(1) : "0.0";

  return (
    <Page title="Analytics" backAction={{ content: "Dashboard", url: "/app" }}>
      <BlockStack gap="500">
        <InlineStack align="end">
          <Select
            label=""
            labelHidden
            options={[
              { label: "Last 7 days", value: "7d" },
              { label: "Last 30 days", value: "30d" },
              { label: "All time", value: "all" },
            ]}
            value={timeRange}
            onChange={setTimeRange}
          />
        </InlineStack>

        <Card>
          <BlockStack gap="400">
            <Text variant="headingMd" as="h2">Performance Overview</Text>
            <InlineStack gap="800" align="start" wrap={false}>
              <BlockStack gap="100">
                <Text as="p" tone="subdued" variant="bodySm">Views</Text>
                <Text variant="headingXl" as="p">{totals.views}</Text>
              </BlockStack>
              <BlockStack gap="100">
                <Text as="p" tone="subdued" variant="bodySm">Clicks</Text>
                <Text variant="headingXl" as="p">{totals.clicks}</Text>
              </BlockStack>
              <BlockStack gap="100">
                <Text as="p" tone="subdued" variant="bodySm">Add to Carts</Text>
                <Text variant="headingXl" as="p">{totals.addToCarts}</Text>
              </BlockStack>
              <BlockStack gap="100">
                <Text as="p" tone="subdued" variant="bodySm">Conversion</Text>
                <Text variant="headingXl" as="p">{conversionRate}%</Text>
              </BlockStack>
              <BlockStack gap="100">
                <Text as="p" tone="subdued" variant="bodySm">Revenue</Text>
                <Text variant="headingXl" as="p">$0.00</Text>
              </BlockStack>
            </InlineStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text variant="headingMd" as="h2">Top Performing Bundles</Text>
            <Text as="p" tone="subdued">Bundle performance data will appear here once customers start interacting with your bundles.</Text>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text variant="headingMd" as="h2">Recent Activity</Text>
            <Text as="p" tone="subdued">Activity will appear here when customers view and purchase bundles.</Text>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
