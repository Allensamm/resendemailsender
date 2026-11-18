import { test } from "node:test";
import assert from "node:assert/strict";
import { inboxSession, readReplies, resolveReplyTarget } from "../lib/read-replies.ts";
import { replyMailbox, sendEmail } from "../lib/send-email.ts";

const settings = { password: "private inbox", apiKey: "mock", mailbox: "replies@team.resend.app" };
const id = "ab5eaa10-55aa-4e3a-a59a-0728a4f66ad5";
const otherId = "c86ecfd1-3b68-4b77-ab05-4fdcb37c0569";
const sample = {
  id, from: "delivered@resend.dev", to: [settings.mailbox], subject: "Re: Hello",
  created_at: "2026-11-18T10:30:00Z", attachments: [], html: null, text: "Thank you!", message_id: "<parent@example.org>",
};
function request(query = "", password = settings.password) {
  return new Request("https://example.org/api/replies" + query, {
    headers: { authorization: "Bearer " + encodeURIComponent(password) },
  });
}
test("list and detail both reject unconfigured or unauthorized access before contacting Resend", async t => {
  const transport = t.mock.method(globalThis, "fetch", () => { throw Error("Unexpected request"); });
  for (const query of ["", "?id=" + id]) {
    assert.equal((await readReplies(request(query), { ...settings, password: "" })).status, 503);
    const denied = await readReplies(request(query, "incorrect"), settings);
    assert.equal(denied.status, 401);
    assert.match(denied.headers.get("cache-control"), /no-store/);
  }
  assert.equal((await readReplies(request("?id=invalid"), settings)).status, 400);
  assert.equal(transport.mock.callCount(), 0);
});
test("lists only the configured mailbox, with a cursor to the next page", async t => {
  let url;
  t.mock.method(globalThis, "fetch", async input => {
    url = new URL(input);
    return Response.json({ data: [sample, { ...sample, id: otherId, to: ["other@team.resend.app"] }], has_more: true });
  });
  const response = await readReplies(request("?after=" + id), settings);
  const body = await response.json();
  assert.equal(url.pathname, "/emails/receiving");
  assert.equal(url.searchParams.get("to"), settings.mailbox);
  assert.equal(url.searchParams.get("after"), id);
  assert.deepEqual(body.messages, [{ id, from: sample.from, subject: sample.subject, date: sample.created_at }]);
  assert.equal(body.next, otherId);
});
test("opens the matching reply as text and rejects IDs from other mailboxes", async t => {
  const transport = t.mock.method(globalThis, "fetch", async () => Response.json({
    ...sample, text: null, html: '<p>Got it &amp; thanks.</p><img src="https://tracker.example/a"><script>bad()</script>',
  }));
  const response = await readReplies(request("?id=" + id), settings);
  assert.deepEqual(await response.json(), { text: "Got it & thanks.", attachments: [], threadId: "<parent@example.org>", replyTo: ["delivered@resend.dev"] });
  transport.mock.mockImplementation(async () => Response.json({ ...sample, to: ["other@team.resend.app"] }));
  assert.equal((await readReplies(request("?id=" + id), settings)).status, 404);
});
test("reports a sending-only key as a provider permissions error", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ name: "restricted_api_key", message: "Denied", statusCode: 403 }, { status: 403 }));
  const result = await readReplies(request(), settings);
  assert.equal(result.status, 502);
  assert.match((await result.json()).error, /Full access/);
});
test("outgoing messages take the reply address only from server settings", async t => {
  const mailSettings = { RESEND_FROM: "Letterpress <mail@example.org>", RESEND_API_KEY: "mock" };
  assert.equal(replyMailbox(mailSettings), "mail@example.org");
  let envelope;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    envelope = JSON.parse(options.body);
    return Response.json({ id });
  });
  const outgoing = new Request("https://example.org/api/send-email", { method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "send-email/test" },
    body: JSON.stringify({ to: "delivered@resend.dev", subject: "Hello", message: "Hello again", replyTo: "untrusted@example.org" }),
  });
  assert.equal((await sendEmail(outgoing, { ...mailSettings, RESEND_REPLY_TO: settings.mailbox })).status, 200);
  assert.equal(envelope.reply_to, settings.mailbox);
});

test("remembered inbox sessions renew on use and reject expired or invalid credentials", async t => {
  const url = "https://example.org/api/replies";
  const login = new Request(url, { method: "POST", headers: request().headers });
  assert.equal(inboxSession(login, "different-password").status, 401);
  const response = inboxSession(login, settings.password);
  const cookie = response.headers.get("set-cookie");
  for (const attribute of ["HttpOnly", "SameSite=Strict", "Secure", "Path=/api/replies"]) assert.ok(cookie.includes(attribute));
  const token = cookie.split(";")[0];
  const badge = (cookieValue) => new Request(url + "?view=badge", { headers: { cookie: cookieValue } });
  const transport = t.mock.method(globalThis, "fetch", async url => {
    assert.equal(new URL(url).searchParams.get("limit"), "100");
    return Response.json({ data: [sample, { ...sample, id: otherId, to: ["other@team.resend.app"] }], has_more: false });
  });
  assert.deepEqual(await (await readReplies(badge(token), settings)).json(), { ids: [id], next: null });
  assert.equal((await readReplies(badge(token + "x"), settings)).status, 401);
  assert.equal((await readReplies(badge(token), { ...settings, password: "rotated" })).status, 401);
  const start = Date.now();
  let now = start + 8 * 86400000;
  t.mock.method(Date, "now", () => now);
  const resumed = await readReplies(badge(token), settings);
  assert.equal(resumed.status, 200);
  const renewed = resumed.headers.get("set-cookie").split(";")[0];
  assert.notEqual(token, renewed);
  now = start + 401 * 86400000;
  assert.equal((await readReplies(badge(token), settings)).status, 401);
  assert.equal((await readReplies(badge(renewed), settings)).status, 200);
  assert.equal((await readReplies(badge(""), settings)).status, 401);
  assert.equal(transport.mock.callCount(), 3);
  const logout = inboxSession(new Request(url, { method: "DELETE" }), settings.password);
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal(inboxSession(new Request(url, { method: "DELETE", headers: { origin: "https://other.example" } }), settings.password).status, 403);
});

