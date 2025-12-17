import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Button,
  Divider,
  TextField,
  FormLayout,
  Banner,
  Box,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import { sendSupportEmail } from "../services/email.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return json({ shop: session.shop });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  
  const email = formData.get("email") as string;
  const subject = formData.get("subject") as string;
  const message = formData.get("message") as string;
  
  if (!email || !subject || !message) {
    return json({ success: false, error: "Please fill in all fields" });
  }
  
  const result = await sendSupportEmail(
    session.shop,
    email,
    subject,
    message
  );
  
  if (result.success) {
    return json({ success: true, message: "Your message has been sent! We'll get back to you soon." });
  }
  
  return json({ success: false, error: result.error || "Failed to send message. Please try again." });
};

export default function Support() {
  const { shop } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  
  const isSubmitting = navigation.state === "submitting";
  
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  
  const handleSubmit = useCallback(() => {
    const formData = new FormData();
    formData.append("email", email);
    formData.append("subject", subject);
    formData.append("message", message);
    submit(formData, { method: "post" });
  }, [email, subject, message, submit]);
  
  // Clear form on success
  if (actionData?.success && email) {
    setEmail("");
    setSubject("");
    setMessage("");
  }

  return (
    <Page 
      title="Support"
      backAction={{ content: "Dashboard", url: "/app" }}
    >
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              {actionData?.success && (
                <Banner tone="success" onDismiss={() => {}}>
                  <p>{actionData.message}</p>
                </Banner>
              )}
              
              {actionData?.error && (
                <Banner tone="critical" onDismiss={() => {}}>
                  <p>{actionData.error}</p>
                </Banner>
              )}
              
              {/* Contact Form */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Contact Support</Text>
                  <Divider />
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Need help? Send us a message and we'll get back to you as soon as possible.
                  </Text>
                  
                  <FormLayout>
                    <TextField
                      label="Your Email"
                      type="email"
                      value={email}
                      onChange={setEmail}
                      placeholder="you@example.com"
                      autoComplete="email"
                      requiredIndicator
                    />
                    <TextField
                      label="Subject"
                      value={subject}
                      onChange={setSubject}
                      placeholder="How can we help?"
                      autoComplete="off"
                      requiredIndicator
                    />
                    <TextField
                      label="Message"
                      value={message}
                      onChange={setMessage}
                      multiline={5}
                      placeholder="Describe your issue or question..."
                      autoComplete="off"
                      requiredIndicator
                    />
                  </FormLayout>
                  
                  <Button
                    variant="primary"
                    onClick={handleSubmit}
                    loading={isSubmitting}
                    disabled={!email || !subject || !message}
                  >
                    Send Message
                  </Button>
                </BlockStack>
              </Card>
              
              {/* FAQs */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Frequently Asked Questions</Text>
                  <Divider />
                  
                  <BlockStack gap="400">
                    <Box>
                      <Text as="h3" variant="headingSm">How do I create a bundle?</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Go to Bundles → Create Bundle. Select at least 2 products, 
                        set a discount, and save. The bundle will appear on product pages.
                      </Text>
                    </Box>
                    
                    <Box>
                      <Text as="h3" variant="headingSm">How do I enable the widget on my store?</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Go to your theme editor (Online Store → Themes → Customize), 
                        find the Alintro embed block in the App Embeds section, and enable it.
                      </Text>
                    </Box>
                    
                    <Box>
                      <Text as="h3" variant="headingSm">How are discounts applied?</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Discounts are applied automatically when customers add a bundle 
                        to their cart using a unique discount code generated for each bundle.
                      </Text>
                    </Box>
                    
                    <Box>
                      <Text as="h3" variant="headingSm">What's included in each plan?</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Visit the Plans page to see a detailed comparison of features 
                        and pricing for each plan tier.
                      </Text>
                    </Box>
                  </BlockStack>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
          
          <Layout.Section variant="oneThird">
            {/* Quick Links */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Quick Links</Text>
                <Divider />
                <BlockStack gap="200">
                  <Button url="/app/bundles/new" fullWidth variant="secondary">
                    Create Bundle
                  </Button>
                  <Button url="/app/bundles/ai-suggest" fullWidth variant="secondary">
                    AI Suggestions
                  </Button>
                  <Button url="/app/plans" fullWidth variant="secondary">
                    View Plans
                  </Button>
                  <Button url="/app/settings" fullWidth variant="secondary">
                    Settings
                  </Button>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}