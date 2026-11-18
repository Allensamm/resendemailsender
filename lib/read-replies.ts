import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { convert } from "html-to-text";
import { Resend, type ErrorResponse, type GetReceivingEmailResponseSuccess, type ListReceivingEmail, type ListReceivingEmailsResponseSuccess } from "resend";

export type ReplySummary = { id: string; from: string; subject: string; date: string };
export type ReplyPage = { mailbox: string; messages: ReplySummary[]; next: string | null };
export type ReplyBody = { text: string; attachments: string[]; threadId: string | null; replyTo: string[]; referenceIds?: string[] };

const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Authorization, Cookie" } });
}
const sessionName = "letterpress_inbox";
const day = 24 * 60 * 60;
const sessionSeconds = 400 * day;

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

function sessionExpiry(request: Request, password: string) {
  const token = request.headers.get("cookie")?.split(/;\s*/).find(cookie => cookie.startsWith(sessionName + "="))?.slice(sessionName.length + 1);
  const match = token?.match(/^(\d{10})\.([A-Za-z0-9_-]{43})$/);
  if (!match || !equalSecrets(match[2], signature(match[1], password))) return 0;
  const expiry = Number(match[1]);
  return expiry > Date.now() / 1000 ? expiry : 0;
}

function writeSession(response: Response, request: Request, password?: string) {
  const expires = String(Math.floor(Date.now() / 1000) + sessionSeconds);
  const token = password ? expires + "." + signature(expires, password) : "";
  const secure = new URL(request.url).protocol === "https:" || process.env.NODE_ENV === "production";
  response.headers.set("Set-Cookie", sessionName + "=" + token + "; Path=/api/replies; HttpOnly; SameSite=Strict; Max-Age=" + (password ? sessionSeconds : 0) + (secure ? "; Secure" : ""));
}

export function inboxSession(request: Request, password?: string) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Invalid request origin." }, 403);
  const unlock = request.method === "POST";
  if (!unlock && request.method !== "DELETE") return json({ error: "Unsupported request." }, 405);
  if (unlock) {
    if (!password) return json({ error: "Configure the inbox password first." }, 503);
    if (!passwordMatches(request, password)) return json({ error: "Enter your inbox password." }, 401);
  }
  const response = json({ unlocked: unlock });
  writeSession(response, request, unlock ? password : undefined);
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

function inboxAccess(request: Request, password?: string) {
  if (!password) return json({ error: "Set INBOX_PASSWORD in the server environment and redeploy to unlock Replies." }, 503);
  const expires = sessionExpiry(request, password);
  if (!expires && !passwordMatches(request, password)) return json({ error: "Enter your inbox password." }, 401);
  return expires;
}


function headerIds(value: string) {
  return (value.match(/<[^<>\s@\x00-\x1f\x7f]+@[^<>\s@\x00-\x1f\x7f]+>/g) || []).filter(id => id.length < 450);
}

function threadTarget(email: GetReceivingEmailResponseSuccess) {
  const headers = Object.fromEntries(Object.entries(email.headers || {}).map(([key, value]) => [key.toLowerCase(), value]));
  const raw = (email.message_id || headers["message-id"] || "").trim();
  const [parent] = headerIds(raw.startsWith("<") ? raw : "<" + raw + ">");
  const recipients = email.reply_to?.length ? email.reply_to : [email.from];
  const to = recipients.map(item => (item.match(/<([^<>]+)>\s*$/)?.[1] || item).trim());
  if (!parent || !to.length || to.length > 50 || to.some(address => !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(address))) return null;
  const prior = headerIds(headers.references || "");
  if (!prior.length) prior.push(...headerIds(headers["in-reply-to"] || ""));
  const chain = [...new Set([...prior.filter(id => id !== parent), parent])];
  while (chain.length > 2 && chain.join(" ").length > 950) chain.splice(1, 1);
  const original = (email.subject || "").replace(/[\r\n]+/g, " ").trim();
  const subject = (/^re:/i.test(original) ? original : "Re: " + (original || "(No subject)")).slice(0, 500);
  return { to, subject, threadId: chain[0], headers: { "In-Reply-To": parent, References: chain.join(" ") } };
}

