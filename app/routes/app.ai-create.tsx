import { useState, useCallback } from "react";
import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useActionData, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  Banner,
  Text,
  BlockStack,
  InlineStack,
  Thumbnail,
  Badge,
  ProgressBar,
  Spinner,
  Box,
  Checkbox,
  Divider,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Internal Groq API key (hidden from users)
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  // Fetch products from Shopify
  const response = await admin.graphql(`
    query {
      products(first: 50) {
        nodes {
          id
          title
          productType
          tags
          featuredImage {
            url
          }
          variants(first: 1) {
            nodes {
              id
              price
            }
          }
        }
      }
    }
  `);

  const data = await response.json();
  const products = data.data?.products?.nodes || [];

  return json({ products, shopDomain: session.shop });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("_action");

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
  });

  if (!shop) {
    return json({ error: "Shop not found" }, { status: 404 });
  }

  if (actionType === "generate") {
    // Generate AI bundle suggestions
    const productsJson = formData.get("products") as string;
    const products = JSON.parse(productsJson);

    try {
      // Call Groq API for suggestions
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.1-70b-versatile",
          messages: [
            {
              role: "system",
              content: `You are a retail merchandising expert. Analyze the product catalog and suggest 3 product bundles that would sell well together. Consider:
- Complementary products
- Similar categories
- Price points
- Common shopping patterns

Return ONLY a JSON array with this structure:
[
  {
    "title": "Bundle Name",
    "description": "Why these products work together",
    "productIds": ["id1", "id2"],
    "discountPercent": 10
  }
]`
            },
            {
              role: "user",
              content: `Here are the products:\n${JSON.stringify(products.map((p: any) => ({
                id: p.id,
                title: p.title,
                type: p.productType,
                tags: p.tags,
                price: p.variants?.nodes?.[0]?.price
              })))}`
            }
          ],
          temperature: 0.7,
          max_tokens: 1000,
        }),
      });

      const aiData = await response.json();
      const content = aiData.choices?.[0]?.message?.content || "[]";
      
      // Parse AI response
      let suggestions = [];
      try {
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          suggestions = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        console.error("Failed to parse AI response:", e);
      }

      return json({ suggestions, products });
    } catch (error) {
      console.error("AI generation error:", error);
      return json({ error: "Failed to generate suggestions. Please try again." });
    }
  }

  if (actionType === "create") {
    // Create the selected bundles
    const bundlesJson = formData.get("bundles") as string;
    const bundles = JSON.parse(bundlesJson);
    const productsJson = formData.get("products") as string;
    const products = JSON.parse(productsJson);

    let created = 0;

    for (const bundle of bundles) {
      // Generate discount code
      const codeBase = bundle.title.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10);
      const discountCode = `${codeBase}-${Date.now().toString(36).toUpperCase()}`;

      try {
        // Create discount in Shopify
        await admin.graphql(`
          mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
            discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
              codeDiscountNode { id }
              userErrors { field message }
            }
          }
        `, {
          variables: {
            basicCodeDiscount: {
              title: `Alintro: ${bundle.title}`,
              code: discountCode,
              startsAt: new Date().toISOString(),
              customerSelection: { all: true },
              customerGets: {
                value: { percentage: bundle.discountPercent / 100 },
                items: { all: true }
              },
              usageLimit: 10000,
              appliesOncePerCustomer: false
            }
          }
        });

        // Create bundle in database
        const newBundle = await prisma.bundle.create({
          data: {
            title: bundle.title,
            description: bundle.description,
            discountType: "percentage",
            discountValue: bundle.discountPercent,
            discountCode,
            status: "active",
            priority: 0,
            shop: { connect: { id: shop.id } }
          },
        });

        // Add products to bundle
        const bundleProducts = bundle.productIds.map((pid: string) => 
          products.find((p: any) => p.id === pid)
        ).filter(Boolean);

        for (let i = 0; i < bundleProducts.length; i++) {
          const product = bundleProducts[i];
          await prisma.bundleProduct.create({
            data: {
              bundleId: newBundle.id,
              productId: product.id,
              variantId: product.variants?.nodes?.[0]?.id || null,
              title: product.title,
              imageUrl: product.featuredImage?.url || null,
              price: parseFloat(product.variants?.nodes?.[0]?.price || "0"),
              position: i,
            },
          });
        }

        created++;
      } catch (e) {
        console.error("Failed to create bundle:", e);
      }
    }

    return json({ created, total: bundles.length });
  }

  return json({ error: "Invalid action" });
};

