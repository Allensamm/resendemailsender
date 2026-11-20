import { mailboxSettings } from "../../../lib/mailboxes";
import { env } from "node:process";
import { replyMailbox, senderAddress, type MailSettings } from "../../../lib/send-email";

import { senderSignature } from "../../../lib/signature";

export function GET(request: Request) {
  const settings = mailboxSettings(request, env as MailSettings);
  if (settings instanceof Response) return settings;
  const from = senderAddress(settings);
  const replyTo = replyMailbox(settings);
  return Response.json({ from, replyTo, signature: senderSignature(from), configured: Boolean(from && replyTo && settings.RESEND_API_KEY) }, {
    headers: { "Cache-Control": "no-store" },
  });
}