async function getInbound(resend: Resend, id: string, mailbox: string) {
  const { data, error } = await resend.emails.receiving.get(id, { html_format: "cid" }, { signal: AbortSignal.timeout(12000) });
  if (error) return providerError(error);
  if (!belongsToMailbox(data, mailbox)) return json({ error: "Reply not found." }, 404);
  return data;
}

export async function resolveReplyTarget(request: Request, settings: { password?: string; apiKey?: string; mailbox: string }) {
  const access = inboxAccess(request, settings.password);
  if (access instanceof Response) return access;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Invalid request origin." }, 403);
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!uuid.test(id)) return json({ error: "Select a valid incoming message." }, 400);
  if (!settings.apiKey || !settings.mailbox) return json({ error: "Configure the receiving mailbox first." }, 503);
  try {
    const email = await getInbound(new Resend(settings.apiKey), id, settings.mailbox);
    if (email instanceof Response) return email;
    return threadTarget(email) || json({ error: "The incoming message has no usable reply address or Message-ID." }, 422);
  } catch {
    return json({ error: "Could not load the original message. Try again." }, 502);
  }
}

export async function readReplies(request: Request, settings: { password?: string; apiKey?: string; mailbox: string }) {
  const expires = inboxAccess(request, settings.password);
  if (expires instanceof Response) return expires;
  const response = await mailboxResponse(request, settings);
  // Also upgrades valid cookies from the original seven-day login.
  if (expires && expires - Date.now() / 1000 < sessionSeconds - day) writeSession(response, request, settings.password);
  return response;
}

async function sentStatuses(resend: Resend, ids: string[]) {
  if (!ids.length || ids.length > 30 || ids.some(id => !uuid.test(id))) {
    return json({ error: "Invalid sent message identifiers." }, 400);
  }
  const options = { signal: AbortSignal.timeout(10000) };
  const events: Record<string, string> = {};
  if (ids.length === 1) {
    const { data, error } = await resend.emails.get(ids[0], options);
    if (error?.statusCode === 404) return json({ events });
    if (error) return sentStatusError(error);
    if (data.id === ids[0]) events[data.id] = data.last_event;
  } else {
    const { data, error } = await resend.emails.list({ limit: 100 }, options);
    if (error) return sentStatusError(error);
    for (const message of data.data) {
      if (ids.includes(message.id)) events[message.id] = message.last_event;
    }
  }
  return json({ events });
}

function sentStatusError(error: ErrorResponse) {
  if (error.statusCode === 401 || error.statusCode === 403) {
    return json({ error: "The Resend key needs Full access to retrieve delivery status." }, 502);
  }
  if (error.statusCode === 429) return json({ error: "Resend is busy. Try refreshing in a moment." }, 429);
  return json({ error: "Could not retrieve delivery status from Resend." }, 502);
}

async function mailboxResponse(request: Request, settings: { apiKey?: string; mailbox: string }) {
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
    if (params.get("view") === "sent-status") {
      return await sentStatuses(resend, [...new Set(params.getAll("receipt"))]);
    }
    if (id) {
      const data = await getInbound(resend, id, settings.mailbox);
      if (data instanceof Response) return data;
      const target = threadTarget(data);
      const text = data.text?.trim() ? data.text : convert(data.html || "", {
        wordwrap: false,
        selectors: [{ selector: "img", format: "skip" }, { selector: "a", options: { ignoreHref: true } }],
      });
      const headers = Object.fromEntries(Object.entries(data.headers || {}).map(([key, value]) => [key.toLowerCase(), value]));
      const referenceIds = headerIds([data.message_id, headers["message-id"], headers.references, headers["in-reply-to"]].filter(Boolean).map(value => value!.includes("<") ? value : "<" + value + ">").join(" "));
      return json({ text, referenceIds, threadId: target?.threadId || null, replyTo: target?.to || [], attachments: (data.attachments || []).map(file => file.filename || "Unnamed attachment") } satisfies ReplyBody);
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
    return json({ error: "Could not reach Resend. Try again." }, 502);
  }
}
