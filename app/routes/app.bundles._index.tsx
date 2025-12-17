import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
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
  IndexTable,
  useIndexResourceState,
  EmptyState,
  Filters,
  ChoiceList,
  Modal,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
  });
  
  if (!shop) {
    return json({ bundles: [], shop: session.shop });
  }
  
  const bundles = await prisma.bundle.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: "desc" },
    include: {
      products: true,
      _count: { select: { analytics: true } },
    },
  });
  
  return json({ bundles, shop: session.shop });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");
  const bundleIds = formData.getAll("bundleIds") as string[];
  
  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
  });
  
  if (!shop) {
    return json({ error: "Shop not found" }, { status: 404 });
  }
  
  switch (action) {
    case "delete":
      await prisma.bundle.deleteMany({
        where: {
          id: { in: bundleIds },
          shopId: shop.id,
        },
      });
      return json({ success: true, message: `Deleted ${bundleIds.length} bundle(s)` });
      
    case "activate":
      await prisma.bundle.updateMany({
        where: {
          id: { in: bundleIds },
          shopId: shop.id,
        },
        data: { status: "active" },
      });
      return json({ success: true, message: `Activated ${bundleIds.length} bundle(s)` });
      
    case "pause":
      await prisma.bundle.updateMany({
        where: {
          id: { in: bundleIds },
          shopId: shop.id,
        },
        data: { status: "draft" },
      });
      return json({ success: true, message: `Paused ${bundleIds.length} bundle(s)` });
      
    default:
      return json({ error: "Unknown action" }, { status: 400 });
  }
};

export default function BundlesList() {
  const { bundles } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [queryValue, setQueryValue] = useState("");
  const [deleteModalActive, setDeleteModalActive] = useState(false);
  
  const isLoading = navigation.state !== "idle";
  
  // Filter bundles
  const filteredBundles = bundles.filter((bundle) => {
    const matchesStatus = statusFilter.length === 0 || statusFilter.includes(bundle.status);
    const matchesQuery = queryValue === "" || 
      bundle.title.toLowerCase().includes(queryValue.toLowerCase());
    return matchesStatus && matchesQuery;
  });
  
  const resourceName = {
    singular: "bundle",
    plural: "bundles",
  };
  
  const { selectedResources, allResourcesSelected, handleSelectionChange, clearSelection } =
    useIndexResourceState(filteredBundles);
  
  const handleBulkAction = useCallback((action: string) => {
    const formData = new FormData();
    formData.append("action", action);
    selectedResources.forEach((id) => formData.append("bundleIds", id));
    submit(formData, { method: "post" });
    clearSelection();
  }, [selectedResources, submit, clearSelection]);
  
  const promotedBulkActions = [
    {
      content: "Activate",
      onAction: () => handleBulkAction("activate"),
    },
    {
      content: "Set as Draft",
      onAction: () => handleBulkAction("pause"),
    },
  ];
  
  const bulkActions = [
    {
      content: "Delete",
      destructive: true,
      onAction: () => setDeleteModalActive(true),
    },
  ];
  
  const handleQueryChange = useCallback((value: string) => setQueryValue(value), []);
  const handleQueryClear = useCallback(() => setQueryValue(""), []);
  const handleStatusChange = useCallback((value: string[]) => setStatusFilter(value), []);
  const handleFiltersClearAll = useCallback(() => {
    setStatusFilter([]);
    setQueryValue("");
  }, []);
  
  const filters = [
    {
      key: "status",
      label: "Status",
      filter: (
        <ChoiceList
          title="Status"
          titleHidden
          choices={[
            { label: "ACTIVE", value: "active" },
            { label: "DRAFT", value: "draft" },
          ]}
          selected={statusFilter}
          onChange={handleStatusChange}
          allowMultiple
        />
      ),
      shortcut: true,
    },
  ];
  
  const appliedFilters = [
    ...(statusFilter.length > 0
      ? [{
          key: "status",
          label: `Status: ${statusFilter.map(s => s.toUpperCase()).join(", ")}`,
          onRemove: () => setStatusFilter([]),
        }]
      : []),
  ];
  
  const getStatusBadge = (status: string) => {
    if (status === "active") {
      return <Badge tone="success">ACTIVE</Badge>;
    }
    return <Badge tone="attention">DRAFT</Badge>;
  };

  const rowMarkup = filteredBundles.map((bundle, index) => (
    <IndexTable.Row
      id={bundle.id}
      key={bundle.id}
      selected={selectedResources.includes(bundle.id)}
      position={index}
    >
      <IndexTable.Cell>
        <Text variant="bodyMd" fontWeight="bold" as="span">
          {bundle.title}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" variant="bodyMd">Fixed Bundle</Text>
      </IndexTable.Cell>
      <IndexTable.Cell>{getStatusBadge(bundle.status)}</IndexTable.Cell>
      <IndexTable.Cell>{bundle.products.length} products</IndexTable.Cell>
      <IndexTable.Cell>{bundle.discountValue}%</IndexTable.Cell>
      <IndexTable.Cell>
        <Button url={`/app/bundles/${bundle.id}`} size="slim">
          Edit
        </Button>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));
  
  const emptyStateMarkup = (
    <EmptyState
      heading="Create your first bundle"
      action={{ content: "Create Bundle", url: "/app/bundles/new" }}
      secondaryAction={{ content: "AI Suggestions", url: "/app/bundles/ai-suggest" }}
      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
    >
      <p>
        Bundles help increase your average order value by offering customers
        product combinations at a discounted price.
      </p>
    </EmptyState>
  );

  return (
    <Page
      title="Bundles"
      primaryAction={{
        content: "Create Bundle",
        url: "/app/bundles/new",
      }}
      secondaryActions={[
        {
          content: "AI Suggestions",
          url: "/app/bundles/ai-suggest",
        },
      ]}
    >
      <Layout>
        <Layout.Section>
          <Card padding="0">
            {bundles.length === 0 ? (
              emptyStateMarkup
            ) : (
              <>
                <Box padding="400">
                  <Filters
                    queryValue={queryValue}
                    queryPlaceholder="Search bundles..."
                    filters={filters}
                    appliedFilters={appliedFilters}
                    onQueryChange={handleQueryChange}
                    onQueryClear={handleQueryClear}
                    onClearAll={handleFiltersClearAll}
                  />
                </Box>
                <IndexTable
                  resourceName={resourceName}
                  itemCount={filteredBundles.length}
                  selectedItemsCount={
                    allResourcesSelected ? "All" : selectedResources.length
                  }
                  onSelectionChange={handleSelectionChange}
                  headings={[
                    { title: "Title" },
                    { title: "Type" },
                    { title: "Status" },
                    { title: "Products" },
                    { title: "Discount" },
                    { title: "Actions" },
                  ]}
                  bulkActions={bulkActions}
                  promotedBulkActions={promotedBulkActions}
                  loading={isLoading}
                >
                  {rowMarkup}
                </IndexTable>
              </>
            )}
          </Card>
        </Layout.Section>
      </Layout>
      
      <Modal
        open={deleteModalActive}
        onClose={() => setDeleteModalActive(false)}
        title="Delete bundles?"
        primaryAction={{
          content: "Delete",
          destructive: true,
          onAction: () => {
            handleBulkAction("delete");
            setDeleteModalActive(false);
          },
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
            Are you sure you want to delete {selectedResources.length} bundle(s)?
            This action cannot be undone.
          </Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}