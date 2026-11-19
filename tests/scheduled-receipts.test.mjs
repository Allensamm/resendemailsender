import { test } from "node:test";
import assert from "node:assert/strict";
import { saveReceipt, readReceipts } from "../app/receipts.ts";

test("pending scheduled receipts survive the recent-history limit", t => {
  const values = new Map();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value),
  } });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor); else delete globalThis.localStorage; });
  const base = { to: "delivered@resend.dev", from: "samantha@example.org", cc: "", bcc: "", subject: "Scheduled", message: "Hi", at: new Date().toISOString() };
  saveReceipt({ ...base, id: "scheduled", scheduledAt: new Date(Date.now() + 86400000).toISOString() });
  for (let i = 0; i < 35; i++) saveReceipt({ ...base, id: String(i) });
  assert.equal(readReceipts().length, 31);
  assert.ok(readReceipts().some(receipt => receipt.id === "scheduled"));
});
