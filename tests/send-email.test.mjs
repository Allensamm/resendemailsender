import { test } from "node:test";
import assert from "node:assert/strict";
import { sendEmail } from "../lib/send-email.ts";

const draft = { to: "reader@example.com", subject: "Hello", message: "One\nTwo" };
function request(data, headers = {}) {
  return new Request("https://example.com/api/send-email", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "test-send", ...headers }, body: JSON.stringify(data) });
}
test("submits the server sender, recipients and retry identifier and returns the receipt", async () => {
  const response = await sendEmail(request({ ...draft, cc: "a@example.com,b@example.com", from: "ignored@example.com" }), { RESEND_API_KEY: "mock" }, async (url, opts) => {
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(opts.headers.Authorization, "Bearer mock");
    assert.equal(opts.headers["Idempotency-Key"], "test-send");
    assert.deepEqual(JSON.parse(opts.body), { from: "onboarding@resend.dev", to: [draft.to], cc: ["a@example.com", "b@example.com"], subject: draft.subject, text: draft.message });
    return Response.json({ id: "receipt" });
  });
  assert.deepEqual(await response.json(), { id: "receipt" });
});
test("rejects incomplete, invalid, and cross-origin submissions before sending", async () => {
  for (const patch of [{ to: "" }, { bcc: "bad" }, { subject: " " }, { message: "" }]) {
    assert.equal((await sendEmail(request({ ...draft, ...patch }), {})).status, 400);
  }
  assert.equal((await sendEmail(request(draft, { origin: "https://other.example" }), {})).status, 403);
  assert.equal((await sendEmail(request(draft), {})).status, 503);
});
test("retains Resend error status and handles an ambiguous network failure", async () => {
  const rejected = await sendEmail(request(draft), { RESEND_API_KEY: "mock" }, async () => Response.json({ message: "Verify your domain" }, { status: 403 }));
  assert.equal(rejected.status, 403);
  assert.equal((await rejected.json()).error, "Verify your domain");
  const interrupted = await sendEmail(request(draft), { RESEND_API_KEY: "mock" }, async () => { throw new Error(); });
  assert.equal(interrupted.status, 502);
});
