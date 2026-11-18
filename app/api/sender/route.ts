import { env } from "cloudflare:workers";
import { senderAddress, type MailSettings } from "../../../lib/send-email";

export function GET() {
  const settings = env as MailSettings;
  return Response.json({ from: senderAddress(settings), configured: Boolean(settings.RESEND_API_KEY) }, {
    headers: { "Cache-Control": "no-store" },
  });
}
