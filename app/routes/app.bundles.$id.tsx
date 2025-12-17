import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
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
  TextField,
  Select,
  FormLayout,
  Thumbnail,
  ResourceList,
  ResourceItem,
  Banner,
  Divider,
  InlineGrid,
  Modal,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const bundleId = params.id;
  
  // Get the bundle
  const bundle = await prisma.bundle.findFirst({
    where: { 
      id: bundleId,
      shop: { shopDomain: session.shop },
    },
    include: {
      products: {
        orderBy: { position: "asc" },
      },
    },
  });
  
  if (!bundle) {
    throw new Response("Bundle not found", { status: 404 });
  }
  
  // Fetch products from Shopify
  const response = await admin.graphql(`
    query {
      products(first: 50) {
        edges {
          node {
            id
            title
            handle
            status
            featuredImage {
              url
              altText
            }
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
    handle: edge.node.handle,
    status: edge.node.status,
    imageUrl: edge.node.featuredImage?.url || null,
    price: parseFloat(edge.node.variants.edges[0]?.node.price || "0"),
    compareAtPrice: edge.node.variants.edges[0]?.node.compareAtPrice 
      ? parseFloat(edge.node.variants.edges[0].node.compareAtPrice) 
      : null,
    variantId: edge.node.variants.edges[0]?.node.id,
  }));
  
  return json({ bundle, products, shop: session.shop });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const bundleId = params.id;
  const formData = await request.formData();
  const actionType = formData.get("_action");
  
  // Get the bundle
  const bundle = await prisma.bundle.findFirst({
    where: { 
      id: bundleId,
      shop: { shopDomain: session.shop },
    },
  });
  
  if (!bundle) {
    throw new Response("Bundle not found", { status: 404 });
  }
  
  // Handle delete
  if (actionType === "delete") {
    await prisma.bundle.delete({
      where: { id: bundleId },
    });
    return redirect("/app/bundles");
  }
  
  // Handle update
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const type = formData.get("type") as string;
  const discountType = formData.get("discountType") as string;
  const discountValue = parseFloat(formData.get("discountValue") as string) || 10;
  const displayLocation = formData.get("displayLocation") as string;
  const status = formData.get("status") as string;
  const selectedProducts = JSON.parse(formData.get("selectedProducts") as string || "[]");
  
  // Validation
  if (!title) {
    return json({ error: "Title is required" }, { status: 400 });
  }
  
  if (selectedProducts.length < 2) {
    return json({ error: "Please select at least 2 products for the bundle" }, { status: 400 });
  }
  
  // Update bundle
  await prisma.bundle.update({
    where: { id: bundleId },
    data: {
      title,
      description,
      type,
      discountType,
      discountValue,
      displayLocation,
      status,
      minProducts: selectedProducts.length,
    },
  });
  
  // Update products - delete existing and recreate
  await prisma.bundleProduct.deleteMany({
    where: { bundleId },
  });
  
  await prisma.bundleProduct.createMany({
    data: selectedProducts.map((product: any, index: number) => ({
      bundleId,
      productId: product.id,
      variantId: product.variantId,
      title: product.title,
      imageUrl: product.imageUrl,
      price: product.price,
      compareAtPrice: product.compareAtPrice,
      position: index,
    })),
  });
  
  return json({ success: true, message: "Bundle updated successfully" });
};

export default function EditBundle() {
  const { bundle, products } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  
  const isSubmitting = navigation.state === "submitting";
  
  // Initialize form state from bundle
  const [title, setTitle] = useState(bundle.title);
  const [description, setDescription] = useState(bundle.description || "");
  const [type, setType] = useState(bundle.type);
  const [discountType, setDiscountType] = useState(bundle.discountType);
  const [discountValue, setDiscountValue] = useState(bundle.discountValue.toString());
  const [displayLocation, setDisplayLocation] = useState(bundle.displayLocation);
  const [status, setStatus] = useState(bundle.status);
  const [selectedProducts, setSelectedProducts] = useState<any[]>(
    bundle.products.map((p) => ({
      id: p.productId,
      variantId: p.variantId,
      title: p.title,
      imageUrl: p.imageUrl,
      price: p.price,
      compareAtPrice: p.compareAtPrice,
    }))
  );
  const [deleteModalActive, setDeleteModalActive] = useState(false);
  
  const handleProductSelect = useCallback((product: any) => {
    setSelectedProducts((prev) => {
      const exists = prev.find((p) => p.id === product.id);
      if (exists) {
        return prev.filter((p) => p.id !== product.id);
      }
      return [...prev, product];
    });
  }, []);
  
  const handleRemoveProduct = useCallback((productId: string) => {
    setSelectedProducts((prev) => prev.filter((p) => p.id !== productId));
  }, []);
  
  const handleSubmit = useCallback(() => {
    const formData = new FormData();
    formData.append("_action", "update");
    formData.append("title", title);
    formData.append("description", description);
    formData.append("type", type);
    formData.append("discountType", discountType);
    formData.append("discountValue", discountValue);
    formData.append("displayLocation", displayLocation);
    formData.append("status", status);
    formData.append("selectedProducts", JSON.stringify(selectedProducts));
    
    submit(formData, { method: "post" });
  }, [title, description, type, discountType, discountValue, displayLocation, status, selectedProducts, submit]);
  
  const handleDelete = useCallback(() => {
    const formData = new FormData();
    formData.append("_action", "delete");
    submit(formData, { method: "post" });
  }, [submit]);
  
  // Calculate bundle price preview
  const originalTotal = selectedProducts.reduce((sum, p) => sum + p.price, 0);
  const discount = discountType === "percentage" 
    ? originalTotal * (parseFloat(discountValue) / 100)
    : parseFloat(discountValue);
  const bundlePrice = Math.max(0, originalTotal - discount);
  
  const typeOptions = [
    { label: "Fixed Bundle", value: "fixed" },
  ];
  
  const discountTypeOptions = [
    { label: "Percentage Off", value: "percentage" },
    { label: "Fixed Amount Off", value: "fixed_amount" },
  ];
  
  const displayLocationOptions = [
    { label: "Product Page", value: "product_page" },
  ];
  
  const statusOptions = [
    { label: "Active", value: "active" },
    { label: "Draft", value: "draft" },
  ];

  return (
    <Page
      title={`Edit: ${bundle.title}`}
      backAction={{ content: "Bundles", url: "/app/bundles" }}
      primaryAction={{
        content: "Save Changes",
        onAction: handleSubmit,
        loading: isSubmitting,
        disabled: !title || selectedProducts.length < 2,
      }}
      secondaryActions={[
        {
          content: "Delete",
          destructive: true,
          onAction: () => setDeleteModalActive(true),
        },
      ]}
    >
      <Layout>
        {actionData?.error && (
          <Layout.Section>
            <Banner tone="critical">
              <p>{actionData.error}</p>
            </Banner>
          </Layout.Section>
        )}
        
        {actionData?.success && (
          <Layout.Section>
            <Banner tone="success">
              <p>{actionData.message}</p>
            </Banner>
          </Layout.Section>
        )}
        
        <Layout.Section>
          <BlockStack gap="400">
            {/* Basic Info */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">Bundle Details</Text>
                  {bundle.isAiGenerated && (
                    <Badge tone="info">AI Generated</Badge>
                  )}
                </InlineStack>
                <FormLayout>
                  <TextField
                    label="Title"
                    value={title}
                    onChange={setTitle}
                    placeholder="e.g., Summer Essentials Bundle"
                    autoComplete="off"
                    requiredIndicator
                  />
                  <TextField
                    label="Description"
                    value={description}
                    onChange={setDescription}
                    multiline={3}
                    placeholder="Describe your bundle..."
                    autoComplete="off"
                  />
                  <InlineGrid columns={2} gap="400">
                    <Select
                      label="Bundle Type"
                      options={typeOptions}
                      value={type}
                      onChange={setType}
                    />
                    <Select
                      label="Status"
                      options={statusOptions}
                      value={status}
                      onChange={setStatus}
                    />
                  </InlineGrid>
                </FormLayout>
              </BlockStack>
            </Card>
            
            {/* Discount Settings */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Discount Settings</Text>
                <FormLayout>
                  <InlineGrid columns={2} gap="400">
                    <Select
                      label="Discount Type"
                      options={discountTypeOptions}
                      value={discountType}
                      onChange={setDiscountType}
                    />
                    <TextField
                      label={discountType === "percentage" ? "Discount %" : "Discount Amount"}
                      value={discountValue}
                      onChange={setDiscountValue}
                      type="number"
                      suffix={discountType === "percentage" ? "%" : "$"}
                      autoComplete="off"
                    />
                  </InlineGrid>
                  <Select
                    label="Display Location"
                    options={displayLocationOptions}
                    value={displayLocation}
                    onChange={setDisplayLocation}
                  />
                </FormLayout>
              </BlockStack>
            </Card>
            
            {/* Product Selection */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">Products</Text>
                  <Badge>{selectedProducts.length} selected</Badge>
                </InlineStack>
                
                {selectedProducts.length < 2 && (
                  <Banner tone="warning">
                    <p>Select at least 2 products to create a bundle.</p>
                  </Banner>
                )}
                
                {/* Selected Products */}
                {selectedProducts.length > 0 && (
                  <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        Selected Products
                      </Text>
                      {selectedProducts.map((product) => (
                        <InlineStack key={product.id} align="space-between" blockAlign="center">
                          <InlineStack gap="300" blockAlign="center">
                            <Thumbnail
                              source={product.imageUrl || ""}
                              alt={product.title}
                              size="small"
                            />
                            <BlockStack gap="050">
                              <Text as="span" variant="bodyMd">{product.title}</Text>
                              <Text as="span" variant="bodySm" tone="subdued">
                                ${product.price.toFixed(2)}
                              </Text>
                            </BlockStack>
                          </InlineStack>
                          <Button
                            variant="plain"
                            tone="critical"
                            onClick={() => handleRemoveProduct(product.id)}
                          >
                            Remove
                          </Button>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  </Box>
                )}
                
                <Divider />
                
                {/* Available Products */}
                <Text as="p" variant="bodyMd" fontWeight="semibold">
                  Available Products
                </Text>
                <Box maxHeight="400px" overflowY="scroll">
                  <ResourceList
                    resourceName={{ singular: "product", plural: "products" }}
                    items={products.filter(
                      (p: any) => !selectedProducts.find((sp) => sp.id === p.id)
                    )}
                    renderItem={(product: any) => {
                      return (
                        <ResourceItem
                          id={product.id}
                          onClick={() => handleProductSelect(product)}
                          media={
                            <Thumbnail
                              source={product.imageUrl || ""}
                              alt={product.title}
                              size="small"
                            />
                          }
                        >
                          <InlineStack align="space-between">
                            <BlockStack gap="050">
                              <Text as="span" variant="bodyMd" fontWeight="semibold">
                                {product.title}
                              </Text>
                              <Text as="span" variant="bodySm" tone="subdued">
                                ${product.price.toFixed(2)}
                              </Text>
                            </BlockStack>
                            <Button size="slim" variant="secondary">
                              Add
                            </Button>
                          </InlineStack>
                        </ResourceItem>
                      );
                    }}
                  />
                </Box>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
        
        {/* Sidebar - Preview */}
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Bundle Preview</Text>
              <Divider />
              
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" fontWeight="semibold">
                  {title || "Bundle Title"}
                </Text>
                {description && (
                  <Text as="p" variant="bodySm" tone="subdued">
                    {description}
                  </Text>
                )}
              </BlockStack>
              
              <Divider />
              
              <BlockStack gap="200">
                <InlineStack align="space-between">
                  <Text as="span" tone="subdued">Products</Text>
                  <Text as="span">{selectedProducts.length}</Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" tone="subdued">Original Total</Text>
                  <Text as="span">${originalTotal.toFixed(2)}</Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" tone="subdued">Discount</Text>
                  <Text as="span" tone="critical">
                    -{discountType === "percentage" ? `${discountValue}%` : `$${discountValue}`}
                  </Text>
                </InlineStack>
                <Divider />
                <InlineStack align="space-between">
                  <Text as="span" fontWeight="bold">Bundle Price</Text>
                  <Text as="span" fontWeight="bold" tone="success">
                    ${bundlePrice.toFixed(2)}
                  </Text>
                </InlineStack>
                {originalTotal > 0 && (
                  <Badge tone="success">
                    Save ${discount.toFixed(2)} ({((discount / originalTotal) * 100).toFixed(0)}%)
                  </Badge>
                )}
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
      
      <Modal
        open={deleteModalActive}
        onClose={() => setDeleteModalActive(false)}
        title="Delete bundle?"
        primaryAction={{
          content: "Delete",
          destructive: true,
          onAction: handleDelete,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setDeleteModalActive(false),
          },
        ]}
      >
        <Modal.Section>
          <Text as="p">
            Are you sure you want to delete "{bundle.title}"? This action cannot be undone.
          </Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}