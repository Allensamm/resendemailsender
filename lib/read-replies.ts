import { createHash, timingSafeEqual } from "node:crypto";
import { convert } from "html-to-text";
import { Resend, type ErrorResponse, type ListReceivingEmail, type ListReceivingEmailsResponseSuccess } from "resend";

export type ReplySummary = { id: string; from: string; subject: string; date: string };
export type ReplyPage = { mailbox: string; messages: ReplySummary[]; next: string | null };
export type ReplyBody = { text: string; attachments: string[] };

const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } });
}
function providerError(error: ErrorResponse) {
  if (error.statusCode === 401 || error.statusCode === 403) {
    return json({ error: "Resend denied inbox access. Check that the production API key has Full access." }, 502);
  }
  if (error.statusCode === 404) return json({ error: "This reply is no longer available." }, 404);
  if (error.statusCode === 429) return json({ error: "Resend is busy. Wait a moment and refresh." }, 429);
  return json({ error: "Could not reach the Resend inbox. Try again." }, 502);
}

function belongsToMailbox(message: ListReceivingEmail, mailbox: string) {
  const recipients = [...(message.received_for || []), ...message.to, ...(message.cc || []), ...(message.bcc || [])];
  return recipients.some(recipient => {
    const address = recipient.match(/<([^<>]+)>\s*$/)?.[1] || recipient;
    return address.trim().toLowerCase() === mailbox.toLowerCase();
  });
}

export async function readReplies(request: Request, settings: { password?: string; apiKey?: string; mailbox: string }) {
  if (!settings.password) return json({ error: "Set INBOX_PASSWORD in the server environment and redeploy to unlock Replies." }, 503);
  const credential = request.headers.get("authorization") || "";
  const expected = "Bearer " + encodeURIComponent(settings.password);
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(digest(credential), digest(expected))) return json({ error: "Enter your inbox password." }, 401);
  if (!settings.apiKey || !settings.mailbox) return json({ error: "Configure the Resend API key and receiving address on the server." }, 503);
  const params = new URL(request.url).searchParams;
  const id = params.get("id");
  const after = params.get("after");
  if ((id !== null && !uuid.test(id)) || (after !== null && !uuid.test(after)) || (id && after)) {
    return json({ error: "Invalid message or page identifier." }, 400);
  }
  const resend = new Resend(settings.apiKey);
  const options = { signal: AbortSignal.timeout(12000) };
  try {
    if (id) {
      const { data, error } = await resend.emails.receiving.get(id, { html_format: "cid" }, options);
      if (error) return providerError(error);
      if (!belongsToMailbox(data, settings.mailbox)) return json({ error: "Reply not found." }, 404);
      const text = data.text?.trim() ? data.text : convert(data.html || "", {
        wordwrap: false,
        selectors: [{ selector: "img", format: "skip" }, { selector: "a", options: { ignoreHref: true } }],
      });
      return json({ text, attachments: (data.attachments || []).map(file => file.filename || "Unnamed attachment") } satisfies ReplyBody);
    }

    // This SDK version's receiving.list() omits Resend's recipient filter.
    const query = new URLSearchParams({ to: settings.mailbox, limit: "25" });
    if (after) query.set("after", after);
    const { data, error } = await resend.get<ListReceivingEmailsResponseSuccess>("/emails/receiving?" + query, options);
    if (error) return providerError(error);
    const messages = data.data.filter(message => belongsToMailbox(message, settings.mailbox))
      .map(({ id, from, subject, created_at }) => ({ id, from, subject, date: created_at }));
    return json({ mailbox: settings.mailbox, messages, next: data.has_more ? data.data.at(-1)?.id || null : null } satisfies ReplyPage);
  } catch {
    return json({ error: "Could not load replies from Resend. Try again." }, 502);
  }
}
