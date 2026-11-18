import { env } from "node:process";
import { senderAddress, type MailSettings } from "../../../lib/send-email";

export function GET() {
  const settings = env as MailSettings;
  const from = senderAddress(settings);
  return Response.json({ from, configured: Boolean(from && settings.RESEND_API_KEY) }, {
    headers: { "Cache-Control": "no-store" },
  });
}
