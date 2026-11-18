import { test } from "node:test";
import assert from "node:assert/strict";
import { sendEmail, senderAddress } from "../lib/send-email.ts";

const draft = { to: "delivered@resend.dev", subject: "Hello", message: "One\nTwo" };
const settings = { RESEND_API_KEY: "mock", RESEND_FROM: "Letterpress <mail@example.org>" };
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
  assert.deepEqual(sent.body, { from: settings.RESEND_FROM, to: [draft.to], cc: ["bounced@resend.dev", "complained@resend.dev"], subject: draft.subject, text: draft.message });
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
