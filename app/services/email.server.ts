// app/services/email.server.ts
// Email service using SendGrid

const SENDGRID_API_URL = "https://api.sendgrid.com/v3/mail/send";

interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
}

export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.MAIL_PASSWORD;
  const fromEmail = process.env.SUPPORT_EMAIL || "support@alintro.com";
  
  if (!apiKey) {
    console.error("SendGrid API key not configured");
    return { success: false, error: "Email service not configured" };
  }
  
  try {
    const response = await fetch(SENDGRID_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: options.to }],
            subject: options.subject,
          },
        ],
        from: {
          email: options.from || fromEmail,
          name: "Alintro Support",
        },
        content: [
          {
            type: "text/plain",
            value: options.text,
          },
          ...(options.html ? [{
            type: "text/html",
            value: options.html,
          }] : []),
        ],
      }),
    });
    
    if (response.ok || response.status === 202) {
      return { success: true };
    }
    
    const errorData = await response.text();
    console.error("SendGrid error:", errorData);
    return { success: false, error: `Failed to send email: ${response.status}` };
  } catch (error: any) {
    console.error("Email send error:", error);
    return { success: false, error: error.message };
  }
}

export async function sendSupportEmail(
  shop: string,
  userEmail: string,
  subject: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  const supportEmail = process.env.SUPPORT_EMAIL || "support@alintro.com";
  
  const emailContent = `
New Support Request from Alintro App

Shop: ${shop}
User Email: ${userEmail}
Subject: ${subject}

Message:
${message}

---
Sent from Alintro AI Upsell & Bundles App
  `.trim();
  
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #000; color: #fff; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9f9f9; }
    .field { margin-bottom: 15px; }
    .label { font-weight: bold; color: #666; }
    .message { background: #fff; padding: 15px; border-left: 4px solid #000; margin-top: 15px; }
    .footer { text-align: center; padding: 15px; color: #999; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>New Support Request</h2>
    </div>
    <div class="content">
      <div class="field">
        <span class="label">Shop:</span> ${shop}
      </div>
      <div class="field">
        <span class="label">User Email:</span> ${userEmail}
      </div>
      <div class="field">
        <span class="label">Subject:</span> ${subject}
      </div>
      <div class="message">
        <span class="label">Message:</span><br>
        ${message.replace(/\n/g, '<br>')}
      </div>
    </div>
    <div class="footer">
      Sent from Alintro AI Upsell & Bundles App
    </div>
  </div>
</body>
</html>
  `.trim();
  
  return sendEmail({
    to: supportEmail,
    subject: `[Alintro Support] ${subject}`,
    text: emailContent,
    html: htmlContent,
  });
}