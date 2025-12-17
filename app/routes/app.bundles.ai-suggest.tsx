import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData, useFetcher } from "@remix-run/react";
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
  Banner,
  Divider,
  Thumbnail,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  
  const response = await admin.graphql(`
    query {
      products(first: 50) {
        edges {
          node {
            id
            title
            description
            productType
            tags
            featuredImage { url }
            variants(first: 1) {
              edges {
                node {
                  id
                  price
                  compareAtPrice
                }
              }
            }
          }
        }
      }
    }
  `);
  
  const data = await response.json();
  const products = data.data.products.edges.map((edge: any) => ({
    id: edge.node.id,
    title: edge.node.title,
    description: edge.node.description || "",
    productType: edge.node.productType || "",
    tags: edge.node.tags || [],
    imageUrl: edge.node.featuredImage?.url || null,
    price: parseFloat(edge.node.variants.edges[0]?.node.price || "0"),
    variantId: edge.node.variants.edges[0]?.node.id,
  }));
  
  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
  });
  
  return json({ 
    products, 
    shop: session.shop,
    aiModel: shop?.aiModel || "llama-3.1-8b-instant",
    aiEnabled: shop?.aiEnabled ?? true,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("_action");
  
  if (actionType === "generate") {
    const response = await admin.graphql(`
      query {
        products(first: 50) {
          edges {
            node {
              id
              title
              description
              productType
              tags
              variants(first: 1) {
                edges {
                  node { price }
                }
              }
            }
          }
        }
      }
    `);
    
    const data = await response.json();
    const products = data.data.products.edges.map((edge: any) => ({
      id: edge.node.id,
      title: edge.node.title,
      description: edge.node.description || "",
      type: edge.node.productType || "",
      tags: edge.node.tags || [],
      price: parseFloat(edge.node.variants.edges[0]?.node.price || "0"),
    }));
    
    const shop = await prisma.shop.findUnique({
      where: { shopDomain: session.shop },
    });
    
    const aiModel = shop?.aiModel || "llama-3.1-8b-instant";
    const groqApiKey = process.env.GROQ_API_KEY;
    
    if (!groqApiKey) {
      return json({ 
        error: "AI API key not configured. Please contact support.",
        suggestions: [] 
      });
    }
    
    const prompt = `You are an e-commerce bundle optimization AI. Analyze these products and suggest 3-5 product bundles that would work well together for customers.

Products:
${products.map((p: any) => `- ${p.title} ($${p.price}) [Type: ${p.type}] [Tags: ${p.tags.join(", ")}]`).join("\n")}

For each bundle suggestion, provide:
1. A catchy bundle name
2. Which products to include (use exact titles)
3. A short reason why they go well together
4. Suggested discount percentage (10-25%)

Return ONLY valid JSON array in this format:
[
  {
    "name": "Bundle Name",
    "products": ["Product Title 1", "Product Title 2"],
    "reason": "Why these products work together",
    "discount": 15
  }
]`;

    try {
      const groqResponse = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${groqApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: aiModel,
          messages: [
            {
              role: "system",
              content: "You are a helpful e-commerce assistant that suggests product bundles. Always respond with valid JSON only, no markdown or extra text."
            },
            { role: "user", content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 1500,
        }),
      });
      
      const groqData = await groqResponse.json();
      
      if (groqData.error) {
        return json({ 
          error: `AI error: ${groqData.error.message}`,
          suggestions: [] 
        });
      }
      
      const aiResponse = groqData.choices[0]?.message?.content || "[]";
      
      let suggestions = [];
      try {
        const cleanedResponse = aiResponse
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "")
          .trim();
        suggestions = JSON.parse(cleanedResponse);
      } catch (parseError) {
        return json({ 
          error: "Failed to parse AI suggestions. Please try again.",
          suggestions: [] 
        });
      }
      
      const enrichedSuggestions = suggestions.map((s: any) => ({
        ...s,
        products: s.products.map((title: string) => {
          const product = products.find((p: any) => 
            p.title.toLowerCase() === title.toLowerCase() ||
            p.title.toLowerCase().includes(title.toLowerCase()) ||
            title.toLowerCase().includes(p.title.toLowerCase())
          );
          return product || { title, price: 0, id: null };
        }).filter((p: any) => p.id),
      })).filter((s: any) => s.products.length >= 2);
      
      return json({ suggestions: enrichedSuggestions, error: null });
      
    } catch (error: any) {
      return json({ 
        error: `Failed to generate suggestions: ${error.message}`,
        suggestions: [] 
      });
    }
  }
  
  if (actionType === "create") {
    const bundleData = JSON.parse(formData.get("bundleData") as string);
    
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
    
    const bundle = await prisma.bundle.create({
      data: {
        shopId: shop.id,
        title: bundleData.name,
        description: bundleData.reason,
        type: "fixed",
        discountType: "percentage",
        discountValue: bundleData.discount,
        status: "active",
        isAiGenerated: true,
        minProducts: bundleData.products.length,
        products: {
          create: bundleData.products.map((product: any, index: number) => ({
            productId: product.id,
            variantId: product.variantId,
            title: product.title,
            imageUrl: product.imageUrl,
            price: product.price,
            position: index,
          })),
        },
      },
    });
    
    return redirect(`/app/bundles/${bundle.id}`);
  }
  
  return json({ error: "Unknown action" });
};

