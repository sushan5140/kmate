import "server-only";
import { Resend } from "resend";

/**
 * Thin wrapper around the Resend SDK -- the one place RESEND_API_KEY is ever
 * read. `server-only` makes importing this from a client component a
 * build-time error rather than a runtime leak, on top of Next's own
 * NEXT_PUBLIC_-prefix stripping (RESEND_API_KEY isn't prefixed, so it would
 * already come through as undefined in a client bundle -- this is a second,
 * redundant guard, not the only one).
 */
let cached: Resend | null = null;

function getResendClient(): Resend {
  if (cached) return cached;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");
  cached = new Resend(apiKey);
  return cached;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type SendEmailResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Never throws -- every failure mode (missing config, provider error, network
 * failure) comes back as `{ ok: false, error }` so a caller can log it and
 * move on without a try/catch of its own. Callers that need the chat message
 * itself to be unaffected by email failures (see /api/messages/notify) rely
 * on exactly this: there is no exception path here to accidentally not catch.
 */
export async function sendTransactionalEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const from = process.env.EMAIL_FROM;
  if (!from) return { ok: false, error: "EMAIL_FROM is not configured." };

  try {
    const resend = getResendClient();
    const { data, error } = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    if (error) return { ok: false, error: error.message || "provider_error" };
    return { ok: true, id: data?.id ?? "unknown" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown_error" };
  }
}
