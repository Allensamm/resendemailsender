import { mailboxSettings } from "../../../lib/mailboxes";
import { env } from "node:process";
import { replyMailbox, senderAddress, type MailSettings } from "../../../lib/send-email";
import { inboxSession, readReplies } from "../../../lib/read-replies";

export const dynamic = "force-dynamic";
export function GET(request: Request) {
  const settings = mailboxSettings(request, env as MailSettings);
  if (settings instanceof Response) return settings;
  return readReplies(request, {
    password: env.INBOX_PASSWORD,
    apiKey: env.RESEND_API_KEY,
    mailbox: replyMailbox(settings), sender: senderAddress(settings),
  });
}

export function POST(request: Request) {
  return inboxSession(request, env.INBOX_PASSWORD);
}

export function DELETE(request: Request) {
  return inboxSession(request, env.INBOX_PASSWORD);
}
