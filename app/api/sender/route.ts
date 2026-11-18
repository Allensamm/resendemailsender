import { env } from "node:process";
import { replyMailbox, senderAddress, type MailSettings } from "../../../lib/send-email";

export function GET() {
  const settings = env as MailSettings;
  const from = senderAddress(settings);
  const replyTo = replyMailbox(settings);
  return Response.json({ from, replyTo, configured: Boolean(from && replyTo && settings.RESEND_API_KEY) }, {
    headers: { "Cache-Control": "no-store" },
  });
}