test("sent status is private and returns only requested message IDs and latest events", async t => {
  const query = "?view=sent-status&receipt=" + id + "&receipt=" + otherId;
  const transport = t.mock.method(globalThis, "fetch", async url => {
    assert.equal(new URL(url).pathname, "/emails");
    return Response.json({ data: [
      { id, last_event: "complained", subject: "Private subject", to: ["private@example.org"] },
      { id: "another-message", last_event: "delivered" },
    ], has_more: false });
  });
  assert.equal((await readReplies(request(query, "wrong"), settings)).status, 401);
  assert.equal((await readReplies(request("?view=sent-status&receipt=bad"), settings)).status, 400);
  assert.equal(transport.mock.callCount(), 0);
  assert.deepEqual(await (await readReplies(request(query), settings)).json(), { events: { [id]: "complained" } });
  transport.mock.mockImplementation(async url => {
    assert.equal(new URL(url).pathname, "/emails/" + otherId);
    return Response.json({ id: otherId, last_event: "opened", text: "private" });
  });
  const old = "?view=sent-status&receipt=" + otherId;
  assert.deepEqual(await (await readReplies(request(old), settings)).json(), { events: { [otherId]: "opened" } });
  transport.mock.mockImplementation(async () => Response.json({ name: "not_found", statusCode: 404, message: "Gone" }, { status: 404 }));
  assert.deepEqual(await (await readReplies(request(old), settings)).json(), { events: {} });
});

test("a threaded response uses the provider's Reply-To, original Message-ID and reference chain", async t => {
  const mail = { ...sample, reply_to: ["Reader <bounced@resend.dev>"], headers: { References: "<root@example.org> <middle@example.org>" } };
  let sent;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (new URL(url).pathname === "/emails/receiving/" + id) return Response.json(mail);
    sent = JSON.parse(options.body);
    assert.equal(new Headers(options.headers).get("idempotency-key"), "reply/test");
    return Response.json({ id: otherId });
  });
  const req = new Request("https://example.org/api/replies/send?id=" + id, {
    method: "POST", headers: { authorization: "Bearer " + encodeURIComponent(settings.password), "content-type": "application/json", "idempotency-key": "reply/test" },
    body: JSON.stringify({ message: "Yes, Thursday works.", to: "ignored@example.org", bcc: "ignored@example.org", subject: "Ignored", headers: { References: "ignored" } }),
  });
  const target = await resolveReplyTarget(req, settings);
  assert.equal(target.threadId, "<root@example.org>");
  const response = await sendEmail(req, { RESEND_FROM: "hello@example.org", RESEND_REPLY_TO: settings.mailbox, RESEND_API_KEY: "mock" }, target);
  assert.equal(response.status, 200);
  assert.deepEqual(sent.to, ["bounced@resend.dev"]);
  assert.equal(sent.bcc, undefined);
  assert.equal(sent.subject, "Re: Hello");
  assert.equal(sent.reply_to, settings.mailbox);
  assert.deepEqual(sent.headers, { "In-Reply-To": "<parent@example.org>", References: "<root@example.org> <middle@example.org> <parent@example.org>" });
});
test("reply target is protected, mailbox-scoped, and requires a real parent message ID", async t => {
  const transport = t.mock.method(globalThis, "fetch", async () => Response.json({ ...sample, to: ["other@team.resend.app"] }));
  const query = "?id=" + id;
  assert.equal((await resolveReplyTarget(request(query, "wrong"), settings)).status, 401);
  const cross = request(query); cross.headers.set("origin", "https://other.example");
  assert.equal((await resolveReplyTarget(cross, settings)).status, 403);
  assert.equal(transport.mock.callCount(), 0);
  assert.equal((await resolveReplyTarget(request(query), settings)).status, 404);
  transport.mock.mockImplementation(async () => Response.json({ ...sample, message_id: "" }));
  assert.equal((await resolveReplyTarget(request(query), settings)).status, 422);
  transport.mock.mockImplementation(async () => Response.json({ ...sample, subject: "First message", headers: { "In-Reply-To": "<root@example.org>" } }));
  const target = await resolveReplyTarget(request(query), settings);
  assert.deepEqual(target.to, [sample.from]);
  assert.equal(target.threadId, "<root@example.org>");
  assert.equal(target.subject, "Re: First message");
});
