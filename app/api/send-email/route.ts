import { env } from "node:process";
import { sendEmail, type MailSettings } from "../../../lib/send-email";

export function POST(request: Request) {
  return sendEmail(request, env as MailSettings);
}
