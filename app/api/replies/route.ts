import { env } from "node:process";
import { replyMailbox, type MailSettings } from "../../../lib/send-email";
import { readReplies } from "../../../lib/read-replies";

export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return readReplies(request, {
    password: env.INBOX_PASSWORD,
    apiKey: env.RESEND_API_KEY,
    mailbox: replyMailbox(env as MailSettings),
  });
}
