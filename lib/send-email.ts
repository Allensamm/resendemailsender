import { Resend } from "resend";

export type MailSettings = { RESEND_API_KEY?: string; RESEND_FROM?: string; RESEND_REPLY_TO?: string };

export function senderAddress(settings: MailSettings, production = process.env.NODE_ENV === "production") {
  const sender = settings.RESEND_FROM?.trim() || (production ? "" : "onboarding@resend.dev");
  const mailbox = sender.match(/<([^<>]+)>$/)?.[1] || sender;
  if (!validAddress.test(mailbox) || /[\r\n]/.test(sender)) return "";
  if (production && mailbox.toLowerCase().endsWith("@resend.dev")) return "";
  return sender;
}

export function replyMailbox(settings: MailSettings) {
  const replyTo = settings.RESEND_REPLY_TO?.trim();
  const sender = senderAddress(settings);
  const from = (sender.match(/<([^<>]+)>$/)?.[1] || sender).toLowerCase();
  const defaultMailbox = from.endsWith("@sovernpartners.com") ? "replies@kronaesaex.resend.app" : from;
  const address = replyTo || defaultMailbox;
  return validAddress.test(address) ? address.toLowerCase() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const fail = (message: string, status: number) => Response.json({ error: message }, { status });
const validAddress = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

function messageHtml(message: string) {
  const escaped = message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return '<div style="white-space:pre-wrap">' + escaped + "</div>";
}

export type ThreadTarget = {
  to: string[];
  subject: string;
  threadId: string;
  headers: { "In-Reply-To": string; References: string };
};

export async function sendEmail(request: Request, settings: MailSettings, thread?: ThreadTarget) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return fail("Request origin is invalid.", 403);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    return fail("Submit the message as JSON.", 415);
  let data;
  try {
    data = await request.json();
  } catch {
    return fail("The message could not be read.", 400);
  }
  if (!isRecord(data)) return fail("Enter a recipient, subject, and message.", 400);
  const envelope = thread ? { to: thread.to.join(","), cc: "", bcc: "", subject: thread.subject } : data;
  const recipients: { to: string[]; cc?: string[]; bcc?: string[] } = { to: [] };
  let count = 0;
  for (const field of ["to", "cc", "bcc"] as const) {
    const raw = envelope[field] ?? "";
    if (typeof raw !== "string" || raw.length > 16000) return fail("Check the recipient addresses.", 400);
    const list = raw.trim() ? raw.split(",").map(item => item.trim()) : [];
    if (field === "to" && !list.length) return fail("Add a recipient in the To field.", 400);
    if (list.some(address => address.length > 254 || !validAddress.test(address)))
      return fail("Enter valid email addresses separated by commas.", 400);
    if (list.length) recipients[field] = list;
    count += list.length;
  }
  if (count > 50) return fail("Use up to 50 recipients per message.", 400);
  if (typeof envelope.subject !== "string" || !envelope.subject.trim() || envelope.subject.length > 500 || /[\r\n]/.test(envelope.subject))
    return fail("Enter a subject of up to 500 characters.", 400);
  if (typeof data.message !== "string" || !data.message.trim() || data.message.length > 50000)
    return fail("Enter a message of up to 50,000 characters.", 400);
  let scheduledAt: string | undefined;
  if (data.scheduledAt !== undefined) {
    const raw = data.scheduledAt;
    const time = typeof raw === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(raw) ? Date.parse(raw) : NaN;
    const now = Date.now();
    if (!Number.isFinite(time) || time < now + 60000 || time > now + 30 * 86400000)
      return fail("Choose a send time at least 1 minute from now and within the next 30 days.", 400);
    scheduledAt = new Date(time).toISOString();
  }
  const token = request.headers.get("idempotency-key");
  if (!token || !/^[\w/-]{1,256}$/.test(token)) return fail("A send request identifier is required.", 400);
  if (!settings.RESEND_API_KEY) return fail("Add RESEND_API_KEY to the server environment to enable sending. Your draft is still here.", 503);
  const from = senderAddress(settings);
  if (!from) return fail("Set RESEND_FROM to an address on your verified Resend domain.", 503);
  const replyTo = replyMailbox(settings);
  if (!replyTo) return fail("Set RESEND_REPLY_TO to a valid receiving address.", 503);
  const resend = new Resend(settings.RESEND_API_KEY);
  try {
    const { data: receipt, error } = await resend.emails.send(
      { from, replyTo, ...recipients, ...(scheduledAt && { scheduledAt }), ...(thread && { headers: thread.headers }), subject: envelope.subject.trim(), text: data.message, html: messageHtml(data.message) },
      { idempotencyKey: token, signal: AbortSignal.timeout(15000) },
    );
    if (error) return fail(error.message, error.statusCode ?? 502);
    if (!receipt?.id) return fail("Resend did not return a message ID. Retry to confirm this send.", 502);
    return Response.json({ id: receipt.id, ...(scheduledAt && { scheduledAt }), ...(thread && { from, to: recipients.to.join(", "), subject: thread.subject }) });
  } catch {
    return fail("Could not confirm the send with Resend. Retry this draft to check the same request.", 502);
  }
}
