import type { MailSettings } from "./send-email.ts";

// The client chooses an identity, never an arbitrary From or receiving address.
export function mailboxSettings(request: Request, settings: MailSettings): MailSettings | Response {
  const mailbox = new URL(request.url).searchParams.get("mailbox") || "samantha";
  if (mailbox === "samantha") return settings;
  if (mailbox === "design") return { ...settings, RESEND_FROM: "design@sovernpartners.com", RESEND_REPLY_TO: "design@sovernpartners.com" };
  return Response.json({ error: "Unknown mailbox." }, { status: 400 });
}