export default function AiSuggest() {
  const { products, aiEnabled } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const fetcher = useFetcher();
  const navigation = useNavigation();
  
  const isGenerating = fetcher.state === "submitting" && fetcher.formData?.get("_action") === "generate";
  const isCreating = navigation.state === "submitting";
  
  const suggestions = fetcher.data?.suggestions || actionData?.suggestions || [];
  const error = fetcher.data?.error || actionData?.error;
  
  const handleGenerate = useCallback(() => {
    fetcher.submit({ _action: "generate" }, { method: "post" });
  }, [fetcher]);
  
  const handleCreateBundle = useCallback((suggestion: any) => {
    const formData = new FormData();
    formData.append("_action", "create");
    formData.append("bundleData", JSON.stringify({
      ...suggestion,
      products: suggestion.products.map((p: any) => ({
        id: p.id,
        variantId: p.variantId,
        title: p.title,
        imageUrl: p.imageUrl,
        price: p.price,
      })),
    }));
    fetcher.submit(formData, { method: "post" });
  }, [fetcher]);

  return (
    <Page
      title="AI Bundle Suggestions"
      backAction={{ content: "Bundles", url: "/app/bundles" }}
    >
      <Layout>
        {error && (
          <Layout.Section>
            <Banner tone="critical">
              <p>{error}</p>
            </Banner>
          </Layout.Section>
        )}
        
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Generate Bundle Suggestions with AI
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Our AI will analyze your {products.length} products and suggest 
                  optimal bundle combinations.
                </Text>
              </BlockStack>
              
              <Divider />
              
              <Button
                variant="primary"
                onClick={handleGenerate}
                loading={isGenerating}
                disabled={!aiEnabled || products.length < 3}
              >
                {isGenerating ? "Analyzing Products..." : "Generate Suggestions"}
              </Button>
              
              {products.length < 3 && (
                <Banner tone="warning">
                  <p>
                    You need at least 3 products in your store to generate bundle suggestions.
                  </p>
                </Banner>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
        
        {/* Suggestions */}
        {suggestions.length > 0 && (
          <Layout.Section>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Suggested Bundles ({suggestions.length})
              </Text>
              
              {suggestions.map((suggestion: any, index: number) => (
                <Card key={index}>
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="start">
                      <BlockStack gap="200">
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="h3" variant="headingMd">
                            {suggestion.name}
                          </Text>
                          <Badge tone="success">{suggestion.discount}% off</Badge>
                          <Badge tone="info">AI Suggested</Badge>
                        </InlineStack>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {suggestion.reason}
                        </Text>
                      </BlockStack>
                      <Button
                        onClick={() => handleCreateBundle(suggestion)}
                        loading={isCreating}
                      >
                        Create Bundle
                      </Button>
                    </InlineStack>
                    
                    <Divider />
                    
                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        Products ({suggestion.products.length})
                      </Text>
                      <InlineStack gap="300" wrap>
                        {suggestion.products.map((product: any) => (
                          <Box
                            key={product.id}
                            padding="200"
                            background="bg-surface-secondary"
                            borderRadius="200"
                          >
                            <InlineStack gap="200" blockAlign="center">
                              {product.imageUrl && (
                                <Thumbnail
                                  source={product.imageUrl}
                                  alt={product.title}
                                  size="small"
                                />
                              )}
                              <BlockStack gap="050">
                                <Text as="span" variant="bodySm">
                                  {product.title}
                                </Text>
                                <Text as="span" variant="bodySm" tone="subdued">
                                  ${product.price?.toFixed(2)}
                                </Text>
                              </BlockStack>
                            </InlineStack>
                          </Box>
                        ))}
                      </InlineStack>
                    </BlockStack>
                    
                    {/* Price Preview */}
                    <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                      <InlineStack align="space-between">
                        <Text as="span" tone="subdued">Original Price:</Text>
                        <Text as="span">
                          ${suggestion.products.reduce((sum: number, p: any) => sum + (p.price || 0), 0).toFixed(2)}
                        </Text>
                      </InlineStack>
                      <InlineStack align="space-between">
                        <Text as="span" tone="subdued">Bundle Price:</Text>
                        <Text as="span" fontWeight="bold" tone="success">
                          ${(suggestion.products.reduce((sum: number, p: any) => sum + (p.price || 0), 0) * (1 - suggestion.discount / 100)).toFixed(2)}
                        </Text>
                      </InlineStack>
                    </Box>
                  </BlockStack>
                </Card>
              ))}
            </BlockStack>
          </Layout.Section>
        )}
        
        {/* How it works */}
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">How It Works</Text>
              <Divider />
              <BlockStack gap="300">
                <InlineStack gap="200" blockAlign="start">
                  <Badge tone="info">1</Badge>
                  <Text as="p" variant="bodySm">
                    AI analyzes your product catalog, including titles, descriptions, 
                    types, and tags.
                  </Text>
                </InlineStack>
                <InlineStack gap="200" blockAlign="start">
                  <Badge tone="info">2</Badge>
                  <Text as="p" variant="bodySm">
                    It identifies products that complement each other based on 
                    category, price range, and common purchasing patterns.
                  </Text>
                </InlineStack>
                <InlineStack gap="200" blockAlign="start">
                  <Badge tone="info">3</Badge>
                  <Text as="p" variant="bodySm">
                    Suggests optimal discount percentages to maximize conversions 
                    while maintaining healthy margins.
                  </Text>
                </InlineStack>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}