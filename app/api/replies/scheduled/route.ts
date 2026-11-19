import { env } from "node:process";
import { cancelScheduledEmail } from "../../../../lib/read-replies";
import { senderAddress, type MailSettings } from "../../../../lib/send-email";

export function DELETE(request: Request) {
  return cancelScheduledEmail(request, {
    password: env.INBOX_PASSWORD, apiKey: env.RESEND_API_KEY,
    sender: senderAddress(env as MailSettings),
  });
}