export default function AICreate() {
  const { products, shopDomain } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigate = useNavigate();

  const [generating, setGenerating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>(actionData?.suggestions || []);
  const [selectedBundles, setSelectedBundles] = useState<Set<number>>(new Set());

  const handleGenerate = useCallback(() => {
    setGenerating(true);
    const formData = new FormData();
    formData.append("_action", "generate");
    formData.append("products", JSON.stringify(products));
    submit(formData, { method: "post" });
  }, [products, submit]);

  const handleCreateBundles = useCallback(() => {
    if (selectedBundles.size === 0) return;
    
    setCreating(true);
    const bundlesToCreate = Array.from(selectedBundles).map(i => suggestions[i]);
    
    const formData = new FormData();
    formData.append("_action", "create");
    formData.append("bundles", JSON.stringify(bundlesToCreate));
    formData.append("products", JSON.stringify(products));
    submit(formData, { method: "post" });
  }, [selectedBundles, suggestions, products, submit]);

  const toggleBundle = useCallback((index: number) => {
    setSelectedBundles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  }, []);

  // Update suggestions when actionData changes
  if (actionData?.suggestions && actionData.suggestions !== suggestions) {
    setSuggestions(actionData.suggestions);
    setGenerating(false);
    // Select all by default
    setSelectedBundles(new Set(actionData.suggestions.map((_: any, i: number) => i)));
  }

  // Handle creation success
  if (actionData?.created !== undefined) {
    return (
      <Page title="AI Bundle Generator" backAction={{ content: "Dashboard", url: "/app" }}>
        <Card>
          <BlockStack gap="400" inlineAlign="center">
            <Text variant="headingLg" as="h2">
              🎉 Bundles Created!
            </Text>
            <Text as="p" tone="subdued">
              Successfully created {actionData.created} of {actionData.total} bundles.
            </Text>
            <InlineStack gap="300">
              <Button variant="primary" onClick={() => navigate("/app/bundles")}>
                View Bundles
              </Button>
              <Button onClick={() => {
                setSuggestions([]);
                setSelectedBundles(new Set());
              }}>
                Generate More
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>
      </Page>
    );
  }

  return (
    <Page
      title="AI Bundle Generator"
      backAction={{ content: "Dashboard", url: "/app" }}
      primaryAction={
        suggestions.length > 0
          ? {
              content: creating ? "Creating..." : `Create ${selectedBundles.size} Bundle${selectedBundles.size !== 1 ? 's' : ''}`,
              onAction: handleCreateBundles,
              disabled: creating || selectedBundles.size === 0,
            }
          : undefined
      }
    >
      <BlockStack gap="500">
        {actionData?.error && (
          <Banner tone="critical">{actionData.error}</Banner>
        )}

        {suggestions.length === 0 ? (
          <Card>
            <BlockStack gap="400" inlineAlign="center">
              <Text variant="headingLg" as="h2">
                🤖 AI-Powered Bundle Suggestions
              </Text>
              <Text as="p" tone="subdued" alignment="center">
                Our AI will analyze your {products.length} products and suggest optimal bundles 
                based on product types, pricing, and common shopping patterns.
              </Text>
              
              {generating ? (
                <BlockStack gap="300" inlineAlign="center">
                  <Spinner size="large" />
                  <Text as="p">Analyzing your products...</Text>
                  <Box paddingBlockStart="200" width="200px">
                    <ProgressBar progress={75} size="small" />
                  </Box>
                </BlockStack>
              ) : (
                <Button variant="primary" size="large" onClick={handleGenerate}>
                  Generate Bundle Suggestions
                </Button>
              )}
            </BlockStack>
          </Card>
        ) : (
          <BlockStack gap="400">
            <Banner tone="info">
              Select the bundles you want to create. Each bundle will automatically get a discount code.
            </Banner>

            {suggestions.map((suggestion, index) => {
              const bundleProducts = suggestion.productIds.map((pid: string) =>
                products.find((p: any) => p.id === pid)
              ).filter(Boolean);

              return (
                <Card key={index}>
                  <BlockStack gap="400">
                    <InlineStack align="space-between">
                      <InlineStack gap="300">
                        <Checkbox
                          label=""
                          labelHidden
                          checked={selectedBundles.has(index)}
                          onChange={() => toggleBundle(index)}
                        />
                        <BlockStack gap="100">
                          <Text variant="headingMd" as="h3">
                            {suggestion.title}
                          </Text>
                          <Text as="p" tone="subdued" variant="bodySm">
                            {suggestion.description}
                          </Text>
                        </BlockStack>
                      </InlineStack>
                      <Badge tone="success">{suggestion.discountPercent}% off</Badge>
                    </InlineStack>

                    <Divider />

                    <InlineStack gap="400" wrap>
                      {bundleProducts.map((product: any) => (
                        <InlineStack key={product.id} gap="200" align="start">
                          <Thumbnail
                            source={product.featuredImage?.url || ""}
                            alt={product.title}
                            size="small"
                          />
                          <BlockStack gap="050">
                            <Text as="p" variant="bodySm" fontWeight="medium">
                              {product.title.slice(0, 30)}{product.title.length > 30 ? '...' : ''}
                            </Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              ${product.variants?.nodes?.[0]?.price || "0.00"}
                            </Text>
                          </BlockStack>
                        </InlineStack>
                      ))}
                    </InlineStack>
                  </BlockStack>
                </Card>
              );
            })}

            <InlineStack align="end" gap="300">
              <Button onClick={() => {
                setSuggestions([]);
                setSelectedBundles(new Set());
              }}>
                Regenerate
              </Button>
            </InlineStack>
          </BlockStack>
        )}
      </BlockStack>
    </Page>
  );
}
