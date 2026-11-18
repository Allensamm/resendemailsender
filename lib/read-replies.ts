import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { convert } from "html-to-text";
import { Resend, type ErrorResponse, type ListReceivingEmail, type ListReceivingEmailsResponseSuccess } from "resend";

export type ReplySummary = { id: string; from: string; subject: string; date: string };
export type ReplyPage = { mailbox: string; messages: ReplySummary[]; next: string | null };
export type ReplyBody = { text: string; attachments: string[] };

const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Authorization, Cookie" } });
}
const sessionName = "letterpress_inbox";
const sessionSeconds = 7 * 24 * 60 * 60;

function equalSecrets(left: string, right: string) {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(left), digest(right));
}

function passwordMatches(request: Request, password: string) {
  return equalSecrets(request.headers.get("authorization") || "", "Bearer " + encodeURIComponent(password));
}

function signature(expires: string, password: string) {
  return createHmac("sha256", password).update("letterpress/inbox-session/" + expires).digest("base64url");
}

function hasSession(request: Request, password: string) {
  const token = request.headers.get("cookie")?.split(/;\s*/).find(cookie => cookie.startsWith(sessionName + "="))?.slice(sessionName.length + 1);
  const match = token?.match(/^(\d{10})\.([A-Za-z0-9_-]{43})$/);
  return Boolean(match && Number(match[1]) > Date.now() / 1000 && equalSecrets(match[2], signature(match[1], password)));
}

export function inboxSession(request: Request, password?: string) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Invalid request origin." }, 403);
  const unlock = request.method === "POST";
  if (!unlock && request.method !== "DELETE") return json({ error: "Unsupported request." }, 405);
  let token = "";
  if (unlock) {
    if (!password) return json({ error: "Configure the inbox password first." }, 503);
    if (!passwordMatches(request, password)) return json({ error: "Enter your inbox password." }, 401);
    const expires = String(Math.floor(Date.now() / 1000) + sessionSeconds);
    token = expires + "." + signature(expires, password);
  }
  const response = json({ unlocked: unlock });
  const secure = new URL(request.url).protocol === "https:" || process.env.NODE_ENV === "production";
  response.headers.set("Set-Cookie", sessionName + "=" + token + "; Path=/api/replies; HttpOnly; SameSite=Strict; Max-Age=" + (unlock ? sessionSeconds : 0) + (secure ? "; Secure" : ""));
  return response;
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
  if (!hasSession(request, settings.password) && !passwordMatches(request, settings.password)) {
    return json({ error: "Enter your inbox password." }, 401);
  }
  if (!settings.apiKey || !settings.mailbox) return json({ error: "Configure the Resend API key and receiving address on the server." }, 503);
  const params = new URL(request.url).searchParams;
  const badge = params.get("view") === "badge";
  const id = params.get("id");
  const after = params.get("after");
  if ((id !== null && !uuid.test(id)) || (after !== null && !uuid.test(after)) || (id && (after || badge))) {
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
    const query = new URLSearchParams({ to: settings.mailbox, limit: badge ? "100" : "25" });
    if (after) query.set("after", after);
    const { data, error } = await resend.get<ListReceivingEmailsResponseSuccess>("/emails/receiving?" + query, options);
    if (error) return providerError(error);
    const scoped = data.data.filter(message => belongsToMailbox(message, settings.mailbox));
    const next = data.has_more ? data.data.at(-1)?.id || null : null;
    if (badge) return json({ ids: scoped.map(message => message.id), next });
    const messages = scoped.map(({ id, from, subject, created_at }) => ({ id, from, subject, date: created_at }));
    return json({ mailbox: settings.mailbox, messages, next } satisfies ReplyPage);
  } catch {
    return json({ error: "Could not load replies from Resend. Try again." }, 502);
  }
}
