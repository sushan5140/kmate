/**
 * "New message" notification email -- the only transactional email KMate
 * sends today. Deliberately doesn't quote the message body: KMate's whole
 * pitch is that private info stays inside the app until both sides opt in
 * (see the landing page's privacy section), and email is a third-party
 * system the recipient doesn't control -- forwarding rules, shared/work
 * inboxes, provider-side scanning. A snippet of what could be a sensitive
 * application-cycle conversation doesn't belong there. This is the
 * fallback line the spec itself offers for exactly this case.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface NewMessageEmailInput {
  /** @-less; the template adds the @ itself. */
  senderUsername: string;
  conversationUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderNewMessageEmail({ senderUsername, conversationUrl }: NewMessageEmailInput): RenderedEmail {
  const safeSender = escapeHtml(senderUsername);
  const safeUrl = escapeHtml(conversationUrl);
  const subject = `New message from @${senderUsername} on KMate`;

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${subject}</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f7f9fb; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f7f9fb; padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px; width:100%; background-color:#ffffff; border-radius:16px; border:1px solid #e7eaf0;">
            <tr>
              <td style="padding:28px 32px 0 32px;">
                <span style="font-size:15px; font-weight:600; color:#12141c; letter-spacing:-0.01em;">KMate</span>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 0 32px;">
                <h1 style="margin:0; font-size:19px; font-weight:600; color:#12141c; line-height:1.3;">You have a new message</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:10px 32px 0 32px;">
                <p style="margin:0; font-size:14px; line-height:1.6; color:#5b6472;">
                  <strong style="color:#12141c;">@${safeSender}</strong>, an applicant you've connected with on KMate, sent you a new message.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 0 32px;">
                <a href="${safeUrl}" style="display:inline-block; background-color:#3e63dd; color:#ffffff; text-decoration:none; font-size:14px; font-weight:500; padding:11px 22px; border-radius:999px;">View message</a>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 28px 32px;">
                <p style="margin:0; font-size:12.5px; line-height:1.6; color:#5b6472; border-top:1px solid #e7eaf0; padding-top:16px;">
                  You're receiving this because you're connected with this applicant on KMate.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    "KMate",
    "",
    "You have a new message",
    "",
    `@${senderUsername}, an applicant you've connected with on KMate, sent you a new message.`,
    "",
    `View message: ${conversationUrl}`,
    "",
    "You're receiving this because you're connected with this applicant on KMate.",
  ].join("\n");

  return { subject, html, text };
}
