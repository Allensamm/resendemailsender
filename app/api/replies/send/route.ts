import { env } from "node:process";
import { resolveReplyTarget } from "../../../../lib/read-replies";
import { replyMailbox, sendEmail, type MailSettings } from "../../../../lib/send-email";

export async function POST(request: Request) {
  const settings = env as MailSettings;
  const thread = await resolveReplyTarget(request, {
    password: env.INBOX_PASSWORD, apiKey: settings.RESEND_API_KEY, mailbox: replyMailbox(settings),
  });
  if (thread instanceof Response) return thread;
  return sendEmail(request, settings, thread);
}
