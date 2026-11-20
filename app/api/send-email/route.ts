import { mailboxSettings } from "../../../lib/mailboxes";
import { env } from "node:process";
import { sendEmail, type MailSettings } from "../../../lib/send-email";

export function POST(request: Request) {
  const settings = mailboxSettings(request, env as MailSettings);
  if (settings instanceof Response) return settings;
  return sendEmail(request, settings);
}
