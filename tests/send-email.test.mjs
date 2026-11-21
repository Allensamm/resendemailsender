import { test } from "node:test";
import assert from "node:assert/strict";
import { sendEmail, senderAddress } from "../lib/send-email.ts";

const draft = { to: "delivered@resend.dev", subject: "Hello", message: "One <two> & three\nFour" };
const settings = { RESEND_API_KEY: "mock", RESEND_FROM: "Letterpress <hello@sovernpartners.com>" };
const key = "send-email/test-send";
function request(data, headers = {}) {
  return new Request("https://example.com/api/send-email", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": key, ...headers }, body: JSON.stringify(data) });
}
test("the SDK sends the server sender, recipients and retry identifier and returns the receipt", async t => {
  let sent;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    sent = { url, headers: new Headers(options.headers), body: JSON.parse(options.body) };
    return Response.json({ id: "receipt" });
  });
  const response = await sendEmail(request({ ...draft, cc: "bounced@resend.dev,complained@resend.dev", from: "ignored@example.org" }), settings);
  assert.deepEqual(await response.json(), { id: "receipt" });
  assert.equal(sent.url, "https://api.resend.com/emails");
  assert.equal(sent.headers.get("Authorization"), "Bearer mock");
  assert.equal(sent.headers.get("Idempotency-Key"), key);
  assert.deepEqual(sent.body, { from: settings.RESEND_FROM, reply_to: "replies@kronaesaex.resend.app", to: [draft.to], cc: ["bounced@resend.dev", "complained@resend.dev"], subject: draft.subject, text: draft.message, html: '<div style="white-space:pre-wrap">One &lt;two&gt; &amp; three\nFour</div>' });
});
test("production requires a custom sender and local tests can use Resend's sender", () => {
  assert.equal(senderAddress({}, true), "");
  assert.equal(senderAddress({ RESEND_FROM: "Test <onboarding@RESEND.DEV>" }, true), "");
  assert.equal(senderAddress(settings, true), settings.RESEND_FROM);
  assert.equal(senderAddress({}, false), "onboarding@resend.dev");
});
test("rejects incomplete, invalid, and cross-origin submissions before sending", async () => {
  for (const patch of [{ to: "" }, { bcc: "bad" }, { subject: " " }, { message: "" }]) {
    assert.equal((await sendEmail(request({ ...draft, ...patch }), {})).status, 400);
  }
  assert.equal((await sendEmail(request(draft, { origin: "https://other.example" }), {})).status, 403);
  assert.equal((await sendEmail(request(draft), {})).status, 503);
});
test("preserves provider errors and handles a network interruption", async t => {
  const transport = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ statusCode: 429, name: "rate_limit_exceeded", message: "Too many requests" }, { status: 429 }));
  const rejected = await sendEmail(request(draft), settings);
  assert.equal(rejected.status, 429);
  assert.equal((await rejected.json()).error, "Too many requests");
  transport.mock.mockImplementation(async () => { throw new Error("Network offline"); });
  assert.equal((await sendEmail(request(draft), settings)).status, 502);
});

test("scheduling passes an absolute UTC time to Resend and keeps the idempotency key", async t => {
  let sent;
  t.mock.method(Date, "now", () => Date.parse("2026-11-19T10:00:00Z"));
  t.mock.method(globalThis, "fetch", async (url, options) => {
    sent = { headers: new Headers(options.headers), body: JSON.parse(options.body) };
    return Response.json({ id: "scheduled-receipt" });
  });
  const response = await sendEmail(request({ ...draft, scheduledAt: "2026-11-20T10:30:00+01:00" }), settings);
  assert.deepEqual(await response.json(), { id: "scheduled-receipt", scheduledAt: "2026-11-20T09:30:00.000Z" });
  assert.equal(sent.body.scheduled_at, "2026-11-20T09:30:00.000Z");
  assert.equal(sent.headers.get("Idempotency-Key"), key);
});

test("invalid, past, ambiguous and out-of-range schedules never send immediately", async t => {
  t.mock.method(Date, "now", () => Date.parse("2026-11-19T10:00:00Z"));
  const transport = t.mock.method(globalThis, "fetch", () => { throw Error("Unexpected send"); });
  for (const scheduledAt of ["", null, 123, "tomorrow", "2026-11-20T10:00", "2026-11-18T10:00:00Z", "2026-11-19T10:00:30Z", "2026-12-20T10:00:00Z"]) {
    assert.equal((await sendEmail(request({ ...draft, scheduledAt }), settings)).status, 400);
  }
  assert.equal(transport.mock.callCount(), 0);
});

test("Samantha's signature is appended once to new, scheduled and threaded mail in HTML and plain text", async t => {
  const envelopes = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    envelopes.push(JSON.parse(options.body));
    return Response.json({ id: "signed-receipt" });
  });
  const signatureSettings = { ...settings, RESEND_FROM: "samantha@sovernpartners.com", RESEND_REPLY_TO: "samantha@sovernpartners.com" };
  const thread = { to: ["delivered@resend.dev"], subject: "Re: Hello", threadId: "<root@example.org>", headers: { "In-Reply-To": "<parent@example.org>", References: "<root@example.org> <parent@example.org>" } };
  for (const [payload, target] of [[draft, undefined], [{ ...draft, scheduledAt: new Date(Date.now() + 86400000).toISOString() }, undefined], [draft, thread]]) {
    const result = await (await sendEmail(request(payload), signatureSettings, target)).json();
    assert.equal(result.signature.name, "Samantha");
    assert.equal(result.signature.website, undefined);
  }
  for (const envelope of envelopes) {
    assert.equal(envelope.text.split("Samantha").length - 1, 1);
    assert.equal(envelope.html.split("Samantha").length - 1, 1);
    assert.ok(envelope.text.startsWith(draft.message + "\n\n"));
    assert.match(envelope.html, /One &lt;two&gt; &amp; three/);
    assert.match(envelope.html, /href="mailto:samantha@sovernpartners.com"/);
    assert.doesNotMatch(envelope.html, /href="https:\/\/sovernpartners.com"/);
    assert.doesNotMatch(envelope.html, /<img/);
  }
  assert.deepEqual(envelopes[2].headers, thread.headers);
});
